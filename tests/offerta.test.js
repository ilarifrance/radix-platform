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

test('company colours: from the header (issuer.brand_*), validated as hex, handed to the offer, with the switch',()=>{
 const V=require('../sales/vendite-core.js');
 assert.equal(V.brandOf(null),null);assert.equal(V.brandOf({issuer:{brand_primary:'blu'}}),null);
 assert.deepEqual(V.brandOf({issuer:{brand_primary:'#1F2A44'}}),{primary:'#1f2a44',accent:'#1f2a44'});
 assert.deepEqual(V.brandOf({issuer:{brand_primary:'#1f2a44',brand_accent:'#C9A227'}}),{primary:'#1f2a44',accent:'#c9a227'});
 const ok=V.settingsPayload(null,{issuer_name:'Doc',issuer_brand_primary:'#1F2A44',issuer_brand_accent:'',quote_validity_days:30,payment_days:30});
 assert.deepEqual(ok.data.issuer,{name:'Doc',brand_primary:'#1f2a44'});
 assert.match(V.settingsPayload(null,{issuer_brand_primary:'rosso',quote_validity_days:30,payment_days:30}).error,/#rrggbb/);
 const m=O.plan(doc,{business:'servizi'});assert.ok(O.html(m,'deciso',V.brandOf({issuer:{brand_primary:'#1f2a44',brand_accent:'#c9a227'}})).includes('--of-primary:#1f2a44;--of-accent:#c9a227'));
 const v=fs.readFileSync(__dirname+'/../sales/vendite.js','utf8');assert.match(v,/brand:V\.brandOf\(S\.settings\)/);assert.ok(v.includes('Colori dell’offerta grafica'));
 const w=fs.readFileSync(__dirname+'/../sales/offerta.js','utf8');assert.match(w,/Colori della tua azienda/);assert.ok(!/C\.html\([^)]*st\.ctx\.brand/.test(w),'the pages always go through brand(), which honours the switch');assert.equal((w.match(/C\.html\(st\.model,[^,]+,brand\(\)\)/g)||[]).length,2);
 const api=fs.readFileSync(__dirname+'/../api/_sales_documents.js','utf8');assert.ok(api.includes("'brand_primary','brand_accent'"));assert.match(api,/#rrggbb/);
});

test('AI rewrite: the prompt carries the texts and the facts; the parse keeps known keys and refuses invented amounts',()=>{
 const m=O.plan(doc,{business:'prodotto',goal:'gara',tone:'tecnico'});const pr=O.aiPrompt(m,{business:'prodotto',goal:'gara',tone:'tecnico'});
 assert.match(pr,/Prodotti e macchinari/);assert.match(pr,/Confronto con altri fornitori/);assert.match(pr,/\[intro\] Apertura/);assert.match(pr,/\[section:0\]/);assert.match(pr,/€ 77\.287,00/);assert.match(pr,/senza inventare/);
 assert.equal(O.aiParse('nessun json',m),null);assert.equal(O.aiParse('{bad',m),null);
 const got=O.aiParse('Ecco:\n{"title":"Linea di imballaggio: più colli, meno fermi","intro":"Spett.le Luca Bianchi,\\nla linea da € 65.000,00 copre i volumi attuali.","section:0":"Con lo sconto del 40% risparmiate € 9.999,00.","signature":"'+m.signature.replace(/\n/g,'\\n')+'","nope":"x","subtitle":123}',m);
 assert.deepEqual(Object.keys(got.texts),['title','intro']);assert.equal(got.texts.title,'Linea di imballaggio: più colli, meno fermi');
 assert.deepEqual(got.dropped,['La soluzione che proponiamo']);
 const long=O.aiParse('{"title":"'+'x'.repeat(400)+'"}',m);assert.equal(long.texts.title.length,O.FIELD_MAX);
 const w=fs.readFileSync(__dirname+'/../sales/offerta.js','utf8');assert.match(w,/window\.confirm\(T\('Chiedere all’AI/);assert.ok(w.indexOf('window.confirm')<w.indexOf("fetch('/api/chat'"),'the confirmation comes before the only AI call');
 assert.equal((w.match(/fetch\(/g)||[]).length,1);assert.match(w,/role:'crm-copilot'/);assert.match(w,/C\.apply\(st\.model,k,t\)/,'applied only on click');
});

test('English: the same quote as a British English proposal, en-GB figures and dates, everything else untouched',()=>{
 const m=O.plan(doc,{business:'prodotto',goal:'gara',tone:'tecnico'},{lang:'en'});
 assert.equal(m.lang,'en');assert.equal(m.subtitle,'For Officine Rossi Srl');assert.match(m.intro,/^Dear Luca Bianchi,\nthank you for involving us/);
 assert.deepEqual(m.sections.map(s=>s.title),['The solution we propose','Supply details','Why us','Delivery and installation','The investment','Next steps','Terms']);
 assert.equal(m.totals.total,'£77,287.00','pounds, as the CRM shows in English mode');assert.equal(m.lines[0].unit_price,'£65,000.00');assert.equal(m.date,'28 October 2026');assert.equal(m.validUntil,'30 November 2026');assert.deepEqual(m.totals.vat,[{label:'VAT 22%',amount:'£13,937.00'}]);
 assert.match(m.sections.find(s=>s.id==='investimento').note,/Proposal valid until 30 November 2026/);assert.equal(m.signature,'Kind regards,\nRADIX Macchine');
 const f=O.fields(m);assert.deepEqual(f.slice(0,3).map(x=>x.label),['Title','Subtitle','Opening']);assert.match(f.find(x=>x.key==='section:2').label,/Why us \(one line per item\)/);
 const h=O.html(m,'elegante');assert.ok(h.includes('<th>Supply</th>'));assert.ok(h.includes('Net total'));assert.ok(h.includes(' · for the attention of Luca Bianchi'));assert.ok(!/Imponibile|Totale|Q\.tà/.test(h));
 assert.ok(O.check(m).some(t=>/still has the sample text/.test(t)));
 assert.match(O.aiPrompt(m,{business:'prodotto',goal:'gara'}),/^Rewrite the texts .* British English/);assert.match(O.aiPrompt(m,{business:'prodotto',goal:'gara'}),/Comparison with other suppliers/);
 const g=O.aiParse('{"title":"Pay only £9,999.00","subtitle":"Total £77,287.00, guaranteed"}',m);assert.deepEqual(Object.keys(g.texts),['subtitle']);assert.deepEqual(g.dropped,['Title']);
 const q=O.questions(doc,'','en');assert.equal(q[0].label,'Who sells: what kind of business are you?');assert.equal(q[0].options[1].label,'Products and machinery');assert.equal(q[1].options[2].label,'Comparison with other suppliers');
 assert.deepEqual(O.looks('en').map(l=>l.label),['Elegant','Bold','Warm']);assert.deepEqual(O.looks('it').map(l=>l.label),['Elegante','Deciso','Caldo']);
 // Italian stays exactly as before
 const it=O.plan(doc,{business:'prodotto',goal:'gara',tone:'tecnico'});assert.equal(it.lang,'it');assert.equal(it.totals.total,'€ 77.287,00');assert.equal(it.date,'28 ottobre 2026');
 const w=fs.readFileSync(__dirname+'/../sales/offerta.js','utf8');assert.match(w,/C\.plan\(st\.doc,answers,planOpts\(\)\)/);assert.match(w,/C\.questions\(st\.doc,mem\.get\(st\.ctx\.workspace\),lang\(\)\)/);assert.match(w,/C\.looks\(lang\(\)\)/);
});

test('resume: the last version of a quote’s proposal is kept in this browser and reopened at step 3, never the amounts',()=>{
 const w=fs.readFileSync(__dirname+'/../sales/offerta.js','utf8');
 assert.match(w,/const DKEY=\(w,id\)=>'radix\.offerta\.doc\.'\+w\+'\.'\+id/);assert.match(w,/texts\[f\.key\]=f\.value/);assert.ok(!/totals|lines/.test(w.split('const saved=')[1].split('function resume')[0]),'nothing but texts, answers, look and switch is stored');
 assert.match(w,/st\.model=C\.plan\(st\.doc,v\.answers,planOpts\(\)\)/,'the model is rebuilt from the quote, then the texts applied');assert.match(w,/if\(keys\.has\(k\)/);assert.match(w,/st\.step=3\}/);
 assert.match(w,/Ricomincia da capo/);assert.match(w,/saved\.clear\(\)/);assert.ok((w.match(/saved\.set\(\)/g)||[]).length>=7,'saved on every change');
});

test('wiring: the quotes page loads the core, the widget and the styles; the quote actions offer it',()=>{
 const html=fs.readFileSync(__dirname+'/../sales-vendite.html','utf8');
 assert.ok(html.includes('/sales/offerta.css'));assert.ok(html.indexOf('/sales/offerta-core.js')<html.indexOf('/sales/offerta.js'));assert.ok(html.indexOf('/sales/offerta.js')<html.indexOf('/sales/vendite.js'));
 const v=fs.readFileSync(__dirname+'/../sales/vendite.js','utf8');assert.match(v,/kind==='quote'&&window\.RadixOfferta/);
 const css=fs.readFileSync(__dirname+'/../sales/offerta.css','utf8');assert.match(css,/@page cover\{size:A4;margin:0\}/);assert.match(css,/@page body\{size:A4;margin:18mm 20mm\}/);assert.match(css,/\.vd-print\.is-offer\{display:block!important\}/);
 const w=fs.readFileSync(__dirname+'/../sales/offerta.js','utf8');assert.ok(!/XMLHttpRequest/.test(w));assert.ok(!/fetch\(/.test(w.split('Riscrivi con l’AI')[0]),'no network outside the AI rewrite');
});

test('English with euro chosen: the same proposal keeps € (en-GB figures); Italian ignores the currency option',()=>{
 const m=O.plan(doc,{business:'prodotto',goal:'gara',tone:'tecnico'},{lang:'en',currency:'EUR'});
 assert.equal(m.currency,'EUR');assert.equal(m.totals.total,'€77,287.00');assert.equal(m.lines[0].unit_price,'€65,000.00');assert.deepEqual(m.totals.vat,[{label:'VAT 22%',amount:'€13,937.00'}]);
 assert.match(O.html(m,'elegante'),/€77,287\.00/);assert.doesNotMatch(O.html(m,'elegante'),/£/);
 assert.equal(O.plan(doc,{business:'prodotto'},{lang:'en'}).currency,'GBP','pounds unless told otherwise');
 assert.equal(O.plan(doc,{business:'prodotto'},{lang:'en',currency:'usd'}).currency,'GBP','unknown → pounds');
 const it=O.plan(doc,{business:'prodotto'},{lang:'it',currency:'GBP'});assert.equal(it.currency,'EUR');assert.equal(it.totals.total,'€ 77.287,00');
 const g=O.aiParse('{"title":"Pay only €9,999.00","subtitle":"Total €77,287.00, guaranteed"}',m);assert.deepEqual(Object.keys(g.texts),['subtitle']);
});
