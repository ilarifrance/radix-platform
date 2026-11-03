'use strict';
/* Shared read-only loader for the CRM views (contacts-view.js,
   dashboard-view.js). Same endpoint and workspace selector as sales.js;
   the first 100 rows of each entity, cached until the workspace changes or
   the user presses Aggiorna. Until sales.js has filled the selector its value
   is the placeholder «Caricamento…»: only a real workspace id (uuid, the same
   check as api/_sales.js) is ever sent, so nothing is requested before then and
   the views load on their next render, once sales.js has set the workspace. */
(()=>{
const ENT=['contacts','companies','opportunities','tasks','interactions','stages','members','processes','leads'];
// Names for the error line of the views (which entity could not be read, and how).
const LABEL={contacts:'contatti',companies:'aziende',opportunities:'opportunità',tasks:'attività',interactions:'interazioni',stages:'fasi',members:'membri',processes:'processi',leads:'lead'};
let lastError='';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const workspace=()=>{const v=document.getElementById('workspace')?.value;return typeof v==='string'&&UUID.test(v)?v:null};
let ws=null,data=null,pending=null,gen=0;
const PAGE=500,PAGES=10;// 500 rows per call, at most 10 calls per entity: 5.000 rows, then `partial`
async function page(entity,w,offset,limit){const q=new URLSearchParams({entity,offset:String(offset),workspace:w});if(limit)q.set('limit',String(limit));const r=await fetch('/api/sales?'+q,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('CRM '+r.status);const d=await r.json();if(!Array.isArray(d.rows))throw Error('Formato non valido');return d}
// Every row of the entity (all the pages), with `capped` when the entity has more than PAGE*PAGES rows.
async function read(entity,w){const all=[];let capped=false;for(let n=0;n<PAGES;n++){let d;try{d=await page(entity,w,all.length,PAGE)}catch(e){throw Error(LABEL[entity]+' ('+(e&&e.message||'rete')+')')}const size=Number(d.limit)||100;all.push(...d.rows);if(d.rows.length<size)break;if(n===PAGES-1)capped=true}all.capped=capped;return all}
// Server counts (companies, contacts, leads, opportunities, tasks) of the whole workspace, null when unreadable.
async function counts(w){try{const d=await page('dashboard',w,0);const r=d.rows&&d.rows[0];if(!r)return null;const out={};for(const k of ['companies','contacts','leads','opportunities','tasks'])if(r[k]!=null&&Number.isFinite(Number(r[k])))out[k]=Number(r[k]);return out}catch{return null}}
// The header «Dipartimento» (crm-division.js): every view gets the filtered copy; the cache below stays whole,
// so changing the department never fetches again.
const filtered=d=>d&&window.RadixCrmDivision?window.RadixCrmDivision.apply(d):d;
function load(){const w=workspace();if(!w)return Promise.resolve(null);
  if(w===ws&&data)return Promise.resolve(filtered(data));if(w===ws&&pending)return pending.then(filtered);
  return start(w,0).then(filtered)}
// One read of the workspace. A reset() while the rows are in flight (sales.js reloading, the call sheet
// completing its pages, a save) used to resolve every waiting view with null and leave it blank: now the
// read starts again on the current workspace (at most RETRIES times), or joins the read already restarted.
const RETRIES=3;let pendingGen=0;
function start(w,tries){ws=w;data=null;lastError='';const g=++gen;pendingGen=g;
  const p=Promise.all([...ENT.map(e=>read(e,w)),counts(w)]).then(res=>{if(g!==gen)return stale(g,tries);const rows=res.slice(0,ENT.length);data=Object.fromEntries(ENT.map((e,i)=>[e,rows[i]]));data.partial=rows.some(r=>r.capped);data.counts=res[ENT.length];try{document.dispatchEvent(new CustomEvent('radix-crm-data',{detail:data}))}catch{}return data}).catch(e=>{if(g!==gen)return stale(g,tries);lastError=e&&e.message?e.message:'errore inatteso';return null}).finally(()=>{if(pendingGen===g)pending=null});
  pending=p;return p}
// The read of generation g ended after a reset(): join the read that replaced it, or start one more.
function stale(g,tries){if(pending&&pendingGen!==g)return pending;const w=workspace();if(!w)return null;if(w===ws&&data)return data;if(tries>=RETRIES){lastError='dati cambiati durante la lettura';return null}return start(w,tries+1)}
function reset(){data=null;ws=null;gen++}
document.getElementById('workspace')?.addEventListener('change',reset);
document.getElementById('refresh')?.addEventListener('click',reset);
window.RadixCrmData={load,reset,workspace,raw:()=>workspace()===ws?data:null,get lastError(){return lastError}};
})();
