'use strict';
/* CRM «Visibilità dei record» (Salesforce «Permessi» / OWD Private gap): one workspace option, «I member vedono solo i propri
   record». Pure: no DOM, no fetch. Storage: one sales_segments row per workspace named «__visibilita__» with
   filters={visibility:{ownOnly:true|false}} (no new table); the server validates it with error() below, hides it from the
   segments list and lets only owners/admins write it (api/_sales_reserved.js). The server enforces it (api/_sales_visibility.js):
   this file only says what the switch means, for the panel and the header note. Owners and admins always see everything. */
(function(root){
const RESERVED='__visibilita__';
const RESTRICTED=Object.freeze(['member','viewer']);
const DEFAULTS=Object.freeze({ownOnly:false});
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
// Settings → null when valid, otherwise the reason.
function error(v){if(!plain(v)||Object.keys(v).join()!=='ownOnly'||typeof v.ownOnly!=='boolean')return 'usa {ownOnly:true} oppure {ownOnly:false}.';return null}
function settings(row){const v=row&&plain(row.filters)?row.filters.visibility:undefined;return v!==undefined&&!error(v)?v:DEFAULTS}
// The switch narrows what this role sees.
const limits=(row,role)=>settings(row).ownOnly===true&&RESTRICTED.includes(role);
// The rule in words (panel and PR), kept next to the SQL it describes.
const RULE=Object.freeze([
 'Trattative e lead: responsabile o creati da te.',
 'Attività e ticket: assegnati a te o creati da te.',
 'Interazioni: registrate da te o legate a una tua trattativa.',
 'Aziende: responsabile o create da te, oppure collegate a una tua trattativa, attività o ticket.',
 'Contatti: come le aziende, più i contatti delle aziende di cui sei responsabile.',
 'Preventivi e fatture: creati da te o legati a una tua trattativa.']);
const NOTE='Vedi solo i tuoi record';
const api={RESERVED,RESTRICTED,DEFAULTS,RULE,NOTE,error,settings,limits};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmVisibility=api;
})(typeof globalThis!=='undefined'?globalThis:this);
