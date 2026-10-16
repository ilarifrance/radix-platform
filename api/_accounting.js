'use strict';
// /api/accounting — RADIX Accounting. Explicit membership per client company; every write is one HTTP transaction
// whose first statement checks the caller's role. Invariants (balanced entries, immutable posted entries, locked
// periods, protocol numbers) live in the database (migrations/accounting/001). Calculations come from lib/accounting.
const {randomUUID,createHash}=require('node:crypto');
const coa=require('../lib/accounting/chart-of-accounts');
const ledger=require('../lib/accounting/ledger');
const posting=require('../lib/accounting/posting');
const fatturapa=require('../lib/accounting/fatturapa');
const bankCsv=require('../lib/accounting/bank-csv');
const vat=require('../lib/accounting/vat');
const reconcile=require('../lib/accounting/reconcile');

class AccError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(s,m)=>{throw new AccError(s,m);};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max,req)=>{if(v===undefined||v===null||v===''){if(req)fail(400,'Campo obbligatorio mancante.');return null;}if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))fail(400,'Testo non valido o troppo lungo.');const t=v.trim();if(req&&!t)fail(400,'Campo obbligatorio mancante.');return t||null;};
const int=(v,min,max,msg)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail(400,msg||'Numero non valido.');return v;};
const date=v=>{if(!ledger.isDate(v))fail(400,'Data non valida: usa AAAA-MM-GG.');return v;};
const WRITE=['owner','admin','accountant','member'],MANAGE=['owner','admin','accountant'],ADMIN=['owner','admin'],READ=['owner','admin','accountant','member','viewer'];
const today=()=>new Date().toISOString().slice(0,10);

// Query helpers produce [text, params] pairs; the store runs them in one transaction.
const q=(t,p)=>[t,p||[]];
const role=(c,u,roles)=>q("SELECT acc_assert(acc_role($1::uuid,$2::integer)=ANY($3::text[]),'forbidden','42501')",[c,u,roles]);
const audit=(c,u,action,id,detail)=>q('INSERT INTO acc_audit(company_id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5::jsonb)',[c,u,action,id||null,JSON.stringify(detail||{})]);
const LINE_COLS='n int,account text,debit_cents bigint,credit_cents bigint,cost_center text,project text,description text';
function insertEntry(c,u,e,{post,source,reverses}={}){
 const id=e.id||randomUUID();
 return {id,queries:[
  q('INSERT INTO acc_entries(company_id,id,date,description,status,source,reverses,created_by) VALUES($1,$2,$3,$4,\'draft\',$5::jsonb,$6,$7)',[c,id,e.date,e.description,JSON.stringify(source||e.source||{}),reverses||null,u]),
  q('INSERT INTO acc_entry_lines(company_id,entry_id,n,account,debit_cents,credit_cents,cost_center,project,description) SELECT $1,$2,x.n,x.account,x.debit_cents,x.credit_cents,x.cost_center,x.project,x.description FROM jsonb_to_recordset($3::jsonb) AS x('+LINE_COLS+')',[c,id,JSON.stringify(e.lines.map((l,i)=>({...l,n:i+1})))]),
  ...(post?[q("UPDATE acc_entries SET status='posted',posted_by=$3 WHERE company_id=$1 AND id=$2",[c,id,u])]:[])]};
}
function cleanLines(lines){
 if(!Array.isArray(lines)||lines.length<2||lines.length>200)fail(400,'Servono da 2 a 200 righe.');
 return lines.map(l=>{if(!obj(l))fail(400,'Riga non valida.');const extra=Object.keys(l).filter(k=>!['account','debit_cents','credit_cents','cost_center','project','description'].includes(k));if(extra.length)fail(400,'Campo riga non consentito: '+extra[0]);
  return {account:text(l.account,12,true),debit_cents:l.debit_cents??0,credit_cents:l.credit_cents??0,cost_center:text(l.cost_center,80),project:text(l.project,80),description:text(l.description,300)};});
}
function checkEntry(e,accounts){const errs=ledger.validateEntry(e,accounts);if(errs.length)fail(400,errs.join(' '));}
const accountsOf=async(store,c)=>(await store.json('SELECT coalesce(jsonb_agg(jsonb_build_object(\'code\',code,\'name\',name,\'kind\',kind,\'group\',grp,\'keywords\',keywords) ORDER BY code),\'[]\') AS v FROM acc_accounts WHERE company_id=$1 AND active',[c]));
const sha=s=>createHash('sha256').update(s).digest('hex');

