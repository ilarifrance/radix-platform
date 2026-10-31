/* Pacchetto logo e brand book: the agency-level hand-over of the Kit identità (lib/identity-studio.js), built from the
   chosen direction with NO AI call and no cost: everything comes from its sanitized SVG logo, its palette and its fonts.
   - Logo package: the logo is split into symbol (pittogramma) and wordmark (logotipo) from its own shapes and texts;
     the variants are composed from those parts: horizontal (primary), stacked, symbol only, wordmark only, black,
     white (reversed on dark), one brand colour and full colour on dark. Each as a clean SVG (viewBox, no external
     reference, re-sanitized) and, in the browser, PNG at 512, 1024 and 2048 px (transparent), plus favicons
     (16, 32, 48, favicon.ico, 180 apple-touch, 192/512 for the web manifest) and the social avatar (1080 × 1080 with
     the symbol inside the safe circle). Clear space and minimum sizes are computed from the logo's bounding box.
   - Brand book: A4 landscape PDF of 14 pages, laid out here as print-studio items and written by the print-studio PDF
     writer (vector shapes, Helvetica standard fonts). In the browser the brand fonts (Google Fonts already on the page)
     are drawn into transparent high-resolution images for titles, specimens and logo wordmarks; shapes stay vectors.
   - «Scarica il pacchetto»: one zip (logo/svg, logo/png, favicon, social, colori, brand-book.pdf, LEGGIMI.txt); the
     project keeps only the manifest (file list, rules, colours) in profile.identityKit.package, never the binaries.
   Pure part (geometry, variants, rules, colours, layout, PDF, zip list, manifest) runs in Node for the tests;
   packageView() is the browser section shown under the chosen kit. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixBrandPackage=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const req=(g,f)=>root[g]||(typeof require==='function'?require(f):null);
const PS=req('RadixPrintStudio','./print-studio.js'),IS=req('RadixIdentityStudio','./identity-studio.js'),ZIP=req('RadixZip','./zip-lite.js');
const VERSION=1,PNG_SIZES=[512,1024,2048],PT_MM=25.4/72,MIN_TEXT_PT=6,MIN_TEXT_PX=9;
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const num=n=>{const v=Math.round(n*100)/100;return Object.is(v,-0)?'0':String(v)};
const escAttr=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escText=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
const comma=n=>String(n).replace('.',',');

// ---- colours ----
const NAMED={black:'#000000',white:'#FFFFFF',red:'#FF0000',green:'#008000',blue:'#0000FF',gray:'#808080',grey:'#808080',orange:'#FFA500',yellow:'#FFFF00',navy:'#000080',purple:'#800080',teal:'#008080',silver:'#C0C0C0',maroon:'#800000'};
// An SVG paint → '#RRGGBB', {url:id} for a gradient, or null for none.
function paint(v){const s=clean(v).toLowerCase();if(!s||s==='none'||s==='transparent')return null;const u=/^url\(#([\w-]+)\)/.exec(s);if(u)return {url:u[1]};
 if(NAMED[s])return NAMED[s];const r=/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(s);if(r)return '#'+r.slice(1,4).map(x=>Math.max(0,Math.min(255,Math.round(+x))).toString(16).padStart(2,'0')).join('').toUpperCase();
 const h=IS.hex(s);return /^#[0-9A-F]{6}$/.test(h)?h:s==='currentcolor'?'#000000':null}
const rgbOf=h=>[1,3,5].map(i=>parseInt(IS.hex(h).slice(i,i+2),16));
const hexOf=a=>'#'+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('').toUpperCase();
const mix=(a,b,t)=>{const x=rgbOf(a),y=rgbOf(b);return hexOf(x.map((v,i)=>v+(y[i]-v)*t))};
// CMYK by the plain formula (no ICC profile): K = 1 − max(R,G,B), C = (1 − R − K) / (1 − K)… in whole percent.
// Approximate on purpose: the print shop confirms it with its own profile and a colour proof.
function cmyk(h){const [r,g,b]=rgbOf(h).map(v=>v/255),k=1-Math.max(r,g,b);if(k>=.9999)return [0,0,0,100];return [(1-r-k)/(1-k),(1-g-k)/(1-k),(1-b-k)/(1-k),k].map(v=>Math.round(v*100))}
// Every pair of distinct palette colours that reads as text (WCAG 2.x): AA ≥ 4.5, AAA ≥ 7, «AA grande» ≥ 3 (titles only).
// The lighter colour is the background. Sorted by ratio, the best first.
function contrastPairs(pal){const list=(pal||[]).filter((c,i,a)=>a.findIndex(x=>x.hex===c.hex)===i),out=[];
 for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i],b=list[j],ratio=IS.contrast(a.hex,b.hex);if(ratio<3)continue;
  const [bg,fg]=IS.contrast(a.hex,'#000000')>=IS.contrast(b.hex,'#000000')?[a,b]:[b,a];
  out.push({fg:fg.role,bg:bg.role,fgHex:fg.hex,bgHex:bg.hex,fgLabel:fg.label||fg.role,bgLabel:bg.label||bg.role,ratio,level:IS.level(ratio),aa:ratio>=4.5})}
 return out.sort((x,y)=>y.ratio-x.ratio)}
const colourOf=(pal,role)=>((pal||[]).find(c=>c.role===role)||{}).hex;
// The book's own colours: paper, ink, muted ink, accent and hairlines, all readable on paper.
function bookColours(pal){const paper='#FFFFFF',dark=colourOf(pal,'dark')||'#1C1C1E',ink=IS.contrast(dark,paper)>=7?dark:'#1C1C1E';
 let muted=mix(ink,paper,.42);while(IS.contrast(muted,paper)<4.6)muted=mix(muted,ink,.15);
 const accent=[colourOf(pal,'primary'),colourOf(pal,'secondary'),ink].find(h=>h&&IS.contrast(h,paper)>=4.5);
 const cover=[colourOf(pal,'primary'),dark].find(h=>h&&IS.contrast(h,'#FFFFFF')>=4.5)||'#1C1C1E';
 return {paper,ink,muted,accent,hair:mix(ink,paper,.86),soft:colourOf(pal,'light')||'#F5F5F2',cover,onCover:'#FFFFFF',dark,light:colourOf(pal,'light')||'#F7F5F0'}}

// ---- the logo as a tree (print-studio's SVG parser on the sanitized markup) ----
const SHAPE=/^(path|rect|circle|ellipse|line|polyline|polygon)$/,LEAF=/^(path|rect|circle|ellipse|line|polyline|polygon|text)$/,NOPAINT=/^(defs|title|desc|lineargradient|radialgradient|clippath|stop|metadata)$/;
const CAMEL={viewbox:'viewBox',gradientunits:'gradientUnits',gradienttransform:'gradientTransform',preserveaspectratio:'preserveAspectRatio'},TAGS={lineargradient:'linearGradient',radialgradient:'radialGradient',clippath:'clipPath'};
const INHERIT=['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','fill-rule','fill-opacity','stroke-opacity','opacity','font-family','font-size','font-weight','font-style','letter-spacing','text-anchor','dominant-baseline'];
function tree(svg){const s=IS.sanitizeSvg(svg);return s?PS.parseSvg(s):null}
function serialize(n){if(n.tag==='#text')return escText(n.text);const t=TAGS[n.tag]||n.tag;
 return '<'+t+Object.entries(n.attrs).map(([k,v])=>' '+(CAMEL[k]||k)+'="'+escAttr(v)+'"').join('')+(n.children.length?'>'+n.children.map(serialize).join('')+'</'+t+'>':'/>')}
const clone=n=>n.tag==='#text'?{tag:'#text',text:n.text}:{tag:n.tag,attrs:{...n.attrs},children:n.children.map(clone)};
const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const at=(M,x,y)=>[M[0]*x+M[2]*y+M[4],M[1]*x+M[3]*y+M[5]];
const nums=s=>(String(s||'').match(/-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi)||[]).map(Number);
const len=v=>{const x=parseFloat(v);return isFinite(x)?x:0};
const textOf=n=>clean((function all(x){return x.tag==='#text'?x.text:(x.children||[]).map(all).join('')})(n));
const isBold=w=>/bold|[6-9]00/.test(String(w||''));
// Default measure: Helvetica widths (print-studio). The browser passes the canvas measure of the real web font.
const helvetica=(s,{size,bold,spacing})=>PS.textWidth(s,size,bold)+(spacing||0)*Math.max(0,Array.from(s).length-1);
function shapePoints(n){const a=n.attrs,p=[];
 if(n.tag==='rect'){const x=len(a.x),y=len(a.y),w=len(a.width),h=len(a.height);if(w>0&&h>0)p.push([x,y],[x+w,y],[x,y+h],[x+w,y+h])}
 else if(n.tag==='circle'||n.tag==='ellipse'){const rx=n.tag==='circle'?len(a.r):len(a.rx),ry=n.tag==='circle'?len(a.r):len(a.ry),cx=len(a.cx),cy=len(a.cy);if(rx>0&&ry>0)for(let i=0;i<32;i++){const t=i/32*2*Math.PI;p.push([cx+rx*Math.cos(t),cy+ry*Math.sin(t)])}}
 else if(n.tag==='line')p.push([len(a.x1),len(a.y1)],[len(a.x2),len(a.y2)]);
 else if(n.tag==='polyline'||n.tag==='polygon'){const v=nums(a.points);for(let i=0;i+1<v.length;i+=2)p.push([v[i],v[i+1]])}
 else if(n.tag==='path'){let cur=[0,0];for(const op of PS.pathOps(a.d)){const t=op.split(' '),k=t.pop(),v=t.map(Number);
  if(k==='m'||k==='l'){cur=[v[0],v[1]];p.push(cur)}else if(k==='c'){const [x0,y0]=cur;for(let i=1;i<=12;i++){const s=i/12,u=1-s;p.push([u*u*u*x0+3*u*u*s*v[0]+3*u*s*s*v[2]+s*s*s*v[4],u*u*u*y0+3*u*u*s*v[1]+3*u*s*s*v[3]+s*s*s*v[5]])}cur=[v[4],v[5]]}}}
 return p}
// The painted elements in document order with their box in root units: [{node, kind:'shape'|'text', box:{x0,y0,x1,y1}, order, fill, size}].
function leaves(rootNode,{measure=helvetica}={}){const out=[];if(!rootNode)return out;
 (function walk(n,M,st){if(n.tag==='#text'||NOPAINT.test(n.tag))return;const s={...st};for(const k of INHERIT)if(n.attrs[k]!=null&&n.attrs[k]!=='inherit')s[k]=n.attrs[k];
  const T=n.attrs.transform&&n.tag!=='svg'?mul(M,PS.transform(n.attrs.transform)):M,scale=Math.sqrt(Math.abs(T[0]*T[3]-T[1]*T[2]))||1;
  if(!LEAF.test(n.tag)){n.children.forEach(c=>walk(c,T,s));return}
  let pts=[],size=0;
  if(n.tag==='text'){const str=textOf(n);if(!str)return;size=len(s['font-size'])||16;const bold=isBold(s['font-weight']),sp=len(s['letter-spacing']);
   let x=(nums(n.attrs.x)[0]||0)+(nums(n.attrs.dx)[0]||0),y=(nums(n.attrs.y)[0]||0)+(nums(n.attrs.dy)[0]||0);const w=measure(str,{size,bold,spacing:sp,family:s['font-family']||'',style:s['font-style']||''});
   if(s['text-anchor']==='middle')x-=w/2;else if(s['text-anchor']==='end')x-=w;
   const db=s['dominant-baseline']||'';if(/middle|central/.test(db))y+=size*.35;else if(/hanging|text-before-edge/.test(db))y+=size*.718;
   const top=/[A-Z0-9bdfhklt'"!?ÀÈÉÌÒÙ]/.test(str)?.72:.53,bot=/[gjpqyQ,;]/.test(str)?.21:.015;pts=[[x,y-top*size],[x+w,y-top*size],[x,y+bot*size],[x+w,y+bot*size]]}
  else pts=shapePoints(n);
  if(!pts.length)return;const q=pts.map(([x,y])=>at(T,x,y)),fill=paint(s.fill==null?'#000000':s.fill),stroke=paint(s.stroke),sw=stroke?(s['stroke-width']==null?1:len(s['stroke-width'])):0;
  if(n.tag!=='text'&&!fill&&!(stroke&&sw>0))return;const e=n.tag==='line'||!fill?Math.max(sw,0)/2*scale:sw/2*scale;
  out.push({node:n,kind:n.tag==='text'?'text':'shape',order:out.length,fill,stroke,size:size*scale,
   box:{x0:Math.min(...q.map(p=>p[0]))-e,y0:Math.min(...q.map(p=>p[1]))-e,x1:Math.max(...q.map(p=>p[0]))+e,y1:Math.max(...q.map(p=>p[1]))+e}})})(rootNode,[1,0,0,1,0,0],{});
 return out}
const union=boxes=>boxes.length?{x0:Math.min(...boxes.map(b=>b.x0)),y0:Math.min(...boxes.map(b=>b.y0)),x1:Math.max(...boxes.map(b=>b.x1)),y1:Math.max(...boxes.map(b=>b.y1))}:null;
const overlap=(a,b)=>{const w=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0),h=Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0);return w>0&&h>0?w*h:0};
const area=b=>Math.max(1e-9,(b.x1-b.x0)*(b.y1-b.y0));
const dims=b=>({x:b.x0,y:b.y0,w:b.x1-b.x0,h:b.y1-b.y0});
// Symbol or wordmark: a text painted over an earlier shape belongs to the symbol (a monogram); a thin shape under or over a
// free text (an underline) belongs to the wordmark; every other shape is the symbol.
function classify(lv){const shapes=lv.filter(l=>l.kind==='shape'),texts=lv.filter(l=>l.kind==='text');
 texts.forEach(t=>{t.part=shapes.some(s=>s.order<t.order&&s.fill&&overlap(s.box,t.box)>.3*area(t.box))?'symbol':'word'});
 const words=texts.filter(t=>t.part==='word');
 shapes.forEach(s=>{const b=s.box,h=b.y1-b.y0;s.part=words.some(t=>{const tb=t.box,th=tb.y1-tb.y0,cover=Math.max(0,Math.min(b.x1,tb.x1)-Math.max(b.x0,tb.x0))/Math.max(1e-9,b.x1-b.x0);
  return cover>=.8&&h<=th*.6&&b.y0>=tb.y0-th*.6&&b.y1<=tb.y1+th*.6})?'word':'symbol'});return lv}
// A copy of the tree with only the leaves in `keep` (containers and defs kept, empty groups dropped).
function filterTree(n,keep){if(n.tag==='#text')return clone(n);if(LEAF.test(n.tag))return keep.has(n)?clone(n):null;if(NOPAINT.test(n.tag))return clone(n);
 const children=n.children.map(c=>filterTree(c,keep)).filter(Boolean);if(n.tag==='g'&&!children.some(c=>c.tag!=='#text'))return null;return {tag:n.tag,attrs:{...n.attrs},children}}
const ROOT_SKIP=/^(xmlns|viewbox|width|height|preserveaspectratio|role|aria-label|id|x|y)$/;
// One part placed in a composition: its box moved to (dx, dy) and scaled by s, with the root's inherited attributes.
function placed(part,s,dx,dy){const r=part.tree,attrs=Object.entries(r.attrs).filter(([k])=>!ROOT_SKIP.test(k)).map(([k,v])=>' '+(CAMEL[k]||k)+'="'+escAttr(v)+'"').join('');
 return '<g transform="translate('+num(dx)+' '+num(dy)+') scale('+num(s)+') translate('+num(-part.box.x0)+' '+num(-part.box.y0)+')"'+attrs+'>'+r.children.map(serialize).join('')+'</g>'}
function svgDoc(w,h,inner,pad){const p=pad||0;return IS.sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[-p,-p,w+2*p,h+2*p].map(num).join(' ')+'" width="'+num(w+2*p)+'" height="'+num(h+2*p)+'">'+inner+'</svg>')}
const fontStack=f=>"'"+f+"', "+(/serif|garamond|baskerville|lora|merriweather|fraunces|playfair|cormorant/i.test(f)&&!/sans/i.test(f)?'serif':'sans-serif');
// Generated parts when the logo has none: initials in a circle (symbol), the name in the heading font (wordmark).
function initials(name){const w=clean(name).replace(/[^\p{L}\p{N} ]/gu,'').split(' ').filter(Boolean);return ((w[0]||'B')[0]+(w.length>1?w[1][0]:'')).toUpperCase()}
function monogram(name,pal,font){const p=colourOf(pal,'primary')||'#2F3A45',ink=IS.onColour(pal,p).text;
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="'+p+'"/><text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-family="'+escAttr(fontStack(font||'Inter'))+'" font-size="42" font-weight="700" fill="'+ink+'">'+escText(initials(name))+'</text></svg>'}
function wordSvg(name,pal,font){const d=colourOf(pal,'dark')||'#1C1C1E';
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 60"><text x="0" y="44" font-family="'+escAttr(fontStack(font||'Inter'))+'" font-size="40" font-weight="700" fill="'+d+'">'+escText(clean(name).slice(0,40)||'Brand')+'</text></svg>'}
function partOf(svg,opts,filter){const t=tree(svg);const lv=leaves(t,opts);const keep=new Set(lv.filter(filter||(()=>true)).map(l=>l.node));if(!keep.size)return null;
 const ft=filterTree(t,keep),box=union(lv.filter(l=>keep.has(l.node)).map(l=>l.box));return {tree:ft,box,min:Math.min(...lv.filter(l=>keep.has(l.node)&&l.kind==='text').map(l=>l.size),Infinity)}}
// The logo → {symbol, word, orientation, generated:{symbol,word}}; parts are {tree, box (root units), min (smallest text size)}.
function split(logo,{name,palette:pal,font,measure}={}){const t=tree(logo),opts={measure},lv=classify(leaves(t,opts));
 const sym=lv.filter(l=>l.part==='symbol').map(l=>l.node),wd=lv.filter(l=>l.part==='word').map(l=>l.node),pick=set=>{if(!set.length)return null;const keep=new Set(set);
  return {tree:filterTree(t,keep),box:union(lv.filter(l=>keep.has(l.node)).map(l=>l.box)),min:Math.min(...lv.filter(l=>keep.has(l.node)&&l.kind==='text').map(l=>l.size),Infinity)}};
 let symbol=pick(sym),word=pick(wd);const generated={symbol:!symbol,word:!word};
 if(!symbol)symbol=partOf(monogram(name,pal,font),opts);if(!word)word=partOf(wordSvg(name,pal,font),opts);
 let orientation='other';if(!generated.symbol&&!generated.word){const s=dims(symbol.box),w=dims(word.box);
  if(w.x>=s.x+s.w*.6&&w.y<s.y+s.h&&w.y+w.h>s.y)orientation='horizontal';else if(w.y>=s.y+s.h*.9)orientation='stacked'}
 return {symbol,word,orientation,generated,all:t&&!generated.symbol&&!generated.word?{tree:t,box:union(lv.map(l=>l.box)),min:Math.min(...lv.filter(l=>l.kind==='text').map(l=>l.size),Infinity)}:null}}

// ---- the variants ----
// Monochrome by layers: every element takes `base`, except one painted over an earlier filled element, which takes the
// opposite of that element's colour (a knockout: the white letters of a monogram, the dot on a triangle).
function mono(svg,base,knock,opts){const t=tree(svg);if(!t)return '';const lv=leaves(t,opts),given=new Map();
 for(const l of lv){const under=lv.filter(u=>u.order<l.order&&u.fill&&overlap(u.box,l.box)>.5*area(l.box)).pop();const c=under?(given.get(under.node)===base?knock:base):base;given.set(l.node,c);
  const a=l.node.attrs;a.fill=l.fill||l.kind==='text'?c:'none';if(l.stroke)a.stroke=c;
  for(const k of ['fill-opacity','stroke-opacity','opacity'])delete a[k]}
 (function strip(n){if(n.tag==='#text')return;n.children=n.children.filter(c=>!/^(lineargradient|radialgradient)$/.test(c.tag));n.children.forEach(strip)})(t);
 return IS.sanitizeSvg(serialize(t))}
const VARIANTS=[
 ['orizzontale','Orizzontale (principale)','Il logo da usare quando c’è spazio: siti, documenti, insegne.'],
 ['verticale','Verticale','Simbolo sopra il nome: spazi stretti e alti, social, gadget.'],
 ['simbolo','Solo simbolo (pittogramma)','Favicon, avatar social, timbri e spazi piccoli.'],
 ['logotipo','Solo logotipo','Il nome da solo, quando il simbolo è già presente accanto.'],
 ['nero','Nero','Stampa in bianco e nero, fax, timbri, incisioni.'],
 ['bianco','Bianco (negativo)','Su fondi scuri o su foto scure.'],
 ['monocolore','Un colore','Stampa a un colore: serigrafia, ricami, gadget.'],
 ['negativo','A colori su fondo scuro','La versione a colori quando il fondo è scuro.']];
// Each variant: {id,label,use,svg,w,h,bg,dark,min:{mm,px},clear}; layout of the parts in the units of the wordmark.
function variants(k,brand,{measure}={}){const pal=k.palette,font=(k.fonts&&k.fonts[0]||{}).heading,p=split(k.logo,{name:brand,palette:pal,font,measure}),opts={measure};
 const {symbol:S,word:W}=p,sd=dims(S.box),wd=dims(W.box),wh=wd.h;
 // horizontal: the original when it already is (symbol left, name right), else symbol 1.9× the wordmark height, gap 0.6×
 let horiz;if(p.orientation==='horizontal'&&p.all){const b=dims(p.all.box);horiz={svg:svgDoc(b.w,b.h,placed(p.all,1,0,0),b.h*.03),word:wh,min:p.all.min}}
 else{const s=1.9*wh/sd.h,sw=sd.w*s,sh=sd.h*s,g=.6*wh,H=Math.max(sh,wh);horiz={svg:svgDoc(sw+g+wd.w,H,placed(S,s,0,(H-sh)/2)+placed(W,1,sw+g,(H-wh)/2),H*.03),word:wh,min:Math.min(S.min*s,W.min)}}
 let stack;if(p.orientation==='stacked'&&p.all){const b=dims(p.all.box);stack={svg:svgDoc(b.w,b.h,placed(p.all,1,0,0),b.h*.03),word:wh,min:p.all.min}}
 else{const s=2.4*wh/sd.h,sw=sd.w*s,sh=sd.h*s,g=.55*wh,Wd=Math.max(sw,wd.w);stack={svg:svgDoc(Wd,sh+g+wh,placed(S,s,(Wd-sw)/2,0)+placed(W,1,(Wd-wd.w)/2,sh+g),(sh+g+wh)*.03),word:wh,min:Math.min(S.min*s,W.min)}}
 const sym={svg:svgDoc(sd.w,sd.h,placed(S,1,0,0),Math.max(sd.w,sd.h)*.03),word:0,min:S.min,sym:sd.h};
 const word={svg:svgDoc(wd.w,wh,placed(W,1,0,0),wh*.06),word:wh,min:W.min};
 const light=colourOf(pal,'light')||'#F7F5F0',dark=colourOf(pal,'dark')||'#1C1C1E',prim=colourOf(pal,'primary')||dark;
 const one=IS.contrast(prim,'#FFFFFF')>=3?prim:dark;
 const src={orizzontale:horiz,verticale:stack,simbolo:sym,logotipo:word,nero:{...horiz,svg:mono(horiz.svg,'#000000','#FFFFFF',opts)},bianco:{...horiz,svg:mono(horiz.svg,'#FFFFFF',dark,opts)},
  monocolore:{...horiz,svg:mono(horiz.svg,one,'#FFFFFF',opts)},negativo:{...horiz,svg:IS.sanitizeSvg(IS.negativeLogo(horiz.svg,pal))}};
 const BASE={orizzontale:[25,100],verticale:[18,72],simbolo:[6,16],logotipo:[20,80]};
 return {parts:p,list:VARIANTS.map(([id,label,use])=>{const v=src[id],vb=PS.viewBox(v.svg),w=vb[2],h=vb[3],layout=id==='verticale'?'verticale':id==='simbolo'?'simbolo':id==='logotipo'?'logotipo':'orizzontale';
  const dk=id==='bianco'||id==='negativo';return {id,label,use,svg:v.svg,w,h,bg:dk?dark:light,dark:dk,clear:clearSpace({w,h,word:v.word,sym:v.sym}),min:minSize({w,minText:v.min},BASE[layout])}})}}
// Clear space X: half the wordmark height (about its cap height); a quarter of the symbol when there is no wordmark.
function clearSpace({w,h,word,sym}){const x=word>0?word/2:(sym||Math.min(w,h))/4;return {x,ratio:x/h,box:{x:-x,y:-x,w:w+2*x,h:h+2*x}}}
// Minimum width: the base for the layout, raised so the smallest text of the logo stays ≥ 6 pt in print and ≥ 9 px on screen.
function minSize({w,minText},[mm,px]){let m=mm,p=px;if(isFinite(minText)&&minText>0){m=Math.max(m,Math.ceil(MIN_TEXT_PT*PT_MM*w/minText));p=Math.max(p,Math.ceil(MIN_TEXT_PX*w/minText/4)*4)}return {mm:m,px:p}}

// ---- icons, favicons and the social avatar (square SVGs; PNGs are drawn in the browser) ----
// The SVG `svg` fitted (contain, centred) in a W × H box at (x, y), as a group: the root's inherited attributes kept.
function fitted(svg,x,y,w,h,o={}){const t=tree(svg);if(!t)return '';const vb=PS.viewBox(serialize(t))||[0,0,1,1],s=Math.min(w/vb[2],h/vb[3]);
 return placed({tree:t,box:{x0:vb[0],y0:vb[1]}},s,x+(w-vb[2]*s)/2,y+(o.top?0:(h-vb[3]*s)/2))}
function iconSvg(symbol,{size=512,pad=.08,bg=null}={}){const p=size*pad;return svgDoc(size,size,(bg?'<rect width="'+size+'" height="'+size+'" fill="'+bg+'"/>':'')+fitted(symbol,p,p,size-2*p,size-2*p))}
// 1080 × 1080, the symbol inside the circle the networks crop to, with room around it (its half-diagonal ≤ 31 % of the side).
function avatarSvg(symbol,bg){const vb=PS.viewBox(symbol)||[0,0,1,1],s=Math.min(2*.31*1080/Math.hypot(vb[2],vb[3]),.6*1080/vb[2],.6*1080/vb[3]),w=vb[2]*s,h=vb[3]*s;
 return svgDoc(1080,1080,'<rect width="1080" height="1080" fill="'+bg+'"/>'+fitted(symbol,(1080-w)/2,(1080-h)/2,w,h))}
const FAVICONS=[['favicon/favicon-16.png',16,0,false],['favicon/favicon-32.png',32,.03,false],['favicon/favicon-48.png',48,.04,false],['favicon/apple-touch-icon.png',180,.14,true],['favicon/android-chrome-192.png',192,.12,true],['favicon/android-chrome-512.png',512,.12,true]];
// favicon.ico with PNG entries (Vista+ format): header, one 16-byte directory entry per image, then the PNGs.
function ico(pngs){const head=6+16*pngs.length,total=head+pngs.reduce((a,p)=>a+p.data.length,0),out=new Uint8Array(total),v=new DataView(out.buffer);
 v.setUint16(0,0,true);v.setUint16(2,1,true);v.setUint16(4,pngs.length,true);let off=head;
 pngs.forEach((p,i)=>{const e=6+16*i;out[e]=p.size>=256?0:p.size;out[e+1]=p.size>=256?0:p.size;v.setUint16(e+4,1,true);v.setUint16(e+6,32,true);v.setUint32(e+8,p.data.length,true);v.setUint32(e+12,off,true);out.set(p.data,off);off+=p.data.length});
 return out}
function webManifest(brand,pal){return JSON.stringify({name:clean(brand),short_name:clean(brand).slice(0,12),icons:[{src:'android-chrome-192.png',sizes:'192x192',type:'image/png'},{src:'android-chrome-512.png',sizes:'512x512',type:'image/png'}],
 theme_color:colourOf(pal,'primary')||'#1C1C1E',background_color:colourOf(pal,'light')||'#FFFFFF',display:'standalone'},null,2)+'\n'}

// ---- the package ----
const SCALE=[['Titolo display',5],['Titolo 1',4],['Titolo 2',3],['Titolo 3',2],['Sottotitolo',1],['Testo',0],['Didascalia',-1]];
// Type scale: ratio 1.25 (terza maggiore) from 16 px on screen and 10 pt in print.
function typeScale(f){const r=1.25;return SCALE.map(([name,step])=>({name,font:step>=1?f.heading:f.body,weight:step>=2?700:400,px:Math.round(16*Math.pow(r,step)),pt:Math.round(10*Math.pow(r,step)*10)/10,lead:step>=2?1.15:1.5}))}
function colours(pal){return (pal||[]).map(c=>({role:c.role,label:c.label,name:c.name,hex:c.hex,rgb:rgbOf(c.hex),cmyk:cmyk(c.hex)}))}
const svgClean=svg=>!!svg&&IS.sanitizeSvg(svg)===svg&&!/href|url\((?!#)|<script|<style|<image|\son\w+=/i.test(svg)&&/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="/.test(svg);
// Everything the files and the brand book need, from the chosen direction. measure: the browser's real text widths.
function build(k,brand,{measure,date}={}){const name=clean(brand)||'Brand',v=variants(k,name,{measure}),pal=k.palette,base=slug(name)||'brand',f=(k.fonts&&k.fonts[0])||{heading:'Inter',body:'Inter'};
 const sym=v.list.find(x=>x.id==='simbolo'),light=colourOf(pal,'light')||'#FFFFFF',C=bookColours(pal);
 const avatars=[{id:'chiaro',label:'Avatar su fondo chiaro',bg:light,svg:avatarSvg(sym.svg,light)},{id:'colore',label:'Avatar a colori',bg:C.cover,svg:avatarSvg(mono(sym.svg,'#FFFFFF',C.cover,{measure}),C.cover)}];
 const favicons=FAVICONS.map(([path,size,pad,bg])=>({path,size,svg:iconSvg(sym.svg,{size,pad,bg:bg?light:null})}));
 const symPx=sym.min.px,checks=[];
 checks.push(isFinite(v.parts.symbol.min)&&v.parts.symbol.min/Math.max(sym.w,sym.h)*16<6?{ok:false,text:'A 16 px le lettere del simbolo sono troppo piccole per leggersi: nella favicon conta la forma, valuta un simbolo senza testo.'}:{ok:true,text:'Simbolo leggibile come favicon a 16 px.'});
 checks.push(v.list.every(x=>svgClean(x.svg))?{ok:true,text:'SVG puliti: nessuno script, nessun link o file esterno, viewBox presente.'}:{ok:false,text:'Un SVG non ha superato il controllo di pulizia.'});
 checks.push({ok:true,text:'Versione a un colore, in nero e in bianco presenti.'});
 if(v.parts.generated.symbol)checks.push({ok:false,text:'Il logo non ha un simbolo: ho creato un monogramma con le iniziali. Fallo rifinire da un grafico.'});
 if(v.parts.generated.word)checks.push({ok:false,text:'Il logo non ha il nome scritto: ho creato il logotipo con il font dei titoli. Fallo rifinire da un grafico.'});
 const pairs=contrastPairs(pal);if(!pairs.some(p=>p.aa))checks.push({ok:false,text:'Nessuna coppia della palette raggiunge AA (4,5:1) per il testo.'});
 return {version:VERSION,brand:name,base,direction:k.name,date:date||new Date().toISOString().slice(0,10),kit:k,fonts:f,variants:v.list,parts:{generated:v.parts.generated,orientation:v.parts.orientation},
  avatars,favicons,colours:colours(pal),pairs,scale:typeScale(f),checks,symbolMinPx:symPx}}
const PATHS={svg:(p,v)=>'logo/svg/'+p.base+'-'+v.id+'.svg',png:(p,v,s)=>'logo/png/'+p.base+'-'+v.id+'-'+s+'.png',avatar:(p,a)=>'social/'+p.base+'-avatar-1080-'+a.id};
// The files of the zip, in order. Binary ones ('png','ico','pdf') are filled by the browser; the rest has its data here.
function plan(p){const out=[];
 for(const v of p.variants)out.push({path:PATHS.svg(p,v),kind:'svg',data:v.svg});
 for(const v of p.variants)for(const s of PNG_SIZES){const sc=s/Math.max(v.w,v.h);out.push({path:PATHS.png(p,v,s),kind:'png',svg:v.svg,w:Math.max(1,Math.round(v.w*sc)),h:Math.max(1,Math.round(v.h*sc))})}
 out.push({path:'favicon/favicon.svg',kind:'svg',data:p.variants.find(v=>v.id==='simbolo').svg});
 for(const f of p.favicons)out.push({path:f.path,kind:'png',svg:f.svg,w:f.size,h:f.size});
 out.push({path:'favicon/favicon.ico',kind:'ico',sizes:[16,32,48]},{path:'favicon/site.webmanifest',kind:'text',data:webManifest(p.brand,p.kit.palette)});
 for(const a of p.avatars)out.push({path:PATHS.avatar(p,a)+'.svg',kind:'svg',data:a.svg},{path:PATHS.avatar(p,a)+'.png',kind:'png',svg:a.svg,w:1080,h:1080});
 out.push({path:'colori/palette.css',kind:'text',data:IS.paletteCss(p.kit,p.brand)},{path:'colori/palette.json',kind:'text',data:paletteJson(p)});
 out.push({path:'brand-book.pdf',kind:'pdf'},{path:'LEGGIMI.txt',kind:'text',data:readme(p)});return out}
function paletteJson(p){return JSON.stringify({brand:p.brand,direction:p.direction,colors:p.colours.map(c=>({role:c.role,label:c.label,name:c.name,hex:c.hex,rgb:c.rgb,cmyk_approssimato:c.cmyk})),
 fonts:p.kit.fonts,accessible_pairs:p.pairs.map(x=>({text:x.fg,background:x.bg,ratio:x.ratio,level:x.level}))},null,2)+'\n'}
const zipName=p=>'pacchetto-logo-'+p.base+'-'+(slug(p.direction)||'kit')+'.zip';
const mmTxt=n=>comma(Math.round(n*10)/10);
function readme(p){const L=[],hv=p.variants.find(v=>v.id==='orizzontale');
 L.push('PACCHETTO LOGO E BRAND BOOK · '+p.brand,'Direzione: '+p.direction,'Preparato con RADIX il '+p.date,'');
 L.push('ATTENZIONE','Il logo è una bozza di lavoro: fallo rifinire da un grafico e verifica il marchio su UIBM, TMview e WIPO prima di registrarlo o usarlo.','');
 L.push('COSA C’È','- brand-book.pdf: il manuale d’identità (A4 orizzontale): logo, versioni, area di rispetto, usi scorretti, colori, tipografia, applicazioni.',
  '- logo/svg: i loghi vettoriali, da usare ovunque sia possibile (sito, stampa, insegne): si ingrandiscono senza perdere qualità.',
  '- logo/png: gli stessi loghi in PNG con fondo trasparente, larghi 512, 1024 e 2048 px (il lato più lungo): per documenti, presentazioni e social.',
  '- favicon: le icone del sito (16, 32, 48 px, favicon.ico, apple-touch-icon 180 px, 192 e 512 px per il manifest).',
  '- social: l’avatar 1080 × 1080 px con il simbolo dentro il cerchio che i social ritagliano.','- colori: palette.css (variabili CSS) e palette.json.','');
 L.push('LE VERSIONI DEL LOGO',...p.variants.map(v=>'- '+v.label+' ('+v.id+'): '+v.use+' Misura minima: '+v.min.mm+' mm in stampa, '+v.min.px+' px sullo schermo.'),'');
 L.push('AREA DI RISPETTO','Intorno al logo lascia sempre libero uno spazio pari a X, cioè metà dell’altezza del logotipo (circa il '+Math.round(hv.clear.ratio*100)+'% dell’altezza del logo orizzontale). Nessun testo, immagine o bordo dentro quest’area.','');
 L.push('COLORI (CMYK approssimato: conversione semplice senza profilo colore, da confermare in tipografia con una prova colore; il Pantone si sceglie con lo stampatore)',
  ...p.colours.map(c=>'- '+c.label+(c.name&&c.name!==c.label?' · '+c.name:'')+': HEX '+c.hex+' · RGB '+c.rgb.join(' ')+' · CMYK ~ '+c.cmyk.join(' ')),'');
 L.push('ABBINAMENTI LEGGIBILI (WCAG: AA dal 4,5:1 per il testo normale, dal 3:1 solo per i titoli grandi)',...p.pairs.map(x=>'- '+x.fgLabel+' su '+x.bgLabel+': '+comma(x.ratio)+':1 · '+x.level),'');
 L.push('FONT (Google Fonts, licenza libera per uso commerciale)','- Titoli: '+p.fonts.heading+' · Testi: '+p.fonts.body,...p.scale.map(s=>'- '+s.name+': '+s.font+' '+s.weight+', '+s.px+' px sullo schermo, '+comma(s.pt)+' pt in stampa'),'');
 L.push('FAVICON: DA METTERE NEL <head> DEL SITO','<link rel="icon" href="/favicon.ico" sizes="48x48">','<link rel="icon" href="/favicon.svg" type="image/svg+xml">','<link rel="apple-touch-icon" href="/apple-touch-icon.png">','<link rel="manifest" href="/site.webmanifest">','');
 L.push('NOTE','- Le scritte dei file SVG usano il font del kit: se il font non è installato, il computer ne usa uno simile. Per l’uso professionale fatele convertire in tracciati da un grafico.',
  '- I PNG e il brand book usano i font caricati nel browser quando li hai scaricati.',...p.checks.filter(c=>!c.ok).map(c=>'- '+c.text));
 return L.join('\n')+'\n'}
// What the project keeps (profile.identityKit.package): rules, colours and the file list. No SVG, PNG or PDF bytes.
function manifest(p,at){return {version:VERSION,savedAt:at||new Date().toISOString(),direction:p.direction,zip:zipName(p),files:plan(p).map(f=>f.path),
 variants:p.variants.map(v=>({id:v.id,label:v.label,width:Math.round(v.w*100)/100,height:Math.round(v.h*100)/100,minPrintMm:v.min.mm,minScreenPx:v.min.px})),
 clearSpace:{rule:'X = metà dell’altezza del logotipo',ratioOfHeight:Math.round(p.variants[0].clear.ratio*1000)/1000},
 colours:p.colours.map(c=>({role:c.role,hex:c.hex,rgb:c.rgb,cmyk:c.cmyk,cmykApprox:true})),accessiblePairs:p.pairs.filter(x=>x.aa).map(x=>({text:x.fg,background:x.bg,ratio:x.ratio,level:x.level})),
 typeScale:p.scale.map(s=>({name:s.name,font:s.font,weight:s.weight,px:s.px,pt:s.pt})),brandBook:{file:'brand-book.pdf',pages:BOOK_PAGES,format:'A4 orizzontale 297 × 210 mm'},
 generated:p.parts.generated,checks:p.checks.map(c=>({ok:c.ok,text:c.text}))}}


// ---- the brand book: A4 landscape, print-studio layout items (mm, origin top-left) ----
const BW=297,BH=210,BM=18,BOOK_PAGES=14;
const SECTIONS=[['01','Essenza del brand'],['02','Tono di voce'],['03','Il logo'],['04','Versioni del logo'],['05','Area di rispetto e misure minime'],['06','Usi scorretti'],['07','Colori'],['08','Abbinamenti accessibili'],['09','Tipografia'],['10','Applicazioni: stampa'],['11','Applicazioni: digitale'],['12','Contatti e note']];
const MONTHS=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const dateIt=d=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(d||''));return m?(+m[3])+' '+MONTHS[+m[2]-1]+' '+m[1]:String(d||'')};
const ROLE_SHARE={light:45,primary:25,dark:16,secondary:9,accent:5};
// Hue turned by 150° with the same lightness: the «wrong colours» example.
function hueShift(h,deg){const [r,g,b]=rgbOf(h).map(v=>v/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;if(d<.02)return h;
 const s=d/(1-Math.abs(2*l-1));let hu=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;hu=((hu*60+deg)%360+360)%360;
 const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(hu/60%2-1)),m=l-c/2,[a,bb,cc]=hu<60?[c,x,0]:hu<120?[x,c,0]:hu<180?[0,c,x]:hu<240?[0,x,c]:hu<300?[x,0,c]:[c,0,x];return hexOf([a+m,bb+m,cc+m].map(v=>v*255))}
const recolour=(svg,fn)=>String(svg).replace(/(fill|stroke|stop-color)="(#[0-9A-Fa-f]{6})"/g,(m,k,v)=>k+'="'+fn(v.toUpperCase())+'"');
const innerOf=svg=>{const t=tree(svg);return t?placed({tree:t,box:{x0:0,y0:0}},1,0,0):''};
function rotated(svg,deg){const vb=PS.viewBox(svg),cx=vb[0]+vb[2]/2,cy=vb[1]+vb[3]/2,r=deg*Math.PI/180,c=Math.abs(Math.cos(r)),s=Math.abs(Math.sin(r)),w=vb[2]*c+vb[3]*s,h=vb[2]*s+vb[3]*c;
 return IS.sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[cx-w/2,cy-h/2,w,h].map(num).join(' ')+'"><g transform="rotate('+num(deg)+' '+num(cx)+' '+num(cy)+')">'+innerOf(svg)+'</g></svg>')}
function effects(svg,opts){const vb=PS.viewBox(svg),d=vb[3]*.06;
 return IS.sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[vb[0]-d,vb[1]-d,vb[2]+3*d,vb[3]+3*d].map(num).join(' ')+'"><g opacity=".32" transform="translate('+num(d*1.4)+' '+num(d*1.4)+')">'+innerOf(mono(svg,'#000000','#000000',opts))+'</g><g stroke="#FFC400" stroke-width="'+num(d*.8)+'" stroke-linejoin="round">'+innerOf(svg)+'</g></svg>')}
// doc: {title, brand, pages:[{label,w,h,items,folds,bg}]}; text items may carry `font` (the brand font, drawn in the browser)
// and `track` (letter spacing, pt); logo items are vectors (also used for every shape: circles, dashes, badges).
function bookDoc(p,{contacts,measure}={}){const k=p.kit,pal=k.palette,C=bookColours(pal),f=p.fonts,V=id=>p.variants.find(v=>v.id===id),pages=[],opts={measure};let items=null,bg='#FFFFFF';
 const mm=pt=>pt*PT_MM,n2=i=>String(i).padStart(2,'0');
 const rect=(x,y,w,h,fill)=>items.push({t:'rect',x,y,w,h,fill});
 const page=(label,fill)=>{items=[];bg=fill||C.paper;pages.push({label,w:BW,h:BH,items,folds:[],bg});rect(0,0,BW,BH,bg)};
 const line=(x1,y1,x2,y2,stroke,width)=>items.push({t:'line',x1,y1,x2,y2,stroke,width:width||.4});
 const tw=(s,size,bold,track)=>mm(PS.textWidth(s,size,bold)+(track||0)*Math.max(0,Array.from(s).length-1));
 function text(x,y,s,o={}){s=clean(s);if(!s)return 0;let size=o.size||9;const min=size*.7;while(o.w&&tw(s,size,o.bold,o.track)>o.w&&size>min)size-=.25;
  const w=tw(s,size,o.bold,o.track),left=o.align==='center'?x+((o.w||0)-w)/2:o.align==='right'?x+(o.w||0)-w:x;
  items.push({t:'text',x:left,y,s,size,bold:!!o.bold,fill:o.fill||C.ink,track:o.track||0,font:o.font||'',bg:o.bg||bg});return w}
 function para(x,top,w,s,o={}){const size=o.size||9,lead=mm(size*(o.lead||1.45));let lines=PS.wrap(clean(s),size,w,o.bold);
  if(o.max&&lines.length>o.max){lines=lines.slice(0,o.max);lines[o.max-1]=lines[o.max-1].replace(/\s*\S{0,4}$/,'')+'…'}
  let y=top+mm(size*.72);for(const l of lines){text(x,y,l,{...o,w:o.align?w:0});y+=lead}return y-lead+mm(size*.3)}
 const box=(w,h,inner)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+num(w)+' '+num(h)+'">'+inner+'</svg>';
 const shape=(x,y,w,h,inner)=>items.push({t:'logo',x,y,w,h,svg:box(w,h,inner),vb:[0,0,w,h],bg,label:'Grafica',deco:true});
 const frame=(x,y,w,h,stroke,rx)=>shape(x,y,w,h,'<rect x=".15" y=".15" width="'+num(w-.3)+'" height="'+num(h-.3)+'"'+(rx?' rx="'+rx+'"':'')+' fill="none" stroke="'+stroke+'" stroke-width=".3"/>');
 function logo(svg,x,y,w,h,o={}){const vb=PS.viewBox(svg);if(!vb)return null;const s=Math.min(w/vb[2],h/vb[3]);let lw=vb[2]*s,lh=vb[3]*s;if(o.stretch){lw*=o.stretch[0];lh*=o.stretch[1]}
  const lx=o.align==='left'?x:o.align==='right'?x+w-lw:x+(w-lw)/2,ly=o.valign==='top'?y:y+(h-lh)/2;
  items.push({t:'logo',x:lx,y:ly,w:lw,h:lh,svg,vb,bg:o.bg||bg,label:'Logo'});return {x:lx,y:ly,w:lw,h:lh}}
 const eyebrow=(x,y,s,fill,o={})=>text(x,y,s.toUpperCase(),{size:6.8,bold:true,track:1.2,fill:fill||C.accent,...o});
 const footer=(mut)=>{text(BM,BH-9,'Manuale d’identità visiva · '+p.brand,{size:6.5,fill:mut});text(BW-BM,BH-9,n2(pages.length)+' / '+BOOK_PAGES,{size:6.5,fill:mut,align:'right',w:0})};
 function chrome(sec,dark){const [no,t]=SECTIONS[sec],mut=dark?mix(C.cover,'#FFFFFF',.72):C.muted;
  eyebrow(BM,BM+3,no+'   '+t,dark?'#FFFFFF':C.accent);eyebrow(BW-BM,BM+3,p.brand,mut,{align:'right',w:0});
  line(BM,BH-14,BW-BM,BH-14,dark?mix(C.cover,'#FFFFFF',.28):C.hair,.35);footer(mut)}
 const title=(s,o={})=>text(BM,BM+23,s,{size:o.size||27,bold:true,font:f.heading,fill:o.fill||C.ink,w:o.w||BW-2*BM});
 const hv=V('orizzontale'),vv=V('verticale'),sv=V('simbolo'),wv=V('logotipo'),light=C.light,prim=colourOf(pal,'primary')||C.cover,acc=colourOf(pal,'accent')||prim;
 const onCov=mix(C.cover,'#FFFFFF',.72),accOn=IS.contrast(acc,C.cover)>=1.6?acc:'#FFFFFF',cv=contacts||{};
 const badge='<circle cx="3" cy="3" r="3" fill="#D92D20"/><path d="M1.8 1.8 4.2 4.2M4.2 1.8 1.8 4.2" stroke="#FFFFFF" stroke-width=".6" stroke-linecap="round"/>';

 // 1 · cover
 page('Copertina',C.cover);
 logo(mono(sv.svg,mix(C.cover,'#FFFFFF',.075),C.cover,opts),BW-122,BH/2-88,176,176,{align:'left'});
 eyebrow(BM,BM+4,'Manuale d’identità visiva','#FFFFFF');eyebrow(BW-BM,BM+4,'Bozza · versione 1.0',onCov,{align:'right',w:0});
 logo(mono(hv.svg,'#FFFFFF',C.cover,opts),BM,62,150,44,{align:'left'});
 text(BM,BH-40,'Brand book',{size:34,bold:true,font:f.heading,fill:'#FFFFFF'});
 text(BM,BH-29,'Direzione «'+p.direction+'» · '+dateIt(p.date),{size:9.5,fill:onCov});
 rect(0,BH-6,BW,6,accOn);

 // 2 · contents
 page('Indice');eyebrow(BM,BM+3,'Indice');eyebrow(BW-BM,BM+3,p.brand,C.muted,{align:'right',w:0});
 text(BM,62,'Indice',{size:40,bold:true,font:f.heading});
 para(BM,74,92,'Questo manuale raccoglie le regole per usare il marchio «'+p.brand+'» sempre nello stesso modo: il logo e le sue versioni, gli spazi, i colori, i caratteri e alcuni esempi. Tienilo a portata di mano di chi prepara grafiche, siti e stampati.',{size:9.5,lead:1.6,fill:C.muted});
 SECTIONS.forEach(([no,t],i)=>{const y=38+i*12.4;eyebrow(140,y+6.8,no);text(152,y+7,t,{size:11.5});text(BW-BM,y+7,n2(i+3),{size:9,fill:C.muted,align:'right',w:0});line(140,y+10.6,BW-BM,y+10.6,C.hair,.35)});
 footer(C.muted);

 // 3 · essence
 page('Essenza');chrome(0);title(p.direction,{w:160});
 para(BM,56,150,k.rationale||'Il concetto della direzione scelta: scrivilo con lo Stratega di Marca e aggiornalo qui.',{size:13,lead:1.55,max:12});
 eyebrow(190,58,'Parole chiave',C.muted);(k.keywords&&k.keywords.length?k.keywords:['—']).slice(0,6).forEach((w,i)=>{const y=64+i*15;text(190,y+9.5,w.charAt(0).toUpperCase()+w.slice(1),{size:15,bold:true,font:f.heading,w:BW-BM-190});line(190,y+14,BW-BM,y+14,C.hair,.35)});

 // 4 · tone of voice
 page('Tono di voce');chrome(1);title('Come parliamo');const cw=(BW-2*BM-2*10)/3,tone=k.tone&&k.tone.length?k.tone:['Il tono di voce non è nel kit: definiscilo con lo Stratega di Marca.'];
 tone.slice(0,3).forEach((t,i)=>{const x=BM+i*(cw+10);text(x,66,n2(i+1),{size:30,bold:true,font:f.heading,fill:C.accent});line(x,72,x+cw,72,C.hair,.35);para(x,77,cw,t,{size:12.5,lead:1.4,bold:true,max:5})});
 const softInk=IS.contrast(C.muted,light)>=4.5?C.muted:C.ink;rect(BM,112,BW-2*BM,70,light);eyebrow(BM+9,124,'Immagini e atmosfera',softInk);
 const imgs=(k.images&&k.images.length?k.images:['Le descrizioni delle immagini della moodboard compariranno qui.']).slice(0,3),iw=(BW-2*BM-18-2*9)/3;
 imgs.forEach((t,i)=>{const x=BM+9+i*(iw+9);shape(x,131,4,4,'<rect width="4" height="4" fill="'+[prim,colourOf(pal,'secondary')||prim,acc][i]+'"/>');para(x,139,iw,t,{size:9.2,lead:1.5,fill:softInk,max:7})});

 // 5 · the logo
 page('Il logo');chrome(2);title('Il logo');rect(BM,48,170,130,light);logo(hv.svg,BM+20,48+30,130,70,{bg:light});
 para(202,50,BW-BM-202,'Il logo principale unisce il simbolo e il nome. È la versione da preferire: usala ogni volta che lo spazio lo permette, sempre dai file originali del pacchetto.',{size:9.5,lead:1.55});
 [[sv,'Simbolo',p.parts.generated.symbol?'Monogramma creato dalle iniziali: da rifinire.':'Il segno grafico: funziona anche da solo.'],[wv,'Logotipo',p.parts.generated.word?'Il nome scritto con il font dei titoli: da rifinire.':'Il nome scritto: non va ricomposto con altri caratteri.']].forEach(([v,lab,txt],i)=>{const y=96+i*42;
  rect(202,y,BW-BM-202,26,light);logo(v.svg,207,y+5,BW-BM-212,16,{bg:light});eyebrow(202,y+31.5,lab,C.ink);para(202,y+33.5,BW-BM-202,txt,{size:7.5,fill:C.muted,max:2})});

 // 6 · versions
 page('Versioni');chrome(3);title('Versioni del logo');const vw=(BW-2*BM-3*6)/4,vh=48;
 p.variants.forEach((v,i)=>{const x=BM+(i%4)*(vw+6),y=48+Math.floor(i/4)*(vh+21),tbg=v.dark?C.dark:(v.id==='nero'||v.id==='monocolore'?'#FFFFFF':light);rect(x,y,vw,vh,tbg);
  if(tbg==='#FFFFFF')frame(x,y,vw,vh,C.hair);logo(v.svg,x+9,y+9,vw-18,vh-18,{bg:tbg});text(x,y+vh+5,v.label,{size:8,bold:true,w:vw});para(x,y+vh+7,vw,v.use,{size:6.6,lead:1.4,fill:C.muted,max:2})});

 // 7 · clear space and minimum sizes
 page('Area di rispetto');chrome(4);title('Area di rispetto e misure minime',{size:24});
 const pw=160,ph=130,py=48;rect(BM,py,pw,ph,light);const cl=hv.clear,cs=Math.min((pw-28)/cl.box.w,(ph-28)/cl.box.h),bw=cl.box.w*cs,bh=cl.box.h*cs,bx=BM+(pw-bw)/2,by=py+(ph-bh)/2,X=cl.x*cs;
 shape(bx,by,bw,bh,'<rect x=".15" y=".15" width="'+num(bw-.3)+'" height="'+num(bh-.3)+'" fill="none" stroke="'+C.accent+'" stroke-width=".3" stroke-dasharray="1.4 1"/>');
 shape(bx+X,by+X,bw-2*X,bh-2*X,'<rect x=".1" y=".1" width="'+num(bw-2*X-.2)+'" height="'+num(bh-2*X-.2)+'" fill="none" stroke="'+C.muted+'" stroke-width=".18"/>');
 logo(hv.svg,bx+X,by+X,bw-2*X,bh-2*X,{bg:light});
 const xm=(x,y)=>{shape(x,y,X,X,'<rect width="'+num(X)+'" height="'+num(X)+'" fill="'+C.accent+'" opacity=".16"/>');text(x,y+X/2+1.1,'X',{size:7,bold:true,fill:C.accent,align:'center',w:X})};
 xm(bx,by+bh/2-X/2);xm(bx+bw-X,by+bh/2-X/2);xm(bx+bw/2-X/2,by);xm(bx+bw/2-X/2,by+bh-X);
 let ry=para(192,50,BW-BM-192,'Intorno al logo lascia sempre libero uno spazio pari a X: metà dell’altezza del logotipo, circa il '+Math.round(cl.ratio*100)+'% dell’altezza del logo. Dentro quest’area non vanno testi, immagini, bordi o altri loghi.',{size:9,lead:1.55});
 eyebrow(192,ry+10,'Misure minime',C.ink);text(BW-BM-24,ry+10,'STAMPA',{size:6,bold:true,track:.8,fill:C.muted,align:'right',w:0});text(BW-BM,ry+10,'SCHERMO',{size:6,bold:true,track:.8,fill:C.muted,align:'right',w:0});
 ry+=13;[hv,vv,sv,wv].forEach(v=>{line(192,ry,BW-BM,ry,C.hair,.35);text(192,ry+6,v.label.replace(/ \(.*\)$/,''),{size:8.5,w:BW-BM-192-50});text(BW-BM-24,ry+6,v.min.mm+' mm',{size:8.5,bold:true,align:'right',w:0});text(BW-BM,ry+6,v.min.px+' px',{size:8.5,bold:true,align:'right',w:0});ry+=9});line(192,ry,BW-BM,ry,C.hair,.35);
 para(192,ry+5,BW-BM-192,'Larghezza minima del logo: sotto questa misura il nome non si legge più (in stampa nessuna scritta sotto i 6 pt).',{size:7,lead:1.5,fill:C.muted});

 // 8 · don'ts, drawn from the real logo
 page('Usi scorretti');chrome(5);title('Usi scorretti');const dw=(BW-2*BM-2*8)/3,dh=48,low=mix(prim,C.dark,.38);
 // A busy background: diagonal stripes clipped to the tile (the PDF writer has no clip for shapes) and two discs.
 const clipPoly=(pts,w,h)=>{let out=pts;for(const [inside,cut] of [[q=>q[0]>=0,(a,b)=>[0,a[1]+(b[1]-a[1])*(0-a[0])/(b[0]-a[0])]],[q=>q[0]<=w,(a,b)=>[w,a[1]+(b[1]-a[1])*(w-a[0])/(b[0]-a[0])]]]){const src=out;out=[];
   src.forEach((c,i)=>{const pr=src[(i+src.length-1)%src.length];if(inside(c)){if(!inside(pr))out.push(cut(pr,c));out.push(c)}else if(inside(pr))out.push(cut(pr,c))})}return out};
 const stripes=(w,h)=>{let s='';const cols=[prim,acc,colourOf(pal,'secondary')||prim,C.dark,light];for(let i=-6;i<16;i++){const q=clipPoly([[i*9,0],[i*9+6,0],[i*9+6+h*.6,h],[i*9+h*.6,h]],w,h);
   if(q.length>2)s+='<polygon points="'+q.map(([x,y])=>num(x)+','+num(y)).join(' ')+'" fill="'+cols[(i+6)%5]+'"/>'}
  return '<g>'+s+'</g><circle cx="'+num(w*.2)+'" cy="'+num(h*.32)+'" r="'+num(h*.26)+'" fill="'+light+'" opacity=".55"/><circle cx="'+num(w*.8)+'" cy="'+num(h*.62)+'" r="'+num(h*.3)+'" fill="'+C.dark+'" opacity=".45"/>'};
 const DONT=[['Non deformare','Mai allungare o schiacciare: si ridimensiona solo in proporzione.',(x,y)=>logo(hv.svg,x+12,y+8,dw-24,dh-16,{stretch:[1.3,.62]})],
  ['Non ruotare','Il logo sta sempre dritto, anche nei layout più dinamici.',(x,y)=>logo(rotated(hv.svg,-14),x+10,y+6,dw-20,dh-12)],
  ['Non cambiare i colori','Solo i colori della palette o le versioni a un colore.',(x,y)=>logo(recolour(hv.svg,h=>hueShift(h,150)),x+10,y+8,dw-20,dh-16)],
  ['Non aggiungere effetti','Niente ombre, contorni, bagliori o rilievi.',(x,y)=>logo(effects(hv.svg,opts),x+10,y+7,dw-20,dh-14)],
  ['Non usare su fondi confusi','Su foto o motivi movimentati usa un fondo pieno o la versione bianca.',(x,y)=>{shape(x,y,dw,dh,stripes(dw,dh));logo(hv.svg,x+10,y+8,dw-20,dh-16)}],
  ['Non usare su fondi poco contrastati','Scegli la versione, chiara o scura, che si legge meglio.',(x,y)=>{rect(x,y,dw,dh,low);logo(hv.svg,x+10,y+8,dw-20,dh-16,{bg:low})}]];
 DONT.forEach(([t,why,draw],i)=>{const x=BM+(i%3)*(dw+8),y=48+Math.floor(i/3)*(dh+21);rect(x,y,dw,dh,light);draw(x,y);shape(x+dw-9,y+3,6,6,badge);
  text(x,y+dh+5,t,{size:8,bold:true,w:dw});para(x,y+dh+7,dw,why,{size:6.6,lead:1.4,fill:C.muted,max:2})});

 // 9 · colours
 page('Colori');chrome(6);title('I colori');const sw=(BW-2*BM-4*5)/5;
 p.colours.forEach((c,i)=>{const x=BM+i*(sw+5),on=IS.onColour(pal,c.hex);rect(x,48,sw,70,c.hex);if(IS.contrast(c.hex,'#FFFFFF')<1.25)frame(x,48,sw,70,C.hair);
  text(x+4,48+57,c.label.toUpperCase(),{size:6,bold:true,track:.9,fill:on.text,w:sw-8});text(x+4,48+64.5,c.name||c.label,{size:11,bold:true,fill:on.text,w:sw-8,font:f.heading});
  [['HEX',c.hex],['RGB',c.rgb.join('  ')],['CMYK*',c.cmyk.join('  ')]].forEach(([l,v],j)=>{const y=127+j*10.5;text(x,y,l,{size:6,bold:true,track:.8,fill:C.muted});text(x,y+4.8,v,{size:8.8,bold:j===0})})});
 eyebrow(BM,164,'Proporzioni d’uso',C.muted);let px0=BM;const share=p.colours.map(c=>[c,ROLE_SHARE[c.role]||5]),tot=share.reduce((a,[,s])=>a+s,0);
 share.sort((a,b)=>b[1]-a[1]).forEach(([c,s])=>{const w=(BW-2*BM)*s/tot;rect(px0,167,w,6,c.hex);text(px0,178,s+'% '+c.label.toLowerCase(),{size:6.3,fill:C.muted,w:Math.max(8,w-1)});px0+=w});
 frame(BM,167,BW-2*BM,6,C.hair);
 text(BM,188,'* CMYK approssimato con una conversione semplice, senza profilo colore: va confermato in tipografia con una prova colore. Il Pantone si sceglie con lo stampatore.',{size:6.5,fill:C.muted,w:BW-2*BM});

 // 10 · accessible pairs
 page('Abbinamenti accessibili');chrome(7);title('Abbinamenti accessibili');
 para(BM,46,175,'Le coppie della palette che si leggono come testo, calcolate con il contrasto WCAG 2.1: AA dal 4,5:1 per il testo normale, AAA dal 7:1. Le coppie tra 3:1 e 4,5:1 vanno bene solo per titoli grandi.',{size:8.8,lead:1.5,fill:C.muted});
 const pr=p.pairs.slice(0,10),aw=(BW-2*BM-4*5)/5;if(!pr.length)para(BM,70,170,'Nessuna coppia della palette raggiunge il 3:1: usa il nero o il bianco per i testi.',{size:10});
 pr.forEach((x,i)=>{const cx=BM+(i%5)*(aw+5),cy=64+Math.floor(i/5)*(38+21);rect(cx,cy,aw,38,x.bgHex);if(IS.contrast(x.bgHex,'#FFFFFF')<1.25)frame(cx,cy,aw,38,C.hair);
  text(cx+5,cy+20,'Aa',{size:24,bold:true,font:f.heading,fill:x.fgHex,bg:x.bgHex});text(cx+5,cy+31,'Testo di esempio',{size:8,fill:x.fgHex,font:f.body,bg:x.bgHex});
  text(cx+aw-4,cy+7,x.level,{size:6.5,bold:true,fill:x.fgHex,align:'right',w:0});
  text(cx,cy+43,x.fgLabel+' su '+x.bgLabel.toLowerCase(),{size:7.5,bold:true,w:aw});text(cx,cy+47.5,comma(x.ratio)+':1 · '+(x.aa?'testo normale':'solo titoli grandi'),{size:6.8,fill:C.muted,w:aw})});

 // 11 · typography
 page('Tipografia');chrome(8);title('Tipografia');const tcol=(BW-2*BM-14)/2;
 [[f.heading,'Titoli · Bold 700',true],[f.body,'Testi · Regular 400',false]].forEach(([fam,use,bold],i)=>{const x=BM+i*(tcol+14);
  text(x,74,'Aa',{size:58,bold,font:fam});text(x+44,57,fam,{size:17,bold:true,font:fam,w:tcol-44});text(x+44,63.5,use+' · Google Fonts, licenza libera',{size:7,fill:C.muted,w:tcol-44});
  text(x+44,71,'ABCDEFGHIJKLMNOPQRSTUVWXYZ',{size:8.5,bold,font:fam,w:tcol-44});text(x+44,76.5,'abcdefghijklmnopqrstuvwxyz 0123456789',{size:8.5,bold,font:fam,w:tcol-44})});
 let ty=90;eyebrow(BM,ty,'Scala tipografica · rapporto 1,25',C.muted);text(BW-BM,ty,'SCHERMO · STAMPA',{size:6,bold:true,track:.8,fill:C.muted,align:'right',w:0});ty+=3;
 p.scale.forEach(s=>{const sz=Math.min(s.pt,22),h=mm(sz*1.18)+3;line(BM,ty,BW-BM,ty,C.hair,.35);text(BM,ty+h-2.2,s.name,{size:6.8,fill:C.muted});
  text(BM+34,ty+h-2.2,s.pt>=12.5?p.brand+' · '+(k.keywords&&k.keywords[0]||'il nostro stile'):'Un testo chiaro, leggibile e vicino alle persone.',{size:sz,bold:s.weight>=700,font:s.font,w:BW-2*BM-34-48});
  text(BW-BM,ty+h-2.2,s.px+' px · '+comma(s.pt)+' pt',{size:6.8,fill:C.muted,align:'right',w:0});ty+=h});line(BM,ty,BW-BM,ty,C.hair,.35);

 // 12 · print applications
 page('Applicazioni: stampa');chrome(9);title('Applicazioni: stampa');const shadow=mix(C.ink,'#FFFFFF',.88),cl2=[cv.phone,cv.email,cv.website,cv.address].map(clean).filter(Boolean),dom=(p.base||'azienda').replace(/-/g,'');
 rect(BM+1.2,49.2,85,55,shadow);rect(BM,48,85,55,light);logo(vv.svg,BM+14,48+10,57,35,{bg:light});
 rect(BM+1.2,115.2,85,55,shadow);rect(BM,114,85,55,C.cover);text(BM+7,114+13,'Nome Cognome',{size:9.5,bold:true,fill:'#FFFFFF'});text(BM+7,114+18,'Ruolo',{size:6.8,fill:onCov});
 (cl2.length?cl2:['+39 000 000 0000','info@'+dom+'.it','www.'+dom+'.it']).slice(0,4).forEach((l,i,a)=>text(BM+7,114+55-6-(a.length-1-i)*3.6,l,{size:6.4,fill:'#FFFFFF',w:71}));
 logo(mono(sv.svg,'#FFFFFF',C.cover,opts),BM+85-19,114+6,12,12,{bg:C.cover});
 text(BM,178,'Biglietto da visita · 85 × 55 mm, fronte e retro',{size:7,fill:C.muted});
 const lx=118,ly=46,lw=210*.44,lh=297*.44;rect(lx+1.2,ly+1.2,lw,lh,shadow);rect(lx,ly,lw,lh,'#FFFFFF');frame(lx,ly,lw,lh,C.hair);
 rect(lx,ly,lw,1.6,C.cover);logo(hv.svg,lx+7,ly+7,36,10,{align:'left',bg:'#FFFFFF'});
 (cl2.length?cl2:['Via Roma 1, 00100 Città','+39 000 000 0000','www.'+dom+'.it']).slice(0,3).forEach((l,i)=>text(lx+lw-7,ly+9+i*2.4,l,{size:4.2,fill:C.muted,align:'right',w:0}));
 for(let i=0;i<12;i++)rect(lx+7,ly+34+i*5.2+(i>3?4:0),i===3||i===11?lw*.45:lw-14,1.3,mix(C.ink,'#FFFFFF',.9));
 line(lx+7,ly+lh-9,lx+lw-7,ly+lh-9,acc,.4);text(lx+7,ly+lh-5.5,p.brand+(cl2[3]?' · '+cl2[3]:''),{size:4.2,bold:true,fill:C.muted,w:lw-14});
 text(lx,184,'Carta intestata A4',{size:7,fill:C.muted});
 eyebrow(224,52,'Coerenza',C.ink);para(224,55,BW-BM-224,'Su ogni stampato: il logo nella sua area di rispetto, i colori della palette, al massimo due caratteri. I file per la tipografia, con abbondanza e segni di taglio, si preparano nello Studio Stampa di RADIX.',{size:8.2,lead:1.55,fill:C.muted});

 // 13 · digital applications
 page('Applicazioni: digitale');chrome(10);title('Applicazioni: digitale');
 rect(BM,46,114,114,C.cover);eyebrow(BM+9,46+15,(k.keywords||[]).slice(0,3).join(' · ')||p.brand,onCov,{w:96});
 para(BM+9,46+22,96,'Il nuovo volto di '+p.brand,{size:22,lead:1.12,bold:true,font:f.heading,fill:'#FFFFFF',max:3});rect(BM+9,46+114-22,14,1.4,accOn);
 logo(mono(hv.svg,'#FFFFFF',C.cover,opts),BM+9,46+114-15,50,8,{align:'left',bg:C.cover});text(BM,166,'Post social · 1080 × 1080 px',{size:7,fill:C.muted});
 const ax=148;shape(ax,48,40,40,'<circle cx="20" cy="20" r="20" fill="'+light+'"/><circle cx="20" cy="20" r="19.85" fill="none" stroke="'+C.hair+'" stroke-width=".3"/>');
 {const vb=PS.viewBox(sv.svg),s=Math.min(2*.31*40/Math.hypot(vb[2],vb[3]),.6*40/vb[2],.6*40/vb[3]);logo(sv.svg,ax+20-vb[2]*s/2,68-vb[3]*s/2,vb[2]*s,vb[3]*s,{bg:light})}
 text(ax+48,63,p.brand,{size:12,bold:true,w:BW-BM-ax-48});text(ax+48,69,'@'+dom,{size:8,fill:C.muted});text(ax+48,77,'Avatar 1080 × 1080: il simbolo resta dentro il cerchio.',{size:7,fill:C.muted,w:BW-BM-ax-48});
 const tbw=BW-BM-ax;shape(ax,100,tbw,22,'<rect width="'+num(tbw)+'" height="22" rx="2.5" fill="#E8EAEE"/><path d="M5 22V9.5a3 3 0 0 1 3-3h66a3 3 0 0 1 3 3V22Z" fill="#FFFFFF"/><circle cx="'+num(tbw-9)+'" cy="14" r="1.2" fill="#9AA1AD"/>');
 logo(sv.svg,ax+10,108.5,6,6,{bg:'#FFFFFF'});text(ax+19,113,p.brand+' · Sito ufficiale',{size:7,fill:'#3C4250',w:52});text(ax,128,'Favicon nella scheda del browser (16 e 32 px)',{size:7,fill:C.muted});
 shape(ax,138,26,26,'<rect width="26" height="26" rx="6" fill="'+light+'"/><rect x=".15" y=".15" width="25.7" height="25.7" rx="6" fill="none" stroke="'+C.hair+'" stroke-width=".3"/>');logo(sv.svg,ax+4.5,142.5,17,17,{bg:light});
 text(ax+32,149,'Icona sulla schermata Home',{size:8.5,bold:true});text(ax+32,154.5,'apple-touch-icon 180 px · Android 192 e 512 px',{size:7,fill:C.muted,w:BW-BM-ax-32});

 // 14 · contacts and notes
 page('Contatti e note',C.cover);chrome(11,true);title('Contatti e note',{fill:'#FFFFFF'});logo(mono(hv.svg,'#FFFFFF',C.cover,opts),BM,50,96,26,{align:'left',bg:C.cover});
 let cy2=94;const CL=[['Telefono',cv.phone],['Email',cv.email],['Sito',cv.website],['Indirizzo',cv.address]].filter(([,v])=>clean(v));
 if(CL.length)CL.forEach(([l,v])=>{eyebrow(BM,cy2,l,onCov);text(BM,cy2+6,v,{size:10.5,fill:'#FFFFFF',w:120});cy2+=15});
 else para(BM,cy2,110,'Aggiungi telefono, email, sito e indirizzo nel profilo del progetto: compariranno qui e sui materiali dello Studio Stampa.',{size:9,lead:1.55,fill:onCov});
 eyebrow(160,52,'Note importanti','#FFFFFF');let ny=56;
 ['Il logo è una bozza di lavoro: fallo rifinire da un grafico e verifica il marchio su UIBM, TMview e WIPO prima di registrarlo o usarlo.',
  'I valori CMYK sono approssimati: confermali in tipografia con una prova colore. Il Pantone si sceglie con lo stampatore.',
  'Font '+[...new Set([f.heading,f.body])].join(' e ')+': Google Fonts, licenza libera anche per uso commerciale.',
  'Nel pacchetto: loghi in SVG e PNG (512, 1024, 2048 px), favicon, avatar social e colori in CSS e JSON.'].forEach(t=>{shape(160,ny+1.6,1.6,1.6,'<rect width="1.6" height="1.6" fill="'+accOn+'"/>');ny=para(164,ny,BW-BM-164,t,{size:8.4,lead:1.5,fill:'#FFFFFF'})+5});
 text(BM,BH-24,'Preparato con RADIX il '+dateIt(p.date)+'.',{size:7,fill:onCov});
 return {title:'Brand book · '+p.brand,brand:p.brand,pages}}
// Each page as an inline SVG for the preview: the brand fonts come from the page (Google Fonts loaded by the kit).
function bookSvg(doc,i){const pg=doc.pages[i],o=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+pg.w+' '+pg.h+'" role="img" aria-label="'+escAttr(pg.label)+'">'];
 for(const it of pg.items){if(it.t==='rect')o.push('<rect x="'+num(it.x)+'" y="'+num(it.y)+'" width="'+num(it.w)+'" height="'+num(it.h)+'" fill="'+it.fill+'"/>');
  else if(it.t==='line')o.push('<line x1="'+num(it.x1)+'" y1="'+num(it.y1)+'" x2="'+num(it.x2)+'" y2="'+num(it.y2)+'" stroke="'+it.stroke+'" stroke-width="'+num(it.width*PT_MM)+'"/>');
  else if(it.t==='text')o.push('<text x="'+num(it.x)+'" y="'+num(it.y)+'" font-family="'+escAttr(it.font?fontStack(it.font):"Helvetica, Arial, 'Liberation Sans', sans-serif")+'" font-size="'+num(it.size*PT_MM)+'"'+(it.bold?' font-weight="700"':'')+(it.track?' letter-spacing="'+num(it.track*PT_MM)+'"':'')+' fill="'+it.fill+'" xml:space="preserve">'+escText(it.s)+'</text>');
  else if(it.t==='image'&&it.src)o.push('<image x="'+num(it.x)+'" y="'+num(it.y)+'" width="'+num(it.w)+'" height="'+num(it.h)+'" preserveAspectRatio="none" href="'+escAttr(it.src)+'"/>');
  else if(it.t==='logo')o.push('<g transform="translate('+num(it.x)+' '+num(it.y)+') scale('+(Math.round(it.w/it.vb[2]*1e5)/1e5)+' '+(Math.round(it.h/it.vb[3]*1e5)/1e5)+') translate('+num(-it.vb[0])+' '+num(-it.vb[1])+')">'+innerOf(it.svg)+'</g>')}// a group, not a nested <svg>: page CSS sizing svg elements cannot touch it
 o.push('</svg>');return o.join('')}
const bookPdf=(doc,{date}={})=>PS.pdf(doc,{mode:'web',date:date||new Date(),title:doc.title,producer:'RADIX Kit identità'});

// ---- browser: the logo drawn on a canvas (real web fonts), PNGs, and the brand fonts of the PDF as images ----
const dom=()=>root.document;
const GENERIC=/^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i;
const cssFamily=list=>String(list||'').split(',').map(s=>s.trim().replace(/^['"]|['"]$/g,'')).filter(Boolean).map(s=>GENERIC.test(s)?s:'"'+s.replace(/"/g,'')+'"').join(', ')||'sans-serif';
const fontCss=(style,bold,size,family)=>(style==='italic'?'italic ':'')+(bold?'700 ':'400 ')+size+'px '+cssFamily(family);
// Text widths with the fonts the browser really has (canvas), for the boxes of the variants.
function canvasMeasure(){const c=dom().createElement('canvas').getContext('2d');return (s,{size,bold,spacing,family,style})=>{c.font=fontCss(style,bold,size,family||'Helvetica');return c.measureText(s).width+(spacing||0)*Math.max(0,Array.from(s).length-1)}}
const firstFamily=list=>String(list||'').split(',')[0].trim().replace(/^['"]|['"]$/g,'');
// The families a logo uses plus the kit's, loaded (Google Fonts links added by the kit) or given up after 3 s.
async function fontsReady(families){const d=dom();if(!d.fonts||!d.fonts.load)return;const list=[...new Set(families.map(firstFamily).filter(f=>f&&!GENERIC.test(f)))];
 const all=Promise.all(list.flatMap(f=>['400','700'].map(w=>d.fonts.load(w+' 32px "'+f+'"').catch(()=>null))));await Promise.race([all,new Promise(r=>setTimeout(r,3000))])}
const fontLoaded=fam=>{const d=dom();if(!d.fonts)return false;let ok=false;d.fonts.forEach(f=>{if(f.family.replace(/["']/g,'')===fam&&f.status==='loaded')ok=true});return ok};
const logoFamilies=svg=>(String(svg).match(/font-family="([^"]*)"/g)||[]).map(s=>s.slice(13,-1).replace(/&quot;|&#39;/g,''));
// Draws the (sanitized) SVG on ctx in its own user space; `only`: 'text' or 'shape' to draw one layer. Gradients use
// their first colour (as in the PDF); group opacity applies to each element.
function draw(ctx,svg,{only}={}){const t=tree(svg);if(!t)return;const defs={};(function c(n){if(n.attrs&&n.attrs.id)defs[n.attrs.id]=n;(n.children||[]).forEach(c)})(t);
 const col=v=>{const c=paint(v);if(c&&c.url){const g=defs[c.url],st=g&&g.children.find(x=>x.tag==='stop');return st?paint(st.attrs['stop-color']||'#000000'):null}return c};
 (function walk(n,st){if(n.tag==='#text'||NOPAINT.test(n.tag))return;const s={...st};for(const k of INHERIT)if(n.attrs[k]!=null&&n.attrs[k]!=='inherit'&&k!=='opacity')s[k]=n.attrs[k];
  s.op=(st.op==null?1:st.op)*(n.attrs.opacity!=null?Math.max(0,Math.min(1,+n.attrs.opacity||0)):1);ctx.save();
  if(n.attrs.transform&&n.tag!=='svg')ctx.transform(...PS.transform(n.attrs.transform));
  if(!LEAF.test(n.tag))n.children.forEach(x=>walk(x,s));else if(!only||only===(n.tag==='text'?'text':'shape'))leaf(n,s);ctx.restore()})(t,{});
 function leaf(n,s){const a=n.attrs,fill=col(s.fill==null?'#000000':s.fill),stroke=col(s.stroke),sw=s['stroke-width']==null?1:len(s['stroke-width']);
  const fo=s.op*(s['fill-opacity']!=null?+s['fill-opacity']:1),so=s.op*(s['stroke-opacity']!=null?+s['stroke-opacity']:1);
  if(n.tag==='text'){const str=textOf(n);if(!str||!fill)return;const size=len(s['font-size'])||16;ctx.font=fontCss(s['font-style'],isBold(s['font-weight']),size,s['font-family']);
   ctx.textAlign=s['text-anchor']==='middle'?'center':s['text-anchor']==='end'?'right':'left';const db=s['dominant-baseline']||'';ctx.textBaseline=/middle|central/.test(db)?'middle':/hanging|text-before-edge/.test(db)?'hanging':'alphabetic';
   if('letterSpacing' in ctx)ctx.letterSpacing=(len(s['letter-spacing'])||0)+'px';ctx.globalAlpha=fo;ctx.fillStyle=fill;
   ctx.fillText(str,(nums(a.x)[0]||0)+(nums(a.dx)[0]||0),(nums(a.y)[0]||0)+(nums(a.dy)[0]||0));return}
  const P=root.Path2D;let p;if(n.tag==='path')p=new P(a.d||'');else{p=new P();
   if(n.tag==='rect'){const w=len(a.width),h=len(a.height),rx=len(a.rx)||len(a.ry),ry=len(a.ry)||rx;if(!(w>0&&h>0))return;if(rx>0&&p.roundRect)p.roundRect(len(a.x),len(a.y),w,h,[{x:Math.min(rx,w/2),y:Math.min(ry,h/2)}]);else p.rect(len(a.x),len(a.y),w,h)}
   else if(n.tag==='circle'){const r=len(a.r);if(!(r>0))return;p.arc(len(a.cx),len(a.cy),r,0,2*Math.PI)}
   else if(n.tag==='ellipse'){const rx=len(a.rx),ry=len(a.ry);if(!(rx>0&&ry>0))return;p.ellipse(len(a.cx),len(a.cy),rx,ry,0,0,2*Math.PI)}
   else if(n.tag==='line'){p.moveTo(len(a.x1),len(a.y1));p.lineTo(len(a.x2),len(a.y2))}
   else{const v=nums(a.points);if(v.length<4)return;p.moveTo(v[0],v[1]);for(let i=2;i+1<v.length;i+=2)p.lineTo(v[i],v[i+1]);if(n.tag==='polygon')p.closePath()}}
  if(fill&&n.tag!=='line'){ctx.globalAlpha=fo;ctx.fillStyle=fill;ctx.fill(p,s['fill-rule']==='evenodd'?'evenodd':'nonzero')}
  if(stroke&&sw>0){ctx.globalAlpha=so;ctx.strokeStyle=stroke;ctx.lineWidth=sw;ctx.lineCap=s['stroke-linecap']||'butt';ctx.lineJoin=s['stroke-linejoin']||'miter';ctx.setLineDash(nums(s['stroke-dasharray']));ctx.stroke(p)}}}
// A canvas W × H px with the SVG fitted (contain, centred; `stretch` fills it), transparent unless bg.
async function canvasOf(svg,W,H,{bg,only,stretch}={}){const c=dom().createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d'),vb=PS.viewBox(svg)||[0,0,W,H];
 if(bg){x.fillStyle=bg;x.fillRect(0,0,W,H)}const sx=stretch?W/vb[2]:Math.min(W/vb[2],H/vb[3]),sy=stretch?H/vb[3]:sx,dx=(W-vb[2]*sx)/2,dy=(H-vb[3]*sy)/2;
 if(!only&&/url\(#|clip-path=/.test(svg)){const img=new root.Image();img.src=IS.svgUrl(svg);await img.decode();x.drawImage(img,dx,dy,vb[2]*sx,vb[3]*sy);return c}// gradients: the browser's own SVG renderer
 x.setTransform(sx,0,0,sy,dx-vb[0]*sx,dy-vb[1]*sy);draw(x,svg,{only});return c}
const blobBytes=async b=>new Uint8Array(await b.arrayBuffer());
async function png(svg,W,H,o){const c=await canvasOf(svg,W,H,o);return blobBytes(await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('PNG non creato')),'image/png')))}
async function deflate(bytes){if(typeof root.CompressionStream!=='function')throw Error('compressione non disponibile');return blobBytes(await new root.Response(new root.Blob([bytes]).stream().pipeThrough(new root.CompressionStream('deflate'))).blob())}
// Canvas pixels → the PDF's {w,h,rgb,alpha} (zlib streams) for print-studio's soft-masked images.
async function rasterOf(c){const {width:w,height:h}=c,d=c.getContext('2d').getImageData(0,0,w,h).data,rgb=new Uint8Array(w*h*3),al=new Uint8Array(w*h);
 for(let i=0,j=0,k=0;i<d.length;i+=4){const a=d[i+3];al[k++]=a;const f=a?255/a:0;rgb[j++]=Math.min(255,Math.round(d[i]*f));rgb[j++]=Math.min(255,Math.round(d[i+1]*f));rgb[j++]=Math.min(255,Math.round(d[i+2]*f))}
 return {w,h,rgb:await deflate(rgb),alpha:await deflate(al)}}
const DPI=450,PXMM=DPI/25.4;
async function textImage(it){const c=dom().createElement('canvas'),x=c.getContext('2d'),size=it.size*PT_MM*PXMM,font=fontCss('',it.bold,size,it.font);x.font=font;if('letterSpacing' in x)x.letterSpacing=(it.track*PT_MM*PXMM)+'px';
 const m=x.measureText(it.s),pad=Math.ceil(size*.08),asc=Math.ceil(Math.max(m.actualBoundingBoxAscent||size*.8,0)),desc=Math.ceil(Math.max(m.actualBoundingBoxDescent||size*.25,0)),left=Math.ceil(Math.max(m.actualBoundingBoxLeft||0,0));
 c.width=Math.max(1,Math.ceil(Math.max(m.width,(m.actualBoundingBoxRight||0)+left))+left+2*pad);c.height=Math.max(1,asc+desc+2*pad);
 const y=c.getContext('2d');y.font=font;if('letterSpacing' in y)y.letterSpacing=(it.track*PT_MM*PXMM)+'px';y.fillStyle=it.fill;y.textBaseline='alphabetic';y.fillText(it.s,pad+left,pad+asc);
 return {t:'image',x:it.x-(pad+left)/PXMM,y:it.y-(pad+asc)/PXMM,w:c.width/PXMM,h:c.height/PXMM,raster:await rasterOf(c),label:it.s}}
// The PDF with the brand fonts: texts set in a loaded web font and the wordmarks of the logos become transparent images
// at 450 dpi over the vector shapes; everything else stays vector (shapes, Helvetica texts).
async function withFonts(doc){const pages=[];
 for(const pg of doc.pages){const items=[];for(const it of pg.items){
  try{if(it.t==='text'&&it.font&&fontLoaded(it.font)){items.push(await textImage(it));continue}
   if(it.t==='logo'&&!it.deco&&/<text\b/.test(it.svg)){const t=tree(it.svg),keep=new Set(leaves(t).filter(l=>l.kind==='shape').map(l=>l.node)),vec=keep.size?IS.sanitizeSvg(serialize(filterTree(t,keep))):'';
    if(vec)items.push({...it,svg:vec});const W=Math.max(1,Math.round(it.w*PXMM)),H=Math.max(1,Math.round(it.h*PXMM));
    items.push({t:'image',x:it.x,y:it.y,w:it.w,h:it.h,raster:await rasterOf(await canvasOf(it.svg,W,H,{only:'text',stretch:true})),label:'Logo (scritte)'});continue}}catch(e){/* keep the vector item */}
  items.push(it)}
  pages.push({...pg,items})}
 return {...doc,pages}}
