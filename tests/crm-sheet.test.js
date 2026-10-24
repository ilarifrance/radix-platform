'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const S=require('../sales/crm-sheet-core.js');
const CSV=require('../sales/crm-csv-core.js');
const L=require('../sales/crm-list-core.js');
const {fields}=require('../api/_sales.js');
const DAY=864e5,NOW=Date.parse('2026-10-24T10:00:00Z'),iso=n=>new Date(n).toISOString().slice(0,19)+'Z';

const data={
 companies:[
  {id:'a',version:3,name:'Alfa Srl',industry:'Automotive e meccanica',city:'Brescia',billing_country:'Italia',employees:120,annual_revenue_cents:185000000,phone:'030 1234567'},
  {id:'b',version:1,name:'Beta',industry:null,city:null,billing_city:'Verona',billing_country:null}],
 contacts:[
  {id:'k1',version:2,name:'Giulia Rossi',company_id:'a',role:'Titolare / CEO',title:'CEO',phone:'347 1112223',mobile:'340 1',email:'g@alfa.it',country:'Svizzera'},
  {id:'k2',version:1,name:'Marco Bianchi',company_id:'b',phone:null,country:'Austria'},
  {id:'k3',version:1,name:'Senza Azienda',company_id:null,country:'Francia'},
  {id:'k4',version:1,name:'Azienda non caricata',company_id:'zz'}],
 interactions:[
  {id:'i1',contact_id:'k1',company_id:'a',kind:'call',title:'Chiamata con Giulia · Non risponde',occurred_at:iso(NOW-2*DAY),body:'Esito: Non risponde\nSegreteria'},
  {id:'i2',contact_id:'k1',kind:'email',title:'Offerta inviata',occurred_at:iso(NOW-10*DAY),body:'Testo lungo '.repeat(20)},
  {id:'i3',contact_id:'k1',kind:'meeting',title:'Riunione in sede',occurred_at:iso(NOW+3*DAY),body:''},
  {id:'i4',contact_id:'k1',kind:'call',title:'Vecchia',occurred_at:iso(NOW-30*DAY),body:'Esito: Appuntamento'},
  {id:'i5',contact_id:'k2',kind:'note',title:'Nota',occurred_at:'non è una data'},
  {id:'i6',contact_id:null,company_id:'a',kind:'call',occurred_at:iso(NOW-1*DAY)}],
 tasks:[
  {id:'t1',contact_id:'k1',title:'Inviare listino',status:'todo',due_at:iso(NOW+1*DAY)},
  {id:'t2',contact_id:'k1',title:'Richiamare',status:'doing',due_at:iso(NOW-1*DAY)},
  {id:'t3',contact_id:'k1',title:'Fatta',status:'done',due_at:iso(NOW+2*DAY)},
  {id:'t4',contact_id:'k1',title:'Senza data',status:'todo',due_at:null},
  {id:'t5',contact_id:'k2',title:'Altro',status:'todo',due_at:iso(NOW+5*DAY)}],
 opportunities:[
  {id:'o1',company_id:'a',contact_id:'k1',stage_id:'s1',outcome:'open',amount_cents:100,title:'Piccola'},
  {id:'o2',company_id:'a',contact_id:null,stage_id:'s3',outcome:'open',amount_cents:50,title:'Aziendale'},
  {id:'o3',company_id:'a',contact_id:'k1',stage_id:'s3',outcome:'won',amount_cents:999,title:'Vinta'},
  {id:'o4',company_id:'a',contact_id:'kX',stage_id:'s3',outcome:'open',title:'Di un altro'}],
 stages:[{id:'s1',title:'Qualifica',position:0},{id:'s3',title:'Negoziazione',position:2}]
};
const rows=()=>S.buildRows(data,{now:NOW});
const byId=id=>rows().find(r=>r.id===id);