const COMPANY_FIELDS={name:v=>text(v,200,true),vat:v=>{const t=text(v,30);if(t===null)return null;const n=t.toUpperCase().replace(/\s/g,'');const w=/^[A-Z]{2}/.test(n)?n:'IT'+n;if(!/^[A-Z]{2}[0-9A-Z]{2,28}$/.test(w)||(w.startsWith('IT')&&!/^IT\d{11}$/.test(w)))fail(400,'Partita IVA non valida.');return w;},
 tax_code:v=>{const t=text(v,16);if(t===null)return null;const n=t.toUpperCase();if(!/^[0-9A-Z]{11,16}$/.test(n))fail(400,'Codice fiscale non valido.');return n;},
 legal_form:v=>{if(!['srl','srls','spa','snc','sas','ditta','professionista','altro'].includes(v))fail(400,'Forma giuridica non valida.');return v;},
 regime:v=>{if(!['ordinario','semplificato','forfettario'].includes(v))fail(400,'Regime non valido.');return v;},
 vat_periodicity:v=>{if(!['monthly','quarterly'].includes(v))fail(400,'Periodicità IVA non valida.');return v;},
 plan:v=>{if(!['base','controllo','professionista'].includes(v))fail(400,'Piano non valido.');return v;},
 lock_date:v=>v===null?null:date(v)};
function companyData(d,partial){
 const out={};for(const [k,v] of Object.entries(d)){if(['id','version'].includes(k))continue;if(!Object.hasOwn(COMPANY_FIELDS,k))fail(400,'Campo non consentito: '+k);out[k]=COMPANY_FIELDS[k](v);}
 if(!partial&&!out.name)fail(400,'Indica la ragione sociale.');return out;
}

