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
 for(const [area,n] of [['legal',5],['accounting',6],['commercial',5]]){
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
 // AI calls go through the shared v3.7 engine (continuation, project profile, team memory).
 assert.match(js,/rt\.reply\(\{role/);assert.match(js,/memoryScope:project\?/);
 assert.ok(js.includes('busy||!authenticated||!selected'));
 assert.doesNotMatch(js,/localStorage|sessionStorage/);
});
test('both vertical pages link to shared catalog and JS with no cloned backend',()=>{
 for(const area of ['legal','accounting','commercial']){
  const html=fs.readFileSync(area+'/index.html','utf8');
  assert.ok(html.includes('data-area="'+area+'"'));
  assert.ok(html.includes('../verticals/studio.js'));
  assert.ok(html.includes('/lib/radix-agent-runtime.js')&&html.includes('/lib/radix-workspace-client.js'));
  assert.ok(html.includes('../verticals/studio.css'));
  assert.ok(html.includes('../control-center-v2.html'));
 }
});
test('Commerciale shows the v3.7 email tool under drafts and every studio links to it',()=>{
 const html=fs.readFileSync('commercial/index.html','utf8');
 assert.ok(html.includes('/lib/radix-agent-media.js')&&html.includes('id="tools"'));
 assert.match(js,/media\.toolsFor\(role,text/);
 for(const f of ['legal/index.html','accounting/index.html','control-center-v2.html'])assert.ok(fs.readFileSync(f,'utf8').includes('/commercial/index.html'),f);
});
test('Command Center network links only name agents in its roster',()=>{
 const cc=fs.readFileSync('control-center-v2.html','utf8');
 const ids=new Set([...cc.matchAll(/\{ id: "([a-z0-9-]+)", name:/g)].map(m=>m[1]));
 const links=/var LINKS=\[([\s\S]*?)\n  \];/.exec(cc)[1];
 for(const m of links.matchAll(/'([a-z0-9-]+)'/g))assert.ok(ids.has(m[1]),m[1]);
});
