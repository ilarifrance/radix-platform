'use strict';
/* RADIX Accounting — Fatture in Cloud (TeamSystem) as a source of e-invoices, through its API v2.
   The company owner generates a token in Fatture in Cloud (Impostazioni > Applicazioni collegate, read-only scopes
   issued_documents.invoices:r, issued_documents.credit_notes:r, received_documents:r): a manual token never expires
   and can be revoked there. RADIX keeps it encrypted (AES-256-GCM with MAILBOX_ENC_KEY, bound to the company) and
   only ever reads: issued e-invoices come as FatturaPA XML from /e_invoice/xml, received ones as the original file
   Fatture in Cloud keeps (XML or signed .p7m). Each file goes through the same import as a dropped file.
   Limits of the API: 300 requests every 5 minutes per company, 1,000 an hour; one sync reads at most MAX_FILES. */
const crypto=require('node:crypto');
const {keyOf}=require('./_mailbox_crypto');
const P7M=require('../lib/accounting/p7m');

// FIC_API_BASE points the client at a stand-in server for local tests, like STRIPE_API_BASE.
const BASE=process.env.FIC_API_BASE||'https://api-v2.fattureincloud.it';
const MAX_FILES=40,PER_PAGE=100,MAX_PAGES=10,MAX_FILE=2500000;
const SCOPES=['issued_documents.invoices:r','issued_documents.credit_notes:r','received_documents:r'];
const VERSION='radix-fic-v1';

class FicError extends Error{constructor(status,message){super(message);this.status=status;}}
class FicKeyError extends FicError{constructor(){super(503,'Collegamento non salvato: manca la chiave di cifratura (MAILBOX_ENC_KEY) nelle variabili d’ambiente del server.');}}

// The token is encrypted with the company id as additional data: a row copied onto another company does not decrypt.
function seal(token,company,env){let key;try{key=keyOf(env);}catch{throw new FicKeyError();}
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(VERSION+':'+company));
 const ct=Buffer.concat([c.update(token,'utf8'),c.final()]);
 return [VERSION,iv.toString('base64'),c.getAuthTag().toString('base64'),ct.toString('base64')].join('.');}
