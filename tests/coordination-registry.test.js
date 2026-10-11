const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const registry=JSON.parse(fs.readFileSync('coordination/radix-registry.json','utf8'));
const page=fs.readFileSync('coordination/index.html','utf8');
test('coordination inventory has unique areas and known owners',()=>{
 assert.equal(registry.schemaVersion,1);
 assert.equal(registry.mode,'verified_snapshot_not_live');
 assert.equal(new Set(registry.areas.map(x=>x.id)).size,registry.areas.length);
 for(const area of registry.areas){assert.ok(area.name&&area.owner&&area.branch&&area.status);assert.ok(Array.isArray(area.paths)&&area.paths.length);}
});
test('all four workstreams and five RADIX operating areas are recorded',()=>{
 const owners=registry.areas.map(x=>x.owner).join(' ');
 for(const name of ['ChatGPT Work','ChatGPT Agency','OpenClaw','Qwen'])assert.ok(owners.includes(name),name);
 for(const id of ['agency','sales','legal','development','accounting','command','memory'])assert.ok(registry.areas.some(x=>x.id===id),id);
 assert.equal(Object.values(registry.agents.groups).reduce((a,b)=>a+b,0),registry.agents.total);
});
test('integration safeguards prevent production auto-merge and shared DB migrations',()=>{
 assert.equal(registry.policy.production,'main');
 assert.equal(registry.policy.automaticMerge,false);
 assert.equal(registry.policy.automaticDeployToProduction,false);
 assert.equal(registry.policy.sharedDbMigration,false);
 assert.ok(registry.coordinationIssue.includes('/issues/'));
});
test('Control Room renders a validated snapshot without arbitrary HTML insertion',()=>{
 const script=page.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(script);
 assert.doesNotThrow(()=>new vm.Script(script[1]));
 assert.match(script[1],/textContent/);
 assert.doesNotMatch(script[1],/innerHTML\s*=/);
 assert.match(page,/radix-registry\.json/);
 assert.match(page,/Command Center/);
});
