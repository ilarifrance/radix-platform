'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('sales/lead-outreach.js','utf8');
function fixture(){
 const elements=new Map(),callbacks=new Map(),events=new Map();
 const element=(tag='div')=>({
  tagName:tag.toUpperCase(),value:'',checked:false,disabled:false,textContent:'',children:[],listeners:{},
  replaceChildren(...args){this.children=[...args]},
  append(...args){this.children.push(...args)},
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)},
  fire(type){for(const fn of this.listeners[type]||[])fn({target:this})},
 });
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 const win={RadixOutreach:{validate:(q,a)=>({ok:!!q&&!!a.email&&a.checked&&a.privacy,errors:[]})},
  addEventListener:(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn)},
  dispatchEvent:e=>{for(const fn of events.get(e.type)||[])fn(e)},confirm:()=>true
 };
 const sandbox={document:{getElementById:get,createElement:element},window:win,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail||{}}},URL:{},Blob:class{},console};
 vm.runInNewContext(src,sandbox);
 const fill=(n,values={})=>{const entries=Array.from({length:n},(_,i)=>({candidate:{name:'Azienda '+i,domain:'alfa.it',source:'https://alfa.it'},score:82,priority:'ALTA',reasons:[],...values}));win.dispatchEvent({type:'radix:lead-reviewed',detail:{entries}});return entries};
 return {get,win,fill,events};
}
test('partial review of distinct prospects survives switching and is never stored persistently',()=>{
 const f=fixture(),g=f.get;f.fill(2);
 g('out-email').value='ceo@alfa.it';g('out-contact').value='Paolo';
 g('out-email').fire('input');
 g('out-prospect').value='1';g('out-prospect').fire('change');
 assert.equal(g('out-email').value,'');
 g('out-email').value='manager@beta.it';g('out-email').fire('input');
 g('out-prospect').value='0';g('out-prospect').fire('change');
 assert.equal(g('out-email').value,'ceo@alfa.it');assert.equal(g('out-contact').value,'Paolo');
 g('out-prospect').value='1';g('out-prospect').fire('change');
 assert.equal(g('out-email').value,'manager@beta.it');
 assert.ok(!src.includes('localStorage')&&!src.includes('sessionStorage'));
});
test('an approved prospect becomes unapproved immediately when edited and mail draft is revoked',()=>{
 const f=fixture(),g=f.get;f.fill(2);
 g('out-email').value='ceo@alfa.it';g('out-checked').checked=true;g('out-privacy').checked=true;
 g('out-approve').fire('click');
 assert.ok(f.win.radixLeadWorkflow.approvalFor(0));
 let notices=0;f.win.addEventListener('radix:lead-approval-changed',()=>{notices++});
 g('out-contact').value='Rettifica';g('out-contact').fire('input');
 assert.equal(f.win.radixLeadWorkflow.approvalFor(0),null);
 assert.equal(g('out-checked').checked,false);assert.equal(g('out-privacy').checked,false);
 assert.equal(notices,1);assert.equal(g('out-email').value,'ceo@alfa.it');
 g('out-prospect').value='1';g('out-prospect').fire('change');
 g('out-prospect').value='0';g('out-prospect').fire('change');
 assert.equal(g('out-contact').value,'Rettifica');
 assert.equal(g('out-checked').checked,false);
});
test('requalification discards all stored personal data and approvals',()=>{
 const f=fixture(),g=f.get;f.fill(1);g('out-email').value='x@y.it';g('out-email').fire('input');
 g('out-checked').checked=true;g('out-privacy').checked=true;g('out-approve').fire('click');
 assert.ok(f.win.radixLeadWorkflow.approvalFor(0));
 f.fill(1);assert.equal(g('out-email').value,'');assert.equal(f.win.radixLeadWorkflow.approvalFor(0),null);
});
