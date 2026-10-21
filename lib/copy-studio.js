/* Studio Testi: one guided studio for the text services of the Marketing panel (name and slogan, launch plan, Google and
   Meta ads, site/blog/product copy, newsletter, brochure, technical sheet, presentation). Each service is a config:
   a few questions, a few fields prefilled from the project profile, the sections each proposal has, the rules of its
   prompt. ONE AI call to the service's role writes three alternative proposals in a marker format, the person picks
   one, edits it, copies it, downloads it as Markdown or saves it in the project (a document in that role's thread on
   the Agenti AI page). Pure part (configs, prefill, prompt, parsing, checks, Markdown, the saved entry) runs in Node for
   the tests; copyStudio() is the browser widget. The only paid step is the AI call, started from a click with confirmation. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCopyStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const COUNT=3,FIELD_MAX=400,DATA_MAX=4000,MAX_ITEMS=20,MAX_TEXT=6000;
// Shared questions. Italian label → words for the prompt; `def` is the default option (first when missing).
const TONE={id:'tone',label:'Tono',options:[['Semplice','semplice e chiaro, frasi brevi'],['Caldo','caldo e vicino, accogliente'],['Tecnico','preciso e concreto, da esperti'],['Elegante','elegante e misurato']]};
// Fields: `from` is the profile value they start from (prefill), `need` the minimum length when required, `rows` > 1 a textarea.
const OFFER={id:'offer',label:'Cosa fa l’attività e dove',from:'offer',need:10,rows:2,ph:'Es. forno artigianale a Torino: pane a lievito madre e dolci'};
const AUDIENCE={id:'audience',label:'A chi si rivolge',from:'audience',ph:'Es. famiglie del quartiere e uffici della zona'};
// Sections: `list` = one item per line; `max` = characters per item, `hard` = a platform limit (over it is trimmed).
const SERVICES=[
 {id:'naming',title:'Nome e slogan',role:'brand-strategist',who:['lo','Stratega di Marca'],what:'nomi e slogan',file:'nome-slogan',
  questions:[{id:'kind',label:'Cosa serve',options:[['Nome della marca','il nome di una marca o di un’azienda, con il suo slogan'],['Nome di un prodotto','il nome di un prodotto o di una linea, con il suo slogan'],['Solo lo slogan','solo lo slogan: il nome c’è già']]},
   {id:'style',label:'Stile del nome',options:[['Evocativo','evocativo: richiama un’immagine o un’emozione'],['Descrittivo','descrittivo: fa capire subito cosa si fa'],['Inventato','inventato: una parola nuova, breve e facile da pronunciare'],['Giocoso','giocoso: leggero e facile da ricordare']]},TONE],
  fields:[OFFER,AUDIENCE,{id:'current',label:'Nome attuale (se c’è)',from:'name',ph:'Es. Forno Rossi'},{id:'avoid',label:'Parole da evitare (facoltativo)',ph:'Es. niente nomi inglesi'}],
  sections:[{key:'names',label:'NOMI',list:true,hint:'da 5 a 8 nomi, ognuno con una riga sul perché'},{key:'slogan',label:'SLOGAN',list:true,hint:'3 slogan brevi'},{key:'why',label:'PERCHÉ FUNZIONA',hint:'2-3 frasi'}],need:['names','slogan'],
  rules:['Non dire mai che un nome è libero, registrato, registrabile o disponibile come dominio: non l’hai verificato.','Evita nomi uguali o simili a marchi noti.'],
  note:'Prima di usare un nome verifica che il marchio sia libero sulle banche dati UIBM, TMview e WIPO, e che il dominio sia disponibile: RADIX non l’ha controllato e non garantisce che sia libero.'},
 {id:'lancio',title:'Piano di lancio prodotto',role:'strategist',who:['il','Digital Strategist'],what:'piani di lancio',file:'piano-lancio',
  questions:[{id:'kind',label:'Cosa lanci',options:[['Prodotto nuovo','un prodotto nuovo'],['Servizio nuovo','un servizio nuovo'],['Apertura','una nuova apertura o sede'],['Nuova versione','una nuova versione di un prodotto che esiste già']]},
   {id:'budget',label:'Budget',options:[['Quasi zero','quasi nessun budget: canali gratuiti e passaparola'],['Piccolo','un budget piccolo: poca pubblicità mirata'],['Medio','un budget medio: pubblicità su più canali']]},
   {id:'where',label:'Dove',options:[['Online','soprattutto online e sui social'],['Sul territorio','soprattutto sul territorio e in negozio'],['Entrambi','online e sul territorio']]}],
  fields:[{id:'product',label:'Cosa lanci (nome e cosa fa)',need:5,rows:2,ph:'Es. la nuova linea di biscotti senza zucchero'},OFFER,AUDIENCE,{id:'date',label:'Data di lancio (facoltativa)',ph:'Es. inizio marzo'}],
  sections:[{key:'phases',label:'FASI',list:true,hint:'le fasi (prima, durante, dopo il lancio), una per riga'},{key:'channels',label:'CANALI',list:true,hint:'canale: cosa fare'},{key:'messages',label:'MESSAGGI CHIAVE',list:true,hint:'3-5 messaggi'},{key:'d30',label:'PRIMI 30 GIORNI',list:true,hint:'azione'},{key:'d60',label:'GIORNI 31-60',list:true,hint:'azione'},{key:'d90',label:'GIORNI 61-90',list:true,hint:'azione'}],need:['phases','d30'],
  rules:['Non inventare budget in euro, numeri di vendita, percentuali o risultati attesi: se servono scrivi «da verificare».']},
 {id:'annunci',title:'Testi per annunci Google e Meta',role:'paid-media',who:['il','Paid Media Specialist'],what:'set di testi per annunci',file:'testi-annunci',
  questions:[{id:'platform',label:'Dove',options:[['Google e Meta','Google Ads (annunci di ricerca) e Meta (Facebook e Instagram)'],['Solo Google','solo Google Ads (annunci di ricerca adattabili)'],['Solo Meta','solo Meta (Facebook e Instagram)']]},
   {id:'goal',label:'Obiettivo',options:[['Contatti','ricevere chiamate e richieste'],['Vendite online','vendere online'],['Visite in negozio','portare persone in negozio'],['Farsi conoscere','farsi conoscere nella zona o nel settore']]},TONE],
  fields:[{...OFFER,label:'Cosa pubblicizzi'},AUDIENCE,{id:'promo',label:'Offerta o promo (solo se è vera, facoltativa)',ph:'Es. consegna gratuita a Torino'}],
  sections:[{key:'gtitles',label:'TITOLI GOOGLE',list:true,max:30,hard:true,hint:'da 8 a 15 titoli, massimo 30 caratteri ciascuno',when:a=>a.platform!==META_ONLY},
   {key:'gdesc',label:'DESCRIZIONI GOOGLE',list:true,max:90,hard:true,hint:'4 descrizioni, massimo 90 caratteri ciascuna',when:a=>a.platform!==META_ONLY},
   {key:'mtext',label:'META TESTO PRINCIPALE',list:true,max:125,hint:'2-3 testi, meglio entro 125 caratteri',when:a=>a.platform!==GOOGLE_ONLY},
   {key:'mtitle',label:'META TITOLO',list:true,max:40,hint:'3-5 titoli, meglio entro 40 caratteri',when:a=>a.platform!==GOOGLE_ONLY}],need:['gtitles','mtext'],
  rules:['Rispetta i limiti di caratteri: contali, spazi compresi.','Non promettere risultati, sconti, prezzi o garanzie che non sono scritti qui.'],
  note:'RADIX prepara solo i testi: le campagne si creano e si gestiscono nel tuo account Google Ads o Meta, con il tuo budget. Controlla le regole delle piattaforme per il tuo settore.'},
 {id:'testi',title:'Testi per sito, blog e prodotti',role:'web-content',who:['il','Content e UX Writer'],what:'testi',file:'testo',
  questions:[{id:'kind',label:'Che testo',options:[['Pagina del sito','il testo di una pagina del sito'],['Articolo del blog','un articolo per il blog, utile e facile da leggere'],['Descrizione prodotto','la descrizione di un prodotto per il sito o il negozio online']]},TONE,
   {id:'length',label:'Lunghezza',options:[['Breve','breve (circa 150 parole)'],['Media','media (circa 400 parole)'],['Lunga','lunga (circa 800 parole)']]}],
  fields:[{id:'topic',label:'Di cosa parla (pagina, argomento o prodotto)',need:5,ph:'Es. pagina «Chi siamo» oppure «come conservare il pane»'},OFFER,AUDIENCE,{id:'facts',label:'Informazioni da usare (facoltative)',rows:3,max:DATA_MAX,ph:'Fatti veri da citare: storia, ingredienti, orari…'}],
  sections:[{key:'headline',label:'TITOLO',hint:'il titolo del testo'},{key:'body',label:'TESTO',hint:'il testo completo, con sottotitoli se servono'},{key:'meta',label:'META DESCRIPTION',max:155,hint:'una frase per Google, entro 155 caratteri'}],need:['body'],
  rules:['Per una descrizione prodotto usa solo le caratteristiche scritte qui: non aggiungerne altre.']},
 {id:'newsletter',title:'Newsletter',role:'copywriter',who:['il','Copywriter'],what:'newsletter',file:'newsletter',
  questions:[{id:'kind',label:'Che newsletter',options:[['Novità','una novità dell’attività'],['Promozione','una promozione'],['Consigli utili','consigli utili per i clienti'],['Invito','un invito a un evento']]},TONE],
  fields:[{id:'topic',label:'Di cosa parla questa newsletter',need:5,rows:2,ph:'Es. da lunedì apriamo anche la domenica mattina'},OFFER,AUDIENCE,{id:'cta',label:'Invito all’azione o link (facoltativo)',ph:'Es. prenota su www.esempio.it'}],
  sections:[{key:'subject',label:'OGGETTO',max:60,hint:'entro 60 caratteri'},{key:'preheader',label:'ANTEPRIMA',max:100,hint:'il testo che si vede dopo l’oggetto, entro 100 caratteri'},{key:'body',label:'TESTO',hint:'il testo della mail'},{key:'cta',label:'INVITO',hint:'il testo del pulsante'}],need:['body'],
  rules:['Non scrivere la riga per disiscriversi né i dati legali del mittente in fondo: li aggiunge il sistema di invio.'],
  note:'Il link per disiscriversi e i dati del mittente li aggiunge il sistema di invio. Invia solo a chi ha dato il consenso.'},
 {id:'brochure',title:'Brochure e company profile',role:'copywriter',who:['il','Copywriter'],what:'testi per brochure',file:'brochure',
  questions:[{id:'kind',label:'Che documento',options:[['Brochure','una brochure di prodotto o servizio'],['Company profile','un company profile: chi è l’azienda e cosa fa']]},
   {id:'size',label:'Lunghezza',options:[['4 pagine','breve, circa 4 pagine'],['8 pagine','media, circa 8 pagine'],['12 pagine','ampia, circa 12 pagine']]},TONE],
  fields:[{...OFFER,label:'Chi siete e cosa fate'},AUDIENCE,{id:'facts',label:'Punti da raccontare (facoltativi)',rows:3,max:DATA_MAX,ph:'Storia, servizi, valori, contatti: solo cose vere'}],
  sections:[{key:'cover',label:'COPERTINA',hint:'titolo e sottotitolo'},{key:'pages',label:'SEZIONI',hint:'una sezione per pagina: «### Titolo» e il testo'},{key:'close',label:'CHIUSURA',hint:'contatti e invito finale'}],need:['pages'],
  rules:['Contatti, indirizzi, anni di attività, clienti e numeri solo se sono scritti qui; altrimenti «da verificare».']},
 {id:'scheda',title:'Scheda tecnica',role:'copywriter',who:['il','Copywriter'],what:'schede tecniche',file:'scheda-tecnica',strict:true,
  questions:[{id:'use',label:'Dove si usa',options:[['Stampa','una scheda da stampare (PDF)'],['Sito','una scheda per il sito o il negozio online'],['Entrambi','una scheda per la stampa e per il sito']]},
   {id:'style',label:'Impostazione',options:[['Essenziale','essenziale: solo i dati, in ordine'],['Con descrizione','con una breve descrizione prima dei dati']]}],
  fields:[{id:'product',label:'Nome del prodotto',need:3,ph:'Es. Sedia Alba'},{id:'data',label:'Dati tecnici',need:20,rows:6,max:DATA_MAX,ph:'Solo dati veri: misure, materiali, pesi, certificazioni, colori, codici…'},{...OFFER,need:0,label:'L’azienda (facoltativo)'}],
  sections:[{key:'intro',label:'DESCRIZIONE BREVE',hint:'2-3 frasi, senza dati nuovi'},{key:'specs',label:'CARATTERISTICHE TECNICHE',list:true,hint:'voce: valore, solo dai dati'},{key:'missing',label:'DA VERIFICARE',list:true,hint:'i dati che di solito servono e mancano'}],need:['specs'],
  rules:['Regola più importante: usa SOLO i dati tecnici scritti qui e i fatti confermati del progetto. Non inventare misure, pesi, materiali, certificazioni, norme, prestazioni, garanzie, codici o numeri.','Non arrotondare e non convertire i valori: riportali come sono scritti.','Se un dato che di solito serve manca, non scriverlo nelle caratteristiche: mettilo in DA VERIFICARE con la scritta «da verificare».','Le tre proposte cambiano solo ordine, raggruppamento e parole, mai i dati.'],
  note:'Ogni dato va controllato sulla fonte del cliente prima di stampare o pubblicare. I numeri segnalati non compaiono nei dati scritti: verificali o toglili.'},
 {id:'presentazione',title:'Presentazione',role:'brand-strategist',who:['lo','Stratega di Marca'],what:'scalette di presentazione',file:'presentazione',
  questions:[{id:'kind',label:'Che presentazione',options:[['Aziendale','una presentazione aziendale'],['Pitch','un pitch per investitori o partner'],['Proposta','una proposta commerciale a un cliente'],['Evento','un intervento a un evento o una formazione']]},
   {id:'size',label:'Durata',options:[['6-8 slide','breve, da 6 a 8 slide'],['10-12 slide','media, da 10 a 12 slide'],['15-18 slide','lunga, da 15 a 18 slide']]},TONE],
  fields:[{id:'goal',label:'Obiettivo e pubblico della presentazione',need:5,rows:2,ph:'Es. convincere i negozi della zona a vendere i nostri prodotti'},OFFER,{id:'facts',label:'Punti e dati da usare (facoltativi)',rows:3,max:DATA_MAX,ph:'Solo dati veri: numeri, clienti, risultati che puoi dimostrare'}],
  sections:[{key:'slides',label:'SLIDE',hint:'per ogni slide: «Slide n · Titolo», poi i punti con «- », poi «Nota: cosa dire»'}],need:['slides'],
  rules:['Non inventare dati di mercato, fatturati, clienti, premi o risultati: dove servono scrivi «da verificare».']}
];
const META_ONLY=SERVICES[2].questions[0].options[2][1],GOOGLE_ONLY=SERVICES[2].questions[0].options[1][1];
// «il Copywriter», «al Copywriter», «del Copywriter» (lo → allo, dello).
const whoOf=(id,prep)=>{const [art,name]=need(id).who;return ({'':art,a:art==='lo'?'allo':'al',di:art==='lo'?'dello':'del'})[prep||'']+' '+name};
const service=id=>SERVICES.find(s=>s.id===id)||null;
function need(id){const s=service(id);if(!s)throw Error('Servizio non valido: «'+id+'».');return s}
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const block=s=>String(s==null?'':s).replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const fallback=q=>q.options[q.def||0][1];
function pick(q,v){const o=q.options.find(x=>x[1]===v);if(v!=null&&v!==''&&!o)throw Error('Risposta non valida per «'+q.label+'».');return o?o[1]:fallback(q)}
const labelOf=(svc,id,v)=>{const q=need(svc).questions.find(x=>x.id===id);return q?(q.options.find(x=>x[1]===v)||q.options[q.def||0])[0]:''};
// The sections a service asks for with these answers (the ads skip Google or Meta when only one is chosen).
const sectionsFor=(svc,answers)=>need(svc).sections.filter(s=>!s.when||s.when(answers||{}));
// The project profile (RadixAgents.profileFor) → the values the fields start from.
function prefill(profile){const p=profile||{};
 return {offer:clean(p.summary||p.positioning||'').slice(0,FIELD_MAX),audience:clean(p.audience).slice(0,FIELD_MAX),name:clean(p.name).slice(0,120)}}
// Confirmed project facts that go in the prompt (and count as «input» for the number check).
function projectFacts(project){const p=project||{},out=[];
 [['Nome',p.name],['Settore',p.kind],['Posizionamento',p.positioning],['Pubblico',p.audience],['Tono di voce',p.voice],['Decisioni prese',p.decisions]].forEach(([k,v])=>{v=clean(v);if(v)out.push(k+': '+v.slice(0,FIELD_MAX))});
 return out}

// The one request to the service's role: three alternative proposals in a format parseProposals() reads back.
const RULES=['Usa solo i fatti confermati del progetto e quello che è scritto qui. Non inventare numeri, prezzi, sconti, clienti, premi, certificazioni, recensioni o risultati. Se un dato serve e manca, scrivi «da verificare».','Italiano semplice, frasi brevi, niente gergo non spiegato, niente emoji.'];
function proposalsPrompt(id,answers,values={}){const svc=need(id),a=answers||{},v=values||{},p=v.project||{},lines=[];
 for(const f of svc.fields){const x=String(v[f.id]==null?'':v[f.id]).trim();if(f.need&&x.length<f.need)throw Error('Compila «'+f.label+'».')}
 lines.push('Prepara '+COUNT+' proposte alternative di '+svc.what+' ('+svc.title+') per il progetto'+(p.name?' «'+clean(p.name).slice(0,80)+'»':'')+'. Le tre proposte devono essere davvero diverse tra loro.');
 for(const q of svc.questions)lines.push(q.label+': '+pick(q,a[q.id])+'.');
 for(const f of svc.fields){const x=f.rows>1?block(v[f.id]).slice(0,f.max||FIELD_MAX):clean(v[f.id]).slice(0,f.max||FIELD_MAX);if(x)lines.push(f.label+': «'+x+'».')}
 const facts=projectFacts(p);if(facts.length)lines.push('Fatti confermati del progetto:\n'+facts.map(x=>'- '+x).join('\n'));
 svc.rules.concat(RULES).forEach(r=>lines.push(r));
 lines.push('Rispondi solo in questo formato, senza testo prima o dopo:');
 const secs=sectionsFor(id,a);
 for(let i=1;i<=COUNT;i++)lines.push('===PROPOSTA '+i+'===\nIDEA: (3-7 parole: cosa distingue questa proposta)\n'+secs.map(s=>s.label+':\n'+(s.list?'- ('+s.hint+')':'('+s.hint+')')).join('\n'));
 lines.push('===FINE===');
 return lines.join('\n')}

// ---- parsing ----
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const stripMd=s=>String(s||'').replace(/\*\*|__|`/g,'').replace(/^[#>\s]+/,'').trim();
const bullet=s=>stripMd(String(s).replace(/^\s*(?:[-*•–·]|\d{1,2}[.)]|\[[ x]\])\s+/,''));
const chars=s=>[...String(s)].length;
// Over a hard limit: cut at the last whole word that fits (no dangling punctuation).
function fit(s,max){const t=[...String(s)];if(t.length<=max)return String(s);const cut=t.slice(0,max).join(''),sp=cut.lastIndexOf(' ');return (sp>max/2?cut.slice(0,sp):cut).replace(/[\s,;:–—-]+$/,'')}
function item(sec,v){if(sec.list){const xs=(Array.isArray(v)?v:typeof v==='string'?v.split('\n'):[]).map(x=>bullet(typeof x==='string'?x:x&&(x.text||x.testo||x.titolo||x.title||x.nome||x.name)||'')).map(x=>x.replace(/^[«"“]|[»"”]$/g,'').trim()).filter(x=>x.length>1);return xs.slice(0,MAX_ITEMS)}
 return block(Array.isArray(v)?v.join('\n'):typeof v==='string'?v:'').replace(/^\*\*|\*\*$/g,'').slice(0,MAX_TEXT)}
// A proposal is usable when at least one of the service's `need` sections has something.
function proposal(svc,raw,n){const p={title:stripMd(raw.title||'').replace(/[«»"]/g,'').slice(0,90),sections:{}};
 for(const s of svc.sections){const v=item(s,raw[s.key]);if(v&&v.length)p.sections[s.key]=v}
 if(!svc.need.some(k=>p.sections[k]&&p.sections[k].length))return null;
 if(!p.title)p.title='Proposta '+n;
 p.issues=checks(svc,p,raw.input);return p}
function sectionsOf(svc,body){const out={title:''};let cur=null;const heads=svc.sections.map(s=>[s.key,norm(s.label)]);
 for(const line of String(body).split('\n')){const t=stripMd(line);
  const h=/^([^:]{2,40}?)\s*:\s*(.*)$/.exec(t),key=k=>{const x=norm(k);const hit=heads.find(([,l])=>l===x);return hit&&hit[0]};
  if(h&&!out.title&&/^(?:idea|titolo proposta|nome proposta)$/.test(norm(h[1]))){out.title=h[2];cur=null;continue}
  const k=h?key(h[1]):t.length<=40?key(t.replace(/[:\s]+$/,'')):null;
  if(k&&!/^\s*(?:[-*•–·]|\d{1,2}[.)])\s/.test(line)){cur=k;out[k]=h&&h[2]?h[2]+'\n':'';continue}
  if(cur)out[cur]+=line+'\n'}
 return out}
function fromJson(raw){const s=raw.search(/[[{]/);if(s<0)return null;const e=Math.max(raw.lastIndexOf('}'),raw.lastIndexOf(']'));if(e<=s)return null;
 const body=raw.slice(s,e+1);for(const t of [body,body.replace(/,\s*([}\]])/g,'$1').replace(/[“”]/g,'"')]){try{return JSON.parse(t)}catch(err){}}return null}
// A JSON object: its keys are the section keys or labels, in any case and accents.
function fromObject(svc,x){const o={title:x.idea||x.titolo_proposta||x.nome_proposta||x.proposta||x.title||''},keys=Object.keys(x);
 for(const s of svc.sections){const k=keys.find(k=>k===s.key||norm(k)===norm(s.label)||norm(k).replace(/ /g,'_')===norm(s.label).replace(/ /g,'_'));if(k)o[s.key]=x[k]}
 if(!x.idea&&!x.titolo_proposta&&o.title&&svc.sections.some(s=>s.key==='headline'))o.title='';
 return o}
// The reply → up to three proposals. The requested markers or «Proposta 1» headings (markdown tolerated) first, then a
// JSON list. `input` is what the person wrote (for the number check). Returns [] when nothing usable is there.
function parseProposals(id,text,input){const svc=need(id),raw=String(text||'').replace(/\r/g,'').replace(/```[a-z]*\n?|```/gi,''),out=[];
 const marker=/^[ \t]*[=#*\-_ ]*\s*(?:PROPOSTA|PROPOSAL|OPZIONE|VARIANTE)\s*(?:N[°.]?\s*)?(\d)\s*(?:[=#*\-_:.)–—]+[ \t]*(.*)|[ \t]*)$/gim,heads=[];let m;
 while((m=marker.exec(raw)))heads.push({i:m.index,end:m.index+m[0].length,rest:m[2]||''});
 if(heads.length){heads.forEach((h,k)=>{const body=raw.slice(h.end,k+1<heads.length?heads[k+1].i:raw.length).replace(/^[ \t]*[=#*_-]{2,}[ \t]*FINE\b[\s\S]*$/m,'');
   const s=sectionsOf(svc,body);if(!s.title)s.title=h.rest.replace(/^[–—:\-\s]+/,'').replace(/[=*#_]+$/,'');s.input=input;
   const it=out.length<COUNT&&proposal(svc,s,out.length+1);if(it)out.push(it)});
  if(out.length)return out}
 let d=fromJson(raw);if(d&&!Array.isArray(d))d=d.proposte||d.proposals||d.items||d.opzioni||[];
 (Array.isArray(d)?d:[]).forEach(x=>{if(!x||typeof x!=='object'||Array.isArray(x)||out.length>=COUNT)return;const o=fromObject(svc,x);o.input=input;const it=proposal(svc,o,out.length+1);if(it)out.push(it)});
 return out}

// ---- checks ----
// Character limits: over a hard (platform) limit the item is trimmed and flagged; over a soft one it is only flagged.
function lengthIssues(svc,p){const issues=[];
 for(const s of svc.sections){if(!s.max||!p.sections[s.key])continue;
  const fix=v=>{const n=chars(v);if(n<=s.max)return v;const cut=s.hard?fit(v,s.max):v;issues.push({kind:'length',section:s.key,label:s.label,text:v,length:n,max:s.max,trimmed:s.hard?cut:null});return cut};
  p.sections[s.key]=s.list?p.sections[s.key].map(fix):fix(p.sections[s.key])}
 return issues}
// Numbers as written: «1.200», «1,5», «45». Each one counts in the forms «1.200»→1.200/1200 and «1,5»→1.5/15.
const NUM=/\d+(?:[.,]\d+)*/g;
const forms=n=>{const a=n.replace(/,/g,'.'),b=n.replace(/[.,]/g,'');return [n,a,b,a.replace(/\.0+$/,'')]};
function numbersIn(text){const set=new Set();(String(text||'').match(NUM)||[]).forEach(n=>forms(n).forEach(f=>set.add(f)));return set}
// The technical sheet: every number in the proposal must appear in what the person wrote or in the confirmed facts.
// List numbering («1.») and the «da verificare» list are not data.
function unverifiedNumbers(text,input){const known=numbersIn(input),bad=[];
 for(const line of String(text||'').split('\n')){const t=line.replace(/^\s*\d{1,2}[.)]\s+/,'');
  for(const n of t.match(NUM)||[])if(!forms(n).some(f=>known.has(f))&&!bad.includes(n))bad.push(n)}
 return bad}
