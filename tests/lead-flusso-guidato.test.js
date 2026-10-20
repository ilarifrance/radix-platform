'use strict';
// Guided flow of Lead Intelligence: 1 Acquisisci → 2 Rivedi i lead → 3 Porta nel CRM → 4 Email e newsletter.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('lead-intelligence.html','utf8'),flow=fs.readFileSync('sales/lead-flow.js','utf8'),tabs=fs.readFileSync('sales/lead-tabs.js','utf8');
const css=fs.readFileSync('sales/lead-flow.css','utf8'),workbench=fs.readFileSync('sales/lead-contact-workbench.js','utf8');

// The HTML between the opening tag that carries `attr` and its matching closing tag.
function block(attr){
 const at=html.indexOf(attr);assert.ok(at>0,attr);
 const start=html.lastIndexOf('<',at),tag=/^<([a-z]+)/.exec(html.slice(start))[1];
 const re=new RegExp('<'+tag+'[\\s>]|</'+tag+'>','g');re.lastIndex=start;let depth=0,m;
 while((m=re.exec(html))){depth+=m[0][1]==='/'?-1:1;if(!depth)return html.slice(start,m.index+m[0].length)}
 throw Error('unclosed '+attr);
}
const src=s=>html.indexOf('src="/sales/'+s+'"');

