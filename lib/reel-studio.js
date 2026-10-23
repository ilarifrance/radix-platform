/* Studio Reel e video prodotto: a short video without an avatar, made in the browser from the client's own photos (and,
   if they want, a few short clips and a licensed music track), with burned-in subtitles. A few questions (goal, format,
   length, photos, product facts, call to action; colours and logo from the Kit identità), ONE AI call to the Video
   Producer that returns three storyboards as JSON (a hook in the first 2 seconds, 3-8 scenes with on-screen text and
   subtitle lines, a music mood word, the closing card with logo and call to action). RADIX flags numbers and claims the
   person did not write (as the other studios do) and quotes that are not word for word in a written testimonial.
   The person picks one storyboard and refines it (order, photo, motion, text, length of each scene, subtitle style,
   closing card), then RADIX draws it on a canvas and records it with MediaRecorder: WebM always, MP4 too when the
   browser can, at most 1080×1920 at 30 fps, no credits. Next to the video: subtitles as .srt and .vtt, the cover PNG
   and the storyboard text, one by one or in one zip (lib/zip-lite.js). The storyboard and the settings (not the photos)
   are saved in the project: the «agents» document under the key reels, keeping every other key as it is.
   Pure part (questions, timeline, subtitle cues, SRT/VTT, safe-zone layout, motion, prompt, parsing, checks, WebM
   duration, saved record) runs in Node for the tests; reelStudio() is the browser widget.
   The only paid step is the AI call, from a click with confirmation. «Anima con l’AI» (image-to-video) is not wired:
   api/_higgsfield.js only does text → image, see AI_MOTION below. No music and no voice are generated here. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixReelStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
// The styled RADIX confirmation (lib/radix-confirm.js) before every paid step; root.confirm only if it is missing.
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')))};
const AGENT='video-producer',COUNT=3,FACTS_MAX=1500,CTA_MAX=30,TEXT_MAX=40,END_SUB_MAX=60,MAX_PHOTOS=12,MAX_CLIPS=3,MAX_SAVED=20,FPS=30;
const PHOTO_BYTES=15e6,CLIP_BYTES=60e6,CLIP_SECONDS=30,AUDIO_BYTES=25e6,PHOTO_EDGE=2160;
// Seconds: shortest scene, the fade or slide into a scene, the fade into the closing card, the on-screen text fade-in.
const SCENE_MIN=1.5,TRANS=.45,END_FADE=.4,TITLE_IN=.3,HOOK_SECONDS=2,CPS_MAX=20;
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const adLib=()=>lib('RadixAdStudio','./ad-studio.js'),checksLib=()=>lib('RadixCopyChecks','./copy-checks.js'),identityLib=()=>lib('RadixIdentityStudio','./identity-studio.js'),zipLib=()=>lib('RadixZip','./zip-lite.js');
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const block=s=>String(s==null?'':s).replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const chars=s=>[...String(s)].length;
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>norm(s).replace(/ /g,'-').slice(0,40);
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));

// ---- questions ----
// [id, label, words for the prompt]
const GOALS=[
 ['lancio','Lancio prodotto','presentare un prodotto nuovo: cos’è, a chi serve, perché provarlo'],
 ['promo','Promo','promuovere l’offerta scritta qui, con il beneficio concreto'],
 ['backstage','Dietro le quinte','mostrare come lavoriamo: le persone, i gesti, il luogo'],
 ['tutorial','Tutorial','spiegare in pochi passi come si usa o come si fa'],
 ['testimonianza','Testimonianza','mostrare la testimonianza scritta di un cliente, parola per parola, sulle immagini']];
const CTA_FOR={lancio:'Scopri di più',promo:'Scrivici ora',backstage:'Seguici',tutorial:'Provalo anche tu',testimonianza:'Scopri di più'};
// Formats at most 1080×1920. `safe`: share of each side kept free of text. 9:16: the Reels/TikTok interface covers
// the top, the caption and buttons at the bottom and the action column on the right (prudent margins, as in the
// Studio Creatività: 14% on top, plus room at the bottom and on the right for the TikTok column).
const FORMATS=[
 {id:'9x16',label:'Reel e stories',sub:'9:16 · Instagram, Facebook, TikTok, Shorts',ratio:'9:16',w:1080,h:1920,lineMax:28,safe:{top:.14,bottom:.22,left:.06,right:.14}},
 {id:'1x1',label:'Quadrato',sub:'1:1 · feed',ratio:'1:1',w:1080,h:1080,lineMax:36,safe:{top:.07,bottom:.07,left:.07,right:.07}},
 {id:'16x9',label:'Orizzontale',sub:'16:9 · YouTube e sito',ratio:'16:9',w:1920,h:1080,lineMax:42,safe:{top:.07,bottom:.08,left:.06,right:.06}}];
const DURATIONS=[15,30,45,60];
// How many scenes a storyboard has, by length (the closing card is extra).
const SCENES={15:[3,4],30:[4,6],45:[5,7],60:[6,8]};
const MOTIONS=[['zoom-in','Zoom avanti'],['zoom-out','Zoom indietro'],['pan-left','Panoramica ←'],['pan-right','Panoramica →'],['slide','Scorrimento'],['fade','Dissolvenza']];
const STYLES=[['box','Riquadro'],['outline','Contorno'],['accent','Colore brand']];
const QUALITY=[['full','Piena · 1080p'],['light','Leggera · 720p']];
const MOODS=['calma','energica','emozionale','allegra','elegante','ritmata','ispirazionale','divertente'];
// Image-to-video for one scene. TODO(higgsfield-i2v): api/_higgsfield.js only exposes text → image («generate»,
// «status», «image»); there is no image-to-video action yet. When it exists, wire the button of each scene to it with its
// own confirmation and cost note, and swap the scene's photo for the returned clip. Until then no provider is called.
const AI_MOTION=Object.freeze({available:false,label:'Anima con l’AI',note:'Image-to-video con Higgsfield: non ancora collegato. Quando ci sarà, sarà 1 generazione video per scena, a pagamento, con conferma.'});

const goal=id=>GOALS.find(g=>g[0]===id)||null;
const format=id=>FORMATS.find(f=>f.id===id)||null;
function normalize(answers){const a=answers||{},g=goal(a.goal)?a.goal:'lancio';
 return {goal:g,format:format(a.format)?a.format:'9x16',duration:DURATIONS.includes(+a.duration)?+a.duration:15,
  style:STYLES.some(s=>s[0]===a.style)?a.style:'box',quality:QUALITY.some(q=>q[0]===a.quality)?a.quality:'full',cta:clean(a.cta).slice(0,CTA_MAX)||CTA_FOR[g]}}
// The canvas size of a render: the format at full size, or 2/3 of it (720p) for slower computers. Never above 1080×1920.
function renderSize(fmtId,quality){const f=format(fmtId)||FORMATS[0],k=quality==='light'?2/3:1,even=x=>2*Math.round(x/2);return {w:even(f.w*k),h:even(f.h*k),scale:k}}

// ---- timeline (tenths of a second, so the parts always add up) ----
const tenth=x=>Math.round(x*10);
// Integer parts of `total` proportional to the weights, each at least `min` (when it fits); they sum to `total` exactly.
function share(weights,total,min){const n=weights.length;if(!n)return [];const T=Math.max(0,Math.round(total)),m=Math.max(0,Math.min(Math.round(min||0),Math.floor(T/n)));
 const w=weights.map(x=>{x=Number(x);return Number.isFinite(x)&&x>0?x:1}),fixed=new Array(n).fill(false),x=new Array(n).fill(0);
 for(let k=0;k<=n;k++){const free=w.reduce((s,v,i)=>s+(fixed[i]?0:v),0),rest=T-fixed.filter(Boolean).length*m;let changed=false;
  for(let i=0;i<n;i++){if(fixed[i]){x[i]=m;continue}x[i]=free?w[i]*rest/free:0;if(x[i]<m){fixed[i]=true;changed=true}}
  if(!changed)break}
 const base=x.map((v,i)=>fixed[i]?m:Math.floor(v));let left=T-base.reduce((s,v)=>s+v,0);
 const order=x.map((v,i)=>[v-Math.floor(v),i]).filter(([,i])=>!fixed[i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]);
 for(let k=0;left>0&&order.length;k=(k+1)%order.length,left--)base[order[k][1]]++;
 for(let i=n-1;left>0;left--)base[i]++;
 return base}
// The closing card with logo and call to action: 2-4 s (2,5 s in a 15 s reel, else 3 s).
function endFor(total,want){const d=Number(want);return clamp(Number.isFinite(d)&&d>0?d:total<=15?2.5:3,2,4)}
// Scene windows from the wanted lengths (any numbers: they are weights), so that scenes + closing = total.
function timeline(durs,total,end){const T=tenth(total),E=tenth(endFor(total,end)),parts=share(durs||[],T-E,tenth(SCENE_MIN));let t=0;
 const scenes=parts.map(p=>{const s={start:t/10,dur:p/10,end:(t+p)/10};t+=p;return s});
 return {total:T/10,scenes,end:{start:t/10,dur:E/10,end:T/10}}}
// One scene set to `value` seconds; the others share the rest in proportion, so the total stays the same.
function setDuration(durs,i,value,total,end){const n=durs.length,m=tenth(SCENE_MIN),avail=tenth(total)-tenth(endFor(total,end));if(i<0||i>=n)return durs.slice();
 const v=clamp(tenth(Number(value)||SCENE_MIN),m,avail-(n-1)*m),others=share(durs.filter((_,k)=>k!==i),avail-v,m);
 const out=[];let k=0;for(let j=0;j<n;j++)out.push(j===i?v/10:others[k++]/10);return out}
function move(list,i,dir){const j=i+dir,out=list.slice();if(i<0||j<0||i>=list.length||j>=list.length)return out;[out[i],out[j]]=[out[j],out[i]];return out}

// ---- subtitles ----
// Greedy word wrap at `max` characters per line (a word longer than a line is cut).
function wrapLines(text,max){const out=[];let line='';
 for(let w of clean(text).split(' ').filter(Boolean)){while(chars(w)>max){if(line){out.push(line);line=''}out.push([...w].slice(0,max).join(''));w=[...w].slice(max).join('')}
  const t=line?line+' '+w:w;if(chars(t)>max&&line){out.push(line);line=w}else line=t}
 if(line)out.push(line);return out}
// A subtitle line → cues of at most 2 lines each.
// Two lines of a cue balanced: the split that keeps the longer line shortest («Lo impastiamo a mano, / ogni giorno»).
// A break after punctuation is better, one after an article or a preposition is worse.
const SHORT=/\s(?:il|lo|la|i|gli|le|un|uno|una|di|a|da|in|con|su|per|tra|fra|e|o|che|del|della|al|alla|nel|nella)$/i;
const breakScore=(a,b)=>Math.max(chars(a),chars(b))+(SHORT.test(' '+a)?5:0)-(/[,.;:!?]$/.test(a)?6:0);
function balance(lines,max){if(lines.length!==2)return lines;const w=lines.join(' ').split(' ');let best=lines,score=breakScore(lines[0],lines[1]);
 for(let k=1;k<w.length;k++){const a=w.slice(0,k).join(' '),b=w.slice(k).join(' '),m=breakScore(a,b);if(chars(a)<=max&&chars(b)<=max&&m<score){best=[a,b];score=m}}return best}
function cueChunks(text,max){const lines=wrapLines(text,max),out=[];for(let i=0;i<lines.length;i+=2)out.push(balance(lines.slice(i,i+2),max));return out}
// The cues of every scene, inside the scene's window, in proportion to their length (at least 0,8 s each when it fits).
function cues(scenes,tl,lineMax){const out=[],max=lineMax||42;
 (scenes||[]).forEach((s,i)=>{const w=tl.scenes[i];if(!w)return;const chunks=(s.subs||[]).map(clean).filter(Boolean).flatMap(t=>cueChunks(t,max));if(!chunks.length)return;
  const a=Math.round(w.start*1000),b=Math.round(w.end*1000),parts=share(chunks.map(c=>chars(c.join(' '))+8),b-a,800);let t=a;
  chunks.forEach((c,k)=>{out.push({start:t/1000,end:(t+parts[k])/1000,lines:c,scene:i});t+=parts[k]})});
 return out}
const cueAt=(list,t)=>(list||[]).find(c=>t>=c.start&&t<c.end)||null;
const cps=c=>Math.round(chars(c.lines.join(' '))/Math.max(.001,c.end-c.start)*10)/10;
function stamp(sec,sep){const ms=Math.max(0,Math.round(sec*1000)),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60,r=ms%1000;
 return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+sep+String(r).padStart(3,'0')}
const srt=list=>(list||[]).map((c,i)=>(i+1)+'\n'+stamp(c.start,',')+' --> '+stamp(c.end,',')+'\n'+c.lines.join('\n')+'\n').join('\n');
const vtt=list=>'WEBVTT\n\n'+(list||[]).map((c,i)=>(i+1)+'\n'+stamp(c.start,'.')+' --> '+stamp(c.end,'.')+'\n'+c.lines.join('\n')+'\n').join('\n');

// ---- safe zones and layout (format pixels) ----
function safeArea(f){const s=f.safe,x=Math.round(f.w*s.left),y=Math.round(f.h*s.top);return {x,y,w:f.w-x-Math.round(f.w*s.right),h:f.h-y-Math.round(f.h*s.bottom)}}
const R=(x,y,w,h)=>({x:Math.round(x),y:Math.round(y),w:Math.round(w),h:Math.round(h)});
// The boxes of a format: the on-screen text at the top of the safe area (up to 3 lines), the subtitles at its bottom
// (2 lines), and the closing card (logo, title, button, line under it) as a stack centred in the safe area.
function layout(f){const S=safeArea(f),u=Math.min(f.w,f.h),sub=Math.floor(Math.min(u*.056,S.w/(f.lineMax*.56))),subLine=Math.round(sub*1.3),pad=Math.round(sub*.42);
 const title=Math.round(Math.min(u*.085,S.w/(TEXT_MAX*.31))),titleLine=Math.round(title*1.12),gap=Math.round(u*.04);
 const titleBox=R(S.x,S.y,S.w,titleLine*3),subH=subLine*2+pad*2,subBox=R(S.x,S.y+S.h-subH,S.w,subH);
 const logoH=Math.round(u*.12),endTitleH=titleLine*2,btnH=Math.round(u*.11),endSubH=subLine*2,stack=logoH+gap+endTitleH+gap+btnH+gap+endSubH;let y=S.y+Math.max(0,(S.h-stack)/2);
 const logo=R(S.x+S.w*.15,y,S.w*.7,logoH);y+=logoH+gap;const endTitle=R(S.x,y,S.w,endTitleH);y+=endTitleH+gap;const button=R(S.x+S.w*.12,y,S.w*.76,btnH);y+=btnH+gap;const endSub=R(S.x,y,S.w,endSubH);
 return {safe:S,u,sizes:{title,titleLine,sub,subLine,pad},title:titleBox,subs:subBox,end:{logo,title:endTitle,button,sub:endSub}}}
const inside=(r,S)=>r.x>=S.x&&r.y>=S.y&&r.x+r.w<=S.x+S.w&&r.y+r.h<=S.y+S.h;
const overlap=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;

// ---- motion ----
const ease=p=>.5-Math.cos(Math.PI*clamp(p,0,1))/2;
// Ken Burns and friends at progress p (0..1) of a scene: scale over the «cover» size and the offset as a share of the
// slack (-1..1), so the photo always covers the frame.
function motionAt(kind,p){const e=ease(p);
 switch(kind){case 'zoom-out':return {scale:1.16-.16*e,x:0,y:0};case 'pan-left':return {scale:1.14,x:1-2*e,y:0};case 'pan-right':return {scale:1.14,x:-1+2*e,y:0};
  case 'slide':return {scale:1.04+.05*e,x:0,y:0};case 'fade':return {scale:1.03+.06*e,x:0,y:-.2*e};default:return {scale:1+.16*e,x:0,y:0}}}
// Where the photo is drawn for a motion state: «cover» size times the scale, moved inside its slack.
function drawRect(iw,ih,W,H,m){const s=Math.max(W/iw,H/ih)*m.scale,w=iw*s,h=ih*s,sx=(w-W)/2,sy=(h-H)/2;return {x:(W-w)/2+clamp(m.x,-1,1)*sx,y:(H-h)/2+clamp(m.y,-1,1)*sy,w,h}}
// How a scene comes in: «slide» from the right, «fade» over the previous scene, the others with a cut. Not the first.
function entry(kind,tIn,i){if(!i)return {alpha:1,dx:0};const k=clamp(tIn/TRANS,0,1);return kind==='slide'?{alpha:1,dx:1-ease(k)}:kind==='fade'?{alpha:k,dx:0}:{alpha:1,dx:0}}
// What is on screen at time t: the scene, its progress, the entry, and the previous scene when it still shows.
function frameAt(tl,motions,t){const T=clamp(t,0,Math.max(0,tl.total-1e-6));
 if(T>=tl.end.start||!tl.scenes.length){const k=T-tl.end.start;return {end:true,i:tl.scenes.length-1,tIn:k,p:clamp(k/tl.end.dur,0,1),fade:clamp(k/END_FADE,0,1),title:1}}
 let i=tl.scenes.findIndex(s=>T<s.end);if(i<0)i=tl.scenes.length-1;const s=tl.scenes[i],tIn=T-s.start,e=entry((motions||[])[i],tIn,i);
 return {end:false,i,tIn,p:clamp(tIn/s.dur,0,1),alpha:e.alpha,dx:e.dx,prev:i>0&&(e.alpha<1||e.dx>0)?i-1:-1,title:i===0?1:clamp(tIn/TITLE_IN,0,1)}}

// ---- the AI call ----
const inputText=values=>{const v=values||{};return [v.facts,v.cta,v.projectFacts].map(x=>String(x||'')).join('\n')};
function factsText(project,profile){const A=adLib();return A&&typeof A.factsText==='function'?A.factsText(project,profile):''}
function storyboardPrompt(answers,values={}){const a=normalize(answers),v=values||{},p=v.project||{},facts=block(v.facts).slice(0,FACTS_MAX),f=format(a.format),[min,max]=SCENES[a.duration],end=endFor(a.duration);
 if(facts.length<10)throw Error('Scrivi i fatti del prodotto o del messaggio (almeno 10 caratteri).');
 const photos=(v.photos||[]).slice(0,MAX_PHOTOS);if(!photos.length)throw Error('Carica almeno una foto: il video si fa con le tue immagini.');
 const L=[];
 L.push('Prepara '+COUNT+' storyboard diversi tra loro per un video breve senza avatar e senza voce'+(p.name?' del progetto «'+clean(p.name).slice(0,80)+'»':'')+': solo le immagini del cliente in movimento, testo a schermo e sottotitoli incisi (molti lo guardano senza audio).');
 L.push('Obiettivo: '+goal(a.goal)[2]+'.','Formato: '+f.ratio+' ('+f.label+'). Durata totale: '+a.duration+' secondi, compresa la chiusura con logo e invito (circa '+String(end).replace('.',',')+' secondi).');
 L.push('Immagini disponibili ('+photos.length+'), numerate:',...photos.map((x,i)=>(i+1)+'. '+(x.kind==='video'?'clip video':'foto')+(clean(x.name)?' «'+clean(x.name).slice(0,60)+'»':'')));
 L.push('Fatti del prodotto o del messaggio, scritti dal cliente:\n«'+facts+'»','Invito finale scelto (pulsante): «'+a.cta+'».');
 const pf=clean(v.projectFacts)?block(v.projectFacts).slice(0,2000):'';if(pf)L.push('Fatti confermati del progetto:\n'+pf);
 L.push('Regole:',
  '- Il gancio è la prima scena: il suo testo a schermo si legge entro i primi '+HOOK_SECONDS+' secondi e deve far restare chi scorre.',
  '- Da '+min+' a '+max+' scene, ognuna di almeno 1,5 secondi; la somma delle durate più la chiusura fa '+a.duration+' secondi.',
  '- «testo»: il testo a schermo della scena, al massimo '+TEXT_MAX+' caratteri. «sottotitoli»: le frasi della scena, brevi, al massimo '+(f.lineMax*2)+' caratteri ciascuna.',
  '- «foto»: il numero dell’immagine da usare; «movimento»: zoom-in, zoom-out, pan-left, pan-right, slide o fade.',
  '- Usa solo i fatti scritti qui. Non inventare numeri, prezzi, sconti, scadenze, garanzie, premi, recensioni, primati o risultati.',
  a.goal==='testimonianza'?'- Testimonianza: usa solo le parole del cliente scritte qui, tra virgolette «», senza cambiarle né aggiungerne.':'- Niente citazioni di persone.',
  '- «musica»: una sola parola per l’atmosfera ('+MOODS.join(', ')+'). RADIX non genera musica: il brano con licenza lo sceglie il cliente.',
  '- Italiano semplice, niente emoji, niente frasi tutte in maiuscolo.');
 const shape={nome:'2-4 parole',idea:'una frase',musica:'una parola',scene:[{durata:3,foto:1,movimento:'zoom-in',testo:'max '+TEXT_MAX+' caratteri',sottotitoli:['frase breve']}],chiusura:{titolo:'max '+TEXT_MAX+' caratteri',sottotitolo:'max '+END_SUB_MAX+' caratteri, facoltativo'}};
 L.push('Rispondi solo con JSON valido, senza testo prima o dopo, con 3 oggetti in "storyboard":\n{"storyboard":['+JSON.stringify(shape)+',{…},{…}]}');
 return L.join('\n')}

// ---- parsing and checks ----
function parseJson(text){const A=adLib();if(A&&typeof A.parseJson==='function')return A.parseJson(text);try{return JSON.parse(text)}catch(e){return null}}
function pickKey(o,keys){if(!o||typeof o!=='object'||Array.isArray(o))return undefined;const ks=Object.keys(o);for(const k of keys){const hit=ks.find(x=>norm(x).replace(/ /g,'_')===k);if(hit!==undefined)return o[hit]}return undefined}
const stripBullet=s=>String(s==null?'':s).replace(/^\s*(?:[-*•–·]|\d{1,2}[.)])\s+/,'');
function fit(s,max){const A=adLib();if(A&&typeof A.fit==='function')return A.fit(s,max);return [...String(s)].slice(0,max).join('')}
const MOTION_WORDS=[[/zoom.?out|indietro|allontan/,'zoom-out'],[/zoom|ken|avvicin|avanti/,'zoom-in'],[/pan.?left|sinistra/,'pan-left'],[/pan|destra|panoram/,'pan-right'],[/slide|scorr|scivol/,'slide'],[/fade|dissolv/,'fade']];
const CYCLE=['zoom-in','pan-right','zoom-out','pan-left','slide','fade'];
function motionOf(v,i){const x=String(v||'').toLowerCase().trim();if(MOTIONS.some(m=>m[0]===x))return x;const hit=MOTION_WORDS.find(([re])=>re.test(x));return hit?hit[1]:CYCLE[i%4]}
function moodOf(v){const x=norm(v).split(' ')[0]||'';return MOODS.find(m=>x&&m.startsWith(x.slice(0,5)))||x.slice(0,20)||'calma'}
const listOf=v=>(Array.isArray(v)?v:typeof v==='string'?v.split(/\n|\s\/\s|\|/):[]).map(t=>clean(stripBullet(typeof t==='object'&&t?pickKey(t,['testo','text','frase']):t))).filter(t=>t.length>1);
function sceneOf(x,i,photos){if(!x||typeof x!=='object'||Array.isArray(x))return null;
 const text=clean(stripBullet(pickKey(x,['testo','testo_a_schermo','on_screen','text','titolo'])||'')),subs=listOf(pickKey(x,['sottotitoli','subtitles','sottotitolo','voce','voiceover','voice_over'])).slice(0,6);
 if(!text&&!subs.length)return null;
 const d=parseFloat(String(pickKey(x,['durata','duration','secondi'])||'').replace(',','.')),n=parseInt(pickKey(x,['foto','photo','immagine','image']),10);
 return {text,subs,dur:Number.isFinite(d)&&d>0?d:3,photo:photos?(Number.isInteger(n)&&n>=1&&n<=photos?n-1:i%photos):-1,motion:motionOf(pickKey(x,['movimento','motion','move']),i)}}
// Claims a reel must not make unless the facts say so (as in the Studio Creatività).
const CLAIMS=[[/\bgratis\b|\bgratuit[aoie]\b/i,'gratis'],[/\bgaranti(?:t[aoie]|sce|amo)\b|\bgaranzia\b/i,'garanzia'],[/\b(?:il|la|i|le) miglior[ei]\b/i,'«il migliore»'],
 [/\bn(?:umero|\.)\s?1\b|\bleader\b|\bprimi in\b|\bprimo in\b/i,'«numero 1» o «leader»'],[/\bscont[oi]\b|\bscontat[aoie]\b|\bin offerta\b|\bpromozione\b/i,'sconto o promozione'],
 [/\bsolo oggi\b|\bultimi (?:posti|pezzi|giorni)\b|\bscade\b|\bposti limitati\b|\btempo limitato\b|\bfino a esaurimento\b/i,'scadenza o disponibilità limitata'],
 [/\bcertificat[oaie]\b|\bpremiat[oaie]\b|\bpremio\b/i,'certificazione o premio'],[/\brecensioni\b|\bstelle\b|\bclienti soddisfatti\b/i,'recensioni o soddisfazione']];
const textsOf=b=>[...b.scenes.flatMap(s=>[s.text,...s.subs]),b.end.title,b.end.sub].filter(Boolean);
const QUOTED=/[«“"]([^«»“”"\n]{6,400})[»”"]/g;
// Limits, the hook, numbers and claims not in the facts, quotes not word for word in the testimonial, fast subtitles.
function check(b,ctx){const a=normalize(ctx&&ctx.answers),input=String(ctx&&ctx.input||''),f=format(a.format),issues=[];
 const trim=(o,key,max,label)=>{const v=o[key];if(v&&chars(v)>max){const cut=fit(v,max);issues.push({kind:'length',label,length:chars(v),max});o[key]=cut}};
 b.scenes.forEach((s,i)=>trim(s,'text',TEXT_MAX,'Scena '+(i+1)+' · testo a schermo'));trim(b.end,'title',TEXT_MAX,'Chiusura · titolo');trim(b.end,'sub',END_SUB_MAX,'Chiusura · sottotitolo');trim(b.end,'cta',CTA_MAX,'Chiusura · pulsante');
 if(b.scenes[0]&&!b.scenes[0].text){b.scenes[0].text=fit(b.scenes[0].subs[0]||b.end.title||'',TEXT_MAX);issues.push({kind:'hook'})}
 const text=textsOf(b).join('\n'),K=checksLib();
 (K&&typeof K.unverifiedNumbers==='function'?K.unverifiedNumbers(text,input):[]).forEach(n=>issues.push({kind:'number',text:n}));
 for(const [re,label] of CLAIMS)if(re.test(text)&&!re.test(input))issues.push({kind:'claim',text:label});
 const plain=norm(input);for(const m of text.matchAll(QUOTED)){if(!plain.includes(norm(m[1])))issues.push({kind:'quote',text:clean(m[1]).slice(0,80)})}
 const tl=timeline(b.scenes.map(s=>s.dur),a.duration);cues(b.scenes,tl,f.lineMax).filter(c=>cps(c)>CPS_MAX).slice(0,3).forEach(c=>issues.push({kind:'fast',scene:c.scene,cps:cps(c)}));
 b.issues=issues;return b}
function boardOf(x,n,ctx){if(!x||typeof x!=='object'||Array.isArray(x))return null;const a=normalize(ctx.answers),photos=Math.max(0,ctx.photos|0),raw=pickKey(x,['scene','scenes']);if(!Array.isArray(raw))return null;
 const scenes=raw.map((s,i)=>sceneOf(s,i,photos)).filter(Boolean).slice(0,SCENES[a.duration][1]);if(scenes.length<2)return null;
 const e=pickKey(x,['chiusura','end','end_card','finale'])||{},asked=scenes.reduce((s,x)=>s+x.dur,0)+endFor(a.duration);
 const b={id:'s'+n,name:clean(pickKey(x,['nome','name','titolo'])).replace(/[«»"]/g,'').slice(0,60)||'Storyboard '+n,idea:clean(pickKey(x,['idea','concetto','concept'])).slice(0,240),
  mood:moodOf(pickKey(x,['musica','music','mood','atmosfera'])),scenes,end:{title:clean(pickKey(e,['titolo','title','headline'])||''),cta:a.cta,sub:clean(pickKey(e,['sottotitolo','sub','subtitle'])||''),logo:true},
  adjusted:Math.abs(asked-a.duration)>.5};
 return check(b,ctx)}
// The reply → up to three storyboards; [] when nothing usable is there. ctx: {answers, photos (how many), input}.
function parseStoryboards(text,ctx={}){const d=parseJson(text);if(!d)return [];const list=Array.isArray(d)?d:pickKey(d,['storyboard','storyboards','proposte','reel'])||[],out=[];
 (Array.isArray(list)?list:[]).forEach(x=>{if(out.length>=COUNT)return;const b=boardOf(x,out.length+1,ctx);if(b)out.push(b)});return out}
const issueText=i=>i.kind==='number'?'Il numero «'+i.text+'» non compare nei fatti: verificalo o toglilo.'
 :i.kind==='claim'?'Promessa da verificare: '+i.text+'. Nei fatti non c’è: toglila o confermala.'
 :i.kind==='quote'?'Citazione non presente nella testimonianza scritta: «'+i.text+'». Usa solo le parole del cliente.'
 :i.kind==='hook'?'La prima scena non aveva testo a schermo: il gancio deve leggersi nei primi '+HOOK_SECONDS+' secondi. Controllalo.'
 :i.kind==='fast'?'Scena '+(i.scene+1)+': sottotitoli veloci ('+String(i.cps).replace('.',',')+' caratteri al secondo): accorciali o allunga la scena.'
 :i.label+': '+i.length+' caratteri su '+i.max+', accorciato. Rileggilo.';

// ---- files ----
const sec=x=>String(Math.round(x*10)/10).replace('.',',');
function baseName(b,brand){return 'reel-'+(slug(brand&&brand.name)||'brand')+'-'+(slug(b&&b.name)||'storyboard')}
function storyboardTxt(b,{answers,brand,date}={}){const a=normalize(answers),f=format(a.format),tl=timeline(b.scenes.map(s=>s.dur),a.duration),day=date||new Date().toISOString().slice(0,10),L=[];
 L.push('REEL · '+clean(brand&&brand.name||''),'Storyboard: '+b.name+(b.idea?' — '+b.idea:''),'Obiettivo: '+goal(a.goal)[1]+' · Formato '+f.ratio+' · '+a.duration+' s · '+day,'Musica suggerita: '+b.mood+' (scegli tu un brano con licenza: RADIX non genera musica).','');
 b.scenes.forEach((s,i)=>{const w=tl.scenes[i];L.push('SCENA '+(i+1)+' · '+sec(w.start)+'–'+sec(w.end)+' s · '+((MOTIONS.find(m=>m[0]===s.motion)||[0,''])[1])+(s.photo>=0?' · immagine '+(s.photo+1):''));
  if(s.text)L.push('Testo a schermo: '+s.text);s.subs.forEach(t=>L.push('Sottotitolo: '+t));L.push('')});
 L.push('CHIUSURA · '+sec(tl.end.start)+'–'+sec(tl.end.end)+' s',(b.end.logo?'Logo · ':'')+'Titolo: '+(b.end.title||'—'),'Pulsante: '+b.end.cta+(b.end.sub?'\nSotto: '+b.end.sub:''),'');
 if(b.issues&&b.issues.length)L.push('DA CONTROLLARE',...b.issues.map(i=>'- '+issueText(i)),'');
 L.push('NOTE','I sottotitoli sono incisi nel video e anche nei file .srt e .vtt, da caricare dove la piattaforma li accetta.','Se usi immagini o clip generate con l’AI, segnalalo dove la piattaforma lo chiede.');
 return L.join('\n')+'\n'}
// The zip contents. media: {webm, mp4, cover} as bytes (missing ones are skipped).
function bundleFiles(b,media,opts={}){const a=normalize(opts.answers),tl=timeline(b.scenes.map(s=>s.dur),a.duration),list=cues(b.scenes,tl,format(a.format).lineMax),base=baseName(b,opts.brand),m=media||{},files=[];
 if(m.mp4)files.push({name:base+'.mp4',data:m.mp4});if(m.webm)files.push({name:base+'.webm',data:m.webm});if(m.cover)files.push({name:'copertina.png',data:m.cover});
 files.push({name:'sottotitoli.srt',data:srt(list)},{name:'sottotitoli.vtt',data:vtt(list)},{name:'storyboard.txt',data:storyboardTxt(b,opts)});return files}
// Video MIME types MediaRecorder may know, best first; WebM always tried, MP4 only with H.264 (avc1), the codec every
// platform takes: a browser that would put VP9 in an MP4 gets the WebM only.
const MIMES={webm:['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'],mp4:['video/mp4;codecs=avc1.42E01F,mp4a.40.2','video/mp4;codecs=avc1,mp4a.40.2','video/mp4;codecs=avc1.42E01F','video/mp4;codecs=avc1']};
function pickMimes(isSupported){return Object.entries(MIMES).map(([ext,list])=>{const m=list.find(t=>{try{return !!isSupported(t)}catch(e){return false}});return m?{ext,mime:m}:null}).filter(Boolean)}
const bitrate=(w,h)=>w*h>=1e6?6e6:4e6;

// ---- WebM duration: MediaRecorder writes live WebM with no duration, so players cannot seek and some show 0:00.
// This writes Segment › Info › Duration (float64, in TimecodeScale units) into the recorded bytes. ----
function vint(b,p,keep){const first=b[p];let len=1,mask=0x80;while(len<=8&&!(first&mask)){mask>>=1;len++}if(len>8||p+len>b.length)return null;
 let v=keep?first:first&(mask-1),all=(first&(mask-1))===mask-1;for(let i=1;i<len;i++){v=v*256+b[p+i];if(b[p+i]!==255)all=false}return {v,len,unknown:!keep&&all}}
function el(b,p){const id=vint(b,p,true);if(!id)return null;const size=vint(b,p+id.len,false);if(!size)return null;return {id:id.v,start:p,head:id.len+size.len,data:p+id.len+size.len,size:size.unknown?null:size.v,sizeLen:size.len}}
function readFloat(b,p,len){const v=new DataView(b.buffer,b.byteOffset+p,len);return len===4?v.getFloat32(0):v.getFloat64(0)}
function readUint(b,p,len){let v=0;for(let i=0;i<len;i++)v=v*256+b[p+i];return v}
const ID={segment:0x18538067,info:0x1549A966,duration:0x4489,scale:0x2AD7B1};
// Returns new bytes with the duration set (or the same bytes when they are not a WebM it understands).
function webmDuration(bytes,seconds){const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let p=0,seg=null;
 while(p<b.length){const e=el(b,p);if(!e)return b;if(e.id===ID.segment){seg=e;break}if(e.size==null)return b;p=e.data+e.size}
 if(!seg)return b;const segEnd=seg.size==null?b.length:Math.min(b.length,seg.data+seg.size);let info=null;p=seg.data;
 while(p<segEnd){const e=el(b,p);if(!e||e.size==null)break;if(e.id===ID.info){info=e;break}p=e.data+e.size}
 if(!info)return b;let scale=1e6,dur=null;p=info.data;
 while(p<info.data+info.size){const e=el(b,p);if(!e||e.size==null)break;if(e.id===ID.scale)scale=readUint(b,e.data,e.size)||1e6;if(e.id===ID.duration)dur=e;p=e.data+e.size}
 const value=seconds*1e9/scale;
 if(dur&&(dur.size===8||dur.size===4)){const out=b.slice(),v=new DataView(out.buffer,dur.data,dur.size);if(dur.size===8)v.setFloat64(0,value);else v.setFloat32(0,value);return out}
 if(dur)return b;
 const add=new Uint8Array(11);add[0]=0x44;add[1]=0x89;add[2]=0x88;new DataView(add.buffer).setFloat64(3,value);
 const newSize=info.size+add.length,head=new Uint8Array(4+8);head.set([0x15,0x49,0xA9,0x66]);head[4]=0x01;for(let i=0;i<7;i++)head[5+i]=Math.floor(newSize/Math.pow(256,6-i))%256;
 const infoEnd=info.data+info.size;let segHead=b.subarray(seg.start,seg.data);
 if(seg.size!=null){const grow=head.length-info.head+add.length,ns=seg.size+grow;if(ns>=Math.pow(2,7*seg.sizeLen)-1)return b;segHead=segHead.slice();let x=ns;for(let i=segHead.length-1;i>=segHead.length-seg.sizeLen;i--){segHead[i]=x%256;x=Math.floor(x/256)}segHead[segHead.length-seg.sizeLen]|=0x80>>(seg.sizeLen-1)}
 const parts=[b.subarray(0,seg.start),segHead,b.subarray(seg.data,info.start),head,b.subarray(info.data,infoEnd),add,b.subarray(infoEnd)],out=new Uint8Array(parts.reduce((s,x)=>s+x.length,0));let q=0;for(const x of parts){out.set(x,q);q+=x.length}return out}
// The duration a WebM says it has, in seconds (null when it says nothing): for the tests and the check after a render.
function webmDurationOf(bytes){const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let p=0;
 while(p<b.length){const e=el(b,p);if(!e)return null;if(e.id===ID.segment){p=e.data;const end=e.size==null?b.length:e.data+e.size;
   while(p<end){const c=el(b,p);if(!c||c.size==null)return null;if(c.id===ID.info){let q=c.data,scale=1e6,d=null;while(q<c.data+c.size){const x=el(b,q);if(!x||x.size==null)break;if(x.id===ID.scale)scale=readUint(b,x.data,x.size);if(x.id===ID.duration)d=readFloat(b,x.data,x.size);q=x.data+x.size}return d==null?null:d*scale/1e9}p=c.data+c.size}return null}
  if(e.size==null)return null;p=e.data+e.size}
 return null}

// ---- saved in the project: the «agents» document, key reels ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(doc){const s=doc&&doc.reels;return s&&typeof s==='object'&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>x&&typeof x==='object')}:emptyStore()}
function savedRecord(b,{answers,photos,by,at}={}){const a=normalize(answers),when=at||new Date().toISOString();
 return {id:'reel-'+when.replace(/\D/g,'').slice(0,14)+'-'+(slug(b.name)||'storyboard').slice(0,24),at:when,by:clean(by).slice(0,80),name:b.name,idea:b.idea||'',mood:b.mood||'',
  goal:a.goal,format:a.format,duration:a.duration,style:a.style,quality:a.quality,cta:b.end.cta||a.cta,
  scenes:b.scenes.map(s=>({text:s.text,subs:s.subs.slice(),dur:s.dur,motion:s.motion,photo:s.photo})),end:{...b.end},
  photos:(photos||[]).slice(0,MAX_PHOTOS).map(p=>({name:clean(p.name).slice(0,80),kind:p.kind==='video'?'video':'image'})),issues:(b.issues||[]).map(issueText).slice(0,20)}}
function addRecord(store,rec){const s=readStore({reels:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const doc=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await doc.load())||{},next=addRecord(readStore(cur),rec);
  try{await doc.save({...cur,schemaVersion:1,conversations:cur.conversations||{},reels:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
// A saved record back as a storyboard; photo numbers beyond the photos uploaded now wrap around.
function fromRecord(r,photos){const n=Math.max(0,photos|0);return {id:r.id,name:r.name,idea:r.idea||'',mood:r.mood||'calma',
 scenes:(r.scenes||[]).map((s,i)=>({text:clean(s.text),subs:(s.subs||[]).map(clean).filter(Boolean),dur:+s.dur||3,motion:motionOf(s.motion,i),photo:n?((s.photo|0)>=0?(s.photo|0)%n:i%n):-1})),
 end:{title:clean(r.end&&r.end.title),cta:clean(r.end&&r.end.cta)||clean(r.cta),sub:clean(r.end&&r.end.sub),logo:!(r.end&&r.end.logo===false)},issues:[]}}

// ---- drawing (browser; ctx is already scaled to the format's pixels) ----
const doc=()=>root.document;
function rgbOf(h){const x=String(h||'#000000').replace('#','');return [0,2,4].map(i=>parseInt(x.slice(i,i+2),16)||0)}
const rgba=(h,a)=>{const [r,g,b]=rgbOf(h);return 'rgba('+r+','+g+','+b+','+a+')'};
function roundRect(ctx,r,rad){const k=Math.min(rad||0,r.w/2,r.h/2);ctx.beginPath();ctx.moveTo(r.x+k,r.y);ctx.arcTo(r.x+r.w,r.y,r.x+r.w,r.y+r.h,k);ctx.arcTo(r.x+r.w,r.y+r.h,r.x,r.y+r.h,k);ctx.arcTo(r.x,r.y+r.h,r.x,r.y,k);ctx.arcTo(r.x,r.y,r.x+r.w,r.y,k);ctx.closePath()}
const fontOf=(w,size,fam)=>w+' '+Math.round(size)+'px "'+fam+'", Inter, system-ui, sans-serif';
function linesOf(ctx,text,maxW){const out=[];let line='';String(text).split(/\s+/).filter(Boolean).forEach(w=>{const t=line?line+' '+w:w;if(ctx.measureText(t).width>maxW&&line){out.push(line);line=w}else line=t});if(line)out.push(line);return out}
function fitText(ctx,text,weight,fam,maxW,maxLines,start,min){for(let size=start;size>=min;size-=Math.max(1,start*.05)){ctx.font=fontOf(weight,size,fam);const lines=linesOf(ctx,text,maxW);if(lines.length<=maxLines&&lines.every(l=>ctx.measureText(l).width<=maxW))return {size,lines}}
 ctx.font=fontOf(weight,min,fam);let lines=linesOf(ctx,text,maxW);if(lines.length>maxLines){lines=lines.slice(0,maxLines);lines[maxLines-1]=lines[maxLines-1].replace(/\s*\S*$/,'')+'…'}return {size:min,lines}}
const srcSize=s=>({w:s.videoWidth||s.naturalWidth||s.width||0,h:s.videoHeight||s.naturalHeight||s.height||0});
// The brand background (no photo, and the closing card): primary colour with soft glows of the accent and the secondary.
function brandBg(ctx,W,H,c,flip){const big=Math.max(W,H),lg=ctx.createLinearGradient(0,0,W,H);lg.addColorStop(0,c.primary);lg.addColorStop(1,c.dark);ctx.fillStyle=lg;ctx.fillRect(0,0,W,H);
 const gx=W*(flip?.15:.85),gy=H*.12,g1=ctx.createRadialGradient(gx,gy,0,gx,gy,big*.7);g1.addColorStop(0,rgba(c.accent,.55));g1.addColorStop(1,rgba(c.accent,0));ctx.fillStyle=g1;ctx.fillRect(0,0,W,H);
 const hx=W*(flip?.9:.1),hy=H*.95,g2=ctx.createRadialGradient(hx,hy,0,hx,hy,big*.65);g2.addColorStop(0,rgba(c.secondary,.6));g2.addColorStop(1,rgba(c.secondary,0));ctx.fillStyle=g2;ctx.fillRect(0,0,W,H)}
function drawScene(ctx,plan,assets,i,p,alpha,dx){const F=plan.fmt,s=plan.scenes[i],a=s&&assets.photos[s.photo];ctx.save();ctx.globalAlpha=alpha;if(dx)ctx.translate(dx*F.w,0);
 const src=a&&(a.video||a.img),sz=src?srcSize(src):{w:0,h:0};
 if(src&&sz.w&&sz.h){const r=drawRect(sz.w,sz.h,F.w,F.h,motionAt(s.motion,p));ctx.fillStyle='#000';ctx.fillRect(0,0,F.w,F.h);try{ctx.drawImage(src,r.x,r.y,r.w,r.h)}catch(e){}}
 else brandBg(ctx,F.w,F.h,plan.brand.colors,i%2);
 ctx.restore()}
function drawTitle(ctx,plan,text,alpha){if(!text||alpha<=0)return;const L=plan.L,b=plan.brand,box=L.title;ctx.save();ctx.globalAlpha=alpha;
 const g=ctx.createLinearGradient(0,0,0,box.y+box.h*1.35);g.addColorStop(0,'rgba(0,0,0,.55)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,plan.fmt.w,box.y+box.h*1.35);
 const t=fitText(ctx,text,800,b.font.heading,box.w,3,L.sizes.title,L.sizes.title*.62),lh=Math.round(t.size*1.12);ctx.textBaseline='top';ctx.textAlign='left';ctx.fillStyle='#FFFFFF';
 ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=t.size*.18;ctx.shadowOffsetY=t.size*.04;let y=box.y;t.lines.forEach(l=>{ctx.fillText(l,box.x,y);y+=lh});
 ctx.shadowColor='transparent';ctx.fillStyle=b.colors.accent;ctx.fillRect(box.x,y+t.size*.18,Math.round(L.u*.09),Math.max(4,Math.round(L.u*.008)));ctx.restore()}
function drawCue(ctx,plan,cue){if(!cue)return;const L=plan.L,b=plan.brand,box=L.subs,style=plan.style,A=adLib();ctx.save();ctx.textBaseline='middle';ctx.textAlign='center';
 let size=L.sizes.sub;ctx.font=fontOf(700,size,b.font.body);const widest=Math.max(...cue.lines.map(l=>ctx.measureText(l).width));if(widest>box.w-L.sizes.pad*2){size=Math.floor(size*(box.w-L.sizes.pad*2)/widest);ctx.font=fontOf(700,size,b.font.body)}
 const lh=L.sizes.subLine,cx=box.x+box.w/2,bottom=box.y+box.h-L.sizes.pad,n=cue.lines.length;
 if(style==='outline'){ctx.lineJoin='round';ctx.lineWidth=Math.max(3,size*.17);ctx.strokeStyle='rgba(0,0,0,.92)';ctx.fillStyle='#FFFFFF';cue.lines.forEach((l,k)=>{const y=bottom-(n-k-.5)*lh;ctx.strokeText(l,cx,y);ctx.fillText(l,cx,y)})}
 else{const bg=style==='accent'?b.colors.accent:b.colors.dark,fg=style==='accent'?(A&&A.bestText?A.bestText(b.colors.accent,[b.colors.dark,b.colors.light]):'#111111'):b.colors.light;
  cue.lines.forEach((l,k)=>{const y=bottom-(n-k-.5)*lh,w=ctx.measureText(l).width+size*.9;ctx.fillStyle=style==='accent'?bg:rgba(bg,.84);roundRect(ctx,{x:cx-w/2,y:y-lh/2+2,w,h:lh-4},size*.28);ctx.fill();ctx.fillStyle=fg;ctx.fillText(l,cx,y+size*.03)})}
 ctx.restore()}
function drawEnd(ctx,plan,assets,p){const F=plan.fmt,L=plan.L,b=plan.brand,c=b.colors,e=plan.end,A=adLib();brandBg(ctx,F.w,F.h,c,0);ctx.save();ctx.textBaseline='middle';ctx.textAlign='center';
 const lg=L.end.logo,img=assets.logoNeg||assets.logo;
 if(e.logo!==false){if(img){const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height||1,s=Math.min(lg.w/iw,lg.h/ih);ctx.drawImage(img,lg.x+(lg.w-iw*s)/2,lg.y+(lg.h-ih*s)/2,iw*s,ih*s)}
  else{const name=b.name.toUpperCase();let size=lg.h*.6;ctx.font=fontOf(800,size,b.font.heading);while(ctx.measureText(name).width>lg.w&&size>12){size-=2;ctx.font=fontOf(800,size,b.font.heading)}ctx.fillStyle=c.light;ctx.fillText(name,lg.x+lg.w/2,lg.y+lg.h/2)}}
 if(e.title){const t=fitText(ctx,e.title,800,b.font.heading,L.end.title.w,2,L.sizes.title*.9,L.sizes.title*.55),lh=t.size*1.12,y0=L.end.title.y+L.end.title.h/2-(t.lines.length-1)*lh/2;ctx.fillStyle=c.light;t.lines.forEach((l,k)=>ctx.fillText(l,L.end.title.x+L.end.title.w/2,y0+k*lh))}
 const k=ease(clamp(p*3,0,1)),btn=L.end.button,label=e.cta||'';if(label){const bg=c.accent,fg=A&&A.bestText?A.bestText(bg,[c.dark,c.light]):'#111111';ctx.font=fontOf(700,btn.h*.36,b.font.body);
  const w=Math.min(btn.w,ctx.measureText(label).width+btn.h*1.1),r={x:btn.x+(btn.w-w)/2,y:btn.y+btn.h*(1-k)*.25,w,h:btn.h};ctx.globalAlpha=k;ctx.fillStyle=bg;roundRect(ctx,r,btn.h/2);ctx.fill();ctx.fillStyle=fg;ctx.fillText(label,r.x+r.w/2,r.y+r.h/2+btn.h*.02,r.w-btn.h*.5);ctx.globalAlpha=1}
 if(e.sub){const s=L.end.sub,t=fitText(ctx,e.sub,500,b.font.body,s.w,2,L.sizes.sub,L.sizes.sub*.7),lh=t.size*1.3;ctx.fillStyle=rgba(c.light,.9);t.lines.forEach((l,j)=>ctx.fillText(l,s.x+s.w/2,s.y+lh/2+j*lh))}
 ctx.restore()}
function drawSafe(ctx,plan){const F=plan.fmt,S=plan.L.safe;ctx.save();ctx.fillStyle='rgba(255,60,120,.18)';ctx.fillRect(0,0,F.w,S.y);ctx.fillRect(0,S.y+S.h,F.w,F.h-S.y-S.h);ctx.fillRect(0,S.y,S.x,S.h);ctx.fillRect(S.x+S.w,S.y,F.w-S.x-S.w,S.h);
 ctx.setLineDash([18,12]);ctx.lineWidth=4;ctx.strokeStyle='rgba(255,156,198,.9)';ctx.strokeRect(S.x,S.y,S.w,S.h);ctx.restore()}
// One frame of the video at time t (seconds). opts.safe draws the safe zones (preview only, never recorded).
function drawFrame(ctx,plan,assets,t,opts={}){const F=plan.fmt,fr=frameAt(plan.tl,plan.motions,t);ctx.fillStyle=plan.brand.colors.dark;ctx.fillRect(0,0,F.w,F.h);
 if(fr.end){if(fr.fade<1&&fr.i>=0)drawScene(ctx,plan,assets,fr.i,1,1,0);ctx.save();ctx.globalAlpha=fr.fade;drawEnd(ctx,plan,assets,fr.p);ctx.restore()}
 else{if(fr.prev>=0)drawScene(ctx,plan,assets,fr.prev,1,1,0);drawScene(ctx,plan,assets,fr.i,fr.p,fr.alpha,fr.dx);drawTitle(ctx,plan,plan.scenes[fr.i].text,fr.title*fr.alpha);drawCue(ctx,plan,cueAt(plan.cues,t))}
 if(opts.safe)drawSafe(ctx,plan);return fr}
// Everything a frame needs, from the storyboard and the answers.
function planOf(b,answers,brand){const a=normalize(answers),fmt=format(a.format),tl=timeline(b.scenes.map(s=>s.dur),a.duration);
 return {fmt,tl,L:layout(fmt),scenes:b.scenes,motions:b.scenes.map(s=>s.motion),cues:cues(b.scenes,tl,fmt.lineMax),style:a.style,brand,end:b.end,answers:a}}
// Clips play while their scene is on screen (muted); outside it they wait at the start.
function syncClips(plan,assets,t,playing){const fr=frameAt(plan.tl,plan.motions,t);
 plan.scenes.forEach((s,i)=>{const a=assets.photos[s.photo],v=a&&a.video;if(!v)return;const on=!fr.end&&(fr.i===i||fr.prev===i);
  if(on&&playing){if(v.paused){try{v.currentTime=Math.min(Math.max(0,t-plan.tl.scenes[i].start),Math.max(0,(v.duration||1)-.05))}catch(e){}const pr=v.play();if(pr&&pr.catch)pr.catch(()=>{})}}
  else if(!v.paused)v.pause()})}

// ---- browser widget ----
let counter=0;
const E=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
function loadImage(src){return new Promise((ok,ko)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>ko(Error('Immagine non leggibile'));i.src=src})}
const svgData=svg=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
async function logoAssets(b){if(!b.logo)return {};const I=identityLib(),out={};try{out.logo=await loadImage(svgData(b.logo))}catch(e){return {}}
 try{if(I&&b.palette&&typeof I.negativeLogo==='function')out.logoNeg=await loadImage(svgData(I.negativeLogo(b.logo,b.palette)))}catch(e){}return out}
// A photo from the computer, shrunk to at most PHOTO_EDGE on its long side (memory), with a small thumbnail.
async function photoAsset(file){const url=root.URL.createObjectURL(file);try{const img=await loadImage(url),w=img.naturalWidth,h=img.naturalHeight,k=Math.min(1,PHOTO_EDGE/Math.max(w,h));
  const c=doc().createElement('canvas');c.width=Math.max(1,Math.round(w*k));c.height=Math.max(1,Math.round(h*k));c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return {kind:'image',name:file.name,img:c,thumb:thumbOf(c)}}finally{root.URL.revokeObjectURL(url)}}
function thumbOf(src){const sz=srcSize(src),k=Math.min(1,240/Math.max(sz.w||1,sz.h||1)),c=doc().createElement('canvas');c.width=Math.max(1,Math.round(sz.w*k));c.height=Math.max(1,Math.round(sz.h*k));try{c.getContext('2d').drawImage(src,0,0,c.width,c.height)}catch(e){}return c.toDataURL('image/jpeg',.8)}
// A short clip from the computer: a muted <video> drawn into the canvas while its scene is on screen.
function clipAsset(file){return new Promise((ok,ko)=>{const v=doc().createElement('video'),url=root.URL.createObjectURL(file);v.muted=true;v.playsInline=true;v.preload='auto';v.src=url;
 const fail=m=>{root.URL.revokeObjectURL(url);ko(Error(m))};v.onerror=()=>fail('Clip non leggibile: prova un MP4 o un WebM.');
 v.onloadedmetadata=()=>{if(!(v.duration>0))return fail('Clip senza durata.');if(v.duration>CLIP_SECONDS+.5)return fail('La clip dura più di '+CLIP_SECONDS+' secondi: tagliala prima.');v.currentTime=Math.min(.3,v.duration/2)};
 v.onseeked=()=>{v.onseeked=null;ok({kind:'video',name:file.name,video:v,url,duration:v.duration,thumb:thumbOf(v)})}})}
function download(name,data,type){const a=E('a');a.href=root.URL.createObjectURL(data instanceof root.Blob?data:new root.Blob([data],{type}));a.download=name;doc().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),4000)}
const toPng=c=>new Promise((ok,ko)=>c.toBlob(b=>b?b.arrayBuffer().then(x=>ok(new Uint8Array(x)),ko):ko(Error('PNG non creato')),'image/png'));
const nextFrame=()=>new Promise(r=>(root.requestAnimationFrame||(f=>setTimeout(f,1000/FPS)))(r));
const mb=n=>n<1e6?Math.max(1,Math.round(n/1e3))+' KB':(n/1e6).toFixed(1).replace('.',',')+' MB';
function glyph(f){const s=E('span',undefined,'ad-glyph'),k=Math.min(18/f.w,24/f.h);s.style.width=Math.max(4,Math.round(f.w*k))+'px';s.style.height=Math.max(3,Math.round(f.h*k))+'px';s.setAttribute('aria-hidden','true');return s}
// Record the plan on a canvas with MediaRecorder: one pass, one recorder per format the browser can write (same stream).
// audio: {buffer (AudioBuffer bytes as ArrayBuffer), volume}. Returns {webm, mp4} as Uint8Array plus what was used.
async function record(plan,assets,{audio,onProgress,isCancelled}={}){const MR=root.MediaRecorder;if(!MR||!doc().createElement('canvas').captureStream)throw Error('questo browser non registra video dal canvas: usa Chrome, Edge o Firefox aggiornati.');
 const size=renderSize(plan.fmt.id,plan.answers.quality),c=doc().createElement('canvas');c.width=size.w;c.height=size.h;const ctx=c.getContext('2d',{alpha:false});ctx.scale(size.scale,size.scale);
 drawFrame(ctx,plan,assets,0);const stream=c.captureStream(FPS);let ac=null,src=null,withAudio=false;
 if(audio&&audio.bytes){try{const AC=root.AudioContext||root.webkitAudioContext;ac=new AC();const buf=await ac.decodeAudioData(audio.bytes.slice(0));src=ac.createBufferSource();src.buffer=buf;
   const g=ac.createGain(),dest=ac.createMediaStreamDestination(),v=clamp(+audio.volume||.8,0,1),T=plan.tl.total;g.gain.setValueAtTime(v,0);src.connect(g);g.connect(dest);
   dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));withAudio=true;src._gain=g;src._v=v;src._T=T}catch(e){withAudio=false;if(ac)try{ac.close()}catch(x){}ac=null}}
 const kinds=pickMimes(t=>MR.isTypeSupported(t));if(!kinds.length)throw Error('il browser non sa registrare né WebM né MP4.');
 const recs=kinds.map(k=>{const chunks=[],r=new MR(stream,{mimeType:k.mime,videoBitsPerSecond:bitrate(size.w,size.h),audioBitsPerSecond:128000});r.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
  const done=new Promise(res=>{r.onstop=()=>res(new root.Blob(chunks,{type:k.mime}))});return {k,r,done}});
 recs.forEach(x=>x.r.start(1000));const t0=root.performance.now();
 if(src){const now=ac.currentTime;src.start(now);src._gain.gain.setValueAtTime(src._v,now+Math.max(0,src._T-1.2));src._gain.gain.linearRampToValueAtTime(0,now+src._T)}
 let cancelled=false;
 for(;;){const t=(root.performance.now()-t0)/1000;if(isCancelled&&isCancelled()){cancelled=true;break}if(t>=plan.tl.total)break;syncClips(plan,assets,t,true);drawFrame(ctx,plan,assets,t);onProgress&&onProgress(t/plan.tl.total,t);await nextFrame()}
 drawFrame(ctx,plan,assets,plan.tl.total);await nextFrame();syncClips(plan,assets,plan.tl.total+1,false);
 recs.forEach(x=>{try{x.r.stop()}catch(e){}});const blobs=await Promise.all(recs.map(x=>x.done));stream.getTracks().forEach(t=>t.stop());if(src)try{src.stop()}catch(e){}if(ac)try{ac.close()}catch(e){}
 if(cancelled)return null;const out={withAudio,width:size.w,height:size.h};
 for(let i=0;i<recs.length;i++){const bytes=new Uint8Array(await blobs[i].arrayBuffer());out[recs[i].k.ext]=recs[i].k.ext==='webm'?webmDuration(bytes,plan.tl.total):bytes;out[recs[i].k.ext+'Mime']=recs[i].k.mime}
 return out}

// ctx: {project (profile for the AI), profile (registry profile: identityKit, brief), memoryScope, projectId, workspace, agentsUrl, by}
function reelStudio(ctx={}){const n=++counter,project=ctx.project||{},A=adLib(),brand=A.brandOf(project,ctx.profile),wrap=E('div',undefined,'tool photo-studio reel-studio');
 const answers=normalize({});
 const st={photos:[],boards:[],chosen:null,values:{},assets:{},audio:null,result:null,urls:[],safe:true,t:0,playing:false,rendering:false,cancel:false,timer:0};
 logoAssets(brand).then(a=>{st.assets=a;if(st.boards.length)renderBoards();if(st.chosen)drawPreview()});
 const assets=()=>({photos:st.photos,logo:st.assets.logo,logoNeg:st.assets.logoNeg});
 const steps=E('ol',undefined,'ps-steps');['Le domande','Scegli lo storyboard','Rifinisci','Crea il video'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 // the style guide in use
 const bx=E('div',undefined,'ad-brand');bx.dataset.source=brand.source;const sw=E('span',undefined,'ad-swatches');
 ['primary','secondary','accent','dark','light'].forEach(k=>{const i=E('i');i.style.background=brand.colors[k];i.title=k+' '+brand.colors[k];sw.append(i)});
 const bt=E('span',undefined,'ad-brand-text');bt.append(E('strong',brand.name),E('span',brand.label+' · '+brand.font.heading));bx.append(sw,bt);
 if(brand.logo){const li=E('img',undefined,'ad-brand-logo');li.src=svgData(brand.logo);li.alt='Logo';bx.append(li)}
 const form=E('div',undefined,'ps-form'),qs=E('div',undefined,'ps-questions rs-questions');
 const chips=(id,label,opts,cls)=>{const fs=E('fieldset',undefined,cls||'');fs.append(E('legend',label));opts.forEach(([v,text,sub,g])=>{const l=E('label',undefined,'ps-chip'+(sub?' rs-tile':'')),r=E('input');r.type='radio';r.name='rs-'+id+'-'+n;r.value=String(v);
   r.checked=String(answers[id])===String(v);l.append(r);if(g)l.append(g);if(sub){const t=E('span',undefined,'rs-tile-text');t.append(E('strong',text),E('small',sub));l.append(t)}else l.append(doc().createTextNode(text));fs.append(l)});return fs};
 const goalFs=chips('goal','Obiettivo',GOALS.map(g=>[g[0],g[1]]));
 const durFs=chips('duration','Durata',DURATIONS.map(d=>[d,d+' s']));
 const fmtFs=chips('format','Formato',FORMATS.map(f=>[f.id,f.label,f.sub,glyph(f)]),'rs-wide rs-formats');
 // photos and clips
 const media=E('fieldset',undefined,'rs-wide rs-media');media.append(E('legend','Le tue foto e clip *'));
 const up=E('label',undefined,'pf-drop rs-drop'),fileIn=E('input');fileIn.type='file';fileIn.multiple=true;fileIn.accept='image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime';fileIn.className='ad-file';
 const upText=E('span',undefined,'pf-drop-text');upText.append(E('strong','Carica le foto e le clip'),E('small','Foto JPG, PNG o WebP (fino a 15 MB) e, se vuoi, fino a '+MAX_CLIPS+' clip brevi MP4 o WebM (fino a '+CLIP_SECONDS+' s) · trascinale qui o fai clic. Almeno 2 immagini per un buon ritmo.'));up.append(fileIn,upText);
 const thumbs=E('ul',undefined,'rs-thumbs');thumbs.setAttribute('aria-label','Immagini caricate');media.append(up,thumbs);
 const fields=E('div',undefined,'rs-fields'),factsL=E('label','Fatti del prodotto o del messaggio *'),facts=E('textarea'),ctaL=E('label','Invito finale (pulsante)'),cta=E('input');
 facts.rows=3;facts.maxLength=FACTS_MAX;facts.placeholder=String('Es. Pane di semola rimacinata, lievito madre, 24 ore di lievitazione. In negozio a Torino, via Roma 12. Per la testimonianza: incolla qui le parole esatte del cliente.');
 cta.type='text';cta.maxLength=CTA_MAX;cta.value=answers.cta;factsL.append(facts);ctaL.append(cta);fields.append(factsL,ctaL);
 qs.append(goalFs,durFs,fmtFs);form.append(bx,qs,media,fields);
 const go=button('Prepara 3 storyboard','primary'),cost=E('span','Una chiamata AI al Video Producer: ti chiedo conferma prima. Il video poi si crea qui nel browser, senza crediti.','muted'),bar=E('div',undefined,'ps-actions');bar.append(go,cost);form.append(bar);
 const status=E('p','','tool-status');status.setAttribute('role','status');
 const saved=E('div',undefined,'ad-saved rs-saved');saved.hidden=true;
 const grid=E('div',undefined,'rs-boards'),result=E('div',undefined,'rs-result'),render=E('div',undefined,'rs-render');grid.hidden=result.hidden=render.hidden=true;
 wrap.append(steps,form,saved,status,grid,result,render);setStep(1);
 let ctaTouched=false;
 wrap.addEventListener('change',e=>{const t=e.target;if(!t||!t.name||!t.name.startsWith('rs-'))return;const id=t.name.slice(3).replace(/-\d+$/,'');
  if(id==='goal'){answers.goal=t.value;if(!ctaTouched){answers.cta=CTA_FOR[t.value];cta.value=answers.cta}}else if(id==='duration')answers.duration=+t.value;else if(id==='format')answers.format=t.value;
  else if(id==='style'||id==='quality'){answers[id]=t.value;if(st.chosen){drawPreview()}}});
 cta.oninput=()=>{ctaTouched=true;answers.cta=clean(cta.value)||CTA_FOR[answers.goal]};
 function renderThumbs(){thumbs.replaceChildren(...st.photos.map((p,i)=>{const li=E('li',undefined,'rs-thumb'),im=E('img');im.src=p.thumb;im.alt='';const cap=E('span',(i+1)+' · '+(p.kind==='video'?'clip ':'')+p.name,'rs-thumb-name');
   const rm=button('Togli','rs-remove');rm.setAttribute('aria-label','Togli '+p.name);rm.onclick=()=>{const x=st.photos.splice(i,1)[0];if(x&&x.url)root.URL.revokeObjectURL(x.url);
    if(st.chosen)st.chosen.scenes.forEach(s=>{if(s.photo===i)s.photo=st.photos.length?0:-1;else if(s.photo>i)s.photo--});renderThumbs();if(st.chosen)renderResult()};
   if(p.kind==='video')li.dataset.kind='video';li.append(im,cap,rm);return li}));thumbs.hidden=!st.photos.length}
 renderThumbs();
 fileIn.onchange=async()=>{const files=[...(fileIn.files||[])];fileIn.value='';let added=0;const errs=[];
  for(const f of files){if(st.photos.length>=MAX_PHOTOS){errs.push('massimo '+MAX_PHOTOS+' immagini');break}
   const video=/^video\//.test(f.type);if(video&&st.photos.filter(p=>p.kind==='video').length>=MAX_CLIPS){errs.push('massimo '+MAX_CLIPS+' clip');continue}
   if(f.size>(video?CLIP_BYTES:PHOTO_BYTES)){errs.push(f.name+' è troppo grande ('+mb(f.size)+')');continue}
   try{st.photos.push(video?await clipAsset(f):await photoAsset(f));added++}catch(e){errs.push(f.name+': '+e.message)}}
  renderThumbs();status.textContent=(added?'Caricate '+added+' immagini. ':'')+(errs.length?'Non caricate: '+errs.join('; ')+'.':'');if(st.chosen)renderResult()};
 // saved reels: reopen without a new AI call (the photos are not saved: they are loaded again)
 async function loadSaved(){if(!ctx.workspace||!ctx.projectId)return;try{const s=readStore(await ctx.workspace.bind(ctx.projectId,'agents').load());if(!s.items.length)return;
  saved.replaceChildren(E('h4','Reel salvati nel progetto'));const row=E('div',undefined,'ad-saved-row');
  s.items.slice(-4).reverse().forEach(r=>{const b=button(r.name+' · '+new Date(r.at).toLocaleDateString('it-IT'),'ad-saved-item');b.onclick=()=>{Object.assign(answers,normalize(r));st.boards=[];grid.hidden=true;choose(fromRecord(r,st.photos.length));
   status.textContent='Riaperto «'+r.name+'». Le foto non si salvano nel progetto: '+(st.photos.length?'controlla quale immagine va in ogni scena.':'caricale di nuovo qui sopra ('+(r.photos||[]).map(p=>p.name).filter(Boolean).slice(0,6).join(', ')+').')};row.append(b)});
  saved.append(row);saved.hidden=false}catch(e){}}
 loadSaved();
 const lock=on=>{go.disabled=on;form.querySelectorAll('input,textarea').forEach(x=>x.disabled=on)};
 go.onclick=async()=>{const values={facts:facts.value,cta:answers.cta,project,photos:st.photos,projectFacts:factsText(project,ctx.profile)};let prompt;
  try{prompt=storyboardPrompt(answers,values)}catch(e){status.textContent=e.message;(st.photos.length?facts:fileIn).focus();return}
  const rt=root.RadixAgents;if(!rt||typeof rt.reply!=='function'){status.textContent='Gli agenti non si sono caricati: ricarica la pagina.';return}
  if(!await askConfirm({title:'Preparare 3 storyboard con il Video Producer AI?',cost:'È una sola chiamata AI: usa crediti API.',message:'Il video poi si crea qui nel browser, senza crediti.',ok:'Prepara gli storyboard'}))return;
  st.values=values;lock(true);setStep(2);status.textContent='Il Video Producer prepara i 3 storyboard…';grid.hidden=false;grid.replaceChildren(...[0,1,2].map(()=>E('div',undefined,'rs-board ad-skeleton')));result.hidden=render.hidden=true;
  try{const r=await rt.reply({role:AGENT,project,memoryScope:ctx.memoryScope,messages:[{role:'user',content:prompt}]});
   const list=parseStoryboards(r&&r.text,{answers,photos:st.photos.length,input:inputText(values)});if(!list.length)throw Error('la risposta non contiene storyboard leggibili. Riprova.');
   st.boards=list;st.chosen=null;renderBoards();go.textContent='Prepara altri 3 storyboard';
   status.textContent=(list.length<COUNT?'Sono arrivati '+list.length+' storyboard su '+COUNT+'. ':'')+'Confrontali e scegli quello da rifinire.'+(list.some(b=>b.issues.length)?' Alcuni hanno punti da controllare.':'')}
  catch(e){status.textContent='Storyboard non preparati: '+e.message;setStep(1);grid.hidden=!st.boards.length;if(st.boards.length)renderBoards()}
  finally{lock(false)}};
 // a frame of a plan on a small canvas
 function still(plan,t,w,cls){const s=w/plan.fmt.w,c=E('canvas',undefined,cls||'rs-frame');c.width=Math.round(plan.fmt.w*s);c.height=Math.round(plan.fmt.h*s);const g=c.getContext('2d');g.scale(s,s);drawFrame(g,plan,assets(),t);return c}
 const range=w=>sec(w.start)+'–'+sec(w.end)+' s';
 function issuesList(b){const ul=E('ul',undefined,'ad-issues');b.issues.slice(0,6).forEach(i=>ul.append(E('li',issueText(i))));if(b.issues.length>6)ul.append(E('li','E altri '+(b.issues.length-6)+' punti.'));return ul}
 function renderBoards(){setStep(st.chosen?3:2);const f=format(answers.format);
  grid.replaceChildren(...st.boards.map((b,i)=>{const plan=planOf(b,answers,brand),card=E('article',undefined,'rs-board');card.dataset.chosen=String(!!st.chosen&&st.chosen.id===b.id);
   const head=E('div',undefined,'rs-board-head');head.append(E('span','Storyboard '+(i+1),'ad-angle'),E('h3',b.name));if(b.idea)head.append(E('p',b.idea,'rs-idea'));
   const pills=E('p',undefined,'rs-pills');pills.append(E('span',b.scenes.length+' scene · '+answers.duration+' s','rs-pill'),E('span','Musica: '+b.mood,'rs-pill'),E('span',f.ratio,'rs-pill'));
   const strip=E('ol',undefined,'rs-strip');strip.dataset.format=f.id;
   b.scenes.forEach((s,k)=>{const w=plan.tl.scenes[k],li=E('li',undefined,'rs-shot'),cap=E('div',undefined,'rs-shot-cap');li.append(still(plan,Math.min(w.end-.05,w.start+(k?Math.max(TRANS+.05,w.dur*.55):.6)),f.id==='16x9'?208:f.id==='1x1'?150:118));
    cap.append(E('span',(k===0?'Gancio · ':'')+range(w),'rs-time'),E('span',s.text||'—','rs-shot-text'));if(s.subs.length)cap.append(E('span','«'+s.subs.join(' ')+'»','rs-shot-sub'));li.append(cap);strip.append(li)});
   const li=E('li',undefined,'rs-shot rs-shot-end'),cap=E('div',undefined,'rs-shot-cap');li.append(still(plan,plan.tl.end.start+Math.min(plan.tl.end.dur-.05,1.2),f.id==='16x9'?208:f.id==='1x1'?150:118));cap.append(E('span','Chiusura · '+range(plan.tl.end),'rs-time'),E('span',b.end.cta,'rs-shot-text'));li.append(cap);strip.append(li);
   const use=button('Scegli questo','primary');use.onclick=()=>choose(b);
   card.append(head,pills,strip);if(b.adjusted)card.append(E('p','Durate adattate a '+answers.duration+' s in totale.','rs-note'));if(b.issues.length)card.append(issuesList(b));card.append(use);return card}))}
 function choose(b){st.chosen=JSON.parse(JSON.stringify(b));st.t=Math.min(.8,st.chosen.scenes[0]?st.chosen.scenes[0].dur*.5:.5);grid.querySelectorAll('.rs-board').forEach((x,i)=>x.dataset.chosen=String(st.boards[i]&&st.boards[i].id===b.id));
  setStep(3);result.hidden=false;render.hidden=false;renderResult();renderRender();result.scrollIntoView&&result.scrollIntoView({behavior:'smooth',block:'start'})}
 // ---- step 3: preview and refinement ----
 const stage=E('div',undefined,'rs-stage'),pv=E('canvas',undefined,'rs-preview'),ctrl=E('div',undefined,'rs-controls'),playB=button('▶ Anteprima','rs-play'),scrub=E('input'),clock=E('span','','rs-clock'),safeL=E('label',undefined,'ad-switch rs-switch'),safeC=E('input');
 pv.setAttribute('role','img');scrub.type='range';scrub.min='0';scrub.step='0.05';scrub.className='rs-scrub';scrub.setAttribute('aria-label','Momento del video');safeC.type='checkbox';safeC.checked=st.safe;safeL.append(safeC,E('span','Zone sicure'));
 ctrl.append(playB,scrub,clock,safeL);stage.append(pv,ctrl);
 const summary=E('p',undefined,'rs-pills rs-summary'),scenesBox=E('ol',undefined,'rs-scenes'),endBox=E('div',undefined,'rs-endbox'),tools=E('div',undefined,'ad-tools rs-tools'),rStatus=E('p','','tool-status');rStatus.setAttribute('role','status');
 safeC.onchange=()=>{st.safe=safeC.checked;drawPreview()};
 const plan=()=>planOf(st.chosen,answers,brand);
 function drawPreview(){if(!st.chosen)return;const P=plan(),w=P.fmt.id==='16x9'?640:P.fmt.id==='1x1'?420:300,s=w/P.fmt.w;pv.width=Math.round(P.fmt.w*s);pv.height=Math.round(P.fmt.h*s);const g=pv.getContext('2d');g.setTransform(s,0,0,s,0,0);
  st.t=clamp(st.t,0,P.tl.total);drawFrame(g,P,assets(),st.t,{safe:st.safe&&!st.playing});scrub.max=String(P.tl.total);scrub.value=String(st.t);clock.textContent=sec(st.t)+' / '+sec(P.tl.total)+' s';
  pv.setAttribute('aria-label','Anteprima del reel al secondo '+sec(st.t));pv.closest&&pv.parentNode&&(pv.parentNode.dataset.format=P.fmt.id)}
 scrub.oninput=()=>{st.t=+scrub.value;if(!st.playing)drawPreview()};
 playB.onclick=async()=>{if(st.playing){st.playing=false;return}const P=plan();if(st.t>=P.tl.total-.05)st.t=0;st.playing=true;playB.textContent='❚❚ Pausa';const t0=root.performance.now()-st.t*1000;
  while(st.playing&&wrap.isConnected){st.t=(root.performance.now()-t0)/1000;if(st.t>=P.tl.total){st.t=P.tl.total;break}syncClips(P,assets(),st.t,true);drawPreview();await nextFrame()}
  st.playing=false;syncClips(P,assets(),P.tl.total+1,false);playB.textContent='▶ Anteprima';drawPreview()};
 function refresh(){clearTimeout(st.timer);st.timer=setTimeout(()=>{check(st.chosen,{answers,input:inputText(st.values)});renderSummary();drawPreview()},160)}
 function renderSummary(){const b=st.chosen,P=plan(),tot=P.tl.scenes.reduce((s,w)=>s+w.dur,0)+P.tl.end.dur,hook=!!(b.scenes[0]&&b.scenes[0].text),iss=b.issues||[];
  summary.replaceChildren(E('span','Durata '+sec(tot)+' s su '+answers.duration+' s','rs-pill ok'),E('span',hook?'Gancio a 0 s':'Manca il gancio','rs-pill'+(hook?' ok':' warn')),E('span',P.cues.length+' sottotitoli','rs-pill'),E('span',iss.length?iss.length+' punti da controllare':'Testi verificati','rs-pill'+(iss.length?' warn':' ok')));
  summary.title=iss.map(issueText).join('\n');const old=result.querySelector('.ad-issues');const fresh=iss.length?issuesList(b):null;if(old)old.replaceWith(fresh||E('span'));else if(fresh)summary.after(fresh)}
 function seg(label,id,opts){const box=E('div',undefined,'ad-tool'),g=E('div',undefined,'ad-seg rs-seg');g.setAttribute('role','group');g.setAttribute('aria-label',label);
  opts.forEach(([v,t])=>{const b=button(t);b.setAttribute('aria-pressed',String(answers[id]===v));b.onclick=()=>{answers[id]=v;g.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));drawPreview();renderRender()};g.append(b)});
  box.append(E('span',label,'ad-tool-label'),g);return box}
 function renderResult(){const b=st.chosen;if(!b)return;const head=E('div',undefined,'rs-result-head'),t=E('div');t.append(E('span','Storyboard scelto','ad-angle'),E('h3',b.name));head.append(t);
  tools.replaceChildren(seg('Sottotitoli','style',STYLES),seg('Qualità','quality',QUALITY));
  const body=E('div',undefined,'rs-body');body.dataset.format=answers.format;const left=E('div',undefined,'rs-left'),right=E('div',undefined,'rs-right');left.append(stage,E('p','Le zone sicure (in rosa) restano libere per l’interfaccia di Reels e TikTok: i testi stanno dentro la cornice.','rs-note'));
  renderScenes();renderEnd();right.append(E('h4','Scene'),E('p','«'+AI_MOTION.label+'» su ogni scena: '+AI_MOTION.note,'rs-note'),scenesBox,E('h4','Chiusura'),endBox);body.append(left,right);
  result.replaceChildren(head,summary,tools,body,rStatus);renderSummary();drawPreview()}
 function renderScenes(){const b=st.chosen,P=plan();
  scenesBox.replaceChildren(...b.scenes.map((s,i)=>{const w=P.tl.scenes[i],li=E('li',undefined,'rs-scene'),top=E('div',undefined,'rs-scene-top');
   const t=E('button',undefined,'rs-scene-jump');t.type='button';t.append(E('strong','Scena '+(i+1)+(i===0?' · gancio':'')),E('span',range(w),'rs-time'));t.onclick=()=>{st.t=w.start+Math.min(w.dur*.5,1);drawPreview()};
   const upB=button('↑','rs-mini'),dnB=button('↓','rs-mini');upB.setAttribute('aria-label','Sposta la scena '+(i+1)+' prima');dnB.setAttribute('aria-label','Sposta la scena '+(i+1)+' dopo');upB.disabled=i===0;dnB.disabled=i===b.scenes.length-1;
   upB.onclick=()=>{b.scenes=move(b.scenes,i,-1);renderScenes();refresh()};dnB.onclick=()=>{b.scenes=move(b.scenes,i,1);renderScenes();refresh()};
   const ord=E('span',undefined,'rs-order');ord.append(upB,dnB);top.append(t,ord);
   const row=E('div',undefined,'rs-scene-row'),th=E('span',undefined,'rs-scene-thumb'),ph=st.photos[s.photo];if(ph){const im=E('img');im.src=ph.thumb;im.alt='';th.append(im)}else th.textContent='Brand';
   const pick=E('label',undefined,'rs-field'),sel=E('select');pick.append(E('span','Immagine'),sel);sel.append(...st.photos.map((p,k)=>new Option((k+1)+' · '+(p.kind==='video'?'clip · ':'')+p.name.slice(0,28),String(k))),new Option('Sfondo del brand','-1'));sel.value=String(ph?s.photo:-1);
   sel.onchange=()=>{s.photo=+sel.value;renderScenes();drawPreview()};
   const mv=E('label',undefined,'rs-field'),ms=E('select');mv.append(E('span','Movimento'),ms);ms.append(...MOTIONS.map(([v,l])=>new Option(l,v)));ms.value=s.motion;ms.onchange=()=>{s.motion=ms.value;st.t=w.start+.05;drawPreview()};
   const du=E('label',undefined,'rs-field rs-dur'),di=E('input');di.type='number';di.min=String(SCENE_MIN);di.step='0.1';di.value=String(w.dur);di.inputMode='decimal';du.append(E('span','Secondi'),di);
   di.onchange=()=>{const next=setDuration(b.scenes.map(x=>x.dur),i,parseFloat(String(di.value).replace(',','.')),answers.duration);b.scenes.forEach((x,k)=>x.dur=next[k]);renderScenes();refresh()};
   row.append(th,pick,mv,du);
   const tx=E('label',undefined,'rs-field rs-text'),ti=E('input'),cnt=E('span','','ad-count');ti.type='text';ti.maxLength=TEXT_MAX;ti.value=s.text;const upd=()=>{cnt.textContent=chars(ti.value)+'/'+TEXT_MAX;cnt.dataset.near=String(chars(ti.value)>TEXT_MAX*.9)};upd();
   const tt=E('span',undefined,'rs-field-top');tt.append(E('span','Testo a schermo'),cnt);tx.append(tt,ti);ti.oninput=()=>{upd();s.text=clean(ti.value);refresh()};
   const sb=E('label',undefined,'rs-field rs-subs'),sa=E('textarea');sa.rows=2;sa.value=s.subs.join('\n');sb.append(E('span','Sottotitoli · una frase per riga'),sa);sa.oninput=()=>{s.subs=sa.value.split('\n').map(clean).filter(Boolean).slice(0,8);refresh()};
   const ai=button(AI_MOTION.label+' · presto','rs-ai');ai.disabled=!AI_MOTION.available;ai.title=AI_MOTION.note;
   const aiBox=E('div',undefined,'rs-ai-box');aiBox.append(ai);
   li.append(top,row,tx,sb,aiBox);return li}))}
 function renderEnd(){const e=st.chosen.end,f=(label,key,max)=>{const l=E('label',undefined,'rs-field'),i=E('input'),c=E('span','','ad-count');i.type='text';i.maxLength=max;i.value=e[key]||'';const u=()=>{c.textContent=chars(i.value)+'/'+max};u();
   const t=E('span',undefined,'rs-field-top');t.append(E('span',label),c);l.append(t,i);i.oninput=()=>{u();e[key]=clean(i.value);st.t=plan().tl.end.start+1.2;refresh()};return l};
  const lg=E('label',undefined,'ad-switch rs-switch'),lc=E('input');lc.type='checkbox';lc.checked=e.logo!==false;lc.onchange=()=>{e.logo=lc.checked;st.t=plan().tl.end.start+1.2;drawPreview()};lg.append(lc,E('span',brand.logo?'Logo del Kit identità':'Nome del brand (crea il Kit identità per il logo)'));
  endBox.replaceChildren(f('Titolo','title',TEXT_MAX),f('Pulsante','cta',CTA_MAX),f('Sotto il pulsante','sub',END_SUB_MAX),lg)}
 // ---- step 4: the render ----
 const prog=E('progress',undefined,'rs-progress'),progT=E('span','','rs-progress-text'),out=E('div',undefined,'rs-out');prog.max=1;prog.value=0;
 function renderRender(){if(!st.chosen||st.rendering)return;const P=plan(),size=renderSize(P.fmt.id,answers.quality),kinds=root.MediaRecorder?pickMimes(t=>root.MediaRecorder.isTypeSupported(t)):[];
  const head=E('div',undefined,'rs-render-head');head.append(E('h3','Crea il video'),E('p',size.w+'×'+size.h+' · '+FPS+' fps · '+answers.duration+' s · '+(kinds.length?kinds.map(k=>k.ext.toUpperCase()).join(' e '):'registrazione non disponibile in questo browser')+'. Nessun credito: il video si registra qui, in tempo reale.','rs-note'));
  const au=E('div',undefined,'rs-audio'),al=E('label',undefined,'pf-drop rs-drop'),ai=E('input');ai.type='file';ai.accept='audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.ogg';ai.className='ad-file';
  const alText=E('span',undefined,'pf-drop-text');alText.append(E('strong','Musica (facoltativa)'),E('small','Un brano con licenza: MP3, M4A, WAV o OGG fino a 25 MB · trascinalo qui o fai clic. Senza musica il video è muto, con i sottotitoli.'));al.append(ai,alText);
  const vol=E('label',undefined,'rs-field rs-vol'),vr=E('input');vr.type='range';vr.min='0';vr.max='1';vr.step='0.05';vr.value=String(st.audio?st.audio.volume:.8);vol.append(E('span','Volume'),vr);vol.hidden=!st.audio;vr.oninput=()=>{if(st.audio)st.audio.volume=+vr.value};
  const an=E('p',st.audio?'Musica: '+st.audio.name+' · sfuma nell’ultimo secondo.':'','rs-note');
  ai.onchange=async()=>{const f=ai.files&&ai.files[0];if(!f)return;if(f.size>AUDIO_BYTES){an.textContent='Il file supera 25 MB: usane uno più leggero.';return}st.audio={name:f.name,bytes:await f.arrayBuffer(),volume:+vr.value};vol.hidden=false;an.textContent='Musica: '+f.name+' · sfuma nell’ultimo secondo.';rm.hidden=false};
  const rm=button('Togli la musica','rs-mini-text');rm.hidden=!st.audio;rm.onclick=()=>{st.audio=null;vol.hidden=true;an.textContent='';rm.hidden=true};
  au.append(al,vol,an,rm);
  const goR=button('Crea il video','primary'),stop=button('Annulla');stop.hidden=true;const acts=E('div',undefined,'ps-actions');acts.append(goR,stop,E('span','Tieni la scheda aperta e in primo piano mentre registra: dura quanto il video.','muted'));
  const pr=E('div',undefined,'rs-prog');pr.append(prog,progT);pr.hidden=!st.rendering;
  goR.onclick=()=>doRender(goR,stop,pr);stop.onclick=()=>{st.cancel=true};goR.disabled=!kinds.length;
  render.replaceChildren(head,au,acts,pr,out)}
 function clearUrls(){st.urls.forEach(u=>root.URL.revokeObjectURL(u));st.urls=[]}
 async function doRender(goR,stop,pr){if(st.rendering)return;const b=st.chosen;check(b,{answers,input:inputText(st.values)});const P=plan();st.playing=false;st.rendering=true;st.cancel=false;goR.disabled=true;stop.hidden=false;pr.hidden=false;prog.value=0;setStep(4);clearUrls();out.replaceChildren();
  progT.textContent='Preparo…';
  try{const res=await record(P,assets(),{audio:st.audio,isCancelled:()=>st.cancel,onProgress:(k,t)=>{prog.value=k;progT.textContent='Registro: '+sec(t)+' s di '+sec(P.tl.total)+' s ('+Math.round(k*100)+'%)'}});
   if(!res){progT.textContent='Registrazione annullata.';return}
   prog.value=1;progT.textContent='Creo la copertina e i sottotitoli…';
   const cv=E('canvas');cv.width=P.fmt.w;cv.height=P.fmt.h;const g=cv.getContext('2d');drawFrame(g,P,assets(),Math.min(.8,P.tl.scenes[0]?P.tl.scenes[0].dur*.5:.5));res.cover=await toPng(cv);
   st.result={...res,board:JSON.parse(JSON.stringify(b)),answers:{...answers}};showResult();progT.textContent='Fatto: video di '+sec(P.tl.total)+' s, '+res.width+'×'+res.height+(res.withAudio?', con musica':', muto con sottotitoli')+'.'}
  catch(e){progT.textContent='Video non creato: '+e.message}
  finally{st.rendering=false;goR.disabled=false;stop.hidden=true}}
 function showResult(){const r=st.result,base=baseName(r.board,brand),files=bundleFiles(r.board,{webm:r.webm,mp4:r.mp4,cover:r.cover},{answers:r.answers,brand}),v=E('video',undefined,'rs-video');v.controls=true;v.playsInline=true;v.muted=!r.withAudio;
  const main=r.mp4&&v.canPlayType&&v.canPlayType(r.mp4Mime)?{data:r.mp4,type:r.mp4Mime}:{data:r.webm||r.mp4,type:r.webmMime||r.mp4Mime},url=root.URL.createObjectURL(new root.Blob([main.data],{type:main.type}));st.urls.push(url);v.src=url;if(r.cover){const pu=root.URL.createObjectURL(new root.Blob([r.cover],{type:'image/png'}));st.urls.push(pu);v.poster=pu}v.dataset.format=r.answers.format;
  const list=E('ul',undefined,'rs-files');files.forEach(f=>{const li=E('li'),b=button(f.name,'rs-file');const type=/\.webm$/.test(f.name)?r.webmMime:/\.mp4$/.test(f.name)?r.mp4Mime:/\.png$/.test(f.name)?'image/png':'text/plain;charset=utf-8';
   b.onclick=()=>download(f.name,f.data,type);li.append(b,E('span',mb(typeof f.data==='string'?new TextEncoder().encode(f.data).length:f.data.length),'rs-size'));list.append(li)});
  const acts=E('div',undefined,'ps-actions'),zipB=button('Scarica tutto (.zip)','primary');zipB.onclick=()=>{const Z=zipLib();if(!Z){rStatus.textContent='Lo zip non si è caricato.';return}try{download(base+'.zip',Z.zip(files),'application/zip')}catch(e){progT.textContent='Zip non creato: '+e.message}};acts.append(zipB);
  if(ctx.workspace&&ctx.projectId){const sv=button('Salva nel progetto');sv.onclick=()=>saveAll(sv);acts.append(sv)}
  const sStatus=E('p','','tool-status rs-save-status');sStatus.setAttribute('role','status');
  const box=E('div',undefined,'rs-done'),side=E('div',undefined,'rs-done-side');side.append(E('h4','I file'),list,acts,sStatus);box.append(v,side);out.replaceChildren(box);
  async function saveAll(btn){btn.disabled=true;sStatus.textContent='Salvo lo storyboard nel progetto…';
   try{await saveToProject(ctx.workspace,ctx.projectId,savedRecord(r.board,{answers:r.answers,photos:st.photos,by:ctx.by}));btn.textContent='Salvato';
    sStatus.replaceChildren(doc().createTextNode('Salvato nel progetto: storyboard, testi, tempi e stile. Le foto e il video restano sul tuo computer. '));if(ctx.agentsUrl){const a=E('a','Apri il Video Producer →');a.href=ctx.agentsUrl;sStatus.append(a)}loadSaved()}
   catch(e){sStatus.textContent='Non salvato: '+e.message;btn.disabled=false}}}
 return wrap}

return Object.freeze({AGENT,COUNT,FPS,GOALS,CTA_FOR,FORMATS,DURATIONS,SCENES,MOTIONS,STYLES,QUALITY,MOODS,AI_MOTION,SCENE_MIN,TRANS,HOOK_SECONDS,CPS_MAX,TEXT_MAX,CTA_MAX,END_SUB_MAX,
 goal,format,normalize,renderSize,share,endFor,timeline,setDuration,move,wrapLines,cueChunks,cues,cueAt,cps,stamp,srt,vtt,safeArea,layout,inside,overlap,ease,motionAt,drawRect,entry,frameAt,
 inputText,factsText,storyboardPrompt,parseStoryboards,check,issueText,baseName,storyboardTxt,bundleFiles,MIMES,pickMimes,bitrate,webmDuration,webmDurationOf,
 readStore,savedRecord,addRecord,saveToProject,fromRecord,planOf,drawFrame,record,reelStudio});
});