function checks(svc,p,input){const issues=lengthIssues(svc,p);
 if(svc.strict){const text=svc.sections.filter(s=>s.key!=='missing').map(s=>{const v=p.sections[s.key];return Array.isArray(v)?v.join('\n'):v||''}).join('\n')+'\n'+p.title;
  unverifiedNumbers(text,input).forEach(n=>issues.push({kind:'number',text:n}))}
 return issues}
// What the person wrote plus the confirmed facts: the input the technical sheet's numbers are checked against.
function inputText(id,values){const svc=need(id),v=values||{};return svc.fields.map(f=>String(v[f.id]||'')).concat(projectFacts(v.project)).join('\n')}
const issueText=i=>i.kind==='number'?'Il numero «'+i.text+'» non compare nei dati che hai scritto: verificalo o toglilo.'
 :i.trimmed!=null?'«'+i.text+'» aveva '+i.length+' caratteri (massimo '+i.max+'): accorciato in «'+i.trimmed+'», rileggilo.'
 :'«'+i.text+'» ha '+i.length+' caratteri: meglio entro '+i.max+'.';

// ---- output ----
// A section label as a heading: «TITOLI GOOGLE» → «Titoli Google».
const heading=l=>(l.charAt(0)+l.slice(1).toLowerCase()).replace(/\b(google|meta)\b(?! description)/g,w=>w.charAt(0).toUpperCase()+w.slice(1));
// The chosen proposal as Markdown, ready to edit, copy, download or save.
function toMarkdown(id,p,{project,answers,date}={}){const svc=need(id),pr=project||{},a=answers||{},day=date||new Date().toISOString().slice(0,10),out=[];
 out.push('# '+svc.title+' · '+p.title,'',(pr.name?'Progetto: '+clean(pr.name)+' · ':'')+svc.questions.map(q=>q.label+': '+labelOf(id,q.id,a[q.id])).join(' · ')+' · '+day);
 for(const s of svc.sections){const v=p.sections[s.key];if(!v||!v.length)continue;out.push('','## '+heading(s.label),'');
  if(s.list)v.forEach(x=>out.push('- '+x+(s.max?' ('+chars(x)+'/'+s.max+')':'')));else out.push(v+(s.max?' ('+chars(v)+'/'+s.max+')':''))}
 if(p.issues&&p.issues.length)out.push('','## Da controllare','',...p.issues.map(i=>'- '+issueText(i)));
 if(svc.note)out.push('','---',svc.note);
 return out.join('\n')}
