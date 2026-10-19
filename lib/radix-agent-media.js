/* RADIX agent actions — the v3.7 tools that turn an agent's output into something real:
   carousel slides (PNG, optional AI photo backgrounds), Higgsfield images, HeyGen draft videos, Buffer queue and email.
   Ported from index.html v3.7 with the same safety rule: nothing leaves RADIX without a person
   pressing the button and confirming. The external services stay behind the existing /api/integrations. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixAgentMedia=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const RADIX_HEX=['#0F2D24','#6B7F72','#EDE6DE','#FAF9F6','#1F1F1F'];
const doc=()=>root.document;
const el=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
// Local fallback; pages pass ctx.prefs {get,set} to share choices with the team.
const pref=(key,value)=>{try{if(value===undefined)return root.localStorage.getItem('radix-agent-pref:'+key);root.localStorage.setItem('radix-agent-pref:'+key,value)}catch(e){return null}};
async function json(res,fallback){const d=await res.json().catch(()=>({}));if(!res.ok)throw Error(d.error||fallback);return d}

// ---- carousel (---SLIDES--- n|#bg|#fg|testo ---FINE---) ----
// Optional last field: the layout of a single image (statement, quote, question, list, stat).
const LAYOUTS=['statement','quote','question','list','stat'];
function parseSlides(text){
 const m=/---SLIDES---([\s\S]*?)---FINE---/.exec(text||'');if(!m)return [];
 return m[1].split('\n').map(l=>l.trim()).filter(Boolean).map(l=>l.split('|')).filter(p=>p.length>=4).map(p=>{const last=p.length>4?p[p.length-1].trim().toLowerCase():'',layout=LAYOUTS.includes(last)?last:'';const parts=layout?p.slice(3,-1):p.slice(3);return {num:p[0].trim(),bg:p[1].trim(),fg:p[2].trim(),text:parts.join('|').trim(),...(layout?{layout}:{})}})
  .filter(s=>/^#[0-9a-fA-F]{6}$/.test(s.bg)&&/^#[0-9a-fA-F]{6}$/.test(s.fg)&&s.text).slice(0,20);
}
const stripSlides=t=>String(t||'').replace(/\n?---SLIDES---[\s\S]*?---FINE---/,'').trim();
function shortLabel(p){if(!p)return 'RADIX';if(p.id==='radix')return 'RADIX';if(p.id==='personal')return 'FRANCESCO ILARI';return String(p.name||'').split(/\s[—–-]\s/)[0].toUpperCase().slice(0,28)}
function palette(p){const hexes=p&&p.visual?(String(p.visual).match(/#[0-9a-fA-F]{6}/g)||[]):[];return hexes.length>=2?hexes:RADIX_HEX}
function rgba(hex,a){const h=hex.replace('#','');return 'rgba('+parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16)+','+a+')'}
function wrapText(ctx,text,cx,cy,maxWidth,lineHeight){
 const lines=[];let line='';
 String(text).split(' ').forEach(w=>{const t=line?line+' '+w:w;if(ctx.measureText(t).width>maxWidth&&line){lines.push(line);line=w}else line=t});
 if(line)lines.push(line);const startY=cy-((lines.length-1)*lineHeight)/2;ctx.textAlign='center';lines.forEach((l,i)=>ctx.fillText(l,cx,startY+i*lineHeight));ctx.textAlign='left';
}
// Layout of a single image when the Art Director gives none: read from the sentence itself.
function autoLayout(text){const t=String(text||'').trim();if(/\?\s*$/.test(t))return 'question';if(/^[«"“]/.test(t))return 'quote';if(t.split(/\s*(?:·|;|\n)\s*/).filter(Boolean).length>=3)return 'list';if(/\d/.test(t))return 'stat';return 'statement'}
function hashOf(text){let h=2166136261;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function luminance(hex){const h=hex.replace('#','');const c=[0,2,4].map(i=>{const v=parseInt(h.slice(i,i+2),16)/255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]}
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
// Background, text and accent for one post: the brand palette in turn, so posts of a project differ but stay on brand.
function schemeFor(slide,project){const pal=[...new Set([slide.bg,slide.fg,...palette(project)])].filter(h=>/^#[0-9a-fA-F]{6}$/.test(h));const pairs=[];
 for(const bg of pal)for(const fg of pal)if(bg!==fg&&contrast(bg,fg)>=4.5)pairs.push([bg,fg]);
 if(!pairs.length)return {bg:slide.bg,fg:slide.fg,accent:slide.fg};const [bg,fg]=pairs[hashOf(slide.text)%pairs.length];
 const accent=pal.filter(h=>h!==bg&&h!==fg).sort((a,b)=>contrast(b,bg)-contrast(a,bg))[0]||fg;return {bg,fg,accent:contrast(accent,bg)>=2?accent:fg}}
function linesOf(ctx,text,maxWidth){const lines=[];let line='';String(text).split(/\s+/).forEach(w=>{const t=line?line+' '+w:w;if(ctx.measureText(t).width>maxWidth&&line){lines.push(line);line=w}else line=t});if(line)lines.push(line);return lines}
function fitText(ctx,text,maxWidth,maxHeight,weight,start,family){const f=(family||'Montserrat')+', sans-serif';let size=start;for(;size>30;size-=4){ctx.font=weight+' '+size+'px '+f;if(linesOf(ctx,text,maxWidth).length*size*1.18<=maxHeight)break}ctx.font=weight+' '+size+'px '+f;return {size,lines:linesOf(ctx,text,maxWidth)}}
function drawLines(ctx,lines,x,y,size){lines.forEach((l,i)=>ctx.fillText(l,x,y+i*Math.round(size*1.18)))}
// A client's style guide written in the profile's «Identità visiva» (one colour per role: copertina, pagine, testo, parole chiave, accento; font; firma).
// With one, every image follows its rules instead of rotating the palette.
const FONTS=['Inter','Montserrat','Poppins','Lato','Roboto','Open Sans','Playfair Display','Lora','Raleway','Work Sans'];
function styleGuide(p){const v=String(p&&p.visual||'');if(!v)return null;const g={};
 for(const seg of v.split(/\n|;|\.\s+/)){const h=(seg.match(/#[0-9a-fA-F]{6}\b/)||[])[0];if(!h)continue;const s=seg.toLowerCase();
  const role=/\btest[oi]\b|\btext\b/.test(s)?'text':/copertin|cover|chiusura/.test(s)?'cover':/pagin|sfond|background/.test(s)?'page':/chiav|numer|keyword/.test(s)?'key':/accent|evidenz|highlight/.test(s)?'accent':'';if(role&&!g[role])g[role]=h.toUpperCase()}
 if(!g.cover||!g.page)return null;g.key=g.key||g.accent||g.cover;g.accent=g.accent||g.key;g.text=g.text||g.cover;
 const fl=v.split(/\n|;|\.\s+/).find(x=>/font|tipograf/i.test(x))||'';g.font=FONTS.find(f=>new RegExp('\\b'+f+'\\b','i').test(fl))||FONTS.find(f=>new RegExp('\\b'+f+'\\b').test(v))||'Inter';
 const sig=/firma[:\s]+(.+?)(?:\s+in alto.*|\s*$)/i.exec(v.split(/\n|;|\.\s+/).find(x=>/firma/i.test(x))||'');g.signature=sig?sig[1].trim().slice(0,40):shortLabel(p);return g}
const sentences=t=>String(t).split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean);
// Cover and closing on the dark colour, inner pages on the light one; key colour to orient, accent to highlight; two weights; signature top left, numbering at the bottom.
function renderGuide(slide,index,total,project,g){
 const c=doc().createElement('canvas');c.width=1080;c.height=1350;const ctx=c.getContext('2d'),W=c.width,H=c.height,M=120,F=g.font,text=String(slide.text).trim(),layout=total>1?(slide.layout||'statement'):(slide.layout||autoLayout(text));
 const dark=total>1?(index===0||index===total-1):(layout==='list'||layout==='quote'?false:hashOf(text)%2===0);
 const bg=dark?g.cover:g.page,fg=dark?g.page:g.cover,body=dark?rgba(g.page,.82):g.text,key=dark?g.accent:g.key,font=(w,s)=>w+' '+s+'px '+F+', sans-serif';
 ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);ctx.textBaseline='top';
 if(!dark){ctx.strokeStyle=g.key;ctx.lineWidth=3;ctx.strokeRect(56,56,W-112,H-112)}
 ctx.fillStyle=dark?rgba(g.page,.8):g.key;ctx.font=font(400,28);ctx.fillText(g.signature,M,M);
 if(total>1){ctx.fillStyle=dark?rgba(g.page,.6):g.text;ctx.font=font(400,24);ctx.fillText(String(index+1).padStart(2,'0')+' / '+String(total).padStart(2,'0'),M,H-M-24)}
 const maxW=W-2*M,parts=sentences(text);
 if(layout==='stat'){const m=/(\d[\d.,]*\s?(?:%|€|k|K|x|mila|ore|giorni|mesi|anni)?)/.exec(text),big=m?m[1].trim():'';ctx.fillStyle=key;const bs=big.length<=4?280:big.length<=7?200:150;ctx.font=font(700,bs);ctx.fillText(big,M-6,300);ctx.fillStyle=fg;const t=fitText(ctx,text,maxW,480,'400',60,F);drawLines(ctx,t.lines,M,340+bs,t.size)}
 else if(layout==='list'){const items=text.split(/\s*(?:·|;|\n)\s*/).filter(Boolean).slice(0,5);let y=Math.max(M+120,(H-items.length*150)/2);items.forEach((it,i)=>{ctx.fillStyle=g.key;ctx.font=font(700,56);ctx.fillText(String(i+1).padStart(2,'0'),M,y);ctx.fillStyle=fg;const t=fitText(ctx,it,maxW-130,170,'400',46,F);drawLines(ctx,t.lines,M+130,y+6,t.size);y+=Math.max(150,t.lines.length*Math.round(t.size*1.18)+60)})}
 else if(layout==='quote'){ctx.fillStyle=fg;const t=fitText(ctx,text.replace(/^[«"“]|[»"”]$/g,''),maxW,620,'400',76,F),y=Math.max(M+300,(H-t.lines.length*Math.round(t.size*1.18))/2+60);ctx.fillStyle=g.accent;ctx.font=font(700,240);ctx.fillText('“',M-10,y-260);ctx.fillStyle=fg;ctx.font=font(400,t.size);drawLines(ctx,t.lines,M,y,t.size);ctx.fillStyle=g.accent;ctx.fillRect(M,H-M-120,96,6)}
 else{const head=parts.length>1&&parts[0].length<=90?parts[0]:text,rest=head===text?'':text.slice(text.indexOf(parts[0])+parts[0].length).trim();
  const lead=fitText(ctx,head,maxW,rest?520:760,'700',96,F),shortRest=rest&&rest.length<=70;let restT=null;
  if(rest){ctx.font=font(shortRest?700:400,shortRest?lead.size:44);restT=shortRest?{size:lead.size,lines:linesOf(ctx,rest,maxW)}:fitText(ctx,rest,maxW,360,'400',46,F)}
  const lh=s=>Math.round(s*1.18),hHead=lead.lines.length*lh(lead.size),hRest=restT?restT.lines.length*lh(restT.size)+(shortRest?0:48):0;let y=Math.max(M+120,(H-hHead-hRest)/2);
  ctx.fillStyle=fg;ctx.font=font(700,lead.size);drawLines(ctx,lead.lines,M,y,lead.size);y+=hHead;
  if(restT){if(shortRest){ctx.fillStyle=dark?g.accent:g.key;ctx.font=font(700,restT.size)}else{y+=48;ctx.fillStyle=body;ctx.font=font(400,restT.size)}drawLines(ctx,restT.lines,M,y,restT.size)}
  if(layout==='question'||!rest){ctx.fillStyle=g.accent;ctx.fillRect(M,H-M-120,96,6)}}
 return c}
// One image for a single post, in five layouts and several treatments, so a feed does not look like the same card.
function renderPost(slide,project){
 const g=styleGuide(project);if(g)return renderGuide(slide,0,1,project,g);
 const c=doc().createElement('canvas');c.width=1080;c.height=1350;const ctx=c.getContext('2d'),{bg,fg,accent}=schemeFor(slide,project),layout=slide.layout||autoLayout(slide.text),v=hashOf(slide.text+layout)%3,W=c.width,H=c.height,M=96;
 ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);ctx.textBaseline='top';
 if(v===1){ctx.fillStyle=rgba(accent,.18);ctx.beginPath();ctx.moveTo(0,H*.62);ctx.lineTo(W,H*.42);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill()}
 else if(v===2){ctx.strokeStyle=rgba(accent,.55);ctx.lineWidth=6;ctx.strokeRect(48,48,W-96,H-96)}
 else{const g=ctx.createRadialGradient(W*.85,H*.12,0,W*.85,H*.12,W*.7);g.addColorStop(0,rgba(accent,.28));g.addColorStop(1,rgba(accent,0));ctx.fillStyle=g;ctx.fillRect(0,0,W,H)}
 const kicker=shortLabel(project);ctx.fillStyle=fg;ctx.globalAlpha=.8;ctx.font='700 28px Montserrat, sans-serif';ctx.fillText(kicker,M,M);ctx.globalAlpha=1;
 const text=String(slide.text).trim();ctx.fillStyle=fg;
 if(layout==='quote'){ctx.fillStyle=accent;ctx.font='800 300px Georgia, serif';ctx.fillText('“',M-12,170);ctx.fillStyle=fg;const t=fitText(ctx,text.replace(/^[«"“]|[»"”]$/g,''),W-2*M,560,'700 italic',76);drawLines(ctx,t.lines,M,470,t.size);ctx.fillStyle=accent;ctx.fillRect(M,H-210,120,8);ctx.fillStyle=fg;ctx.font='600 30px Inter, sans-serif';ctx.fillText(kicker.charAt(0)+kicker.slice(1).toLowerCase(),M,H-180)}
 else if(layout==='question'){ctx.fillStyle=rgba(accent,.22);ctx.font='900 900px Montserrat, sans-serif';ctx.textAlign='right';ctx.fillText('?',W+40,240);ctx.textAlign='left';ctx.fillStyle=fg;const t=fitText(ctx,text,W-2*M-40,640,'800',84);drawLines(ctx,t.lines,M,H-M-90-t.lines.length*Math.round(t.size*1.18),t.size);ctx.fillStyle=accent;ctx.fillRect(M,H-M-50,160,10)}
 else if(layout==='list'){const items=text.split(/\s*(?:·|;|\n)\s*/).filter(Boolean).slice(0,5);let y=260;items.forEach((it,i)=>{ctx.fillStyle=accent;ctx.font='800 64px Montserrat, sans-serif';ctx.fillText(String(i+1).padStart(2,'0'),M,y);ctx.fillStyle=fg;const t=fitText(ctx,it,W-2*M-140,170,'700',50);drawLines(ctx,t.lines,M+140,y+6,t.size);y+=Math.max(130,t.lines.length*Math.round(t.size*1.18)+60)})}
 else if(layout==='stat'){const m=/(\d[\d.,]*\s?(?:%|€|k|K|x|mila|ore|giorni|mesi|anni)?)/.exec(text),big=m?m[1].trim():'';const rest=text;ctx.fillStyle=accent;const bs=big.length<=4?300:big.length<=7?220:160;ctx.font='900 '+bs+'px Montserrat, sans-serif';ctx.fillText(big,M-8,260);ctx.fillStyle=fg;const t=fitText(ctx,rest,W-2*M,520,'700',62);drawLines(ctx,t.lines,M,300+bs,t.size)}
 else{ctx.fillStyle=accent;ctx.fillRect(M,300,14,600);ctx.fillStyle=fg;const t=fitText(ctx,text,W-2*M-60,700,'800',90);drawLines(ctx,t.lines,M+60,600-t.lines.length*Math.round(t.size*1.18)/2,t.size)}
 return c}
// A Higgsfield photo with the post's headline: full-bleed photo, headline on a band in the cover colour of the style guide
// (or on a dark gradient without one), signature top left. Size follows the photo's format.
const PHOTO_SIZES={'4:5':[1080,1350],'1:1':[1080,1080],'9:16':[1080,1920],'16:9':[1920,1080]};
function renderPhotoPost(img,headline,project,ratio){
 const [W,H]=PHOTO_SIZES[ratio]||PHOTO_SIZES['4:5'],c=doc().createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d'),g=styleGuide(project),F=g?g.font:'Montserrat',M=Math.round(W*.09);
 const s=Math.max(W/img.width,H/img.height),w=img.width*s,h=img.height*s;ctx.drawImage(img,(W-w)/2,(H-h)/2,w,h);ctx.textBaseline='top';
 const sig=g?g.signature:shortLabel(project);ctx.font='700 26px '+F+', sans-serif';const sw=ctx.measureText(sig).width;
 ctx.fillStyle=g?rgba(g.cover,.86):'rgba(0,0,0,.55)';ctx.fillRect(M-18,M-14,sw+36,54);ctx.fillStyle=g?g.page:'#FFFFFF';ctx.fillText(sig,M,M);
 const text=String(headline||'').trim();if(!text)return c;
 const t=fitText(ctx,text,W-2*M,H*.24,'700',H>W?78:64,F),lh=Math.round(t.size*1.18),band=t.lines.length*lh+2*M*.8;
 if(g){ctx.fillStyle=g.cover;ctx.fillRect(0,H-band,W,band);ctx.fillStyle=g.accent;ctx.fillRect(M,H-band+M*.45,96,6)}
 else{const gr=ctx.createLinearGradient(0,H-band*1.6,0,H);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(0,0,0,.82)');ctx.fillStyle=gr;ctx.fillRect(0,H-band*1.6,W,band*1.6)}
 ctx.fillStyle=g?g.page:'#FFFFFF';ctx.font='700 '+t.size+'px '+F+', sans-serif';drawLines(ctx,t.lines,M,H-band+M*.8,t.size);return c}
// Same design as v3.7 v2.5: 4:5 slide, glow alternating sides, numbered badge, progress dots.
function renderSlide(slide,index,total,bgImage,project){
 if(total===1&&!bgImage)return renderPost(slide,project);
 if(!bgImage){const g=styleGuide(project);if(g)return renderGuide(slide,index,total,project,g)}
 const c=doc().createElement('canvas');c.width=1080;c.height=1350;const ctx=c.getContext('2d'),fg=bgImage?'#FFFFFF':slide.fg;
 if(bgImage){
  const s=Math.max(c.width/bgImage.width,c.height/bgImage.height),w=bgImage.width*s,h=bgImage.height*s;ctx.drawImage(bgImage,(c.width-w)/2,(c.height-h)/2,w,h);
  const o=ctx.createLinearGradient(0,0,0,c.height);o.addColorStop(0,'rgba(15,15,15,0.35)');o.addColorStop(.55,'rgba(15,15,15,0.4)');o.addColorStop(1,'rgba(15,15,15,0.72)');ctx.fillStyle=o;ctx.fillRect(0,0,c.width,c.height);
 }else{
  ctx.fillStyle=slide.bg;ctx.fillRect(0,0,c.width,c.height);
  const right=index%2===0,bx=right?c.width*.88:c.width*.1,by=c.height*.1,g=ctx.createRadialGradient(bx,by,0,bx,by,c.width*.62);
  g.addColorStop(0,rgba(slide.fg,.14));g.addColorStop(1,rgba(slide.fg,0));ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height);
  ctx.strokeStyle=rgba(slide.fg,.16);ctx.lineWidth=2;ctx.beginPath();if(right)ctx.arc(0,c.height,190,-Math.PI/2,0);else ctx.arc(c.width,c.height,190,Math.PI,Math.PI*1.5);ctx.stroke();
 }
 const kicker=shortLabel(project);ctx.fillStyle=fg;ctx.globalAlpha=.75;ctx.font='700 26px Montserrat, sans-serif';ctx.textBaseline='alphabetic';ctx.fillText(kicker,64,80);
 const kw=ctx.measureText(kicker).width;ctx.globalAlpha=1;ctx.strokeStyle=rgba(fg,.4);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(64,96);ctx.lineTo(64+kw,96);ctx.stroke();
 const r=27,bx2=c.width-64-r,by2=64+r;ctx.beginPath();ctx.arc(bx2,by2,r,0,Math.PI*2);ctx.fillStyle=rgba(fg,.15);ctx.fill();ctx.fillStyle=fg;ctx.font='700 21px Inter, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(index+1),bx2,by2+1);ctx.textAlign='left';
 const len=slide.text.length,size=len<45?68:len<80?58:len<130?48:len<190?40:34;ctx.fillStyle=fg;ctx.font='800 '+size+'px Montserrat, sans-serif';ctx.textBaseline='middle';wrapText(ctx,slide.text,c.width/2,c.height/2,c.width-176,Math.round(size*1.2));
 if(total>1){const dr=5,gap=16,tw=total*dr*2+(total-1)*gap,sx=c.width/2-tw/2+dr,dy=c.height-60;for(let d=0;d<total;d++){ctx.beginPath();ctx.arc(sx+d*(dr*2+gap),dy,d===index?dr+1.5:dr,0,Math.PI*2);ctx.fillStyle=rgba(fg,d===index?.95:.3);ctx.fill()}}
 if(index===0&&total>1){ctx.fillStyle=fg;ctx.globalAlpha=.55;ctx.font='600 20px Inter, sans-serif';ctx.textAlign='right';ctx.fillText('scorri →',c.width-60,c.height-110);ctx.textAlign='left';ctx.globalAlpha=1}
 return c;
}
function downloadCanvas(canvas,name){canvas.toBlob(b=>{if(!b)return;const u=URL.createObjectURL(b),a=el('a');a.href=u;a.download=name;doc().body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)},'image/png')}
function slideImagePrompt(slide,project){
 const subject=project&&project.id!=='radix'&&project.summary?'un\'ambientazione coerente con questo progetto: '+String(project.summary).slice(0,220):'un ambiente business/startup italiano moderno (ufficio, team al lavoro, una presentazione)';
 return 'Fotografia professionale in stile editoriale per un post LinkedIn B2B, non uno scatto da stock photo generico. Soggetto: '+subject+'. Atmosfera e composizione legate a questo concetto: "'+slide.text+
  '". Illuminazione naturale, palette cromatica tenue coerente con questi colori (la palette del brand): '+palette(project).slice(0,3).join(', ')+'. Nessun testo, nessuna scritta, nessun logo nell\'immagine. Composizione con aree di spazio negativo, pensata per avere del testo sovrapposto sopra.';
}
async function slideBackground(slide,project){
 const d=await json(await root.fetch('/api/openai-image',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:slideImagePrompt(slide,project)})}),'Errore generazione immagine');
 if(!/^data:image\//.test(String(d.image||'')))throw Error('Immagine ricevuta non valida');
 return new Promise((res,rej)=>{const img=new Image();img.onload=()=>res(img);img.onerror=()=>rej(Error('Immagine ricevuta non valida'));img.src=d.image});
}
function carouselTool(text,{project,prefix='radix-carosello'}={}){
 const slides=parseSlides(text);if(!slides.length)return null;
 const wrap=el('div',undefined,'tool'),open=button('🎨 Genera immagini carosello ('+slides.length+')','primary'),bg=new Array(slides.length).fill(null);let lastError='';
 wrap.append(open);
 async function draw(){
  try{const g=styleGuide(project);if(g&&doc().fonts)await Promise.all(['400','700'].map(w=>doc().fonts.load(w+' 40px '+g.font)));if(doc().fonts&&doc().fonts.ready)await doc().fonts.ready}catch(e){}
  const box=el('div',undefined,'gallery'),thumbs=el('div',undefined,'thumbs'),canvases=slides.map((s,i)=>renderSlide(s,i,slides.length,bg[i],project));
  canvases.forEach((c,i)=>{const t=el('div',undefined,'thumb');c.setAttribute('role','img');c.setAttribute('aria-label','Slide '+(i+1)+': '+slides[i].text);const b=button('Scarica '+(i+1));b.onclick=()=>downloadCanvas(c,prefix+'-slide'+(i+1)+'.png');t.append(c,b);thumbs.append(t)});
  const row=el('div',undefined,'actions'),all=button('Scarica tutte ('+canvases.length+')','primary');all.onclick=()=>canvases.forEach((c,i)=>setTimeout(()=>downloadCanvas(c,prefix+'-slide'+(i+1)+'.png'),i*250));
  const ai=button(bg.some(Boolean)?'🖼️ Rigenera sfondi AI':'🖼️ Genera sfondi fotografici AI (beta)'),st=el('span',lastError,'tool-status');
  ai.title='Usa la chiave OpenAI configurata su Vercel e consuma crediti a ogni immagine';
  ai.onclick=async()=>{
   if(!root.confirm('Generare '+slides.length+' immagini con OpenAI? Ogni immagine consuma crediti API.'))return;
   ai.disabled=true;lastError='';
   for(let i=0;i<slides.length;i++){ai.textContent='Genero '+(i+1)+'/'+slides.length+'…';try{bg[i]=await slideBackground(slides[i],project)}catch(e){lastError=e.message||'Errore generazione sfondo AI';if(/OPENAI_API_KEY/.test(lastError))break}}
   const next=await draw();box.replaceWith(next);
  };
  // A style guide means the client chose text-only images: no stock photos of strangers.
  row.append(all,...(styleGuide(project)?[]:[ai]),st);box.append(thumbs,row);return box;
 }
 open.onclick=async()=>{open.hidden=true;wrap.append(await draw())};
 return wrap;
}

