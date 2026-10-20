'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const H=require('../sales/crm-home-core.js');
const DAY=864e5,NOW=Date.parse('2026-10-20T10:00:00Z');
const iso=n=>new Date(n).toISOString();
const ymd=n=>{const d=new Date(n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const old=iso(NOW-40*DAY);
const rules=r=>r.items.map(x=>x.rule);

test('empty or missing data: no suggestions',()=>{
 assert.deepEqual(H.suggestions({},{now:NOW}),{items:[],total:0});
 assert.deepEqual(H.suggestions(null,{now:NOW,me:7}),{items:[],total:0});
});

test('opportunity open after its expected close: Customer360 of the deal',()=>{
 const d={opportunities:[
  {id:'o1',title:'Rinnovo',amount_cents:500000,outcome:'open',expected_close:ymd(NOW-3*DAY),created_at:iso(NOW-2*DAY)},
  {id:'o2',title:'Vinta',amount_cents:900000,outcome:'won',expected_close:ymd(NOW-3*DAY),created_at:iso(NOW-2*DAY)},
  {id:'o3',title:'Futura',amount_cents:900000,outcome:'open',expected_close:ymd(NOW+3*DAY),created_at:iso(NOW-2*DAY)}]};
 const r=H.suggestions(d,{now:NOW});
 assert.equal(r.items.length,1);const it=r.items[0];
 assert.equal(it.rule,'close-overdue');assert.equal(it.urgency,3);assert.equal(it.value,500000);
 assert.deepEqual(it.action,{kind:'customer',subject:'opportunities',id:'o1',name:'Rinnovo'});
 assert.match(it.reason,/ancora aperta \(3 giorni fa\)/);
});

test('my tasks overdue or due today only; others go to the tasks view',()=>{
 const d={tasks:[
  {id:'t1',title:'Chiama',assignee_id:7,status:'todo',due_at:iso(NOW-2*DAY)},
  {id:'t2',title:'Oggi',assignee_id:7,status:'doing',due_at:iso(NOW+60e3)},
  {id:'t3',title:'Di altri',assignee_id:8,status:'todo',due_at:iso(NOW-2*DAY)},
  {id:'t4',title:'Fatta',assignee_id:7,status:'done',due_at:iso(NOW-2*DAY)},
  {id:'t5',title:'Domani',assignee_id:7,status:'todo',due_at:iso(NOW+2*DAY)},
  {id:'t6',title:'Senza data',assignee_id:7,status:'todo'}]};
 const r=H.suggestions(d,{now:NOW,me:7});
 assert.deepEqual(r.items.map(x=>x.title),['Chiama','Oggi']);
 assert.deepEqual(r.items.map(x=>x.urgency),[3,2]);
 assert.ok(r.items.every(x=>x.action.kind==='view'&&x.action.hash==='#tasks'));
 assert.equal(H.suggestions(d,{now:NOW,me:null}).items.length,0,'no user, no personal tasks');
});

test('stale deal reuses the automation rule (14 days, no open task)',()=>{
 const o={id:'o1',title:'Ferma',amount_cents:100,outcome:'open',contact_id:'c1',created_at:old};
 const base={opportunities:[o],interactions:[{contact_id:'c1',occurred_at:iso(NOW-20*DAY)}]};
 let r=H.suggestions(base,{now:NOW});assert.deepEqual(rules(r),['stale-deal']);assert.match(r.items[0].reason,/Ultimo contatto 20 giorni fa/);
 assert.equal(H.suggestions({...base,interactions:[{contact_id:'c1',occurred_at:iso(NOW-3*DAY)}]},{now:NOW}).items.length,0);
 assert.equal(H.suggestions({...base,tasks:[{opportunity_id:'o1',status:'todo'}]},{now:NOW}).items.length,0);
 r=H.suggestions({opportunities:[o]},{now:NOW});assert.match(r.items[0].reason,/Nessun contatto registrato/);
});

test('one item per record: an overdue stale deal shows once, as overdue',()=>{
 const o={id:'o1',title:'X',amount_cents:100,outcome:'open',expected_close:ymd(NOW-5*DAY),created_at:old};
 const r=H.suggestions({opportunities:[o]},{now:NOW});assert.deepEqual(rules(r),['close-overdue']);
});

test('new contact without first contact; tickets waiting; leads not worked',()=>{
 const d={
  contacts:[{id:'c1',name:'Anna',created_at:iso(NOW-2*DAY)},{id:'c2',name:'Vecchio',created_at:old},{id:'c3',name:'Già sentito',created_at:iso(NOW-1*DAY)}],
  interactions:[{contact_id:'c3',occurred_at:iso(NOW-DAY)}],
  tickets:[{id:'k1',title:'Lento',status:'open',priority:'normal',created_at:iso(NOW-9*DAY)},{id:'k2',title:'In attesa cliente',status:'pending',created_at:old},{id:'k3',title:'Chiuso',status:'closed',created_at:old}],
  leads:[{id:'l1',title:'Lead nuovo',contact_id:'c2',created_at:iso(NOW-4*DAY)},{id:'l2',title:'Lead lavorato',contact_id:'c3'},{id:'l3',title:'Senza riferimenti'}]};
 const r=H.suggestions(d,{now:NOW});
 assert.deepEqual(rules(r).sort(),['lead-new','new-contact','ticket-waiting']);
 const by=id=>r.items.find(x=>x.rule===id);
 assert.deepEqual(by('new-contact').action,{kind:'customer',subject:'contacts',id:'c1',name:'Anna'});
 assert.deepEqual(by('ticket-waiting').action,{kind:'view',hash:'#tickets'});assert.match(by('ticket-waiting').reason,/Aperto da 9 giorni/);
 assert.equal(by('lead-new').title,'Lead nuovo');assert.deepEqual(by('lead-new').action,{kind:'customer',subject:'contacts',id:'c2',name:'Vecchio'});
 // a new contact that is also a lead shows once, as the more urgent «Primo contatto»
 const twice=H.suggestions({contacts:[d.contacts[0]],leads:[{id:'l9',title:'Lead Anna',contact_id:'c1'}]},{now:NOW});
 assert.deepEqual(rules(twice),['new-contact']);
 // a lead with only a company opens the company
 assert.deepEqual(H.suggestions({companies:[{id:'a1',name:'Neri'}],leads:[{id:'l8',title:'L',company_id:'a1'}]},{now:NOW}).items[0].action,{kind:'customer',subject:'companies',id:'a1',name:'Neri'});
 // tickets can also come from sales.js rows
 assert.equal(H.suggestions({},{now:NOW,tickets:d.tickets}).items.length,1);
});

test('order: urgency first, then value; at most 6 and 3 per rule',()=>{
 const opps=[1,2,3,4].map(i=>({id:'o'+i,title:'Deal '+i,amount_cents:i*1000,outcome:'open',expected_close:ymd(NOW-DAY),created_at:iso(NOW-DAY)}));
 const d={opportunities:opps,tasks:[{id:'t1',title:'Oggi',assignee_id:7,status:'todo',due_at:iso(NOW+60e3),opportunity_id:'o4'}],
  tickets:[{id:'k1',title:'Urgente',status:'open',priority:'urgent',created_at:iso(NOW-DAY)},{id:'k2',title:'Normale',status:'open',priority:'normal',created_at:iso(NOW-DAY)}],
  contacts:[{id:'c1',name:'Nuovo',created_at:iso(NOW-DAY)}]};
 const r=H.suggestions(d,{now:NOW,me:7});
 assert.equal(r.items.length,6);assert.equal(r.total,7);
 assert.deepEqual(r.items.map(x=>x.title),['Deal 4','Deal 3','Deal 2','Oggi','Urgente','Normale']);
 for(let i=1;i<r.items.length;i++)assert.ok(r.items[i-1].urgency>=r.items[i].urgency);
});

test('wiring: core after automations, css at the end of the styles, view uses the core without writes',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8');
 const at=s=>{const i=html.indexOf(s);assert.ok(i>0,s+' missing');return i};
 assert.ok(at('src="sales/crm-automations-core.js"')<at('src="sales/crm-home-core.js"'));
 assert.ok(at('href="sales/crm-record.css"')<at('href="sales/crm-home.css"'));
 assert.ok(at('href="sales/crm-home.css"')<at('<script'),'stylesheet in the head before the scripts');
 assert.equal(html.match(/crm-home-core\.js/g).length,1);assert.equal(html.match(/crm-home\.css/g).length,1);
 const v=fs.readFileSync(__dirname+'/../sales/dashboard-view.js','utf8');
 assert.match(v,/Suggerimenti per oggi/);assert.match(v,/regole fisse, non AI/);assert.match(v,/Tutto in ordine/);
 const block=v.slice(v.indexOf('function assistant'),v.indexOf('let busy=false'));
 assert.doesNotMatch(block,/\.api\(|mutate|fetch\(/,'the block never writes');
 const css=fs.readFileSync(__dirname+'/../sales/crm-home.css','utf8');
 assert.equal((css.match(/:root\{/g)||[]).length,1);
 for(const m of css.matchAll(/var\(--crm-[a-z0-9-]+(,?)/g))assert.equal(m[1],',','every --crm-* token has a light fallback');
 assert.doesNotMatch(css.replace(/:root\{[^}]*\}/,''),/#[0-9a-f]{3,8}\b/i,'colours only in the :root block');
});