const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
const filename=(id,p)=>need(id).file+'-'+(slug(p&&p.title)||'proposta')+'.md';
// Saved in the project: one exchange in the role's thread of the shared «agents» document, the same place the Agenti AI
// page reads. The text is a «---DOCUMENTO---» block, so it is listed and downloadable there like any agent document.
const MAX_KEPT=60;
function savedEntry(id,p,md,{by,at}={}){const svc=need(id),when=at||new Date().toISOString(),name=svc.title+' · '+p.title;
 return [{role:'user',content:svc.title+' scelto dal pannello Marketing: «'+p.title+'».',display:svc.title+' scelto nel pannello Marketing: «'+p.title+'»',by:by||'Pannello Marketing',at:when,source:'copy-studio'},
  {role:'assistant',agent:svc.role,content:'Ecco la proposta scelta, salvata nel progetto.\n\n---DOCUMENTO: '+name+'---\n'+md+'\n---FINE DOCUMENTO---',at:when,source:'copy-studio'}]}
async function saveToProject(ws,projectId,id,p,md,opts){const svc=need(id);if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const doc=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await doc.load())||{},conv={...(cur.conversations||{})};
  conv[svc.role]=(Array.isArray(conv[svc.role])?conv[svc.role]:[]).concat(savedEntry(id,p,md,opts)).slice(-MAX_KEPT);
  try{return await doc.save({...cur,schemaVersion:1,conversations:conv})}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}

