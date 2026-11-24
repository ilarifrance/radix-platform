'use strict';
/* CRM «Lead» as in Salesforce: a status path (Nuovo › Contattato › Qualificato › Convertito, plus Non qualificato)
   and «Converti», which turns a lead into an opportunity of a pipeline with the lead's company and contact.
   Pure logic for sales/crm-leads.js and the tests: labels, counts, filters, the payloads the API accepts
   (api/_sales.js, migration sales/012). No network, no DOM. */
(function(root){
const STATUSES=Object.freeze([['nuovo','Nuovo'],['contattato','Contattato'],['qualificato','Qualificato'],['non_qualificato','Non qualificato'],['convertito','Convertito']]);
const LABEL=Object.fromEntries(STATUSES);
// The path a lead walks; «Non qualificato» is a side exit, shown apart.
const PATH=Object.freeze(['nuovo','contattato','qualificato','convertito']);
// What a person can pick by hand: «Convertito» only through «Converti».
const EDITABLE=Object.freeze(STATUSES.filter(([k])=>k!=='convertito'));
const OPEN=Object.freeze(['nuovo','contattato','qualificato']);
const TABS=Object.freeze([['aperti','Aperti'],['nuovo','Nuovi'],['contattato','Contattati'],['qualificato','Qualificati'],['non_qualificato','Non qualificati'],['convertito','Convertiti'],['tutti','Tutti']]);
const str=v=>String(v??'').trim();
const statusOf=l=>Object.hasOwn(LABEL,l?.status)?l.status:'nuovo';
// An archive before migration 012 returns leads without «status»: the view then explains what is missing.
const supported=leads=>!(leads||[]).length||(leads||[]).some(l=>Object.hasOwn(l,'status'));
function counts(leads){const c=Object.fromEntries(STATUSES.map(([k])=>[k,0]));for(const l of leads||[])c[statusOf(l)]++;c.aperti=OPEN.reduce((s,k)=>s+c[k],0);c.tutti=(leads||[]).length;return c}
function filter(leads,tab){const list=leads||[];if(tab==='tutti')return [...list];if(tab==='aperti'||!tab)return list.filter(l=>OPEN.includes(statusOf(l)));return list.filter(l=>statusOf(l)===tab)}
// Newest first (created_at), then title: the order a sales rep works a queue.
const sort=list=>[...list].sort((a,b)=>str(b.created_at).localeCompare(str(a.created_at))||str(a.title).localeCompare(str(b.title),'it'));
// Where the lead stands on the path (index), -1 for «Non qualificato».
const step=l=>PATH.indexOf(statusOf(l));

// Status change: {id,version,status[,status_reason]}. «Non qualificato» needs a reason, the others clear it.
function statusPayload(lead,status,reason){
 if(!EDITABLE.some(([k])=>k===status))return {error:'Stato non valido.'};
 if(statusOf(lead)==='convertito')return {error:'Il lead è già convertito.'};
 if(status===statusOf(lead)&&status!=='non_qualificato')return {error:'Il lead è già in questo stato.'};
 const r=str(reason);
 if(status==='non_qualificato'&&!r)return {error:'Scrivi perché il lead non è qualificato.'};
 if(r.length>500)return {error:'Motivo troppo lungo: massimo 500 caratteri.'};
 return {data:{id:lead.id,version:lead.version,status,status_reason:status==='non_qualificato'?r:null}};
}

// Opportunity pipelines with their stages in order (processes of kind «opportunity»).
function pipelines(processes,stages){
 return (processes||[]).filter(p=>p.kind==='opportunity').map(p=>({id:p.id,title:str(p.title)||'Pipeline',stages:(stages||[]).filter(s=>s.process_id===p.id).sort((a,b)=>a.position-b.position).map(s=>({id:s.id,title:str(s.title)||'Fase'}))})).filter(p=>p.stages.length);
}
// Defaults of the «Converti» form: the lead title, the first pipeline and its first stage, no amount.
function convertDefaults(lead,pipes){const p=(pipes||[])[0];return {title:str(lead?.title).slice(0,200),process_id:p?.id||'',stage_id:p?.stages[0]?.id||'',amount:'',expected_close:'',owner_id:lead?.owner_id??''}}
// «12.500», «12500,50», «€ 1.200», and in English «12,500.00», «£1,200» → cents; '' → 0. The last separator
// followed by one or two digits is the decimal mark, the others group thousands (same rule as the CRM editor).
function cents(v){
 const s=str(v).replace(/[€£\s ']/g,'').replace(/^(EUR|GBP)/i,'');if(!s)return 0;if(!/^\d[\d.,]*$/.test(s)||/[.,]$/.test(s))return null;
 const m=/^(.*?)[.,](\d{1,2})$/.exec(s),int=m?m[1]:s,dec=m?m[2]:'';if(int&&!/^\d{1,3}([.,]?\d{3})*$/.test(int))return null;
 const n=Number(int.replace(/[.,]/g,'')||'0')*100+Number((dec+'00').slice(0,2));return Number.isSafeInteger(n)&&n>=0&&n<=9000000000000?n:null;
}
const realDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
// form: {create,title,process_id,stage_id,amount,expected_close,owner_id}; key: idempotency uuid kept until success.
function convertPayload(lead,form,key,pipes){
 if(!lead?.id||!Number.isInteger(lead.version))return {error:'Lead non valido: premi Aggiorna.'};
 if(statusOf(lead)==='convertito')return {error:'Il lead è già convertito.'};
 if(!key)return {error:'Chiave di conversione mancante.'};
 const base={id:lead.id,version:lead.version,key};
 if(!form?.create)return {data:{...base,opportunity:null}};
 const title=str(form.title);if(!title)return {error:'Dai un nome alla trattativa.'};if(title.length>200)return {error:'Nome della trattativa troppo lungo: massimo 200 caratteri.'};
 const p=(pipes||[]).find(x=>x.id===form.process_id);if(!p)return {error:'Scegli la pipeline.'};
 if(!p.stages.some(s=>s.id===form.stage_id))return {error:'Scegli una fase di questa pipeline.'};
 const amount=cents(form.amount);if(amount===null)return {error:'Importo non valido: scrivi per esempio 12.500 o 12500,50.'};
 const o={title,process_id:p.id,stage_id:form.stage_id,amount_cents:amount};
 const close=str(form.expected_close);if(close){if(!realDate(close))return {error:'Data di chiusura non valida.'};o.expected_close=close}
 const owner=str(form.owner_id);if(owner){const n=Number(owner);if(!/^\d+$/.test(owner)||n<1||n>2147483647)return {error:'Responsabile non valido.'};o.owner_id=n}
 return {data:{...base,opportunity:o}};
}
// One line that says what «Converti» will do, with the names the user knows.
function convertSummary(lead,names,form,pipes){
 const who=[names?.contact,names?.company].filter(Boolean).join(' · ');
 if(!form?.create)return 'Il lead «'+str(lead?.title)+'» diventa Convertito senza creare una trattativa'+(who?'. Resta collegato a '+who:'')+'.';
 const p=(pipes||[]).find(x=>x.id===form.process_id),s=p?.stages.find(x=>x.id===form.stage_id);
 return 'Nasce la trattativa «'+str(form.title)+'»'+(p&&s?' in '+p.title+' › '+s.title:'')+(who?', collegata a '+who:', senza azienda né contatto')+'. Il lead diventa Convertito.';
}

const api={STATUSES,LABEL,PATH,EDITABLE,OPEN,TABS,statusOf,supported,counts,filter,sort,step,statusPayload,pipelines,convertDefaults,cents,convertPayload,convertSummary};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmLeadsCore=api;
})(typeof window==='object'?window:globalThis);
