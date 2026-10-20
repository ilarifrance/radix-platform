'use strict';
// «Apri le liste selezionate»: several LinkedIn lists opened together, one person per profile; redundant pickers hidden.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../sales/lead-lists-merge-core.js'),B=require('../lib/lead-contact-batches');
const html=fs.readFileSync('lead-intelligence.html','utf8'),flow=fs.readFileSync('sales/lead-flow.js','utf8'),tabs=fs.readFileSync('sales/lead-tabs.js','utf8');
const workbench=fs.readFileSync('sales/lead-contact-workbench.js','utf8'),core=fs.readFileSync('sales/lead-lists-merge-core.js','utf8'),css=fs.readFileSync('sales/lead-flow.css','utf8');
const P=s=>'https://www.linkedin.com/sales/lead/'+s;
const R=(name,url,extra={})=>({fullName:name,profileUrl:url,sourceUrl:'https://www.linkedin.com/sales/search/people',...extra});

test('profile key: origin + path, no query, no trailing slash, Sales Navigator id without the search token',()=>{
 assert.equal(M.profileKey('https://www.linkedin.com/in/giulia-rossi/?trk=x#a'),'https://www.linkedin.com/in/giulia-rossi');
 assert.equal(M.profileKey('https://www.linkedin.com/in/Giulia-Rossi'),M.profileKey('https://www.linkedin.com/in/giulia-rossi/'));
 assert.equal(M.profileKey(P('ACwAAA1,NAME_SEARCH,x1?_ntb=abc')),M.profileKey(P('ACwAAA1,NAME_SEARCH,zz9')));
 assert.equal(M.profileKey(P('ACwAAA1,NAME_SEARCH,x1')),'https://www.linkedin.com/sales/lead/acwaaa1');
 assert.notEqual(M.profileKey(P('ACwAAA1')),M.profileKey(P('ACwAAA2')));
 for(const v of ['',null,undefined,'non un url','javascript:alert(1)',42])assert.equal(M.profileKey(v),'',String(v));
});

test('merge keeps one record per person, the most complete one, newer list on ties',()=>{
 const older={id:'a',updatedAt:'2026-10-18T10:00:00Z',records:[
  R('Giulia Rossi',P('G,NAME_SEARCH,a'),{companyName:'Rossi Meccanica',jobTitle:'CEO',location:'Brescia'}),
  R('Marco Bianchi',P('M,NAME_SEARCH,a'),{jobTitle:'Acquisti'}),
  R('Sara Neri',P('S,NAME_SEARCH,a'),{companyName:'Vecchia Srl'}),
  R('Senza Profilo','')]};
 const newer={id:'b',updatedAt:'2026-10-20T09:00:00Z',records:[
  R('Giulia Rossi',P('G,NAME_SEARCH,b'),{jobTitle:'CEO'}),
  R('Marco Bianchi',P('M,NAME_SEARCH,b'),{jobTitle:'Responsabile acquisti',companyName:'Bianchi Forni'}),
  R('Sara Neri',P('S,NAME_SEARCH,b'),{companyName:'Nuova Srl'}),
  R('Luca Verdi',P('L'),{companyName:'Verdi'}),
  R('Senza Profilo','')]};
 // Order of the input does not matter: the newer list wins ties either way.
 for(const jobs of [[older,newer],[newer,older]]){
  const m=M.merge(jobs);
  assert.equal(m.lists,2);assert.equal(m.total,9);assert.equal(m.unique,6);assert.equal(m.duplicates,3);
  const by=Object.fromEntries(m.records.filter(r=>r.profileUrl).map(r=>[r.fullName,r]));
  assert.equal(by['Giulia Rossi'].location,'Brescia','older but more complete');
  assert.equal(by['Marco Bianchi'].companyName,'Bianchi Forni','newer and more complete');
  assert.equal(by['Sara Neri'].companyName,'Nuova Srl','tie → newer list');
  assert.equal(m.records.filter(r=>!r.profileUrl).length,2,'no profile: never merged');
  assert.deepEqual(m.records.map(r=>r.fullName).slice(0,4),['Giulia Rossi','Marco Bianchi','Sara Neri','Luca Verdi'],'newest list first');
 }
 // Same date: the first list given wins ties.
 const a={updatedAt:'2026-10-20T09:00:00Z',records:[R('X',P('X'),{companyName:'Primo'})]},b={updatedAt:'2026-10-20T09:00:00Z',records:[R('X',P('X'),{companyName:'Secondo'})]};
 assert.equal(M.merge([a,b]).records[0].companyName,'Primo');
 // Blank strings do not count as filled.
 assert.equal(M.completeness({companyName:'  ',jobTitle:'CEO',location:''}),1);
 assert.deepEqual(M.merge([]),{records:[],total:0,unique:0,duplicates:0,lists:0});
 assert.deepEqual(M.merge([{records:[null,'x']}]).records,[]);
});

