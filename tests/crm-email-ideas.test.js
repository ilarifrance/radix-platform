'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ideas=require('../sales/crm-email-ideas.js');

test('prompt: goal and tone from the chips, no invented facts without a detail',()=>{
 const p=ideas.prompt({goal:'Invitare a un evento',tone:'Formale',detail:'Webinar sul controllo di gestione, 12 novembre'});
 assert.match(p,/TRE versioni/);assert.match(p,/webinar/i);assert.match(p,/formale e sobrio/);assert.match(p,/12 novembre/);assert.match(p,/\{nome\}/);
 assert.match(ideas.prompt({}),/Non citare numeri/);assert.match(ideas.prompt({goal:'boh'}),/presentarsi/);
});

test('three versions from JSON or from Oggetto/Corpo blocks; unknown placeholders reported',()=>{
 const j=ideas.parse('Ecco {"emails":[{"angle":"Domanda","subject":"{nome}, una domanda","body":"Ciao {nome}"},{"subject":"","body":"x"},{"subject":"B","body":"b"},{"subject":"C","body":"c"},{"subject":"D","body":"d"}]}');
 assert.equal(j.length,3);assert.deepEqual(j[0],{angle:'Domanda',subject:'{nome}, una domanda',body:'Ciao {nome}'});
 const t=ideas.parse('Versione 1\nOggetto: Primo\nCorpo:\nCiao {nome},\nriga due\n\nVersione 2\n**Oggetto:** Secondo\nCorpo: Testo due');
 assert.deepEqual(t.map(e=>e.subject),['Primo','Secondo']);assert.equal(t[0].body,'Ciao {nome},\nriga due');
 assert.deepEqual(ideas.parse('niente'),[]);
 assert.deepEqual(ideas.unknownPlaceholders('{nome} {Azienda} {citta} {sconto}'),['{citta}','{sconto}']);
});
