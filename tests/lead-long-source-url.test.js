'use strict';const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Bridge=require('../lib/lead-local-handoff');
test('long Sales Navigator filters stay on the job while contact provenance is bounded',()=>{
 const source='https://www.linkedin.com/sales/search/people?query='+encodeURIComponent('a'.repeat(1800));
 const profileUrl='https://www.linkedin.com/sales/lead/long-query';
 const original={sourceUrl:source,data:{version:1,sourceUrl:source,records:[{fullName:'Long Source',companyName:'Test Srl',profileUrl,sourceUrl:source}],batches:[],total:1,duplicates:0}};
 const result=Bridge.parse(original);
 assert.equal(result.job.sourceUrl,source);
 assert.equal(result.job.records[0].sourceUrl,'https://www.linkedin.com/sales/search/people');
 assert.equal(result.job.records.length,1);
});
test('local browser agent normalizes per-person source rather than an unbounded search URL',()=>{
 const agent=fs.readFileSync('tools/linkedin-local-agent/index.js','utf8');
 assert.match(agent,/job\.sourceUrl\.length>1000\?job\.sourceUrl\.split\('\?'\)\[0\]:job\.sourceUrl/);
});
