'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const dv=require('../lib/agency-divisions.js');
const catalog=require('../agency/catalog.json');
const division=id=>catalog.divisions.find(d=>d.id===id);
const projects=[{id:'p1',name:'Alfa',client_name:'Cliente A'},{id:'p2',name:'Beta'},{id:'p3',name:'Vuoto'}];
const plans=new Map([
 ['p1',{tasks:[{id:'step-1',role:'brand-strategist',instruction:'Analisi competitor',status:'approved'},{id:'step-2',role:'copywriter',instruction:'Bozze post',status:'done'},{id:'step-3',role:'paid-media',instruction:'Piano ADV',status:'proposed'}]}],
 ['p2',{tasks:[{id:'step-1',role:'seo-geo',instruction:'Audit SEO',status:'running'}]}]
]);

test('tasks belong to the divisions of their specialist',()=>{
 const w=dv.divisionWork(division('strategy'),projects,plans);
 assert.equal(w.length,1);assert.equal(w[0].project.name,'Alfa');assert.equal(w[0].project.client,'Cliente A');
 assert.deepEqual(w[0].tasks.map(t=>t.title),['Analisi competitor']);assert.equal(w[0].approved,1);assert.equal(w[0].open,0);
 const seo=dv.divisionWork(division('seo-geo'),projects,plans);assert.deepEqual(seo.map(x=>x.project.id),['p2']);assert.equal(seo[0].open,1);
});

test('the Approvals division collects drafts waiting for review',()=>{
 const w=dv.divisionWork(division('approvals'),projects,plans);
 assert.equal(w.length,1);assert.equal(w[0].review,1);assert.equal(w[0].tasks[0].role,'copywriter');
});

test('overview counts per division and readable summaries',()=>{
 const c=dv.overview(catalog.divisions,projects,plans);
 assert.deepEqual(c.paid,{projects:1,open:2,review:1});
 assert.deepEqual(c.assets,{projects:0,open:0,review:0});
 assert.equal(dv.summaryLine(c.paid),'1 progetto · 2 incarichi aperti · 1 da revisionare');
 assert.equal(dv.summaryLine(c.assets),'Nessun incarico nei progetti del team');
});

test('projects without a plan or with malformed plans are skipped',()=>{
 const w=dv.divisionWork(division('team'),[{id:'x',name:'X'}],new Map([['x',{tasks:'nope'}]]));
 assert.deepEqual(w,[]);
});
