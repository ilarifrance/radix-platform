'use strict';
/* CRM «Modifica in blocco» on the Aziende and Contatti lists (Salesforce mass update): one field, one value,
   applied to the selected records. Pure logic shared by sales/crm-mass-edit.js and the node tests.
   Only picklist-like fields that make sense for many records at once; values are checked with the same
   rules as the edit form (sales/crm-fields-core.js). An empty value clears the field. */
(function(root,factory){
 const F=typeof module==='object'&&module.exports?require('./crm-fields-core.js'):root.RadixCrmFields;
 const api=factory(F);
 if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmMassEditCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(F){
const KEYS=Object.freeze({
 companies:Object.freeze(['division','owner_id','account_type','rating','industry']),
 contacts:Object.freeze(['division','owner_id','role','department','lead_source','preferred_language'])});
const MAX=500;

// The fields offered for a list. `added`: the archive has the columns of migrations 011/014.
function fieldsFor(kind,opts){
 const added=!!(opts&&opts.added);
 return (KEYS[kind]||[]).map(k=>F.fieldOf(kind,k)).filter(fd=>fd&&(added||!fd.added));
}
const norm=v=>v==null||v===''?null:v;
const same=(a,b)=>String(norm(a)??'')===String(norm(b)??'');

/* What would change. rows: the selected records (with id and version). Returns {error} or
   {key,label,value,changes:[{id,version,name,from}],unchanged}. */
function plan(kind,key,raw,rows){
 if(!(KEYS[kind]||[]).includes(key))return {error:'Questo campo non si modifica in blocco.'};
 const fd=F.fieldOf(kind,key);if(!fd)return {error:'Campo sconosciuto.'};
 const list=(Array.isArray(rows)?rows:[]).filter(r=>r&&r.id);
 if(!list.length)return {error:'Nessun record selezionato.'};
 if(list.length>MAX)return {error:'Al massimo '+MAX+' record per volta: restringi la selezione.'};
 // A list value is required here: the «keep the old free text» exception of the form does not apply.
 const p=F.parse(kind,key,raw);if(p.error)return {error:p.error};
 const changes=[];let unchanged=0;
 for(const r of list){if(same(r[key],p.value)){unchanged++;continue}changes.push({id:r.id,version:r.version,name:String(r.name||r.title||r.id),from:norm(r[key])})}
 return {key,label:fd.label,value:p.value,changes,unchanged};
}
// The update sent for one record: only the field, with the record's version for the conflict check.
const payload=(p,c)=>({id:c.id,version:c.version,[p.key]:p.value});
// The confirmation text.
function confirmText(p,kind,shown){
 const n=p.changes.length,what=kind==='companies'?(n===1?'azienda':'aziende'):(n===1?'contatto':'contatti');
 return 'Impostare «'+p.label+'» a «'+(p.value==null?'(vuoto)':(shown||String(p.value)))+'» su '+n+' '+what+'?'+(p.unchanged?' '+(p.unchanged===1?'1 ha già questo valore e resta com’è.':p.unchanged+' hanno già questo valore e restano come sono.'):'');
}
return Object.freeze({KEYS,MAX,fieldsFor,plan,payload,confirmText});
});
