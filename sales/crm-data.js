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
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const workspace=()=>{const v=document.getElementById('workspace')?.value;return typeof v==='string'&&UUID.test(v)?v:null};
let ws=null,data=null,pending=null,gen=0;
const PAGE=500,PAGES=10;// 500 rows per call, at most 10 calls per entity: 5.000 rows, then `partial`
async function page(entity,w,offset,limit){const q=new URLSearchParams({entity,offset:String(offset),workspace:w});if(limit)q.set('limit',String(limit));const r=await fetch('/api/sales?'+q,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('CRM '+r.status);const d=await r.json();if(!Array.isArray(d.rows))throw Error('Formato non valido');return d}
// Every row of the entity (all the pages), with `capped` when the entity has more than PAGE*PAGES rows.
async function read(entity,w){const all=[];let capped=false;for(let n=0;n<PAGES;n++){const d=await page(entity,w,all.length,PAGE);const size=Number(d.limit)||100;all.push(...d.rows);if(d.rows.length<size)break;if(n===PAGES-1)capped=true}all.capped=capped;return all}
// Server counts (companies, contacts, leads, opportunities, tasks) of the whole workspace, null when unreadable.
async function counts(w){try{const d=await page('dashboard',w,0);const r=d.rows&&d.rows[0];if(!r)return null;const out={};for(const k of ['companies','contacts','leads','opportunities','tasks'])if(r[k]!=null&&Number.isFinite(Number(r[k])))out[k]=Number(r[k]);return out}catch{return null}}
function load(){const w=workspace();if(!w)return Promise.resolve(null);
  if(w===ws&&data)return Promise.resolve(data);if(w===ws&&pending)return pending;
  ws=w;data=null;const g=++gen;
  pending=Promise.all([...ENT.map(e=>read(e,w)),counts(w)]).then(res=>{if(g!==gen)return null;const rows=res.slice(0,ENT.length);data=Object.fromEntries(ENT.map((e,i)=>[e,rows[i]]));data.partial=rows.some(r=>r.capped);data.counts=res[ENT.length];return data}).catch(()=>null).finally(()=>{if(g===gen)pending=null});
  return pending}
function reset(){data=null;ws=null;gen++}
document.getElementById('workspace')?.addEventListener('change',reset);
document.getElementById('refresh')?.addEventListener('click',reset);
window.RadixCrmData={load,reset,workspace};
})();
