'use strict';
/* Quick creation in the CRM (Pipeline «+ Nuova opportunità», «+ Nuova azienda» / «+ Nuovo contatto» in the editor).
   Pure rules, no DOM: a typed name matches an existing record (case, accents and spaces ignored) or becomes a new one;
   the opportunity keeps its contact and company coherent, as the database requires
   (sales_opportunity_contact_company: the company is the contact's own, or empty). */
(function(root){
const norm=v=>String(v??'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('it').replace(/\s+/g,' ').trim();
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
function findByName(rows,name,pick){const n=norm(name);if(!n)return null;const all=(rows||[]).filter(r=>r&&norm(r.name)===n);return (pick&&all.find(pick))||all[0]||null}
// «24.000», «24.000,50», «€ 1.000» → cents (as Importo in the CRM editor); empty = 0.
function amountCents(v){const s=String(v??'').replace(/[€£\s ']/g,'').replace(/^(EUR|GBP)/i,'');if(!s)return 0;if(!/^\d[\d.,]*$/.test(s)||/[.,]$/.test(s))return NaN;
 const m=/^(.*?)[.,](\d{1,2})$/.exec(s),int=m?m[1]:s,dec=m?m[2]:'';if(int&&!/^\d{1,3}([.,]?\d{3})*$/.test(int))return NaN;
 const c=Number(int.replace(/[.,]/g,'')||'0')*100+Number((dec+'00').slice(0,2));return Number.isSafeInteger(c)?c:NaN}
function validDay(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v}
/* input {title, company, contact, amount, expected_close, stage_id}; data {companies, contacts, stages}.
   → {error} or {company:{id}|{create:{name}}|null, contact:{id}|{create:{name}}|null, opportunity:{…without company/contact ids}}. */
function plan(input,data){
 const i=input||{},d=data||{},title=clean(i.title),companyName=clean(i.company),contactName=clean(i.contact);
 if(!title)return {error:'Scrivi il nome dell’opportunità.'};if(title.length>200)return {error:'Il nome dell’opportunità supera 200 caratteri.'};
 if(companyName.length>200||contactName.length>200)return {error:'Il nome dell’azienda o del contatto supera 200 caratteri.'};
 const stage=(d.stages||[]).find(s=>s&&s.id===i.stage_id);if(!stage||!stage.process_id)return {error:'Scegli la fase.'};
 const cents=amountCents(i.amount);if(!Number.isSafeInteger(cents)||cents<0)return {error:'Importo non valido: scrivi ad esempio 24.000 oppure 24.000,50.'};
 const close=clean(i.expected_close);if(close&&!validDay(close))return {error:'Data di chiusura non valida.'};
 let company=companyName?findByName(d.companies,companyName):null;
 // The same contact name under the chosen company wins over a namesake elsewhere.
 let contact=contactName?findByName(d.contacts,contactName,c=>company&&c.company_id===company.id):null;
 if(contact&&contact.company_id){
  const own=(d.companies||[]).find(c=>c&&c.id===contact.company_id);
  if(!companyName)company=own||{id:contact.company_id};
  else if(!company||company.id!==contact.company_id)return {error:'«'+clean(contact.name)+'» è già un contatto di «'+clean(own?.name||'un’altra azienda')+'». Lascia vuota l’azienda, scrivi quella giusta o usa un nome di contatto diverso.'};
 }
 if(contact&&!contact.company_id&&companyName)return {error:'«'+clean(contact.name)+'» è nel CRM senza azienda: lascia vuota l’azienda oppure collegalo prima dalla sua scheda.'};
 const opportunity={title,process_id:stage.process_id,stage_id:stage.id,amount_cents:cents};if(close)opportunity.expected_close=close;
 return {company:company?{id:company.id}:companyName?{create:{name:companyName}}:null,
  contact:contact?{id:contact.id}:contactName?{create:{name:contactName}}:null,opportunity};
}
// One line under a typed name: what saving will do with it.
function hint(kind,name,rows){const n=clean(name);if(!n)return '';const hit=findByName(rows,n);
 return hit?(kind==='companies'?'Azienda già nel CRM: la collego.':'Contatto già nel CRM: lo collego.'):(kind==='companies'?'Nuova azienda: la creo al salvataggio.':'Nuovo contatto: lo creo al salvataggio.')}
const api={norm,findByName,amountCents,plan,hint};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmQuick=api;
})(typeof globalThis!=='undefined'?globalThis:this);
