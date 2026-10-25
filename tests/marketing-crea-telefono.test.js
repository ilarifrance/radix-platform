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

test('the top on a phone: title alone, suggestions as one chip row scrolling inside itself, project on one line, one search',()=>{
 const html=read('agency/crea.html'),js=read('agency/crea.js'),css=read('agency/crea.css');
 const at=css.indexOf('@media (max-width:640px)'),phone=css.slice(at),desk=css.slice(0,at);
 // the command bar is hidden on a phone only: the sticky filter is the one search box there
 assert.match(phone,/\.cp-copy \.ma-command-bar\{display:none\}/);assert.doesNotMatch(desk,/ma-command-bar\{display:none\}/);
 assert.match(phone,/\.cp-copy>\.ma-eyebrow,\.cp-lead\{display:none\}/);
 assert.match(phone,/\.cp-main \.ma-title\{margin:0 0 10px;font-size:26px/);
 // the chips: one row, scrolled inside itself (no page scroll sideways), 44 px taps, the head kept for screen readers
 assert.match(phone,/\.cp-copy \.ma-suggest\{display:flex;gap:8px;overflow-x:auto;overscroll-behavior-x:contain;margin:0 -12px;padding:2px 12px/);
 assert.match(phone,/\.cp-copy \.ma-option\{flex:none\}/);assert.match(phone,/\.cp-copy \.ma-option-link\{[^}]*min-height:44px[^}]*white-space:nowrap/);
 assert.match(phone,/\.cp-copy \.ma-command-head\{position:absolute;width:1px;height:1px/);
 assert.match(phone,/\.cp-hero\{display:flex;flex-direction:column;align-items:stretch/,'stretch, or the chip row widens the page');
 assert.match(phone,/\.cp-project\{flex-direction:row;align-items:center/);
 // the chips are plain links in the tab order on a phone, options of the listbox elsewhere
 assert.match(js,/const chips=phone\.matches;list\.setAttribute\('role',chips\?'list':'listbox'\)/);
 assert.match(js,/if\(!chips\)\{a\.setAttribute\('role','option'\);a\.setAttribute\('aria-selected','false'\);a\.tabIndex=-1\}/);
 assert.match(js,/input\.setAttribute\('aria-expanded',String\(!chips&&items\.length>0\)\)/);
 assert.match(js,/phone\.addEventListener\('change',\(\)=>\{hint\(\);suggestions\(true\)\}\)/);
 // ?q= fills the filter on a phone; Invio there opens the best match, as the command box does
 assert.match(js,/if\(phone\.matches&&ask\.q\)find\.value=ask\.q\.slice\(0,80\);/);
 assert.match(js,/e\.key==='Enter'&&query\(\)\)\{e\.preventDefault\(\);const hits=core\.filterServices\(query\(\)\),b=core\.best\(query\(\)\)/);
 assert.match(html,/id="crAsk"[^>]*role="combobox"/,'the command box stays for a computer');
 // what ?q= links from the home ask for is found by the filter too (the same synonyms), with the box's pick inside
 for(const q of ['spot','un volantino per l’open day','rispondi alle recensioni','dominio','post grafici']){const b=core.best(q);assert.ok(b,q);assert.ok(ids(q).includes(b),q+' → '+b)}
});
