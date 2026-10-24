'use strict';
// The PED page (editorial-workspace.js) and the Marketing Agency pages use the one RADIX confirmation
// (lib/radix-confirm.js) instead of the browser's grey confirm(). The page script runs here in a small fake DOM with a
// fake RadixConfirm, a fake AI and a fake Buffer: «Annulla» = no AI call and nothing sent, conferma = the action.
// Never a real call: fetch, the AI and the publications are all fakes.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const core=require('../editorial-core.js'),pv=require('../lib/ped-views.js'),pr=require('../lib/ped-results.js');

// ---- a forgiving fake DOM: every id exists, nothing renders ----
class El{
 constructor(tag,id){this.tagName=String(tag||'div').toUpperCase();this.id=id||'';this.children=[];this.attributes={};this.dataset={};this.value='';this._text='';this.hidden=false;this.disabled=false;this.checked=false;this.maxLength=-1;this.className='';this.type='';this.files=null;
  this.style={setProperty(){},removeProperty(){}};this.classList={add(){},remove(){},toggle(){},contains:()=>false}}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}set textContent(v){this._text=String(v==null?'':v);this.children=[]}
 get options(){return this.children.filter(c=>c.tagName==='OPTION')}get selectedOptions(){return this.options.filter(o=>o.value===this.value)}
 get innerHTML(){return ''}set innerHTML(v){this.children=[]}
 append(...n){for(const x of n)if(x&&typeof x==='object'){x.parentNode=this;this.children.push(x)}else if(x!=null)this.children.push(new El('#text'))._text=String(x)}
 prepend(...n){this.append(...n)}appendChild(x){this.append(x);return x}insertBefore(x){this.append(x);return x}replaceChildren(...n){this.children=[];this.append(...n)}
 remove(){}replaceWith(){}before(){}after(){}
 setAttribute(k,v){this.attributes[k]=String(v)}getAttribute(k){return k in this.attributes?this.attributes[k]:null}removeAttribute(k){delete this.attributes[k]}hasAttribute(k){return k in this.attributes}toggleAttribute(){}
 addEventListener(){}removeEventListener(){}dispatchEvent(){return true}
 querySelector(){return null}querySelectorAll(){return []}closest(){return null}contains(){return false}
 getBoundingClientRect(){return {top:0,bottom:100,left:0,right:100,width:100,height:100}}scrollIntoView(){}focus(){}blur(){}select(){}
 click(){if(this.onclick)return this.onclick({target:this,preventDefault(){}})}
 reportValidity(){return true}checkValidity(){return true}showModal(){this.open=true}close(){this.open=false}getContext(){return null}
}
function makeDoc(){const ids=new Map(),body=new El('body'),head=new El('head');
 return {ids,body,head,documentElement:new El('html'),activeElement:null,
  getElementById(id){if(!ids.has(id))ids.set(id,new El(/^(title|date|time|copy|contentChannel|timezone|variantChannel)$/.test(id)?'input':'div',id));return ids.get(id)},
  createElement:t=>new El(t),createElementNS:(n,t)=>new El(t),createTextNode:t=>{const n=new El('#text');n._text=String(t);return n},
  querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}}}

const PID='p1',FUTURE=(()=>{const d=new Date(Date.now()+10*86400000);return d.toISOString().slice(0,10)})();
// A shared plan with an approved brief and one approved content due in ten days: ready for Buffer.
function savedPlan(){const s=core.create({id:PID,name:'Forno Aurora',summary:'Pane a lievitazione naturale'});
 s.brief=Object.assign(s.brief,{goal:'Più ordini in negozio',audience:'Famiglie di Bergamo',channels:'Instagram'});for(const k of core.fields)s.brief[k]=s.brief[k]||'Dal brief: '+k;core.approveBrief(s);
 core.updateContent(s,{id:'c1',title:'Il pane del sabato',channel:'Instagram',date:FUTURE,time:'10:00',copy:'Il nostro pane esce dal forno alle 7.'});
 core.review(s,'c1','request');core.review(s,'c1','approve');return JSON.parse(JSON.stringify(s))}

