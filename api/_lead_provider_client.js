'use strict';
const base='https://api.captaindata.com/v4/users/';
function enabled(env=process.env){return env.VERCEL_ENV!=='production'&&Boolean(env.CAPTAIN_DATA_API_KEY&&env.CAPTAIN_DATA_USER_UID)}
function status(env=process.env){return {provider:'captain-data',configured:enabled(env),mode:'read-only verification',linked:false,automatedExtraction:false}}
async function verify(env=process.env,request=globalThis.fetch){
 if(env.VERCEL_ENV==='production'){const e=new Error('Connettore provider non disponibile in produzione.');e.status=503;throw e}
 if(!env.CAPTAIN_DATA_API_KEY||!env.CAPTAIN_DATA_USER_UID){const e=new Error('Configura CAPTAIN_DATA_API_KEY e CAPTAIN_DATA_USER_UID nel solo ambiente Preview.');e.status=503;throw e}
 if(!/^[a-zA-Z0-9_-]{4,100}$/.test(env.CAPTAIN_DATA_USER_UID)){const e=new Error('Identificativo utente provider non valido.');e.status=400;throw e}
 if(typeof request!=='function')throw Error('HTTP client non disponibile');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await request(base+encodeURIComponent(env.CAPTAIN_DATA_USER_UID),{method:'GET',headers:{'X-API-Key':env.CAPTAIN_DATA_API_KEY,'Accept':'application/json'},signal:controller.signal,redirect:'error'});
  if(!response.ok){const e=new Error(response.status===401||response.status===403?'Chiave API rifiutata dal provider.':'Verifica provider non riuscita (HTTP '+response.status+').');e.status=response.status===401||response.status===403?401:502;throw e}
  let linked=false;
  try{
   const body=await response.json();
   const list=Array.isArray(body?.integrations)?body.integrations:[];
   linked=list.some(x=>typeof x==='string'?x.toLowerCase()==='linkedin':x&&typeof x==='object'&&String(x.platform||x.type||x.name||'').toLowerCase()==='linkedin');
  }catch{/* A successful account verification need not expose integrations. Do not infer connected state. */}
  return {...status(env),linked,connection:'ok'};
 }finally{clearTimeout(timer)}
}
module.exports={status,verify,enabled};
