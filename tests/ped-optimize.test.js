// PED «Risultati» over time and «Ottimizza i post in programma»: daily readings (rx_post_stats), levers, the AI
// proposal checked against the posts still to go out, and Buffer kept in step when a scheduled post changes.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const pr=require('../lib/ped-results.js');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const M=(impressions,reactions=null,comments=null)=>({impressions,reach:null,reactions,comments,shares:null,clicks:null});

test('readings: per post the numbers 1, 3 and 7 days after publication, and the newest one',()=>{
 const pub='2026-10-20T06:00:00.000Z',row=(days,imp)=>({content_id:'c1',post_id:'b1',published_at:pub,fetched_at:new Date(Date.parse(pub)+days*86400000).toISOString(),metrics:M(imp,4,1),engagement_rate:null,link:'https://www.linkedin.com/x'});
 const s=pr.seriesByContent([row(0.3,100),row(1.1,400),row(2,500),row(3.2,700),row(8,900)]);
 assert.deepEqual(s.c1.points.map(p=>[p.age,p.metrics.impressions]),[[1,400],[3,700],[7,900]]);
 assert.equal(s.c1.last.metrics.impressions,900);assert.equal(s.c1.last.link,'https://www.linkedin.com/x');
 assert.equal(pr.trendText(s.c1.points),'1g 400 → 3g 700 → 7g 900');
 assert.deepEqual(pr.seriesByContent([{content_id:'x',fetched_at:pub,metrics:M(1)}]),{},'no publication time, no series');
});

const C=(id,date,time,copy,stats,extra={})=>({id,title:'Post '+id,channel:'LinkedIn',date,time,copy,status:'approved',...extra,...(stats?{stats:{source:'buffer',metrics:stats}}:{})});
const state={contents:[
 C('a','2026-10-20','08:00','Quanto costa un cliente perso?\nTesto breve.',M(1000,30,10)),
 C('b','2026-10-21','08:00','Quando ho iniziato a vendere...\n'+'x'.repeat(700),M(800,20,4)),
 C('c','2026-10-22','18:00','Tre errori da evitare.\n'+'y'.repeat(1400),M(300,3,0),{format:'carousel'}),
 C('d','2026-10-30','18:00','Il salto da 10 a 30 dipendenti.\nTesto.',null),
 C('e','2026-10-31','12:00','Professionalizzare senza perdere l’anima.\nTesto.',null,{photo:{source:'upload',headline:''},format:'carousel'}),
 C('f','2026-10-18','08:00','Vecchio post.',null)
]};

test('levers: features of a post and the groups by time, day, format, length, opening and channel',()=>{
 assert.equal(pr.hookOf('Quanto costa un cliente perso?'),'domanda');assert.equal(pr.hookOf('Quando ho iniziato a vendere...'),'esperienza personale');
 assert.equal(pr.hookOf('Tre errori da evitare.'),'affermazione');assert.equal(pr.hookOf('5 errori da evitare'),'numero');
 const f=pr.featuresOf(state.contents[2]);assert.deepEqual([f.slot,f.day,f.format,f.length,f.hook],['sera (18-24)','giovedì','carosello','lunga (oltre 1300 caratteri)','affermazione']);
 const lv=pr.levers(state,{kindOf:c=>c.format||'text'});assert.equal(lv.posts,3);
 assert.deepEqual(lv.groups.slot.map(g=>[g.label,g.posts]),[['notte e prima mattina (0-9)',2],['sera (18-24)',1]]);
 assert.equal(lv.groups.format[0].label,'solo testo');assert.equal(lv.groups.format[0].impressions,900);
 assert.equal(lv.groups.hook.length,3);
});

