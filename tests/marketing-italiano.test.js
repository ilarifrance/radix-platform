'use strict';
// Marketing area in Italian: the division names, descriptions, stages and deliverables of agency/catalog.json show on
// «Divisioni dell'agenzia» and «Divisione»; they are display text only (ids, agent ids and links stay as they were).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const catalog=JSON.parse(read('agency/catalog.json'));
// English words the old names used; brand/product words (SEO, GEO, KPI, Reel, Buffer, HeyGen, Google, Meta…) are allowed.
const ENGLISH=/\b(Campaign|Control|Approvals?|Releases?|Agent|Network|Creative|Asset|Knowledge|Paid|Media|PPC|Video Studio|Web Studio|Overview|Workflow|Workspace|Board|Output|Preview|Roadmap|Checklist|Template|Topic|nurture|Versioning|Script|Audit|Buyer personas|Brand (kit|memory|strategy)|Engine|Operations|Tone of voice)\b|&/;

test('division names, descriptions, stages and deliverables are Italian',()=>{
 for(const d of catalog.divisions){
  for(const s of [d.label,d.description,...d.stages,...d.deliverables])assert.doesNotMatch(s,ENGLISH,d.id+': «'+s+'»');
 }
 assert.deepEqual(catalog.divisions.map(d=>d.label),['Strategia e brand','Regia delle campagne','Piano editoriale e social','Studio creativo','Siti web','SEO e GEO','Pubblicità a pagamento','Email e newsletter','Studio video','Analisi e conversioni','Materiali e conoscenze','Approvazioni e pubblicazioni','Rete degli agenti']);
});

test('ids, agent ids and roles are unchanged',()=>{
 assert.deepEqual(catalog.divisions.map(d=>d.id),['strategy','campaigns','ped','creative','web','seo-geo','paid','email','video','analytics','assets','approvals','team']);
 assert.deepEqual(Object.fromEntries(catalog.divisions.map(d=>[d.id,d.agentIds])),{"strategy":["marketing-orchestrator","brand-strategist","strategist"],"campaigns":["marketing-orchestrator","brand-strategist","paid-media"],"ped":["strategist","copywriter","social-media-manager","orchestrator"],"creative":["art-director","ai-specialist","copywriter"],"web":["web-developer","web-content","seo-geo","art-director"],"seo-geo":["seo-geo","web-content","web-developer"],"paid":["paid-media","copywriter","art-director","analytics"],"email":["copywriter","web-content","ai-specialist","analytics"],"video":["video-producer","art-director","ai-specialist","copywriter"],"analytics":["analytics","strategist","paid-media"],"assets":["art-director","web-content"],"approvals":["marketing-orchestrator"],"team":["marketing-orchestrator","brand-strategist","strategist","copywriter","art-director","ai-specialist","social-media-manager","seo-geo","web-content","video-producer","paid-media","analytics","orchestrator","web-developer"]});
 assert.deepEqual(Object.keys(catalog.roles).sort(),['ai-specialist','analytics','art-director','brand-strategist','copywriter','marketing-orchestrator','orchestrator','paid-media','seo-geo','social-media-manager','strategist','video-producer','web-content','web-developer']);
});

test('divisions page agrees with the catalog (spotlight and fallback names)',()=>{
 const html=read('agency/index.html'),byId=Object.fromEntries(catalog.divisions.map(d=>[d.id,d.label]));
 // the shell layer finds the featured division by its name, so the starting one must be the catalog's PED name
 assert.match(html,new RegExp('<h4>'+byId.ped+'</h4>'));
 for(const [id,label] of Object.entries(byId))assert.ok(html.includes("'"+label+"']"),'visuals name for '+id);
 assert.doesNotMatch(html,/Workflow operativo|Brief & Analisi|Brand & Creative|Sezioni Agency/);
 assert.match(html,/id="workflow"/,'the #workflow anchor stays');
});

test('page titles and headings of the Marketing pages are Italian',()=>{
 const files=['agency/memory.html','agency/operations.html','agency/project-workspace.html','agency/new-project.html','agency/workspace.html','agency/clients.html','agency/orbit.html','project-editorial.html'];
 for(const f of files){const s=read(f);
  assert.doesNotMatch(s,/Memory Engine<|Agency · Operations|Project Workspace|Agency Overview|Board operativo|Workspace agenti e risultati|Output dello specialista|>PED Studio<|Navigazione Agency|Sezioni Agency|Pipeline post in 5|Tone of voice e vincoli|>Workflow operativo<|Deliverable tipici|workspace del progetto/,f);
 }
 assert.match(read('editorial-workspace.js'),/voice:'Tono di voce'/);
 assert.match(read('agency/orbit.js'),/'Il percorso del progetto':'Flusso di lavoro'/);
});
