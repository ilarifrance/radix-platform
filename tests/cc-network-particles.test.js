const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('shell/cc-universe.js','utf8');
const css=fs.readFileSync('shell/cc.css','utf8');
const html=fs.readFileSync('control-center-v2.html','utf8');
test('particle overview parses and draws with Canvas 2D only',()=>{
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.ok(source.includes("getContext('2d')"));
 assert.ok(!/<script|import\(|three|pixi|webgl/i.test(source));
 // the page still loads only its own scripts (after the English language layer)
 assert.deepEqual(Array.from(html.matchAll(/<script src="([^"]+)"/g),m=>m[1]),['/lib/radix-i18n-en.js','/lib/radix-i18n.js','/shell/radix-shell.js','command-center-network-scene.js']);
});
test('animation is capped, pauses when hidden and honours reduced motion',()=>{
 assert.ok(source.includes('requestAnimationFrame(loop)')&&source.includes('cancelAnimationFrame(raf)'));
 assert.ok(source.includes("document.addEventListener('visibilitychange'"));
 assert.ok(source.includes('!document.hidden')&&source.includes('IntersectionObserver'));
 assert.ok(source.includes("matchMedia('(prefers-reduced-motion: reduce)')")&&source.includes('!reduce.matches'));
 assert.ok(source.includes('devicePixelRatio'));
 assert.ok(source.includes('coreCount = small ? 460 : 620'));
 assert.ok(source.includes('150 + 100 * it.level'));
});
test('project nuclei keep the map navigation, accessible names and their sections',()=>{
 // a project (or one of its sections) opens exactly like a click on the page's own hub
 assert.ok(source.includes("p.hub.dispatchEvent(new MouseEvent('click', { bubbles: true }))"));
 assert.ok(source.includes("b.addEventListener('click', open)")&&source.includes("e.addEventListener('click', open)"));
 assert.ok(source.includes("'Apri il progetto ' + p.name"));
 assert.ok(source.includes("tip.setAttribute('aria-label', 'Sezioni di ' + p.name)"));
 assert.ok(css.includes('.cc-proj:hover .cc-tip,.cc-proj:focus-within .cc-tip{visibility:visible'));
 // projects come from the map renderNetwork() drew, never from a hard-coded list
 assert.ok(source.includes("svg.querySelectorAll('.project-hub[data-network-type=project]')"));
 assert.ok(css.includes('.cc-world{position:absolute;inset:0;z-index:3;background:#000}'));
});
