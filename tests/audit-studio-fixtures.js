'use strict';
// Fake data for the «Audit di comunicazione» tests and screenshots: Forno Aurora on 22 October 2026. It reuses the
// fixtures of the monthly report (PED with social numbers, Search Console imports, Kit identità) and adds a saved site
// audit, a Google listing, imported reviews and a site saved by the Studio Sito. Every number is invented for the tests.
const F=require('./report-studio-fixtures.js');
const TODAY=F.TODAY;
const URL0='https://www.fornoaurora.it/';
function siteAudit(over={}){return {schemaVersion:1,audits:[{id:'audit-20261015090000',at:'2026-10-15T09:00:00.000Z',by:'Giulia',url:URL0,host:'www.fornoaurora.it',goal:'locale',services:['pane a lievito madre'],city:'Torino',
 overall:64,areas:{tecnico:72,contenuti:58,dati:40,locale:70,geo:66},counts:{alta:2,media:4,bassa:3},pages:14,broken:2,cwv:{lcpMs:3100,inpMs:180,cls:.05},
 issues:[
  {id:'C-title-dup',area:'contenuti',severity:'alta',title:'Title duplicati',evidence:'5 pagine con lo stesso title «Forno Aurora»',pages:[URL0,URL0+'torte'],count:5,fix:'Scrivi un title diverso per ogni pagina, con il prodotto e la città.'},
  {id:'T-broken',area:'tecnico',severity:'alta',title:'Link interni interrotti',evidence:'2 link portano a pagine che non esistono (404)',pages:[URL0+'menu'],count:2,fix:'Correggi o togli i link interrotti.'},
  {id:'C-desc',area:'contenuti',severity:'media',title:'Meta description mancanti',evidence:'7 pagine senza meta description',pages:[URL0+'chi-siamo'],count:7,fix:'Scrivi una meta description di 120-155 caratteri per ogni pagina.'},
  {id:'D-local',area:'dati',severity:'media',title:'Manca lo schema LocalBusiness',evidence:'0 pagine con JSON-LD dell’attività',pages:[],count:0,fix:'Aggiungi il JSON-LD Bakery con indirizzo, orari e telefono.'},
  {id:'T-lcp',area:'tecnico',severity:'media',title:'Caricamento lento su mobile',evidence:'LCP 3,1 s (soglia 2,5 s)',pages:[URL0],count:1,fix:'Comprimi le immagini della home e caricale in formato WebP.'},
  {id:'G-about',area:'geo',severity:'media',title:'Manca una pagina Chi siamo',evidence:'0 pagine «chi siamo» su 14 lette',pages:[],count:0,fix:'Racconta storia, persone e laboratorio in una pagina Chi siamo.'},
  {id:'C-alt',area:'contenuti',severity:'bassa',title:'Immagini senza alt',evidence:'12 immagini senza testo alternativo',pages:[URL0],count:3,fix:'Descrivi le immagini nel testo alternativo.'}],plan:null,...over}]}}
