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
const cols=kind=>COLUMNS[kind].map(([label,k])=>typeof k==='function'?{label,value:k}:{label,key:k});
async function run(label,fn){
 const a=app();if(a.state.busy)return;a.lock(true);a.error('');a.notice(label);let ok=false;
 try{await fn();ok=true}catch(e){a.error(e.message||String(e));a.notice('Operazione non completata.')}
 finally{a.lock(false)}
 return ok;
}
async function exportCsv(kind,filter){
 await run('Preparo il file…',async()=>{let rows=await exportRows(kind);if(filter)rows=rows.filter(filter);
  download((kind==='contacts'?'contatti':'aziende')+'-'+stamp()+'.csv',CSV().toCsv(rows,cols(kind)),'text/csv;charset=utf-8');
  app().notice(rows.length+' righe esportate.')});
}
const post=(entity,action,data)=>app().api(entity,{body:{workspace:app().state.workspace,entity,action,data}});
async function importCsv(kind,file){
 const a=app();if(!file)return;if(file.size>2e6){a.error('File troppo grande: massimo 2 MB.');return}
 let mapped;try{mapped=CSV().mapRows(kind,CSV().parse(await file.text()))}catch(e){a.error(e.message);return}
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
 const one=plan.rows.length===1;const msg='Importare '+plan.rows.length+(kind==='contacts'?(one?' contatto':' contatti'):(one?' azienda':' aziende'))+(plan.newCompanies.length?' e creare '+plan.newCompanies.length+(plan.newCompanies.length===1?' nuova azienda':' nuove aziende'):'')+'?\n'+(plan.dupes.length?plan.dupes.length+' righe già presenti vengono saltate. ':'')+(mapped.skipped.length?mapped.skipped.length+' righe non valide vengono scartate. ':'')+'\nIl consenso marketing non viene importato: va registrato a mano per ogni contatto.';
 if(!window.confirm(msg))return;
 let done=0,failed=[];
 await run('Importazione in corso…',async()=>{
  for(const name of plan.newCompanies){try{const res=await post('companies','create',{name});const id=res.rows?.[0]?.id;if(id)plan.byName.set(low(name),id)}catch(e){failed.push(name+': '+e.message)}}
  for(const r of plan.rows){const d={...r};delete d.company;if(kind==='contacts'&&r.company)d.company_id=plan.byName.get(low(r.company))||null;
   try{await post(kind,'create',d);done++;if(done%10===0)a.notice('Importati '+done+' di '+plan.rows.length+'…')}catch(e){failed.push(r.name+': '+e.message)}}
 });
 await a.refresh(false);
 a.notice('Importati '+done+' di '+plan.rows.length+'.'+(failed.length?' Non riusciti: '+failed.length+'.':''));
 if(failed.length)a.error('Righe non importate: '+failed.slice(0,5).join(' · ')+(failed.length>5?' …':''));
}
function ioBar(kind){
 const bar=E('div',undefined,'actions crm-tools');
 bar.append(B('Esporta CSV',()=>exportCsv(kind)));
 if(app().writable(kind)){const input=E('input');input.type='file';input.accept='.csv,text/csv';input.hidden=true;input.addEventListener('change',()=>{const f=input.files[0];input.value='';importCsv(kind,f)});
  bar.append(B('Importa CSV',()=>input.click()),input)}
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
 const out=E('div',undefined,'muted');
 const filterOf=async()=>{
  const companies=new Map((await exportRows('companies')).map(c=>[low(c.name),c]));
  const last=new Map();for(const i of app().rows('interactions')){const t=Date.parse(i.occurred_at);if(i.contact_id&&(!last.has(i.contact_id)||last.get(i.contact_id)<t))last.set(i.contact_id,t)}
  const days=silent.value===''?null:Number(silent.value);
  return r=>{const c=companies.get(low(r.company))||{};
   if(role.value&&!low(r.role).includes(low(role.value)))return false;
   if(industry.value&&!low(c.industry).includes(low(industry.value)))return false;
   if(city.value&&!low(c.city).includes(low(city.value)))return false;
   if(consent.value==='yes'&&!r.marketing_consent)return false;if(consent.value==='no'&&r.marketing_consent)return false;
   if(days!=null){const t=last.get(r.id);if(t&&Date.now()-t<days*DAY)return false}
   return true}};
 const show=B('Mostra segmento',()=>run('Calcolo il segmento…',async()=>{const f=await filterOf();const rows=(await exportRows('contacts')).filter(f);
  out.replaceChildren(E('p',rows.length+' contatti nel segmento'+(rows.length?': ':'.')+rows.slice(0,15).map(r=>r.name+(r.company?' ('+r.company+')':'')).join(', ')+(rows.length>15?' …':'')));app().notice('Segmento calcolato.')}));
 const exp=B('Esporta segmento CSV',async()=>{let f;try{f=await filterOf()}catch(e){app().error(e.message);return}exportCsv('contacts',f)});
 const a=E('div',undefined,'actions');a.append(show,exp);
 // Saved segments (sales_segments): the same five filters, shared by the workspace.
 const current=()=>{const f={};for(const [k,el] of [['role',role],['industry',industry],['city',city]])if(el.value.trim())f[k]=el.value.trim();if(consent.value)f.consent=consent.value;if(silent.value!==''){const n=Number(silent.value);if(!Number.isInteger(n)||n<0||n>3650)throw new Error('Giorni senza contatto: un numero intero da 0 a 3650.');f.silent_days=n}return f};
 const saved=E('select');saved.setAttribute('aria-label','Segmenti salvati');const savedRows=new Map();
 const fillSaved=rows=>{savedRows.clear();saved.replaceChildren();const o=E('option',rows.length?'Segmenti salvati…':'Nessun segmento salvato');o.value='';saved.append(o);for(const r of rows){savedRows.set(r.id,r);const x=E('option',r.name);x.value=r.id;saved.append(x)}};
 const loadSaved=async()=>{try{fillSaved((await app().api('segments')).rows||[])}catch(e){fillSaved([]);out.replaceChildren(E('p','Segmenti salvati non disponibili: '+e.message,'notice'))}};
 saved.addEventListener('change',()=>{const r=savedRows.get(saved.value);if(!r)return;const f=r.filters||{};role.value=f.role||'';industry.value=f.industry||'';city.value=f.city||'';consent.value=f.consent||'';silent.value=f.silent_days??'';app().notice('Segmento «'+r.name+'» caricato: premi Mostra segmento.')});
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
// GDPR: access (everything the CRM holds on the contact) and erasure by anonymisation.
async function gdprExport(row){
 await run('Raccolgo i dati del contatto…',async()=>{const a=app();const all=[];let offset=0;
  for(let i=0;i<20;i++){const d=await a.api('customer360',{subject:'contacts',id:row.id,offset});const r=d.rows||[];all.push(...r);if(r.length<100)break;offset+=r.length}
  download('dati-'+low(row.name).replace(/[^a-z0-9]+/g,'-').slice(0,40)+'-'+stamp()+'.json',JSON.stringify({esportato_il:new Date().toISOString(),workspace:a.state.workspace,contatto:row,dati_collegati:all},null,2),'application/json');
  a.notice('Dati del contatto esportati.')});
}
async function gdprErase(row){
 const a=app();
 if(!window.confirm('Anonimizzare «'+row.name+'»?\nNome, email, telefono, ruolo, LinkedIn, note e consenso vengono cancellati, e il testo delle interazioni e dei ticket collegati viene svuotato. Trattative e attività restano per lo storico. Non si può annullare.'))return;
 const failed=[];
 await run('Anonimizzo il contatto…',async()=>{
  const d=await a.api('customer360',{subject:'contacts',id:row.id,offset:0});
  for(const x of (d.rows||[]).filter(r=>r.entity==='interactions').map(r=>r.record)){if(x.contact_id!==row.id)continue;try{await post('interactions','update',{id:x.id,version:x.version,title:'Interazione anonimizzata',body:''})}catch(e){failed.push(e.message)}}
  for(const x of (d.rows||[]).filter(r=>r.entity==='tickets').map(r=>r.record)){if(x.contact_id!==row.id)continue;try{await post('tickets','update',{id:x.id,version:x.version,title:'Ticket anonimizzato',body:'',resolution:null})}catch(e){failed.push(e.message)}}
  await post('contacts','update',{id:row.id,version:row.version,name:'Contatto anonimizzato',email:null,phone:null,role:null,linkedin_url:null,notes:null,marketing_consent:false,consent_at:null});
 });
 await a.refresh(false);a.notice('Contatto anonimizzato.');if(failed.length)a.error('Alcune interazioni non sono state svuotate: '+failed.join(' · '));
}
window.RadixCrmTools={
 section(entity,section){
  if(entity==='contacts'){const seg=segmentPanel();section.append(ioBar('contacts'),seg);if(window.RadixCrmCampaigns)section.append(RadixCrmCampaigns.panel(seg.filterOf))}
  else if(entity==='companies')section.append(ioBar('companies'));
  // The tasks view keeps only the heading row visible, so the rule lives there.
  else if(entity==='tasks'&&app().writable('tasks'))(section.querySelector(':scope>.row')||section).append(followUpBar());
 },
 card(entity,row,c,readonly){
  if(entity!=='contacts'||readonly)return;const bar=E('div',undefined,'actions crm-gdpr');
  bar.append(B('Esporta dati (GDPR)',()=>gdprExport(row)));
  if(app().writable('contacts')&&row.name!=='Contatto anonimizzato')bar.append(B('Anonimizza (GDPR)',()=>gdprErase(row),'danger'));
  c.append(bar);
 }
};
})();
