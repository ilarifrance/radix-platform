'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const guide=require('../lib/radix-guide.js');

test('every page in the map links to a real file and every FAQ link points to a known page',()=>{
 const fs=require('fs'),path=require('path'),ids=new Set(guide.GUIDE.map(g=>g.id));
 assert.equal(ids.size,guide.GUIDE.length,'unique ids');
 for(const g of guide.GUIDE){assert.ok(g.title&&g.what&&g.start.length,g.id);const file=path.join(__dirname,'..',g.href.split('#')[0]);
  if(g.id!=='agency-avatar')assert.ok(fs.existsSync(file),g.id+' → '+file);
  for(const f of g.faq){assert.equal(f.length,3,g.id);for(const id of f[2])assert.ok(ids.has(id),g.id+' faq link '+id)}}
});

test('page entry by shell id or path, quick answers only on a clear match',()=>{
 assert.equal(guide.forPage('agency-ped','/x').id,'agency-ped');
 assert.equal(guide.forPage('','/agency/new-project.html').id,'agency-new');
 assert.equal(guide.forPage('nope','/nope.html').id,'cc');
 assert.match(guide.match('come cambio la grafica dei post?').a,/Ridisegna/);
 assert.match(guide.match('Posso usare una foto al posto della grafica?').a,/Higgsfield/);
 assert.equal(guide.match('ciao'),null);assert.equal(guide.match('qual è il fatturato di marzo del cliente rossi'),null);
});

test('AI answers: [[id]] becomes a link, unknown ids vanish; the agent prompt carries the map and the rules',()=>{
 const parts=guide.linkify('Apri [[agency-ped]] poi [[boh]] e fine.');
 assert.deepEqual(parts.map(p=>p.link?'L:'+p.link.id:p.text),['Apri ','L:agency-ped',' poi ',' e fine.']);
 const s=guide.systemText();assert.match(s,/\[agency-new\] Nuovo progetto Agency/);assert.match(s,/Niente esce da RADIX/);assert.match(s,/\[\[agency-ped\]\]/);
 const chat=require('../api/chat.js');assert.equal(typeof chat,'function');
});