const DESCRIPTION='Forno Aurora è il panificio artigianale di San Salvario, a Torino. Dal 1987 impastiamo ogni notte pane a lievito madre con farine di mulini piemontesi, cuociamo focacce e grissini stirati a mano e prepariamo torte su ordinazione per compleanni e feste. Al mattino trovi colazioni con brioche sfornate alle 6 e caffè. Siamo aperti anche la domenica mattina.';
function gbp(){return {schemaVersion:1,
 listings:[{id:'gbp-20261010100000',at:'2026-10-10T10:00:00.000Z',by:'Giulia',tone:'Cordiale',brief:{kind:'panificio artigianale',area:'Torino, San Salvario'},
  version:{name:'Vicinanza',angle:'vicinanza',description:DESCRIPTION,primary:'Panificio',secondary:['Pasticceria','Forno'],services:[{name:'Pane a lievito madre'},{name:'Torte su ordinazione'},{name:'Colazioni'}],
   qa:[{q:'Siete aperti la domenica?',a:'Sì, la mattina.'},{q:'Fate torte senza glutine?',a:'No, il laboratorio usa farine di grano.'}],posts:[{type:'novita',title:'Torte della domenica',text:'x'}],photos:['Vetrina','Bancone','Pane del mattino','Torta di compleanno']},issues:[]}],
 replies:[
  {id:'r1',at:'2026-10-12T10:00:00.000Z',author:'Marta B.',stars:5,sentiment:'positiva',review:'Pane buonissimo e personale gentile.',style:'warm',reply:'Grazie Marta! Forno Aurora'},
  {id:'r2',at:'2026-10-12T10:00:00.000Z',author:'Luca R.',stars:5,sentiment:'positiva',review:'Le focacce migliori del quartiere.',style:'warm',reply:'Grazie Luca! Forno Aurora'},
  {id:'r3',at:'2026-10-12T10:00:00.000Z',author:'Anna P.',stars:4,sentiment:'positiva',review:'Ottime torte, un po’ di attesa il sabato.',style:'concise',reply:'Grazie Anna, il sabato apriamo una cassa in più. Forno Aurora'},
  {id:'r4',at:'2026-10-12T10:00:00.000Z',author:'Paolo S.',stars:2,sentiment:'negativa',review:'Torta ordinata e non pronta all’orario.',style:'solution',reply:'Ci dispiace Paolo, ci scriva a info@fornoaurora.it. Forno Aurora'},
  {id:'r5',at:'2026-10-12T10:00:00.000Z',author:'Sara T.',stars:5,sentiment:'positiva',review:'Brioche perfette.',style:'warm',reply:''},
  {id:'r6',at:'2026-10-12T10:00:00.000Z',author:'Gianni V.',stars:4,sentiment:'positiva',review:'Pane sempre fresco.',style:'warm',reply:'Grazie Gianni! Forno Aurora'}]}}
// The site saved by the Studio Sito: its accent (#C0392B) is not in the kit; a Servizi list and a FAQ section.
const SITE_HTML='<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Forno Aurora · Panificio a Torino</title><meta name="description" content="Pane a lievito madre a Torino."><style>:root{--p:#2F5D50;--a:#C0392B;--on-a:#FFFFFF;--bg:#FFFFFF;--fg:#111827}</style></head><body>'
 +'<section id="s1-servizi" class="sec"><div class="wrap"><h2>Servizi</h2><ul><li>Pane a lievito madre: impastato ogni notte</li><li>Torte su ordinazione: per feste e compleanni</li></ul></div></section>'
 +'<section id="s2-faq" class="sec"><div class="wrap"><h2>Domande frequenti</h2><p>Siete aperti la domenica? Sì, la mattina dalle 7 alle 13.</p></div></section></body></html>';
const siteThread=()=>[{role:'user',content:'Fammi il sito'},{role:'assistant',source:'site-studio',content:'Ecco il sito.\n---DOCUMENTO: sito-forno-aurora---\n'+SITE_HTML+'\n---FINE DOCUMENTO---'}];
function agents(){const a=F.agents();return {...a,siteAudit:siteAudit(),gbp:gbp(),conversations:{'web-developer':siteThread()}}}
const PROFILE={...F.PROFILE,kind:'Panificio artigianale',links:'Sito: https://www.fornoaurora.it · Instagram: https://instagram.com/fornoaurora',contacts:'tel. 011 555 1234 · info@fornoaurora.it',notes:'Indirizzo: Via Nizza 10, 10125 Torino (TO)\nOrari: mar-dom 7-19:30\nContatti: tel. 011 555 1234 · info@fornoaurora.it'};
const PROJECT={name:'Forno Aurora',kind:'Panificio artigianale',summary:'Panificio artigianale a Torino, San Salvario',links:'https://www.fornoaurora.it'};
const input=(over={})=>({today:TODAY,projectName:'Forno Aurora',profile:PROFILE,project:PROJECT,agents:agents(),editorial:F.editorial(),goal:'locale',...over});
module.exports={...F,TODAY,URL0,siteAudit,gbp,SITE_HTML,siteThread,agents,PROFILE,PROJECT,input};