async function command(store,u,body){
 if(!obj(body)||Object.keys(body).some(k=>!['company','action','data'].includes(k))||typeof body.action!=='string'||!obj(body.data))fail(400,'Comando non valido.');
 const {action,data:d}=body,c=body.company;
 if(action==='company.create'){
  const f=companyData(d,false),id=randomUUID();
  const accounts=coa.STANDARD.map(a=>({code:a.code,name:a.name,kind:a.kind,grp:a.group,keywords:a.keywords,system:Object.values(coa.SYSTEM).includes(a.code)}));
  await store.tx([
   q('INSERT INTO acc_companies(id,name,vat,tax_code,legal_form,regime,vat_periodicity,plan,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,f.name,f.vat??null,f.tax_code??null,f.legal_form||'srl',f.regime||'ordinario',f.vat_periodicity||'quarterly',f.plan||'base',u]),
   q("INSERT INTO acc_memberships(company_id,user_id,role) VALUES($1,$2,'owner')",[id,u]),
   q('INSERT INTO acc_accounts(company_id,code,name,kind,grp,keywords,system) SELECT $1,x.code,x.name,x.kind,x.grp,x.keywords,x.system FROM jsonb_to_recordset($2::jsonb) AS x(code text,name text,kind text,grp text,keywords text,system boolean)',[id,JSON.stringify(accounts)]),
   audit(id,u,'company.create',id,{name:f.name})]);
  return {id};
 }
 if(!uuid(c))fail(400,'Azienda non valida.');
 switch(action){
 case 'company.update':{
  const f=companyData(d,true),v=int(d.version,1,2147483646,'Versione non valida.'),keys=Object.keys(f);if(!keys.length)fail(400,'Nessuna modifica.');
  await store.tx([role(c,u,Object.hasOwn(f,'lock_date')?MANAGE:ADMIN.concat('accountant')),
   q("SELECT acc_assert(EXISTS(SELECT 1 FROM acc_companies WHERE id=$1 AND version=$2),'conflict','40001')",[c,v]),
   q('UPDATE acc_companies SET '+keys.map((k,i)=>k+'=$'+(i+2)).join(',')+',version=version+1 WHERE id=$1',[c,...keys.map(k=>f[k])]),audit(c,u,action,c,f)]);
  return {id:c};
 }
 case 'member.add':{
  const email=text(d.email,254,true).toLowerCase(),r=d.role;if(!READ.includes(r))fail(400,'Ruolo non valido.');
  const found=await store.json('SELECT to_jsonb(u) AS v FROM (SELECT id FROM users WHERE lower(email)=$1) u',[email]);if(!found)fail(404,'Nessun account RADIX con questa email: crealo prima dall\'amministrazione.');
  if(r==='owner')await store.tx([role(c,u,['owner'])]);
  await store.tx([role(c,u,ADMIN),q('INSERT INTO acc_memberships(company_id,user_id,role) VALUES($1,$2,$3)',[c,found.id,r]),audit(c,u,action,null,{user_id:found.id,role:r})]);
  return {user_id:found.id};
 }
 case 'member.remove':{
  const id=int(d.user_id,1,2147483647,'Membro non valido.');
  await store.tx([role(c,u,ADMIN),q('DELETE FROM acc_memberships WHERE company_id=$1 AND user_id=$2',[c,id]),
   q("SELECT acc_assert(EXISTS(SELECT 1 FROM acc_memberships WHERE company_id=$1 AND role='owner'),'L\\'azienda deve avere almeno un owner.','23514')",[c]),audit(c,u,action,null,{user_id:id})]);
  return {user_id:id};
 }
 case 'account.save':{
  const code=text(d.code,12,true),a={code,name:text(d.name,120,true),kind:d.kind,group:d.group};
  const errs=coa.validate([...coa.STANDARD.filter(x=>x.code!==code),a]);if(errs.length)fail(400,errs[0]);
  await store.tx([role(c,u,MANAGE),
   q("SELECT acc_assert(NOT EXISTS(SELECT 1 FROM acc_accounts WHERE company_id=$1 AND code=$2 AND system AND (kind<>$3 OR grp<>$4)),'I conti di sistema non cambiano tipo o gruppo.','42501')",[c,code,a.kind,a.group]),
   q('INSERT INTO acc_accounts(company_id,code,name,kind,grp,keywords,active) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(company_id,code) DO UPDATE SET name=EXCLUDED.name,kind=EXCLUDED.kind,grp=EXCLUDED.grp,keywords=EXCLUDED.keywords,active=EXCLUDED.active OR acc_accounts.system',[c,code,a.name,a.kind,a.group,text(d.keywords,600),d.active!==false]),audit(c,u,action,null,{code})]);
  return {code};
 }
 case 'entry.save':{
  const e={date:date(d.date),description:text(d.description,300,true),lines:cleanLines(d.lines)};
  checkEntry(e,await accountsOf(store,c));
  if(d.id!==undefined){
   if(!uuid(d.id))fail(400,'Registrazione non valida.');const v=int(d.version,1,2147483646,'Versione non valida.');
   await store.tx([role(c,u,WRITE),q("SELECT acc_assert(EXISTS(SELECT 1 FROM acc_entries WHERE company_id=$1 AND id=$2 AND version=$3 AND status='draft'),'conflict','40001')",[c,d.id,v]),
    q('DELETE FROM acc_entry_lines WHERE company_id=$1 AND entry_id=$2',[c,d.id]),
    q('UPDATE acc_entries SET date=$3,description=$4 WHERE company_id=$1 AND id=$2',[c,d.id,e.date,e.description]),
    q('INSERT INTO acc_entry_lines(company_id,entry_id,n,account,debit_cents,credit_cents,cost_center,project,description) SELECT $1,$2,x.n,x.account,x.debit_cents,x.credit_cents,x.cost_center,x.project,x.description FROM jsonb_to_recordset($3::jsonb) AS x('+LINE_COLS+')',[c,d.id,JSON.stringify(e.lines.map((l,i)=>({...l,n:i+1})))]),
    ...(d.post?[q("UPDATE acc_entries SET status='posted',posted_by=$3 WHERE company_id=$1 AND id=$2",[c,d.id,u])]:[]),audit(c,u,action,d.id,{post:!!d.post})]);
   return {id:d.id};
  }
  const ins=insertEntry(c,u,e,{post:!!d.post,source:{type:'manual'}});
  await store.tx([role(c,u,WRITE),...ins.queries,audit(c,u,action,ins.id,{post:!!d.post})]);
  return {id:ins.id};
 }
 case 'entry.post':case 'entry.delete':{
  if(!uuid(d.id))fail(400,'Registrazione non valida.');const v=int(d.version,1,2147483646,'Versione non valida.');
  await store.tx([role(c,u,WRITE),q("SELECT acc_assert(EXISTS(SELECT 1 FROM acc_entries WHERE company_id=$1 AND id=$2 AND version=$3 AND status='draft'),'conflict','40001')",[c,d.id,v]),
   action==='entry.post'?q("UPDATE acc_entries SET status='posted',posted_by=$3 WHERE company_id=$1 AND id=$2",[c,d.id,u]):q('DELETE FROM acc_entries WHERE company_id=$1 AND id=$2',[c,d.id]),audit(c,u,action,d.id)]);
  return {id:d.id};
 }
 case 'entry.reverse':{
  if(!uuid(d.id))fail(400,'Registrazione non valida.');const when=d.date===undefined?today():date(d.date);
  const src=await store.json("SELECT jsonb_build_object('number',e.number,'description',e.description,'lines',(SELECT jsonb_agg(jsonb_build_object('account',l.account,'debit_cents',l.credit_cents,'credit_cents',l.debit_cents,'cost_center',l.cost_center,'project',l.project) ORDER BY l.n) FROM acc_entry_lines l WHERE l.company_id=e.company_id AND l.entry_id=e.id)) AS v FROM acc_entries e WHERE e.company_id=$1 AND e.id=$2 AND e.status='posted' AND EXISTS(SELECT 1 FROM acc_memberships m WHERE m.company_id=$1 AND m.user_id=$3)",[c,d.id,u]);
  if(!src)fail(404,'Registrazione contabilizzata non trovata.');
  const ins=insertEntry(c,u,{date:when,description:('Storno '+src.number+' · '+src.description).slice(0,300),lines:src.lines},{post:true,source:{type:'reversal'},reverses:d.id});
  await store.tx([role(c,u,WRITE),q("SELECT acc_assert(NOT EXISTS(SELECT 1 FROM acc_entries WHERE company_id=$1 AND reverses=$2),'Registrazione già stornata.','23505')",[c,d.id]),...ins.queries,audit(c,u,action,ins.id,{reverses:d.id})]);
  return {id:ins.id};
 }
 case 'document.import':{
  const xml=d.xml;if(typeof xml!=='string'||!xml.length||xml.length>2500000)fail(400,'File XML mancante o troppo grande.');
  let parsed;try{parsed=fatturapa.parse(xml);}catch(e){fail(400,e.message);}
  const company=await store.json('SELECT to_jsonb(c) AS v FROM (SELECT id,vat,tax_code FROM acc_companies c WHERE id=$1 AND EXISTS(SELECT 1 FROM acc_memberships m WHERE m.company_id=c.id AND m.user_id=$2 AND m.role=ANY($3::text[]))) c',[c,u,WRITE]);
  if(!company)fail(403,'Permessi insufficienti.');
  const direction=posting.directionFor(parsed,{vat:company.vat,taxCode:company.tax_code});
  if(!direction)fail(400,'La fattura non riporta la partita IVA o il codice fiscale di questa azienda: controlla l\'anagrafica o il file.');
  const party=direction==='purchase'?parsed.supplier:parsed.customer,key=posting.counterpartKey(party);
  const accounts=await accountsOf(store,c),learned=key?await store.json('SELECT jsonb_object_agg(counterpart_key,account) AS v FROM acc_learned WHERE company_id=$1 AND counterpart_key=$2',[c,key]):null;
  const out=[],queries=[role(c,u,WRITE)];
  parsed.documents.forEach((doc,i)=>{
   if(!doc.number||!doc.date)fail(400,'Fattura senza numero o data.');
   const p=posting.propose(doc,party,{direction,accounts,learned:learned||{}}),id=randomUUID();
   const one={...parsed,documents:[doc]};
   out.push({id,number:doc.number,date:doc.date,direction,counterpart:party&&party.name,total_cents:doc.total_cents??doc.computed_total_cents,confidence:p.confidence});
   queries.push(q('INSERT INTO acc_documents(company_id,id,direction,doc_type,number,date,counterpart_name,counterpart_vat,counterpart_key,total_cents,parsed,proposal,file_name,sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15) ON CONFLICT DO NOTHING',
    [c,id,direction,doc.type,String(doc.number).slice(0,40),doc.date,party&&party.name||null,party&&(party.vat||party.taxCode)||null,key,doc.total_cents??doc.computed_total_cents,JSON.stringify(one),JSON.stringify(p),text(d.file_name,200),sha(xml+'#'+i),u]));
  });
  queries.push(audit(c,u,action,null,{file:d.file_name||null,documents:out.length}));
  await store.tx(queries);
  const ids=await store.json('SELECT coalesce(jsonb_agg(id),\'[]\') AS v FROM acc_documents WHERE company_id=$1 AND id=ANY($2::uuid[])',[c,out.map(o=>o.id)]);
  return {documents:out.map(o=>({...o,duplicate:!ids.includes(o.id)})),warnings:parsed.warnings};
 }
 case 'document.confirm':{
  if(!uuid(d.id))fail(400,'Documento non valido.');const v=int(d.version,1,2147483646,'Versione non valida.');
  const doc=await store.json("SELECT to_jsonb(t) AS v FROM acc_documents t WHERE company_id=$1 AND id=$2 AND status='to_review' AND EXISTS(SELECT 1 FROM acc_memberships m WHERE m.company_id=$1 AND m.user_id=$3)",[c,d.id,u]);
  if(!doc)fail(404,'Documento da registrare non trovato.');
  const accounts=await accountsOf(store,c),parsed=doc.parsed,inv=parsed.documents[0],party=doc.direction==='purchase'?parsed.supplier:parsed.customer;
  const pct=d.deductible_pct===undefined?100:int(d.deductible_pct,0,100,'Percentuale di detraibilità non valida.');
  const regDate=d.date===undefined?inv.date:date(d.date);
  const p=posting.propose(inv,party,{direction:doc.direction,accounts,deductiblePct:pct,registrationDate:regDate});
  const e={date:regDate,description:text(d.description??p.entry.description,300,true),lines:d.lines===undefined?p.entry.lines:cleanLines(d.lines)};
  checkEntry(e,accounts);
  // The confirmed entry must still carry the proposal's VAT and counterpart amounts: only the economic accounts may change.
  const fixed=[coa.SYSTEM.vatCredit,coa.SYSTEM.vatDebit,coa.SYSTEM.suppliers,coa.SYSTEM.customers,coa.SYSTEM.withholdingDebit,coa.SYSTEM.withholdingCredit];
  const net=(lines,a)=>lines.filter(l=>l.account===a).reduce((t,l)=>t+(l.debit_cents||0)-(l.credit_cents||0),0);
  for(const a of fixed)if(net(e.lines,a)!==net(p.entry.lines,a))fail(400,'Gli importi di IVA, cliente/fornitore e ritenute devono restare quelli della fattura ('+a+').');
  const ins=insertEntry(c,u,e,{post:true,source:{type:'invoice',document_id:d.id,direction:doc.direction,number:inv.number}});
  const kind=doc.direction==='purchase'?'C':'R',idx=coa.index(accounts);
  const main=e.lines.filter(l=>idx.get(l.account)?.kind===kind).sort((a,b)=>(b.debit_cents+b.credit_cents)-(a.debit_cents+a.credit_cents))[0];
  const vatRows=p.vat.map(r=>({...r,id:randomUUID()})),items=p.open_items.map(i=>({...i,id:randomUUID()}));
  await store.tx([role(c,u,WRITE),q("SELECT acc_assert(EXISTS(SELECT 1 FROM acc_documents WHERE company_id=$1 AND id=$2 AND version=$3 AND status='to_review'),'conflict','40001')",[c,d.id,v]),
   ...ins.queries,
   q('INSERT INTO acc_vat_rows(company_id,id,document_id,entry_id,register,date,doc_date,doc_number,doc_type,counterpart,counterpart_vat,rate,nature,taxable_cents,vat_cents,deductible_vat_cents,exigibility,reverse_charge) SELECT $1,x.id,$2,$3,x.register,x.date,x.doc_date,x.doc_number,x.doc_type,x.counterpart,x.counterpart_vat,x.rate,x.nature,x.taxable_cents,x.vat_cents,x.deductible_vat_cents,x.exigibility,x.reverse_charge FROM jsonb_to_recordset($4::jsonb) AS x(id uuid,register text,date date,doc_date date,doc_number text,doc_type text,counterpart text,counterpart_vat text,rate numeric,nature text,taxable_cents bigint,vat_cents bigint,deductible_vat_cents bigint,exigibility text,reverse_charge boolean)',[c,d.id,ins.id,JSON.stringify(vatRows)]),
   q('INSERT INTO acc_open_items(company_id,id,document_id,kind,due,amount_cents,counterpart,doc_number,method,iban) SELECT $1,x.id,$2,x.kind,x.due,x.amount_cents,x.counterpart,x.doc_number,x.method,x.iban FROM jsonb_to_recordset($3::jsonb) AS x(id uuid,kind text,due date,amount_cents bigint,counterpart text,doc_number text,method text,iban text) WHERE x.amount_cents<>0',[c,d.id,JSON.stringify(items)]),
   q("UPDATE acc_documents SET status='registered',entry_id=$3,version=version+1 WHERE company_id=$1 AND id=$2",[c,d.id,ins.id]),
   ...(main&&doc.counterpart_key?[q('INSERT INTO acc_learned(company_id,counterpart_key,account) VALUES($1,$2,$3) ON CONFLICT(company_id,counterpart_key) DO UPDATE SET account=EXCLUDED.account,uses=acc_learned.uses+1',[c,doc.counterpart_key,main.account])]:[]),
   audit(c,u,action,d.id,{entry_id:ins.id})]);
  return {id:d.id,entry_id:ins.id};
 }
 case 'document.ignore':{
  if(!uuid(d.id))fail(400,'Documento non valido.');const v=int(d.version,1,2147483646,'Versione non valida.');
  await store.tx([role(c,u,WRITE),q("SELECT acc_assert(EXISTS(SELECT 1 FROM acc_documents WHERE company_id=$1 AND id=$2 AND version=$3 AND status='to_review'),'conflict','40001')",[c,d.id,v]),q("UPDATE acc_documents SET status='ignored',version=version+1 WHERE company_id=$1 AND id=$2",[c,d.id]),audit(c,u,action,d.id)]);
  return {id:d.id};
 }
 case 'bank.import':{
  if(typeof d.csv!=='string'||!d.csv.length||d.csv.length>2500000)fail(400,'File dell\'estratto conto mancante o troppo grande.');
  const account=d.account===undefined?coa.SYSTEM.bank:text(d.account,12,true);
  let parsed;try{parsed=bankCsv.parseStatement(d.csv);}catch(e){fail(400,e.message);}
  if(!parsed.rows.length)fail(400,'Nessun movimento leggibile nel file.');if(parsed.rows.length>5000)fail(413,'Massimo 5000 movimenti per file.');
  const rows=parsed.rows.filter(r=>r.amount_cents!==0).map(r=>({id:randomUUID(),date:r.date,value_date:r.value_date,amount_cents:r.amount_cents,description:(r.description||'').slice(0,500),fingerprint:bankCsv.fingerprint(r).slice(0,700)}));
  const res=await store.tx([role(c,u,WRITE),q("SELECT acc_assert(EXISTS(SELECT 1 FROM acc_accounts WHERE company_id=$1 AND code=$2 AND grp='liquidita'),'Conto banca non valido.','22023')",[c,account]),
   q('WITH ins AS (INSERT INTO acc_bank_movements(company_id,id,account,date,value_date,amount_cents,description,fingerprint) SELECT $1,x.id,$2,x.date,x.value_date,x.amount_cents,x.description,x.fingerprint FROM jsonb_to_recordset($3::jsonb) AS x(id uuid,date date,value_date date,amount_cents bigint,description text,fingerprint text) ON CONFLICT DO NOTHING RETURNING 1) SELECT count(*)::int AS n FROM ins',[c,account,JSON.stringify(rows)]),
   audit(c,u,action,null,{rows:rows.length})]);
  const added=res[2][0].n;
  return {imported:added,duplicates:rows.length-added,warnings:parsed.warnings};
 }
 case 'bank.confirm':{
  if(!uuid(d.id))fail(400,'Movimento non valido.');const v=int(d.version,1,2147483646,'Versione non valida.');
  if((d.open_item_id===undefined)===(d.account===undefined))fail(400,'Indica la scadenza oppure il conto.');
  const m=await store.json("SELECT to_jsonb(t) AS v FROM acc_bank_movements t WHERE company_id=$1 AND id=$2 AND status='new' AND EXISTS(SELECT 1 FROM acc_memberships m WHERE m.company_id=$1 AND m.user_id=$3)",[c,d.id,u]);
  if(!m)fail(404,'Movimento da riconciliare non trovato.');
  let item=null;if(d.open_item_id!==undefined){if(!uuid(d.open_item_id))fail(400,'Scadenza non valida.');item=await store.json('SELECT to_jsonb(t) AS v FROM acc_open_items t WHERE company_id=$1 AND id=$2',[c,d.open_item_id]);if(!item)fail(404,'Scadenza non trovata.');
   if((m.amount_cents>0)!==(item.kind==='receivable'))fail(400,'Un incasso va su un credito, un pagamento su un debito.');
   if(Math.abs(m.amount_cents)>Math.abs(item.amount_cents-item.paid_cents))fail(400,'Il movimento supera il residuo della scadenza.');}
  const account=item?null:text(d.account,12,true);
  const e=reconcile.entryFor({date:m.date,amount_cents:m.amount_cents,description:m.description,fingerprint:m.fingerprint},{item,account,bankAccount:m.account});
  checkEntry(e,await accountsOf(store,c));
  const ins=insertEntry(c,u,e,{post:true,source:{type:'bank',movement_id:d.id}});
  const pay=item?Math.sign(item.amount_cents)*Math.abs(m.amount_cents):0;
  await store.tx([role(c,u,WRITE),q("SELECT acc_assert(EXISTS(SELECT 1 FROM acc_bank_movements WHERE company_id=$1 AND id=$2 AND version=$3 AND status='new'),'conflict','40001')",[c,d.id,v]),
   ...ins.queries,
   ...(item?[q('UPDATE acc_open_items SET paid_cents=paid_cents+$3,version=version+1 WHERE company_id=$1 AND id=$2 AND abs(paid_cents+$3)<=abs(amount_cents)',[c,item.id,pay]),
    q("SELECT acc_assert(EXISTS(SELECT 1 FROM acc_open_items WHERE company_id=$1 AND id=$2 AND version=$3),'conflict','40001')",[c,item.id,item.version+1]),
    // Deferred VAT (esigibilità differita) becomes due when the invoice is fully collected.
    q("UPDATE acc_vat_rows v SET paid_date=$3 WHERE v.company_id=$1 AND v.document_id=(SELECT document_id FROM acc_open_items WHERE company_id=$1 AND id=$2) AND v.paid_date IS NULL AND NOT EXISTS(SELECT 1 FROM acc_open_items o WHERE o.company_id=$1 AND o.document_id=v.document_id AND o.paid_cents<>o.amount_cents)",[c,item.id,m.date])]:[]),
   q("UPDATE acc_bank_movements SET status='matched',entry_id=$3,open_item_id=$4,version=version+1 WHERE company_id=$1 AND id=$2",[c,d.id,ins.id,item?item.id:null]),
   audit(c,u,action,d.id,{entry_id:ins.id,open_item_id:item?item.id:null})]);
  return {id:d.id,entry_id:ins.id};
 }
 case 'bank.ignore':{
  if(!uuid(d.id))fail(400,'Movimento non valido.');const v=int(d.version,1,2147483646,'Versione non valida.');
  await store.tx([role(c,u,WRITE),q("SELECT acc_assert(EXISTS(SELECT 1 FROM acc_bank_movements WHERE company_id=$1 AND id=$2 AND version=$3 AND status='new'),'conflict','40001')",[c,d.id,v]),q("UPDATE acc_bank_movements SET status='ignored',version=version+1 WHERE company_id=$1 AND id=$2",[c,d.id]),audit(c,u,action,d.id)]);
  return {id:d.id};
 }
 case 'budget.save':{
  const year=int(d.year,2000,2100,'Anno non valido.');if(!Array.isArray(d.rows)||d.rows.length>120)fail(400,'Budget non valido.');
  const rows=d.rows.map(r=>{if(!obj(r)||!['ricavi','acquisti','servizi','godimento','oneri_diversi','personale','ammortamenti','ebitda','utile'].includes(r.key))fail(400,'Voce di budget non valida.');return {key:r.key,month:int(r.month,1,12,'Mese non valido.'),amount_cents:int(r.amount_cents,-9e13,9e13,'Importo non valido.')};});
  await store.tx([role(c,u,MANAGE),q('DELETE FROM acc_budget WHERE company_id=$1 AND year=$2',[c,year]),
   q('INSERT INTO acc_budget(company_id,year,key,month,amount_cents) SELECT $1,$2,x.key,x.month,x.amount_cents FROM jsonb_to_recordset($3::jsonb) AS x(key text,month int,amount_cents bigint)',[c,year,JSON.stringify(rows)]),audit(c,u,action,null,{year,rows:rows.length})]);
  return {year};
 }
 case 'vat.close':{
  const company=await store.json('SELECT to_jsonb(c) AS v FROM (SELECT vat_periodicity FROM acc_companies c WHERE id=$1 AND EXISTS(SELECT 1 FROM acc_memberships m WHERE m.company_id=c.id AND m.user_id=$2 AND m.role=ANY($3::text[]))) c',[c,u,MANAGE]);
  if(!company)fail(403,'Permessi insufficienti: la liquidazione la chiude owner, admin o commercialista.');
  const period=text(d.period,8,true);const year=+period.slice(0,4);
  let list;try{list=vat.periods(year,company.vat_periodicity);}catch(e){fail(400,e.message);}
  const idx=list.findIndex(p=>p.key===period);if(idx<0)fail(400,'Periodo non valido per la periodicità dell\'azienda.');
  const rows=await store.json("SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') AS v FROM acc_vat_rows t WHERE company_id=$1 AND date<=$2",[c,list[idx].to]);
  const prev=idx?await store.json('SELECT result AS v FROM acc_vat_settlements WHERE company_id=$1 AND period=$2',[c,list[idx-1].key]):null;
  if(idx&&!prev)fail(409,'Chiudi prima la liquidazione del periodo precedente ('+list[idx-1].label+').');
  const opening=d.opening_credit_cents===undefined?0:int(d.opening_credit_cents,0,9e13,'Credito iniziale non valido.');
  const s=vat.settle(rows,{periodicity:company.vat_periodicity,period,previousDebit_cents:prev?prev.carry_debit_cents:0,previousCredit_cents:prev?prev.carry_credit_cents:0,yearCredit_cents:idx?0:opening,advance_cents:d.advance_cents===undefined?0:int(d.advance_cents,0,9e13,'Acconto non valido.')});
  const entry=vat.settlementEntry(s);const ins=entry?insertEntry(c,u,entry,{post:true,source:{type:'vat',period}}):null;
  await store.tx([role(c,u,MANAGE),...(ins?ins.queries:[]),q("SELECT acc_assert(NOT EXISTS(SELECT 1 FROM acc_vat_settlements WHERE company_id=$1 AND period=$2),'Liquidazione di questo periodo già chiusa.','23505')",[c,period]),q('INSERT INTO acc_vat_settlements(company_id,period,result,entry_id,closed_by) VALUES($1,$2,$3::jsonb,$4,$5)',[c,period,JSON.stringify(s),ins?ins.id:null,u]),audit(c,u,action,ins&&ins.id,{period})]);
  return {settlement:s,entry_id:ins?ins.id:null};
 }
 default:fail(400,'Azione non riconosciuta.');
 }
}

// Read model for one company: everything the page needs for a fiscal year (entries up to year end for balances).
async function bundle(store,c,u,year){
 const to=year+'-12-31',agg=(sql)=>"coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM ("+sql+") t),'[]')";
 const v=await store.json(`SELECT jsonb_build_object(
  'company',(SELECT to_jsonb(c)||jsonb_build_object('role',m.role) FROM acc_companies c WHERE c.id=$1),
  'accounts',${agg("SELECT code,name,kind,grp AS \"group\",keywords,system,active FROM acc_accounts WHERE company_id=$1 ORDER BY code")},
  'entries',${agg("SELECT e.id,e.number,e.date,e.description,e.status,e.source,e.reverses,e.version,e.created_at,(SELECT jsonb_agg(jsonb_build_object('account',l.account,'debit_cents',l.debit_cents,'credit_cents',l.credit_cents,'cost_center',l.cost_center,'project',l.project,'description',l.description) ORDER BY l.n) FROM acc_entry_lines l WHERE l.company_id=e.company_id AND l.entry_id=e.id) AS lines FROM acc_entries e WHERE e.company_id=$1 AND e.date<=$2 ORDER BY e.date,e.number NULLS LAST,e.created_at LIMIT 20000")},
  'documents',${agg("SELECT id,direction,doc_type,number,date,counterpart_name,counterpart_vat,total_cents,status,CASE WHEN status='to_review' THEN parsed END AS parsed,CASE WHEN status='to_review' THEN proposal END AS proposal,file_name,entry_id,version,created_at FROM acc_documents WHERE company_id=$1 AND (status='to_review' OR date>=($2::date-interval '1 year')) ORDER BY status='to_review' DESC,date DESC LIMIT 1000")},
  'vat_rows',${agg("SELECT * FROM acc_vat_rows WHERE company_id=$1 AND date<=$2 AND date>=($2::date-interval '2 years') ORDER BY date")},
  'open_items',${agg("SELECT * FROM acc_open_items WHERE company_id=$1 AND (paid_cents<>amount_cents OR due>=($2::date-interval '1 year')) ORDER BY due LIMIT 5000")},
  'bank',${agg("SELECT id,account,date,value_date,amount_cents,description,fingerprint,status,entry_id,open_item_id,version FROM acc_bank_movements WHERE company_id=$1 AND (status='new' OR date>=($2::date-interval '1 year')) ORDER BY date DESC LIMIT 3000")},
  'budget',${agg("SELECT key,month,amount_cents FROM acc_budget WHERE company_id=$1 AND year=$3")},
  'settlements',${agg("SELECT period,result,entry_id,closed_at FROM acc_vat_settlements WHERE company_id=$1 AND period LIKE $3::text||'%' ORDER BY period")},
  'members',${agg("SELECT m.user_id,u.name,u.email,m.role FROM acc_memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=$1 ORDER BY m.role,u.name")},
  'audit',${agg("SELECT a.at,a.action,a.detail,u.name AS actor FROM acc_audit a LEFT JOIN users u ON u.id=a.actor_id WHERE a.company_id=$1 ORDER BY a.id DESC LIMIT 50")}
 ) AS v FROM acc_memberships m WHERE m.company_id=$1 AND m.user_id=$4`,[c,to,year,u]);
 if(!v)fail(403,'Non hai accesso a questa azienda.');
 return v;
}

function createHandler({getSessionUser,getStore}){
 return async function(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{
   if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');fail(405,'Metodo non consentito.');}
   let user;try{user=getSessionUser(req);}catch{user=null;}
   if(!user||!Number.isInteger(user.uid)||user.uid<1)fail(401,'Accedi con il tuo account RADIX.');
   const store=getStore();
   if(req.method==='POST'){
    if(req.headers['x-radix-accounting']!=='1'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')||req.headers['sec-fetch-site']==='cross-site')fail(403,'Richiesta non consentita.');
    let body=req.body;if(typeof body==='string'){if(Buffer.byteLength(body)>4000000)fail(413,'Richiesta troppo grande.');try{body=JSON.parse(body);}catch{fail(400,'JSON non valido.');}}
    return res.status(200).json(await command(store,user.uid,body));
   }
   const qy=req.query||{};if(Object.keys(qy).some(k=>!['resource','company','year'].includes(k)))fail(400,'Parametro non consentito.');
   if(qy.resource==='companies')return res.status(200).json({rows:await store.json("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.name),'[]') AS v FROM (SELECT c.id,c.name,c.vat,c.regime,c.vat_periodicity,c.plan,m.role FROM acc_companies c JOIN acc_memberships m ON m.company_id=c.id WHERE m.user_id=$1) t",[user.uid])});
   if(qy.resource==='bundle'){
    if(!uuid(qy.company))fail(400,'Azienda non valida.');const year=qy.year===undefined?+today().slice(0,4):Number(qy.year);
    if(!Number.isInteger(year)||year<2000||year>2100)fail(400,'Anno non valido.');
    return res.status(200).json(await bundle(store,qy.company,user.uid,year));
   }
   fail(400,'Risorsa non valida.');
  }catch(e){
   const codes={'P0001':[400,null],'42P01':[503,'Archivio Accounting non ancora attivo: va applicata la migrazione accounting/001 a questo database.'],'42501':[403,null],'40001':[409,'Dati cambiati nel frattempo: ricarica e riprova.'],'23505':[409,'Elemento già presente.'],'23503':[409,'Riferimento non valido (conto, scadenza o documento).'],'23514':[400,null],'22023':[400,null],'22P02':[400,'Formato non valido.'],'22007':[400,'Data non valida.'],'22008':[400,'Data fuori intervallo.']};
   const m=codes[e.code];
   // Named database errors (acc_assert, triggers) carry an Italian message; constraint violations get the generic one.
   const own=['P0001','42501','23514','23505','22023'].includes(e.code)&&!e.constraint&&!['forbidden','conflict'].includes(e.message)?e.message:null;
   const msg=e.status?e.message:e.message==='forbidden'?'Permessi insufficienti per questa azione.':own||(m?m[1]||'Dati non validi.':'Accounting non disponibile in questo momento.');
   if(!e.status&&!m)console.error('accounting',e);
   res.status(e.status||(m?m[0]:503)).json({error:msg});
  }
 };
}
module.exports={createHandler,command,bundle,AccError};
