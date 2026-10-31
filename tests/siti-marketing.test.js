'use strict';
// Sito Marketing (siti/marketing/): struttura, immagini, modulo e vincoli di copy.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..');const html=fs.readFileSync(path.join(root,'siti/marketing/index.html'),'utf8');

test('usa la base comune e il colore del prodotto',()=>{
 assert.match(html,/<body class="sx" data-prodotto="marketing">/);
 for(const h of['/siti/comune/fonts/fonts.css','/siti/comune/sito.css','/siti/comune/sito.js'])assert.ok(html.includes(h),h);
 assert.ok(!/ct-[a-z]/.test(html),'nessuna classe ct- residua');
});

test('ogni immagine esiste, ha misure e testo alternativo',()=>{
 const imgs=[...html.matchAll(/<img ([^>]+)>/g)].map(m=>m[1]);
 assert.ok(imgs.length>=4);
 for(const a of imgs){
  const src=/src="([^"]+)"/.exec(a)[1];
  assert.ok(fs.existsSync(path.join(root,src.replace(/^\//,''))),src);
  assert.match(a,/width="1280" height="800"/,src);assert.match(a,/alt="[^"]{20,}"/,src);
 }
 assert.strictEqual((html.match(/fetchpriority="high"/g)||[]).length,1,'una sola immagine prioritaria');
});

test('prezzi «da definire» finché Francesco non li conferma, nessun importo',()=>{
 const prezzi=html.slice(html.indexOf('id="prezzi"'),html.indexOf('id="faq"'));
 assert.strictEqual((prezzi.match(/class="tbd" data-price="(identita|social|sito)">da definire</g)||[]).length,3);
 assert.ok(!/\d+\s?€/.test(prezzi),'nessun prezzo numerico');
});

test('modulo spento senza token, con honeypot e consenso privacy',()=>{
 assert.match(html,/<form class="sx-form" data-site-form data-token="" data-fallback="info@radixinnovationstudio\.com"/);
 assert.ok(!/name="t"/.test(html),'nessun campo t: il token è data-token');
 assert.match(html,/name="website" tabindex="-1"/);assert.match(html,/name="privacy" required/);
});

test('collegamenti e copy: legali, hub, niente nomi vietati, niente promesse non mantenute',()=>{
 for(const h of['/siti/legali/privacy.html','/siti/legali/cookie.html','/siti/','/control-center-v2.html'])assert.ok(html.includes(`href="${h}"`),h);
 assert.ok(!/jarvis|j\.a\.r\.v\.i\.s/i.test(html));
 assert.ok(!/WhatsApp/.test(html),'WhatsApp non è ancora nel prodotto');
 assert.strictEqual((html.match(/class="sx-split( reverse)?"/g)||[]).length,3);
 for(const id of['kit','come-funziona','servizi','prezzi','faq','parliamone'])assert.ok(html.includes(`id="${id}"`),id);
});
