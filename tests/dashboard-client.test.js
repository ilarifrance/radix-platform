'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('control-center-v2.html','utf8');
function client(fetch){
 const els={};let timeout;
 const ctx={fetch,AbortController,data:null,searchItems:[],loadInFlight:false,authStopped:false,
 document:{activeElement:null},render(){ctx.rendered=(ctx.rendered||0)+1},
 setTimeout(fn){timeout=fn;return 1},clearTimeout(){},
 $:id=>els[id]||(els[id]={hidden:false,disabled:false,inert:false,value:'',textContent:'old',
 classList:{values:new Set(),add(x){this.values.add(x)},remove(x){this.values.delete(x)},contains(x){return this.values.has(x)}},
 setAttribute(){},replaceChildren(){this.cleared=true},focus(){ctx.document.activeElement=this}})};
 vm.createContext(ctx);
 vm.runInContext(html.slice(html.indexOf('  async function readSnapshotResponse'),html.indexOf('  function render(){')),ctx);
 vm.runInContext(html.slice(html.indexOf('  async function login('),html.indexOf("  $('fatalLoginForm').addEventListener")),ctx);
 return {ctx,els,timeout:()=>timeout()};
}
const payload=()=>({projects:[],workflows:[],metrics:{projects:0},agentStatus:{}});
const response=(body=payload(),status=200)=>({ok:status<400,status,json:async()=>body});
test('single flight loads the existing summary endpoint only',async()=>{
 let resolve;const urls=[];const c=client(url=>{urls.push(url);return new Promise(r=>resolve=r)});
 const first=c.ctx.load();await c.ctx.load();assert.deepEqual(urls,['/api/state?view=dashboard']);
 resolve(response());await first;assert.equal(c.ctx.loadInFlight,false);assert.equal(c.ctx.rendered,1);assert.equal(c.ctx.$('app').inert,false);
});
test('timeout releases flight for a successful retry',async()=>{
 let calls=0;const c=client((_,opts)=>++calls===1?new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(Error('abort')))):Promise.resolve(response()));
 const first=c.ctx.load();c.timeout();await first;assert.equal(c.ctx.loadInFlight,false);await c.ctx.load();assert.equal(c.ctx.rendered,1);
});
test('expired session stops polling, clears private state and leaves login interactive',async()=>{
 let calls=0;const c=client(async()=>{calls++;return response({},401)});c.ctx.data=payload();
 await c.ctx.load();await c.ctx.load();assert.equal(calls,1);assert.equal(c.ctx.authStopped,true);assert.equal(c.ctx.data,null);
 assert.equal(c.els.drawerBody.cleared,true);assert.equal(c.els.userName.textContent,'—');assert.equal(c.els.app.inert,true);
 assert.equal(c.els.app.classList.contains('loading'),false);assert.equal(c.els.fatalLoginForm.hidden,false);
});
test('inline login resumes summary loading without redirecting and clears the password',async()=>{
 const urls=[];const c=client(async(url,opts)=>{urls.push(url);if(url==='/api/auth/login'){assert.equal(opts.method,'POST');assert.equal(opts.credentials,'same-origin');assert.equal(JSON.parse(opts.body).email,'user@example.test');return response({ok:true})}return response()});
 c.ctx.authStopped=true;c.ctx.$('fatal').classList.add('show');c.ctx.$('fatalLoginEmail').value=' user@example.test ';c.ctx.$('fatalLoginPassword').value='test-only';
 await c.ctx.login({preventDefault(){}});assert.deepEqual(urls,['/api/auth/login','/api/state?view=dashboard']);assert.equal(c.ctx.authStopped,false);assert.equal(c.ctx.rendered,1);assert.equal(c.els.fatal.classList.contains('show'),false);assert.equal(c.els.fatalLoginPassword.value,'');assert.equal(c.els.fatalLoginSubmit.disabled,false);
});
test('wrong credentials do not fetch dashboard; stalled login unlocks retry',async()=>{
 const c=client(async()=>response({error:'Credenziali errate'},401));c.ctx.authStopped=true;c.ctx.$('fatalLoginEmail').value='u@e.test';c.ctx.$('fatalLoginPassword').value='bad';
 await c.ctx.login({preventDefault(){}});assert.equal(c.ctx.authStopped,true);assert.equal(c.els.fatalLoginMessage.textContent,'Credenziali errate');assert.equal(c.els.fatalLoginSubmit.disabled,false);
 const stalled=client(()=>new Promise(()=>{}));stalled.ctx.$('fatalLoginEmail').value='u@e.test';stalled.ctx.$('fatalLoginPassword').value='bad';
 const pending=stalled.ctx.login({preventDefault(){}});stalled.timeout();await pending;assert.equal(stalled.els.fatalLoginSubmit.disabled,false);assert.equal(stalled.els.fatalLoginPassword.value,'');
});
