'use strict';
// «Cosa vuoi fare oggi?» in the Marketing look «A»: the pure parts behind the command box (?q=, ?project=), the cost
// badges, the kits and the area numbers, and the page wiring (no AI call on load, look «A» over the studio styles).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const core=require('../agency/crea-core.js'),orbit=require('../agency/orbit-core.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('?q= and ?project=: the text to prefill, a valid project and the service to preselect, with the home matching',()=>{
 assert.deepEqual(core.fromAsk('?q=rispondi%20alle%20recensioni&project=forno-aurora'),{q:'rispondi alle recensioni',project:'forno-aurora',match:'google'});
 assert.equal(core.fromAsk('?q=un volantino per l’open day').match,'stampa');
 assert.equal(core.fromAsk('?q=traduci il sito in inglese').match,'traduzione');
 assert.equal(core.fromAsk('?q=logo e colori').match,'identita');
 assert.deepEqual(core.fromAsk('?q=zzz%20qwerty'),{q:'zzz qwerty',project:'',match:''},'no match, nothing preselected');
 assert.deepEqual(core.fromAsk('?q=%20%20post%20%20&project=bad%20id!'),{q:'post',project:'',match:'social'},'spaces folded, invalid project dropped');
 for(const s of ['','?area=web',null,undefined])assert.deepEqual(core.fromAsk(s),{q:'',project:'',match:''},String(s));
 assert.equal(core.fromAsk('?q='+'a'.repeat(300)).q.length,200,'text capped like the home box');
 // one matching for the home and the panel: same text, same services in the same order
 for(const q of ['post per il pane di Natale','volantino','newsletter di novembre','reel tiktok','sito'])
  assert.deepEqual(orbit.matchServices(q).map(m=>m.card.id),core.matchServices(q).map(m=>m.card.id),q);
 assert.deepEqual(core.matchServices('zzz'),[]);assert.equal(core.best('boh'),'');assert.equal(core.best('scheda google'),'google');
});

test('cost badges are read from the card cost line: free, one AI call, batches or paid media; never a number not written there',()=>{
 const b=id=>core.costBadge(core.card(id));
 assert.deepEqual(b('stampa'),{tone:'free',label:'Gratis, senza AI'});
 assert.deepEqual(b('analisi'),{tone:'free',label:'Gratis · AI facoltativa'});
 assert.deepEqual(b('naming'),{tone:'ai',label:'1 chiamata AI'});
 assert.deepEqual(b('schede'),{tone:'ai',label:'AI a lotti'});assert.deepEqual(b('traduzione'),{tone:'ai',label:'AI a lotti'});
 assert.deepEqual(b('google'),{tone:'ai',label:'2 chiamate AI'});
 assert.deepEqual(b('images'),{tone:'media',label:'3 foto Higgsfield'});
 assert.deepEqual(b('avatar'),{tone:'media',label:'Crediti HeyGen'});assert.deepEqual(b('video'),{tone:'media',label:'AI + HeyGen'});
 for(const c of core.CARDS){const x=core.costBadge(c);assert.ok(['free','ai','media'].includes(x.tone),c.id);
  for(const n of x.label.match(/\d+/g)||[])assert.ok(c.cost.includes(n)||(n==='1'&&/^Una chiamata/.test(c.cost))||(n==='2'&&/e una per/.test(c.cost)),c.id+' '+x.label)}
 assert.deepEqual(core.costBadge({}),{tone:'ai',label:'AI con conferma'});
});

test('kits and area numbers come from the cards',()=>{
 assert.deepEqual(core.kits().map(k=>k.id),['identita','evento','creativita','documenti']);
 for(const k of core.kits()){assert.equal(k.card,core.card(k.id));assert.ok(k.label&&k.files)}
 assert.deepEqual(core.groups().map(core.areaNumber),['01','02','03','04','05','06','07','08']);assert.equal(core.areaNumber(''),'');
});

test('the page: look «A» over the studio styles, the combobox, kits before tabs before cards, no AI call on load',()=>{
 const html=read('agency/crea.html'),js=read('agency/crea.js'),at=s=>html.indexOf(s);
 assert.ok(at('/shell/crea.css')<at('/shell/marketing-a.css')&&at('/shell/marketing-a.css')<at('/agency/crea.css'));
 assert.match(html,/<main class="cr-main cp-main ma">/);
 assert.match(html,/id="crAsk"[^>]*role="combobox"[^>]*aria-controls="crSuggest"/);assert.match(html,/<ul class="ma-suggest" id="crSuggest" role="listbox"/);
 assert.ok(at('id="crKits"')<at('id="crFilters"')&&at('id="crFilters"')<at('id="crCards"'));
 assert.ok(at('/agency/crea-core.js')<at('/agency/orbit-core.js')&&at('/agency/marketing-look.js')<at('/agency/orbit-core.js')&&at('/agency/orbit-core.js')<at('/agency/crea.js'));
 assert.match(js,/ask=core\.fromAsk\(location\.search\)/);assert.match(js,/input\.value=ask\.q;render\(\);suggestions\(true\);/);
 assert.match(js,/const want=ask\.project\|\|remembered\(\);/);
 assert.ok(!/\.reply\(|fetch\(/.test(js),'no AI call from the page itself: the studios ask RadixConfirm before spending');
 assert.match(js,/li\.append\(top,h,node\('p','cp-line',c\.line\),cost\)/,'cost line on every card, before the click');
 const css=read('agency/crea.css');
 assert.match(css,/\.cp-card\[data-match=true\]/);assert.match(css,/\.cp-kit:has\(\.cp-kit-go:focus-visible\)\{outline:2px solid var\(--ma-focus\)/);
});
