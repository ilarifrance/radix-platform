const test=require('node:test'),assert=require('node:assert'),fs=require('fs');
const html=fs.readFileSync('interfood.html','utf8'),js=fs.readFileSync('interfood/interfood.js','utf8'),css=fs.readFileSync('interfood/interfood.css','utf8');
const D=require('../interfood/interfood-data.js');
test('page obeys the strict CSP',()=>{
 assert.match(html,/script-src 'self'; style-src 'self'/);assert.match(html,/noindex/);
 assert.ok(!/<style|style=|<script(?![^>]*src=)/.test(html));
 assert.ok(!/\.style\b|innerHTML|setAttribute\(['"]style/.test(js));
 assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(css+js));
});
test('demo data is consistent',()=>{
 const ids=new Set(D.customers.map(c=>c.id));
 D.machines.forEach(m=>assert.ok(ids.has(m.customer),m.id));
 D.deals.forEach(d=>assert.ok(ids.has(d.customer),d.id));
 D.tickets.forEach(t=>assert.ok(ids.has(t.customer),t.id));
 D.installs.forEach(i=>assert.ok(ids.has(i.customer),i.title));
 const mids=new Set(D.machines.map(m=>m.id));D.tickets.forEach(t=>assert.ok(mids.has(t.machine)));
 D.deals.forEach(d=>assert.ok(D.stages.includes(d.stage),d.id));
});
test('roles, contacts and activities are consistent',()=>{
 const ids=new Set(D.customers.map(c=>c.id)),areas=new Set(D.nodes.map(n=>n.id)),deals=new Set(D.deals.map(d=>d.id));
 D.contacts.forEach(p=>assert.ok(ids.has(p.customer),p.id));
 D.activities.forEach(a=>assert.ok(deals.has(a.deal),a.id));
 D.users.forEach(u=>u.access.forEach(a=>assert.ok(areas.has(a),u.name+' '+a)));
 assert.ok(D.users.some(u=>u.access.length===D.nodes.length),'one user sees everything');
 assert.ok(D.users.some(u=>u.access.length===1),'one user sees a single tool');
});
test('page loads the shared globe painter from self',()=>{assert.match(html,/src="\/sales\/orbit-globe\.js"/)});
