/* RADIX PED views — channels, the status board and the brief for the AI copywriter, computed from the
   editorial state. Pure functions shared by project-editorial.html and the tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPedViews=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const CHANNELS=Object.freeze(['LinkedIn','Instagram','Facebook','TikTok','YouTube','X','Blog','Newsletter']);
const COLUMNS=Object.freeze([
 {id:'draft',label:'Bozza'},{id:'review',label:'In revisione'},{id:'approved',label:'Approvato'},{id:'queued',label:'In coda di pubblicazione'}
]);

function channelSlug(channel){
 const c=String(channel||'').trim().toLowerCase();
 const known=CHANNELS.find(x=>c===x.toLowerCase()||c.startsWith(x.toLowerCase()+' '));
 return known?known.toLowerCase():(c.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'altro');
}

// Bulk scheduling: approved contents not yet on Buffer whose plan time is still ahead, each paired with the one
// Buffer channel of the same network (or the remembered one when there are several). The rest is listed with why.
const BUFFER_SERVICE=Object.freeze({x:'twitter'});
function bufferChannelFor(channel,channels,preferred){
 const slug=channelSlug(channel),service=BUFFER_SERVICE[slug]||slug;
 const same=(channels||[]).filter(c=>String(c.service||'').toLowerCase()===service);
 if(same.length===1)return same[0];
 return same.find(c=>c.id===preferred)||null;
}
function schedulePlan(contents,channels,{schedule,preferred,sent}={}){
 const ready=[],skipped=[];
 for(const item of contents||[]){
  if(!item||item.status!=='approved'||isQueued(item))continue;
  if(sent&&sent(item)){skipped.push({item,reason:'invio già in corso o da verificare'});continue}
  const plan=schedule(item);if(plan.mode!=='scheduled'){skipped.push({item,reason:plan.reason==='past'?'orario già passato':'data o orario mancanti'});continue}
  const ch=bufferChannelFor(item.channel,channels,preferred);if(!ch){skipped.push({item,reason:'nessun canale Buffer unico per '+item.channel});continue}
  ready.push({item,channel:ch,scheduledAt:plan.scheduledAt});
 }
 ready.sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt));
 return {ready,skipped};
}

// A content is queued only while its approved version is the one sent to the publishing queue.
function isQueued(item){return !!(item&&item.status==='approved'&&item.publication&&item.publication.revision===item.revision)}
function columnOf(item){return isQueued(item)?'queued':item.status}

function board(contents){
 const cols=COLUMNS.map(c=>({...c,items:[]}));
 for(const item of contents||[]){const col=cols.find(c=>c.id===columnOf(item));if(col)col.items.push(item)}
 cols.forEach(c=>c.items.sort((a,b)=>((a.date||'9999')+(a.time||'99:99')).localeCompare((b.date||'9999')+(b.time||'99:99'))));
 return cols;
}

function channelsFromBrief(brief){
 const listed=String(brief&&brief.channels||'').split(/[,;/\n]+/).map(s=>s.trim()).filter(Boolean);
 const named=listed.map(s=>CHANNELS.find(c=>s.toLowerCase().includes(c.toLowerCase()))||s);
 return [...new Set(named.concat(CHANNELS))].slice(0,20);
}

// How each network rewards a post, given to the copywriter so a draft reads like a native post, not an article.
const CHANNEL_GUIDES=Object.freeze({
 linkedin:['Regole LinkedIn:',
  '- Le prime 2 righe (al massimo 200 caratteri, prima di «…altro») decidono tutto: apri con un gancio concreto e specifico (una scena vissuta, un errore, un’affermazione netta, una domanda scomoda). Niente frasi generiche o definizioni.',
  '- Una sola idea per post, raccontata da chi l’ha vissuta: esperienza diretta, cosa è successo, cosa ha imparato, cosa fare.',
  '- Righe brevi e paragrafi di 1-3 righe con una riga vuota tra l’uno e l’altro; se servono passaggi pratici, un elenco di 3-5 punti.',
  '- Dai al lettore qualcosa da salvare: un metodo, una checklist, una domanda da farsi lunedì mattina.',
  '- Lunghezza tra 900 e 1600 caratteri.',
  '- Chiudi con una domanda precisa a cui il pubblico sa rispondere dalla propria esperienza (non «che ne pensate?»), così nascono i commenti.',
  '- Nessun link esterno nel testo (va nel primo commento); al massimo 3 hashtag in fondo, specifici; emoji al massimo 2, solo se aiutano la lettura.',
  '- Testo semplice: niente markdown (asterischi, #titoli, trattini di separazione), LinkedIn li mostra così come sono; per gli elenchi usa numeri o simboli come 1. 2. 3. o →.'],
 instagram:['Regole Instagram:','- La prima riga (al massimo 125 caratteri) è il gancio che si vede sotto l’immagine.','- Didascalia di 3-6 paragrafi brevi che completa la grafica senza ripeterla.','- Chiudi con un invito chiaro (salva, commenta con una parola, scrivi in DM).','- Da 3 a 8 hashtag specifici in fondo.','- Testo semplice: niente markdown (asterischi o #titoli).'],
 facebook:['Regole Facebook:','- Apertura breve e colloquiale, 2-5 paragrafi corti.','- Chiudi con una domanda o un invito semplice.','- Al massimo 3 hashtag.'],
 x:['Regole X:','- Al massimo 270 caratteri, una sola idea netta.','- Niente hashtag o al massimo uno.'],
 newsletter:['Regole newsletter LinkedIn:','- Titolo che promette un beneficio concreto, apertura personale di 2-3 righe.','- Sezioni brevi con sottotitoli, un esempio reale e un’azione pratica.','- Chiudi con una domanda o un invito a rispondere.'],
 blog:['Regole articolo:','- Titolo chiaro con la parola chiave, introduzione che dice cosa si impara.','- Sottotitoli, paragrafi brevi, esempi concreti, conclusione con un’azione.']
});
function channelGuide(channel){const slug=channelSlug(channel),c=String(channel||'').toLowerCase();
 if(/newsletter/.test(c))return CHANNEL_GUIDES.newsletter.join('\n');const g=CHANNEL_GUIDES[slug];return g?g.join('\n'):''}
// Spoken length for an avatar script: about 140 words a minute, from the minutes the strategy gives (e.g. «8-10 min»).
const WORDS_PER_MINUTE=140;
function videoLength(brief,item){const b=brief||{},long=/youtube/i.test(String(item&&item.channel||''));
 const m=/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*min/i.exec([b.channels,b.frequency,b.materials].filter(Boolean).join(' '));
 const lo=long&&m?Number(m[1]):long?8:0.75,hi=long&&m?Number(m[2]):long?10:1.25,w=x=>Math.round(x*WORDS_PER_MINUTE/10)*10,fmt=n=>String(n).replace(/\B(?=(\d{3})+$)/g,'.');
 return 'Durata: '+(long?lo+'-'+hi+' minuti':'meno di un minuto e mezzo')+', quindi tra '+fmt(w(lo))+' e '+fmt(w(hi))+' parole parlate: rispetta questa lunghezza.'}
// A personal brand speaks as the person (first person singular), not about «the entrepreneur» in the third person.
function isPersonal(brief){const b=brief||{};return /personal\s*brand/i.test([b.brand,b.positioning,b.goal,b.name].filter(Boolean).join(' '))}
const STYLE_RULES=['Stile:',
 '- Scrivi come parla una persona esperta a un collega, non come un saggio: frasi concrete, verbi attivi, esempi riconoscibili.',
 '- Evita i tic da testo AI: niente contrapposizioni ripetute «non è X, è Y» (al massimo una), niente elenchi di tre aggettivi, niente «in un mondo in cui», «è fondamentale», «nel panorama attuale», «in conclusione», «sbloccare il potenziale», «fare la differenza».',
 '- Niente statistiche generiche senza fonte («in media», «la maggior parte degli imprenditori», «studi dimostrano»): usa i fatti verificati o un caso concreto senza numeri.',
 '- Non promettere materiali che non esistono nei fatti verificati (checklist, guide, download, «link in descrizione», webinar): chiudi con una domanda o un invito a scrivere.',
 '- Non nominare RADIX, software o strumenti per nome, a meno che il brief chieda esplicitamente di citarli.',
 '- Prima di scrivere, pensa a tre aperture diverse e usa solo la più forte (non mostrarle).'].join('\n');

// The copywriter receives the approved strategy and the content's own fields, never other projects' data.
function copyPrompt(brief,item,note){
 const b=brief||{},video=mediaKind(item)==='video'&&!(item&&item.script),guide=video?'':channelGuide(item.channel),personal=isPersonal(b),lines=[
  'Scrivi il testo di un contenuto del piano editoriale, pronto per la revisione umana.',
  'Canale: '+(item.channel||'da definire'),'Titolo / tema: '+(item.title||'da definire'),
  item.date?'Data prevista: '+item.date+(item.time?' alle '+item.time:''):'',
  'Obiettivo del progetto: '+(b.goal||'—'),'Pubblico: '+(b.audience||'—'),'Tone of voice e vincoli: '+(b.voice||'—'),
  'Messaggi chiave: '+(b.messages||'—'),'Rubriche: '+(b.topics||'—'),
  'Fatti verificati, brand e posizionamento (unica fonte per numeri e casi): '+([b.brand,b.positioning,b.offer,b.gaps].filter(Boolean).join(' · ')||'—'),
  item.copy&&item.copy.trim()?'Bozza o spunto di partenza:\n'+item.copy.trim():'',
  note&&String(note).trim()?'Riscrivi il testo seguendo questa indicazione di chi lo approva: '+String(note).trim().slice(0,1000):'',
  personal?'È un personal brand: scrivi in prima persona singolare, con la voce della persona, partendo dalla sua esperienza (ruoli, anni, risultati presenti nei fatti verificati). Non parlare di «l’imprenditore» in terza persona: rivolgiti al lettore con il tu.':'',
  'Non inventare numeri, percentuali, cifre in euro, durate o casi di clienti: usa solo quelli presenti nei fatti verificati. Uno scenario tipico va descritto senza numeri. Se lo spunto chiede numeri che i fatti non hanno, usa i risultati verificati o togli il numero.',
  video?'È un video con avatar AI: scrivi solo lo script parlato, in prima persona, senza indicazioni di regia, titoli o note. Apri nei primi 10 secondi con il problema dello spettatore. '+videoLength(b,item):
   (guide||'Adatta lunghezza, struttura e call to action al formato del canale.'),
  STYLE_RULES,
  'Rispondi solo con il testo da pubblicare (con eventuali hashtag): niente titolo del documento, intestazioni, separatori, note su lunghezza, tono o obiettivo, commenti o alternative.'
 ];
 return lines.filter(Boolean).join('\n');
}
// What would make a post underperform, checked without AI on the written text. Each problem has a plain label
// and a hint the copywriter can follow when the person asks to improve it.
const AI_CLICHES=/(?:^|[^\wÀ-ÿ])(in un mondo in cui|nel panorama attuale|è fondamentale|in conclusione|sbloccare il potenziale|fare la differenza|game[- ]changer|a 360 gradi)(?![\wÀ-ÿ])/i;
const VAGUE_STATS=/\b(in media|la maggior parte (?:degli|delle|dei)|studi dimostrano|le statistiche dicono|secondo (?:le )?ricerche|la metà (?:degli|delle|dei))\b/i;
function postProblems(text,channel,opts={}){
 const t=String(text||'').trim(),slug=channelSlug(channel),out=[];if(!t)return out;
 const add=(id,label,hint)=>out.push({id,label,hint});
 const body=t.replace(/(\s#[\wÀ-ÿ]+)+\s*$/,'').trim(),hashtags=(t.match(/(^|\s)#[A-Za-zÀ-ÿ][\wÀ-ÿ]*/g)||[]).length;
 const first=body.split(/\n\s*\n/)[0]||'',paras=body.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean),tail=body.slice(-260);
 const contrasts=(body.match(/\bnon (?:è|sono|significa|si misura|serve)(?![\wÀ-ÿ])[^.!?\n]{0,90}[.,:;]\s*(?:è|sono|significa|si misura|serve)(?![\wÀ-ÿ])/gi)||[]).length;
 if(slug==='linkedin'){
  if(first.length>210)add('hook','L’apertura è lunga: su LinkedIn si leggono circa 2 righe prima di «…altro».','Accorcia l’apertura a una o due righe (massimo 200 caratteri) con un gancio concreto.');
  if(body.length<600)add('short','Il post è corto per LinkedIn.','Allunga a 900-1600 caratteri con un esempio vissuto e un consiglio pratico.');
  if(body.length>2400)add('long','Il post è molto lungo per LinkedIn.','Taglia a 900-1600 caratteri tenendo una sola idea.');
  if(/https?:\/\//i.test(body))add('link','C’è un link nel testo: LinkedIn mostra meno i post con link esterni.','Togli il link dal testo: va nel primo commento.');
 }
 if(['linkedin','instagram','facebook'].includes(slug)){
  if(/\*\*[^*\n]+\*\*|^#{1,6}\s/m.test(body))add('markdown','Ci sono asterischi o #titoli: sul social si vedono così come sono.','Togli gli asterischi e i #titoli: testo semplice, elenchi con 1. 2. 3.');
  if(!/\?/.test(tail))add('cta','Manca una domanda finale: senza commenti il post gira poco.','Chiudi con una domanda precisa a cui il pubblico sa rispondere dalla propria esperienza.');
  if(paras.some(p=>p.length>420))add('wall','Ci sono paragrafi lunghi: sul telefono diventano un muro di testo.','Spezza i paragrafi in blocchi di 1-3 righe.');
  if(hashtags>(slug==='instagram'?10:4))add('tags','Troppi hashtag.','Tieni al massimo 3 hashtag specifici in fondo.');
 }
 if(opts.personal&&!/\b(io|ho|mi|mio|mia|miei|mie|sono stato|ho visto|ho fatto|ricordo)\b/i.test(body))add('voice','Non c’è esperienza in prima persona: per un personal brand il post sembra un articolo.','Riscrivi in prima persona singolare partendo da un’esperienza vera tra i fatti verificati.');
 if(contrasts>=2)add('cliche','Troppe frasi «non è X, è Y»: suona scritto dall’AI.','Togli le contrapposizioni «non è… è…» tranne al massimo una; scrivi in modo diretto.');
 else if(AI_CLICHES.test(body))add('cliche','C’è una frase fatta da testo AI.','Sostituisci le frasi fatte con un esempio concreto.');
 const vague=VAGUE_STATS.exec(body);if(vague)add('stat','Statistica generica senza fonte: «'+vague[1]+'».','Togli «'+vague[1]+'» e le stime non verificate: usa i fatti verificati o un caso concreto senza numeri.');
 return out;
}
// One note for the copywriter from the problems found, used by «Migliora».
function problemsNote(problems){return (problems||[]).map(p=>'- '+p.hint).join('\n')}
// Keeps only what goes on the channel: removes code fences and, when the answer wraps the post between "---"
// separators with notes above and below, keeps the longest block.
// Short clip for LinkedIn from a long video script: the strongest passage as a 30-40 second avatar script, plus
// the post text that goes with it. Same voice and verified facts as the long video, nothing new.
function clipPrompt(brief,item){const b=brief||{};
 return ['Dallo script del video YouTube qui sotto ricava uno spezzone video di 30-40 secondi per LinkedIn, detto dallo stesso avatar.',
  'Titolo del video: '+(item&&item.title||''),'Pubblico: '+(b.audience||'—'),'Tone of voice: '+(b.voice||'—'),
  'Script dello spezzone: scegli il passaggio più forte (il problema dello spettatore, un’idea, una chiusura); da 75 a 100 parole parlate, in prima persona, senza indicazioni di regia, titoli o note. Puoi accorciare e collegare le frasi, ma non aggiungere fatti, numeri o casi che non sono nello script.',
  'Testo del post LinkedIn che accompagna il video: gancio entro 200 caratteri, da 300 a 700 caratteri, testo semplice senza markdown, chiude con una domanda precisa al lettore e l’invito a guardare il video completo sul canale YouTube; nessun link, al massimo 3 hashtag.',
  isPersonal(b)?'È un personal brand: prima persona singolare, rivolto al lettore con il tu.':'',
  STYLE_RULES,
  'Rispondi solo in questo formato:\n---POST---\n(testo del post)\n---SCRIPT---\n(script parlato)\n---FINE---',
  'Script del video completo:\n'+String(item&&item.copy||'').slice(0,20000)].filter(Boolean).join('\n\n')}
// A short clip edited in scenes: the script split at sentence ends into 3-5 parts of similar length, each with
// a look of the same avatar (rotating, the chosen one first) and a framing that alternates full and closer shots.
const SCENE_SCALES=[1,1.35,1,1.5,1.2];
function clipScenes(script,looks){const ids=[...new Set((looks||[]).filter(Boolean))];if(!ids.length)return [];
 const sentences=String(script||'').replace(/\s+/g,' ').trim().match(/[^.!?…]+[.!?…]+["»”]?|[^.!?…]+$/g)||[];
 const words=s=>s.trim().split(/\s+/).length,total=sentences.reduce((n,x)=>n+words(x),0);if(!total)return [];
 const n=Math.min(sentences.length,total<70?3:total<110?4:5),target=total/n,scenes=[];let cur=[],count=0;
 sentences.forEach((x,i)=>{cur.push(x.trim());count+=words(x);const left=sentences.length-i-1,need=n-scenes.length-1;if((count>=target&&scenes.length<n-1&&left>=need)||left<need+0){scenes.push(cur.join(' '));cur=[];count=0}});
 if(cur.length)scenes.push(cur.join(' '));
 return scenes.map((text,i)=>({text,talkingPhotoId:ids[i%ids.length],scale:SCENE_SCALES[i%SCENE_SCALES.length]}))}
function parseClip(text){const m=/---POST---\s*([\s\S]*?)\s*---SCRIPT---\s*([\s\S]*?)\s*(?:---FINE---|$)/.exec(String(text||''));
 const post=m?plainSocial(m[1].trim(),'linkedin'):'',script=m?m[2].trim():'';
 if(!post||script.split(/\s+/).length<30)throw Error('Il Copywriter non ha restituito post e script dello spezzone');return {post,script}}
function cleanCopy(text){
 let t=String(text||'');
 // The agents wrap deliverables as «---DOCUMENTO: titolo--- … ---FINE DOCUMENTO---» with notes around: keep only the body.
 const doc=/---DOCUMENTO:[^\n]*---[ \t]*\n([\s\S]*?)(?:\n[ \t]*---FINE DOCUMENTO---|$)/.exec(t);if(doc)t=doc[1];
 t=t.replace(/^\s*```[a-z]*\s*\n?/i,'').replace(/\n?```\s*$/,'').trim();
 const parts=t.split(/\n\s*-{3,}\s*\n/).map(x=>x.trim()).filter(Boolean);
 if(parts.length>=3){const body=parts.reduce((a,b)=>b.length>a.length?b:a),tags=[...new Set(parts.filter(x=>x!==body).join(' ').match(/(^|\s)#[A-Za-zÀ-ÿ][\wÀ-ÿ]*/g)||[])].map(x=>x.trim()).filter(x=>!body.includes(x));t=body+(tags.length?'\n\n'+tags.join(' '):'')}
 return t;
}
// Social networks show markdown literally: **bold**, __bold__ and "# Title" lines become plain text there.
const PLAIN_CHANNELS=new Set(['linkedin','instagram','facebook','x','tiktok']);
function plainSocial(text,channel){if(!PLAIN_CHANNELS.has(channelSlug(channel))||/newsletter/i.test(String(channel||'')))return String(text||'');
 return String(text||'').replace(/\*\*([^*\n]+)\*\*/g,'$1').replace(/__([^_\n]+)__/g,'$1').replace(/^#{1,6}\s+/gm,'')}
// What a content needs beyond text: a video script for the avatar, a carousel, or one image.
function mediaKind(item){const t=String((item&&item.channel)||'')+' '+String((item&&item.title)||'');
 // A short avatar clip cut from a long video is a video post on any channel (its spoken script is item.script).
 if(item&&item.format==='video')return 'video';
 // Email newsletters go out from the CRM (consent, tracked links, unsubscribe); a LinkedIn newsletter stays a post.
 const ch=String((item&&item.channel)||'');if(/e-?mail|mailing/i.test(ch)||(/newsletter/i.test(ch)&&!/linkedin/i.test(ch)))return 'email';
 if(/youtube|video|reel|tiktok/i.test(t))return 'video';
 // The person can turn any image post into a carousel (or back): item.format wins over the channel default.
 if(item&&(item.format==='carousel'||item.format==='image'))return item.format;
 if(/instagram|carosell|carousel/i.test(t))return 'carousel';return 'image'}
function slidesPrompt(item,brief){
 const carousel=mediaKind(item)==='carousel',b=brief||{};
 return ['Contenuto già scritto per '+(item.channel||'il canale')+' («'+(item.title||'')+'»): preparane la grafica.',
  carousel?'Formato: carosello da 5 a 8 slide: la prima è il gancio del post, poi un punto per slide, l’ultima l’invito finale.':'Formato: una sola immagine (1 slide) che accompagna il post: il gancio o il consiglio pratico del testo in poche parole (al massimo 12), non il titolo ripetuto; leggibile anche nell’anteprima piccola del feed. Scegli il layout più adatto al messaggio e aggiungilo come ultimo campo: statement (frase forte), quote (citazione), question (domanda), list (3-5 punti separati da ·), stat (un dato già presente nel testo). Varia i colori tra quelli del brand.',
  'Identità visiva del progetto: '+(b.brand||'—'),
  'Testo del contenuto:\n'+String(item.copy||'').slice(0,6000),
  'Usa solo frasi e dati presenti nel testo, senza numeri nuovi. Rispondi con 2-3 righe di direzione visiva e il blocco ---SLIDES--- (una riga per slide: numero|#sfondo|#testo|testo della slide, e per l’immagine singola |layout in fondo) chiuso da ---FINE---.'
 ].join('\n');
}

// Plan analytics from the PED itself and the publishing log: production and timing, not engagement
// (Buffer statistics are not read). Dates are compared as local days in the plan's time zone.
const DAY=86400000;
const isoDay=ms=>new Date(ms).toISOString().slice(0,10);
function localToday(now,tz){try{return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))}catch(e){return isoDay(now)}}
function addDays(day,n){return isoDay(Date.parse(day+'T12:00:00Z')+n*DAY)}
function mondayOf(day){const d=new Date(day+'T12:00:00Z');return addDays(day,-((d.getUTCDay()+6)%7))}
function analytics(state,opts={}){
 const items=(state&&state.contents)||[],pubs=opts.pubs||[],tz=(state&&state.timezone)||'Europe/Rome';
 const today=opts.today||localToday(opts.now==null?Date.now():opts.now,tz),weeks=opts.weeks||8;
 const by={draft:0,review:0,approved:0,queued:0},channels={};
 items.forEach(x=>{const c=columnOf(x);by[c]=(by[c]||0)+1;const ch=channels[x.channel]||(channels[x.channel]={channel:x.channel,total:0,draft:0,review:0,approved:0,queued:0});ch.total++;ch[c]=(ch[c]||0)+1});
 const start=mondayOf(today),buckets=Array.from({length:weeks},(_,i)=>({start:addDays(start,i*7),end:addDays(start,i*7+6),count:0,ready:0}));
 items.forEach(x=>{if(!x.date)return;const b=buckets.find(w=>x.date>=w.start&&x.date<=w.end);if(b){b.count++;if(['approved','queued'].includes(columnOf(x)))b.ready++}});
 const failed=new Set(pubs.filter(p=>p.status==='failed').map(p=>p.content_id+'#'+p.revision));
 const attention=[];
 items.forEach(x=>{const c=columnOf(x),base={id:x.id,title:x.title,channel:x.channel,date:x.date||''};
  if(failed.has(x.id+'#'+x.revision)&&c!=='queued')attention.push({...base,kind:'failed',label:'Invio a Buffer non riuscito'});
  else if(!x.date)attention.push({...base,kind:'undated',label:'Senza data'});
  else if(x.date<today&&c!=='queued')attention.push({...base,kind:'late',label:'Data passata, non in coda'});
  else if(x.date<=addDays(today,7)&&(c==='draft'||c==='review'))attention.push({...base,kind:'soon',label:c==='review'?'Esce entro 7 giorni, ancora in revisione':'Esce entro 7 giorni, ancora in bozza'});
  else if(c==='approved'&&x.date>=today)attention.push({...base,kind:'ready',label:'Approvato, da mettere in coda'})});
 const order={failed:0,late:1,soon:2,ready:3,undated:4};attention.sort((a,b)=>order[a.kind]-order[b.kind]||(a.date||'9999').localeCompare(b.date||'9999'));
 const next14=items.filter(x=>x.date&&x.date>=today&&x.date<=addDays(today,13)),done=c=>c==='approved'||c==='queued';
 const pct=(n,d)=>d?Math.round(n*100/d):null;
 return {today,timezone:tz,total:items.length,byStatus:by,
  kpis:{approvedShare:pct(by.approved+by.queued,items.length),next14:next14.length,next14Ready:pct(next14.filter(x=>done(columnOf(x))).length,next14.length),
   emptyWeeks:buckets.filter(w=>!w.count).length,avgRevisions:items.length?Math.round(items.reduce((a,x)=>a+(x.revision||1),0)*10/items.length)/10:0,late:attention.filter(a=>a.kind==='late').length},
  channels:Object.values(channels).sort((a,b)=>b.total-a.total||a.channel.localeCompare(b.channel)),weeks:buckets,attention,
  publications:{queued:pubs.filter(p=>p.status==='queued').length,failed:pubs.filter(p=>p.status==='failed').length,sending:pubs.filter(p=>p.status==='sending').length}};
}

// Plan proposal: the Social Media Manager suggests the calendar from the approved strategy. It only answers with
// a JSON list; nothing enters the PED until someone picks the items, and every picked item is a draft.
const MAX_PROPOSAL=60;
const WEEKDAYS=['dom','lun','mar','mer','gio','ven','sab'];
// The next days as "lun 2026-10-19" lines, one per week, so the AI copies real weekdays instead of computing them.
function dayList(today,days){const start=Date.parse(today+'T12:00:00Z');if(isNaN(start))return '';const out=[];let line=[];
 for(let i=0;i<days;i++){const d=new Date(start+i*864e5);line.push(WEEKDAYS[d.getUTCDay()]+' '+isoDay(d.getTime()));if(d.getUTCDay()===0){out.push(line.join(', '));line=[]}}
 if(line.length)out.push(line.join(', '));return out.join('\n')}
function planPrompt(state,today){
 const b=(state&&state.brief)||{},have=((state&&state.contents)||[]).filter(x=>x.date&&x.date>=today).slice(0,60);
 const rubrics=((state&&state.rubrics)||[]).map(r=>r.name+(r.cadence?' ('+r.cadence+')':'')).join('; ');
 return [
  'Proponi il calendario del piano editoriale a partire da oggi, '+today+', per il periodo indicato nella strategia (al massimo 8 settimane).',
  'Canali: '+(b.channels||'—'),'Periodo: '+(b.period||'—'),'Frequenza per canale: '+(b.frequency||'—'),
  'Obiettivo: '+(b.goal||'—'),'Pubblico: '+(b.audience||'—'),'Messaggi chiave: '+(b.messages||'—'),
  'Rubriche e argomenti: '+(rubrics||b.topics||'—'),'KPI: '+(b.kpis||'—'),
  have.length?'Contenuti già in calendario (non ripeterli):\n'+have.map(x=>'- '+x.date+' · '+x.channel+' · '+x.title).join('\n'):'',
  'Calendario reale da usare per date e giorni della settimana (non calcolarli):\n'+dayList(today,56),
  'Brand, posizionamento e fatti: '+([b.brand,b.positioning,b.offer].filter(Boolean).join(' · ')||'—'),
  'Rispetta esattamente la frequenza, i giorni e gli orari indicati per ciascun canale (ogni canale, compresi newsletter e video), fino alla fine del periodo; al massimo '+MAX_PROPOSAL+' contenuti.',
  'Non inventare numeri, cifre in euro, percentuali, durate o casi di clienti: usa solo i dati presenti qui sopra; se un tema richiede un dato che manca, scrivi lo spunto senza numeri e non chiedere «numeri concreti».',
  'Alterna i formati e scrivi il formato all’inizio dello spunto: «Storia vissuta», «Errore visto o commesso», «Come fare (passi)», «Opinione controcorrente», «Caso reale», «Dietro le quinte», «Domanda al pubblico». Ogni spunto indica un gancio concreto e, se c’è, l’esperienza o il risultato verificato da cui partire.',
  'Rispondi solo con un array JSON, senza testo prima o dopo, nel formato:',
  '[{"date":"AAAA-MM-GG","time":"HH:MM","channel":"LinkedIn","title":"Tema del contenuto","rubric":"Nome rubrica o vuoto","angle":"Spunto in una o due frasi"}]'
 ].filter(Boolean).join('\n');
}
function realDay(d){return /^\d{4}-\d{2}-\d{2}$/.test(d)&&isoDay(Date.parse(d+'T12:00:00Z'))===d}
// Reads the AI answer into PED items: valid fields only, from today up to one year, no duplicates of the plan or of
// each other. Rubrics are matched by name to the PED's own rubrics. skipped counts what was left out and why.
function parsePlan(text,state,today){
 const t=String(text||''),start=t.indexOf('['),end=t.lastIndexOf(']');let list;
 try{list=JSON.parse(start>=0&&end>start?t.slice(start,end+1):t)}catch(e){throw Error('La proposta dell’AI non è leggibile: riprova.')}
 if(!Array.isArray(list))throw Error('La proposta dell’AI non è leggibile: riprova.');
 const rubrics=(state&&state.rubrics)||[],limit=addDays(today,366),seen=new Set(((state&&state.contents)||[]).map(x=>[x.title.toLowerCase(),x.channel.toLowerCase(),x.date].join('|')));
 const items=[],skipped={invalid:0,past:0,duplicate:0,extra:0};
 for(const raw of list){
  const r=raw&&typeof raw==='object'?raw:{},title=String(r.title||'').trim().replace(/\s+/g,' '),channel=String(r.channel||'').trim(),date=String(r.date||'').trim(),time=String(r.time||'').trim();
  if(!title||title.length>200||!channel||channel.length>100||!realDay(date)){skipped.invalid++;continue}
  if(date<today||date>limit){skipped.past++;continue}
  const key=[title.toLowerCase(),channel.toLowerCase(),date].join('|');if(seen.has(key)){skipped.duplicate++;continue}
  if(items.length>=MAX_PROPOSAL){skipped.extra++;continue}
  seen.add(key);const rubric=rubrics.find(x=>x.name.toLowerCase()===String(r.rubric||'').trim().toLowerCase());
  items.push({date,time:/^([01]\d|2[0-3]):[0-5]\d$/.test(time)?time:'',channel,title,rubricId:rubric?rubric.id:'',angle:String(r.angle||'').trim().slice(0,1000)});
 }
 items.sort((a,b)=>(a.date+(a.time||'99:99')).localeCompare(b.date+(b.time||'99:99')));
 return {items,skipped};
}

// Three alternative campaigns from the approved strategy, so the user picks one instead of filling the form.
function campaignIdeasPrompt(state,today){
 const b=(state&&state.brief)||{},have=((state&&state.campaigns)||[]).map(c=>'- '+c.name+(c.start||c.end?' ('+(c.start||'…')+' → '+(c.end||'…')+')':'')).join('\n');
 return [
  'Proponi 3 campagne alternative per il piano editoriale, diverse tra loro per idea e periodo, a partire da oggi, '+today+'.',
  'Obiettivo: '+(b.goal||'—'),'Pubblico: '+(b.audience||'—'),'Canali: '+(b.channels||'—'),'Periodo del piano: '+(b.period||'—'),
  'Offerta: '+(b.offer||'—'),'Messaggi chiave: '+(b.messages||'—'),'Posizionamento: '+(b.positioning||'—'),'KPI: '+(b.kpis||'—'),
  have?'Campagne già presenti (non ripeterle):\n'+have:'',
  'Calendario reale per le date (non calcolarle):\n'+dayList(today,91),
  'Ogni campagna dura da 1 a 8 settimane, dentro i prossimi 90 giorni, e usa solo i canali indicati sopra.',
  'Non inventare numeri, cifre in euro, percentuali, sconti, eventi o casi di clienti: usa solo i dati qui sopra.',
  'Rispondi solo con un array JSON di 3 oggetti, senza testo prima o dopo, nel formato:',
  '[{"name":"Nome breve","start":"AAAA-MM-GG","end":"AAAA-MM-GG","goal":"Obiettivo e idea in due frasi","channels":"LinkedIn, Instagram"}]'
 ].filter(Boolean).join('\n');
}
// Reads at most 3 campaigns: a name, real dates from today within 120 days, end not before start, no name already used.
// A campaign picked from the AI proposals becomes a team-memory proposal: a person confirms it on the Memoria page.
function campaignMemory(c,projectId,clientId){const t=s=>String(s||'').replace(/\s+/g,' ').trim();
 return {level:'project',kind:'decision',status:'proposed',projectId:String(projectId||''),clientId:String(clientId||''),title:('Campagna scelta: '+t(c.name)).slice(0,140),
  content:('Campagna «'+t(c.name)+'» dal '+c.start+' al '+c.end+'. Obiettivo: '+t(c.goal)+(t(c.channels)?'. Canali: '+t(c.channels):'')+'. Scelta tra le proposte dell’AI nel Piano editoriale.').slice(0,4000),
  source:'Piano editoriale · campagne proposte'}}
function parseCampaignIdeas(text,state,today){
 const t=String(text||''),start=t.indexOf('['),end=t.lastIndexOf(']');let list;
 try{list=JSON.parse(start>=0&&end>start?t.slice(start,end+1):t)}catch(e){throw Error('Le proposte dell’AI non sono leggibili: riprova.')}
 if(!Array.isArray(list))throw Error('Le proposte dell’AI non sono leggibili: riprova.');
 const limit=addDays(today,120),seen=new Set(((state&&state.campaigns)||[]).map(c=>c.name.toLowerCase())),out=[];
 for(const raw of list){if(out.length>=3)break;const r=raw&&typeof raw==='object'?raw:{};
  const name=String(r.name||'').trim().replace(/\s+/g,' '),s=String(r.start||'').trim(),e=String(r.end||'').trim();
  if(!name||name.length>120||seen.has(name.toLowerCase())||!realDay(s)||!realDay(e)||s<today||e<s||e>limit)continue;
  seen.add(name.toLowerCase());out.push({name,start:s,end:e,goal:String(r.goal||'').trim().slice(0,1000),channels:String(r.channels||'').trim().slice(0,300)})}
 return out;
}

// Pure: how often each channel appears in a proposal, per week over the proposal's own span,
// so the user can compare it with the brief's frequency before adding anything.
function cadence(items){
 const list=(items||[]).filter(x=>x&&x.channel&&realDay(x.date));if(!list.length)return [];
 const days=list.map(x=>Date.parse(x.date+'T00:00:00Z')),span=Math.max(7,(Math.max(...days)-Math.min(...days))/864e5+1),weeks=span/7;
 const by=new Map();for(const x of list)by.set(x.channel,(by.get(x.channel)||0)+1);
 return [...by].map(([channel,count])=>({channel,count,perWeek:Math.round(count/weeks*10)/10})).sort((a,b)=>b.count-a.count||a.channel.localeCompare(b.channel));
}

// Strategy brief filled from the agency work already approved: the AI maps the approved drafts onto the PED brief
// fields, using only what they say; nothing is saved or approved until a person checks the form.
const BRIEF_SOURCE_MAX=60000;
function briefPrompt(labels,profile,tasks){
 const keys=Object.keys(labels||{}),pb=(profile&&profile.brief)||{},approved=(tasks||[]).filter(t=>t&&t.status==='approved'&&String(t.output||'').trim());
 let budget=BRIEF_SOURCE_MAX;const parts=[];
 for(const t of approved){const body=String(t.output).slice(0,Math.max(0,budget));if(!body)break;budget-=body.length;parts.push('### '+(t.roleName||t.role||t.id)+(t.feedback?'\nNote approvate: '+String(t.feedback).slice(0,1500):'')+'\n'+body)}
 return [
  'Compila il brief strategico del piano editoriale usando SOLO le informazioni qui sotto: profilo del progetto e bozze già approvate dal cliente.',
  'Non inventare numeri, casi, clienti, strumenti o risultati. Se un campo non è coperto dalle fonti scrivi «Da definire» e cosa manca.',
  'Scrivi in italiano, in modo sintetico e operativo: al massimo 600 caratteri per campo, compila TUTTI i campi elencati. Per "frequency" indica la frequenza per ciascun canale; per "period" il periodo coperto dal piano.',
  'Campi da compilare:',keys.map(k=>'- '+k+': '+labels[k]).join('\n'),
  'PROFILO DEL PROGETTO:',JSON.stringify({nome:profile&&profile.name,obiettivo:pb.goal,pubblico:pb.audience,mercato:pb.market,piattaforme:pb.platforms,regole:pb.brandRules,vincoli:pb.constraints,fatti:pb.facts}),
  'BOZZE APPROVATE:',parts.join('\n\n')||'nessuna',
  'Rispondi solo con un oggetto JSON con esattamente queste chiavi e valori testuali, senza testo prima o dopo.'
 ].join('\n');
}
// Reads the AI answer into {key:text} for the known keys only, each trimmed to its field limit.
function parseBrief(text,labels,limits){
 const t=String(text||''),start=t.indexOf('{'),end=t.lastIndexOf('}');let o;
 try{o=JSON.parse(start>=0&&end>start?t.slice(start,end+1):t)}catch(e){throw Error('Il brief proposto dall’AI non è leggibile: riprova.')}
 if(!o||typeof o!=='object'||Array.isArray(o))throw Error('Il brief proposto dall’AI non è leggibile: riprova.');
 const byLabel={};Object.keys(o).forEach(x=>{byLabel[String(x).trim().toLowerCase()]=o[x]});
 const out={};for(const k of Object.keys(labels||{})){let v=o[k]!=null?o[k]:byLabel[String(labels[k]).toLowerCase()];if(Array.isArray(v))v=v.join('\n');if(v==null||typeof v==='object')continue;v=String(v).trim();if(v)out[k]=v.slice(0,(limits&&limits[k])||2000)}
 if(!Object.keys(out).length)throw Error('L’AI non ha compilato nessun campo: riprova.');
 return out;
}

// ---- identità visiva: one colour per role, font and signature, written in the profile so every image follows it ----
const IDENTITY_FONTS=['Inter','Montserrat','Poppins','Lato','Roboto','Open Sans','Playfair Display','Lora','Raleway','Work Sans'];
const IDENTITY_ROLES=[['cover','Copertina e chiusura'],['page','Pagine interne'],['key','Numeri e parole chiave'],['accent','Accento'],['text','Testi su fondo chiaro']];
const HEX=/^#[0-9a-fA-F]{6}$/;
function hexLum(hex){const h=hex.replace('#','');return [0,2,4].map(i=>{const v=parseInt(h.slice(i,i+2),16)/255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)}
const hexContrast=(a,b)=>{const x=hexLum(a),y=hexLum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
function hexSat(hex){const h=hex.replace('#',''),c=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255),mx=Math.max(...c),mn=Math.min(...c),l=(mx+mn)/2;return mx===mn?0:(mx-mn)/(1-Math.abs(2*l-1))}
// The text the profile keeps: one line per role, so lib/radix-agent-media.js styleGuide reads it back.
function identityText(g,source){
 const lines=source?[String(source).replace(/#[0-9a-fA-F]{3,8}/g,'').trim()+'.']:[];
 for(const [k,label] of IDENTITY_ROLES)lines.push(label+': '+String(g[k]).toUpperCase()+'.');
 const f=IDENTITY_FONTS.includes(g.font)?g.font:'Inter';lines.push('Font: '+f+' Bold per i titoli brevi, '+f+' Regular per i testi; al massimo due pesi.');
 if(String(g.signature||'').trim())lines.push('Firma: '+String(g.signature).trim().slice(0,40)+' in alto a sinistra, numerazione in basso.');
 lines.push('Margini ampi; nessun nuovo colore al cambio di argomento.');return lines.join('\n')}
// What would make the images hard to read, in plain words.
function identityProblems(g){const out=[];if(hexContrast(g.cover,g.page)<4.5)out.push('Copertina e pagine interne sono troppo simili: il testo non si legge.');if(hexContrast(g.text,g.page)<4.5)out.push('Il testo è poco leggibile sulle pagine interne.');if(hexContrast(g.key,g.page)<3)out.push('Il colore delle parole chiave si vede poco sulle pagine interne.');return out}
function identityPrompt(brief,name){const b=brief||{};
 return ['Progetta l’identità visiva dei post social del progetto «'+(name||'')+'».',
  'Brand e contesto: '+(b.brand||'—'),'Offerta: '+(b.offer||'—'),'Pubblico: '+(b.audience||'—'),'Tone of voice: '+(b.voice||'—'),'Canali: '+(b.channels||'—'),
  'Regole: un colore scuro per copertina e chiusura, uno chiaro per le pagine interne, uno per numeri e parole chiave, un accento usato poco, un colore per il testo su fondo chiaro. Contrasto leggibile da smartphone (almeno 4,5:1 tra testo e fondo). Un solo font tra: '+IDENTITY_FONTS.join(', ')+'. La firma è il nome che compare in alto su ogni immagine.',
  'Rispondi solo con un oggetto JSON: {"cover":"#RRGGBB","page":"#RRGGBB","key":"#RRGGBB","accent":"#RRGGBB","text":"#RRGGBB","font":"Inter","signature":"NOME","reason":"una frase sul perché"}'].join('\n')}
function parseIdentity(text){const m=/\{[\s\S]*\}/.exec(String(text||''));if(!m)throw Error('L’AI non ha proposto un’identità leggibile: riprova.');let o;try{o=JSON.parse(m[0])}catch(e){throw Error('L’AI non ha proposto un’identità leggibile: riprova.')}
 const g={};for(const [k] of IDENTITY_ROLES){if(!HEX.test(String(o[k]||'').trim()))throw Error('Manca il colore «'+k+'» nella proposta: riprova.');g[k]=String(o[k]).trim().toUpperCase()}
 g.font=IDENTITY_FONTS.find(f=>f.toLowerCase()===String(o.font||'').trim().toLowerCase())||'Inter';g.signature=String(o.signature||'').trim().slice(0,40);g.reason=String(o.reason||'').trim().slice(0,400);return g}
// Colours taken from a moodboard image, most used first, given a role each: darkest for the cover, lightest for the pages, the most saturated for key words and accent.
function assignRoles(hexes){const list=[...new Set((hexes||[]).filter(h=>HEX.test(h)).map(h=>h.toUpperCase()))];if(list.length<2)throw Error('Nella moodboard servono almeno due colori diversi.');
 const byLum=[...list].sort((a,b)=>hexLum(a)-hexLum(b)),cover=byLum[0],page=byLum[byLum.length-1],rest=list.filter(h=>h!==cover&&h!==page);
 const vivid=rest.filter(h=>hexSat(h)>.25).sort((a,b)=>hexSat(b)-hexSat(a)),key=vivid.find(h=>hexContrast(h,page)>=3)||vivid[0]||cover,accent=vivid.find(h=>h!==key)||key;
 const text=rest.filter(h=>h!==key&&h!==accent&&hexContrast(h,page)>=4.5).sort((a,b)=>hexSat(a)-hexSat(b))[0]||cover;return {cover,page,key,accent,text}}

// «Scarica il post»: everything a content has, as the files of one .zip (built by RadixZip in the page).
// Pure: the page passes the images already drawn/fetched as bytes. No network, no AI.
const fileSlug=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'');
function postBundleName(item,projectName){const d=/^\d{4}-\d{2}-\d{2}$/.test(String(item&&item.date||''))?item.date:'senza-data';return (fileSlug(projectName)||'progetto')+'-'+d+'-'+(fileSlug(item&&item.channel)||'canale')+'.zip'}
function postHashtags(item){const own=item&&item.hashtags,list=Array.isArray(own)?own:String(own||'').split(/[\s,]+/);
 return [...new Set([...list,...(String(item&&item.copy||'').replace(/---SLIDES---[\s\S]*?---FINE---/g,' ').match(/(?<![\p{L}\p{N}_&])#[\p{L}\p{N}_]+/gu)||[])].map(h=>String(h).trim()).filter(h=>h&&/\p{L}/u.test(h)&&!/^#?[0-9a-f]{6}$/i.test(h)).map(h=>h.startsWith('#')?h:'#'+h))]}
const PHOTO_EXT={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
// opts: {project (name), timezone, slides:[bytes PNG], photo:{data,type}, photoPost:bytes PNG, photoError, videoUrl, notes:[text]}
function postBundle(item,opts={}){const x=item||{},o=opts||{},files=[],notes=[...(o.notes||[])].filter(Boolean),kind=mediaKind(x),tags=postHashtags(x);
 const when=[x.date||'senza data',x.time||''].filter(Boolean).join(' ')+(x.date&&o.timezone?' ('+o.timezone+')':'');
 const head=[['Progetto',o.project],['Titolo',x.title],['Canale',x.channel],['Data',when],['CTA',x.cta],['Hashtag',tags.join(' ')]].filter(([,v])=>String(v||'').trim()).map(([k,v])=>k+': '+String(v).trim());
 const copy=String(x.copy||'').replace(/\n?---SLIDES---[\s\S]*?---FINE---/g,'').trim();
 files.push({name:'testo.txt',data:head.join('\n')+'\n\n---\n\n'+(copy||'(testo non ancora scritto)')+'\n'});
 const slides=(o.slides||[]).filter(Boolean),pad=n=>String(n).padStart(2,'0');
 slides.forEach((d,i)=>files.push({name:slides.length===1?'grafica.png':'slide-'+pad(i+1)+'.png',data:d}));
 if(x.photo&&x.photo.requestId&&slides.length)notes.push('Il post esce con la foto di Studio Foto: le grafiche disegnate sono l’alternativa.');
 if(x.photo&&x.photo.requestId){if(o.photo&&o.photo.data){files.push({name:'foto.'+(PHOTO_EXT[String(o.photo.type||'').split(';')[0]]||'jpg'),data:o.photo.data});if(o.photoPost)files.push({name:'foto-con-titolo.png',data:o.photoPost})}
  else notes.push('La foto di Studio Foto non è stata scaricata'+(o.photoError?' ('+o.photoError+')':'')+': aprila dal post in RADIX e riprova.')}
 const video=String(o.videoUrl||(x.video&&x.video.url)||'').trim();
 if(/^https:\/\/\S+$/.test(video))files.push({name:'video.url.txt',data:video+'\n'});
 else if(kind==='video')notes.push('Il link del video non è salvato nel post: genera la bozza con HeyGen dal PED (il link resta valido 7 giorni).');
 const list=files.map(f=>'- '+f.name).join('\n');
 files.push({name:'LEGGIMI.txt',data:'Post «'+String(x.title||'').trim()+'»'+(x.channel?' · '+x.channel:'')+(x.date?' · '+x.date:'')+'\n\nContenuto dell’archivio:\n'+list+'\n'+(notes.length?'\nNote:\n'+notes.map(n=>'- '+n).join('\n')+'\n':'')});
 return files}

return Object.freeze({clipScenes,clipPrompt,parseClip,postBundle,postBundleName,postHashtags,bufferChannelFor,schedulePlan,cadence,CHANNELS,briefPrompt,parseBrief,cleanCopy,plainSocial,videoLength,mediaKind,slidesPrompt,postProblems,problemsNote,isPersonal,channelGuide,CHANNEL_GUIDES,COLUMNS,channelSlug,isQueued,columnOf,board,channelsFromBrief,copyPrompt,analytics,mondayOf,localToday,planPrompt,parsePlan,campaignIdeasPrompt,parseCampaignIdeas,campaignMemory,MAX_PROPOSAL,IDENTITY_FONTS,IDENTITY_ROLES,identityText,identityProblems,identityPrompt,parseIdentity,assignRoles});
});
