'use strict';
// Fake data for the Studio «Campagne Google Ads Search» (lib/search-ads-studio.js): the Forno Aurora answers and the reply
// of a FAKE Paid Media Specialist, with a few invalid items on purpose (a headline over 30 characters, a keyword with
// «!», a duplicate keyword, a sitelink to another site, a description over 90, a fourth structure). No real AI anywhere.
const ANSWERS=Object.freeze({goal:'chiamate',services:'Pane a lievito madre\nTorte su ordinazione\nCatering per eventi',cities:'Torino, Moncalieri',radiusKm:'10',center:'Via Garibaldi 12, Torino',
 budget:'20',landing:'www.fornoaurora.it/ordina',brand:'Forno Aurora'});
const PROFILE=Object.freeze({identityKit:{brand:'Forno Aurora',palette:[{role:'primary',hex:'#7A3E1D'},{role:'secondary',hex:'#C98B4E'},{role:'accent',hex:'#E2B649'},{role:'dark',hex:'#2B1B12'},{role:'light',hex:'#FBF6EE'}],fonts:[{heading:'Inter',body:'Inter'}]},
 brief:{facts:'Pane a lievito madre cotto ogni mattina. Torte su ordinazione con 48 ore di preavviso. Catering per eventi fino a 80 persone.'}});
const PROJECT=Object.freeze({id:'forno-aurora',name:'Forno Aurora',kind:'Panificio artigianale',summary:'Panificio artigianale a Torino',links:'Sito: https://www.fornoaurora.it',positioning:'Pane vero, fatto come una volta'});
const H=(...t)=>t;
const s1={tipo:'servizio',nome:'Una campagna per servizio',logica:'Ogni servizio ha il suo budget e i suoi risultati: si vede subito cosa porta chiamate.',
 campagne:[
  {nome:'Pane a lievito madre',gruppi:[{nome:'Pane a lievito madre',parole_chiave:[{testo:'pane a lievito madre torino',corrispondenza:'frase'},{testo:'[panificio torino]',corrispondenza:'esatta'},{testo:'forno pane fresco torino',corrispondenza:'frase'},
    {testo:'pane artigianale torino',corrispondenza:'generica'},{testo:'pane!!! subito',corrispondenza:'frase'},{testo:'panificio torino',corrispondenza:'esatta'}],
   annuncio:{titoli:H('Pane a lievito madre a Torino','Forno Aurora a Torino','Pane cotto ogni mattina','Panificio artigianale Torino','Ordina il tuo pane fresco','Pane vero, come una volta','Chiamaci per ordinare',
     'Un titolo davvero troppo lungo per Google Ads','Pane fresco a Moncalieri','Il forno sotto casa','Lievito madre vivo','Pane caldo! Passa a trovarci','IL MIGLIORE PANE','Pane per ristoranti','Forno di quartiere'),
    descrizioni:H('Pane a lievito madre cotto ogni mattina nel nostro forno di Torino. Chiamaci e ordina.','Farine scelte e lunga lievitazione: il pane come una volta, fresco tutti i giorni.',
     'Ordina per telefono e passa a ritirare: il tuo pane ti aspetta caldo in bottega.','Forno Aurora: pane vero a Torino e Moncalieri.','Questa descrizione è volutamente molto più lunga di novanta caratteri per vedere che il parser la scarta.'),
    percorso1:'pane',percorso2:'lievito madre'}}],negative:[{testo:'ricetta',corrispondenza:'generica'}]},
  {nome:'Torte su ordinazione',gruppi:[{nome:'Torte su ordinazione',parole_chiave:[{testo:'torte su ordinazione torino',corrispondenza:'frase'},{testo:'torta compleanno torino',corrispondenza:'frase'},{testo:'[torte personalizzate torino]',corrispondenza:'esatta'}],
   annuncio:{titoli:H('Torte su ordinazione Torino','Torte per compleanni','Ordina la tua torta','Torte con 48 ore di preavviso','Pasticceria Forno Aurora','Torte personalizzate','Il dolce per la tua festa','Chiamaci per la torta'),
    descrizioni:H('Torte su ordinazione per compleanni e feste: ordina con 48 ore di preavviso.','Scegli gusto e misura al telefono: la torta è pronta il giorno che vuoi.','La miglior torta di Torino, consegna gratis in giornata.'),percorso1:'torte',percorso2:'ordina'}}]},
  {nome:'Catering per eventi',gruppi:[{nome:'Catering',parole_chiave:[{testo:'catering eventi torino',corrispondenza:'frase'},{testo:'buffet aziendale torino',corrispondenza:'frase'},{testo:'catering compleanno torino',corrispondenza:'generica'}],
   annuncio:{titoli:H('Catering per eventi a Torino','Buffet fino a 80 persone','Catering per aziende','Rinfreschi e buffet','Chiedi un preventivo','Catering per compleanni','Pane e salato per eventi','Forno Aurora catering','Chiamaci per il catering'),
    descrizioni:H('Catering per eventi fino a 80 persone: pane, focacce e salato del nostro forno.','Buffet aziendali e feste a Torino e Moncalieri: chiamaci e prepariamo il menu insieme.'),percorso1:'catering',percorso2:'eventi'}}]},
  {nome:'Marchio',gruppi:[{nome:'Forno Aurora',parole_chiave:[{testo:'[forno aurora]',corrispondenza:'esatta'},{testo:'forno aurora torino',corrispondenza:'frase'}],
   annuncio:{titoli:H('Forno Aurora','Forno Aurora a Torino','Il sito di Forno Aurora','Chiama Forno Aurora','Pane e torte a Torino','Ordina da Forno Aurora','Forno Aurora Moncalieri','Orari e contatti'),
    descrizioni:H('Forno Aurora: pane a lievito madre, torte su ordinazione e catering a Torino.','Chiamaci per ordinare o passa in bottega: ti aspettiamo.'),percorso1:'contatti',percorso2:''}}]}],
 negative_account:[{testo:'lavoro',corrispondenza:'generica'},{testo:'fai da te',corrispondenza:'frase'},{testo:'corso',corrispondenza:'generica'},{testo:'forno aurora',corrispondenza:'frase'}],
 sitelink:[{testo:'Ordina per telefono',riga1:'Pane e torte pronti al ritiro',riga2:'Chiamaci la mattina presto',pagina:'/ordina'},{testo:'Torte su ordinazione',riga1:'Compleanni e feste',riga2:'Con 48 ore di preavviso',pagina:'/torte'},
  {testo:'Catering per eventi',riga1:'Buffet fino a 80 persone',riga2:'Per aziende e privati',pagina:'https://www.fornoaurora.it/catering'},{testo:'Chi siamo',riga1:'',riga2:'',pagina:'https://altrosito.it/chi-siamo'},{testo:'Dove siamo',riga1:'Via Garibaldi 12, Torino',riga2:'',pagina:'/dove-siamo'}],
 callout:['Lievito madre','Cotto ogni mattina','Torte su ordinazione','Consegna gratuita','Un callout molto più lungo di venticinque'],
 snippet:{intestazione:'Servizi',valori:['Pane','Torte','Catering','Focacce']}};
