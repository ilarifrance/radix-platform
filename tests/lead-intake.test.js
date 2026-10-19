'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../lib/lead-intake-core');
const {parseCsv}=require('../lib/lead-csv-parser');
const {payload}=require('../api/_lead_lists');
const base={name:'ACME',domain:'acme.it',country:'',industry:'',companySize:'',contactRole:'',source:'https://acme.it/company'};
const more={name:'ACME',domain:'https://www.acme.it',country:'Italia',industry:'Meccanica',companySize:'PMI',contactRole:'CEO',source:'https://acme.it/about'};
test('validates LinkedIn company, profile and Sales Navigator list URLs',()=>{
 assert.equal(C.linkedinUrl('https://www.linkedin.com/sales/search/people?query=test').kind,'sales-list');
 assert.equal(C.linkedinUrl('https://linkedin.com/company/acme/').kind,'company');
 assert.equal(C.linkedinUrl('https://it.linkedin.com/in/someone').kind,'person');
 for(const url of ['https://linkedin.com.attacker.test/company/acme','http://linkedin.com/company/acme','https://evil.test/sales/lists/people','https://alice:password@linkedin.com/company/acme'])assert.throws(()=>C.linkedinUrl(url));
});
test('import preserves declared LinkedIn source without leaking search query',()=>{
 const data=parseCsv('companyname;companywebsite;companyindustry;jobtitle\nACME;acme.it;Meccanica;CEO');
 assert.equal(data[0].name,'ACME');
 const rows=C.link(data,'https://www.linkedin.com/sales/lists/people?query=secret');
 assert.equal(rows[0].source,'https://www.linkedin.com/sales/lists/people');
});
test('enriches ONLY missing fields with unique company match and provides provenance',()=>{
 const plan=C.plan([base],[more]);
 assert.equal(plan.suggestions.length,4);
 assert.ok(plan.suggestions.every(s=>s.index===0&&!s.verified&&s.source==='https://acme.it/about'));
 const {rows,evidence}=C.apply([base],plan.suggestions);
 assert.equal(rows[0].country,'Italia');assert.equal(rows[0].source,base.source);
 assert.equal(evidence.length,4);
 const stored=payload({icp:{country:'',industry:'',size:'',role:''},prospects:rows,reviews:[],enrichment:evidence});
 assert.equal(stored.enrichment.length,4);
 assert.throws(()=>payload({icp:stored.icp,prospects:rows,reviews:[],enrichment:[{...evidence[0],value:'Falso'}]}),/provenienza|completamento/i);
 assert.deepEqual(payload({icp:stored.icp,prospects:[base],reviews:[]}).enrichment,[]);
});
test('does not overwrite populated data or guess on ambiguous duplicates',()=>{
 const filled={...base,industry:'Industria'};
 assert.ok(!C.plan([filled],[more]).suggestions.some(s=>s.field==='industry'));
 const duplicate=[base,{...base,name:'Acme bis'}];
 assert.equal(C.plan(duplicate,[more]).suggestions.length,0);
 assert.equal(C.plan([base],[{...more,name:'Other',domain:'other.test'}]).suggestions.length,0);
});
test('UI wires import controls without credential collection and retains archive safeguards',()=>{
 const html=fs.readFileSync('lead-intelligence.html','utf8'),ui=fs.readFileSync('sales/lead-intake.js','utf8'),archive=fs.readFileSync('sales/lead-archive.js','utf8');
 for(const id of ['li-source-url','li-paste-rows','li-enrich-file','li-suggestions','li-apply','li-company-add'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/lead-intake-core.js/);assert.match(html,/lead-intake.js/);
 assert.match(ui,/window.confirm/);
 assert.ok(!/localStorage|sessionStorage|linkedin-password/.test(ui));
 assert.match(archive,/radixLeadIntakeEvidence/);
});
