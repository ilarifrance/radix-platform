'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const core=require('../lib/meeting-core.js'),pm=require('../lib/pm-demo.js'),rec=require('../lib/meeting-recorder.js');

function plan(){const s={projects:[],tasks:[],nextId:1};pm.createProject(s,{name:'Interfood',note:'',subprojects:['Generale']});
 pm.create(s,{project:'p1',subproject:'p1s1',title:'Inviare offerta',owner:'Francesco',start:'',due:'2026-11-05',details:'',dependencies:[],approvalRequired:false,milestone:false,assignedAgents:[],recurrence:'Nessuna'});
 pm.create(s,{project:'p1',subproject:'p1s1',title:'Demo CRM',owner:'Francesco',start:'',due:'2026-11-10',details:'',dependencies:[],approvalRequired:false,milestone:false,assignedAgents:[],recurrence:'Nessuna'});
 return pm.validateState(s)}

test('estimate: transcription per minute plus one analysis, in euro',()=>{
 const e=core.estimate(3600);assert.equal(e.minutes,60);assert.ok(e.transcribe>0.3&&e.transcribe<0.4,'gpt-4o-transcribe ≈ 0.33 € per hour');
 assert.ok(e.analysis>0.02&&e.analysis<0.2);assert.match(e.text.total,/^circa \d+,\d\d €$/);
 assert.ok(core.estimate(3600,{model:'gpt-4o-mini-transcribe'}).transcribe<e.transcribe);
 assert.equal(core.estimate(0).minutes,1);
 assert.equal(core.duration(40),'40 s');assert.equal(core.duration(600),'10 min');assert.equal(core.duration(3900),'1 h 05 min');
});

test('transcript and context follow the segment order',()=>{
 const segs=[{n:1,text:'seconda parte'},{n:0,text:'prima parte '},{n:2,text:''}];
 assert.equal(core.transcript(segs),'prima parte\n\nseconda parte');
 assert.equal(core.contextFor(segs,2),'seconda parte');assert.equal(core.contextFor(segs,0),'');
});

test('prompt: rules against invented facts, the open tasks with ids, the transcript',()=>{
 const p=core.prompt({title:'Call Interfood',date:'2026-10-29',today:'2026-10-29',text:'Marco: mando io il preventivo entro venerdì.',project:'Interfood',state:plan(),projects:['Interfood','RADIX']});
 assert.match(p,/Non inventare nomi, date, importi o impegni/);assert.match(p,/t1 · Inviare offerta · Francesco · 2026-11-05 · Da fare/);
 assert.match(p,/"updates"/);assert.match(p,/--- TRASCRIZIONE ---\nMarco: mando io/);assert.match(p,/Progetti esistenti: Interfood · RADIX/);
 const noProject=core.prompt({text:'x',today:'2026-10-29'});assert.match(noProject,/Nessun progetto scelto/);assert.doesNotMatch(noProject,/Attività aperte/);
 const long=core.prompt({text:'a'.repeat(core.MAX_TRANSCRIPT+10),today:'2026-10-29'});assert.match(long,/tagliata/);
});

test('parse: keeps only clean items, drops unknown ids, bad dates and duplicates',()=>{
 const reply='Ecco:\n'+JSON.stringify({title:'Call Interfood',summary:'Abbiamo parlato del CRM.',decisions:['Si parte con 20 utenti',''],
  tasks:[{title:'Mandare il preventivo',owner:'Marco',due:'2026-10-31',details:'Per 20 utenti',milestone:false},{title:'mandare il preventivo',owner:''},{title:'Fissare la demo',due:'31/10/2026'},{title:''}],
  updates:[{id:'t2',due:'2026-11-20',note:'Spostata su richiesta del cliente'},{id:'t9',due:'2026-11-01'},{id:'t1',due:'2026-11-05'}],
  questions:['Business Central o F&O?'],project:{existing:'interfood',new:''},participants:['Marco','Francesco']});
 const p=core.parse(reply,{state:plan(),today:'2026-10-29'});
 assert.equal(p.tasks.length,2);assert.equal(p.tasks[0].due,'2026-10-31');assert.equal(p.tasks[1].due,'','an Italian date is not guessed');
 assert.deepEqual(p.decisions,['Si parte con 20 utenti']);
 assert.equal(p.updates.length,1,'unknown id and unchanged due dropped');assert.equal(p.updates[0].id,'t2');assert.equal(p.updates[0].title,'Demo CRM');
 assert.equal(core.parse('niente json'),null);assert.equal(core.parse('{rotto'),null);
 assert.equal(core.matchProject([{id:'a',name:'Interfood UK'},{id:'b',name:'RADIX'}],'interfood').id,'a');
 assert.equal(core.matchProject([{id:'b',name:'RADIX'}],''),null);
});