const s2={tipo:'intento',nome:'Per intenzione di ricerca',logica:'Chi cerca adesso, chi confronta e chi cerca già Forno Aurora ricevono messaggi diversi.',
 campagne:[
  {nome:'Cerca adesso',gruppi:[{nome:'Panificio vicino',parole_chiave:[{testo:'panificio vicino a me',corrispondenza:'frase'},{testo:'forno aperto torino',corrispondenza:'frase'}],
   annuncio:{titoli:H('Panificio a Torino','Forno aperto la mattina','Pane fresco vicino a te','Chiamaci e ordina','Pane a lievito madre'),descrizioni:H('Pane a lievito madre cotto ogni mattina. Chiamaci e passa a ritirare.','Il forno di quartiere a Torino e Moncalieri.')}}]},
  {nome:'Confronta',gruppi:[{nome:'Torte e catering',parole_chiave:[{testo:'torte su ordinazione torino',corrispondenza:'frase'},{testo:'catering eventi torino',corrispondenza:'frase'}],
   annuncio:{titoli:H('Torte su ordinazione','Catering per eventi','Chiedi un preventivo'),descrizioni:H('Torte con 48 ore di preavviso e catering fino a 80 persone.','Chiamaci: prepariamo tutto insieme.')}}]}],
 negative_account:[{testo:'lavoro',corrispondenza:'generica'}],sitelink:[{testo:'Ordina',riga1:'',riga2:'',pagina:'/ordina'},{testo:'Torte',riga1:'',riga2:'',pagina:'/torte'}],callout:['Lievito madre','Ordini al telefono'],snippet:{intestazione:'Tipi',valori:['Pane','Torte','Catering']}};
const s3={tipo:'zona',nome:'Una campagna per città',logica:'Torino e Moncalieri hanno budget separati e annunci che nominano la città.',
 campagne:[
  {nome:'Torino',gruppi:[{nome:'Pane Torino',parole_chiave:[{testo:'panificio torino',corrispondenza:'frase'},{testo:'pane fresco torino',corrispondenza:'frase'}],
   annuncio:{titoli:H('Panificio a Torino','Pane fresco a Torino','Forno Aurora Torino','Chiamaci per ordinare'),descrizioni:H('Pane a lievito madre cotto ogni mattina a Torino.','Ordina per telefono e passa a ritirare.')}}]},
  {nome:'Moncalieri',gruppi:[{nome:'Pane Moncalieri',parole_chiave:[{testo:'panificio moncalieri',corrispondenza:'frase'},{testo:'pane fresco moncalieri',corrispondenza:'frase'}],
   annuncio:{titoli:H('Panificio a Moncalieri','Pane fresco a Moncalieri','Forno Aurora Moncalieri'),descrizioni:H('Pane a lievito madre anche per Moncalieri.','Ordina per telefono.')}}]}],
 negative_account:[],sitelink:[],callout:[],snippet:{intestazione:'Ricette',valori:['Pane']}};
const s4={tipo:'servizio',nome:'Una quarta struttura che non serve',campagne:[{nome:'X',gruppi:[{nome:'Y',parole_chiave:['pane torino'],annuncio:{titoli:['Pane'],descrizioni:['Pane']}}]}]};
const REPLY='Ecco le tre strutture.\n```json\n'+JSON.stringify({strutture:[s1,'non è una struttura',s2,s3,s4]},null,1)+'\n```';
module.exports={ANSWERS,PROFILE,PROJECT,REPLY,s1,s2,s3};
