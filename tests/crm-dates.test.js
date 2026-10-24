'use strict';
// Date e ore in ora italiana per l'editor «Modifica / Crea» (sales/crm-dates-core.js): conversione pura Europe/Rome ↔ UTC ISO.
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../sales/crm-dates-core.js');

test('UTC → ora italiana: inverno +1, estate +2, millisecondi e testo Postgres con fuso esplicito',()=>{
 assert.equal(D.toInput('2026-01-15T09:00:00Z'),'2026-01-15T10:00');
 assert.equal(D.toInput('2026-07-15T09:00:00Z'),'2026-07-15T11:00');
 assert.equal(D.toInput('2026-10-10T14:30:00.000Z'),'2026-10-10T16:30');
 assert.equal(D.toInput('2026-10-10 14:30:00+00'),'2026-10-10T16:30');
 assert.equal(D.toInput('2026-12-31T23:30:00Z'),'2027-01-01T00:30','capodanno a Roma');
 assert.equal(D.toInput('2026-10-10T14:30:15Z'),'2026-10-10T16:30:15','i secondi restano visibili');
});

test('valori vuoti o non validi: nessuna data inventata',()=>{
 for(const v of [null,undefined,'','  ','x','2026-10-10T14:30','2026-02-30T10:00:00Z','0000-01-01T00:00:00Z'])assert.equal(D.toInput(v),'',String(v));
 assert.deepEqual(D.fromInput(''),{value:null});assert.deepEqual(D.fromInput('   '),{value:null});assert.deepEqual(D.fromInput(null),{value:null});
 for(const v of ['2026-02-30T10:00','2026-10-10','2026-10-10T24:00','2026-10-10T14:30Z','14:30'])assert.ok(D.fromInput(v).error,v);
 assert.equal(D.label(''),'');assert.equal(D.label(null),'');assert.equal(D.dateLabel(''),'');assert.equal(D.dayLabel(undefined),'');
});

test('ora italiana → UTC ISO con secondi e Z, il formato che l’API accetta',()=>{
 assert.deepEqual(D.fromInput('2026-01-15T10:00'),{value:'2026-01-15T09:00:00Z'});
 assert.deepEqual(D.fromInput('2026-07-15T11:00'),{value:'2026-07-15T09:00:00Z'});
 assert.deepEqual(D.fromInput('2026-10-10T16:30:15'),{value:'2026-10-10T14:30:15Z'});
 assert.match(D.fromInput('2026-10-10T16:30').value,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test('marzo (29/3/2026): 02:00–02:59 non esiste, si sposta avanti come gli orologi',()=>{
 assert.deepEqual(D.fromInput('2026-03-29T01:59'),{value:'2026-03-29T00:59:00Z'});
 assert.deepEqual(D.fromInput('2026-03-29T02:00'),{value:'2026-03-29T01:00:00Z'},'= 03:00 ora legale');
 assert.deepEqual(D.fromInput('2026-03-29T02:30'),{value:'2026-03-29T01:30:00Z'},'= 03:30 ora legale');
 assert.deepEqual(D.fromInput('2026-03-29T03:00'),{value:'2026-03-29T01:00:00Z'});
 assert.equal(D.toInput('2026-03-29T00:59:00Z'),'2026-03-29T01:59');assert.equal(D.toInput('2026-03-29T01:00:00Z'),'2026-03-29T03:00');
});

test('ottobre (25/10/2026): 02:00–02:59 capita due volte, vale la prima (ora legale)',()=>{
 assert.deepEqual(D.fromInput('2026-10-25T01:59'),{value:'2026-10-24T23:59:00Z'});
 assert.deepEqual(D.fromInput('2026-10-25T02:30'),{value:'2026-10-25T00:30:00Z'});
 assert.deepEqual(D.fromInput('2026-10-25T03:00'),{value:'2026-10-25T02:00:00Z'});
 assert.equal(D.toInput('2026-10-25T00:30:00Z'),'2026-10-25T02:30');assert.equal(D.toInput('2026-10-25T01:30:00Z'),'2026-10-25T02:30');
});

test('andata e ritorno senza deriva: ogni quarto d’ora del 2026, attorno ai due cambi d’ora',()=>{
 for(const start of ['2026-03-28T12:00:00Z','2026-10-24T12:00:00Z','2026-06-01T00:00:00Z','2026-01-01T00:00:00Z']){
  for(let ms=Date.parse(start),end=ms+48*3600e3;ms<end;ms+=15*60e3){
   const iso=new Date(ms).toISOString().slice(0,19)+'Z';
   assert.deepEqual(D.keep(iso,D.toInput(iso)),{value:iso},'keep '+iso);
   // Fuori dall’ora doppia di ottobre anche la sola conversione torna identica.
   if(!(ms>=Date.parse('2026-10-25T01:00:00Z')&&ms<Date.parse('2026-10-25T02:00:00Z')))assert.deepEqual(D.fromInput(D.toInput(iso)),{value:iso},'fromInput '+iso);
  }
 }
});

test('keep: valore non toccato = valore salvato identico; toccato = convertito; svuotato = null',()=>{
 assert.deepEqual(D.keep('2026-10-25T01:30:00Z','2026-10-25T02:30'),{value:'2026-10-25T01:30:00Z'},'la seconda 02:30 resta la seconda');
 assert.deepEqual(D.keep('2026-10-10T14:30:00.123Z','2026-10-10T16:30'),{value:'2026-10-10T14:30:00.123Z'},'millisecondi intatti');
 assert.deepEqual(D.keep('2026-10-10 14:30:00+00','2026-10-10T16:30'),{value:'2026-10-10T14:30:00Z'},'testo Postgres → formato API');
 assert.deepEqual(D.keep('2026-10-10T14:30:00Z','2026-10-10T17:00'),{value:'2026-10-10T15:00:00Z'});
 assert.deepEqual(D.keep('2026-10-10T14:30:00Z',''),{value:null});
 assert.deepEqual(D.keep(null,'2026-10-10T16:30'),{value:'2026-10-10T14:30:00Z'});
 assert.deepEqual(D.keep(undefined,''),{value:null});
});

test('etichette in italiano per le schede: ora di Roma, giorno di Roma, data di calendario senza fuso',()=>{
 assert.equal(D.label('2026-10-10T14:30:00Z'),'10/10/2026, 16:30');
 assert.equal(D.label('2026-01-15T09:05:00Z'),'15/01/2026, 10:05');
 assert.equal(D.dayLabel('2026-10-24T22:30:00Z'),'25/10/2026','dopo mezzanotte a Roma è già il giorno dopo');
 assert.equal(D.dateLabel('2026-11-30'),'30/11/2026');
});

test('inputAt / fromInputMs: istante ↔ valore al minuto in ora italiana, per gli slot e i moduli della scheda',()=>{
 assert.equal(D.inputAt(Date.parse('2026-10-23T07:30:45.500Z')),'2026-10-23T09:30','secondi tolti');
 assert.equal(D.inputAt(Date.parse('2026-10-26T08:00:00Z')),'2026-10-26T09:00','dopo il cambio d’ora: +1');
 assert.equal(D.inputAt(NaN),'');assert.equal(D.inputAt(undefined),'');
 assert.equal(D.fromInputMs('2026-10-23T09:30'),Date.parse('2026-10-23T07:30:00Z'));
 assert.equal(D.fromInputMs(''),null);assert.equal(D.fromInputMs('domani'),null);
});
