'use strict';
// Regenerates icons/icon{16,32,48,128}.png: purple rounded square with a white R.
// Node built-ins only (zlib + crc32): node tools/radix-chrome-extension/scripts/make-icons.js
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const R=['11110','10001','10001','11110','10100','10010','10001'];
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
const crc=buf=>{let c=0xffffffff;for(const b of buf)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0};
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c])}
function icon(size){
 const ss=4,big=size*ss,purple=[109,40,217],px=new Float64Array(size*size*4);
 const radius=big*0.22,glyphH=big*0.56,cell=glyphH/7,glyphW=cell*5,ox=(big-glyphW)/2,oy=(big-glyphH)/2;
 for(let y=0;y<big;y++)for(let x=0;x<big;x++){
  const cx=Math.max(radius-x-0.5,0,x+0.5-(big-radius)),cy=Math.max(radius-y-0.5,0,y+0.5-(big-radius));
  if(cx*cx+cy*cy>radius*radius)continue;
  const gx=Math.floor((x-ox)/cell),gy=Math.floor((y-oy)/cell);
  const white=gx>=0&&gx<5&&gy>=0&&gy<7&&x>=ox&&y>=oy&&R[gy][gx]==='1';
  const color=white?[255,255,255]:purple,i=(Math.floor(y/ss)*size+Math.floor(x/ss))*4;
  px[i]+=color[0];px[i+1]+=color[1];px[i+2]+=color[2];px[i+3]+=255;
 }
 const raw=Buffer.alloc(size*(size*4+1));
 for(let y=0;y<size;y++){raw[y*(size*4+1)]=0;for(let x=0;x<size;x++){const i=(y*size+x)*4,a=px[i+3];const o=y*(size*4+1)+1+x*4;
  raw[o]=a?Math.round(px[i]/(a/255)):0;raw[o+1]=a?Math.round(px[i+1]/(a/255)):0;raw[o+2]=a?Math.round(px[i+2]/(a/255)):0;raw[o+3]=Math.round(a/(ss*ss))}}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const dir=path.join(__dirname,'..','icons');fs.mkdirSync(dir,{recursive:true});
for(const s of [16,32,48,128])fs.writeFileSync(path.join(dir,'icon'+s+'.png'),icon(s));
console.log('Icone generate in',dir);