// ---- browser widget ----
let counter=0;
const doc=()=>root.document;
const el=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
// ctx: {service (id), project (profile for the AI), memoryScope, projectId, workspace (RadixWorkspace, for «Salva nel progetto»), agentsUrl, by}
function copyStudio(ctx={}){const id=ctx.service,svc=need(id),who=whoOf(id);
 const n=++counter,answers={},wrap=el('div',undefined,'tool photo-studio copy-studio'),pre=prefill(ctx.project);wrap.dataset.service=id;
 const steps=el('ol',undefined,'ps-steps');['Le domande','Scegli tra 3 proposte','Il testo'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const form=el('div',undefined,'ps-form'),qs=el('div',undefined,'ps-questions');
 for(const q of svc.questions){const fs=el('fieldset');fs.append(el('legend',q.label));q.options.forEach(([label,v])=>{const l=el('label',undefined,'ps-chip'),r=el('input');r.type='radio';r.name='cs-'+q.id+'-'+n;r.value=v;r.checked=v===fallback(q);r.onchange=()=>{answers[q.id]=v};l.append(r,doc().createTextNode(' '+label));fs.append(l)});qs.append(fs)}
 const fields=el('div',undefined,'cs-fields'),inputs={};
 for(const f of svc.fields){const l=el('label',f.label+(f.need?' *':''),f.rows>1?'cs-wide':''),i=el(f.rows>1?'textarea':'input');if(f.rows>1)i.rows=f.rows;else i.type='text';
  i.maxLength=f.max||FIELD_MAX;i.value=f.from?pre[f.from]||'':'';i.placeholder=f.ph||'';l.append(i);fields.append(l);inputs[f.id]=i}
 const go=button('✦ Prepara 3 proposte','primary'),cost=el('span','Una chiamata AI '+whoOf(id,'a')+': ti chiedo conferma prima.','muted'),status=el('p','','tool-status');status.setAttribute('role','status');
 const bar=el('div',undefined,'ps-actions');bar.append(go,cost);form.append(qs,fields);if(svc.note)form.append(el('p',svc.note,'cs-note'));form.append(bar);
 const grid=el('div',undefined,'ps-grid cs-grid'),result=el('div',undefined,'cs-result');grid.hidden=result.hidden=true;
 wrap.append(steps,form,status,grid,result);setStep(1);
 const lock=on=>{go.disabled=on;wrap.querySelectorAll('.ps-form input,.ps-form textarea').forEach(x=>x.disabled=on)};
 let asked={};
 go.onclick=async()=>{let prompt;const values={project:ctx.project};for(const k in inputs)values[k]=inputs[k].value;
  try{prompt=proposalsPrompt(id,answers,values)}catch(e){status.textContent=e.message;const f=svc.fields.find(f=>e.message.includes('«'+f.label+'»'));if(f)inputs[f.id].focus();return}
  const rt=root.RadixAgents;if(!rt||typeof rt.reply!=='function'){status.textContent='Gli agenti non si sono caricati: ricarica la pagina.';return}
  if(!root.confirm('Preparare 3 proposte di «'+svc.title+'» con '+who+' AI? È una sola chiamata AI: usa crediti API.'))return;
  lock(true);setStep(2);status.textContent=who.charAt(0).toUpperCase()+who.slice(1)+' prepara le 3 proposte…';grid.hidden=false;grid.replaceChildren();result.hidden=true;
  asked={answers:{...answers}};
  try{const r=await rt.reply({role:svc.role,project:ctx.project,memoryScope:ctx.memoryScope,messages:[{role:'user',content:prompt}]});const list=parseProposals(id,r&&r.text,inputText(id,values));
   if(!list.length)throw Error('la risposta non contiene proposte leggibili. Riprova.');
   status.textContent=(list.length<COUNT?'Sono arrivate '+list.length+' proposte su '+COUNT+'. ':'')+'Confrontale e scegli quella da usare.'+(list.some(p=>p.issues.length)?' Alcune hanno punti da controllare.':'');
   grid.replaceChildren(...list.map(card));go.textContent='↺ Prepara altre 3 proposte'}
  catch(e){status.textContent='Proposte non preparate: '+e.message;setStep(1);grid.hidden=true}
  finally{lock(false)}};
 function card(p,i){const f=el('article',undefined,'ps-card cs-card'),use=button('Scegli questa','primary');
  f.append(el('h3',(i+1)+' · '+p.title));
  for(const s of svc.sections){const v=p.sections[s.key];if(!v||!v.length)continue;const d=el('div',undefined,'cs-sec');d.append(el('h4',heading(s.label)+(s.list?' · '+v.length:'')));
   if(s.list){const l=el('ul');v.forEach(x=>{const li=el('li',x);if(s.max){const c=el('span',' '+chars(x)+'/'+s.max,'cs-count');c.dataset.over=String(chars(x)>s.max);li.append(c)}l.append(li)});d.append(l)}
   else d.append(el('p',v.length>600?v.slice(0,600)+'…':v,'cs-text'));f.append(d)}
  if(p.issues.length){const w=el('ul',undefined,'cs-issues');p.issues.forEach(x=>w.append(el('li',issueText(x))));f.append(w)}
  use.onclick=()=>choose(p,f);f.append(use);return f}
 function choose(p,cardEl){grid.querySelectorAll('.cs-card').forEach(x=>x.dataset.chosen=String(x===cardEl));setStep(3);result.hidden=false;
  const out=el('textarea');out.rows=14;out.value=toMarkdown(id,p,{project:ctx.project,answers:asked.answers});out.setAttribute('aria-label','Testo scelto, modificabile');
  const st=el('p','Il testo scelto: modificalo qui, poi copialo, scaricalo o salvalo nel progetto.','tool-status');st.setAttribute('role','status');
  const copy=button('Copia'),dl=button('Scarica .md'),acts=el('div',undefined,'ps-actions');acts.append(copy,dl);
  copy.onclick=async()=>{try{await root.navigator.clipboard.writeText(out.value);st.textContent='Testo copiato.'}catch(e){out.focus();out.select();st.textContent='Copia non riuscita: il testo è selezionato, usa Ctrl+C.'}};
  dl.onclick=()=>{const a=el('a');a.href=root.URL.createObjectURL(new root.Blob([out.value],{type:'text/markdown;charset=utf-8'}));a.download=filename(id,p);doc().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),2000);st.textContent='Testo scaricato: '+a.download+'.'};
  if(ctx.workspace&&ctx.projectId){const save=button('Salva nel progetto','primary');acts.prepend(save);
   save.onclick=async()=>{save.disabled=true;st.textContent='Salvo il testo nel progetto…';
    try{await saveToProject(ctx.workspace,ctx.projectId,id,p,out.value,{by:ctx.by});save.textContent='Salvato ✓';st.replaceChildren(doc().createTextNode('Testo salvato nel progetto: lo trova tutto il team tra i documenti '+whoOf(id,'di')+'. '));
     if(ctx.agentsUrl){const a=el('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;st.append(a)}}
    catch(e){st.textContent='Testo non salvato: '+e.message;save.disabled=false}}}
  result.replaceChildren(el('h3','Il testo scelto · '+p.title),acts,st,out);result.scrollIntoView&&result.scrollIntoView({behavior:'smooth',block:'nearest'})}
 return wrap}
return Object.freeze({SERVICES,COUNT,service,sectionsFor,prefill,projectFacts,proposalsPrompt,parseProposals,fit,unverifiedNumbers,inputText,issueText,toMarkdown,filename,savedEntry,saveToProject,labelOf,whoOf,copyStudio});
});
