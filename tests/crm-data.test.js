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
 assert.ok(d&&Array.isArray(d.contacts));assert.equal(s.urls.length,10,'9 entities + the dashboard counts');assert.ok(s.urls.some(u=>/entity=dashboard/.test(u)));assert.ok(s.urls.filter(u=>!/entity=dashboard/.test(u)).every(u=>/limit=500/.test(u)),'500 rows per call');
 assert.ok(s.urls.every(u=>new URL(u,'http://x').searchParams.get('workspace')===W));
 await s.api.load();assert.equal(s.urls.length,10,'cached');
 s.fire('change');await s.api.load();assert.equal(s.urls.length,20,'reloads after a workspace change');
});

test('sales.js drops the shared cache on every reload: a saved record refreshes Panoramica and the tables at once',()=>{
 const src=fs.readFileSync(__dirname+'/../sales/sales.js','utf8');
 const reload=/async function reload\(\)\{[\s\S]*?\n\}/.exec(src)[0];
 assert.match(reload,/window\.RadixCrmData\?\.reset\?\.\(\);/);
 assert.ok(reload.indexOf('RadixCrmData?.reset')<reload.indexOf('Promise.allSettled'),'reset before the rows are read again');
});

test('every page: a full page of 500 asks for the next one, a short page stops; counts come from the dashboard; a cap of 10 pages marks partial',async()=>{
 const vm=require('node:vm');const W2='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601';const urls=[];
 const row=i=>({id:'r'+i});const full=Array.from({length:500},(_,i)=>row(i));
 const fetch=async u=>{urls.push(u);const q=new URL(u,'http://x').searchParams;const e=q.get('entity'),off=+q.get('offset');
  if(e==='dashboard')return {ok:true,json:async()=>({rows:[{companies:'1200',contacts:996,leads:995,opportunities:3,tasks:0}]})};
  if(e==='contacts')return {ok:true,json:async()=>({rows:off===0?full:full.slice(0,496),limit:500})};
  if(e==='companies')return {ok:true,json:async()=>({rows:full,limit:500})};
  return {ok:true,json:async()=>({rows:[],limit:500})}};
 const select={value:W2,addEventListener(){}};const document={getElementById:id=>id==='workspace'?select:id==='refresh'?{addEventListener(){}}:null};
 const window={};vm.runInNewContext(SRC,{window,document,fetch,URLSearchParams});
 const d=await window.RadixCrmData.load();
 assert.equal(d.contacts.length,996);assert.equal(urls.filter(u=>/entity=contacts/.test(u)).length,2);
 assert.equal(d.companies.length,5000);assert.equal(urls.filter(u=>/entity=companies/.test(u)).length,10);assert.ok(d.companies.capped);assert.ok(d.partial,'companies hit the cap');
 assert.ok(!d.contacts.capped);assert.deepEqual(JSON.parse(JSON.stringify(d.counts)),{companies:1200,contacts:996,leads:995,opportunities:3,tasks:0});
});
