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
 // Every interaction its own column: 120 stay 120; only an absurd count is cut, at MAX_MANY (500).
 assert.equal(S.MAX_MANY,500);
 const acts=n=>({acts:Array.from({length:n},()=>({}))});
 assert.equal(S.expand(['acts'],[acts(120)]).filter(c=>c.base.id==='acts').length,120);
 assert.equal(S.expand(['acts'],[acts(800)]).filter(c=>c.base.many&&c.base.id==='acts').length,S.MAX_MANY);
 assert.deepEqual(S.toggleColumn(d.columns,'name'),d.columns,'fixed stays');
 assert.ok(S.toggleColumn(d.columns,'city').includes('city'));
});

test('group header: Chi over the frozen block, then Contatto, Azienda, Da fare, Attività, each once',()=>{
 const CALL={id:'__call',call:true};
 const nav=cols=>{const out=[];for(const c of cols){out.push(c);if(c.id==='phone')out.push(CALL)}return out};
 const labels=g=>g.map(x=>x.label).filter(Boolean);
 // Groups are contiguous in COLUMNS, so a label can never come back after another group.
 const order=S.COLUMNS.map(c=>c.group).filter((g,i,a)=>g!==a[i-1]);
 assert.deepEqual(order,['who','contact','company','todo','activity']);
 assert.deepEqual(Object.keys(S.GROUPS),order);
 assert.ok(S.COLUMNS.filter(c=>c.freeze).every(c=>c.group==='who')&&S.COLUMNS.filter(c=>c.group==='who').every(c=>c.freeze));
 const def=S.headerGroups(nav(S.expand(S.defaults().columns,rows())));
 assert.deepEqual(labels(def),['Chi','Contatto','Azienda','Da fare','Attività']);
 // Frozen: one cell per column (name, phone, call, company), label on the first only.
 assert.deepEqual(def.filter(g=>g.frozen).map(g=>[g.col,g.label]),[['name','Chi'],['phone',''],['call',''],['company','']]);
 assert.deepEqual(def.filter(g=>!g.frozen).map(g=>[g.group,g.span]),[['contact',3],['company',3],['todo',4],['activity',3]]);
 // Every drawn column under exactly one group cell.
 const drawn=nav(S.expand(S.defaults().columns,rows()));assert.equal(def.reduce((n,g)=>n+g.span,0),drawn.length);
 // Every column the chooser can add: still each label once, «Fase trattativa» stays with Azienda.
 const all=S.headerGroups(nav(S.expand(S.COLUMNS.map(c=>c.id),rows())));
 assert.deepEqual(labels(all),['Chi','Contatto','Azienda','Da fare','Attività']);
 assert.deepEqual(all.filter(g=>!g.frozen).map(g=>[g.group,g.span]),[['contact',4],['company',7],['todo',4],['activity',3]]);
 // Without migration 011 fields and with only some columns chosen.
 assert.deepEqual(labels(S.headerGroups(nav(S.expand(['name','phone','company','email','acts'],rows(),{added:false})))),['Chi','Contatto','Attività']);
 assert.deepEqual(S.headerGroups([]),[]);
});

