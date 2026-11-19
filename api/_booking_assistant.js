'use strict';
// Ciuffo — the assistant on WhatsApp and on the phone, plus the owner's inbox and «Prova l'assistente».
// The brain (instructions, tools, the tool loop) is lib/booking/assistant.js; here are the tools on the real agenda,
// the webhooks and the replies.
//
// WhatsApp, two ways in, same brain (Francesco 12/11: «partiamo con A per le prove, a tendere B»):
//  A) a Twilio number given to the shop: POST /api/booking?hook=twilio-wa (form, X-Twilio-Signature);
//     the answer goes back in the TwiML of the same request; the shop answers by hand from the Ciuffo inbox.
//  B) the shop's own WhatsApp Business number through Meta Cloud API (coexistence with the WhatsApp Business app):
//     GET/POST /api/booking?hook=meta (X-Hub-Signature-256); the answer is sent with the Graph API. When the shop
//     answers from its own phone Meta sends an «echo» (smb_message_echoes) and the assistant stops in that chat.
// Phone: the shop forwards calls (busy / no answer) to a Twilio number; POST /api/booking?hook=twilio-voice.
//  Twilio turns speech into text (<Gather input="speech">) and reads the answer (<Say>); one request per turn.
//
// Environment: ANTHROPIC_API_KEY; CIUFFO_AI_MODEL (chat, default claude-sonnet-5-5) and CIUFFO_AI_VOICE_MODEL
// (phone, default claude-haiku-5-5: the caller waits in silence while it thinks); TWILIO_ACCOUNT_SID,
// TWILIO_AUTH_TOKEN; CIUFFO_TTS_VOICE (default Polly.Bianca-Neural); META_APP_SECRET, META_WA_VERIFY_TOKEN,
// META_WA_TOKEN, META_GRAPH_VERSION (default v24.0); CIUFFO_ADMINS (emails that may assign numbers to shops).
const crypto=require('node:crypto');
const {randomUUID}=crypto;
const A=require('../lib/booking/assistant');

const PAUSE_MIN=12*60;           // the shop answered by hand: the assistant keeps quiet in that chat for 12 hours
const MAX_TURNS_PER_HOUR=30;     // per conversation: a runaway chat cannot run up the model bill
const HISTORY=30;                // messages the assistant rereads
const xml=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const twiml=inner=>'<?xml version="1.0" encoding="UTF-8"?><Response>'+inner+'</Response>';
const E164=/^\+[0-9]{6,15}$/;
const bare=v=>String(v||'').replace(/^whatsapp:/,'').trim();
const asPhone=v=>{let n=bare(v).replace(/[\s()-]/g,'');if(/^[0-9]{6,15}$/.test(n))n='+'+n;return E164.test(n)?n:null;};

// Twilio: base64(HMAC-SHA1(auth token, full URL + every POST field name and value, names sorted)).
function twilioSignature(token,url,params){
 const data=url+Object.keys(params||{}).sort().map(k=>k+(params[k]==null?'':String(params[k]))).join('');
 return crypto.createHmac('sha1',token).update(data,'utf8').digest('base64');
}
function safeEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function verifyTwilio(req,url,env){
 const token=env.TWILIO_AUTH_TOKEN;if(!token)return false;
 return safeEqual(twilioSignature(token,url,req.body||{}),(req.headers||{})['x-twilio-signature']);
}
function verifyMeta(raw,header,secret){
 if(!secret||!raw)return false;
 return safeEqual('sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex'),header);
}

// The model call (Messages API with tools). No extended thinking: the answer must arrive in a few seconds.
function defaultCallModel(env,fetchImpl){
 return async({system,messages,tools,voice})=>{
  const key=env.ANTHROPIC_API_KEY;if(!key)throw Object.assign(new Error('ANTHROPIC_API_KEY mancante.'),{code:'no_key'});
  const model=voice?(env.CIUFFO_AI_VOICE_MODEL||'claude-haiku-5-5'):(env.CIUFFO_AI_MODEL||'claude-sonnet-5-5');
  const r=await fetchImpl('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
   body:JSON.stringify({model,max_tokens:voice?400:700,system:[{type:'text',text:system,cache_control:{type:'ephemeral'}}],tools,messages})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error('Modello: '+((j.error&&j.error.message)||r.status)),{code:'model'});
  return j;
 };
}