function download(name,bytes,type){const a=dom().createElement('a');a.href=root.URL.createObjectURL(bytes instanceof root.Blob?bytes:new root.Blob([bytes],{type}));a.download=name;dom().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),4000);return name}
// All the files of the package as zip entries; onStep(done,total) for the progress line.
async function packageFiles(p,pdfBytes,onStep){const pl=plan(p),out=[],pngs={};let i=0;
 for(const f of pl){if(f.kind==='png'){const b=await png(f.svg,f.w,f.h);pngs[f.path]=b;out.push({name:f.path,data:b})}
  else if(f.kind==='ico')out.push({name:f.path,data:ico(f.sizes.map(s=>({size:s,data:pngs['favicon/favicon-'+s+'.png']})))});
  else if(f.kind==='pdf')out.push({name:f.path,data:pdfBytes});else out.push({name:f.path,data:f.data});if(onStep)onStep(++i,pl.length)}
 return out}

// ---- the section under the chosen kit ----
const CSS='/shell/brand-package.css';
const el=(tag,text,cls)=>{const n=dom().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
// Inline SVG (already sanitized: shapes and text only) so the web fonts of the page apply.
const inline=(svg,cls)=>{const d=el('div',undefined,cls);d.innerHTML=IS.sanitizeSvg(svg);return d};
async function contactsFor(ctx){let profile=ctx.profile;if(!profile&&ctx.workspace&&ctx.workspace.projects&&ctx.projectId){try{profile=(await ctx.workspace.projects.get(ctx.projectId)).profile}catch(e){/* contacts are optional */}}
 try{const v=PS.prefill(profile||{},{projectName:ctx.projectName,summary:ctx.project});return {phone:v.phone,email:v.email,website:v.website,address:v.address}}catch(e){return {}}}
// ctx: the identity studio's ctx plus holder (gets .manifest once ready) and onReady(p).
function packageView(k,brand,ctx={}){const d=dom();if(!d.querySelector('link[data-brand-package]')){const l=d.createElement('link');l.rel='stylesheet';l.href=CSS;l.dataset.brandPackage='1';d.head.append(l)}
 const wrap=el('div',undefined,'bp'),head=el('div',undefined,'bp-head'),st=el('p','Preparo le versioni del logo e il brand book…','tool-status bp-status');st.setAttribute('role','status');
 const hgroup=el('div');hgroup.append(el('p','Consegna da agenzia','bp-eyebrow'),el('h4','Pacchetto logo e brand book'),el('p','Generato qui dal logo, dai colori e dai font scelti: nessuna chiamata AI, nessun costo.','bp-sub'));
 const dz=button('Scarica il pacchetto (.zip)','primary'),dp=button('Brand book (PDF)'),acts=el('div',undefined,'bp-actions');dz.disabled=dp.disabled=true;acts.append(dz,dp);head.append(hgroup,acts);
 const body=el('div',undefined,'bp-body');wrap.append(head,st,body);
 let p=null,doc=null,busy=false;
 (async()=>{try{await fontsReady([...logoFamilies(k.logo),...(k.fonts||[]).flatMap(f=>[f.heading,f.body])]);
  const measure=canvasMeasure();p=build(k,brand,{measure});doc=bookDoc(p,{contacts:await contactsFor(ctx),measure});
  if(ctx.holder)ctx.holder.manifest=manifest(p);render();dz.disabled=dp.disabled=false;st.textContent='Pronto: '+p.variants.length+' versioni del logo, favicon, avatar e brand book di '+doc.pages.length+' pagine.';if(ctx.onReady)ctx.onReady(p)}
  catch(e){st.textContent='Pacchetto non preparato: '+e.message}})();
 async function makePdf(){st.textContent='Impagino il brand book con i font del brand…';return bookPdf(await withFonts(doc),{date:new Date()})}
 dp.onclick=async()=>{if(busy||!doc)return;busy=true;dp.disabled=true;try{const b=await makePdf();st.textContent='Scaricato: '+download('brand-book-'+p.base+'.pdf',b,'application/pdf')+' · '+doc.pages.length+' pagine A4 orizzontali.'}catch(e){st.textContent='Brand book non creato: '+e.message}finally{busy=false;dp.disabled=false}};
 dz.onclick=async()=>{if(busy||!p)return;const Z=root.RadixZip||ZIP;if(!Z){st.textContent='Il generatore .zip non si è caricato: ricarica la pagina.';return}busy=true;dz.disabled=true;
  try{const pdfBytes=await makePdf(),files=await packageFiles(p,pdfBytes,(i,n)=>{st.textContent='Preparo i file: '+i+' di '+n+'…'});const bytes=Z.zip(files);Z.unzip(bytes);
   st.textContent='Scaricato: '+download(zipName(p),new root.Blob([bytes],{type:'application/zip'}))+' · '+files.length+' file ('+Math.round(bytes.length/1024)+' KB).'}
  catch(e){st.textContent='Pacchetto non creato: '+e.message}finally{busy=false;dz.disabled=false}};
 function render(){const sec=(t,sub,...xs)=>{const s=el('section',undefined,'bp-sec');const h=el('div',undefined,'bp-sec-head');h.append(el('h5',t));if(sub)h.append(el('p',sub,'bp-note'));s.append(h,...xs);return s};
  const grid=el('div',undefined,'bp-variants');p.variants.forEach(v=>{const f=el('figure',undefined,'bp-variant');f.dataset.variant=v.id;const art=inline(v.svg,'bp-art');art.style.background=v.dark?colourOf(k.palette,'dark'):v.id==='nero'||v.id==='monocolore'?'#FFFFFF':colourOf(k.palette,'light');
   const cap=el('figcaption');cap.append(el('b',v.label),el('span','SVG · PNG 512, 1024, 2048','bp-formats'),el('span','Minimo '+v.min.mm+' mm · '+v.min.px+' px','bp-min'));f.append(art,cap);grid.append(f)});
  const hv=p.variants[0],cl=hv.clear,vb=PS.viewBox(hv.svg),pad=cl.x,rule=el('div',undefined,'bp-rule'),ac=bookColours(k.palette).accent;
  rule.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[vb[0]-pad,vb[1]-pad,vb[2]+2*pad,vb[3]+2*pad].map(num).join(' ')+'" role="img" aria-label="Area di rispetto del logo"><rect x="'+num(vb[0]-pad)+'" y="'+num(vb[1]-pad)+'" width="'+num(vb[2]+2*pad)+'" height="'+num(vb[3]+2*pad)+'" fill="none" stroke="'+ac+'" stroke-width="'+num(vb[3]/90)+'" stroke-dasharray="'+num(vb[3]/30)+' '+num(vb[3]/45)+'"/>'+innerOf(hv.svg)+'</svg>';
  rule.style.background=colourOf(k.palette,'light');
  const facts=el('ul',undefined,'bp-facts');[['Area di rispetto','X = metà dell’altezza del logotipo ('+Math.round(cl.ratio*100)+'% dell’altezza del logo)'],...p.variants.slice(0,4).map(v=>[v.label.replace(/ \(.*\)$/,''),'minimo '+v.min.mm+' mm in stampa, '+v.min.px+' px sullo schermo'])].forEach(([a,b])=>{const li=el('li');li.append(el('b',a),el('span',b));facts.append(li)});
  const checks=el('ul',undefined,'bp-checks');p.checks.forEach(c=>{const li=el('li',c.text);li.dataset.ok=String(c.ok);checks.append(li)});
  const rules=el('div',undefined,'bp-rules');const rc=el('div');rc.append(facts,checks);rules.append(rule,rc);
  const icons=el('div',undefined,'bp-icons'),light=colourOf(k.palette,'light');
  p.favicons.filter(f=>[16,32,48,180].includes(f.size)).forEach(f=>{const fig=el('figure',undefined,'bp-icon'),img=el('img');img.alt='Favicon '+f.size+' px';img.width=img.height=f.size>64?64:f.size;img.dataset.size=String(f.size);
   png(f.svg,f.size,f.size).then(b=>{img.src=root.URL.createObjectURL(new root.Blob([b],{type:'image/png'}))}).catch(()=>{img.src=IS.svgUrl(f.svg)});fig.append(img,el('figcaption',f.size===180?'180 · Home':f.size+' px'));icons.append(fig)});
  p.avatars.forEach(a=>{const fig=el('figure',undefined,'bp-avatar');fig.append(inline(a.svg,'bp-avatar-art'),el('figcaption',a.label+' · 1080 px'));icons.append(fig)});void light;
  const book=el('div',undefined,'bp-book');doc.pages.forEach((pg,i)=>{const f=el('figure',undefined,'bp-page');f.dataset.page=String(i+1);const art=el('div',undefined,'bp-page-art');art.innerHTML=bookSvg(doc,i);
   f.append(art,el('figcaption',String(i+1).padStart(2,'0')+' · '+pg.label));book.append(f)});
  body.replaceChildren(sec('Versioni del logo','8 versioni, ognuna in SVG e in PNG trasparente.',grid),sec('Area di rispetto e misure minime','Calcolate dal logo, non scritte a mano.',rules),
   sec('Favicon e social','Le icone del sito e l’avatar con il simbolo dentro il cerchio.',icons),sec('Brand book','A4 orizzontale · '+doc.pages.length+' pagine · scorri per sfogliarlo.',book),
   el('p','Il logo è una bozza di lavoro: verifica il marchio su UIBM, TMview e WIPO prima di usarlo. I valori CMYK sono approssimati: confermali in tipografia.','bp-warn'))}
 return wrap}

return Object.freeze({VERSION,PNG_SIZES,VARIANTS,BOOK_PAGES,SECTIONS,paint,rgbOf,cmyk,mix,contrastPairs,bookColours,tree,serialize,leaves,classify,split,mono,variants,clearSpace,minSize,
 iconSvg,avatarSvg,ico,webManifest,typeScale,build,plan,zipName,readme,manifest,paletteJson,hueShift,rotated,effects,bookDoc,bookSvg,bookPdf,svgClean,
 canvasMeasure,fontsReady,draw,canvasOf,png,withFonts,packageFiles,packageView});
});
