'use strict';
/* Bulk «Porta nel CRM»: turn imported leads (CSV/XLSX prospects and individual contacts from the LinkedIn
   local agent backup) into CRM payloads, dedupe them against existing CRM rows and inside the list, and run the
   plan through the existing /api/sales create command. Pure logic: the page supplies the CRM rows and the API.
   Dedupe order: normalized email, then LinkedIn profile, then person name within the same company
   (company matched by domain, then by name without legal suffixes such as S.p.A. or S.r.l.). */
(function(root){
const fields=()=>root.RadixCrmFields||(typeof require==='function'?require('./crm-fields-core.js'):null);
const str=v=>String(v??'').normalize('NFKC').trim();
// Accents removed, letters and digits of any script kept, everything else collapsed to one space.
const norm=s=>str(s).normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const LEGAL=new Set(['spa','srl','srls','sas','snc','sapa','sa','sb','societa','benefit','ltd','limited','inc','llc','gmbh','ag','bv','sarl','plc','corp','co']);
function companyKey(s){const t=norm(str(s).replace(/\./g,'')).split(' ').filter(Boolean);while(t.length>1&&LEGAL.has(t[t.length-1]))t.pop();return t.join(' ')}
const personKey=s=>norm(s).split(' ').filter(Boolean).sort().join(' ');
const email=s=>{const v=str(s).toLowerCase();return v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)?v:''};
function domain(s){const v=str(s).toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split(/[/?#:]/,1)[0];return v.length<=253&&/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(v)?v:''}
const FREE=new Set(['gmail.com','googlemail.com','libero.it','hotmail.com','hotmail.it','outlook.com','outlook.it','live.com','live.it','yahoo.com','yahoo.it','icloud.com','me.com','virgilio.it','tiscali.it','alice.it','tin.it','fastwebnet.it','aol.com','gmx.com','gmx.net','proton.me','protonmail.com','email.it','pec.it','legalmail.it']);
const emailDomain=e=>{const d=e?e.split('@')[1]:'';return d&&!FREE.has(d)?domain(d):''};
const https=(s,max)=>{const v=str(s);return v.length<=max&&/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(v)?v:''};
const linkedin=s=>{const v=https(s,300);return v&&/^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|sales\/lead|sales\/people)\//i.test(v)?v:''};
const linkKey=s=>str(s).toLowerCase().replace(/^https?:\/\/(?:[a-z]{2,3}\.)?/,'').split(/[?#]/)[0].replace(/\/+$/,'');
function sourceLabel(...urls){const u=urls.map(x=>str(x).toLowerCase()).join(' ');if(/linkedin\.com\/sales\//.test(u))return 'LinkedIn Sales Navigator';if(/linkedin\.com\//.test(u))return 'LinkedIn';return ''}

// Individual contact (lib/lead-contact-batches.js record: local agent backup, provider JSON).
function fromContact(r,i){
 const e=email(r?.email),name=str(r?.fullName)||[str(r?.firstName),str(r?.lastName)].filter(Boolean).join(' ');
 return {id:'c'+i,origin:'contatti',name,email:e,rawEmail:str(r?.email),phone:str(r?.phone),role:str(r?.jobTitle),linkedin:linkedin(r?.profileUrl),
  company:str(r?.companyName),domain:domain(r?.companyDomain)||emailDomain(e),industry:str(r?.industry),country:str(r?.country),location:str(r?.location),
  size:str(r?.companySize),source:str(r?.sourceUrl)||str(r?.profileUrl),sourceLabel:sourceLabel(r?.sourceUrl,r?.profileUrl)||'Contatti importati',verified:false};
}
// Company-level prospect from the CSV/XLSX list; approval = the human review of section 04 (name + checked email).
function fromProspect(p,i,approval){
 const name=str(approval?.contact)||str(p?.contactName)||[str(p?.firstName),str(p?.lastName)].filter(Boolean).join(' ');
 const e=email(approval?.email)||email(p?.email);
 return {id:'p'+i,origin:'lista',index:i,name,email:e,rawEmail:str(approval?.email||p?.email),phone:str(p?.phone),role:str(p?.contactRole),linkedin:linkedin(p?.profileUrl)||linkedin(p?.source),
  company:str(p?.name),domain:domain(p?.domain)||emailDomain(e),industry:str(p?.industry),country:str(p?.country),location:'',size:str(p?.companySize),
  source:str(p?.source),sourceLabel:sourceLabel(p?.source,p?.profileUrl)||'Lista importata',verified:Boolean(approval&&e&&email(approval.email)===e)};
}
// Stable identity of a lead across list refreshes (segments, «creato ora» marks).
const leadKey=l=>l.email?'e:'+l.email:l.linkedin?'l:'+linkKey(l.linkedin):'n:'+personKey(l.name)+'|'+(l.domain||companyKey(l.company));

function companyPayload(l){
 const notes=[l.country&&'Paese: '+l.country,l.size&&'Dimensione: '+l.size,l.location&&'Sede: '+l.location,l.source&&'Fonte: '+l.source].filter(Boolean).join('\n');
 const d={name:(l.company||l.domain).slice(0,200)};if(l.domain)d.website='https://'+l.domain;if(l.industry){const F=fields();d.industry=F?(F.classify('companies','industry',l.industry)||'Altro'):l.industry.slice(0,120)}if(notes)d.notes='Importata da Lead Intelligence\n'+notes.slice(0,3900);
 return d;
}
function contactPayload(l,segment){
 const notes=[l.source&&'Fonte: '+l.source,l.location&&'Sede: '+l.location,segment&&'Segmento: '+segment,l.rawEmail&&!l.email&&'Email non valida nel file: '+l.rawEmail].filter(Boolean).join('\n');
 const d={name:l.name.slice(0,200)};if(l.email)d.email=l.email;const ph=l.phone.replace(/[\u0000-\u001f\u007f]/g,'');if(ph&&ph.length<=40)d.phone=ph;
 if(l.role){const F=fields(),v=F&&F.classify('contacts','role',l.role);if(!F)d.role=l.role.slice(0,120);else{d.title=l.role.slice(0,120);if(v)d.role=v}}if(l.linkedin)d.linkedin_url=l.linkedin;if(notes)d.notes=('Importato da Lead Intelligence\n'+notes).slice(0,4000);
 return d;
}
const dealTitle=l=>(l.name&&(l.company||l.domain)?l.name+' · '+(l.company||l.domain):l.name||l.company||l.domain).slice(0,200);

// crm: {companies,contacts,leads,opportunities} as returned by GET /api/sales.
function indexCrm(crm){
 const ix={byDomain:new Map(),byCompany:new Map(),byEmail:new Map(),byLink:new Map(),byPerson:new Map(),dealContacts:new Set(),dealCompanies:new Set()};
 const put=(m,k,v)=>{if(k&&!m.has(k))m.set(k,v)};
 for(const c of crm?.companies||[]){put(ix.byDomain,domain(c.website),c);put(ix.byCompany,companyKey(c.name),c)}
 for(const c of crm?.contacts||[]){put(ix.byEmail,email(c.email),c);if(c.linkedin_url)put(ix.byLink,linkKey(c.linkedin_url),c);if(c.company_id)put(ix.byPerson,personKey(c.name)+'|'+c.company_id,c)}
 for(const d of [...(crm?.leads||[]),...(crm?.opportunities||[])]){if(d.contact_id)ix.dealContacts.add(d.contact_id);else if(d.company_id)ix.dealCompanies.add(d.company_id)}
 return ix;
}
const findCompany=(l,ix)=>(l.domain&&ix.byDomain.get(l.domain))||(l.company&&ix.byCompany.get(companyKey(l.company)))||null;
function findContact(l,ix){
 const hit=(l.email&&ix.byEmail.get(l.email))||(l.linkedin&&ix.byLink.get(linkKey(l.linkedin)));if(hit)return hit;
 const co=findCompany(l,ix);return l.name&&co?ix.byPerson.get(personKey(l.name)+'|'+co.id)||null:null;
}
// Table status: already in CRM = the person exists (or, for a company-only prospect, the company exists).
const inCrm=(l,ix)=>Boolean(l.name?findContact(l,ix):findCompany(l,ix));

// target: {entity:'opportunities',process_id,stage_id} or {entity:'leads'}; segments: Map leadKey→name.
function plan(leads,ix,target,segments){
 if(!target||!['opportunities','leads'].includes(target.entity)||(target.entity==='opportunities'&&!(target.process_id&&target.stage_id)))throw Error('Scegli dove creare le opportunità');
 const items=[],companies=new Map(),fresh=new Map(),seen=new Set();let refs=0;
 for(const l of leads){
  const item={lead:l,state:'todo',reason:'',company:null,contact:null,deal:null};items.push(item);
  if(!l.name&&!l.company&&!l.domain){item.state='skip';item.reason='Mancano nome e azienda';continue}
  const keys=[l.email&&'e:'+l.email,l.linkedin&&'l:'+linkKey(l.linkedin),l.name&&(l.domain||l.company)&&'n:'+personKey(l.name)+'|'+(l.domain||companyKey(l.company)),!l.name&&'c:'+(l.domain||companyKey(l.company))].filter(Boolean);
  if(keys.some(k=>seen.has(k))){item.state='skip';item.reason='Doppione nella lista';continue}
  keys.forEach(k=>seen.add(k));
  const found=l.name?(l.email&&ix.byEmail.get(l.email))||(l.linkedin&&ix.byLink.get(linkKey(l.linkedin)))||null:null;
  if(found){item.contact={id:found.id,existing:true};if(found.company_id)item.company={id:found.company_id,existing:true}}
  if(!item.company){
   const co=findCompany(l,ix);
   if(co)item.company={id:co.id,existing:true};
   else if(l.company||l.domain){
    const ks=[l.domain&&'d:'+l.domain,l.company&&'n:'+companyKey(l.company)].filter(Boolean),ref=ks.map(k=>fresh.get(k)).find(Boolean)||'co'+(++refs);
    ks.forEach(k=>fresh.has(k)||fresh.set(k,ref));
    if(!companies.has(ref))companies.set(ref,{data:companyPayload(l),id:null});
    item.company={ref};
   }
  }
  if(!item.contact&&l.name){
   const same=item.company?.id&&ix.byPerson.get(personKey(l.name)+'|'+item.company.id);
   item.contact=same?{id:same.id,existing:true}:{create:contactPayload(l,segments?.get(leadKey(l)))};
  }
  const exists=item.contact?.id?ix.dealContacts.has(item.contact.id):!l.name&&item.company?.id&&ix.dealCompanies.has(item.company.id);
  item.deal=exists?{existing:true}:{create:{entity:target.entity,data:{title:dealTitle(l),...(target.entity==='opportunities'?{process_id:target.process_id,stage_id:target.stage_id}:l.sourceLabel?{source:l.sourceLabel.slice(0,80)}:{})}}};
  if(!item.company?.ref&&!item.contact?.create&&exists){item.state='exists';item.reason='Già nel CRM'}
 }
 return {items,companies,target};
}
function preview(p){
 const todo=p.items.filter(x=>x.state==='todo'),used=new Set(todo.map(x=>x.company?.ref).filter(Boolean));
 return {leads:todo.length,companies:used.size,contacts:todo.filter(x=>x.contact?.create).length,deals:todo.filter(x=>x.deal?.create).length,
  existing:p.items.filter(x=>x.state==='exists').length,skipped:p.items.filter(x=>x.state==='skip').length};
}
// api.create(entity,data) → id. Runs in batches; stops at the first error (the item stays 'error' and can be resumed:
// the page re-reads the CRM and plans the remaining leads again, so a create that did land is not repeated).
async function run(p,api,{batch=10,onProgress,shouldStop}={}){
 const todo=p.items.filter(x=>x.state==='todo'||x.state==='error');let n=0;
 for(const item of todo){
  try{
   let companyId=item.company?.id||null;
   if(item.company?.ref){const c=p.companies.get(item.company.ref);if(!c.id){c.id=await api.create('companies',c.data);c.created=true}companyId=c.id}
   let contactId=item.contact?.id||null;
   if(item.contact?.create){if(!item.contact.newId)item.contact.newId=await api.create('contacts',{...item.contact.create,...(companyId?{company_id:companyId}:{})});contactId=item.contact.newId}
   if(item.deal?.create&&!item.deal.newId)item.deal.newId=await api.create(item.deal.create.entity,{...item.deal.create.data,...(companyId?{company_id:companyId}:{}),...(contactId?{contact_id:contactId}:{})});
   item.state='done';item.error='';
  }catch(e){item.state='error';item.error=str(e?.message)||'Errore del server';onProgress?.(progress(p));return {stopped:'error',error:item.error,lead:item.lead}}
  if(++n%batch===0||n===todo.length){onProgress?.(progress(p));if(n<todo.length&&shouldStop?.())return {stopped:'user'}}
 }
 return {stopped:null};
}
function progress(p){const all=p.items.filter(x=>!['skip','exists'].includes(x.state));return {done:all.filter(x=>x.state==='done').length,total:all.length}}
function summary(p){
 return {companies:[...p.companies.values()].filter(c=>c.created).length,contacts:p.items.filter(x=>x.contact?.newId).length,deals:p.items.filter(x=>x.deal?.newId).length,
  done:p.items.filter(x=>x.state==='done').length,existing:p.items.filter(x=>x.state==='exists').length,
  skipped:p.items.filter(x=>x.state==='skip').map(x=>({name:x.lead.name||x.lead.company||x.lead.domain||'Riga senza nome',reason:x.reason})),
  failed:p.items.filter(x=>x.state==='error').map(x=>({name:x.lead.name||x.lead.company,reason:x.error})),
  pending:p.items.filter(x=>x.state==='todo').length};
}
// First stage (lowest position) of every opportunity pipeline.
function pipelines(processes,stages){
 return (processes||[]).filter(p=>p.kind==='opportunity').map(p=>{const s=(stages||[]).filter(x=>x.process_id===p.id).sort((a,b)=>a.position-b.position)[0];return s?{process_id:p.id,stage_id:s.id,title:p.title,stage:s.title}:null}).filter(Boolean);
}
function toCsv(rows){
 const cell=v=>{let s=String(v??'').replace(/[\r\n\t]+/g,' ').slice(0,1000);if(/^\s*[=+\-@﻿]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
 const head=['nome','email','telefono','ruolo','azienda','dominio','linkedin','fonte','stato','segmento'];
 return '﻿'+[head,...rows.map(r=>[r.name,r.email,r.phone,r.role,r.company,r.domain,r.linkedin,r.sourceLabel,r.status,r.segment])].map(x=>x.map(cell).join(';')).join('\r\n')+'\r\n';
}
const api={norm,companyKey,personKey,email,domain,fromContact,fromProspect,leadKey,companyPayload,contactPayload,indexCrm,findContact,inCrm,plan,preview,run,progress,summary,pipelines,toCsv};
if(typeof module!=='undefined'&&module.exports)module.exports=api;root.RadixLeadBulkCrm=api;
})(typeof window!=='undefined'?window:globalThis);
