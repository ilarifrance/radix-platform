'use strict';
/* /api/trasporti — RADIX Trasporti (driver app + command center for small transport companies).
   This first version does one thing on the server: it reads a photographed transport document (DDT, CMR, giornale di
   viaggio, fuel receipt) with the Claude API and returns the fields for the driver to check and confirm.
   Trips, documents and costs are kept in the browser (demonstration) until migrations/trasporti/001 is applied.

   POST /api/trasporti {action:'documento.leggi', data:{kind, image (base64), media_type}}
        session cookie + X-Radix-Trasporti: 1 + application/json
   POST /api/trasporti {action:'pratica.leggi', data:{first, pages:[{image, media_type}]}} → documents found in up to
        12 pages of a scanned bundle (the browser renders the PDF into page images and sends them in batches).
   POST /api/trasporti {action:'posizioni.aggiorna'} → {provider, positions} from the tracker of the pilot company.
        TRASPORTI_TRACKER = JSON {"provider":"webfleet"|"verizon"|"rfms", ...credentials} on the server only
        (webfleet: account, username, password, apikey · verizon: username, password, app_id, vehicles[], base_url?
        · rfms: base_url, token or username/password). At most one request a minute per member.
   The image is sent to the Claude API and not stored here. ANTHROPIC_API_KEY (already set for the agents);
   TRASPORTI_AI_MODEL optional. At most DAILY readings per member per day on this instance. */
const doc=require('../lib/trasporti/documenti');
const loc=require('../lib/trasporti/localizzatori');
const pr=require('../lib/trasporti/pratiche');

const MEDIA=['image/jpeg','image/png','image/webp','application/pdf'];
const MAX_BASE64=4200000; // Vercel accepts request bodies up to 4.5 MB; the app shrinks photos to ~1600 px first.
const DAILY=300;
function failure(status,message){const e=new Error(message);e.status=status;return e;}

let client=null;
async function defaultAsk({system,content,maxTokens=4000}){
 if(!process.env.ANTHROPIC_API_KEY)return null;
 const Anthropic=require('@anthropic-ai/sdk');
 client=client||new (Anthropic.default||Anthropic)();
 const r=await client.beta.messages.create({
  model:process.env.TRASPORTI_AI_MODEL||'claude-sonnet-5-5',max_tokens:maxTokens,
  betas:['server-side-fallback-2026-07-01'],fallbacks:'default',output_config:{effort:'low'},
  system:[{type:'text',text:system,cache_control:{type:'ephemeral'}}],messages:[{role:'user',content}]});
 if(r.stop_reason==='refusal')return {refused:true};
 return {text:r.content.filter(b=>b.type==='text').map(b=>b.text).join('\n').trim()};
}

function trackerConfig(){
 const raw=process.env.TRASPORTI_TRACKER;if(!raw)return null;
 try{const c=JSON.parse(raw);return c&&typeof c==='object'&&loc.PROVIDERS[c.provider]&&loc.PROVIDERS[c.provider].api?c:null;}catch{return null;}
}

function createHandler({getSessionUser,ask=defaultAsk,now=()=>Date.now(),tracker=trackerConfig,fetchPositions=loc.fetchPositions}={}){
 const counts=new Map(),lastSync=new Map();
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
   if(body.action==='posizioni.aggiorna'){
    const c=tracker();if(!c)throw failure(503,'Nessun localizzatore collegato su questo ambiente: carica il file di export.');
    const last=lastSync.get(user.uid);if(last!=null&&now()-last<60000)throw failure(429,'Posizioni appena aggiornate: riprova tra un minuto.');
    lastSync.set(user.uid,now());if(lastSync.size>5000)lastSync.clear();
    let positions;
    try{positions=await fetchPositions(c.provider,c);}
    catch(e){console.error('trasporti posizioni',c.provider,e&&e.message);throw failure(502,(loc.PROVIDERS[c.provider].label)+' non risponde: riprova tra qualche minuto.');}
    return res.status(200).json({provider:c.provider,positions:positions.slice(0,5000)});
   }
   if(body.action==='pratica.leggi'){
    const d=body.data&&typeof body.data==='object'?body.data:{};
    const pages=Array.isArray(d.pages)?d.pages:[];const first=Number.isInteger(d.first)&&d.first>=1&&d.first<=500?d.first:1;
    if(!pages.length||pages.length>pr.MAX_PAGES)throw failure(400,'Da 1 a '+pr.MAX_PAGES+' pagine per volta.');
    let size=0;
    for(const p of pages){if(!p||!['image/jpeg','image/png','image/webp'].includes(p.media_type)||typeof p.image!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(p.image))throw failure(400,'Pagina non valida.');size+=p.image.length;}
    if(size>MAX_BASE64)throw failure(413,'Pagine troppo grandi: riprova, l\'app le riduce.');
    const key=user.uid+':'+new Date(now()).toISOString().slice(0,10);
    const n=(counts.get(key)||0)+pages.length;if(n>DAILY)throw failure(429,'Limite di letture di oggi raggiunto: riprova domani.');
    let answer;
    try{answer=await ask({system:doc.SYSTEM,maxTokens:12000,content:[...pages.map(p=>({type:'image',source:{type:'base64',media_type:p.media_type,data:p.image}})),{type:'text',text:pr.instructions(first,pages.length)}]});}
    catch(e){console.error('trasporti pratica.leggi',e&&e.message);throw failure(502,'La lettura automatica non risponde: riprova.');}
    if(answer===null)throw failure(503,'Lettura automatica non configurata su questo ambiente.');
    counts.set(key,n);
    if(answer.refused)return res.status(200).json({documents:[],error:'Queste pagine non sono state lette.'});
    return res.status(200).json(pr.parseBatch(answer.text,first,pages.length));
   }
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
