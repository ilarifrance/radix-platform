/* Studio Scheda Google e recensioni: the Google Business Profile listing and the replies to reviews, as two guided flows.
   A) «Scheda attività»: six essential questions (type of business, area, services, real strengths, hours and contacts,
   tone), ONE AI call to the SEO and GEO specialist that returns three versions as JSON, each with the description (at
   most 750 characters, the keyword in the first 250, no links, phone numbers, e-mails or offers: Google's rules), the
   primary category and up to 9 more (to be picked from Google's own list), the services with a short description,
   10 questions and answers, 4 posts (offer, news, event, update) with their button and the photos to upload. RADIX checks
   every limit (over a hard limit the text is trimmed and flagged), removes links, phone numbers and e-mails from the
   description, flags numbers and claims that are not in the brief or the facts sheet (lib/ad-studio.js groundIssues)
   and placeholders still to fill.
   B) «Risposte alle recensioni»: reviews pasted as text (with stars) or a CSV; the sentiment is classified here, for free;
   ONE AI call to the Copywriter writes three replies per review (warm, concise, solution-oriented). Each reply is linted:
   no incentives and no request to change the review, no surname, health or personal data echoed from the review, no
   contact that is not in the brief, apology and an offline contact for negative reviews, the business name as signature,
   at most 4096 characters (Google's limit), short recommended.
   C) Save in the project (the «agents» document, key gbp, every other key kept) and download (.txt and .csv).
   RADIX does not post on Google (no API access): the person copies the texts into the profile on business.google.com.
   Pure part (questions, limits, rules, prompts, parsing, sentiment, lint, CSV, files, saved records) runs in Node for the
   tests; gbpStudio() is the browser widget. Paid steps, each from a click with confirmation: the two AI calls. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixGbpStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
// The styled RADIX confirmation (lib/radix-confirm.js) before every paid step; root.confirm only if it is missing.
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')))};
const AGENT='seo-geo',REPLY_AGENT='copywriter',COUNT=3,FIELD_MAX=400,FACTS_MAX=4000,MAX_REVIEWS=20,MAX_LISTINGS=5,MAX_REPLIES=300;
const GOOGLE_URL='https://business.google.com/';
// The other RADIX modules: the page's globals, or require() in Node.
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const copyLib=()=>lib('RadixCopyStudio','./copy-studio.js'),adLib=()=>lib('RadixAdStudio','./ad-studio.js'),csvLib=()=>lib('RadixCrmCsv','../sales/crm-csv-core.js');
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const block=s=>String(s==null?'':s).replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const chars=s=>[...String(s==null?'':s)].length;
const words=s=>clean(s).split(' ').filter(Boolean).length;
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>norm(s).replace(/ /g,'-').slice(0,40);

// ---- A) the listing: questions and limits ----
// Fields: `need` = minimum length when required, `rows` > 1 a textarea. Tone: label → words for the prompt.
const FIELDS=[
 {id:'kind',label:'Tipo di attività',need:3,max:120,ph:'Es. panificio artigianale'},
 {id:'area',label:'Città o zona servita',need:2,max:160,ph:'Es. Torino, quartiere San Salvario e consegne in centro'},
 {id:'services',label:'Servizi principali',need:5,max:FIELD_MAX*2,rows:3,ph:'Uno per riga: pane a lievito madre, torte su ordinazione, colazioni'},
 {id:'strengths',label:'Punti di forza veri',max:FIELD_MAX*2,rows:3,ph:'Solo fatti: forno a legna dal 1987, farine di mulini piemontesi, aperti anche la domenica'},
 {id:'contacts',label:'Orari e contatti (facoltativo)',max:FIELD_MAX,ph:'Es. mar-dom 7-19:30, tel. 011 555 1234, via Nizza 10'}];
const TONES=[['Cordiale','cordiale e vicino, dà del lei ma con calore'],['Professionale','professionale e preciso'],['Essenziale','essenziale e diretto, frasi brevi'],['Elegante','elegante e misurato']];
// Google Business Profile limits, in characters (spaces included). hard: over it Google refuses the text (trimmed and
// flagged); soft: a recommendation (flagged only).
const LIMITS=Object.freeze({description:750,keywordWithin:250,secondary:9,serviceName:120,serviceDescription:300,services:20,
 qa:10,question:150,answer:400,postTitle:58,post:1500,postSoft:300,photos:12,photo:160,reply:4096,replyWords:120});
const POST_TYPES=Object.freeze([['offerta','Offerta'],['novita','Novità'],['evento','Evento'],['aggiornamento','Aggiornamento']]);
// The buttons a Google post may carry.
const CTAS=Object.freeze(['Prenota','Ordina online','Acquista','Scopri di più','Iscriviti','Chiama ora']);
const ANGLES=Object.freeze({vicinanza:'Vicinanza',competenza:'Competenza',esperienza:'Esperienza'});
function normalize(answers){const a=answers||{};return {tone:TONES.some(t=>t[0]===a.tone)?a.tone:'Cordiale'}}
// The project profile (RadixAgents.profileFor) → what the fields start from.
function prefill(project){const p=project||{},kind=clean(p.kind);
 return {kind:/^progetto|personal brand/i.test(kind)?'':kind.slice(0,120),area:'',services:'',strengths:clean(p.positioning).slice(0,FIELD_MAX),contacts:''}}
function validate(values){const v=values||{};for(const f of FIELDS)if(f.need&&clean(v[f.id]).length<f.need)throw Error('Compila «'+f.label.replace(/ \(facoltativo\)$/,'')+'».');return true}
// Confirmed facts of the project plus the client's facts sheet (the same lines the Studio Creatività uses).
function factsText(project,profile){const A=adLib();if(A&&typeof A.factsText==='function')return A.factsText(project,profile);
 const C=copyLib();return (C?C.projectFacts(project):[]).join('\n').slice(0,FACTS_MAX)}
// What the numbers and claims are checked against: everything the person wrote plus the facts.
const inputText=values=>{const v=values||{};return FIELDS.map(f=>String(v[f.id]||'')).concat([v.facts||'']).join('\n')};

// ---- description rules (Google: no links, phone numbers or e-mails; no offers or prices; no all-caps; ≤ 750) ----
const EMAIL=/[^\s@()<>,;:]+@[^\s@()<>,;:]+\.[a-z]{2,}/gi;
const URL_RE=/\b(?:https?:\/\/|www\.)[^\s)>,;]+|\b[a-z0-9][a-z0-9-]*\.(?:it|com|net|org|eu|info|biz|shop|store|online|site)\b(?:\/[^\s)>,;]*)?/gi;
const PHONE=/(?:\+|00)?\d[\d .\/-]{5,}\d/g;
const isPhone=s=>s.replace(/\D/g,'').length>=8;
const PROMO=/\bscont[oi]\b|\bscontat[oaie]\b|\bpromo(?:zion[ei])?\b|\bofferta\b|\bofferte\b|\d+\s?%|€|\beuro\b|\bprezz[oi]\b|\bgratis\b|\bsaldi\b|\bcoupon\b/i;
const EMOJI=/\p{Extended_Pictographic}/u;
const STOP=new Set('il lo la i gli le un uno una di a da in con su per tra fra e ed o del della dei delle degli al alla ai alle nel nella sul sulla che chi come anche dove zona quartiere centro citta'.split(' '));
const keywordsOf=s=>norm(s).split(' ').filter(w=>w.length>=4&&!STOP.has(w));
// The words that should open the description: the type of business (any significant word, by its stem).
function hasKeyword(text,kind,within){const head=norm([...String(text||'')].slice(0,within||LIMITS.keywordWithin).join('')),ks=keywordsOf(kind);
 return !ks.length||ks.some(k=>head.includes(k.slice(0,Math.max(4,k.length-2))))}
// The description cleaned for Google: a sentence with a link, an e-mail or a phone number goes away whole (it is almost
// always «chiamaci al…», «visita…»), and each contact removed is listed.
function contactsIn(t){const out=[];(t.match(EMAIL)||[]).forEach(m=>out.push({kind:'email',text:m}));const noMail=t.replace(EMAIL,' ');
 (noMail.match(URL_RE)||[]).forEach(m=>out.push({kind:'url',text:m}));(noMail.replace(URL_RE,' ').match(PHONE)||[]).filter(isPhone).forEach(m=>out.push({kind:'phone',text:m.trim()}));return out}
function sanitizeDescription(text){const removed=[];const t=block(text).replace(/<[^>]{1,80}>/g,'');
 const kept=t.split('\n').map(par=>{if(!par.trim())return '';const out=par.split(/(?<=[.!?…])\s+/).filter(sent=>{const c=contactsIn(sent);if(!c.length)return true;removed.push(...c);return false}).join(' ');return out.trim()?out:null}).filter(x=>x!==null).join('\n');
 return {text:block(kept),removed}}
// Over a hard limit: cut at the last sentence that fits when it keeps most of the text, else at the last whole word.
function fit(s,max){const t=[...String(s)];if(t.length<=max)return String(s);const cut=t.slice(0,max).join('');
 const end=Math.max(...['. ','! ','? ','.\n'].map(p=>cut.lastIndexOf(p)));if(end>=max*.6)return cut.slice(0,end+1).trim();
 const sp=cut.lastIndexOf(' ');return (sp>max/2?cut.slice(0,sp):cut).replace(/[\s,;:–—-]+$/,'')}
// The rules of the description, on a text already sanitized. Returns issues; the text itself is not changed here.
function descriptionIssues(text,{kind,area}={}){const out=[],t=String(text||''),n=chars(t);
 if(n>LIMITS.description)out.push({kind:'length',where:'Descrizione',msg:'Descrizione di '+n+' caratteri: Google ne accetta al massimo '+LIMITS.description+'.'});
 if(n&&n<250)out.push({kind:'rule',where:'Descrizione',soft:true,msg:'Descrizione breve ('+n+' caratteri): con 500-750 caratteri racconti meglio servizi e zona.'});
 if(n&&!hasKeyword(t,kind))out.push({kind:'rule',where:'Descrizione',msg:'Il tipo di attività («'+clean(kind)+'») non compare nei primi 250 caratteri: mettilo all’inizio.'});
 if(n&&clean(area)&&!keywordsOf(area).slice(0,1).every(k=>norm(t).includes(k.slice(0,Math.max(4,k.length-2)))))out.push({kind:'rule',where:'Descrizione',soft:true,msg:'La zona («'+clean(area).slice(0,40)+'») non compare nella descrizione.'});
 if(EMAIL.test(t)){out.push({kind:'rule',where:'Descrizione',msg:'Niente e-mail nella descrizione: Google la rifiuta.'})}EMAIL.lastIndex=0;
 if(URL_RE.test(t)){out.push({kind:'rule',where:'Descrizione',msg:'Niente link nella descrizione: il sito ha il suo campo nella scheda.'})}URL_RE.lastIndex=0;
 if((t.match(PHONE)||[]).some(isPhone))out.push({kind:'rule',where:'Descrizione',msg:'Niente numeri di telefono nella descrizione: il telefono ha il suo campo.'});
 if(PROMO.test(t))out.push({kind:'rule',where:'Descrizione',msg:'Niente offerte, sconti o prezzi nella descrizione: mettili in un post «Offerta».'});
 if((t.match(/\b[A-ZÀ-Ý]{4,}\b/g)||[]).length>=2)out.push({kind:'rule',where:'Descrizione',msg:'Parole tutte in maiuscolo: Google le sconsiglia.'});
 if(EMOJI.test(t))out.push({kind:'rule',where:'Descrizione',msg:'Niente emoji nella descrizione.'});
 return out}

// ---- A) the AI call ----
function listingPrompt(answers,values={}){const a=normalize(answers),v=values||{},p=v.project||{};validate(v);
 const L=[],f=id=>FIELDS.find(x=>x.id===id),val=id=>(f(id).rows?block(v[id]):clean(v[id])).slice(0,f(id).max);
 L.push('Prepara '+COUNT+' versioni della scheda Google Business Profile'+(p.name?' di «'+clean(p.name).slice(0,80)+'»':'')+'. Le tre versioni devono essere davvero diverse:',
  '1) vicinanza: l’attività del quartiere, di fiducia, le persone;','2) competenza: il mestiere, come si lavora, la qualità;','3) esperienza: cosa trova e cosa ottiene chi arriva.');
 L.push('Tipo di attività: «'+val('kind')+'».','Città o zona servita: «'+val('area')+'».','Servizi principali:\n'+val('services'));
 if(clean(v.strengths))L.push('Punti di forza veri (i soli fatti da usare oltre a quelli confermati):\n'+val('strengths'));
 if(clean(v.contacts))L.push('Orari e contatti: «'+val('contacts')+'» (usali solo nelle risposte alle domande, mai nella descrizione).');
 L.push('Tono: '+TONES.find(t=>t[0]===a.tone)[1]+'.');
 const facts=clean(v.facts)?block(v.facts).slice(0,FACTS_MAX):'';if(facts)L.push('Fatti confermati del progetto:\n'+facts);
 L.push('Regole di Google e di qualità:',
  '- descrizione: massimo 750 caratteri spazi compresi (contali), il tipo di attività e la zona nei primi 250; niente link, numeri di telefono, e-mail, prezzi, sconti, offerte, maiuscole gridate o emoji;',
  '- categorie: una principale e fino a 9 secondarie, con i nomi in italiano dell’elenco delle categorie di Google (es. «Panetteria», «Pasticceria»); solo quelle che descrivono davvero l’attività;',
  '- servizi: dai servizi scritti qui, con una descrizione di massimo 300 caratteri ciascuno;',
  '- 10 domande che i clienti fanno davvero, con risposte brevi (massimo 400 caratteri) e concrete;',
  '- 4 post: offerta, novità, evento, aggiornamento; ognuno con un titolo (massimo 58 caratteri), un testo di 100-300 caratteri e un pulsante tra: '+CTAS.join(', ')+';',
  '- un’offerta, un prezzo, una data o un evento si scrivono solo se sono qui; altrimenti scrivi tra parentesi quadre cosa inserire, per esempio «[offerta da inserire]» o «[data dell’evento]»;',
  '- foto: da 8 a 12 foto da caricare, ognuna una frase concreta (esterno con l’insegna, interno, squadra, prodotti, al lavoro);',
  '- usa solo i fatti scritti qui e quelli confermati: non inventare numeri, anni, premi, certificazioni, recensioni, primati o garanzie;',
  '- italiano semplice, niente emoji.');
 const shape={nome:'2-4 parole',angolo:'vicinanza | competenza | esperienza',descrizione:'max 750 caratteri',categoria_principale:'categoria di Google',categorie_secondarie:['fino a 9'],
  servizi:[{nome:'nome del servizio',descrizione:'max 300 caratteri'}],domande:[{domanda:'',risposta:'max 400 caratteri'}],
  post:[{tipo:'offerta | novita | evento | aggiornamento',titolo:'max 58 caratteri',testo:'100-300 caratteri',pulsante:CTAS.join(' | ')}],foto:['una frase per foto']};
 L.push('Rispondi solo con JSON valido, senza testo prima o dopo, con 3 oggetti in "versioni":\n{"versioni":['+JSON.stringify(shape)+',{…},{…}]}');
 return L.join('\n')}

// ---- A) parsing and checks ----
function parseJson(text){const A=adLib();if(A&&typeof A.parseJson==='function')return A.parseJson(text);
 const raw=String(text||''),s=raw.search(/[[{]/),e=Math.max(raw.lastIndexOf('}'),raw.lastIndexOf(']'));if(s<0||e<=s)return null;try{return JSON.parse(raw.slice(s,e+1))}catch(err){return null}}
function pickKey(o,keys){if(!o||typeof o!=='object'||Array.isArray(o))return undefined;const ks=Object.keys(o);
 for(const k of keys){const hit=ks.find(x=>norm(x).replace(/ /g,'_')===k);if(hit!==undefined)return o[hit]}return undefined}
const strip=s=>clean(String(s==null?'':s).replace(/^\s*(?:[-*•–·]|\d{1,2}[.)])\s+/,'').replace(/^[«"“]|[»"”]$/g,''));
const listOf=v=>Array.isArray(v)?v:typeof v==='string'?v.split('\n'):[];
const angleOf=(v,n)=>{const x=norm(v);return Object.keys(ANGLES).find(k=>x.startsWith(k.slice(0,5)))||Object.keys(ANGLES)[(n-1)%3]};
const typeOf=v=>{const x=norm(v);return (POST_TYPES.find(([k])=>x.startsWith(k.slice(0,4)))||[''])[0]};
function ctaOf(v){const x=norm(v);if(!x)return 'Scopri di più';return CTAS.find(c=>norm(c)===x)||CTAS.find(c=>x.includes(norm(c).split(' ')[0]))||'Scopri di più'}
function version(x,n){if(!x||typeof x!=='object'||Array.isArray(x))return null;
 const v={id:'v'+n,name:clean(pickKey(x,['nome','name'])).replace(/[«»"]/g,'').slice(0,60)||'Versione '+n,angle:angleOf(pickKey(x,['angolo','angle','tipo']),n),
  description:block(pickKey(x,['descrizione','description'])||''),primary:strip(pickKey(x,['categoria_principale','primary_category','categoria','primary'])).slice(0,100),
  secondary:listOf(pickKey(x,['categorie_secondarie','categorie_aggiuntive','secondary_categories','categorie','secondary'])).map(strip).filter(t=>t.length>1),
  services:listOf(pickKey(x,['servizi','services'])).map(s=>typeof s==='string'?{name:strip(s.split(/\s[–—:-]\s/)[0]),description:strip(s.split(/\s[–—:-]\s/).slice(1).join(' – '))}:{name:strip(pickKey(s,['nome','name','servizio','titolo'])),description:strip(pickKey(s,['descrizione','description']))}).filter(s=>s.name),
  qa:listOf(pickKey(x,['domande','faq','qa','domande_e_risposte'])).map(q=>({q:strip(pickKey(q,['domanda','question','q'])),a:clean(pickKey(q,['risposta','answer','a']))})).filter(q=>q.q&&q.a),
  posts:listOf(pickKey(x,['post','posts'])).map(p=>p&&typeof p==='object'?{type:typeOf(pickKey(p,['tipo','type'])),title:strip(pickKey(p,['titolo','title'])),text:block(pickKey(p,['testo','text','corpo'])||''),cta:ctaOf(pickKey(p,['pulsante','cta','button']))}:null).filter(p=>p&&p.text),
  photos:listOf(pickKey(x,['foto','photos','checklist_foto'])).map(strip).filter(t=>t.length>2)};
 if(!v.description)return null;
 // one post per type, in order; a post without a known type takes the first missing one
 const byType={};v.posts.forEach(p=>{if(p.type&&!byType[p.type])byType[p.type]=p});v.posts.filter(p=>!p.type||byType[p.type]!==p).forEach(p=>{const free=POST_TYPES.find(([k])=>!byType[k]);if(free){p.type=free[0];byType[free[0]]=p}});
 v.posts=POST_TYPES.map(([k])=>byType[k]).filter(Boolean);
 return v}
// The texts of a version (for the grounding check). The contacts the person wrote are in the input, so Q&A may use them.
const versionText=v=>[v.description,...v.services.flatMap(s=>[s.name,s.description]),...v.qa.flatMap(q=>[q.q,q.a]),...v.posts.flatMap(p=>[p.title,p.text])].filter(Boolean).join('\n');
// Numbers and claims (free, guaranteed, the best, a deadline…) not in the brief or the facts: the ad studio's check.
function groundIssues(v,input){const A=adLib();if(!A||typeof A.groundIssues!=='function')return [];
 return A.groundIssues({copy:{all:{t:versionText(v)}}},input).map(i=>({kind:i.kind,where:'Testi',text:i.text,msg:i.kind==='number'?'Il numero «'+i.text+'» non compare nel brief né nei fatti: verificalo o toglilo.':'Promessa da verificare: '+i.text+'. Nel brief non c’è: toglila o confermala.'}))}
const TODO=/\[[^\]\n]{3,80}\]/g;
// Every limit and rule of a version. Hard limits are trimmed (and listed); the description loses links, phones, e-mails.
function checkVersion(v,{kind,area,input}={}){const out=[];
 const s=sanitizeDescription(v.description);v.description=s.text;
 s.removed.forEach(r=>out.push({kind:'rule',where:'Descrizione',msg:(r.kind==='url'?'Tolto il link':r.kind==='email'?'Tolta l’e-mail':'Tolto il telefono')+' «'+r.text+'»: Google non li accetta nella descrizione.'}));
 if(chars(v.description)>LIMITS.description){const n=chars(v.description);v.description=fit(v.description,LIMITS.description);out.push({kind:'length',where:'Descrizione',msg:'Descrizione di '+n+' caratteri: accorciata a '+chars(v.description)+' (massimo '+LIMITS.description+'). Rileggila.'})}
 out.push(...descriptionIssues(v.description,{kind,area}).filter(i=>i.kind!=='length'&&!/^Niente (e-mail|link|numeri di telefono)/.test(i.msg)));
 if(!v.primary)out.push({kind:'rule',where:'Categorie',msg:'Manca la categoria principale: sceglila nell’elenco di Google.'});
 v.secondary=v.secondary.filter(c=>norm(c)!==norm(v.primary)).filter((c,i,a)=>a.findIndex(x=>norm(x)===norm(c))===i);
 if(v.secondary.length>LIMITS.secondary){out.push({kind:'length',where:'Categorie',msg:v.secondary.length+' categorie secondarie: Google ne accetta 9, tenute le prime 9.'});v.secondary=v.secondary.slice(0,LIMITS.secondary)}
 if(v.services.length>LIMITS.services)v.services=v.services.slice(0,LIMITS.services);
 v.services.forEach(x=>{if(chars(x.name)>LIMITS.serviceName){x.name=fit(x.name,LIMITS.serviceName);out.push({kind:'length',where:'Servizi',msg:'Nome del servizio accorciato a '+LIMITS.serviceName+' caratteri: «'+x.name+'».'})}
  if(chars(x.description)>LIMITS.serviceDescription){const n=chars(x.description);x.description=fit(x.description,LIMITS.serviceDescription);out.push({kind:'length',where:'Servizi',msg:'«'+x.name+'»: descrizione di '+n+' caratteri accorciata a '+LIMITS.serviceDescription+'.'})}});
 if(v.qa.length>LIMITS.qa)v.qa=v.qa.slice(0,LIMITS.qa);
 if(v.qa.length<LIMITS.qa)out.push({kind:'count',where:'Domande',soft:true,msg:'Sono arrivate '+v.qa.length+' domande su '+LIMITS.qa+'.'});
 v.qa.forEach((q,i)=>{if(chars(q.a)>LIMITS.answer)out.push({kind:'length',where:'Domande',soft:true,msg:'Risposta '+(i+1)+' di '+chars(q.a)+' caratteri: meglio sotto '+LIMITS.answer+'.'})});
 v.posts.forEach(p=>{const label=(POST_TYPES.find(t=>t[0]===p.type)||[,'Post'])[1];
  if(chars(p.title)>LIMITS.postTitle){p.title=fit(p.title,LIMITS.postTitle);out.push({kind:'length',where:'Post',msg:'Post «'+label+'»: titolo accorciato a '+LIMITS.postTitle+' caratteri.'})}
  if(chars(p.text)>LIMITS.post){p.text=fit(p.text,LIMITS.post);out.push({kind:'length',where:'Post',msg:'Post «'+label+'»: testo accorciato a '+LIMITS.post+' caratteri.'})}
  else if(chars(p.text)>LIMITS.postSoft)out.push({kind:'length',where:'Post',soft:true,msg:'Post «'+label+'»: '+chars(p.text)+' caratteri, nel riquadro se ne leggono circa 300.'});
  if(!p.cta||!CTAS.includes(p.cta))p.cta='Scopri di più';
  if((p.type==='offerta'||p.type==='evento')&&!p.title)out.push({kind:'rule',where:'Post',msg:'Post «'+label+'»: serve un titolo (Google lo chiede per offerte ed eventi).'})});
 const missing=POST_TYPES.filter(([k])=>!v.posts.some(p=>p.type===k)).map(t=>t[1]);if(missing.length)out.push({kind:'count',where:'Post',soft:true,msg:'Manca il post: '+missing.join(', ')+'.'});
 v.photos=v.photos.slice(0,LIMITS.photos).map(t=>chars(t)>LIMITS.photo?fit(t,LIMITS.photo):t);
 const todos=[...new Set((versionText(v).match(TODO)||[]))];todos.forEach(t=>out.push({kind:'todo',where:'Da completare',msg:'Da completare: '+t+'.'}));
 out.push(...groundIssues(v,input));
 v.issues=out;return v}
// The reply → up to three versions; [] when nothing usable is there. ctx: {kind, area, input}.
function parseListing(text,ctx={}){const d=parseJson(text);if(!d)return [];
 const list=Array.isArray(d)?d:d.versioni||d.versions||d.proposte||d.schede||[],out=[];
 (Array.isArray(list)?list:[]).forEach(x=>{if(out.length>=COUNT)return;const v=version(x,out.length+1);if(v)out.push(checkVersion(v,ctx))});return out}
// After an edit: the rules again on a copy of the edited version.
function recheck(v,ctx){return checkVersion(v,ctx)}
const blocking=issues=>(issues||[]).filter(i=>!i.soft);

// ---- B) the reviews: import, sentiment ----
const HEAD={author:['autore','nome','name','author','reviewer','cliente','utente'],stars:['stelle','voto','rating','valutazione','stars','punteggio','star_rating'],
 text:['testo','recensione','review','commento','comment','text','testo_recensione'],date:['data','date','creata','created']};
const headerKey=(h,keys)=>keys.includes(norm(h).replace(/ /g,'_'));
// «★★★★☆», «4 stelle», «4/5», «4,0», «voto: 4», «4» → 4; null when none.
function starsOf(v){const s=String(v==null?'':v).trim();if(!s)return null;const full=(s.match(/★/g)||[]).length;if(full)return Math.min(5,full);
 const m=/(?:^|\D)([1-5])(?:[.,]0)?\s*(?:\/\s*5|stell[ae]|su 5|★)?(?:\D|$)/i.exec(s);return m?Number(m[1]):null}
function reviewId(author,text){let h=2166136261;for(const ch of String(author)+'|'+String(text))h=Math.imul(h^ch.charCodeAt(0),16777619);return 'r'+(h>>>0).toString(36)}
function review(author,stars,text,date){const t=block(text).slice(0,4000);if(t.length<2&&stars==null)return null;
 return {id:reviewId(author,t),author:clean(author).slice(0,80),stars:stars==null?null:stars,text:t,date:clean(date).slice(0,20)}}
// A CSV (a header with a review-text column) or plain text: one review per block (blank line between them), the stars
// as ★ or «4 stelle» / «4/5», the author on the first line «Mario R.:» or alone on a short line.
function looksCsv(text){const first=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/,1)[0]||'';return /[,;\t]/.test(first)&&first.split(/[,;\t]/).some(h=>headerKey(h,HEAD.text))}
function parseReviews(text){const raw=String(text||'').replace(/\r/g,'').replace(/^\uFEFF/,'');if(!raw.trim())return [];let out=[];
 if(looksCsv(raw)){const C=csvLib();const p=C?C.parse(raw):null;if(p){const col=k=>p.headers.find(h=>headerKey(h,HEAD[k]));const ca=col('author'),cs=col('stars'),ct=col('text'),cd=col('date');
   out=p.rows.map(r=>review(ca?r[ca]:'',cs?starsOf(r[cs]):null,ct?r[ct]:'',cd?r[cd]:'')).filter(Boolean)}}
 else{const blocks=raw.split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  out=blocks.map(b=>{let lines=b.split('\n').map(l=>l.trim()).filter(Boolean),author='',stars=null,date='';
   const starLine=lines.findIndex(l=>/★|☆|^\s*(?:voto|stelle|valutazione)\s*[:=]|^\s*[1-5]\s*(?:\/\s*5|stell[ae])\s*$/i.test(l)&&l.length<=40);
   if(starLine>=0){stars=starsOf(lines[starLine]);const rest=lines[starLine].replace(/[★☆]+/g,'').replace(/^\s*(?:voto|stelle|valutazione)\s*[:=]\s*/i,'').replace(/\b[1-5]\s*(?:\/\s*5|stell[ae])\b/i,'').replace(/^[\s·|,–—-]+|[\s·|,–—-]+$/g,'');lines.splice(starLine,1);if(rest&&/\d/.test(rest))date=rest;else if(rest&&!author&&rest.length<=40)author=rest}
   const inline=/^([A-ZÀ-Ý][\p{L}'’.]*(?:\s+[A-ZÀ-Ý][\p{L}'’.]*){0,2})\s*[:–—]\s+(.+)$/u.exec(lines[0]||'');
   if(!author&&inline){author=inline[1];lines[0]=inline[2]}
   else if(!author&&lines.length>1&&lines[0].length<=40&&/^[A-ZÀ-Ý][\p{L}'’.]*(?:\s+[A-ZÀ-Ý][\p{L}'’.]*){0,3}$/u.test(lines[0]))author=lines.shift();
   if(stars==null){const m=/^\s*\(?([1-5])\s*(?:\/\s*5|stell[ae])\)?\s*[-–—:·]?\s*/i.exec(lines[0]||'');if(m){stars=Number(m[1]);lines[0]=lines[0].slice(m[0].length)}}
   return review(author,stars,lines.join('\n'),date)}).filter(Boolean)}
 const seen=new Set();return out.filter(r=>!seen.has(r.id)&&seen.add(r.id))}
