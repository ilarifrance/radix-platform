/* RADIX PED · LinkedIn newsletter editions.
   Buffer cannot publish a LinkedIn newsletter: each edition is written in the PED, then pasted and scheduled by the
   person in LinkedIn's edition editor. This module gives the PED what that needs: the edition number in the series,
   checks before approval, the formatted text to paste (headings and bold survive), a 1920×1080 cover drawn with the
   project's visual identity, and the steps on LinkedIn. Pure functions, except drawCover (needs a canvas). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPedNewsletter=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// LinkedIn: edition title up to 150 characters; cover 1920×1080 recommended. A readable edition is 4-8 minutes.
const LIMITS=Object.freeze({title:150,minChars:1800,idealMin:2500,idealMax:7000,coverW:1920,coverH:1080});
const SERIES_TITLE=/^(.{2,80}?)\s*#\s*(\d{1,3})\s*[:·–—-]\s*(.+)$/;

function isLinkedInNewsletter(item){const c=String((item&&item.channel)||'');return /newsletter/i.test(c)&&/linkedin/i.test(c)}
// «Numeri che contano #2: sei pronto…» → series, number, headline. A title without the pattern is all headline.
function splitTitle(title){const t=String(title||'').trim(),m=SERIES_TITLE.exec(t);return m?{series:m[1].trim(),number:Number(m[2]),headline:m[3].trim()}:{series:'',number:null,headline:t}}

// The series settings saved in the PED (state.newsletter), or what the edition titles already say.
function seriesOf(state){const s=(state&&state.newsletter)||{},list=editions(state&&state.contents);
 const named=list.map(x=>splitTitle(x.title).series).filter(Boolean),freq={};named.forEach(n=>{freq[n]=(freq[n]||0)+1});
 const guess=Object.keys(freq).sort((a,b)=>freq[b]-freq[a])[0]||'';
 const url=/^https:\/\/(www\.)?linkedin\.com\/newsletters\/[\w-]+\/?$/i.test(String(s.url||''))?String(s.url):'';
 return {name:String(s.name||guess||'').trim().slice(0,80),url,day:String(s.day||'').slice(0,20),time:/^\d{2}:\d{2}$/.test(String(s.time||''))?s.time:''}}

// Editions in publishing order; a rejected content is not an edition.
function editions(contents){return (contents||[]).filter(x=>x&&isLinkedInNewsletter(x)&&x.status!=='rejected')
 .slice().sort((a,b)=>(String(a.date||'9999')+(a.time||'')).localeCompare(String(b.date||'9999')+(b.time||'')))}
function numberOf(state,item){const i=editions(state&&state.contents).findIndex(x=>x.id===(item&&item.id));return i<0?null:i+1}
// The title the edition should carry: «Serie #N: titolo», with N from its place in the plan.
function expectedTitle(state,item){const n=numberOf(state,item),s=seriesOf(state),h=splitTitle(item&&item.title).headline;return s.name&&n?s.name+' #'+n+': '+h:h}

const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// The body without the copywriter's wrappers, a repeated title line or the «---» rules LinkedIn would show as text.
function bodyOf(item){let t=String((item&&item.copy)||'').replace(/\r/g,'');
 t=t.replace(/^-{3}\s*DOCUMENTO[^\n]*\n?/gim,'').replace(/^-{3}\s*FINE DOCUMENTO[^\n]*\n?/gim,'');
 const lines=t.split('\n');while(lines.length&&!lines[0].trim())lines.shift();
 if(lines.length&&/^#\s+/.test(lines[0])){const h=lines[0].replace(/^#\s+/,'').trim().toLowerCase(),title=String((item&&item.title)||'').toLowerCase();if(!title||title.includes(h)||h.includes(splitTitle(item.title).headline.toLowerCase()))lines.shift()}
 return lines.join('\n').replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm,'').replace(/\n{3,}/g,'\n\n').trim()}
function inline(s){return esc(s).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_\n]+)__/g,'<strong>$1</strong>').replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g,'$1<em>$2</em>')}
// Markdown-ish text → the HTML LinkedIn's editor keeps on paste: subtitles, bold, italics, lists, paragraphs.
function toHtml(item){const out=[];let list=null,para=[];
 const flushPara=()=>{if(para.length){out.push('<p>'+para.map(inline).join('<br>')+'</p>');para=[]}},flushList=()=>{if(list){out.push('<'+list.tag+'>'+list.items.map(x=>'<li>'+inline(x)+'</li>').join('')+'</'+list.tag+'>');list=null}};
 for(const raw of bodyOf(item).split('\n')){const line=raw.trim();
  if(!line){flushPara();flushList();continue}
  let m;
  if((m=/^#{1,2}\s+(.+)$/.exec(line))){flushPara();flushList();out.push('<h2>'+inline(m[1])+'</h2>');continue}
  if((m=/^#{3,6}\s+(.+)$/.exec(line))){flushPara();flushList();out.push('<h3>'+inline(m[1])+'</h3>');continue}
  if((m=/^[-•*→]\s+(.+)$/.exec(line))){flushPara();if(!list||list.tag!=='ul'){flushList();list={tag:'ul',items:[]}}list.items.push(m[1]);continue}
  if((m=/^\d{1,2}[.)]\s+(.+)$/.exec(line))&&!/^\*\*/.test(line)){flushPara();if(!list||list.tag!=='ol'){flushList();list={tag:'ol',items:[]}}list.items.push(m[1]);continue}
  flushList();para.push(line)}
 flushPara();flushList();return out.join('\n')}