test('status line in plain Italian',()=>{
 assert.equal(M.summary({lists:3,unique:1180,duplicates:92}),'Aperte 3 liste: 1180 contatti unici, 92 doppioni uniti.');
 assert.equal(M.summary({lists:2,unique:1,duplicates:1}),'Aperte 2 liste: 1 contatto unico, 1 doppione unito.');
 assert.equal(M.summary({lists:1,unique:272,duplicates:0}),'Aperta 1 lista: 272 contatti unici, 0 doppioni uniti.');
});

test('page: core before the workbench, self-hosted, multi-open bar in the LinkedIn panel',()=>{
 const at=s=>html.indexOf('src="/sales/'+s+'"');
 assert.ok(at('lead-lists-merge-core.js')>0&&at('lead-lists-merge-core.js')<at('lead-contact-workbench.js'));
 assert.match(html,/<div id="lf-jobs-multi" class="lf-jobs-multi" hidden>.*<button type="button" id="lf-jobs-open-selected" class="lp-btn" disabled>Apri le liste selezionate<\/button><\/div>/);
 assert.ok(html.indexOf('id="lf-jobs"')<html.indexOf('id="lf-jobs-multi"'));
 for(const s of [core,flow,workbench])assert.doesNotThrow(()=>new vm.Script(s));
 assert.doesNotMatch(core+css,/https?:\/\/(?:cdn|unpkg|fonts)\./);
 assert.doesNotMatch(core,/localStorage|sessionStorage|fetch\(/);
 assert.match(css,/label\.lf-follows\{display:none!important\}/);
});

function dom(){
 const all=[];let hash='';const listeners=new Map(),winListeners=new Map(),storage=new Map();
 class N{
  constructor(tag,attrs={},parent=null){this.tagName=tag.toUpperCase();this.attrs={...attrs};this.children=[];this.parentElement=parent;this.textContent='';this.listeners={};this.value=attrs.value||'';if(parent)parent.children.push(this);all.push(this)}
  get id(){return this.attrs.id||''}
  get hidden(){return 'hidden' in this.attrs}set hidden(v){if(v)this.attrs.hidden='';else delete this.attrs.hidden}
  get dataset(){const key=k=>'data-'+String(k).replace(/[A-Z]/g,c=>'-'+c.toLowerCase());return new Proxy({},{get:(_,k)=>this.attrs[key(k)],set:(_,k,v)=>{this.attrs[key(k)]=String(v);return true}})}
  get classList(){const n=this;return{toggle(c,on){const s=new Set((n.attrs.class||'').split(' ').filter(Boolean));on?s.add(c):s.delete(c);n.attrs.class=[...s].join(' ')}}}
  get options(){return this.children.filter(c=>c.tagName==='OPTION')}
  setAttribute(k,v){this.attrs[k]=String(v)}removeAttribute(k){delete this.attrs[k]}getAttribute(k){return this.attrs[k]??null}hasAttribute(k){return k in this.attrs}
  set className(v){this.attrs.class=v}set type(v){this.attrs.type=v}
  append(...c){for(const x of c){x.parentElement=this;this.children.push(x)}}replaceChildren(...c){this.children=[];this.append(...c)}
  addEventListener(t,f){(this.listeners[t]||=[]).push(f)}
  dispatchEvent(e){for(const f of this.listeners[e.type]||[])f(e);return true}
  click(){const e={type:'click',target:this};for(let n=this;n;n=n.parentElement)n.dispatchEvent(e);for(const f of listeners.get('click')||[])f(e)}
  contains(n){for(;n;n=n.parentElement)if(n===this)return true;return false}
  matches(sel){return match(this,sel)}
  closest(sel){for(let n=this;n;n=n.parentElement)if(match(n,sel))return n;return null}
  querySelectorAll(sel){return all.filter(n=>n!==this&&this.contains(n)&&match(n,sel))}
  querySelector(sel){return this.querySelectorAll(sel)[0]||null}
  scrollIntoView(){}getBoundingClientRect(){return{top:0}}
 }
 function simple(n,s){
  for(const part of s.match(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|^[a-z]+/g)||[]){
   if(part[0]==='#'){if(n.id!==part.slice(1))return false}
   else if(part[0]==='.'){if(!(n.attrs.class||'').split(' ').includes(part.slice(1)))return false}
   else if(part[0]==='['){const m=/^\[([\w-]+)(\^?=)?"?([^"\]]*)"?\]$/.exec(part);const v=n.attrs[m[1]];if(v===undefined)return false;if(m[2]==='='&&v!==m[3])return false;if(m[2]==='^='&&!v.startsWith(m[3]))return false}
   else if(n.tagName!==part.toUpperCase())return false;
  }
  return true;
 }
 function match(n,sel){const parts=sel.trim().split(/\s+/);if(!simple(n,parts.pop()))return false;let p=n.parentElement;for(const anc of parts.reverse()){while(p&&!simple(p,anc))p=p.parentElement;if(!p)return false;p=p.parentElement}return true}
 const body=new N('body');
 const mk=(tag,attrs,parent=body)=>new N(tag,attrs,parent);
 const main=mk('main',{id:'main'});
 const head=mk('section',{id:'lead-flow'},main);
 const ws=mk('select',{id:'archive-workspace'},head);mk('option',{value:''},ws);
 const steps=mk('ol',{class:'lf-steps'},head);
 for(const s of [1,2,3,4])mk('button',{'data-go-step':String(s)},mk('li',{},steps));
 const acquire=mk('section',{id:'lf-acquire','data-step':'1'},main);
 for(const m of ['linkedin','file','provider','backup'])mk('button',{'data-mode':m},acquire);
 const panels={};
 for(const m of ['linkedin','file','provider','backup'])panels[m]=mk('section',{'data-mode-panel':m,hidden:''},acquire);
 mk('ul',{id:'lf-jobs'},panels.linkedin);const multi=mk('div',{id:'lf-jobs-multi',hidden:''},panels.linkedin);mk('p',{id:'lf-jobs-picked'},multi);mk('button',{id:'lf-jobs-open-selected'},multi);mk('p',{id:'lf-jobs-status'},panels.linkedin);mk('p',{id:'lf-ext-status'},panels.linkedin);mk('button',{id:'lf-jobs-refresh'},panels.linkedin);
 mk('button',{id:'radix-extension-link'},panels.linkedin);
 const sel=mk('select',{id:'contact-job-select'},panels.provider);mk('option',{value:''},sel);
 mk('button',{id:'contact-job-list'},panels.provider);mk('button',{id:'contact-job-load'},panels.provider);mk('p',{id:'contact-job-status'},panels.provider);
 const pipe=mk('section',{id:'lead-pipeline','data-step':'2'},main);mk('p',{id:'lp-open-status',hidden:''},pipe);
 const bar=mk('nav',{id:'lp-tabs','data-step':'2 3 4'},main);
 const tabDefs={qualifica:2,risultati:2,bulk:3,crm:3,contatto:4,newsletter:4,campagne:4};
 for(const [t,s] of Object.entries(tabDefs))mk('button',{'data-tab':t,'data-step':String(s),...(s===2?{'data-toggle':''}:{})},bar);
 const bulkWrap=mk('div',{'data-step':'3','data-panel':'bulk'},main);mk('section',{id:'bulk-crm',hidden:''},bulkWrap);
 for(const p of ['qualifica','risultati','crm','contatto','newsletter','campagne'])mk('section',{'data-panel':p,id:'panel-'+p},main);
 mk('section',{id:'lead-icp'},all.find(n=>n.id==='panel-qualifica'));
 const lpCrm=mk('button',{id:'lp-crm'},main);
 for(const id of ['bulk-workspace','sync-workspace','nl-workspace'])mk('select',{id},mk('label',{},main));
 const document={body,getElementById:id=>all.find(n=>n.id===id)||null,querySelectorAll:s=>body.querySelectorAll(s),querySelector:s=>body.querySelector(s),createElement:t=>new N(t),
  addEventListener:(t,f)=>{const a=listeners.get(t)||[];a.push(f);listeners.set(t,a)},visibilityState:'visible'};
 const window={localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))},addEventListener:(t,f)=>{const a=winListeners.get(t)||[];a.push(f);winListeners.set(t,a)},dispatchEvent:e=>{for(const f of winListeners.get(e.type)||[])f(e)}};
 class CustomEvent{constructor(type,o={}){this.type=type;this.detail=o.detail}}
 class Event{constructor(type){this.type=type}}
 const observers=[];class MutationObserver{constructor(f){this.f=f}observe(t){observers.push([t,this.f])}}
 const ctx={document,window,location:{get hash(){return hash},origin:'https://radix.test'},CustomEvent,Event,MutationObserver,requestAnimationFrame:f=>f(),URLSearchParams,Date,console};
 window.document=document;
 return{all,body,ctx,window,storage,panels,bulk:all.find(n=>n.id==='bulk-crm'),lpCrm,setHash:h=>{hash=h},
  run(){vm.runInNewContext(tabs,ctx);vm.runInNewContext(flow,ctx)},
  fire:(t,detail)=>window.dispatchEvent(new CustomEvent(t,{detail})),hashchange:()=>window.dispatchEvent({type:'hashchange'}),
  get:id=>document.getElementById(id),mutate:t=>{for(const [x,f] of observers)if(x===t)f([])},visible:n=>{for(;n;n=n.parentElement)if(n.hidden)return false;return true}};
}
const C=d=>d.all[0].constructor;
const WS='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',J1='11111111-1111-4111-8111-111111111111',J2='22222222-2222-4222-8222-222222222222',J3='33333333-3333-4333-8333-333333333333';
function withJobs(){
 const d=dom();d.run();const N=C(d);
 const sel=d.get('contact-job-select');
 for(const [v,t] of [[J1,'LinkedIn Sales Navigator · 20/10/2026 09:41 · 1000 contatti · v1'],[J2,'LinkedIn Sales Navigator · 20/10/2026 08:10 · 272 contatti · v1'],[J3,'Captain Data · fiera · 5 contatti · v2']]){const o=new N('option',{value:v});o.textContent=t;sel.append(o)}
 const ws=d.get('archive-workspace');const o=new N('option',{value:WS});ws.append(o);ws.value=WS;ws.dispatchEvent({type:'change'});
 d.mutate(sel);
 return d;
}
const boxes=d=>d.get('lf-jobs').children.map(li=>li.children[0].children[0]);