test('applyToPm: new tasks in «Dai meeting», updates through the PM rules, valid plan',()=>{
 const proposal={tasks:[{title:'Mandare il preventivo',owner:'Marco',due:'2026-10-31',details:'Per 20 utenti',milestone:false},{title:'Fissare la demo',owner:'',due:'',details:'',milestone:true},{title:'Non questa',owner:'',due:'',selected:false}],
  updates:[{id:'t2',title:'Demo CRM',due:'2026-11-20',status:'In corso',note:'Spostata'},{id:'t1',title:'Inviare offerta',due:'',status:'Completato',note:''}]};
 const before=plan(),r=core.applyToPm(pm,before,proposal,{today:'2026-10-29',meetingTitle:'Call Interfood',meetingDate:'2026-10-29'});
 assert.deepEqual(r.created,['t3','t4']);assert.deepEqual(r.updated,['t2','t1']);assert.equal(r.skipped.length,0);
 const sub=r.state.projects[0].subprojects.find(s=>s.name===core.SUBPROJECT);assert.ok(sub);
 const t3=r.state.tasks.find(t=>t.id==='t3'),t4=r.state.tasks.find(t=>t.id==='t4'),t2=r.state.tasks.find(t=>t.id==='t2');
 assert.equal(t3.subproject,sub.id);assert.equal(t3.owner,'Marco');assert.equal(t3.due,'2026-10-31');assert.match(t3.history[0],/Creata dal meeting «Call Interfood» del 29\/10\/2026/);
 assert.equal(t4.owner,'Da assegnare');assert.equal(t4.due,'2026-11-05','no date said: one week later, flagged');assert.match(t4.details,/da confermare/);assert.equal(t4.milestone,true);
 assert.equal(t2.due,'2026-11-20');assert.equal(t2.status,'In corso');assert.ok(t2.history.some(h=>/Dal meeting .*Spostata/.test(h)));
 assert.equal(r.state.tasks.find(t=>t.id==='t1').status,'Completato');
 assert.equal(before.tasks.length,2,'the plan passed in is not changed');
 // A second meeting reuses the same sub-project.
 const again=core.applyToPm(pm,r.state,{tasks:[{title:'Richiamare Marco',owner:'',due:'2026-11-02'}],updates:[]},{today:'2026-10-30'});
 assert.equal(again.state.projects[0].subprojects.filter(s=>s.name===core.SUBPROJECT).length,1);
 // A refused change is reported, never forced.
 const s=plan();s.tasks[1].dependencies=['t1'];const refused=core.applyToPm(pm,pm.validateState(s),{tasks:[],updates:[{id:'t2',title:'Demo CRM',status:'In corso'}]},{today:'2026-10-29'});
 assert.equal(refused.skipped.length,1);assert.match(refused.skipped[0].reason,/dipendenze/);
});

test('applyToPm without a plan: a project with the meeting sub-project; dates in the past move to today',()=>{
 const r=core.applyToPm(pm,null,{tasks:[{title:'Chiudere il contratto',owner:'',due:'2026-10-01'}]},{projectName:'Nuovo cliente',today:'2026-10-29'});
 assert.equal(r.state.projects[0].name,'Nuovo cliente');assert.equal(r.state.projects[0].subprojects[0].name,core.SUBPROJECT);
 assert.equal(r.state.tasks[0].due,'2026-10-29');
});

