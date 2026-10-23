/* RADIX qr-lite — a small QR code encoder (ISO/IEC 18004) with no dependencies, for the «Menu e listino» studio and
   anything else that needs a QR without a CDN: byte mode (UTF-8), versions 1-10 (up to 271 bytes at level L, 213 at
   M), error correction L, M, Q or H, Reed-Solomon over GF(256) with the polynomial 0x11D, the 8 masks scored with the
   four penalty rules of the standard (the lowest wins), format and version information with their BCH codes.
   Outputs: the module matrix (true = dark), an SVG (one path, quiet zone of 4 modules, crisp edges) and a 1-bit
   grayscale PNG written here (stored deflate blocks, CRC-32 and Adler-32): same input, same bytes.
   Runs in the browser (window.RadixQr) and in Node for the tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixQr=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Error correction per version 1-10 and level: [EC codewords per block, blocks in group 1, data codewords per block in
// group 1, blocks in group 2, data codewords per block in group 2] (the tables of the standard).
const EC={
 L:[[7,1,19,0,0],[10,1,34,0,0],[15,1,55,0,0],[20,1,80,0,0],[26,1,108,0,0],[18,2,68,0,0],[20,2,78,0,0],[24,2,97,0,0],[30,2,116,0,0],[18,2,68,2,69]],
 M:[[10,1,16,0,0],[16,1,28,0,0],[26,1,44,0,0],[18,2,32,0,0],[24,2,43,0,0],[16,4,27,0,0],[18,4,31,0,0],[22,2,38,2,39],[22,3,36,2,37],[26,4,43,1,44]],
 Q:[[13,1,13,0,0],[22,1,22,0,0],[18,2,17,0,0],[26,2,24,0,0],[18,2,15,2,16],[24,4,19,0,0],[18,2,14,4,15],[22,4,18,2,19],[20,4,16,4,17],[24,6,19,2,20]],
 H:[[17,1,9,0,0],[28,1,16,0,0],[22,2,13,0,0],[16,4,9,0,0],[22,2,11,2,12],[28,4,15,0,0],[26,4,13,1,14],[26,4,14,2,15],[24,4,12,4,13],[28,6,15,2,16]]};
const LEVEL_BITS={L:1,M:0,Q:3,H:2};
const ALIGN=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];
const MAX_VERSION=10;
const sizeOf=v=>17+4*v;
const dataCodewords=(v,l)=>{const e=EC[l][v-1];return e[1]*e[2]+e[3]*e[4]};
const countBits=v=>v<10?8:16;
// The largest number of bytes that fits, per level (version 10).
const capacity=l=>Math.floor((dataCodewords(MAX_VERSION,l)*8-4-countBits(MAX_VERSION))/8);

// ---- GF(256) and Reed-Solomon ----
const EXP=new Uint8Array(512),LOG=new Uint8Array(256);
(()=>{let x=1;for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&256)x^=0x11D}for(let i=255;i<512;i++)EXP[i]=EXP[i-255]})();
const mul=(a,b)=>a&&b?EXP[LOG[a]+LOG[b]]:0;
// The generator polynomial of degree n (coefficients from x^(n-1) down, the leading 1 left out).
function divisor(n){const d=new Uint8Array(n);d[n-1]=1;let r=1;
 for(let i=0;i<n;i++){for(let j=0;j<n;j++){d[j]=mul(d[j],r);if(j+1<n)d[j]^=d[j+1]}r=mul(r,2)}return d}
// The n error correction codewords of `data`.
function rsEncode(data,n){const d=divisor(n),out=new Uint8Array(n);
 for(const b of data){const f=b^out[0];out.copyWithin(0,1);out[n-1]=0;for(let i=0;i<n;i++)out[i]^=mul(d[i],f)}return Array.from(out)}

// ---- data codewords ----
const utf8=s=>Array.from(new TextEncoder().encode(String(s==null?'':s)));
// Byte mode: mode 0100, the byte count, the bytes, terminator, padding to the capacity (0xEC 0x11).
function encodeData(bytes,v,l){const cap=dataCodewords(v,l)*8,bits=[];const put=(val,n)=>{for(let i=n-1;i>=0;i--)bits.push(val>>>i&1)};
 put(4,4);put(bytes.length,countBits(v));for(const b of bytes)put(b,8);
 if(bits.length>cap)throw Error('Testo troppo lungo per il QR.');
 put(0,Math.min(4,cap-bits.length));while(bits.length%8)bits.push(0);
 const out=[];for(let i=0;i<bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=b<<1|bits[i+j];out.push(b)}
 for(let pad=0xEC;out.length<cap/8;pad^=0xEC^0x11)out.push(pad);return out}
// Blocks, their EC codewords, then interleaved: data column by column, then EC column by column.
function interleave(data,v,l){const [ec,b1,d1,b2,d2]=EC[l][v-1],blocks=[];let k=0;
 for(let i=0;i<b1+b2;i++){const len=i<b1?d1:d2,part=data.slice(k,k+len);k+=len;blocks.push({data:part,ec:rsEncode(part,ec)})}
 const out=[],maxD=Math.max(d1,d2);for(let i=0;i<maxD;i++)for(const b of blocks)if(i<b.data.length)out.push(b.data[i]);
 for(let i=0;i<ec;i++)for(const b of blocks)out.push(b.ec[i]);return out}

// ---- BCH codes of the format and version information ----
function formatBits(l,mask){const data=LEVEL_BITS[l]<<3|mask;let r=data;for(let i=0;i<10;i++)r=r<<1^(r>>>9)*0x537;return (data<<10|r)^0x5412}
function versionBits(v){let r=v;for(let i=0;i<12;i++)r=r<<1^(r>>>11)*0x1F25;return v<<12|r}

// ---- the matrix ----
function grid(n,val){return Array.from({length:n},()=>new Array(n).fill(val))}
// Function patterns (finders with separators, timing, alignment, dark module, format and version areas): {m, fn}.
function functionPatterns(v){const n=sizeOf(v),m=grid(n,false),fn=grid(n,false),set=(x,y,d)=>{m[y][x]=!!d;fn[y][x]=true};
 for(let i=0;i<n;i++){set(6,i,i%2===0);set(i,6,i%2===0)}
 for(const [cx,cy] of [[3,3],[n-4,3],[3,n-4]])for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=n||y>=n)continue;const d=Math.max(Math.abs(dx),Math.abs(dy));set(x,y,d!==2&&d!==4)}
 const a=ALIGN[v-1],last=a.length-1;
 for(let i=0;i<a.length;i++)for(let j=0;j<a.length;j++){if(i===0&&j===0||i===0&&j===last||i===last&&j===0)continue;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(a[i]+dx,a[j]+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1)}
 drawFormat(m,fn,0,'M');
 if(v>=7){const b=versionBits(v);for(let i=0;i<18;i++){const bit=b>>>i&1,p=n-11+i%3,q=Math.floor(i/3);set(p,q,bit);set(q,p,bit)}}
 return {m,fn}}
function drawFormat(m,fn,mask,l){const n=m.length,b=formatBits(l,mask),bit=i=>(b>>>i&1)===1,set=(x,y,d)=>{m[y][x]=d;fn[y][x]=true};
 for(let i=0;i<=5;i++)set(8,i,bit(i));set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));for(let i=9;i<15;i++)set(14-i,8,bit(i));
 for(let i=0;i<8;i++)set(n-1-i,8,bit(i));for(let i=8;i<15;i++)set(8,n-15+i,bit(i));set(8,n-8,true)}
// The codewords in the zigzag of two-module columns, right to left, skipping the vertical timing column.
function placeCodewords(m,fn,cw){const n=m.length;let i=0;
 for(let right=n-1;right>=1;right-=2){if(right===6)right=5;
  for(let vert=0;vert<n;vert++)for(let j=0;j<2;j++){const x=right-j,up=((right+1)&2)===0,y=up?n-1-vert:vert;
   if(!fn[y][x]&&i<cw.length*8){m[y][x]=(cw[i>>>3]>>>(7-(i&7))&1)===1;i++}}}}
const MASKS=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,
 (x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
function applyMask(m,fn,k){const f=MASKS[k];for(let y=0;y<m.length;y++)for(let x=0;x<m.length;x++)if(!fn[y][x]&&f(x,y))m[y][x]=!m[y][x]}
// The four penalty rules: runs of 5+, 2×2 blocks, finder-like 1:1:3:1:1 with 4 light modules, dark balance.
function penalty(m){const n=m.length;let p=0;const lines=[];for(let i=0;i<n;i++){lines.push(m[i]);lines.push(m.map(r=>r[i]))}
 for(const L of lines){let run=1;for(let i=1;i<=n;i++){if(i<n&&L[i]===L[i-1])run++;else{if(run>=5)p+=3+run-5;run=1}}
  const s=L.map(b=>b?'1':'0').join('');for(const pat of ['10111010000','00001011101']){let k=s.indexOf(pat);while(k>=0){p+=40;k=s.indexOf(pat,k+1)}}}
 for(let y=0;y<n-1;y++)for(let x=0;x<n-1;x++){const c=m[y][x];if(c===m[y][x+1]&&c===m[y+1][x]&&c===m[y+1][x+1])p+=3}
 let dark=0;for(const r of m)for(const b of r)if(b)dark++;p+=10*Math.floor(Math.abs(dark*100/(n*n)-50)/5);return p}

// The QR of `text`: {version, level, mask, size, modules} (modules[y][x], true = dark). opts: level ('M'), mask (0-7 to
// force one, else the best), minVersion.
function encode(text,{level='M',mask=null,minVersion=1}={}){const l=EC[level]?level:'M',bytes=utf8(text);
 let v=Math.max(1,Math.min(MAX_VERSION,minVersion|0||1));while(v<=MAX_VERSION&&4+countBits(v)+8*bytes.length>dataCodewords(v,l)*8)v++;
 if(v>MAX_VERSION)throw Error('Testo troppo lungo per il QR: al massimo '+capacity(l)+' caratteri semplici.');
 const cw=interleave(encodeData(bytes,v,l),v,l),base=functionPatterns(v);placeCodewords(base.m,base.fn,cw);
 let best=null;for(let k=0;k<8;k++){if(mask!=null&&k!==mask)continue;const m=base.m.map(r=>r.slice());applyMask(m,base.fn,k);drawFormat(m,base.fn.map(r=>r.slice()),k,l);
  const s=penalty(m);if(!best||s<best.score)best={mask:k,score:s,m}}
 return {version:v,level:l,mask:best.mask,size:sizeOf(v),modules:best.m,codewords:cw}}

// ---- outputs ----
const QUIET=4;
// One path of 1 × 1 squares (merged per row), white background, quiet zone; `px` the drawn size.
function toSvg(qr,{px=null,dark='#000000',light='#FFFFFF',title=''}={}){const n=qr.size,t=n+2*QUIET,d=[];
 for(let y=0;y<n;y++){let x=0;while(x<n){if(!qr.modules[y][x]){x++;continue}let w=1;while(x+w<n&&qr.modules[y][x+w])w++;d.push('M'+(x+QUIET)+' '+(y+QUIET)+'h'+w+'v1h-'+w+'z');x+=w}}
 const size=px?' width="'+px+'" height="'+px+'"':'',esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+t+' '+t+'"'+size+' shape-rendering="crispEdges"'+(title?' role="img" aria-label="'+esc(title)+'"':'')+'>'+(title?'<title>'+esc(title)+'</title>':'')+
  '<rect width="'+t+'" height="'+t+'" fill="'+light+'"/><path fill="'+dark+'" d="'+d.join('')+'"/></svg>'}
// Dark squares as [x, y, w, h] in modules from the top-left of the symbol (no quiet zone): for vector drawings (PDF).
function rects(qr){const out=[],n=qr.size;for(let y=0;y<n;y++){let x=0;while(x<n){if(!qr.modules[y][x]){x++;continue}let w=1;while(x+w<n&&qr.modules[y][x+w])w++;out.push([x,y,w,1]);x+=w}}return out}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(b,start=0,end=b.length){let c=0xFFFFFFFF;for(let i=start;i<end;i++)c=CRC[(c^b[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
function adler32(b){let a=1,s=0;for(let i=0;i<b.length;i++){a=(a+b[i])%65521;s=(s+a)%65521}return (s<<16|a)>>>0}
// zlib stream with stored (uncompressed) deflate blocks.
function zlibStored(raw){const blocks=Math.max(1,Math.ceil(raw.length/65535)),out=new Uint8Array(2+raw.length+5*blocks+4);let o=0;out[o++]=0x78;out[o++]=0x01;
 for(let i=0;i<blocks;i++){const s=i*65535,len=Math.min(65535,raw.length-s);out[o++]=i===blocks-1?1:0;out[o++]=len&255;out[o++]=len>>>8;out[o++]=~len&255;out[o++]=(~len>>>8)&255;out.set(raw.subarray(s,s+len),o);o+=len}
 const a=adler32(raw);out[o++]=a>>>24;out[o++]=a>>>16&255;out[o++]=a>>>8&255;out[o++]=a&255;return out}
// A 1-bit grayscale PNG, `scale` pixels per module, quiet zone included.
function toPng(qr,{scale=10}={}){const k=Math.max(1,scale|0),n=qr.size,W=(n+2*QUIET)*k,row=Math.ceil(W/8),raw=new Uint8Array((row+1)*W);
 for(let y=0;y<W;y++){const my=Math.floor(y/k)-QUIET;raw[y*(row+1)]=0;for(let x=0;x<W;x++){const mx=Math.floor(x/k)-QUIET,dark=my>=0&&my<n&&mx>=0&&mx<n&&qr.modules[my][mx];if(!dark)raw[y*(row+1)+1+(x>>>3)]|=0x80>>>(x&7)}}
 const chunks=[],chunk=(type,data)=>{const b=new Uint8Array(12+data.length),len=data.length;b[0]=len>>>24;b[1]=len>>>16&255;b[2]=len>>>8&255;b[3]=len&255;for(let i=0;i<4;i++)b[4+i]=type.charCodeAt(i);b.set(data,8);const c=crc32(b,4,8+len);b[8+len]=c>>>24;b[9+len]=c>>>16&255;b[10+len]=c>>>8&255;b[11+len]=c&255;chunks.push(b)};
 const ihdr=new Uint8Array(13);ihdr[0]=W>>>24;ihdr[1]=W>>>16&255;ihdr[2]=W>>>8&255;ihdr[3]=W&255;ihdr.set(ihdr.subarray(0,4),4);ihdr[8]=1;ihdr[9]=0;
 chunk('IHDR',ihdr);chunk('IDAT',zlibStored(raw));chunk('IEND',new Uint8Array(0));
 const sig=[137,80,78,71,13,10,26,10],total=8+chunks.reduce((a,c)=>a+c.length,0),out=new Uint8Array(total);out.set(sig,0);let o=8;for(const c of chunks){out.set(c,o);o+=c.length}return out}

return Object.freeze({EC,ALIGN,MAX_VERSION,QUIET,sizeOf,dataCodewords,capacity,rsEncode,formatBits,versionBits,functionPatterns,encode,toSvg,toPng,rects,adler32,crc32});
});
