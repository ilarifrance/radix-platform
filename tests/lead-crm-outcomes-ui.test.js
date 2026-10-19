'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../sales/lead-crm-outcomes-core'),source=fs.readFileSync('sales/lead-crm-outcomes.js','utf8');
const ws='11111111-1111-4111-8111-111111111111',company='22222222-2222-4222-8222-222222222222';
const makeEvent=(index,n=0)=>({index,key:'li-1770000000000-'+index+'-'+n,type:'event',stage:'meeting',at:'2026-10-14T09:00:00.000Z'});
function fixture(existing=[]){
 const nodes=new Map(),events=new Map(),requests=[],rows=[...existing];
 const node=()=>({value:'',disabled:false,textContent:'',children:[],listeners:{},replaceChildren(...x){this.children=[...x]},append(...x){this.children.push(...x)},addEventListener(n,f){(this.listeners[n]??=[]).push(f)},async fire(n){for(const f of this.listeners[n]||[])await f()}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
 get('sync-workspace').value=ws;get('outcome-prospect').value='0';
 const w={RadixLeadCrmOutcomesCore:core,radixLeadWorkflow:{approvalFor:i=>i===0?{checked:true}:null},confirm:()=>true,addEventListener:(n,f)=>{const arr=events.get(n)||[];arr.push(f);events.set(n,arr)},dispatchEvent:()=>{}};
 const fetch=async(url,options={})=>{
  requests.push({url:String(url),options});
  if(options.method==='POST'){
   const cmd=JSON.parse(options.body);assert.equal(cmd.workspace,ws);assert.equal(cmd.entity,'interactions');
   const id='33333333-3333-4333-8333-333333333333';rows.push({...cmd.data,id});
   return{ok:true,json:async()=>({rows:[{id}]})};
  }
  return{ok:true,json:async()=>({rows:rows.slice(Number(new URL('http://radix.test'+url).searchParams.get('offset'))||0,100)})};
 };
 vm.runInNewContext(source,{window:w,document:{getElementById:get,createElement:node},fetch,Date,URLSearchParams,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}}});
 const fire=(name,detail)=>{for(const fn of events.get(name)||[])fn({detail})};
 fire('radix:lead-reviewed',{prospects:[{name:'Azienda Alfa'}]});
 fire('radix:lead-crm-created',{index:0,workspace:ws,companyId:company});
 return{get,fire,rows,requests};
}
test('explicit outcome save writes one CRM interaction after a scoped duplicate check',async()=>{
 const f=fixture(),evt=makeEvent(0);f.fire('radix:lead-outcome-recorded',evt);
 assert.equal(f.get('crm-outcome-save').disabled,false);
 await f.get('crm-outcome-save').fire('click');
 assert.equal(f.rows.length,1);assert.equal(f.rows[0].kind,'note');
 assert.deepEqual(core.parse(f.rows[0],company).key,evt.key);
 assert.equal(f.requests.filter(r=>r.options.method==='POST').length,1);
 assert.equal(f.get('crm-outcome-save').disabled,true);
});
test('existing same-key CRM interaction cannot be duplicated',async()=>{
 const evt=makeEvent(0),f=fixture([{...core.writeData(evt,company),id:'44444444-4444-4444-8444-444444444444'}]);
 f.fire('radix:lead-outcome-recorded',evt);await f.get('crm-outcome-save').fire('click');
 assert.equal(f.rows.length,1);assert.equal(f.requests.filter(r=>r.options.method==='POST').length,0);
});
test('CRM read fills journal after linking and correction can be saved',async()=>{
 const evt=makeEvent(0),f=fixture([{...core.writeData(evt,company),id:'44444444-4444-4444-8444-444444444444'}]);
 await f.get('crm-outcome-load').fire('click');
 assert.ok(f.get('crm-outcome-history').children.length>1);
 const correction={index:0,key:'li-1770000000000-0-1-void',ref:evt.key,stage:evt.stage,at:'2026-10-14T09:10:00.000Z'};
 f.fire('radix:lead-outcome-voided',correction);await f.get('crm-outcome-save').fire('click');
 assert.equal(f.rows.length,2);
 assert.equal(core.timeline(f.rows.map(r=>core.parse(r,company))).active.length,0);
});
