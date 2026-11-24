// Fake data only: a made-up bakery («Forno Aurora») with its kit and the materials saved by the other studios, built
// through their own savedRecord/savedEntry functions so the mockup studio reads them exactly as in a real project.
const path=require('path');
const L=f=>require(path.join(__dirname,'..','..','lib',f));
const LOGO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96"><circle cx="48" cy="48" r="30" fill="#2F5D50"/><circle cx="60" cy="38" r="10" fill="#E3B448"/><text x="92" y="60" font-family="Georgia, serif" font-size="34" font-weight="700" fill="#1C1C1E">Forno Aurora</text></svg>';
const PROFILE={identityKit:{brand:'Forno Aurora',direction:'Bottega di quartiere',palette:[{role:'primary',hex:'#2F5D50'},{role:'secondary',hex:'#A0522D'},{role:'accent',hex:'#E3B448'},{role:'dark',hex:'#1C1C1E'},{role:'light',hex:'#FAF6EE'}],fonts:[{heading:'Fraunces',body:'Inter'}],logo:LOGO},
 payoff:'Pane a lievito madre dal 1987',contacts:{phone:'011 555 1234',website:'www.fornoaurora.it'}};
const AT='2026-10-22T09:00:00.000Z';
const COMPANY={ragione:'Forno Aurora S.r.l.',piva:'01234567897',indirizzo:'Via Nizza 12, 10125 Torino',telefono:'011 555 1234',email:'ciao@fornoaurora.it',sito:'www.fornoaurora.it',payoff:'Pane a lievito madre dal 1987'};
// which: the materials to include (default: all).
function agentsDoc(which){const w=new Set(which||['coordinato','rollup','grande','menu','social','sito']),doc={schemaVersion:1,conversations:{}};const push=(agent,list)=>{doc.conversations[agent]=(doc.conversations[agent]||[]).concat(list)};
 if(w.has('coordinato')){const C=L('coordinato-studio.js'),m=C.modelOf({direction:'classico',company:COMPANY,people:[{nome:'Giulia Rinaldi',ruolo:'Titolare'}],pieces:['biglietto','carta','busta','cartellina'],envelope:{formats:['dl'],window:'nessuna'}},PROFILE,{projectName:'Forno Aurora'});
  doc.coordinato={schemaVersion:1,items:[C.savedRecord(m,{at:AT,checks:[]})]}}
 if(w.has('rollup')){const P=L('print-studio.js'),d=P.layout('rollup',{name:'Forno Aurora',payoff:'Pane a lievito madre dal 1987',headline:'Il pane buono, ogni mattina',body:'Lievito madre, farine del Piemonte, forno a legna.',cta:'Aperti dalle 7',phone:'011 555 1234',website:'www.fornoaurora.it',address:'Via Nizza 12, Torino'},P.brandOf(PROFILE),{variant:'classic'});
  push('art-director',P.savedEntry(d,'# Roll-up',{at:AT}))}
 if(w.has('grande')){const G=L('large-format-studio.js'),d=G.layout('banner-300x100',{name:'Forno Aurora',payoff:'Pane a lievito madre dal 1987',headline:'Pane e focacce dal forno a legna',cta:'Aperti tutti i giorni dalle 7',phone:'011 555 1234',website:'www.fornoaurora.it'},G.brandFor(PROFILE),{variant:'bold'});
  push('art-director',G.savedEntry(d,'# Banner',{at:AT}))}
 if(w.has('menu')){const M=L('menu-studio.js'),m=M.modelOf({type:'bar',direction:'classico',title:'Colazioni e merende',items:[
   {section:'Lievitati',name:'Cornetto vuoto',price:1.3,allergens:[1,3,7],declared:true},{section:'Lievitati',name:'Cornetto alla crema',price:1.6,allergens:[1,3,7],declared:true},
   {section:'Lievitati',name:'Focaccia genovese',description:'Olio extravergine e sale grosso',price:2.5,allergens:[1],declared:true},{section:'Caffetteria',name:'Caffè espresso',price:1.2,allergens:[],declared:true},
   {section:'Caffetteria',name:'Cappuccino',price:1.6,allergens:[7],declared:true},{section:'Caffetteria',name:'Spremuta d’arancia',price:3.5,allergens:[],declared:true}]},PROFILE,{projectName:'Forno Aurora'});
  doc.menu={schemaVersion:1,items:[M.savedRecord(m,{at:AT,checks:[]})]}}
 if(w.has('social')){const S=L('social-studio.js'),m=S.modelOf({direction:'chiaro',channels:['instagram','facebook'],pieces:['profilo','copertine','post'],types:['annuncio'],formats:['quadrato','storia'],payoff:'Pane a lievito madre dal 1987',sito:'www.fornoaurora.it',
   texts:{annuncio:{title:'Il pane del sabato è tornato',body:'Pagnotte di semola e farro, solo su prenotazione.',cta:'Prenota in negozio'}}},PROFILE,{projectName:'Forno Aurora'});
  doc.socialKit={schemaVersion:1,items:[S.savedRecord(m,{at:AT,checks:[]})]}}
 if(w.has('sito')){const W=L('site-studio.js'),html=W.buildPage({name:'Forno Aurora',headline:'Pane a lievito madre, ogni mattina dal 1987',sub:'Il forno di quartiere in Via Nizza: pane, focacce e dolci da forno a legna.',cta:'Vieni a trovarci',
   sections:[{title:'Il nostro pane',text:'Lievito madre rinfrescato ogni giorno, farine macinate a pietra, lunghe lievitazioni.'},{title:'Focacce e dolci',text:'- Focaccia genovese\n- Torta di nocciole\n- Biscotti di meliga'},{title:'Contatti',text:'Passa in negozio o chiamaci.'}]},
   {style:'caldo',name:'Forno Aurora',place:'Via Nizza 12, 10125 Torino',contacts:'011 555 1234 · ciao@fornoaurora.it',colours:{primary:'#2F5D50',accent:'#E3B448'}});
  push('web-developer',W.savedEntry({name:'Forno Aurora'},html,{at:AT}))}
 return doc}
module.exports={LOGO,PROFILE,COMPANY,agentsDoc};
