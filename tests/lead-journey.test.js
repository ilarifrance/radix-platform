'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const js=fs.readFileSync('sales/lead-journey.js','utf8'),html=fs.readFileSync('lead-intelligence.html','utf8');
function fixture(){
 const map=new Map(),events=new Map();
 const node=(tag='span')=>({tagName:tag,children:[],className:'',textContent:'',href:'',attributes:{},replaceChildren(...a){this.children=[...a]},append(...a){this.children.push(...a)},setAttribute(k,v){this.attributes[k]=v}});
 const get=id=>{if(!map.has(id))map.set(id,node());return map.get(id)};
 const approvals=new Set();
 const window={radixLeadWorkflow:{approvalFor:i=>approvals.has(i)?{checked:true}:null},addEventListener:(t,fn)=>{let a=events.get(t)||[];a.push(fn);events.set(t,a)}};
 vm.runInNewContext(js,{document:{getElementById:get,createElement:node},window});
 const fire=(t,detail)=>{for(const fn of events.get(t)||[])fn({detail})};
 return{get,fire,approvals};
}
test('renders zero state, then counts actual workflow events without invented conversions',()=>{
 const f=fixture(),g=f.get;assert.equal(g('lead-journey-track').children.length,7);
 assert.match(g('lead-journey-next').textContent,/Importa/);
 f.fire('radix:lead-reviewed',{entries:[{candidate:{name:'Alfa'}},{candidate:{name:'Beta'}}]});
 assert.equal(g('lead-journey-track').children[0].children[1].textContent,'2');
 assert.equal(g('lead-journey-track').children[1].children[1].textContent,'0');
 f.approvals.add(0);f.fire('radix:lead-approval-changed',{index:0,approved:true});
 assert.equal(g('lead-journey-track').children[1].children[1].textContent,'1');
 f.fire('radix:lead-crm-created',{index:0,companyId:'id',workspace:'ws'});
 assert.equal(g('lead-journey-track').children[2].children[1].textContent,'1');
 f.fire('radix:lead-draft',{index:0});f.fire('radix:lead-plan-created',{index:0});
 assert.equal(g('lead-journey-track').children[4].children[1].textContent,'1');
 f.fire('radix:lead-outcome-recorded',{index:0,key:'li-event'});
 assert.equal(g('lead-journey-track').children[5].children[1].textContent,'1');
 f.fire('radix:lead-outcome-voided',{index:0,ref:'li-event'});
 assert.equal(g('lead-journey-track').children[5].children[1].textContent,'0');
 f.fire('radix:lead-crm-outcome-saved',{index:0,key:'li-event'});
 assert.equal(g('lead-journey-track').children[6].children[1].textContent,'1');
});
test('integration is an interactive navigation visualization with no network or persistence',()=>{
 for(const id of ['lead-journey-track','lead-journey-next','lead-journey-total'])assert.ok(html.includes('id="'+id+'"'));
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.ok(!/fetch\(|localStorage|sessionStorage/.test(js));
});
