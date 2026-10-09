const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('control-center-v2.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
test('cockpit JavaScript parses',()=>assert.doesNotThrow(()=>new vm.Script(script)));
function functionSource(name){const start=script.indexOf('  function '+name+'(');const end=script.indexOf('\n  function ',start+1);return script.slice(start,end)}
test('project map requires explicit workflow ownership and includes every task',()=>{
 const context={data:{workflows:[{id:'unowned',nodes:[{id:'wrong'}]},{id:'owned',projectId:'a',nodes:Array.from({length:100},(_,i)=>({id:String(i),label:'Task '+i}))},{id:'other',projectId:'b',nodes:[]}]}};
 vm.createContext(context);vm.runInContext(functionSource('projectItems'),context);
 assert.equal(context.projectItems('a').length,101);
 assert.equal(context.projectItems('empty').length,0);
 assert.equal(context.projectItems('a').some(x=>x.id==='wrong'),false);
});
test('zoom clamps without losing pan and reports its value',()=>{
 const elements={networkStage:{style:{}},zoomReset:{}};
 const context={zoom:10,pan:{x:120,y:-70},$:id=>elements[id]};vm.createContext(context);vm.runInContext(script.match(/  function applyZoom\(\)\{[^\n]+/)[0],context);context.applyZoom();
 assert.equal(context.zoom,3);assert.equal(elements.networkStage.style.transform,'translate(120px,-70px) scale(3)');
 context.zoom=0;context.applyZoom();assert.equal(context.zoom,.35);
});
test('expanded network updates accessible state and resets camera',()=>{
 const classSet=new Set();const attributes={};const bodySet=new Set();
 const toggle=(set,key,on)=>on?set.add(key):set.delete(key);
 const elements={networkPanel:{classList:{toggle:(key,on)=>toggle(classSet,key,on)}},expandNetwork:{setAttribute:(key,value)=>attributes[key]=value}};
 let resets=0;
 const context={$:id=>elements[id],document:{body:{classList:{toggle:(key,on)=>toggle(bodySet,key,on)}}},resetNetworkCamera:()=>resets++};
 vm.createContext(context);
 const start=script.indexOf('  function setNetworkExpanded('),end=script.indexOf('\n  }',start)+4;
 vm.runInContext(script.slice(start,end),context);
 context.setNetworkExpanded(true);assert.equal(attributes['aria-pressed'],'true');assert.ok(classSet.has('network-expanded'));assert.ok(bodySet.has('network-expanded-active'));
 context.setNetworkExpanded(false);assert.equal(attributes['aria-pressed'],'false');assert.equal(classSet.size,0);assert.equal(bodySet.size,0);assert.equal(resets,2);
});
