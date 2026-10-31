/* RADIX P7M — extracts the XML invoice embedded in a CAdES .p7m (CMS SignedData, attached content) so that
   RadixFatturaPA.parse can read it. The signature is NOT verified: only the signed content is extracted.
   Pure functions (no DOM, no I/O). Input: Uint8Array/ArrayBuffer (DER/BER, or base64 text bytes) or a base64/PEM string. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixP7M=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const MAX=10*1024*1024,MAX_NEST=3,MAX_DEPTH=64;
const MSG={notP7m:'Il file non è un .p7m valido (busta CMS/PKCS#7 firmata non riconosciuta).',trunc:'File .p7m troncato o danneggiato.',
 unsup:'Struttura .p7m non supportata.',detached:'Il file .p7m non contiene il documento firmato (firma separata).',
 noXml:'Il file .p7m non contiene una fattura XML leggibile.',big:'File .p7m troppo grande.',input:'Formato di input non supportato per il file .p7m.'};
const fail=k=>{const e=new Error(MSG[k]);e.code=k;throw e};
// DER content bytes of OIDs 1.2.840.113549.1.7.2 (signedData) and 1.2.840.113549.1.7.1 (data)
const OID_SIGNED=[0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x07,0x02];

// ---- input normalisation ----
function fromBase64(str){
 const s=String(str).replace(/-----(BEGIN|END)[^-]*-----/g,'').replace(/\s+/g,'');
 if(!s||!/^[A-Za-z0-9+/]+={0,2}$/.test(s))fail('notP7m');
 if(s.length*3/4>MAX)fail('big');
 if(typeof Buffer==='function'&&Buffer.from){const b=Buffer.from(s,'base64');return new Uint8Array(b.buffer,b.byteOffset,b.length)}
 if(typeof atob==='function'){let bin;try{bin=atob(s)}catch(e){fail('notP7m')}const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
 fail('input');
}
const latin1=(b,from=0,to=b.length)=>{let s='';for(let i=from;i<to;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,Math.min(i+0x8000,to)));return s};
// Bytes that are base64 text (SDI sometimes delivers the base64 of the DER) rather than binary DER.
const looksBase64=b=>{const n=Math.min(b.length,128);if(!n)return false;for(let i=0;i<n;i++){const c=b[i];if(!(c===9||c===10||c===13||c===32||c===43||c===45||c===47||c===61||(c>=48&&c<=57)||(c>=65&&c<=90)||(c>=97&&c<=122)))return false}return true};
function toBytes(input){
 if(typeof input==='string')return fromBase64(input);
 let b;
 if(input instanceof Uint8Array)b=input;else if(input instanceof ArrayBuffer)b=new Uint8Array(input);
 else if(input&&ArrayBuffer.isView(input))b=new Uint8Array(input.buffer,input.byteOffset,input.byteLength);else fail('input');
 if(b.length>MAX)fail('big');
 if(b.length&&b[0]!==0x30&&looksBase64(b))return fromBase64(latin1(b));
 return b;
}

// ---- minimal BER/DER TLV reader ----
// Node: {cls,cons,tag,start,cend,end,kids?}; content is b[start..cend), next sibling at end.
function tlv(b,p,lim,depth){
 if(depth>MAX_DEPTH)fail('unsup');
 if(p+2>lim)fail('trunc');
 const t0=b[p++],cls=t0>>6,cons=(t0&0x20)!==0;let tag=t0&0x1f;
 if(tag===0x1f){tag=0;let c,n=0;do{if(p>=lim)fail('trunc');c=b[p++];tag=tag*128+(c&0x7f);if(++n>4)fail('unsup')}while(c&0x80)}
 if(p>=lim)fail('trunc');
 let l=b[p++];
 if(l===0x80){ // indefinite length: children until end-of-contents 00 00
  if(!cons)fail('unsup');
  const kids=[];let q=p;
  for(;;){if(q+2>lim)fail('trunc');if(b[q]===0&&b[q+1]===0)break;const k=tlv(b,q,lim,depth+1);kids.push(k);q=k.end}
  return{cls,cons,tag,start:p,cend:q,end:q+2,kids};
 }
 if(l&0x80){const n=l&0x7f;if(n>4)fail('unsup');l=0;for(let i=0;i<n;i++){if(p>=lim)fail('trunc');l=l*256+b[p++]}}
 if(p+l>lim)fail('trunc');
 return{cls,cons,tag,start:p,cend:p+l,end:p+l};
}
function children(b,n,depth){
 if(n.kids)return n.kids;if(!n.cons)fail('unsup');
 const out=[];for(let q=n.start;q<n.cend;){const k=tlv(b,q,n.cend,depth+1);out.push(k);q=k.end}
 return n.kids=out;
}
const is=(n,cls,tag,cons)=>n&&n.cls===cls&&n.tag===tag&&(cons==null||n.cons===cons);
// OCTET STRING value, concatenating the chunks of a constructed (0x24) one recursively.
function octets(b,n,depth){
 if(!is(n,0,4))fail('unsup');
 if(!n.cons)return b.subarray(n.start,n.cend);
 const parts=children(b,n,depth).map(k=>octets(b,k,depth+1));
 const out=new Uint8Array(parts.reduce((s,x)=>s+x.length,0));let o=0;
 for(const x of parts){out.set(x,o);o+=x.length}
 return out;
}
// ContentInfo{signedData, [0] SignedData{version, digestAlgorithms, encapContentInfo{OID, [0] eContent}, ...}} -> eContent bytes
function unwrap(b){
 if(!b.length||b[0]!==0x30)fail('notP7m');
 const top=tlv(b,0,b.length,0);
 if(!is(top,0,16,true))fail('notP7m');
 const ci=children(b,top,0),oid=ci[0];
 if(!is(oid,0,6,false)||oid.cend-oid.start!==OID_SIGNED.length||OID_SIGNED.some((x,i)=>b[oid.start+i]!==x))fail('notP7m');
 if(!is(ci[1],2,0,true))fail('unsup');
 const sd=children(b,ci[1],1)[0];if(!is(sd,0,16,true))fail('unsup');
 const sk=children(b,sd,2);
 if(!is(sk[0],0,2,false)||!is(sk[1],0,17,true)||!is(sk[2],0,16,true))fail('unsup');
 const ek=children(b,sk[2],3);
 if(!is(ek[0],0,6,false))fail('unsup');
 if(!ek[1])fail('detached');
 if(!is(ek[1],2,0,true))fail('unsup');
 return octets(b,children(b,ek[1],4)[0],5);
}

// ---- fallback: raw scan for the XML (only for primitive, unchunked content) ----
function scan(b){
 const s=latin1(b),open=/<(?:[A-Za-z_][\w.-]*:)?FatturaElettronica[\s>/]/.exec(s);
 if(!open)return null;
 const close=/<\/(?:[A-Za-z_][\w.-]*:)?FatturaElettronica\s*>/g;let m,last=null;
 close.lastIndex=open.index;while((m=close.exec(s)))last=m;
 if(!last)return null;
 const decl=s.lastIndexOf('<?xml',open.index),from=decl>=0?decl:open.index,to=last.index+last[0].length;
 // control bytes (other than TAB/LF/CR) are invalid in XML and are what BER chunk headers (0x04 ...) look like
 for(let i=from;i<to;i++){const c=b[i];if(c<0x20&&c!==9&&c!==10&&c!==13)return null}
 return b.subarray(from,to);
}

// ---- text decoding ----
const LATIN=/^(iso[-_]?8859[-_]?1|latin-?1|l1|windows-1252|cp1252|cp819|us-ascii|ascii)$/;
function decode(b){
 if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)b=b.subarray(3);
 const head=latin1(b,0,Math.min(b.length,512)),m=/^\s*<\?xml[^>]*?\sencoding\s*=\s*["']([^"']+)["']/.exec(head);
 let enc=m?m[1].trim().toLowerCase():'utf-8',text;
 if(enc==='utf8')enc='utf-8';
 if(LATIN.test(enc)){
  enc='windows-1252';
  try{text=new TextDecoder('windows-1252').decode(b)}catch(e){text=latin1(b)}
 }else{
  let td;try{td=new TextDecoder(enc)}catch(e){throw new Error(`Codifica XML non supportata nel file .p7m: ${m[1]}`)}
  text=td.decode(b);enc=td.encoding||enc;
 }
 if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);
 if(!/^\s*</.test(text))fail('noXml');
 return{xml:text,encoding:enc,bytes:b.length};
}

function extract(input){
 const b=toBytes(input);
 let content;
 try{content=unwrap(b)}
 catch(e){const raw=scan(b);if(!raw)throw e;return decode(raw)}
 // nested signatures: the content is itself a p7m
 for(let level=1;level<MAX_NEST&&content.length&&content[0]===0x30;level++){
  try{content=unwrap(content)}catch(e){break}
 }
 return decode(content);
}

return{extract};
});