async function boot({answer}){
 const doc=makeDoc(),asked=[],calls={ai:[],sent:[],fetch:[]};
 const ws={ConflictError:class extends Error{},ready:async()=>({id:'u1',name:'Ilaria'}),
  projects:{get:async()=>({id:PID,name:'Forno Aurora',kind:'agency',revision:1,profile:{}}),list:async()=>[],update:async()=>({revision:2})},
  bind:(pid,name)=>({load:async()=>name==='editorial'?savedPlan():null,save:async()=>({revision:2})}),
  publications:{list:async()=>[],send:async body=>{calls.sent.push(body);return {item:{id:'pub1',status:'scheduled',mode:body.mode,contentId:body.contentId,revision:body.revision}}}},
  approvals:{request:async()=>({id:'a1'}),decide:async()=>({id:'a1',status:'approved'})},memory:{propose:async()=>({})},integrations:{status:async()=>({})}};
 const rt={profileFor:()=>({}),reply:async o=>{calls.ai.push(o);return {text:'{"items":[]}'}},agents:[],roles:[]};
 const fetch=async url=>{calls.fetch.push(String(url));const u=String(url);
  if(u.includes('/api/buffer?action=channels'))return {ok:true,status:200,json:async()=>({channels:[{id:'ch1',name:'Instagram Forno Aurora',service:'instagram'}]})};
  return {ok:true,status:200,json:async()=>({})}};
 const sandbox={document:doc,console,fetch,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},queueMicrotask,URL,URLSearchParams,Blob:class{},AbortController,Intl,Date,Math,JSON,Promise,
  location:{search:'?project='+PID,hash:'#ped',pathname:'/project-editorial.html',origin:'https://radix.test',replace(){},href:''},
  history:{replaceState(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  crypto:{randomUUID:(()=>{let n=0;return ()=>'new-'+(++n)})()},Option:function(text,value){const o=new El('option');o._text=String(text);o.value=value==null?String(text):value;return o},
  Image:class{},requestAnimationFrame:f=>setTimeout(f,0),addEventListener(){},removeEventListener(){},getComputedStyle:()=>({getPropertyValue:()=>''}),
  RadixEditorial:core,RadixPedViews:pv,RadixPedResults:pr,RadixWorkspace:ws,RadixAgents:rt,
  RadixConfirm:{ask:async o=>{asked.push(o);return typeof answer==='function'?answer(o):answer}},
  confirm:()=>{throw Error('no native confirm on the PED page')}};
 sandbox.window=sandbox;sandbox.globalThis=sandbox;vm.createContext(sandbox);
 vm.runInContext(read('editorial-workspace.js'),sandbox,{filename:'editorial-workspace.js'});
 const $=id=>doc.getElementById(id);
 for(let i=0;i<40&&$('workspace').hidden!==false;i++)await new Promise(r=>setImmediate(r));
 await settle();
 assert.equal($('workspace').hidden,false,'the page loaded: '+$('message').textContent);
 return {doc,$,asked,calls,sandbox,set answer(v){answer=v}};
}
const settle=async(n=12)=>{for(let i=0;i<n;i++)await new Promise(r=>setImmediate(r))};

test('PED: «Annulla» on the Copywriter AI asks once and spends nothing; conferma calls the AI',async()=>{
 const p=await boot({answer:false});const {$,asked,calls}=p;const before=calls.ai.length;
 $('newContent').click();$('title').value='Pane del sabato';$('contentChannel').value='Instagram';
 await $('writeCopy').onclick();await settle();
 assert.equal(asked.length,1,'asked once');const o=asked[0];
 assert.equal(o.title,'Chiedere il testo al Copywriter AI?');assert.equal(o.ok,'Scrivi con l’AI');assert.match(o.cost,/crediti API/);
 assert.equal(calls.ai.length,before,'«Annulla»: no AI call');
 p.answer=true;await $('writeCopy').onclick();await settle(30);
 assert.equal(asked.length,2);assert.ok(calls.ai.length>before,'conferma: the Copywriter AI is called');assert.equal(calls.ai[before].role,'copywriter');
});

test('PED: the calendar proposal asks before the Social Media Manager AI; «Annulla» = no call',async()=>{
 const p=await boot({answer:false});const {$,asked,calls}=p;const before=calls.ai.length;
 await $('proposePlan').onclick({type:'click'});await settle();
 assert.equal(asked.length,1);assert.equal(asked[0].title,'Chiedere una proposta di calendario al Social Media Manager AI?');assert.equal(asked[0].ok,'Proponi il calendario');assert.match(asked[0].cost,/crediti API/);
 assert.equal(calls.ai.length,before,'nothing spent on «Annulla»');
 p.answer=true;await $('proposePlan').onclick({type:'click'});await settle(30);
 assert.equal(calls.ai.length,before+1,'exactly one AI call after the yes');assert.equal(calls.ai[before].role,'social-media-manager');
});

test('PED: Buffer scheduling sends nothing on «Annulla» and one post after the confirmation',async()=>{
 const p=await boot({answer:false});const {$,asked,calls}=p;
 await $('scheduleAll').onclick();await settle();
 assert.equal(asked.length,1,'asked once: '+$('message').textContent);const o=asked[0];
 assert.equal(o.title,'Programmare davvero su Buffer 1 contenuto approvato?');assert.equal(o.ok,'Programma su Buffer');assert.equal(o.tag,'Pubblicazione');
 assert.match(o.message,/Il pane del sabato/);assert.match(o.message,/Instagram Forno Aurora/);
 assert.equal(calls.sent.length,0,'«Annulla»: nothing sent to Buffer');
 p.answer=true;await $('scheduleAll').onclick();await settle(30);
 assert.equal(calls.sent.length,1,'conferma: one post sent');assert.equal(calls.sent[0].contentId,'c1');assert.equal(calls.sent[0].channelId,'ch1');assert.equal(calls.sent[0].mode,'scheduled');
 assert.equal(calls.ai.length,0,'no AI call on the way');
});

test('PED: leaving unsaved changes asks with a danger dialog; «Resta qui» keeps the open content',async()=>{
 const p=await boot({answer:false});const {$,asked}=p;
 $('newContent').click();$('title').value='Bozza in corso';$('contentForm').oninput({target:$('title')});
 $('newContent').click();await settle();
 assert.equal(asked.length,1);assert.equal(asked[0].tone,'danger');assert.equal(asked[0].ok,'Lascia senza salvare');assert.equal(asked[0].cancel,'Resta qui');
 assert.equal($('title').value,'Bozza in corso','«Resta qui»: the typed title stays');
 p.answer=true;$('newContent').click();await settle();
 assert.equal(asked.length,2);assert.equal($('title').value,'','«Lascia senza salvare»: a new empty content opens');
});

test('PED source: no native confirm left; every confirmation is awaited and comes before its AI call or Buffer send',()=>{
 const src=read('editorial-workspace.js');
 assert.ok(!/(?:^|[^.\w])confirm\(/m.test(src),'no bare confirm(');
 assert.equal((src.match(/window\.confirm\(/g)||[]).length,1,'the browser confirm only in the fallback helper');
 assert.match(src,/const askConfirm=o=>window\.RadixConfirm\?window\.RadixConfirm\.ask\(o\)/);
 for(const m of src.matchAll(/askConfirm\(/g)){const before=src.slice(Math.max(0,m.index-12),m.index);if(/const $/.test(before))continue;
  assert.ok(/await $/.test(before)||/^askConfirm\(\{title:'Lasciare le modifiche non salvate\?'/.test(src.slice(m.index)),'awaited (or .then for openContent): '+src.slice(m.index,m.index+70))}
 const n=(src.match(/askConfirm\(\{/g)||[]).length;assert.equal(n,21,'21 confirmations on the PED page');
 for(const t of src.matchAll(/askConfirm\(\{title:/g)){const o=src.slice(t.index,src.indexOf('})',t.index));assert.match(o,/ok:'[^']+'/,'a primary label: '+o.slice(0,80))}
 // the Buffer sends sit after their confirmation
 const single=src.indexOf("title:'Pubblicare davvero su Buffer?'");assert.ok(single>0&&single<src.indexOf('ws.publications.send(body)'));
 const bulk=src.indexOf("title:'Programmare davvero su Buffer '");assert.ok(bulk>0);assert.ok(src.indexOf('ws.publications.send(',bulk)>bulk);
 assert.match(src,/title:'Riprovare l’invio a Buffer\?'[^}]*tone:'danger'\}\)\)throw e;r=await ws\.publications\.send\(\{\.\.\.body,retryUncertain:true\}\)/);
 // the AI calls of the page all follow a confirmation (or run inside a flow that asked once: guided start, approve all)
 for(const [fn,title] of [['async function nextSteps','Chiedere i prossimi passi al Social Media Manager AI?'],['async function optimizePlan','Analizzare i risultati e ottimizzare i post in programma?'],['async function applyOptimizations','Applicare le modifiche ai post in programma?'],['async function writeCopy','Chiedere il testo al Copywriter AI?'],['async function writeAll','Scrivere '],['async function proposePlan','Chiedere una proposta di calendario al Social Media Manager AI?'],['async function fillBrief','Compilare il brief con l’AI?']]){
  const at=src.indexOf(fn);assert.ok(at>0,fn);const ask=src.indexOf("askConfirm({title:'"+title,at);assert.ok(ask>at,fn+': asks');
  const call=Math.min(...['rt.reply(','produceCopy(','produceSlides('].map(k=>src.indexOf(k,at)).filter(i=>i>0));assert.ok(ask<call,fn+': asks before the AI call')}
 assert.match(src,/mk\('Rimuovi',async\(\)=>\{if\(!await askConfirm\(\{title:'Rimuovere «'\+g\.name\+'»\?'[^}]*tone:'danger'\}\)\)return;/);
});

test('PED page loads the RADIX confirmation before the page script',()=>{
 const h=read('project-editorial.html');
 assert.match(h,/<script src="\/lib\/radix-confirm\.js"><\/script>/,'not deferred: ready before editorial-workspace.js');assert.match(h,/<link rel="stylesheet" href="\/shell\/radix-confirm\.css">/);
 assert.ok(h.indexOf('/lib/radix-confirm.js')<h.indexOf('src="editorial-workspace.js"'));
});

// ---- the other Marketing Agency pages ----
const PAGES={
 'agents.html':{script:'agents-page.js',n:3},
 'archive.html':{script:'archive-page.js',n:2},
 'project-profile.html':{script:'project-profile.js',n:2},
 'agency/new-project.html':{inline:true,n:2,also:'agency/new-project-steps.js'},
 'agency/project-workspace.html':{inline:true,n:7},
 'agency/clients.html':{inline:true,n:1},
 'agency/operations.html':{inline:true,n:1},
 'agency/memory.html':{inline:true,n:1},
 'agency/projects.html':{inline:true,n:1},
};
test('every Marketing Agency page loads the RADIX confirmation first and has no native confirm left',()=>{
 for(const [page,c] of Object.entries(PAGES)){const h=read(page);
  assert.match(h,/<script src="\/lib\/radix-confirm\.js"( defer)?><\/script>/,page);assert.match(h,/<link rel="stylesheet" href="\/shell\/radix-confirm\.css">/,page);
  const first=c.script?h.indexOf('/'+c.script):h.indexOf('<script>\n');assert.ok(first>0&&h.indexOf('/lib/radix-confirm.js')<first,page+': loaded before the script that uses it');
  const src=c.script?read(c.script):h;
  assert.ok(!/(?:^|[^.\w])confirm\(/m.test(src),page+': no bare confirm(');assert.equal((src.match(/window\.confirm\(/g)||[]).length,1,page+': the browser confirm only in the fallback helper');
  assert.equal((src.match(/await askConfirm\(\{|await askConfirm\(action/g)||[]).length,c.n,page+': confirmations, all awaited');
  for(const t of src.matchAll(/askConfirm\(\{title:/g)){const o=src.slice(t.index,src.indexOf('})',t.index));assert.match(o,/ok:'[^']+'/,page+': a primary label')}}
 const steps=read('agency/new-project-steps.js');assert.ok(!/root\.confirm\('/.test(steps));assert.match(steps,/if\(!await askConfirm\(\{title:'Chiedere tre proposte al Marketing Manager AI\?'/);
 assert.ok(steps.indexOf("askConfirm({title:'Chiedere tre proposte")<steps.indexOf("root.fetch('/api/chat'"),'asks before the AI call');
});

test('destructive actions use the danger tone (alertdialog); AI spends name their cost before the call',()=>{
 const danger={'agency/clients.html':'Elimina cliente','agency/operations.html':'Elimina attività','agency/memory.html':'Elimina memoria','agency/projects.html':'Elimina progetto','agency/project-workspace.html':'Elimina progetto','agents-page.js':'Cancella conversazione'};
 for(const [f,ok] of Object.entries(danger)){const src=read(f),i=src.indexOf("ok:'"+ok+"'");assert.ok(i>0,f+': '+ok);assert.match(src.slice(i,i+80),/tone:'danger'/,f+': danger tone')}
 const pw=read('agency/project-workspace.html');
 for(const [title,call] of [["Eseguire l’incarico di '","await execute(t)"],["Avviare insieme '","Promise.all(list.map(execute))"],["Chiedere il piano operativo all’Orchestratore Marketing?'","RadixAgents.reply("]]){
  const a=pw.indexOf("askConfirm({title:'"+title);assert.ok(a>0,title);assert.ok(pw.indexOf(call,a)>a,title+': confirm before the call');assert.match(pw.slice(a,pw.indexOf('})',a)),/cost:'[^']*crediti API/,title+': the cost')}
 const np=read('agency/new-project.html');
 for(const title of ['Chiedere un consiglio sui canali al Marketing Manager AI?','Chiedere il piano all’Orchestratore Marketing?']){const a=np.indexOf("askConfirm({title:'"+title);assert.ok(a>0&&np.indexOf('callAgent(',a)>a,title)}
 const ag=read('agents-page.js'),a=ag.indexOf("title:'Rigenerare il lavoro di '");assert.ok(a>0&&a<ag.indexOf('rt.rerunNode(',a),'regenerate asks before the call');
});

test('new project steps: «Annulla» on the three directions spends nothing, conferma makes one AI call',async()=>{
 const steps=require('../agency/new-project-steps.js');assert.equal(typeof steps.ideasPrompt,'function');
 // the click handler, driven with a fake page: only the confirmation decides whether /api/chat is called
 const src=read('agency/new-project-steps.js'),start=src.indexOf("$('proposeGoals').addEventListener('click',"),end=src.indexOf('finally{btn.disabled=false}});',start)+'finally{btn.disabled=false}});'.length;
 const handlerSrc=src.slice(start+"$('proposeGoals').addEventListener('click',".length,end-2);
 const els={};const $=id=>els[id]||(els[id]={id,value:'',textContent:'',disabled:false,focus(){},replaceChildren(){},append(){},querySelectorAll:()=>[]});
 let asked=[],answer=false,posts=0;
 const P=()=>({draftBrief:()=>({name:'Forno Aurora',industry:'Panificio'}),requireAuth:async()=>true,imageBlocks:()=>[],referenceText:()=>'',imageLabel:()=>''});
 const root={fetch:async(url)=>{posts++;return {ok:true,json:async()=>({reply:'{"ideas":[{"title":"A","goal":"g","audience":"a"}]}'})}}};
 const askConfirm=async o=>{asked.push(o);return answer};
 const handler=new Function('P','$','go','root','askConfirm','ideasPrompt','parseIdeas','doc','return '+handlerSrc)(P,$,()=>{},root,askConfirm,steps.ideasPrompt,steps.parseIdeas,{createElement:()=>({append(){},set textContent(v){},className:'',type:''})});
 await handler();assert.equal(asked.length,1);assert.equal(asked[0].ok,'Chiedi tre proposte');assert.match(asked[0].cost,/crediti API/);assert.equal(posts,0,'«Annulla»: no AI call');
 answer=true;await handler();assert.equal(posts,1,'conferma: one AI call');
});