test('row join: contact fields, company fields, country from the company else the contact',()=>{
 const r=byId('k1');
 assert.equal(r.company,'Alfa Srl');assert.equal(r.industry,'Automotive e meccanica');assert.equal(r.city,'Brescia');
 assert.equal(r.employees,120);assert.equal(r.revenue,185000000);assert.equal(r.companyPhone,'030 1234567');
 assert.equal(r.country,'Italia');assert.equal(r.countryFrom,'company');
 const b=byId('k2');assert.equal(b.city,'Verona','billing city as fallback');assert.equal(b.country,'Austria');assert.equal(b.countryFrom,'contact');
 assert.equal(byId('k3').company,'');assert.equal(byId('k3').country,'Francia');
 assert.equal(byId('k4').companyMissing,true,'company not loaded is told apart from no company');
 assert.equal(rows().length,4);
});

test('activities: every past interaction of the contact, newest first; future and invalid dates out',()=>{
 const r=byId('k1');
 assert.deepEqual(r.acts.map(a=>a.id),['i1','i2','i4']);
 assert.equal(r.acts[0].outcome,'no_answer');assert.equal(r.acts[0].note,'Segreteria');
 assert.equal(r.acts[2].outcome,'appointment');
 assert.ok(r.acts[1].note.length<=80&&r.acts[1].note.endsWith('…'),'note cut');
 assert.equal(r.last.id,'i1');assert.equal(S.lastInteraction(data.interactions,'k1',NOW).id,'i1');
 assert.deepEqual(byId('k2').acts,[],'invalid date ignored');
 assert.equal(S.lastInteraction(data.interactions,'k3',NOW),null);
});

test('to-do: open tasks and planned interactions, overdue first, undated last, done out',()=>{
 const r=byId('k1');
 assert.deepEqual(r.todos.map(t=>t.id),['t2','t1','i3','t4']);
 assert.equal(r.todos[0].overdue,true);assert.equal(r.overdue,true);
 assert.equal(r.todos[2].source,'interaction');
 assert.equal(S.nextActivity(data.tasks,data.interactions,'k1',NOW).id,'t2');
 assert.equal(S.nextActivity([],[],'k1',NOW),null);
});

test('most advanced open deal: own and company deals without contact; won and others excluded',()=>{
 const d=byId('k1').deal;assert.equal(d.id,'o2');assert.equal(d.stage,'Negoziazione');assert.equal(d.count,2);
 assert.equal(byId('k2').deal,null);
 assert.equal(S.topDeal([{id:'x',contact_id:'k1',stage_id:'nope',outcome:null}],[],{id:'k1'}).stage,'','stage not loaded');
});

test('outcome mapping: the «Esito:» first line, accents and case ignored',()=>{
 assert.equal(S.outcomeOf('Esito: Risposto\nok'),'answered');
 assert.equal(S.outcomeOf('esito:  non INTERESSATO'),'not_interested');
 assert.equal(S.outcomeOf('Note\nEsito: Risposto'),null,'only the first line');
 assert.equal(S.outcomeOf(null),null);assert.equal(S.outcomeOf('Esito: boh'),null);
 for(const [k,l] of Object.entries(S.OUTCOMES))assert.equal(S.outcomeOf('Esito: '+l),k);
 assert.deepEqual(Object.values(S.OUTCOMES),['Risposto','Non risponde','Richiamare','Non interessato','Appuntamento']);
 assert.equal(S.shortNote('Esito: Risposto\nriga uno\nriga  due'),'riga uno riga due');
});

