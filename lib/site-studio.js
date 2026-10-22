/* Studio Sito: the guided site draft. A few questions, ONE AI call to the Web Developer that writes three alternative
   proposals as structured text (never HTML), RADIX turns each into a complete page with its own deterministic template
   and shows it live in a sandboxed frame without scripts. The person picks one, looks at it on desktop and mobile,
   downloads the .html or saves it in the project (a site page in the Web Developer's thread on the Agenti AI page).
   Pure part (questions, prefill, prompt, parsing, page template, the saved entry) runs in Node for the tests;
   siteStudio() is the browser widget. The only paid step is the AI call, started from a click with confirmation.
   «Metti online» publishes the chosen page on Vercel through the server (api/_site_publish.js, via RadixWorkspace.sites),
   after a confirmation; pages with yellow «[da completare: …]» texts are not published. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixSiteStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
// The styled RADIX confirmation (lib/radix-confirm.js) before every paid step; root.confirm only if it is missing.
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')))};
// Italian label → words for the prompt (or the section id). `def` is the default option (first when missing).
const QUESTIONS=[
 {id:'type',label:'Che sito',options:[['Una pagina (landing)','una landing page di una sola pagina, con le sezioni una sotto l’altra'],['Piccolo sito (4-5 pagine)','un piccolo sito di 4-5 pagine: ogni sezione è una pagina del menu']]},
 {id:'goal',label:'Obiettivo',options:[['Contatti e chiamate','far chiamare o scrivere chi visita il sito'],['Prenotazioni','far prenotare un appuntamento, un tavolo o una visita'],['Vetrina','presentare l’attività e farla conoscere'],['Vendere','vendere prodotti o servizi direttamente']]},
 {id:'style',label:'Stile',options:[['Essenziale','essenziale: pulito, molto spazio bianco, frasi brevi'],['Caldo','caldo: accogliente, vicino, umano'],['Tecnico','tecnico: preciso, ordinato, concreto'],['Audace','audace: deciso, grandi titoli, frasi che si fanno notare']]}
];
const SECTIONS=[['Chi siamo','about'],['Servizi','services'],['Prezzi','prices'],['Testimonianze','reviews'],['FAQ','faq'],['Contatti','contacts'],['Mappa','map']];
const DEFAULT_SECTIONS=['about','services','contacts'];
const AGENT='web-developer',COUNT=3,FIELD_MAX=400,MAX_SECTIONS=8;
const question=id=>QUESTIONS.find(q=>q.id===id);
const fallback=q=>q.options[q.def||0][1];
function pick(id,v){const q=question(id),o=q.options.find(x=>x[1]===v);if(v!=null&&v!==''&&!o)throw Error('Risposta non valida per «'+q.label+'».');return o?o[1]:fallback(q)}
const labelOf=(id,v)=>{const q=question(id);return (q.options.find(x=>x[1]===v)||q.options[q.def||0])[0]};
const styleKey=v=>['essenziale','caldo','tecnico','audace'][Math.max(0,question('style').options.findIndex(x=>x[1]===v))];
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
// The chosen sections in the panel's order; unknown ids are refused, none chosen is an error the widget shows.
function sectionsOf(ids){const want=Array.isArray(ids)?ids:DEFAULT_SECTIONS;
 for(const id of want)if(!SECTIONS.some(s=>s[1]===id))throw Error('Sezione non valida: «'+id+'».');
 return SECTIONS.filter(s=>want.includes(s[1]))}
const HEX=/^#[0-9a-f]{6}$/i;
// Brand colours from the profile's «Identità visiva»: the hex codes written there, in order (cover/dark first when named).
function brandColours(project){const v=String(project&&project.visual||'');const out=[];
 const segs=v.split(/\n|;|\.\s+/),role=re=>{const s=segs.find(x=>re.test(x.toLowerCase())&&/#[0-9a-f]{6}\b/i.test(x));return s?s.match(/#[0-9a-f]{6}\b/i)[0]:''};
 [role(/copertin|cover|primari|principal/),role(/accent|evidenz|chiav/)].concat(v.match(/#[0-9a-f]{6}\b/gi)||[]).forEach(h=>{h=h&&h.toUpperCase();if(h&&HEX.test(h)&&!out.includes(h))out.push(h)});
 return out.slice(0,4)}
// The project profile (RadixAgents.profileFor) → what the questions start from: offer, place, contacts, colours.
function prefill(profile){const p=profile||{},all=[p.summary,p.positioning,p.notes,p.links].map(x=>String(x||'')).join('\n');
 const offer=clean(p.summary||p.positioning||'').slice(0,FIELD_MAX);
 const addr=all.match(/\b(?:via|viale|piazza|piazzale|corso|largo|vicolo|strada)\s+[^\n;]{3,80}/i),line=all.match(/^\s*(?:sede|zona|città|dove|indirizzo)\s*:\s*(.+)$/im);
 const place=clean(addr?addr[0]:line?line[1]:'').replace(/[.,]+$/,'').slice(0,160);
 const links=String(p.links||'')+'\n'+String(p.notes||''),found=[];
 (links.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)||[]).forEach(x=>found.push(x));
 (links.match(/(?:\+39[\s.]?)?\b(?:0\d|3\d{2})[\d\s.]{5,12}\d\b/g)||[]).forEach(x=>found.push(clean(x)));
 (links.match(/https?:\/\/[^\s,;)<>"']+/gi)||[]).slice(0,1).forEach(x=>found.push(x.replace(/[.]+$/,'')));
 return {offer,place,contacts:[...new Set(found)].join(' · ').slice(0,FIELD_MAX),colours:brandColours(p)}}

// The one request to the Web Developer: three alternative proposals as JSON that parseProposals() reads back.
function proposalsPrompt(answers,{offer,place,contacts,project}={}){const a=answers||{},what=clean(offer);
 if(what.length<10)throw Error('Scrivi in una frase cosa offre l’attività.');
 const secs=sectionsOf(a.sections);if(!secs.length)throw Error('Scegli almeno una sezione del sito.');
 const p=project||{},where=clean(place).slice(0,160),reach=clean(contacts).slice(0,FIELD_MAX),lines=[];
 lines.push('Prepara '+COUNT+' proposte alternative di sito per il progetto'+(p.name?' «'+clean(p.name).slice(0,80)+'»':'')+': '+pick('type',a.type)+'.');
 lines.push('Cosa offre l’attività: «'+what.slice(0,FIELD_MAX)+'».');
 lines.push('Dove: '+(where?'«'+where+'».':'non indicato.'));
 lines.push('Contatti confermati: '+(reach?'«'+reach+'».':'non indicati.'));
 lines.push('Obiettivo del sito: '+pick('goal',a.goal)+'.');
 lines.push('Stile dei testi: '+pick('style',a.style)+'.');
 lines.push('Sezioni da scrivere, in quest’ordine: '+secs.map(s=>s[0]).join(', ')+'.');
 lines.push('Le tre proposte devono avere un concetto diverso (per esempio: puntare sulla persona, sul risultato per il cliente, sul metodo).');
 lines.push('Per ogni proposta: un nome (2-4 parole), il concetto in una frase, il titolo principale (massimo 10 parole), un sottotitolo (una frase), per ogni sezione un titolo breve e un testo di 2-4 frasi, e il testo del pulsante di invito all’azione (2-5 parole).');
 lines.push('Usa solo i fatti confermati del progetto e quelli scritti qui. Non inventare clienti, recensioni, testimonianze, numeri, prezzi, indirizzi, orari, premi o certificazioni.');
 lines.push('Quando un’informazione manca, scrivi un segnaposto chiaro, per esempio «[da completare: prezzi dei servizi]» o «[da completare: testimonianza vera di un cliente]».');
 lines.push('Italiano semplice, frasi brevi, niente emoji. Solo testo: niente HTML, niente markdown, niente link.');
 lines.push('Rispondi solo con JSON valido, senza testo prima o dopo, in questa forma:');
 lines.push(JSON.stringify({proposte:[{nome:'…',concetto:'…',titolo:'…',sottotitolo:'…',sezioni:secs.map(s=>({titolo:s[0],testo:'…'})),invito:'…'}]}));
 lines.push('La lista «proposte» contiene esattamente '+COUNT+' proposte.');
 return lines.join('\n')}

// ---- parsing ----
const LIM={name:60,concept:300,headline:140,sub:300,title:70,text:900,cta:60};
const txt=(v,max)=>{if(v&&typeof v==='object')v=v.testo||v.text||v.titolo||v.title||'';
 return String(v==null?'':v).replace(/\r/g,'').replace(/\*\*|__|`/g,'').split('\n').map(l=>l.replace(/[ \t]+/g,' ').trim()).join('\n').replace(/\n{3,}/g,'\n\n').trim().slice(0,max)};
const one=(v,max)=>txt(v,max).replace(/\s+/g,' ').replace(/^[«"“]+|[»"”]+$/g,'');
function section(x,i){if(typeof x==='string'){const m=/^\s*([^:\n]{2,60}):\s*([\s\S]+)$/.exec(x);x=m?{title:m[1],text:m[2]}:{text:x}}
 if(!x||typeof x!=='object')return null;
 const s={title:one(x.titolo||x.title||x.nome||x.name||x.sezione||x.section,LIM.title),text:txt(x.testo||x.text||x.contenuto||x.content||x.descrizione||x.description||x.corpo||x.body,LIM.text)};
 if(!s.title&&!s.text)return null;if(!s.title)s.title='Sezione '+(i+1);return s}
// A proposal is usable when it has a headline and at least one section; empty ones are skipped.
function proposal(x,n){if(!x||typeof x!=='object')return null;
 const raw=x.sezioni||x.sections||x.pagine||x.pages||[],secs=(Array.isArray(raw)?raw:[]).map(section).filter(Boolean).slice(0,MAX_SECTIONS);
 const p={name:one(x.nome||x.name||x.titolo_proposta||x.proposta,LIM.name),concept:one(x.concetto||x.concept||x.idea||x.descrizione,LIM.concept),
  headline:one(x.titolo||x.headline||x.title||x.titolo_principale,LIM.headline),sub:one(x.sottotitolo||x.subheadline||x.subtitle||x.sottotitolo_principale,LIM.sub),
  sections:secs,cta:one(x.invito||x.cta||x.call_to_action||x.callToAction||x.pulsante||x.azione,LIM.cta)};
 if(!p.headline||!p.sections.length)return null;if(!p.name)p.name='Proposta '+n;return p}
function fromJson(raw){const s=raw.search(/[[{]/);if(s<0)return null;const e=Math.max(raw.lastIndexOf('}'),raw.lastIndexOf(']'));if(e<=s)return null;
 const body=raw.slice(s,e+1);for(const t of [body,body.replace(/,\s*([}\]])/g,'$1').replace(/[“”]/g,'"')]){try{return JSON.parse(t)}catch(err){}}return null}
// Fallback for a reply in plain text: «Proposta 1» headings with NOME/CONCETTO/TITOLO/SOTTOTITOLO/SEZIONI/INVITO lines.
function fromText(raw){const heads=[],re=/^[ \t]*[=#*\-_ ]*\s*(?:PROPOSTA|PROPOSAL|OPZIONE)\s*(?:N[°.]?\s*)?(\d)\b[^\n]*$/gim;let m;
 while((m=re.exec(raw)))heads.push({i:m.index,end:m.index+m[0].length});
 return heads.map((h,k)=>{const body=raw.slice(h.end,k+1<heads.length?heads[k+1].i:raw.length),o={sezioni:[]};let inSec=false;
  for(const line of body.split('\n')){const t=line.replace(/\*\*|__/g,'').trim();if(!t||/^[=#*_-]{2,}\s*FINE\b/i.test(t))continue;
   const f=/^(nome|concetto|titolo|sottotitolo|invito|cta|sezioni)\s*:\s*(.*)$/i.exec(t.replace(/^[#>\s]+/,''));
   if(f){const k2=f[1].toLowerCase();if(k2==='sezioni'){inSec=true;continue}inSec=false;o[k2==='cta'?'invito':k2]=f[2];continue}
   if(inSec)o.sezioni.push(t.replace(/^(?:[-*•–·]|\d{1,2}[.)])\s+/,''))}
  return o})}
// The reply → up to three proposals. JSON first (fenced, wrapped in prose, with trailing commas), then «Proposta n»
// headings. Returns [] when nothing usable is there (the widget says so).
function parseProposals(text){const raw=String(text||'').replace(/\r/g,'').replace(/```[a-z]*\n?|```/gi,''),out=[];
 let d=fromJson(raw);if(d&&!Array.isArray(d))d=d.proposte||d.proposals||d.proposta||d.siti||d.items||(d.titolo||d.headline?[d]:[]);
 const add=list=>(Array.isArray(list)?list:list&&typeof list==='object'?[list]:[]).forEach(x=>{if(out.length>=COUNT)return;const p=proposal(x,out.length+1);if(p)out.push(p)});
 add(d);if(!out.length)add(fromText(raw));
 return out}

// ---- the page: a deterministic template, every text escaped, no scripts ----
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TODO=/\[da completare:[^\]\n]{0,200}\]/g;
const mark=s=>esc(s).replace(TODO,'<mark class="todo">$&</mark>');
// Paragraphs and «- » lists from a section text.
function rich(t){const blocks=[];let list=null;
 for(const l of String(t||'').split('\n')){const b=/^\s*(?:[-*•–·]|\d{1,2}[.)])\s+(.+)$/.exec(l);
  if(b){(list=list||[]).push('<li>'+mark(b[1])+'</li>');continue}
  if(list){blocks.push('<ul>'+list.join('')+'</ul>');list=null}
  if(l.trim())blocks.push('<p>'+mark(l.trim())+'</p>')}
 if(list)blocks.push('<ul>'+list.join('')+'</ul>');return blocks.join('')}
const STYLES={
 essenziale:{p:'#1F2937',a:'#2563EB',bg:'#FFFFFF',fg:'#111827',font:'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif',head:'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif',r:'6px',hero:'plain',up:false},
 caldo:{p:'#9A3412',a:'#C2410C',bg:'#FDF8F1',fg:'#3B2F2A',font:'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif',head:'Georgia,"Times New Roman",serif',r:'18px',hero:'tint',up:false},
 tecnico:{p:'#0F172A',a:'#0284C7',bg:'#F8FAFC',fg:'#0F172A',font:'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif',head:'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',r:'2px',hero:'grid',up:false},
 audace:{p:'#111111',a:'#E11D48',bg:'#FFFFFF',fg:'#111111',font:'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif',head:'"Arial Black",Impact,system-ui,sans-serif',r:'0',hero:'solid',up:true}
};
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const lum=h=>{const c=rgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const on=h=>lum(h)>.4?'#111111':'#FFFFFF';
const mix=(h,w,k)=>'#'+rgb(h).map((v,i)=>Math.round(v*(1-k)+rgb(w)[i]*k).toString(16).padStart(2,'0')).join('').toUpperCase();
// Colours: the brand's (only valid #RRGGBB codes) over the style's defaults; an accent too light for the page background is darkened.
function palette(style,colours){const s=STYLES[style]||STYLES.essenziale,c=(Array.isArray(colours)?colours:[]).filter(h=>HEX.test(String(h))).map(h=>h.toUpperCase());
 const p=c[0]||s.p;let a=c[1]||(c[0]?c[0]:s.a);if(lum(a)>.5)a=mix(a,'#000000',.45);return {p,a,bg:s.bg,fg:s.fg}}
const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
// A confirmed contact as a link: e-mail, phone or web address; anything else stays text.
function contactHtml(c){const t=c.trim();if(!t)return '';
 if(/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(t))return '<a href="mailto:'+esc(t)+'">'+esc(t)+'</a>';
 if(/^\+?[\d\s.]{7,}$/.test(t))return '<a href="tel:'+esc(t.replace(/[\s.]/g,''))+'">'+esc(t)+'</a>';
 if(/^https?:\/\/[^\s"'<>]+$/i.test(t))return '<a href="'+esc(t)+'">'+esc(t.replace(/^https?:\/\//i,''))+'</a>';
 return mark(t)}
/* The complete page for a proposal. opts: {style (answer value or key), colours, name, place, contacts, type, year}.
   Contacts and the map come from the confirmed fields, never from the AI text. */
