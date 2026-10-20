'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {steps,progress,storageKey}=require('../sales/crm-onboarding-core.js');
const done=d=>Object.fromEntries(steps(d).map(s=>[s.id,s.done]));

test('empty workspace: every step to do, each with a link',()=>{
 const s=steps({});assert.deepEqual(s.map(x=>x.id),['pipeline','company','contact','opportunity','lead','campaign']);
 assert.ok(s.every(x=>!x.done&&x.href&&x.label));assert.deepEqual(progress(s),{done:0,total:6,complete:false});
 assert.deepEqual(steps(null).map(x=>x.done),[false,false,false,false,false,false]);
});

test('steps are ticked only by real rows',()=>{
 const P={id:'p1',kind:'opportunity'};
 assert.equal(done({processes:[P],stages:[]}).pipeline,false,'a process without stages is not a pipeline');
 assert.equal(done({processes:[{id:'p2',kind:'task'}],stages:[{process_id:'p2'}]}).pipeline,false,'a task process does not count');
 assert.equal(done({processes:[P],stages:[{process_id:'p1'}]}).pipeline,true);
 const d={companies:[{}],contacts:[{}],opportunities:[{}],leads:[{}],interactions:[{kind:'email',title:'Email registrata · Ciao'}]};
 const r=done(d);assert.ok(r.company&&r.contact&&r.opportunity&&r.lead);
 assert.equal(r.campaign,false,'a single registered email is not a campaign');
 assert.equal(done({interactions:[{kind:'email',title:'Email: Novità di ottobre'}]}).campaign,true);
 assert.equal(done({interactions:[{kind:'note',title:'Email: appunto'}]}).campaign,false);
 assert.equal(done({interactions:[{kind:'email',title:'Newsletter: Novità di ottobre'}]}).campaign,true,'the Lead Intelligence newsletter counts');
 assert.equal(done({interactions:[{kind:'note',title:'Newsletter: bozza'}]}).campaign,false);
 assert.equal(done({interactions:[{kind:'email',title:'Email registrata · Newsletter: x'}]}).campaign,false);
 assert.deepEqual(progress(steps({...d,processes:[P],stages:[{process_id:'p1'}],interactions:[{kind:'email',title:'Email: x'}]})),{done:6,total:6,complete:true});
});

test('storage key is per user and workspace',()=>{
 assert.equal(storageKey(7,'w1'),'radix-crm-primi-passi:7:w1');assert.equal(storageKey(0,'w1'),null);assert.equal(storageKey(7,''),null);
});

test('wiring: loaded before the dashboard, data loader reads leads and processes, storage guarded',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8');
 assert.ok(html.indexOf('sales/crm-onboarding-core.js')>0&&html.indexOf('sales/crm-onboarding-core.js')<html.indexOf('sales/dashboard-view.js'));
 assert.match(fs.readFileSync(__dirname+'/../sales/crm-data.js','utf8'),/'processes','leads'\]/);
 const v=fs.readFileSync(__dirname+'/../sales/dashboard-view.js','utf8');
 assert.match(v,/try\{hidden=localStorage\.getItem\(key\)==='hidden'\}catch\{\}/);assert.match(v,/try\{localStorage\.setItem\(key,'hidden'\)\}catch\{\}/);
 assert.match(v,/'Mostra i primi passi'/,'a hidden card can be shown again');assert.match(v,/try\{localStorage\.removeItem\(key\)\}catch\{\}/);
});

test('the newsletter title format matches the Lead Intelligence recorder',()=>{
 const p=__dirname+'/../sales/lead-newsletter.js';if(!fs.existsSync(p))return;
 const m=fs.readFileSync(p,'utf8').match(/title:\('([^']+)'\+e\.subject\)/);
 if(m)assert.equal(done({interactions:[{kind:'email',title:m[1]+'Ottobre'}]}).campaign,true);
});
