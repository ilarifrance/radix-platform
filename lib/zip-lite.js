/* RADIX zip-lite — a tiny .zip writer with no compression (method 0 «store»), enough to hand over a post in one file:
   PNG and JPG are already compressed, texts are small. Names in UTF-8 (flag bit 11), CRC-32, central directory.
   It also reads zips made elsewhere (the Search Console export): «store» and «deflate» entries, the latter through
   DecompressionStream('deflate-raw') in the browser or zlib in Node (unzipAsync).
   No dependencies: runs in the browser (window.RadixZip) and in Node for the tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixZip=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=TABLE[(c^bytes[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
const utf8=s=>new TextEncoder().encode(String(s));
function toBytes(data){if(data instanceof Uint8Array)return data;if(data instanceof ArrayBuffer)return new Uint8Array(data);if(ArrayBuffer.isView(data))return new Uint8Array(data.buffer,data.byteOffset,data.byteLength);return utf8(data==null?'':data)}
// DOS date and time of the files (local time, as zip tools expect).
function dosTime(d){return {time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date:((Math.max(1980,d.getFullYear())-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()}}
// files: [{name, data}] with data a string, Uint8Array or ArrayBuffer. Returns the .zip bytes (Uint8Array).
function zip(files,{date=new Date()}={}){
 const {time,date:day}=dosTime(date),locals=[],centrals=[],seen=new Set();let offset=0;
 for(const f of files||[]){let name=String(f&&f.name||'').replace(/\\/g,'/').replace(/^\/+/,'');if(!name)throw Error('Nome file mancante');if(seen.has(name))throw Error('Nome file ripetuto: '+name);seen.add(name);
  const n=utf8(name),data=toBytes(f.data),crc=crc32(data),h=new Uint8Array(30+n.length),v=new DataView(h.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint16(8,0,true);v.setUint16(10,time,true);v.setUint16(12,day,true);
  v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);v.setUint16(28,0,true);h.set(n,30);
  const c=new Uint8Array(46+n.length),w=new DataView(c.buffer);
  w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x0800,true);w.setUint16(10,0,true);w.setUint16(12,time,true);w.setUint16(14,day,true);
  w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,n.length,true);w.setUint32(38,0,true);w.setUint32(42,offset,true);c.set(n,46);
  locals.push(h,data);centrals.push(c);offset+=h.length+data.length}
 const size=centrals.reduce((s,c)=>s+c.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);
 e.setUint32(0,0x06054b50,true);e.setUint16(8,centrals.length,true);e.setUint16(10,centrals.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
 const out=new Uint8Array(offset+size+22);let p=0;for(const part of [...locals,...centrals,end]){out.set(part,p);p+=part.length}return out}
// The entries listed in the central directory: name, method (0 store, 8 deflate), sizes and where the data starts.
// The end record is searched backwards, so an archive comment does not hide it.
function entries(bytes){const b=toBytes(bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength),out=[];let p=b.length-22;
 while(p>=0&&p>=b.length-22-65535&&v.getUint32(p,true)!==0x06054b50)p--;
 if(p<0||v.getUint32(p,true)!==0x06054b50)throw Error('Fine dell’archivio non trovata');const count=v.getUint16(p+10,true);let c=v.getUint32(p+16,true);
 for(let i=0;i<count;i++){if(c+46>b.length||v.getUint32(c,true)!==0x02014b50)throw Error('Directory centrale non valida');const flags=v.getUint16(c+8,true),method=v.getUint16(c+10,true),crc=v.getUint32(c+16,true),csize=v.getUint32(c+20,true),size=v.getUint32(c+24,true),nl=v.getUint16(c+28,true),xl=v.getUint16(c+30,true),cl=v.getUint16(c+32,true),off=v.getUint32(c+42,true);
  const name=new TextDecoder().decode(b.subarray(c+46,c+46+nl));if(off+30>b.length||v.getUint32(off,true)!==0x04034b50)throw Error('Intestazione locale non valida: '+name);
  const start=off+30+v.getUint16(off+26,true)+v.getUint16(off+28,true);
  out.push({name,method,crc,size,raw:b.subarray(start,start+csize),utf8:!!(flags&0x0800),dir:/\/$/.test(name)});c+=46+nl+xl+cl}
 return out}
const checked=(e,data)=>{if(data.length!==e.size||crc32(data)!==e.crc)throw Error('CRC errato: '+e.name);return {name:e.name,data,utf8:e.utf8}};
// Reads back a zip written by zip() (store only): used by the tests and to check a bundle before it is offered.
function unzip(bytes){return entries(bytes).filter(e=>!e.dir).map(e=>{if(e.method!==0)throw Error('File compresso nell’archivio: '+e.name);return checked(e,e.raw)})}
// Raw deflate → bytes: the browser's DecompressionStream, or zlib when running in Node.
function nodeZlib(){try{return typeof require==='function'?require('zlib'):null}catch(e){return null}}
async function inflateRaw(data){
 if(typeof DecompressionStream==='function'&&typeof Response==='function'&&typeof Blob==='function'){
  try{return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())}catch(e){if(!nodeZlib())throw Error('Archivio compresso non leggibile: carica i singoli file CSV.')}}
 const z=nodeZlib();if(z)return new Uint8Array(z.inflateRawSync(data));
 throw Error('Questo browser non apre gli archivi compressi: carica i singoli file CSV.')}
// Any zip with «store» or «deflate» entries (folders skipped). opts.inflate replaces the default decompressor.
async function unzipAsync(bytes,{inflate=inflateRaw}={}){const out=[];
 for(const e of entries(bytes)){if(e.dir)continue;if(e.method!==0&&e.method!==8)throw Error('Metodo di compressione non supportato: '+e.name);
  out.push(checked(e,e.method===0?e.raw:await inflate(e.raw)))}
 return out}
return Object.freeze({crc32,zip,unzip,unzipAsync,inflateRaw,entries});
});
