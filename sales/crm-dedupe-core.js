'use strict';
/* Duplicate contacts: find likely duplicates and plan a merge. Nothing is written here: the page shows the plan,
   a person confirms, and the CRM API applies it one record at a time.
   Groups: same email, same phone (last 9 digits), or same name in the same company.
   A merge keeps one contact, fills its empty fields from the other, moves the other's tasks, interactions,
   tickets and deals to it, then deletes the other. Marketing consent is never copied: it belongs to a person's
   own choice and is registered by hand. The database forbids moving a deal that already has activities to a
   different contact, and contacts of different companies, so those merges are refused with the reason. */
(function(root){
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('it').replace(/[^a-z0-9@.+]+/g,' ').trim();
const phone=s=>{const d=String(s||'').replace(/\D/g,'');return d.length>=8?d.slice(-9):''};
const FILL=['email','phone','role','linkedin_url'];

// contacts: [{id,name,email,phone,company}] (company may be a name or an id; it only has to match within the list)
function groups(contacts){
 const list=(contacts||[]).filter(c=>c&&c.id),parent=new Map(list.map(c=>[c.id,c.id])),why=new Map();
 const find=x=>{while(parent.get(x)!==x){parent.set(x,parent.get(parent.get(x)));x=parent.get(x)}return x};
 const join=(a,b,reason)=>{const ra=find(a),rb=find(b);if(ra!==rb)parent.set(rb,ra);for(const id of [a,b]){if(!why.has(id))why.set(id,new Set());why.get(id).add(reason)}};
 for(const [reason,key] of [['email',c=>norm(c.email)],['telefono',c=>phone(c.phone)],['nome e azienda',c=>{const n=norm(c.name);return n&&n!=='contatto anonimizzato'?n+'|'+norm(c.company):''}]]){
  const seen=new Map();for(const c of list){const k=key(c);if(!k)continue;if(seen.has(k))join(seen.get(k),c.id,reason);else seen.set(k,c.id)}}
 const out=new Map();for(const c of list){if(!why.has(c.id))continue;const r=find(c.id);if(!out.has(r))out.set(r,{contacts:[],reasons:new Set()});const g=out.get(r);g.contacts.push(c);why.get(c.id).forEach(x=>g.reasons.add(x))}
 return [...out.values()].filter(g=>g.contacts.length>1).map(g=>({contacts:g.contacts,reasons:[...g.reasons]})).sort((a,b)=>b.contacts.length-a.contacts.length||String(a.contacts[0].name).localeCompare(String(b.contacts[0].name),'it'));
}

// keep, drop: full contact records (id, version, company_id, fields). related: customer360 rows [{entity,record}] of drop.
function mergePlan(keep,drop,related){
 if(!keep||!drop||keep.id===drop.id)return {blocked:'Scegli due contatti diversi.'};
 if((keep.company_id||null)!==(drop.company_id||null))return {blocked:'I due contatti sono in aziende diverse: sposta prima uno dei due nella stessa azienda.'};
 const rows=(related||[]).filter(r=>r&&r.record),of=e=>rows.filter(r=>r.entity===e).map(r=>r.record).filter(x=>x.contact_id===drop.id);
 const opps=of('opportunities'),busy=opps.filter(o=>rows.some(r=>['tasks','interactions'].includes(r.entity)&&r.record.opportunity_id===o.id));
 if(busy.length)return {blocked:'La trattativa «'+busy[0].title+'» di «'+drop.name+'» ha già attività collegate e non può cambiare contatto. Unisci nell’altro verso o chiudi prima la trattativa.'};
 const fill={};for(const k of FILL)if(!keep[k]&&drop[k])fill[k]=drop[k];
 if(drop.notes){const add='Unito da «'+drop.name+'»: '+drop.notes,next=keep.notes?keep.notes+'\n\n'+add:add;fill.notes=next.slice(0,4000)}
 const moves=[...opps.map(record=>({entity:'opportunities',record})),...['tasks','interactions','tickets'].flatMap(e=>of(e).map(record=>({entity:e,record})))];
 return {blocked:null,fill,moves,consentLost:!!drop.marketing_consent&&!keep.marketing_consent};
}
const api={groups,mergePlan,norm,phone};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmDedupe=api;
})(typeof globalThis!=='undefined'?globalThis:this);