function buildPage(prop,opts={}){const P=prop||{},o=opts,key=STYLES[o.style]?o.style:styleKey(o.style),S=STYLES[key],c=palette(key,o.colours);
 const name=clean(o.name).slice(0,80),place=clean(o.place).slice(0,160),reach=clean(o.contacts).split(/\s*[·|;,]\s*|\s{2,}/).filter(Boolean).slice(0,6);
 const secs=(P.sections||[]).slice(0,MAX_SECTIONS).map((s,i)=>({...s,id:'s'+(i+1)+(slug(s.title)?'-'+slug(s.title):'')}));
 const contactSec=secs.find(s=>/contatt|scrivi|chiama/i.test(s.title)),ctaHref=contactSec?'#'+contactSec.id:secs.length?'#'+secs[0].id:'#';
 const todo=t=>'<mark class="todo">[da completare: '+esc(t)+']</mark>';
 const body=secs.map((s,i)=>{let extra='';
  if(/contatt/i.test(s.title))extra='<div class="contacts">'+(reach.length?'<ul>'+reach.map(r=>'<li>'+contactHtml(r)+'</li>').join('')+'</ul>':'<p>'+todo('telefono, e-mail e orari')+'</p>')+'</div>';
  else if(/mappa|dove siamo|come raggiungerci/i.test(s.title))extra='<div class="map"><p class="where">'+(place?esc(place):todo('indirizzo'))+'</p>'+(place?'<p><a href="https://www.google.com/maps/search/?api=1&amp;query='+esc(encodeURIComponent(place))+'">Apri la mappa</a></p>':'')+'</div>';
  return '<section id="'+esc(s.id)+'" class="sec'+(i%2?' alt':'')+'"><div class="wrap"><h2>'+mark(s.title)+'</h2>'+rich(s.text)+extra+'</div></section>'}).join('\n');
 const nav=secs.slice(0,o.type===question('type').options[1][1]?MAX_SECTIONS:5).map(s=>'<a href="#'+esc(s.id)+'">'+esc(s.title)+'</a>').join('');
 const tint=mix(c.p,'#FFFFFF',.9),heroBg=S.hero==='solid'||S.hero==='grid'?c.p:S.hero==='tint'?tint:c.bg,heroFg=S.hero==='solid'||S.hero==='grid'?on(c.p):c.fg;
 const css=[':root{--p:'+c.p+';--a:'+c.a+';--on-a:'+on(c.a)+';--bg:'+c.bg+';--fg:'+c.fg+';--tint:'+tint+';--r:'+S.r+'}',
  '*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.6 '+S.font+';overflow-wrap:anywhere}',
  '.wrap{max-width:1040px;margin:0 auto;padding:0 24px}',
  'h1,h2,.brand{font-family:'+S.head+';line-height:1.15;margin:0 0 .5em'+(S.up?';text-transform:uppercase;letter-spacing:-.01em':'')+'}',
  '.top{border-bottom:1px solid rgba(127,127,127,.25);background:var(--bg)}.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px;flex-wrap:wrap}',
  '.brand{font-size:20px;margin:0;color:var(--p)}nav{display:flex;flex-wrap:wrap;gap:6px 18px}nav a{color:inherit;text-decoration:none;font-size:15px}nav a:hover{color:var(--a)}',
  '.hero{background:'+heroBg+';color:'+heroFg+';padding:'+(S.hero==='solid'?'110px':'84px')+' 0}',
  S.hero==='grid'?'.hero{background-image:linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px);background-size:32px 32px}':'',
  S.hero==='plain'?'.hero h1{border-left:4px solid var(--a);padding-left:18px}':'',
  '.hero h1{font-size:clamp(34px,6vw,'+(S.up?'72px':'58px')+');max-width:18ch}.hero p{font-size:clamp(18px,2.2vw,22px);max-width:46ch;margin:0 0 28px;opacity:.9}',
  '.cta{display:inline-block;background:var(--a);color:var(--on-a);padding:14px 26px;border-radius:var(--r);text-decoration:none;font-weight:700'+(S.up?';text-transform:uppercase;letter-spacing:.04em':'')+'}',
  '.sec{padding:64px 0}.sec.alt{background:'+(key==='caldo'?'var(--tint)':'rgba(127,127,127,.07)')+'}.sec h2{font-size:clamp(26px,3.6vw,38px);color:var(--p)}.sec p,.sec li{max-width:68ch}',
  key==='tecnico'?'.sec h2::before{content:"// ";color:var(--a)}':'',key==='audace'?'.sec h2{border-bottom:6px solid var(--a);display:inline-block;padding-bottom:4px}':'',
  '.sec ul{padding-left:1.2em}.contacts ul{list-style:none;padding:0;display:flex;flex-direction:column;gap:6px;font-size:19px}.contacts a,.map a{color:var(--a);font-weight:600}',
  '.where{font-size:19px;font-weight:600}',
  'mark.todo{background:#FEF3C7;color:#78350F;padding:1px 4px;border-radius:4px;font-size:.92em}',
  'footer{padding:30px 0;font-size:14px;border-top:1px solid rgba(127,127,127,.25);opacity:.85}',
  '@media (max-width:640px){body{font-size:16px}.wrap{padding:0 18px}.hero{padding:56px 0}.sec{padding:44px 0}nav{gap:4px 14px}nav a{font-size:14px}}'].filter(Boolean).join('\n');
 const title=(name?name+' · ':'')+(P.headline||'');
 return ['<!doctype html>','<html lang="it">','<head>','<meta charset="utf-8">','<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">',
  '<title>'+esc(title)+'</title>','<meta name="description" content="'+esc(P.sub||P.headline||'')+'">','<style>',css,'</style>','</head>','<body>',
  '<header class="top"><div class="wrap"><p class="brand">'+(name?esc(name):todo('nome dell’attività'))+'</p>'+(nav?'<nav aria-label="Menu">'+nav+'</nav>':'')+'</div></header>',
  '<main>','<section class="hero"><div class="wrap"><h1>'+mark(P.headline||'[da completare: titolo]')+'</h1>'+(P.sub?'<p>'+mark(P.sub)+'</p>':'')+'<a class="cta" href="'+ctaHref+'">'+mark(P.cta||'Contattaci')+'</a></div></section>',
  body,'</main>',
  '<footer><div class="wrap">© '+esc(o.year||new Date().getFullYear())+' '+(name?esc(name):'')+(place?' · '+esc(place):'')+'</div></footer>','</body>','</html>'].join('\n')}
