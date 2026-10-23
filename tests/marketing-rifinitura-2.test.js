'use strict';
// Rifinitura 2 of the Marketing area: the «?» of the RADIX guide docks in the top bar (never over the page), the
// informative notes of the studios are grey with the «i» (amber only for real warnings), and Catalogo, Menu and Reel
// pick files with the drop zone of Foto prodotto (.pf-drop), which says the chosen file name and size.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const guide=require('../lib/radix-guide.js'),core=require('../agency/crea-core.js');

test('guide «?»: docks in the shell top bar, small with a safe offset where there is none',()=>{
 const bar={id:'bar'},page={id:'page'};
 const doc=found=>({querySelector:q=>found[q]||null});
 assert.equal(guide.dockBar(doc({'header.rx-topbar':bar,'header.rx-pagetop':page})),bar);
 assert.equal(guide.dockBar(doc({'header.rx-pagetop':page})),page);
 assert.equal(guide.dockBar(doc({})),null);
 const c=read('shell/radix-guide.css');
 assert.match(c,/button\.rx-guide-fab\{position:fixed;right:max\(16px,env\(safe-area-inset-right\)\);bottom:max\(16px,env\(safe-area-inset-bottom\)\);[^}]*width:40px;height:40px/);
 assert.match(c,/\.rx-topbar button\.rx-guide-fab--top,\.rx-pagetop button\.rx-guide-fab--top\{position:static;[^}]*height:36px;[^}]*aspect-ratio:1\/1/);
 assert.match(c,/\.rx-guide--top\{top:calc\(var\(--rx-topbar,60px\) \+ 8px\);bottom:auto/);
 const js=read('lib/radix-guide.js');
 assert.match(js,/const bar=dockBar\(doc\);if\(bar\)\{[^}]*querySelector\('\.rx-user,\.user-pill,\.rx-logout'\)/);
 assert.match(js,/fab\.classList\.add\('rx-guide-fab--top'\);panel\.classList\.add\('rx-guide--top'\)/);
});

test('studio notes: the copy-studio note is grey with the info icon; checks and missing data stay amber',()=>{
 const c=read('shell/crea.css');
 assert.match(c,/\.cr-panel \.copy-studio \.cs-note\{display:flex;[^}]*color:var\(--ma-tx2\)/);
 assert.match(c,/\.cr-panel \.copy-studio \.cs-note::before\{[^}]*background:var\(--ma-mut\);[^}]*mask:/);
 assert.doesNotMatch(c,/\.cs-note[^{]*\{[^}]*var\(--amber\)/);
 assert.match(c,/\.cr-panel \.copy-studio \.cs-issues,\.cr-panel \.video-studio \.vs-missing\{[^}]*color:var\(--amber\)/);
 assert.match(c,/\.cr-panel \.doc-studio \.ds-type-text em\{[^}]*color:var\(--ma-tx2\)/);
});

test('drop zones: Catalogo, Menu and Reel use .pf-drop with the accepted types; the shared style is not Foto-prodotto only',()=>{
 for(const [f,n] of [['lib/catalog-studio.js',2],['lib/menu-studio.js',1],['lib/reel-studio.js',2]]){
  const s=read(f);assert.equal((s.match(/'pf-drop[ ']/g)||[]).length,n,f);assert.match(s,/'pf-drop-text'/,f);
  assert.doesNotMatch(s,/'ad-upload|'ct-pick'|'ct-more'|label',undefined,'mn-source mn-file'/,f)}
 assert.match(read('lib/catalog-studio.js'),/Excel \.xlsx o CSV, foto JPG, PNG o WebP · trascinali qui o fai clic/);
 assert.match(read('lib/menu-studio.js'),/CSV o Excel \.xlsx · trascinalo qui o fai clic/);
 const c=read('shell/crea.css');
 for(const r of ['.cr-panel .pf-drop{','.cr-panel .pf-drop::before{','.cr-panel .pf-drop:hover{','.cr-panel .pf-drop:focus-within{','.cr-panel .pf-drop input{'])assert.ok(c.includes(r),r);
 assert.ok(!c.includes('.cr-panel .pf-studio .pf-drop'));
 assert.match(c,/\.cr-panel \.pf-drop\[data-over=true\]\{/);
 const js=read('agency/crea.js');
 assert.match(js,/body\.addEventListener\('change',e=>\{[\s\S]{0,400}core\.fileSummary\(t\.files\)[\s\S]{0,200}?,true\);/);
 assert.match(js,/\['dragenter',true\],\['dragover',true\],\['dragleave',false\],\['drop',false\]/);
});

test('drop zones: the file line says name and size, or how many files',()=>{
 assert.equal(core.fileSummary([]),'');assert.equal(core.fileSummary(null),'');
 assert.equal(core.fileSummary([{name:'listino.csv',size:54}]),'listino.csv · 54 B');
 assert.equal(core.fileSummary([{name:'a.jpg',size:4096},{name:'b.jpg',size:8192}]),'2 file · 12 KB');
 assert.equal(core.fileSummary([{name:'clip.mp4',size:2.5*1048576}]),'clip.mp4 · 2,5 MB');
});
