// The Marketing studios share one look («rifinitura»): no unicode symbols as button icons, the shared primitives in
// shell/crea.css, the page hairline that wins over shell/agency.css, and the paid steps still behind their confirmation.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const STUDIOS=['image','video','site','seo','copy','identity','print','catalog','doc','ad','reel','gbp','product','newsletter'].map(s=>'lib/'+s+'-studio.js').concat('lib/site-audit.js');

test('no unicode symbols as icons in the studio buttons',()=>{
 for(const f of STUDIOS){const src=read(f);const labels=[...src.matchAll(/button\('([^']*)'/g)].map(m=>m[1]);
  for(const l of labels)assert.ok(!/^[✦↺⬇✓🎬★⚠]/u.test(l),f+': «'+l+'»')}
});

test('shell/crea.css: shared primitives for cards, results, loading, fields and switches',()=>{
 const css=read('shell/crea.css'),block=css.slice(css.indexOf('Shared studio primitives'));
 assert.ok(block.length>1000,'primitives block');
 assert.match(block,/html\.rx-shell body\.cr-page\{--line:rgba\(150,165,230,\.14\)\}/,'hairline beats shell/agency.css');
 assert.match(block,/\.cs-grid:empty/,'loading placeholders');assert.match(block,/::file-selector-button/);assert.match(block,/\.ps-switch input:checked/);
 assert.match(block,/prefers-reduced-motion/);
 // old palette no longer written by hand for the older studios
 const old=css.slice(0,css.indexOf('/* Studio Documenti (lib/doc-studio.js)'));
 assert.ok(!/#cfd7ef|var\(--border,#2c3a63\)/.test(old),'old tokens');
 // single on/off options are switches, not chips
 assert.match(read('lib/print-studio.js'),/'ps-switch pr-rich'/);assert.match(read('lib/print-studio.js'),/'ps-switch pr-guides'/);
 assert.match(read('lib/catalog-studio.js'),/'ps-switch pr-guides'/);assert.match(read('lib/doc-studio.js'),/'ps-switch ds-pad'/);
});

test('every paid step of the older studios still sits behind root.confirm',()=>{
 const want={image:1,video:2,site:2,seo:1,copy:1,identity:2};
 for(const [s,n] of Object.entries(want)){const src=read('lib/'+s+'-studio.js');
  assert.equal(src.split('root.confirm(').length-1,n,s+': confirmations');
  assert.ok(src.indexOf('root.confirm(')<src.lastIndexOf('rt.reply(')||!src.includes('rt.reply('),s+': confirm before the AI call')}
});
