'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),G=require('../api/_lead_growth_projects');
const ws='11111111-1111-4111-8111-111111111111',cid='22222222-2222-4222-8222-222222222222';
function blank(){return{version:1,company:{name:'GCP',website:'https://example.org',industry:'Servizi',description:''},icp:{geos:'Italia',titles:'CEO',industries:'B2B',companySize:'10-100'},offer:{core:'Sviluppo commerciale',differentiators:'',proof:'Una\nreferenza verificabile'},sending:{domains:'',mailboxes:'',provider:''},linkedin:{profileUrl:''},calendars:{bookingUrl:'',demoUrl:''},campaigns:[],state:'draft'}}
test('valid project onboarding keeps multiline evidence and allows optional sending',()=>{
 const p=blank(),saved=G.payload(p);assert.equal(saved.offer.proof,p.offer.proof);assert.equal(saved.sending.mailboxes,'');
 const c=G.command({workspace:ws,entity:'lead_growth_projects',action:'create',data:{title:'GCP - Growth',payload:p}});
 assert.ok(c.data.id);assert.equal(c.data.title,'GCP - Growth');
});
test('approved project and planning-only campaign are valid',()=>{
 const p=blank();p.state='ready';p.campaigns=[{id:cid,title:'CEO Nord Italia',stage:'ready',channel:'email',segment:'CEO',goal:'Call qualificate',notes:'Bozza email',creditBudget:'500'}];
 assert.equal(G.payload(p).campaigns[0].stage,'ready');
});
test('rejects credential fields, unsafe URLs and duplicated campaigns',()=>{
 const p=blank();p.linkedin.cookies='sensitive';assert.throws(()=>G.payload(p),/non valido/);
 delete p.linkedin.cookies;p.company.website='http://example.org';assert.throws(()=>G.payload(p),/HTTPS/);
 p.company.website='https://example.org';p.campaigns=[{id:cid,title:'Aziende',stage:'draft',channel:'manual',segment:'',goal:'',notes:'',creditBudget:'0'}];
 p.campaigns.push({...p.campaigns[0]});assert.throws(()=>G.payload(p),/duplicato/);
});
test('ready status requires company, target and offer',()=>{const p=blank();p.state='ready';p.offer.core='';assert.throws(()=>G.payload(p),/servono/)});
