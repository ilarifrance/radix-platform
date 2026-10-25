/* Regia RADIX · Impostazioni adapter (impostazioni.html, also its «Collegamenti» section; area 'impostazioni').
   Read-only, no ops. It reads which services are connected from /api/integrations/status (through
   RadixWorkspace.integrations(), the same cached request the «Collegamenti» section makes): names and
   collegato / da collegare only, never a key, its length or its prefix. It carries fixed Italian step-by-step guides
   (Buffer channel, Instagram professional account, LinkedIn page, HeyGen key, mailbox with an app password) that the
   AI may adapt to an attached screenshot; the keys themselves are set by the administrator, never in the chat.
   UMD: registers itself with RadixRegiaCore in the browser; Node gets create(env) for the tests. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else{root.RadixRegiaImpostazioni=api;if(root.RadixRegiaCore)root.RadixRegiaCore.register('impostazioni',api.adapter);api.adapter.read()}})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
// Names of the services of api/_integrations-status.js (same ids as shell/settings-core.js), for the panel and the AI.
const NAMES=Object.freeze({anthropic:'Agenti AI',database:'Database RADIX',buffer:'Buffer (pubblicazione dei post)',blob:'Archivio immagini pubblico',
 'openai-image':'Immagini AI',heygen:'HeyGen (video con avatar)',email:'Email di RADIX (Gmail)',higgsfield:'Higgsfield (immagini e video)',
 'vercel-sites':'Siti online','captain-data':'Captain Data (verifica lead)'});
// The fixed guides. service: the status id that says whether it is already connected (null: not visible from here).
const GUIDES=Object.freeze([
 {id:'buffer-canale',title:'Collegare un canale a Buffer',service:'buffer',steps:[
  'Accedi a buffer.com con l’account dell’agenzia.',
  'In alto a sinistra premi «Channels» (Canali) e poi «Connect channel».',
  'Scegli il social (Instagram, LinkedIn, Facebook…) e accedi con l’account che gestisce la pagina.',
  'Autorizza Buffer: il canale compare nell’elenco con il suo nome.',
  'Se Buffer in RADIX risulta «da collegare», il token di Buffer lo aggiunge l’amministratore su Vercel (BUFFER_ACCESS_TOKEN): non va scritto nella chat né nell’app.',
  'Nel Piano editoriale i post approvati di quel canale si possono mettere in coda su Buffer con il pulsante del post.']},
 {id:'instagram-professionale',title:'Passare Instagram ad account professionale',service:null,steps:[
  'Nell’app Instagram apri il profilo e premi ☰ (menu) in alto a destra.',
  'Vai su «Impostazioni e privacy» › «Tipo di account e strumenti» › «Passa a un account professionale».',
  'Scegli la categoria e il tipo «Azienda» (o «Creator»), poi conferma.',
  'Collega la Pagina Facebook dell’azienda quando l’app lo chiede (serve a Buffer per pubblicare).',
  'Torna su Buffer e collega il canale Instagram: scegli «Instagram Business» e accedi con l’account Facebook che gestisce la Pagina.']},
 {id:'linkedin-pagina',title:'Collegare una pagina LinkedIn aziendale',service:null,steps:[
  'Su LinkedIn verifica di essere amministratore della pagina aziendale (Pagina › «Strumenti amministratore» › «Gestisci amministratori»).',
  'Su Buffer premi «Connect channel» e scegli «LinkedIn Page», non il profilo personale.',
  'Accedi con il tuo account LinkedIn e autorizza Buffer.',
  'Scegli la pagina aziendale nell’elenco: compare tra i canali di Buffer.',
  'Se la pagina non compare, chiedi a un amministratore della pagina di darti il ruolo «Super admin» o «Content admin».']},
 {id:'heygen-chiave',title:'Attivare HeyGen (video con avatar)',service:'heygen',steps:[
  'Accedi a heygen.com con l’account dell’agenzia, con un piano che includa l’accesso API.',
  'Apri «Settings» › «API» (o «Subscriptions & API») e premi «Generate API key» se non c’è già.',
  'Copia la chiave e mandala all’amministratore di RADIX in modo sicuro (non per email in chiaro, non nella chat).',
  'L’amministratore la aggiunge su Vercel come HEYGEN_API_KEY e rifà il deploy.',
  'In Impostazioni › Collegamenti HeyGen passa a «Chiave configurata»; ogni video chiede conferma e mostra il costo prima di partire.']},
 {id:'casella-email',title:'Collegare una casella email con la password per le app',service:'email',steps:[
  'Sull’account Google della casella attiva la verifica in due passaggi (myaccount.google.com › Sicurezza).',
  'Cerca «Password per le app» nelle impostazioni dell’account Google, scrivi un nome (per esempio «RADIX CRM») e premi «Crea».',
  'Copia la password di 16 caratteri che compare: Google la mostra una sola volta.',
  'In RADIX vai su Impostazioni › Caselle email, premi per aggiungere una casella e incolla l’indirizzo e la password per le app (solo owner e admin).',
  'Premi «Prova invio»: arriva un’email al tuo indirizzo. La password non viene più mostrata.',
  'L’email di sistema di RADIX (Gmail) invece la configura l’amministratore su Vercel (GMAIL_USER e GMAIL_APP_PASSWORD).']}
]);
const guideText=g=>g.title+': '+g.steps.map((s,i)=>(i+1)+') '+s).join(' ');

// env: {load} for the tests (an async function → {id: boolean} | null); the browser uses RadixWorkspace.integrations().
function create(env){const E=env||{};let cache=null,pending=null,loaded=false;
 function load(){if(pending)return pending;
  const W=root.RadixWorkspace,get=E.load||(W&&W.integrations?()=>W.integrations():null);if(!get)return Promise.resolve(null);
  pending=Promise.resolve().then(get).then(map=>{cache=map&&typeof map==='object'?map:null;return cache},()=>null).finally(()=>{pending=null;if(!cache)loaded=false});loaded=true;return pending}
 // The last status read (a fresh read starts in the background; the Regia reads again before every question).
 function read(){if(!loaded&&!cache)load();return services(cache)}
 function services(map){if(!map)return {services:null};
  const ids=Object.keys(NAMES).concat(Object.keys(map).filter(id=>!NAMES[id]).sort());
  return {services:ids.filter(id=>typeof map[id]==='boolean').map(id=>({id,name:NAMES[id]||id,ok:map[id]===true}))}}
 return {title:'Impostazioni',pages:['impostazioni'],contextMax:3900,read,load,services,
  shortcuts:[{label:'Cosa manca da collegare?',prompt:'Cosa manca da collegare? Dimmi quali servizi sono da collegare, a cosa servono e i passi per collegarli, partendo dal più utile. Se ti allego uno screenshot, guidami da lì.'}],
  context,digest,view,ops:{}}}

// ---- what the AI and the panel read ----
function missingOf(state){return (state&&state.services||[]).filter(s=>!s.ok)}
function context(state){const list=state&&state.services;
 const status=list?'Collegati: '+(list.filter(s=>s.ok).map(s=>s.name).join(', ')||'nessuno')+'. Da collegare: '+(missingOf(state).map(s=>s.name).join(', ')||'nessuno')+'.'
  :'Stato dei collegamenti non disponibile (serve una sessione attiva): non dire cosa è collegato.';
 const missing=new Set(missingOf(state).map(s=>s.id));
 // The guides of what is missing first, so they survive the cap.
 const guides=GUIDES.slice().sort((a,b)=>(missing.has(b.service)?1:0)-(missing.has(a.service)?1:0));
 return 'Impostazioni · Collegamenti. '+status+' I canali dentro Buffer (Instagram, LinkedIn) e le caselle del CRM non si vedono da qui. '+
  'Le chiavi le imposta l’amministratore su Vercel: non chiederle, non scriverle, non leggerle da uno screenshot. Nessuna modifica da qui: solo guide.\n'+
  'Guide fisse (adattale allo screenshot allegato, senza inventare pulsanti):\n'+guides.map(g=>'- '+guideText(g)).join('\n')}
function digest(state){const list=state&&state.services;return list?{collegati:list.filter(s=>s.ok).length,daCollegare:missingOf(state).map(s=>s.name)}:{stato:'non disponibile'}}
function view(state){const list=state&&state.services;if(!list)return null;const miss=missingOf(state);
 return {title:'Collegamenti',items:[miss.length?'Da collegare: '+miss.map(s=>s.name).join(', '):'Tutti i servizi hanno la chiave configurata','Collegati: '+list.filter(s=>s.ok).length+' su '+list.length]}}

const adapter=create();
return Object.freeze({adapter,create,GUIDES,NAMES,guideText,context,digest,view});
});
