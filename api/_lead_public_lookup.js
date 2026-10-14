'use strict';
// Public Wikidata suggestions only: no arbitrary-URL fetch, LinkedIn session or paid provider.
function fail(msg){const e=new Error(msg);e.status=400;throw e}
const normalized=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
async function getJSON(url,request=globalThis.fetch){
 const control=new AbortController(),timer=setTimeout(()=>control.abort(),5000);
 try{
  const response=await request(url,{signal:control.signal,headers:{'Accept':'application/json','User-Agent':'RADIX-LeadIntelligence/1.0 (public data lookup)'}});
  if(!response.ok)throw Error('Public source returned HTTP '+response.status);
  const contentLength=Number(response.headers.get('content-length')||0);
  if(contentLength>300000)throw Error('Public response exceeds size limit');
  const data=await response.text();
  if(data.length>300000)throw Error('Public response too large');
  return JSON.parse(data);
 }finally{clearTimeout(timer)}
}
async function lookup(input,request=globalThis.fetch){
 if(!input||typeof input.name!=='string'||input.name.length<3||input.name.length>140||/[\x00-\x1f]/.test(input.name))fail('Nome azienda richiesto (3–140 caratteri)');
 if(input.domain!==undefined&&(typeof input.domain!=='string'||input.domain.length>260))fail('Dominio non valido');
 const query=new URL('https://www.wikidata.org/w/api.php');
 query.searchParams.set('action','wbsearchentities');query.searchParams.set('language','it');query.searchParams.set('type','item');query.searchParams.set('search',input.name);query.searchParams.set('limit','5');query.searchParams.set('format','json');
 const matches=(await getJSON(query.toString(),request)).search||[];
 const exact=matches.filter(e=>normalized(e.label)===normalized(input.name));
 if(exact.length!==1)return {suggestions:[],reason:exact.length?'Corrispondenze ambigue su Wikidata.':'Azienda non identificata con certezza su Wikidata.'};
 const id=exact[0].id;if(!/^Q[1-9]\d{0,11}$/.test(id))return{suggestions:[],reason:'Identificativo sorgente non valido.'};
 const item=await getJSON('https://www.wikidata.org/wiki/Special:EntityData/'+id+'.json',request);
 const entity=item.entities?.[id],site=entity?.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
 if(typeof site!=='string')return{suggestions:[],reason:'Nessun sito ufficiale indicato su Wikidata.'};
 let host;try{const u=new URL(site);if(u.protocol!=='https:'&&u.protocol!=='http:')throw Error();host=u.hostname.toLowerCase().replace(/^www\./,'');if(!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(host))throw Error()}catch{return{suggestions:[],reason:'Sito ufficiale con URL non valido.'}}
 if(input.domain&&input.domain.trim()){return {suggestions:[],reason:'Il dominio è già presente. Nessuna sovrascrittura automatica.'}}
 return {suggestions:[{field:'domain',value:host,source:'https://www.wikidata.org/wiki/'+id,method:'Wikidata P856, voce corrispondente per nome',verified:false}],reason:'Possibile sito ufficiale da verificare manualmente.'};
}
module.exports={lookup,getJSON};