const NEG=['pessim','scortes','maleducat','sgarbat','sporc','lentissim','attesa','aspettato','delus','deludent','mai piu','terribil','orribil','carissim','troppo car','non consiglio','sconsiglio','problema','rott','sbagliat','purtroppo','lamentel','rimborso','truffa','vergogn','ignorat','freddo','scadent','insufficient','arrabbiat','non torner','niente di che','nulla di speciale','peccato','disorganizzat','caos','scarso','scarsa','male'];
const POS=['ottim','eccellent','perfett','consiglio','consigliat','gentil','cordial','bravissim','fantastic','meraviglios','professional','buonissim','cortes','disponibil','torner','grazie','super','bellissim','accoglient','squisit','top','felic','soddisfatt','fiducia','puntual','competent'];
const SENSITIVE=['salute','malatti','diagnos','terapi','patologi','farmac','intervento','operazion','gravidanz','incinta','allergi','intolleranz','celiac','diabet','depression','ansia','psicolog','paziente','ricover','tumor','cancro','disabil','handicap','religio','sindacat','orientamento sessuale'];
const GRAVE=['avvocat','denunc','querel','intossicaz','polizia','carabinier','asl','nas ','discrimin','aggress','molest','minacc','furto','rubat','razzis','ospedale','pronto soccorso'];
// A word counts from its start: «male» is not in «normale», «top» is not in «stop».
const hits=(text,list)=>{const t=' '+norm(text)+' ';return list.filter(w=>t.includes(' '+w))};
// Sentiment, here and for free: the stars first (1-2 negativa, 3 mista, 4-5 positiva), the words when there are no
// stars or when they disagree. flags: sensibile (health or special-category data in the review), grave (legal, safety).
function sentiment(r){const t=norm(r&&r.text).replace(/\bnon consiglio\b/g,'sconsiglio').replace(/\bnon (?:e|era|sono|erano) (?:buon|ottim|gentil|cortes)\w*/g,'scarso');
 const neg=hits(t,NEG).length,pos=hits(t,POS.filter(w=>!(w==='consiglio'&&t.includes('sconsiglio')))).length,s=r&&r.stars;let label;
 if(s!=null){label=s<=2?'negativa':s===3?'mista':'positiva';if(s>=4&&neg>=2&&neg>=pos)label='mista';if(s<=2&&pos>=3&&neg===0)label='mista'}
 else label=neg>pos?(pos?'mista':'negativa'):pos>neg?(neg?'mista':'positiva'):'mista';
 const flags=[];if(hits(r&&r.text,SENSITIVE).length)flags.push('sensibile');if(hits(r&&r.text,GRAVE).length)flags.push('grave');
 return {label,score:pos-neg,flags}}
