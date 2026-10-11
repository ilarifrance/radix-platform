/* RADIX Agency — browser-local client directory domain primitives.
   No network, storage writes or external side effects. Server persistence pending. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixAgencyClients=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const STATUSES=Object.freeze({prospect:'Prospect',active:'Attivo',paused:'In pausa',archived:'Archiviato'});
const MAX_CLIENTS=200;
function ownerKey(userId){const id=String(userId||'').trim().toLowerCase();if(!id||id.length>200)throw Error('Account RADIX non valido');return 'radix-agency-clients:'+encodeURIComponent(id)}
function clean(value,max){return String(value==null?'':value).trim().slice(0,max)}
function normalizeInput(input){if(!input||typeof input!=='object'||Array.isArray(input))throw TypeError('Dati cliente non validi');const name=clean(input.name,120),status=clean(input.status,20)||'prospect';if(name.length<2)throw TypeError('Inserisci un nome cliente di almeno 2 caratteri');if(!Object.prototype.hasOwnProperty.call(STATUSES,status))throw TypeError('Stato cliente non valido');return {name,status,sector:clean(input.sector,100),manager:clean(input.manager,100),goal:clean(input.goal,500),notes:clean(input.notes,800)}}
function readStore(raw,ownerId){if(raw==null)return [];if(!raw||raw.schemaVersion!==1||raw.ownerId!==String(ownerId).trim().toLowerCase()||!Array.isArray(raw.clients))throw Error('Archivio clienti incompatibile o appartenente a un altro account');if(raw.clients.length>MAX_CLIENTS)throw Error('Archivio clienti oltre il limite');const ids=new Set();return raw.clients.map(c=>{if(!c||typeof c.id!=='string'||!/^cl-[a-zA-Z0-9-]{6,80}$/.test(c.id)||ids.has(c.id))throw Error('Identificatore cliente duplicato o non valido');ids.add(c.id);return {id:c.id,...normalizeInput(c),createdAt:clean(c.createdAt,40),updatedAt:clean(c.updatedAt,40)}})}
function filterClients(clients,search,status){const q=clean(search,120).toLocaleLowerCase('it'),wanted=String(status||'all');return clients.filter(c=>(wanted==='all'||c.status===wanted)&&[c.name,c.sector,c.manager,c.goal].some(v=>String(v||'').toLocaleLowerCase('it').includes(q))).sort((a,b)=>a.name.localeCompare(b.name,'it'))}
function projectLinks(storage,ownerId){const links=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key||!key.startsWith('radix-agency-workspace:'))continue;let p;try{p=JSON.parse(storage.getItem(key))}catch(e){continue}if(!p||p.schemaVersion!==1||p.ownerId!==ownerId||!p.brief||!p.brief.clientId)continue;links.push({id:key.slice('radix-agency-workspace:'.length),clientId:String(p.brief.clientId),name:clean(p.brief.name,120)})}return links}
function mayDelete(clientId,projects){return !projects.some(p=>p.clientId===clientId)}
return Object.freeze({STATUSES,MAX_CLIENTS,ownerKey,normalizeInput,readStore,filterClients,projectLinks,mayDelete});
});
