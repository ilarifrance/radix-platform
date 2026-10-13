'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const cc=fs.readFileSync('control-center-v2.html','utf8');
test('Command Center is landing route and does not send users to V3.7',()=>{
 assert.deepEqual(JSON.parse(fs.readFileSync('vercel.json','utf8')).rewrites,[{source:'/',destination:'/control-center-v2.html'}]);
 assert.doesNotMatch(cc,/href=["']\/?(?:\.\/)?index\.html/);assert.ok(fs.existsSync('index.html'));
});
test('all operational areas point to existing canonical pages',()=>{
 for(const route of ['/agency/index.html','/sales-orbit-higgsfield.html','/lead-intelligence.html','/sales-pipeline-premium.html','/legal/index.html','/accounting/index.html','/agency/memory.html','/radix-ecosystem.html']){
  assert.ok(cc.includes('href="'+route+'"'),route);assert.ok(fs.existsSync('.'+route),route);
 }
 for(const route of ['legal/index.html','accounting/index.html']){const s=fs.readFileSync(route,'utf8');assert.ok(s.includes('../control-center-v2.html'));assert.ok(s.includes('../sales-orbit-higgsfield.html'));assert.ok(!s.includes('../index.html?area='))}
});
test('project handoff carries selected identity to editorial workspace',()=>{
 assert.match(cc,/project-editorial\.html\?project='\+encodeURIComponent\(p\.id\)/);
 assert.doesNotThrow(()=>new vm.Script(cc.match(/<script>([\s\S]*?)<\/script>/)[1]));
});
test('sidebar has a focusable scroll region and expandable sections',()=>{
 assert.match(cc,/id="sidebarScroll" tabindex="0"/);assert.equal((cc.match(/<details class="side-section sidebar-fold"/g)||[]).length,2);
 const css=fs.readFileSync('command-center-master.css','utf8');assert.match(css,/\.sidebar-scroll\{[^}]*min-height:0;overflow-y:auto/);assert.match(css,/\.sidebar \.side-foot\{[^}]*flex:0 0 auto/);
});

test('Agency and ecosystem return directly to Command Center',()=>{
 const agency=fs.readFileSync('agency/index.html','utf8');
 const ecosystem=fs.readFileSync('radix-ecosystem.html','utf8');
 assert.ok(agency.includes('href="../control-center-v2.html" title="Torna al Command Center"'));
 assert.ok(ecosystem.includes('class="mark" href="/control-center-v2.html"'));
});