test('optimize: only posts still to go out, the numbers in the prompt, every change checked',()=>{
 const list=pr.upcoming(state,{today:'2026-10-24',kindOf:c=>c.format||'text',isOut:c=>false});
 assert.deepEqual(list.map(p=>[p.n,p.id]),[[1,'d'],[2,'e']]);assert.equal(list[1].own,true);
 const lv=pr.levers(state,{kindOf:c=>c.format||'text'}),prompt=pr.optimizePrompt(lv,pr.results(state),list,{today:'2026-10-24'});
 assert.match(prompt,/Orario:\n- notte e prima mattina \(0-9\): 2 post · impression medie 900/);assert.match(prompt,/2\. 2026-10-31 12:00 · LinkedIn · formato carosello \(immagini proprie: formato fisso\)/);
 assert.match(prompt,/Un gruppo con 1 solo post non prova niente/);assert.match(prompt,/Non inventare numeri/);
 const reply=JSON.stringify({analisi:'Le uscite delle 8 rendono di più.',modifiche:[
  {post:1,campo:'orario',valore:'8.00',perche:'08:00 → 900 impression medie su 2 post'},
  {post:1,campo:'orario',valore:'09:00',perche:'doppione'},
  {post:1,campo:'giorno',valore:'2026-10-01',perche:'nel passato'},
  {post:2,campo:'formato',valore:'immagine',perche:'immagini proprie: non si tocca'},
  {post:2,campo:'apertura',valore:'Ti è mai capitato di perdere un cliente per un dettaglio?',perche:'le domande rendono il triplo'},
  {post:1,campo:'testo',valore:'Più corto, una domanda alla fine',perche:'i post brevi rendono di più'},
  {post:9,campo:'orario',valore:'07:00',perche:'post inesistente'},
  {post:1,campo:'colore',valore:'rosso',perche:'campo sconosciuto'}]});
 const out=pr.parseOptimizations('Ecco:\n```json\n'+reply+'\n```',list,{today:'2026-10-24'});
 assert.equal(out.analysis,'Le uscite delle 8 rendono di più.');
 assert.deepEqual(out.items.map(m=>[m.id,m.field,m.value]),[['d','orario','08:00'],['e','apertura','Ti è mai capitato di perdere un cliente per un dettaglio?'],['d','testo','Più corto, una domanda alla fine']]);
 assert.equal(pr.parseOptimizations('niente JSON',list).error,'Risposta non leggibile: riprova.');
 assert.equal(pr.withOpening('\nVecchia apertura\nresto','Nuova'),'\nNuova\nresto');
});

// ---- server: daily readings and Buffer kept in step (fake tagged-template db, no network) ----
function fakeDb(handlers){const calls=[];const db=(strings,...vals)=>{const q=strings.join('?').replace(/\s+/g,' ').trim();calls.push({q,vals});for(const [re,fn] of handlers)if(re.test(q))return Promise.resolve(fn(vals,q));return Promise.resolve([])};db.calls=calls;return db}

test('collect: one reading a day per post sent to Buffer, posts without numbers left out',async()=>{
 const {collect}=require('../api/_ped_stats.js');
 const db=fakeDb([[/^SELECT DISTINCT ON/,()=>[{project_id:'p1',content_id:'c1',post_id:'b1',due_at:'2026-10-23T06:00:00.000Z'},{project_id:'p1',content_id:'c2',post_id:'b2',due_at:'2026-10-24T06:00:00.000Z'}]]]);
 let asked=null;const postStats=async(k,ids)=>{asked={k,ids};return {items:[{postId:'b1',metrics:M(250,9,2),engagementRate:4.4,publishedAt:'2026-10-23T06:00:05Z',link:'https://www.linkedin.com/p'},{postId:'b2',metrics:M(null)}],errors:[]}};
 const out=await collect(db,{apiKey:'k',postStats,projectId:'p1',now:Date.parse('2026-10-24T15:00:00Z')});
 assert.deepEqual(out,{posts:2,saved:1,empty:1,errors:[]});assert.deepEqual(asked,{k:'k',ids:['b1','b2']});
 const ins=db.calls.find(c=>/^INSERT INTO rx_post_stats/.test(c.q));assert.ok(ins,'stored');assert.deepEqual(ins.vals.slice(0,6),['p1','c1','b1','2026-10-24','2026-10-23T06:00:05Z','https://www.linkedin.com/p']);
 assert.match(ins.q,/ON CONFLICT \(project_id,content_id,post_id,day\) DO UPDATE/);
 const sel=db.calls[0];assert.match(sel.q,/status='queued' AND post_id IS NOT NULL AND due_at BETWEEN/);assert.match(sel.q,/ORDER BY project_id,content_id,revision DESC/);
});

