'use strict';
// Single official Brave Search API request for a company website. The caller must
// separately enforce explicit opt-in, secret storage and request budgets.
require('./lead-domain-suggestions');
const Brave=require('./lead-brave-domain');
const clean=x=>typeof x==='string'?x.normalize('NFKC').trim():'';
async function lookup(companyName,{apiKey,request=globalThis.fetch,timeoutMs=6000}={}){
 const name=clean(companyName),secret=clean(apiKey);
 if(name.length<3||name.length>140||/[\x00-\x1f]/.test(name))throw Error('Nome azienda non valido');
 if(!secret||secret.length>500||/[\x00-\x20]/.test(secret))throw Error('Chiave Brave non configurata');
 if(typeof request!=='function')throw Error('Client HTTP non disponibile');
 const url=new URL('https://api.search.brave.com/res/v1/web/search');
 url.searchParams.set('q',name+' official website');url.searchParams.set('count','5');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(Math.max(timeoutMs,1000),10000));
 try{
  const response=await request(url.toString(),{method:'GET',signal:controller.signal,headers:{'Accept':'application/json','X-Subscription-Token':secret}});
  if(!response||!response.ok)throw Error('Brave Search non disponibile (HTTP '+(response?.status||'rete')+')');
  const advertised=Number(response.headers?.get?.('content-length')||0);
  if(advertised>300000)throw Error('Risposta Brave troppo grande');
  const body=await response.text();if(body.length>300000)throw Error('Risposta Brave troppo grande');
  let parsed;try{parsed=JSON.parse(body)}catch{throw Error('Formato risposta Brave non valido')}
  return {suggestions:Brave.extract(name,parsed),provider:'brave-search',verified:false};
 }finally{clearTimeout(timer)}
}
module.exports={lookup};