test('page loads the flow after the scripts it drives, self-hosted only',()=>{
 for(const s of ['lead-contact-workbench.js','lead-archive.js','lead-pipeline.js','lead-newsletter.js','lead-tabs.js'])assert.ok(src(s)>0&&src(s)<src('lead-flow.js'),s);
 assert.match(html,/<link rel="stylesheet" href="\/sales\/lead-flow\.css">/);
 assert.doesNotMatch(html,/<script>(?!<\/script>)/);assert.doesNotMatch(html,/<script(?![^>]*src="\/)[^>]*>/);
 assert.doesNotMatch(html+flow+css,/https?:\/\/(?:cdn|unpkg|fonts)\./);
 assert.doesNotThrow(()=>new vm.Script(flow));assert.doesNotThrow(()=>new vm.Script(tabs));
});

test('one workspace picker at the top, then the four steps',()=>{
 const head=block('id="lead-flow"');
 assert.equal((html.match(/id="archive-workspace"/g)||[]).length,1);
 assert.match(head,/<select id="archive-workspace"/);
 const labels=['Acquisisci','Rivedi i lead','Porta nel CRM','Email e newsletter'];
 labels.forEach((l,i)=>assert.match(head,new RegExp('data-go-step="'+(i+1)+'"><span class="lf-num" aria-hidden="true">'+(i+1)+'</span><span>'+l+'</span>')));
 assert.ok(html.indexOf('id="lead-flow"')<html.indexOf('id="lf-acquire"'));
 assert.ok(html.indexOf('id="lf-acquire"')<html.indexOf('id="lead-pipeline"'));
});

test('step 1 asks where the leads come from and keeps each mode together',()=>{
 const step=block('id="lf-acquire"');
 assert.match(step,/data-step="1"/);assert.match(step,/Da dove prendi i lead\?/);
 const cards={linkedin:'LinkedIn (estensione Chrome)',file:'File CSV/Excel',provider:'Provider (Captain Data / JSON)',backup:'Backup'};
 for(const [m,t] of Object.entries(cards)){assert.match(step,new RegExp('data-mode="'+m+'" aria-pressed="false">.*?<strong>'+t.replace(/[()/]/g,'\\$&')+'</strong>'));assert.match(step,new RegExp('data-mode-panel="'+m+'"[^>]* hidden>'))}
 const has={
  linkedin:['radix-extension-link','lf-jobs','lf-jobs-refresh','lf-ext-status','li-source-url','li-paste-rows','li-provider-file','li-agent-preview','li-company-add'],
  file:['file','sample','import-status','archive-list','archive-load','paste-text','li-enrich-file','li-public-lookup'],
  provider:['contact-api-status','contact-api-test','contact-file','contact-import','contact-job-select','contact-job-load','contact-job-save','contact-preview-rows'],
  backup:['contact-restore-file','contact-restore','lf-backup-status']
 };
 for(const [m,ids] of Object.entries(has)){const panel=block('data-mode-panel="'+m+'"');for(const id of ids)assert.ok(panel.includes('id="'+id+'"'),m+' → '+id)}
 // The LinkedIn panel explains the three steps and lists the imported jobs with one-click «Apri».
 const li=block('data-mode-panel="linkedin"');
 assert.match(li,/class="lf-howto"/);assert.equal((li.match(/<li>/g)||[]).length,3);
 assert.match(flow,/open=el\('button','Apri'/);
 assert.match(block('id="lf-acquire"'),/data-go-step="2">Rivedi i lead →/);
 assert.doesNotMatch(html,/data-panel="importa"/);
});

test('steps 2–4 reuse the existing sections; qualification and results stay reachable',()=>{
 assert.match(html,/<section class="lp" id="lead-pipeline" data-step="2"/);
 const bulk=block('data-panel="bulk"');assert.match(bulk,/data-step="3"/);assert.match(bulk,/id="bulk-crm"/);assert.match(bulk,/id="bulk-run"/);
 const bar=block('id="lp-tabs"');
 const expect={qualifica:2,risultati:2,bulk:3,crm:3,contatto:4,newsletter:4,campagne:4};
 for(const [t,s] of Object.entries(expect))assert.match(bar,new RegExp('data-tab="'+t+'" data-step="'+s+'"'));
 assert.match(bar,/data-tab="qualifica" data-step="2" data-toggle/);assert.match(bar,/data-tab="risultati" data-step="2" data-toggle/);
 // Every panel has a button that opens it.
 for(const p of new Set([...html.matchAll(/data-panel="([a-z]+)"/g)].map(m=>m[1])))assert.ok(bar.includes('data-tab="'+p+'"'),p);
 assert.match(block('data-panel="campagne"'),/href="\/sales-growth-campaigns\.html"/);
 assert.match(html,/id="lp-more-leads"/);
});

test('plain Italian copy where the flow was touched',()=>{
 for(const word of ['motore a lotti','WORKSPACE VAULT','DATA SOURCES','Preview isolato','workspace Preview','Archivio storico'])assert.ok(!html.includes(word),word);
 assert.doesNotMatch(workbench,/Preview isolato|workspace Preview|Archivio RADIX|Archivio Lead Intelligence/);
 assert.equal((html.match(/radix-extension-link/g)||[]).length,1);
});

test('mode memory is a try/catch convenience and other hashes are left alone',()=>{
 const uses=[...flow.matchAll(/localStorage/g)].length;assert.equal(uses,2);
 assert.match(flow,/get\(k\)\{try\{return window\.localStorage\.getItem\(k\)\|\|''\}catch\{return ''\}\}/);
 assert.match(flow,/set\(k,v\)\{try\{window\.localStorage\.setItem\(k,v\)\}catch\{\}\}/);
 assert.doesNotMatch(flow,/location\.hash\s*=|replaceState|pushState/);
 assert.doesNotMatch(flow,/sessionStorage|indexedDB/);
 // Storage never holds lead data: only the mode and the workspace id.
 assert.deepEqual([...flow.matchAll(/store\.set\((\w+)/g)].map(m=>m[1]).sort(),['KEY_MODE','KEY_WS']);
});

// ---- behaviour with a small DOM double ----
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
 mk('ul',{id:'lf-jobs'},panels.linkedin);mk('p',{id:'lf-jobs-status'},panels.linkedin);mk('p',{id:'lf-ext-status'},panels.linkedin);mk('button',{id:'lf-jobs-refresh'},panels.linkedin);
 mk('button',{id:'radix-extension-link'},panels.linkedin);
 const sel=mk('select',{id:'contact-job-select'},panels.provider);mk('option',{value:''},sel);
 mk('button',{id:'contact-job-list'},panels.provider);mk('button',{id:'contact-job-load'},panels.provider);mk('p',{id:'contact-job-status'},panels.provider);
 mk('section',{id:'lead-pipeline','data-step':'2'},main);
 const bar=mk('nav',{id:'lp-tabs','data-step':'2 3 4'},main);
 const tabDefs={qualifica:2,risultati:2,bulk:3,crm:3,contatto:4,newsletter:4,campagne:4};
 for(const [t,s] of Object.entries(tabDefs))mk('button',{'data-tab':t,'data-step':String(s),...(s===2?{'data-toggle':''}:{})},bar);
 const bulkWrap=mk('div',{'data-step':'3','data-panel':'bulk'},main);mk('section',{id:'bulk-crm',hidden:''},bulkWrap);
 for(const p of ['qualifica','risultati','crm','contatto','newsletter','campagne'])mk('section',{'data-panel':p,id:'panel-'+p},main);
 mk('section',{id:'lead-icp'},all.find(n=>n.id==='panel-qualifica'));
 const lpCrm=mk('button',{id:'lp-crm'},main);
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

test('flow shows one step and one mode at a time',()=>{
 const d=dom();d.run();const F=d.window.RadixLeadFlow;
 assert.equal(F.step(),1);assert.equal(F.mode(),'linkedin');
 assert.ok(d.visible(d.panels.linkedin));assert.ok(!d.visible(d.panels.file));assert.ok(!d.visible(d.get('lead-pipeline')));
 d.all.find(n=>n.attrs['data-mode']==='backup').click();
 assert.equal(F.mode(),'backup');assert.ok(d.visible(d.panels.backup));assert.ok(!d.visible(d.panels.linkedin));
 assert.equal(d.storage.get('radix.leadFlow.mode'),'backup');
 d.all.find(n=>n.attrs['data-go-step']==='2').click();
 assert.equal(F.step(),2);assert.ok(d.visible(d.get('lead-pipeline')));assert.ok(!d.visible(d.get('lf-acquire')));
 assert.equal(d.all.find(n=>n.attrs['data-go-step']==='2').attrs['aria-current'],'step');
 // Step 2 shows only the list; ICP opens on demand and closes again.
 assert.ok(!d.visible(d.get('panel-qualifica')));
 const icp=d.all.find(n=>n.attrs['data-tab']==='qualifica');icp.click();assert.ok(d.visible(d.get('panel-qualifica')));icp.click();assert.ok(!d.visible(d.get('panel-qualifica')));
 assert.ok(!d.visible(d.all.find(n=>n.attrs['data-tab']==='newsletter')));
 // Step 3 opens the existing bulk flow through «Porta nel CRM»; step 4 defaults to email.
 let opened=0;d.lpCrm.addEventListener('click',()=>{opened++;d.bulk.hidden=false});
 d.all.find(n=>n.attrs['data-go-step']==='3').click();assert.equal(F.step(),3);assert.equal(opened,1);assert.ok(d.visible(d.bulk));
 d.all.find(n=>n.attrs['data-go-step']==='4').click();assert.equal(F.step(),4);assert.ok(d.visible(d.get('panel-contatto')));assert.ok(!d.visible(d.bulk));
});

test('remembered mode, #mode deep link and a broken storage',()=>{
 let d=dom();d.storage.set('radix.leadFlow.mode','file');d.run();assert.equal(d.window.RadixLeadFlow.mode(),'file');
 d=dom();d.setHash('#mode=provider');d.run();assert.equal(d.window.RadixLeadFlow.mode(),'provider');assert.equal(d.window.RadixLeadFlow.step(),1);
 d.setHash('#step=4');d.hashchange();assert.equal(d.window.RadixLeadFlow.step(),4);
 d=dom();d.window.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 assert.doesNotThrow(()=>d.run());assert.equal(d.window.RadixLeadFlow.mode(),'linkedin');
 assert.doesNotThrow(()=>d.all.find(n=>n.attrs['data-mode']==='file').click());
});

test('#lead-job link selects LinkedIn and step 2 without consuming the hash',()=>{
 const d=dom();d.storage.set('radix.leadFlow.mode','file');
 d.setHash('#lead-job=00000000-0000-4000-8000-000000000001&ws=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');d.run();
 assert.equal(d.window.RadixLeadFlow.mode(),'linkedin');assert.equal(d.window.RadixLeadFlow.step(),2);
 assert.equal(d.storage.get('radix.leadFlow.mode'),'file');
});

test('old in-page links open the right mode or tool',()=>{
 const d=dom();d.setHash('#radix-extension-link');d.run();
 assert.equal(d.window.RadixLeadFlow.mode(),'linkedin');assert.equal(d.window.RadixLeadFlow.step(),1);
 d.setHash('#lead-icp');d.hashchange();assert.equal(d.window.RadixLeadFlow.step(),2);assert.ok(d.visible(d.get('lead-icp')));
});

test('opening a LinkedIn job reuses «Apri lavoro» and moves to step 2',()=>{
 const d=dom();d.run();
 const sel=d.get('contact-job-select');
 const opt=new (d.all[0].constructor)('option',{value:'11111111-1111-4111-8111-111111111111'});opt.textContent='LinkedIn Sales Navigator · 20/10/2026 09:41 · 12 contatti · 12 contatti · v1';sel.append(opt);
 const other=new (d.all[0].constructor)('option',{value:'22222222-2222-4222-8222-222222222222'});other.textContent='Captain Data · fiera · 5 contatti · v2';sel.append(other);
 // No workspace yet: nothing listed.
 assert.equal(d.get('lf-jobs').children.length,0);
 const ws=d.get('archive-workspace');const o=new (d.all[0].constructor)('option',{value:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});ws.append(o);ws.value=o.attrs.value;
 let listed=0;d.get('contact-job-list').addEventListener('click',()=>listed++);
 ws.dispatchEvent({type:'change'});
 assert.equal(listed,1,'the job list refreshes when the workspace is set');
 d.mutate(sel);
 assert.equal(d.storage.get('radix.leadFlow.workspace'),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 const items=d.get('lf-jobs').children;assert.equal(items.length,1,'only LinkedIn jobs');
 assert.equal(items[0].children[1].children[0].textContent,'20/10/2026 09:41');
 assert.equal(items[0].children[1].children[1].textContent,'12 contatti');
 assert.match(d.get('lf-jobs-status').textContent,/un’altra lista salvata/);
 let loaded='';d.get('contact-job-load').addEventListener('click',()=>{loaded=sel.value});
 items[0].children[2].click();
 assert.equal(loaded,'11111111-1111-4111-8111-111111111111');
 assert.equal(d.window.RadixLeadFlow.step(),1);
 d.fire('radix:lead-contacts-updated',{count:12});
 assert.equal(d.window.RadixLeadFlow.step(),2);
 // A later refresh of the contacts (not after «Apri») does not move the page.
 d.all.find(n=>n.attrs['data-go-step']==='1').click();d.fire('radix:lead-contacts-updated',{count:12});assert.equal(d.window.RadixLeadFlow.step(),1);
});

test('the other workspace pickers follow the top one',()=>{
 for(const [f,needle] of [['sales/lead-pipeline.js',"window.RadixLeadFlow?.preferWorkspace(sel)"],['sales/lead-crm-handoff.js',"window.RadixLeadFlow?.preferWorkspace(select)"],['sales/lead-newsletter.js',"window.RadixLeadFlow?.preferWorkspace($('nl-workspace'))"]])
  assert.ok(fs.readFileSync(f,'utf8').includes(needle),f);
 assert.match(flow,/const FOLLOWERS=\['bulk-workspace','sync-workspace','nl-workspace'\];/);assert.match(flow,/for\(const id of FOLLOWERS\)\{/);
});