test('«Registra chiamata»: one interaction of kind call, a task only for Richiamare/Appuntamento with a date',()=>{
 const r=byId('k1'),follow=S.tomorrowAt9(NOW);
 const a=S.callPlan(r,{outcome:'answered',note:'  Interessato  ',follow},NOW,7);
 assert.equal(a.error,null);assert.equal(a.task,null,'no task for «Risposto»');
 assert.deepEqual(a.interaction,{title:'Chiamata con Giulia Rossi · Risposto',kind:'call',occurred_at:iso(NOW),body:'Esito: Risposto\nInteressato',contact_id:'k1',company_id:'a'});
 const b=S.callPlan(r,{outcome:'callback',note:'',follow},NOW,7);
 assert.equal(b.interaction.body,'Esito: Richiamare');
 assert.equal(b.task.title,'Richiamare Giulia Rossi');assert.equal(b.task.status,'todo');assert.equal(b.task.assignee_id,7);
 assert.equal(b.task.due_at,iso(S.localDateTime(follow)));assert.equal(b.task.contact_id,'k1');
 assert.equal(S.callPlan(r,{outcome:'callback',follow:''},NOW).task,null,'date left empty: no task');
 assert.equal(S.callPlan(r,{outcome:'appointment',follow},NOW,0).task.assignee_id,null);
 assert.match(S.callPlan(r,{outcome:'boh'},NOW).error,/esito/);
 assert.match(S.callPlan(r,{outcome:'callback',follow:'2020-01-01T09:00'},NOW).error,/futuro/);
 assert.match(S.callPlan(r,{outcome:'callback',follow:'2026-02-30T09:00'},NOW).error,/non valida/);
 assert.match(S.callPlan(r,{outcome:'answered',note:'x'.repeat(4000)},NOW).error,/4000/);
 assert.equal(S.callPlan(byId('k3'),{outcome:'no_answer'},NOW).interaction.company_id,null);
 // Only fields the API accepts for these entities.
 for(const k of Object.keys(b.interaction))assert.ok(fields.interactions.includes(k),k);
 for(const k of Object.keys(b.task))assert.ok(fields.tasks.includes(k),k);
 // The body is read back as the same outcome.
 assert.equal(S.outcomeOf(b.interaction.body),'callback');
});

test('inline edit: update body with version, checks of the edit form, unchanged values not sent',()=>{
 const r=byId('k1'),col=S.colOf;
 assert.deepEqual(S.editPlan(r,col('email'),' nuova@alfa.it '),{entity:'contacts',data:{id:'k1',version:2,email:'nuova@alfa.it'}});
 assert.match(S.editPlan(r,col('email'),'non-email').error,/email/i);
 assert.deepEqual(S.editPlan(r,col('phone'),'347 1112223'),{same:true});
 assert.match(S.editPlan(r,col('name'),'  ').error,/vuoto/);
 assert.deepEqual(S.editPlan(r,col('revenue'),'2.000.000'),{entity:'companies',data:{id:'a',version:3,annual_revenue_cents:200000000}});
 assert.match(S.editPlan(r,col('employees'),'tanti').error,/Dipendenti/);
 assert.match(S.editPlan(r,col('role'),'Inventato').error,/elenco/);
 assert.deepEqual(S.editPlan(r,col('industry'),''),{entity:'companies',data:{id:'a',version:3,industry:null}});
 assert.deepEqual(S.editPlan(r,col('country'),'Italia'),{same:true});
 assert.equal(S.editValue(r,col('revenue')),'1850000');
 // Country: company field when the company is loaded, else the contact's own.
 assert.deepEqual(S.editPlan(byId('k3'),col('country'),'Spagna'),{entity:'contacts',data:{id:'k3',version:1,country:'Spagna'}});
 assert.deepEqual(S.editPlan(byId('k2'),col('country'),'Austria'),{entity:'companies',data:{id:'b',version:1,billing_country:'Austria'}});
 assert.match(S.editPlan(byId('k4'),col('city'),'x').error,/non si modifica/,'company not loaded');
 assert.match(S.editPlan(r,col('company'),'x').error,/non si modifica/,'company name is not edited from here');
 assert.match(S.editPlan(r,col('acts'),'x').error,/non si modifica/);
 // Every edited key is a field the API accepts on update.
 for(const c of S.COLUMNS.filter(c=>c.edit))assert.ok(fields[c.edit[0]].includes(c.edit[1]),c.id);
 assert.ok(fields.contacts.includes('country'));
});

