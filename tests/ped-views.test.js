'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const pv=require('../lib/ped-views.js'),core=require('../editorial-core.js');

test('channel slugs match the known channels and fall back safely',()=>{
 assert.equal(pv.channelSlug('LinkedIn'),'linkedin');assert.equal(pv.channelSlug(' instagram reel'),'instagram');
 assert.equal(pv.channelSlug('Podcast Spotify'),'podcast-spotify');assert.equal(pv.channelSlug(''),'altro');
 assert.equal(pv.channelSlug('Città<script>'),'citta-script');
});

test('the board groups contents by state and only the approved revision counts as queued',()=>{
 const items=[{id:'a',status:'draft',date:'2026-11-03'},{id:'b',status:'review',date:'2026-11-01'},{id:'c',status:'approved',revision:2,date:'2026-11-02'},
  {id:'d',status:'approved',revision:3,publication:{revision:3},date:'2026-11-04'},{id:'e',status:'approved',revision:4,publication:{revision:3},date:'2026-11-05'},{id:'f',status:'draft',revision:5,publication:{revision:5}}];
 const cols=Object.fromEntries(pv.board(items).map(c=>[c.id,c.items.map(i=>i.id)]));
 assert.deepEqual(cols,{draft:['a','f'],review:['b'],approved:['c','e'],queued:['d']});
});

test('a new version of a queued content leaves the queue and needs a new approval',()=>{
 const s=core.create({id:'p1',summary:'Obiettivo'});s.briefApproved=true;s.strategyRevision=1;
 const c=core.updateContent(s,{id:'x',title:'Post',channel:'LinkedIn',date:'2026-11-02',copy:'Testo'});core.review(s,'x','request');core.review(s,'x','approve');
 s.contents[0].publication={service:'buffer',revision:s.contents[0].revision};assert.equal(pv.isQueued(s.contents[0]),true);
 core.updateContent(s,{id:'x',title:'Post',channel:'LinkedIn',date:'2026-11-02',copy:'Testo nuovo'});
 assert.equal(pv.isQueued(s.contents[0]),false);assert.equal(pv.columnOf(s.contents[0]),'draft');assert.equal(c.revision,1);
});

test('brief channels come first in the channel suggestions',()=>{
 const list=pv.channelsFromBrief({channels:'Instagram, newsletter mensile; Podcast'});
 assert.deepEqual(list.slice(0,3),['Instagram','Newsletter','Podcast']);assert.ok(list.includes('LinkedIn'));
 assert.equal(new Set(list).size,list.length);
});

test('the copywriter prompt carries the strategy and the content, not empty fields',()=>{
 const p=pv.copyPrompt({goal:'Più lead',audience:'PMI',voice:'Diretto',messages:'',topics:'Casi studio'},{title:'Caso Acme',channel:'LinkedIn',date:'2026-11-02',time:'09:30',copy:''});
 assert.match(p,/Canale: LinkedIn/);assert.match(p,/Data prevista: 2026-11-02 alle 09:30/);assert.match(p,/Pubblico: PMI/);assert.match(p,/Messaggi chiave: —/);
 assert.doesNotMatch(p,/Bozza o spunto/);assert.match(p,/Non inventare numeri/);assert.match(p,/solo con il testo da pubblicare/);
 assert.match(pv.copyPrompt({}, {title:'T',channel:'X',copy:'vecchio testo'}),/Bozza o spunto di partenza:\nvecchio testo/);
});

test('copy is cleaned of notes, media kind follows the channel, slides prompt asks for the SLIDES block',()=>{
 assert.equal(pv.cleanCopy('```\n# Post\n**Obiettivo:** x\n\n---\n\nTesto del post vero e proprio.\n\n---\n\n**Hashtag:** #PMI\n```'),'Testo del post vero e proprio.\n\n#PMI');
 assert.equal(pv.cleanCopy('Solo testo'),'Solo testo');
 assert.equal(pv.mediaKind({channel:'YouTube'}),'video');assert.equal(pv.mediaKind({channel:'Instagram',title:'Reel'}),'video');
 assert.equal(pv.mediaKind({channel:'Instagram'}),'carousel');assert.equal(pv.mediaKind({channel:'LinkedIn'}),'image');assert.equal(pv.mediaKind({channel:'Newsletter email'}),'email');assert.equal(pv.mediaKind({channel:'Email'}),'email');assert.equal(pv.mediaKind({channel:'Newsletter'}),'email');assert.equal(pv.mediaKind({channel:'Newsletter LinkedIn'}),'image');
 assert.match(pv.copyPrompt({},{channel:'YouTube',title:'T'}),/script parlato/);
 const sp=pv.slidesPrompt({channel:'Instagram',title:'T',copy:'Testo'},{brand:'verde'});assert.match(sp,/da 5 a 8 slide/);assert.match(sp,/---SLIDES---/);assert.match(sp,/verde/);
 assert.match(pv.slidesPrompt({channel:'LinkedIn',copy:'x'},{}),/una sola immagine/);
});

