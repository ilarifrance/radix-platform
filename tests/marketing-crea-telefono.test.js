'use strict';
// «Cosa vuoi fare» made fast to scan: the filter box (core.filterServices), the short badges of the one-line rows,
// the sticky bar, the areas folded to 3 rows on a phone with «Mostra tutti (N)», «Usati di recente». Every service
// stays in the page: folding is CSS on a phone only, the filter never drops a card the search would find.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const core=require('../agency/crea-core.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ids=q=>core.filterServices(q).map(c=>c.id);

test('the filter box: every listed card when empty, the command box synonyms, word starts, accents and case ignored',()=>{
 assert.deepEqual(ids(''),core.listed().map(c=>c.id));assert.equal(ids('   ').length,56);
 assert.deepEqual(ids('spot'),['reel']);assert.deepEqual(ids('dominio'),['naming']);
 assert.deepEqual(ids('carosello'),['social']);assert.ok(ids('post grafici').includes('social'),'«Post grafici» is inside «Social e post»');
 assert.ok(!ids('post grafici').includes('graphics'),'the merged card is not listed twice');
 assert.deepEqual(ids('volan'),['stampa'],'a word still being typed: «volan» → volantino');
 assert.ok(ids('LOGO').includes('identita')&&ids('logo').includes('logovettoriale')&&ids('logo').includes('logoanimato'));
 assert.ok(!ids('logo').includes('catalogo'),'«logo» is not «catalogo»');
 assert.deepEqual(ids('identita'),ids('identità'));
 assert.deepEqual(ids('zzzz qwerty'),[]);
 // order is the panel order, and every card the box would pick surely is also in the filter
 for(const q of ['volantino','traduci il sito in inglese','rispondi alle recensioni','newsletter','reel tiktok','logo e colori','sito']){
  const got=ids(q),best=core.best(q);if(best)assert.ok(got.includes(best),q+' → '+best);
  assert.deepEqual(got,core.listed().map(c=>c.id).filter(id=>got.includes(id)),q+': panel order')}
 // each card is found by its own title
 for(const c of core.listed())assert.ok(ids(c.title).includes(c.id),c.title);
});

test('the short badge of a phone row says the same as the full one, in fewer letters, with no number not in the cost line',()=>{
 const seen=new Set();
 for(const c of core.listed()){const s=core.costShort(c),b=core.costBadge(c);seen.add(s);assert.ok(s.length<=12,c.id+' '+s);
  if(b.tone==='free')assert.match(s,/^Gratis/,c.id);else assert.doesNotMatch(s,/Gratis/,c.id);
  for(const n of s.match(/\d+/g)||[])assert.ok(b.label.includes(n),c.id+' '+s)}
 assert.equal(core.costShort(core.card('fotoprodotto')),'Gratis + AI');assert.equal(core.costShort(core.card('stampa')),'Gratis');
 assert.equal(core.costShort(core.card('naming')),'1 AI');assert.equal(core.costShort(core.card('google')),'2 AI');assert.equal(core.costShort(core.card('images')),'3 foto');
 assert.equal(core.costShort(core.card('avatar')),'HeyGen');assert.equal(core.costShort(core.card('schede')),'AI a lotti');
});

test('the page: filter box and chips in one sticky bar above the cards, every card rendered, folding only on a phone',()=>{
 const html=read('agency/crea.html'),js=read('agency/crea.js'),css=read('agency/crea.css'),at=s=>html.indexOf(s);
 assert.ok(at('id="crToolbar"')<at('id="crFind"')&&at('id="crFind"')<at('id="crFilters"')&&at('id="crFilters"')<at('id="crCards"'));
 assert.match(html,/<input class="cp-find-input" id="crFind" type="search"[^>]*aria-controls="crCards"/);assert.match(html,/<label class="ma-sr" for="crFind">/);
 assert.match(html,/id="crCount" role="status"/,'the count is announced, not the whole list');assert.doesNotMatch(html,/id="crCards"[^>]*aria-live/);
 assert.match(css,/\.cp-toolbar\{position:sticky;top:var\(--cp-stick,0px\)/);
 assert.match(js,/document\.documentElement\.style\.setProperty\('--cp-stick',h\+'px'\)/,'the page bar height is measured');
 // every card of an area is in the list; a phone hides rows 4+ with CSS until «Mostra tutti (N)»
 assert.match(js,/ul\.append\(\.\.\.cards\.map\(cardEl\)\)/);assert.match(js,/const PEEK=3/);
 assert.match(js,/'Mostra tutti \('\+cards\.length\+'\)'/);assert.match(js,/more\.setAttribute\('aria-expanded',String\(open\)\)/);assert.match(js,/more\.setAttribute\('aria-controls',ul\.id\)/);
 const phone=css.slice(css.indexOf('@media (max-width:640px)'));
 assert.match(phone,/\.cp-area\[data-collapsed=true\] \.cp-grid>\.cp-card:nth-child\(n\+4\)\{display:none\}/);
 assert.ok(css.indexOf('.cp-area[data-collapsed=true]')>css.indexOf('@media (max-width:640px)'),'folding only inside the phone media query');
 assert.match(css,/\.cp-short,\.cp-badge-short,\.cp-more\{display:none\}/,'no «Mostra tutti» on a computer: every row shows');
 assert.match(js,/collapsible:!group&&!q/,'no folding while filtering or in one area');
 // the row keeps the action words as the accessible name of its link
 assert.match(css,/\.cp-index\[data-view=index\] \.cp-go>span:first-child\{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect\(0 0 0 0\)/);
 assert.match(js,/find\.addEventListener\('keydown',e=>\{if\(e\.key==='Escape'&&find\.value\)/,'Esc clears the filter');
 assert.match(js,/if\(b\)b\.focus\(\{preventScroll:true\}\)/,'focus stays on the chip or the button that was pressed');
});

test('«Usati di recente»: this browser only, wrapped in try/catch, at most 4, merged cards stored as their card',()=>{
 const js=read('agency/crea.js');
 assert.match(js,/RECENT_KEY='radix-crea-recent'/);
 assert.match(js,/function recent\(\)\{try\{const v=JSON\.parse\(localStorage\.getItem\(RECENT_KEY\)/);
 assert.match(js,/function used\(c\)\{if\(!c\)return;const id=c\.merged\|\|c\.id;try\{localStorage\.setItem\(RECENT_KEY/);
 assert.match(js,/openCard=c\.id;used\(c\);render\(\);/);assert.match(js,/go\.addEventListener\('click',\(\)=>used\(c\)\)/);
 assert.match(js,/const last=!group&&!q\?recent\(\):\[\];/);
});