function createAssistant(ctx){
 const {fail,q,S,loadShop,dayWindow,slotsFor,todayIn,bookCore,nowOf,mail,fmtWhen,BkError}=ctx;
 const env=ctx.env||process.env,http=ctx.fetch||((...a)=>fetch(...a));
 const callModel=ctx.callModel||defaultCallModel(env,http);
 const json=(store,t,p)=>store.json(t,p);

 // ----- the shop as the assistant sees it -----
 async function shopFor(store,shopId,from,days){
  const [a,b]=dayWindow(from,days);const s=await loadShop(store,'s.id=$1',shopId,a,b);if(!s)fail(404,'Salone non trovato.');
  const extra=await json(store,"SELECT jsonb_build_object('assistant_on',assistant_on,'assistant_notes',assistant_notes,'email',email) AS v FROM bk_shops WHERE id=$1",[shopId])||{};
  return Object.assign(s,extra);
 }
 const liveService=(shop,v)=>shop.services.find(x=>x.id===String(v||'').toLowerCase()&&x.active);
 const staffName=(shop,i)=>(shop.staff.find(t=>t.id===i)||{}).name;
 const dayLabel=d=>new Intl.DateTimeFormat('it-IT',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(d+'T12:00:00Z'));

 // ----- tools on the real agenda -----
 function toolsFor(store,conv,shop0){
  const tel=conv.peer,source=conv.channel==='voice'?'phone':'whatsapp';
  return async function run(name,input){
   const now=nowOf(),today=todayIn(shop0.timezone,now),last=S.addDays(today,shop0.max_days_ahead);
   switch(name){
    case 'cerca_orari':{
     const service=liveService(shop0,input.servizio_id);if(!service)return {errore:'Servizio non trovato: usa un id della lista.'};
     let from=S.isDate(input.dal)?input.dal:today;if(from<today)from=today;
     const days=Math.max(1,Math.min(7,Number.isInteger(input.giorni)?input.giorni:1));
     if(from>last)return {giorni:[],nota:'Si può prenotare al massimo fino al '+last+'.'};
     const staffId=input.operatore_id?String(input.operatore_id).toLowerCase():null;
     if(staffId&&!shop0.staff.some(t=>t.id===staffId&&t.active))return {errore:'Persona non trovata: usa un id della lista.'};
     const shop=await shopFor(store,shop0.id,from,days),out=[];
     for(let i=0;i<days;i++){const d=S.addDays(from,i);if(d>last)break;
      const slots=slotsFor(shop,{service,staff_id:staffId,date:d,now}).filter(x=>A.inBand(x.time,input.fascia||'qualsiasi'));
      out.push({data:d,giorno:dayLabel(d),orari:slots.slice(0,12).map(x=>({inizio:x.starts_at,ora:x.time,con:x.staff_ids.map(i=>staffName(shop,i)).filter(Boolean)})),altri:Math.max(0,slots.length-12)});}
     return {servizio:service.name,durata_min:service.duration_min,giorni:out};
    }
    case 'prenota':{
     if(!tel)return {errore:'Numero del cliente nascosto: non si può prenotare da qui.'};
     const service=liveService(shop0,input.servizio_id);if(!service)return {errore:'Servizio non trovato.'};
     const start=typeof input.inizio==='string'&&!Number.isNaN(Date.parse(input.inizio))?new Date(Date.parse(input.inizio)).toISOString():null;
     if(!start)return {errore:'Orario non valido: usa il campo «inizio» di cerca_orari.'};
     const name=typeof input.nome==='string'?input.nome.trim().slice(0,120):'';if(name.length<2)return {errore:'Serve il nome del cliente.'};
     const shop=await shopFor(store,shop0.id,S.utcToLocal(start,shop0.timezone).date,1);
     try{
      const r=await bookCore(store,{shop,service,staffId:input.operatore_id?String(input.operatore_id).toLowerCase():null,start,name,tel,email:null,
       note:('Prenotato dall\'assistente'+(conv.channel==='sim'?' (prova)':conv.channel==='voice'?' al telefono':' su WhatsApp')+(typeof input.nota==='string'&&input.nota.trim()?': '+input.nota.trim():'')).slice(0,500),
       source,detail:{conversation:conv.id}});
      const link=ctx.origin?ctx.origin+'/ciuffo/gestisci.html#t='+r.token:null;
      return {ok:true,servizio:service.name,quando:fmtWhen(r.slot.starts_at,shop.timezone),con:r.staffName,link_per_vedere_o_disdire:conv.channel==='voice'?undefined:link};
     }catch(e){if(e instanceof BkError)return {errore:e.message};if(e&&e.code==='23P01')return {errore:'Quell\'orario è appena stato preso: cercane un altro.'};throw e;}
    }
    case 'miei_appuntamenti':{
     if(!tel)return {appuntamenti:[],nota:'Numero nascosto.'};
     const rows=await json(store,"SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'servizio',v.name,'inizio',a.starts_at,'con',t.name) ORDER BY a.starts_at),'[]') AS v FROM bk_appointments a JOIN bk_customers c ON c.shop_id=a.shop_id AND c.id=a.customer_id JOIN bk_services v ON v.shop_id=a.shop_id AND v.id=a.service_id JOIN bk_staff t ON t.shop_id=a.shop_id AND t.id=a.staff_id WHERE a.shop_id=$1 AND c.phone=$2 AND a.status='confirmed' AND a.starts_at>now() LIMIT 10",[shop0.id,tel])||[];
     return {appuntamenti:rows.map(r=>({id:r.id,servizio:r.servizio,quando:fmtWhen(r.inizio,shop0.timezone),con:r.con}))};
    }
    case 'disdici':{
     if(!tel)return {errore:'Numero nascosto: non si può disdire da qui.'};
     const aid=String(input.appuntamento_id||'').toLowerCase();
     const a=await json(store,"SELECT jsonb_build_object('id',a.id,'starts_at',a.starts_at,'status',a.status) AS v FROM bk_appointments a JOIN bk_customers c ON c.shop_id=a.shop_id AND c.id=a.customer_id WHERE a.shop_id=$1 AND a.id::text=$2 AND c.phone=$3",[shop0.id,aid,tel]);
     if(!a||a.status!=='confirmed')return {errore:'Appuntamento non trovato tra quelli di questo cliente.'};
     if(Date.parse(a.starts_at)-now<shop0.cancel_notice_min*60000)return {errore:'Manca troppo poco all\'appuntamento per disdire da qui: passa al salone.'};
     await store.tx([q("UPDATE bk_appointments SET status='cancelled',cancelled_at=now() WHERE shop_id=$1 AND id=$2 AND status='confirmed'",[shop0.id,a.id]),
      q('INSERT INTO bk_audit(shop_id,actor_id,action,entity_id,detail) VALUES($1,NULL,$2,$3,$4::jsonb)',[shop0.id,'appointment.cancel',a.id,JSON.stringify({by:'assistant',conversation:conv.id})])]);
     return {ok:true,disdetto:fmtWhen(a.starts_at,shop0.timezone)};
    }
    case 'passa_al_salone':{
     await json(store,'UPDATE bk_conversations SET needs_owner=true WHERE shop_id=$1 AND id=$2 RETURNING to_jsonb(true) AS v',[shop0.id,conv.id]);
     const why=String(input.motivo||'').slice(0,300);
     if(conv.channel!=='sim')await mail(shop0.email&&{to:shop0.email,subject:'Un cliente ti cerca su '+(conv.channel==='voice'?'telefono':'WhatsApp'),
      text:'L\'assistente di Ciuffo ha passato a te una conversazione'+(tel?' con '+tel:'')+'.\nMotivo: '+why+'\n\nLa trovi in Ciuffo › Messaggi.'});
     return {ok:true,nota:'Il salone è avvisato. Di\' al cliente che una persona del salone lo ricontatta appena possibile.'};
    }
   }
   return {errore:'Strumento sconosciuto.'};
  };
 }

 // ----- one message in, one answer out -----
 const CONV="SELECT to_jsonb(c) AS v FROM bk_conversations c WHERE shop_id=$1 AND id=$2";
 async function addMessage(store,conv,role,body,extId){
  const t=String(body||'').slice(0,4000);if(!t.trim())return null;
  return json(store,'WITH m AS (INSERT INTO bk_messages(shop_id,conversation_id,role,body,ext_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(ext_id) DO NOTHING RETURNING id), u AS (UPDATE bk_conversations SET last_at=now() WHERE shop_id=$1 AND id=$2 AND EXISTS(SELECT 1 FROM m)) SELECT to_jsonb(id) AS v FROM m',[conv.shop_id,conv.id,role,t,extId||null]);
 }
 // force: the owner's trial chat answers even when the assistant is switched off for customers.
 async function answer(store,conv,{text,extId,force}){
  const saved=await addMessage(store,conv,'customer',text,extId);
  if(saved==null)return {duplicate:true};
  const now=nowOf();
  const shop=await shopFor(store,conv.shop_id,todayIn('Europe/Rome',now),1);
  if(!force&&!shop.assistant_on)return {silent:'off'};
  if(!force&&(conv.needs_owner||(conv.paused_until&&Date.parse(conv.paused_until)>now)))return {silent:'paused'};
  const recent=await json(store,"SELECT to_jsonb(count(*)::int) AS v FROM bk_messages WHERE shop_id=$1 AND conversation_id=$2 AND role='customer' AND at>now()-interval '1 hour'",[conv.shop_id,conv.id]);
  if(recent>MAX_TURNS_PER_HOUR)return {silent:'limit'};
  const rows=await json(store,"SELECT coalesce(jsonb_agg(x ORDER BY x->>'n'),'[]') AS v FROM (SELECT jsonb_build_object('n',lpad(id::text,20,'0'),'role',role,'body',body) AS x FROM bk_messages WHERE shop_id=$1 AND conversation_id=$2 ORDER BY id DESC LIMIT $3) t",[conv.shop_id,conv.id,HISTORY])||[];
  const customer=conv.peer?await json(store,"SELECT jsonb_build_object('name',name,'phone',phone) AS v FROM bk_customers WHERE shop_id=$1 AND phone=$2",[conv.shop_id,conv.peer]):null;
  const loc=S.utcToLocal(new Date(now).toISOString(),shop.timezone);
  const system=A.systemPrompt({shop,today:loc.date,time:loc.time,customer:customer||{phone:conv.peer},voice:conv.voice,channel:conv.channel});
  let out;
  try{out=await A.runTurn({callModel:a=>callModel({...a,voice:conv.voice}),runTool:toolsFor(store,conv,shop),system,messages:A.toApiMessages(rows),voice:conv.voice});}
  catch(e){console.error('ciuffo assistant',e&&e.code,e&&e.message);out={text:A.fallback(conv.voice),actions:[],error:true};
   await json(store,'UPDATE bk_conversations SET needs_owner=true WHERE shop_id=$1 AND id=$2 RETURNING to_jsonb(true) AS v',[conv.shop_id,conv.id]);}
  const reply=conv.voice?A.forVoice(out.text):out.text;
  if(reply)await addMessage(store,conv,'assistant',reply,null);
  for(const a of out.actions||[])if(a.tool==='prenota'&&a.result&&a.result.ok||a.tool==='disdici'&&a.result&&a.result.ok)
   await addMessage(store,conv,'note',(a.tool==='prenota'?'Prenotato: '+a.result.servizio+', '+a.result.quando+(a.result.con?' con '+a.result.con:''):'Disdetto: '+a.result.disdetto),null);
  return {text:reply,end:!!out.end,handover:!!out.handover,actions:(out.actions||[]).map(a=>({tool:a.tool,ok:!!(a.result&&a.result.ok)}))};
 }

 async function channelFor(store,provider,kind,address){
  return json(store,"SELECT jsonb_build_object('shop_id',shop_id,'id',id,'address',address) AS v FROM bk_channels WHERE provider=$1 AND kind=$2 AND address=$3 AND active",[provider,kind,address]);
 }
 async function chatConversation(store,ch,provider,peer){
  return json(store,"WITH c AS (INSERT INTO bk_conversations(shop_id,id,channel,provider,address,peer) VALUES($1,$2,'whatsapp',$3,$4,$5) ON CONFLICT(shop_id,channel,peer) WHERE channel='whatsapp' DO UPDATE SET provider=EXCLUDED.provider,address=EXCLUDED.address RETURNING *) SELECT to_jsonb(c) AS v FROM c",[ch.shop_id,randomUUID(),provider,ch.address,peer]);
 }

 // ----- WhatsApp through Twilio (A) -----
 async function twilioWhatsApp(store,req,url){
  if(!verifyTwilio(req,url,env))fail(403,'Firma Twilio non valida.');
  const b=req.body||{},to=asPhone(b.To),from=asPhone(b.From);
  if(!to||!from)return twiml('');
  const ch=await channelFor(store,'twilio','whatsapp',to);if(!ch)return twiml('');
  const conv=await chatConversation(store,ch,'twilio',from);
  const body=String(b.Body||'').trim();
  if(!body){await addMessage(store,conv,'note','Il cliente ha mandato un allegato o un vocale',b.MessageSid?b.MessageSid+':m':null);
   return twiml('<Message>'+xml('Per ora leggo solo i messaggi scritti: mi scrivi cosa ti serve?')+'</Message>');}
  const r=await answer(store,conv,{text:body,extId:b.MessageSid||null});
  return twiml(r.text?'<Message>'+xml(r.text)+'</Message>':'');
 }

 // ----- WhatsApp through Meta Cloud API (B, the shop's own number) -----
 async function metaSend(phoneNumberId,to,text){
  const token=env.META_WA_TOKEN;if(!token)throw new Error('META_WA_TOKEN mancante.');
  const r=await http('https://graph.facebook.com/'+(env.META_GRAPH_VERSION||'v24.0')+'/'+encodeURIComponent(phoneNumberId)+'/messages',{method:'POST',
   headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({messaging_product:'whatsapp',to:to.replace(/^\+/,''),type:'text',text:{body:text}})});
  if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error('WhatsApp (Meta): '+((j.error&&j.error.message)||r.status));}
 }
 function metaVerify(qs){
  if(qs['hub.mode']==='subscribe'&&env.META_WA_VERIFY_TOKEN&&safeEqual(qs['hub.verify_token'],env.META_WA_VERIFY_TOKEN))return String(qs['hub.challenge']||'');
  fail(403,'Verifica non riuscita.');
 }
 async function metaWebhook(store,req,raw){
  if(!verifyMeta(raw,(req.headers||{})['x-hub-signature-256'],env.META_APP_SECRET))fail(403,'Firma Meta non valida.');
  let ev;try{ev=JSON.parse(raw.toString('utf8'));}catch{fail(400,'Richiesta non leggibile.');}
  let handled=0;
  for(const entry of ev.entry||[])for(const ch_ of entry.changes||[]){
   const v=ch_.value||{},pnid=v.metadata&&String(v.metadata.phone_number_id||'');if(!pnid)continue;
   const ch=await channelFor(store,'meta','whatsapp',pnid);if(!ch)continue;
   if(ch_.field==='messages')for(const m of v.messages||[]){
    const from=asPhone(m.from);if(!from)continue;const conv=await chatConversation(store,ch,'meta',from);
    if(m.type!=='text'){await addMessage(store,conv,'note','Il cliente ha mandato un messaggio di tipo «'+String(m.type).slice(0,20)+'»',m.id||null);continue;}
    const r=await answer(store,conv,{text:String(m.text&&m.text.body||''),extId:m.id||null});handled++;
    if(r.text)try{await metaSend(pnid,from,r.text);}catch(e){console.error('ciuffo meta send',e.message);await addMessage(store,conv,'note','Risposta non inviata: '+e.message,null);}
   }
   // Coexistence: the shop answered from the WhatsApp Business app → the assistant stops in that chat.
   if(ch_.field==='smb_message_echoes')for(const m of v.message_echoes||[]){
    const to=asPhone(m.to);if(!to)continue;const conv=await chatConversation(store,ch,'meta',to);
    const t=m.type==='text'?String(m.text&&m.text.body||''):'(messaggio «'+String(m.type).slice(0,20)+'» dal telefono del salone)';
    await addMessage(store,conv,'owner',t,m.id||null);await pause(store,conv);handled++;
   }
  }
  return {ok:true,handled};
 }
 const pause=(store,conv)=>json(store,"UPDATE bk_conversations SET paused_until=$3::timestamptz,needs_owner=false WHERE shop_id=$1 AND id=$2 RETURNING to_jsonb(true) AS v",[conv.shop_id,conv.id,new Date(nowOf()+PAUSE_MIN*60000).toISOString()]);

 // ----- the phone (Twilio Voice, calls forwarded by the shop) -----
 const voiceName=()=>env.CIUFFO_TTS_VOICE||'Polly.Bianca-Neural';
 const say=t=>'<Say voice="'+xml(voiceName())+'" language="it-IT">'+xml(t)+'</Say>';
 const gather=(action,t)=>'<Gather input="speech" language="it-IT" speechTimeout="auto" actionOnEmptyResult="true" method="POST" action="'+xml(action)+'">'+say(t)+'</Gather>';
 async function twilioVoice(store,req,url,qs){
  if(!verifyTwilio(req,url,env))fail(403,'Firma Twilio non valida.');
  const b=req.body||{},base='/api/booking?hook=twilio-voice&step=turn';
  if(qs.step!=='turn'){
   const to=asPhone(b.To),ch=to&&await channelFor(store,'twilio','voice',to);
   const shop=ch&&await json(store,"SELECT jsonb_build_object('name',name,'phone',phone,'assistant_on',assistant_on) AS v FROM bk_shops WHERE id=$1",[ch.shop_id]);
   if(!shop||!shop.assistant_on)return twiml(say('Al momento non possiamo rispondere. Riprova più tardi, grazie.')+'<Hangup/>');
   const conv=await json(store,"WITH c AS (INSERT INTO bk_conversations(shop_id,id,channel,provider,address,peer,call_sid,voice) VALUES($1,$2,'voice','twilio',$3,$4,$5,true) ON CONFLICT(call_sid) DO UPDATE SET last_at=now() RETURNING *) SELECT to_jsonb(c) AS v FROM c",[ch.shop_id,randomUUID(),ch.address,asPhone(b.From),String(b.CallSid||'').slice(0,64)||null]);
   const hello='Ciao, sono l\'assistente di '+shop.name+'. Posso prenotare, spostare o disdire un appuntamento. Dimmi pure.';
   await addMessage(store,conv,'assistant',hello,null);
   return twiml(gather(base+'&c='+conv.id+'&s=0',hello));
  }
  const cid=String(qs.c||'');if(!/^[0-9a-f-]{36}$/i.test(cid))return twiml('<Hangup/>');
  const conv=await json(store,"SELECT to_jsonb(c) AS v FROM bk_conversations c WHERE id=$1 AND channel='voice' AND call_sid=$2",[cid,String(b.CallSid||'')]);
  if(!conv)return twiml('<Hangup/>');
  const heard=String(b.SpeechResult||'').trim(),silences=Math.min(5,Number(qs.s)||0);
  if(!heard){
   if(silences>=2)return twiml(say('Non ti sento. Puoi richiamare o scriverci su WhatsApp. Ciao!')+'<Hangup/>');
   return twiml(gather(base+'&c='+conv.id+'&s='+(silences+1),'Scusa, non ho sentito. Puoi ripetere?'));
  }
  const r=await answer(store,conv,{text:heard,extId:b.CallSid&&b.SpeechResult?String(b.CallSid)+':'+crypto.createHash('sha1').update(heard+'|'+(qs.s||'')+'|'+(b.Confidence||'')).digest('hex').slice(0,12):null,force:true});
  if(r.duplicate)return twiml(gather(base+'&c='+conv.id+'&s=0','Dimmi pure.'));
  const text=r.text||'Grazie, a presto!';
  return twiml(r.end?say(text)+'<Hangup/>':gather(base+'&c='+conv.id+'&s=0',text));
 }

 // ----- owner: inbox, manual answers, trial chat, numbers -----
 const isAdmin=async(store,uid)=>{const list=String(env.CIUFFO_ADMINS||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);if(!list.length)return false;
  const e=await json(store,'SELECT to_jsonb(lower(email)) AS v FROM users WHERE id=$1',[uid]);return !!e&&list.includes(e);};
 async function conversations(store,shop){
  return json(store,"SELECT coalesce(jsonb_agg(x ORDER BY x->>'last_at' DESC),'[]') AS v FROM (SELECT jsonb_build_object('id',c.id,'channel',c.channel,'provider',c.provider,'peer',c.peer,'name',(SELECT name FROM bk_customers k WHERE k.shop_id=c.shop_id AND k.phone=c.peer),'needs_owner',c.needs_owner,'paused_until',c.paused_until,'last_at',c.last_at,'last',(SELECT jsonb_build_object('role',m.role,'body',left(m.body,140)) FROM bk_messages m WHERE m.shop_id=c.shop_id AND m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1)) AS x FROM bk_conversations c WHERE c.shop_id=$1 AND c.channel<>'sim' ORDER BY c.last_at DESC LIMIT 60) t",[shop]);
 }
 async function conversation(store,shop,cid){
  const c=await json(store,"SELECT to_jsonb(c)||jsonb_build_object('name',(SELECT name FROM bk_customers k WHERE k.shop_id=c.shop_id AND k.phone=c.peer),'messages',coalesce((SELECT jsonb_agg(jsonb_build_object('role',m.role,'body',m.body,'at',m.at) ORDER BY m.id) FROM (SELECT * FROM bk_messages WHERE shop_id=c.shop_id AND conversation_id=c.id ORDER BY id DESC LIMIT 200) m),'[]')) AS v FROM bk_conversations c WHERE c.shop_id=$1 AND c.id=$2",[shop,cid]);
  if(!c)fail(404,'Conversazione non trovata.');return c;
 }
 async function twilioSend(from,to,text){
  const sid=env.TWILIO_ACCOUNT_SID,token=env.TWILIO_AUTH_TOKEN;if(!sid||!token)throw new Error('Twilio non configurato.');
  const r=await http('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(sid)+'/Messages.json',{method:'POST',
   headers:{'content-type':'application/x-www-form-urlencoded',authorization:'Basic '+Buffer.from(sid+':'+token).toString('base64')},
   body:new URLSearchParams({From:'whatsapp:'+from,To:'whatsapp:'+to,Body:text}).toString()});
  if(!r.ok){const j=await r.json().catch(()=>({}));const m=String(j.message||r.status);
   throw new Error(/63016|24 ?hour|outside the allowed window/i.test(m+(j.code||''))?'Sono passate più di 24 ore dall\'ultimo messaggio del cliente: WhatsApp permette di riscrivergli solo con un modello approvato.':'Twilio: '+m);}
 }
 async function ownerAct(store,uid,action,shop,d,{ROLE,audit,text}){
  switch(action){
   case 'conversation.reply':{
    await store.tx([ROLE(shop,uid,['owner','staff'])]);
    const c=await conversation(store,shop,String(d.id||''));const body=text(d.text,1500,true,'Scrivi il messaggio.');
    if(c.channel!=='whatsapp'||!c.peer)fail(400,'A questa conversazione non si può rispondere da qui.');
    try{c.provider==='meta'?await metaSend(c.address,c.peer,body):await twilioSend(c.address,c.peer,body);}catch(e){fail(502,e.message);}
    await addMessage(store,c,'owner',body,null);await pause(store,c);return {ok:true};}
   case 'conversation.resume':{
    await store.tx([ROLE(shop,uid,['owner','staff']),q('UPDATE bk_conversations SET paused_until=NULL,needs_owner=false WHERE shop_id=$1 AND id::text=$2',[shop,String(d.id||'')]),audit(shop,uid,action,null,{conversation:String(d.id||'')})]);
    return {ok:true};}
   case 'sim.send':{
    const body=text(d.text,1000,true,'Scrivi un messaggio.');const voice=d.voice===true;
    await store.tx([ROLE(shop,uid,['owner','staff'])]);
    const peer='+3900000'+String(uid).padStart(6,'0').slice(-8);
    const conv=await json(store,"WITH c AS (INSERT INTO bk_conversations(shop_id,id,channel,peer,owner_id,voice) VALUES($1,$2,'sim',$3,$4,$5) ON CONFLICT(shop_id,owner_id) WHERE channel='sim' DO UPDATE SET voice=EXCLUDED.voice RETURNING *) SELECT to_jsonb(c) AS v FROM c",[shop,randomUUID(),peer,uid,voice]);
    return answer(store,conv,{text:body,force:true});}
   case 'sim.reset':{
    await store.tx([ROLE(shop,uid,['owner','staff']),q("DELETE FROM bk_conversations WHERE shop_id=$1 AND channel='sim' AND owner_id=$2",[shop,uid])]);return {ok:true};}
   case 'channel.save':{
    if(!await isAdmin(store,uid))fail(403,'I numeri li assegna Ciuffo: scrivici per attivare WhatsApp o il telefono.');
    const kind=['whatsapp','voice'].includes(d.kind)?d.kind:fail(400,'Canale non valido.');
    const provider=['twilio','meta'].includes(d.provider)?d.provider:fail(400,'Fornitore non valido.');
    if(kind==='voice'&&provider!=='twilio')fail(400,'Il telefono passa da Twilio.');
    const address=provider==='twilio'?(asPhone(d.address)||fail(400,'Numero non valido: scrivilo con il prefisso, es. +39…')):(/^[0-9]{5,30}$/.test(String(d.address||''))?String(d.address):fail(400,'Phone number ID di Meta non valido.'));
    const cid=randomUUID();
    await store.tx([ROLE(shop,uid,['owner']),q('INSERT INTO bk_channels(shop_id,id,kind,provider,address) VALUES($1,$2,$3,$4,$5)',[shop,cid,kind,provider,address]),audit(shop,uid,action,cid,{kind,provider,address})]);
    return {id:cid};}
   case 'channel.delete':{
    if(!await isAdmin(store,uid))fail(403,'I numeri li gestisce Ciuffo.');
    await store.tx([ROLE(shop,uid,['owner']),q('DELETE FROM bk_channels WHERE shop_id=$1 AND id::text=$2',[shop,String(d.id||'')]),audit(shop,uid,action,null,{id:String(d.id||'')})]);return {ok:true};}
  }
  return undefined;
 }
 async function channels(store,shop,uid){
  return {admin:await isAdmin(store,uid),list:await json(store,"SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'provider',provider,'address',address,'active',active) ORDER BY kind,created_at),'[]') AS v FROM bk_channels WHERE shop_id=$1",[shop])||[]};
 }
 async function simConversation(store,shop,uid){
  return json(store,"SELECT jsonb_build_object('voice',c.voice,'messages',coalesce((SELECT jsonb_agg(jsonb_build_object('role',m.role,'body',m.body,'at',m.at) ORDER BY m.id) FROM bk_messages m WHERE m.shop_id=c.shop_id AND m.conversation_id=c.id),'[]')) AS v FROM bk_conversations c WHERE c.shop_id=$1 AND c.channel='sim' AND c.owner_id=$2",[shop,uid]);
 }

 return {answer,twilioWhatsApp,twilioVoice,metaVerify,metaWebhook,conversations,conversation,ownerAct,channels,simConversation,CONV};
}

module.exports={createAssistant,twilioSignature,verifyTwilio,verifyMeta,asPhone,xml,PAUSE_MIN};
