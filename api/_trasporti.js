'use strict';
/* /api/trasporti — RADIX Trasporti (driver app + command center for small transport companies).
   This first version does one thing on the server: it reads a photographed transport document (DDT, CMR, giornale di
   viaggio, fuel receipt) with the Claude API and returns the fields for the driver to check and confirm.
   Trips, documents and costs are kept in the browser (demonstration) until migrations/trasporti/001 is applied.

   POST /api/trasporti {action:'documento.leggi', data:{kind, image (base64), media_type}}
        session cookie + X-Radix-Trasporti: 1 + application/json
   The image is sent to the Claude API and not stored here. ANTHROPIC_API_KEY (already set for the agents);
   TRASPORTI_AI_MODEL optional. At most DAILY readings per member per day on this instance. */
const doc=require('../lib/trasporti/documenti');

const MEDIA=['image/jpeg','image/png','image/webp','application/pdf'];
const MAX_BASE64=4200000; // Vercel accepts request bodies up to 4.5 MB; the app shrinks photos to ~1600 px first.
const DAILY=300;
function failure(status,message){const e=new Error(message);e.status=status;return e;}

let client=null;
async function defaultAsk({system,content}){
 if(!process.env.ANTHROPIC_API_KEY)return null;
 const Anthropic=require('@anthropic-ai/sdk');
 client=client||new (Anthropic.default||Anthropic)();
 const r=await client.beta.messages.create({
  model:process.env.TRASPORTI_AI_MODEL||'claude-sonnet-5-5',max_tokens:4000,
  betas:['server-side-fallback-2026-07-01'],fallbacks:'default',output_config:{effort:'low'},
  system:[{type:'text',text:system,cache_control:{type:'ephemeral'}}],messages:[{role:'user',content}]});
 if(r.stop_reason==='refusal')return {refused:true};
 return {text:r.content.filter(b=>b.type==='text').map(b=>b.text).join('\n').trim()};
}

function createHandler({getSessionUser,ask=defaultAsk,now=()=>Date.now()}={}){
 const counts=new Map();
 return async function(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
   if(req.method!=='POST')throw failure(405,'Metodo non consentito.');
   if(req.headers['x-radix-trasporti']!=='1'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')||req.headers['sec-fetch-site']==='cross-site')throw failure(403,'Richiesta non consentita.');
   let user;try{user=getSessionUser(req);}catch{user=null;}
   if(!user||!user.uid)throw failure(401,'Accedi a RADIX per usare la lettura automatica.');
   let body=req.body;
   if(typeof body==='string'){try{body=JSON.parse(body);}catch{throw failure(400,'JSON non valido.');}}
   if(!body||typeof body!=='object'||Array.isArray(body))throw failure(400,'Richiesta non valida.');
   if(body.action!=='documento.leggi')throw failure(400,'Azione non riconosciuta.');
   const d=body.data&&typeof body.data==='object'?body.data:{};
   if(!doc.KIND_KEYS.includes(d.kind))throw failure(400,'Tipo di documento non riconosciuto.');
   if(!MEDIA.includes(d.media_type))throw failure(400,'Formato non supportato: usa una foto JPEG, PNG, WebP o un PDF.');
   if(typeof d.image!=='string'||!d.image||d.image.length>MAX_BASE64||!/^[A-Za-z0-9+/]+={0,2}$/.test(d.image))throw failure(d.image&&d.image.length>MAX_BASE64?413:400,d.image&&d.image.length>MAX_BASE64?'Foto troppo grande: riprova, l\'app la riduce.':'Foto non valida.');
   const key=user.uid+':'+new Date(now()).toISOString().slice(0,10);
   const n=(counts.get(key)||0)+1;if(n>DAILY)throw failure(429,'Limite di letture di oggi raggiunto: compila a mano o riprova domani.');
   if(counts.size>5000)counts.clear();
   const block=d.media_type==='application/pdf'?{type:'document',source:{type:'base64',media_type:'application/pdf',data:d.image}}:{type:'image',source:{type:'base64',media_type:d.media_type,data:d.image}};
   let answer;
   try{answer=await ask({system:doc.SYSTEM,content:[block,{type:'text',text:doc.instructions(d.kind)}]});}
   catch(e){console.error('trasporti documento.leggi',e&&e.message);throw failure(502,'La lettura automatica non risponde: riprova o compila a mano.');}
   if(answer===null)throw failure(503,'Lettura automatica non configurata su questo ambiente.');
   counts.set(key,n);
   if(answer.refused)return res.status(200).json({reading:{...doc.parseReading(d.kind,null),note:'Il documento non è stato letto: compila a mano.'}});
   return res.status(200).json({reading:doc.parseReading(d.kind,answer.text)});
  }catch(e){
   if(!e.status)console.error('trasporti',e);
   return res.status(e.status||500).json({error:e.status?e.message:'Errore interno.'});
  }
 };
}

let handler=null;
module.exports=function(req,res){
 handler=handler||createHandler({getSessionUser:require('./_auth').getSessionUser});
 return handler(req,res);
};
module.exports.createHandler=createHandler;
