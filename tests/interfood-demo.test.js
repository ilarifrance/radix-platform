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
