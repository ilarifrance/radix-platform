'use strict';
/* crm-data.js: a reset() while the rows are in flight (sales.js reloading, the call sheet completing its
   pages, a save) must not resolve the waiting views with null: the read starts again or joins the new one.
   Before this, Calendario / Panoramica / Oggi stayed blank in production after such a race. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const WS='11111111-1111-4111-8111-111111111111';
function boot(){
  const src=fs.readFileSync(path.join(__dirname,'..','sales','crm-data.js'),'utf8');
  const sel={value:WS,addEventListener(){}};
  const g={document:{getElementById:id=>id==='workspace'?sel:null},calls:0,URLSearchParams,setTimeout,Error,Array,Object,Number,Promise,console};
  g.window=g;g.fetch=async()=>{g.calls++;await new Promise(r=>setTimeout(r,8));return {ok:true,json:async()=>({rows:[],limit:500})}};
  new Function('window','document','fetch','URLSearchParams',src)(g,g.document,g.fetch,URLSearchParams);
  return g;
}
test('crm-data: a reset() during the read restarts it and the first caller still gets the rows', async()=>{
  const g=boot();const D=g.window.RadixCrmData;
  const p=D.load();setTimeout(()=>D.reset(),3);
  const d=await p;assert.ok(d&&Array.isArray(d.contacts),'rows after a mid-read reset');assert.equal(D.lastError,'');
  assert.equal(g.calls,20,'two reads of 10 calls (9 entities + counts)');
});
test('crm-data: after a reset(), a caller that started earlier joins the read started later', async()=>{
  const g=boot();const D=g.window.RadixCrmData;
  const first=D.load();let second;setTimeout(()=>{D.reset();second=D.load()},3);
  const a=await first,b=await second;assert.ok(a&&b);assert.equal(a,b,'same rows object');assert.equal(g.calls,20);
});
test('crm-data: endless resets end with null and a reason instead of hanging', async()=>{
  const g=boot();const D=g.window.RadixCrmData;
  const p=D.load();const t=setInterval(()=>D.reset(),2);
  const d=await p;clearInterval(t);assert.equal(d,null);assert.equal(D.lastError,'dati cambiati durante la lettura');
});
