'use strict';
/* CRM tools on top of sales.js (window.RadixSalesApp): CSV import/export, contact segments,
   GDPR access/erasure for a contact, and rule-based follow-up tasks. Every write goes through the
   normal /api/sales commands, after an explicit confirmation. */
(()=>{
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>window.RadixSalesApp,CSV=()=>window.RadixCrmCsv;
const low=s=>String(s||'').trim().toLocaleLowerCase('it');
const DAY=864e5;
function download(name,text,type){const a=E('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
const stamp=()=>new Date().toISOString().slice(0,10);
async function exportRows(subject){const d=await app().api('export',{subject});return d.rows||[]}
const COLUMNS={
 contacts:[['Nome','name'],['Ruolo','role'],['Azienda','company'],['Email','email'],['Telefono','phone'],['LinkedIn','linkedin_url'],['Consenso marketing',r=>r.marketing_consent?'sì':'no'],['Data consenso','consent_at'],['Note','notes']],
 companies:[['Azienda','name'],['Settore','industry'],['Sito','website'],['Email','email'],['Telefono','phone'],['Città','city'],['Note','notes']]
};
// Columns of migration sales 011 (crm-fields-core.js): exported only when the archive has them.
const ADDED_COLUMNS={
 contacts:[['Nome proprio','first_name'],['Cognome','last_name'],['Qualifica','title'],['Reparto','department'],['Cellulare','mobile'],['Indirizzo','street'],['CAP','zip'],['Città','city'],['Provincia','province'],['Paese','country'],['Data di nascita','birthdate'],['Origine','lead_source'],['Lingua preferita','preferred_language'],['Riporta a',r=>ref('contacts',r.reports_to_id)],['Responsabile',r=>member(r.owner_id)]],
 companies:[['Ragione sociale','legal_name'],['Tipo',r=>label('account_type',r.account_type)],['Valutazione',r=>label('rating',r.rating)],['Responsabile',r=>member(r.owner_id)],['Azienda capogruppo',r=>ref('companies',r.parent_company_id)],['Fatturato annuo (€)',r=>r.annual_revenue_cents==null?'':window.RadixCrmFields?.centsToEuro(r.annual_revenue_cents)],['Dipendenti','employees'],
  ['Indirizzo fatturazione','billing_street'],['CAP fatturazione','billing_zip'],['Città fatturazione','billing_city'],['Provincia fatturazione','billing_province'],['Paese fatturazione','billing_country'],
  ['Indirizzo spedizione','shipping_street'],['CAP spedizione','shipping_zip'],['Città spedizione','shipping_city'],['Provincia spedizione','shipping_province'],['Paese spedizione','shipping_country'],
  ['Partita IVA','vat_number'],['Codice fiscale','tax_code'],['PEC','pec'],['Codice SDI','sdi_code'],['Descrizione','description']]
};
const label=(key,v)=>v==null?'':((window.RadixCrmFields?.fieldOf('companies',key)?.options||[]).find(([k])=>k===v)||[v,v])[1];
const member=id=>id==null?'':(app().rows('members').find(m=>String(m.id)===String(id))||{}).name||String(id);
const ref=(kind,id)=>id?(app().rows(kind).find(r=>r.id===id)||{}).name||id:'';
const supports=(kind,rows)=>!!window.RadixCrmFields&&rows.some(r=>window.RadixCrmFields.supported(kind,r));
const cols=(kind,rows)=>[...COLUMNS[kind],...(rows&&supports(kind,rows)?ADDED_COLUMNS[kind]:[])].map(([label,k])=>typeof k==='function'?{label,value:k}:{label,key:k})
 // «Campi aggiunti» (015) after the fixed columns, named as in the workspace.
 .concat(window.RadixCrmCustom?window.RadixCrmCustom.of(window.RadixCrmCustom.defs(),kind).map(f=>({label:f.label,value:r=>(r.custom&&r.custom[f.id])||''})):[]);
async function run(label,fn){
 const a=app();if(a.state.busy)return;a.lock(true);a.error('');a.notice(label);let ok=false;
 try{await fn();ok=true}catch(e){a.error(e.message||String(e));a.notice('Operazione non completata.')}
 finally{a.lock(false)}
 return ok;
}
async function exportCsv(kind,filter){
 await run('Preparo il file…',async()=>{await window.RadixCrmCustom?.load();let rows=await exportRows(kind);if(filter)rows=rows.filter(filter);
  download((kind==='contacts'?'contatti':'aziende')+'-'+stamp()+'.csv',CSV().toCsv(rows,cols(kind,rows)),'text/csv;charset=utf-8');
  app().notice(rows.length+' righe esportate.')});
}
const post=(entity,action,data)=>app().api(entity,{body:{workspace:app().state.workspace,entity,action,data}});
async function importCsv(kind,file){
 const a=app();if(!file)return;
 // The 011 fields are read too: an archive without them gets the same rows minus those fields (retry below).
 let mapped;try{const parsed=await CSV().readFile(file);const C=window.RadixCrmCustom;
  // Columns named like a field created with «Aggiungi campo» fill that field.
  const custom=C?C.columnsFor(await C.load(),kind,parsed.headers):{};
  mapped=CSV().mapRows(kind,parsed,{extended:true,custom})}catch(e){a.error(e.message);return}
 if(!mapped.rows.length){a.error('Nessuna riga valida. Servono almeno le colonne Nome'+(kind==='contacts'?' (o Nome e Cognome)':'')+'.'+(mapped.skipped.length?' Righe scartate: '+mapped.skipped.length+'.':''));return}
 let plan;
 const ready=await run('Controllo i duplicati…',async()=>{
  const companies=await exportRows('companies'),existing=kind==='contacts'?await exportRows('contacts'):companies;
  const byName=new Map(companies.map(c=>[low(c.name),c.id]));
  const seen=new Set(existing.map(r=>kind==='contacts'?(r.email?low(r.email):low(r.name)+'|'+low(r.company)):low(r.name)));
  const rows=[],dupes=[];
  for(const r of mapped.rows){const key=kind==='contacts'?(r.email?low(r.email):low(r.name)+'|'+low(r.company)):low(r.name);if(seen.has(key)){dupes.push(r);continue}seen.add(key);rows.push(r)}
  const newCompanies=kind==='contacts'?[...new Set(rows.map(r=>r.company).filter(c=>c&&!byName.has(low(c))).map(c=>c.trim()))]:[];
  plan={rows,dupes,newCompanies,byName};
 });
 if(!ready)return;
 if(!plan.rows.length){a.notice('Niente da importare: '+plan.dupes.length+' righe sono già nel CRM.');return}
 const one=plan.rows.length===1;const msg='Importare '+plan.rows.length+(kind==='contacts'?(one?' contatto':' contatti'):(one?' azienda':' aziende'))+(plan.newCompanies.length?' e creare '+plan.newCompanies.length+(plan.newCompanies.length===1?' nuova azienda':' nuove aziende'):'')+'?\n'+(plan.dupes.length?plan.dupes.length+' righe già presenti vengono saltate. ':'')+(mapped.skipped.length?mapped.skipped.length+' righe non valide vengono scartate. ':'')+(mapped.unknown?.length?'\nColonne non riconosciute, non importate: '+mapped.unknown.slice(0,8).join(', ')+(mapped.unknown.length>8?'…':'')+'. Per tenerle crea un campo con lo stesso nome da «Aggiungi campo» su una scheda, poi reimporta.':'')+'\nIl consenso marketing non viene importato: va registrato a mano per ogni contatto.';
 if(!window.confirm(msg))return;
 // older: the archive refused the 011 fields once, so the rest go without them (read again after the run).
 let done=0,failed=[],older=false;
 await run('Importazione in corso…',async()=>{
  for(const name of plan.newCompanies){try{const res=await post('companies','create',{name});const id=res.rows?.[0]?.id;if(id)plan.byName.set(low(name),id)}catch(e){failed.push(name+': '+e.message)}}
  const added=window.RadixCrmFields?.ADDED[kind]||[];
  const bare=d=>{const o={...d};for(const k of added)delete o[k];return o};
  for(const r of plan.rows){let d={...r};delete d.company;if(kind==='contacts'&&r.company)d.company_id=plan.byName.get(low(r.company))||null;
   if(older)d=bare(d);
   try{try{await post(kind,'create',d)}catch(e){
     // Archive without migration 011: save the row without the added fields, and stop sending them.
     if(e.status===400&&/011/.test(e.message)&&added.some(k=>Object.hasOwn(d,k))){older=true;await post(kind,'create',bare(d))}else throw e}
    done++;if(done%10===0)a.notice('Importati '+done+' di '+plan.rows.length+'…')}catch(e){failed.push(r.name+': '+e.message)}}
 });
 await a.refresh(false);
 a.notice('Importati '+done+' di '+plan.rows.length+'.'+(failed.length?' Non riusciti: '+failed.length+'.':''));
 if(failed.length)a.error('Righe non importate: '+failed.slice(0,5).join(' · ')+(failed.length>5?' …':''));
 const warn=[...(mapped.warnings||[]).map(w=>'riga '+w.line+': '+w.why)];if(older)warn.unshift('ragione sociale, indirizzi e dati fiscali non salvati: l’archivio non ha ancora la migrazione sales 011');
 if(warn.length)a.notice('Importati '+done+' di '+plan.rows.length+'. Campi lasciati vuoti — '+warn.slice(0,4).join(' · ')+(warn.length>4?' …':''));
}
function ioBar(kind){
 const bar=E('div',undefined,'actions crm-tools');
 bar.append(B('Esporta CSV',()=>exportCsv(kind)));
 if(app().writable(kind)){const input=E('input');input.type='file';input.accept=CSV().ACCEPT;input.hidden=true;input.addEventListener('change',()=>{const f=input.files[0];input.value='';importCsv(kind,f)});
  bar.append(Object.assign(B('Importa CSV o Excel',()=>input.click()),{title:'File .csv o .xlsx: la prima riga con i nomi delle colonne'}),input)}
 return bar;
}
// Segments: filters over the full contact export (with company data) and the loaded interactions.
function segmentPanel(){
 const box=E('details',undefined,'panel crm-segment');box.append(E('summary','Segmenti: filtra ed esporta i contatti'));
 const form=E('div',undefined,'row');
 const field=(label,el)=>{const l=E('label',label);l.append(el);form.append(l);return el};
 const role=field('Ruolo contiene',Object.assign(E('input'),{maxLength:80}));
 const industry=field('Settore azienda contiene',Object.assign(E('input'),{maxLength:80}));
 const city=field('Città azienda contiene',Object.assign(E('input'),{maxLength:80}));
 const consent=field('Consenso marketing',E('select'));[['','Tutti'],['yes','Solo con consenso'],['no','Senza consenso']].forEach(([v,t])=>{const o=E('option',t);o.value=v;consent.append(o)});
 const silent=field('Non sentiti da almeno (giorni)',Object.assign(E('input'),{type:'number',min:'0',max:'3650'}));
 const minScore=field('Punteggio minimo (0–100)',Object.assign(E('input'),{type:'number',min:'0',max:'100'}));
 const clicked=field('Clic sulle campagne email',E('select'));[['','Tutti'],['yes','Hanno cliccato almeno un link'],['no','Non hanno mai cliccato']].forEach(([v,t])=>{const o=E('option',t);o.value=v;clicked.append(o)});
 const campaign=field('Ha cliccato la campagna',E('select'));
 const addCampaign=name=>{if(!name||[...campaign.options].some(o=>o.value===name))return;const o=E('option',name);o.value=name;campaign.append(o)};
 {const o=E('option','Qualsiasi');o.value='';campaign.append(o)}
 app().api('email_clicks',{}).then(r=>((r&&r.campaigns)||[]).forEach(c=>addCampaign(c.campaign))).catch(()=>{});
 const out=E('div',undefined,'muted');
 const filterOf=async()=>{
  const companies=new Map((await exportRows('companies')).map(c=>[low(c.name),c]));
  const last=new Map();for(const i of app().rows('interactions')){const t=Date.parse(i.occurred_at);if(i.contact_id&&(!last.has(i.contact_id)||last.get(i.contact_id)<t))last.set(i.contact_id,t)}
  const days=silent.value===''?null:Number(silent.value),min=minScore.value===''?null:Number(minScore.value);
  const data=scoreData(),now=Date.now();
  // Contacts with at least one tracked click (api/_sales_clicks.js); without the report the filter fails rather than guessing.
  const report=clicked.value||campaign.value?await app().api('email_clicks',{}):null;
  const clickers=clicked.value?new Set((report.contacts)||[]):null,inCampaign=campaign.value?new Set(((report.byCampaign||{})[campaign.value])||[]):null;
  return r=>{
   if(clickers&&(clicked.value==='yes')!==clickers.has(r.id))return false;if(inCampaign&&!inCampaign.has(r.id))return false;const c=companies.get(low(r.company))||{};
   if(role.value&&!low(r.role).includes(low(role.value)))return false;
   if(industry.value&&!low(c.industry).includes(low(industry.value)))return false;
   if(city.value&&!low(c.city).includes(low(city.value)))return false;
   if(consent.value==='yes'&&!r.marketing_consent)return false;if(consent.value==='no'&&r.marketing_consent)return false;
   if(days!=null){const t=last.get(r.id);if(t&&Date.now()-t<days*DAY)return false}
   if(min!=null&&window.RadixCrmScore&&RadixCrmScore.score(r,data,now).total<min)return false;
   return true}};
 const show=B('Mostra segmento',()=>run('Calcolo il segmento…',async()=>{const f=await filterOf();const rows=(await exportRows('contacts')).filter(f);
  out.replaceChildren(E('p',rows.length+' contatti nel segmento'+(rows.length?': ':'.')+rows.slice(0,15).map(r=>r.name+(r.company?' ('+r.company+')':'')).join(', ')+(rows.length>15?' …':'')));app().notice('Segmento calcolato.')}));
 const exp=B('Esporta segmento CSV',async()=>{let f;try{f=await filterOf()}catch(e){app().error(e.message);return}exportCsv('contacts',f)});
 const a=E('div',undefined,'actions');a.append(show,exp);
 // Saved segments (sales_segments): the same filters, shared by the workspace.
 const current=()=>{const f={};for(const [k,el] of [['role',role],['industry',industry],['city',city]])if(el.value.trim())f[k]=el.value.trim();if(consent.value)f.consent=consent.value;if(silent.value!==''){const n=Number(silent.value);if(!Number.isInteger(n)||n<0||n>3650)throw new Error('Giorni senza contatto: un numero intero da 0 a 3650.');f.silent_days=n}if(minScore.value!==''){const n=Number(minScore.value);if(!Number.isInteger(n)||n<0||n>100)throw new Error('Punteggio minimo: un numero intero da 0 a 100.');f.min_score=n}if(clicked.value)f.clicked=clicked.value;if(campaign.value)f.clicked_campaign=campaign.value;return f};
 const saved=E('select');saved.setAttribute('aria-label','Segmenti salvati');const savedRows=new Map();
 const fillSaved=rows=>{savedRows.clear();saved.replaceChildren();const o=E('option',rows.length?'Segmenti salvati…':'Nessun segmento salvato');o.value='';saved.append(o);for(const r of rows){savedRows.set(r.id,r);const x=E('option',r.name);x.value=r.id;saved.append(x)}};
 const loadSaved=async()=>{try{fillSaved((await app().api('segments')).rows||[])}catch(e){fillSaved([]);out.replaceChildren(E('p','Segmenti salvati non disponibili: '+e.message,'notice'))}};
 saved.addEventListener('change',()=>{const r=savedRows.get(saved.value);if(!r)return;const f=r.filters||{};role.value=f.role||'';industry.value=f.industry||'';city.value=f.city||'';consent.value=f.consent||'';silent.value=f.silent_days??'';minScore.value=f.min_score??'';clicked.value=f.clicked||'';addCampaign(f.clicked_campaign);campaign.value=f.clicked_campaign||'';app().notice('Segmento «'+r.name+'» caricato: premi Mostra segmento.')});
 const keep=E('div',undefined,'actions crm-saved');keep.append(saved);
 if(app().writable('contacts')){
  keep.append(B('Salva segmento',async()=>{let filters;try{filters=current()}catch(e){app().error(e.message);return}
   if(!Object.keys(filters).length){app().error('Imposta almeno un filtro prima di salvare.');return}
   const name=(window.prompt('Nome del segmento (visibile a tutto il workspace):','')||'').trim();if(!name)return;if(name.length>200){app().error('Nome troppo lungo: massimo 200 caratteri.');return}
   if(await run('Salvo il segmento…',()=>post('segments','create',{name,filters}))){await loadSaved();app().notice('Segmento «'+name+'» salvato.')}}),
  B('Elimina segmento',async()=>{const r=savedRows.get(saved.value);if(!r){app().error('Scegli prima un segmento salvato.');return}
   if(!window.confirm('Eliminare il segmento «'+r.name+'»? I contatti non vengono toccati.'))return;
   if(await run('Elimino il segmento…',()=>post('segments','delete',{id:r.id,version:r.version}))){await loadSaved();app().notice('Segmento eliminato.')}},'danger'));
 }
 box.addEventListener('toggle',()=>{if(box.open&&!box.dataset.loaded){box.dataset.loaded='1';loadSaved()}});
box.filterOf=filterOf;
 box.append(keep,form,a,out,E('p','«Non sentiti da» usa le interazioni caricate nella pagina. Per campagne email esporta solo contatti con consenso.','muted'));
 return box;
}
// Score inputs: the rows sales.js already loaded (interactions, opportunities, stages).
const scoreData=()=>({interactions:app().rows('interactions'),opportunities:app().rows('opportunities'),stages:app().rows('stages')});
// Follow-up rule: open deal with no interaction for N days and no open task -> one task, after confirmation.
function followUpBar(){
 const bar=E('div',undefined,'actions crm-tools');const n=Object.assign(E('input'),{type:'number',min:'1',max:'365',value:'14'});n.setAttribute('aria-label','Giorni senza contatto');
 const l=E('label','Trattative aperte senza contatto da giorni');l.append(n);
 bar.append(l,B('Crea attività di follow-up',()=>followUps(Number(n.value)||14)));return bar;
}
async function followUps(days){
 const a=app(),now=Date.now(),opps=a.rows('opportunities').filter(o=>!o.outcome||o.outcome==='open');
 const last=new Map();for(const i of a.rows('interactions')){const t=Date.parse(i.occurred_at);for(const k of [i.opportunity_id,i.contact_id,i.company_id])if(k&&(!last.has(k)||last.get(k)<t))last.set(k,t)}
 const openTask=new Set(a.rows('tasks').filter(t=>t.status!=='done').map(t=>t.opportunity_id).filter(Boolean));
 const due=opps.filter(o=>{if(openTask.has(o.id))return false;const t=Math.max(last.get(o.id)||0,last.get(o.contact_id)||0,last.get(o.company_id)||0);return !t||now-t>=days*DAY});
 if(!due.length){a.notice('Nessuna trattativa aperta senza contatto da '+days+' giorni e senza attività aperte.');return}
 if(!window.confirm('Creare '+due.length+' attività di follow-up?\n'+due.slice(0,10).map(o=>'• '+a.title(o)).join('\n')+(due.length>10?'\n…':'')+'\nScadenza domani alle 9 (UTC), assegnate al responsabile della trattativa.'))return;
 const tomorrow=new Date(now+DAY);tomorrow.setUTCHours(9,0,0,0);const dueAt=tomorrow.toISOString().slice(0,19)+'Z';let done=0;const failed=[];
 await run('Creo le attività…',async()=>{for(const o of due){try{await post('tasks','create',{title:'Follow-up: '+a.title(o).slice(0,180),opportunity_id:o.id,company_id:o.company_id||null,contact_id:o.contact_id||null,assignee_id:o.owner_id||null,priority:'normal',due_at:dueAt,status:'todo'});done++}catch(e){failed.push(a.title(o)+': '+e.message)}}});
 await a.refresh(false);a.notice('Create '+done+' attività di follow-up.');if(failed.length)a.error('Non create: '+failed.join(' · '));
}
// Automations: each rule shows how many tasks it would create; one confirmation per rule.
// With sales/crm-rules.js the panel is the configurable one («Regole» and «Registro»); the fixed rules are its defaults.
function automationsPanel(){
 if(window.RadixCrmRules&&window.RadixCrmRules.panel)return window.RadixCrmRules.panel();
 const R=window.RadixCrmAutomations;if(!R)return null;
 const box=E('details',undefined,'panel crm-automations');box.append(E('summary','Automazioni'));
 const list=E('div',undefined,'crm-automation-list');box.append(E('p','Le regole propongono attività dai dati caricati: nulla parte da solo, confermi tu. Le attività automatiche all’ingresso in una fase si impostano sulla fase della pipeline.','muted'),list);
 const data=()=>{const a=app();return {opportunities:a.rows('opportunities'),tasks:a.rows('tasks'),tickets:a.rows('tickets'),contacts:a.rows('contacts'),interactions:a.rows('interactions'),stages:a.rows('stages')}};
 const opts=()=>({now:Date.now(),assignee:app().state.me||null,score:window.RadixCrmScore&&window.RadixCrmScore.score});
 function draw(){list.replaceChildren();for(const rule of R.RULES){let p;try{p=R.plan(rule.id,data(),opts())}catch(e){continue}
  const row=E('div',undefined,'crm-automation');row.dataset.rule=rule.id;const n=p.items.length;
  row.append(E('strong',rule.name),E('span',rule.description,'muted'),E('span',n?n+(n===1?' attività da creare':' attività da creare'):'Niente da fare','crm-automation-count'));
  const b=B('Applica',()=>apply(rule.id));b.disabled=!n;row.append(b);list.append(row)}}
 async function apply(id){
  const a=app(),p=R.plan(id,data(),opts());if(!p.items.length){draw();return}
  if(!window.confirm('«'+p.rule.name+'»: creare '+p.items.length+' attività?\n'+p.items.slice(0,10).map(x=>'• '+x.task.title).join('\n')+(p.items.length>10?'\n…':'')))return;
  let done=0;const failed=[];
  await run('Applico la regola…',async()=>{for(const x of p.items){try{await post('tasks','create',x.task);done++}catch(e){failed.push(e.message)}}});
  await a.refresh(false);a.notice('«'+p.rule.name+'»: '+done+' attività create.');if(failed.length)a.error('Non create: '+failed.length+' · '+failed[0]);
 }
 box.addEventListener('toggle',()=>{if(box.open)draw()});
 return box;
}
// GDPR: access (everything the CRM holds on the contact) and erasure by anonymisation.
async function gdprExport(row){
 await run('Raccolgo i dati del contatto…',async()=>{const a=app();const all=[];let offset=0;
  for(let i=0;i<20;i++){const d=await a.api('customer360',{subject:'contacts',id:row.id,offset});const r=d.rows||[];all.push(...r);if(r.length<100)break;offset+=r.length}
  download('dati-'+low(row.name).replace(/[^a-z0-9]+/g,'-').slice(0,40)+'-'+stamp()+'.json',JSON.stringify({esportato_il:new Date().toISOString(),workspace:a.state.workspace,contatto:row,dati_collegati:all},null,2),'application/json');
  a.notice('Dati del contatto esportati.')});
}
async function gdprErase(row){
 const a=app();
 if(!window.confirm('Anonimizzare «'+row.name+'»?\nNome, email, telefono, ruolo, LinkedIn, note, indirizzo, data di nascita e consenso vengono cancellati, e il testo delle interazioni e dei ticket collegati viene svuotato. Trattative e attività restano per lo storico. Non si può annullare.'))return;
 const failed=[];
 await run('Anonimizzo il contatto…',async()=>{
  const d=await a.api('customer360',{subject:'contacts',id:row.id,offset:0});
  for(const x of (d.rows||[]).filter(r=>r.entity==='interactions').map(r=>r.record)){if(x.contact_id!==row.id)continue;try{await post('interactions','update',{id:x.id,version:x.version,title:'Interazione anonimizzata',body:''})}catch(e){failed.push(e.message)}}
  for(const x of (d.rows||[]).filter(r=>r.entity==='tickets').map(r=>r.record)){if(x.contact_id!==row.id)continue;try{await post('tickets','update',{id:x.id,version:x.version,title:'Ticket anonimizzato',body:'',resolution:null})}catch(e){failed.push(e.message)}}
  // With migration 011 the personal fields added there are cleared too (an older archive does not have them).
  const personal=window.RadixCrmFields?.supported('contacts',row)?{first_name:null,last_name:null,title:null,department:null,mobile:null,street:null,zip:null,city:null,province:null,country:null,birthdate:null,lead_source:null,preferred_language:null}:{};
  await post('contacts','update',{id:row.id,version:row.version,name:'Contatto anonimizzato',email:null,phone:null,role:null,linkedin_url:null,notes:null,marketing_consent:false,consent_at:null,...personal});
 });
 await a.refresh(false);a.notice('Contatto anonimizzato.');if(failed.length)a.error('Alcune interazioni non sono state svuotate: '+failed.join(' · '));
}
// Duplicates: list likely duplicate contacts or companies (the full export, up to 5000) and merge on confirm.
const DEDUPE={
 contacts:{intro:'Cerca contatti con la stessa email, lo stesso telefono o lo stesso nome nella stessa azienda. L’unione sposta attività, interazioni, ticket, lead e trattative sul contatto che tieni, poi elimina l’altro.',
  groups:rows=>window.RadixCrmDedupe.groups(rows).map(g=>({items:g.contacts,legend:'Stesso '+g.reasons.join(', ')})),
  line:c=>[c.company,c.email,c.phone],merge:(g,id)=>mergeGroup({contacts:g.items},id),limit:' Controllati i primi 5000 contatti in ordine alfabetico.'},
 companies:{intro:'Cerca aziende con la stessa partita IVA, lo stesso dominio (sito o email, esclusi Gmail, LinkedIn e simili) o lo stesso nome a meno della forma societaria. L’unione sposta contatti, trattative, attività, interazioni, ticket e lead sull’azienda che tieni, completa i suoi campi vuoti, poi elimina l’altra.',
  groups:rows=>window.RadixCrmDedupe.companyGroups(rows).map(g=>({items:g.companies,legend:g.reasons.join(', ').replace(/^./,x=>x.toUpperCase())})),
  line:c=>[c.city,c.vat_number&&'P.IVA '+c.vat_number,c.website||c.email],merge:(g,id)=>mergeCompanies(g.items,id),limit:' Controllate le prime 5000 aziende in ordine alfabetico.'}
};
function dedupePanel(kind){
 const K=DEDUPE[kind],box=E('details',undefined,'panel crm-dedupe');box.append(E('summary','Possibili doppioni'));box.dataset.kind=kind;
 const body=E('div',undefined,'crm-dedupe-body');body.append(E('p',K.intro,'muted'));
 const list=E('div',undefined,'crm-dedupe-list');
 const search=B('Cerca doppioni',async()=>{let found,total=0;const ok=await run('Cerco i doppioni…',async()=>{const rows=await exportRows(kind);total=rows.length;found=K.groups(rows)});if(!ok)return;list.replaceChildren();
  if(!found.length){list.append(E('p','Nessun possibile doppione.'+(total>=5000?K.limit:''),'muted'));return}
  list.append(E('p',found.length+(found.length===1?' gruppo da controllare':' gruppi da controllare')+(found.length>50?': qui i primi 50, unisci questi e cerca di nuovo per gli altri.':'.')+(total>=5000?K.limit:''),'crm-dedupe-count'));
  found.slice(0,50).forEach((g,i)=>{const f=E('fieldset',undefined,'crm-dedupe-group');f.append(E('legend',g.legend));
   g.items.forEach((c,j)=>{const l=E('label',undefined,'check');const r=E('input');r.type='radio';r.name=kind+'-keep-'+i;r.value=c.id;r.checked=j===0;l.append(r,E('span',' Tieni «'+c.name+'»'+K.line(c).filter(Boolean).map(x=>' · '+x).join('')));f.append(l)});
   f.append(B('Unisci gli altri in quello scelto',()=>K.merge(g,f.querySelector('input:checked').value)));list.append(f)})});
 body.append(search,list);box.append(body);return box;
}
async function pages(fn){const all=[];let offset=0;for(let i=0;i<50;i++){const r=(await fn(offset)).rows||[];all.push(...r);if(r.length<100)break;offset+=r.length}return all}
async function mergeGroup(group,keepId){
 const a=app(),D=window.RadixCrmDedupe,skipped=[];
 const c360=id=>pages(offset=>a.api('customer360',{subject:'contacts',id,offset}));
 // Leads are not in customer360, and one left behind would block the delete: read them too.
 const leadsOf=async id=>(await pages(offset=>a.api('leads',{offset}))).filter(x=>x.contact_id===id).map(record=>({entity:'leads',record}));
 const self=(rows,id)=>(rows.find(r=>r.entity==='contacts'&&r.record.id===id)||{}).record;
 for(const other of group.contacts.filter(c=>c.id!==keepId)){
  let keep,drop,plan;
  const ok=await run('Preparo l’unione…',async()=>{keep=self(await c360(keepId),keepId);const rel=await c360(other.id);drop=self(rel,other.id);if(keep&&drop)plan=D.mergePlan(keep,drop,[...rel,...await leadsOf(other.id)])});
  if(!ok)break;
  if(!keep){a.error('Il contatto da tenere non esiste più: cerca di nuovo i doppioni.');return}
  if(!drop)continue;// already merged by an earlier click
  if(plan.blocked){skipped.push('«'+drop.name+'»: '+plan.blocked);continue}
  const n=e=>plan.moves.filter(m=>m.entity===e).length,parts=[['tasks','attività'],['interactions','interazioni'],['tickets','ticket'],['leads','lead'],['opportunities','trattative']].filter(([e])=>n(e)).map(([e,l])=>n(e)+' '+l);
  if(!window.confirm('Unire «'+drop.name+'» in «'+keep.name+'»?\n\n'+(parts.length?'Passano a «'+keep.name+'»: '+parts.join(', ')+'.\n':'')+(Object.keys(plan.fill).length?'Campi completati: '+Object.keys(plan.fill).join(', ')+'.\n':'')+(plan.consentLost?'Il consenso marketing di «'+drop.name+'» non viene copiato: registralo a mano se vale anche per «'+keep.name+'».\n':'')+'\n«'+drop.name+'» viene poi eliminato. Non si può annullare.'))continue;
  const failed=[];
  await run('Unisco i contatti…',async()=>{
   for(const m of plan.moves){try{await post(m.entity,'update',{id:m.record.id,version:m.record.version,contact_id:keep.id})}catch(e){failed.push((m.record.title||m.entity)+': '+e.message)}}
   // Fields and delete only once everything moved: a retry then starts from a clean plan.
   if(!failed.length&&Object.keys(plan.fill).length)try{await post('contacts','update',{id:keep.id,version:keep.version,...plan.fill})}catch(e){failed.push('campi di «'+keep.name+'»: '+e.message)}
   if(!failed.length)try{await post('contacts','delete',{id:drop.id,version:drop.version})}catch(e){failed.push('eliminazione di «'+drop.name+'»: '+e.message)}
  });
  await a.refresh(false);
  if(failed.length){a.error('Unione incompleta, «'+drop.name+'» non è stato eliminato: '+failed.join(' · ')+'. Quello che è già passato a «'+keep.name+'» resta lì: puoi riprovare.');return}
  a.notice('«'+drop.name+'» unito in «'+keep.name+'».');
 }
 if(skipped.length)a.error('Non uniti: '+skipped.join(' · '));
}
// Companies: the same flow as contacts. Contacts move first, then the records tied only to the company and the
// subsidiaries; fields and delete come last, so a retry starts from a clean plan.
async function mergeCompanies(companies,keepId){
 const a=app(),D=window.RadixCrmDedupe,skipped=[];
 const c360=id=>pages(offset=>a.api('customer360',{subject:'companies',id,offset}));
 // Leads and subsidiaries are not in customer360, and one left behind would block the delete or lose its parent.
 const extra=async(id,withChildren)=>[...(await pages(offset=>a.api('leads',{offset}))).filter(x=>x.company_id===id).map(record=>({entity:'leads',record})),
  ...(withChildren?(await pages(offset=>a.api('companies',{offset}))).filter(x=>x.parent_company_id===id).map(record=>({entity:'companies',record})):[])];
 const self=(rows,id)=>(rows.find(r=>r.entity==='companies'&&r.record.id===id)||{}).record;
 for(const other of companies.filter(c=>c.id!==keepId)){
  let keep,drop,plan;
  const ok=await run('Preparo l’unione…',async()=>{keep=self(await c360(keepId),keepId);const rel=await c360(other.id);drop=self(rel,other.id);
   if(keep&&drop)plan=D.companyMergePlan(keep,drop,[...rel,...await extra(other.id,Object.hasOwn(drop,'parent_company_id'))])});
  if(!ok)break;
  if(!keep){a.error('L’azienda da tenere non esiste più: cerca di nuovo i doppioni.');return}
  if(!drop)continue;// already merged by an earlier click
  if(plan.blocked){skipped.push('«'+drop.name+'»: '+plan.blocked);continue}
  const n=e=>plan.moves.filter(m=>m.entity===e).length,parts=[['contacts','contatti'],['opportunities','trattative'],['tasks','attività'],['interactions','interazioni'],['tickets','ticket'],['leads','lead'],['companies','aziende controllate']].filter(([e])=>n(e)).map(([e,l])=>n(e)+' '+l);
  const labels=Object.keys(plan.fill).map(k=>window.RadixCrmFields?.fieldOf('companies',k)?.label||k);
  if(!window.confirm('Unire «'+drop.name+'» in «'+keep.name+'»?\n\n'+(parts.length?'Passano a «'+keep.name+'»: '+parts.join(', ')+'.\n':'')+(labels.length?'Campi completati: '+labels.join(', ')+'.\n':'')+'\n«'+drop.name+'» viene poi eliminata. Non si può annullare.'))continue;
  const failed=[];
  await run('Unisco le aziende…',async()=>{
   for(const m of plan.moves){try{await post(m.entity,'update',{id:m.record.id,version:m.record.version,...m.set})}catch(e){failed.push((m.record.title||m.record.name||m.entity)+': '+e.message)}}
   if(!failed.length&&Object.keys(plan.fill).length)try{await post('companies','update',{id:keep.id,version:keep.version,...plan.fill})}catch(e){failed.push('campi di «'+keep.name+'»: '+e.message)}
   if(!failed.length)try{await post('companies','delete',{id:drop.id,version:drop.version})}catch(e){failed.push('eliminazione di «'+drop.name+'»: '+e.message)}
  });
  await a.refresh(false);
  if(failed.length){a.error('Unione incompleta, «'+drop.name+'» non è stata eliminata: '+failed.join(' · ')+'. Quello che è già passato a «'+keep.name+'» resta lì: puoi riprovare.');return}
  a.notice('«'+drop.name+'» unita in «'+keep.name+'». Se ora ci sono contatti doppi, cercali in Contatti › Possibili doppioni.');
 }
 if(skipped.length)a.error('Non unite: '+skipped.join(' · '));
}
// Playbook of the opportunity's stage (crm-playbook-core.js): fixed steps, missing ones created after one confirmation.
function playbookBlock(opp){
 const a=app(),P=window.RadixCrmPlaybook,box=E('div',undefined,'crm-playbook'),plan=P.planPlaybook(opp,a.rows('stages'),a.rows('tasks'),{now:Date.now(),assignee:a.state.me||null});
 box.append(E('strong','Playbook · '+plan.playbook.name+(plan.stage?' ('+plan.stage.title+')':'')));
 const ol=E('ol');for(const s of plan.steps){const li=E('li',s.title.replace(/^\[Playbook [^\]]*\] /,'')+' · '+(s.day?'entro '+s.day+(s.day===1?' giorno':' giorni'):'oggi'));if(s.done){li.className='done';li.append(E('span',' ✓ già creata','muted'))}ol.append(li)}box.append(ol);
 if(plan.create.length){const n=plan.create.length;box.append(B('Crea '+(n===1?'l’attività mancante':'le '+n+' attività mancanti'),async()=>{
  if(!window.confirm('Creare '+n+' attività del playbook «'+plan.playbook.name+'» per «'+a.title(opp)+'»?\n'+plan.create.map(t=>'• '+t.title).join('\n')))return;
  let done=0;const failed=[];await run('Creo le attività del playbook…',async()=>{for(const t of plan.create){try{await post('tasks','create',t);done++}catch(e){failed.push(e.message)}}});
  await a.refresh(false);a.notice('Playbook «'+plan.playbook.name+'»: '+done+(done===1?' attività creata.':' attività create.'));if(failed.length)a.error('Non create: '+failed.length+' · '+failed[0])}))}
 else box.append(E('p','Tutti i passi di questa fase sono già tra le attività.','muted'));
 box.append(E('p','Passi fissi per fase, non generati dall’AI. Le attività vanno al responsabile della trattativa.','muted'));
 return box;
}
window.RadixCrmTools={
 // CSV of a subset (the rows ticked in the list views): the same export, filtered by id.
 exportCsv:(kind,filter)=>exportCsv(kind,filter),
 section(entity,section){
  if(entity==='tickets')window.RadixCrmSla?.section(section);
  // List actions sit together in the heading row, next to «Crea»: CSV, then shortcuts that open the panels below.
  const head=section.querySelector(':scope>.row')||section;
  // The panels under the list stay hidden until their button in the heading row opens them; closing one hides it again.
  const tuck=box=>{box.hidden=true;box.addEventListener('toggle',()=>{if(!box.open)box.hidden=true});return box};
  const reveal=(box,then)=>()=>{box.hidden=false;box.open=true;box.scrollIntoView({block:'start',behavior:'smooth'});box.querySelector('input,select,textarea')?.focus({preventScroll:true});if(then)then(box)};
  const findNow=box=>{const b=[...box.querySelectorAll('button')].find(x=>x.textContent==='Cerca doppioni');if(b&&!box.querySelector('.crm-dedupe-list').childElementCount)b.click()};
  if(entity==='contacts'){const seg=tuck(segmentPanel()),bar=ioBar('contacts');head.append(bar);section.append(seg);
   bar.append(B('Segmenti',reveal(seg)));
   if(window.RadixCrmCampaigns){const camp=tuck(RadixCrmCampaigns.panel(seg.filterOf));section.append(camp);if(app().writable('interactions'))bar.append(B('Campagna email',reveal(camp)))}
   if(window.RadixCrmDedupe&&app().writable('contacts')){const dd=tuck(dedupePanel('contacts'));section.append(dd);bar.append(B('Doppioni',reveal(dd,findNow)))}}
  else if(entity==='companies'){const bar=ioBar('companies');head.append(bar);if(window.RadixCrmDedupe&&app().writable('companies')){const dd=tuck(dedupePanel('companies'));section.append(dd);bar.append(B('Doppioni',reveal(dd,findNow)))}}
  else if(entity==='tickets'&&window.RadixCrmKnowledge){const board=section.querySelector(':scope>.board');section.insertBefore(RadixCrmKnowledge.panel(),board)}
  // The tasks view keeps only the heading row visible, so the rule lives there.
  else if(entity==='tasks'&&app().writable('tasks')){head.append(followUpBar());const auto=automationsPanel();if(auto)head.append(auto)}
 },
 card(entity,row,c,readonly){
  if(entity==='tickets')window.RadixCrmSla?.mount(c,row);
  // The reply block has its own AI draft; the Copilota shortcut stays for roles that cannot record replies.
  if(entity==='tickets'&&!readonly&&window.RadixCrmTicketReply?.mount&&RadixCrmTicketReply.mount(c,row))return;
  if(entity==='tickets'&&!readonly&&window.RadixCrmCopilot&&['open','pending'].includes(row.status)){const bar=E('div',undefined,'actions crm-ticket-ai');
   bar.append(B('Bozza di risposta con AI',()=>RadixCrmCopilot.open('Scrivi una bozza di risposta cortese e concreta per il ticket di assistenza «'+row.title+'»'+(row.body?'. Richiesta del cliente: «'+String(row.body).slice(0,1500)+'»':'')+'. Usa solo i dati del CRM, indica cosa verificare prima di inviarla e non promettere nulla che non risulti dai dati.')));c.append(bar);return}
  // Meetings and calls, in the Interazioni list and in Customer360: «Bozza follow-up» (sales/crm-follow-up.js).
  if(entity==='interactions'&&window.RadixCrmFollowUp?.mount){RadixCrmFollowUp.mount(c,row);return}
  if(entity==='opportunities'&&!readonly&&window.RadixCrmPlaybook&&app().writable('tasks')&&(!row.outcome||row.outcome==='open')){c.append(playbookBlock(row));return}
  // Contacts with a LinkedIn profile (often imported from Sales Navigator, without email): «Messaggio LinkedIn» (sales/crm-linkedin-message.js).
  if(entity==='contacts'&&window.RadixCrmLinkedIn?.mount)RadixCrmLinkedIn.mount(c,row);
  if(entity!=='contacts'||readonly)return;
  if(window.RadixCrmScore){const s=RadixCrmScore.score(row,scoreData());const p=E('p','Punteggio '+s.total+' · '+s.band+' — '+RadixCrmScore.explain(s),'crm-score crm-score-'+s.band);p.dataset.score=String(s.total);c.append(p)}
  const bar=E('div',undefined,'actions crm-gdpr');
  bar.append(B('Esporta dati (GDPR)',()=>gdprExport(row)));
  if(app().writable('contacts')&&row.name!=='Contatto anonimizzato')bar.append(B('Anonimizza (GDPR)',()=>gdprErase(row),'danger'));
  c.append(bar);
 }
};
})();
