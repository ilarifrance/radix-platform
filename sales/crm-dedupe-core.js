'use strict';
/* Duplicate contacts: find likely duplicates and plan a merge. Nothing is written here: the page shows the plan,
   a person confirms, and the CRM API applies it one record at a time.
   Groups: same email, same phone, or same name in the same company.
   A merge keeps one contact, fills its empty fields from the other, moves the other's tasks, interactions,
   tickets, leads and deals to it, then deletes the other. Marketing consent is never copied: it belongs to a
   person's own choice and is registered by hand. The database forbids moving a deal that already has activities
   to a different contact, and contacts of different companies, so those merges are refused with the reason. */
(function(root){
// Names: accents removed, letters and digits of any script kept, everything else collapsed to one space.
const norm=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const email=s=>String(s||'').trim().toLowerCase();
// Phones: digits only; with an international prefix (+ or 00) the Italian 39 is dropped, so +39 333… matches 333….
const phone=s=>{const raw=String(s||'').trim();let d=raw.replace(/\D/g,'');if(/^(\+|00)/.test(raw)){d=d.replace(/^00/,'');if(d.startsWith('39'))d=d.slice(2)}return d.length>=8?d:''};
const FILL=['email','phone','role','linkedin_url'],NOTES_MAX=4000;

// contacts: [{id,name,email,phone,company}] (company may be a name or an id; it only has to match within the list)
function groups(contacts){
 const list=(contacts||[]).filter(c=>c&&c.id),parent=new Map(list.map(c=>[c.id,c.id])),why=new Map();
 const find=x=>{while(parent.get(x)!==x){parent.set(x,parent.get(parent.get(x)));x=parent.get(x)}return x};
 const join=(a,b,reason)=>{const ra=find(a),rb=find(b);if(ra!==rb)parent.set(rb,ra);for(const id of [a,b]){if(!why.has(id))why.set(id,new Set());why.get(id).add(reason)}};
 for(const [reason,key] of [['email',c=>email(c.email)],['telefono',c=>phone(c.phone)],['nome e azienda',c=>{const n=norm(c.name);return n&&n!=='contatto anonimizzato'?n+'|'+norm(c.company):''}]]){
  const seen=new Map();for(const c of list){const k=key(c);if(!k)continue;if(seen.has(k))join(seen.get(k),c.id,reason);else seen.set(k,c.id)}}
 const out=new Map();for(const c of list){if(!why.has(c.id))continue;const r=find(c.id);if(!out.has(r))out.set(r,{contacts:[],reasons:new Set()});const g=out.get(r);g.contacts.push(c);why.get(c.id).forEach(x=>g.reasons.add(x))}
 return [...out.values()].filter(g=>g.contacts.length>1).map(g=>({contacts:g.contacts,reasons:[...g.reasons]})).sort((a,b)=>b.contacts.length-a.contacts.length||String(a.contacts[0].name).localeCompare(String(b.contacts[0].name),'it'));
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
const api={groups,mergePlan,norm,email,phone};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmDedupe=api;
})(typeof globalThis!=='undefined'?globalThis:this);