// ---- HeyGen draft video (AI Specialist) ----
let heygenLists=null;
async function heygenOptions(){
 if(heygenLists)return heygenLists;
 const [a,v]=await Promise.all([root.fetch('/api/heygen?action=avatars',{credentials:'same-origin'}).then(r=>json(r,'Errore avatar')),root.fetch('/api/heygen?action=voices',{credentials:'same-origin'}).then(r=>json(r,'Errore voci'))]);
 return heygenLists={avatars:a.avatars||[],voices:v.voices||[]};
}
function select(labelText,items,saved){const l=el('label',labelText),s=el('select');items.forEach(i=>{const o=el('option',i.name+(i.language?' ('+i.language+')':''));o.value=i.id;s.append(o)});if(saved&&items.some(i=>i.id===saved))s.value=saved;l.append(s);return [l,s]}
// ctx.avatar: the avatar chosen for the project in Studio Avatar (photo avatar or HeyGen avatar, with its voice); without one the user picks from the account lists.
function videoTool(text,ctx={}){
 const P=prefsOf(ctx),script=String(text||'').trim();if(!script)return null;
 const saved=ctx.avatar&&ctx.avatar.id&&ctx.avatar.voiceId?ctx.avatar:null;
 const wrap=el('div',undefined,'tool'),open=button(saved?'🎬 Genera il video con '+saved.name:'🎬 Genera video bozza (HeyGen)','primary');wrap.append(open);
 if(!saved&&ctx.studioUrl){const a=el('a','✦ Crea prima l’avatar del progetto (Studio Avatar)');a.href=ctx.studioUrl;wrap.append(a)}
 async function run(panel,status,go,body,lock){
  if(!root.confirm('Generare un video bozza su HeyGen? Consuma crediti HeyGen; il video resta una bozza da controllare.'))return;
  lock(true);status.textContent='Avvio la generazione…';
  try{
   const d=await json(await root.fetch('/api/heygen',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'generate',script,...body})}),'Errore avvio generazione');
   for(let attempt=0;attempt<=100;attempt++){
    const s=await json(await root.fetch('/api/heygen?action=status&videoId='+encodeURIComponent(d.videoId),{credentials:'same-origin'}),'Errore stato video'),state=String(s.status||'').toLowerCase();
    if(['completed','success','done'].includes(state)){
     status.textContent='Bozza pronta: da controllare prima di pubblicare (il link scade dopo 7 giorni).';
     if(/^https:\/\//.test(String(s.videoUrl||''))){const v=el('video');v.controls=true;v.src=s.videoUrl;const a=el('a','Apri / scarica video');a.href=s.videoUrl;a.target='_blank';a.rel='noopener noreferrer';panel.append(v,a)}
     return;
    }
    if(state==='failed'||state==='error')throw Error(s.error?String(s.error):'HeyGen ha segnalato un errore nella generazione.');
    status.textContent='Genero il video bozza… ('+attempt*6+'s, stato: '+(state||'in corso')+')';await new Promise(r=>setTimeout(r,6000));
   }
   throw Error('Il video sta impiegando più del previsto. Riprova più tardi da HeyGen.');
  }catch(e){status.textContent='Non riuscito: '+e.message;lock(false)}
 }
 async function pickFromAccount(){
  open.disabled=true;open.textContent='Carico avatar e voci…';
  try{
   const lists=await heygenOptions();open.hidden=true;const panel=el('div',undefined,'panel'),status=el('p','','tool-status');
   if(!lists.avatars.length||!lists.voices.length){status.textContent='Nessun avatar o voce trovati sull’account HeyGen collegato.';panel.append(status);wrap.append(panel);return}
   const [al,as]=select('Avatar',lists.avatars,P.get('heygen-avatar')),[vl,vs]=select('Voce',lists.voices,P.get('heygen-voice')),go=button('Genera bozza','primary');
   panel.append(al,vl,go,status);wrap.append(panel);
   go.onclick=()=>{P.set('heygen-avatar',as.value);P.set('heygen-voice',vs.value);run(panel,status,go,{avatarId:as.value,voiceId:vs.value},on=>{go.disabled=as.disabled=vs.disabled=on})};
  }catch(e){open.disabled=false;open.textContent='🎬 Genera video bozza (HeyGen)';wrap.append(el('p','Non riuscito: '+e.message,'tool-status'))}
 }
 open.onclick=()=>{
  if(!saved)return pickFromAccount();
  open.hidden=true;const panel=el('div',undefined,'panel'),status=el('p','','tool-status'),who=el('p',saved.name+(saved.voiceName?' · voce '+saved.voiceName:''),'tool-status');
  if(/^https:\/\//.test(saved.imageUrl||'')){const img=el('img');img.src=saved.imageUrl;img.alt=saved.name;img.width=96;img.style.borderRadius='10px';panel.append(img)}
  const go=button('Genera bozza','primary'),other=button('Usa un altro avatar');
  panel.append(who,go,other,status);wrap.append(panel);
  go.onclick=()=>run(panel,status,go,{voiceId:saved.voiceId,...(saved.type==='talking_photo'?{talkingPhotoId:saved.id}:{avatarId:saved.id})},on=>{go.disabled=other.disabled=on});
  other.onclick=()=>{panel.remove();open.hidden=false;pickFromAccount()};
 };
 return wrap;
}

