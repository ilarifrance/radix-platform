'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const CRM = require('../lib/crm-demo.js');
test('esempio: 35000 EUR, 60%, martedì non risolto e prove dalla nota',()=>{
 const d=CRM.parseNote(CRM.example);assert.equal(d.amount,35000);assert.equal(d.probability,60);assert.equal(d.company,'Aurora Meccanica Demo');assert.equal(d.stage,'Proposta');assert.equal(d.dateExpression,'prossimo martedì');assert.equal(d.dueDate,'');assert.ok(d.warnings.some(x=>x.includes('Data da confermare')));for(const proof of Object.values(d.evidence))assert.ok(CRM.example.includes(proof));
});
test('parser gestisce etichette multilinea e formato italiano',()=>{const d=CRM.parseNote('Azienda: Demo\nOpportunità: Progetto\nValore: 35.000,50 EUR\nProbabilità: 60,5%\nFase: proposta\nAttività: richiamare domani');assert.equal(d.amount,35000.5);assert.equal(d.probability,60.5);assert.equal(d.dateExpression,'domani');assert.equal(d.stage,'Proposta');});
test('nessuna invenzione sui campi mancanti; nota vuota rifiutata',()=>{assert.throws(()=>CRM.parseNote(' '));const d=CRM.parseNote('Telefonata da approfondire');assert.equal(d.company,'');assert.equal(d.contact,'');assert.equal(d.amount,'');assert.equal(d.probability,'');assert.equal(d.dueDate,'');});
test('importi multipli richiedono verifica',()=>{const d=CRM.parseNote('Budget 100 EUR oppure 200 EUR');assert.ok(d.warnings.some(x=>x.includes('Più importi')));});
test('conferma obbligatoria, validazione atomica',()=>{const s=CRM.createState(),before=JSON.stringify(s),d=CRM.parseNote(CRM.example);assert.throws(()=>CRM.saveDraft(s,d,false));assert.throws(()=>CRM.saveDraft(s,{...d,probability:101},true));assert.throws(()=>CRM.saveDraft(s,{...d,amount:Infinity},true));assert.throws(()=>CRM.saveDraft(s,{...d,stage:'Sconosciuta'},true));assert.throws(()=>CRM.saveDraft(s,{...d,dueDate:'2026-02-30'},true));assert.equal(JSON.stringify(s),before);});
test('salva revisioni, conserva origine e collegamenti senza dedurre date',()=>{const s=CRM.createState(),d=CRM.parseNote(CRM.example);d.title='Titolo revisionato';const id=CRM.saveDraft(s,d,true),op=s.opportunities.find(o=>o.id===id),n=s.notes.find(n=>n.id===op.noteId),a=s.activities.find(a=>a.opportunityId===id);assert.equal(op.title,'Titolo revisionato');assert.equal(n.text,CRM.example);assert.equal(a.noteId,n.id);assert.equal(a.dueDate,'');assert.equal(a.dateExpression,'prossimo martedì');assert.equal(s.history[0].noteId,n.id);assert.equal(s.history[0].reviewed.title,d.title);assert.ok(s.contacts.some(c=>c.companyId===op.companyId));assert.ok(s.leads.some(l=>l.noteId===n.id));});
test('riusa azienda; ogni nuova conferma crea opportunità distinta',()=>{const s=CRM.createState(),d=CRM.parseNote(CRM.example);const a=CRM.saveDraft(s,d,true);const b=CRM.saveDraft(s,d,true);assert.notEqual(a,b);assert.equal(s.companies.filter(c=>c.name===d.company).length,1);assert.equal(s.contacts.filter(c=>c.name===d.contact).length,1);});
test('data assoluta soltanto dopo scelta manuale; controllo calendario',()=>{assert.equal(CRM.validDate('2024-02-29'),true);assert.equal(CRM.validDate('2026-02-29'),false);const s=CRM.createState(),d=CRM.parseNote(CRM.example);d.dueDate='2026-10-20';const id=CRM.saveDraft(s,d,true);assert.equal(s.activities.find(a=>a.opportunityId===id).dueDate,d.dueDate);});
test('pipeline, follow-up, rischi e storico aggiornati',()=>{const s=CRM.createState();assert.equal(CRM.summarize(s).total,42000);assert.equal(CRM.summarize(s).weighted,24000);assert.equal(CRM.summarize(s).risks.length,2);CRM.moveOpportunity(s,'o2','Vinta');assert.equal(CRM.summarize(s).total,18000);assert.equal(s.history[0].noteId,'n2');CRM.completeActivity(s,'a1');assert.equal(CRM.summarize(s).pending,0);assert.ok(CRM.summarize(s).risks[0].includes('manca'));const count=s.history.length;CRM.completeActivity(s,'a1');assert.equal(s.history.length,count);assert.throws(()=>CRM.moveOpportunity(s,'missing','Vinta'));});
test('nuova sessione riparte dai soli dati sintetici',()=>{const a=CRM.createState();CRM.saveDraft(a,CRM.parseNote(CRM.example),true);assert.equal(CRM.createState().opportunities.length,2);});
test('script browser esponibile offline e sintassi inline valida',()=>{const context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lib/crm-demo.js'),'utf8'),context);assert.equal(context.RadixCRM.parseNote(context.RadixCRM.example).amount,35000);const html=fs.readFileSync(path.join(__dirname,'../radix-crm-concept.html'),'utf8');const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(inline.length,1);new vm.Script(inline[0][1]);assert.match(html,/<script src="lib\/crm-demo.js"><\/script>/);assert.match(html,/connect-src 'none'/);assert.match(html,/prefers-reduced-motion/);assert.match(html,/Voce NON INTEGRATA/);assert.doesNotMatch(html,/https?:\/\/|\bfetch\s*\(|localStorage|sessionStorage|indexedDB|SpeechRecognition|getUserMedia|innerHTML/);});


test('manual CRUD complete chain with scoped Customer360 and no cascade',()=>{
 const s=CRM.createState(),c=CRM.saveRecord(s,'companies',{name:'Nuvola Demo'});
 const p=CRM.saveRecord(s,'contacts',{name:'Persona sintetica',companyId:c.id});
 const l=CRM.saveRecord(s,'leads',{name:'Interesse demo',companyId:c.id,status:'Da qualificare'});
 const o=CRM.saveRecord(s,'opportunities',{title:'Percorso demo',companyId:c.id,amount:1200.50,probability:25,stage:'Proposta'});
 const a=CRM.saveRecord(s,'activities',{title:'Richiamare demo',companyId:c.id,opportunityId:o.id,owner:'Team sintetico',priority:'high',dueDate:'2026-10-20'});
 const view=CRM.customer360(s,c.id);assert.equal(view.contacts[0].id,p.id);assert.deepEqual(view.opportunities.map(x=>x.id),[o.id]);assert.equal(view.activities[0].done,false);assert.equal(view.notes.length,0);
 assert.throws(()=>CRM.deleteRecord(s,'companies',c.id),/collegata/);assert.throws(()=>CRM.deleteRecord(s,'opportunities',o.id),/collegata/);
 CRM.saveRecord(s,'activities',{done:true,dueDate:'',owner:'',priority:'urgent'},a.id);assert.equal(a.done,true);assert.equal(a.owner,'');
 CRM.saveRecord(s,'contacts',{name:'Nuovo nome'},p.id);CRM.saveRecord(s,'leads',{status:'Qualificato'},l.id);CRM.saveRecord(s,'opportunities',{amount:0,probability:0,stage:'Persa'},o.id);
 for(const [type,id] of [['activities',a.id],['opportunities',o.id],['contacts',p.id],['leads',l.id],['companies',c.id]])CRM.deleteRecord(s,type,id);
 assert.throws(()=>CRM.customer360(s,c.id));assert.equal(CRM.summarize(s).total,42000);
});
test('manual CRUD rejects invalid fields, enums, cross-context, dates atomically',()=>{
 const cases=[['companies',{name:' '}],['companies',{name:'Demo',id:'forged'}],['contacts',{name:'Demo',companyId:'missing'}],['leads',{name:'Demo',companyId:'c1',status:'Live'}],['opportunities',{title:'Demo',companyId:'c1',amount:1.001,probability:40,stage:'Proposta'}],['opportunities',{title:'Demo',companyId:'c1',amount:Infinity,probability:40,stage:'Proposta'}],['opportunities',{title:'Demo',companyId:'c1',amount:10,probability:101,stage:'Proposta'}],['activities',{title:'Demo',companyId:'c2',opportunityId:'o1'}],['activities',{title:'Demo',companyId:'c1',opportunityId:'o1',dueDate:'2026-02-30'}],['activities',{title:'Demo',companyId:'c1',opportunityId:'o1',done:'false'}],['activities',{title:'Demo',companyId:'c1',opportunityId:'o1',priority:'live'}],['__proto__',{name:'Demo'}]];
 for(const [type,input]of cases){const s=CRM.createState(),before=JSON.stringify(s);assert.throws(()=>CRM.saveRecord(s,type,input));assert.equal(JSON.stringify(s),before);}
});
test('linked original evidence cannot silently move to another company',()=>{
 const s=CRM.createState(),before=JSON.stringify(s);assert.throws(()=>CRM.saveRecord(s,'opportunities',{companyId:'c2'},'o1'),/collegato/);assert.throws(()=>CRM.saveRecord(s,'activities',{companyId:'c2',opportunityId:'o2'},'a1'),/collegata/);assert.equal(JSON.stringify(s),before);
});
test('manual updates preserve source, no-op does not append false history',()=>{
 const s=CRM.createState(),n=s.history.length;CRM.saveRecord(s,'companies',{name:s.companies[0].name},'c1');assert.equal(s.history.length,n);
 CRM.saveRecord(s,'opportunities',{title:'Nuovo titolo'},'o1');assert.equal(s.opportunities[0].noteId,'n1');assert.equal(s.notes[0].text,'Scenario sintetico: obiettivi e tempistiche da validare.');
 assert.throws(()=>CRM.saveRecord(s,'companies',{name:'x'},'missing'));assert.throws(()=>CRM.deleteRecord(s,'companies','missing'));
});
