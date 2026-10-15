'use strict';
const url='https://api.captaindata.com/v4/users';
function enabled(env=process.env){return env.VERCEL_ENV!=='production'&&Boolean(env.CAPTAIN_DATA_API_KEY)}
function status(env=process.env){return {provider:'captain-data',configured:enabled(env),mode:'read-only verification',linked:false,automatedExtraction:false}}
async function verify(env=process.env,request=globalThis.fetch){
 if(env.VERCEL_ENV==='production'){const e=new Error('Connettore provider non disponibile in produzione.');e.status=503;throw e}
 if(!env.CAPTAIN_DATA_API_KEY){const e=new Error('Configura CAPTAIN_DATA_API_KEY nel solo ambiente Preview.');e.status=503;throw e}
 if(typeof request!=='function')throw Error('HTTP client non disponibile');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await request(url,{method:'GET',headers:{'X-API-Key':env.CAPTAIN_DATA_API_KEY,'Accept':'application/json'},signal:controller.signal,redirect:'error'});
  if(!response.ok){const e=new Error(response.status===401||response.status===403?'Chiave API rifiutata dal provider.':'Verifica provider non riuscita (HTTP '+response.status+').');e.status=response.status===401||response.status===403?401:502;throw e}
  return {...status(env),connection:'ok'};
 }finally{clearTimeout(timer)}
}
module.exports={status,verify,enabled};