const SENTIMENTS=Object.freeze({positiva:'Positiva',mista:'Mista',negativa:'Negativa'});
// Only the first name goes to the AI and into the saved record (GDPR: data minimisation).
const firstName=a=>{const p=clean(a).split(' ').filter(Boolean);return p.length?p[0].replace(/[.,:]$/,''):''};
const shortName=a=>{const p=clean(a).split(' ').filter(Boolean);return p.length>1?p[0]+' '+p[1][0].toUpperCase()+'.':p[0]||''};

// ---- B) the AI call ----
const STYLES=Object.freeze([['warm','Calda','calda'],['concise','Concisa','concisa'],['solution','Soluzione','soluzione']]);
function repliesPrompt(reviews,values={}){const list=(reviews||[]).slice(0,MAX_REVIEWS),v=values||{},a=normalize(v),business=clean(v.business).slice(0,100);
 if(!list.length)throw Error('Incolla almeno una recensione.');if(!business)throw Error('Scrivi il nome dell’attività per la firma.');
 const L=[];L.push('Scrivi le risposte pubbliche di «'+business+'»'+(clean(v.kind)?' ('+clean(v.kind).slice(0,120)+')':'')+' a '+list.length+' recensioni su Google. Per ogni recensione 3 risposte diverse:',
  '- calda: grata e personale, cita un dettaglio della recensione;','- concisa: massimo 40 parole;','- soluzione: concreta, dice cosa fate o cosa può fare la persona (per le positive: un invito a tornare o un consiglio utile).');
 L.push('Tono: '+TONES.find(t=>t[0]===a.tone)[1]+'.');
 if(clean(v.notes))L.push('Cosa è successo davvero e cosa possiamo dire (solo questi fatti):\n'+block(v.notes).slice(0,FIELD_MAX*2));
 if(clean(v.contacts))L.push('Contatti per spostare la conversazione in privato: «'+clean(v.contacts).slice(0,FIELD_MAX)+'». Non usarne altri.');
 else L.push('Nessun contatto indicato: per spostare la conversazione in privato scrivi «ci scriva in privato» o «ci contatti in sede», senza inventare numeri o indirizzi.');
 L.push('Regole:','- rispondi nella lingua della recensione;','- chiama la persona solo con il nome di battesimo, se c’è; mai il cognome;',
  '- non ripetere dati personali, di salute, di ordini, prenotazioni o visite; non confermare che la persona sia cliente o paziente se l’attività è sanitaria;',
  '- non offrire sconti, buoni, omaggi, regali o altri incentivi e non chiedere di modificare o togliere la recensione;',
  '- recensioni negative o miste: ringrazia, scusati per l’esperienza senza ammettere colpe legali, non discutere i fatti in pubblico, invita a proseguire in privato;',
  '- non inventare fatti, orari, nomi o promesse;','- massimo 120 parole per risposta; niente emoji, niente hashtag;','- firma ogni risposta con «'+business+'».');
 L.push('Le recensioni:');
 list.forEach((r,i)=>{const s=sentiment(r);L.push((i+1)+') '+(firstName(r.author)?'Nome: '+firstName(r.author)+'. ':'')+(r.stars!=null?r.stars+' stelle su 5. ':'')+'Tono rilevato: '+s.label+'.\n«'+clean(r.text).slice(0,1500)+'»')});
 L.push('Rispondi solo con JSON valido, senza testo prima o dopo:\n{"risposte":[{"n":1,"calda":"…","concisa":"…","soluzione":"…"}, …]}');
 return L.join('\n')}

