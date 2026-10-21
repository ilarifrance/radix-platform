'use strict';
// Reserved sales_segments rows: CRM settings that ride in ONE row per workspace (no new table), validated by the same
// rule the browser uses, written by owners/admins only (api/_sales.js), hidden from the contact segments list and read
// with ?subject= (api/_sales_store.js). «__regole__» filters={rules:[…]} (sales/crm-rules-core.js);
// «__sla__» filters={sla:{…}} (sales/crm-sla-core.js); «__visibilita__» filters={visibility:{ownOnly}} (sales/crm-visibility-core.js,
// enforced by api/_sales_visibility.js).
const rulesCore=require('../sales/crm-rules-core.js'),slaCore=require('../sales/crm-sla-core.js'),visCore=require('../sales/crm-visibility-core.js');
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const RESERVED=Object.freeze({
 [rulesCore.RESERVED]:Object.freeze({key:'rules',error:v=>{const r=rulesCore.validateSet(v);return r.ok?null:r.error||'formato non previsto.'},invalid:'Regole non valide: ',what:'alle regole di automazione',edit:'le regole di automazione'}),
 [slaCore.RESERVED]:Object.freeze({key:'sla',error:v=>slaCore.error(v),invalid:'Scadenze SLA non valide: ',what:'alle scadenze SLA',edit:'le scadenze SLA'}),
 [visCore.RESERVED]:Object.freeze({key:'visibility',error:v=>visCore.error(v),invalid:'Visibilità non valida: ',what:'alla visibilità dei record',edit:'la visibilità dei record'})});
const NAMES=Object.freeze(Object.keys(RESERVED));
const byName=n=>typeof n==='string'&&Object.hasOwn(RESERVED,n.trim().toLowerCase())?n.trim().toLowerCase():null;
const bySubject=s=>NAMES.find(n=>RESERVED[n].key===s)||null;
const byFilters=v=>plain(v)&&NAMES.find(n=>Object.hasOwn(v,RESERVED[n].key))||null;
// filters → undefined (not settings: plain segment filters), null (valid settings of one reserved row) or the reason.
function filtersError(v){
 const n=byFilters(v);if(!n)return undefined;
 const e=Object.keys(v).length===1?RESERVED[n].error(v[RESERVED[n].key]):'formato non previsto.';
 return e?RESERVED[n].invalid+e:null;
}
const nameTaken=n=>'Il nome «'+n+'» è riservato '+RESERVED[n].what+'.';
module.exports={RESERVED,NAMES,byName,bySubject,byFilters,filtersError,nameTaken};