test('archive keeps the newest meetings under the registry size, transcripts of old ones go first',()=>{
 let doc=null;for(let i=0;i<12;i++)doc=core.addToArchive(doc,core.record({id:'m'+i,title:'M'+i,date:'2026-10-29',seconds:3600,text:'parola '.repeat(30000),proposal:{summary:'s'+i,decisions:['d']}}));
 assert.equal(doc.items[0].id,'m11');assert.ok(JSON.stringify(doc).length<core.MAX_TRANSCRIPT*7);
 assert.ok(doc.items[0].transcript.length>0);assert.ok(doc.items.some(x=>x.transcriptDropped));assert.ok(doc.items.every(x=>x.summary));
 assert.ok(Buffer.byteLength(JSON.stringify(doc))<1500000);
 const same=core.addToArchive(doc,core.record({id:'m11',title:'M11 bis',proposal:{}}));assert.equal(same.items.filter(x=>x.id==='m11').length,1);
});

test('minutes and the memory proposal the memory API accepts',()=>{
 const t=core.minutes({title:'Call',date:'2026-10-29',seconds:1800,participants:['Marco'],summary:'Riassunto',decisions:['A'],tasks:[{title:'Fare X',owner:'Marco',due:'2026-10-31',milestone:true}],updates:[],questions:['Q?'],transcript:'testo'});
 assert.match(t,/^VERBALE · Call\nData: 29\/10\/2026 · durata 30 min/);assert.match(t,/1\. Fare X · Marco · entro il 31\/10\/2026 · scadenza importante/);assert.match(t,/DOMANDE APERTE\n1\. Q\?/);assert.match(t,/TRASCRIZIONE\ntesto$/);
 const mem=require('../api/_agency-memory-core.js');
 const e=core.memoryEntry({projectId:'pr-abcdef123',title:'Call',date:'2026-10-29',decisions:['Si parte a novembre']});
 const v=mem.validate(e);assert.equal(v.level,'project');assert.equal(v.kind,'decision');assert.match(v.content,/- Si parte a novembre/);
 assert.equal(core.memoryEntry({projectId:'x',decisions:[]}),null);
});

test('transcribe endpoint: session, explicit confirm, known formats, size limit, fallback model',async()=>{
 const t=require('../api/_transcribe.js');
 const env={OPENAI_API_KEY:'sk-test'};const audio=Buffer.alloc(4000,1).toString('base64');
 assert.match(t.transcribeRequest({audio,mime:'audio/webm'},env).error,/Conferma/);
 assert.equal(t.transcribeRequest({confirm:true,audio,mime:'image/png'},env).status,415);
 assert.equal(t.transcribeRequest({confirm:true,audio:Buffer.alloc(t.MAX_BYTES+1).toString('base64'),mime:'audio/webm'},env).status,413);
 const ok=t.transcribeRequest({confirm:true,audio,mime:'audio/mp4;codecs=mp4a.40.2',language:'it',n:3,prompt:'ciao'},env);
 assert.equal(ok.filename,'meeting-3.mp4');assert.equal(ok.model,'gpt-4o-transcribe');assert.equal(ok.language,'it');
 assert.equal(t.transcribeRequest({confirm:true,audio,mime:'audio/wav'},{OPENAI_TRANSCRIBE_MODEL:'gpt-4o-mini-transcribe'}).model,'gpt-4o-mini-transcribe');
 const res=()=>{const r={code:0,body:null,status(c){r.code=c;return r},json(b){r.body=b;return r}};return r};
 let r=res();await t.handler({method:'POST',headers:{},body:{}},r,{env});assert.equal(r.code,401);
 const auth=require('../api/_auth.js');const orig=auth.getSessionUser;
 // The handler reads the session through _auth: a stub user for the calls below.
 require.cache[require.resolve('../api/_auth.js')].exports.getSessionUser=()=>({id:1,email:'f@x.it'});
 delete require.cache[require.resolve('../api/_transcribe.js')];const t2=require('../api/_transcribe.js');
 try{
  r=res();await t2.handler({method:'GET',headers:{}},r,{env});assert.deepEqual(r.body,{configured:true,model:'gpt-4o-transcribe'});
  r=res();await t2.handler({method:'POST',headers:{},body:{confirm:true,audio,mime:'audio/webm'}},r,{env:{}});assert.equal(r.code,503);
  const calls=[];const fake=async(url,opts)=>{const model=opts.body.get('model');calls.push({url,model,file:opts.body.get('file').name,lang:opts.body.get('language')});
   if(model==='gpt-4o-transcribe')return new Response(JSON.stringify({error:{message:'The model gpt-4o-transcribe does not exist or you do not have access to it.'}}),{status:404});
   return new Response(JSON.stringify({text:' Buongiorno a tutti. '}),{status:200})};
  r=res();await t2.handler({method:'POST',headers:{},body:JSON.stringify({confirm:true,audio,mime:'audio/webm',language:'it'})},r,{env,fetch:fake});
  assert.equal(r.code,200);assert.deepEqual(r.body,{text:'Buongiorno a tutti.',model:'whisper-1'});
  assert.deepEqual(calls.map(c=>c.model),['gpt-4o-transcribe','whisper-1']);assert.equal(calls[0].url,'https://api.openai.com/v1/audio/transcriptions');assert.equal(calls[0].file,'meeting-0.webm');assert.equal(calls[0].lang,'it');
  r=res();await t2.handler({method:'POST',headers:{},body:{confirm:true,audio,mime:'audio/webm'}},r,{env,fetch:async()=>new Response(JSON.stringify({error:{message:'You exceeded your current quota'}}),{status:429})});
  assert.equal(r.code,429);assert.match(r.body.error,/Credito OpenAI esaurito/);
 }finally{require.cache[require.resolve('../api/_auth.js')].exports.getSessionUser=orig;delete require.cache[require.resolve('../api/_transcribe.js')]}
});

