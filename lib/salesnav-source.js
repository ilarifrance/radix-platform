'use strict';
(function(root){
 function validate(value){
  if(typeof value!=='string'||!value.trim()||value.length>8000)throw Error('Inserisci un URL Sales Navigator valido (massimo 8.000 caratteri)');
  let url;
  try{url=new URL(value.trim())}catch{throw Error('URL non valido')}
  if(url.protocol!=='https:'||url.username||url.password)throw Error('Usa un URL HTTPS senza credenziali');
  const host=url.hostname.toLowerCase();
  if(!['linkedin.com','www.linkedin.com'].includes(host))throw Error('La ricerca deve essere su linkedin.com');
  if(!/^\/sales\/(search\/people|lists\/people)(?:\/|$)/.test(url.pathname))throw Error('Incolla la ricerca persone o la lista contatti Sales Navigator, non un profilo');
  if(url.hash)url.hash='';
  return url.toString();
 }
 function quantity(value){
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<1||n>5000)throw Error('Quantità indicativa: da 1 a 5.000 contatti');
  return n;
 }
 const api={validate,quantity};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixSalesnavSource=api;
})(typeof window!=='undefined'?window:globalThis);
