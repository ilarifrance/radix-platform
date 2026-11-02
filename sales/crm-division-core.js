'use strict';
/* «Dipartimento» filter of the whole CRM page (header select, sales/crm-division.js): aziende and
   contatti carry their own `division`; opportunità, lead, attività, interazioni and ticket follow the
   division of their company (company_id), else of their contact (contact_id). '' = everything,
   NONE = records without a department (or without any link). Pure logic, no DOM: the shared loader
   (crm-data.js) and the lists of sales.js apply it, crm-division.js draws the select. */
(function(root){
const list=v=>Array.isArray(v)?v:[];
const text=v=>v==null?'':String(v).trim();
const fold=v=>text(v).normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('it');
const NONE='__none__';
const collator=typeof Intl!=='undefined'?new Intl.Collator('it',{sensitivity:'base',numeric:true}):null;
const cmpText=(a,b)=>collator?collator.compare(a,b):a<b?-1:a>b?1:0;
// Entities that carry a division of their own, and those that follow a company or a contact.
const OWN=['companies','contacts'],LINKED=['opportunities','leads','tasks','interactions','tickets'];
/* The departments used in aziende and contatti, each with how many records (both entities together), in Italian order. */
function options(companies,contacts){const m=new Map();for(const r of [...list(companies),...list(contacts)]){const v=text(r&&r.division);if(!v)continue;const k=fold(v);const e=m.get(k)||{value:v,count:0};e.count++;m.set(k,e)}return [...m.values()].sort((a,b)=>cmpText(a.value,b.value))}
/* True when some azienda or contatto has no department: «Senza dipartimento» is then offered. */
function hasNone(companies,contacts){return [...list(companies),...list(contacts)].some(r=>!text(r&&r.division))}
/* Lookup for the linked entities: company id → division, contact id → division. */
function index(companies,contacts){const by=rows=>new Map(list(rows).filter(r=>r&&r.id!=null).map(r=>[r.id,text(r.division)]));return {companies:by(companies),contacts:by(contacts)}}
/* The division a row answers to: its own, or the first one found through company_id then contact_id ('' when none). */
function divisionOf(row,kind,idx){if(!row)return '';if(OWN.includes(kind))return text(row.division);const i=idx||{companies:new Map(),contacts:new Map()};
 const co=row.company_id!=null&&i.companies.has(row.company_id)?i.companies.get(row.company_id):'';if(co)return co;
 const ct=row.contact_id!=null&&i.contacts.has(row.contact_id)?i.contacts.get(row.contact_id):'';return ct||''}
function belongs(row,kind,idx,division){if(!division)return true;const d=divisionOf(row,kind,idx);return division===NONE?!d:fold(d)===fold(division)}
/* rows of one entity, kept when they belong; `data` gives the companies and contacts the index is built from. */
function filterRows(kind,rows,data,division){if(!division||!(OWN.includes(kind)||LINKED.includes(kind)))return list(rows);const d=data||{};const idx=index(d.companies,d.contacts);return list(rows).filter(r=>belongs(r,kind,idx,division))}
/* The crm-data.js dataset with every entity filtered (stages, members, processes untouched); `counts` (server totals of the
   whole workspace) becomes null since it no longer matches; `partial` stays. The same object comes back with ''. */
function filterData(data,division){if(!division||!data)return data;const idx=index(data.companies,data.contacts);const out={...data};
 for(const k of [...OWN,...LINKED])if(Array.isArray(data[k])){const rows=data[k].filter(r=>belongs(r,k,idx,division));if(data[k].capped!==undefined)rows.capped=data[k].capped;out[k]=rows}
 if('counts' in data)out.counts=null;return out}
/* The selection is remembered per workspace. */
const key=workspace=>'radix.division.'+String(workspace||'');
const api={NONE,OWN,LINKED,options,hasNone,index,divisionOf,belongs,filterRows,filterData,key,fold};
if(typeof module!=='undefined')module.exports=api;else root.RadixCrmDivisionCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
