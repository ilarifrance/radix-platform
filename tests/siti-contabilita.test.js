'use strict';
// Sito RADIX Contabilità (contabilita/): tutte le pagine pubbliche sulla base comune dei siti (siti/comune/).
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const PAGES=['index','iscrizione','accedi','recupero','reimposta','condizioni','privacy'].map(p=>'contabilita/'+p+'.html');

test('ogni pagina usa la base comune, il colore di Contabilità e il menu mobile',()=>{
 const css=read('siti/comune/sito.css');
 for(const f of PAGES){const html=read(f);
  assert.match(html,/<body class="sx" data-prodotto="contabilita">/,f);
  for(const h of['/siti/comune/fonts/fonts.css','/siti/comune/sito.css','/siti/comune/sito.js'])assert.ok(html.includes(h),f+' '+h);
  assert.ok(!/\bct-[a-z]/.test(html),f+': nessuna classe ct- residua');
  assert.match(html,/<button class="sx-menu"[^>]*aria-controls="nav">/,f);
  assert.match(html,/<meta name="robots" content="noindex">/,f+': non indicizzata finché non è online');
  // every sx- class the page uses exists in the shared stylesheet
  for(const c of new Set(html.match(/\bsx-[a-z0-9-]+/g)))assert.ok(new RegExp('\\.'+c+'(?![a-z0-9-])').test(css),f+': '+c);
  for(const h of['/contabilita/condizioni.html','/contabilita/privacy.html','/siti/legali/cookie.html','/siti/'])assert.ok(html.includes(`href="${h}"`),f+' '+h);
 }
 assert.ok(!fs.existsSync(path.join(root,'contabilita/contabilita.css')),'il vecchio foglio di stile è stato tolto');
 assert.ok(!fs.existsSync(path.join(root,'contabilita/fonts')),'i caratteri vengono dalla base comune');
 assert.ok(read('contabilita/app/index.html').includes('/siti/comune/fonts/fonts.css'));
});

test('i link interni puntano a sezioni che esistono',()=>{
 const ids=new Set([...read('contabilita/index.html').matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
 for(const f of PAGES)for(const m of read(f).matchAll(/href="(?:\/contabilita\/)?#([^"]+)"/g))assert.ok(ids.has(m[1]),f+' #'+m[1]);
});

test('la pagina principale vende con i prezzi decisi e ha il modulo «Parliamone» spento senza token',()=>{
 const html=read('contabilita/index.html'),P=require('../lib/accounting/pricing.js');
 for(const k of P.SIZE_KEYS){const eur=P.priceOf(k)/100+' €';assert.ok(html.includes(`href="/contabilita/iscrizione.html?pacchetto=${k}"`),k);assert.ok(html.includes(`<span data-size-price>${eur}</span>`),k+' '+eur);}
 assert.match(html,/<form class="sx-form" data-site-form data-token="" data-fallback="info@radixinnovationstudio\.com"/);
 assert.match(html,/name="website" tabindex="-1"/);assert.match(html,/name="privacy" required/);
 assert.ok(html.includes('href="#parliamone"'));
 assert.ok(!/jarvis|j\.a\.r\.v\.i\.s/i.test(html));
 // the hub of the product sites sends to this page
 assert.match(read('siti/index.html'),/<a class="sx-btn small" href="\/contabilita\/">Scopri Contabilità<\/a>/);
});

test('i messaggi delle pagine account usano gli avvisi della base comune',()=>{
 const js=read('contabilita/account.js');
 assert.ok(js.includes("m.className='sx-alert'+(kind==='info'?' info':'')"));
 assert.ok(!/ct-alert/.test(js));
});