test('wiring: route, status, agent, registry module, navigation, manifest',()=>{
 const route=fs.readFileSync('api/integrations/[service].js','utf8');assert.match(route,/'transcribe': \(\) => require\('\.\.\/_transcribe'\)/);
 const status=require('../api/_integrations-status.js');const src=fs.readFileSync('api/_integrations-status.js','utf8');assert.match(src,/id:'transcribe'.*env:\['OPENAI_API_KEY'\]/);
 const chat=fs.readFileSync('api/chat.js','utf8');assert.match(chat,/"meeting-analyst": \{[\s\S]*?tools: false/);
 assert.equal(require('../api/_engine.js').tierFor('meeting-analyst',{},{}),'standard');
 const reg=require('../api/_registry-core.js');assert.ok(reg.MODULES.includes('meetings'));assert.match(fs.readFileSync('migrations/core/001_registry.sql','utf8'),/'agents','meetings'\)\);/);
 assert.match(fs.readFileSync('shell/radix-shell.js','utf8'),/id: 'meeting', text: 'Meeting', href: '\/meeting\.html', icon: 'mic'/);
 const man=JSON.parse(fs.readFileSync('meeting.webmanifest','utf8'));assert.equal(man.start_url,'/meeting.html');assert.equal(man.display,'standalone');
 const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));assert.ok(vercel.headers.some(h=>h.source==='/meeting.webmanifest'));
 assert.ok(status);
});

test('page: own origin only, consent before recording, paid calls behind the confirmation',()=>{
 const html=fs.readFileSync('meeting.html','utf8'),js=fs.readFileSync('lib/meeting-page.js','utf8');
 assert.match(html,/connect-src 'self'/);assert.match(html,/media-src blob:/);assert.match(html,/<link rel="manifest" href="\/meeting\.webmanifest">/);
 assert.doesNotMatch(html+js,/https?:\/\/(?!claude)/,'no external address in the page');
 assert.match(html,/id="mt-consent"/);assert.match(js,/const ok=\$\('mt-consent'\)\.checked&&!busy;/);
 // Each paid step (transcription, analysis) runs after the RadixConfirm answer.
 const go=js.slice(js.indexOf("$('mt-go').onclick"));assert.ok(go.indexOf('confirmBox.ask(')<go.indexOf('postSegment(m,seg)'));assert.ok(go.indexOf('if(!ok)return;')<go.indexOf('agents.reply('));
 assert.match(js,/confirm:true/);assert.match(js,/role:'meeting-analyst'/);
 assert.match(js,/rec\.store\.dropAudio\(m\)/,'the audio is deleted from the device once saved in RADIX');
 for(const f of ['lib/meeting-core.js','lib/meeting-recorder.js','lib/meeting-page.js'])assert.ok(html.includes('src="/'+f+'"'),f);
});

