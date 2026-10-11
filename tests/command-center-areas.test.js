const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const cc=fs.readFileSync('control-center-v2.html','utf8');
const workspace=fs.readFileSync('index.html','utf8');
const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
const script=workspace.match(/<script>([\s\S]*?)<\/script>/)[1];
test('Command Center is landing route; original workspace remains a separate page',()=>{
 assert.deepEqual(config.rewrites,[{source:'/',destination:'/control-center-v2.html'}]);
 assert.match(cc,/href="\/index\.html"/);
});
test('five operating areas link to existing workspaces without duplicating agents',()=>{
 for(const href of ['./agency/index.html','./index.html?area=commerciale','./index.html?area=legale','./index.html?area=dev','./index.html?area=admin']){
  assert.ok(cc.includes('href="'+href+'"'),href);
 }
});
test('agent deep links are validated against existing roster and department',()=>{
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.match(script,/allowed = AGENTS\.find\(function \(a\) \{ return a\.id === agent && a\.group === area/);
 assert.match(script,/state\.projects\.some\(function \(p\) \{ return p\.id === project/);
 assert.match(script,/setActiveProject\(project,false\)/);
});
test('Command Center project drawer carries the selected project ID',()=>{
 assert.match(cc,/index\.html\?project='\+encodeURIComponent\(p\.id\)/);
});