const hasTodo=html=>/class="todo"/.test(String(html));
// The «[da completare: …]» markers of a page, each once, in page order: {key (as written in the html), label (readable)}.
const unesc=s=>String(s).replace(/&(amp|lt|gt|quot|#39);/g,(m,k)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[k]));
function todoMarkers(html){const seen=new Set(),out=[];for(const k of String(html||'').match(TODO)||[])if(!seen.has(k)){seen.add(k);out.push({key:k,label:unesc(k)})}return out}
/* Fills markers with real values: values maps a marker key to its text. Every occurrence of the marker (highlighted in the
   page, or bare in the title, description and menu) becomes the HTML-escaped value; markers left empty stay as they are,
   and nothing else in the html changes. */
function fillTodos(html,values){let out=String(html||'');
 for(const [key,raw] of Object.entries(values||{})){const v=clean(raw).slice(0,FIELD_MAX);if(!v||!/^\[da completare:[^\]\n]{0,200}\]$/.test(key))continue;
  const value=esc(v);out=out.split('<mark class="todo">'+key+'</mark>').join(value).split(key).join(value)}
 return out}
const filename=p=>'sito-'+(slug(p&&p.name)||'proposta')+'.html';

// Saved in the project: one exchange in the Web Developer's thread of the shared «agents» document, the same place the
// Agenti AI page reads. The page is a «---DOCUMENTO: sito-….html---» block, so it shows there as a site page with its preview.
const MAX_KEPT=60;
function savedEntry(p,html,{by,at}={}){const when=at||new Date().toISOString();
 return [{role:'user',content:'Proposta di sito scelta dal pannello Marketing: «'+p.name+'».',display:'Proposta di sito scelta nel pannello Marketing: «'+p.name+'»',by:by||'Pannello Marketing',at:when,source:'site-studio'},
  {role:'assistant',agent:AGENT,content:'Ecco la proposta scelta, salvata nel progetto. I testi tra [da completare: …] vanno riempiti prima di pubblicare.\n\n---DOCUMENTO: '+filename(p)+'---\n'+html+'\n---FINE DOCUMENTO---',at:when,source:'site-studio'}]}
async function saveToProject(ws,projectId,p,html,opts){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const doc=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await doc.load())||{},conv={...(cur.conversations||{})};
  conv[AGENT]=(Array.isArray(conv[AGENT])?conv[AGENT]:[]).concat(savedEntry(p,html,opts)).slice(-MAX_KEPT);
  try{return await doc.save({...cur,schemaVersion:1,conversations:conv})}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}

