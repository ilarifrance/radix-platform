'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const V=require('../sales/crm-visibility-core.js');
const vis=require('../api/_sales_visibility');
const reserved=require('../api/_sales_reserved');
const {command,createHandler}=require('../api/_sales');
const {createStore}=require('../api/_sales_store');
const {createDocumentsStore}=require('../api/_sales_documents');
const clicks=require('../api/_sales_clicks');
const {snapshot}=require('../api/_crm-context');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',ID='9220862f-d82e-4c33-a2b2-899d4a77fe16';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const res=()=>{const r={headers:{},setHeader(a,v){r.headers[a]=v},status(s){r.code=s;return r},json(b){r.body=b;return r}};return r};
const PERSONAL=['opportunities','leads','tasks','tickets','interactions','companies','contacts'];

// Fake pg: in-memory rows; a list query is filtered only when it carries the predicate of its own entity (the oracle below is
// the rule in plain JS, the same one sales/crm-visibility-core.js describes). The real SQL ran against PostgreSQL 16 by hand.
function fakeDb(){
 const db={roles:{1:'owner',2:'member',3:'member',4:'viewer',5:'admin'},ownOnly:false,seen:[],
  rows:{companies:[{id:id(1),name:'Alfa',owner_id:2},{id:id(2),name:'Beta',owner_id:3},{id:id(3),name:'Gamma',created_by:1},{id:id(4),name:'Delta',created_by:2}],
   contacts:[{id:id(11),name:'Anna',company_id:id(1)},{id:id(12),name:'Bruno',company_id:id(2)},{id:id(13),name:'Carla',created_by:2}],
   opportunities:[{id:id(21),title:'Opp Mario',owner_id:2,company_id:id(3)},{id:id(22),title:'Opp Luisa',owner_id:3,company_id:id(2)}],
   tasks:[{id:id(31),title:'Task Mario',assignee_id:2},{id:id(32),title:'Task Luisa',assignee_id:3,created_by:1}],
   tickets:[{id:id(51),title:'Ticket Luisa',assignee_id:3,contact_id:id(12)}],
   interactions:[{id:id(41),title:'Nota Mario',opportunity_id:id(21),created_by:1},{id:id(42),title:'Nota Luisa',opportunity_id:id(22),created_by:3}],
   leads:[{id:id(61),title:'Lead Mario',owner_id:2},{id:id(62),title:'Lead Luisa',owner_id:3}],
   processes:[{id:id(90),title:'Vendite'}],segments:[{id:id(70),name:'Milano',filters:{city:'Milano'}}]}};
 const R=db.rows,mine=(r,u)=>r.owner_id===u||r.created_by===u||r.assignee_id===u;
 const linked=(e,col,u)=>['opportunities','tasks','tickets'].some(k=>R[k].some(x=>x[col]===e.id&&mine(x,u)));
 const oracle={opportunities:mine,leads:mine,tasks:mine,tickets:mine,
  interactions:(r,u)=>r.created_by===u||R.opportunities.some(o=>o.id===r.opportunity_id&&mine(o,u)),
  companies:(r,u)=>mine(r,u)||linked(r,'company_id',u),
  contacts:(r,u)=>mine(r,u)||linked(r,'contact_id',u)||R.companies.some(c=>c.id===r.company_id&&mine(c,u))};
 db.sees=(e,u)=>db.ownOnly&&['member','viewer'].includes(db.roles[u])&&oracle[e]?R[e].filter(r=>oracle[e](r,u)):R[e];
 db.sql=async(q,p=[])=>{db.seen.push([q,p]);
  if(/^SELECT m\.role FROM sales_memberships/.test(q))return db.roles[p[1]]?[{role:db.roles[p[1]]}]:[];
  if(/^SELECT sales_command/.test(q))return [{result:{ok:true}}];
  if(/^SELECT t\.id FROM sales_(\w+) t WHERE t\.workspace_id=\$1 AND t\.id=ANY/.test(q)){const e=q.match(/sales_(\w+) t/)[1],u=p[1];
   assert.ok(q.includes('NOT '+vis.visible(e)),'the write check uses the read predicate');return (R[e]||[]).filter(r=>p[2].includes(r.id)&&!db.sees(e,u).includes(r)).map(r=>({id:r.id}))}
  const m=q.match(/FROM sales_(\w+) t[ ,]/);if(!m||!R[m[1]])return [];
  const e=m[1],u=p[1];return q.includes(vis.visible(e))?db.sees(e,u):R[e];
 };
 return db;
}
const titles=rows=>rows.map(r=>r.name||r.title).sort();