test('no field twice: column ids, labels and row keys are unique in the default set and with every column',()=>{
 for(const ids of [S.defaults().columns,S.COLUMNS.map(c=>c.id)]){
  const x=S.expand(ids,rows());
  assert.equal(new Set(x.map(c=>c.id)).size,x.length);
  assert.equal(new Set(x.map(c=>c.label.toLocaleLowerCase('it'))).size,x.length,'no two headers with the same name');
  // Each plain column reads its own row value: no two columns show the same field.
  const keys=x.filter(c=>!c.base.many).map(c=>c.id);assert.equal(new Set(keys).size,keys.length);
 }
 // Edits target different fields: no two columns write the same record field.
 const edits=S.COLUMNS.filter(c=>c.edit).map(c=>c.edit.join('.'));assert.equal(new Set(edits).size,edits.length);
 // The three phone columns are three different numbers (contact, mobile, company).
 assert.deepEqual(S.COLUMNS.filter(c=>c.tel).map(c=>c.edit.join('.')),['contacts.phone','contacts.mobile','companies.phone']);
 const r=byId('k1');assert.deepEqual([r.phone,r.mobile,r.companyPhone],['347 1112223','340 1','030 1234567']);
 // The company name only in the frozen «Azienda».
 assert.deepEqual(S.COLUMNS.filter(c=>/azienda/i.test(c.label)).map(c=>c.id),['company','companyPhone']);
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
 assert.match(css,/thead th\{position:sticky/);assert.match(css,/\.cs-fz\{position:sticky/);assert.match(css,/@media\(max-width:700px\)/);
});

/* The sheet uses the CRM light tokens of crm-light.css as the rest of the CRM: no colours of its own,
   every rule scoped to the sheet, its list box in sheet mode or the call dialog, text readable. */
const sheetCss=()=>fs.readFileSync(__dirname+'/../sales/crm-sheet.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
function lightTokens(){
 const css=fs.readFileSync(__dirname+'/../sales/crm-light.css','utf8'),root=/:root\{([^}]*)\}/.exec(css);assert.ok(root,'crm-light.css :root');
 return Object.fromEntries([...root[1].matchAll(/--([a-z0-9-]+):(#[0-9a-f]{3,8})\b/gi)].map(m=>{let h=m[2];if(h.length===4)h='#'+[...h.slice(1)].map(x=>x+x).join('');return [m[1],h]}));
}
test('style: CRM light tokens only, no colours or tokens of its own, every rule scoped',()=>{
 const css=sheetCss();
 assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css.replace(/#contacts\b/g,'')),'only --crm-* tokens, no hex colours');
 assert.ok(!/rgba?\(|hsla?\(/.test(css),'no literal colours');
 assert.ok(!/--crm-[a-z0-9-]+\s*:/.test(css),'the CRM tokens are not redefined here');
 assert.ok(!/color-scheme/.test(css),'no dark scheme');
 assert.ok(!/:root|(^|\})\s*(html|body)\s*\{/.test(css),'nothing global');
 for(const m of css.matchAll(/(^|[{}])([^{}@]+)\{/g)){const sel=m[2].trim();if(!sel)continue;
  for(const s of sel.split(','))assert.match(s.trim(),/^(\.cs|html\[data-lv-contacts="sheet"\])/,s)}
 const used=new Set([...css.matchAll(/var\(--(crm-[a-z0-9-]+)/g)].map(m=>m[1])),t=lightTokens();
 for(const k of used)if(k!=='crm-font'&&k!=='crm-shadow')assert.ok(t[k],k+' defined in crm-light.css');
 assert.match(css,/scroll-margin-top:16px/,'gap from the page header when scrolled into view');
 assert.match(css,/scroll-margin-top:84px/,'below the sticky CRM menu up to 900px');
 assert.match(css,/\.cs-glabel\{position:sticky;left:calc\(var\(--cs-fzw\)/,'group label sticks right of the frozen block');
 assert.match(css,/\.cs-fz-company\{[^}]*border-right:2px solid var\(--crm-accent-line\)/,'clear edge of the frozen columns');
 assert.match(css,/\.cs-late-badge\{[^}]*color:var\(--crm-err\)/,'«Scaduta» in the CRM red');
});
test('style: text contrast at least 4.5:1 on every background it is drawn on',()=>{
 const t=lightTokens();
 const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
 const ratio=(a,b)=>{const x=lum(t[a]),y=lum(t[b]);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 const pairs={
  'crm-text':['crm-card','crm-head','crm-hover','crm-accent-soft','crm-err-soft','crm-ok-soft'],
  'crm-muted':['crm-card','crm-head','crm-hover','crm-soft'],
  'crm-subtle':['crm-card','crm-head','crm-hover'],
  'crm-accent':['crm-card','crm-head','crm-hover','crm-accent-soft'],
  'crm-link':['crm-card','crm-hover','crm-accent-soft'],
  'crm-info':['crm-card','crm-hover'],
  'crm-ok':['crm-ok-soft'],'crm-warn':['crm-warn-soft'],'crm-err':['crm-err-soft','crm-card','crm-hover'],
  'crm-on-accent':['crm-accent']};
 for(const [fg,bgs] of Object.entries(pairs))for(const bg of bgs)assert.ok(ratio(fg,bg)>=4.5,fg+' on '+bg+': '+ratio(fg,bg).toFixed(2));
});

/* ---------- Full notes and every activity (Francesco: «tutte le attività», «vedere tutto») ---------- */
const LONG='Esito: Risposto\r\nPrimo paragrafo: vuole il listino 2027.   \r\nSeconda riga dello stesso paragrafo.\r\n\r\n\r\n\r\nSecondo paragrafo con '+'molti dettagli '.repeat(12)+'fine.\n\nTerzo: richiamare la segretaria.\n';
test('full note: everything after «Esito:», line breaks kept, paragraphs split on empty lines',()=>{
 const t=S.fullNote(LONG);
 assert.ok(!t.includes('Esito:')&&!t.includes('\r'));
 assert.ok(t.startsWith('Primo paragrafo: vuole il listino 2027.\nSeconda riga'),'trailing spaces dropped, single break kept');
 assert.ok(!/\n{3,}/.test(t),'at most one empty line');assert.ok(t.endsWith('richiamare la segretaria.'));
 const p=S.paragraphs(t);assert.equal(p.length,3);assert.match(p[0],/\nSeconda riga/);assert.match(p[1],/fine\.$/);
 assert.deepEqual(S.paragraphs(''),[]);assert.equal(S.fullNote(null),'');assert.equal(S.fullNote('Esito: Risposto'),'');
 assert.equal(S.fullNote('Solo testo'),'Solo testo','no outcome line: nothing dropped');
 assert.ok(S.isLong(t)&&S.isLong('a\nb')&&!S.isLong('breve'));
});
test('activities carry the whole text, a preview, the long flag and the author; search reads the whole text',()=>{
 const d={...data,interactions:[...data.interactions,{id:'i9',contact_id:'k2',kind:'call',title:'Chiamata lunga',occurred_at:iso(NOW-3*DAY),body:LONG,created_by:7}]};
 const r=S.buildRows(d,{now:NOW}).find(x=>x.id==='k2');const a=r.acts[0];
 assert.equal(a.id,'i9');assert.equal(a.text,S.fullNote(LONG));assert.equal(a.long,true);assert.equal(a.author,7);
 assert.ok(a.preview.length<=S.PREVIEW&&a.preview.endsWith('…')&&!a.preview.includes('\n'));
 assert.ok(a.note.length<=80,'CSV and tooltip keep the short note');
 assert.ok(S.matches(r,'segretaria'),'a word past the preview is found');
 assert.equal(byId('k1').acts[0].long,false,'«Segreteria» fits in the cell');
 assert.equal(byId('k1').todos.find(t=>t.id==='i3').text,'','planned interaction without body');
});
test('detail panel: date, type, outcome, paragraphs, author, position; to-do with state and assignee',()=>{
 const d={...data,interactions:[...data.interactions,{id:'i9',contact_id:'k1',company_id:'a',kind:'call',title:'Chiamata con Giulia · Risposto',occurred_at:iso(NOW-1*DAY),body:LONG,created_by:7}]};
 const r=S.buildRows(d,{now:NOW}).find(x=>x.id==='k1'),members=[{id:7,name:'Francesco Demo',email:'f@esempio.it'}];
 const x=S.detail(r,r.acts[0],{members});
 assert.equal(x.kind,'act');assert.equal(x.heading,'Chiamata · Risposto');assert.deepEqual(x.outcome,{key:'answered',label:'Risposto'});
 assert.equal(x.when,S.longDate(Date.parse(iso(NOW-1*DAY))));assert.match(x.when,/^(domenica|lunedì|martedì|mercoledì|giovedì|venerdì|sabato) \d\d\/\d\d\/\d{4}, \d\d:\d\d$/);
 assert.equal(x.paragraphs.length,3);assert.deepEqual(x.facts,[['Registrata da','Francesco Demo']]);
 assert.equal(x.position,'Attività 1 di '+r.acts.length);assert.equal(x.contact,'Giulia Rossi · Alfa Srl');assert.equal(x.late,false);
 assert.deepEqual(S.detail(r,r.acts[1],{members:[]}).facts,[],'author unknown: not shown');
 assert.deepEqual(S.detail(r,r.acts[1],{}).paragraphs,['Segreteria']);
 const late=r.todos.find(t=>t.id==='t2'),y=S.detail(r,late,{members:[{id:3,name:'Luca'}]});
 assert.equal(y.kind,'todo');assert.equal(y.late,true);assert.equal(y.heading,'Attività da fare');assert.match(y.when,/^Scadenza: /);
 const lateWith=S.detail(r,{...late,record:{...late.record,assignee_id:3,priority:'high'}},{members:[{id:3,name:'Luca'}]});
 assert.deepEqual(lateWith.facts,[['Stato','In corso'],['Priorità','Alta'],['Assegnata a','Luca']]);
 const undated=S.detail(r,r.todos.find(t=>t.id==='t4'),{});assert.equal(undated.when,'Senza scadenza');assert.equal(undated.position,'Da fare 4 di 4');
 const planned=S.detail(r,r.todos.find(t=>t.id==='i3'),{});assert.equal(planned.heading,'Riunione');assert.deepEqual(planned.facts,[['In calendario','interazione futura']]);
 assert.equal(S.detail(r,null),null);
});
test('pages read when the sheet opens: interactions first, progress line, cap said',()=>{
 assert.deepEqual(S.toLoad({companies:true,interactions:true,contacts:true,opportunities:false}),['interactions','companies']);
 assert.deepEqual(S.toLoad({}),[]);assert.deepEqual(S.toLoad(undefined),[]);
 assert.equal(S.PAGE_CAP,30);
 assert.equal(S.progressText({entity:'interactions',pages:0}),'Carico tutte le attività: interazioni, 0 pagine lette…');
 assert.equal(S.progressText({entity:'tasks',pages:1}),'Carico tutte le attività: attività, 1 pagina letta…');
 assert.equal(S.progressText({done:true,pages:4,capped:[]}),'Tutte le attività caricate (4 pagine lette).');
 assert.equal(S.progressText({done:true,pages:0,capped:[]}),'');
 assert.match(S.progressText({done:true,pages:30,capped:['interactions']}),/^Lette 30 pagine di interazioni \(limite per volta\): ne restano altre, premi «Completa i dati»/);
 assert.match(S.progressText({failed:'Rete assente.'}),/interrotto: Rete assente\. Premi «Completa i dati»/);
 // The view reads through the same requests as «Carica altri 100» and starts by itself.
 const ui=fs.readFileSync(__dirname+'/../sales/crm-sheet.js','utf8');
 assert.match(ui,/function autoLoad\(/);assert.match(ui,/autoLoad\(host,ctx\);/);assert.match(ui,/guard<C\(\)\.PAGE_CAP/);
 assert.match(ui,/a\.api\(e,\{offset:off/);assert.ok(!/action:'(create|update|delete)'[^\n]*autoLoad/.test(ui));
 assert.match(ui,/function noteDialog\(/);assert.match(ui,/aria-haspopup','dialog'/);
});

test('every interaction of a contact, as /api/sales returns them, fills its own column and is counted by the name',()=>{
 // Shape of GET /api/sales?entity=interactions (t.*): ISO dates with milliseconds, created_by null or a user, company set too.
 const at=d=>new Date(NOW-d*DAY).toISOString();
 const inter=[1,5,9,13,17].map((d,n)=>({workspace_id:'w',id:'x'+n,title:'Interazione '+(n+1),kind:['call','email','meeting','call','note'][n],occurred_at:at(d),body:'Esito: Risposto\nNota '+(n+1),company_id:'a',contact_id:'k1',opportunity_id:null,version:1,created_by:n%2?null:1}));
 const rows=S.buildRows({contacts:[{id:'k1',name:'Giulia',company_id:'a'},{id:'k2',name:'Marco',company_id:'a'}],companies:[{id:'a',name:'Alfa'}],interactions:inter},{now:NOW});
 assert.equal(rows[0].acts.length,5);assert.deepEqual(rows[0].acts.map(a=>a.id),['x0','x1','x2','x3','x4']);assert.equal(rows[1].acts.length,0);
 const drawn=S.expand(S.defaults().columns,rows).filter(c=>c.base.id==='acts').map(c=>c.label);
 assert.deepEqual(drawn,['Attività 1','Attività 2','Attività 3','Attività 4','Attività 5']);
 assert.equal(S.countLabel(5),'5 attività');assert.equal(S.countLabel(1),'1 attività');assert.equal(S.countLabel(0),'');
});

test('activity columns cut off on the right are named in the hint (a 1920 px screen showed only part of «Attività 1»)',()=>{
 // Grid geometry measured at 1920 px with the default columns: «Attività 1» starts at 1640, each 220 wide, grid in view up to 1700.
 const cols=[{id:'todos:1',left:1480,right:1640},...[1,2,3,4,5].map(i=>({id:'acts:'+i,left:1420+220*i,right:1640+220*i}))];
 let h=S.hiddenRight(cols,{left:300,right:1700});
 assert.equal(h.count,5);assert.equal(h.first,'acts:1');assert.equal(h.text,'5 attività a destra (Attività 1–5) ›');
 // After «›»: «Attività 1» starts right of the frozen columns, 1 and 2 wholly in view.
 h=S.hiddenRight(cols,{left:1640,right:2120});assert.equal(h.count,3);assert.equal(h.first,'acts:3');assert.equal(h.text,'Altre 3 attività a destra (Attività 3–5) ›');
 h=S.hiddenRight(cols,{left:2300,right:2730});assert.equal(h.text,'Un’altra attività a destra (Attività 5) ›');
 h=S.hiddenRight(cols,{left:1640,right:2800});assert.equal(h.count,0);assert.equal(h.text,'');assert.equal(h.first,null);
 assert.equal(S.hiddenRight([],{left:0,right:10}).count,0);
});

test('the sheet shows the hint, the count and visible scrollbars; on a phone a whole activity column fits',()=>{
 const ui=fs.readFileSync(__dirname+'/../sales/crm-sheet.js','utf8'),css=fs.readFileSync(__dirname+'/../sales/crm-sheet.css','utf8');
 assert.match(ui,/C\(\)\.hiddenRight\(cols,/);assert.match(ui,/hint\(host\);\n autoLoad\(host,ctx\);/);assert.match(ui,/addEventListener\('scroll',\(\)=>hint\(host\)/);
 assert.match(ui,/C\(\)\.countLabel\(r\.acts\.length\)/);
 assert.match(css,/\.cs-scroll::-webkit-scrollbar\{width:12px;height:12px\}/);assert.ok(!/\.cs-scroll\{[^}]*scrollbar-(width|color)/.test(css),'standard scrollbar-* would turn the WebKit ones off in Chrome');
 const phone=css.slice(css.indexOf('@media(max-width:700px)'));
 assert.match(phone,/--cs-fzw:calc\(var\(--cs-name\) \+ var\(--cs-call\)\)/);assert.match(phone,/\.cs-table \.cs-fz-call\{left:var\(--cs-name\);/);
 // 390 px: grid 352 px wide, frozen name + ☎ = 152 px; an activity column is at most 100vw - 196px, so one fits whole.
 assert.ok(352-(116+36)>=Math.min(190,390-196));assert.match(phone,/max-width:min\(190px,calc\(100vw - 196px\)\)!important/);
});
