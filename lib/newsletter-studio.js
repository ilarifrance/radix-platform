/* Studio Newsletter HTML: the newsletter text (a Newsletter saved from the Studio Testi, lib/copy-studio.js, or pasted)
   becomes a responsive HTML email in the brand of the project (profile.identityKit, else the profile's «Identità
   visiva», else neutral colours). Three templates (Editoriale, Promo, Minimal) drawn as real previews on a computer and
   on a phone; the chosen one is refined block by block (header with logo, image, text, button, two columns, divider,
   footer: edit, move, delete), with subject and preheader counters. The HTML is built for email clients: tables, 600 px,
   inline styles, bulletproof buttons (VML for Outlook), web-safe font fallbacks, dark-mode friendly colours, alt text,
   the logo as a PNG (the kit SVG rasterised on canvas: Gmail does not show SVG) or a hosted address, the unsubscribe
   link as the {{link_disiscrizione}} placeholder (filled with the link sales/crm-campaigns.js withUnsubscribe makes)
   and the merge tags of the CRM newsletter ({{nome}}, {{azienda}}…, sales/lead-newsletter-core.js).
   Deterministic checks (no AI): Gmail clipping at 102 KB, alt text, WCAG AA contrast, https links, subject and
   preheader length, unsubscribe, unknown merge tags, text/image balance, plain-text version.
   Nothing is ever sent from here and no AI is called: download .html/.txt, copy, save in the project, or hand subject
   and plain text to the CRM campaign (radix-crm-campaign-draft), which today sends text only.
   Pure part runs in Node for the tests; newsletterStudio() is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixNewsletterStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
// The styled RADIX confirmation (lib/radix-confirm.js) before every paid step; root.confirm only if it is missing.
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')))};
const WIDTH=600,CLIP_KB=102,SAFE_KB=60,SUBJECT_MAX=60,PRE_MIN=40,PRE_MAX=110,FIELD_MAX=300,BODY_MAX=6000,MAX_SAVED=20;
const UNSUB_TAG='{{link_disiscrizione}}';
// The merge tags of the CRM newsletter (sales/lead-newsletter-core.js TAGS) plus the unsubscribe link.
const TAGS=Object.freeze(['nome','cognome','nome_completo','azienda','ruolo','qualifica','reparto','settore','città','gancio']);
const KNOWN=new Set([...TAGS,'citta','link_disiscrizione']);
// The tags the CRM campaign (sales/crm-campaigns.js fill) understands, in its single-brace form.
const CRM_TAGS=Object.freeze({nome:'{nome}',nome_completo:'{nome_completo}',azienda:'{azienda}',ruolo:'{ruolo}'});
const TAG_RE=/\{\{\s*([^{}|]{1,40}?)\s*(?:\|([^{}]{0,120}))?\}\}/g;
// [id, label, what it is, default button]
const GOALS=Object.freeze([['news','Novità','Una novità da raccontare','Scopri le novità'],['promo','Promo','Un’offerta o una promozione','Approfitta dell’offerta'],['evento','Evento','Un invito a un evento','Iscriviti all’evento'],['contenuto','Contenuto utile','Un consiglio o un articolo','Leggi di più']]);
const TEMPLATES=Object.freeze([
 {id:'editoriale',name:'Editoriale',line:'Testata con il logo, titolo grande e testo arioso. Per novità e contenuti.',best:['news','contenuto']},
 {id:'promo',name:'Promo',line:'Fascia di colore con il titolo al centro e un pulsante grande. Per offerte ed eventi.',best:['promo','evento']},
 {id:'minimal',name:'Minimal',line:'Sembra una lettera: poco colore e il testo in primo piano. Arriva bene in ogni casella.',best:[]}]);
const BLOCKS=Object.freeze({header:'Testata con logo',hero:'Immagine',text:'Testo',button:'Pulsante',columns:'Due colonne',divider:'Separatore',footer:'Piè di pagina'});
const ADDABLE=Object.freeze(['text','hero','button','columns','divider']);

// ---- text helpers ----
const clean=v=>String(v??'').replace(/\r/g,'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();
const oneLine=v=>clean(v).replace(/\s+/g,' ');
const chars=s=>[...String(s||'')].length;
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function bytes(s){let n=0;for(const ch of String(s)){const c=ch.codePointAt(0);n+=c<0x80?1:c<0x800?2:c<0x10000?3:4}return n}
const kb=n=>Math.round(n/102.4)/10;
const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\{\{[^}]*\}\}/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
const goal=id=>GOALS.find(g=>g[0]===id)||GOALS[0];
const template=id=>TEMPLATES.find(t=>t.id===id)||TEMPLATES[0];

// ---- colours ----
const HEX=/^#[0-9A-F]{6}$/;
function hex(v){const s=oneLine(v).replace(/^#?/,'#');const m=/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);return (m?'#'+m[1]+m[1]+m[2]+m[2]+m[3]+m[3]:s).toUpperCase()}
function rgb(h){const x=hex(h).slice(1);return [0,2,4].map(i=>parseInt(x.slice(i,i+2),16))}
function luminance(h){return rgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)}
function contrast(a,b){const x=luminance(a),y=luminance(b);return Math.round((Math.max(x,y)+.05)/(Math.min(x,y)+.05)*100)/100}
function mix(a,b,t){const x=rgb(a),y=rgb(b);return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('').toUpperCase()}
// The first preferred colour readable on bg (≥ need), else the most readable neutral.
function ink(bg,need,...prefer){for(const c of prefer)if(c&&HEX.test(c)&&contrast(c,bg)>=need)return c;return ['#1F2328','#FFFFFF','#000000'].reduce((a,c)=>contrast(c,bg)>contrast(a,bg)?c:a)}
// A colour darkened (or lightened) step by step until it reads on bg.
function readable(c,bg,need){let x=c;const toward=luminance(bg)>.4?'#000000':'#FFFFFF';for(let i=0;i<12&&contrast(x,bg)<need;i++)x=mix(x,toward,.15);return contrast(x,bg)>=need?x:ink(bg,need)}

// ---- the brand: Kit identità, else the «Identità visiva» of the profile, else neutral ----
const NEUTRAL=Object.freeze({primary:'#2F3A45',secondary:'#5B6B7A',accent:'#C9A227',dark:'#1C1C1E',light:'#FFFFFF'});
const FAMILY=/^[A-Za-z0-9 ]{2,40}$/;
const family=f=>FAMILY.test(oneLine(f))?oneLine(f):'';
const WEBSAFE=/^(arial|helvetica|georgia|verdana|tahoma|times new roman|trebuchet ms|courier new)$/i;
const SERIF=/serif|playfair|merriweather|lora|baskerville|garamond|cormorant|crimson|prata|spectral|fraunces|bodoni|cardo|domine|abril|caslon|bitter|zilla|slab|arvo|georgia|times/i;
// A font-family list for email: the brand font first (Apple Mail, iOS and some Android clients load it), then web-safe fonts.
function fontStack(f){const fam=family(f),safe=SERIF.test(fam)?"Georgia,'Times New Roman',serif":'Helvetica,Arial,sans-serif';return fam&&!WEBSAFE.test(fam)?"'"+fam+"',"+safe:safe}
// project: RadixAgents.profileFor summary (with .visual); profile: the registry profile (with .identityKit).
function brandOf(project,profile,projectName,opts={}){
 const pr=profile||{},kit=pr.identityKit&&typeof pr.identityKit==='object'?pr.identityKit:null,colors={...NEUTRAL};
 const name=oneLine(String((kit&&kit.brand)||projectName||(project&&project.name)||'').split(/\s[—–-]\s/)[0]).slice(0,60)||'Il tuo brand';
 let source='default',label='Colori neutri: crea il Kit identità per usare i tuoi',fonts={heading:'',body:''},logo='';
 if(kit&&Array.isArray(kit.palette)){let any=false;for(const c of kit.palette){const h=hex(c&&c.hex);if(c&&NEUTRAL[c.role]&&HEX.test(h)){colors[c.role]=h;any=true}}
  if(any){source='kit';label='Dal Kit identità'+(kit.direction?' «'+oneLine(kit.direction).slice(0,40)+'»':'');const f=Array.isArray(kit.fonts)&&kit.fonts[0]||{};fonts={heading:family(f.heading),body:family(f.body)};
   logo=typeof kit.logo==='string'&&kit.logo.length<=20000&&/^\s*<svg[\s>]/i.test(kit.logo)?kit.logo.trim():''}}
 if(source==='default'){const M=opts.media||root&&root.RadixAgentMedia,g=M&&typeof M.styleGuide==='function'?M.styleGuide(project):null;
  if(g&&HEX.test(hex(g.cover))&&HEX.test(hex(g.page))){source='visual';label='Dall’identità visiva del profilo';
   Object.assign(colors,{primary:hex(g.cover),secondary:hex(g.key||g.cover),accent:hex(g.accent||g.key||g.cover),dark:hex(g.text||g.cover),light:hex(g.page)});fonts={heading:family(g.font),body:family(g.font)}}}
 return {name,source,label,colors,fonts,logo};
}

// ---- the colours of each template, every text pair checked for contrast ----
function theme(tid,brand){
 const c=(brand&&brand.colors)||NEUTRAL,t=template(tid).id,lightCard=luminance(c.light)>.75?c.light:'#FFFFFF';
 const fonts=(brand&&brand.fonts)||{},o={id:t,headingFont:fontStack(fonts.heading||fonts.body),bodyFont:fontStack(fonts.body||fonts.heading),radius:8,align:'left',h1:30,btnSize:16,btnPad:'14px 28px'};
 if(t==='promo'){o.outer=mix(lightCard,c.primary,.08);o.card='#FFFFFF';o.band=c.primary;o.bandText=ink(c.primary,4.5,'#FFFFFF',c.light,c.dark);
  const acc=contrast(c.accent,o.card)>=3?c.accent:c.primary;o.btnBg=acc;o.btnBorder=acc;o.btnText=ink(acc,4.5,'#FFFFFF',c.dark,c.light);o.radius=999;o.align='center';o.h1=34;o.btnSize=18;o.btnPad='16px 36px'}
 else if(t==='minimal'){o.outer='#FFFFFF';o.card='#FFFFFF';o.btnBg='#FFFFFF';o.radius=4;o.h1=24}
 else{o.outer=mix(lightCard,c.primary,.06);o.card='#FFFFFF';o.btnBg=c.primary;o.btnBorder=c.primary;o.btnText=ink(c.primary,4.5,'#FFFFFF',c.light,c.dark)}
 o.text=ink(o.card,4.5,mix(c.dark,'#000000',.1),'#1F2328');o.heading=t==='minimal'?o.text:ink(o.card,4.5,c.primary,c.dark);
 o.link=readable(c.primary,o.card,4.5);if(t==='minimal'){o.btnBorder=o.link;o.btnText=o.link}
 if(!o.btnText)o.btnText=ink(o.btnBg,4.5,'#FFFFFF',c.dark);
 o.muted=readable(mix(o.text,o.outer,.35),o.outer,4.5);o.divider=mix(o.card,o.text,.14);
 // dark mode (prefers-color-scheme and Outlook.com [data-ogsc]): fixed surfaces, the link lightened until it reads.
 o.dark={outer:'#0F1115',card:'#1A1D23',text:'#E6E8EC',muted:'#B4BAC5',heading:'#FFFFFF',link:readable(mix(c.primary,'#FFFFFF',.45),'#1A1D23',4.5)};
 return o;
}
// The pairs the contrast check reads: [label, text colour, background, needed ratio].
function contrastPairs(th){const p=[['Testo',th.text,th.card,4.5],['Titoli',th.heading,th.card,3],['Link',th.link,th.card,4.5],['Testo del pulsante',th.btnText,th.btnBg,4.5],['Piè di pagina',th.muted,th.outer,4.5]];
 if(th.band)p.push(['Titolo sulla fascia',th.bandText,th.band,3]);
 p.push(['Testo in modalità scura',th.dark.text,th.dark.card,4.5],['Link in modalità scura',th.dark.link,th.dark.card,4.5]);return p}

// ---- the source text: a saved Newsletter of the Studio Testi, or pasted ----
const COPY_KEYS={oggetto:'subject',anteprima:'preheader',testo:'body',invito:'cta'};
const stripCount=s=>String(s).replace(/\s*\(\d+\/\d+\)\s*$/,'');
// The Markdown of lib/copy-studio.js toMarkdown for the newsletter: «# Newsletter · title», «## Oggetto», «## Anteprima»…
function parseCopyMarkdown(md){const out={name:'',subject:'',preheader:'',body:'',cta:''};let cur=null,buf=[];
 const flush=()=>{if(cur)out[cur]=stripCount(buf.join('\n').trim());buf=[]};
 for(const line of clean(md).split('\n')){const h1=/^#\s+(.+)$/.exec(line),h2=/^##\s+(.+)$/.exec(line);
  if(h1&&!out.name){out.name=oneLine(h1[1].replace(/^Newsletter\s*·\s*/i,''));continue}
  if(h2){flush();cur=COPY_KEYS[oneLine(h2[1]).toLowerCase()]||null;continue}
  if(/^---\s*$/.test(line)){flush();cur=null;continue}
  if(cur)buf.push(line)}
 flush();out.subject=oneLine(out.subject);out.preheader=oneLine(out.preheader);out.cta=oneLine(out.cta);return out}
