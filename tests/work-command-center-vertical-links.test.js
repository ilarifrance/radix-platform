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

test('deployment root opens Work Command Center and old workspace offers a return button',()=>{
 const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 assert.ok(config.rewrites.some(x=>x.source==='/'&&x.destination==='/control-center-v2.html'));
 assert.ok(workspace.includes('href="/control-center-v2.html" aria-label="Torna al Command Center RADIX"'));
});

test('Marketing Agency is available in Work cockpit and its local files are present',()=>{
 assert.match(cockpit,/href="\/agency\/index\.html"/);
 for(const file of ['agency/index.html','agency/projects.html','agency/project-workspace.html','agency/ped.html','agency/catalog.json'])assert.ok(fs.existsSync(file),file);
});
test('fixed left sidebar is scrollable and workspace button remains reachable',()=>{
 assert.match(cockpit,/\.sidebar\{display:flex;flex-direction:column;overflow-y:auto;/);
 assert.match(cockpit,/\.sidebar>\.side-foot\{position:sticky;/);
});