// ---- browser widget ----
let counter=0;
const doc=()=>root.document;
const el=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
const field=(label,value,ph,max)=>{const l=el('label',label),i=el('input');i.type='text';i.value=value||'';i.placeholder=ph||'';i.maxLength=max||FIELD_MAX;l.append(i);return [l,i]};
// A frame that shows the page and can run nothing: sandbox with no permissions (no scripts, no same origin, no forms, no popups).
function frame(html,title){const f=el('iframe');f.setAttribute('sandbox','');f.setAttribute('referrerpolicy','no-referrer');f.title=title;f.srcdoc=html;return f}
const THUMB_W=1280;
// The record saved by the server: only an https link is shown as a link.
const onlineUrl=site=>site&&/^https:\/\/[^\s"'<>]+$/.test(String(site.url||''))?String(site.url):'';
const wait=ms=>new Promise(r=>root.setTimeout(r,ms));
const PUBLISH_CONFIRM=Object.freeze({title:'Mettere online il sito?',tag:'Pubblico',cost:'Sarà pubblicato su internet, sul nostro hosting Vercel: chiunque abbia il link potrà vederlo.',message:'Puoi aggiornarlo quando vuoi.',ok:'Metti online'});
// ctx: {project (profile for the AI), memoryScope, projectId, workspace (RadixWorkspace, for «Salva nel progetto» and «Metti online»), agentsUrl, by}
function siteStudio(ctx={}){
 const n=++counter,answers={sections:DEFAULT_SECTIONS.slice()},wrap=el('div',undefined,'tool photo-studio site-studio'),pre=prefill(ctx.project);
 const steps=el('ol',undefined,'ps-steps');['Le domande','Scegli tra 3 proposte','Il sito'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const form=el('div',undefined,'ps-form'),qs=el('div',undefined,'ps-questions');
 const radios=q=>{const fs=el('fieldset');fs.append(el('legend',q.label));q.options.forEach(([label,v])=>{const l=el('label',undefined,'ps-chip'),r=el('input');r.type='radio';r.name='st-'+q.id+'-'+n;r.value=v;r.checked=v===(answers[q.id]||fallback(q));r.onchange=()=>{answers[q.id]=v};l.append(r,doc().createTextNode(' '+label));fs.append(l)});return fs};
 qs.append(radios(question('type')),radios(question('goal')));
 const sfs=el('fieldset',undefined,'st-sections');sfs.append(el('legend','Sezioni'));
 SECTIONS.forEach(([label,id])=>{const l=el('label',undefined,'ps-chip'),c=el('input');c.type='checkbox';c.value=id;c.checked=answers.sections.includes(id);
  c.onchange=()=>{answers.sections=SECTIONS.map(s=>s[1]).filter(x=>x===id?c.checked:answers.sections.includes(x))};l.append(c,doc().createTextNode(' '+label));sfs.append(l)});
 qs.append(sfs,radios(question('style')));
 const ol=el('label','Cosa offre l’attività'),offer=el('textarea');offer.rows=2;offer.maxLength=FIELD_MAX;offer.value=pre.offer;offer.placeholder='Es. studio di fisioterapia: riabilitazione sportiva e posturale';ol.append(offer);
 const [pl,place]=field('Dove (facoltativo)',pre.place,'Es. Via Roma 12, Bergamo',160);
 const [cl,contacts]=field('Contatti da mostrare (facoltativi)',pre.contacts,'Es. 035 123456 · info@esempio.it');
 const fields=el('div',undefined,'ss-fields st-fields');fields.append(ol,pl,cl);
 const colours=el('p',undefined,'st-colours muted');
 if(pre.colours.length){colours.append(doc().createTextNode('Colori del brand dal profilo: '));pre.colours.slice(0,2).forEach(h=>{const sw=el('span',undefined,'st-swatch');sw.style.background=h;sw.title=h;colours.append(sw,doc().createTextNode(' '+h+' '))})}
 else colours.textContent='Nessun colore del brand nel profilo: uso i colori dello stile scelto.';
 const go=button('Prepara 3 proposte','primary'),cost=el('span','Una chiamata AI al Web Developer: ti chiedo conferma prima.','muted'),status=el('p','','tool-status');status.setAttribute('role','status');
 const bar=el('div',undefined,'ps-actions');bar.append(go,cost);form.append(qs,fields,colours,bar);
 // «Online su …»: what the server saved for this project, read once when the studio opens.
 const sites=ctx.workspace&&ctx.workspace.sites&&ctx.projectId?ctx.workspace.sites:null,online=el('p','','st-online muted');online.hidden=true;
 let known=null,missing='';
 const showOnline=site=>{known=site&&site.deploymentId?site:known;const u=onlineUrl(known);online.hidden=!u;if(!u)return;const a=el('a',u.replace(/^https:\/\//,''));a.href=u;a.target='_blank';a.rel='noopener noreferrer';
  online.replaceChildren(doc().createTextNode(known.state==='READY'?'Online su ':'In pubblicazione su '),a,doc().createTextNode(known.domain&&known.domain.name?' · sottodominio '+known.domain.name+(known.domain.verified?' (attivo)':' (in attesa del DNS)'):''))};
 const ready=sites?sites.info(ctx.projectId).then(r=>showOnline(r.site)).catch(e=>{const b=e&&e.body||{};if(e&&e.status===503)missing=b.error||e.message;showOnline(b.site)}):Promise.resolve();
 const grid=el('div',undefined,'ps-grid st-grid'),site=el('div',undefined,'st-site');grid.hidden=site.hidden=true;
 wrap.append(steps,online,form,status,grid,site);setStep(1);
 const lock=on=>{go.disabled=on;wrap.querySelectorAll('.ps-form input,.ps-form textarea').forEach(x=>x.disabled=on)};
 let asked={};
 const pageOf=p=>buildPage(p,asked);
 go.onclick=async()=>{let prompt;const inputs={offer:offer.value,place:place.value,contacts:contacts.value,project:ctx.project};
  try{prompt=proposalsPrompt(answers,inputs)}catch(e){status.textContent=e.message;(/sezione/.test(e.message)?sfs.querySelector('input'):offer).focus();return}
  const rt=root.RadixAgents;if(!rt||typeof rt.reply!=='function'){status.textContent='Gli agenti non si sono caricati: ricarica la pagina.';return}
  if(!await askConfirm({title:'Preparare 3 proposte di sito con il Web Developer AI?',cost:'È una sola chiamata AI: usa crediti API.',ok:'Prepara le proposte'}))return;
  lock(true);setStep(2);status.textContent='Il Web Developer prepara le 3 proposte…';grid.hidden=false;grid.replaceChildren();site.hidden=true;
  asked={style:pick('style',answers.style),type:pick('type',answers.type),colours:pre.colours,name:ctx.project&&ctx.project.name,place:place.value,contacts:contacts.value};
  try{const r=await rt.reply({role:AGENT,project:ctx.project,memoryScope:ctx.memoryScope,messages:[{role:'user',content:prompt}]});const list=parseProposals(r&&r.text);
   if(!list.length)throw Error('la risposta non contiene proposte leggibili. Riprova.');
   status.textContent=(list.length<COUNT?'Sono arrivate '+list.length+' proposte su '+COUNT+'. ':'')+'Confronta le anteprime e scegli quella da sviluppare. I testi evidenziati sono da completare.';
   grid.replaceChildren(...list.map(card));go.textContent='Prepara altre 3 proposte'}
  catch(e){status.textContent='Proposte non preparate: '+e.message;setStep(1);grid.hidden=true}
  finally{lock(false)}};
 // The thumbnail: the full page at desktop width, scaled to the card.
 function thumb(html,title){const box=el('div',undefined,'st-thumb'),f=frame(html,title);f.tabIndex=-1;f.setAttribute('aria-hidden','true');box.append(f);
  const fit=()=>{const w=box.clientWidth;if(w)box.style.setProperty('--s',String(w/THUMB_W))};
  if(root.ResizeObserver)new root.ResizeObserver(fit).observe(box);setTimeout(fit,0);return box}
 function card(p,i){const f=el('article',undefined,'ps-card st-card'),use=button('Scegli questa','primary');
  f.append(el('h3',(i+1)+' · '+p.name));if(p.concept)f.append(el('p',p.concept,'st-concept'));
  f.append(thumb(pageOf(p),'Anteprima della proposta '+(i+1)),el('p','«'+p.headline+'» · '+p.sections.length+' sezioni','st-meta'));
  use.onclick=()=>choose(p,f);f.append(use);return f}
 function choose(p,cardEl){grid.querySelectorAll('.st-card').forEach(x=>x.dataset.chosen=String(x===cardEl));setStep(3);site.hidden=false;
  let html=pageOf(p);const view=el('div',undefined,'st-view'),big=frame(html,'Anteprima del sito: '+p.name);view.dataset.mode='desktop';view.append(big);
  const modes=el('div',undefined,'st-modes');modes.setAttribute('role','group');modes.setAttribute('aria-label','Anteprima');
  [['desktop','Desktop'],['mobile','Mobile']].forEach(([m,t])=>{const b=button(t);b.dataset.mode=m;b.setAttribute('aria-pressed',String(m==='desktop'));
   b.onclick=()=>{view.dataset.mode=m;modes.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))};modes.append(b)});
  const st=el('p',hasTodo(html)?'I testi evidenziati in giallo sono da completare prima di pubblicare: scrivili qui sotto.':'Il sito scelto: scaricalo o salvalo nel progetto.','tool-status');st.setAttribute('role','status');
  const dl=button('Scarica il sito (.html)'),acts=el('div',undefined,'ps-actions');acts.append(dl);
  dl.onclick=()=>{const a=el('a');a.href=root.URL.createObjectURL(new root.Blob([html],{type:'text/html;charset=utf-8'}));a.download=filename(p);doc().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),2000);st.textContent='Sito scaricato: '+a.download+'.'};
  let save=null;
  if(ctx.workspace&&ctx.projectId){save=button('Salva nel progetto','primary');acts.prepend(save);
   save.onclick=async()=>{save.disabled=true;st.textContent='Salvo il sito nel progetto…';
    try{await saveToProject(ctx.workspace,ctx.projectId,p,html,{by:ctx.by});save.textContent='Salvato ✓';st.replaceChildren(doc().createTextNode('Sito salvato nel progetto: lo trova tutto il team tra i documenti del Web Developer, con l’anteprima. '));
     if(ctx.agentsUrl){const a=el('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;st.append(a)}}
    catch(e){st.textContent='Sito non salvato: '+e.message;save.disabled=false}}}
  const pub=publishBox(()=>html),todos=el('form',undefined,'st-todos');
  // «Da completare»: one field per marker; «Applica» writes the values into the page and refreshes everything that uses it.
  const todoForm=()=>{const list=todoMarkers(html);todos.hidden=!list.length;if(!list.length){todos.replaceChildren();return}
   const inputs=list.map(m=>{const [l,i]=field(m.label,'','Scrivi il testo vero');l.className='st-todo';i.dataset.key=m.key;return [l,i]});
   const apply=button('Applica','primary');apply.type='submit';
   todos.replaceChildren(el('h4','Da completare ('+list.length+')'),el('p','Scrivi il testo vero al posto di ogni segnaposto giallo. Quelli lasciati vuoti restano da completare.','muted'),...inputs.map(x=>x[0]),apply)};
  todos.onsubmit=e=>{e.preventDefault();const values={};todos.querySelectorAll('input[data-key]').forEach(i=>{values[i.dataset.key]=i.value});
   const next=fillTodos(html,values);if(next===html){st.textContent='Scrivi almeno un testo prima di applicare.';return}
   html=next;big.srcdoc=html;todoForm();pub.refresh();if(save){save.disabled=false;save.textContent='Salva nel progetto'}
   const left=todoMarkers(html).length;st.textContent=left?'Testi applicati all’anteprima. Ne restano '+left+' da completare.':'Testi completati: il sito è pronto da scaricare, salvare o mettere online.'};
  todoForm();
  site.replaceChildren(el('h3','Il sito scelto · '+p.name),modes,view,acts,st,todos,pub);site.scrollIntoView&&site.scrollIntoView({behavior:'smooth',block:'nearest'})}
 // «Metti online»: confirmation, progress, the link, «Aggiorna il sito online» next time, then the domain guidance.
 function publishBox(current){const box=el('div',undefined,'st-publish');box.append(el('h4','Online'));box.refresh=()=>{};
  if(!sites){box.append(el('p','Per metterlo online apri lo studio da un progetto.','muted'));return box}
  const btn=button(known?'Aggiorna il sito online':'Metti online','primary'),msg=el('p','','tool-status st-pub-status'),acts=el('div',undefined,'ps-actions'),more=el('div',undefined,'st-domains');msg.setAttribute('role','status');
  acts.append(btn);box.append(acts,msg,more);
  let todo=hasTodo(current());
  const gate=()=>{todo=hasTodo(current());btn.textContent=known?'Aggiorna il sito online':'Metti online';btn.disabled=!!missing||todo;
   if(missing)msg.textContent=missing;else if(todo)msg.textContent='Per metterlo online completa prima i testi evidenziati in giallo nel riquadro «Da completare».';
   else if(onlineUrl(known))link('Il sito del progetto è già online: ',known,' · «Aggiorna il sito online» lo sostituisce con questa versione.');
   else msg.textContent='Pubblica il sito su internet, sul nostro hosting: ti chiedo conferma prima.';
   if(onlineUrl(known)&&known.state==='READY')domains()};
  function link(before,site,after){const u=onlineUrl(site),a=el('a',u.replace(/^https:\/\//,''));a.href=u;a.target='_blank';a.rel='noopener noreferrer';msg.replaceChildren(doc().createTextNode(before),a,doc().createTextNode(after||''))}
  ready.then(gate);box.refresh=()=>ready.then(gate);
  btn.onclick=async()=>{if(btn.disabled)return;if(!await askConfirm(PUBLISH_CONFIRM))return;
   btn.disabled=true;msg.textContent='Metto online il sito… (di solito meno di un minuto)';
   try{let r=await sites.publish(ctx.projectId,current());
    for(let i=0;r.state==='BUILDING'&&i<40;i++){msg.textContent='Vercel sta preparando il sito… ('+(i+1)*3+' s)';await wait(3000);r=await sites.status(ctx.projectId,r.deploymentId)}
    showOnline(r);
    if(r.state==='READY')link('Il sito è online: ',r,'');else if(r.state==='BUILDING')link('Vercel sta ancora preparando il sito: tra qualche minuto sarà su ',r,'');
    else msg.textContent='Vercel non è riuscito a mettere online il sito ('+r.state+'). Riprova tra qualche minuto.';
    btn.textContent='Aggiorna il sito online';if(r.state==='READY')domains()}
   catch(e){msg.textContent='Sito non messo online: '+e.message;if(e&&e.status===503)missing=e.message}
   finally{btn.disabled=!!missing||todo}};
  // The RADIX subdomain (DNS at Namecheap, set by the RADIX team) and the steps for the client's own domain.
  function domains(){if(more.childElementCount)return;
   const sub=el('div',undefined,'st-domain'),ask=button('Collega un sottodominio RADIX'),out=el('div','','tool-status');out.setAttribute('role','status');
   sub.append(el('h4','Sottodominio radixinnovationstudio.com'),el('p','Un indirizzo più semplice, per esempio nome-sito.radixinnovationstudio.com. Il dominio radixinnovationstudio.com è su Namecheap: il record DNS lo aggiunge il team RADIX.','muted'),ask,out);
   const showRecord=d=>{const rec=d.record||{},t=el('dl',undefined,'st-dns');[['Indirizzo',d.domain],['Record','CNAME'],['Nome',rec.name],['Valore',rec.value],['Stato',d.verified?'Verificato ✓':'In attesa del record DNS (team RADIX)']].forEach(([k,v])=>t.append(el('dt',k),el('dd',v)));
    out.replaceChildren(el('p',d.verified?'Sottodominio attivo.':'Sottodominio aggiunto su Vercel. Il team RADIX aggiunge questo record su Namecheap per '+rec.zone+':'),t)};
   if(known&&known.domain&&known.domain.name)ask.textContent='Ricontrolla il sottodominio';
   ask.onclick=async()=>{ask.disabled=true;out.textContent='Collego il sottodominio…';
    try{const d=await sites.domain(ctx.projectId);showRecord(d);known={...known,domain:{name:d.domain,verified:d.verified}};showOnline(known);ask.textContent='Ricontrolla il sottodominio'}
    catch(e){out.textContent='Sottodominio non collegato: '+e.message}finally{ask.disabled=false}};
   const own=el('details',undefined,'st-own');own.append(el('summary','Usa il tuo dominio'));
   const list=el('ol');['Nel pannello del tuo registrar (dove hai comprato il dominio) apri la gestione DNS.','Per www.tuodominio.it aggiungi un record CNAME: nome «www», valore «cname.vercel-dns.com».','Per il dominio senza www (tuodominio.it) aggiungi un record A: nome «@», valore «76.76.21.21».','Scrivi al team RADIX il dominio: lo collega al sito su Vercel e ti conferma quando è attivo (il certificato HTTPS arriva da solo).'].forEach(t=>list.append(el('li',t)));
   own.append(list,el('p','Qui non si compra nessun dominio: servono solo questi record presso il tuo registrar.','muted'));
   more.append(sub,own)}
  return box}
 return wrap}
return Object.freeze({QUESTIONS,SECTIONS,DEFAULT_SECTIONS,AGENT,STYLES,brandColours,prefill,proposalsPrompt,parseProposals,buildPage,palette,hasTodo,filename,savedEntry,saveToProject,labelOf,escapeHtml:esc,todoMarkers,fillTodos,siteStudio});
});
