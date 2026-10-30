'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../tools/radix-chrome-extension/src/core');
const jobs=require('../api/_lead_contact_jobs');
const fs=require('node:fs');
const WS='11111111-1111-4111-8111-111111111111';
const SOURCE='https://www.linkedin.com/sales/search/people?query=(keywords%3Aceo)';
// A realistic Sales Navigator row: long titles and profile URLs, as read from the page.
const rows=n=>Array.from({length:n},(_,i)=>({fullName:'Persona '+i+' Rossi',firstName:'Persona '+i,lastName:'Rossi',jobTitle:'Titolare dell\'azienda · Azienda Famiglia Rossi '+i+' S.r.l.',companyName:'Azienda Famiglia Rossi '+i+' S.r.l.',location:'Lissone, Lombardia, Italia',profileUrl:'https://www.linkedin.com/sales/lead/ACwAAB'+String(i).padStart(6,'0')+'xyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789,NAME_SEARCH,abcd?_ntb=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',sourceUrl:SOURCE}));
test('a 1000-contact extension import is accepted by the job validator and fits the server body cap',()=>{
 const payload=Core.buildJob(rows(1000),SOURCE,'run1');
 const body=Core.importBody(WS,'LinkedIn Sales Navigator · 1000 contatti',payload);
 const size=Buffer.byteLength(JSON.stringify(body));
 assert.ok(size<3800000,'job size '+size);
 const c=jobs.command({workspace:WS,entity:'lead_contact_jobs',action:'create',data:body.data});
 assert.equal(c.data.payload.records.length,1000);
});
test('migration 020 raises the payload cap to the same value as the validator',()=>{
 const sql=fs.readFileSync(__dirname+'/../migrations/sales/020_lead_contact_jobs_larger.sql','utf8');
 assert.match(sql,/<=3800000/);
 assert.match(fs.readFileSync(__dirname+'/../api/_lead_contact_jobs.js','utf8'),/>3800000/);
});
