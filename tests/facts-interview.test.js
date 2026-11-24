'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../agency/facts-interview.js');
test('compose writes labelled facts and cases, leaving out empty answers',()=>{
 const t=F.compose({who:' Consulente  B2B ',numbers:'+1 M€ annuo (2015-2020)',avoid:'non citare ChatGPT',other:'Vive a Milano',
  cases:[{client:'PMI metalmeccanica',problem:'rete vendita ferma',action:'riorganizzata in 6 mesi',result:'',quotable:false},{client:'',problem:'',action:'',result:''},{client:'Acme',result:'+20% ordini',quotable:true}]});
 assert.equal(t.facts,'Chi siamo: Consulente B2B\nNumeri verificati: +1 M€ annuo (2015-2020)\nDa non dire mai: non citare ChatGPT\nAltro: Vive a Milano');
 assert.equal(t.cases,'Caso 1 — PMI metalmeccanica (nome non citabile)\n  Problema: rete vendita ferma\n  Cosa abbiamo fatto: riorganizzata in 6 mesi\n  Risultato misurato: [da fornire]\nCaso 2 — Acme (nome citabile)\n  Risultato misurato: +20% ordini');
});
test('parse reads the composed texts back, and keeps free text as «Altro» or a case to edit',()=>{
 const a={who:'Consulente',experience:'15 anni',tools:'RADIX',cases:[{client:'Acme',problem:'p',action:'a',result:'r',quotable:true}]};
 const t=F.compose(a),b=F.parse(t.facts,t.cases);
 assert.equal(b.who,'Consulente');assert.equal(b.experience,'15 anni');assert.equal(b.tools,'RADIX');
 assert.deepEqual(b.cases,[{client:'Acme',quotable:true,problem:'p',action:'a',result:'r'}]);
 assert.deepEqual(F.compose(b),t);
 const old=F.parse('15 anni nel B2B; strumenti: RADIX','Cliente X: vendite raddoppiate');
 assert.equal(old.other,'15 anni nel B2B; strumenti: RADIX');assert.equal(old.cases[0].problem,'Cliente X: vendite raddoppiate');
 assert.equal(F.parse('','').cases.length,0);
});