test('plan analytics: weeks, channels and what needs attention, in the plan time zone',()=>{
 const s={timezone:'Europe/Rome',contents:[
  {id:'a',title:'A',channel:'LinkedIn',date:'2026-10-14',status:'approved',revision:2},
  {id:'b',title:'B',channel:'LinkedIn',date:'2026-10-20',status:'draft',revision:1},
  {id:'c',title:'C',channel:'Instagram',date:'2026-10-22',status:'approved',revision:3,publication:{revision:3}},
  {id:'d',title:'D',channel:'Instagram',date:'',status:'review',revision:1},
  {id:'e',title:'E',channel:'Blog',date:'2026-11-10',status:'approved',revision:1}]};
 const a=pv.analytics(s,{today:'2026-10-16',pubs:[{content_id:'e',revision:1,status:'failed'},{content_id:'c',revision:3,status:'queued'}]});
 assert.deepEqual(a.byStatus,{draft:1,review:1,approved:2,queued:1});
 assert.equal(a.weeks[0].start,'2026-10-12');assert.deepEqual(a.weeks.slice(0,2).map(w=>[w.count,w.ready]),[[1,1],[2,1]]);
 assert.deepEqual(a.attention.map(x=>x.id+':'+x.kind),['e:failed','a:late','b:soon','d:undated']);
 assert.equal(a.kpis.approvedShare,60);assert.equal(a.kpis.next14,2);assert.equal(a.kpis.next14Ready,50);assert.equal(a.kpis.late,1);
 assert.deepEqual(a.channels.map(c=>c.channel),['Instagram','LinkedIn','Blog']);assert.deepEqual(a.publications,{queued:1,failed:1,sending:0});
 // late night in Rome is already the next day there
 assert.equal(pv.analytics({timezone:'Europe/Rome',contents:[]},{now:Date.parse('2026-10-16T22:30:00Z')}).today,'2026-10-17');
 assert.equal(pv.analytics({contents:[]},{today:'2026-10-16'}).kpis.approvedShare,null);
});