test('recorder helpers: WAV header, file types',async()=>{
 const blob=rec.wav(new Float32Array([0,0.5,-0.5,1]),16000);assert.equal(blob.size,44+8);assert.equal(blob.type,'audio/wav');
 const v=new DataView(await blob.arrayBuffer());assert.equal(v.getUint32(24,true),16000);assert.equal(v.getInt16(46,true),16383);
 assert.equal(rec.typeOf({name:'memo.m4a',type:''}),'audio/x-m4a');assert.equal(rec.typeOf({name:'x.MP3',type:''}),'audio/mpeg');assert.equal(rec.typeOf({name:'x',type:'audio/webm'}),'audio/webm');
 assert.ok(rec.MAX_BYTES<=core.SEGMENT_MAX_BYTES);
});

test('phone calls: numbers, TwiML of the bridge, announcement only where Twilio can reach it',()=>{
 const c=require('../api/_twilio_call.js');
 assert.equal(c.phone('333 123 4567'),'+393331234567');assert.equal(c.phone('0039 02 1234567'),'+39021234567');assert.equal(c.phone('+44 20 7946 0958'),'+442079460958');
 assert.equal(c.phone('12'),'');assert.equal(c.phone('+39abc'),'');
 const tw=c.bridgeTwiml({to:'+393331234567',from:'+390212345678',announceUrl:'https://radix-platform.vercel.app/api/integrations/call?step=announce'});
 assert.match(tw,/<Dial callerId="\+390212345678" record="record-from-answer-dual"/);assert.match(tw,/<Number url="https:\/\/radix-platform\.vercel\.app\/api\/integrations\/call\?step=announce" method="GET">\+393331234567<\/Number>/);
 assert.doesNotMatch(c.bridgeTwiml({to:'+393331234567',from:'+390212345678',announceUrl:''}),/url=/);
 assert.match(c.bridgeTwiml({to:'+39333',from:'+39',announceUrl:''}),/avvisa la persona/);
 assert.equal(c.publicBase({headers:{host:'radix-platform.vercel.app'}},{VERCEL_ENV:'production'}),'https://radix-platform.vercel.app');
 assert.equal(c.publicBase({headers:{host:'x-git-y.vercel.app'}},{VERCEL_ENV:'preview'}),'','previews are behind the Vercel login');
 assert.equal(c.publicBase({headers:{}},{TWILIO_PUBLIC_URL:'https://radix.example.com/'}),'https://radix.example.com');
 assert.match(c.ANNOUNCE,/registrata e trascritta/);
 const parts=c.chunks(Buffer.alloc(1000000),3600);assert.equal(parts.length,3,'20-minute parts of an hour');assert.equal(parts.reduce((a,p)=>a+p.length,0),1000000);
 const est=core.callEstimate(10);assert.ok(est.eur>0.7&&est.eur<1,'about 0.09 € per minute');
});