function open(sealed,company,env){let key;try{key=keyOf(env);}catch{throw new FicKeyError();}
 const [v,iv,tag,ct]=String(sealed||'').split('.');
 if(v!==VERSION||!iv||!tag||!ct)throw new FicError(409,'Collegamento a Fatture in Cloud illeggibile: collegalo di nuovo.');
 try{const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64'));d.setAAD(Buffer.from(VERSION+':'+company));d.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([d.update(Buffer.from(ct,'base64')),d.final()]).toString('utf8');}
 catch{throw new FicError(409,'Collegamento a Fatture in Cloud illeggibile (chiave cambiata): collegalo di nuovo.');}}

const cleanToken=t=>{if(typeof t!=='string')throw new FicError(400,'Incolla il token di Fatture in Cloud.');const s=t.trim().replace(/^Bearer\s+/i,'');
 if(!/^[A-Za-z0-9._~+/=-]{20,4000}$/.test(s))throw new FicError(400,'Il token non sembra valido: copialo di nuovo da Fatture in Cloud.');return s;};

// One API call. Errors become Italian messages; the token never appears in them.
async function call(fetchImpl,token,path,{raw}={}){
 let r;try{r=await fetchImpl(BASE+path,{headers:{Authorization:'Bearer '+token,Accept:raw?'*/*':'application/json'}});}
 catch{throw new FicError(502,'Fatture in Cloud non risponde: riprova tra poco.');}
 if(r.status===401)throw new FicError(400,'Fatture in Cloud ha rifiutato il token: è scaduto o è stato revocato. Generane uno nuovo e collegalo di nuovo.');
 if(r.status===403)throw new FicError(400,'Il token non ha i permessi necessari: in Fatture in Cloud abilita la lettura di fatture emesse, note di credito e documenti ricevuti.');
 if(r.status===429)throw new FicError(429,'Fatture in Cloud chiede di rallentare: riprova tra qualche minuto.');
 if(r.status===404)return null;
 if(!r.ok)throw new FicError(502,'Fatture in Cloud ha risposto con un errore ('+r.status+'): riprova tra poco.');
 return raw?Buffer.from(await r.arrayBuffer()):r.json();
}
// A download link of a received document: a temporary signed URL (7 days) on the Fatture in Cloud file host, fetched
// without the token.
async function download(fetchImpl,url){
 if(!(process.env.FIC_API_BASE?/^https?:\/\/[^/\s]+\//i:/^https:\/\/[^/\s]+\//i).test(url||''))return null;
 let r;try{r=await fetchImpl(url);}catch{return null;}
 if(!r.ok)return null;const b=Buffer.from(await r.arrayBuffer());return b.length>MAX_FILE?null:b;
}

async function companies(fetchImpl,token){
 const j=await call(fetchImpl,token,'/user/companies');
 const list=(j&&j.data&&j.data.companies)||[];
 return list.map(c=>({id:c.id,name:c.name,vat:c.vat_number||null,tax_code:c.tax_code||null}));
}

// The FatturaPA text of a file: plain XML, or the content of a CAdES .p7m envelope. null when it is something else (a PDF).
function xmlOf(buf){
 if(!buf||!buf.length)return null;
 const head=buf.subarray(0,400).toString('utf8').replace(/^﻿/,'').trimStart();
 if(head.startsWith('<')){const s=buf.toString('utf8');return /FatturaElettronica/.test(s)?s:null;}
 try{const x=P7M.extract(new Uint8Array(buf)).xml;return /FatturaElettronica/.test(x)?x:null;}catch{return null;}
}

const quote=s=>"'"+String(s).replace(/'/g,"\\'")+"'";
// Lists the e-invoices dated from `from`, newest last, skipping the ids already imported (`seen`, a Set of 'i:ID'/'r:ID').
async function* candidates(fetchImpl,token,fic,from){
 const kinds=[['i','issued_documents','invoice'],['i','issued_documents','credit_note'],['r','received_documents','expense'],['r','received_documents','passive_credit_note']];
 for(const [k,res,type] of kinds){
  for(let page=1;page<=MAX_PAGES;page++){
   const qs=new URLSearchParams({type,page:String(page),per_page:String(PER_PAGE),sort:'date',q:'date >= '+quote(from)});
   const j=await call(fetchImpl,token,'/c/'+fic+'/'+res+'?'+qs);
   const rows=(j&&j.data)||[];
   for(const d of rows)if(d&&d.e_invoice!==false)yield {key:k+':'+d.id,kind:k,id:d.id,type,date:d.date||null,number:d.number!=null?String(d.number)+(d.numeration||''):d.invoice_number||null};
   if(!j||!j.next_page_url||rows.length<PER_PAGE)break;
  }
 }
}

/* Reads up to MAX_FILES new e-invoices. Returns the files to import and what was skipped; `more` says that another
   run would find more. Nothing is written here: the caller imports and records each key. */
async function collect({fetchImpl,token,fic,from,seen}){
 const files=[],skipped=[];let more=false;
 for await(const c of candidates(fetchImpl,token,fic,from)){
  if(seen.has(c.key))continue;
  if(files.length+skipped.length>=MAX_FILES){more=true;break;}
  let buf=null;
  if(c.kind==='i')buf=await call(fetchImpl,token,'/c/'+fic+'/issued_documents/'+c.id+'/e_invoice/xml',{raw:true});
  else{const d=await call(fetchImpl,token,'/c/'+fic+'/received_documents/'+c.id+'?fieldset=detailed');buf=d&&d.data?await download(fetchImpl,d.data.attachment_url):null;}
  const xml=xmlOf(buf);
  if(xml)files.push({key:c.key,kind:c.kind,name:'fic-'+(c.kind==='i'?'emessa':'ricevuta')+'-'+(c.number||c.id),xml});
  else skipped.push({key:c.key,kind:c.kind,number:c.number,date:c.date});
 }
 return {files,skipped,more};
}

module.exports={BASE,SCOPES,MAX_FILES,FicError,seal,open,cleanToken,companies,collect,xmlOf};