test('schedulePlan pairs approved contents with the one Buffer channel of their network',()=>{
 const channels=[{id:'li',name:'Francesco LinkedIn',service:'linkedin'},{id:'ig1',name:'IG uno',service:'instagram'},{id:'ig2',name:'IG due',service:'instagram'},{id:'tw',name:'X',service:'twitter'}];
 const at=d=>({mode:'scheduled',scheduledAt:d+'T08:00:00.000Z',reason:''});
 const contents=[
  {id:'a',title:'Post B',status:'approved',revision:1,channel:'LinkedIn',date:'2026-10-22'},
  {id:'b',title:'Post A',status:'approved',revision:1,channel:'LinkedIn',date:'2026-10-21'},
  {id:'c',title:'Reel',status:'approved',revision:1,channel:'Instagram',date:'2026-10-23'},
  {id:'d',title:'Tweet',status:'approved',revision:2,channel:'X',date:'2026-10-24'},
  {id:'e',title:'Bozza',status:'draft',revision:1,channel:'LinkedIn',date:'2026-10-25'},
  {id:'f',title:'Già in coda',status:'approved',revision:1,channel:'LinkedIn',date:'2026-10-26',publication:{revision:1}},
  {id:'g',title:'Passato',status:'approved',revision:1,channel:'LinkedIn',date:'2026-10-01'},
  {id:'h',title:'In invio',status:'approved',revision:1,channel:'LinkedIn',date:'2026-10-27'}];
 const schedule=i=>i.id==='g'?{mode:'queue',scheduledAt:'x',reason:'past'}:at(i.date);
 const p=pv.schedulePlan(contents,channels,{schedule,sent:i=>i.id==='h'});
 assert.deepEqual(p.ready.map(x=>x.item.id+':'+x.channel.id),['b:li','a:li','d:tw']);
 assert.deepEqual(p.skipped.map(x=>x.item.id+':'+x.reason),['c:nessun canale Buffer unico per Instagram','g:orario già passato','h:invio già in corso o da verificare']);
 assert.equal(pv.schedulePlan(contents,channels,{schedule,preferred:'ig2'}).ready.find(x=>x.item.id==='c').channel.id,'ig2');
});
test('copyPrompt carries the reviewer note for a rewrite',()=>{
 assert.match(pv.copyPrompt({},{title:'T',channel:'LinkedIn',copy:'vecchio'},'più breve'),/seguendo questa indicazione di chi lo approva: più breve/);
 assert.doesNotMatch(pv.copyPrompt({},{title:'T',channel:'LinkedIn',copy:'vecchio'}),/indicazione di chi lo approva/);
});
test('visual identity: moodboard colours get a role, AI proposals are checked, the text reads back as a style guide',()=>{
 const pv=require('../lib/ped-views.js'),media=require('../lib/radix-agent-media.js');
 const g=pv.assignRoles(['#F5F3EE','#14283F','#147D83','#D8AD58','#344054']);
 assert.deepEqual(g,{cover:'#14283F',page:'#F5F3EE',key:'#147D83',accent:'#D8AD58',text:'#344054'});
 assert.throws(()=>pv.assignRoles(['#FFFFFF']),/due colori/);
 const text=pv.identityText({...g,font:'Inter',signature:'FRANCESCO ILARI – GCP'},'Dalla moodboard «mood #ABCDEF.png»');
 assert.doesNotMatch(text.split('\n')[0],/#[0-9a-f]{6}/i,'the source line carries no colour');
 assert.deepEqual(media.styleGuide({visual:text}),{...g,font:'Inter',signature:'FRANCESCO ILARI – GCP'});
 const p=pv.parseIdentity('Ecco {"cover":"#1b2a41","page":"#FAF7F2","key":"#0E7C66","accent":"#E0A458","text":"#2E3440","font":"lora","signature":"STUDIO","reason":"Sobria."}');
 assert.equal(p.cover,'#1B2A41');assert.equal(p.font,'Lora');assert.equal(p.reason,'Sobria.');
 assert.throws(()=>pv.parseIdentity('{"cover":"blu"}'),/Manca il colore/);assert.throws(()=>pv.parseIdentity('niente'),/riprova/);
 assert.deepEqual(pv.identityProblems(g),[]);assert.equal(pv.identityProblems({...g,page:'#1A2B44'}).length>=1,true);
 assert.match(pv.identityPrompt({brand:'Studio'},'Prova'),/«Prova»[\s\S]*Brand e contesto: Studio[\s\S]*JSON/);
});

test('copyPrompt gives the channel playbook, the personal-brand voice and the style rules',()=>{
 const li=pv.copyPrompt({brand:'Mario Rossi – Personal branding'},{title:'T',channel:'LinkedIn',copy:''});
 assert.match(li,/Regole LinkedIn/);assert.match(li,/Chiudi con una domanda precisa/);assert.match(li,/prima persona singolare/);assert.match(li,/non è X, è Y/);
 const ig=pv.copyPrompt({brand:'Acme srl'},{title:'T',channel:'Instagram',copy:''});
 assert.match(ig,/Regole Instagram/);assert.doesNotMatch(ig,/prima persona singolare/);
 assert.doesNotMatch(pv.copyPrompt({},{title:'T',channel:'YouTube'}),/Regole LinkedIn/);
 assert.match(pv.copyPrompt({},{title:'T',channel:'Pinterest'}),/Adatta lunghezza/);
});
test('postProblems flags what makes a LinkedIn post underperform',()=>{
 const weak="L'imprenditore che non delega paga un costo: non è il tempo che perde, è la crescita che blocca.\n\nUn imprenditore dedica in media metà settimana alla vendita.\n\nIl costo non si misura in ore: si misura in opportunità.\n\nE liberare il proprio tempo!\n\n#PMI";
 const ids=pv.postProblems(weak,'LinkedIn',{personal:true}).map(x=>x.id);
 for(const id of ['short','cta','voice','cliche','stat'])assert.ok(ids.includes(id),id);
 const good='Ho sbagliato a non delegare il commerciale per due anni.\n\n'+Array(6).fill('Ho imparato tre cose, una per volta, lavorando con imprenditori come te, giorno dopo giorno.').join('\n\n')+'\n\nTu quale cliente non riesci a lasciare a un venditore?\n\n#vendite #PMI';
 assert.deepEqual(pv.postProblems(good,'LinkedIn',{personal:true}),[]);
 assert.ok(pv.postProblems('x'.repeat(250)+'\n\nAltro?','LinkedIn').some(p=>p.id==='hook'));
 assert.ok(pv.postProblems('Guarda https://a.it e dimmi?','LinkedIn').some(p=>p.id==='link'));
 assert.deepEqual(pv.postProblems('',''),[]);
 assert.match(pv.problemsNote([{hint:'a'},{hint:'b'}]),/^- a\n- b$/);
});
test('planPrompt and slidesPrompt steer formats and the image claim',()=>{
 assert.match(pv.planPrompt({brief:{},contents:[]},'2026-10-21'),/Alterna i formati/);
 assert.match(pv.slidesPrompt({channel:'LinkedIn',title:'T',copy:'c'},{}),/non il titolo ripetuto/);
});
test('a post can be switched to a carousel and keeps the choice across saves',()=>{
 assert.equal(pv.mediaKind({channel:'LinkedIn',title:'T'}),'image');
 assert.equal(pv.mediaKind({channel:'LinkedIn',title:'T',format:'carousel'}),'carousel');
 assert.equal(pv.mediaKind({channel:'Instagram',title:'T',format:'image'}),'image');
 assert.equal(pv.mediaKind({channel:'YouTube',title:'T',format:'carousel'}),'video');
 assert.equal(pv.mediaKind({channel:'Newsletter email',title:'T',format:'carousel'}),'email');
 assert.match(pv.slidesPrompt({channel:'LinkedIn',title:'T',copy:'c',format:'carousel'},{}),/carosello da 5 a 8 slide/);
 const state={briefApproved:true,strategyRevision:1,contents:[]};
 core.updateContent(state,{id:'a',title:'T',channel:'LinkedIn',copy:'x',format:'carousel'});
 core.updateContent(state,{id:'a',title:'T',channel:'LinkedIn',copy:'y'});
 assert.equal(state.contents.find(x=>x.id==='a').format,'carousel');
 core.updateContent(state,{id:'b',title:'T',channel:'LinkedIn',copy:'x',format:'altro'});
 assert.equal(state.contents.find(x=>x.id==='b').format,undefined);
});
test('social posts lose markdown the network would show literally',()=>{
 assert.equal(pv.plainSocial('**Titolo**\nTesto __forte__\n## Sezione\n#PMI','LinkedIn'),'Titolo\nTesto forte\nSezione\n#PMI');
 assert.equal(pv.plainSocial('**ok**','Newsletter LinkedIn'),'**ok**');
 assert.equal(pv.plainSocial('**ok**','Blog'),'**ok**');
 assert.ok(pv.postProblems('**Uno**\n\nDue?','LinkedIn').some(p=>p.id==='markdown'));
 assert.ok(!pv.postProblems('Uno\n\nDue?\n\n#PMI #vendite','LinkedIn').some(p=>p.id==='markdown'));
 assert.match(pv.copyPrompt({},{title:'T',channel:'LinkedIn'}),/niente markdown/);
});
test('agent document wrappers and notes are removed from the text to publish',()=>{
 assert.equal(pv.cleanCopy('---DOCUMENTO: Script video YouTube – Delega---\nCiao, sono Francesco.\n\nCi vediamo.\n\n---FINE DOCUMENTO---\n\nScript completo per video YouTube, durata 8-10 minuti.'),'Ciao, sono Francesco.\n\nCi vediamo.');
 assert.equal(pv.cleanCopy('Ecco lo script.\n---DOCUMENTO: X---\nSolo questo'),'Solo questo');
 assert.equal(pv.cleanCopy('Testo semplice\n\n#PMI'),'Testo semplice\n\n#PMI');
});
test('avatar scripts get a spoken length from the strategy minutes',()=>{
 assert.match(pv.videoLength({channels:'YouTube: 2 video/mese da 8-10 minuti con avatar AI'},{channel:'YouTube'}),/8-10 minuti, quindi tra 1\.120 e 1\.400 parole/);
 assert.match(pv.videoLength({},{channel:'YouTube'}),/8-10 minuti/);
 assert.match(pv.videoLength({},{channel:'Instagram Reel'}),/meno di un minuto e mezzo, quindi tra 110 e 180 parole/);
 assert.match(pv.copyPrompt({channels:'YouTube 5-6 min'},{title:'T',channel:'YouTube'}),/5-6 minuti, quindi tra 700 e 840 parole/);
});
