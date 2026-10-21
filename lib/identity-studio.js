/* Studio Identità: the brand identity kit. A few questions, ONE AI call to the Stratega di Marca that returns three
   identity directions as JSON (concept, palette of 5 colours, 2 Google Fonts pairings, a small SVG logo, moodboard
   words and image descriptions, tone of voice). RADIX checks the contrast of the palette, cleans the SVG (no scripts,
   no event attributes, no external links, no foreignObject) and shows the logo as an image on light and dark.
   The person picks one, downloads logo.svg, palette.css, palette.json or the whole kit (.zip, lib/zip-lite.js), or saves
   it in the project: the kit as a document in the Stratega's thread on the Agenti AI page, and its colours, font and
   signature in the profile's «Identità visiva» (the same text lib/ped-views.js identityText writes and
   lib/radix-agent-media.js styleGuide reads), so the PED graphics follow it.
   Pure part (questions, prompt, parsing, contrast, sanitizer, files) runs in Node for the tests; identityStudio() is the
   browser widget. The only paid step is the AI call, started from a click with confirmation. No image is generated. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixIdentityStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const AGENT='brand-strategist',COUNT=3,FIELD_MAX=300,LOGO_MAX=6000;
// Chips: label → words for the prompt. Several can be chosen.
const VALUES=[['Affidabile','affidabile'],['Innovativo','innovativo'],['Accogliente','accogliente'],['Esclusivo','esclusivo'],['Sostenibile','sostenibile'],['Giocoso','giocoso'],['Autorevole','autorevole'],['Artigianale','artigianale'],['Dinamico','dinamico'],['Vicino alle persone','vicino alle persone']];
const STYLES=[['Minimale','minimale'],['Elegante','elegante'],['Tecnico','tecnico'],['Caldo','caldo'],['Audace','audace'],['Classico','classico'],['Naturale','naturale'],['Giovane','giovane e colorato']];
const LOGO=[['No, è da creare','no'],['Sì, c’è già','yes']];
const ROLES=[['primary','Primario'],['secondary','Secondario'],['accent','Accento'],['dark','Neutro scuro'],['light','Neutro chiaro']];
const ROLE_DEFAULT={dark:'#1C1C1E',light:'#F7F5F0'};
// Families suggested to the AI (all on Google Fonts); any well-formed family name is accepted.
const FONTS=['Inter','Montserrat','Poppins','Lato','Roboto','Open Sans','Playfair Display','Lora','Raleway','Work Sans','DM Sans','DM Serif Display','Manrope','Nunito','Source Sans 3','Source Serif 4','Merriweather','Libre Baskerville','Cormorant Garamond','EB Garamond','Space Grotesk','IBM Plex Sans','IBM Plex Serif','Archivo','Barlow','Fraunces','Outfit','Sora','Rubik','Karla','Josefin Sans','Bebas Neue','Oswald','Quicksand'];
// The fonts the PED graphics can draw (lib/ped-views.js IDENTITY_FONTS).
const PED_FONTS=['Inter','Montserrat','Poppins','Lato','Roboto','Open Sans','Playfair Display','Lora','Raleway','Work Sans'];
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const chosen=(list,v)=>(Array.isArray(v)?v:[]).map(x=>(list.find(o=>o[1]===x||o[0]===x)||[])[1]).filter(Boolean);
// The project profile (RadixAgents.profileFor) → what the questions start from.
function prefill(profile){const p=profile||{};
 const name=clean(String(p.name||'').split(/\s[—–-]\s/)[0]).slice(0,80),sector=clean(/^progett|^personal brand$/i.test(clean(p.kind))?'':p.kind).slice(0,FIELD_MAX);
 return {name,sector:sector||clean(p.summary||p.positioning).slice(0,FIELD_MAX),audience:clean(p.audience).slice(0,FIELD_MAX),values:[],styles:[],logo:'no'}}

// ---- colours and contrast (WCAG 2.x) ----
const HEX=/^#[0-9a-f]{6}$/i;
function hex(v){const s=clean(v).replace(/^#?/,'#');const m=/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);return (m?'#'+m[1]+m[1]+m[2]+m[2]+m[3]+m[3]:s).toUpperCase()}
const validHex=v=>HEX.test(hex(v));
function luminance(h){const x=hex(h).slice(1);return [0,2,4].map(i=>{const v=parseInt(x.slice(i,i+2),16)/255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)}
function contrast(a,b){const x=luminance(a),y=luminance(b);return Math.round((Math.max(x,y)+.05)/(Math.min(x,y)+.05)*100)/100}
// The WCAG level of a text/background pair: AAA ≥ 7, AA ≥ 4.5, «solo testo grande» ≥ 3, else not readable.
const level=r=>r>=7?'AAA':r>=4.5?'AA':r>=3?'AA grande':'Insufficiente';
const colourOf=(pal,role)=>(pal.find(c=>c.role===role)||{}).hex;
// The pairs a site or a post really uses: body text on the light neutral, light text on the dark and on the primary,
// the primary and the secondary used as text (or links) on the light neutral, the accent on the dark.
const PAIRS=[['dark','light','Testo su fondo chiaro'],['light','dark','Testo chiaro su fondo scuro'],['light','primary','Testo chiaro sul primario'],['primary','light','Primario come testo su chiaro'],['secondary','light','Secondario come testo su chiaro'],['accent','dark','Accento su fondo scuro']];
function contrastChecks(pal){return PAIRS.map(([fg,bg,label])=>{const a=colourOf(pal,fg),b=colourOf(pal,bg);if(!a||!b)return null;const ratio=contrast(a,b),l=level(ratio);
 return {fg,bg,label,fgHex:a,bgHex:b,ratio,level:l,ok:ratio>=4.5,flag:ratio<4.5?(ratio>=3?'Solo per titoli grandi (almeno 24 px): non per il testo normale.':'Non leggibile come testo: usalo solo per forme e decorazioni.'):''}}).filter(Boolean)}
// The best text colour on a swatch (dark or light neutral), with its ratio: what the badge shows.
function onColour(pal,h){const d=colourOf(pal,'dark')||'#000000',l=colourOf(pal,'light')||'#FFFFFF',rd=contrast(d,h),rl=contrast(l,h);return rd>=rl?{text:d,ratio:rd,level:level(rd)}:{text:l,ratio:rl,level:level(rl)}}
// Five colours, one per role. Accepts a list ({hex,role,name}) or an object keyed by role; missing neutrals are filled in.
const ROLE_WORDS=[['primary',/primar|princip|main|brand/],['secondary',/second/],['accent',/accent|evidenz|highlight/],['dark',/scur|dark|testo|text|nero|black/],['light',/chiar|light|sfond|background|bianc|white/]];
function palette(v){let list=Array.isArray(v)?v:v&&typeof v==='object'?Object.entries(v).map(([k,x])=>typeof x==='string'?{role:k,hex:x}:{role:k,...(x||{})}):[];const out=[];
 list=list.map(x=>typeof x==='string'?{hex:x}:x).filter(x=>x&&validHex(x.hex||x.hexCode||x.colore||x.color));
 for(const x of list){const r=String(x.role||x.ruolo||'').toLowerCase(),role=(ROLES.find(([k,l])=>r===k||r===l.toLowerCase())||[])[0]||(ROLE_WORDS.find(([,re])=>re.test(r))||[])[0];
  if(role&&!out.some(c=>c.role===role))out.push({role,hex:hex(x.hex||x.hexCode||x.colore||x.color),name:clean(x.name||x.nome).slice(0,40)})}
 for(const x of list){const h=hex(x.hex||x.hexCode||x.colore||x.color);if(out.some(c=>c.hex===h))continue;const free=ROLES.find(([k])=>!out.some(c=>c.role===k));if(!free)break;out.push({role:free[0],hex:h,name:clean(x.name||x.nome).slice(0,40)})}
 if(out.length<2)return [];
 for(const k of ['dark','light'])if(!out.some(c=>c.role===k))out.push({role:k,hex:ROLE_DEFAULT[k],name:k==='dark'?'Antracite':'Avorio'});
 if(!out.some(c=>c.role==='accent'))out.push({role:'accent',hex:colourOf(out,'secondary')||colourOf(out,'primary'),name:'Accento'});
 if(!out.some(c=>c.role==='secondary'))out.push({role:'secondary',hex:colourOf(out,'primary'),name:'Secondario'});
 return ROLES.map(([k,l])=>{const c=out.find(x=>x.role===k);return {role:k,label:l,hex:c.hex,name:c.name||l}})}

// ---- the logo: a small SVG, cleaned here whatever the AI wrote ----
const SVG_TAGS=new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','title','desc','defs','lineargradient','radialgradient','stop','clippath']);
const SVG_ATTRS=new Set(['xmlns','viewbox','width','height','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','fx','fy','d','points','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','fill-rule','clip-rule','fill-opacity','stroke-opacity','opacity','transform','font-family','font-size','font-weight','font-style','letter-spacing','text-anchor','dominant-baseline','offset','stop-color','stop-opacity','gradientunits','gradienttransform','id','clip-path','role','aria-label','preserveaspectratio','dx','dy']);
const DROP_WITH_CONTENT=/^(script|style|foreignobject|image|iframe|object|embed|audio|video|canvas|a|use|animate\w*|set|metadata|handler|listener|feimage|filter|mask|pattern|symbol|marker|switch)$/i;
const decode=s=>String(s).replace(/&#x([0-9a-f]+);?/gi,(m,h)=>String.fromCharCode(parseInt(h,16))).replace(/&#(\d+);?/g,(m,d)=>String.fromCharCode(+d)).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const escAttr=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escText=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// A value is kept only when it can load or run nothing: no url() other than a local #id, no scheme, no CSS tricks.
function safeValue(name,v){const s=decode(v).replace(/[\u0000-\u001f]/g,'').trim(),low=s.toLowerCase().replace(/\s+/g,'');
 if(/javascript:|vbscript:|data:|expression\(|@import|<|>/.test(low))return null;
 if(/url\(/.test(low)&&!/^url\(#[\w-]+\)$/.test(low))return null;
 if(name==='id'&&!/^[a-z][\w-]{0,40}$/i.test(s))return null;return s.slice(0,2000)}
// Allowlist rebuild: only basic shapes, paths, text and gradients; every on* attribute, href, style and unknown attribute
// is dropped; script, style, foreignObject, image, a, use (and their content) are removed; comments and doctypes too.
// Returns '' when there is no <svg> root left. The root gets xmlns and a viewBox.
function sanitizeSvg(input){const src=String(input||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g,'').replace(/<\?[\s\S]*?\?>/g,'').replace(/<!DOCTYPE[^>]*>/gi,'');
 const re=/<\/?([a-zA-Z][\w:.-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)|(<)/g;let out='',skip=0,stack=[],m,root=false;
 while((m=re.exec(src))){
  if(m[4]!=null||m[5]){if(!skip&&stack.length&&/^(text|tspan|title|desc)$/.test(stack[stack.length-1]))out+=escText(decode(m[4]||''));continue}
  const close=m[0][1]==='/',tag=m[1].toLowerCase().replace(/^svg:/,''),self=!!m[3];
  if(close){if(skip){skip--;continue}const i=stack.lastIndexOf(tag);if(i<0)continue;while(stack.length>i)out+='</'+stack.pop()+'>';continue}
  if(skip||!SVG_TAGS.has(tag)||DROP_WITH_CONTENT.test(tag)){if(!self)skip++;continue}
  if(!root&&tag!=='svg')continue;
  const attrs=[],ar=/([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;let a;
  while((a=ar.exec(m[2]||''))){const name=a[1].toLowerCase();if(!SVG_ATTRS.has(name)||/^on/.test(name))continue;const v=safeValue(name,a[2]!=null?a[2]:a[3]!=null?a[3]:a[4]!=null?a[4]:'');if(v==null||attrs.some(x=>x[0]===name))continue;attrs.push([name==='viewbox'?'viewBox':name==='gradientunits'?'gradientUnits':name==='gradienttransform'?'gradientTransform':name==='preserveaspectratio'?'preserveAspectRatio':name,v])}
  const tg=tag==='lineargradient'?'linearGradient':tag==='radialgradient'?'radialGradient':tag==='clippath'?'clipPath':tag;
  if(tag==='svg'&&!root){root=true;const at=Object.fromEntries(attrs),vb=/^-?[\d.]+([ ,]+-?[\d.]+){3}$/.test(String(at.viewBox||'').trim())?at.viewBox.trim():'0 0 '+(parseFloat(at.width)||240)+' '+(parseFloat(at.height)||80);
   attrs.splice(0,attrs.length,['xmlns','http://www.w3.org/2000/svg'],['viewBox',vb],...attrs.filter(x=>x[0]!=='xmlns'&&x[0]!=='viewBox'))}
  out+='<'+tg+attrs.map(([k,v])=>' '+k+'="'+escAttr(v)+'"').join('')+(self?'/>':'>');if(!self)stack.push(tg)}
 while(stack.length)out+='</'+stack.pop()+'>';
 return root&&/^<svg\b/.test(out)?out:''}
// A plain wordmark with a round symbol, when the AI gave no usable logo.
function fallbackLogo(name,pal,font){const n=clean(name)||'Brand',w=Math.max(220,90+n.length*20),p=colourOf(pal,'primary')||'#2F5D50',a=colourOf(pal,'accent')||p,d=colourOf(pal,'dark')||'#1C1C1E';
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' 96"><circle cx="48" cy="48" r="30" fill="'+p+'"/><circle cx="60" cy="38" r="10" fill="'+a+'"/><text x="92" y="60" font-family="'+escAttr((font||'Inter')+', sans-serif')+'" font-size="34" font-weight="700" fill="'+d+'">'+escText(n.slice(0,30))+'</text></svg>'}
// The negative version for dark backgrounds: black and near-black shapes become the light neutral, and so does any text
// that would not read on the dark neutral (contrast under 3:1); the other brand colours stay.
function negativeLogo(svg,pal){const light=colourOf(pal,'light')||'#FFFFFF',dark=colourOf(pal,'dark')||'#000000';
 return String(svg).replace(/<(\w+)\b[^>]*>/g,tag=>{const isText=/^<(text|tspan)\b/.test(tag);return tag.replace(/(fill|stroke|stop-color)="([^"]*)"/g,(m,k,v)=>{const s=v.trim().toLowerCase();
   if(s==='black'||(validHex(s)&&(luminance(s)<.035||(isText&&contrast(s,dark)<3))))return k+'="'+light+'"';return m})})
  .replace(/<svg\b(?![^>]*\bfill=)/,'<svg fill="'+light+'"')}
const svgUrl=svg=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);

// ---- prompt and reply ----
function identityPrompt(answers,{project}={}){const a=answers||{},name=clean(a.name).slice(0,80),p=project||{};
 if(name.length<2)throw Error('Scrivi il nome dell’azienda o del brand.');
 const sector=clean(a.sector).slice(0,FIELD_MAX);if(sector.length<3)throw Error('Scrivi in poche parole il settore o cosa fa l’azienda.');
 const values=chosen(VALUES,a.values),styles=chosen(STYLES,a.styles),use=clean(a.use).slice(0,160),avoid=clean(a.avoid).slice(0,160),lines=[];
 lines.push('Prepara '+COUNT+' direzioni di identità visiva alternative tra loro per il brand «'+name+'»'+(p.name&&clean(p.name)!==name?' (progetto «'+clean(p.name).slice(0,80)+'»)':'')+'.');
 lines.push('Settore e attività: «'+sector+'».');
 if(clean(a.audience))lines.push('Pubblico: «'+clean(a.audience).slice(0,FIELD_MAX)+'».');
 lines.push('Personalità e valori: '+(values.length?values.join(', '):'non indicati: deducili dal settore')+'.');
 lines.push('Stile preferito: '+(styles.length?styles.join(', '):'nessuna preferenza: proponi tre stili diversi')+'.');
 if(use)lines.push('Colori da usare: '+use+'.');if(avoid)lines.push('Colori da evitare: '+avoid+'.');
 lines.push(a.logo==='yes'?'Un logo esiste già: proponi un logotipo di studio che possa affiancarlo o rinnovarlo, senza dare per scontato di sostituirlo.':'Il logo non esiste ancora: proponi un logotipo semplice.');
 lines.push('Le tre direzioni devono essere davvero diverse (concetto, colori, caratteri).');
 lines.push('Per ogni direzione: nome del concetto (2-4 parole) e il perché in 2-3 frasi; una palette di 5 colori esadecimali con ruolo (primary, secondary, accent, dark, light) e nome; il colore dark deve essere leggibile come testo sul light (contrasto almeno 4,5:1); 2 abbinamenti di font di Google Fonts (titoli e testi), per esempio tra: '+FONTS.join(', ')+'; il logo come SVG semplice: un simbolo con forme base e il nome come testo, viewBox, al massimo 3 KB, solo svg, g, path, rect, circle, ellipse, line, polygon, text, niente immagini, script, link, stili o font incorporati; la moodboard come 6 parole chiave e 3 descrizioni di immagini (solo testo, non generare immagini); il tono di voce in 3 punti brevi.');
 lines.push('Non inventare fatti sull’azienda. Italiano semplice, niente emoji.');
 lines.push('Rispondi solo con JSON valido, senza testo prima o dopo, in questo formato:');
 lines.push('{"directions":[{"name":"","rationale":"","palette":[{"role":"primary","hex":"#RRGGBB","name":""},{"role":"secondary","hex":"#RRGGBB","name":""},{"role":"accent","hex":"#RRGGBB","name":""},{"role":"dark","hex":"#RRGGBB","name":""},{"role":"light","hex":"#RRGGBB","name":""}],"fonts":[{"heading":"","body":""},{"heading":"","body":""}],"logo":"<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 320 96\\">…</svg>","moodboard":{"keywords":["","","","","",""],"images":["","",""]},"tone":["","",""]}]}');
 return lines.join('\n')}
// JSON out of a reply: fenced or not, with prose around, trailing commas or curly quotes. null when there is none.
function parseJson(text){const raw=String(text||'').replace(/\r/g,''),f=/```(?:json)?\s*\n?([\s\S]*?)```/i.exec(raw),body=f?f[1]:raw;
 const s=body.search(/[[{]/),e=Math.max(body.lastIndexOf('}'),body.lastIndexOf(']'));if(s<0||e<=s)return null;const cut=body.slice(s,e+1);
 for(const t of [cut,cut.replace(/,\s*([}\]])/g,'$1'),cut.replace(/[“”]/g,'"').replace(/,\s*([}\]])/g,'$1')]){try{return JSON.parse(t)}catch(err){}}return null}
const FAMILY=/^[A-Za-z0-9][A-Za-z0-9 ]{1,39}$/;
const family=v=>{const s=clean(v).replace(/['"]/g,'').split(',')[0].trim();const k=FONTS.find(f=>f.toLowerCase()===s.toLowerCase());return k||(FAMILY.test(s)?s:'')};
const strList=(v,max,len)=>(Array.isArray(v)?v:typeof v==='string'?v.split(/\n|;/):[]).map(x=>clean(typeof x==='string'?x:x&&(x.text||x.description||x.descrizione||x.keyword||x.prompt)||'').replace(/^[-*•–·]\s*/,'')).filter(x=>x.length>1).map(x=>x.slice(0,len||200)).slice(0,max);
// One direction, normalized; null when it has no usable palette.
function direction(x,n,brand){if(!x||typeof x!=='object')return null;const pal=palette(x.palette||x.palette_colori||x.colori||x.colors);if(!pal.length)return null;
 const fl=x.fonts||x.font||x.fontPairings||x.typography,fonts=(Array.isArray(fl)?fl:fl&&typeof fl==='object'?[fl]:[]).map(f=>f&&typeof f==='object'?{heading:family(f.heading||f.titoli||f.title),body:family(f.body||f.testi||f.text)}:null).filter(f=>f&&f.heading&&f.body).slice(0,2);
 if(!fonts.length)fonts.push({heading:'Montserrat',body:'Inter'});
 const raw=typeof x.logo==='string'?x.logo:x.logo&&(x.logo.svg||x.logo.code)||x.logo_svg||'',cleanSvg=raw.length<=LOGO_MAX*2?sanitizeSvg(raw):'',ok=!!cleanSvg&&cleanSvg.length<=LOGO_MAX&&/<(path|rect|circle|ellipse|polygon|line|polyline|text)\b/.test(cleanSvg);
 const mb=x.moodboard||{};
 return {name:clean(x.name||x.nome||x.concept||x.concetto).replace(/[«»"]/g,'').slice(0,60)||'Direzione '+n,rationale:clean(x.rationale||x.perche||x.perché||x.motivazione||x.why).slice(0,600),
  palette:pal,checks:contrastChecks(pal),fonts,logo:ok?cleanSvg:fallbackLogo(brand,pal,fonts[0].heading),logoFallback:!ok,
  keywords:strList(mb.keywords||mb.parole||x.keywords,6,40),images:strList(mb.images||mb.immagini||mb.prompts||x.images,3,300),tone:strList(x.tone||x.tono||x.tone_of_voice||x.toneOfVoice,3,200)}}
// The reply → up to three directions; [] when nothing usable is there (the widget says so).
function parseDirections(text,brand){const d=parseJson(text);if(!d)return [];const list=Array.isArray(d)?d:d.directions||d.direzioni||d.identities||d.proposte||[];
 const out=[];(Array.isArray(list)?list:[]).forEach(x=>{if(out.length>=COUNT)return;const it=direction(x,out.length+1,brand);if(it)out.push(it)});return out}

// ---- the files ----
const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
const generic=f=>/serif|garamond|baskerville|lora|merriweather|fraunces|playfair|cormorant/i.test(f)&&!/sans/i.test(f)?'serif':'sans-serif';
function fontsCss(families){const list=[...new Set((families||[]).filter(f=>FAMILY.test(f)))];if(!list.length)return '';
 return 'https://fonts.googleapis.com/css2?'+list.map(f=>'family='+encodeURIComponent(f).replace(/%20/g,'+')+':wght@400;700').join('&')+'&display=swap'}
function paletteCss(k,brand){const f=k.fonts[0];
 return ['/* Kit identità · '+clean(brand)+' · '+k.name+' */','/* Font: '+fontsCss([f.heading,f.body])+' */',':root{',
  ...k.palette.map(c=>'  --color-'+c.role+': '+c.hex+'; /* '+c.label+(c.name&&c.name!==c.label?' · '+c.name.replace(/\*\//g,''):'')+' */'),
  "  --font-heading: '"+f.heading+"', "+generic(f.heading)+';',"  --font-body: '"+f.body+"', "+generic(f.body)+';','}',''].join('\n')}
function paletteJson(k,brand){return JSON.stringify({brand:clean(brand),direction:k.name,colors:k.palette.map(c=>({role:c.role,label:c.label,name:c.name,hex:c.hex})),
 fonts:k.fonts,contrast:k.checks.map(c=>({text:c.fg,background:c.bg,ratio:c.ratio,level:c.level}))},null,2)+'\n'}
function readme(k,brand,{date}={}){const day=date||new Date().toISOString().slice(0,10),L=[];
 L.push('KIT IDENTITÀ · '+clean(brand),'Direzione: '+k.name,'Preparato con RADIX il '+day,'');
 if(k.rationale)L.push('IL CONCETTO',k.rationale,'');
 L.push('PALETTE',...k.palette.map(c=>'- '+c.label+': '+c.hex+(c.name?' ('+c.name+')':'')),'');
 L.push('CONTRASTO (WCAG: AA dal 4,5:1 per il testo normale, dal 3:1 per i titoli grandi)',...k.checks.map(c=>'- '+c.label+': '+String(c.ratio).replace('.',',')+':1 · '+c.level+(c.flag?' · '+c.flag:'')),'');
 L.push('FONT (Google Fonts, licenza libera)',...k.fonts.map((f,i)=>'- Abbinamento '+(i+1)+': '+f.heading+' per i titoli, '+f.body+' per i testi · '+fontsCss([f.heading,f.body])),'');
 if(k.tone.length)L.push('TONO DI VOCE',...k.tone.map(t=>'- '+t),'');
 if(k.keywords.length||k.images.length)L.push('MOODBOARD',...(k.keywords.length?['Parole chiave: '+k.keywords.join(', ')]:[]),...k.images.map((t,i)=>'Immagine '+(i+1)+': '+t),'');
 L.push('FILE','- logo.svg: il logo per fondi chiari','- logo-negativo.svg: il logo per fondi scuri','- palette.css: i colori e i font come variabili CSS','- palette.json: gli stessi dati per altri strumenti','');
 L.push('NOTE','Il logo è una bozza di lavoro: fallo rifinire da un grafico e verifica il marchio su UIBM, TMview e WIPO prima di registrarlo o usarlo.','Le descrizioni della moodboard sono testi: nessuna immagine è stata generata.');
 return L.join('\n')+'\n'}
function kitFiles(k,brand,opts){return [{name:'logo.svg',data:k.logo},{name:'logo-negativo.svg',data:negativeLogo(k.logo,k.palette)},{name:'palette.css',data:paletteCss(k,brand)},{name:'palette.json',data:paletteJson(k,brand)},{name:'LEGGIMI.txt',data:readme(k,brand,opts)}]}
const zipName=(k,brand)=>'kit-identita-'+(slug(brand)||'brand')+'-'+(slug(k.name)||'direzione')+'.zip';

// ---- saved in the project ----
// The PED «Identità visiva» (lib/ped-views.js IDENTITY_ROLES): cover dark enough for light text, light pages, readable text,
// key words visible on the pages, the accent. The font is the first of the kit the PED can draw, else Inter.
function pedGuide(k,brand){const c=r=>colourOf(k.palette,r),page=c('light');
 const text=[c('dark'),c('primary')].find(h=>contrast(h,page)>=4.5)||'#1C1C1E',cover=[c('primary'),c('dark')].find(h=>contrast(h,page)>=4.5)||text;
 const key=[c('secondary'),c('primary'),c('accent')].find(h=>h!==cover&&contrast(h,page)>=3)||cover;
 const font=PED_FONTS.find(f=>f===k.fonts[0].heading)||PED_FONTS.find(f=>f===k.fonts[0].body)||PED_FONTS.find(f=>k.fonts.some(x=>x.heading===f||x.body===f))||'Inter';
 return {cover,page,key,accent:c('accent'),text,font,signature:clean(brand).toUpperCase().slice(0,40)}}
// Same text as lib/ped-views.js identityText, so lib/radix-agent-media.js styleGuide reads it back.
const PED_LABELS=[['cover','Copertina e chiusura'],['page','Pagine interne'],['key','Numeri e parole chiave'],['accent','Accento'],['text','Testi su fondo chiaro']];
function visualText(g,source){const lines=source?[String(source).replace(/#[0-9a-fA-F]{3,8}/g,'').trim()+'.']:[];
 for(const [k,label] of PED_LABELS)lines.push(label+': '+String(g[k]).toUpperCase()+'.');
 const f=PED_FONTS.includes(g.font)?g.font:'Inter';lines.push('Font: '+f+' Bold per i titoli brevi, '+f+' Regular per i testi; al massimo due pesi.');
 if(String(g.signature||'').trim())lines.push('Firma: '+String(g.signature).trim().slice(0,40)+' in alto a sinistra, numerazione in basso.');
 lines.push('Margini ampi; nessun nuovo colore al cambio di argomento.');return lines.join('\n')}
// What the profile keeps besides «visual»: the whole kit in short (the logo included), for the other studios.
function profileKit(k,brand,at){return {brand:clean(brand),direction:k.name,rationale:k.rationale,palette:k.palette.map(c=>({role:c.role,name:c.name,hex:c.hex})),fonts:k.fonts,tone:k.tone,keywords:k.keywords,logo:k.logo,savedAt:at||new Date().toISOString()}}
function toMarkdown(k,brand,opts){const f=k.fonts,L=['# Kit identità · '+clean(brand)+' · '+k.name,''];
 if(k.rationale)L.push(k.rationale,'');
 L.push('## Palette','','| Ruolo | Nome | Colore |','|---|---|---|',...k.palette.map(c=>'| '+c.label+' | '+(c.name||'').replace(/\|/g,'/')+' | '+c.hex+' |'),'');
 L.push('## Contrasto','',...k.checks.map(c=>'- '+c.label+': '+String(c.ratio).replace('.',',')+':1 · '+c.level+(c.flag?' · '+c.flag:'')),'');
 L.push('## Font','',...f.map((x,i)=>'- Abbinamento '+(i+1)+': **'+x.heading+'** per i titoli, **'+x.body+'** per i testi'),'');
 if(k.tone.length)L.push('## Tono di voce','',...k.tone.map(t=>'- '+t),'');
 if(k.keywords.length||k.images.length)L.push('## Moodboard','',...(k.keywords.length?['Parole chiave: '+k.keywords.join(', '),'']:[]),...k.images.map((t,i)=>(i+1)+'. '+t),'');
 L.push('## Logo (SVG)','','```svg',k.logo,'```','','---','Il logo è una bozza: verifica il marchio su UIBM, TMview e WIPO prima di usarlo.');return L.join('\n')}
const MAX_KEPT=60;
function savedEntry(k,brand,md,{by,at}={}){const when=at||new Date().toISOString();
 return [{role:'user',content:'Kit identità scelto dal pannello Marketing: «'+k.name+'» per '+clean(brand)+'.',display:'Kit identità scelto nel pannello Marketing: «'+k.name+'»',by:by||'Pannello Marketing',at:when,source:'identity-studio'},
  {role:'assistant',agent:AGENT,content:'Ecco il kit identità scelto, salvato nel progetto.\n\n---DOCUMENTO: Kit identità · '+clean(brand)+' · '+k.name+'---\n'+md+'\n---FINE DOCUMENTO---',at:when,source:'identity-studio'}]}
// Saves the kit document in the Stratega's thread and, unless `profile:false`, the PED identity in the project profile
// (fresh revision read first, conflicts retried). Returns {project} with the updated project when the profile was written.
async function saveToProject(ws,projectId,k,brand,opts={}){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const md=toMarkdown(k,brand),d=ws.bind(projectId,'agents'),retry=e=>ws.ConflictError&&e instanceof ws.ConflictError;
 for(let i=0;i<3;i++){const cur=(await d.load())||{},conv={...(cur.conversations||{})};conv[AGENT]=(Array.isArray(conv[AGENT])?conv[AGENT]:[]).concat(savedEntry(k,brand,md,opts)).slice(-MAX_KEPT);
  try{await d.save({...cur,schemaVersion:1,conversations:conv});break}catch(e){if(!retry(e)||i===2)throw e}}
 if(opts.profile===false||!ws.projects)return {project:null};
 for(let i=0;i<3;i++){const p=await ws.projects.get(projectId),profile={...(p.profile||{}),visual:visualText(pedGuide(k,brand),'Dal Kit identità «'+k.name+'»'),identityKit:profileKit(k,brand,opts.at)};
  try{return {project:await ws.projects.update(projectId,p.revision,{profile})}}catch(e){if(!retry(e)||i===2)throw e}}}

// ---- browser widget ----
let counter=0;
const doc=()=>root.document;
const el=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
const field=(label,value,ph,max)=>{const l=el('label',label),i=el('input');i.type='text';i.value=value||'';i.placeholder=ph||'';i.maxLength=max||FIELD_MAX;l.append(i);return [l,i]};
// Google Fonts stylesheets, added only when a direction is on screen; each family once.
function loadFonts(families){const d=doc();const want=[...new Set(families)].filter(f=>FAMILY.test(f)&&!d.querySelector('link[data-identity-font="'+f+'"]'));
 want.forEach(f=>{const l=d.createElement('link');l.rel='stylesheet';l.dataset.identityFont=f;l.href=fontsCss([f]);d.head.append(l)})}
const logoImg=(svg,alt)=>{const i=el('img');i.src=svgUrl(svg);i.alt=alt;i.decoding='async';return i};
function save(name,data,type){const a=el('a');a.href=root.URL.createObjectURL(data instanceof root.Blob?data:new root.Blob([data],{type}));a.download=name;doc().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),2000);return name}
// ctx: {project (profile for the AI), memoryScope, projectId, workspace (RadixWorkspace), visual (the profile's current «Identità visiva»), agentsUrl, by, onSaved(project)}
function identityStudio(ctx={}){
 const n=++counter,pre=prefill(ctx.project),answers={values:[],styles:[],logo:'no'},wrap=el('div',undefined,'tool photo-studio identity-studio');
 const steps=el('ol',undefined,'ps-steps');['Le domande','Scegli tra 3 direzioni','Il kit'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const form=el('div',undefined,'ps-form'),qs=el('div',undefined,'ps-questions');
 const checks=(label,list,key)=>{const fs=el('fieldset');fs.append(el('legend',label));list.forEach(([t,v])=>{const l=el('label',undefined,'ps-chip'),c=el('input');c.type='checkbox';c.value=v;
  c.onchange=()=>{answers[key]=list.map(o=>o[1]).filter(x=>x===v?c.checked:answers[key].includes(x))};l.append(c,doc().createTextNode(' '+t));fs.append(l)});return fs};
 const lfs=el('fieldset');lfs.append(el('legend','Esiste già un logo?'));LOGO.forEach(([t,v])=>{const l=el('label',undefined,'ps-chip'),r=el('input');r.type='radio';r.name='is-logo-'+n;r.value=v;r.checked=v==='no';r.onchange=()=>{answers.logo=v};l.append(r,doc().createTextNode(' '+t));lfs.append(l)});
 qs.append(checks('Personalità e valori',VALUES,'values'),checks('Stile',STYLES,'styles'),lfs);
 const [nl,name]=field('Nome dell’azienda o del brand',pre.name,'Es. Forno Bianchi',80),[sl,sector]=field('Settore e attività',pre.sector,'Es. panificio artigianale a Bergamo'),[al,audience]=field('Pubblico (facoltativo)',pre.audience,'Es. famiglie del quartiere e uffici vicini');
 const [ul,use]=field('Colori da usare (facoltativo)','','Es. verde salvia, i colori dell’insegna',160),[vl,avoid]=field('Colori da evitare (facoltativo)','','Es. rosso, fluo',160);
 const fields=el('div',undefined,'ss-fields is-fields');fields.append(nl,sl,al,ul,vl);
 const go=button('✦ Prepara 3 direzioni','primary'),cost=el('span','Una chiamata AI allo Stratega di Marca: ti chiedo conferma prima. Nessuna immagine generata.','muted'),status=el('p','','tool-status');status.setAttribute('role','status');
 const bar=el('div',undefined,'ps-actions');bar.append(go,cost);form.append(fields,qs,bar);
 const grid=el('div',undefined,'ps-grid is-grid'),kit=el('div',undefined,'is-kit');grid.hidden=kit.hidden=true;
 wrap.append(steps,form,status,grid,kit);setStep(1);
 const lock=on=>{go.disabled=on;wrap.querySelectorAll('.ps-form input').forEach(x=>x.disabled=on)};
 let brand='';
 go.onclick=async()=>{let prompt;const a={...answers,name:name.value,sector:sector.value,audience:audience.value,use:use.value,avoid:avoid.value};
  try{prompt=identityPrompt(a,{project:ctx.project})}catch(e){status.textContent=e.message;(/nome/.test(e.message)?name:sector).focus();return}
  const rt=root.RadixAgents;if(!rt||typeof rt.reply!=='function'){status.textContent='Gli agenti non si sono caricati: ricarica la pagina.';return}
  if(!root.confirm('Preparare 3 direzioni di identità (logo, palette, font, moodboard) con lo Stratega di Marca AI? È una sola chiamata AI: usa crediti API. Nessuna immagine viene generata.'))return;
  lock(true);setStep(2);status.textContent='Lo Stratega di Marca prepara le 3 direzioni…';grid.hidden=false;grid.replaceChildren();kit.hidden=true;brand=clean(a.name);
  try{const r=await rt.reply({role:AGENT,project:ctx.project,memoryScope:ctx.memoryScope,messages:[{role:'user',content:prompt}]});const list=parseDirections(r&&r.text,brand);
   if(!list.length)throw Error('la risposta non contiene direzioni leggibili. Riprova.');
   loadFonts(list.flatMap(k=>[k.fonts[0].heading,k.fonts[0].body]));
   status.textContent=(list.length<COUNT?'Sono arrivate '+list.length+' direzioni su '+COUNT+'. ':'')+'Confrontale e scegli quella da sviluppare. I contrasti sono calcolati qui, non dall’AI.';
   grid.replaceChildren(...list.map(card));go.textContent='↺ Prepara altre 3 direzioni'}
  catch(e){status.textContent='Direzioni non preparate: '+e.message;setStep(1);grid.hidden=true}
  finally{lock(false)}};
 const swatches=k=>{const ul=el('ul',undefined,'is-swatches');k.palette.forEach(c=>{const li=el('li',undefined,'is-swatch'),chip=el('span',undefined,'is-chip'),on=onColour(k.palette,c.hex),b=el('span',on.level+' '+String(on.ratio).replace('.',',')+':1','is-badge');
  chip.style.background=c.hex;chip.style.color=on.text;chip.append(el('b','Aa'));b.dataset.ok=String(on.ratio>=4.5);b.title='Contrasto del testo più leggibile su questo colore';
  li.append(chip,el('span',c.label,'is-role'));if(c.name&&c.name!==c.label)li.append(el('span',c.name,'is-name'));li.append(el('code',c.hex),b);ul.append(li)});return ul};
 const flags=k=>{const bad=k.checks.filter(c=>!c.ok);if(!bad.length)return el('p','Contrasti: tutte le coppie principali sono leggibili (AA).','is-flags');const p=el('p',undefined,'is-flags');p.dataset.warn='true';
  p.textContent='Da controllare: '+bad.map(c=>c.label.toLowerCase()+' '+String(c.ratio).replace('.',',')+':1 ('+c.level+')').join('; ')+'.';return p};
 const sample=(f,c)=>{const d=el('div',undefined,'is-font'),h=el('strong',brand||'Titolo'),b=el('span','Testo di esempio: chiaro e leggibile.');h.style.fontFamily="'"+f.heading+"', "+generic(f.heading);b.style.fontFamily="'"+f.body+"', "+generic(f.body);if(c)h.style.color=c;
  d.append(h,b,el('small',f.heading+' + '+f.body,'muted'));return d};
 const logos=k=>{const d=el('div',undefined,'is-logos'),a=el('div',undefined,'is-logo'),b=el('div',undefined,'is-logo');a.style.background=colourOf(k.palette,'light');b.style.background=colourOf(k.palette,'dark');a.dataset.bg='light';b.dataset.bg='dark';
  a.append(logoImg(k.logo,'Logo su fondo chiaro'));b.append(logoImg(negativeLogo(k.logo,k.palette),'Logo su fondo scuro'));d.append(a,b);return d};
 function card(k,i){const f=el('article',undefined,'ps-card is-card'),use=button('Scegli questa','primary');
  f.append(el('h3',(i+1)+' · '+k.name));if(k.rationale)f.append(el('p',k.rationale,'is-why'));
  f.append(logos(k),swatches(k),flags(k),sample(k.fonts[0],colourOf(k.palette,'primary')));
  if(k.keywords.length){const t=el('p',undefined,'is-tags');k.keywords.forEach(w=>t.append(el('span',w)));f.append(t)}
  if(k.logoFallback)f.append(el('p','Il logo proposto non era utilizzabile: al suo posto c’è un logotipo semplice da rifinire.','muted'));
  use.onclick=()=>choose(k,f);f.append(use);return f}
 function choose(k,cardEl){grid.querySelectorAll('.is-card').forEach(x=>x.dataset.chosen=String(x===cardEl));setStep(3);kit.hidden=false;
  loadFonts(k.fonts.flatMap(f=>[f.heading,f.body]));
  const st=el('p','Il kit scelto: scarica i file o salvalo nel progetto.','tool-status');st.setAttribute('role','status');
  const files=()=>kitFiles(k,brand),acts=el('div',undefined,'ps-actions'),dz=button('Scarica il kit (.zip)'),ds=button('logo.svg'),dc=button('palette.css'),dj=button('palette.json');
  ds.onclick=()=>{st.textContent='Scaricato: '+save('logo.svg',k.logo,'image/svg+xml')+'.'};dc.onclick=()=>{st.textContent='Scaricato: '+save('palette.css',paletteCss(k,brand),'text/css;charset=utf-8')+'.'};
  dj.onclick=()=>{st.textContent='Scaricato: '+save('palette.json',paletteJson(k,brand),'application/json')+'.'};
  dz.onclick=()=>{const Z=root.RadixZip;if(!Z){st.textContent='Il generatore .zip non si è caricato: scarica i file uno per uno.';return}
   try{const bytes=Z.zip(files());Z.unzip(bytes);st.textContent='Kit scaricato: '+save(zipName(k,brand),new root.Blob([bytes],{type:'application/zip'}))+'.'}catch(e){st.textContent='Kit non creato: '+e.message}};
  acts.append(dz,ds,dc,dj);
  if(ctx.workspace&&ctx.projectId){const sv=button('Salva nel progetto','primary');acts.prepend(sv);
   sv.onclick=async()=>{const replace=!ctx.visual||root.confirm('Il progetto ha già un’identità visiva per le grafiche del PED. Sostituirla con i colori e il font di questo kit? Con «Annulla» salvo solo il documento del kit.');
    sv.disabled=true;st.textContent='Salvo il kit nel progetto…';
    try{const r=await saveToProject(ctx.workspace,ctx.projectId,k,brand,{by:ctx.by,profile:replace});sv.textContent='Salvato ✓';if(r.project){ctx.visual=r.project.profile&&r.project.profile.visual;if(ctx.onSaved)ctx.onSaved(r.project)}
     st.replaceChildren(doc().createTextNode('Kit salvato nel progetto: il documento è tra quelli dello Stratega di Marca'+(r.project?'; colori, font e firma sono ora l’identità visiva delle grafiche del PED':'')+'. '));
     if(ctx.agentsUrl){const a=el('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;st.append(a)}}
    catch(e){st.textContent='Kit non salvato: '+e.message;sv.disabled=false}}}
  const fonts=el('div',undefined,'is-fonts');k.fonts.forEach(f=>fonts.append(sample(f,colourOf(k.palette,'dark'))));
  const table=el('ul',undefined,'is-checks');k.checks.forEach(c=>{const li=el('li'),s=el('span','Aa','is-pair'),b=el('span',c.level,'is-badge');s.style.background=c.bgHex;s.style.color=c.fgHex;b.dataset.ok=String(c.ok);
   li.append(s,el('span',c.label+' · '+String(c.ratio).replace('.',',')+':1'),b);if(c.flag)li.append(el('small',c.flag,'muted'));table.append(li)});
  const sec=(t,...xs)=>{const d=el('section',undefined,'is-sec');d.append(el('h4',t),...xs);return d};
  const list=xs=>{const u=el('ul');xs.forEach(x=>u.append(el('li',x)));return u};
  const parts=[sec('Logo',logos(k)),sec('Palette',swatches(k)),sec('Contrasto',table),sec('Font',fonts)];
  if(k.tone.length)parts.push(sec('Tono di voce',list(k.tone)));
  if(k.keywords.length||k.images.length){const t=el('p',undefined,'is-tags');k.keywords.forEach(w=>t.append(el('span',w)));parts.push(sec('Moodboard',t,list(k.images.map((x,i)=>'Immagine '+(i+1)+': '+x))))}
  kit.replaceChildren(el('h3','Il kit scelto · '+k.name),acts,st,...parts,el('p','Il logo è una bozza di lavoro: verifica il marchio su UIBM, TMview e WIPO prima di usarlo.','muted'));kit.scrollIntoView&&kit.scrollIntoView({behavior:'smooth',block:'nearest'})}
 return wrap}
return Object.freeze({AGENT,COUNT,VALUES,STYLES,LOGO,ROLES,FONTS,PED_FONTS,prefill,hex,contrast,level,contrastChecks,onColour,palette,sanitizeSvg,fallbackLogo,negativeLogo,svgUrl,identityPrompt,parseJson,parseDirections,fontsCss,paletteCss,paletteJson,readme,kitFiles,zipName,pedGuide,visualText,profileKit,toMarkdown,savedEntry,saveToProject,identityStudio});
});
