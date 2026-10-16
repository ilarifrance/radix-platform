'use strict';
// Validate human edits before modifying the saved local contact checkpoint.
// No network, credential access, inferred values, or implicit acceptance.
(function(root){
 const clean=x=>typeof x==='string'?x.normalize('NFKC').trim():'';
 const FIELDS=['jobTitle','companyName','country','companyDomain'];
 const validProfile=x=>{
  let u;try{u=new URL(x)}catch{return false}
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
   ['linkedin.com','www.linkedin.com'].includes(u.hostname.toLowerCase())&&
   /^\/(?:in\/|sales\/lead\/)[^/]+/.test(u.pathname);
 };
 const domain=x=>{const s=clean(x).toLowerCase();return s.length<=253&&/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/.test(s)?s:''};
 function review(record,input){
  if(!record||!input||typeof input!=='object'||Array.isArray(input)||
    !validProfile(record.profileUrl)||clean(input.profileUrl)!==record.profileUrl||
    clean(input.fullName)!==record.fullName)throw Error('Identità del contatto non corrispondente');
  const changes={};let total=0;
  for(const field of FIELDS){
   if(!Object.hasOwn(input,field))continue;
   if(typeof input[field]!=='string'||input[field].length>200)throw Error('Valore non valido: '+field);
   const value=clean(input[field]);if(!value)continue;
   if(value.length>(field==='companyDomain'?253:160)||/[\u0000-\u001f<>]/.test(value))throw Error('Valore non valido: '+field);
   if(field==='companyDomain'&&!domain(value))throw Error('Dominio aziendale non valido');
   const final=field==='companyDomain'?domain(value):value;
   if(clean(record[field])===final)continue;
   if(clean(record[field])&&!input.replaceExisting)throw Error('Sovrascrittura richiede conferma esplicita: '+field);
   changes[field]=final;total++;
  }
  if(!total)throw Error('Nessuna modifica da salvare');
  if(total>FIELDS.length)throw Error('Numero campi non valido');
  return {record:{...record,...changes},audit:{profileUrl:record.profileUrl,fields:Object.keys(changes),method:'manual-visible-review',verified:false,confirmedByUser:true}};
 }
 const api={FIELDS,validProfile,domain,review};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLinkedinContactReview=api;
})(typeof window!=='undefined'?window:globalThis);
