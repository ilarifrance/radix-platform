#!/usr/bin/env node
/* Builds lib/print-glyphs.js: the glyph outlines of a Helvetica-metric sans (regular and bold) for the WinAnsi
   characters 32–255, so the Studio Stampa can write its print PDF with the text converted to vector outlines
   (PDF/X-1a wants every font embedded: outlines need no font at all).
   Source: the Liberation Sans 2.x TrueType files installed with the system package fonts-liberation (SIL Open Font
   License 1.1). The output is a modified version of that Font Software, so it stays under the OFL (see
   lib/print-glyphs.LICENSE.txt) and does NOT use the Reserved Font Names («Liberation», «Arimo»): it is called
   «RADIX Outline Sans». Documents made with it are not covered by the OFL.
   Usage: node tools/print-glyphs/build.js [regular.ttf] [bold.ttf] > lib/print-glyphs.js
   Pure Node, no packages: reads head, hhea, hmtx, cmap (format 4), loca and glyf (simple and composite glyphs). */
'use strict';
const fs=require('fs');
const [REG='/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',BOLD='/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']=process.argv.slice(2);
const CP1252={0x80:0x20AC,0x82:0x201A,0x83:0x0192,0x84:0x201E,0x85:0x2026,0x86:0x2020,0x87:0x2021,0x88:0x02C6,0x89:0x2030,0x8A:0x0160,0x8B:0x2039,0x8C:0x0152,0x8E:0x017D,0x91:0x2018,0x92:0x2019,0x93:0x201C,0x94:0x201D,0x95:0x2022,0x96:0x2013,0x97:0x2014,0x98:0x02DC,0x99:0x2122,0x9A:0x0161,0x9B:0x203A,0x9C:0x0153,0x9E:0x017E,0x9F:0x0178};
function font(file){const b=fs.readFileSync(file),u16=o=>b.readUInt16BE(o),i16=o=>b.readInt16BE(o),u32=o=>b.readUInt32BE(o),T={};
 for(let i=0,n=u16(4);i<n;i++){const r=12+i*16;T[b.toString('latin1',r,r+4)]=u32(r+8)}
 const upm=u16(T.head+18),locFmt=i16(T.head+50),nh=u16(T.hhea+34);
 const adv=g=>u16(T.hmtx+4*Math.min(g,nh-1));
 const loca=g=>locFmt?u32(T.loca+4*g):u16(T.loca+2*g)*2;
 // cmap format 4, platform 3 encoding 1 (Unicode BMP)
 let sub=0;for(let i=0,n=u16(T.cmap+2);i<n;i++){const r=T.cmap+4+i*8;if(u16(r)===3&&u16(r+2)===1)sub=T.cmap+u32(r+4)}
 if(!sub||u16(sub)!==4)throw Error('cmap 3,1 format 4 missing');
 const segX2=u16(sub+6),ends=sub+14,starts=ends+segX2+2,deltas=starts+segX2,ranges=deltas+segX2;
 function gid(cp){for(let s=0;s<segX2/2;s++){const end=u16(ends+2*s);if(cp>end)continue;const st=u16(starts+2*s);if(cp<st)return 0;const d=i16(deltas+2*s),ro=u16(ranges+2*s);
   if(!ro)return (cp+d)&0xFFFF;const g=u16(ranges+2*s+ro+2*(cp-st));return g?(g+d)&0xFFFF:0}return 0}
 // glyph → contours [[{x,y,on}]]; composites (accented letters) resolved with their offsets and scales
 function contours(g){const o=T.glyf+loca(g),e=T.glyf+loca(g+1);if(e<=o)return [];const nc=i16(o);
  if(nc<0){let p=o+10,flags;const out=[];do{flags=u16(p);const cg=u16(p+2);p+=4;let dx,dy;
    if(flags&1){dx=i16(p);dy=i16(p+2);p+=4}else{dx=b.readInt8(p);dy=b.readInt8(p+1);p+=2}
    let a=1,bb=0,c=0,d=1;const f2=q=>i16(q)/16384;
    if(flags&8){a=d=f2(p);p+=2}else if(flags&0x40){a=f2(p);d=f2(p+2);p+=4}else if(flags&0x80){a=f2(p);bb=f2(p+2);c=f2(p+4);d=f2(p+6);p+=8}
    if(!(flags&2))throw Error('point-matched composite not supported');
    for(const ct of contours(cg))out.push(ct.map(q=>({x:a*q.x+c*q.y+dx,y:bb*q.x+d*q.y+dy,on:q.on})))}while(flags&0x20);return out}
  const endPts=[];for(let i=0;i<nc;i++)endPts.push(u16(o+10+2*i));const n=endPts[nc-1]+1;let p=o+10+2*nc;p+=2+u16(p);
  const fl=[];while(fl.length<n){const f=b[p++];fl.push(f);if(f&8){let r=b[p++];while(r--)fl.push(f)}}
  const xs=[],ys=[];let v=0;for(const f of fl){if(f&2){const dv=b[p++];v+=f&16?dv:-dv}else if(!(f&16)){v+=i16(p);p+=2}xs.push(v)}
  v=0;for(const f of fl){if(f&4){const dv=b[p++];v+=f&32?dv:-dv}else if(!(f&32)){v+=i16(p);p+=2}ys.push(v)}
  const out=[];let s=0;for(const e2 of endPts){const c=[];for(let i=s;i<=e2;i++)c.push({x:xs[i],y:ys[i],on:!!(fl[i]&1)});out.push(c);s=e2+1}return out}
 // contours → «M x y L x y Q cx cy x y Z» (font units, y up); implied on-curve midpoints between two off-curve points
 const r=v=>String(Math.round(v*2)/2);
 function path(g){let d='';for(const c of contours(g)){if(!c.length)continue;
   const start=c.findIndex(q=>q.on);let pts;
   if(start<0){const m={x:(c[0].x+c[1%c.length].x)/2,y:(c[0].y+c[1%c.length].y)/2,on:true};pts=[m,...c.slice(1),c[0]]}else pts=[...c.slice(start),...c.slice(0,start)];
   d+='M'+r(pts[0].x)+' '+r(pts[0].y);let ctrl=null;
   for(let i=1;i<=pts.length;i++){const q=pts[i%pts.length];
    if(q.on){d+=ctrl?'Q'+r(ctrl.x)+' '+r(ctrl.y)+' '+r(q.x)+' '+r(q.y):'L'+r(q.x)+' '+r(q.y);ctrl=null}
    else if(ctrl){const mx=(ctrl.x+q.x)/2,my=(ctrl.y+q.y)/2;d+='Q'+r(ctrl.x)+' '+r(ctrl.y)+' '+r(mx)+' '+r(my);ctrl=q}else ctrl=q}
   d+='Z'}
  return d.replace(/ -/g,'-')}
 const glyphs={};for(let code=32;code<=255;code++){const cp=code>=0x80&&code<=0x9F?CP1252[code]:code;if(!cp||code===127)continue;const g=gid(cp);if(!g&&cp!==32)continue;glyphs[code]=[adv(g),path(g)]}
 return {upm,glyphs}}