test('phone calls endpoint: session, confirm, start, status, transcription and deletion of the recording',async()=>{
 const auth=require('../api/_auth.js');const orig=auth.getSessionUser;
 const res=()=>{const r={code:0,body:null,headers:{},status(c){r.code=c;return r},json(b){r.body=b;return r},send(b){r.body=b;return r},setHeader(k,v){r.headers[k]=v}};return r};
 let r=res();await require('../api/_twilio_call.js').handler({method:'GET',query:{step:'announce'},headers:{}},r,{env:{}});assert.equal(r.code,200);assert.match(r.body,/<Say language="it-IT">/);
 r=res();await require('../api/_twilio_call.js').handler({method:'GET',query:{},headers:{}},r,{env:{}});assert.equal(r.code,401);
 auth.getSessionUser=()=>({id:1});delete require.cache[require.resolve('../api/_twilio_call.js')];delete require.cache[require.resolve('../api/_transcribe.js')];
 const c=require('../api/_twilio_call.js');
 const env={TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32),TWILIO_AUTH_TOKEN:'tok',TWILIO_NUMBER:'+39 02 1234 5678',OPENAI_API_KEY:'sk',VERCEL_ENV:'production'};
 const sid='CA'+'a'.repeat(32),re='RE'+'b'.repeat(32);const calls=[];
 const fake=async(url,opts={})=>{calls.push({url,method:opts.method||'GET',body:opts.body,auth:opts.headers&&opts.headers.authorization});
  if(url.endsWith('/Calls.json'))return new Response(JSON.stringify({sid}),{status:201});
  if(url.includes('/Calls/'+sid+'.json'))return new Response(JSON.stringify({status:'completed',duration:'95'}),{status:200});
  if(url.includes('/Recordings.json?CallSid='))return new Response(JSON.stringify({recordings:[{sid:re,status:'completed',duration:'90',date_created:'x'}]}),{status:200});
  if(url.endsWith('/Recordings/'+re+'.mp3'))return new Response(Buffer.alloc(50000,7),{status:200});
  if(url.endsWith('/Recordings/'+re+'.json')&&opts.method==='DELETE')return new Response(null,{status:204});
  if(url.includes('api.openai.com'))return new Response(JSON.stringify({text:'Pronto, sono Marco.'}),{status:200});
  return new Response('{}',{status:404})};
 try{
  r=res();await c.handler({method:'GET',query:{},headers:{}},r,{env:{}});assert.deepEqual(r.body,{configured:false,number:''});
  r=res();await c.handler({method:'POST',query:{},headers:{},body:{action:'start',to:'3331234567',me:'3339999999'}},r,{env,fetch:fake});assert.equal(r.code,400);assert.match(r.body.error,/Conferma/);
  r=res();await c.handler({method:'POST',query:{},headers:{},body:{action:'start',to:'3331234567',me:'3331234567',confirm:true}},r,{env,fetch:fake});assert.equal(r.code,400);
  r=res();await c.handler({method:'POST',query:{},headers:{host:'radix-platform.vercel.app'},body:{action:'start',to:'333 1234567',me:'+39 333 9999999',confirm:true}},r,{env,fetch:fake});
  assert.equal(r.code,200);assert.deepEqual(r.body,{sid,announced:true});
  const start=calls.find(x=>x.url.endsWith('/Calls.json'));const form=new URLSearchParams(start.body);
  assert.equal(form.get('To'),'+393339999999','your phone rings first');assert.equal(form.get('From'),'+390212345678');assert.match(form.get('Twiml'),/<Number url="https:\/\/radix-platform\.vercel\.app\/api\/integrations\/call\?step=announce" method="GET">\+393331234567/);
  assert.equal(start.auth,'Basic '+Buffer.from(env.TWILIO_ACCOUNT_SID+':tok').toString('base64'));
  r=res();await c.handler({method:'GET',query:{sid},headers:{}},r,{env,fetch:fake});assert.deepEqual(r.body,{status:'completed',seconds:95,recording:{seconds:90,count:1},processing:false});
  r=res();await c.handler({method:'GET',query:{sid:'nope'},headers:{}},r,{env,fetch:fake});assert.equal(r.code,400);
  r=res();await c.handler({method:'POST',query:{},headers:{},body:{action:'transcribe',sid}},r,{env,fetch:fake});assert.equal(r.code,400);
  r=res();await c.handler({method:'POST',query:{},headers:{},body:{action:'transcribe',sid,confirm:true}},r,{env,fetch:fake});
  assert.equal(r.code,200);assert.equal(r.body.text,'Pronto, sono Marco.');assert.equal(r.body.seconds,90);assert.equal(r.body.deleted,true);
  assert.ok(calls.some(x=>x.method==='DELETE'&&x.url.endsWith(re+'.json')),'the recording is deleted from Twilio after the text');
  r=res();await c.handler({method:'GET',query:{sid},headers:{}},r,{env:{...env,TWILIO_AUTH_TOKEN:'x'},fetch:async()=>new Response(JSON.stringify({message:'Authenticate'}),{status:401})});
  assert.match(r.body.error,/Credenziali Twilio non valide/);
 }finally{auth.getSessionUser=orig;delete require.cache[require.resolve('../api/_twilio_call.js')];delete require.cache[require.resolve('../api/_transcribe.js')]}
});