test('columns: few defaults, frozen first, one column per activity and per to-do',()=>{
 const d=S.defaults();
 assert.deepEqual(d.columns,['name','phone','company','role','mobile','email','industry','country','stage','todos','acts']);
 assert.deepEqual(S.COLUMNS.filter(c=>c.freeze).map(c=>c.id),['name','phone','company']);
 const x=S.expand(d.columns,rows());
 assert.deepEqual(x.filter(c=>c.base.id==='todos').map(c=>c.label),['Da fare 1','Da fare 2','Da fare 3','Da fare 4']);
 assert.deepEqual(x.filter(c=>c.base.id==='acts').map(c=>c.id),['acts:1','acts:2','acts:3']);
 assert.equal(S.expand(d.columns,[]).filter(c=>c.base.many).length,2,'at least one each');
 assert.ok(!S.expand(['name'],rows()).some(c=>c.base.many),'hidden when not chosen');
 assert.ok(!S.expand(d.columns,rows(),{added:false}).some(c=>['mobile','country'].includes(c.id)),'011 fields only with migration');
 const many={acts:Array.from({length:80},()=>({}))};assert.equal(S.expand(['acts'],[many]).filter(c=>c.base.many&&c.base.id==='acts').length,S.MAX_MANY);
 assert.deepEqual(S.toggleColumn(d.columns,'name'),d.columns,'fixed stays');
 assert.ok(S.toggleColumn(d.columns,'city').includes('city'));
});

test('filters, search and sort',()=>{
 const all=rows(),ids=a=>a.map(r=>r.id);
 assert.deepEqual(ids(S.apply(all,{filters:{outcome:'never'}},NOW)),['k4','k2','k3']);
 assert.deepEqual(ids(S.apply(all,{filters:{outcome:'no_answer'}},NOW)),['k1']);
 assert.deepEqual(ids(S.apply(all,{filters:{next:'overdue'}},NOW)),['k1']);
 assert.deepEqual(ids(S.apply(all,{filters:{next:'none'}},NOW)),['k4','k3']);
 assert.deepEqual(ids(S.apply(all,{filters:{next:'week'}},NOW)),['k1','k2']);
 assert.deepEqual(ids(S.apply(all,{query:'segreteria'},NOW)),['k1'],'search in activities');
 assert.deepEqual(ids(S.apply(all,{query:'VERONA'},NOW)),['k2']);
 assert.deepEqual(ids(S.apply(all,{sort:{key:'acts',dir:'desc'}},NOW)).slice(0,1),['k1'],'empty last');
 assert.deepEqual(S.nextSort({key:'name',dir:'asc'},'acts'),{key:'acts',dir:'desc'});
});

test('preferences: per workspace, unknown values dropped; the list keeps «sheet» for Contatti only',()=>{
 assert.equal(S.storageKey('w1'),'radix-crm-sheet:w1');
 const p=S.normalize({columns:['email','nope'],sort:{key:'__proto__'},filters:{outcome:'callback',next:'boh'}});
 assert.deepEqual(p.columns,['name','phone','company','email']);assert.deepEqual(p.sort,{key:'name',dir:'asc'});assert.deepEqual(p.filters,{outcome:'callback',next:''});
 assert.deepEqual(S.parse('{rotto'),S.defaults());
 assert.equal(L.normalize('contacts',{mode:'sheet'}).mode,'sheet');assert.equal(L.normalize('companies',{mode:'sheet'}).mode,'table');
});

test('keyboard moves and row merge',()=>{
 assert.deepEqual(S.move({r:0,c:0},'ArrowUp',5,4),{r:0,c:0});
 assert.deepEqual(S.move({r:0,c:0},'ArrowDown',5,4),{r:1,c:0});
 assert.deepEqual(S.move({r:2,c:3},'ArrowRight',5,4),{r:2,c:3});
 assert.deepEqual(S.move({r:2,c:3},'Home',5,4),{r:2,c:0});
 assert.deepEqual(S.move({r:2,c:1},'End',5,4,{ctrl:true}),{r:4,c:3});
 assert.deepEqual(S.move({r:1,c:1},'PageDown',30,4),{r:11,c:1});
 assert.equal(S.move({r:0,c:0},'Enter',5,4),null);assert.equal(S.move({r:0,c:0},'ArrowDown',0,4),null);
 const a=[{id:'x',v:1,keep:true},{id:'y',v:1}];
 assert.deepEqual(S.merge(a,{id:'x',v:2}),[{id:'x',v:2,keep:true},{id:'y',v:1}]);
 assert.deepEqual(S.merge(a,{id:'z'}).map(r=>r.id),['z','x','y'],'a new row goes first');
 assert.equal(a[0].v,1,'no mutation');
});