// ---- B) the lint of a reply ----
const INCENTIVE=/\bscont[oi]\b|\bbuon[oi] (?:sconto|regalo|acquisto|omaggio)\b|\bcoupon\b|\bomaggi[oa]?\b|\bin omaggio\b|\bregal[oi]\b|\bcodice promo|\bin cambio\b|\bgratis\b|\bgratuit[oaie]\b|\bvoucher\b|\bcashback\b/i;
const ASK_CHANGE=/\b(?:modific|cambi|togli|rimuov|aggiorn|ritir|cancell)\w*\s+(?:la\s+|questa\s+|sua\s+|tua\s+)*recensione\b|\b(?:5|cinque) stelle\b/i;
const APOLOGY=/\bscus|\bdispiac|\brammaric|\bsorry\b|\bapolog/i;
const OFFLINE=/\bcontatt|\bscriv|\bchiam|\btelefon|\be-?mail\b|\bin privato\b|\bdi persona\b|\bpassare\b|\bmessaggio\b|\bcontact|\bwrite to us|\bcall us/i;
const LEGAL=/(?:^|[\s,.;:!?])(?:è|e') (?:stata )?(?:tutta )?colpa nostra\b|\bci assumiamo (?:ogni|tutta la|la piena) responsabilit|\bammettiamo\b/i;
// Words of the review that are personal data if repeated: the surname, health and special-category words, e-mails and
// numbers (orders, bookings, phones) that are not in what the person wrote.
function lintReply(text,r,ctx={}){const out=[],t=String(text||''),n=chars(t),sent=ctx.sentiment||sentiment(r||{}).label,input=String(ctx.input||'');
 if(!clean(t))return [{kind:'empty',msg:'Risposta vuota.'}];
 if(n>LIMITS.reply)out.push({kind:'length',msg:'Oltre '+LIMITS.reply+' caratteri: Google non la accetta.'});
 else if(words(t)>LIMITS.replyWords)out.push({kind:'length',soft:true,msg:words(t)+' parole: meglio restare sotto le 120.'});
 if(INCENTIVE.test(t))out.push({kind:'incentive',msg:'Incentivo (sconto, buono, omaggio): Google vieta di offrirli nelle recensioni. Toglilo.'});
 if(ASK_CHANGE.test(t))out.push({kind:'incentive',msg:'Non chiedere di modificare o togliere la recensione.'});
 const parts=clean(r&&r.author).split(' ').filter(Boolean).slice(1).map(x=>x.replace(/[.,]/g,'')).filter(x=>x.length>=3);
 if(parts.some(p=>new RegExp('\\b'+p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(t)))out.push({kind:'personal',msg:'Contiene il cognome della persona: usa solo il nome.'});
 const health=hits(t,SENSITIVE).filter(w=>w!=='paziente'||/\bnostr[oa] pazient/i.test(t));const echoed=health.filter(w=>hits(r&&r.text,[w]).length||w==='paziente');
 if(echoed.length)out.push({kind:'personal',msg:'Ripete dati sulla salute o personali della recensione («'+echoed[0]+'…»): toglili, anche se li ha scritti il cliente.'});
 const known=norm(input+' '+(ctx.contacts||''));
 const mails=(t.match(EMAIL)||[]).filter(m=>!known.includes(norm(m)));EMAIL.lastIndex=0;
 const phones=(t.match(PHONE)||[]).filter(m=>isPhone(m)&&!norm(input+' '+(ctx.contacts||'')).replace(/ /g,'').includes(m.replace(/\D/g,'')));
 if(mails.length||phones.length)out.push({kind:'personal',msg:'Contatto non presente nei tuoi dati («'+(mails[0]||phones[0]).trim()+'»): usa solo quelli che hai scritto.'});
 if(sent==='negativa'||sent==='mista'){if(!APOLOGY.test(t))out.push({kind:'rule',soft:sent==='mista',msg:'Manca una frase di scuse per l’esperienza.'});
  if(sent==='negativa'&&!OFFLINE.test(t))out.push({kind:'rule',msg:'Manca l’invito a proseguire in privato (telefono, e-mail o in sede).'})}
 if(LEGAL.test(t))out.push({kind:'rule',msg:'Ammissione di colpa: scusati per l’esperienza senza ammettere responsabilità legali.'});
 if(ctx.business&&!norm(t).includes(norm(ctx.business)))out.push({kind:'rule',soft:true,msg:'Manca la firma «'+clean(ctx.business)+'».'});
 return out}
// The signature, if missing; the hard limit of Google, if over.
function finishReply(text,business){let t=block(text);const b=clean(business);if(b&&t&&!norm(t).includes(norm(b)))t+='\n\n'+b;
 if(chars(t)>LIMITS.reply)t=fit(t,LIMITS.reply-chars(b)-2)+(b?'\n\n'+b:'');return t}
// The reply → one entry per review: {review, sentiment, options:{warm,concise,solution}, issues:{…}}.
function parseReplies(text,reviews,ctx={}){const d=parseJson(text),list=(reviews||[]).slice(0,MAX_REVIEWS);if(!d)return [];
 const raw=Array.isArray(d)?d:d.risposte||d.replies||d.answers||[];if(!Array.isArray(raw)||!raw.length)return [];
 return list.map((r,i)=>{const x=raw.find(o=>o&&Number(pickKey(o,['n','numero','id']))===i+1)||raw[i];if(!x||typeof x!=='object')return null;
  const s=sentiment(r),options={},issues={};
  for(const [k,,key] of STYLES){const v=pickKey(x,[key,k,key==='soluzione'?'orientata_alla_soluzione':key]);const t=finishReply(typeof v==='string'?v:'',ctx.business);if(t){options[k]=t;issues[k]=lintReply(t,r,{...ctx,sentiment:s.label})}}
  if(!Object.keys(options).length)return null;
  return {review:r,sentiment:s.label,flags:s.flags,options,issues,chosen:Object.keys(options)[0]}}).filter(Boolean)}

// ---- files ----
const csvApi=()=>{const C=csvLib();if(C)return C;const safe=v=>{const s=v==null?'':String(v);return /^[=+\-@\t\r]/.test(s)?"'"+s:s};
 return {toCsv:(rows,cols)=>'\uFEFF'+[cols.map(c=>c.label).join(';'),...rows.map(r=>cols.map(c=>{const s=safe(typeof c.value==='function'?c.value(r):r[c.key]);return /[";\n\r,]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(';'))].join('\r\n'),parse:null}};
function listingTxt(v,{values,answers,date,brand}={}){const a=normalize(answers),day=date||new Date().toISOString().slice(0,10),L=[],x=values||{};
 L.push('SCHEDA GOOGLE · '+clean(brand||''),'Versione: '+v.name+' ('+ANGLES[v.angle]+') · Tono: '+a.tone+' · '+day,'Da copiare nel profilo su '+GOOGLE_URL+' (RADIX non pubblica su Google).','');
 L.push('DESCRIZIONE ('+chars(v.description)+'/'+LIMITS.description+')',v.description,'');
 L.push('CATEGORIE (scegli il nome identico nell’elenco di Google)','- Principale: '+(v.primary||'da scegliere'),...v.secondary.map(c=>'- Secondaria: '+c),'');
 L.push('SERVIZI',...v.services.map(s=>'- '+s.name+(s.description?': '+s.description:'')),'');
 L.push('DOMANDE E RISPOSTE',...v.qa.flatMap((q,i)=>[(i+1)+'. '+q.q,'   '+q.a]),'');
 L.push('POST',...v.posts.flatMap(p=>['['+(POST_TYPES.find(t=>t[0]===p.type)||[,'Post'])[1]+'] '+(p.title||''),p.text,'Pulsante: '+p.cta,'']));
 L.push('FOTO DA CARICARE',...v.photos.map(p=>'[ ] '+p),'');
 if(clean(x.contacts))L.push('ORARI E CONTATTI (nei campi della scheda, non nella descrizione)',clean(x.contacts),'');
 if(v.issues&&v.issues.length)L.push('DA CONTROLLARE',...v.issues.map(i=>'- '+i.msg),'');
 return L.join('\n')+'\n'}
function listingCsv(v){const rows=[];const add=(sezione,campo,testo,limite)=>rows.push({sezione,campo,testo,caratteri:chars(testo),limite:limite||''});
 add('Descrizione','Descrizione',v.description,LIMITS.description);add('Categorie','Principale',v.primary);v.secondary.forEach((c,i)=>add('Categorie','Secondaria '+(i+1),c));
 v.services.forEach(s=>add('Servizi',s.name,s.description,LIMITS.serviceDescription));v.qa.forEach((q,i)=>{add('Domande','Domanda '+(i+1),q.q);add('Domande','Risposta '+(i+1),q.a)});
 v.posts.forEach(p=>{const l=(POST_TYPES.find(t=>t[0]===p.type)||[,'Post'])[1];add('Post',l+' · titolo',p.title,LIMITS.postTitle);add('Post',l+' · testo',p.text,LIMITS.post);add('Post',l+' · pulsante',p.cta)});
 v.photos.forEach((p,i)=>add('Foto','Foto '+(i+1),p));
 return csvApi().toCsv(rows,['sezione','campo','testo','caratteri','limite'].map(k=>({key:k,label:k})))}
const REPLY_COLS=[{label:'autore',value:r=>shortName(r.review.author)},{label:'stelle',value:r=>r.review.stars==null?'':r.review.stars},{label:'sentimento',value:r=>r.sentiment},
 {label:'data',value:r=>r.review.date||''},{label:'recensione',value:r=>r.review.text},{label:'risposta scelta',value:r=>r.options[r.chosen]||''},
 {label:'calda',value:r=>r.options.warm||''},{label:'concisa',value:r=>r.options.concise||''},{label:'soluzione',value:r=>r.options.solution||''},
 {label:'da controllare',value:r=>(r.issues[r.chosen]||[]).map(i=>i.msg).join(' | ')}];
function repliesCsv(items){return csvApi().toCsv(items||[],REPLY_COLS)}
function repliesTxt(items,{brand,date}={}){const L=['RISPOSTE ALLE RECENSIONI · '+clean(brand||'')+' · '+(date||new Date().toISOString().slice(0,10)),'Da incollare nella scheda su '+GOOGLE_URL+' → Recensioni → Rispondi.',''];
 (items||[]).forEach((r,i)=>{L.push((i+1)+') '+(shortName(r.review.author)||'Anonimo')+(r.review.stars!=null?' · '+r.review.stars+'/5':'')+' · '+SENTIMENTS[r.sentiment],'Recensione: '+clean(r.review.text),'Risposta:',r.options[r.chosen]||'');
  const iss=r.issues[r.chosen]||[];if(iss.length)L.push('Da controllare: '+iss.map(x=>x.msg).join(' '));L.push('')});
 return L.join('\n')+'\n'}
const fileName=(kind,brand,ext)=>(kind==='listing'?'scheda-google-':'risposte-recensioni-')+(slug(brand)||'attivita')+'.'+ext;

// ---- C) saved in the project: the «agents» document, key gbp ----
const emptyStore=()=>({schemaVersion:1,listings:[],replies:[]});
function readStore(doc){const s=doc&&doc.gbp;if(!s||typeof s!=='object')return emptyStore();
 return {schemaVersion:1,listings:Array.isArray(s.listings)?s.listings.filter(x=>x&&typeof x==='object'):[],replies:Array.isArray(s.replies)?s.replies.filter(x=>x&&typeof x==='object'):[]}}
const copyOf=x=>JSON.parse(JSON.stringify(x));
function listingRecord(v,{values,answers,by,at}={}){const when=at||new Date().toISOString(),x=values||{};
 return {id:'gbp-'+when.replace(/\D/g,'').slice(0,14),at:when,by:clean(by).slice(0,80),tone:normalize(answers).tone,
  brief:Object.fromEntries(FIELDS.map(f=>[f.id,clean(x[f.id]).slice(0,f.max)])),
  version:{name:v.name,angle:v.angle,description:v.description,primary:v.primary,secondary:v.secondary.slice(),services:copyOf(v.services),qa:copyOf(v.qa),posts:copyOf(v.posts),photos:v.photos.slice()},
  issues:(v.issues||[]).map(i=>i.msg).slice(0,30)}}
// One record per review: the author shortened («Mario R.»), the chosen reply, when.
function replyRecords(items,{by,at}={}){const when=at||new Date().toISOString();
 return (items||[]).map(r=>({id:r.review.id,at:when,by:clean(by).slice(0,80),author:shortName(r.review.author),stars:r.review.stars,sentiment:r.sentiment,date:r.review.date||'',review:r.review.text.slice(0,2000),style:r.chosen,reply:r.options[r.chosen]||''}))}
function addListing(store,rec){const s=readStore({gbp:store});return {...s,listings:s.listings.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_LISTINGS)}}
function addReplies(store,recs){const s=readStore({gbp:store}),ids=new Set((recs||[]).map(r=>r.id));return {...s,replies:s.replies.filter(x=>!ids.has(x.id)).concat(recs||[]).slice(-MAX_REPLIES)}}
// Load, change only gbp, save; on a conflict (someone saved meanwhile) load again and retry, keeping every other key.
async function saveToProject(ws,projectId,change){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const doc=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await doc.load())||{},next=change(readStore(cur));
  try{await doc.save({...cur,schemaVersion:1,conversations:cur.conversations||{},gbp:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
const saveListing=(ws,projectId,rec)=>saveToProject(ws,projectId,s=>addListing(s,rec));
const saveReplies=(ws,projectId,recs)=>saveToProject(ws,projectId,s=>addReplies(s,recs));
const fromRecord=r=>{const v=copyOf(r.version||{});return {id:r.id,name:v.name||'Scheda salvata',angle:ANGLES[v.angle]?v.angle:'vicinanza',description:v.description||'',primary:v.primary||'',secondary:v.secondary||[],services:v.services||[],qa:v.qa||[],posts:v.posts||[],photos:v.photos||[],issues:[]}};

// ---- browser widget ----
const doc=()=>root.document;
let counter=0;
const el=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
function download(name,data,type){const a=el('a');a.href=root.URL.createObjectURL(new root.Blob([data],{type}));a.download=name;doc().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),2000)}
async function copyText(t){try{await root.navigator.clipboard.writeText(t);return true}catch(e){const ta=el('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';doc().body.append(ta);ta.select();let ok=false;try{ok=doc().execCommand('copy')}catch(x){}ta.remove();return ok}}
function copyButton(get,label){const b=button(label||'Copia','gb-copy');b.onclick=async()=>{const ok=await copyText(get());const was=label||'Copia';b.textContent=ok?'Copiato':'Copia non riuscita';b.dataset.done=String(ok);setTimeout(()=>{b.textContent=was;delete b.dataset.done},1600)};return b}
function counter_(n,max,soft){const s=el('span',n+'/'+max,'gb-count');s.dataset.state=n>max?'over':soft&&n>soft?'near':n>max*.9?'near':'ok';return s}
function issuesList(list,max){const ul=el('ul',undefined,'gb-issues');(list||[]).slice(0,max||8).forEach(i=>{const li=el('li',i.msg);li.dataset.soft=String(!!i.soft);ul.append(li)});if((list||[]).length>(max||8))ul.append(el('li','E altri '+(list.length-(max||8))+' punti.'));return ul}
function starsEl(n){const s=el('span',undefined,'gb-stars');if(n==null){s.textContent='senza stelle';s.dataset.none='true';return s}s.setAttribute('aria-label',n+' stelle su 5');for(let i=1;i<=5;i++){const x=el('i');x.dataset.on=String(i<=n);x.setAttribute('aria-hidden','true');s.append(x)}return s}
// A textarea as tall as its text (after it is in the page).
function autosize(t,min){const go=()=>{if(!t.isConnected)return;t.style.height='auto';t.style.height=Math.max(min||0,t.scrollHeight+2)+'px'};t.addEventListener('input',go);(root.requestAnimationFrame||setTimeout)(go);return go}
const pill=(text,state)=>{const p=el('span',text,'gb-pill');if(state)p.dataset.state=state;return p};
// ctx: {project (profile for the AI), profile (registry profile: brief), memoryScope, replyScope, projectId, workspace, agentsUrl, by}
function gbpStudio(ctx={}){const n=++counter,project=ctx.project||{},brand=clean(String(project.name||'').split(/\s[—–-]\s/)[0]).slice(0,100),wrap=el('div',undefined,'tool photo-studio gbp-studio');
 // the promise: RADIX writes, the person copies into the profile
 const note=el('p',undefined,'gb-note');note.append(el('span','RADIX prepara i testi, non pubblica su Google: li copi tu nella scheda. ','gb-note-text'));const gl=el('a','Apri Google Business Profile ↗');gl.href=GOOGLE_URL;gl.target='_blank';gl.rel='noopener noreferrer';note.append(gl);
 const tabs=el('div',undefined,'ss-tabs gb-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Scheda Google e recensioni');
 const tabA=button('Scheda attività'),tabB=button('Risposte alle recensioni'),paneA=el('div',undefined,'gb-pane'),paneB=el('div',undefined,'gb-pane');
 [[tabA,paneA],[tabB,paneB]].forEach(([t,p],i)=>{t.setAttribute('role','tab');t.id='gb-tab-'+n+'-'+i;p.id='gb-pane-'+n+'-'+i;p.setAttribute('role','tabpanel');p.setAttribute('aria-labelledby',t.id);t.setAttribute('aria-controls',p.id);tabs.append(t)});
 const show=k=>{[[tabA,paneA],[tabB,paneB]].forEach(([t,p],i)=>{t.setAttribute('aria-selected',String(i===k));t.tabIndex=i===k?0:-1;p.hidden=i!==k})};
 tabA.onclick=()=>show(0);tabB.onclick=()=>show(1);tabs.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const k=tabA.getAttribute('aria-selected')==='true'?1:0;show(k);(k?tabB:tabA).focus()}});
 const saved=el('div',undefined,'gb-saved');saved.hidden=true;
 wrap.append(tabs,note,saved,paneA,paneB);show(ctx.tab==='reviews'?1:0);
 listingPane(paneA,ctx,project,brand,n);reviewsPane(paneB,ctx,project,brand,n);
 // what is already saved in the project, to reopen without a new AI call
 wrap.loadSaved=async()=>{if(!ctx.workspace||!ctx.projectId)return;try{const s=readStore(await ctx.workspace.bind(ctx.projectId,'agents').load());if(!s.listings.length&&!s.replies.length){saved.hidden=true;return}
  saved.replaceChildren(el('span','Nel progetto','gb-saved-label'));
  s.listings.slice(-3).reverse().forEach(r=>{const b=button('Scheda «'+(r.version&&r.version.name||'salvata')+'» · '+new Date(r.at).toLocaleDateString('it-IT'),'gb-saved-item');b.onclick=()=>{show(0);paneA.reopen&&paneA.reopen(r)};saved.append(b)});
  if(s.replies.length)saved.append(el('span',s.replies.length+(s.replies.length===1?' risposta salvata':' risposte salvate'),'gb-saved-count'));
  saved.hidden=false}catch(e){}};
 paneA.onSaved=paneB.onSaved=()=>wrap.loadSaved();wrap.loadSaved();
 return wrap}

// A) the listing pane
function listingPane(pane,ctx,project,brand,n){const answers=normalize({}),pre=prefill(project),st={versions:[],chosen:null,values:{}};
 const steps=el('ol',undefined,'ps-steps');['Le domande','Scegli la versione','Rifinisci e copia'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const form=el('div',undefined,'ps-form'),grid=el('div',undefined,'gb-fields'),inputs={};
 FIELDS.forEach(f=>{const l=el('label',undefined,'gb-field'+(f.rows?' gb-wide-field':'')),top=el('span',undefined,'gb-field-top'),inp=el(f.rows?'textarea':'input');if(f.rows)inp.rows=f.rows;else inp.type='text';
  inp.maxLength=f.max;inp.placeholder=f.ph;inp.value=pre[f.id]||'';inp.name='gb-'+f.id+'-'+n;inputs[f.id]=inp;if(f.rows)autosize(inp,84);top.append(el('span',f.label+(f.need?' *':'')));l.append(top,inp);grid.append(l)});
 const toneFs=el('fieldset',undefined,'gb-tone');toneFs.append(el('legend','Tono'));TONES.forEach(([t])=>{const l=el('label',undefined,'ps-chip'),r=el('input');r.type='radio';r.name='gb-tone-'+n;r.value=t;r.checked=answers.tone===t;r.onchange=()=>{answers.tone=t};l.append(r,doc().createTextNode(t));toneFs.append(l)});
 const rules=el('ul',undefined,'gb-rules');['Descrizione fino a 750 caratteri, tipo di attività nei primi 250','Niente link, telefono, e-mail o offerte nella descrizione','1 categoria principale e fino a 9 secondarie, dall’elenco di Google','Servizi, 10 domande e risposte, 4 post e le foto da caricare'].forEach(t=>rules.append(el('li',t)));
 const rulesBox=el('div',undefined,'gb-rulesbox');rulesBox.append(el('span','Cosa ricevi, 3 versioni di','gb-label'),rules);
 const go=button('Prepara 3 versioni della scheda','primary'),cost=el('span','Una chiamata AI allo Specialista SEO e GEO: ti chiedo conferma prima.','muted'),bar=el('div',undefined,'ps-actions');bar.append(go,cost);
 form.append(grid,toneFs,rulesBox,bar);
 const status=el('p','','tool-status');status.setAttribute('role','status');
 const cards=el('div',undefined,'gb-versions'),result=el('div',undefined,'gb-result');cards.hidden=result.hidden=true;
 pane.append(steps,form,status,cards,result);setStep(1);
 const values=()=>{const v={project,facts:factsText(project,ctx.profile)};FIELDS.forEach(f=>v[f.id]=inputs[f.id].value);return v};
 const checkCtx=()=>({kind:st.values.kind,area:st.values.area,input:inputText(st.values)});
 const lock=on=>{go.disabled=on;form.querySelectorAll('input,textarea').forEach(x=>x.disabled=on)};
 go.onclick=async()=>{const v=values();let prompt;
  try{prompt=listingPrompt(answers,v)}catch(e){status.textContent=e.message;const f=FIELDS.find(f=>f.need&&clean(v[f.id]).length<f.need);if(f)inputs[f.id].focus();return}
  const rt=root.RadixAgents;if(!rt||typeof rt.reply!=='function'){status.textContent='Gli agenti non si sono caricati: ricarica la pagina.';return}
  if(!await askConfirm({title:'Preparare 3 versioni della scheda Google con lo Specialista SEO e GEO AI?',cost:'È una sola chiamata AI: usa crediti API.',message:'Controlli, copia e download poi sono gratuiti.',ok:'Prepara le versioni'}))return;
  st.values=v;lock(true);setStep(2);status.textContent='Lo Specialista SEO e GEO prepara le 3 versioni…';cards.hidden=false;cards.replaceChildren(...[0,1,2].map(()=>el('div',undefined,'gb-version gb-skeleton')));result.hidden=true;
  try{const r=await rt.reply({role:AGENT,project,memoryScope:ctx.memoryScope,messages:[{role:'user',content:prompt}]});
   const list=parseListing(r&&r.text,checkCtx());if(!list.length)throw Error('la risposta non contiene versioni leggibili. Riprova.');
   st.versions=list;st.chosen=null;renderCards();go.textContent='Prepara altre 3 versioni';
   status.textContent=(list.length<COUNT?'Sono arrivate '+list.length+' versioni su '+COUNT+'. ':'')+'Confrontale e scegli quella da rifinire.'}
  catch(e){status.textContent='Versioni non preparate: '+e.message;setStep(st.versions.length?2:1);cards.hidden=!st.versions.length;if(st.versions.length)renderCards()}
  finally{lock(false)}};
 function renderCards(){setStep(st.chosen?3:2);cards.hidden=false;
  cards.replaceChildren(...st.versions.map((v,i)=>{const c=el('article',undefined,'gb-version');c.dataset.chosen=String(!!st.chosen&&st.chosen.id===v.id);
   const head=el('div',undefined,'gb-version-head');head.append(el('span',(i+1)+' · '+ANGLES[v.angle],'gb-angle'),el('h3',v.name));
   const desc=el('div',undefined,'gb-desc-preview'),first=[...v.description].slice(0,LIMITS.keywordWithin).join(''),rest=[...v.description].slice(LIMITS.keywordWithin).join('');
   const m=el('mark',first);m.title='I primi 250 caratteri: quelli che Google mostra subito';desc.append(m,doc().createTextNode(rest));
   const meta=el('div',undefined,'gb-meta');meta.append(counter_(chars(v.description),LIMITS.description),pill(hasKeyword(v.description,st.values.kind)?'Parola chiave nei primi 250':'Parola chiave da spostare',hasKeyword(v.description,st.values.kind)?'ok':'warn'));
   const cats=el('div',undefined,'gb-cats');if(v.primary)cats.append(el('span',v.primary,'gb-cat gb-cat-main'));v.secondary.slice(0,4).forEach(x=>cats.append(el('span',x,'gb-cat')));if(v.secondary.length>4)cats.append(el('span','+'+(v.secondary.length-4),'gb-cat gb-cat-more'));
   const counts=el('ul',undefined,'gb-counts');[[v.services.length,'servizi'],[v.qa.length,'domande'],[v.posts.length,'post'],[v.photos.length,'foto']].forEach(([k,t])=>{const li=el('li');li.append(el('strong',String(k)),el('span',t));counts.append(li)});
   const use=button('Scegli questa','primary');use.onclick=()=>choose(v);
   c.append(head,desc,meta,cats,counts);const hard=blocking(v.issues);if(v.issues.length)c.append(issuesList(hard.length?hard:v.issues,4));c.append(use);return c}))}
 function choose(v){st.chosen=copyOf(v);renderCards();result.hidden=false;renderResult();result.scrollIntoView&&result.scrollIntoView({behavior:'smooth',block:'start'})}
 pane.reopen=r=>{st.values=Object.assign({project},r.brief||{});FIELDS.forEach(f=>{inputs[f.id].value=(r.brief||{})[f.id]||''});answers.tone=normalize(r).tone;toneFs.querySelectorAll('input').forEach(x=>x.checked=x.value===answers.tone);
  st.versions=[];cards.hidden=true;st.chosen=checkVersion(fromRecord(r),{kind:st.values.kind,area:st.values.area,input:inputText({...st.values,facts:factsText(project,ctx.profile)})});setStep(3);result.hidden=false;renderResult();status.textContent='Riaperta la scheda salvata il '+new Date(r.at).toLocaleDateString('it-IT')+'.'};
 // step 3: every section, editable, with its counter, its checks and its copy button
 const rStatus=el('p','','tool-status');rStatus.setAttribute('role','status');let timer=0;
 function renderResult(){const v=st.chosen,head=el('div',undefined,'gb-result-head'),t=el('div');t.append(el('span',ANGLES[v.angle],'gb-angle'),el('h3','La scheda scelta · '+v.name));
  const sum=el('p',undefined,'gb-summary');head.append(t,sum);
  const issuesBox=el('div',undefined,'gb-issues-box');
  const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>{st.values.facts=st.values.facts||factsText(project,ctx.profile);recheck(v,{kind:st.values.kind,area:st.values.area,input:inputText(st.values)});paintSummary()},200)};
  function paintSummary(){const hard=blocking(v.issues),soft=v.issues.length-hard.length;sum.replaceChildren(pill(chars(v.description)+'/'+LIMITS.description+' caratteri',chars(v.description)>LIMITS.description?'warn':'ok'),
    pill(hard.length?hard.length+' punti da sistemare':'Regole di Google rispettate',hard.length?'warn':'ok'),...(soft?[pill(soft+' consigli')]:[]));
   issuesBox.replaceChildren(...(v.issues.length?[issuesList(v.issues,12)]:[]));descState()}
  const sec=(title,sub,copyGet,body)=>{const s=el('section',undefined,'gb-sec'),h=el('header',undefined,'gb-sec-head'),ht=el('div');ht.append(el('h4',title));if(sub)ht.append(el('p',sub,'gb-sub'));h.append(ht);if(copyGet)h.append(copyButton(copyGet));s.append(h,body);return s};
  // description
  const dWrap=el('div',undefined,'gb-desc-edit'),ta=el('textarea');ta.rows=8;ta.value=v.description;ta.setAttribute('aria-label','Descrizione');ta.maxLength=LIMITS.description+400;
  const bar=el('div',undefined,'gb-meter'),fill=el('i');bar.append(fill,el('b'));bar.setAttribute('aria-hidden','true');
  const dFoot=el('div',undefined,'gb-desc-foot'),dCount=el('span','','gb-count'),kw=el('span','','gb-pill');dFoot.append(kw,dCount);
  function descState(){const k=chars(ta.value);dCount.textContent=k+'/'+LIMITS.description;dCount.dataset.state=k>LIMITS.description?'over':k>LIMITS.description*.93?'near':'ok';fill.style.width=Math.min(100,k/LIMITS.description*100)+'%';bar.dataset.over=String(k>LIMITS.description);
   const ok=hasKeyword(ta.value,st.values.kind);kw.textContent=ok?'Tipo di attività nei primi 250 caratteri':'Metti «'+clean(st.values.kind)+'» nei primi 250 caratteri';kw.dataset.state=ok?'ok':'warn'}
  ta.oninput=()=>{v.description=ta.value;descState();refresh()};autosize(ta,190);
  dWrap.append(ta,bar,dFoot);
  // categories
  const cBox=el('div',undefined,'gb-catedit'),mainL=el('label',undefined,'gb-field'),main=el('input');main.type='text';main.value=v.primary;main.maxLength=100;mainL.append(el('span','Categoria principale'),main);main.oninput=()=>{v.primary=clean(main.value);refresh()};
  const secL=el('label',undefined,'gb-field'),secTa=el('textarea');secTa.rows=4;secTa.value=v.secondary.join('\n');secL.append(el('span','Categorie secondarie · una per riga, fino a 9'),secTa);
  secTa.oninput=()=>{v.secondary=secTa.value.split('\n').map(clean).filter(Boolean);refresh()};
  cBox.append(mainL,secL,el('p','Le categorie vanno scelte dall’elenco di Google: in Modifica profilo → Categoria aziendale cerca ogni nome e prendi quello identico (se non c’è, il più vicino).','gb-callout'));
  // services
  const sBox=el('div',undefined,'gb-list');v.services.forEach((s,i)=>{const row=el('div',undefined,'gb-row'),nm=el('input');nm.type='text';nm.value=s.name;nm.maxLength=LIMITS.serviceName;nm.setAttribute('aria-label','Servizio '+(i+1));
   const ds=el('textarea');ds.rows=2;ds.value=s.description;ds.maxLength=LIMITS.serviceDescription;ds.setAttribute('aria-label','Descrizione del servizio '+(i+1));autosize(ds,64);const c=counter_(chars(s.description),LIMITS.serviceDescription);
   nm.oninput=()=>{s.name=clean(nm.value);refresh()};ds.oninput=()=>{s.description=clean(ds.value);c.textContent=chars(ds.value)+'/'+LIMITS.serviceDescription;refresh()};
   row.append(nm,ds,c);sBox.append(row)});
  // Q&A
  const qBox=el('ol',undefined,'gb-qa');v.qa.forEach((q,i)=>{const li=el('li'),qi=el('textarea');qi.rows=1;qi.value=q.q;qi.maxLength=300;autosize(qi,44);qi.setAttribute('aria-label','Domanda '+(i+1));const ai=el('textarea');ai.rows=2;ai.value=q.a;ai.setAttribute('aria-label','Risposta '+(i+1));
   autosize(ai,64);const c=counter_(chars(q.a),LIMITS.answer);qi.oninput=()=>{q.q=clean(qi.value);refresh()};ai.oninput=()=>{q.a=clean(ai.value);c.textContent=chars(ai.value)+'/'+LIMITS.answer;c.dataset.state=chars(ai.value)>LIMITS.answer?'near':'ok';refresh()};
   const top=el('div',undefined,'gb-row-top');top.append(qi,copyButton(()=>q.q+'\n'+q.a));li.append(top,ai,c);qBox.append(li)});
  // posts
  const pBox=el('div',undefined,'gb-posts');v.posts.forEach(p=>{const label=(POST_TYPES.find(t=>t[0]===p.type)||[,'Post'])[1],card=el('article',undefined,'gb-post');card.dataset.type=p.type;
   const h=el('header');h.append(el('span',label,'gb-post-type'),copyButton(()=>[p.title,p.text].filter(Boolean).join('\n\n')+'\n\nPulsante: '+p.cta));
   const ti=el('input');ti.type='text';ti.value=p.title;ti.maxLength=LIMITS.postTitle;ti.placeholder='Titolo (offerte ed eventi)';ti.setAttribute('aria-label','Titolo del post '+label);
   const tx=el('textarea');tx.rows=5;tx.value=p.text;tx.maxLength=LIMITS.post;tx.setAttribute('aria-label','Testo del post '+label);autosize(tx,96);const c=counter_(chars(p.text),LIMITS.post,LIMITS.postSoft);
   const sel=el('select');sel.setAttribute('aria-label','Pulsante del post '+label);CTAS.forEach(x=>sel.append(new root.Option(x,x,false,x===p.cta)));
   ti.oninput=()=>{p.title=clean(ti.value);refresh()};tx.oninput=()=>{p.text=tx.value;c.textContent=chars(tx.value)+'/'+LIMITS.post;c.dataset.state=chars(tx.value)>LIMITS.postSoft?'near':'ok';refresh()};sel.onchange=()=>{p.cta=sel.value};
   const foot=el('div',undefined,'gb-post-foot'),sl=el('label',undefined,'gb-cta');sl.append(el('span','Pulsante'),sel);foot.append(sl,c);card.append(h,ti,tx,foot);pBox.append(card)});
  // photos
  const fBox=el('ul',undefined,'gb-photos');v.photos.forEach((p,i)=>{const li=el('li'),l=el('label'),cb=el('input');cb.type='checkbox';l.append(cb,el('span',p));li.append(l);fBox.append(li)});
  const acts=el('div',undefined,'ps-actions gb-actions'),dl=button('Scarica la scheda (.txt)','primary'),dlc=button('Scarica (.csv)');
  dl.onclick=()=>{recheck(v,checkCtx());download(fileName('listing',brand,'txt'),listingTxt(v,{values:st.values,answers,brand}),'text/plain;charset=utf-8');rStatus.textContent='Scaricato '+fileName('listing',brand,'txt')+'.'};
  dlc.onclick=()=>{download(fileName('listing',brand,'csv'),listingCsv(v),'text/csv;charset=utf-8');rStatus.textContent='Scaricato '+fileName('listing',brand,'csv')+'.'};
  acts.append(dl,dlc);
  if(ctx.workspace&&ctx.projectId){const sv=button('Salva nel progetto');sv.onclick=async()=>{sv.disabled=true;rStatus.textContent='Salvo la scheda nel progetto…';
   try{recheck(v,checkCtx());await saveListing(ctx.workspace,ctx.projectId,listingRecord(v,{values:st.values,answers,by:ctx.by}));sv.textContent='Salvata';rStatus.replaceChildren(doc().createTextNode('Scheda salvata nel progetto. '));if(ctx.agentsUrl){const a=el('a','Apri lo Specialista SEO e GEO →');a.href=ctx.agentsUrl;rStatus.append(a)}pane.onSaved&&pane.onSaved()}
   catch(e){rStatus.textContent='Non salvata: '+e.message;sv.disabled=false}};acts.append(sv)}
  const gl=el('a','Copia nella scheda su Google ↗','gb-golink');gl.href=GOOGLE_URL;gl.target='_blank';gl.rel='noopener noreferrer';acts.append(gl);
  const body=el('div',undefined,'gb-sections');
  body.append(sec('Descrizione','Fino a 750 caratteri. Il segno sulla barra indica i primi 250: quelli che Google mostra subito.',()=>v.description,dWrap),
   sec('Categorie',v.secondary.length+' secondarie su 9',()=>[v.primary,...v.secondary].join('\n'),cBox),
   sec('Servizi',v.services.length+' servizi · descrizione fino a 300 caratteri',()=>v.services.map(s=>s.name+(s.description?': '+s.description:'')).join('\n'),sBox),
   sec('Domande e risposte',v.qa.length+' coppie: usale nella scheda dove disponibile e nelle FAQ del sito',()=>v.qa.map(q=>q.q+'\n'+q.a).join('\n\n'),qBox),
   sec('Foto da caricare','Spunta man mano che le carichi',()=>v.photos.map(p=>'- '+p).join('\n'),fBox),
   sec('Post','4 post: offerta, novità, evento, aggiornamento. Testo consigliato fino a 300 caratteri',null,pBox));
  result.replaceChildren(head,issuesBox,body,acts,rStatus);paintSummary()}
}

// B) the reviews pane
function reviewsPane(pane,ctx,project,brand,n){const answers=normalize({}),st={reviews:[],items:[],values:{}};
 const steps=el('ol',undefined,'ps-steps');['Incolla le recensioni','Prepara le risposte','Scegli, copia, esporta'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const form=el('div',undefined,'ps-form'),paste=el('label',undefined,'gb-field gb-paste'),ta=el('textarea');ta.rows=8;ta.maxLength=60000;
 ta.placeholder='Una recensione per blocco, con una riga vuota in mezzo. Per esempio:\n\nGiulia Bianchi\n★★★★★\nPane buonissimo e personale gentile, torneremo!\n\nMarco: 2 stelle – Attesa lunghissima sabato mattina.';
 const pt=el('span',undefined,'gb-field-top');pt.append(el('span','Recensioni *'),el('span','Testo con stelle o CSV (colonne autore, stelle, testo)','gb-hint'));paste.append(pt,ta);
 const file=el('input');file.type='file';file.accept='.csv,.txt,text/csv,text/plain';file.className='gb-file';const fl=el('label',undefined,'gb-upload');fl.append(el('span','Oppure carica un file .csv o .txt'),file);
 const row=el('div',undefined,'gb-fields gb-fields-3'),mk=(label,val,ph,max)=>{const l=el('label',undefined,'gb-field'),i=el('input');i.type='text';i.value=val||'';i.placeholder=ph;i.maxLength=max||FIELD_MAX;l.append(el('span',label),i);row.append(l);return i};
 const biz=mk('Firma (nome dell’attività) *',brand,'Es. Forno Aurora',100),contacts=mk('Contatto per il privato','','Es. info@fornoaurora.it o 011 555 1234'),notes=mk('Cosa è successo davvero (facoltativo)','','Es. sabato il forno si è guastato: abbiamo riaperto alle 10');
 const toneFs=el('fieldset',undefined,'gb-tone');toneFs.append(el('legend','Tono'));TONES.forEach(([t])=>{const l=el('label',undefined,'ps-chip'),r=el('input');r.type='radio';r.name='gb-rtone-'+n;r.value=t;r.checked=answers.tone===t;r.onchange=()=>{answers.tone=t};l.append(r,doc().createTextNode(t));toneFs.append(l)});
 const read=button('Leggi le recensioni'),readBar=el('div',undefined,'gb-readbar');readBar.append(read,el('span','Gratis: il tono di ogni recensione si calcola qui, senza AI.','muted'));
 form.append(paste,fl,readBar);
 const list=el('div',undefined,'gb-reviews');list.hidden=true;
 const opts=el('div',undefined,'gb-reply-opts');opts.hidden=true;
 const go=button('Prepara le risposte','primary'),cost=el('span','Una chiamata AI al Copywriter per tutte le recensioni: ti chiedo conferma prima.','muted'),bar=el('div',undefined,'ps-actions');bar.append(go,cost);
 opts.append(row,toneFs,el('p','Regole sempre applicate: niente incentivi né richieste di cambiare la recensione, niente cognomi o dati di salute, scuse e contatto privato per le negative, firma con il nome dell’attività. All’AI mando solo il nome di battesimo.','gb-callout'),bar);
 const status=el('p','','tool-status');status.setAttribute('role','status');
 const result=el('div',undefined,'gb-replies');result.hidden=true;
 pane.append(steps,form,list,opts,status,result);setStep(1);
 file.onchange=async()=>{const f=file.files&&file.files[0];if(!f)return;if(f.size>2e6){status.textContent='Il file supera 2 MB.';return}try{ta.value=await f.text();readReviews()}catch(e){status.textContent='File non leggibile: '+e.message}};
 read.onclick=()=>readReviews();
 function readReviews(){let rs=[];try{rs=parseReviews(ta.value)}catch(e){status.textContent='Recensioni non lette: '+e.message;return}
  if(!rs.length){status.textContent='Nessuna recensione trovata: incolla il testo (una per blocco) o un CSV con la colonna «testo».';list.hidden=opts.hidden=true;return}
  const over=rs.length>MAX_REVIEWS;st.reviews=rs.slice(0,MAX_REVIEWS);st.items=[];result.hidden=true;setStep(2);renderList();opts.hidden=false;
  go.textContent='Prepara le risposte ('+st.reviews.length+')';status.textContent=(over?'Lette '+rs.length+' recensioni: preparo le prime '+MAX_REVIEWS+' (poi le altre). ':'')+''}
 function renderList(){const counts={positiva:0,mista:0,negativa:0};st.reviews.forEach(r=>counts[sentiment(r).label]++);
  const head=el('div',undefined,'gb-reviews-head');head.append(el('h4',st.reviews.length+(st.reviews.length===1?' recensione letta':' recensioni lette')));const pills=el('div',undefined,'gb-meta');
  Object.entries(counts).forEach(([k,c])=>{if(c)pills.append(pill(c+' '+SENTIMENTS[k].toLowerCase(),k==='negativa'?'bad':k==='mista'?'warn':'ok'))});head.append(pills);
  const ul=el('ul',undefined,'gb-review-list');st.reviews.forEach(r=>{const s=sentiment(r),li=el('li',undefined,'gb-review');li.dataset.sentiment=s.label;
   const top=el('div',undefined,'gb-review-top');top.append(el('strong',shortName(r.author)||'Anonimo'),starsEl(r.stars),pill(SENTIMENTS[s.label],s.label==='negativa'?'bad':s.label==='mista'?'warn':'ok'));
   if(s.flags.includes('sensibile'))top.append(pill('Dati sensibili','warn'));if(s.flags.includes('grave'))top.append(pill('Da valutare con un responsabile','bad'));
   li.append(top,el('p',r.text,'gb-review-text'));ul.append(li)});
  list.replaceChildren(head,ul);list.hidden=false}
 const lock=on=>{go.disabled=on;read.disabled=on;pane.querySelectorAll('.ps-form textarea,.gb-reply-opts input').forEach(x=>x.disabled=on)};
 const lintCtx=()=>({business:clean(biz.value),contacts:clean(contacts.value),input:[contacts.value,notes.value,biz.value].join('\n')});
 go.onclick=async()=>{const values={business:biz.value,contacts:contacts.value,notes:notes.value,kind:prefill(project).kind,tone:answers.tone};let prompt;
  try{prompt=repliesPrompt(st.reviews,values)}catch(e){status.textContent=e.message;if(!clean(biz.value))biz.focus();return}
  const rt=root.RadixAgents;if(!rt||typeof rt.reply!=='function'){status.textContent='Gli agenti non si sono caricati: ricarica la pagina.';return}
  if(!await askConfirm({title:'Preparare 3 risposte per '+(st.reviews.length===1?'1 recensione':'ognuna delle '+st.reviews.length+' recensioni')+' con il Copywriter AI?',cost:'È una sola chiamata AI: usa crediti API.',message:'Scelta, copia ed export poi sono gratuiti.',ok:'Prepara le risposte'}))return;
  st.values=values;lock(true);setStep(2);status.textContent='Il Copywriter scrive le risposte…';result.hidden=false;result.replaceChildren(...st.reviews.slice(0,3).map(()=>el('div',undefined,'gb-reply gb-skeleton')));
  try{const r=await rt.reply({role:REPLY_AGENT,project,memoryScope:ctx.replyScope||ctx.memoryScope,messages:[{role:'user',content:prompt}]});
   const items=parseReplies(r&&r.text,st.reviews,lintCtx());if(!items.length)throw Error('la risposta non contiene risposte leggibili. Riprova.');
   st.items=items;setStep(3);renderReplies();status.textContent=(items.length<st.reviews.length?'Risposte pronte per '+items.length+' recensioni su '+st.reviews.length+'. ':'')+'Scegli la risposta per ogni recensione, rifinisci e copia.'}
  catch(e){status.textContent='Risposte non preparate: '+e.message;result.hidden=!st.items.length;if(st.items.length)renderReplies()}
  finally{lock(false)}};
 const rStatus=el('p','','tool-status');rStatus.setAttribute('role','status');
 function renderReplies(){const head=el('div',undefined,'gb-result-head'),t=el('div');t.append(el('h3','Le risposte'));const sum=el('p',undefined,'gb-summary');head.append(t,sum);
  const paintSum=()=>{const bad=st.items.filter(x=>blocking(x.issues[x.chosen]).length).length;sum.replaceChildren(pill(st.items.length+' risposte'),pill(bad?bad+' da sistemare':'Tutte nelle regole',bad?'warn':'ok'))};
  const cards=st.items.map((it,i)=>{const card=el('article',undefined,'gb-reply');card.dataset.sentiment=it.sentiment;
   const top=el('div',undefined,'gb-review-top');top.append(el('strong',(i+1)+' · '+(shortName(it.review.author)||'Anonimo')),starsEl(it.review.stars),pill(SENTIMENTS[it.sentiment],it.sentiment==='negativa'?'bad':it.sentiment==='mista'?'warn':'ok'));
   if(it.flags.includes('grave'))top.append(pill('Da valutare con un responsabile','bad'));
   const quote=el('blockquote',it.review.text,'gb-quote');
   const seg=el('div',undefined,'gb-seg');seg.setAttribute('role','radiogroup');seg.setAttribute('aria-label','Stile della risposta '+(i+1));
   const edit=el('textarea');edit.rows=6;edit.setAttribute('aria-label','Risposta alla recensione '+(i+1));edit.maxLength=LIMITS.reply;
   const foot=el('div',undefined,'gb-reply-foot'),cnt=el('span','','gb-count'),iss=el('div',undefined,'gb-reply-issues');
   const fitH=autosize(edit,150),paint=()=>{const txt=it.options[it.chosen]||'';edit.value=txt;state();fitH()};
   const state=()=>{const txt=edit.value;cnt.textContent=words(txt)+' parole · '+chars(txt)+'/'+LIMITS.reply;cnt.dataset.state=chars(txt)>LIMITS.reply?'over':words(txt)>LIMITS.replyWords?'near':'ok';
    const list=it.issues[it.chosen]||[];iss.replaceChildren(...(list.length?[issuesList(list,5)]:[pill('Nelle regole','ok')]));card.dataset.issues=String(blocking(list).length);paintSum()};
   STYLES.forEach(([k,label])=>{if(!it.options[k])return;const b=button(label);b.setAttribute('role','radio');b.setAttribute('aria-checked',String(it.chosen===k));b.onclick=()=>{it.chosen=k;seg.querySelectorAll('button').forEach(x=>x.setAttribute('aria-checked',String(x===b)));paint()};seg.append(b)});
   let tm=0;edit.oninput=()=>{it.options[it.chosen]=edit.value;clearTimeout(tm);tm=setTimeout(()=>{it.issues[it.chosen]=lintReply(edit.value,it.review,{...lintCtx(),sentiment:it.sentiment});state()},200);cnt.textContent=words(edit.value)+' parole · '+chars(edit.value)+'/'+LIMITS.reply};
   foot.append(cnt,copyButton(()=>edit.value,'Copia la risposta'));
   card.append(top,quote,seg,edit,foot,iss);paint();return card});
  const acts=el('div',undefined,'ps-actions gb-actions'),csv=button('Esporta CSV','primary'),txt=button('Scarica (.txt)');
  csv.onclick=()=>{download(fileName('replies',brand,'csv'),repliesCsv(st.items),'text/csv;charset=utf-8');rStatus.textContent='Scaricato '+fileName('replies',brand,'csv')+': una riga per recensione, con le tre risposte e quella scelta.'};
  txt.onclick=()=>{download(fileName('replies',brand,'txt'),repliesTxt(st.items,{brand}),'text/plain;charset=utf-8');rStatus.textContent='Scaricato '+fileName('replies',brand,'txt')+'.'};
  acts.append(csv,txt);
  if(ctx.workspace&&ctx.projectId){const sv=button('Salva nel progetto');sv.onclick=async()=>{sv.disabled=true;rStatus.textContent='Salvo le risposte nel progetto…';
   try{await saveReplies(ctx.workspace,ctx.projectId,replyRecords(st.items,{by:ctx.by}));sv.textContent='Salvate';rStatus.textContent='Risposte salvate nel progetto (autore abbreviato, risposta scelta).';pane.onSaved&&pane.onSaved()}
   catch(e){rStatus.textContent='Non salvate: '+e.message;sv.disabled=false}};acts.append(sv)}
  const gl=el('a','Rispondi su Google ↗','gb-golink');gl.href=GOOGLE_URL;gl.target='_blank';gl.rel='noopener noreferrer';acts.append(gl);
  const grid=el('div',undefined,'gb-reply-grid');grid.append(...cards);
  result.replaceChildren(head,grid,acts,rStatus);result.hidden=false;paintSum()}
}

return Object.freeze({AGENT,REPLY_AGENT,COUNT,MAX_REVIEWS,GOOGLE_URL,FIELDS,TONES,LIMITS,POST_TYPES,CTAS,ANGLES,STYLES,SENTIMENTS,normalize,prefill,validate,factsText,inputText,
 hasKeyword,sanitizeDescription,descriptionIssues,fit,listingPrompt,parseListing,checkVersion,recheck,blocking,starsOf,looksCsv,parseReviews,sentiment,firstName,shortName,
 repliesPrompt,lintReply,finishReply,parseReplies,listingTxt,listingCsv,repliesCsv,repliesTxt,fileName,readStore,listingRecord,replyRecords,addListing,addReplies,
 saveToProject,saveListing,saveReplies,fromRecord,gbpStudio});
});