test('each LinkedIn list gets a checkbox; «Apri» still opens one list',()=>{
 const d=withJobs();
 const items=d.get('lf-jobs').children;assert.equal(items.length,2,'only LinkedIn lists');
 assert.equal(items[0].children[0].attrs.class,'lf-pick');
 assert.equal(boxes(d)[0].attrs.type,'checkbox');assert.equal(boxes(d)[0].attrs['aria-label'],'Seleziona la lista 20/10/2026 09:41');
 assert.equal(d.get('lf-jobs-multi').hidden,false,'shown with two or more lists');
 assert.equal(d.get('lf-jobs-open-selected').disabled,true);
 let loaded='';d.get('contact-job-load').addEventListener('click',()=>{loaded=d.get('contact-job-select').value});
 items[1].children[2].click();assert.equal(loaded,J2);
});

test('ticked lists open together through the workbench and the page moves to step 2',async()=>{
 const d=withJobs();const calls=[];
 d.window.radixLeadContacts={openJobs:async ids=>{calls.push(ids);d.fire('radix:lead-contacts-updated',{count:1180});return {lists:2,unique:1180,duplicates:92,note:'Aperte 2 liste: 1180 contatti unici, 92 doppioni uniti.'}}};
 const [b1,b2]=boxes(d);
 b2.checked=true;b2.click();
 assert.equal(d.get('lf-jobs-open-selected').disabled,false);
 assert.match(d.get('lf-jobs-picked').textContent,/^1 lista selezionata/);
 b1.checked=true;b1.click();
 assert.equal(d.get('lf-jobs-picked').textContent,'2 liste selezionate · 1272 contatti prima di unire i doppioni.');
 // A refresh of the list keeps the ticks.
 d.mutate(d.get('contact-job-select'));assert.deepEqual(boxes(d).map(b=>b.checked),[true,true]);
 d.get('lf-jobs-open-selected').click();await new Promise(r=>setImmediate(r));
 assert.equal(JSON.stringify(calls),JSON.stringify([[J1,J2]]),'newest list first, in list order');
 assert.equal(d.window.RadixLeadFlow.step(),2);
 assert.equal(d.get('lp-open-status').textContent,'Aperte 2 liste: 1180 contatti unici, 92 doppioni uniti.');
 assert.equal(d.get('lp-open-status').hidden,false);
 assert.equal(d.get('lf-jobs-status').textContent,'Aperte 2 liste: 1180 contatti unici, 92 doppioni uniti.');
 // Unticking works; a cancelled open (null) leaves the page where it is.
 boxes(d)[0].checked=false;boxes(d)[0].click();assert.match(d.get('lf-jobs-picked').textContent,/^1 lista/);
 d.all.find(n=>n.attrs['data-go-step']==='1').click();
 d.window.radixLeadContacts.openJobs=async()=>null;d.get('lf-jobs-open-selected').click();await new Promise(r=>setImmediate(r));
 assert.equal(d.window.RadixLeadFlow.step(),1);
});

