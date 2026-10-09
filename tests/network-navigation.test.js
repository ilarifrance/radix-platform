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
function networkHarness(projects,workflows){
 const elements={};
 const get=id=>elements[id]||(elements[id]={innerHTML:'',textContent:'',hidden:false,querySelectorAll:()=>[]});
 const svg=get('networkSvg');svg.setAttribute=(k,v)=>{svg[k]=v};
 let cachedMarkup=null,cachedTargets=[];
 svg.querySelectorAll=selector=>{
  if(selector!== '[data-network-type]')return [];
  if(cachedMarkup===svg.innerHTML)return cachedTargets;cachedMarkup=svg.innerHTML;
  return cachedTargets=Array.from(svg.innerHTML.matchAll(/<g\b([^>]*data-network-type[^>]*)>/g),match=>{
   const attributes=Object.fromEntries(Array.from(match[1].matchAll(/([\w-]+)="([^"]*)"/g),x=>[x[1],x[2]]));
   return {getAttribute:key=>attributes[key],addEventListener(key,fn){this[key]=fn},focus(){}};
  });
 };
 const context={currentView:"network",data:{projects,workflows},focusedProjectId:null,networkDetail:null,pan:{x:0,y:0},zoom:1,$:get,setView(){},applyZoom(){},resetNetworkCamera(){},openProject(){},toast(){},openWorkflow(id){context.openedWorkflow=id}};
 vm.createContext(context);
 for(const name of ['esc','projectPalette','projectSlots','orderedProjects','projectItems','networkPosition','renderNetwork'])vm.runInContext(functionSource(name),context);
 return {context,svg,elements};
}
test('root renders every project and no invented agent satellites',()=>{
 const {context,svg}=networkHarness(Array.from({length:17},(_,i)=>({id:'p'+i,name:'Project '+i})),[{id:'unowned',nodes:[{id:'fake'}]}]);
 context.renderNetwork();assert.equal((svg.innerHTML.match(/data-network-type="project"/g)||[]).length,17);
 assert.equal((svg.innerHTML.match(/data-network-type="satellite"/g)||[]).length,0);
});
test('attributed satellite opens its actual task and project with safe SVG labels',()=>{
 const {context,svg,elements}=networkHarness([{id:'a',name:'<img onerror=alert(1)>'}],[{id:'w',projectId:'a',orchestrator:'Workflow',nodes:[{id:'task',label:'<script>bad</script>',status:'pending',subtask:'Actual task'}]}]);
 context.renderNetwork();assert.ok(!svg.innerHTML.includes('<img'));assert.ok(!svg.innerHTML.includes('<script>'));
 const task=svg.querySelectorAll('[data-network-type]').filter(el=>el.getAttribute('data-network-type')==='satellite')[1];
 task.click();assert.equal(context.focusedProjectId,'a');assert.equal(context.networkDetail.id,'task');assert.equal(context.openedWorkflow,'w');assert.ok(elements.drawerBody.innerHTML.includes('Actual task'));
});
test('focused map includes over one hundred tasks and shows truthful empty state',()=>{
 const {context,svg}=networkHarness([{id:'a',name:'A'},{id:'empty',name:'Empty'}],[{id:'w',projectId:'a',nodes:Array.from({length:120},(_,i)=>({id:'n'+i,label:'Task '+i,status:'done'}))}]);
 context.focusedProjectId='a';context.renderNetwork();assert.equal((svg.innerHTML.match(/data-network-type="item"/g)||[]).length,121);
 context.focusedProjectId='empty';context.renderNetwork();assert.ok(svg.innerHTML.includes('Nessuna assegnazione registrata'));
});
test('pointer-centred zoom keeps the world point under the pointer',()=>{
 const context={zoom:1,pan:{x:20,y:-10},applyZoom(){}};vm.createContext(context);
 const start=script.indexOf('  function zoomAt('),end=script.indexOf('\n  }',start)+4;vm.runInContext(script.slice(start,end),context);
 const worldX=(150-context.pan.x)/context.zoom,worldY=(70-context.pan.y)/context.zoom;
 context.zoomAt(2,150,70);assert.equal((150-context.pan.x)/context.zoom,worldX);assert.equal((70-context.pan.y)/context.zoom,worldY);
});
