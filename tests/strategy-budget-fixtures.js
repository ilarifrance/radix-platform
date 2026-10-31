'use strict';
// Fake data for the «Budget e KPI della strategia» tests, screenshots and samples: Forno Aurora, an approved strategy
// (v3) on top of the monthly-report fixtures (PED with social numbers, Search Console, CRM). Every number is invented.
const F=require('./report-studio-fixtures.js');
const BRIEF=Object.freeze({
 goal:'Più contatti dal sito per i rinfreschi aziendali e più ordini di torte per le feste, entro aprile.',
 audience:'Famiglie del quartiere e piccoli uffici della zona che ordinano colazioni e rinfreschi.',
 channels:'Instagram, Facebook, Google Ads, Scheda Google, Newsletter',
 period:'Novembre 2026 – aprile 2027 · 3 contenuti a settimana',
 voice:'Caldo, artigianale, concreto. Niente superlativi.',
 brand:'Forno Aurora, forno di quartiere dal 1987 a lievito madre, con laboratorio a vista.',
 offer:'Pane a lievito madre, torte su ordinazione, rinfreschi per uffici consegnati entro le 9.',
 positioning:'Il forno vero del quartiere: impasti lenti, ingredienti del territorio, ordini semplici.',
 messages:'Lievito madre ogni giorno; Torte su ordinazione in 48 ore; Rinfreschi per uffici consegnati entro le 9',
 topics:'Dietro le quinte, Torte della domenica, Clienti del quartiere',
 frequency:'Instagram 3 a settimana, Facebook 2, newsletter 1 al mese',
 kpis:'Contatti dal sito, ordini di torte, iscritti alla newsletter',
 materials:'Foto del laboratorio, listino torte, logo vettoriale',
 gaps:'Mancano le foto dei rinfreschi.'});
const editorial=(over={})=>({...F.editorial(),brief:{...BRIEF},strategyRevision:3,briefApproved:true,strategyApproval:{revision:3,approvedAt:'2026-10-20T10:00:00Z',scope:'browser-local'},...over});
// A saved communication audit (lib/audit-studio.js record shape: only what the budget studio reads).
const audit=()=>({schemaVersion:1,items:[{id:'audit-20261015',at:'2026-10-15T09:00:00.000Z',overall:58,data:{areas:{
 sito:{id:'sito',available:true,score:46},google:{id:'google',available:true,score:71},recensioni:{id:'recensioni',available:true,score:84},
 social:{id:'social',available:true,score:63},seo:{id:'seo',available:false,score:null}}}}]});
const agents=(over={})=>({...F.agents(),audits:audit(),...over});
const input=(over={})=>F.input({editorial:editorial(),agents:agents(),...over});
module.exports={...F,BRIEF,editorial,audit,agents,input};
