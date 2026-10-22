/* Studio Testi: one guided studio for the text services of the Marketing panel (name and slogan, launch plan, Google and
   Meta ads, site/blog/product copy, newsletter, brochure, technical sheet, presentation, press release, buyer persona,
   competitor analysis, email sequences, tone of voice per channel, influencer brief, SMS). Each service is a config:
   a few questions, a few fields prefilled from the project profile, the sections each proposal has, the rules of its
   prompt and, for the agency-grade services, its automatic checks (lib/copy-checks.js). ONE AI call to the service's
   role writes three alternative proposals in a marker format, the person picks one, edits it, copies it, downloads it
   as Markdown or text (email sequences also as CSV) or saves it in the project (a document in that role's thread on
   the Agenti AI page). Pure part (configs, prefill, prompt, parsing, checks, Markdown, the saved entry) runs in Node for
   the tests; copyStudio() is the browser widget. The only paid step is the AI call, started from a click with confirmation. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCopyStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const K=typeof module==='object'&&module.exports?require('./copy-checks.js'):root.RadixCopyChecks;
const COUNT=3,FIELD_MAX=400,DATA_MAX=4000,MAX_ITEMS=20,MAX_TEXT=6000;
// Shared questions. Italian label → words for the prompt; `def` is the default option (first when missing).
const TONE={id:'tone',label:'Tono',options:[['Semplice','semplice e chiaro, frasi brevi'],['Caldo','caldo e vicino, accogliente'],['Tecnico','preciso e concreto, da esperti'],['Elegante','elegante e misurato']]};
// Fields: `from` is the profile value they start from (prefill), `need` the minimum length when required, `rows` > 1 a textarea.
const OFFER={id:'offer',label:'Cosa fa l’attività e dove',from:'offer',need:10,rows:2,ph:'Es. forno artigianale a Torino: pane a lievito madre e dolci'};
const AUDIENCE={id:'audience',label:'A chi si rivolge',from:'audience',ph:'Es. famiglie del quartiere e uffici della zona'};
// The channels of the tone-of-voice grid (section key, label).
const CHANNELS=[['site','SITO'],['linkedin','LINKEDIN'],['instagram','INSTAGRAM'],['email','EMAIL'],['whatsapp','WHATSAPP']];
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
  rules:['Non inventare dati di mercato, fatturati, clienti, premi o risultati: dove servono scrivi «da verificare».']},
 // ---- agency-grade services (analisi-lavori-agenzia R1, S2, S3, E2, B4, C6, E4): each has its automatic checks (lint) ----
 {id:'comunicato',title:'Comunicato stampa',role:'copywriter',who:['il','Copywriter'],what:'comunicati stampa',file:'comunicato-stampa',
  questions:[{id:'kind',label:'Che notizia',options:[['Apertura','l’apertura di una nuova attività o sede'],['Prodotto','un prodotto o servizio nuovo'],['Evento','un evento'],['Premio','un premio o un riconoscimento ricevuto'],['Nomina','una nomina o un nuovo ingresso nel team'],['Dato','un dato o una ricerca dell’azienda']]},
   {id:'reach',label:'Per chi',options:[['Stampa locale','i giornali e i siti di notizie locali'],['Stampa di settore','le riviste e i siti del settore'],['Stampa nazionale','i giornali nazionali']]}],
  fields:[{id:'news',label:'La notizia in una frase',need:10,rows:2,ph:'Es. sabato 8 novembre apriamo il secondo forno, in via Po 12'},
   {id:'when',label:'Luogo e data del comunicato',need:4,ph:'Es. Torino, 3 novembre 2026'},
   {id:'facts',label:'Dettagli e dati veri (facoltativi)',rows:3,max:DATA_MAX,ph:'Chi, cosa, quando, dove, perché; numeri solo se sono veri'},
   {id:'people',label:'Chi può essere citato (facoltativo)',rows:2,ph:'Una persona per riga: Mario Rossi, titolare — cosa vuole dire'},
   {...OFFER,label:'Chi siete (per il profilo aziendale)'},
   {id:'press',label:'Contatto stampa',need:5,ph:'Es. Anna Bianchi, 333 1234567, stampa@fornorossi.it'}],
  sections:[{key:'headline',label:'TITOLO',max:90,hint:'breve, con la notizia, entro 90 caratteri'},{key:'subhead',label:'SOTTOTITOLO',hint:'una frase con il secondo fatto più importante'},
   {key:'dateline',label:'LUOGO E DATA',hint:'come scritti qui'},{key:'lead',label:'ATTACCO',hint:'chi, cosa, quando, dove e perché in circa 35 parole, massimo 60'},
   {key:'body',label:'CORPO',hint:'2-4 paragrafi in ordine di importanza, a piramide rovesciata'},{key:'quote',label:'CITAZIONE',hint:'«testo» — Nome Cognome, ruolo; solo persone indicate qui'},
   {key:'boiler',label:'PROFILO AZIENDALE',hint:'chi è l’azienda in 3-4 frasi, solo fatti scritti qui'},{key:'contacts',label:'CONTATTI STAMPA',hint:'come scritti qui'}],need:['lead','body'],
  rules:['Le tre proposte usano tre angoli diversi: la notizia secca, la storia delle persone, il dato o l’impatto sul territorio.','Struttura del comunicato italiano: titolo, sottotitolo, luogo e data, attacco con le 5W (chi, cosa, quando, dove, perché), corpo a piramide rovesciata, citazione, profilo aziendale, contatti stampa.','L’attacco sta entro 60 parole (meglio circa 35) e contiene la notizia.','Niente superlativi (il migliore, unico, leader, straordinario…) se un dato scritto qui non li dimostra.','Terza persona, tono giornalistico: niente toni pubblicitari né inviti all’acquisto.'],
  prompt:(a,v)=>{const names=K.quotable(v.people);return [names.length?'Puoi citare solo queste persone, con nome e ruolo come scritti qui: '+names.join('; ')+'. Non inventare altre persone né altre citazioni.':'Nessuna persona da citare: non scrivere citazioni tra virgolette e in CITAZIONE scrivi «nessuna citazione».',
   'In LUOGO E DATA scrivi esattamente: '+clean(v.when).slice(0,80)+'.','In CONTATTI STAMPA usa solo questi dati: '+clean(v.press).slice(0,200)+'.']},
  lint:(p,c)=>{const out=[],names=K.quotable(c.values.people);if(/^nessuna citazione/i.test(txt(p,'quote')))delete p.sections.quote;
   const n=K.words(p.sections.lead);if(n>60)out.push('L’attacco ha '+n+' parole: massimo 60 (meglio circa 35). Accorcialo.');
   K.superlatives(['headline','subhead','lead','body','quote'].map(k=>txt(p,k)).join('\n'),c.text).forEach(x=>out.push('«'+x.word+'» è un superlativo senza un dato che lo dimostri: toglilo o aggiungi il dato.'));
   K.quoteIssues(allText(p),names).forEach(x=>out.push('La citazione «'+x.quote+'…» è '+(names.length?'attribuita a chi non hai indicato: puoi citare solo '+names.join(', '):'senza una persona indicata da te: toglila')+'.'));
   [['dateline','il luogo e la data'],['boiler','il profilo aziendale'],['contacts','il contatto stampa']].forEach(([k,l])=>{if(!txt(p,k).trim())out.push('Manca '+l+'.')});
   return out.concat(numberIssues(allText(p),c.text))},
  note:'Prima di inviarlo fai approvare testo e citazione a chi la firma, allega 2-3 foto in alta risoluzione con le didascalie e scrivi ai giornalisti uno per uno, non in copia a tutti.'},
 {id:'persona',title:'Buyer persona',role:'brand-strategist',who:['lo','Stratega di Marca'],what:'set di buyer persona',file:'buyer-persona',
  questions:[{id:'market',label:'I clienti sono',options:[['Aziende','aziende (B2B)'],['Privati','privati (B2C)'],['Entrambi','aziende e privati']]},
   {id:'found',label:'Dove vi trovano di più',options:[['Passaparola','il passaparola'],['Google','Google e il sito'],['Social','i social'],['Negozio','il negozio o la sede'],['Fiere','fiere ed eventi']]}],
  fields:[OFFER,{id:'best',label:'I vostri clienti migliori di oggi',need:10,rows:3,max:DATA_MAX,ph:'Chi sono, cosa comprano, come vi hanno conosciuto'},{id:'why',label:'Perché vi scelgono (facoltativo)',rows:2,ph:'Es. pane che dura tre giorni, consegna in ufficio'},{id:'objections',label:'Obiezioni più frequenti (facoltative)',rows:2,ph:'Es. costa più del supermercato'}],
  sections:[1,2,3].map(n=>({key:'p'+n,label:'PERSONA '+n,hint:'le righe «Chi è: …», «Obiettivi: …», «Problemi: …», «Obiezioni: …», «Canali: …», «Messaggio: …»; ogni riga tranne Messaggio finisce con (dal cliente) o (ipotesi da verificare)'}))
   .concat([{key:'journey',label:'PERCORSO',list:true,hint:'fase (scoperta, valutazione, acquisto, fedeltà): punti di contatto e contenuti'},{key:'verify',label:'DA VERIFICARE',list:true,hint:'le ipotesi più importanti e come verificarle'}]),need:['p1'],
  rules:['Le tre proposte dividono i clienti in modo diverso: per bisogno, per tipo di cliente o settore, per momento d’acquisto.','Ogni proposta ha 3 persona realistiche, costruite sui clienti descritti qui: non inventare statistiche, percentuali o ricerche.','Ogni tratto finisce con «(dal cliente)» se viene da quello che è scritto qui, altrimenti con «(ipotesi da verificare)». Nel dubbio è un’ipotesi.'],
  lint:(p,c)=>{const out=[],have=[1,2,3].filter(n=>txt(p,'p'+n));if(have.length<3)out.push('Ci sono '+have.length+' persona su 3.');
   for(const n of have){const t=txt(p,'p'+n),tag='Persona '+n+': ';
    [['Chi è','chi (?:è|e)'],['Obiettivi','obiettivi'],['Problemi','problemi'],['Obiezioni','obiezioni'],['Canali','canali'],['Messaggio','messaggio']].filter(([,re])=>!hasLine(t,re)).forEach(([l])=>out.push(tag+'manca la riga «'+l+'».'));
    K.unlabelled(t,['Messaggio']).forEach(l=>out.push(tag+'«'+l.slice(0,70)+'» non dice se viene dal cliente o se è un’ipotesi da verificare.'));
    K.clientNumbers(t,c.text).forEach(x=>out.push(tag+'il numero «'+x+'» è segnato «dal cliente» ma non è nei dati che hai scritto.'))}
   return out},
  note:'Le righe «ipotesi da verificare» sono deduzioni: confermale con qualche telefonata o un breve sondaggio ai clienti prima di usarle per campagne e budget.'},
 {id:'concorrenza',title:'Analisi della concorrenza',role:'brand-strategist',who:['lo','Stratega di Marca'],what:'analisi della concorrenza',file:'analisi-concorrenza',
  questions:[{id:'focus',label:'Cosa confrontare',options:[['Tutto','offerta, prezzi, comunicazione e presenza online'],['Comunicazione','messaggi, tono e promesse'],['Offerta e prezzi','offerta, servizi e fascia di prezzo'],['Presenza online','sito, social e recensioni']]},
   {id:'reading',label:'Che lettura',options:[['Tre letture','tre letture diverse: difensiva, d’attacco e di nicchia'],['Difensiva','difensiva: tenere i clienti che avete'],['D’attacco','d’attacco: prendere clienti ai concorrenti'],['Di nicchia','di nicchia: trovare uno spazio libero']]}],
  fields:[OFFER,{id:'rivals',label:'Concorrenti: uno per riga, con sito e cosa sai',need:5,rows:5,max:DATA_MAX,ph:'Es. Panificio Verdi — www.panificioverdi.it — prezzi bassi, aperto anche la sera'},{id:'own',label:'I vostri punti forti e deboli (facoltativi)',rows:2,ph:'Es. pane più buono ma orari più corti'}],
  validate:v=>{const n=K.competitors(v.rivals).length;if(n>5)throw Error('In «Concorrenti: uno per riga, con sito e cosa sai» al massimo 5 concorrenti: ne hai scritti '+n+'.')},
  sections:[{key:'axes',label:'ASSI DELLA MAPPA',hint:'«Asse orizzontale: …» e «Asse verticale: …», poi una riga per concorrente e una per voi: «Nome: posizione (dal cliente o ipotesi da verificare)»'},
   {key:'table',label:'CONFRONTO',list:true,table:['Concorrente','Punti di forza','Punti deboli','Fonte'],hint:'una riga per concorrente: Nome | punti di forza | punti deboli | dal cliente oppure ipotesi da verificare'},
   {key:'gaps',label:'OPPORTUNITÀ',list:true,hint:'3-5 spazi liberi o mosse possibili'},{key:'verify',label:'DA VERIFICARE',list:true,hint:'cosa controllare su siti, social e recensioni'}],need:['table'],
  rules:['Usa solo quello che è scritto qui sui concorrenti: nessuno ha letto i loro siti. Tutto il resto è un’ipotesi e va segnato «ipotesi da verificare».','Non inventare prezzi, numeri, recensioni, quote di mercato, follower o indirizzi web.'],
  prompt:(a,v)=>{const list=K.competitors(v.rivals),r=a.reading||'';return ['Concorrenti da confrontare ('+list.length+'): '+list.map(x=>x.name+(x.url?' ('+x.url+')':'')).join('; ')+'. Nel CONFRONTO c’è una riga per ognuno, con il nome scritto così.',
   !r||/^tre letture/.test(r)?'Le tre proposte sono una lettura difensiva, una d’attacco e una di nicchia.':'Le tre proposte seguono la stessa lettura con assi della mappa diversi.']},
  lint:(p,c)=>{const out=[],table=txt(p,'table'),all=allText(p,['verify']);
   K.unlabelled(table).forEach(l=>out.push('Confronto: «'+l.slice(0,70)+'» non dice se viene da te o se è un’ipotesi da verificare.'));
   K.unlabelled(txt(p,'axes'),['Asse orizzontale','Asse verticale','Assi']).forEach(l=>out.push('Mappa: «'+l.slice(0,70)+'» non dice se viene da te o se è un’ipotesi da verificare.'));
   K.competitors(c.values.rivals).forEach(x=>{if(!normText(table).includes(normText(x.name)))out.push('Nel confronto manca «'+x.name+'».')});
   K.unknownUrls(all,c.text).forEach(h=>out.push('Il sito «'+h+'» non è tra quelli che hai scritto: verificalo o toglilo.'));
   return out.concat(numberIssues(all,c.text))},
  note:'RADIX non ha letto i siti dei concorrenti: l’analisi usa solo quello che hai scritto. Le righe «ipotesi da verificare» vanno controllate su siti, social e recensioni prima di decidere.'},
 {id:'sequenze',title:'Sequenze email',role:'copywriter',who:['il','Copywriter'],what:'sequenze email automatiche',file:'sequenza-email',
  questions:[{id:'kind',label:'Che sequenza',options:[['Benvenuto','benvenuto a chi si è appena iscritto o è appena diventato cliente'],['Nurturing','nurturing: accompagnare chi ha chiesto informazioni o un preventivo fino alla decisione'],['Riattivazione','riattivazione di clienti che non comprano da tempo'],['Carrello','carrello abbandonato: chi ha lasciato prodotti nel carrello del negozio online']]},
   {id:'count',label:'Quante email',options:[['3','3 email'],['4','4 email'],['5','5 email']]},
   {id:'pace',label:'Ritmo',options:[['Ravvicinato','ravvicinato: un’email ogni 1-3 giorni'],['Settimanale','settimanale: un’email a settimana']]},TONE],
  fields:[OFFER,AUDIENCE,{id:'goal',label:'Cosa deve fare chi legge alla fine',need:5,ph:'Es. prenotare una prova gratuita su www.esempio.it'},{id:'facts',label:'Offerte, link e fatti veri (facoltativi)',rows:3,max:DATA_MAX,ph:'Solo cose vere: sconti attivi, link, orari, garanzie'}],
  sections:[{key:'plan',label:'STRATEGIA',hint:'2-3 frasi: per chi è e l’arco della sequenza'},
   {key:'emails',label:'SEQUENZA',hint:'per ogni email «### Email n · Giorno x», poi le righe «Scopo: …», «Oggetto: …» (entro 60 caratteri), «Anteprima: …» (entro 100), «Testo:» con il testo sotto, «Invito: …» (il testo del pulsante)',
    summary:v=>K.parseSequence(v).map(e=>'Email '+e.n+(e.invio?' · '+e.invio:'')+' — '+(e.subject||'senza oggetto')+' ('+[...e.subject].length+'/60)')},
   {key:'exit',label:'USCITA',list:true,hint:'quando un contatto esce dalla sequenza: risponde, compra, si disiscrive'},{key:'metrics',label:'METRICHE',list:true,hint:'cosa misurare, senza obiettivi numerici inventati'}],need:['emails'],
  rules:['Ogni email ha uno scopo diverso e un solo invito all’azione.','Campi dinamici del CRM, scritti esattamente così: {{nome}}, {{cognome}}, {{azienda}}, {{ruolo}}, {{settore}}, {{città}}; con un testo di riserva se il dato può mancare, per esempio {{nome|Ciao}}. Non usare altri segnaposto come [Nome] o {nome}.','Non scrivere la riga per disiscriversi né i dati legali del mittente: li aggiunge il sistema di invio.'],
  prompt:a=>{const n=countOf(a);return ['La sequenza ha esattamente '+n+' email, numerate da 1 a '+n+', ognuna con il giorno di invio contato dall’inizio (Giorno 0 la prima).']},
  lint:(p,c)=>{const t=txt(p,'emails'),list=K.parseSequence(t),n=countOf(c.answers),out=[];
   if(list.length!==n)out.push('La sequenza ha '+list.length+' email invece di '+n+'.');
   for(const e of list){const tag='Email '+e.n+': ',len=[...e.subject].length;
    if(!e.invio)out.push(tag+'manca quando si invia.');
    if(!e.subject)out.push(tag+'manca l’oggetto.');else if(len>60)out.push(tag+'l’oggetto ha '+len+' caratteri: massimo 60.');
    if(!e.preheader)out.push(tag+'manca l’anteprima.');else if([...e.preheader].length>100)out.push(tag+'l’anteprima ha '+[...e.preheader].length+' caratteri: massimo 100.');
    if(!e.body)out.push(tag+'manca il testo.');if(!e.cta)out.push(tag+'manca l’invito all’azione.')}
   const tags=K.tagIssues(t);tags.unknown.forEach(x=>out.push('Il campo '+x+' non esiste nel CRM: usa {{nome}}, {{azienda}}, {{città}}…'));tags.foreign.forEach(x=>out.push('«'+x+'» non è un campo del CRM: scrivilo come {{nome}}.'));
   return out.concat(numberIssues(t.replace(/\b(?:giorno|giorni|settimana|settimane|ore|email)\s+\d+\b|\b\d+\s*(?:giorni|ore|settimane|email)\b/gi,''),c.text))},
  csv:md=>K.sequenceCsv(K.parseSequence(sectionOf(md,'SEQUENZA')||md)),
  note:'Il link per disiscriversi e i dati del mittente li aggiunge il sistema di invio. Invia solo a chi ha dato il consenso. Il CSV ha una riga per email, da caricare nel programma di invio.'},
 {id:'tono',title:'Tono di voce per canale',role:'brand-strategist',who:['lo','Stratega di Marca'],what:'guide al tono di voce per canale',file:'tono-per-canale',
  questions:[{id:'address',label:'Del tu o del lei',options:[['Tu','sempre del tu'],['Lei','sempre del lei'],['Dipende dal canale','del tu o del lei a seconda del canale: scegli tu e scrivilo per ogni canale']]},
   {id:'trait',label:'Carattere',options:[['Caldo','caldo e vicino'],['Tecnico','tecnico e preciso'],['Ironico','ironico, mai offensivo'],['Autorevole','autorevole e sicuro']]}],
  fields:[OFFER,AUDIENCE,{id:'samples',label:'Come scrivete oggi (facoltativo)',rows:4,max:DATA_MAX,ph:'Incolla 2-3 testi vostri: un post, una mail, una risposta a un cliente'},{id:'banned',label:'Parole da non usare (facoltative)',ph:'Es. eccellenza, leader, top'}],
  sections:[{key:'traits',label:'TRATTI',list:true,hint:'3-4 tratti: «Tratto: è … / non è …»'}].concat(CHANNELS.map(([key,label])=>({key,label,hint:'le righe «Registro: …» (tu o lei, lunghezza, emoji sì o no), «Sì: …», «No: …», «Esempio: …» (una frase pronta sull’attività vera)'})),
   [{key:'yes',label:'PAROLE SÌ',list:true,hint:'8-12 parole o espressioni da usare'},{key:'no',label:'PAROLE NO',list:true,hint:'8-12 parole da evitare, con l’alternativa'}]),need:['traits','site'],
  rules:['Le tre proposte sono tre personalità diverse dentro il carattere scelto.','Gli esempi parlano dell’attività vera descritta qui, senza promesse, numeri o offerte inventate.','Ogni canale ha le sue regole: sito chiaro e completo, LinkedIn professionale, Instagram breve e visivo, email personale, WhatsApp brevissimo e diretto.'],
  prompt:(a,v)=>{const b=bannedOf(v.banned);return b.length?['Non usare mai queste parole, tranne in PAROLE NO: '+b.join(', ')+'.']:[]},
  lint:(p,c)=>{const out=[],lei=/^sempre del lei/.test(c.answers.address||'');
   for(const [k,label] of CHANNELS){const t=txt(p,k),name=heading(label);if(!t){out.push('Manca il canale '+name+'.');continue}
    [['Sì','s[iìí]'],['No','no'],['Esempio','esempio']].filter(([,re])=>!hasLine(t,re)).forEach(([l])=>out.push(name+': manca la riga «'+l+'».'));
    if(lei&&/\b(?:ti|te|tuo|tua|tuoi|tue|vieni|scopri|scrivici|chiamaci|prenota|passa)\b/i.test(lineOf(t,'esempio')))out.push(name+': l’esempio dà del tu, ma hai scelto il lei.')}
   (p.sections.traits||[]).forEach(t=>{if(!/\bnon\s+(?:è|e'|e)(?![\p{L}])/iu.test(t))out.push('Il tratto «'+t.slice(0,60)+'» non dice cosa non è.')});
   const body=normText(allText(p,['no']));bannedOf(c.values.banned).forEach(w=>{if(new RegExp('\\b'+normText(w)+'\\b').test(body))out.push('«'+w+'» è tra le parole da non usare, ma compare nella guida.')});
   return out},
  note:'Salvalo nel progetto: è il riferimento per chi scrive post, email e risposte ai clienti.'},
 {id:'influencer',title:'Brief per influencer',role:'social-media-manager',who:['il','Social Media Manager'],what:'brief per influencer',file:'brief-influencer',
  questions:[{id:'format',label:'Formato',options:[['Reel','reel o video brevi'],['Stories','stories'],['Post e caroselli','post e caroselli'],['Recensione','una recensione o un video più lungo']]},
   {id:'deal',label:'Accordo',options:[['Compenso','un compenso in denaro'],['Prodotto in omaggio','un prodotto o servizio in omaggio'],['Affiliazione','una commissione sulle vendite con codice o link']]},
   {id:'rights',label:'Diritti d’uso',options:[['Solo organico','solo sui profili del creator, senza uso nelle vostre pubblicità'],['Anche ads 30 giorni','anche nelle vostre pubblicità per 30 giorni'],['Anche ads 90 giorni','anche nelle vostre pubblicità per 90 giorni']]}],
  fields:[{id:'product',label:'Cosa promuove (prodotto o campagna)',need:5,rows:2,ph:'Es. la nuova linea di biscotti senza zucchero'},{id:'goal',label:'Obiettivo della collaborazione',need:5,ph:'Es. far provare i biscotti a Torino e far usare il codice sconto'},
   {id:'mentions',label:'Menzioni obbligatorie (facoltative)',ph:'Es. @fornorossi #fornorossi www.fornorossi.it'},{id:'dates',label:'Date e scadenze (facoltative)',ph:'Es. bozza entro il 10/11, pubblicazione il 15/11'},OFFER],
  sections:[{key:'goal',label:'OBIETTIVO',hint:'2-3 frasi: cosa vogliamo ottenere e il messaggio chiave'},{key:'deliverables',label:'CONSEGNE',list:true,hint:'contenuto, formato, quantità, durata'},
   {key:'mentions',label:'MENZIONI OBBLIGATORIE',list:true,hint:'tag, hashtag, link e la dicitura di pubblicità'},{key:'disclosure',label:'TRASPARENZA',hint:'come e dove dichiarare che è pubblicità'},
   {key:'do',label:'DA FARE',list:true,hint:'4-6 punti'},{key:'dont',label:'DA NON FARE',list:true,hint:'4-6 punti'},{key:'timeline',label:'TEMPI',list:true,hint:'bozza, revisione, pubblicazione'},
   {key:'kpi',label:'KPI',list:true,hint:'cosa misurare e come lo comunica il creator, senza obiettivi numerici inventati'},{key:'rights',label:'DIRITTI DI UTILIZZO',hint:'dove e per quanto si possono usare i contenuti'}],need:['deliverables','disclosure'],
  rules:['Le tre proposte hanno tre idee creative diverse per lo stesso obiettivo.','La pubblicità deve essere riconoscibile, come chiedono il Codice di Autodisciplina IAP (Digital Chart) e le linee guida AGCOM sugli influencer: la dicitura «Pubblicità» o «#adv» (per un omaggio «Prodotto inviato da …») va all’inizio del contenuto, ben visibile e non in mezzo agli hashtag; nei video va detta o scritta all’inizio.','Non inventare compensi, numeri di follower, obiettivi numerici o date: dove servono scrivi «da verificare».'],
  prompt:(a,v)=>{const m=K.mentionsIn(v.mentions);return m.length?['Le menzioni obbligatorie sono esattamente: '+m.join(' ')+'.']:[]},
  lint:(p,c)=>{const out=[];
   if(!K.hasDisclosure(txt(p,'disclosure')))out.push('La trasparenza non dice la dicitura da usare: «Pubblicità» o «#adv» (per un omaggio «Prodotto inviato da …»).');
   if(!K.hasDisclosure(txt(p,'mentions')+'\n'+txt(p,'deliverables')))out.push('La dicitura di pubblicità («Pubblicità» o «#adv») non è tra le menzioni obbligatorie.');
   if(!txt(p,'rights').trim())out.push('Mancano i diritti di utilizzo dei contenuti.');
   const have=normText(allText(p));K.mentionsIn(c.values.mentions).forEach(m=>{if(!have.includes(normText(m)))out.push('Manca la menzione obbligatoria «'+m+'».')});
   return out.concat(numberIssues(['timeline','kpi'].map(k=>txt(p,k)).join('\n'),c.text))},
  note:'RADIX prepara il brief: scelta dei creator, contratto e compenso restano a te. Gli influencer «rilevanti» per AGCOM hanno obblighi in più (registro e regole sulle comunicazioni commerciali): verifica le regole aggiornate prima di firmare.'},
 {id:'sms',title:'SMS',role:'copywriter',who:['il','Copywriter'],what:'SMS',file:'sms',
  questions:[{id:'kind',label:'Scopo',options:[['Promemoria','un promemoria: appuntamento, ritiro o scadenza'],['Promozione','una promozione'],['Avviso','un avviso di servizio: orari, chiusure, novità']]},TONE],
  fields:[{id:'message',label:'Cosa deve dire',need:5,rows:2,ph:'Es. sabato apriamo il nuovo forno in via Po 12: assaggi gratis dalle 8'},{id:'sender',label:'Mittente (massimo 11 caratteri)',from:'sender',need:2,max:11,ph:'Es. FornoRossi'},
   {id:'link',label:'Link (facoltativo)',ph:'Es. fornorossi.it/po'},{id:'optout',label:'Testo per disiscriversi',need:4,ph:'Es. STOP SMS al 339 0000000'}],
  validate:v=>{const bad=K.senderIssues(v.sender);if(bad.length)throw Error('Correggi «Mittente (massimo 11 caratteri)»: '+bad[0]+'.')},
  sections:[{key:'sender',label:'MITTENTE',max:11,hard:true,hint:'il mittente come scritto qui'},{key:'sms',label:'SMS',meter:v=>K.smsLabel(K.smsInfo(v)),over:v=>K.smsInfo(v).segments>1,hint:'il testo completo, con il testo per disiscriversi alla fine'},{key:'why',label:'PERCHÉ',hint:'una frase sull’idea'}],need:['sms'],
  rules:['Le tre proposte sono tre varianti con un attacco diverso.','Ogni SMS sta in un solo messaggio: al massimo 160 caratteri, spazi, link e testo per disiscriversi compresi.','Usa solo caratteri GSM-7: apostrofo dritto (\') e virgolette dritte ("), niente emoji, niente « », niente maiuscole accentate (scrivi E\' invece di È); le minuscole à è é ì ò ù vanno bene. Un solo carattere fuori da GSM-7 fa scendere il limite a 70.','Non inventare sconti, prezzi o scadenze.'],
  prompt:(a,v)=>['In MITTENTE scrivi esattamente: '+clean(v.sender)+'.','Ogni SMS finisce con: '+clean(v.optout)+'.'].concat(clean(v.link)?['Usa il link così com’è: '+clean(v.link)+'.']:[]),
  lint:(p,c)=>{const t=txt(p,'sms'),i=K.smsInfo(t),v=c.values,out=[];
   if(i.encoding==='UCS-2')out.push('I caratteri '+i.forcing.map(x=>'«'+x+'»').join(' ')+' non sono GSM-7: l’SMS passa in UCS-2 e il limite scende a 70 caratteri. Sostituiscili (’ con \', « » con ", È con E\').');
   if(i.segments>1)out.push('L’SMS conta '+i.units+' caratteri '+i.encoding+': partono '+i.segments+' SMS e si pagano tutti. Accorcialo entro '+i.single+'.');
   K.senderIssues(txt(p,'sender')).forEach(x=>out.push('Mittente: '+x+'.'));
   if(!K.hasOptOut(t)&&!(clean(v.optout)&&normText(t).includes(normText(v.optout))))out.push('Manca il testo per disiscriversi.');
   if(clean(v.link)&&!normText(t).includes(normText(v.link)))out.push('Manca il link che hai indicato.');
   K.unknownUrls(t,c.text).forEach(h=>out.push('Il link «'+h+'» non è quello che hai scritto: correggilo.'));
   return out.concat(numberIssues(t,c.text))},
  live:md=>{const t=(sectionOf(md,'SMS')||'').replace(/\n*Conteggio:[^\n]*$/,'').trim(),i=K.smsInfo(t);return 'SMS modificato: '+K.smsLabel(i)+(i.forcing.length?' · non GSM-7: '+i.forcing.join(' '):'')},
  note:'Per inviarlo serve un fornitore SMS con il mittente registrato. A un mittente con un nome non si può rispondere: il testo per disiscriversi deve indicare un numero o un link. Invia solo a chi ha dato il consenso.'}
];
const META_ONLY=SERVICES[2].questions[0].options[2][1],GOOGLE_ONLY=SERVICES[2].questions[0].options[1][1];
// «il Copywriter», «al Copywriter», «del Copywriter» (lo → allo, dello).
const whoOf=(id,prep)=>{const [art,name]=need(id).who;return ({'':art,a:art==='lo'?'allo':'al',di:art==='lo'?'dello':'del'})[prep||'']+' '+name};
const service=id=>SERVICES.find(s=>s.id===id)||null;
function need(id){const s=service(id);if(!s)throw Error('Servizio non valido: «'+id+'».');return s}
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const block=s=>String(s==null?'':s).replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const fallback=q=>q.options[q.def||0][1];
// Helpers of the service checks (lint): a section as text, the whole proposal as text, «Etichetta: …» lines.
const txt=(p,k)=>{const v=p.sections[k];return Array.isArray(v)?v.join('\n'):v||''};
const allText=(p,skip)=>Object.keys(p.sections).filter(k=>!(skip||[]).includes(k)).map(k=>txt(p,k)).concat(p.title||'').join('\n');
const LINE=re=>'(?:^|\\n)\\s*(?:[-*•]\\s*)?\\**(?:'+re+')\\**\\s*:';
const hasLine=(t,re)=>new RegExp(LINE(re),'i').test(t);
const lineOf=(t,re)=>(new RegExp(LINE(re)+'([^\\n]*)','i').exec(t)||[])[1]||'';
const normText=s=>norm(s);
const countOf=a=>{const m=/^(\d)/.exec((a&&a.count)||'');return m?+m[1]:3};
const bannedOf=s=>String(s||'').split(/[,;\n]+/).map(x=>x.trim()).filter(x=>x.length>=3).slice(0,30);
const numberIssues=(text,input)=>K.unverifiedNumbers(text,input).map(n=>({kind:'number',text:n}));
// The text of a «## Heading» section of the Markdown (the edited text), up to the next section or the final note.
function sectionOf(md,label){const lines=String(md||'').split('\n'),h='## '+heading(label),i=lines.findIndex(l=>l.trim()===h);if(i<0)return '';
 const out=[];for(const l of lines.slice(i+1)){if(/^## |^---\s*$/.test(l))break;out.push(l)}return out.join('\n').trim()}
function pick(q,v){const o=q.options.find(x=>x[1]===v);if(v!=null&&v!==''&&!o)throw Error('Risposta non valida per «'+q.label+'».');return o?o[1]:fallback(q)}
const labelOf=(svc,id,v)=>{const q=need(svc).questions.find(x=>x.id===id);return q?(q.options.find(x=>x[1]===v)||q.options[q.def||0])[0]:''};
// The sections a service asks for with these answers (the ads skip Google or Meta when only one is chosen).
const sectionsFor=(svc,answers)=>need(svc).sections.filter(s=>!s.when||s.when(answers||{}));
// The project profile (RadixAgents.profileFor) → the values the fields start from.
function prefill(profile){const p=profile||{};
 const name=clean(p.name).slice(0,120);
 // SMS sender: the project name without accents and symbols, within 11 characters.
 const sender=name.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9 ]+/g,'').replace(/\s+/g,'').slice(0,11);
 return {offer:clean(p.summary||p.positioning||'').slice(0,FIELD_MAX),audience:clean(p.audience).slice(0,FIELD_MAX),name,sender}}
// The answers as the prompt words, with each question's default where nothing was picked.
const resolved=(svc,a)=>Object.fromEntries(svc.questions.map(q=>[q.id,pick(q,(a||{})[q.id])]));
// Confirmed project facts that go in the prompt (and count as «input» for the number check).
function projectFacts(project){const p=project||{},out=[];
 [['Nome',p.name],['Settore',p.kind],['Posizionamento',p.positioning],['Pubblico',p.audience],['Tono di voce',p.voice],['Decisioni prese',p.decisions]].forEach(([k,v])=>{v=clean(v);if(v)out.push(k+': '+v.slice(0,FIELD_MAX))});
 return out}

// The one request to the service's role: three alternative proposals in a format parseProposals() reads back.
const RULES=['Usa solo i fatti confermati del progetto e quello che è scritto qui. Non inventare numeri, prezzi, sconti, clienti, premi, certificazioni, recensioni o risultati. Se un dato serve e manca, scrivi «da verificare».','Italiano semplice, frasi brevi, niente gergo non spiegato, niente emoji.'];
function proposalsPrompt(id,answers,values={}){const svc=need(id),a=answers||{},v=values||{},p=v.project||{},lines=[];
 for(const f of svc.fields){const x=String(v[f.id]==null?'':v[f.id]).trim();if(f.need&&x.length<f.need)throw Error('Compila «'+f.label+'».')}
 if(svc.validate)svc.validate(v);
 lines.push('Prepara '+COUNT+' proposte alternative di '+svc.what+' ('+svc.title+') per il progetto'+(p.name?' «'+clean(p.name).slice(0,80)+'»':'')+'. Le tre proposte devono essere davvero diverse tra loro.');
 for(const q of svc.questions)lines.push(q.label+': '+pick(q,a[q.id])+'.');
 for(const f of svc.fields){const x=f.rows>1?block(v[f.id]).slice(0,f.max||FIELD_MAX):clean(v[f.id]).slice(0,f.max||FIELD_MAX);if(x)lines.push(f.label+': «'+x+'».')}
 const facts=projectFacts(p);if(facts.length)lines.push('Fatti confermati del progetto:\n'+facts.map(x=>'- '+x).join('\n'));
 svc.rules.concat(svc.prompt?svc.prompt(resolved(svc,a),v):[],RULES).forEach(r=>lines.push(r));
 lines.push('Rispondi solo in questo formato, senza testo prima o dopo:');
 const secs=sectionsFor(id,a);
 for(let i=1;i<=COUNT;i++)lines.push('===PROPOSTA '+i+'===\nIDEA: (3-7 parole: cosa distingue questa proposta)\n'+secs.map(s=>s.label+':\n'+(s.list?'- ('+s.hint+')':'('+s.hint+')')).join('\n'));
 lines.push('===FINE===');
 return lines.join('\n')}

// ---- parsing ----
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
// Heading marks and quotes go, hashtags («#adv») stay.
const stripMd=s=>String(s||'').replace(/\*\*|__|`/g,'').replace(/^(?:#{1,6}(?=\s|$)|>|\s)+/,'').trim();
const bullet=s=>stripMd(String(s).replace(/^\s*(?:[-*•–·]|\d{1,2}[.)]|\[[ x]\])\s+/,''));
const chars=s=>[...String(s)].length;
// Over a hard limit: cut at the last whole word that fits (no dangling punctuation).
function fit(s,max){const t=[...String(s)];if(t.length<=max)return String(s);const cut=t.slice(0,max).join(''),sp=cut.lastIndexOf(' ');return (sp>max/2?cut.slice(0,sp):cut).replace(/[\s,;:–—-]+$/,'')}
// A table section: Markdown table rows become «a | b | c» items; the separator and the header row are dropped.
const tableRow=(sec,x)=>{if(!sec.table)return x;const t=x.replace(/^\|\s*|\s*\|$/g,'').trim();return /^:?-{2,}:?(?:\s*\|\s*:?-{2,}:?)*$/.test(t)||norm(t.split('|')[0])===norm(sec.table[0])?'':t};
function item(sec,v){if(sec.list){const xs=(Array.isArray(v)?v:typeof v==='string'?v.split('\n'):[]).map(x=>bullet(typeof x==='string'?x:x&&(x.text||x.testo||x.titolo||x.title||x.nome||x.name)||'')).map(x=>tableRow(sec,x.replace(/^[«"“]([^«»"“”]*)[»"”]$/,'$1').trim())).filter(x=>x.length>1);return xs.slice(0,MAX_ITEMS)}
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
// JSON list. `input` is what the person wrote: the text of inputText() (for the number check) or, for the services
// with their own checks, {text, values (the fields), answers}. Returns [] when nothing usable is there.
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
// The technical sheet: every number in the proposal must appear in what the person wrote or in the confirmed facts
// (lib/copy-checks.js unverifiedNumbers: list numbering is not data). The «da verificare» list is not checked.
const unverifiedNumbers=K.unverifiedNumbers;
// The services with their own checks (lint) get {text, values, answers}; a lint returns texts or issues.
function checks(svc,p,input){const issues=lengthIssues(svc,p),ctx=input&&typeof input==='object'?input:{text:input};
 if(svc.strict){const text=svc.sections.filter(s=>s.key!=='missing').map(s=>txt(p,s.key)).join('\n')+'\n'+p.title;
  unverifiedNumbers(text,ctx.text).forEach(n=>issues.push({kind:'number',text:n}))}
 if(svc.lint){const found=svc.lint(p,{text:String(ctx.text||''),values:ctx.values||{},answers:resolved(svc,ctx.answers)});
  for(const x of found){const i=typeof x==='string'?{kind:'lint',text:x}:x;if(!issues.some(o=>o.kind===i.kind&&o.text===i.text))issues.push(i)}}
 return issues}
// What the person wrote, the answers picked and the confirmed facts: the input the numbers are checked against.
function inputText(id,values,answers){const svc=need(id),v=values||{},a=answers?Object.values(resolved(svc,answers)):[];return svc.fields.map(f=>String(v[f.id]||'')).concat(a,projectFacts(v.project)).join('\n')}
const issueText=i=>i.kind==='lint'?i.text:i.kind==='number'?'Il numero «'+i.text+'» non compare nei dati che hai scritto: verificalo o toglilo.'
 :i.trimmed!=null?'«'+i.text+'» aveva '+i.length+' caratteri (massimo '+i.max+'): accorciato in «'+i.trimmed+'», rileggilo.'
 :'«'+i.text+'» ha '+i.length+' caratteri: meglio entro '+i.max+'.';

// ---- output ----
// A section label as a heading: «TITOLI GOOGLE» → «Titoli Google».
const NAMES={KPI:'KPI',SMS:'SMS',LINKEDIN:'LinkedIn',INSTAGRAM:'Instagram',WHATSAPP:'WhatsApp'};
const heading=l=>NAMES[l]||(l.charAt(0)+l.slice(1).toLowerCase()).replace(/\b(google|meta)\b(?! description)/g,w=>w.charAt(0).toUpperCase()+w.slice(1));
// The count shown next to an item: the service's own meter (SMS: characters, encoding, segments; in the Markdown on its
// own «Conteggio:» line, so the text copies clean) or characters/max.
const meterOf=(s,v)=>s.meter?s.meter(v):s.max?chars(v)+'/'+s.max:'';
const overOf=(s,v)=>s.over?s.over(v):chars(v)>s.max;
// A table section as a Markdown table, the cells padded to the header.
function mdTable(cols,rows){const cell=x=>String(x).replace(/\|/g,'/').trim();
 return ['| '+cols.join(' | ')+' |','|'+cols.map(()=>'---').join('|')+'|'].concat(rows.map(r=>{const c=r.split('|').map(cell);while(c.length<cols.length)c.push('');return '| '+c.slice(0,cols.length-1).concat(c.slice(cols.length-1).join(' / ')).join(' | ')+' |'}))}
// The chosen proposal as Markdown, ready to edit, copy, download or save.
function toMarkdown(id,p,{project,answers,date}={}){const svc=need(id),pr=project||{},a=answers||{},day=date||new Date().toISOString().slice(0,10),out=[];
 out.push('# '+svc.title+' · '+p.title,'',(pr.name?'Progetto: '+clean(pr.name)+' · ':'')+svc.questions.map(q=>q.label+': '+labelOf(id,q.id,a[q.id])).join(' · ')+' · '+day);
 for(const s of svc.sections){const v=p.sections[s.key];if(!v||!v.length)continue;out.push('','## '+heading(s.label),'');const m=x=>{const t=meterOf(s,x);return t?' ('+t+')':''};
  if(s.table&&v.some(x=>x.includes('|')))out.push(...mdTable(s.table,v));
  else if(s.list)v.forEach(x=>out.push('- '+x+m(x)));else if(s.meter)out.push(v,'','Conteggio: '+s.meter(v));else out.push(v+m(v))}
 if(p.issues&&p.issues.length)out.push('','## Da controllare','',...p.issues.map(i=>'- '+issueText(i)));
 if(svc.note)out.push('','---',svc.note);
 return out.join('\n')}
const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
const filename=(id,p,ext)=>need(id).file+'-'+(slug(p&&p.title)||'proposta')+'.'+(ext||'md');
// The Markdown as plain text (.txt): no heading marks, no bold.
const plainText=md=>String(md||'').replace(/^#{1,6}\s+/gm,'').replace(/\*\*/g,'');
// Email sequences as CSV, from the (edited) Markdown; null for the other services.
const csvOf=(id,md)=>{const svc=need(id);return svc.csv?svc.csv(md):null};
// The live check under the edited text (SMS: characters and segments); '' when the service has none.
const liveOf=(id,md)=>{const svc=need(id);return svc.live?svc.live(md):''};
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
 const go=button('Prepara 3 proposte','primary'),cost=el('span','Una chiamata AI '+whoOf(id,'a')+': ti chiedo conferma prima.','muted'),status=el('p','','tool-status');status.setAttribute('role','status');
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
  try{const r=await rt.reply({role:svc.role,project:ctx.project,memoryScope:ctx.memoryScope,messages:[{role:'user',content:prompt}]});const list=parseProposals(id,r&&r.text,{text:inputText(id,values,asked.answers),values,answers:asked.answers});
   if(!list.length)throw Error('la risposta non contiene proposte leggibili. Riprova.');
   status.textContent=(list.length<COUNT?'Sono arrivate '+list.length+' proposte su '+COUNT+'. ':'')+'Confrontale e scegli quella da usare.'+(list.some(p=>p.issues.length)?' Alcune hanno punti da controllare.':'');
   grid.replaceChildren(...list.map(card));go.textContent='Prepara altre 3 proposte'}
  catch(e){status.textContent='Proposte non preparate: '+e.message;setStep(1);grid.hidden=true}
  finally{lock(false)}};
 function card(p,i){const f=el('article',undefined,'ps-card cs-card'),use=button('Scegli questa','primary');
  f.append(el('h3',(i+1)+' · '+p.title));
  for(const s of svc.sections){const v=p.sections[s.key];if(!v||!v.length)continue;const d=el('div',undefined,'cs-sec');d.append(el('h4',heading(s.label)+(s.list?' · '+v.length:'')));
   const count=x=>{const t=meterOf(s,x);if(!t)return null;const c=el('span',' '+t,'cs-count');c.dataset.over=String(overOf(s,x));return c};
   if(s.list){const l=el('ul');v.forEach(x=>{const li=el('li',x),c=count(x);if(c)li.append(c);l.append(li)});d.append(l)}
   else if(s.summary&&s.summary(v).length){const l=el('ul');s.summary(v).forEach(x=>l.append(el('li',x)));d.append(l)}
   else{const t=el('p',v.length>600?v.slice(0,600)+'…':v,'cs-text'),c=count(v);d.append(t);if(c)d.append(c)}
   f.append(d)}
  if(p.issues.length){const w=el('ul',undefined,'cs-issues');p.issues.forEach(x=>w.append(el('li',issueText(x))));f.append(w)}
  use.onclick=()=>choose(p,f);f.append(use);return f}
 function choose(p,cardEl){grid.querySelectorAll('.cs-card').forEach(x=>x.dataset.chosen=String(x===cardEl));setStep(3);result.hidden=false;
  const out=el('textarea');out.rows=14;out.value=toMarkdown(id,p,{project:ctx.project,answers:asked.answers});out.setAttribute('aria-label','Testo scelto, modificabile');
  const st=el('p','Il testo scelto: modificalo qui, poi copialo, scaricalo o salvalo nel progetto.','tool-status');st.setAttribute('role','status');
  const copy=button('Copia'),dl=button('Scarica .md'),txtBtn=button('Scarica .txt'),acts=el('div',undefined,'ps-actions');acts.append(copy,dl,txtBtn);
  copy.onclick=async()=>{try{await root.navigator.clipboard.writeText(out.value);st.textContent='Testo copiato.'}catch(e){out.focus();out.select();st.textContent='Copia non riuscita: il testo è selezionato, usa Ctrl+C.'}};
  // Downloads always start from the edited text (out.value).
  const file=(text,type,name)=>{const a=el('a');a.href=root.URL.createObjectURL(new root.Blob([text],{type:type+';charset=utf-8'}));a.download=name;doc().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),2000);st.textContent='Testo scaricato: '+name+'.'};
  dl.onclick=()=>file(out.value,'text/markdown',filename(id,p));
  txtBtn.onclick=()=>file(plainText(out.value),'text/plain',filename(id,p,'txt'));
  if(svc.csv){const csvBtn=button('Scarica .csv');acts.append(csvBtn);csvBtn.onclick=()=>file(csvOf(id,out.value),'text/csv',filename(id,p,'csv'))}
  const live=el('p','','cs-live');live.setAttribute('aria-live','polite');
  if(svc.live){const upd=()=>{live.textContent=liveOf(id,out.value)};out.addEventListener('input',upd);upd()}else live.hidden=true;
  if(ctx.workspace&&ctx.projectId){const save=button('Salva nel progetto','primary');acts.prepend(save);
   save.onclick=async()=>{save.disabled=true;st.textContent='Salvo il testo nel progetto…';
    try{await saveToProject(ctx.workspace,ctx.projectId,id,p,out.value,{by:ctx.by});save.textContent='Salvato ✓';st.replaceChildren(doc().createTextNode('Testo salvato nel progetto: lo trova tutto il team tra i documenti '+whoOf(id,'di')+'. '));
     if(ctx.agentsUrl){const a=el('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;st.append(a)}}
    catch(e){st.textContent='Testo non salvato: '+e.message;save.disabled=false}}}
  result.replaceChildren(el('h3','Il testo scelto · '+p.title),acts,st,out,live);result.scrollIntoView&&result.scrollIntoView({behavior:'smooth',block:'nearest'})}
 return wrap}
return Object.freeze({SERVICES,COUNT,service,sectionsFor,prefill,projectFacts,proposalsPrompt,parseProposals,fit,unverifiedNumbers,inputText,issueText,toMarkdown,filename,plainText,csvOf,liveOf,sectionOf,savedEntry,saveToProject,labelOf,whoOf,copyStudio});
});
