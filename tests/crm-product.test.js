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
test('host rule: the product\'s own Vercel project counts too, look-alikes do not',()=>{
  assert.equal(P.isProduct('sales-orbis-git-main-x.vercel.app'),true);
  assert.equal(P.isProduct('crmx.example.com'),false);
  assert.equal(P.isProduct('radix-sales-orbis.vercel.app'),false);
  assert.equal(P.isProductEnv({RADIX_PRODUCT:'sales-orbis'}),true);
  assert.equal(P.isProductEnv({RADIX_PRODUCT:''}),false);
  assert.equal(P.isProductEnv(undefined),false);
});
// vercel.json's catch-all as a JS RegExp: path-to-regexp turns «/:path(X)» into ^/(X)$ (the lookahead runs as written).
const sourceRe=src=>{const m=/^\/:path\((.*)\)$/.exec(src);assert.ok(m,'source is /:path(<regex>)');return new RegExp('^/(?:'+m[1]+')$')};
test('vercel.json: on the product host / and every page outside the allow-list go to the CRM; RADIX hosts keep the Command Center',()=>{
  // Vercel serves an existing static file before rewrites, so on the product host these must be redirects.
  const v=JSON.parse(read('vercel.json')),prod=v.redirects.filter(r=>r.has),roots=v.redirects.filter(r=>r.source==='/');
  assert.equal(prod.length,2,'one root redirect + one catch-all');
  for(const r of prod){assert.deepEqual(r.has,[{type:'host',value:P.HOST_VALUE}]);assert.equal(r.destination,'/crm');assert.equal(r.permanent,false)}
  const rad=roots.find(r=>!r.has);
  assert.equal(rad.destination,'/control-center-v2.html');
  assert.deepEqual(rad.missing,[{type:'host',value:P.HOST_VALUE}],'the Command Center redirect must skip the product host');
  assert.ok(v.redirects.indexOf(prod[0])<v.redirects.indexOf(rad));
  const hostRe=new RegExp('^(?:'+P.HOST_VALUE+')$');
  for(const h of ['sales-orbis.example.com','crm.example.com','sales-orbis-abc.vercel.app'])assert.ok(hostRe.test(h),h);
  for(const h of ['radix-platform.vercel.app','crmx.example.com'])assert.ok(!hostRe.test(h),h);
  const all=prod.find(r=>r.source!=='/');assert.equal(all.source,P.redirectSource(),'built from sales/crm-product.js');
  const re=sourceRe(all.source);
  for(const p of ['/control-center-v2.html','/agents.html','/admin.html','/trading.html','/contabilita/','/contabilita/index.html','/sales-orbit.html','/sales-orbit-higgsfield.html','/index.html','/tests/crm-product.test.js','/crmx','/docs/x.md'])assert.ok(re.test(p),'redirected: '+p);
  for(const p of ['/crm','/radix-sales.html','/impostazioni.html','/lead-intelligence.html','/sales-posta.html','/sales/sales.js','/lib/radix-i18n.js','/shell/settings.js','/api/sales','/api/state'])assert.ok(!re.test(p),'served: '+p);
  // Every page the product serves exists, and the menu links of the product stay inside the allow-list.
  for(const p of P.PAGES.filter(p=>p.endsWith('.html')))assert.ok(fs.existsSync(path.join(__dirname,'..',p)),p);
  assert.ok(!v.rewrites.some(r=>r.has),'no host rewrite: it would lose to index.html');
});
test('page allow-list: pageAllowed agrees with the redirect',()=>{
  const re=sourceRe(P.redirectSource());
  for(const p of ['/','/crm','/sales/x.js','/control-center-v2.html','/sales-orbit.html','/impostazioni.html','/contabilita/'])
    assert.equal(P.pageAllowed(p),p==='/'||!re.test(p),p);
});
test('API allow-list and AI roles on the product',()=>{
  for(const n of ['sales','auth','chat','parse-file','ms-oauth','admin'])assert.equal(P.apiAllowed(n),true,n);
  for(const n of ['state','workspace','agency-memory','accounting','trading'])assert.equal(P.apiAllowed(n),false,n);
  assert.equal(P.apiAllowed('integrations','send-email'),true);
  assert.equal(P.apiAllowed('integrations','status'),true);
  for(const s of ['heygen','higgsfield','buffer','openai-image','trading','call','transcribe','site-publish','ped-stats',''])assert.equal(P.apiAllowed('integrations',s),false,s);
  for(const r of ['crm-copilot','comm-email-outreach','comm-crm-manager'])assert.equal(P.chatRoleAllowed(r),true,r);
  for(const r of ['strategist','radix-director','fact-checker','',undefined,'crm-',{}])assert.equal(P.chatRoleAllowed(r),false,String(r));
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
