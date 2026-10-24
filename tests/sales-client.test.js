'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {command,createHandler}=require('../api/_sales');
const W='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222',S='33333333-3333-4333-8333-333333333333',T='44444444-4444-4444-8444-444444444444',ID='55555555-5555-4555-8555-555555555555';
class Node {
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.listeners={};this.disabled=false;this.value='';this.textContent='';}
 append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this[k]=v;} addEventListener(k,fn){this.listeners[k]=fn;} focus(){} close(){this.open=false;} showModal(){this.open=true;} reset(){for(const n of this.querySelectorAll('input,select,textarea'))n.value='';}
 querySelectorAll(selector){const tags=selector.split(',').map(s=>s.trim().replace(/^#content /,''));return this.children.flatMap(n=>[...(tags.includes(n.tag)?[n]:[]),...n.querySelectorAll(selector)]);}
 querySelector(s){return this.querySelectorAll(s)[0];}
}
const response=(status=200,rows=[])=>({status,ok:status===200,json:async()=>({rows,error:status===200?undefined:'Denied'})});
function client(fetch=async()=>response()){
 const ids={};for(const id of ['status','error','editor-error','main','editor','editor-form','editor-fields','editor-title','content','workspace','membership','editor-cancel','refresh','navigation'])ids[id]=new Node(id==='workspace'?'select':id==='refresh'?'button':'div');
 ids['editor-form'].append(ids['editor-fields']);ids.editor.append(ids['editor-form']);
 const document={getElementById:id=>ids[id],createElement:tag=>new Node(tag),querySelectorAll:s=>[...ids.content.querySelectorAll(s),...ids.editor.querySelectorAll(s),ids.workspace,ids.refresh]};
 const ctx={document,fetch,AbortController,URLSearchParams,Intl,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,window:{confirm:()=>true,RadixCrmDates:require('../sales/crm-dates-core.js')},FormData:class {constructor(form){return form.querySelectorAll('input,select,textarea').filter(n=>n.name&&!n.disabled).map(n=>[n.name,String(n.value)]);}}};
 vm.createContext(ctx);let source=fs.readFileSync('sales/sales.js','utf8');source=source.replace('refresh(true);\n})();','globalThis.app={state,api,load,reload,refresh,render,card,openEditor,mutate,writable,invalidateAccess,openCustomer,loadCustomer,validUTC};\n})();');vm.runInContext(source,ctx);
 const app=ctx.app;Object.assign(app.state,{workspace:W,workspaces:[{id:W,name:'Workspace',role:'member'}],ready:true,rows:{processes:[{id:P,title:'Custom task',kind:'task'}],stages:[{id:T,process_id:P,title:'Review',position:8},{id:S,process_id:P,title:'Intake',position:2}],tasks:[],dashboard:[{companies:7}]}});
 return {app,ids,ctx,win:ctx.window,fields:()=>Object.fromEntries(ids['editor-fields'].querySelectorAll('input,select,textarea').map(n=>[n.name,n]))};
}
const row=()=>({id:ID,title:'Private task',version:4,process_id:P,stage_id:S,status:'done',opportunity_id:null});
const plain=x=>JSON.parse(JSON.stringify(x));
const tick=()=>new Promise(r=>setImmediate(r));
test('task board uses process/stage position, explicit no-process and unknown buckets, not status',()=>{const c=client();c.app.state.rows.tasks=[row(),{...row(),id:'free',title:'Free',process_id:null,stage_id:null},{...row(),id:'unknown',title:'Unknown',process_id:'other'}];c.app.render();const section=c.ids.content.children.find(n=>n.id==='tasks'),board=section.children.find(n=>n.className==='board');assert.deepEqual(board.children.map(n=>n.children[0].textContent),['Custom task / Intake — 1','Custom task / Review — 0','Senza processo — 1','Fase non assegnata / non caricata — 1']);assert.equal(board.children[0].querySelector('article').children[0].textContent,'Private task');});
test('task stage action sends coherent versioned update without inventing status mapping',async()=>{const posts=[];const c=client(async(_,opts)=>{if(opts.body)posts.push(JSON.parse(opts.body));return response();});const card=c.app.card('tasks',row());card.querySelector('select').value=T;await card.querySelectorAll('button').find(n=>n.textContent==='Conferma cambio fase').listeners.click();assert.deepEqual(posts[0].data,{id:ID,version:4,process_id:P,stage_id:T});assert.equal(posts[0].action,'update');assert.doesNotThrow(()=>command(posts[0]));});
test('viewer task phase controls disabled and retained callbacks cannot write',async()=>{let calls=0;const c=client(async()=>{calls++;return response();});c.app.state.workspaces[0].role='viewer';const card=c.app.card('tasks',row());assert.ok(card.querySelector('select').disabled);card.querySelector('select').value=T;await card.querySelectorAll('button')[0].listeners.click();assert.equal(calls,0);});
for(const entity of ['contacts','leads','opportunities','tasks'])test('update editor preserves current and unloaded relations: '+entity,()=>{const c=client();const r={...row(),name:'Contact',company_id:ID,contact_id:T,opportunity_id:S,amount_cents:12345};c.app.openEditor(entity,r);const f=c.fields();if(entity!=='tasks')assert.equal(f.company_id.value,ID);if(['leads','opportunities'].includes(entity))assert.equal(f.contact_id.value,T);if(entity==='opportunities')assert.equal(f.amount_cents.value,12345);if(entity==='tasks')assert.equal(f.opportunity_id.value,S);});
test('update form posts zero/null and original version; task can clear process pair',async()=>{for(const entity of ['opportunities','tasks']){const posts=[];const c=client(async(_,opts)=>{if(opts.body)posts.push(JSON.parse(opts.body));return response(409);});c.app.openEditor(entity,{...row(),amount_cents:42,company_id:ID,contact_id:T,opportunity_id:S});const f=c.fields();if(entity==='opportunities'){f.amount_cents.value='0';f.company_id.value='';f.contact_id.value='';}else{f.opportunity_id.value='';f.process_id.value='';f.process_id.listeners.change();}c.ids['editor-form'].listeners.submit({preventDefault(){},currentTarget:c.ids['editor-form']});await tick();assert.equal(posts[0].data.version,4);if(entity==='opportunities'){assert.equal(posts[0].data.amount_cents,0);assert.equal(posts[0].data.company_id,null);assert.equal(posts[0].data.contact_id,null);}else{assert.equal(posts[0].data.opportunity_id,null);assert.equal(posts[0].data.process_id,null);assert.equal(posts[0].data.stage_id,null);}assert.doesNotThrow(()=>command(posts[0]));}});
for(const status of [401,403])test('mutation '+status+' clears access, private DOM, editor and blocks writes',async()=>{let calls=0;const c=client(async()=>{calls++;return {status,ok:false,json:async()=>{throw Error('non JSON');}};});c.app.render();c.app.openEditor('tasks',row());await c.app.mutate('tasks','update',{id:ID,version:4,title:'X'},'Confirm');assert.equal(c.app.state.ready,false);assert.equal(c.app.state.workspace,null);assert.deepEqual(plain(c.app.state.workspaces),[]);assert.deepEqual(plain(c.app.state.rows),{});assert.equal(c.ids.content.children.length,0);assert.equal(c.ids.editor.open,false);assert.equal(c.ids['editor-fields'].children.length,0);assert.equal(c.ids.workspace.disabled,true);await c.app.mutate('tasks','update',{},'Again');assert.equal(calls,1);await assert.rejects(c.app.api('tasks'),e=>e.status===status);});
test('401 during parallel reload cannot be undone by late data/dashboard responses',async()=>{const pending=[];const c=client(()=>new Promise(resolve=>pending.push(resolve)));const loading=c.app.reload();pending[0](response(401));await tick();for(const resolve of pending.slice(1))resolve(response(200,[{id:ID,title:'Late private',companies:99}]));await loading;assert.equal(c.app.state.ready,false);assert.deepEqual(plain(c.app.state.rows),{});assert.equal(c.ids.content.children.length,0);});
test('late successful mutation after invalidation cannot reload or restore private state',async()=>{let resolve,calls=0;const c=client(()=>{calls++;return new Promise(r=>resolve=r);});const saving=c.app.mutate('tasks','update',{id:ID,version:4,title:'X'},'Confirm');c.app.invalidateAccess();resolve(response());await saving;assert.equal(calls,1);assert.equal(c.app.state.ready,false);assert.equal(c.ids.content.children.length,0);});
for(const kind of ['conflict','timeout'])test(kind+' preserves legitimate data and editor without auth invalidation',async()=>{const c=client(async()=>{if(kind==='timeout')throw Object.assign(Error('timeout'),{name:'AbortError'});return response(409);});c.app.render();c.app.openEditor('tasks',row());await c.app.mutate('tasks','update',{id:ID,version:4,title:'X'},'Confirm');assert.equal(c.app.state.ready,true);assert.equal(c.app.state.workspace,W);assert.ok(c.app.state.rows.dashboard);assert.equal(c.ids.editor.open,true);assert.ok(c.ids['editor-fields'].children.length);await assert.rejects(c.app.api('tasks'),e=>e.status===(kind==='conflict'?409:0));});
test('API task phase update retains ACL and rejects incoherent process/stage',async()=>{assert.throws(()=>command({workspace:W,entity:'tasks',action:'update',data:{id:ID,version:4,stage_id:T}}));let writes=0;const handler=createHandler({getSessionUser:()=>({uid:1}),getStore:()=>({membership:async()=>({role:'viewer'}),command:async()=>{writes++;}})});const res={setHeader(){},status(n){this.code=n;return this;},json(){}};await handler({method:'POST',headers:{'content-type':'application/json','x-radix-sales':'1'},body:{workspace:W,entity:'tasks',action:'update',data:{id:ID,version:4,process_id:P,stage_id:T}}},res);assert.equal(res.code,403);assert.equal(writes,0);});

const submit=c=>c.ids['editor-form'].listeners.submit({preventDefault(){},currentTarget:c.ids['editor-form']});
const contents=n=>[n.textContent,...n.children.map(contents)].join(' ');
// Phase A: owners manage members through the dedicated member commands (add form, change role, remove), never the generic editor.
test('members use member commands only, with no generic create/edit/delete path',async()=>{let calls=0;const c=client(async()=>{calls++;return response();});c.app.state.workspaces[0].role='owner';c.app.state.rows.members=[{id:12,name:'Ada',role:'member'}];c.app.render();const section=c.ids.content.children.find(n=>n.id==='members');assert.ok(!section.querySelectorAll('button').some(b=>/^Crea|^Modifica|^Elimina/.test(b.textContent)));c.app.openEditor('members');assert.notEqual(c.ids.editor.open,true);await c.app.mutate('members','create',{},'Confirm');assert.equal(calls,0);});
test('task metadata editor posts integer member and keeps the stored UTC due date untouched (shown in Rome time)',async()=>{const posts=[];const c=client(async(_,o)=>{if(o.body)posts.push(JSON.parse(o.body));return response(409);});c.app.state.rows.members=[{id:12,name:'Ada',role:'member'}];c.app.openEditor('tasks',{...row(),company_id:W,contact_id:T,assignee_id:12,priority:'urgent',due_at:'2026-10-10T14:30:00Z'});const f=c.fields();assert.equal(f.assignee_id.value,'12');assert.equal(f.due_at.type,'datetime-local');assert.equal(f.due_at.value,'2026-10-10T16:30');submit(c);await tick();assert.equal(posts[0].data.assignee_id,12);assert.equal(posts[0].data.priority,'urgent');assert.equal(posts[0].data.due_at,'2026-10-10T14:30:00Z');assert.equal(posts[0].data.company_id,W);assert.equal(posts[0].data.contact_id,T);assert.doesNotThrow(()=>command(posts[0]));});
test('UTC validation rejects naive, shifted zone and impossible date, accepts Z UTC',()=>{const c=client();for(const v of ['2026-10-10T14:30','2026-10-10T14:30:00+01:00','2026-10-10T14:30:00+00:00','2026-02-30T14:30:00Z','2026-10-10T24:30:00Z'])assert.equal(c.app.validUTC(v),false,v);for(const v of ['2026-10-10T14:30:00Z','2026-10-10T14:30:00.123Z'])assert.equal(c.app.validUTC(v),true,v);});
test('interaction create/edit uses audited command shape and renders literal text safely',async()=>{const posts=[];const c=client(async(_,o)=>{if(o.body)posts.push(JSON.parse(o.body));return response(409);});const r={id:ID,version:2,title:'Call',kind:'call',occurred_at:'2026-10-10T14:30:00Z',body:'<img src=x onerror=alert(1)>\nNotes',company_id:W,contact_id:T,opportunity_id:S};c.app.openEditor('interactions',r);let f=c.fields();assert.equal(f.body.maxLength,4000);assert.equal(f.title.maxLength,200);assert.equal(f.occurred_at.type,'datetime-local');assert.equal(f.occurred_at.value,'2026-10-10T16:30');submit(c);await tick();assert.equal(posts[0].entity,'interactions');assert.equal(posts[0].action,'update');assert.deepEqual(posts[0].data,r);assert.doesNotThrow(()=>command(posts[0]));const card=c.app.card('interactions',r);assert.ok(card.children.some(n=>n.textContent===r.body));assert.equal(card.querySelectorAll('img').length,0);await card.querySelectorAll('button').find(n=>n.textContent==='Elimina').listeners.click();assert.equal(posts[1].action,'delete');assert.deepEqual(posts[1].data,{id:ID,version:2});c.app.openEditor('interactions');f=c.fields();f.title.value='Note';f.occurred_at.value='2026-10-10T16:30';submit(c);await tick();assert.equal(posts[2].action,'create');assert.equal(posts[2].data.occurred_at,r.occurred_at);assert.equal(posts[2].data.body,'');assert.equal(posts[2].data.company_id,null);});
test('interaction invalid timestamp and oversized body never send',async()=>{let calls=0;const c=client(async()=>{calls++;return response();});c.app.openEditor('interactions');const f=c.fields();f.title.value='Call';f.occurred_at.value='2026-10-10T14:30:00Z';submit(c);assert.equal(calls,0);f.occurred_at.value='2026-02-30T14:30';submit(c);assert.equal(calls,0);f.occurred_at.value='';submit(c);assert.equal(calls,0);f.occurred_at.value='2026-10-10T14:30';f.body.value='a'.repeat(4001);submit(c);assert.equal(calls,0);});
test('stage generation requires complete explicit rules; zero days and cleared rules preserved',async()=>{const posts=[];const c=client(async(_,o)=>{if(o.body)posts.push(JSON.parse(o.body));return response(409);});c.app.state.workspaces[0].role='admin';c.app.state.rows.members=[{id:12,name:'Ada',role:'member'}];c.app.openEditor('stages',{id:S,version:2,title:'Intake',process_id:P,position:0,task_title:null});const f=c.fields();f.task_title.value='Follow up';submit(c);assert.equal(posts.length,0);f.task_assignee_id.value='12';f.task_priority.value='high';f.task_due_days.value='0';submit(c);await tick();assert.equal(posts[0].data.task_assignee_id,12);assert.equal(posts[0].data.task_due_days,0);f.task_title.value='';submit(c);assert.equal(posts.length,1);f.task_assignee_id.value='';f.task_priority.value='';f.task_due_days.value='';submit(c);await tick();for(const key of ['task_title','task_assignee_id','task_priority','task_due_days'])assert.equal(posts[1].data[key],null);});
test('Customer360 queries scoped server pages, includes root, never infers loaded relations',async()=>{const calls=[];const page=[{entity:'companies',record:{id:W,name:'Server root'}},...Array.from({length:99},(_,i)=>({entity:'interactions',record:{id:String(i),title:'Server only '+i,kind:'note',occurred_at:'2026-10-10T00:00:00Z'}}))];const c=client(async url=>{calls.push(new URL(url,'https://example.test'));return response(200,calls.length===1?page:[{entity:'contacts',record:{id:T,name:'Page two'}}]);});c.app.state.rows.contacts=[{id:ID,name:'Loaded unrelated',company_id:W}];const card=c.app.card('companies',{id:W,name:'Selected'});await card.querySelectorAll('button').find(n=>n.textContent==='Customer360').listeners.click();let panel=c.ids.content.children[0];assert.match(contents(panel),/Server root/);assert.match(contents(panel),/Server only 98/);assert.doesNotMatch(contents(panel),/Loaded unrelated/);assert.equal(panel.querySelectorAll('button').filter(n=>['Modifica','Elimina','Conferma stato'].includes(n.textContent)).length,0);await panel.querySelectorAll('button').find(n=>n.textContent.startsWith('Carica altri 100')).listeners.click();panel=c.ids.content.children[0];assert.match(contents(panel),/Page two/);assert.equal(panel.querySelectorAll('button').length,1);assert.equal(calls[0].searchParams.get('entity'),'customer360');assert.equal(calls[0].searchParams.get('subject'),'companies');assert.equal(calls[0].searchParams.get('id'),W);assert.equal(calls[0].searchParams.get('workspace'),W);assert.equal(calls[1].searchParams.get('offset'),'100');});
for(const status of [401,403])test('Customer360 auth '+status+' clears private results and prevents late restoration',async()=>{let call=0;const c=client(async()=>++call===1?response(200,[{entity:'companies',record:{id:ID,name:'Private root'}}]):response(status));await c.app.openCustomer('companies',{id:ID,name:'Root'});assert.match(contents(c.ids.content),/Private root/);await c.app.loadCustomer(true);assert.equal(c.app.state.workspace,null);assert.equal(c.ids.content.children.length,0);c.app.render();assert.equal(c.ids.content.children.length,0);});
test('Customer360 stale success after invalidation cannot restore data',async()=>{let resolve;const c=client(()=>new Promise(r=>resolve=r));const pending=c.app.openCustomer('contacts',{id:ID,name:'Private'});c.app.invalidateAccess();resolve(response(200,[{entity:'contacts',record:{id:ID,name:'Late private'}}]));await pending;assert.equal(c.ids.content.children.length,0);assert.equal(c.app.state.workspace,null);});

// Regression: a stage can reference a process outside the currently loaded page.
test('stage editor preserves unloaded current process as a selectable option',()=>{const c=client();c.app.state.workspaces[0].role='admin';c.app.openEditor('stages',{id:S,version:2,title:'Intake',process_id:ID,position:0,task_title:null});const control=c.fields().process_id;assert.equal(control.value,ID);assert.ok(control.children.some(option=>option.value===ID),'current process must remain an actual option in a real browser');});

const searchSection=(c,entity='companies')=>c.ids.content.children.find(n=>n.id===entity);
async function searchUI(c,value,entity='companies'){
 c.app.render();const form=searchSection(c,entity).querySelector('form');form.querySelector('input').value=value;
 await form.listeners.submit({preventDefault(){}});
}
test('search UI queries server not loaded subset, paginates same filter and resets offset',async()=>{
 const calls=[];const page=Array.from({length:100},(_,i)=>({id:String(i),name:'Server '+i}));
 const c=client(async url=>{const q=new URL(url,'https://example.test').searchParams;calls.push(Object.fromEntries(q));return response(200,q.get('search')==='Nexus'?(q.get('offset')==='100'?[{id:'next',name:'Server next'}]:page):[]);});
 c.app.state.rows.companies=[{id:'old',name:'Old unrelated'}];c.app.state.offset.companies=300;
 await searchUI(c,' Nexus ');assert.equal(calls[0].search,'Nexus');assert.equal(calls[0].offset,'0');assert.equal(calls[0].workspace,W);assert.equal(c.app.state.rows.companies.length,100);assert.doesNotMatch(contents(searchSection(c)),/Old unrelated/);
 await searchSection(c).querySelectorAll('button').find(n=>n.textContent.startsWith('Carica altri')).listeners.click();assert.equal(calls[1].search,'Nexus');assert.equal(calls[1].offset,'100');assert.equal(c.app.state.rows.companies.length,101);
 await searchSection(c).querySelectorAll('button').find(n=>n.textContent==='Azzera ricerca').listeners.click();assert.equal(calls[2].search,'');assert.equal(calls[2].offset,'0');assert.equal(c.app.state.rows.companies.length,0);
});
test('viewer can search contacts, empty state is explicit and filters independent',async()=>{
 const c=client(async()=>response());c.app.state.workspaces[0].role='viewer';c.app.state.search.companies='Company';
 await searchUI(c,'No match','contacts');assert.match(contents(searchSection(c,'contacts')),/Nessun risultato/);assert.equal(c.app.state.search.companies,'Company');assert.equal(searchSection(c,'contacts').querySelector('input').disabled,false);
});
test('search failure clears stale results, shows error not false empty and permits retry',async()=>{
 let calls=0;const c=client(async()=>++calls===1?response(503):response(200,[{id:ID,name:'Recovered'}]));c.app.state.rows.companies=[{id:'old',name:'Old'}];
 await searchUI(c,'Target');assert.equal(c.app.state.rows.companies.length,0);assert.match(contents(searchSection(c)),/Dati non disponibili/);assert.doesNotMatch(contents(searchSection(c)),/Nessun risultato/);assert.equal(c.app.state.busy,false);
 await searchUI(c,'Target');assert.match(contents(searchSection(c)),/Recovered/);assert.equal(c.app.state.errors.companies,undefined);
});
test('search validates length and controls locally and locks pending controls',async()=>{
 let resolve,calls=0;const c=client(()=>{calls++;return new Promise(r=>resolve=r);});
 for(const value of ['x'.repeat(201),'A\nB','A\0B'])await searchUI(c,value);assert.equal(calls,0);
 const pending=searchUI(c,'valid');assert.equal(calls,1);assert.equal(searchSection(c).querySelector('input').disabled,true);assert.equal(c.app.state.busy,true);
 resolve(response());await pending;assert.equal(searchSection(c).querySelector('input').disabled,false);assert.equal(c.app.state.busy,false);
});
for(const status of [401,403])test('search auth '+status+' removes filter and private results',async()=>{
 const c=client(async()=>response(status));await searchUI(c,'Private');assert.equal(c.app.state.workspace,null);assert.deepEqual(plain(c.app.state.search),{});assert.equal(c.ids.content.children.length,0);
});
test('late search success after invalidation does not restore data or filters',async()=>{
 let resolve;const c=client(()=>new Promise(r=>resolve=r));const pending=searchUI(c,'Private');c.app.invalidateAccess();resolve(response(200,[{id:ID,name:'Late'}]));await pending;assert.deepEqual(plain(c.app.state.search),{});assert.deepEqual(plain(c.app.state.rows),{});assert.equal(c.ids.content.children.length,0);
});
test('workspace switch clears search while reload in same workspace retains it',async()=>{
 const calls=[];const c=client(async url=>{calls.push(Object.fromEntries(new URL(url,'https://example.test').searchParams));return response();});
 c.app.state.search.companies='Remember';await c.app.reload();assert.equal(calls.find(q=>q.entity==='companies').search,'Remember');
 c.ids.workspace.value=P;c.ids.workspace.listeners.change();await tick();assert.deepEqual(plain(c.app.state.search),{});assert.equal(calls.filter(q=>q.entity==='companies').at(-1).search,undefined);
});

// Opportunity ownership and calendar date: offline DOM/fetch, not browser/DB proof.
test('opportunity editor preserves unloaded owner and date-only value, sends versioned metadata',async()=>{
 const posts=[];const c=client(async(_,o)=>{if(o.body)posts.push(JSON.parse(o.body));return response(409);});
 c.app.openEditor('opportunities',{...row(),owner_id:27,expected_close:'2026-10-14',amount_cents:123});
 const f=c.fields();assert.equal(f.owner_id.value,'27');assert.ok(f.owner_id.children.some(o=>String(o.value)==='27'));assert.equal(f.expected_close.type,'date');assert.equal(f.expected_close.value,'2026-10-14');assert.equal(f.expected_close.min,'0001-01-01');assert.equal(f.expected_close.max,'9999-12-31');
 submit(c);await tick();assert.equal(posts[0].data.owner_id,27);assert.equal(posts[0].data.expected_close,'2026-10-14');assert.equal(posts[0].data.version,4);assert.equal(Object.hasOwn(posts[0].data,'stage_id'),false);assert.doesNotThrow(()=>command(posts[0]));
 f.owner_id.value='';f.expected_close.value='';submit(c);await tick();assert.equal(posts[1].data.owner_id,null);assert.equal(posts[1].data.expected_close,null);
});
test('opportunity metadata invalid owner or date never sends a request',()=>{
 let calls=0;const c=client(async()=>{calls++;return response();});c.app.openEditor('opportunities',{...row(),amount_cents:0});const f=c.fields();
 for(const v of ['0000-01-01','2026-02-29','2026-04-31','2026-10-14T00:00:00Z','10000-01-01']){f.expected_close.value=v;submit(c);}f.expected_close.value='2024-02-29';
 for(const v of ['0','-1','1.5','2147483648','abc']){f.owner_id.value=v;submit(c);}assert.equal(calls,0);
});
test('opportunity create sends explicit nullable defaults and valid selected metadata',async()=>{
 const posts=[];const c=client(async(_,o)=>{if(o.body)posts.push(JSON.parse(o.body));return response(409);});c.app.state.rows.processes=[{id:P,title:'Sales',kind:'opportunity'}];c.app.state.rows.members=[{id:12,name:'Ada',role:'viewer'}];
 c.app.openEditor('opportunities');const f=c.fields();f.title.value='Deal';f.process_id.value=P;f.process_id.listeners.change();f.stage_id.value=S;submit(c);await tick();assert.equal(posts[0].data.owner_id,null);assert.equal(posts[0].data.expected_close,null);assert.doesNotThrow(()=>command(posts[0]));
 f.owner_id.value='12';f.expected_close.value='2024-02-29';submit(c);await tick();assert.equal(posts[1].data.owner_id,12);assert.equal(posts[1].data.expected_close,'2024-02-29');assert.doesNotThrow(()=>command(posts[1]));
});
test('opportunity pipeline and Customer360 cards expose metadata without enabling viewer writes',async()=>{
 let calls=0;const c=client(async()=>{calls++;return response();});c.app.state.rows.members=[{id:12,name:'Ada',role:'member'}];c.app.state.workspaces[0].role='viewer';const r={...row(),owner_id:12,expected_close:'2026-10-14'};
 for(const readonly of [false,true]){const card=c.app.card('opportunities',r,readonly);assert.match(contents(card),/Ada/);assert.match(contents(card),/Chiusura prevista: 14\/10\/2026/);if(readonly)assert.equal(card.querySelectorAll('button').length,0);}
 c.app.openEditor('opportunities',r);assert.notEqual(c.ids.editor.open,true);await c.app.mutate('opportunities','update',{id:ID,version:4,owner_id:12},'Confirm');assert.equal(calls,0);assert.match(contents(c.app.card('opportunities',{...r,owner_id:null,expected_close:null},true)),/non impostata/);
});

const taskSection=c=>c.ids.content.children.find(n=>n.id==='tasks');
async function filterTasks(c,value){c.app.render();const control=taskSection(c).querySelector('select');control.value=value;await control.listeners.change();}
test('task due filter queries server and keeps filter across pages and reload',async()=>{
 const calls=[];const page=Array.from({length:100},(_,i)=>({...row(),id:String(i),title:'Server task '+i}));const c=client(async url=>{const q=Object.fromEntries(new URL(url,'https://example.test').searchParams);calls.push(q);return response(200,q.entity==='tasks'?(q.offset==='100'?[{...row(),title:'Next task'}]:page):[]);});
 c.app.state.workspaces[0].role='viewer';c.app.state.offset.tasks=300;await filterTasks(c,'overdue');assert.equal(calls[0].due,'overdue');assert.equal(calls[0].offset,'0');assert.equal(calls[0].workspace,W);assert.equal(taskSection(c).querySelector('select').disabled,false);
 await taskSection(c).querySelectorAll('button').find(n=>n.textContent.startsWith('Carica altri')).listeners.click();assert.equal(calls[1].due,'overdue');assert.equal(calls[1].offset,'100');assert.match(contents(taskSection(c)),/Next task/);
 await c.app.reload();assert.equal(calls.filter(q=>q.entity==='tasks').at(-1).due,'overdue');await filterTasks(c,'all');assert.equal(calls.at(-1).due,'all');assert.equal(calls.at(-1).offset,'0');
});
test('task due filter failure clears stale records and recovery remains possible',async()=>{
 let n=0;const c=client(async()=>++n===1?response(503):response());c.app.state.rows.tasks=[row()];await filterTasks(c,'upcoming');assert.equal(c.app.state.rows.tasks.length,0);assert.match(contents(taskSection(c)),/Dati non disponibili/);assert.equal(c.app.state.busy,false);await filterTasks(c,'unscheduled');assert.equal(c.app.state.errors.tasks,undefined);
});
for(const status of [401,403])test('task due filter auth '+status+' invalidates records and filter',async()=>{const c=client(async()=>response(status));await filterTasks(c,'overdue');assert.equal(c.app.state.workspace,null);assert.equal(c.app.state.taskDue,'all');assert.equal(c.ids.content.children.length,0);});
test('task due filter locks controls and ignores late data after invalidation',async()=>{
 let resolve;const c=client(()=>new Promise(r=>resolve=r));const pending=filterTasks(c,'upcoming');assert.equal(taskSection(c).querySelector('select').disabled,true);c.app.invalidateAccess();resolve(response(200,[row()]));await pending;assert.equal(c.app.state.taskDue,'all');assert.deepEqual(plain(c.app.state.rows),{});
});
test('workspace switch resets task due filter',async()=>{const c=client(async()=>response());c.app.state.taskDue='overdue';c.ids.workspace.value=P;c.ids.workspace.listeners.change();await tick();assert.equal(c.app.state.taskDue,'all');});
// Date in ora italiana nell'editor (sales/crm-dates-core.js): conversione, cambio d'ora senza deriva, campo vuoto, «Slot liberi».
test('editor dates: Rome time in, UTC ISO out; DST overlap kept; optional due date clears to null',async()=>{
 const posts=[];const c=client(async(_,o)=>{if(o.body)posts.push(JSON.parse(o.body));return response(409);});
 c.app.openEditor('tasks',{...row(),due_at:'2026-10-25T01:30:00Z'});let f=c.fields();assert.equal(f.due_at.value,'2026-10-25T02:30');
 submit(c);await tick();assert.equal(posts[0].data.due_at,'2026-10-25T01:30:00Z','second 02:30 of 25 October survives an untouched save');
 c.app.openEditor('tasks',{...row(),due_at:'2026-03-29T08:00:00Z'});f=c.fields();assert.equal(f.due_at.value,'2026-03-29T10:00');f.due_at.value='2026-03-30T09:15';
 submit(c);await tick();assert.equal(posts[1].data.due_at,'2026-03-30T07:15:00Z');assert.doesNotThrow(()=>command(posts[1]));
 c.app.openEditor('tasks',{...row(),due_at:'2026-01-10T08:00:00Z'});f=c.fields();assert.equal(f.due_at.value,'2026-01-10T09:00');f.due_at.value='';
 submit(c);await tick();assert.equal(posts[2].data.due_at,null);assert.doesNotThrow(()=>command(posts[2]));
 c.app.state.workspaces[0].role='member';c.app.openEditor('tickets',{id:ID,version:3,title:'Help',status:'open',priority:'normal',channel:'email',due_at:'2026-10-10T14:30:15.250Z'});f=c.fields();
 assert.equal(f.due_at.value,'2026-10-10T16:30:15');assert.equal(f.due_at.step,'1');submit(c);await tick();assert.equal(posts[3].data.due_at,'2026-10-10T14:30:15.250Z','seconds and milliseconds intact');
});
test('editor dates: «Slot liberi» under task, ticket and future interaction dates; not under past interactions',()=>{
 const c=client(),D=require('../sales/crm-dates-core.js');
 // Fake picker: the real one is tested in crm-record-slots.test.js; here only where it appears and what a pick writes.
 c.win.RadixCrmCalendars={slotPicker:({onPick})=>{const n=new (c.ids.content.constructor)('div');n.className='cs-slots';n.classList={add:x=>{n.className+=' '+x;}};n.pick=onPick;return n;}};
 const find=()=>c.ids['editor-fields'].querySelectorAll('div').find(n=>/cs-slots/.test(n.className||''));
 c.app.openEditor('tasks',row());assert.ok(find(),'task');assert.match(find().className,/editor-slots/);
 // The picker gives a value in ora italiana, like the field: written as is, saved as the same instant.
 const input=c.fields().due_at,events=[];input.dispatchEvent=e=>events.push(e.type);c.ctx.Event=class{constructor(t){this.type=t;}};
 find().pick('2026-10-26T09:30');assert.equal(input.value,'2026-10-26T09:30');assert.equal(D.fromInput(input.value).value,'2026-10-26T08:30:00Z');assert.deepEqual(events,['input','change']);
 find().pick('not a date');assert.equal(input.value,'2026-10-26T09:30','an invalid pick changes nothing');
 c.app.openEditor('tickets');assert.ok(find(),'ticket');
 c.app.openEditor('interactions');assert.ok(find(),'new interaction');
 c.app.openEditor('interactions',{id:ID,version:1,title:'Call',kind:'call',occurred_at:'2026-01-10T10:00:00Z'});assert.equal(find(),undefined,'past interaction: no slots');
 c.app.openEditor('interactions',{id:ID,version:1,title:'Meet',kind:'meeting',occurred_at:new Date(Date.now()+864e5).toISOString().slice(0,19)+'Z'});assert.ok(find(),'future interaction');
 c.app.openEditor('opportunities',{...row(),amount_cents:1,expected_close:'2026-11-30'});assert.equal(find(),undefined,'expected close is a calendar date: no slots');assert.equal(c.fields().expected_close.type,'date');assert.equal(c.fields().expected_close.value,'2026-11-30');
 c.app.state.workspaces[0].role='viewer';c.app.openEditor('tasks',row());assert.equal(find(),undefined,'viewer: editor (and picker) never open');
});
test('cards show Rome time, not raw UTC',()=>{
 const c=client();
 const t=contents(c.app.card('tasks',{...row(),due_at:'2026-10-10T14:30:00Z'}));assert.match(t,/Scadenza: 10\/10\/2026, 16:30/);assert.doesNotMatch(t,/UTC|14:30:00Z/);
 const i=contents(c.app.card('interactions',{id:ID,version:1,title:'Call',kind:'call',occurred_at:'2026-01-15T09:05:00Z'}));assert.match(i,/Data: 15\/01\/2026, 10:05/);assert.doesNotMatch(i,/UTC/);
 const k=contents(c.app.card('tickets',{id:ID,version:1,title:'Help',status:'resolved',priority:'normal',channel:'email',due_at:null,resolved_at:'2026-10-24T22:30:00Z'}));assert.match(k,/Scadenza: nessuna/);assert.match(k,/Risolto il 25\/10\/2026/);
 assert.match(contents(c.app.card('opportunities',{...row(),amount_cents:1,expected_close:'2026-11-30'})),/Chiusura prevista: 30\/11\/2026/);
});