const reg=font(REG),bold=font(BOLD);
if(reg.upm!==bold.upm)throw Error('different units per em');
const dump=f=>'{'+Object.entries(f.glyphs).map(([c,[a,d]])=>c+':['+a+(d?',"'+d+'"':'')+']').join(',\n')+'}';
process.stdout.write(`/* RADIX Outline Sans: glyph outlines for the WinAnsi characters 32–255 (regular and bold), used by lib/print-studio.js to
   write the print-shop PDF with every text converted to vector outlines (no font to embed, as PDF/X-1a requires).
   Generated by tools/print-glyphs/build.js from Liberation Sans 2.x (metric-compatible with Helvetica/Arial).
   Copyright (c) 2012 Red Hat, Inc. with Reserved Font Name Liberation; digitized data copyright (c) 2010 Google
   Corporation with Reserved Font Arimo, Tinos and Cousine. This file is a Modified Version of that Font Software and is
   licensed under the SIL Open Font License 1.1 (full text in lib/print-glyphs.LICENSE.txt); per the licence it does
   not use the Reserved Font Names. Documents created with it are not subject to the OFL.
   Format: UPM units per em; R and B map a WinAnsi code to [advance width, path], the path in font units with y up:
   M x y · L x y · Q cx cy x y (quadratic) · Z. Do not edit by hand: rebuild with the script. */
(function(root,data){if(typeof module==='object'&&module.exports)module.exports=data;else root.RadixPrintGlyphs=data})(typeof globalThis!=='undefined'?globalThis:this,Object.freeze({
UPM:${reg.upm},
R:${dump(reg)},
B:${dump(bold)}
}));
`);
