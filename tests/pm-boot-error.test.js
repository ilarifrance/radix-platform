// The PM page must never stay on «Caricamento del piano…» when the plan cannot be loaded
// (no project in the archive, a saved plan that no longer validates, a request that never answers).
// Runs the page's own script with the real PM libraries, a fake /api and a minimal fake DOM.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'radix-pm-concept.html'),'utf8');
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).pop();
const LOADING='Caricamento del piano…';

function element(id){
 const el={id,textContent:'',value:'',checked:false,hidden:false,disabled:false,className:'',children:[],style:{},dataset:{},attrs:{},
  classes:new Set(),
  get classList(){const c=this.classes;return {add:(...x)=>x.forEach(v=>c.add(v)),remove:(...x)=>x.forEach(v=>c.delete(v)),toggle:(v,on)=>{if(on??!c.has(v))c.add(v);else c.delete(v)},contains:v=>c.has(v)}},
  append(...n){this.children.push(...n)},replaceChildren(...n){this.children=n},after(){},before(){},prepend(...n){this.children.unshift(...n)},remove(){},
  setAttribute(k,v){this.attrs[k]=String(v)},getAttribute(k){return this.attrs[k]??null},removeAttribute(k){delete this.attrs[k]},
  addEventListener(){},removeEventListener(){},closest(){return null},querySelector(){return null},querySelectorAll(){return []},
  focus(){},showModal(){},close(){},scrollIntoView(){}};
 return el;
}
function page({projects,docs={},hang=false}){
 const els=new Map(),get=id=>{if(!els.has(id)){const e=element(id);if(id==='storage-status')e.textContent=LOADING;els.set(id,e)}return els.get(id)};
 const json=(body,status=200)=>Promise.resolve({ok:status<400,status,json:async()=>body});
 const fetch=(url,opts={})=>{
  const u=new URL(url,'http://radix.test');
  if(hang)return new Promise(()=>{});
  if(u.pathname==='/api/auth/me')return json({user:{id:'u1',email:'pm@example.test',name:'PM'}});
  const r=u.searchParams.get('resource');
  if(r==='import')return json({ok:true});
  if(r==='projects')return json({items:projects});
  if(r==='documents'){if((opts.method||'GET')==='PUT')return json({ok:true,revision:1});const d=docs[u.searchParams.get('module')];return json(d?{data:d,revision:1}:{data:null,revision:0})}
  return json({items:[]});
 };
 const timers=[];
 const ctx={console,URL,URLSearchParams,Intl,Date,Math,JSON,Promise,Error,Map,Set,Number,String,Array,Object,
  fetch,localStorage:{getItem:()=>null,setItem(){},removeItem(){},key:()=>null,length:0},
  location:{search:''},navigator:{},confirm:()=>false,requestAnimationFrame:f=>f(),
  setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length},clearTimeout:id=>{if(timers[id-1])timers[id-1].f=null},
  document:{getElementById:get,createElement:t=>element(t),createTextNode:t=>({textContent:t}),querySelector:()=>null,querySelectorAll:()=>[],documentElement:element('html'),body:element('body')}};
 ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
 for(const f of ['lib/pm-demo.js','lib/radix-workspace-client.js','lib/pm-views.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
 vm.runInContext(inline,ctx,{filename:'radix-pm-concept.html'});
 return {get,timers};
}
const settle=()=>new Promise(r=>setTimeout(r,30));
const plan={projects:[{id:'p1',name:'Alpha',note:'',synthetic:true,subprojects:[{id:'p1s1',name:'Generale'}]}],tasks:[],nextId:1};
const alpha=[{id:'alpha',name:'Alpha',kind:'internal',status:'active',summary:''},{id:'beta',name:'Beta',kind:'internal',status:'active',summary:''}];

test('a saved plan loads and the status leaves «Caricamento»',async()=>{
 const p=page({projects:alpha,docs:{pm:plan}});await settle();
 assert.equal(p.get('storage-status').textContent,'Piano caricato dall’archivio del team.');
 assert.equal(p.get('project-nav').children.length,2);
});

test('no project in the archive: visible error instead of an endless «Caricamento»',async()=>{
 const p=page({projects:[]});await settle();
 const st=p.get('storage-status');
 assert.notEqual(st.textContent,LOADING);
 assert.match(st.textContent,/^Piano non caricato: Nessun progetto/);
 assert.ok(st.classes.has('warn'));assert.equal(st.attrs.role,'alert');
});

test('a saved plan that no longer validates: error names the project and the project list stays usable',async()=>{
 const p=page({projects:alpha,docs:{pm:{projects:[],tasks:[],nextId:1}}});await settle();
 const st=p.get('storage-status');
 assert.match(st.textContent,/^Piano non caricato: Il piano salvato di «Alpha» non è leggibile/);
 assert.deepEqual(p.get('project-nav').children.map(o=>o.value),['alpha','beta']);
 assert.equal(p.get('project-nav').value,'alpha');
 assert.match(p.get('tasks').children[0].textContent,/non è leggibile/);
});

test('a request that never answers ends in a visible message after the watchdog',async()=>{
 const p=page({projects:alpha,hang:true});await settle();
 assert.equal(p.get('storage-status').textContent,LOADING);
 const watch=p.timers.find(t=>t.ms===20000&&t.f);assert.ok(watch,'watchdog armed');watch.f();
 assert.match(p.get('storage-status').textContent,/^Piano non caricato: Il server non risponde/);
});
