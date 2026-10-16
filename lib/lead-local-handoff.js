'use strict';
// Offline-only bridge from the loopback LinkedIn agent's checkpoint export to
// RADIX's contact-job backup and prospect ICP formats. No API calls or storage.
(function(root){
 const Batch=root.RadixContactBatch||(typeof require==='function'?require('./lead-contact-batches'):null);
 const Source=root.RadixSalesnavSource||(typeof require==='function'?require('./salesnav-source'):null);
 const clean=value=>typeof value==='string'?value.normalize('NFKC').trim():'';
 const norm=value=>clean(value).toLocaleLowerCase('it').replace(/\s+/g,' ');
 function fail(message){throw Error('Backup agente locale: '+message)}
 function validProfile(value){
  if(!value||value.length>2000)return false;
  let url;try{url=new URL(value)}catch{return false}
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&
    ['linkedin.com','www.linkedin.com'].includes(url.hostname.toLowerCase())&&
    /^\/(?:in\/[^/]+|sales\/lead\/[^/]+)/i.test(url.pathname);
 }
 function parse(raw){
  let input=raw;
  if(typeof input==='string'){if(input.length>11000000)fail('file troppo grande');try{input=JSON.parse(input)}catch{fail('JSON non valido')}}
  if(!input||typeof input!=='object'||Array.isArray(input)||!input.data||typeof input.data!=='object'||Array.isArray(input.data))fail('atteso un checkpoint con data.records');
  if(typeof input.sourceUrl!=='string')fail('URL origine assente');
  let origin;try{origin=Source.validate(input.sourceUrl)}catch{fail('la fonte deve essere una ricerca o lista Sales Navigator autentica')}
  if(input.data.version!==1||!Array.isArray(input.data.records)||!input.data.records.length||input.data.records.length>5000)fail('numero contatti non valido (1–5000)');
  if(input.data.sourceUrl&&input.data.sourceUrl!==origin)fail('fonte interna diversa da quella dichiarata');
  const sanitized=[];
  for(let i=0;i<input.data.records.length;i++){
   const r=input.data.records[i];
   if(!r||typeof r!=='object'||Array.isArray(r))fail('riga '+(i+1)+' non valida');
   if(!validProfile(r.profileUrl))fail('riga '+(i+1)+': URL profilo LinkedIn non valido');
   let contact;try{contact=Batch.person(r,origin)}catch(e){fail('riga '+(i+1)+': '+e.message)}
   if(!contact.sourceUrl.startsWith('https://'))fail('riga '+(i+1)+': fonte non valida');
   sanitized.push(contact);
  }
  let job=Batch.start(origin);
  for(let i=0;i<sanitized.length;i+=200)job=Batch.add(job,sanitized.slice(i,i+200),'local-import-'+Math.floor(i/200));
  delete job.last;
  const evidence=Array.isArray(input.freeEnrichment)?input.freeEnrichment:[];
  const reviewedDomainCount=evidence.filter(x=>x&&x.field==='companyDomain'&&typeof x.confirmedAt==='string'&&typeof x.source==='string'&&!x.supersededAt).length;
  return {job,report:{received:sanitized.length,unique:job.records.length,duplicates:job.duplicates,
   withCompany:job.records.filter(x=>x.companyName).length,withDomain:job.records.filter(x=>x.companyDomain).length,
   missingCompany:job.records.filter(x=>!x.companyName).length,reviewedDomainCount,
   warning:'I domini approvati localmente sono dati di provenienza dichiarata: riverificare l’identità aziendale. Le evidenze dettagliate restano nel file originale.'}};
 }
 function archiveParts(job){
  if(!job||job.version!==1||!Array.isArray(job.records)||!job.records.length||job.records.length>5000)throw Error('Lavoro non valido');
  const bytes=x=>new TextEncoder().encode(JSON.stringify(x)).length;
  if(job.records.length<=4000&&job.batches.length<=100&&bytes(job)<=1500000&&job.batches.every(x=>x.signature.length<=300000))return [job];
  const parts=[];
  for(let offset=0;offset<job.records.length;){
   let count=Math.min(750,job.records.length-offset),piece;
   while(count){const rows=job.records.slice(offset,offset+count);piece={version:1,sourceUrl:job.sourceUrl,records:rows,batches:[],total:rows.length,duplicates:0};if(bytes(piece)<=1500000)break;count=Math.floor(count/2)}
   if(!count)throw Error('Contatto troppo grande per archivio');
   parts.push(piece);offset+=count;
  }
  return parts;
 }
 function toProspects(rows){
  if(!Array.isArray(rows)||rows.length>5000)throw Error('Lista contatti non valida');
  const candidates=new Map();let noCompany=0,identityUncertain=0,conflicts=0;
  for(const r of rows){
   if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Contatto non valido');
   const name=clean(r.companyName),country=clean(r.country),domain=clean(r.companyDomain);
   if(!name){noCompany++;continue}
   // Without country/domain, name is only a review candidate, never a verified ID.
   const identity=domain?'domain:'+norm(domain):'name:'+norm(name)+'|'+norm(country);
   if(!country&&!domain)identityUncertain++;
   const result={name,domain,country,industry:clean(r.industry),companySize:clean(r.companySize),contactRole:clean(r.jobTitle),source:clean(r.sourceUrl).split('?')[0].slice(0,500)};
   const prev=candidates.get(identity);
   if(!prev){candidates.set(identity,{row:result,conflicted:false});continue}
   for(const field of ['name','domain','country','industry','companySize']){
    if(prev.row[field]&&result[field]&&norm(prev.row[field])!==norm(result[field])){prev.conflicted=true;break}
    if(!prev.row[field])prev.row[field]=result[field];
   }
   if(!prev.row.contactRole&&result.contactRole)prev.row.contactRole=result.contactRole;
  }
  const prospects=[];
  for(const item of candidates.values()){
   if(item.conflicted){conflicts++;continue}
   prospects.push(item.row);
  }
  return {prospects,report:{uniqueCompanies:prospects.length,noCompany,identityUncertain,conflicts,
   needsReview:prospects.filter(x=>!x.domain||!x.country).length}};
 }
 const api={parse,toProspects,validProfile,archiveParts};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLeadLocalHandoff=api;
})(typeof window!=='undefined'?window:globalThis);