// The same text without markup, for a plain-text paste.
function toPlain(item){return bodyOf(item).replace(/^#{1,6}\s+/gm,'').replace(/\*\*([^*\n]+)\*\*/g,'$1').replace(/__([^_\n]+)__/g,'$1')}
function readingMinutes(item){const words=toPlain(item).split(/\s+/).filter(Boolean).length;return Math.max(1,Math.round(words/220))}

// What to fix before the edition goes on LinkedIn. placeholders: the PED's own check for «[da fornire]» holes.
function problems(state,item,{placeholders}={}){const out=[],add=(id,label)=>out.push({id,label});if(!item||!isLinkedInNewsletter(item))return out;
 const body=toPlain(item),t=splitTitle(item.title),s=seriesOf(state),n=numberOf(state,item);
 if(!body.trim()){add('empty','Il testo dell’edizione è ancora da scrivere.');return out}
 const holes=placeholders?placeholders(String(item.copy||'')):[];if(holes.length)add('placeholder','C’è un segnaposto da completare: «'+holes[0]+'».');
 const headline=expectedTitle(state,item);if(headline.length>LIMITS.title)add('title','Titolo troppo lungo per LinkedIn: '+headline.length+' caratteri su '+LIMITS.title+'.');
 if(s.name&&t.number&&n&&t.number!==n)add('number','Il titolo dice #'+t.number+' ma nel piano è l’edizione #'+n+': diventa «'+headline+'».');
 else if(s.name&&!t.series&&n)add('number','Nel titolo manca il nome della serie: diventa «'+headline+'».');
 if(body.length<LIMITS.minChars)add('short','Edizione corta ('+body.length+' caratteri): una newsletter regge 2.500-7.000 caratteri, cioè 4-8 minuti di lettura.');
 else if(body.length>LIMITS.idealMax*1.6)add('long','Edizione molto lunga ('+readingMinutes(item)+' minuti): valuta di dividerla in due uscite.');
 if(!/^#{1,6}\s+\S/m.test(bodyOf(item)))add('sections','Mancano i sottotitoli (## …): su LinkedIn aiutano chi legge dal telefono.');
 const tail=body.slice(-400);if(!/\?|scrivimi|rispondi|commenta|in privato|messaggio/i.test(tail))add('cta','Manca l’invito finale (una domanda o «scrivimi in privato»).');
 if(/-{3}\s*(DOCUMENTO|FINE)/i.test(String(item.copy||'')))add('wrapper','Il testo contiene ancora le righe tecniche ---DOCUMENTO---: vengono tolte nella copia per LinkedIn.');
 return out}

// The steps in LinkedIn's edition editor, written for the person who schedules it.
function steps(state,item,{cover=true}={}){const s=seriesOf(state),when=[item&&item.date?item.date.split('-').reverse().join('/'):'',item&&item.time?'ore '+item.time:''].filter(Boolean).join(', ');
 return [(s.url?'Apri la newsletter «'+(s.name||'su LinkedIn')+'» ('+s.url+')':'Su LinkedIn apri «Scrivi un articolo» e scegli la newsletter'+(s.name?' «'+s.name+'»':''))+' e premi «Crea nuova edizione».',
  cover?'Copertina: carica il file PNG scaricato qui (1920×1080).':'Copertina: scegli un’immagine 1920×1080.',
  'Titolo: incolla «'+expectedTitle(state,item)+'».',
  'Testo: premi «Copia il testo per LinkedIn» qui, poi nell’editor incolla (Cmd+V / Ctrl+V): titoletti e grassetti restano.',
  'Premi «Avanti», poi l’icona dell’orologio'+(when?' e scegli '+when:'')+', infine «Programma».',
  'Torna qui e premi «Segnata come programmata su LinkedIn», così il piano resta vero.']}

// Approved editions not yet recorded as scheduled on LinkedIn, from today on: the PED's reminder list.
function toSchedule(state,today,isQueued){return editions(state&&state.contents).filter(x=>x.status==='approved'&&!(isQueued?isQueued(x):x.publication)&&String(x.date||'9999')>=String(today||''))}

// The cover: dark brand colour, series name and number, the headline big, signature at the bottom. Colors from the
// visual identity (lib/radix-agent-media styleGuide) or neutral defaults.
function coverSpec(state,item,guide){const g=guide||{},s=seriesOf(state),n=numberOf(state,item);
 return {width:LIMITS.coverW,height:LIMITS.coverH,series:s.name||'Newsletter',number:n,headline:(h=>h.charAt(0).toLocaleUpperCase('it')+h.slice(1))(splitTitle(item&&item.title).headline),
  bg:g.cover||'#14283F',fg:g.page||'#F5F3EE',key:g.key||'#D8AD58',accent:g.accent||g.key||'#147D83',font:g.font||'Inter',signature:g.signature||''}}
function wrap(ctx,text,maxWidth){const words=String(text).split(/\s+/).filter(Boolean),lines=[];let cur='';
 for(const w of words){const next=cur?cur+' '+w:w;if(ctx.measureText(next).width>maxWidth&&cur){lines.push(cur);cur=w}else cur=next}if(cur)lines.push(cur);return lines}
function drawCover(canvas,spec){const W=spec.width,H=spec.height;canvas.width=W;canvas.height=H;const g=canvas.getContext('2d'),M=140;
 g.fillStyle=spec.bg;g.fillRect(0,0,W,H);
 g.fillStyle=spec.accent;g.fillRect(0,H-28,W,28);g.fillStyle=spec.key;g.fillRect(M,250,120,10);
 g.textBaseline='alphabetic';g.fillStyle=spec.key;g.font='700 44px '+spec.font+', Inter, Arial, sans-serif';
 g.fillText((spec.series+(spec.number?'  ·  #'+spec.number:'')).toUpperCase(),M,200);
 let size=104,lines;for(;size>=60;size-=6){g.font='800 '+size+'px '+spec.font+', Inter, Arial, sans-serif';lines=wrap(g,spec.headline,W-2*M);if(lines.length<=4)break}
 g.fillStyle=spec.fg;lines.slice(0,5).forEach((l,i)=>g.fillText(l,M,360+size+i*size*1.18));
 if(spec.signature){g.font='600 36px '+spec.font+', Inter, Arial, sans-serif';g.fillStyle=spec.fg;g.globalAlpha=.8;g.fillText(spec.signature,M,H-90);g.globalAlpha=1}
 return canvas}

return Object.freeze({LIMITS,isLinkedInNewsletter,splitTitle,seriesOf,editions,numberOf,expectedTitle,bodyOf,toHtml,toPlain,readingMinutes,problems,steps,toSchedule,coverSpec,drawCover});
});
