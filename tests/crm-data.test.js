'use strict';
// crm-data.js must not query /api/sales until the workspace selector holds a real workspace id:
// before sales.js fills it, its value is the placeholder «Caricamento…» and every request would be a 400.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const SRC=fs.readFileSync(__dirname+'/../sales/crm-data.js','utf8');
const W='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function boot(value){
 const urls=[],listeners={};
 const select={value,addEventListener:(t,f)=>{(listeners[t]||=[]).push(f)}};
 const document={getElementById:id=>id==='workspace'?select:id==='refresh'?{addEventListener(){}}:null};
 const fetch=async u=>{urls.push(u);return {ok:true,json:async()=>({rows:[]})}};
 const window={};vm.runInNewContext(SRC,{window,document,fetch,URLSearchParams});
 return {api:window.RadixCrmData,select,urls,fire:t=>(listeners[t]||[]).forEach(f=>f())};
}
test('no request while the selector shows the placeholder or no uuid',async()=>{
 for(const v of ['Caricamento…','','Nessuna appartenenza','1',' '+W,undefined]){
  const s=boot(v);assert.equal(await s.api.load(),null);assert.equal(s.api.workspace(),null);assert.deepEqual(s.urls,[],String(v));
 }
});
test('loads once sales.js sets the real workspace, without extra requests',async()=>{
 const s=boot('Caricamento…');assert.equal(await s.api.load(),null);
 s.select.value=W;const d=await s.api.load();
 assert.ok(d&&Array.isArray(d.contacts));assert.equal(s.urls.length,9);
 assert.ok(s.urls.every(u=>new URL(u,'http://x').searchParams.get('workspace')===W));
 await s.api.load();assert.equal(s.urls.length,9,'cached');
 s.fire('change');await s.api.load();assert.equal(s.urls.length,18,'reloads after a workspace change');
});
