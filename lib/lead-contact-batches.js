'use strict';
(function(root){
 const names=['fullName','firstName','lastName','jobTitle','companyName','companyDomain','profileUrl','companyUrl','email','phone','location','country','industry','companySize','sourceUrl'];
 const str=v=>String(v??'').normalize('NFKC').trim();
 function url(v){if(!v)return '';const x=new URL(v);if(x.protocol!=='https:'||x.username||x.password)throw Error('URL HTTPS richiesto');return x.toString()}
 function person(p,source){if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Contatto non valido');const out={};for(const k of names){out[k]=str(p[k]);if(out[k].length>1000)throw Error('Campo troppo lungo: '+k)}out.fullName||=[out.firstName,out.lastName].filter(Boolean).join(' ');if(!out.fullName)throw Error('Nome obbligatorio');for(const k of ['profileUrl','companyUrl'])out[k]=url(out[k]);out.sourceUrl=url(out.sourceUrl||source);if(!out.sourceUrl)throw Error('Fonte obbligatoria');return out}
 function key(p){if(p.profileUrl)return 'profile:'+p.profileUrl.split('?')[0].replace(/\/$/,'').toLowerCase();if(p.email)return 'email:'+p.email.toLowerCase();return ''}
 function start(sourceUrl){return{version:1,sourceUrl:url(sourceUrl),records:[],batches:[],total:0,duplicates:0}}
 function add(job,input,id){
  if(!job||job.version!==1||!Array.isArray(job.records)||!Array.isArray(job.batches))throw Error('Lavoro non valido');
  if(!Array.isArray(input)||!input.length||input.length>500)throw Error('Lotto richiesto: 1–500 contatti');
  if(job.records.length+input.length>100000)throw Error('Limite massimo superato');
  id=str(id);if(!id||id.length>100)throw Error('ID lotto obbligatorio');
  const batch=input.map(x=>person(x,job.sourceUrl)),sig=JSON.stringify(batch),prev=job.batches.find(x=>x.id===id);
  if(prev){if(prev.signature!==sig)throw Error('Lotto già registrato con contenuto diverso');return{...job,last:{added:0,duplicates:0,repeated:true}}}
  const records=job.records.map(x=>({...x})),idx=new Map();records.forEach((x,i)=>{const k=key(x);if(k)idx.set(k,i)});
  let added=0,duplicates=0;
  for(const p of batch){const k=key(p);if(k&&idx.has(k)){const old=records[idx.get(k)];for(const field of names)if(!old[field]&&p[field])old[field]=p[field];duplicates++}else{records.push(p);if(k)idx.set(k,records.length-1);added++}}
  return{version:1,sourceUrl:job.sourceUrl,records,batches:[...job.batches,{id,signature:sig}],total:job.total+batch.length,duplicates:job.duplicates+duplicates,last:{added,duplicates,repeated:false}};
 }
 const api={names,person,key,start,add};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.RadixContactBatch=api;
})(typeof window!=='undefined'?window:globalThis);