// ---- Higgsfield image (Art Director) ----
const HF_RATIOS=[['4:5','4:5 · post verticale'],['1:1','1:1 · quadrato'],['9:16','9:16 · storie e reel'],['16:9','16:9 · orizzontale']];
function imagePrompt(text,project){
 const brief=String(text||'').replace(/---SLIDES---[\s\S]*?---FINE---/g,'').replace(/\s+/g,' ').trim().slice(0,700);
 const who=project&&project.summary?' Progetto: '+String(project.summary).slice(0,220)+'.':'';
 return 'Fotografia editoriale professionale per i social di un brand B2B, non da stock.'+who+' Concetto: '+brief+' Luce naturale, composizione pulita, nessun testo o logo nell’immagine.';
}
function uuid(){const c=root.crypto;if(c&&typeof c.randomUUID==='function')return c.randomUUID();return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,ch=>{const r=Math.random()*16|0;return (ch==='x'?r:(r&3|8)).toString(16)})}
function imageTool(text,ctx={}){
 const P=prefsOf(ctx);if(!String(text||'').trim())return null;
 // With the guided studio loaded: questions, three proposals, choice, composition with the style guide.
 const S=root.RadixImageStudio;if(S&&doc()){const w=el('div',undefined,'tool'),open=button('📷 Foto con Higgsfield · 3 proposte','primary');w.append(open);
  open.onclick=()=>{open.hidden=true;w.append(S.photoStudio({project:ctx.project,concept:S.conceptFrom(stripSlides(text)),headline:''}))};return w}
 const wrap=el('div',undefined,'tool'),open=button('🖼️ Genera immagine (Higgsfield)','primary');wrap.append(open);
 open.onclick=()=>{
  open.hidden=true;const panel=el('div',undefined,'panel'),status=el('p','','tool-status'),pl=el('label','Descrizione dell’immagine'),area=el('textarea');
  area.rows=5;area.maxLength=2000;area.value=imagePrompt(text,ctx.project);pl.append(area);
  const rl=el('label','Formato'),rs=el('select');HF_RATIOS.forEach(([v,t])=>{const o=el('option',t);o.value=v;rs.append(o)});const saved=P.get('higgsfield-ratio');if(HF_RATIOS.some(r=>r[0]===saved))rs.value=saved;rl.append(rs);
  const go=button('Genera immagine','primary'),out=el('div',undefined,'gallery');panel.append(pl,rl,go,status,out);wrap.append(panel);
  go.onclick=async()=>{
   if(!area.value.trim()){status.textContent='Scrivi una descrizione dell’immagine.';return}
   if(!root.confirm('Generare un’immagine con Higgsfield? Ogni generazione consuma il saldo API di Higgsfield.'))return;
   go.disabled=area.disabled=rs.disabled=true;P.set('higgsfield-ratio',rs.value);status.textContent='Invio la richiesta a Higgsfield…';
   try{
    const d=await json(await root.fetch('/api/higgsfield',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'generate',prompt:area.value.trim(),aspectRatio:rs.value,requestKey:uuid()})}),'Errore avvio generazione');
    let s=d;
    for(let attempt=0;!s.done&&attempt<=60;attempt++){
     status.textContent='Genero l’immagine… ('+attempt*4+'s, stato: '+(s.status||'in coda')+')';await new Promise(r=>setTimeout(r,4000));
     s=await json(await root.fetch('/api/higgsfield?action=status&id='+encodeURIComponent(d.requestId),{credentials:'same-origin'}),'Errore stato immagine');
    }
    if(!s.done)throw Error('L’immagine sta impiegando più del previsto. Riprova più tardi.');
    if(s.status!=='completed'||!s.images.length)throw Error(s.error||'Higgsfield non ha prodotto immagini (stato: '+s.status+').');
    status.textContent='Immagine pronta: controllala prima di usarla.';
    s.images.forEach((u,i)=>{const t=el('div',undefined,'thumb'),img=el('img');img.src=u;img.alt='Immagine generata '+(i+1);img.loading='lazy';img.style.maxWidth='100%';const a=el('a','Apri / scarica');a.href=u;a.target='_blank';a.rel='noopener noreferrer';t.append(img,a);out.append(t)});
    go.textContent='Genera un’altra';
   }catch(e){status.textContent='Non riuscito: '+e.message}
   go.disabled=area.disabled=rs.disabled=false;
  };
 };
 return wrap;
}