test('core: the switch, its validation and who it limits',()=>{
 assert.equal(V.RESERVED,'__visibilita__');
 assert.equal(V.error({ownOnly:true}),null);assert.equal(V.error({ownOnly:false}),null);
 for(const bad of [{},{ownOnly:'si'},{ownOnly:true,extra:1},[],null,'x'])assert.ok(V.error(bad),JSON.stringify(bad));
 assert.equal(V.settings(null).ownOnly,false);assert.equal(V.settings({filters:{visibility:{ownOnly:true}}}).ownOnly,true);
 assert.equal(V.settings({filters:{visibility:{ownOnly:1}}}).ownOnly,false,'a broken row means off');
 const on={filters:{visibility:{ownOnly:true}}};
 assert.ok(V.limits(on,'member')&&V.limits(on,'viewer'));assert.ok(!V.limits(on,'owner')&&!V.limits(on,'admin'));assert.ok(!V.limits(null,'member'));
 assert.equal(V.NOTE,'Vedi solo i tuoi record');
});

test('reserved row «__visibilita__»: validated, kept apart from segments, hidden from the list, read with subject=visibility',async()=>{
 const cmd=(action,data)=>command({workspace:W,entity:'segments',action,data});
 assert.ok(reserved.NAMES.includes('__visibilita__'));assert.equal(reserved.bySubject('visibility'),'__visibilita__');
 assert.deepEqual(cmd('create',{name:'__visibilita__',filters:{visibility:{ownOnly:true}}}).data.filters,{visibility:{ownOnly:true}});
 assert.throws(()=>cmd('create',{name:'__visibilita__',filters:{city:'Milano'}}),/riservato alla visibilità dei record/);
 assert.throws(()=>cmd('create',{name:'Milano',filters:{visibility:{ownOnly:true}}}),/riservato alla visibilità dei record/);
 assert.throws(()=>cmd('create',{name:'__visibilita__',filters:{visibility:{ownOnly:'si'}}}),/Visibilità non valida/);
 assert.throws(()=>cmd('create',{name:'__sla__',filters:{visibility:{ownOnly:true}}}),/riservato/);
 const db=fakeDb(),store=createStore(db.sql);
 await store.read({workspace:W,entity:'segments',offset:0},2);
 assert.deepEqual(db.seen.at(-1)[1][3],['__regole__','__sla__','__visibilita__','__trova_email__'],'the plain segment list excludes it');
 // Handler: every member reads it; only owners/admins write it.
 const calls=[];let role='member';
 const fake={membership:async()=>({role}),sql:async q=>{calls.push(q);return /SELECT name FROM sales_segments/.test(q)?[{name:'__visibilita__'}]:[]},hidden:async()=>[],read:async c=>[{c}],command:async c=>({ok:c.entity})};
 const h=createHandler({getSessionUser:()=>({uid:2}),getStore:()=>fake});
 let r=res();await h({method:'GET',headers:{},query:{entity:'segments',workspace:W,subject:'visibility'}},r);assert.equal(r.code,200);assert.equal(r.body.rows[0].c.reserved,'__visibilita__');
 const post=async(action,data)=>{const x=res();await h({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},query:{},body:{workspace:W,entity:'segments',action,data}},x);return x};
 r=await post('create',{name:'__visibilita__',filters:{visibility:{ownOnly:false}}});assert.equal(r.code,403);assert.match(r.body.error,/visibilità dei record/);
 r=await post('update',{id:ID,version:1,filters:{visibility:{ownOnly:false}}});assert.equal(r.code,403);
 r=await post('delete',{id:ID,version:1});assert.equal(r.code,403);
 role='admin';r=await post('update',{id:ID,version:1,filters:{visibility:{ownOnly:true}}});assert.equal(r.code,200);
 role='owner';r=await post('delete',{id:ID,version:1});assert.equal(r.code,200);
});

