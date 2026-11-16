'use strict';
// «Sales Orbis»: the same CRM code served on its own host (CRM only, no Command Center).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const P=require('../sales/crm-product.js');
test('host rule: only CRM hosts are the product',()=>{
  assert.equal(P.isProduct('sales-orbis.example.com'),true);
  assert.equal(P.isProduct('crm.example.com'),true);
  assert.equal(P.isProduct('radix-platform.vercel.app'),false);
  assert.equal(P.isProduct(''),false);
  assert.equal(P.isProduct(undefined),false);
});
test('vercel.json: on the product host / and the RADIX areas go to the CRM; on RADIX hosts / still goes to the Command Center',()=>{
  // Vercel serves an existing static file before rewrites, so on the product host the root must be a redirect too.
  const v=JSON.parse(read('vercel.json')),roots=v.redirects.filter(r=>r.source==='/');
  const prod=roots.find(r=>r.has),rad=roots.find(r=>!r.has);
  assert.equal(prod.destination,'/crm');
  assert.equal(rad.destination,'/control-center-v2.html');
  assert.ok(rad.missing&&rad.missing[0].type==='host','the Command Center redirect must skip the product host');
  assert.ok(roots.indexOf(prod)<roots.indexOf(rad));
  assert.ok(v.redirects.some(r=>r.source==='/control-center-v2.html'&&r.has&&r.destination==='/crm'));
  const re=new RegExp('^(?:'+prod.has[0].value+')$');
  assert.ok(re.test('sales-orbis.example.com')&&re.test('crm.example.com'));
  assert.ok(!re.test('radix-platform.vercel.app'));
  assert.ok(!v.rewrites.some(r=>r.has),'no host rewrite: it would lose to index.html');
});
test('the CRM page loads the product module before the menu',()=>{
  const h=read('radix-sales.html');
  assert.ok(h.indexOf('sales/crm-product.js')>0&&h.indexOf('sales/crm-product.js')<h.indexOf('sales/sales-nav.js'));
});
test('menu and sign-in use the product brand and never link to the Command Center in product mode',()=>{
  const n=read('sales/sales-nav.js'),s=read('sales/crm-solo.js');
  assert.match(n,/product \? 'Sales <b>Orbis<\/b>/);
  assert.match(n,/var ROOT = product \? '\/' : '\/crm'/);
  assert.match(s,/location\.pathname!=='\/crm'&&!product/);
  assert.match(s,/Sales Orbis/);
});
