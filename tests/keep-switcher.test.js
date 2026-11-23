'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const K=require('../sales/keep-switcher.js');
test('Selettori di vista: il gruppo di pulsanti torna alla stessa altezza dello schermo',()=>{
 assert.equal(K.delta(120,120),0);assert.equal(K.delta(120,121),0,'sotto 2px non si muove');
 assert.equal(K.delta(120,-800),-920,'finito sopra: scorri verso l\'alto di quanto serve');
 assert.equal(K.delta(120,900),780,'finito sotto: scorri verso il basso');
 assert.equal(K.delta(NaN,5),0);
});
test('Selettori di vista: riconosce schede, stato premuto e data-mode/tab/view; caricato da ogni pagina Sales',()=>{
 for(const s of ['button[aria-pressed]','[role="tab"]','button[data-mode]','button[data-tab]','button[data-view]'])assert.ok(K.SWITCH.includes(s),s);
 const nav=fs.readFileSync('sales/sales-nav.js','utf8');
 assert.ok(nav.includes('/sales/keep-switcher.js'));
 const src=fs.readFileSync('sales/keep-switcher.js','utf8');
 assert.ok(!/fetch\(|XMLHttpRequest|innerHTML/.test(src),'solo scorrimento, niente rete né HTML');
});
