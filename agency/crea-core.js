/* «Cosa vuoi fare oggi?»: the single Marketing panel. One card per service, each opening the tool that already does it
   (strategy, PED, avatar) or a guided studio inline (photo, avatar video, the reel without an avatar rendered in the browser (lib/reel-studio.js), site, SEO and GEO, the SEO/GEO audit of the existing site (lib/site-audit.js, free crawl + optional AI plan), ad creatives in every format (lib/ad-studio.js), Google Business Profile listing and review replies (lib/gbp-studio.js), the coordinated event kit with its webinar variant (lib/event-studio.js: one AI call, then every file built here), product sheets in bulk and the Google Merchant feed with its checks (lib/product-studio.js), translation and localisation into EN, DE, FR and ES with its checks (lib/translation-studio.js: 3 tones, then confirmed batches), the responsive HTML newsletter with its checks (lib/newsletter-studio.js, no AI), identity kit, print, product catalogue and designed documents with no AI (lib/print-studio.js, lib/catalog-studio.js, lib/doc-studio.js), and the text services of
   lib/copy-studio.js: inline 'copy:<service>'). Each card has a `group`, one of GROUPS, for the panel's filters.
   Pure part (cards, groups, links) runs in Node for the tests; the page lives in agency/crea.html. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrea=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// The panel's filters, in order; every card has one.
const GROUPS=['Brand','Strategia','Web e annunci','Social e contenuti','Email e SMS','Stampa e documenti','Immagini','Video'];
// Short URL names of the groups, for links from other pages (Marketing Orbit): /agency/crea.html?area=web.
const AREAS=Object.freeze({brand:'Brand',strategia:'Strategia',web:'Web e annunci',social:'Social e contenuti',email:'Email e SMS',stampa:'Stampa e documenti',immagini:'Immagini',video:'Video'});
// state: 'ready' = guided tool in RADIX, 'agent' = for now an agent with a prefilled request (never sent on its own).
// cost: what the person is asked to confirm before anything is spent; no prices are invented here.
const CARDS=[
 {id:'strategy',group:'Strategia',icon:'◎',title:'Strategia',line:'Obiettivi, pubblico e tono: RADIX propone 3 direzioni e tu scegli.',state:'ready',action:'Imposta la strategia',cost:'Una chiamata AI, con conferma.',href:'/project-editorial.html?project={p}#brief',noProject:'/agency/new-project.html'},
 {id:'lancio',group:'Strategia',icon:'➚',title:'Piano di lancio prodotto',line:'Fasi, canali e messaggi per lanciare un prodotto: 3 piani a 30, 60 e 90 giorni, scegli tu.',state:'ready',action:'Prepara il lancio',cost:'Una chiamata AI al Digital Strategist, con conferma.',inline:'copy:lancio'},
 {id:'persona',group:'Strategia',icon:'☺',title:'Buyer persona',line:'Tre persona dai tuoi clienti migliori: obiettivi, problemi, obiezioni, canali e messaggio. Le deduzioni sono segnate «ipotesi da verificare».',state:'ready',action:'Disegna le persona',cost:'Una chiamata AI allo Stratega di Marca, con conferma.',inline:'copy:persona'},
 {id:'concorrenza',group:'Strategia',icon:'⇄',title:'Analisi della concorrenza',line:'Fino a 5 concorrenti con quello che sai di loro: mappa di posizionamento, punti forti e deboli, opportunità. 3 letture, scegli tu.',state:'ready',action:'Analizza i concorrenti',cost:'Una chiamata AI allo Stratega di Marca, con conferma.',inline:'copy:concorrenza',hint:'RADIX non legge ancora i siti dei concorrenti: ciò che non scrivi tu è segnato come ipotesi.'},
 {id:'naming',group:'Brand',icon:'✦',title:'Nome e slogan',line:'Idee di nome per la marca o un prodotto e lo slogan: 3 proposte, scegli tu.',state:'ready',action:'Trova nome e slogan',cost:'Una chiamata AI allo Stratega di Marca, con conferma.',inline:'copy:naming',hint:'Il marchio va verificato su UIBM, TMview e WIPO prima di usarlo.'},
 {id:'identita',group:'Brand',icon:'◐',title:'Kit identità',line:'Logo, palette, font e moodboard: 3 direzioni con il contrasto già controllato, scegli e scarichi il kit.',state:'ready',action:'Crea il kit identità',cost:'Una chiamata AI allo Stratega di Marca, con conferma.',inline:'identity',hint:'Il logo è una bozza: verifica il marchio su UIBM, TMview e WIPO prima di usarlo.'},
 {id:'tono',group:'Brand',icon:'♪',title:'Tono di voce per canale',line:'Come parla la marca su sito, LinkedIn, Instagram, email e WhatsApp: tratti, sì e no, frasi d’esempio. 3 personalità, scegli tu.',state:'ready',action:'Definisci il tono',cost:'Una chiamata AI allo Stratega di Marca, con conferma.',inline:'copy:tono'},
 {id:'social',group:'Social e contenuti',icon:'▦',title:'Social e post',line:'Il piano editoriale del mese: calendario, testi e pubblicazione su Buffer.',state:'ready',action:'Apri il piano editoriale',cost:'Ogni testo AI chiede conferma; pubblicare è sempre un tuo clic.',href:'/project-editorial.html?project={p}#ped'},
 {id:'graphics',group:'Social e contenuti',icon:'▣',title:'Post grafici',line:'Caroselli e post con testo sopra, nei colori del brand.',state:'ready',action:'Crea dai post del piano',cost:'L’Art Director AI chiede conferma prima di disegnare.',href:'/project-editorial.html?project={p}#ped',hint:'Apri un post del piano e premi «Grafica».'},
 {id:'testi',group:'Social e contenuti',icon:'¶',title:'Testi per sito, blog e prodotti',line:'Una pagina del sito, un articolo o una descrizione prodotto: 3 versioni, scegli e modifichi.',state:'ready',action:'Scrivi un testo',cost:'Una chiamata AI al Content e UX Writer, con conferma.',inline:'copy:testi'},
 {id:'comunicato',group:'Social e contenuti',icon:'☰',title:'Comunicato stampa',line:'Titolo, attacco con le 5W, corpo, citazione, profilo aziendale e contatti: 3 angoli, scegli e modifichi.',state:'ready',action:'Scrivi il comunicato',cost:'Una chiamata AI al Copywriter, con conferma.',inline:'copy:comunicato',hint:'Citazioni solo dalle persone che indichi tu; superlativi senza dati segnalati.'},
 {id:'influencer',group:'Social e contenuti',icon:'★',title:'Brief per influencer',line:'Obiettivo, consegne, menzioni obbligatorie, dicitura di pubblicità, cosa fare e non fare, tempi e KPI: 3 brief, scegli tu.',state:'ready',action:'Prepara il brief',cost:'Una chiamata AI al Social Media Manager, con conferma.',inline:'copy:influencer'},
 {id:'evento',group:'Social e contenuti',icon:'◷',title:'Evento o fiera',line:'Fiera, open day, inaugurazione, workshop o Webinar: il kit coordinato prima, durante e dopo (invito, landing con consenso, post e countdown, roll-up, flyer, badge, slide, email di grazie e follow-up). 3 direzioni, scegli tu.',state:'ready',action:'Prepara il kit evento',cost:'Una chiamata AI allo Stratega di Marca, con conferma. I file del kit si creano qui, senza costi.',inline:'event',hint:'Date, orari e luoghi uguali in ogni materiale, controllati da RADIX. Nessuna email parte da qui: il follow-up passa al CRM.'},
 {id:'newsletter',group:'Email e SMS',icon:'✉',title:'Newsletter',line:'Oggetto, anteprima e testo della mail: 3 versioni, scegli e modifichi.',state:'ready',action:'Scrivi la newsletter',cost:'Una chiamata AI al Copywriter, con conferma.',inline:'copy:newsletter'},
 {id:'emailhtml',group:'Email e SMS',icon:'✉',title:'Newsletter HTML',line:'Dal testo della newsletter all’email pronta per le caselle: 3 modelli con i colori del kit, anteprima su computer e telefono, blocchi da rifinire e 10 controlli prima dell’export.',state:'ready',action:'Impagina la newsletter',cost:'Nessuna chiamata AI: l’HTML si crea qui, senza costi.',inline:'mail',hint:'RADIX non invia email da qui: scarichi l’HTML o passi il testo alla campagna CRM.'},
 {id:'sequenze',group:'Email e SMS',icon:'⋯',title:'Sequenze email',line:'Benvenuto, nurturing, riattivazione o carrello: da 3 a 5 email con tempi, oggetto, anteprima e invito, con i campi del CRM. Scarichi anche il CSV.',state:'ready',action:'Scrivi la sequenza',cost:'Una chiamata AI al Copywriter, con conferma.',inline:'copy:sequenze'},
 {id:'sms',group:'Email e SMS',icon:'▯',title:'SMS',line:'3 varianti entro 160 caratteri, con mittente e testo per disiscriversi: conto dei caratteri e degli SMS già fatto.',state:'ready',action:'Scrivi l’SMS',cost:'Una chiamata AI al Copywriter, con conferma.',inline:'copy:sms',hint:'L’invio richiede un fornitore SMS: RADIX prepara solo i testi.'},
 {id:'images',group:'Immagini',icon:'◉',title:'Immagini',line:'Foto per post e sito: poche domande, 3 proposte, scegli e componi.',state:'ready',action:'Crea un’immagine',cost:'3 generazioni Higgsfield, con conferma.',inline:'photo'},
 {id:'fotoprodotto',group:'Immagini',icon:'◫',title:'Foto prodotto',line:'Le foto vere del prodotto, anche in blocco: scontorno nel browser, fondo bianco puro per Amazon e Google o colore del brand, oppure 3 ambientazioni. Bordi rifiniti, controlli ed export a 2000, 1200 e 1080 px.',state:'ready',action:'Prepara le foto prodotto',cost:'Scontorno, fondo bianco e controlli senza chiamate AI, gratuiti. Le ambientazioni sono facoltative: 3 generazioni OpenAI, con conferma.',inline:'productphoto',hint:'L’AI disegna solo lo sfondo: forma, colori ed etichette restano quelli della tua foto.'},
 {id:'avatar',group:'Video',icon:'☺',title:'Avatar',line:'Il volto del brand per i video: disegnato dall’AI o dalla tua foto.',state:'ready',action:'Crea l’avatar',cost:'Ogni passo HeyGen chiede conferma.',href:'/agency/avatar.html?project={p}'},
 {id:'video',group:'Video',icon:'▶',title:'Video',line:'Video brevi con l’avatar che parla: poche domande, 3 copioni, scegli e crei la bozza.',state:'ready',action:'Fai parlare l’avatar',cost:'Una chiamata AI per i copioni e una bozza HeyGen, ognuna con conferma.',inline:'video'},
 {id:'reel',group:'Video',icon:'▶',title:'Reel e video prodotto',line:'Un reel senza avatar dalle tue foto (e clip brevi): 3 storyboard con gancio, testi a schermo e sottotitoli, rifinisci scena per scena e crei il video qui, con .srt e .vtt.',state:'ready',action:'Crea il reel',cost:'Una chiamata AI al Video Producer per i 3 storyboard, con conferma. Il video si crea nel browser, senza crediti.',inline:'reel',hint:'RADIX non genera musica né voce: se vuoi, carichi tu un brano con licenza.'},
 {id:'site',group:'Web e annunci',icon:'⌂',title:'Sito web',line:'Una landing o un piccolo sito: poche domande, 3 proposte con anteprima, scegli e scarichi o salvi.',state:'ready',action:'Prepara il sito',cost:'Una chiamata AI al Web Developer, con conferma.',inline:'site'},
 {id:'seo',group:'Web e annunci',icon:'⌖',title:'SEO e GEO',line:'Farsi trovare su Google e citare dalle AI: poche domande, 3 strategie, scegli e salvi il piano. In «Risultati SEO» importi Search Console e l’AI consiglia i prossimi passi.',state:'ready',action:'Prepara la strategia SEO',cost:'Una chiamata AI allo Specialista SEO e GEO, con conferma.',inline:'seo'},
 {id:'analisi',group:'Web e annunci',icon:'⌕',title:'Analisi del sito',line:'L’audit SEO e GEO del sito che c’è già: tecnica, contenuti, dati strutturati, SEO locale e pronti per le AI. Punteggio per area, problemi con le pagine e come risolverli, report PDF.',state:'ready',action:'Analizza il sito',cost:'Nessuna chiamata AI per l’analisi: è gratuita. Il piano 30/60/90 è facoltativo: una chiamata AI allo Specialista SEO e GEO, con conferma.',inline:'audit',hint:'Legge robots.txt, la sitemap e fino a 25 pagine pubbliche del sito, rispettando robots.txt.'},
 {id:'annunci',group:'Web e annunci',icon:'◆',title:'Testi per annunci Google e Meta',line:'Titoli e descrizioni nei limiti di Google e Meta: 3 set, scegli e copi. Le campagne restano nel tuo account.',state:'ready',action:'Scrivi gli annunci',cost:'Una chiamata AI al Paid Media Specialist, con conferma.',inline:'copy:annunci'},
 {id:'creativita',group:'Web e annunci',icon:'▧',title:'Creatività per annunci',line:'Gli annunci disegnati in tutti i formati: Meta feed e stories, Google Display, LinkedIn. 3 direzioni con zone sicure e contrasto controllati, rifinisci e scarichi lo zip.',state:'ready',action:'Crea le creatività',cost:'Una chiamata AI al Paid Media Specialist, con conferma. La foto AI è facoltativa: 1 generazione Higgsfield, con conferma a parte.',inline:'ads',hint:'Le campagne restano nel tuo account: RADIX prepara immagini e testi.'},
 {id:'google',group:'Web e annunci',icon:'⚲',title:'Scheda Google e recensioni',line:'La scheda Google Business Profile pronta da copiare: descrizione nei limiti, categorie, servizi, domande, 4 post e foto. E le risposte alle recensioni, 3 per ognuna.',state:'ready',action:'Prepara la scheda',cost:'Una chiamata AI per la scheda e una per le risposte, ognuna con conferma.',inline:'gbp',hint:'RADIX non pubblica su Google: copi i testi nella scheda su business.google.com.'},
 {id:'schede',group:'Web e annunci',icon:'▤',title:'Schede prodotto e feed',line:'Dal foglio prodotti a titoli, descrizioni, punti chiave, meta e alt per tutto il catalogo, solo dai dati del foglio: 3 stili su 3 prodotti, poi il resto a lotti. Feed Google Merchant controllato, in TSV e XML.',state:'ready',action:'Prepara le schede',cost:'Una chiamata AI per i 3 stili, poi una ogni 10 prodotti: ti dico quante prima di partire, con conferma. Il controllo del feed è gratuito.',inline:'feed',hint:'RADIX non carica il feed su Merchant Center: scarichi i file e li carichi tu.'},
 {id:'traduzione',group:'Web e annunci',icon:'⇄',title:'Traduzione e localizzazione',line:'Sito, catalogo, schede prodotto o post in inglese, tedesco, francese e spagnolo: 3 toni sui primi 3 testi, poi il resto a lotti. Numeri, codici, link e lunghezze controllati, glossario rispettato, export nello stesso formato.',state:'ready',action:'Traduci i testi',cost:'Una chiamata AI al Copywriter per i 3 toni, poi una per lotto: ti dico prima quante, con conferma.',inline:'translate',hint:'Codici, link, email e telefoni non vanno all’AI; i testi tecnici e legali sono segnalati per la revisione di un madrelingua.'},
 {id:'stampa',group:'Stampa e documenti',icon:'⎙',title:'Stampa e documenti',line:'Biglietto da visita, flyer, locandine fino all’A2, roll-up, carta intestata e brochure a 3 ante: 3 layout dal kit, colori CMYK, controllo prestampa e PDF pronto per la tipografia.',state:'ready',action:'Prepara il PDF',cost:'Nessuna chiamata AI: il PDF si crea qui, senza costi.',inline:'print',hint:'PDF/X-1a in CMYK FOGRA39 con i testi in tracciati: la tipografia fa comunque il suo preflight.'},
 {id:'catalogo',group:'Stampa e documenti',icon:'☷',title:'Catalogo prodotti',line:'Dal foglio Excel o CSV dei prodotti: copertina, schede con foto e prezzi, contatti. PDF per la tipografia e per il web.',state:'ready',action:'Crea il catalogo',cost:'Nessuna chiamata AI: il PDF si crea qui, senza costi.',inline:'catalog',hint:'Fino a 500 prodotti; le foto si scelgono insieme al foglio.'},
 {id:'brochure',group:'Stampa e documenti',icon:'▤',title:'Brochure e company profile',line:'I testi di una brochure o del company profile, sezione per sezione: 3 versioni, scegli tu.',state:'ready',action:'Scrivi la brochure',cost:'Una chiamata AI al Copywriter, con conferma.',inline:'copy:brochure'},
 {id:'scheda',group:'Stampa e documenti',icon:'▥',title:'Scheda tecnica',line:'Caratteristiche, misure e materiali in ordine, solo dai dati che scrivi tu: 3 impostazioni, scegli tu.',state:'ready',action:'Prepara la scheda',cost:'Una chiamata AI al Copywriter, con conferma.',inline:'copy:scheda',hint:'Nessun dato inventato: i numeri che non hai scritto vengono segnalati.'},
 {id:'presentazione',group:'Stampa e documenti',icon:'▭',title:'Presentazione',line:'La scaletta slide per slide: titolo, punti e cosa dire. 3 versioni, scegli e modifichi.',state:'ready',action:'Prepara la scaletta',cost:'Una chiamata AI allo Stratega di Marca, con conferma.',inline:'copy:presentazione'},
 {id:'documenti',group:'Stampa e documenti',icon:'▧',title:'Documenti impaginati',line:'Company profile, brochure, presentazione e scheda tecnica dai testi dello Studio Testi: 3 impaginazioni dal kit, rifinisci e scarichi PDF e PowerPoint.',state:'ready',action:'Impagina un documento',cost:'Nessuna chiamata AI: PDF e PowerPoint si creano qui, senza costi.',inline:'docs',hint:'Prima scrivi e salva il testo con Brochure, Presentazione o Scheda tecnica.'}
];
const ID=/^[a-z0-9-]{1,80}$/i;
// Where a card leads for a project; null when it opens inline (photo, product photos, video, reel, site, SEO, site audit, ad creatives, Google listing, product sheets and feed, translation, HTML newsletter, identity, print, catalogue or text studio) or needs a project that is missing.
function linkFor(card,projectId){
 const p=ID.test(String(projectId||''))?String(projectId):'';
 if(card.inline)return null;
 if(card.agent)return '/agents.html?agent='+card.agent+(p?'&project='+encodeURIComponent(p):'')+'&q='+encodeURIComponent(card.ask);
 if(!p)return card.noProject||null;
 return card.href.replace('{p}',encodeURIComponent(p));
}
function card(id){return CARDS.find(c=>c.id===id)||null}
// The filters that have cards, in GROUPS order; '' (or an unknown group) is «Tutti».
const groups=()=>GROUPS.filter(g=>CARDS.some(c=>c.group===g));
const inGroup=group=>groups().includes(group)?CARDS.filter(c=>c.group===group):CARDS;
const areaOf=group=>Object.keys(AREAS).find(k=>AREAS[k]===group)||'';
// ?area=<slug> picks the filter, ?open=<card id> also opens that studio once a project is chosen (its group wins
// when no area is given). Unknown values are ignored: {group:'',open:''} is the page as it always was.
function fromQuery(search){
 let q;try{q=new URLSearchParams(String(search||''))}catch(e){return {group:'',open:''}}
 const a=String(q.get('area')||'').toLowerCase(),c=card(String(q.get('open')||'')),open=c&&c.inline?c.id:'';
 return {group:AREAS[a]&&groups().includes(AREAS[a])?AREAS[a]:c?c.group:'',open};
}
// ---- The command box «Cosa vuoi fare oggi?» (here and on the Marketing home, agency/orbit-core.js): text matching
// with no AI. Lower case, no accents, words of 2+ letters without the filler words.
const STOP=new Set('di da del della dei degli delle il lo la le gli un una uno per con su tra fra in a e o ed al alla ai agli alle che mi ci si mio mia miei mie tuo tua voglio vorrei fare fai oggi nuovo nuova nuovi nuove cosa come'.split(' '));
const fold=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const words=s=>fold(s).split(/[^a-z0-9]+/).filter(w=>w.length>=2&&!STOP.has(w));
// Everyday words that name a service without its title (deterministic: no AI reads the text).
const SYNONYMS=Object.freeze({post:['social','graphics'],instagram:['social'],facebook:['social'],linkedin:['social'],carosello:['graphics'],caroselli:['graphics'],
 logo:['identita'],marchio:['identita','naming'],colori:['identita'],palette:['identita'],font:['identita'],recensioni:['google'],recensione:['google'],scheda:['google','scheda'],
 mail:['newsletter','emailhtml'],email:['newsletter','sequenze'],sms:['sms'],whatsapp:['sms','tono'],sito:['site','analisi'],landing:['site'],pagina:['site','testi'],blog:['testi'],articolo:['testi'],
 seo:['seo','analisi'],google:['seo','google','annunci'],geo:['seo'],audit:['analisi'],video:['video','reel'],reel:['reel'],tiktok:['reel'],avatar:['avatar'],
 foto:['images'],fotografie:['images'],immagine:['images'],volantino:['stampa'],flyer:['stampa'],locandina:['stampa'],biglietto:['stampa'],biglietti:['stampa'],rollup:['stampa'],
 catalogo:['catalogo'],brochure:['brochure'],presentazione:['presentazione'],slide:['presentazione'],traduci:['traduzione'],tradurre:['traduzione'],inglese:['traduzione'],tedesco:['traduzione'],
 annunci:['annunci','creativita'],ads:['annunci','creativita'],banner:['creativita'],comunicato:['comunicato'],stampa:['comunicato','stampa'],evento:['evento'],fiera:['evento'],webinar:['evento'],
 nome:['naming'],slogan:['naming'],concorrenti:['concorrenza'],concorrenza:['concorrenza'],persona:['persona'],pubblico:['persona','strategy'],lancio:['lancio'],lanciare:['lancio'],
 tono:['tono'],influencer:['influencer'],prodotti:['schede','catalogo'],feed:['schede'],strategia:['strategy'],piano:['social','strategy'],calendario:['social']});
const near=(t,w)=>t===w||(t.length>=4&&w.length>=4&&(w.startsWith(t)||t.startsWith(w)));
// The services that match the typed text, best first: [{card,score}]; score 0 is never returned. Same text, same list.
function matchServices(query,cards){
 const list=Array.isArray(cards)?cards:CARDS,tokens=words(query);if(!tokens.length)return [];
 return list.map((card,i)=>{
  const title=words(card.title),group=words(card.group),line=words(card.line+' '+(card.action||''));let score=0;
  for(const t of tokens){
   if(title.some(w=>near(t,w)))score+=3;else if(group.some(w=>near(t,w)))score+=2;else if(line.some(w=>near(t,w)))score+=1;
   if((SYNONYMS[t]||[]).includes(card.id))score+=4;
  }
  return {card,score,i};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.i-b.i).map(({card,score})=>({card,score}));
}
// A match is good enough to preselect from score 3 (a title word, or a synonym): the same bar as the home's Enter.
const SURE=3;
const best=q=>{const m=matchServices(q)[0];return m&&m.score>=SURE?m.card.id:''};
// ?q=<text>&project=<id> (from the home's command box): the text to prefill, the project asked for and the service to
// preselect (its id, '' when nothing matches well). Nothing is opened or generated from this.
function fromAsk(search){
 let s;try{s=new URLSearchParams(String(search||''))}catch(e){return {q:'',project:'',match:''}}
 const q=String(s.get('q')||'').replace(/\s+/g,' ').trim().slice(0,200),p=String(s.get('project')||'');
 return {q,project:ID.test(p)?p:'',match:q?best(q):''};
}
// The short cost badge of a card, read from its cost line (no prices or credits are invented): free, one AI call,
// AI in batches, or the paid media service it uses. The full line stays on the card, before any click.
function costBadge(c){
 const t=String(c&&c.cost||'');
 if(/^Nessuna chiamata AI/.test(t))return {tone:'free',label:/facoltativ/.test(t)?'Gratis · AI facoltativa':'Gratis, senza AI'};
 const n=t.match(/^(\d+) generazioni Higgsfield/);if(n)return {tone:'media',label:n[1]+' foto Higgsfield'};
 if(/HeyGen/.test(t))return {tone:'media',label:/chiamata AI/.test(t)?'AI + HeyGen':'Crediti HeyGen'};
 if(/una ogni|una per lotto/.test(t))return {tone:'ai',label:'AI a lotti'};
 if(/^Una chiamata AI per [^,]+ e una per/.test(t))return {tone:'ai',label:'2 chiamate AI'};
 if(/^Una chiamata AI/.test(t))return {tone:'ai',label:'1 chiamata AI'};
 return {tone:'ai',label:'AI con conferma'};
}
// The kits: the services that hand over a whole set of coordinated files in one guided flow (what they deliver comes
// from the card's own line). Only cards that exist are returned.
const KITS=Object.freeze([
 {id:'identita',label:'Kit identità',files:'Logo, palette, font e moodboard'},
 {id:'evento',label:'Kit evento',files:'Invito, landing, post, roll-up, slide ed email'},
 {id:'creativita',label:'Kit annunci',files:'Meta, Google Display e LinkedIn in uno zip'},
 {id:'documenti',label:'Kit documenti',files:'Company profile, brochure e slide in PDF e PowerPoint'}
]);
const kits=()=>KITS.map(k=>({...k,card:card(k.id)})).filter(k=>k.card);
// The area number on tabs and headings: 01…08 in GROUPS order ('' for «Tutti» or an unknown group).
const areaNumber=group=>{const i=groups().indexOf(group);return i<0?'':String(i+1).padStart(2,'0')};
return Object.freeze({CARDS,GROUPS,AREAS,KITS,SYNONYMS,linkFor,card,groups,inGroup,areaOf,fromQuery,words,matchServices,best,fromAsk,costBadge,kits,areaNumber});
});
