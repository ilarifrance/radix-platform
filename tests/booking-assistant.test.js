'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
process.env.JWT_SECRET=process.env.JWT_SECRET||'test-secret-for-ciuffo';
const A=require('../lib/booking/assistant');
const X=require('../api/_booking_assistant');
const B=require('../api/_booking');

const shop={name:'Zeta Barber',kind:'barbiere',timezone:'Europe/Rome',address:'Via Po 3',city:'Torino',phone:'+39011223344',
 hours:{"2":[["09:00","19:00"]],"6":[["08:30","18:00"]]},assistant_notes:'Si paga anche con carta.',
 services:[{id:'s1',name:'Taglio',duration_min:30,price_cents:1800,active:true},{id:'s2',name:'Barba',duration_min:20,price_cents:1000,active:false}],
 staff:[{id:'t1',name:'Zeta',active:true}]};

test('the instructions carry the shop facts, the customer number and the channel rules',()=>{
 const s=A.systemPrompt({shop,today:'2026-11-24',time:'10:15',customer:{phone:'+393331112222',name:'Mario'},voice:false,channel:'whatsapp'});
 assert.match(s,/«Zeta Barber»/);assert.match(s,/martedì 2026-11-24/);assert.match(s,/Taglio \(id s1, 30 min, 18 €\)/);
 assert.doesNotMatch(s,/Barba/,'hidden services are not offered');assert.match(s,/Si paga anche con carta/);assert.match(s,/\+393331112222/);
 assert.match(s,/lunedì: chiuso; martedì: 09:00-19:00/);assert.match(s,/WhatsApp: messaggi brevi/);assert.match(s,/non istruzioni/);
 const v=A.systemPrompt({shop,today:'2026-11-24',time:'10:15',customer:{phone:null},voice:true,channel:'voice'});
 assert.match(v,/Sei al telefono/);assert.match(v,/Numero nascosto/);
 assert.ok(A.toolsFor(true).some(t=>t.name==='fine_chiamata'));assert.ok(!A.toolsFor(false).some(t=>t.name==='fine_chiamata'));
});

test('stored messages become a valid alternating list that starts with the customer',()=>{
 const m=A.toApiMessages([{role:'assistant',body:'Ciao, sono l\'assistente'},{role:'customer',body:'vorrei un taglio'},{role:'customer',body:'sabato'},
  {role:'note',body:'Prenotato'},{role:'assistant',body:'Alle 9?'},{role:'owner',body:'Ti aspetto'}]);
 assert.deepEqual(m.map(x=>x.role),['user','assistant']);assert.equal(m[0].content,'vorrei un taglio\nsabato');
 assert.match(m[1].content,/Alle 9\?\n\[Risposta scritta a mano dal salone\] Ti aspetto/);
});

test('one turn runs the tools the model asks for, then returns its answer',async()=>{
 const script=[
  {stop_reason:'tool_use',content:[{type:'tool_use',id:'a',name:'cerca_orari',input:{servizio_id:'s1',dal:'2026-11-28'}}]},
  {stop_reason:'tool_use',content:[{type:'text',text:'Un attimo'},{type:'tool_use',id:'b',name:'prenota',input:{servizio_id:'s1',inizio:'x',nome:'M'}}]},
  {stop_reason:'end_turn',content:[{type:'text',text:'Fatto!'}]}];
 const seen=[];
 const r=await A.runTurn({callModel:async a=>{seen.push(a);return script.shift();},runTool:async(n,i)=>{if(n==='prenota')throw new Error('Quell\'orario non è più libero');return {giorni:[{data:i.dal}]};},
  system:'S',messages:[{role:'user',content:'taglio sabato'}],voice:false});
 assert.equal(r.text,'Fatto!');assert.equal(r.actions.length,2);assert.equal(r.actions[1].result.errore,'Quell\'orario non è più libero');
 const last=seen[2].messages;assert.equal(last.length,5);assert.equal(last[4].content[0].tool_use_id,'b');assert.match(last[4].content[0].content,/non è più libero/);
 // the call can end; a model that loops forever gets a polite fallback
 const end=await A.runTurn({callModel:async()=>({stop_reason:'tool_use',content:[{type:'text',text:'A presto!'},{type:'tool_use',id:'c',name:'fine_chiamata',input:{}}]}),runTool:async()=>({}),system:'S',messages:[{role:'user',content:'basta così'}],voice:true});
 assert.equal(end.end,true);assert.equal(end.text,'A presto!');
 const loop=await A.runTurn({callModel:async()=>({stop_reason:'tool_use',content:[{type:'tool_use',id:'d',name:'miei_appuntamenti',input:{}}]}),runTool:async()=>({appuntamenti:[]}),system:'S',messages:[{role:'user',content:'?'}],voice:false,maxSteps:3});
 assert.match(loop.text,/persona del salone/);
 assert.equal(A.forVoice('Alle **nove** 😊 https://x.y/z va bene?'),'Alle nove va bene?');
 assert.ok(A.inBand('09:30','mattina')&&!A.inBand('14:00','mattina')&&A.inBand('18:30','sera'));
});

