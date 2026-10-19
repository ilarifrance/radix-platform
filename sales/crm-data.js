'use strict';
/* Shared read-only loader for the CRM views (contacts-view.js,
   dashboard-view.js). Same endpoint and workspace selector as sales.js;
   the first 100 rows of each entity, cached until the workspace changes or
   the user presses Aggiorna. */
(()=>{
const ENT=['contacts','companies','opportunities','tasks','interactions','stages','members'];
let ws=null,data=null,pending=null,gen=0;
async function read(entity,w){const q=new URLSearchParams({entity,offset:'0',workspace:w});const r=await fetch('/api/sales?'+q,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('CRM '+r.status);const d=await r.json();if(!Array.isArray(d.rows))throw Error('Formato non valido');return d.rows}
function load(){const w=document.getElementById('workspace')?.value;if(!w)return Promise.resolve(null);
  if(w===ws&&data)return Promise.resolve(data);if(w===ws&&pending)return pending;
  ws=w;data=null;const g=++gen;
  pending=Promise.all(ENT.map(e=>read(e,w))).then(rows=>{if(g!==gen)return null;data=Object.fromEntries(ENT.map((e,i)=>[e,rows[i]]));data.partial=rows.some(r=>r.length===100);return data}).catch(()=>null).finally(()=>{if(g===gen)pending=null});
  return pending}
function reset(){data=null;ws=null;gen++}
document.getElementById('workspace')?.addEventListener('change',reset);
document.getElementById('refresh')?.addEventListener('click',reset);
window.RadixCrmData={load,reset};
})();