// ---- Buffer queue (Copywriter) ----
let bufferChannels=null;
// opts.locked keeps the text read-only (PED: only the approved version goes out); opts.onQueued records the result.
function bufferTool(text,opts={}){
 const body=String(text||'').trim();if(!body)return null;
 const wrap=el('div',undefined,'tool'),open=button('📤 Invia a Buffer','primary');wrap.append(open);
 open.onclick=async()=>{
  open.disabled=true;open.textContent='Carico i canali…';
  try{
   bufferChannels=bufferChannels||((await json(await root.fetch('/api/buffer?action=channels',{credentials:'same-origin'}),'Errore canali Buffer')).channels||[]);
   open.hidden=true;const panel=el('div',undefined,'panel'),status=el('p','','tool-status');
   if(!bufferChannels.length){status.textContent='Nessun canale trovato sull’account Buffer collegato.';panel.append(status);wrap.append(panel);return}
   const [cl,cs]=select('Canale',bufferChannels.map(c=>({id:c.id,name:c.name+(c.service?' ('+c.service+')':'')})),prefsOf(opts).get('buffer-channel'));
   const lt=el('label','Testo del post'),ta=el('textarea');ta.value=body;ta.rows=8;ta.readOnly=!!opts.locked;lt.append(ta);const go=button('Metti in coda su Buffer','primary');
   panel.append(cl,lt,go,status);wrap.append(panel);
   go.onclick=async()=>{
    const ch=bufferChannels.find(c=>c.id===cs.value);
    if(!root.confirm('Questo mette DAVVERO in coda di pubblicazione su Buffer, canale "'+(ch?ch.name:cs.value)+'": verrà pubblicato al prossimo slot libero del calendario, non è una bozza salvata. Confermi l’invio?'))return;
    go.disabled=cs.disabled=ta.disabled=true;prefsOf(opts).set('buffer-channel',cs.value);status.textContent='Invio in corso…';
    try{const d=await json(await root.fetch('/api/buffer',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create',channelId:cs.value,text:ta.value})}),'Errore invio');
     status.textContent='Messo in coda su Buffer'+(d.dueAt?': uscirà il '+new Date(d.dueAt).toLocaleString('it-IT'):'')+'.';
     if(typeof opts.onQueued==='function')opts.onQueued({service:'buffer',channelId:cs.value,channelName:ch?ch.name:'',dueAt:d.dueAt||null,queuedAt:new Date().toISOString()})}
    catch(e){status.textContent='Non riuscito: '+e.message;go.disabled=cs.disabled=ta.disabled=false}
   };
  }catch(e){open.disabled=false;open.textContent='📤 Invia a Buffer';wrap.append(el('p','Non riuscito: '+e.message,'tool-status'))}
 };
 return wrap;
}

// ---- email (Specialista Email Outreach): one recipient, edited and confirmed each time ----
function parseEmailDraft(text){const t=String(text||''),s=/Oggetto:\s*(.+)/i.exec(t),b=/Corpo:\s*([\s\S]*)/i.exec(t);return {subject:s?s[1].trim():'',body:b?b[1].trim():t.trim()}}
function emailTool(text){
 const draftText=String(text||'').trim();if(!draftText)return null;const draft=parseEmailDraft(draftText);
 const wrap=el('div',undefined,'tool'),open=button('✉️ Invia questa email','primary');wrap.append(open);
 open.onclick=()=>{
  open.hidden=true;const panel=el('div',undefined,'panel'),status=el('p','','tool-status');
  const lto=el('label','A'),to=el('input');to.type='email';to.placeholder='destinatario@azienda.it';lto.append(to);
  const ls=el('label','Oggetto'),subj=el('input');subj.value=draft.subject;ls.append(subj);
  const lb=el('label','Testo'),ta=el('textarea');ta.rows=10;ta.value=draft.body;lb.append(ta);const go=button('Invia email','primary');
  panel.append(lto,ls,lb,go,status);wrap.append(panel);
  go.onclick=async()=>{
   const dest=to.value.trim();if(!dest||!to.checkValidity()){status.textContent='Inserisci un destinatario valido.';return}
   if(!root.confirm('Questo invia DAVVERO un’email a "'+dest+'" dalla tua casella: non è una bozza salvata. Confermi l’invio?'))return;
   go.disabled=to.disabled=subj.disabled=ta.disabled=true;status.textContent='Invio in corso…';
   try{await json(await root.fetch('/api/send-email',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({to:dest,subject:subj.value,body:ta.value,confirm:true})}),'Errore invio');status.textContent='Email inviata a '+dest+'.'}
   catch(e){status.textContent='Non riuscito: '+e.message;go.disabled=to.disabled=subj.disabled=ta.disabled=false}
  };
 };
 return wrap;
}

// Which tools an agent's output gets, as in v3.7 renderMessages.
function prefsOf(ctx){const p=ctx&&ctx.prefs;return p&&typeof p.get==='function'&&typeof p.set==='function'?p:{get:k=>pref(k),set:(k,v)=>pref(k,v)}}
const SERVICE_NAMES={heygen:'HeyGen',higgsfield:'Higgsfield',buffer:'Buffer',email:'l’email (Gmail)'};
// A tool whose service has no key on this deployment stays visible but disabled, with the reason.
function markService(tool,service){
 if(!tool||!root.RadixWorkspace||!root.RadixWorkspace.integrations)return tool;
 tool.dataset.service=service;
 root.RadixWorkspace.integrations().then(map=>{
  if(!map||map[service]!==false)return;
  tool.querySelectorAll('button').forEach(b=>{b.disabled=true});tool.dataset.connected='false';
  tool.append(el('p','Non collegato: manca la chiave di '+SERVICE_NAMES[service]+' sul server. Chiedi all’amministratore di aggiungerla su Vercel.','tool-status'));
 });
 return tool;
}
function toolsFor(agentId,text,ctx){
 const list=[];
 if(agentId==='art-director')list.push(carouselTool(text,ctx),markService(imageTool(text,ctx),'higgsfield'));
 if(agentId==='ai-specialist')list.push(markService(videoTool(text,ctx),'heygen'));
 if(agentId==='copywriter')list.push(markService(bufferTool(text,{prefs:ctx&&ctx.prefs}),'buffer'));
 if(agentId==='comm-email-outreach')list.push(markService(emailTool(text),'email'));
 return list.filter(Boolean);
}

return Object.freeze({RADIX_HEX,LAYOUTS,autoLayout,schemeFor,styleGuide,parseSlides,stripSlides,shortLabel,palette,slideImagePrompt,parseEmailDraft,renderSlide,renderPhotoPost,carouselTool,imagePrompt,imageTool,videoTool,bufferTool,emailTool,toolsFor});
});
