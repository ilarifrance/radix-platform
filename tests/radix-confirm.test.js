// The one RADIX confirmation (lib/radix-confirm.js) before every AI call, credit spend, publication or send of the
// Marketing studios: the dialog itself on a small fake DOM, its fallback without a DOM, and every studio driven by a
// click with a fake confirmation and a fake AI: «Annulla» = no call, conferma = exactly one call. Never a real call.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const RC=require('../lib/radix-confirm.js');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const NodeURL=URL;

// ---- a small fake DOM: enough for the dialog and the studio widgets ----
function makeDom(){
 const doc={activeElement:null};
 class Ev{constructor(type,init={}){Object.assign(this,init);this.type=type;this.defaultPrevented=false}preventDefault(){this.defaultPrevented=true}stopPropagation(){}}
 class Node{constructor(tag){this.tagName=String(tag).toUpperCase();this.nodeName=this.tagName;this.children=[];this.parentNode=null;this.attributes={};this.dataset={};this.style={setProperty(){},removeProperty(){}};
   this._text='';this.hidden=false;this.value='';this.checked=false;this.disabled=false;this.listeners={};this.className='';this.files=[];this.open=false;this.returnValue='';this.ownerDocument=doc;
   const self=this;this.classList={add:(...c)=>{const s=new Set(self.className.split(/\s+/).filter(Boolean));c.forEach(x=>s.add(x));self.className=[...s].join(' ')},remove:(...c)=>{self.className=self.className.split(/\s+/).filter(x=>x&&!c.includes(x)).join(' ')},
    toggle:(c,on)=>{const has=self.classList.contains(c);if(on===undefined)on=!has;on?self.classList.add(c):self.classList.remove(c);return on},contains:c=>self.className.split(/\s+/).includes(c)}}
  get id(){return this.attributes.id||''}set id(v){this.attributes.id=String(v)}
  get type(){return this.attributes.type||(this.tagName==='INPUT'?'text':'')}set type(v){this.attributes.type=String(v)}
  get name(){return this.attributes.name||''}set name(v){this.attributes.name=String(v)}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
  set textContent(v){this._text=v==null?'':String(v);this.children.forEach(c=>c.parentNode=null);this.children=[]}
  get innerText(){return this.textContent}set innerText(v){this.textContent=v}
  get isConnected(){let n=this;while(n.parentNode)n=n.parentNode;return n===doc.body||n===doc.head||n===doc.documentElement}
  get firstChild(){return this.children[0]||null}get lastChild(){return this.children[this.children.length-1]||null}get firstElementChild(){return this.firstChild}get lastElementChild(){return this.lastChild}
  get childElementCount(){return this.children.length}get childNodes(){return this.children}
  get parentElement(){return this.parentNode}get nextElementSibling(){const p=this.parentNode;return p?p.children[p.children.indexOf(this)+1]||null:null}get previousElementSibling(){const p=this.parentNode;return p?p.children[p.children.indexOf(this)-1]||null:null}
  get options(){return this.children.filter(c=>c.tagName==='OPTION')}get selectedIndex(){return Math.max(0,this.options.findIndex(o=>o.value===this.value))}
  _adopt(n){if(n==null)return null;if(typeof n==='string'){const t=new Node('#text');t._text=n;n=t}if(n.parentNode)n.parentNode.removeChild(n);n.parentNode=this;return n}
  append(...ns){ns.forEach(n=>{n=this._adopt(n);if(n)this.children.push(n);if(n&&this.tagName==='SELECT'&&!this.value&&n.tagName==='OPTION')this.value=n.value})}
  appendChild(n){this.append(n);return n}prepend(...ns){ns.reverse().forEach(n=>{n=this._adopt(n);if(n)this.children.unshift(n)})}
  insertBefore(n,ref){n=this._adopt(n);const i=ref?this.children.indexOf(ref):-1;i<0?this.children.push(n):this.children.splice(i,0,n);return n}
  removeChild(n){const i=this.children.indexOf(n);if(i>=0)this.children.splice(i,1);n.parentNode=null;return n}
  replaceChildren(...ns){this._text='';this.children.forEach(c=>c.parentNode=null);this.children=[];this.append(...ns)}
  replaceWith(...ns){const p=this.parentNode;if(!p)return;const i=p.children.indexOf(this);p.removeChild(this);ns.forEach((n,k)=>{n=p._adopt(n);p.children.splice(i+k,0,n)})}
  before(...ns){const p=this.parentNode;if(!p)return;ns.forEach(n=>p.insertBefore(n,this))}after(...ns){const p=this.parentNode;if(!p)return;const nx=this.nextElementSibling;ns.forEach(n=>p.insertBefore(n,nx))}
  remove(){if(this.parentNode)this.parentNode.removeChild(this)}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.className=String(v)}getAttribute(k){return k==='class'?this.className:(k in this.attributes?this.attributes[k]:null)}hasAttribute(k){return k in this.attributes}removeAttribute(k){delete this.attributes[k]}toggleAttribute(k,on){if(on===undefined)on=!(k in this.attributes);on?this.attributes[k]='':delete this.attributes[k];return on}
  addEventListener(t,f){(this.listeners[t]=this.listeners[t]||[]).push(f)}removeEventListener(t,f){this.listeners[t]=(this.listeners[t]||[]).filter(x=>x!==f)}
  dispatchEvent(e){if(!e.target)e.target=this;const fs=[...(this.listeners[e.type]||[])];if(this['on'+e.type])fs.push(this['on'+e.type].bind(this));fs.forEach(f=>f(e));if(this.parentNode&&e.bubbles!==false&&e.type!=='close'&&e.type!=='cancel')this.parentNode.dispatchEvent(e);return !e.defaultPrevented}
  click(){if(this.disabled)return;if(this.tagName==='INPUT'&&/radio|checkbox/.test(this.type))this.checked=this.type==='radio'?true:!this.checked;const r=this.onclick&&this.onclick({type:'click',target:this,preventDefault(){},stopPropagation(){}});(this.listeners.click||[]).forEach(f=>f({type:'click',target:this,preventDefault(){},stopPropagation(){}}));return r}
  focus(){doc.activeElement=this}blur(){if(doc.activeElement===this)doc.activeElement=null}select(){}scrollIntoView(){}setSelectionRange(){}
  getBoundingClientRect(){return {top:0,left:0,width:100,height:20,bottom:20,right:100}}
  getContext(){return new Proxy({},{get:(t,k)=>k in t?t[k]:(k==='measureText'?()=>({width:10}):k==='getImageData'?()=>({data:new Uint8ClampedArray(4)}):()=>{}),set:(t,k,v)=>{t[k]=v;return true}})}toDataURL(){return 'data:image/jpeg;base64,AA=='}
  contains(n){while(n){if(n===this)return true;n=n.parentNode}return false}
  matches(sel){return sel.split(',').some(s=>matchOne(this,s.trim()))}
  closest(sel){let n=this;while(n){if(n.matches&&n.matches(sel))return n;n=n.parentNode}return null}
  querySelectorAll(sel){const out=[];const walk=n=>n.children.forEach(c=>{if(c.tagName!=='#TEXT'){if(c.matches(sel))out.push(c);walk(c)}});walk(this);return out}
  querySelector(sel){return this.querySelectorAll(sel)[0]||null}
  showModal(){this.open=true}close(v){if(!this.open)return;this.open=false;if(v!==undefined)this.returnValue=v;this.dispatchEvent(new Ev('close',{bubbles:false}))}}
 function matchOne(n,s){const last=s.split(/\s+|>/).filter(Boolean).pop();if(!last)return false;
  const m=last.match(/^([a-zA-Z0-9]*)((?:[.#][\w-]+|\[[^\]]+\]|:not\([^)]*\))*)$/);if(!m)return false;
  if(m[1]&&n.tagName!==m[1].toUpperCase())return false;
  for(const part of m[2].match(/[.#][\w-]+|\[[^\]]+\]|:not\([^)]*\)/g)||[]){
   if(part[0]==='.'){if(!n.classList.contains(part.slice(1)))return false}
   else if(part[0]==='#'){if(n.id!==part.slice(1))return false}
   else if(part.startsWith(':not(')){if(matchOne(n,part.slice(5,-1)))return false}
   else{const a=part.slice(1,-1).match(/^([\w-]+)(?:([$^*]?=)"?([^"]*)"?)?$/);if(!a)return false;const v=a[1]==='disabled'?(n.disabled?'':null):a[1]==='type'?n.type:n.getAttribute(a[1]);if(v==null)return false;
    if(a[2]==='='&&v!==a[3])return false;if(a[2]==='$='&&!v.endsWith(a[3]))return false;if(a[2]==='^='&&!v.startsWith(a[3]))return false;if(a[2]==='*='&&!v.includes(a[3]))return false}}
  return true}
 doc.createElement=t=>new Node(t);doc.createElementNS=(ns,t)=>new Node(t);doc.createTextNode=t=>{const n=new Node('#text');n._text=String(t);return n};
 doc.createDocumentFragment=()=>new Node('#fragment');
 doc.documentElement=new Node('html');doc.head=new Node('head');doc.body=new Node('body');doc.documentElement.append(doc.head,doc.body);
 doc.querySelector=s=>doc.documentElement.querySelector(s);doc.querySelectorAll=s=>doc.documentElement.querySelectorAll(s);doc.getElementById=id=>doc.documentElement.querySelector('#'+id);
 doc.addEventListener=()=>{};doc.removeEventListener=()=>{};
 return {doc,Ev,Node}}
const all=(n,out=[])=>{out.push(n);(n.children||[]).forEach(c=>all(c,out));return out};
const find=(n,pred)=>all(n).find(pred);
const tick=async(k=3)=>{for(let i=0;i<k;i++)await new Promise(r=>setImmediate(r))};
// Swap globals for one test and restore them after.
async function withGlobals(vals,fn){const before={};for(const k in vals){before[k]=Object.getOwnPropertyDescriptor(globalThis,k);globalThis[k]=vals[k]}
 try{return await fn()}finally{for(const k in vals){if(before[k])Object.defineProperty(globalThis,k,before[k]);else delete globalThis[k]}}}

// ---- the dialog ----
test('without a DOM it falls back to root.confirm with the same text; no confirm at all means no',async()=>{
 const o={title:'Preparare 3 proposte?',cost:'È una sola chiamata AI: usa crediti API.',message:'Riga uno\nRiga due',facts:[['Prodotti',3]]};
 assert.equal(RC.textOf(o),'Preparare 3 proposte?\nProdotti: 3\nÈ una sola chiamata AI: usa crediti API.\nRiga uno\nRiga due');
 assert.equal(RC.textOf('Solo titolo'),'Solo titolo');
 let asked=[];
 await withGlobals({document:undefined,confirm:m=>{asked.push(m);return true}},async()=>{assert.equal(await RC.ask(o),true)});
 await withGlobals({document:undefined,confirm:m=>{asked.push(m);return false}},async()=>{assert.equal(await RC.ask(o),false)});
 assert.deepEqual(asked,[RC.textOf(o),RC.textOf(o)]);
 await withGlobals({document:undefined,confirm:undefined},async()=>{assert.equal(await RC.ask(o),false,'never a silent yes')});
 // a document without <dialog> support (old browser, tests): the same fallback
 const {doc}=makeDom();doc.createElement=()=>({});
 await withGlobals({document:doc,confirm:()=>true},async()=>{assert.equal(await RC.ask(o),true)});
});

function openDialog(o){const {doc,Ev}=makeDom();const opener=doc.createElement('button');doc.body.append(opener);opener.focus();
 const p=withGlobals({document:doc,confirm:()=>{throw Error('no native confirm when the dialog works')}},()=>RC.ask(o));
 const dlg=find(doc.body,n=>n.tagName==='DIALOG');return {doc,Ev,dlg,p,opener,yes:find(dlg,n=>n.className==='rx-confirm-yes'),no:find(dlg,n=>n.className==='rx-confirm-no')}}
const key=(D,k,target,extra={})=>{const e=new D.Ev('keydown',{key:k,bubbles:true,...extra});(target||D.doc.activeElement).dispatchEvent(e);return e};

test('the dialog: title, cost line, message, facts, Annulla and the primary button; modal and labelled',async()=>{
 const D=openDialog({title:'Generare 1 foto con Higgsfield per «Lancio»?',cost:'È 1 generazione: consuma il saldo API di Higgsfield.',message:'Nessun’altra spesa.',facts:[['Formato','1:1']],ok:'Genera la foto'});
 const {dlg,doc,yes,no}=D;
 assert.ok(dlg.open,'showModal');assert.equal(dlg.className,'rx-confirm');assert.equal(dlg.getAttribute('role'),'dialog');assert.equal(dlg.getAttribute('aria-modal'),'true');
 const title=doc.getElementById(dlg.getAttribute('aria-labelledby'));assert.equal(title.textContent,'Generare 1 foto con Higgsfield per «Lancio»?');
 const body=doc.getElementById(dlg.getAttribute('aria-describedby'));assert.match(body.textContent,/CostoÈ 1 generazione: consuma il saldo API di Higgsfield\./);assert.match(body.textContent,/Nessun’altra spesa\./);assert.match(body.textContent,/Formato1:1/);
 assert.equal(no.textContent,'Annulla');assert.equal(yes.textContent,'Genera la foto');assert.equal(yes.type,'button');assert.equal(no.type,'button');
 assert.equal(doc.activeElement,yes,'focus on the primary button');
 assert.ok(doc.head.querySelector('link[data-rx-confirm]'),'the stylesheet is linked once');assert.equal(doc.head.querySelector('link[data-rx-confirm]').href,'/shell/radix-confirm.css');
 yes.click();assert.equal(await D.p,true);assert.equal(find(doc.body,n=>n.tagName==='DIALOG'),undefined,'removed');assert.equal(doc.activeElement,D.opener,'focus back where it was');
});

test('Annulla, Esc, the backdrop and Enter on «Annulla» say no; Enter says yes; one answer only',async()=>{
 let D=openDialog({title:'A?'});D.no.click();assert.equal(await D.p,false);
 D=openDialog({title:'A?'});const esc=key(D,'Escape');assert.ok(esc.defaultPrevented);assert.equal(await D.p,false);
 D=openDialog({title:'A?'});D.dlg.dispatchEvent(new D.Ev('cancel'));assert.equal(await D.p,false,'the native Esc (cancel event)');
 D=openDialog({title:'A?'});D.dlg.dispatchEvent(new D.Ev('click',{target:D.dlg}));assert.equal(await D.p,false,'click on the backdrop');
 D=openDialog({title:'A?'});key(D,'Enter');assert.equal(await D.p,true);
 D=openDialog({title:'A?'});D.no.focus();key(D,'Enter');assert.equal(await D.p,false,'Enter on Annulla cancels');
 D=openDialog({title:'A?'});key(D,'Enter',undefined,{isComposing:true});D.no.click();assert.equal(await D.p,false,'Enter while composing text does nothing');
 D=openDialog({title:'A?'});D.yes.click();D.no.click();assert.equal(await D.p,true,'the first answer wins');
 D=openDialog({title:'Eliminare?',tone:'danger',cancel:'Tieni',ok:'Elimina'});assert.equal(D.dlg.getAttribute('role'),'alertdialog');assert.match(D.dlg.className,/rx-confirm--danger/);assert.equal(D.no.textContent,'Tieni');D.no.click();assert.equal(await D.p,false);
});

test('Tab stays inside the dialog',async()=>{
 const D=openDialog({title:'A?',cost:'B'});
 assert.equal(D.doc.activeElement,D.yes);let e=key(D,'Tab');assert.ok(e.defaultPrevented);assert.equal(D.doc.activeElement,D.no,'from the last to the first');
 e=key(D,'Tab',undefined,{shiftKey:true});assert.ok(e.defaultPrevented);assert.equal(D.doc.activeElement,D.yes,'from the first back to the last');
 D.no.click();await D.p;
});

test('the stylesheet: same tokens as the studios, 390px layout, focus ring, reduced motion',()=>{
 const css=read('shell/radix-confirm.css');
 for(const s of ['.rx-confirm{','.rx-confirm::backdrop','.rx-confirm-title','.rx-confirm-cost','.rx-confirm-tag','.rx-confirm-actions','.rx-confirm-yes','.rx-confirm-no','focus-visible','prefers-reduced-motion','@media (max-width:480px)','width:min(480px,calc(100vw - 32px))'])assert.ok(css.includes(s),s);
 // the Marketing look «A»: each token reads shell/marketing-a.css with the same value as fallback; white text on the gradient
 assert.match(css,/--rc-ink:var\(--ma-tx,#e9edff\)/);assert.match(css,/--rc-amber:var\(--ma-warn,#f4b552\)/);assert.match(css,/--rc-btn:var\(--ma-btn,linear-gradient\(135deg,#6a5cff,#3f7bff\)\)/);
 assert.match(css,/\.rx-confirm-yes\{[^}]*background:var\(--rc-btn\);color:#fff/);assert.ok(!/ff5fa2|255,95,162/.test(css),'no Marketing pink left');
 assert.ok(!/https?:\/\//.test(css+read('lib/radix-confirm.js')),'nothing external');
});

test('every page with a studio loads the confirmation before the studios; no native confirm left in the studios',()=>{
 for(const p of ['agency/crea.html','agents.html','commercial/index.html','project-editorial.html','agency/avatar.html']){const h=read(p);
  assert.match(h,/<script src="\/lib\/radix-confirm\.js"( defer)?><\/script>/,p);assert.match(h,/<link rel="stylesheet" href="\/shell\/radix-confirm\.css">/,p);
  const first=Math.min(...['/lib/radix-agent-media.js','/lib/image-studio.js','/agency/avatar.js'].map(s=>h.indexOf(s)).filter(i=>i>=0));assert.ok(h.indexOf('/lib/radix-confirm.js')<first,p)}
 const files=['ad-studio','copy-studio','gbp-studio','identity-studio','image-studio','newsletter-studio','product-studio','product-photo-studio','reel-studio','seo-results','seo-studio','site-audit','site-studio','translation-studio','video-studio','radix-agent-media'].map(f=>'lib/'+f+'.js').concat('agency/avatar.js');
 for(const f of files){const src=read(f);
  assert.ok(!/(?:root|window)\.confirm\('|[^.\w]confirm\('/.test(src),f+': no native confirm with a message');
  assert.ok(/const askConfirm=o=>/.test(src),f+': the shared helper');
  // every confirmation is awaited and stops the step on «Annulla»
  for(const m of src.matchAll(/askConfirm\(/g)){const before=src.slice(Math.max(0,m.index-12),m.index);if(/const $/.test(before))continue;assert.match(before,/await $|return $/,f+': awaited')}}
});

// ---- every studio, driven by a click: «Annulla» = no AI call, conferma = exactly one call ----
const FILL='Forno Aurora, pane a lievitazione naturale a Bergamo dal 1960: pane, focacce e dolci per famiglie e uffici della zona.';
function fill(w){for(const n of all(w)){if(n.tagName==='TEXTAREA'||(n.tagName==='INPUT'&&/^(text|url|email|search|tel)$/.test(n.type)))if(!n.value)n.value=/www\.|https?:|^url$/i.test((n.placeholder||'')+' '+n.type+' '+(n.inputMode||''))?'https://www.fornoaurora.it':FILL}
 for(const n of all(w))if(n.tagName==='INPUT'&&n.type==='radio'&&!all(w).some(r=>r.tagName==='INPUT'&&r.type==='radio'&&r.name===n.name&&r.checked))n.click()}
const project={name:'Forno Aurora',sector:'Panificio artigianale',city:'Bergamo',offer:'Pane a lievitazione naturale',audience:'Famiglie e uffici',links:'https://www.fornoaurora.it',tone:'Caldo',facts:'Dal 1960'};
const CASES=[
 {file:'copy-studio',make:S=>S.copyStudio({service:'naming',project,memoryScope:{projectId:'p1'}}),go:/^Prepara 3 proposte|Prepara le proposte|^Prepara/},
 {file:'seo-studio',make:S=>S.seoStudio({project,memoryScope:{projectId:'p1'}}),go:/^Prepara/},
 {file:'site-studio',make:S=>S.siteStudio({project,memoryScope:{projectId:'p1'}}),go:/^Prepara/},
 {file:'video-studio',make:S=>S.videoStudio({project,memoryScope:{projectId:'p1'},avatar:{id:'a1',name:'Anna'}}),go:/^Scrivi|^Prepara/},
 {file:'identity-studio',make:S=>S.identityStudio({project,memoryScope:{projectId:'p1'}}),go:/^Prepara/},
 {file:'reel-studio',make:S=>S.reelStudio({project,memoryScope:{projectId:'p1'}}),go:/^Prepara/,prep:async w=>{const f=find(w,n=>n.tagName==='INPUT'&&n.type==='file');f.files=[{name:'pane.jpg',type:'image/jpeg',size:2048}];await f.onchange()}},
 {file:'ad-studio',make:S=>S.adStudio({project,memoryScope:{projectId:'p1'}}),go:/^Prepara/},
 {file:'gbp-studio',make:S=>S.gbpStudio({project,memoryScope:{projectId:'p1'}}),go:/^Prepara/},
 {file:'translation-studio',make:S=>S.translationStudio({project}),go:/^Prova 3 toni/},
];
for(const c of CASES)test(c.file+': the AI call starts only after the click and the RADIX confirmation',async()=>{
 const S=require('../lib/'+c.file+'.js');let asked=[],answer=false,calls=0;
 const {doc}=makeDom();
 await withGlobals({document:doc,RadixConfirm:{ask:async o=>{asked.push(o);return answer}},confirm:()=>{throw Error('no native confirm')},
  RadixAgents:{reply:async()=>{calls++;return {text:'non valido'}},roles:[],agents:[]},requestAnimationFrame:f=>setImmediate(f),Image:class{set src(v){this._src=v;this.naturalWidth=1200;this.naturalHeight=1600;this.width=1200;this.height=1600;setImmediate(()=>this.onload&&this.onload())}get src(){return this._src}},getComputedStyle:()=>({getPropertyValue:()=>''}),
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},URL:Object.assign(class extends NodeURL{},{createObjectURL:()=>'blob:x',revokeObjectURL(){}})},async()=>{
  const w=c.make(S);doc.body.append(w);await tick();if(c.prep)await c.prep(w);fill(w);
  const go=()=>find(w,n=>n.tagName==='BUTTON'&&!n.disabled&&c.go.test(n.textContent.trim())&&/primary/.test(n.className));
  assert.ok(go(),c.file+': the go button');assert.equal(calls,0,'nothing before the click');
  await go().onclick();await tick();
  assert.equal(asked.length,1,c.file+': asked once · '+(find(w,n=>/tool-status/.test(n.className))||{textContent:''}).textContent);assert.match(asked[0].cost||'',/crediti|saldo/,c.file+': the cost line');assert.ok(asked[0].title&&asked[0].ok,c.file+': title and primary label');
  assert.equal(calls,0,c.file+': «Annulla» spends nothing');
  answer=true;await go().onclick();await tick(6);
  assert.equal(asked.length,2);assert.equal(calls,1,c.file+': exactly one AI call after the yes');
 });
});

test('translation-studio: 3 tones, then the rest in batches; Annulla = no call, conferma = exactly one call per batch',async()=>{
 const S=require('../lib/translation-studio.js');let asked=[],answer=true;const calls=[];
 const tr=(list,langs,tag)=>list.map(x=>Object.assign({id:x.id},...langs.map(l=>({[l]:x.testo+' ['+l+(tag?' '+tag:'')+']'}))));
 const reply=async({messages})=>{const p=messages[0].content,lines=p.split('\n'),list=JSON.parse(lines[lines.findIndex(l=>/^I testi( di questo lotto)? \(JSON\):$/.test(l))+1]);calls.push(p);
  const langs=/^Traduci dall’italiano in: (.+)\.$/m.exec(p)[1].split('; ').map(x=>x.slice(0,2).toLowerCase());
  return {text:/3 toni diversi/.test(p)?JSON.stringify({toni:['Fedele','Naturale','Marketing'].map(t=>({tono:t,traduzioni:tr(list,langs,t)}))}):JSON.stringify({traduzioni:tr(list,langs)})}};
 const {doc}=makeDom();
 await withGlobals({document:doc,RadixConfirm:{ask:async o=>{asked.push(o);return answer}},confirm:()=>{throw Error('no native confirm')},RadixAgents:{reply},requestAnimationFrame:f=>setImmediate(f)},async()=>{
  const w=S.translationStudio({project});doc.body.append(w);await tick();
  const btn=re=>find(w,n=>n.tagName==='BUTTON'&&!n.disabled&&re.test(n.textContent.trim()));
  const de=find(w,n=>n.tagName==='INPUT'&&n.type==='checkbox'&&n.value==='de');de.checked=true;de.onchange();
  const ta=find(w,n=>n.tagName==='TEXTAREA'&&n.getAttribute('aria-label')==='Il testo da tradurre');
  ta.value=Array.from({length:25},(_,i)=>'Paragrafo '+(i+1)+': il pane AUR-'+String(i+1).padStart(3,'0')+' costa 4,50 € al chilo.').join('\n\n');
  assert.equal(calls.length,0,'nothing on load');
  answer=false;await btn(/^Prova 3 toni/).onclick();await tick();assert.equal(asked.length,1);assert.equal(calls.length,0,'Annulla: no call');
  answer=true;await btn(/^Prova 3 toni/).onclick();await tick(6);assert.equal(asked.length,2);assert.equal(calls.length,1,'the tones: one call');
  assert.ok(!calls[0].includes('AUR-001'),'codes never sent');
  assert.ok(btn(/^Usa il tono Naturale$/),'three tones to choose from');btn(/^Usa il tono Naturale$/).onclick();await tick();
  const go=()=>btn(/^Traduci gli altri 22 elementi$/);assert.ok(go(),'the rest: 22 items');
  assert.ok(find(w,n=>/tr-check\b/.test(n.className)&&/Codici, SKU, link ed email identici/.test(n.textContent)),'the checks are shown');
  answer=false;await go().onclick();await tick();assert.equal(asked.length,3);assert.equal(calls.length,1,'Annulla: no call');
  assert.match(asked[2].cost,/Sono 3 chiamate AI, una per lotto/);assert.deepEqual(asked[2].facts.find(f=>f[0]==='Chiamate AI'),['Chiamate AI','3 al Copywriter, una per lotto']);
  answer=true;await go().onclick();await tick(10);assert.equal(asked.length,4,'one confirmation for all the batches');assert.equal(calls.length,4,'exactly one call per batch');
  assert.ok(!btn(/^Traduci gli altri/),'nothing left to translate');
  assert.ok(btn(/^Scarica tutto \(\.zip\)/),'the export');assert.ok(find(w,n=>n.tagName==='SMALL'&&n.textContent==='testo-en.md')||find(w,n=>n.tagName==='SMALL'&&/-en\.md$/.test(n.textContent)),'Markdown per language');
 });
});

test('product-photo-studio: the 3 OpenAI backgrounds start only after the click and the RADIX confirmation; cut-out and white need none',async()=>{
 const S=require('../lib/product-photo-studio.js');let asked=[],answer=false;const posts=[];
 const {doc}=makeDom();
 const fetch=async(url,o={})=>{posts.push({url,body:o.body?JSON.parse(o.body):null});return {ok:true,status:200,json:async()=>({image:'data:image/png;base64,AA=='})}};
 class FakeImage{set src(v){this._src=v;this.naturalWidth=this.width=1024;this.naturalHeight=this.height=1024;setImmediate(()=>this.onload&&this.onload())}get src(){return this._src}}
 await withGlobals({document:doc,fetch,Image:FakeImage,RadixConfirm:{ask:async o=>{asked.push(o);return answer}},confirm:()=>{throw Error('no native confirm')},RadixAgents:{reply:async()=>{throw Error('no AI call expected')}},requestAnimationFrame:f=>setImmediate(f)},async()=>{
  const w=S.productPhotoStudio({project,profile:{identityKit:{palette:[{role:'primary',hex:'#7A3E1D'},{role:'light',hex:'#F6EFE6'}],keywords:['artigianale']}}});doc.body.append(w);await tick();
  assert.equal(posts.length,0,'nothing on load');assert.equal(asked.length,0);
  const scene=find(w,n=>n.tagName==='INPUT'&&n.type==='radio'&&n.value==='scene');scene.checked=true;scene.onchange();await tick();
  const go=()=>find(w,n=>n.tagName==='BUTTON'&&/primary/.test(n.className)&&!n.disabled&&/^(Genera|Rigenera) 3 sfondi$/.test(n.textContent.trim()));
  assert.ok(go(),'the go button');
  await go().onclick();await tick();
  assert.equal(asked.length,1);assert.match(asked[0].cost,/Sono 3 generazioni di immagini OpenAI[^.]*: consumano il saldo API di OpenAI/);assert.equal(asked[0].ok,'Genera 3 sfondi');
  assert.equal(posts.length,0,'«Annulla» starts no generation');
  answer=true;await go().onclick();await tick(8);
  assert.equal(asked.length,2);assert.equal(posts.length,3,'exactly the 3 announced generations');
  assert.ok(posts.every(p=>p.url==='/api/openai-image'&&p.body.shape==='square'&&p.body.quality==='medium'&&/EMPTY/.test(p.body.prompt)&&/#7A3E1D/.test(p.body.prompt)),'only the background, square 2000 format, brand colours');
  assert.equal(w.radixState().scenes,3);
 });
});

test('the avatar page asks the RADIX confirmation before each HeyGen spend',()=>{
 const src=read('agency/avatar.js');
 assert.equal((src.match(/if\(!await askConfirm\(\{title:'[^']+',cost:'Consuma crediti HeyGen\.'/g)||[]).length,4);
 for(const call of ["action:'design'","action:'generate'"]){const i=src.indexOf(call);assert.ok(i>0&&src.lastIndexOf('await askConfirm(',i)>src.lastIndexOf('async function',i),call)}
});

test('image-studio: the 3 Higgsfield generations start only after the click and the RADIX confirmation',async()=>{
 const S=require('../lib/image-studio.js');let asked=[],answer=false;const posts=[];
 const {doc}=makeDom();
 const fetch=async(url,o={})=>{if(o.method==='POST')posts.push(JSON.parse(o.body));return {ok:true,status:200,json:async()=>({done:true,status:'failed',images:[],error:'finta',requestId:'r1'})}};
 await withGlobals({document:doc,fetch,RadixConfirm:{ask:async o=>{asked.push(o);return answer}},confirm:()=>{throw Error('no native confirm')},RadixAgents:{reply:async()=>{throw Error('no AI call expected')}},RadixAgentMedia:undefined},async()=>{
  const w=S.photoStudio({project,memoryScope:{projectId:'p1'}});doc.body.append(w);await tick();fill(w);
  const go=()=>find(w,n=>n.tagName==='BUTTON'&&/primary/.test(n.className)&&!n.disabled);
  await go().onclick();await tick();
  assert.equal(asked.length,1);assert.match(asked[0].cost,/3 generazioni: consumano il saldo API di Higgsfield/);assert.equal(posts.length,0,'«Annulla» starts no generation');
  answer=true;await go().onclick();await tick(6);
  assert.equal(asked.length,2);assert.equal(posts.length,3,'the 3 generations, once');assert.ok(posts.every(p=>p.action==='generate'));
 });
});