// Pasted text: the Studio Testi Markdown, or «Oggetto: …» / «Anteprima: …» lines, else all of it is the body.
function parsePasted(text){const t=clean(text);if(/^##\s+(Oggetto|Testo)\b/im.test(t))return parseCopyMarkdown(t);
 const out={name:'',subject:'',preheader:'',body:'',cta:''},rest=[];
 for(const line of t.split('\n')){const m=/^\s*(oggetto|anteprima|preheader|pulsante|invito|cta)\s*:\s*(.+)$/i.exec(line);
  if(m){const k=m[1].toLowerCase();out[k==='oggetto'?'subject':k==='anteprima'||k==='preheader'?'preheader':'cta']=oneLine(m[2]);continue}rest.push(line)}
 out.body=rest.join('\n').trim();return out}
// The newsletters saved by the Studio Testi in the project (the «agents» document, the Copywriter's thread), newest first.
const DOC_RE=/---DOCUMENTO: (Newsletter · [^\n]*?)---\n([\s\S]*?)\n---FINE DOCUMENTO---/;
function savedCopies(agentsDoc){const list=agentsDoc&&agentsDoc.conversations&&Array.isArray(agentsDoc.conversations.copywriter)?agentsDoc.conversations.copywriter:[],out=[];
 for(const m of list){if(!m||m.role!=='assistant'||typeof m.content!=='string')continue;const d=DOC_RE.exec(m.content);if(!d)continue;const p=parseCopyMarkdown(d[2]);if(!p.body)continue;
  out.push({...p,name:p.name||oneLine(d[1].replace(/^Newsletter · /,'')),at:String(m.at||'')})}
 return out.reverse().slice(0,8)}

// ---- the blocks ----
let seq=0;
const newId=()=>'b'+(++seq).toString(36)+Math.random().toString(36).slice(2,6);
function makeBlock(type,data={}){const b={id:newId(),type};
 if(type==='text')Object.assign(b,{heading:'',body:''});
 if(type==='hero')Object.assign(b,{src:'',url:'',alt:'',w:WIDTH,h:0,href:''});
 if(type==='button')Object.assign(b,{label:'Scopri di più',url:''});
 if(type==='columns')Object.assign(b,{left:{heading:'',body:''},right:{heading:'',body:''}});
 if(type==='header')Object.assign(b,{});
 if(type==='footer')Object.assign(b,{sender:'',address:'',reason:''});
 return Object.assign(b,data)}
const paras=t=>clean(t).split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
const stripTags=s=>oneLine(String(s).replace(TAG_RE,'')).replace(/^[,;:\s]+|[,;:\s]+$/g,'').replace(/\s+([,.;:!?])/g,'$1');
// The headline: a short first line of the body (it then leaves the body), else the subject without merge tags.
function headlineOf(src){const ps=paras(src.body),first=ps[0]||'';
 if(first&&!first.includes('\n')&&chars(first)<=80&&!/[.,;:]$/.test(first)&&!/^(ciao|gentile|buongiorno|caro|cara)\b/i.test(first)&&!TAG_RE.test(first)){TAG_RE.lastIndex=0;return {heading:first.replace(/^#+\s*/,''),body:ps.slice(1).join('\n\n')}}
 TAG_RE.lastIndex=0;return {heading:stripTags(src.subject).slice(0,90),body:ps.join('\n\n')}}
const REASON='Ricevi questa email perché sei iscritto alle comunicazioni di {brand}.';
// The starting blocks of a template from the source text. answers: {goal, ctaUrl, ctaLabel}, sender: {name, address}.
function blocksFor(tid,src,answers={},sender={}){const t=template(tid).id,s=src||{},h=headlineOf(s),g=goal(answers.goal);
 const label=oneLine(answers.ctaLabel||s.cta).slice(0,40)||g[3],url=oneLine(answers.ctaUrl);
 const name=oneLine(sender.name)||'il mittente';
 const out=[makeBlock('header'),makeBlock('text',{heading:h.heading,body:h.body.slice(0,BODY_MAX)}),makeBlock('button',{label,url})];
 if(t==='editoriale')out.push(makeBlock('divider'));
 out.push(makeBlock('footer',{sender:name,address:oneLine(sender.address).slice(0,FIELD_MAX),reason:REASON.replace('{brand}',name)}));
 return out}
// Footer last and only one; a header only on top.
function normalizeBlocks(list){const xs=(Array.isArray(list)?list:[]).filter(b=>b&&BLOCKS[b.type]);const foot=xs.find(b=>b.type==='footer')||makeBlock('footer');
 return xs.filter(b=>b.type!=='footer').concat([foot])}
function moveBlock(list,id,dir){const xs=list.slice(),i=xs.findIndex(b=>b.id===id),j=i+dir;
 if(i<0||j<0||j>=xs.length||xs[i].type==='footer'||xs[j].type==='footer')return xs;[xs[i],xs[j]]=[xs[j],xs[i]];return xs}
function removeBlock(list,id){return list.filter(b=>b.id!==id||b.type==='footer')}
function addBlock(list,type,data){if(!ADDABLE.includes(type))return list;const xs=list.slice(),b=makeBlock(type,data);xs.splice(Math.max(0,xs.length-1),0,b);return xs}

// ---- HTML for email clients ----
const LINK_RE=/https:\/\/[^\s<>"'()]*[^\s<>"'().,;:!?]/g;
// Escaped text with https links made clickable and line breaks kept.
function inline(text,th){return esc(text).replace(/https:\/\/[^\s<>"()]*[^\s<>"().,;:!?]/g,u=>'<a href="'+u+'" target="_blank" class="nl-link" style="color:'+th.link+';text-decoration:underline;">'+u+'</a>').replace(/\n/g,'<br>')}
const P=(th,size,extra)=>'margin:0 0 16px;font-family:'+th.bodyFont+';font-size:'+(size||16)+'px;line-height:'+Math.round((size||16)*1.6)+'px;color:'+th.text+';'+(extra||'');
function bodyHtml(text,th,align){const out=[];
 for(const p of paras(text)){const lines=p.split('\n'),bullets=lines.every(l=>/^\s*[-•*]\s+/.test(l));
  if(bullets&&lines.length){out.push('<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">'+lines.map(l=>'<tr><td valign="top" class="nl-text" style="width:20px;font-family:'+th.bodyFont+';font-size:16px;line-height:26px;color:'+th.link+';">&bull;</td><td class="nl-text" style="font-family:'+th.bodyFont+';font-size:16px;line-height:26px;color:'+th.text+';padding:0 0 6px;text-align:left;">'+inline(l.replace(/^\s*[-•*]\s+/,''),th)+'</td></tr>').join('')+'</table>')}
  else out.push('<p class="nl-text" style="'+P(th,16,'text-align:'+align+';')+'">'+inline(p,th)+'</p>')}
 return out.join('\n')}
const row=(cls,style,inner,align)=>'<tr><td class="'+cls+'"'+(align?' align="'+align+'"':'')+' style="'+style+'">'+inner+'</td></tr>\n';
function headerHtml(b,ctx){const th=ctx.th,al=th.align==='center'?'center':'left',L=ctx.logo;
 const mark=L&&L.src?'<img src="'+esc(L.src)+'" width="'+L.width+'" height="'+L.height+'" alt="'+esc(ctx.brand.name||'Logo')+'" class="nl-logo" style="display:block;border:0;outline:none;width:'+L.width+'px;max-width:200px;height:auto;'+(al==='center'?'margin:0 auto;':'')+'">'
  :'<p class="nl-h" style="margin:0;font-family:'+th.headingFont+';font-size:'+(th.id==='minimal'?18:22)+'px;line-height:28px;font-weight:700;letter-spacing:-0.01em;color:'+th.heading+';text-align:'+al+';">'+esc(ctx.brand.name)+'</p>';
 return row('nl-card nl-head nl-pad','background-color:'+th.card+';padding:'+(th.id==='minimal'?'32px 40px 8px':'28px 40px 20px')+';',mark,al)}
function heroHtml(b,ctx){const th=ctx.th,src=oneLine(b.url)||b.src;if(!src)return '';const h=b.h&&b.w?Math.round(WIDTH*b.h/b.w):0;
 let img='<img src="'+esc(src)+'" width="'+WIDTH+'"'+(h?' height="'+h+'"':'')+' alt="'+esc(oneLine(b.alt))+'" class="nl-img" style="display:block;border:0;outline:none;width:100%;max-width:'+WIDTH+'px;height:auto;">';
 if(/^https:\/\//.test(oneLine(b.href)))img='<a href="'+esc(oneLine(b.href))+'" target="_blank">'+img+'</a>';
 return row('nl-card','background-color:'+th.card+';padding:0;font-size:0;line-height:0;',img)}
function textHtml(b,ctx){const th=ctx.th,al=th.align,first=ctx.firstText===b.id,lvl=first?1:2,size=first?th.h1:20,head=oneLine(b.heading);let out='';
 const hs=(color,a)=>'margin:0 0 '+(first?16:12)+'px;font-family:'+th.headingFont+';font-size:'+size+'px;line-height:'+Math.round(size*1.25)+'px;font-weight:700;letter-spacing:-0.01em;color:'+color+';text-align:'+a+';';
 if(first&&th.band&&head){out+=row('nl-band nl-pad','background-color:'+th.band+';padding:36px 40px;','<h1 class="nl-h1" style="'+hs(th.bandText,'center').replace('margin:0 0 16px','margin:0')+'">'+esc(head)+'</h1>','center');
  return out+(clean(b.body)?row('nl-card nl-pad','background-color:'+th.card+';padding:28px 40px 4px;',bodyHtml(b.body,th,al),al):'')}
 const inner=(head?'<h'+lvl+' class="nl-h'+(first?' nl-h1':'')+'" style="'+hs(th.heading,al)+'">'+esc(head)+'</h'+lvl+'>':'')+bodyHtml(b.body,th,al);
 return inner?row('nl-card nl-pad','background-color:'+th.card+';padding:'+(first?'12px':'4px')+' 40px 4px;',inner,al):''}
// Bulletproof button: VML roundrect for Outlook on Windows, a padded link in a coloured cell everywhere else.
function buttonHtml(b,ctx){const th=ctx.th,label=oneLine(b.label)||'Scopri di più',url=oneLine(b.url),href=url||'#',al=th.align==='center'?'center':'left';
 const w=Math.max(180,Math.min(520,chars(label)*(th.btnSize>16?11:10)+72)),h=th.btnSize>16?54:48,arc=th.radius>=999?'50%':Math.round(th.radius/h*100)+'%';
 const vml='<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="'+esc(href)+'" style="height:'+h+'px;v-text-anchor:middle;width:'+w+'px;" arcsize="'+arc+'" strokecolor="'+(th.btnBorder||th.btnBg)+'" strokeweight="2px" fillcolor="'+th.btnBg+'"><w:anchorlock/><center style="color:'+th.btnText+';font-family:Arial,sans-serif;font-size:'+th.btnSize+'px;font-weight:bold;">'+esc(label)+'</center></v:roundrect><![endif]-->';
 const html='<!--[if !mso]><!--><table role="presentation" cellpadding="0" cellspacing="0" border="0" class="nl-btn" align="'+al+'" style="border-collapse:separate;margin:'+(al==='center'?'0 auto':'0')+';"><tr><td align="center" bgcolor="'+th.btnBg+'" style="border-radius:'+th.radius+'px;background-color:'+th.btnBg+';border:2px solid '+(th.btnBorder||th.btnBg)+';"><a href="'+esc(href)+'" target="_blank" style="display:inline-block;padding:'+th.btnPad+';font-family:'+th.bodyFont+';font-size:'+th.btnSize+'px;line-height:20px;font-weight:700;color:'+th.btnText+';text-decoration:none;border-radius:'+th.radius+'px;">'+esc(label)+'</a></td></tr></table><!--<![endif]-->';
 return row('nl-card nl-pad','background-color:'+th.card+';padding:12px 40px 28px;',vml+html,al)}
function columnsHtml(b,ctx){const th=ctx.th,cell=c=>'<div class="nl-col" style="display:inline-block;width:100%;max-width:270px;vertical-align:top;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:8px 10px;text-align:left;">'+
  (oneLine(c&&c.heading)?'<h3 class="nl-h" style="margin:0 0 8px;font-family:'+th.headingFont+';font-size:17px;line-height:23px;font-weight:700;color:'+th.heading+';">'+esc(oneLine(c.heading))+'</h3>':'')+
  paras(c&&c.body).map(p=>'<p class="nl-text" style="'+P(th,15,'margin:0 0 10px;')+'">'+inline(p,th)+'</p>').join('')+'</td></tr></table></div>';
 if(!oneLine(b.left&&b.left.heading)&&!clean(b.left&&b.left.body)&&!oneLine(b.right&&b.right.heading)&&!clean(b.right&&b.right.body))return '';
 const inner='<!--[if mso]><table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0"><tr><td width="270" valign="top"><![endif]-->'+cell(b.left)+'<!--[if mso]></td><td width="270" valign="top"><![endif]-->'+cell(b.right)+'<!--[if mso]></td></tr></table><![endif]-->';
 return row('nl-card nl-cpad','background-color:'+th.card+';padding:8px 30px 16px;font-size:0;',inner,'center')}
function dividerHtml(b,ctx){const th=ctx.th;return row('nl-card nl-pad','background-color:'+th.card+';padding:8px 40px 24px;','<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="nl-rule" style="border-top:1px solid '+th.divider+';font-size:1px;line-height:1px;height:1px;">&nbsp;</td></tr></table>')}
function footerHtml(b,ctx){const th=ctx.th,al=th.align==='center'||th.id!=='minimal'?'center':'left',s='margin:0 0 8px;font-family:'+th.bodyFont+';font-size:13px;line-height:20px;color:'+th.muted+';text-align:'+al+';';
 const who=[oneLine(b.sender),oneLine(b.address)].filter(Boolean).map(esc).join(' &middot; ');
 return row('nl-foot nl-pad','background-color:'+th.outer+';padding:28px 40px 12px;',(who?'<p class="nl-muted" style="'+s+'">'+who+'</p>':'')+(oneLine(b.reason)?'<p class="nl-muted" style="'+s+'">'+esc(oneLine(b.reason))+'</p>':'')+
  '<p class="nl-muted" style="'+s+'margin:0;"><a href="'+UNSUB_TAG+'" target="_blank" class="nl-muted" style="color:'+th.muted+';text-decoration:underline;">Disiscriviti</a> con un clic: non riceverai più queste email.</p>',al)}
const RENDER={header:headerHtml,hero:heroHtml,text:textHtml,button:buttonHtml,columns:columnsHtml,divider:dividerHtml,footer:footerHtml};
function fontLink(brand){const fs=[...new Set([brand&&brand.fonts&&brand.fonts.heading,brand&&brand.fonts&&brand.fonts.body].map(family).filter(f=>f&&!WEBSAFE.test(f)))];
 return fs.length?'<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?'+fs.map(f=>'family='+f.replace(/ /g,'+')+':wght@400;700').join('&amp;')+'&amp;display=swap" rel="stylesheet"><!--<![endif]-->\n':''}
// doc: {subject, preheader, template, brand, blocks, logo:{src,width,height}|null}
function buildHtml(doc){const d=doc||{},brand=d.brand||brandOf(),th=theme(d.template,brand),blocks=normalizeBlocks(d.blocks);
 const ctx={th,brand,logo:d.logo&&d.logo.src?d.logo:null,firstText:(blocks.find(b=>b.type==='text')||{}).id};
 const rows=blocks.map(b=>RENDER[b.type](b,ctx)).join('');
 const pre=oneLine(d.preheader),dk=th.dark;
 return '<!DOCTYPE html>\n<html lang="it" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">\n<head>\n'+
  '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta http-equiv="X-UA-Compatible" content="IE=edge">\n<meta name="x-apple-disable-message-reformatting">\n'+
  '<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">\n<meta name="color-scheme" content="light dark">\n<meta name="supported-color-schemes" content="light dark">\n'+
  '<title>'+esc(oneLine(d.subject))+'</title>\n'+
  '<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->\n'+
  '<!--[if mso]><style>table,td,p,a,h1,h2,h3,li,center{font-family:Arial,Helvetica,sans-serif!important}</style><![endif]-->\n'+fontLink(brand)+
  '<style>\n:root{color-scheme:light dark;supported-color-schemes:light dark}\nbody{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}\n'+
  'table,td{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt}\nimg{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}\n'+
  'a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}\nu+#body a{color:inherit;text-decoration:none}\n'+
  '@media screen and (max-width:620px){.nl-container{width:100%!important}.nl-pad{padding-left:20px!important;padding-right:20px!important}.nl-h1{font-size:'+Math.min(th.h1,26)+'px!important;line-height:'+Math.round(Math.min(th.h1,26)*1.25)+'px!important}.nl-img{width:100%!important;height:auto!important}.nl-cpad{padding-left:10px!important;padding-right:10px!important}.nl-col{max-width:100%!important}.nl-btn{width:100%!important}.nl-btn a{display:block!important}}\n'+
  '@media (prefers-color-scheme:dark){.nl-outer,.nl-foot{background-color:'+dk.outer+'!important}.nl-card{background-color:'+dk.card+'!important}.nl-text{color:'+dk.text+'!important}.nl-h{color:'+dk.heading+'!important}.nl-muted{color:'+dk.muted+'!important}.nl-link{color:'+dk.link+'!important}.nl-rule{border-top-color:#3A3F48!important}.nl-head{background-color:'+th.card+'!important}}\n'+
  '[data-ogsc] .nl-text{color:'+dk.text+'!important}[data-ogsc] .nl-h{color:'+dk.heading+'!important}[data-ogsc] .nl-muted{color:'+dk.muted+'!important}[data-ogsc] .nl-link{color:'+dk.link+'!important}[data-ogsb] .nl-outer,[data-ogsb] .nl-foot{background-color:'+dk.outer+'!important}[data-ogsb] .nl-card{background-color:'+dk.card+'!important}\n'+
  '</style>\n</head>\n'+
  '<body id="body" class="nl-outer" style="margin:0;padding:0;background-color:'+th.outer+';">\n'+
  '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">'+esc(pre)+'&#8199;&#847;&zwnj;&nbsp;'.repeat(pre?Math.max(0,Math.min(40,Math.ceil((140-chars(pre))/2))):0)+'</div>\n'+
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="'+th.outer+'" class="nl-outer" style="background-color:'+th.outer+';">\n<tr><td align="center" style="padding:24px 12px;">\n'+
  '<!--[if mso]><table role="presentation" width="'+WIDTH+'" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->\n'+
  '<table role="presentation" class="nl-container" width="'+WIDTH+'" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:'+WIDTH+'px;margin:0 auto;">\n'+rows+'</table>\n'+
  '<!--[if mso]></td></tr></table><![endif]-->\n</td></tr>\n</table>\n</body>\n</html>\n'}
// The personal unsubscribe link of one email (sales/crm-campaigns.js withUnsubscribe → e.unsubscribeUrl) in place of the placeholder.
function fillUnsubscribe(html,url){const u=String(url||'');if(!/^https?:\/\//.test(u))throw Error('Link di disiscrizione non valido.');return String(html).split(UNSUB_TAG).join(esc(u))}

// ---- plain-text version ----
function toText(doc){const d=doc||{},brand=d.brand||brandOf(),blocks=normalizeBlocks(d.blocks),out=[];
 const strip=t=>clean(t).split('\n').map(l=>l.replace(/^\s*[•*]\s+/,'- ')).join('\n');
 for(const b of blocks){
  if(b.type==='header')out.push(brand.name.toUpperCase());
  else if(b.type==='text'){const h=oneLine(b.heading);out.push([h,strip(b.body)].filter(Boolean).join('\n\n'))}
  else if(b.type==='button')out.push(oneLine(b.label)+(oneLine(b.url)?': '+oneLine(b.url):''));
  else if(b.type==='columns')for(const c of [b.left,b.right]){const t=[oneLine(c&&c.heading),strip(c&&c.body)].filter(Boolean).join('\n');if(t)out.push(t)}
  else if(b.type==='divider')out.push('————');
  else if(b.type==='footer')out.push(['————',[oneLine(b.sender),oneLine(b.address)].filter(Boolean).join(' · '),oneLine(b.reason),'Disiscriviti: '+UNSUB_TAG].filter(Boolean).join('\n'))}
 return out.filter(x=>clean(x)).join('\n\n').replace(/\n{3,}/g,'\n\n')+'\n'}

// ---- checks (deterministic, no AI) ----
function tagsIn(text){const out=[];for(const m of String(text||'').matchAll(TAG_RE))out.push(m[1].trim().toLocaleLowerCase('it'));return out}
function imagesIn(html){return [...String(html).matchAll(/<img\b[^>]*>/gi)].map(m=>{const t=m[0],a=/\balt="([^"]*)"/i.exec(t),s=/\bsrc="([^"]*)"/i.exec(t),w=/\bwidth="(\d+)"/i.exec(t),h=/\bheight="(\d+)"/i.exec(t);return {alt:a?a[1]:null,src:s?s[1]:'',w:w?+w[1]:0,h:h?+h[1]:0}})}
function linksIn(html){return [...String(html).matchAll(/\bhref="([^"]*)"/gi)].map(m=>m[1].replace(/&amp;/g,'&')).filter(u=>!/^https:\/\/fonts\.googleapis\.com\//.test(u))}
function validLink(u){if(u===UNSUB_TAG||/^\{\{[^{}]+\}\}$/.test(u))return true;if(/^(mailto|tel):/i.test(u))return u.length>6;
 if(!/^https:\/\//i.test(u))return false;try{const x=new URL(u);return !!x.hostname&&/\./.test(x.hostname)&&!/\s/.test(u)}catch(e){return false}}
const ST={ok:'ok',warn:'warn',fail:'fail'};
function checks(doc,html,text){const d=doc||{},h=html||buildHtml(d),t=text||toText(d),out=[],add=(id,label,state,detail)=>out.push({id,label,state,detail});
 // size (Gmail clips messages over 102 KB)
 const size=bytes(h),imgs=imagesIn(h),embedded=imgs.filter(i=>/^data:/i.test(i.src)),hosted=embedded.reduce((n,i)=>n-bytes(i.src)+60,size);
 add('size','Peso sotto i 102 KB',size>=CLIP_KB*1024?ST.fail:size>=SAFE_KB*1024?ST.warn:ST.ok,kb(size)+' KB su 102: '+(size>=CLIP_KB*1024?'Gmail taglierebbe il messaggio con «Visualizza intero messaggio».':size>=SAFE_KB*1024?'sotto il limite, ma meglio restare sotto i 60 KB.':'nessun taglio in Gmail.')+(embedded.length?' Con le immagini online scende a circa '+kb(hosted)+' KB.':''));
 if(embedded.length)add('hosted','Immagini ospitate online',ST.warn,embedded.length+(embedded.length===1?' immagine è incorporata':' immagini sono incorporate')+' nell’HTML: Gmail e Outlook non le mostrano. Carica il PNG o il JPG sul tuo sito e incolla l’indirizzo https.');
 const noAlt=imgs.filter(i=>!oneLine(i.alt));
 add('alt','Testo alternativo sulle immagini',noAlt.length?ST.fail:ST.ok,imgs.length?(noAlt.length?noAlt.length+' immagini senza testo alternativo: chi non vede le immagini non capisce cosa c’è.':'Tutte le '+imgs.length+' immagini hanno il testo alternativo.'):'Nessuna immagine.');
 const th=theme(d.template,d.brand||brandOf()),bad=contrastPairs(th).filter(([,a,b,need])=>contrast(a,b)<need);
 add('contrast','Contrasto WCAG AA',bad.length?ST.fail:ST.ok,bad.length?bad.map(([l,a,b,need])=>l+' '+String(contrast(a,b)).replace('.',',')+':1 (serve '+String(need).replace('.',',')+':1)').join(' · '):'Testi, link e pulsante leggibili: almeno 4,5:1 (3:1 per i titoli grandi), anche in modalità scura.');
 const links=linksIn(h),invalid=[...new Set(links.filter(u=>!validLink(u)))];
 add('links','Link validi in https',invalid.length?ST.fail:ST.ok,invalid.length?'Da correggere: '+invalid.map(u=>u===''||u==='#'?'pulsante senza link':u.slice(0,60)).join(', ')+'.':links.length+' link, tutti https.');
 const sub=oneLine(d.subject),sn=chars(sub);
 add('subject','Oggetto entro 60 caratteri',!sn?ST.fail:sn>SUBJECT_MAX?ST.warn:ST.ok,!sn?'Manca l’oggetto.':sn+'/'+SUBJECT_MAX+(sn>SUBJECT_MAX?': sul telefono si vede tagliato.':''));
 const pre=oneLine(d.preheader),pn=chars(pre);
 add('preheader','Anteprima tra 40 e 110 caratteri',!pn?ST.fail:pn<PRE_MIN||pn>PRE_MAX?ST.warn:ST.ok,!pn?'Manca l’anteprima: la casella mostrerebbe il primo testo della mail.':pn+' caratteri'+(pn<PRE_MIN?': troppo corta, la casella aggiunge altro testo.':pn>PRE_MAX?': oltre 110 la casella la taglia.':'.'));
 const unsub=h.includes('href="'+UNSUB_TAG+'"')&&t.includes(UNSUB_TAG);
 add('unsubscribe','Link per disiscriversi',unsub?ST.ok:ST.fail,unsub?'Presente nell’HTML e nel testo semplice: al momento dell’invio diventa il link personale di ogni contatto.':'Manca il link per disiscriversi.');
 const all=[sub,pre,h,t].join('\n'),unknown=[...new Set(tagsIn(all).filter(x=>!KNOWN.has(x)))],single=[...new Set((all.match(/(^|[^{])\{(nome|nome_completo|azienda|ruolo)\}(?!\})/g)||[]).map(x=>x.replace(/^[^{]/,'')))];
 add('tags','Campi dinamici riconosciuti',unknown.length?ST.fail:single.length?ST.warn:ST.ok,unknown.length?'Sconosciuti: '+unknown.map(x=>'{{'+x+'}}').join(', ')+'. Usa '+TAGS.filter(x=>x!=='gancio').map(x=>'{{'+x+'}}').join(', ')+'.':single.length?'Scrivi '+single.map(x=>'{'+x+'}').join(', ')+' con due graffe: '+single.map(x=>'{'+x+'}').join(', ')+'.':(tagsIn(sub+pre+t).filter(x=>x!=='link_disiscrizione').length?'Campi usati: '+[...new Set(tagsIn(sub+pre+t).filter(x=>x!=='link_disiscrizione'))].map(x=>'{{'+x+'}}').join(', ')+'.':'Nessun campo dinamico.'));
 // text/image balance: estimated area of the text (16 px type, ~8 × 26 px per character) against the images
 const words=t.replace(/\{\{[^}]*\}\}/g,'').split(/\s+/).filter(w=>/[\p{L}\p{N}]/u.test(w)).length,textArea=chars(t)*8*26,imgArea=imgs.reduce((n,i)=>n+(i.w||WIDTH)*(i.h||Math.round((i.w||WIDTH)*.5)),0),share=imgArea?textArea/(textArea+imgArea):1;
 add('ratio','Equilibrio testo e immagini',!words?ST.fail:share<.4?ST.warn:ST.ok,!words?'Solo immagini: i filtri antispam la scartano e senza immagini non resta nulla.':'Testo circa '+Math.round(share*100)+'% della superficie, '+words+' parole'+(share<.4?': troppa immagine, aggiungi testo o riduci l’immagine.':'.'));
 add('text','Versione solo testo',t.trim()?ST.ok:ST.fail,t.trim()?chars(t)+' caratteri, generata dagli stessi blocchi: scaricala come .txt.':'Vuota.');
 return out}
const summary=list=>({ok:list.filter(c=>c.state==='ok').length,warn:list.filter(c=>c.state==='warn').length,fail:list.filter(c=>c.state==='fail').length,total:list.length});

// ---- hand-over to the CRM campaign (sales/crm-campaigns.js reads radix-crm-campaign-draft, plain text up to 4000) ----
// The CRM sends text only (api/_send-email.js, plain text) and adds its own unsubscribe line: the footer link line is left out.
function toCrmDraft(doc,projectName,now){const lost=new Set(),conv=s=>String(s).replace(TAG_RE,(all,name,fb)=>{const k=name.trim().toLocaleLowerCase('it');if(k==='link_disiscrizione')return '';if(CRM_TAGS[k])return CRM_TAGS[k];lost.add('{{'+name.trim()+'}}');return fb!==undefined?oneLine(fb):''});
 const body=conv(toText(doc).split('\n').filter(l=>!l.startsWith('Disiscriviti: ')).join('\n')).replace(/[ \t]+([,.;:!?])/g,'$1').replace(/\n{3,}/g,'\n\n').trim();
 return {draft:{subject:conv(oneLine(doc&&doc.subject)).slice(0,200),body:body.slice(0,4000),source:'Newsletter HTML · '+oneLine(projectName||''),at:now||Date.now()},lost:[...lost],cut:body.length>4000}}

// ---- saved in the project: the «agents» document, key newsletters ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(d){const s=d&&d.newsletters;return s&&typeof s==='object'&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>x&&typeof x==='object')}:emptyStore()}
// Embedded images (data:) are not kept: they would weigh on the shared document; the hosted address is kept.
function savedRecord(doc,{goal:g,ctaUrl,logoUrl,by,at,id}={}){const d=doc||{},when=at||new Date().toISOString();
 const blocks=normalizeBlocks(d.blocks).map(b=>{const x=JSON.parse(JSON.stringify(b));if(x.type==='hero'&&/^data:/i.test(x.src||'')){x.src='';x.hadImage=true}return x});
 return {id:id||'nl-'+when.replace(/\D/g,'').slice(0,14)+'-'+(slug(d.subject)||'newsletter').slice(0,24),at:when,by:oneLine(by).slice(0,80),subject:oneLine(d.subject).slice(0,200),preheader:oneLine(d.preheader).slice(0,200),
  template:template(d.template).id,goal:goal(g)[0],ctaUrl:oneLine(ctaUrl).slice(0,500),logoUrl:/^https:\/\//.test(oneLine(logoUrl))?oneLine(logoUrl).slice(0,500):'',blocks}}
function addRecord(store,rec){const s=readStore({newsletters:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const d=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await d.load())||{},next=addRecord(readStore(cur),rec);
  try{await d.save({...cur,schemaVersion:1,conversations:cur.conversations||{},newsletters:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
const filename=(doc,ext)=>'newsletter-'+(slug(doc&&doc.subject)||'email')+'.'+ext;
// The logo size in the email: 40 px tall, at most 200 px wide, from the SVG viewBox (or width/height).
function logoBox(svg){const s=String(svg||''),vb=/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s),w=/\bwidth\s*=\s*["']([\d.]+)/i.exec(s),h=/\bheight\s*=\s*["']([\d.]+)/i.exec(s);
 const ar=vb?+vb[1]/+vb[2]:w&&h?+w[1]/+h[1]:3;let height=40,width=Math.round(height*(ar>0&&isFinite(ar)?ar:3));if(width>200){width=200;height=Math.max(16,Math.round(200/ar))}return {width,height}}

// ---- browser widget ----
let counter=0;
const doc_=()=>root.document;
const el=(tag,text,cls)=>{const n=doc_().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
function loadImage(src){return new Promise((ok,ko)=>{const i=new root.Image();i.onload=()=>ok(i);i.onerror=()=>ko(Error('Immagine non leggibile'));i.src=src})}
// The kit SVG as a PNG (2× for sharp screens): Gmail and Outlook do not show SVG.
async function rasterLogo(svg){const box=logoBox(svg),img=await loadImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)),c=doc_().createElement('canvas');c.width=box.width*2;c.height=box.height*2;
 const ctx=c.getContext('2d'),ar=(img.naturalWidth||box.width)/(img.naturalHeight||box.height),w=Math.min(c.width,c.height*ar),h=w/ar;ctx.drawImage(img,(c.width-w)/2,(c.height-h)/2,w,h);return {src:c.toDataURL('image/png'),...box}}
// An uploaded photo, 1200 px wide at most (600 px shown, 2× for sharp screens), as JPEG.
async function photoFrom(file){const url=root.URL.createObjectURL(file);try{const img=await loadImage(url),k=Math.min(1,1200/img.naturalWidth),c=doc_().createElement('canvas');c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);
 const ctx=c.getContext('2d');ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);return {src:c.toDataURL('image/jpeg',.82),w:c.width,h:c.height}}finally{setTimeout(()=>root.URL.revokeObjectURL(url),5000)}}
function download(name,data,type){const a=el('a');a.href=typeof data==='string'&&/^data:/.test(data)?data:root.URL.createObjectURL(new root.Blob([data],{type}));a.download=name;doc_().body.append(a);a.click();a.remove();if(!/^data:/.test(a.href))setTimeout(()=>root.URL.revokeObjectURL(a.href),2000)}
// A real preview: the email in a sandboxed iframe (no scripts) at the client width, scaled to fit its box.
function frame(html,kind,opts={}){const W=kind==='mobile'?375:680,box=el('div',undefined,'nl-frame');box.dataset.kind=kind;
 if(kind==='mobile'){box.append(el('span',undefined,'nl-notch'))}else{const bar=el('div',undefined,'nl-bar');bar.append(el('i'),el('i'),el('i'));if(opts.subject!=null){const s=el('span',undefined,'nl-bar-title');s.append(el('strong',opts.from||''),el('span',opts.subject||'(senza oggetto)'));bar.append(s)}box.append(bar)}
 const view=el('div',undefined,'nl-view'),f=el('iframe');f.setAttribute('sandbox','allow-same-origin');f.title=(opts.label||'Anteprima della newsletter')+(kind==='mobile'?' sul telefono':' sul computer');f.tabIndex=-1;f.style.width=W+'px';f.srcdoc=html;view.append(f);box.append(view);
 const fit=()=>{const k=Math.min(1,(view.clientWidth||W)/W);let h=600;try{h=f.contentDocument&&f.contentDocument.documentElement?f.contentDocument.documentElement.scrollHeight:600}catch(e){}
  f.style.height=h+'px';f.style.transform='scale('+k+')';view.style.height=Math.round(Math.min(h*k,opts.maxH||1e5))+'px';box.dataset.clipped=String(!!opts.maxH&&h*k>opts.maxH)};
 f.addEventListener('load',()=>{fit();setTimeout(fit,120)});if(root.ResizeObserver)new root.ResizeObserver(fit).observe(view);box.update=next=>{f.srcdoc=next};return box}

// ctx: {project (profileFor summary), profile (registry profile: identityKit, contacts), projectName, projectId, workspace, by, crmUrl}
function newsletterStudio(ctx={}){const n=++counter,project=ctx.project||{},brand=brandOf(project,ctx.profile,ctx.projectName),wrap=el('div',undefined,'tool photo-studio nl-studio');
 const PS=root.RadixPrintStudio,contacts=PS&&typeof PS.prefill==='function'?(()=>{try{return PS.prefill(ctx.profile,{projectName:ctx.projectName,summary:project})}catch(e){return {}}})():{};
 const sender={name:brand.name,address:[contacts.address,contacts.website].filter(Boolean).join(' · ')};
 const st={goal:'news',src:{subject:'',preheader:'',body:'',cta:''},ctaUrl:'',logo:null,logoUrl:'',template:'',doc:null,copies:[],saved:[],timer:0,view:'desktop'};
 const ready=brand.logo?rasterLogo(brand.logo).then(l=>{st.logo=l}).catch(()=>{}):Promise.resolve();
 const steps=el('ol',undefined,'ps-steps');['Le domande','Scegli il modello','Rifinisci','Controlli ed export'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 // brand in use
 const bx=el('div',undefined,'ad-brand nl-brand');bx.dataset.source=brand.source;const sw=el('span',undefined,'ad-swatches');
 ['primary','secondary','accent','dark','light'].forEach(k=>{const i=el('i');i.style.background=brand.colors[k];i.title=k+' '+brand.colors[k];sw.append(i)});
 const bt=el('span',undefined,'ad-brand-text');bt.append(el('strong',brand.name),el('span',brand.label+' · '+(brand.fonts.heading||'Helvetica')+(brand.fonts.heading&&!WEBSAFE.test(brand.fonts.heading)?', con Helvetica e Arial dove il font non c’è':'')));
 bx.append(sw,bt);if(brand.logo){const li=el('img',undefined,'ad-brand-logo');li.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(brand.logo);li.alt='Logo del kit';bx.append(li)}
 // step 1
 const form=el('div',undefined,'ps-form nl-form'),qs=el('div',undefined,'ps-questions nl-questions');
 const goalFs=el('fieldset',undefined,'nl-goals');goalFs.append(el('legend','Obiettivo'));
 GOALS.forEach(([id,label,sub])=>{const l=el('label',undefined,'ps-chip ad-tile nl-tile'),r=el('input');r.type='radio';r.name='nl-goal-'+n;r.value=id;r.checked=id===st.goal;r.onchange=()=>{st.goal=id;if(!ctaTouched)cta.value=goal(id)[3];renderBest()};const t=el('span',undefined,'ad-tile-text');t.append(el('strong',label),el('small',sub));l.append(r,t);goalFs.append(l)});
 qs.append(goalFs);
 const srcBox=el('div',undefined,'nl-source');const srcHead=el('div',undefined,'nl-source-head');srcHead.append(el('h4','Il testo di partenza'),el('p','Importa una newsletter scritta nello Studio Testi oppure incolla il tuo testo: oggetto, anteprima e testo.','muted'));
 const copyRow=el('div',undefined,'nl-copies');copyRow.append(el('p','Cerco le newsletter salvate nel progetto…','muted'));
 const fields=el('div',undefined,'nl-fields');
 const field=(label,tag,opts={})=>{const l=el('label',undefined,'nl-field'+(opts.wide?' nl-wide':'')),top=el('span',undefined,'ad-field-top'),i=el(tag);if(tag==='textarea')i.rows=opts.rows||8;else i.type=opts.type||'text';i.maxLength=opts.max||FIELD_MAX;i.placeholder=opts.ph||'';top.append(el('span',label));if(opts.count){const c=el('span','','ad-count');top.append(c);const upd=()=>{const k=chars(i.value);c.textContent=k+(opts.range?' · '+opts.range:'/'+opts.count);c.dataset.near=String(opts.range?k&&(k<PRE_MIN||k>PRE_MAX):k>opts.count)};i.addEventListener('input',upd);i.upd=upd;upd()}l.append(top,i);return {l,i}};
 const fSub=field('Oggetto','input',{max:200,count:SUBJECT_MAX,ph:'Es. {{nome}}, da lunedì apriamo anche la domenica'});
 const fPre=field('Anteprima (il testo dopo l’oggetto)','input',{max:200,count:PRE_MAX,range:'40-110',ph:'Es. Pane caldo dalle 8 alle 13: ti aspettiamo con le novità di stagione'});
 const fBody=field('Testo','textarea',{max:BODY_MAX,rows:9,wide:true,ph:'Incolla qui il testo. Una riga vuota separa i paragrafi; le righe che iniziano con «-» diventano un elenco. Campi dinamici: {{nome}}, {{azienda}}…'});
 const fCta=field('Testo del pulsante','input',{max:40}),cta=fCta.i;cta.value=goal(st.goal)[3];let ctaTouched=false;cta.oninput=()=>{ctaTouched=true};
 const fUrl=field('Link del pulsante (https)','input',{max:500,type:'url',ph:'https://www.esempio.it/offerta'});
 fields.append(fSub.l,fPre.l,fBody.l,fCta.l,fUrl.l);
 const paste=el('details',undefined,'nl-paste');paste.append(el('summary','Incolla tutto insieme (anche il Markdown dello Studio Testi)'));const pasteTa=el('textarea');pasteTa.rows=4;pasteTa.maxLength=BODY_MAX+600;pasteTa.placeholder='Oggetto: …\nAnteprima: …\n\nTesto…';pasteTa.setAttribute('aria-label','Testo da incollare');
 const pasteGo=button('Distribuisci nei campi');pasteGo.onclick=()=>{const p=parsePasted(pasteTa.value);if(!p.body){status.textContent='Non trovo il testo: incolla almeno il corpo della newsletter.';return}fill(p);status.textContent='Testo distribuito nei campi: controllali qui sotto.'};
 const pr=el('div',undefined,'ps-actions');pr.append(pasteGo);paste.append(pasteTa,pr);
 srcBox.append(srcHead,copyRow,paste,fields);
 function fill(p){fSub.i.value=p.subject||'';fPre.i.value=p.preheader||'';fBody.i.value=p.body||'';if(p.cta){cta.value=p.cta;ctaTouched=true}[fSub.i,fPre.i].forEach(i=>i.upd&&i.upd())}
 const go=button('Prepara 3 modelli','primary'),cost=el('span','Nessuna chiamata AI: l’HTML si crea qui, senza costi. Nessuna email parte da questa pagina.','muted'),bar=el('div',undefined,'ps-actions');bar.append(go,cost);
 const savedBox=el('div',undefined,'ad-saved nl-saved');savedBox.hidden=true;
 form.append(bx,qs,srcBox,bar);
 const status=el('p','','tool-status');status.setAttribute('role','status');
 const grid=el('div',undefined,'nl-props'),result=el('div',undefined,'nl-result');grid.hidden=result.hidden=true;
 wrap.append(steps,savedBox,form,status,grid,result);setStep(1);
 // the project's texts and saved newsletters (one read of the «agents» document)
 (async()=>{if(!ctx.workspace||!ctx.projectId){copyRow.replaceChildren(el('p','Scegli un progetto per importare le newsletter dello Studio Testi.','muted'));return}
  try{const d=await ctx.workspace.bind(ctx.projectId,'agents').load();st.copies=savedCopies(d);st.saved=readStore(d).items;renderCopies();renderSaved()}
  catch(e){copyRow.replaceChildren(el('p','Newsletter del progetto non disponibili: '+e.message,'muted'))}})();
 function renderCopies(){if(!st.copies.length){copyRow.replaceChildren(el('p','Nello Studio Testi non c’è ancora una newsletter salvata per questo progetto: incolla il testo qui sotto.','muted'));return}
  const row=el('div',undefined,'ad-saved-row');st.copies.forEach(c=>{const b=button('','nl-copy');b.setAttribute('aria-pressed','false');b.append(el('strong',c.name||c.subject||'Newsletter'),el('small',(c.subject||'').slice(0,70)+(c.at?' · '+new Date(c.at).toLocaleDateString('it-IT'):'')));
   b.onclick=()=>{row.querySelectorAll('.nl-copy').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));fill(c);status.textContent='Importata «'+(c.name||c.subject)+'» dallo Studio Testi: puoi modificarla.'};row.append(b)});
  copyRow.replaceChildren(el('span','Dallo Studio Testi','ad-tool-label'),row)}
 function renderSaved(){if(!st.saved.length){savedBox.hidden=true;return}savedBox.replaceChildren(el('h4','Newsletter HTML salvate nel progetto'));const row=el('div',undefined,'ad-saved-row');
  st.saved.slice(-4).reverse().forEach(r=>{const b=button((r.subject||'Newsletter').slice(0,48)+' · '+new Date(r.at).toLocaleDateString('it-IT'),'ad-saved-item');b.onclick=()=>reopen(r);row.append(b)});savedBox.append(row);savedBox.hidden=false}
 async function reopen(r){await ready;st.goal=goal(r.goal)[0];st.ctaUrl=r.ctaUrl||'';st.logoUrl=r.logoUrl||'';st.template=template(r.template).id;st.recordId=r.id;
  st.doc={subject:r.subject,preheader:r.preheader,template:st.template,brand,blocks:normalizeBlocks(JSON.parse(JSON.stringify(r.blocks||[])).map(b=>({...b,id:b.id||newId()})))};
  grid.hidden=true;setStep(3);result.hidden=false;renderResult();status.textContent='Riaperta «'+r.subject+'»'+(r.blocks&&r.blocks.some(b=>b.hadImage)?': l’immagine incorporata non viene salvata, caricala di nuovo o incolla il suo indirizzo.':'.')}
 const docFor=(tid,blocks)=>({subject:oneLine(fSub.i.value),preheader:oneLine(fPre.i.value),template:tid,brand,blocks,logo:logoNow()});
 const logoNow=()=>/^https:\/\//.test(st.logoUrl)?{src:st.logoUrl,width:(st.logo||logoBox(brand.logo)).width,height:(st.logo||logoBox(brand.logo)).height}:st.logo;
 const props={};
 function renderBest(){grid.querySelectorAll('.nl-prop').forEach(c=>{const t=template(c.dataset.template),b=c.querySelector('.nl-best');if(b)b.hidden=!t.best.includes(st.goal)})}
 go.onclick=async()=>{const body=clean(fBody.i.value),url=oneLine(fUrl.i.value);
  if(chars(body)<20){status.textContent='Scrivi o importa il testo della newsletter (almeno 20 caratteri).';fBody.i.focus();return}
  if(!oneLine(fSub.i.value)){status.textContent='Scrivi l’oggetto: è la prima cosa che si legge nella casella.';fSub.i.focus();return}
  if(url&&!validLink(url)){status.textContent='Il link del pulsante deve essere un indirizzo https completo, ad esempio https://www.esempio.it/pagina.';fUrl.i.focus();return}
  await ready;st.src={subject:fSub.i.value,preheader:fPre.i.value,body,cta:cta.value};st.ctaUrl=url;st.recordId='';
  setStep(2);result.hidden=true;grid.hidden=false;
  grid.replaceChildren(...TEMPLATES.map(t=>{const blocks=blocksFor(t.id,st.src,{goal:st.goal,ctaUrl:url,ctaLabel:cta.value},sender),d=docFor(t.id,blocks),html=buildHtml(d);props[t.id]=d;
   const card=el('article',undefined,'nl-prop');card.dataset.template=t.id;const head=el('div',undefined,'nl-prop-head'),best=el('span','Consigliato per '+goal(st.goal)[1].toLowerCase(),'nl-best');
   head.append(el('h3',t.name),best,el('p',t.line,'ad-idea'));const stage=el('div',undefined,'nl-stage');
   stage.append(frame(html,'desktop',{maxH:460,label:'Modello '+t.name,subject:d.subject,from:brand.name}),frame(html,'mobile',{maxH:460,label:'Modello '+t.name}));
   const s=summary(checks(d,html)),pill=el('p',s.fail?s.fail+(s.fail===1?' controllo da sistemare':' controlli da sistemare'):s.warn?s.warn+(s.warn===1?' avviso da vedere':' avvisi da vedere'):'Tutti i controlli superati','ad-pill '+(s.fail||s.warn?'warn':'ok'));
   const use=button('Scegli '+t.name,'primary');use.onclick=()=>choose(t.id);const side=el('div',undefined,'nl-prop-side');side.append(head,pill,use);card.append(side,stage);return card}));
  renderBest();status.textContent='Tre modelli con il tuo testo e i colori del brand: confrontali sul computer e sul telefono, poi scegline uno.';grid.scrollIntoView&&grid.scrollIntoView({behavior:'smooth',block:'start'})};
 function choose(tid){st.template=tid;st.doc=JSON.parse(JSON.stringify({...props[tid],brand:null}));st.doc.brand=brand;st.doc.logo=logoNow();
  grid.querySelectorAll('.nl-prop').forEach(c=>c.dataset.chosen=String(c.dataset.template===tid));setStep(3);result.hidden=false;renderResult();result.scrollIntoView&&result.scrollIntoView({behavior:'smooth',block:'start'})}
 // steps 3 and 4
 let previewBox,checksBox,editorBox,rStatus,subjF,preF;
 const current=()=>({...st.doc,brand,logo:logoNow(),template:st.template});
 function renderResult(){const t=template(st.template),head=el('div',undefined,'ad-result-head'),hd=el('div');hd.append(el('span','Modello '+t.name,'ad-angle'),el('h3','Rifinisci la newsletter'));
  const seg=el('div',undefined,'ad-seg');seg.setAttribute('role','group');seg.setAttribute('aria-label','Modello');
  TEMPLATES.forEach(x=>{const b=button(x.name);b.setAttribute('aria-pressed',String(x.id===st.template));b.onclick=()=>{st.template=x.id;st.doc.template=x.id;seg.querySelectorAll('button').forEach(y=>y.setAttribute('aria-pressed',String(y===b)));hd.firstChild.textContent='Modello '+x.name;refresh()};seg.append(b)});
  head.append(hd,seg);
  const body=el('div',undefined,'nl-body'),left=el('div',undefined,'nl-left'),right=el('div',undefined,'nl-right');
  // subject and preheader
  const meta=el('div',undefined,'ad-edit nl-meta');meta.append(el('h4','Oggetto e anteprima'));
  subjF=field('Oggetto','input',{max:200,count:SUBJECT_MAX});subjF.i.value=st.doc.subject||'';subjF.i.upd();subjF.i.addEventListener('input',()=>{st.doc.subject=subjF.i.value;later()});
  preF=field('Anteprima','input',{max:200,count:PRE_MAX,range:'40-110'});preF.i.value=st.doc.preheader||'';preF.i.upd();preF.i.addEventListener('input',()=>{st.doc.preheader=preF.i.value;later()});
  const logoF=field('Logo ospitato online (https, facoltativo)','input',{max:500,type:'url',ph:'https://www.esempio.it/logo.png'});logoF.i.value=st.logoUrl;logoF.i.addEventListener('input',()=>{st.logoUrl=oneLine(logoF.i.value);later()});
  meta.append(subjF.l,preF.l,logoF.l);
  if(st.logo){const dl=button('Scarica il logo in PNG');dl.onclick=()=>download('logo-'+(slug(brand.name)||'brand')+'.png',st.logo.src);const r=el('div',undefined,'nl-inline');r.append(dl,el('span','Caricalo sul tuo sito e incolla qui sopra il suo indirizzo: Gmail non mostra i loghi incorporati.','muted'));meta.append(r)}
  editorBox=el('div',undefined,'ad-edit nl-blocks');
  left.append(meta,editorBox);
  // preview
  const pv=el('div',undefined,'nl-pv'),pvHead=el('div',undefined,'nl-pv-head'),vseg=el('div',undefined,'ad-seg');vseg.setAttribute('role','group');vseg.setAttribute('aria-label','Anteprima');
  [['desktop','Computer'],['mobile','Telefono']].forEach(([k,l])=>{const b=button(l);b.setAttribute('aria-pressed',String(st.view===k));b.onclick=()=>{st.view=k;vseg.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderPreview(true)};vseg.append(b)});
  pvHead.append(el('span','Anteprima','ad-tool-label'),vseg);previewBox=el('div',undefined,'nl-pv-box');pv.append(pvHead,previewBox);right.append(pv);
  body.append(left,right);
  // step 4
  const out=el('section',undefined,'nl-out');out.setAttribute('aria-label','Controlli ed export');checksBox=el('div',undefined,'nl-checks');
  const acts=el('div',undefined,'ps-actions ad-actions nl-actions'),dlH=button('Scarica .html','primary'),dlT=button('Scarica .txt'),cp=button('Copia l’HTML');
  dlH.onclick=()=>{const d=current();download(filename(d,'html'),buildHtml(d),'text/html;charset=utf-8');rStatus.textContent='Scaricato '+filename(d,'html')+'.'};
  dlT.onclick=()=>{const d=current();download(filename(d,'txt'),toText(d),'text/plain;charset=utf-8');rStatus.textContent='Scaricato '+filename(d,'txt')+': è la versione solo testo da affiancare all’HTML.'};
  cp.onclick=async()=>{try{await root.navigator.clipboard.writeText(buildHtml(current()));rStatus.textContent='HTML copiato: incollalo nel tuo programma di invio (modalità «codice HTML»).'}catch(e){rStatus.textContent='Copia non riuscita: usa «Scarica .html».'}};
  acts.append(dlH,dlT,cp);
  if(ctx.workspace&&ctx.projectId){const sv=button('Salva nel progetto');sv.onclick=()=>saveIt(sv);acts.append(sv)}
  const crm=button('Usa il testo nella campagna CRM');crm.onclick=toCrm;acts.append(crm);
  rStatus=el('p','','tool-status');rStatus.setAttribute('role','status');
  const note=el('p','RADIX non invia email da qui. Il CRM oggi spedisce solo testo semplice: gli passi oggetto e versione testo, con il link personale per disiscriversi aggiunto da lui. L’invio dell’HTML arriverà con il servizio di invio (ESP).','nl-note');
  out.append(el('h3','Controlli ed export'),checksBox,acts,rStatus,note);
  result.replaceChildren(head,body,out);renderBlocks();renderPreview(true);renderChecks()}
 function later(){clearTimeout(st.timer);st.timer=setTimeout(refresh,160)}
 function refresh(){renderPreview(false);renderChecks()}
 let pvFrame=null,pvKind='';
 function renderPreview(rebuild){const d=current(),html=buildHtml(d);if(rebuild||!pvFrame||pvKind!==st.view){pvKind=st.view;pvFrame=frame(html,st.view,{label:'Newsletter',subject:d.subject,from:brand.name});previewBox.replaceChildren(pvFrame);setStep(3)}else{pvFrame.update(html);const t=pvFrame.querySelector('.nl-bar-title span');if(t)t.textContent=d.subject||'(senza oggetto)'}}
 function renderChecks(){const d=current(),html=buildHtml(d),list=checks(d,html),s=summary(list);
  const top=el('div',undefined,'nl-check-sum');top.append(el('strong',s.ok+' su '+s.total+' controlli superati'),el('span',kb(bytes(html))+' KB · '+(s.fail?s.fail+' da sistemare':'nessun blocco')+(s.warn?' · '+s.warn+(s.warn===1?' avviso':' avvisi'):''),'muted'));
  const ul=el('ul',undefined,'nl-check-list');list.forEach(c=>{const li=el('li');li.dataset.state=c.state;li.append(el('span',c.state==='ok'?'OK':c.state==='warn'?'Avviso':'Da sistemare','nl-state'),el('strong',c.label),el('span',c.detail,'nl-detail'));ul.append(li)});
  checksBox.replaceChildren(top,ul);if(s.fail===0)setStep(4)}
 // the blocks editor
 function renderBlocks(){const list=st.doc.blocks=normalizeBlocks(st.doc.blocks),box=el('ol',undefined,'nl-blk-list');
  list.forEach((b,i)=>{const li=el('li',undefined,'nl-blk');li.dataset.type=b.type;const head=el('div',undefined,'nl-blk-head'),tg=button('','nl-blk-toggle');tg.setAttribute('aria-expanded',String(!!b.open));
   tg.append(el('span',BLOCKS[b.type],'nl-blk-type'),el('span',snippet(b),'nl-blk-snip'));tg.onclick=()=>{b.open=!b.open;renderBlocks()};
   const tools=el('span',undefined,'nl-blk-tools');
   const up=button('↑','nl-ico');up.setAttribute('aria-label','Sposta su «'+BLOCKS[b.type]+'»');up.disabled=i===0||b.type==='footer';up.onclick=()=>{st.doc.blocks=moveBlock(list,b.id,-1);renderBlocks();refresh()};
   const dn=button('↓','nl-ico');dn.setAttribute('aria-label','Sposta giù «'+BLOCKS[b.type]+'»');dn.disabled=b.type==='footer'||i>=list.length-2;dn.onclick=()=>{st.doc.blocks=moveBlock(list,b.id,1);renderBlocks();refresh()};
   const rm=button('✕','nl-ico nl-del');rm.setAttribute('aria-label','Elimina «'+BLOCKS[b.type]+'»');rm.disabled=b.type==='footer';rm.title=b.type==='footer'?'Il piè di pagina con il link per disiscriversi resta sempre':'Elimina';rm.onclick=()=>{st.doc.blocks=removeBlock(list,b.id);renderBlocks();refresh()};
   tools.append(up,dn,rm);head.append(tg,tools);li.append(head);if(b.open)li.append(blockFields(b));box.append(li)});
  const add=el('div',undefined,'nl-add'),sel=el('select');sel.setAttribute('aria-label','Blocco da aggiungere');ADDABLE.forEach(t=>sel.append(new root.Option(BLOCKS[t],t)));const ab=button('Aggiungi blocco');
  ab.onclick=()=>{st.doc.blocks=addBlock(list,sel.value);st.doc.blocks[st.doc.blocks.length-2].open=true;renderBlocks();refresh()};add.append(sel,ab);
  editorBox.replaceChildren(el('h4','Blocchi'),el('p','Apri un blocco per modificarlo; le frecce lo spostano. Il piè di pagina resta sempre in fondo, con il link per disiscriversi.','muted nl-hint'),box,add)}
 const snippet=b=>b.type==='text'?oneLine(b.heading||b.body).slice(0,60):b.type==='button'?oneLine(b.label)+(oneLine(b.url)?' → '+oneLine(b.url).replace(/^https:\/\//,'').slice(0,32):' · manca il link'):b.type==='hero'?(b.src||oneLine(b.url)?oneLine(b.alt)||'senza testo alternativo':'nessuna immagine'):b.type==='columns'?[b.left&&b.left.heading,b.right&&b.right.heading].filter(Boolean).join(' · ').slice(0,60)||'vuoto':b.type==='header'?(st.logo||/^https:/.test(st.logoUrl)?'logo':'nome del brand'):b.type==='footer'?oneLine(b.sender):'';
 function blockFields(b){const box=el('div',undefined,'nl-blk-body'),txt=(label,obj,key,opts={})=>{const f=field(label,opts.area?'textarea':'input',{max:opts.max||FIELD_MAX,rows:opts.rows||5,type:opts.type,ph:opts.ph});f.i.value=obj[key]||'';f.i.addEventListener('input',()=>{obj[key]=f.i.value;later();const s=box.parentNode&&box.parentNode.querySelector('.nl-blk-snip');if(s)s.textContent=snippet(b)});box.append(f.l);return f};
  if(b.type==='text'){txt('Titolo',b,'heading',{max:120});txt('Testo',b,'body',{area:true,max:BODY_MAX,rows:7})}
  else if(b.type==='button'){txt('Testo del pulsante',b,'label',{max:40});txt('Link (https)',b,'url',{max:500,type:'url',ph:'https://'})}
  else if(b.type==='columns'){const g=el('div',undefined,'nl-cols');box.append(g);const sub=(side,label)=>{const c=el('fieldset',undefined,'nl-colset');c.append(el('legend',label));g.append(c);
    [['Titolo','heading',{max:80}],['Testo','body',{area:true,rows:4,max:1200}]].forEach(([l,k,o])=>{const f=field(l,o.area?'textarea':'input',{max:o.max,rows:o.rows});f.i.value=b[side][k]||'';f.i.addEventListener('input',()=>{b[side][k]=f.i.value;later()});c.append(f.l)})};
   sub('left','Colonna sinistra');sub('right','Colonna destra')}
  else if(b.type==='hero'){const up=el('label',undefined,'pf-drop nl-drop'),file=el('input'),ut=el('span',undefined,'pf-drop-text');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.className='ad-file';ut.append(el('strong','Carica una foto'),el('small','JPG, PNG o WebP · trascinala qui o fai clic · la riduco a 1200 px di larghezza'));up.append(file,ut);
   file.onchange=async()=>{const f=file.files&&file.files[0];if(!f)return;if(f.size>15e6){rStatus.textContent='La foto supera 15 MB: usane una più leggera.';return}
    try{const p=await photoFrom(f);Object.assign(b,{src:p.src,w:p.w,h:p.h});if(!oneLine(b.alt))b.alt='';renderBlocks();refresh();rStatus.textContent='Foto pronta: scrivi il testo alternativo e, prima dell’invio, caricala online e incolla il suo indirizzo.'}catch(e){rStatus.textContent='Foto non leggibile: prova un JPG o un PNG.'}};
   box.append(up);txt('Oppure l’indirizzo dell’immagine online (https)',b,'url',{max:500,type:'url',ph:'https://www.esempio.it/foto.jpg'});txt('Testo alternativo (cosa mostra)',b,'alt',{max:150,ph:'Es. Il bancone del forno con il pane appena sfornato'});txt('Link al clic (facoltativo)',b,'href',{max:500,type:'url',ph:'https://'});
   if(b.src){const r=el('div',undefined,'nl-inline'),dl=button('Scarica la foto in JPG'),no=button('Togli la foto');dl.onclick=()=>download('immagine-'+(slug(st.doc.subject)||'newsletter')+'.jpg',b.src);no.onclick=()=>{b.src='';renderBlocks();refresh()};r.append(dl,no);box.append(r)}}
  else if(b.type==='footer'){txt('Mittente',b,'sender',{max:120});txt('Indirizzo e contatti del mittente',b,'address',{max:FIELD_MAX,ph:'Es. Via Roma 12, 10123 Torino · www.esempio.it'});txt('Perché la ricevi',b,'reason',{max:FIELD_MAX});box.append(el('p','Il link «Disiscriviti» c’è sempre: all’invio diventa il link personale di ogni contatto ('+UNSUB_TAG+').','muted'))}
  else if(b.type==='header')box.append(el('p',st.logo||/^https:/.test(st.logoUrl)?'Il logo del Kit identità, convertito in PNG. Per l’invio incolla l’indirizzo del logo online in «Logo ospitato online».':'Nel Kit identità non c’è un logo: la testata mostra il nome «'+brand.name+'».','muted'));
  else if(b.type==='divider')box.append(el('p','Una linea sottile per separare le parti.','muted'));
  return box}
 async function saveIt(b){b.disabled=true;rStatus.textContent='Salvo la newsletter nel progetto…';
  try{const rec=savedRecord(current(),{goal:st.goal,ctaUrl:st.ctaUrl,logoUrl:st.logoUrl,by:ctx.by,id:st.recordId||undefined});st.recordId=rec.id;const s=await saveToProject(ctx.workspace,ctx.projectId,rec);st.saved=s.items;renderSaved();b.textContent='Salvata';
   rStatus.textContent='Salvata nel progetto: la riapri da «Newsletter HTML salvate».'+(rec.blocks.some(x=>x.hadImage)?' La foto incorporata non viene salvata: salva il suo indirizzo online.':'')}
  catch(e){rStatus.textContent='Non salvata: '+e.message}finally{b.disabled=false}}
 async function toCrm(){const r=toCrmDraft(current(),ctx.projectName);
  if(!await askConfirm({title:'Passare oggetto e versione testo alla campagna email del CRM?',tag:'Nota',cost:'Nessuna email parte ora: nel CRM scegli il segmento e confermi ogni invio.',message:'Il CRM oggi invia solo testo semplice: l’HTML non viene usato.'+(r.lost.length?'\nQuesti campi il CRM non li conosce e vengono tolti: '+r.lost.join(', ')+'.':'')+(r.cut?'\nIl testo supera 4000 caratteri e viene accorciato.':''),ok:'Passa al CRM'}))return;
  try{root.localStorage.setItem('radix-crm-campaign-draft',JSON.stringify(r.draft))}catch(e){rStatus.textContent='Il browser non permette di passare la bozza al CRM: copia il testo a mano.';return}
  root.location.href=ctx.crmUrl||'/radix-sales.html#contacts'}
 return wrap}

return Object.freeze({WIDTH,CLIP_KB,SAFE_KB,SUBJECT_MAX,PRE_MIN,PRE_MAX,UNSUB_TAG,TAGS,CRM_TAGS,GOALS,TEMPLATES,BLOCKS,ADDABLE,
 hex,contrast,luminance,mix,ink,readable,fontStack,brandOf,theme,contrastPairs,parseCopyMarkdown,parsePasted,savedCopies,headlineOf,makeBlock,blocksFor,normalizeBlocks,moveBlock,removeBlock,addBlock,
 buildHtml,fillUnsubscribe,toText,bytes,imagesIn,linksIn,validLink,tagsIn,checks,summary,toCrmDraft,readStore,savedRecord,addRecord,saveToProject,filename,logoBox,newsletterStudio});
});