test('predicate: one helper, read inside SQL; only member/viewer with ownOnly=true are narrowed',()=>{
 const p=vis.visible('opportunities');
 assert.match(p,/^\(NOT EXISTS\(SELECT 1 FROM sales_memberships v_m JOIN sales_segments v_s/);
 assert.match(p,/v_m\.role IN\('member','viewer'\)/);assert.match(p,/lower\(btrim\(v_s\.name\)\)='__visibilita__'/);assert.match(p,/->'visibility'->>'ownOnly'='true'/);
 assert.match(p,/t\.owner_id=\$2 OR t\.created_by=\$2/);
 assert.match(vis.visible('tasks'),/t\.assignee_id=\$2 OR t\.created_by=\$2/);assert.match(vis.visible('tickets'),/t\.assignee_id=\$2/);
 assert.match(vis.visible('companies'),/\(to_jsonb\(t\)->>'owner_id'\)::integer=\$2/,'owner_id of migration 011 through to_jsonb');
 assert.match(vis.visible('companies'),/FROM sales_tasks v_t WHERE v_t\.workspace_id=t\.workspace_id AND v_t\.company_id=t\.id/);
 assert.match(vis.visible('contacts'),/FROM sales_companies v_c WHERE v_c\.workspace_id=t\.workspace_id AND v_c\.id=t\.company_id/);
 assert.match(vis.visible('interactions','i'),/i\.created_by=\$2 OR EXISTS\(SELECT 1 FROM sales_opportunities v_o WHERE v_o\.workspace_id=i\.workspace_id AND v_o\.id=i\.opportunity_id/);
 assert.match(vis.visible('documents'),/t\.created_by=\$2/);
 for(const e of ['processes','stages','segments','products','members'])assert.equal(vis.visible(e),'TRUE');
 assert.equal(vis.and('stages'),'');assert.throws(()=>vis.visible('tasks','t;drop'),/invalid alias/);
 assert.deepEqual([...vis.ENTITIES].sort(),[...PERSONAL,'documents'].sort());
});

test('reads: a member with the switch sees only own records, admin/owner see all, switch off changes nothing',async()=>{
 const db=fakeDb(),store=createStore(db.sql);
 const list=async(entity,u,extra={})=>titles(await store.read({workspace:W,entity,offset:0,...extra},u));
 for(const e of PERSONAL)assert.equal((await list(e,2)).length,db.rows[e].length,'switch off: '+e);
 db.ownOnly=true;
 assert.deepEqual(await list('opportunities',2),['Opp Mario']);
 assert.deepEqual(await list('tasks',2),['Task Mario']);
 assert.deepEqual(await list('tickets',2),[]);
 assert.deepEqual(await list('interactions',2),['Nota Mario']);
 assert.deepEqual(await list('leads',2),['Lead Mario']);
 assert.deepEqual(await list('companies',2),['Alfa','Delta','Gamma'],'owned, created, or holding my opportunity');
 assert.deepEqual(await list('contacts',2),['Anna','Carla'],'created by me, or of a company I own');
 assert.deepEqual(await list('contacts',3),['Bruno'],'Luisa: her company and her ticket');
 assert.deepEqual(await list('companies',2,{search:'a'}),['Alfa','Delta','Gamma'],'search');
 assert.deepEqual(await list('tasks',2,{due:'all'}),['Task Mario'],'due filter');
 assert.deepEqual(titles(await store.read({workspace:W,entity:'export',subject:'contacts',offset:0},2)),['Anna','Carla'],'CSV export');
 assert.deepEqual(await list('tasks',4),[],'a viewer owns nothing');
 for(const u of [1,5])for(const e of PERSONAL)assert.equal((await list(e,u)).length,db.rows[e].length,'owner/admin: '+e);
 assert.deepEqual(await list('processes',2),['Vendite'],'pipelines stay shared');
 // Every list query binds the caller as $2 next to the workspace.
 assert.ok(db.seen.every(([,p])=>p[0]===W&&Number.isInteger(p[1])));
});

test('aggregates and side paths carry the predicate: dashboard, Customer360, documents, clicks, campaign report, copilot',async()=>{
 const seen=[];const sql=async(q,p)=>{seen.push([q,p]);return []};const store=createStore(sql);
 await store.read({workspace:W,entity:'dashboard',offset:0},2);
 const dash=seen.at(-1)[0];
 for(const e of ['companies','contacts','leads','opportunities','tasks'])assert.ok(dash.includes('FROM sales_'+e+' t WHERE t.workspace_id=$1 AND '+vis.visible(e)+') AS '+e),'dashboard '+e);
 assert.ok(dash.includes("t.outcome='open' AND "+vis.visible('opportunities')+') AS open_amount_cents'),'pipeline value');
 await store.read({workspace:W,entity:'customer360',subject:'companies',id:ID,offset:0},2);
 const c360=seen.at(-1)[0];for(const e of PERSONAL.filter(e=>e!=='leads'))assert.ok(c360.includes(vis.visible(e)),'Customer360 '+e);
 assert.match(c360,/WITH root AS \(SELECT to_jsonb\(t\) AS r FROM sales_companies t WHERE t\.workspace_id=\$1 AND t\.id=\$3::uuid AND EXISTS[^]*?\(NOT EXISTS/,'a hidden root gives no rows');
 await store.read({workspace:W,entity:'export',subject:'companies',offset:0},2);assert.ok(seen.at(-1)[0].includes(vis.visible('companies')));
 const docs=createDocumentsStore(sql);
 await docs.read({workspace:W,entity:'documents',offset:0},2);assert.ok(seen.at(-1)[0].includes(vis.visible('documents')));
 await docs.read({workspace:W,entity:'document',id:ID,offset:0},2);assert.ok(seen.at(-1)[0].includes(vis.visible('documents')));
 await docs.read({workspace:W,entity:'products',offset:0},2);assert.ok(!seen.at(-1)[0].includes('__visibilita__'),'products stay shared');
 let n=seen.length;await clicks.report(sql,W,2);
 for(const [q,p] of seen.slice(n)){assert.ok(q.includes(vis.contact('sales_email_clicks.contact_id'))||q.includes(vis.contact('k.contact_id')),q);assert.deepEqual(p,[W,2])}
 n=seen.length;await clicks.campaignData(sql,W,2);
 const cd=seen.slice(n).map(x=>x[0]);assert.equal(cd.length,5);
 assert.ok(cd[0].includes(vis.contact('s.contact_id')));assert.ok(cd[1].includes(vis.contact('sales_email_clicks.contact_id')));assert.ok(cd[2].includes(vis.visible('contacts','c')));
 assert.ok(cd[3].includes(vis.contact('i.contact_id')));assert.ok(cd[4].includes(vis.visible('opportunities','o')));
 n=seen.length;await clicks.report(sql,W);assert.ok(seen.slice(n).every(([q,p])=>!q.includes('__visibilita__')&&p.length===1),'no caller: unchanged');
 // Copilot snapshot (crmScope of /api/chat): each list carries the predicate, the caller is $2, and the model is told.
 const qs=[];const fake=async(q,p)=>{qs.push([q,p]);if(/FROM sales_memberships m JOIN sales_workspaces/.test(q))return [{role:'member',name:'Demo',own_only:true}];return []};
 const text=await snapshot(fake,2,W);
 assert.match(text,/Visibilità: il workspace mostra a questo utente solo i propri record/);
 assert.ok(qs.every(([,p])=>p[0]===W&&p[1]===2));
 const body=qs.map(x=>x[0]).join('\n');
 for(const [e,a] of [['opportunities','o'],['tasks','t'],['contacts','k'],['interactions','i'],['opportunities','x'],['tickets','t']])assert.ok(body.includes(vis.visible(e,a)),'copilot '+e+' '+a);
 assert.doesNotMatch(await snapshot(async q=>/sales_workspaces/.test(q)?[{role:'admin',name:'Demo',own_only:false}]:[],1,W),/Visibilità:/);
});

test('writes: a member cannot change or link to a hidden record (404); own records, admins and owners go through',async()=>{
 const db=fakeDb();db.ownOnly=true;const store=createStore(db.sql);
 const post=async(uid,entity,action,data)=>{const r=res();await createHandler({getSessionUser:()=>({uid}),getStore:()=>store})({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},query:{},body:{workspace:W,entity,action,data}},r);return r};
 let r=await post(2,'tasks','update',{id:id(32),version:1,title:'Presa'});assert.equal(r.code,404);assert.equal(r.body.error,'Record non trovato.');
 r=await post(2,'opportunities','delete',{id:id(22),version:1});assert.equal(r.code,404);
 r=await post(2,'opportunities','transition',{id:id(22),version:1,stage_id:ID,key:ID});assert.equal(r.code,404);
 r=await post(2,'companies','update',{id:id(2),version:1,city:'Roma'});assert.equal(r.code,404);
 r=await post(2,'tasks','create',{title:'Aggancio',company_id:id(2)});assert.equal(r.code,404,'linking to a hidden company would reveal it');
 r=await post(2,'interactions','create',{title:'Nota',kind:'note',occurred_at:'2026-10-21T10:00:00Z',opportunity_id:id(22)});assert.equal(r.code,404);
 r=await post(2,'unsubscribe_links','create',{contacts:[id(11),id(12)]});assert.equal(r.code,404,'signed links only for visible contacts');
 r=await post(2,'tasks','update',{id:id(31),version:1,title:'Mia'});assert.equal(r.code,200);
 r=await post(2,'tasks','create',{title:'Nuova',company_id:id(1)});assert.equal(r.code,200);
 r=await post(4,'tasks','update',{id:id(31),version:1,title:'x'});assert.equal(r.code,403,'viewers never write');
 const before=db.seen.length;
 r=await post(5,'tasks','update',{id:id(32),version:1,title:'Admin'});assert.equal(r.code,200);
 r=await post(1,'opportunities','delete',{id:id(22),version:1});assert.equal(r.code,200);
 assert.ok(!db.seen.slice(before).some(([q])=>/t\.id=ANY/.test(q)),'owner/admin: no visibility query at all');
 db.ownOnly=false;r=await post(2,'tasks','update',{id:id(32),version:1,title:'Libera'});assert.equal(r.code,200,'switch off: as before');
});

test('page: settings panel in Membri for owners/admins, header note for members, scripts after the SLA ones',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8'),i=f=>html.indexOf(f);
 assert.ok(i('src="sales/crm-visibility-core.js" defer')>i('src="sales/crm-sla.js" defer')&&i('src="sales/crm-visibility.js" defer')>i('src="sales/crm-visibility-core.js"'));
 assert.ok(i('sales/crm-visibility.css')>0);
 assert.match(fs.readFileSync(__dirname+'/../sales/crm-tools.js','utf8'),/entity==='members'\)window\.RadixCrmVisibility\?\.section\?\.\(section\)/);
 const ui=fs.readFileSync(__dirname+'/../sales/crm-visibility.js','utf8');
 assert.match(ui,/I member vedono solo i propri record/);assert.match(ui,/\['owner','admin'\]\.includes/);assert.match(ui,/subject:'visibility'/);
 assert.match(ui,/V\.limits\(v\.row,app\(\)\.role\(\)\)/);assert.match(ui,/V\.NOTE/);
 assert.doesNotMatch(ui,/api\/chat|innerHTML/);
});

test('review: joined names, campaign interactions and the 011 links follow the rule too',async()=>{
 // CSV export of contacts: the company name comes only from a company the member may see.
 const seen=[];const sql=async(q,p)=>{seen.push([q,p]);return []};const store=createStore(sql);
 await store.read({workspace:W,entity:'export',subject:'contacts',offset:0},2);
 assert.ok(seen.at(-1)[0].includes('c.id=t.company_id AND '+vis.visible('companies','c')),'export: hidden company name');
 // Campaign report: sends and later contacts are interactions, so only the member's own (or of their opportunities).
 let n=seen.length;await clicks.campaignData(sql,W,2);const cd=seen.slice(n).map(x=>x[0]);
 assert.ok(cd[0].includes(vis.visible('interactions','s')),'campaign sends');assert.ok(cd[3].includes(vis.visible('interactions','i')),'campaign follow-ups');
 n=seen.length;await clicks.campaignData(sql,W);assert.ok(seen.slice(n).every(([q,p])=>!q.includes('__visibilita__')&&p.length===1),'no caller: unchanged');
 // Copilot: company and contact names joined to interactions and contacts come only from visible records.
 const qs=[];await snapshot(async q=>{qs.push(q);return /sales_workspaces/.test(q)?[{role:'member',name:'Demo',own_only:true}]:[]},2,W);
 const inter=qs.find(q=>/^SELECT i\.kind/.test(q)),cont=qs.find(q=>/^SELECT k\.name/.test(q));
 assert.ok(inter.includes('c.id=i.company_id AND '+vis.visible('companies','c')),'copilot interaction company');
 assert.ok(inter.includes('k.id=i.contact_id AND '+vis.visible('contacts','k')),'copilot interaction contact');
 assert.ok(cont.includes('c.id=k.company_id AND '+vis.visible('companies','c')),'copilot contact company');
 // Writes: «Azienda capogruppo» and «Riporta a» (011) are links like company_id.
 const db=fakeDb();db.ownOnly=true;const s2=createStore(db.sql);
 const post=async(uid,entity,action,data)=>{const r=res();await createHandler({getSessionUser:()=>({uid}),getStore:()=>s2})({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},query:{},body:{workspace:W,entity,action,data}},r);return r};
 let r=await post(2,'companies','update',{id:id(1),version:1,parent_company_id:id(2)});assert.equal(r.code,404,'parent company hidden');
 r=await post(2,'contacts','update',{id:id(13),version:1,reports_to_id:id(12)});assert.equal(r.code,404,'reports-to contact hidden');
 r=await post(2,'companies','update',{id:id(1),version:1,parent_company_id:id(4)});assert.equal(r.code,200,'a visible parent goes through');
});
