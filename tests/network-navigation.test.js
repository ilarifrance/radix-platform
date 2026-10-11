const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('control-center-v2.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const masterCss=fs.readFileSync('command-center-master.css','utf8');
test('cockpit JavaScript parses',()=>assert.doesNotThrow(()=>new vm.Script(script)));
test('primary navigation exposes data-backed operational sections',()=>{
 for(const view of ['approvals','agents','knowledge','analytics','integrations'])assert.ok(html.includes(`data-radix-view="${view}"`));
 assert.ok(html.includes('id="operationalView"'));
 assert.ok(script.includes("Metriche derivate dallo snapshot · non telemetria live"));
 assert.ok(script.includes("Nessuna connessione viene dichiarata senza dati verificabili"));
 assert.ok(!html.includes('data-future="Agents"'));
 assert.ok(script.includes("workflow salvati; "));
 assert.ok(script.includes("ANALYTICS','Metriche derivate dallo snapshot"));
});
test('operational sections collapse without nested scrolling and expose coarse-pointer targets',()=>{
 assert.ok(masterCss.includes('.network-wrap:has(.operational-view:not([hidden]))'));
 assert.ok(masterCss.includes('.operational-grid{grid-template-columns:1fr}'));
 assert.ok(masterCss.includes('@media(pointer:coarse)'));
 assert.ok(masterCss.includes('.operational-head button{width:100%;min-height:44px}'));
});
function functionSource(name){const start=script.indexOf('  function '+name+'(');const end=script.indexOf('\n  function ',start+1);return script.slice(start,end)}
test('Knowledge searches actual context and project handoff resets workflow filters without mutations',()=>{
 const projects=[{id:'a',name:'Aura',kind:'Assistant',summary:'Benessere personale'},{id:'b',name:'Doc Capital',summary:'Educazione finanziaria'}];
 const context={data:{projects},workflowFilters:{project:'all',status:'problem',taskStatus:'pending'},renderCommandView(){context.rendered=true},setView(view){context.view=view}};
 vm.createContext(context);for(const name of ['filterKnowledgeProjects','openProjectWorkflows'])vm.runInContext(functionSource(name),context);
 assert.equal(context.filterKnowledgeProjects(projects,' FINANZIARIA ')[0],projects[1]);
 assert.equal(context.filterKnowledgeProjects(projects,'assistant')[0],projects[0]);
 assert.equal(context.filterKnowledgeProjects(projects,'missing').length,0);
 context.openProjectWorkflows('a');assert.equal(context.workflowFilters.project,'a');assert.equal(context.workflowFilters.status,'all');assert.equal(context.workflowFilters.taskStatus,'all');assert.equal(context.view,'command');
 const before=context.workflowFilters;context.openProjectWorkflows('unknown');assert.equal(context.workflowFilters,before);assert.equal(projects[0].active,undefined);
});
test('project map requires explicit workflow ownership and includes every task',()=>{
 const context={RadixNetworkScene:require('../command-center-network-scene.js'),AGENTS:[],UNASSIGNED:'__unassigned',data:{workflows:[{id:'unowned',nodes:[{id:'wrong'}]},{id:'owned',projectId:'a',nodes:Array.from({length:100},(_,i)=>({id:String(i),label:'Task '+i}))},{id:'other',projectId:'b',nodes:[]}]}};
 vm.createContext(context);vm.runInContext(functionSource('projectItems')+functionSource('workflowTasks'),context);
 assert.equal(context.projectItems('a').length,1);
 assert.equal(context.workflowTasks(context.projectItems('a')[0].workflow).length,100);
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
 const context={$:id=>elements[id],document:{body:{classList:{toggle:(key,on)=>toggle(bodySet,key,on)}}},resetNetworkCamera:()=>resets++,renderNetwork(){},networkPage:0};
 vm.createContext(context);
 const start=script.indexOf('  function setNetworkExpanded('),end=script.indexOf('\n  }',start)+4;
 vm.runInContext(script.slice(start,end),context);
 context.setNetworkExpanded(true);assert.equal(attributes['aria-pressed'],'true');assert.ok(classSet.has('network-expanded'));assert.ok(bodySet.has('network-expanded-active'));
 context.setNetworkExpanded(false);assert.equal(attributes['aria-pressed'],'false');assert.equal(classSet.size,0);assert.equal(bodySet.size,0);assert.equal(resets,2);
});
function networkHarness(projects,workflows){
 const elements={};
 const get=id=>elements[id]||(elements[id]={innerHTML:'',textContent:'',hidden:false,querySelectorAll:()=>[]});
 get('networkPanel').classList={contains:()=>false};const svg=get('networkSvg');get('networkMobileList');svg.setAttribute=(k,v)=>{svg[k]=v};
 let cachedMarkup=null,cachedTargets=[];
 svg.querySelectorAll=selector=>{
  if(selector!== '[data-network-type]')return [];
  if(cachedMarkup===svg.innerHTML)return cachedTargets;cachedMarkup=svg.innerHTML;
  return cachedTargets=Array.from(svg.innerHTML.matchAll(/<g\b([^>]*data-network-type[^>]*)>/g),match=>{
   const attributes=Object.fromEntries(Array.from(match[1].matchAll(/([\w-]+)="([^"]*)"/g),x=>[x[1],x[2]]));
   return {getAttribute:key=>attributes[key],addEventListener(key,fn){this[key]=fn},focus(){}};
  });
 };
 const context={RadixNetworkScene:require('../command-center-network-scene.js'),AGENTS:[],UNASSIGNED:'__unassigned',networkPage:0,currentView:"network",data:{projects,workflows},focusedProjectId:null,networkDetail:null,pan:{x:0,y:0},zoom:1,$:get,setView(){},applyZoom(){},resetNetworkCamera(){},openProject(){},toast(){},openWorkflow(id){context.openedWorkflow=id},openTask(workflowId,taskId){context.openedTask={workflowId,taskId}}};
 vm.createContext(context);
 for(const name of ['esc','projectPalette','projectColor','projectRank','projectSlots','orderedProjects','projectItems','workflowTasks','networkPosition','renderNetwork'])vm.runInContext(functionSource(name),context);
 return {context,svg,elements};
}
test('root paginates projects without inventing agent satellites',()=>{
 const {context,svg}=networkHarness(Array.from({length:17},(_,i)=>({id:'p'+i,name:'Project '+i})),[{id:'unowned',nodes:[{id:'fake'}]}]);
 context.renderNetwork();assert.equal((svg.innerHTML.match(/data-network-type="project"/g)||[]).length,9);
 assert.equal((svg.innerHTML.match(/data-network-type="satellite"/g)||[]).length,0);
});
test('project labels render above moving satellites in a non-interactive readability layer',()=>{
 const {context,svg}=networkHarness([{id:'a',name:'A very long project name'}],[{id:'w',projectId:'a',nodes:[{id:'task'}]}]);
 context.renderNetwork();
 assert.ok(svg.innerHTML.includes('class="network-label-layer" aria-hidden="true"'));
 assert.ok(svg.innerHTML.indexOf('class="network-label-layer"')>svg.innerHTML.lastIndexOf('data-network-type="satellite"'));
 assert.equal((svg.innerHTML.match(/class="network-label-overlay"/g)||[]).length,1);
});
test('RADIX core exposes layered surface detail and beam emitters',()=>{
 const {context,svg}=networkHarness([{id:'a',name:'Aura'}],[]);context.renderNetwork();
 assert.ok(svg.innerHTML.includes('class="core-surface"'));
 assert.ok(svg.innerHTML.includes('class="core-sheen"'));
 assert.equal((svg.innerHTML.match(/class="core-emitter"/g)||[]).length,16);
 assert.ok(svg.innerHTML.includes('id="coreClip"'));
});
test('attributed satellite opens its actual task and project with safe SVG labels',()=>{
 const {context,svg,elements}=networkHarness([{id:'a',name:'<img onerror=alert(1)>'}],[{id:'w',projectId:'a',orchestrator:'Workflow',nodes:[{id:'task',label:'<script>bad</script>',status:'pending',subtask:'Actual task'}]}]);
 context.renderNetwork();assert.ok(!svg.innerHTML.includes('<img'));assert.ok(!svg.innerHTML.includes('<script>'));
 const workflow=svg.querySelectorAll('[data-network-type]').find(el=>el.getAttribute('data-network-type')==='satellite');
 workflow.click();assert.equal(context.focusedProjectId,'a');assert.equal(context.networkDetail.id,'w');assert.equal(context.openedWorkflow,'w');
 const task=svg.querySelectorAll('[data-network-type]').find(el=>el.getAttribute('data-network-type')==='item');task.click();assert.equal(context.networkDetail.id,'task');assert.deepEqual(context.openedTask,{workflowId:'w',taskId:'task'});
});
test('focused map includes over one hundred tasks and shows truthful empty state',()=>{
 const {context,svg,elements}=networkHarness([{id:'a',name:'A'},{id:'empty',name:'Empty'}],[{id:'w',projectId:'a',nodes:Array.from({length:120},(_,i)=>({id:'n'+i,label:'Task '+i,status:'done'}))}]);
 context.focusedProjectId='a';context.networkDetail={id:'w',workflow:context.data.workflows[0]};context.renderNetwork();assert.equal((svg.innerHTML.match(/data-network-type="item"/g)||[]).length,8);assert.equal((elements.networkMobileList.innerHTML.match(/data-mobile-index/g)||[]).length,120);
 context.focusedProjectId='empty';context.networkDetail=null;context.renderNetwork();assert.ok(svg.innerHTML.includes('Nessuna assegnazione registrata'));
});
test('pointer-centred zoom keeps the world point under the pointer',()=>{
 const context={zoom:1,pan:{x:20,y:-10},applyZoom(){}};vm.createContext(context);
 const start=script.indexOf('  function zoomAt('),end=script.indexOf('\n  }',start)+4;vm.runInContext(script.slice(start,end),context);
 const worldX=(150-context.pan.x)/context.zoom,worldY=(70-context.pan.y)/context.zoom;
 context.zoomAt(2,150,70);assert.equal((150-context.pan.x)/context.zoom,worldX);assert.equal((70-context.pan.y)/context.zoom,worldY);
});
test('expanded map renders every workflow task without pagination',()=>{
 const {context,svg,elements}=networkHarness([{id:'a',name:'A'}],[{id:'w',projectId:'a',nodes:Array.from({length:120},(_,i)=>({id:'n'+i,label:'Task '+i,status:'done'}))}]);
 elements.networkPanel.classList.contains=()=>true;
 context.focusedProjectId='a';context.networkDetail={id:'w',workflow:context.data.workflows[0]};context.renderNetwork();
 assert.equal((svg.innerHTML.match(/data-network-type="item"/g)||[]).length,120);
 assert.ok(!elements.networkBreadcrumb.innerHTML.includes('data-page'));
});

test('satellites orbit only their owning project and never show unassigned catalog agents',()=>{
 const {context,svg}=networkHarness([{id:'a',name:'Aura'},{id:'b',name:'Doc'}],[{id:'w',projectId:'a',nodes:Array.from({length:100},(_,i)=>({id:'t'+i,label:'Actual task '+i,status:'pending'}))},{id:'unowned',nodes:[{id:'wrong',label:'Unassigned task'}]}]);
 context.AGENTS=[{id:'copywriter',name:'Copywriter',group:'Marketing'}];context.renderNetwork();
 assert.equal((svg.innerHTML.match(/data-network-type="configured-agent"/g)||[]).length,0);
 assert.equal((svg.innerHTML.match(/data-network-type="satellite"/g)||[]).length,1);
 assert.equal((svg.innerHTML.match(/data-network-project="a"/g)||[]).length,1);
 assert.equal((svg.innerHTML.match(/data-network-project="b"/g)||[]).length,0);
 assert.ok(!svg.innerHTML.includes('Unassigned task'));
 assert.ok(svg.innerHTML.includes('100 attività'));
 svg.querySelectorAll('[data-network-type]').find(el=>el.getAttribute('data-network-type')==='satellite').click();
 assert.equal(context.workflowTasks(context.networkDetail.workflow).length,100);
});

test('confirmed shared workflows appear around every project without changing stored ownership or status',()=>{
 const original={id:'shared',orchestrator:'Team workflow',status:'done',nodes:[{id:'real-task',label:'Actual task',status:'done'}]};
 const {context,svg}=networkHarness([{id:'a',name:'Aura'},{id:'b',name:'Doc'}],[original,{id:'private',projectId:'a',nodes:[{id:'private-task',status:'pending'}]}]);
 context.data.workspace={sharedWorkflowCatalog:true};context.renderNetwork();
 assert.equal((svg.innerHTML.match(/data-network-project="a"/g)||[]).length,2);
 assert.equal((svg.innerHTML.match(/data-network-project="b"/g)||[]).length,1);
 assert.ok(svg.innerHTML.includes('Team workflow · condiviso · 1 attività'));
 assert.equal(context.projectItems('b')[0].workflow,original);
 assert.equal(original.projectId,undefined);assert.equal(original.status,'done');
 assert.equal(context.projectItems('unknown').length,0);
 const node=svg.querySelectorAll('[data-network-type]').find(el=>el.getAttribute('data-network-type')==='satellite'&&el.getAttribute('data-network-project')==='b');
 node.click();assert.equal(context.focusedProjectId,'b');assert.equal(context.openedWorkflow,'shared');assert.equal(context.networkDetail.id,'shared');
 const task=svg.querySelectorAll('[data-network-type]').find(el=>el.getAttribute('data-network-type')==='item');task.click();assert.equal(context.networkDetail.id,'real-task');assert.equal(context.networkDetail.node,original.nodes[0]);assert.deepEqual(context.openedTask,{workflowId:'shared',taskId:'real-task'});
});

test('global search finds real saved tasks and opens the selected task identity',()=>{
 const elements={searchResults:{hidden:true,innerHTML:''}};
 const context={data:{projects:[],workflows:[{id:'workflow:1',orchestrator:'Marketing',task:'Campaign',nodes:[{id:'workflow:1:7',label:'Art Director',agentId:'art-director',status:'done',subtask:'Carosello fotovoltaico industriale'}]}]},AGENTS:[],searchItems:[],$:id=>elements[id],document:{querySelectorAll:()=>[]},openTask(workflowId,taskId){context.opened={workflowId,taskId}},openProject(){},openWorkflow(){},openAgent(){}};
 vm.createContext(context);for(const name of ['esc','doSearch'])vm.runInContext(functionSource(name),context);
 vm.runInContext(script.match(/  function openSearchResult\(item\)\{[^\n]+/)[0],context);
 context.doSearch('fotovoltaico');assert.equal(context.searchItems.length,1);assert.equal(context.searchItems[0].type,'task');assert.ok(elements.searchResults.innerHTML.includes('<small>attività</small>'));
 context.openSearchResult(context.searchItems[0]);assert.deepEqual(context.opened,{workflowId:'workflow:1',taskId:'workflow:1:7'});assert.equal(elements.searchResults.hidden,true);
 context.doSearch('non-esiste');assert.equal(context.searchItems.length,0);assert.ok(elements.searchResults.innerHTML.includes('Nessun risultato'));
});

test('workflow filters preserve shared identity and expose matching task statuses',()=>{
 const shared={id:'shared',status:'done',nodes:[{id:'done',status:'done'},{id:'failed',status:'error'}]};
 const privateAura={id:'a-private',projectId:'a',status:'error',nodes:[{id:'blocked',status:'blocked'}]};
 const privateDoc={id:'b-private',projectId:'b',status:'running',nodes:[{id:'running',status:'running'}]};
 const projects=[{id:'a'},{id:'b'}],workflows=[shared,privateAura,privateDoc];
 const context={};vm.createContext(context);
 for(const name of ['workflowMatchesStatus','workflowMatchesProject','filterWorkflowSnapshot'])vm.runInContext(functionSource(name),context);
 let rows=context.filterWorkflowSnapshot(workflows,projects,{project:'a',status:'all',taskStatus:'all'},true);
 assert.deepEqual(Array.from(rows,row=>row.workflow.id),['shared','a-private']);
 assert.equal(rows[0].workflow,shared);assert.equal(workflows.length,3);assert.equal(shared.projectId,undefined);
 rows=context.filterWorkflowSnapshot(workflows,projects,{project:'shared',status:'all',taskStatus:'problem'},true);
 assert.equal(rows.length,1);assert.equal(rows[0].workflow,shared);assert.deepEqual(Array.from(rows[0].tasks,task=>task.id),['failed']);
 rows=context.filterWorkflowSnapshot(workflows,projects,{project:'all',status:'problem',taskStatus:'all'},true);
 assert.deepEqual(Array.from(rows,row=>row.workflow.id),['a-private']);
 rows=context.filterWorkflowSnapshot(workflows,projects,{project:'b',status:'active',taskStatus:'active'},true);
 assert.equal(rows.length,1);assert.equal(rows[0].workflow,privateDoc);assert.equal(rows[0].tasks[0].id,'running');
 assert.equal(context.workflowMatchesProject(shared,'unknown',projects,true),false);
});

test('workflow drawer reaches all saved tasks and task detail returns to its original workflow',()=>{
 const tasks=Array.from({length:61},(_,i)=>({id:'w:'+i,label:'Task '+i,status:i===60?'error':'done',agentId:'copy',subtask:'Description '+i}));
 tasks[60].subtask='<script>unsafe</script>';
 const buttons=tasks.map((_,i)=>({getAttribute:()=>String(i)}));const elements={};
 const get=id=>elements[id]||(elements[id]={innerHTML:'',textContent:'',classList:{add(){}},querySelectorAll:()=>buttons});
 const context={data:{workflows:[{id:'w',orchestrator:'Marketing',task:'Goal',status:'error',progress:{done:60,total:61},nodes:tasks}]},$:get,openAgent(id){context.agent=id}};
 vm.createContext(context);for(const name of ['esc','openWorkflow','openTask'])vm.runInContext(functionSource(name),context);
 context.openWorkflow('w');assert.equal((get('drawerBody').innerHTML.match(/data-workflow-task=/g)||[]).length,61);
 buttons[60].onclick();assert.equal(get('drawerTitle').textContent,'Task 60');assert.ok(get('drawerBody').innerHTML.includes('w:60'));assert.ok(get('drawerBody').innerHTML.includes('error'));assert.ok(!get('drawerBody').innerHTML.includes('<script>'));assert.ok(get('drawerBody').innerHTML.includes('Lo snapshot non contiene gli output completi'));
 get('taskOpenAgent').onclick();assert.equal(context.agent,'copy');
 get('taskBackWorkflow').onclick();assert.equal(get('drawerTitle').textContent,'Marketing');
 const before=get('drawerBody').innerHTML;context.openTask('missing','w:60');assert.equal(get('drawerBody').innerHTML,before);
});
test('agent drawer links only to a workflow actually present in the snapshot',()=>{
 const elements={};const get=id=>elements[id]||(elements[id]={innerHTML:'',classList:{add(){}}});
 const context={$:get,AGENTS:[{id:'a',name:'Agent',group:'Team'}],data:{workflows:[{id:'real'}]},activeStatus:()=>({status:'done',workflowId:'real'}),openWorkflow(id){context.opened=id}};
 vm.createContext(context);for(const name of ['esc','openAgent'])vm.runInContext(functionSource(name),context);
 context.openAgent('a');get('agentOpenWorkflow').onclick();assert.equal(context.opened,'real');
 context.activeStatus=()=>({status:'idle',workflowId:'missing'});context.openAgent('a');assert.ok(!get('drawerBody').innerHTML.includes('agentOpenWorkflow'));
});
