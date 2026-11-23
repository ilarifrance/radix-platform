'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const B=require('../lib/cc-brief-core.js');
const DAY=864e5,NOW=Date.parse('2026-11-24T10:00:00Z'),END=Date.parse('2026-11-24T23:00:00Z'),iso=t=>new Date(t).toISOString();
const sales={tasks:[
  {id:'t1',status:'todo',due_at:iso(NOW-DAY)},{id:'t2',status:'todo',due_at:iso(NOW+3600e3)},{id:'t3',status:'done',due_at:iso(NOW-DAY)},
  {id:'t4',status:'todo',due_at:iso(NOW+2*DAY)},{id:'t5',status:'todo',due_at:null},{id:'t6',status:'todo',due_at:iso(NOW+3*DAY),opportunity_id:'o3'}],
 opportunities:[
  {id:'o1',outcome:'open',created_at:iso(NOW-30*DAY),contact_id:'c1'},      // ferma: nessun contatto
  {id:'o2',outcome:'open',created_at:iso(NOW-30*DAY),contact_id:'c2'},      // toccata 3 giorni fa
  {id:'o3',outcome:null,created_at:iso(NOW-30*DAY)},                        // ha un'attività aperta
  {id:'o4',outcome:'open',created_at:iso(NOW-2*DAY)},                       // troppo giovane
  {id:'o5',outcome:'won',created_at:iso(NOW-60*DAY)}],
 interactions:[{id:'i1',contact_id:'c2',occurred_at:iso(NOW-3*DAY)},{id:'i2',opportunity_id:'o1',occurred_at:iso(NOW-20*DAY)}]};
test('Vendite: attività in ritardo e di oggi, trattative ferme con la regola dei 14 giorni',()=>{
 assert.deepEqual(B.agenda(sales.tasks,NOW,END),{overdue:1,today:1});
 assert.deepEqual(B.staleDeals(sales,NOW).map(o=>o.id),['o1']);
 const l=B.salesLine(sales,NOW,END);
 assert.equal(l.count,3);assert.equal(l.tone,'late');assert.equal(l.href,'/radix-sales.html#today');
 assert.equal(l.text,'1 attività in ritardo, 1 attività da fare oggi, 1 trattativa ferma da 14 giorni.');
 const calm=B.salesLine({tasks:[],opportunities:[],interactions:[]},NOW,END);assert.equal(calm.tone,'ok');assert.equal(calm.count,0);
 assert.match(B.salesLine({error:'CRM 504'},NOW,END).text,/non leggibili adesso \(CRM 504\)/);
 assert.match(B.salesLine({...sales,partial:true},NOW,END).text,/Elenco parziale/);
});
test('Progetti e Sistema: passi da approvare, servizi non collegati (solo i nomi)',()=>{
 const p=B.projectsLine({items:[
  {name:'Alfa',status:'active',journey:{steps:[{id:'brief',label:'Brief',state:'done'},{id:'ped',label:'Piano editoriale',state:'waiting'}]}},
  {name:'Beta',status:'active',journey:{steps:[{id:'brief',label:'Brief',state:'active'}]}},
  {name:'Vecchio',status:'archived',journey:{steps:[{id:'ped',label:'PED',state:'waiting'}]}}]});
 assert.equal(p.count,1);assert.equal(p.text,'1 passo da approvare (parti da «Alfa · Piano editoriale»), 1 progetto in corso.');
 const s=B.systemLine({items:[{id:'hunter',label:'Hunter',configured:true},{id:'twilio',label:'Twilio',configured:false},{id:'x',label:'Apollo',configured:false}]});
 assert.equal(s.count,2);assert.equal(s.text,'2 servizi non collegati: Twilio, Apollo.');
 assert.equal(B.systemLine({items:[{id:'a',label:'A',configured:true}]}).tone,'ok');
});
test('Brief: solo le aree lette, totale e titolo; la pagina lo carica senza AI',()=>{
 const b=B.brief({now:NOW,dayEnd:END,sales,integrations:{items:[]}});
 assert.deepEqual(b.lines.map(l=>l.area),['sales','system']);assert.equal(b.total,3);assert.equal(b.late,true);
 assert.equal(B.headline(b),'3 cose ti aspettano oggi.');assert.equal(B.headline(B.brief({now:NOW,integrations:{items:[]}})),'Niente che ti aspetta, per ora.');
 assert.equal(B.headline(B.brief({})),'Nessun dato da mostrare.');
 const ui=fs.readFileSync('lib/cc-brief.js','utf8'),html=fs.readFileSync('control-center-v2.html','utf8');
 assert.ok(html.includes('/lib/cc-brief-core.js')&&html.includes('/lib/cc-brief.js'));
 assert.ok(!/\/api\/chat|method:\s*'POST'|innerHTML/.test(ui),'sola lettura, niente AI, niente HTML da stringhe');
});