test('CSV of the grid as shown, through crm-csv-core (formula-safe, semicolons)',()=>{
 const r=rows(),drawn=S.expand(['name','phone','company','country','revenue','acts','todos'],r);
 const out=CSV.toCsv(S.apply(r,{filters:{outcome:'no_answer'}},NOW),S.csvColumns(drawn));
 const lines=out.replace(/^﻿/,'').split('\r\n');
 assert.equal(lines[0],'Nome;Telefono;Azienda;Paese;Fatturato (EUR);Da fare 1;Da fare 2;Da fare 3;Da fare 4;Attività 1;Attività 2;Attività 3');
 assert.equal(lines.length,2);
 const cells=CSV.parse(out.replace(/^﻿/,'')).rows?.[1]||lines[1].split(';');
 assert.ok(lines[1].startsWith('Giulia Rossi;347 1112223;Alfa Srl;Italia;1850000;'));
 assert.match(lines[1],/scaduta/);assert.match(lines[1],/Chiamata · Non risponde · Segreteria/);
 assert.ok(cells.length>=12);
 assert.equal(S.cellText({phone:'=1+1'},'phone'),'=1+1');assert.match(CSV.toCsv([{phone:'=1+1'}],[{label:'T',key:'phone'}]),/'=1\+1/,'formula guarded by the shared CSV');
});

test('page wiring: assets after the list core, writes only through RadixSalesApp.api, no sends, no AI',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8');
 const at=s=>{const i=html.indexOf(s);assert.ok(i>0,s+' missing');return i};
 assert.ok(at('href="sales/crm-list.css"')<at('href="sales/crm-sheet.css"')&&at('href="sales/crm-sheet.css"')<at('<script'));
 assert.ok(at('src="sales/crm-fields-core.js"')<at('src="sales/crm-sheet-core.js"'));
 assert.ok(at('src="sales/crm-list-core.js"')<at('src="sales/crm-sheet-core.js"')&&at('src="sales/crm-sheet-core.js"')<at('src="sales/crm-sheet.js"')&&at('src="sales/crm-sheet.js"')<at('src="sales/crm-list.js"'));
 const ui=fs.readFileSync(__dirname+'/../sales/crm-sheet.js','utf8');
 assert.ok(!/fetch\(/.test(ui),'no own requests');assert.ok(!/send-email|api\/chat|Copilot|confirm:true/.test(ui),'no email, no AI');
 assert.match(ui,/a\.api\(entity,\{body:\{workspace:ws,entity,action,data:body\}\}\)/);
 assert.match(ui,/try\{raw=localStorage\.getItem/);assert.match(ui,/try\{localStorage\.setItem/);
 assert.match(ui,/RadixCrmCsv/);
 const list=fs.readFileSync(__dirname+'/../sales/crm-list.js','utf8');assert.match(list,/B\('Foglio chiamate'/);
 assert.match(fs.readFileSync(__dirname+'/../sales/sales.js','utf8'),/render:\(\)=>\{if\(!state\.busy\)render\(\);\}/);
 const css=fs.readFileSync(__dirname+'/../sales/crm-sheet.css','utf8');
 assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/#contacts\b/g,'')),'only --crm-* tokens');
 assert.match(css,/thead th\{position:sticky/);assert.match(css,/\.cs-fz\{position:sticky/);assert.match(css,/@media\(max-width:700px\)/);
});