test('cron: CRON_SECRET bearer required, Buffer key required',async()=>{
 const {createHandler}=require('../api/_ped_stats.js');
 const res=()=>{const r={code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.code=c;return this},json(b){this.body=b;return this}};return r};
 let r=res();await createHandler({env:{},getSql:()=>fakeDb([])})({headers:{},method:'GET'},r);assert.equal(r.code,503);
 const env={CRON_SECRET:'s'.repeat(20)};r=res();await createHandler({env,getSql:()=>fakeDb([])})({headers:{authorization:'Bearer nope'},method:'GET'},r);assert.equal(r.code,401);
 r=res();await createHandler({env,getSql:()=>fakeDb([])})({headers:{authorization:'Bearer '+env.CRON_SECRET},method:'GET'},r);assert.equal(r.code,503);assert.match(r.body.error,/BUFFER_ACCESS_TOKEN/);
 r=res();await createHandler({env:{...env,BUFFER_ACCESS_TOKEN:'b'},getSql:()=>fakeDb([]),postStats:async()=>({items:[],errors:[]})})({headers:{authorization:'Bearer '+env.CRON_SECRET},method:'GET'},r);assert.equal(r.code,200);assert.deepEqual(r.body,{ok:true,posts:0,saved:0,empty:0,errors:[]});
 const v=JSON.parse(read('vercel.json'));assert.ok(v.crons.some(c=>c.path==='/api/integrations/ped-stats'&&c.schedule==='0 5 * * *'));
 assert.match(read('api/integrations/[service].js'),/'ped-stats': \(\) => require\('\.\.\/_ped_stats'\)/);
 assert.match(read('api/_registry-core.js'),/CREATE TABLE IF NOT EXISTS rx_post_stats[\s\S]*UNIQUE \(project_id, content_id, post_id, day\)/);
});

// The registry handler with its database and session stubbed: what reaches Buffer when a scheduled post changed.
function handlerWith(db,env){
 const keep={};for(const m of ['../api/_db.js','../api/_auth.js'])keep[m]=require.cache[require.resolve(m)];
 require.cache[require.resolve('../api/_db.js')]={exports:{sql:()=>db}};require.cache[require.resolve('../api/_auth.js')]={exports:{getSessionUser:()=>({uid:7})}};
 delete require.cache[require.resolve('../api/_registry-handler.js')];const h=require('../api/_registry-handler.js');
 for(const [m,v] of Object.entries(keep)){if(v)require.cache[require.resolve(m)]=v;else delete require.cache[require.resolve(m)]}
 delete require.cache[require.resolve('../api/_registry-handler.js')];
 Object.assign(process.env,env);return h;
}
const resOf=()=>({code:0,body:null,setHeader(){},status(c){this.code=c;return this},json(b){this.body=b;return this},send(b){this.body=b;return this}});