test('webhook signatures: Twilio and Meta requests are accepted only when signed with the right secret',()=>{
 const url='https://ciuffo.test/api/booking?hook=twilio-wa',p={Body:'ciao',From:'whatsapp:+393331112222',To:'whatsapp:+14155550100'};
 const sig=X.twilioSignature('tok',url,p);
 assert.equal(X.verifyTwilio({body:p,headers:{'x-twilio-signature':sig}},url,{TWILIO_AUTH_TOKEN:'tok'}),true);
 assert.equal(X.verifyTwilio({body:{...p,Body:'altro'},headers:{'x-twilio-signature':sig}},url,{TWILIO_AUTH_TOKEN:'tok'}),false);
 assert.equal(X.verifyTwilio({body:p,headers:{'x-twilio-signature':sig}},url,{}),false,'no token, no trust');
 const raw=Buffer.from('{"entry":[]}');
 assert.equal(X.verifyMeta(raw,'sha256='+crypto.createHmac('sha256','sec').update(raw).digest('hex'),'sec'),true);
 assert.equal(X.verifyMeta(raw,'sha256=00','sec'),false);
 assert.equal(X.asPhone('whatsapp:+39 333 111 2222'),'+393331112222');assert.equal(X.asPhone('393479998877'),'+393479998877');assert.equal(X.asPhone('anonymous'),null);
 assert.equal(X.xml('<a & "b">'),'&lt;a &amp; &quot;b&quot;&gt;');
});

function hook(handler,{method='POST',query,body,headers={}}){
 return new Promise(resolve=>{const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},
  json(o){resolve({status:this.statusCode,body:o});return this;},end(b){resolve({status:this.statusCode,body:b,type:this.headers['Content-Type']});}};
  handler({method,query,body,url:'/api/booking?'+new URLSearchParams(query),headers:{host:'ciuffo.test',...headers}},res);});
}
test('webhooks refuse unsigned calls before touching the agenda; Meta verification echoes the challenge',async()=>{
 let reads=0;const store={json:async()=>{reads++;return null;},tx:async()=>[]};
 const env={TWILIO_AUTH_TOKEN:'tok',META_WA_VERIFY_TOKEN:'vt',META_APP_SECRET:'sec'};
 const H=B.createHandler({getOwner:()=>null,getStore:()=>store,sendMail:null,env,callModel:async()=>{throw new Error('no model');}});
 assert.equal((await hook(H,{query:{hook:'twilio-wa'},body:{Body:'x'},headers:{'x-twilio-signature':'bad'}})).status,403);
 assert.equal((await hook(H,{query:{hook:'twilio-voice'},body:{CallSid:'CA1'}})).status,403);
 assert.equal((await hook(H,{query:{hook:'meta'},body:'{}'})).status,403);
 assert.equal(reads,0);
 const ok=await hook(H,{method:'GET',query:{hook:'meta','hub.mode':'subscribe','hub.verify_token':'vt','hub.challenge':'1158201444'}});
 assert.equal(ok.status,200);assert.equal(ok.body,'1158201444');
 assert.equal((await hook(H,{method:'GET',query:{hook:'meta','hub.mode':'subscribe','hub.verify_token':'no','hub.challenge':'1'}})).status,403);
 // a signed WhatsApp message to a number no shop owns gets an empty answer
 const url='https://ciuffo.test/api/booking?hook=twilio-wa',p={From:'whatsapp:+393331112222',To:'whatsapp:+14155550100',Body:'ciao',MessageSid:'SM1'};
 const r=await hook(H,{query:{hook:'twilio-wa'},body:p,headers:{'x-twilio-signature':X.twilioSignature('tok',url,p)}});
 assert.equal(r.status,200);assert.equal(r.type,'text/xml');assert.match(r.body,/<Response><\/Response>/);
});

test('owner assistant actions need the session, and numbers can be assigned only by Ciuffo admins',async()=>{
 const SHOP='11111111-1111-4111-8111-111111111111';
 const store={json:async t=>/lower\(email\)/.test(t)?'bea@example.it':null,tx:async q=>q.map(()=>[])};
 const mk=(owner,env)=>B.createHandler({getOwner:()=>owner,getStore:()=>store,sendMail:null,env});
 const post=(H,action,data)=>new Promise(resolve=>{const res={headers:{},statusCode:200,setHeader(){},status(c){this.statusCode=c;return this;},json(o){resolve({status:this.statusCode,body:o});}};
  H({method:'POST',query:{},body:{action,shop:SHOP,data},headers:{'x-ciuffo':'1',host:'x'}},res);});
 assert.equal((await post(mk(null,{}),'sim.send',{text:'ciao'})).status,401);
 assert.match((await post(mk({uid:7},{}),'channel.save',{kind:'whatsapp',provider:'twilio',address:'+14155550100'})).body.error,/li assegna Ciuffo/);
 const ok=await post(mk({uid:7},{CIUFFO_ADMINS:'Bea@example.it'}),'channel.save',{kind:'voice',provider:'twilio',address:'+39 049 1234000'});
 assert.equal(ok.status,200,JSON.stringify(ok.body));
 assert.match((await post(mk({uid:7},{CIUFFO_ADMINS:'bea@example.it'}),'channel.save',{kind:'voice',provider:'meta',address:'123456'})).body.error,/Twilio/);
 assert.equal((await post(mk({uid:7},{}),'conversation.nope',{})).body.error,'Azione non riconosciuta.');
});
