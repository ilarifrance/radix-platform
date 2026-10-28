'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const O=require('../sales/offerta-core.js');
const doc={id:'d1',kind:'quote',number:'2026/7',title:'Linea di imballaggio automatica',issue_date:'2026-10-28',valid_until:'2026-11-30',terms:'Pagamento 30% all’ordine, saldo alla consegna.',
 customer:{company:{name:'Officine Rossi Srl',city:'Brescia',industry:'Automotive e meccanica'},contact:{name:'Luca Bianchi'}},issuer:{name:'RADIX Macchine',email:'vendite@radix.test',phone:'+39 030 123'},
 lines:[{description:'Confezionatrice automatica mod. X',quantity:'1',unit:'pz',unit_price_cents:6500000,discount_bp:500,vat_rate_bp:2200,net_cents:6175000},{description:'Installazione e collaudo',quantity:'2',unit:'gg',unit_price_cents:80000,discount_bp:0,vat_rate_bp:2200,net_cents:160000}],
 subtotal_cents:6335000,discount_cents:325000,vat_summary:[{vat_rate_bp:2200,net_cents:6335000,vat_cents:1393700}],total_cents:7728700};

test('configurator: the business type comes from the saved choice, else the customer sector, else services',()=>{
 assert.equal(O.suggestBusiness(doc,'software'),'software');
 assert.equal(O.suggestBusiness(doc,'nope'),'prodotto');
 assert.equal(O.suggestBusiness({customer:{company:{industry:'Informatica e software'}}},''),'software');
 assert.equal(O.suggestBusiness({},''),'servizi');
 const q=O.questions(doc,'');assert.deepEqual(q.map(x=>x.id),['business','goal','tone']);assert.equal(q[0].value,'prodotto');assert.equal(q[0].options.length,O.BUSINESS.length);
});

test('plan: numbers from the quote only, sections from the business type, texts that can be edited',()=>{
 const m=O.plan(doc,{business:'prodotto',goal:'gara',tone:'tecnico'});
 assert.equal(m.title,'Linea di imballaggio automatica');assert.equal(m.subtitle,'Per Officine Rossi Srl');assert.equal(m.customer,'Officine Rossi Srl');assert.equal(m.seller,'RADIX Macchine');
 assert.match(m.intro,/^Spett\.le Luca Bianchi,\n/);assert.match(m.intro,/confronto/);
 assert.deepEqual(m.sections.map(s=>s.id),['soluzione','lines','perche','consegna','investimento','passi','condizioni']);
 assert.equal(m.lines.length,2);assert.equal(m.lines[0].unit_price,'€ 65.000,00');assert.equal(m.lines[0].discount,'5%');assert.equal(m.lines[0].net,'€ 61.750,00');assert.equal(m.lines[1].quantity,'2');
 assert.equal(m.totals.subtotal,'€ 63.350,00');assert.equal(m.totals.total,'€ 77.287,00');assert.deepEqual(m.totals.vat,[{label:'IVA 22%',amount:'€ 13.937,00'}]);
 assert.equal(m.validUntil,'30 novembre 2026');assert.equal(m.date,'28 ottobre 2026');
 assert.equal(m.sections.find(s=>s.id==='condizioni').text,doc.terms);assert.match(m.sections.find(s=>s.id==='investimento').note,/valida fino al 30 novembre 2026/);
 // Without a line net the net is computed as the database does (quantity × price, discount in basis points).
 const m2=O.plan({...doc,lines:[{description:'A',quantity:'3',unit_price_cents:1000,discount_bp:1000,vat_rate_bp:2200}]},{business:'servizi'});assert.equal(m2.lines[0].net,'€ 27,00');
 assert.equal(O.plan({},{}).title,'Proposta commerciale');assert.equal(O.plan({},{business:'software'}).title,'Proposta di attivazione');
});

test('fields and apply: every text in page order, lists one item per line, limits respected',()=>{
 const m=O.plan(doc,{business:'servizi'});const f=O.fields(m);
 assert.deepEqual(f.slice(0,3).map(x=>x.key),['title','subtitle','intro']);assert.equal(f.at(-1).key,'signature');
 const perche=f.find(x=>x.label.startsWith('Perché noi'));assert.equal(perche.value.split('\n').length,3);
 O.apply(m,perche.key,'Uno\n\nDue\n Tre ');assert.deepEqual(m.sections.find(s=>s.id==='perche').items,['Uno','Due','Tre']);
 O.apply(m,'title','x'.repeat(500));assert.equal(m.title.length,O.FIELD_MAX);
 O.apply(m,'section:99','ignored');O.apply(m,'nope','ignored');assert.equal(m.title.length,O.FIELD_MAX);
});

test('check: what a careful seller fixes before sending',()=>{
 const m=O.plan(doc,{business:'servizi'});const c=O.check(m);
 assert.ok(c.some(t=>/testo di esempio/.test(t)));assert.ok(!c.some(t=>/righe/.test(t)));
 O.apply(m,'section:0','Partiamo da una linea manuale che non regge i volumi.');assert.deepEqual(O.check(m),[]);
 const e=O.check(O.plan({},{}));assert.ok(e.some(t=>/senza importi/.test(t)));assert.ok(e.some(t=>/Intestazione/.test(t)));assert.ok(e.some(t=>/validità/.test(t)));
});

test('html: two pages per look, escaped texts, the look variables inline, nothing invented',()=>{
 const m=O.plan({...doc,title:'Offerta <b>speciale</b> & co'},{business:'prodotto'});
 for(const L of O.LOOKS){const h=O.html(m,L.id);
  assert.equal((h.match(/<section class="of-page/g)||[]).length,2);assert.ok(h.includes('of-'+L.id));assert.ok(h.includes('--of-primary:'+L.primary));
  assert.ok(h.includes('Offerta &lt;b&gt;speciale&lt;/b&gt; &amp; co'));assert.ok(!h.includes('<b>speciale'));
  assert.ok(h.includes('€ 77.287,00'));assert.ok(h.includes('Confezionatrice automatica mod. X'));assert.ok(h.includes('Fornitura</th>'));}
 const b=O.html(m,'elegante',{primary:'#123456',accent:'#abcdef'});assert.ok(b.includes('--of-primary:#123456;--of-accent:#abcdef'));
 assert.ok(O.html(m,'unknown').includes('of-elegante'));
});

test('wiring: the quotes page loads the core, the widget and the styles; the quote actions offer it',()=>{
 const html=fs.readFileSync(__dirname+'/../sales-vendite.html','utf8');
 assert.ok(html.includes('/sales/offerta.css'));assert.ok(html.indexOf('/sales/offerta-core.js')<html.indexOf('/sales/offerta.js'));assert.ok(html.indexOf('/sales/offerta.js')<html.indexOf('/sales/vendite.js'));
 const v=fs.readFileSync(__dirname+'/../sales/vendite.js','utf8');assert.match(v,/kind==='quote'&&window\.RadixOfferta/);
 const css=fs.readFileSync(__dirname+'/../sales/offerta.css','utf8');assert.match(css,/@page cover\{size:A4;margin:0\}/);assert.match(css,/@page body\{size:A4;margin:18mm 20mm\}/);assert.match(css,/\.vd-print\.is-offer\{display:block!important\}/);
 const w=fs.readFileSync(__dirname+'/../sales/offerta.js','utf8');assert.ok(!/fetch\(|XMLHttpRequest|api\/chat/.test(w),'no network, no AI in the widget');
});
