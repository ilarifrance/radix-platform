'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../sales/lead-outcomes-core.js'),src=fs.readFileSync('sales/lead-outcomes.js','utf8'),html=fs.readFileSync('lead-intelligence.html','utf8');
function fixture(){
 const nodes=new Map(),listeners=new Map(),exports=[];
 const node=()=>({value:'',disabled:false,textContent:'',children:[],listeners:{},replaceChildren(...x){this.children=x},append(...x){this.children.push(...x)},addEventListener(n,f){(this.listeners[n]??=[]).push(f)},fire(n){for(const f of this.listeners[n]||[])f()},click(){},remove(){}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
 const window={RadixLeadOutcomes:core,radixLeadWorkflow:{approvalFor:i=>i===0?{checked:true}:null},confirm:()=>true,addEventListener:(n,f)=>listeners.set(n,f)};
 vm.runInNewContext(src,{window,document:{getElementById:get,createElement:node,body:{append(){}}},URL:{createObjectURL:()=>'',revokeObjectURL(){}},Blob:class{constructor(parts){exports.push(parts.join(''))}},Date});
 return{get,fire:(n,detail)=>listeners.get(n)({detail}),exports};
}
test('voided events do not count',()=>{
 const rows=[{index:0,stage:'contacted'},{index:0,stage:'won'},{index:0,stage:'lost',voidedAt:'2026-10-14T00:00:00Z'}];
 assert.deepEqual(core.summarize(rows),{contacted:1,replied:0,meeting:0,won:1,lost:0});
});
test('undo changes counters but keeps auditable CSV',()=>{
 const f=fixture(),g=f.get;f.fire('radix:lead-reviewed',{prospects:[{name:'Alfa'}]});
 g('outcome-prospect').value='0';g('outcome-stage').value='won';g('outcome-record').fire('click');
 assert.equal(g('outcome-won').textContent,'1');g('outcome-undo').fire('click');
 assert.equal(g('outcome-won').textContent,'0');assert.equal(g('outcome-undo').disabled,true);
 g('outcome-export').fire('click');assert.match(f.exports.join(''),/annullato/);
});
test('unapproved prospects cannot register outcomes',()=>{
 const f=fixture(),g=f.get;f.fire('radix:lead-reviewed',{prospects:[{name:'Alfa'},{name:'Beta'}]});
 g('outcome-prospect').value='1';g('outcome-stage').value='won';g('outcome-record').fire('click');assert.equal(g('outcome-won').textContent,'0');
});
test('new UI controls and no network writes',()=>{
 for(const id of ['outcome-undo','outcome-current','outcome-lost'])assert.ok(html.includes('id="'+id+'"'));
 assert.doesNotThrow(()=>new vm.Script(src));assert.ok(!/fetch\(|localStorage|sessionStorage/.test(src));
});