test('withdraw: a changed post still waiting on Buffer is removed there and from the publications',async()=>{
 const buffer=require('../api/_buffer.js'),orig=buffer.deletePost,deleted=[];buffer.deletePost=async(k,id)=>{deleted.push(id);return {deleted:true}};
 try{const db=fakeDb([[/^SELECT id,revision,post_id,channel_name FROM rx_publications/,()=>[{id:11,revision:3,post_id:'b9',channel_name:'francescoilari'}]]]);
  const h=handlerWith(db,{BUFFER_ACCESS_TOKEN:'k'}),r=resOf();
  await h({method:'POST',query:{resource:'publications'},headers:{},body:{action:'withdraw',projectId:'agency-490c3848-a107-4cb0-9aae-b4c079b6fe58',contentId:'c1'}},r);
  assert.equal(r.code,200);assert.deepEqual(r.body,{ok:true,withdrawn:1});assert.deepEqual(deleted,['b9']);
  assert.ok(db.calls.some(c=>/^DELETE FROM rx_publications WHERE id=\?/.test(c.q)&&c.vals[0]===11));assert.ok(db.calls.some(c=>/INSERT INTO rx_activity/.test(c.q)&&c.vals.includes('publication.withdrawn')));
  assert.match(db.calls[0].q,/AND due_at > now\(\)/,'only posts still to go out');
  buffer.deletePost=async()=>{throw Object.assign(new Error('Post not found'),{status:422})};const db2=fakeDb([[/^SELECT id,revision,post_id,channel_name/,()=>[{id:12,revision:4,post_id:'bx'}]]]);
  const r2=resOf();await handlerWith(db2,{BUFFER_ACCESS_TOKEN:'k'})({method:'POST',query:{resource:'publications'},headers:{},body:{action:'withdraw',projectId:'agency-490c3848-a107-4cb0-9aae-b4c079b6fe58',contentId:'c1'}},r2);
  assert.equal(r2.code,502);assert.match(r2.body.error,/eliminalo da Buffer a mano/);assert.ok(!db2.calls.some(c=>/^DELETE/.test(c.q)),'kept when Buffer did not confirm');
 }finally{buffer.deletePost=orig}
});

test('sending a new version removes the older one still waiting on Buffer first; Buffer delete mutation shape',async()=>{
 const src=read('api/_registry-handler.js'),send=src.indexOf('async function publications'),del=src.indexOf('deps.deletePost(key,String(old.post_id))',send),create=src.indexOf('deps.createPost(',send);
 assert.ok(del>send&&del<create,'old version removed before the new one is created');
 assert.match(src,/AND revision<>\$\{r\.revision\} AND status='queued' AND post_id IS NOT NULL AND due_at > now\(\)/);
 assert.match(src,/deletePost:require\('\.\/_buffer'\)\.deletePost,postStats:require\('\.\/_buffer'\)\.postStats/);
 const buffer=require('../api/_buffer.js');let sent=null;const realFetch=global.fetch;
 global.fetch=async(u,o)=>{sent=JSON.parse(o.body);return {ok:true,status:200,json:async()=>({data:{deletePost:{__typename:'DeletePostSuccess'}}})}};
 try{assert.deepEqual(await buffer.deletePost('k','abc123'),{deleted:true});assert.match(sent.query,/deletePost\(input: \{ id: "abc123" \}\)/);
  await assert.rejects(buffer.deletePost('k','bad id!'),/non valido/);
  global.fetch=async()=>({ok:true,status:200,json:async()=>({data:{deletePost:{__typename:'MutationError',message:'Post already sent'}}})});
  await assert.rejects(buffer.deletePost('k','abc'),/Post already sent/)}
 finally{global.fetch=realFetch}
});

test('PED page: readings on open, trend column, levers, optimize with confirmation and Buffer withdrawal',()=>{
 const src=read('editorial-workspace.js'),html=read('project-editorial.html');
 assert.match(src,/route\(\);syncPublications\(\)\.then\(autoReadings\)/);assert.match(src,/Date\.now\(\)-Date\.parse\(readingsAt\)>20\*3600000/);
 assert.match(src,/\['engagementRate','Engagement'\],\['trend','Andamento'\]\]/);
 for(const id of ['leverTable','optimize','optimizeBox'])assert.match(html,new RegExp('id="'+id+'"'));
 const a=src.indexOf('async function optimizePlan'),ask=src.indexOf("askConfirm({title:'Analizzare i risultati",a),call=src.indexOf('rt.reply(',a);assert.ok(a>0&&ask>a&&call>ask);
 assert.match(src,/action:'withdraw',projectId,contentId:id/);assert.match(src,/if\(cur\.status==='draft'\)\{try\{core\.review\(state,cur\.id,'request'\)\}catch\(e\)\{\}\}/);
});
