const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const data=JSON.parse(fs.readFileSync('verticals/agent-catalog.json','utf8'));
const source=fs.readFileSync('index.html','utf8');
const backend=fs.readFileSync('api/chat.js','utf8');
const js=fs.readFileSync('verticals/studio.js','utf8');
test('Legal and Accounting reuse exactly existing RADIX Platform agent identifiers',()=>{
 assert.equal(data.schemaVersion,1);
 for(const [area,n] of [['legal',5],['accounting',6]]){
  const v=data.verticals[area];assert.equal(v.roles.length,n);
  const ids=v.roles.map(x=>x.id);
  assert.equal(new Set(ids).size,n);
  for(const id of ids){assert.ok(source.includes('id: "'+id+'"'),id+' missing in original UI');assert.ok(backend.includes('"'+id+'": {')||backend.includes(id+': {'),id+' missing in original backend prompt');}
  for(const flow of v.workflows)for(const id of flow.steps)assert.ok(ids.includes(id),'unknown workflow role '+id);
 }
});
test('workbench scripts parse and require authentication and per-call approval',()=>{
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(js,/fetch\('\/api\/auth\/me'/);
 assert.match(js,/if\(!window\.confirm\(/);
 assert.match(js,/fetch\('\/api\/chat'/);
 assert.ok(js.includes('busy||!authenticated||!selected'));
 assert.doesNotMatch(js,/localStorage|sessionStorage/);
});
test('both vertical pages link to shared catalog and JS with no cloned backend',()=>{
 for(const area of ['legal','accounting']){
  const html=fs.readFileSync(area+'/index.html','utf8');
  assert.ok(html.includes('data-area="'+area+'"'));
  assert.ok(html.includes('../verticals/studio.js'));
  assert.ok(html.includes('../verticals/studio.css'));
  assert.ok(html.includes('../control-center-v2.html'));
 }
});