test('phone calls wiring: route, status, settings, page option behind a confirm',()=>{
 assert.match(fs.readFileSync('api/integrations/[service].js','utf8'),/'call': \(\) => require\('\.\.\/_twilio_call'\)/);
 assert.ok(require('../api/_integrations-status.js').SERVICES.some(s=>s.id==='twilio'&&s.env.join()==='TWILIO_ACCOUNT_SID,TWILIO_AUTH_TOKEN,TWILIO_NUMBER'));
 const html=fs.readFileSync('meeting.html','utf8'),js=fs.readFileSync('lib/meeting-page.js','utf8');
 assert.match(html,/value="phone"/);assert.match(html,/id="mt-call"/);
 const call=js.slice(js.indexOf("$('mt-call').onclick"));assert.ok(call.indexOf('confirmBox.ask(')<call.indexOf("action:'start'"));
 assert.match(js,/action:'transcribe',sid:m\.callSid,confirm:true/);
});

test('CRM: «Chiama da RADIX» link from a contact or company, back in the client history',()=>{
 const crmCore=require('../sales/crm-record-core.js');
 const W='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222',A='33333333-3333-4333-8333-333333333333';
 const l=crmCore.meetingCall(W,'contacts',{id:C,company_id:A,name:'Mario Rossi',phone:'02 1234567',mobile:'+39 333 1234567'});
 assert.equal(l.number,'+39 333 1234567','mobile first');assert.match(l.href,/^\/meeting\.html\?/);
 assert.equal(crmCore.meetingCall(W,'contacts',{id:C,phone:'12'}),null,'no usable number');
 assert.equal(crmCore.meetingCall(W,'opportunities',{id:C,phone:'0212345678'}),null);
 const q=core.crmFromQuery(l.href.slice(l.href.indexOf('?')));
 assert.deepEqual(q,{to:'+39 333 1234567',name:'Mario Rossi',crm:{workspace:W,contactId:C,companyId:A,name:'Mario Rossi'}});
 const co=core.crmFromQuery(crmCore.meetingCall(W,'companies',{id:A,name:'Interfood',phone:'+44 20 1234 5678'}).href.split('?')[1]);
 assert.equal(co.crm.companyId,A);assert.equal(co.crm.contactId,null);
 assert.equal(core.crmFromQuery('?call=%2B393331234567&crmws=bad&contact='+C).crm,null,'bad workspace: call only, no history');
 assert.equal(core.crmFromQuery('?name=x'),null);
 const body=core.crmInteraction({crm:q.crm,source:'phone',title:'Telefonata con Mario Rossi',date:'2026-10-29',seconds:300,summary:'Offerta accettata.',decisions:['Si parte a novembre'],tasks:[{title:'Mandare contratto',due:'2026-11-03'}],questions:[],occurredAt:'2026-10-29T10:00:00.456Z'});
 assert.deepEqual(Object.keys(body),['workspace','entity','action','data']);assert.equal(body.entity,'interactions');assert.equal(body.action,'create');
 assert.equal(body.data.kind,'call');assert.equal(body.data.occurred_at,'2026-10-29T10:00:00Z');assert.equal(body.data.contact_id,C);assert.equal(body.data.company_id,A);
 assert.match(body.data.body,/Offerta accettata\.[\s\S]*Si parte a novembre[\s\S]*Mandare contratto · entro il 03\/11\/2026/);assert.ok(body.data.body.length<=4000);
 assert.equal(core.crmInteraction({crm:q.crm,source:'room',summary:'x'}).data.kind,'meeting');
 assert.equal(core.crmInteraction({crm:null,summary:'x'}),null);
 const js=fs.readFileSync('lib/meeting-page.js','utf8'),html=fs.readFileSync('meeting.html','utf8'),crmJs=fs.readFileSync('sales/crm-record.js','utf8');
 assert.match(html,/id="mt-crm"/);assert.match(js,/'x-radix-sales':'1'/);assert.match(crmJs,/core\.meetingCall\(/);
});
