'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {score,explain}=require('../sales/crm-score-core');const {segmentFilters}=require('../api/_sales');
const now=Date.parse('2026-10-16T12:00:00Z'),day=864e5,iso=t=>new Date(t).toISOString();
test('a recent, engaged decision maker with an open deal is hot; an unknown contact is cold',()=>{
 const data={stages:[{id:'s',probability:50}],interactions:[{contact_id:'c1',occurred_at:iso(now-2*day)},{contact_id:'c1',occurred_at:iso(now-20*day)}],
  opportunities:[{contact_id:'c1',amount_cents:3000000,stage_id:'s',outcome:'open'},{contact_id:'c1',amount_cents:100,outcome:'won'}]};
 const hot=score({id:'c1',role:'CEO',marketing_consent:true},data,now);
 assert.deepEqual(hot.parts,{recency:30,frequency:10,pipeline:25,won:5,consent:5,role:10});assert.equal(hot.total,85);assert.equal(hot.band,'caldo');
 assert.match(explain(hot),/sentito 2 giorni fa · 2 interazioni in 90 giorni · trattative aperte · già cliente · consenso marketing · ruolo decisionale/);
 const cold=score({id:'c2'},data,now);assert.equal(cold.total,0);assert.equal(cold.band,'freddo');assert.equal(cold.lastContactDays,null);
 assert.equal(score({id:'c3',role:'Impiegata'},{interactions:[{contact_id:'c3',occurred_at:iso(now-60*day)}]},now).total,12+5+4);
});
test('saved segments accept a minimum score and the CRM page loads the score before the tools',()=>{
 assert.ok(segmentFilters({min_score:60}));assert.equal(segmentFilters({min_score:101}),false);
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8');assert.ok(html.indexOf('crm-score-core.js')<html.indexOf('crm-tools.js'));
 assert.match(fs.readFileSync(__dirname+'/../sales/crm-tools.js','utf8'),/Bozza di risposta con AI/);
});
