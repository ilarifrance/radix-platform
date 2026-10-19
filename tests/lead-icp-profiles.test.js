'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('sales/lead-icp-profiles.js','utf8'),KEY='radix.lead.icp.v1';
function setup(existing){
 const map=new Map(existing===undefined?[]:[[KEY,existing]]),els=new Map(),events=[];
 const node=()=>({value:'',textContent:'',disabled:false,children:[],listeners:{},addEventListener(t,f){(this.listeners[t]??=[]).push(f)},fire(t){this.dispatchEvent({type:t})},dispatchEvent(e){events.push(e.type);for(const f of this.listeners[e.type]||[])f(e)},append(...x){this.children.push(...x)},replaceChildren(...x){this.children=x}});
 const get=id=>{if(!els.has(id))els.set(id,node());return els.get(id)};
 for(const [k,v] of Object.entries({country:'Italia',industry:'Packaging',size:'PMI',role:'CEO'}))get(k).value=v;
 const window={confirm:()=>true,localStorage:{getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
 vm.runInNewContext(src,{window,document:{getElementById:get,createElement:node},Event:class{constructor(type){this.type=type}}});
 return {get,map,events};
}
test('opt-in save and load invalidate stale scores without persisting contacts',()=>{
 const {get:g,map,events}=setup();g('icp-profile-name').value='Industria IT';g('icp-profile-save').fire('click');
 assert.equal(JSON.parse(map.get(KEY))[0].values.industry,'Packaging');assert.ok(!map.get(KEY).includes('prospect'));
 g('industry').value='Automotive';g('icp-profile-select').value='Industria IT';g('icp-profile-load').fire('click');
 assert.equal(g('industry').value,'Packaging');assert.equal(events.filter(x=>x==='input').length,1);
});
test('stored profile never autoloads and deletion clears storage',()=>{
 const p=JSON.stringify([{name:'Industria IT',values:{country:'Francia',industry:'Automotive',size:'Large',role:'CFO'}}]);
 const {get:g,map,events}=setup(p);assert.equal(g('country').value,'Italia');assert.ok(!events.includes('input'));
 g('icp-profile-select').value='Industria IT';g('icp-profile-delete').fire('click');assert.equal(map.has(KEY),false);
});
test('malformed profile store is not overwritten',()=>{
 const {get:g,map}=setup('{bad');g('icp-profile-name').value='Nuovo';g('icp-profile-save').fire('click');
 assert.equal(map.get(KEY),'{bad');assert.match(g('icp-profile-status').textContent,/non riuscito/);
});
test('reject oversized ICP rules',()=>{
 const {get:g,map}=setup();g('icp-profile-name').value='Nuovo';g('country').value='x'.repeat(401);g('icp-profile-save').fire('click');assert.equal(map.has(KEY),false);
});