test('lists that disappear are unticked; no workspace hides the bar',()=>{
 const d=withJobs();const [b1]=boxes(d);b1.checked=true;b1.click();
 const sel=d.get('contact-job-select');sel.children=sel.children.filter(o=>o.value!==J1);d.mutate(sel);
 assert.equal(d.get('lf-jobs').children.length,1);assert.equal(d.get('lf-jobs-multi').hidden,true);
 assert.equal(d.get('lf-jobs-open-selected').disabled,true);
});

test('pickers that show the top workspace are hidden, and come back when they differ',()=>{
 const d=withJobs();const N=C(d);const label=id=>d.get(id).parentElement;const hidden=id=>(label(id).attrs.class||'').split(' ').includes('lf-follows');
 for(const id of ['bulk-workspace','sync-workspace','nl-workspace']){
  const s=d.get(id);
  assert.equal(hidden(id),false,id+' empty: shown');
  // The section loads its workspaces and adopts the top one (preferWorkspace).
  for(const v of [WS,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'])s.append(new N('option',{value:v}));
  d.window.RadixLeadFlow.preferWorkspace(s);
  assert.equal(s.value,WS);assert.equal(hidden(id),true,id+' follows: hidden');
  // Picked something else in the section: shown again.
  s.value='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';s.dispatchEvent({type:'change'});assert.equal(hidden(id),false,id+' differs: shown');
 }
 // Changing the top picker brings the followers along and hides them again.
 const ws=d.get('archive-workspace');ws.dispatchEvent({type:'change'});
 for(const id of ['bulk-workspace','sync-workspace','nl-workspace'])assert.equal(hidden(id),true,id);
 // No workspace at the top: every picker is shown.
 ws.value='';ws.dispatchEvent({type:'change'});
 for(const id of ['bulk-workspace','sync-workspace','nl-workspace'])assert.equal(hidden(id),false,id);
});

// ---- the workbench reads each list with the existing GET and merges them ----
function bench({confirm=()=>true}={}){
 const els={},calls=[];
 const el=id=>els[id]||(els[id]={id,value:'',textContent:'',hidden:false,disabled:false,options:[],files:null,children:[],
  replaceChildren(...c){this.children=c;this.options=c},append(...c){this.children.push(...c)},dispatchEvent(){},scrollIntoView(){},addEventListener(){}});
 el('archive-workspace').value=WS;
 const src='https://www.linkedin.com/sales/search/people';
 const rows={
  [J1]:{id:J1,title:'LinkedIn Sales Navigator · 1000',version:3,updated_at:'2026-10-20T09:41:00Z',payload:{version:1,sourceUrl:src,batches:[{id:'b',signature:'x'}],total:3,duplicates:0,records:[R('Giulia Rossi',P('G,NAME_SEARCH,new'),{jobTitle:'CEO'}),R('Marco Bianchi',P('M,NAME_SEARCH,new'),{jobTitle:'Acquisti',companyName:'Bianchi Forni'}),R('Luca Verdi',P('L'))]}},
  [J2]:{id:J2,title:'LinkedIn Sales Navigator · 272',version:1,updated_at:'2026-10-20T08:10:00Z',payload:{version:1,sourceUrl:src,batches:[{id:'a',signature:'x'}],total:2,duplicates:0,records:[R('Giulia Rossi',P('G,NAME_SEARCH,old'),{jobTitle:'CEO',companyName:'Rossi Meccanica'}),R('Marco Bianchi',P('M,NAME_SEARCH,old'),{jobTitle:'Acquisti',companyName:'Altro'})]}}
 };
 const fetch=async url=>{calls.push(url);const id=/&id=([^&]+)/.exec(url)?.[1];return {ok:true,json:async()=>({rows:id?[rows[id]]:[]})}};
 const events=[];
 const window={RadixContactBatch:B,RadixProviderContacts:{convert:()=>[]},RadixLeadListsMerge:M,dispatchEvent:e=>events.push(e),addEventListener(){},confirm};
 const ctx={window,document:{getElementById:el,createElement:()=>el('x'+Math.random()),body:el('body')},location:{hash:'',pathname:'/',search:'',origin:'https://radix.test'},history:{replaceState(){}},fetch,setTimeout,Event:class{constructor(t){this.type=t}},CustomEvent:class{constructor(t,o){this.type=t;this.detail=o?.detail}},URL,Blob:class{},navigator:{}};
 vm.runInNewContext(workbench,ctx);
 return {els,calls,events,window};
}

test('workbench: two lists become one work, one person per profile, saved lists untouched',async()=>{
 const b=bench();
 const r=await b.window.radixLeadContacts.openJobs([J1,J2,J1,'../x']);
 assert.equal(r.note,'Aperte 2 liste: 3 contatti unici, 2 doppioni uniti.');
 assert.equal(b.els['contact-job-status'].textContent,r.note);
 assert.deepEqual(b.calls,['/api/sales?entity=lead_contact_jobs&workspace='+WS+'&id='+J1,'/api/sales?entity=lead_contact_jobs&workspace='+WS+'&id='+J2],'only the existing GET, once per list');
 const list=b.window.radixLeadContacts.records(),by=Object.fromEntries(list.map(x=>[x.fullName,x]));
 assert.equal(list.length,3);
 assert.equal(by['Giulia Rossi'].companyName,'Rossi Meccanica','more complete record kept');
 assert.equal(by['Marco Bianchi'].companyName,'Bianchi Forni','tie → newer list');
 assert.equal(b.events.at(-1).type,'radix:lead-contacts-updated');assert.equal(b.events.at(-1).detail.count,3);
 assert.equal(b.els['contact-job-title'].value,'Liste unite · 2 liste');
 assert.equal(b.els['contact-job-select'].value,'');
 assert.equal(b.els['contact-count'].textContent,'3');assert.equal(b.els['contact-duplicates'].textContent,'2');
});

test('workbench: one ticked list opens like «Apri»; a running work asks first',async()=>{
 const b=bench();
 const r=await b.window.radixLeadContacts.openJobs([J2]);
 assert.equal(r.note,'Aperta 1 lista: 2 contatti unici, 0 doppioni uniti.');
 assert.equal(b.els['contact-job-title'].value,'LinkedIn Sales Navigator · 272');
 let asked='';b.window.confirm=q=>{asked=q;return false};
 assert.equal(await b.window.radixLeadContacts.openJobs([J1,J2]),null);
 assert.equal(asked,'Aprire le liste selezionate? I dati non salvati saranno persi.');
 assert.equal(b.window.radixLeadContacts.records().length,2,'nothing replaced');
 b.els['archive-workspace'].value='';
 b.window.confirm=()=>true;assert.equal(await b.window.radixLeadContacts.openJobs([J1]),null);
 assert.match(b.els['contact-job-status'].textContent,/^Apertura non riuscita: Scegli prima il workspace in alto/);
});
