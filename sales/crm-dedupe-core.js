'use strict';
/* Duplicate contacts and companies: find likely duplicates and plan a merge. Nothing is written here: the page
   shows the plan, a person confirms, and the CRM API applies it one record at a time.
   Contacts: same email, same phone, or same name in the same company.
   A merge keeps one contact, fills its empty fields from the other, moves the other's tasks, interactions,
   tickets, leads and deals to it, then deletes the other. Marketing consent is never copied: it belongs to a
   person's own choice and is registered by hand. The database forbids moving a deal that already has activities
   to a different contact, and contacts of different companies, so those merges are refused with the reason.
   Companies: same Partita IVA, same web domain (site or email, not generic hosts), or same name without the
   legal form. A merge keeps one company, fills its empty fields, moves the other's contacts, deals, tasks,
   interactions, tickets, leads and subsidiaries to it, then deletes the other. The database ties every record
   of a contact to the contact's company and forbids moving a contact that already has records, or a deal that
   has activities: those merges are refused with the reason. */
(function(root){
// Names: accents removed, letters and digits of any script kept, everything else collapsed to one space.
const norm=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const email=s=>String(s||'').trim().toLowerCase();
// Phones: digits only; with an international prefix (+ or 00) the Italian 39 is dropped, so +39 333… matches 333….
const phone=s=>{const raw=String(s||'').trim();let d=raw.replace(/\D/g,'');if(/^(\+|00)/.test(raw)){d=d.replace(/^00/,'');if(d.startsWith('39'))d=d.slice(2)}return d.length>=8?d:''};
// The fields added by migration sales 011 are filled the same way when the archive has them (not
// first and last name: the kept contact keeps its own name).
const FILL=['email','phone','role','linkedin_url','title','department','mobile','street','zip','city','province','country','birthdate','lead_source','preferred_language'],NOTES_MAX=4000;

// Union of every pair of rows sharing a key; keys: [[reason,row=>key or '']]. Groups of 2+ with their reasons.
function cluster(list,keys){
 const parent=new Map(list.map(c=>[c.id,c.id])),why=new Map();
 const find=x=>{while(parent.get(x)!==x){parent.set(x,parent.get(parent.get(x)));x=parent.get(x)}return x};
 const join=(a,b,reason)=>{const ra=find(a),rb=find(b);if(ra!==rb)parent.set(rb,ra);for(const id of [a,b]){if(!why.has(id))why.set(id,new Set());why.get(id).add(reason)}};
 for(const [reason,key] of keys){const seen=new Map();for(const c of list){const k=key(c);if(!k)continue;if(seen.has(k))join(seen.get(k),c.id,reason);else seen.set(k,c.id)}}
 const out=new Map();for(const c of list){if(!why.has(c.id))continue;const r=find(c.id);if(!out.has(r))out.set(r,{rows:[],reasons:new Set()});const g=out.get(r);g.rows.push(c);why.get(c.id).forEach(x=>g.reasons.add(x))}
 return [...out.values()].filter(g=>g.rows.length>1).map(g=>({rows:g.rows,reasons:[...g.reasons]})).sort((a,b)=>b.rows.length-a.rows.length||String(a.rows[0].name).localeCompare(String(b.rows[0].name),'it'));
}
// contacts: [{id,name,email,phone,company}] (company may be a name or an id; it only has to match within the list)
function groups(contacts){
 return cluster((contacts||[]).filter(c=>c&&c.id),[['email',c=>email(c.email)],['telefono',c=>phone(c.phone)],['nome e azienda',c=>{const n=norm(c.name);return n&&n!=='contatto anonimizzato'?n+'|'+norm(c.company):''}]])
  .map(g=>({contacts:g.rows,reasons:g.reasons}));
}

// keep, drop: full contact records (id, version, company_id, fields). related: rows [{entity,record}] linked to drop
// (customer360 plus its leads).
function mergePlan(keep,drop,related){
 if(!keep||!drop||keep.id===drop.id)return {blocked:'Scegli due contatti diversi.'};
 if((keep.company_id||null)!==(drop.company_id||null))return {blocked:'I due contatti sono in aziende diverse: sposta prima uno dei due nella stessa azienda.'};
 const rows=(related||[]).filter(r=>r&&r.record),of=e=>rows.filter(r=>r.entity===e).map(r=>r.record).filter(x=>x.contact_id===drop.id);
 const opps=of('opportunities'),busy=opps.filter(o=>rows.some(r=>['tasks','interactions'].includes(r.entity)&&r.record.opportunity_id===o.id));
 if(busy.length)return {blocked:'la trattativa «'+busy[0].title+'» ha già attività collegate e non può cambiare contatto. Prova a unire nell’altro verso, tenendo «'+drop.name+'».'};
 const fill={};for(const k of FILL)if(!keep[k]&&drop[k])fill[k]=drop[k];
 if(drop.notes){const add='Unito da «'+drop.name+'»: '+drop.notes;
  if(!String(keep.notes||'').includes(add)){const next=keep.notes?keep.notes+'\n\n'+add:add;
   if(next.length>NOTES_MAX)return {blocked:'le note dei due contatti insieme superano '+NOTES_MAX+' caratteri: accorciale prima di unire, così non si perde nulla.'};fill.notes=next}}
 const moves=['opportunities','leads','tasks','interactions','tickets'].flatMap(e=>of(e).map(record=>({entity:e,record})));
 return {blocked:null,fill,moves,consentLost:!!drop.marketing_consent&&!keep.marketing_consent};
}
/* ---------- Companies ---------- */
// Partita IVA: upper case, no spaces, dots or dashes, without the «IT» prefix (IT 0123… and 0123… match).
const vat=s=>{const v=String(s||'').replace(/[\s.\-]/g,'').toUpperCase().replace(/^IT(?=\d)/,'');return v.length>=5?v:''};
// Hosts shared by unrelated companies (mail providers, social networks, directories): never a match.
const GENERIC=['gmail.com','googlemail.com','google.com','yahoo.com','yahoo.it','hotmail.com','hotmail.it','outlook.com','outlook.it','live.com','live.it','msn.com','icloud.com','me.com','libero.it','virgilio.it','alice.it','tim.it','tin.it','tiscali.it','fastwebnet.it','email.it','inwind.it','pec.it','legalmail.it','arubapec.it','linkedin.com','facebook.com','instagram.com','twitter.com','x.com','youtube.com','tiktok.com','wa.me','whatsapp.com','paginegialle.it','business.site','wixsite.com','linktr.ee'];
// Web domain of a site or an email address: lower-case host without protocol, «www.», port and path.
function domain(s){
 let h=String(s||'').trim().toLowerCase();if(!h)return '';
 if(h.includes('@')&&!h.includes('/'))h=h.slice(h.lastIndexOf('@')+1);
 h=h.replace(/^[a-z][a-z0-9+.-]*:\/\//,'').replace(/^[^/@]*@/,'').split(/[/?#]/)[0].replace(/:\d+$/,'').replace(/\.$/,'').replace(/^www\d*\./,'');
 if(!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)||GENERIC.some(g=>h===g||h.endsWith('.'+g)))return '';
 return h;
}
// Company name without the legal form at the end: «ACME S.r.l.», «Acme srl» and «acme» match.
const LEGAL=/(\s(s ?r ?l ?s?|s ?p ?a|s ?n ?c|s ?a ?s|s ?a ?p ?a|s ?c ?a ?r ?l|s ?c ?r ?l|soc coop|coop|societa cooperativa|ltd|limited|gmbh|ag|inc|llc|sa|sl|bv|spa unipersonale|unipersonale))+$/;
const companyName=s=>{const n=norm(s);const t=n.replace(LEGAL,'').trim();return t||n};
// companies: export rows [{id,name,website,email,vat_number}] (vat_number only with migration 011).
function companyGroups(companies){
 return cluster((companies||[]).filter(c=>c&&c.id),[['stessa partita IVA',c=>vat(c.vat_number)],['stesso dominio',c=>domain(c.website)||domain(c.email)],['stesso nome',c=>companyName(c.name)]])
  .map(g=>({companies:g.rows,reasons:g.reasons}));
}
// Fields filled on the kept company when empty there: the original ones and those of migration 011
// (not the name: the kept company keeps its own; parent_company_id is handled apart).
const COMPANY_FILL=['website','industry','email','phone','city','legal_name','account_type','rating','owner_id','annual_revenue_cents','employees','billing_street','billing_zip','billing_city','billing_province','billing_country','shipping_street','shipping_zip','shipping_city','shipping_province','shipping_country','vat_number','tax_code','pec','sdi_code','description'];
// bigint comes back from the database as text; the API wants numbers for these.
const NUMERIC=['owner_id','annual_revenue_cents','employees'];
const empty=v=>v==null||v==='';
const LINKED=[['opportunities','trattative'],['tasks','attività'],['interactions','interazioni'],['tickets','ticket'],['leads','lead']];
// keep, drop: full company records (id, version, fields). related: rows [{entity,record}] of drop (customer360,
// its leads, and companies whose parent is drop).
function companyMergePlan(keep,drop,related){
 if(!keep||!drop||keep.id===drop.id)return {blocked:'Scegli due aziende diverse.'};
 const rows=(related||[]).filter(r=>r&&r.record),of=e=>rows.filter(r=>r.entity===e).map(r=>r.record);
 const contacts=of('contacts').filter(c=>c.company_id===drop.id);
 // A contact with records cannot change company: each record must carry the contact's company.
 for(const c of contacts){const has=LINKED.filter(([e])=>of(e).some(x=>x.contact_id===c.id)).map(([,l])=>l);
  if(has.length)return {blocked:'il contatto «'+c.name+'» ha già '+(has.length>1?has.slice(0,-1).join(', ')+' e '+has.at(-1):has[0])+' collegati e il database non permette di spostarlo in un’altra azienda. Prova a unire nell’altro verso, tenendo «'+drop.name+'».'}}
 const opps=of('opportunities').filter(o=>o.company_id===drop.id);
 const busy=opps.filter(o=>['tasks','interactions'].some(e=>of(e).some(x=>x.opportunity_id===o.id)));
 if(busy.length)return {blocked:'la trattativa «'+busy[0].title+'» ha già attività collegate e non può cambiare azienda. Prova a unire nell’altro verso, tenendo «'+drop.name+'».'};
 const fill={};for(const k of COMPANY_FILL)if(empty(keep[k])&&!empty(drop[k]))fill[k]=NUMERIC.includes(k)?Number(drop[k]):drop[k];
 // The kept company inherits the parent of the other unless that would make it its own parent.
 if(drop.parent_company_id&&drop.parent_company_id!==keep.id&&(empty(keep.parent_company_id)||keep.parent_company_id===drop.id))fill.parent_company_id=drop.parent_company_id;
 if(drop.notes){const add='Unita da «'+drop.name+'»: '+drop.notes;
  if(!String(keep.notes||'').includes(add)){const next=keep.notes?keep.notes+'\n\n'+add:add;
   if(next.length>NOTES_MAX)return {blocked:'le note delle due aziende insieme superano '+NOTES_MAX+' caratteri: accorciale prima di unire, così non si perde nulla.'};fill.notes=next}}
 const set={company_id:keep.id},moves=[...contacts.map(record=>({entity:'contacts',record,set}))];
 for(const e of ['opportunities','leads','tasks','interactions','tickets'])for(const record of of(e))if(record.company_id===drop.id)moves.push({entity:e,record,set});
 for(const record of of('companies'))if(record.parent_company_id===drop.id&&record.id!==keep.id&&record.id!==drop.id)moves.push({entity:'companies',record,set:{parent_company_id:keep.id}});
 return {blocked:null,fill,moves};
}
const api={groups,mergePlan,norm,email,phone,companyGroups,companyMergePlan,vat,domain,companyName};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmDedupe=api;
})(typeof globalThis!=='undefined'?globalThis:this);
