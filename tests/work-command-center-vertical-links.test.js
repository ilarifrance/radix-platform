const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const cockpit=fs.readFileSync('control-center-v2.html','utf8');
const workspace=fs.readFileSync('index.html','utf8');
test('Work Command Center exposes legal, accounting, sales and development as navigable areas',()=>{
 for(const href of ['/legal/index.html','/accounting/index.html','/index.html?area=commerciale','/index.html?area=dev'])assert.ok(cockpit.includes('href="'+href+'"'),href);
 assert.match(cockpit,/<nav class="nav" aria-label="Apri le aree RADIX">/);
});
test('existing agent deep links select only known roles without AI calls',()=>{
 assert.match(workspace,/function applyAreaNavigation\(/);
 assert.match(workspace,/AGENTS\.find\(function\(agent\)\{return agent\.id === defaultAgent && agent\.group === area\}/);
 assert.match(workspace,/if \(match\) selectAgent\(match\.id\)/);
 assert.ok(workspace.split('applyAreaNavigation();').length>=3);
});
test('legal and accounting are self-contained UI files that reuse shared original backend',()=>{
 for(const area of ['legal','accounting'])assert.ok(fs.readFileSync(area+'/index.html','utf8').includes('../verticals/studio.js'));
 assert.doesNotThrow(()=>new vm.Script(fs.readFileSync('verticals/studio.js','utf8')));
});
