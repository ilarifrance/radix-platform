'use strict';
// CSV import of opportunities (trattative) and tasks (attività): mapping, parsing and the preview plan.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const csv=require('../sales/crm-csv-core.js');
const I=require('../sales/crm-import-deals-core.js');
const {command}=require('../api/_sales');
const W='11111111-1111-4111-8111-111111111111';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ctx={
 companies:[{id:id(1),name:'Acme S.r.l.'},{id:id(2),name:'Beta Spa'},{id:id(3),name:'Gemelli'},{id:id(4),name:'Gemelli'}],
 contacts:[{id:id(11),name:'Anna Rossi',email:'anna@acme.it',company_id:id(1)},{id:id(12),name:'Bruno Neri',email:'bruno@beta.it',company_id:id(2)},{id:id(13),name:'Carla Bo',email:null,company_id:null}],
 opportunities:[{id:id(21),title:'Rinnovo 2026',company_id:id(1),contact_id:id(11)},{id:id(22),title:'Sito nuovo',company_id:null,contact_id:null}],
 processes:[{id:id(31),title:'Vendita',kind:'opportunity'},{id:id(32),title:'Onboarding',kind:'task'},{id:id(33),title:'Partner',kind:'opportunity'}],
 stages:[{id:id(42),process_id:id(31),title:'Proposta inviata',position:2},{id:id(41),process_id:id(31),title:'Qualificazione',position:1},{id:id(43),process_id:id(31),title:'Negoziazione',position:3},{id:id(44),process_id:id(33),title:'Accordo quadro',position:1}],
 members:[{id:7,name:'Giulia Verdi',role:'member'}],
 tasks:[{id:id(51),title:'Chiamare Anna',contact_id:id(11),company_id:id(1),opportunity_id:null,due_at:'2026-11-03T08:00:00.000Z'}]
};
const plan=(kind,text,c=ctx)=>I.plan(kind,csv.parse(text),c);

test('amounts in Italian and English formats, with € and thousands separators, become cents',()=>{
 const cases={'1.234,56':123456,'€ 1.234,56':123456,'1.234,56 €':123456,'1,234.56':123456,'$x':NaN,'1234':123400,'1.500':150000,'1,500':150000,'12,5':1250,'12.50':1250,'1.250.000':125000000,'1 250 000,00':125000000,'1500 EUR':150000,'EUR 99':9900,'0':0,'-10':NaN,'dieci':NaN,'1,2,3':NaN,'':null};
 for(const [v,c] of Object.entries(cases))assert.deepEqual(I.amountCents(v),c,v);
 assert.ok(Number.isNaN(I.amountCents('90.000.000.001,00')),'above the database limit');
});
test('dates: dd/mm/yyyy and yyyy-mm-dd; a due date without time is 09:00 local, with seconds and Z',()=>{
 assert.equal(I.calendarDay('31/12/2026'),'2026-12-31');assert.equal(I.calendarDay('1.2.2027'),'2027-02-01');assert.equal(I.calendarDay('2026-12-31'),'2026-12-31');
 assert.equal(I.calendarDay('31/02/2026'),null);assert.equal(I.calendarDay('domani'),null);assert.equal(I.calendarDay('12/31/2026'),null,'month 31 does not exist: no US guess');
 assert.equal(I.dueAt('05/11/2026'),new Date(2026,10,5,9,0,0).toISOString());
 assert.equal(I.dueAt('2026-11-05 15:30'),new Date(2026,10,5,15,30,0).toISOString());
 assert.equal(I.dueAt('2026-11-05T15:30:00Z'),'2026-11-05T15:30:00.000Z');
 assert.equal(I.dueAt('05/11/2026 25:00'),null);assert.equal(I.dueAt(''),null);
 for(const v of ['05/11/2026','2026-11-05 15:30'])assert.match(I.dueAt(v),/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
 assert.equal(I.percent('40%'),40);assert.equal(I.percent('40,6 %'),41);assert.ok(Number.isNaN(I.percent('140')));assert.equal(I.percent(''),null);
});
test('headers in Italian and English (Salesforce export) are recognised, each column used once',()=>{
 assert.deepEqual(I.columns('opportunities',['Opportunity Name','Account Name','Amount','Stage','Close Date','Probability (%)','Opportunity Owner','Description']),
  {title:'Opportunity Name',amount:'Amount',stage:'Stage',expected_close:'Close Date',probability:'Probability (%)',company:'Account Name',owner:'Opportunity Owner',notes:'Description'});
 assert.deepEqual(I.columns('opportunities',['Trattativa','Importo (€)','Fase','Chiusura prevista','Azienda','Contatto','Email contatto','Note']),
  {title:'Trattativa',amount:'Importo (€)',stage:'Fase',expected_close:'Chiusura prevista',company:'Azienda',contact:'Contatto',contact_email:'Email contatto',notes:'Note'});
 assert.deepEqual(I.columns('tasks',['Subject','Due Date','Status','Priority','Assigned To','Name']),{title:'Subject',due:'Due Date',status:'Status',priority:'Priority',assignee:'Assigned To'});
 assert.deepEqual(I.columns('tasks',['Attività','Scadenza','Stato','Priorità','Trattativa','Azienda','Contatto']),{title:'Attività',due:'Scadenza',status:'Stato',priority:'Priorità',opportunity:'Trattativa',company:'Azienda',contact:'Contatto'});
});
test('opportunities: stage by name (case and accents ignored), unknown stage → first stage, reported',()=>{
 const p=plan('opportunities','Trattativa;Importo;Fase;Chiusura prevista;Azienda;Note\nNuovo CRM;€ 12.500,00;PROPOSTA INVIATA;31/12/2026;acme s.r.l.;Budget approvato\nLicenze;1,500.00;Firmata;2026-11-30;Beta Spa;\nQuadro;1000;accordo quadro;;;\n');
 assert.equal(p.counts.create,3);
 const [a,b,c]=p.rows;
 assert.deepEqual(a.data,{title:'Nuovo CRM',process_id:id(31),stage_id:id(42),amount_cents:1250000,expected_close:'2026-12-31',company_id:id(1)});
 assert.equal(a.note,'Budget approvato');assert.deepEqual(a.problems,[]);
 assert.equal(b.data.stage_id,id(41),'first stage by position, not by order of the rows');assert.equal(b.data.amount_cents,150000);
 assert.match(b.problems[0],/fase «Firmata» non trovata: Qualificazione/);
 assert.deepEqual([c.data.process_id,c.data.stage_id],[id(33),id(44)],'a stage only in another pipeline picks that pipeline');
 assert.equal(c.view.stage,'Partner / Accordo quadro');
 // Every payload passes the API validation of a create.
 for(const r of p.rows)assert.doesNotThrow(()=>command({workspace:W,entity:'opportunities',action:'create',data:r.data}),r.data.title);
});
test('opportunities: company and contact only when they exist, kept coherent with each other',()=>{
 const p=plan('opportunities','Trattativa,Azienda,Contatto,Email contatto\nA,Acme S.r.l.,Anna Rossi,\nB,Nuova Srl,,\nC,,,bruno@beta.it\nD,Beta Spa,Anna Rossi,\nE,Gemelli,,\nF,,Carla Bo,\nG,,Mario Ignoto,\nH,,BRUNO@beta.it,\n');
 const by=t=>p.rows.find(r=>r.data.title===t);
 assert.deepEqual([by('A').data.company_id,by('A').data.contact_id],[id(1),id(11)]);
 assert.equal(by('B').status,'create');assert.equal(by('B').data.company_id,undefined);assert.match(by('B').problems[0],/Azienda «Nuova Srl» non trovata nel CRM: senza azienda/);
 assert.deepEqual([by('C').data.company_id,by('C').data.contact_id],[id(2),id(12)],'the contact brings its own company (database rule)');assert.equal(by('C').view.company,'Beta Spa');
 assert.equal(by('D').data.contact_id,undefined);assert.equal(by('D').data.company_id,id(2));assert.match(by('D').problems[0],/non è di «Beta Spa»/);
 assert.equal(by('E').data.company_id,undefined);assert.match(by('E').problems[0],/più record/);
 assert.deepEqual([by('F').data.company_id,by('F').data.contact_id],[undefined,id(13)],'a contact without company: no company');
 assert.match(by('G').problems[0],/Contatto «Mario Ignoto» non trovato/);
 assert.deepEqual([by('H').data.contact_id,by('H').data.company_id],[id(12),id(2)],'an email in the Contatto column');
 assert.equal(p.counts.create,8,'unmatched links are reported, the opportunity is still imported without them');
});
test('opportunities: duplicates by title + company are skipped and said, also inside the file',()=>{
 const p=plan('opportunities','Trattativa;Azienda;Importo\nRinnovo 2026;Acme S.r.l.;1\nrinnovo 2026;;2\nSito nuovo;;3\nNuovo;Beta Spa;4\nNuovo;Beta Spa;5\n;Acme S.r.l.;6\nX;;tanti\n');
 assert.deepEqual(p.rows.map(r=>r.status),['dup','create','dup','create','dup','error','error']);
 assert.match(p.rows[0].problems[0],/già nel CRM per «Acme S\.r\.l\.»: saltata/);
 assert.match(p.rows[2].problems[0],/già nel CRM senza azienda/);
 assert.match(p.rows[5].problems[0],/titolo mancante: non importata/);assert.match(p.rows[6].problems[0],/importo «tanti» non leggibile/);
 assert.deepEqual(p.counts,{create:2,dup:3,error:2});
});
test('opportunities: owner by member name, probability, bad date left empty with a warning, formula prefix of our export removed',()=>{
 const p=plan('opportunities','Trattativa;Responsabile;Probabilità;Chiusura prevista\n\'=Somma;giulia verdi;60%;31/02/2026\nAltro;Chi?;300;\n');
 assert.deepEqual(p.rows[0].data,{title:'=Somma',process_id:id(31),stage_id:id(41),probability:60,owner_id:7});
 assert.match(p.rows[0].problems[0],/data di chiusura «31\/02\/2026» non leggibile/);
 assert.equal(p.rows[1].data.owner_id,undefined);assert.equal(p.rows[1].data.probability,undefined);assert.equal(p.rows[1].problems.length,2);
});
test('opportunities: no pipeline or no title column stops the import before the preview',()=>{
 assert.match(plan('opportunities','Trattativa\nA\n',{...ctx,processes:ctx.processes.filter(p=>p.kind==='task')}).fatal,/Nessuna pipeline/);
 assert.match(plan('opportunities','Importo\n10\n').fatal,/Manca la colonna «Trattativa»/);
 assert.match(plan('tasks','Scadenza\n01/01/2027\n').fatal,/Manca la colonna «Attività»/);
});
test('tasks: due date, status and priority words, assignee, links matched like opportunities',()=>{
 const p=plan('tasks','Subject,Due Date,Status,Priority,Assigned To,Trattativa,Azienda,Contatto\nInviare offerta,05/11/2026,Completed,High,Giulia Verdi,Rinnovo 2026,,\nChiamare Bruno,2026-11-06,in corso,urgente,,,,Bruno Neri\nPreparare demo,domani,boh,max,Nessuno,Progetto X,,\nChiamare Anna,10/11/2026 09:00,,,,,Acme S.r.l.,Anna Rossi\n');
 const [a,b,c,d]=p.rows;
 assert.deepEqual(a.data,{title:'Inviare offerta',due_at:new Date(2026,10,5,9).toISOString(),status:'done',priority:'high',assignee_id:7,opportunity_id:id(21),company_id:id(1),contact_id:id(11)});
 assert.equal(a.view.link,'Rinnovo 2026 · Acme S.r.l. · Anna Rossi');
 assert.deepEqual([b.data.status,b.data.priority,b.data.company_id,b.data.contact_id],['doing','urgent',id(2),id(12)]);
 assert.equal(c.status,'create');assert.deepEqual(Object.keys(c.data),['title']);assert.equal(c.problems.length,5,c.problems.join(' | '));
 assert.equal(d.status,'create','same title and contact as an existing task, another day: kept');
 for(const r of p.rows)assert.doesNotThrow(()=>command({workspace:W,entity:'tasks',action:'create',data:r.data}),r.data.title);
});
test('tasks: on an opportunity the company and contact are the opportunity\'s; same task twice is skipped',()=>{
 const p=plan('tasks','Attività;Scadenza;Trattativa;Azienda\nFollow-up;01/12/2026;Rinnovo 2026;Beta Spa\nFollow-up;01/12/2026;Rinnovo 2026;Beta Spa\nChiamare Anna;03/11/2026;;Acme S.r.l.\n');
 assert.deepEqual([p.rows[0].data.company_id,p.rows[0].data.contact_id],[id(1),id(11)]);
 assert.match(p.rows[0].problems.join(' '),/diversa da quella della trattativa/);
 assert.equal(p.rows[1].status,'dup');assert.equal(p.rows[2].status,'create','existing task has a contact: not the same task');
 const q=plan('tasks','Attività;Scadenza;Azienda;Contatto\nChiamare Anna;03/11/2026;Acme S.r.l.;Anna Rossi\n',{...ctx,tasks:[{...ctx.tasks[0],due_at:I.dueAt('03/11/2026')}]});
 assert.equal(q.rows[0].status,'dup');
});
test('the note of an opportunity is a note interaction accepted by the API',()=>{
 const n=I.noteFor({id:id(99),company_id:id(1),contact_id:null},'x'.repeat(5000),Date.parse('2026-10-20T10:00:00Z'));
 assert.equal(n.body.length,4000);assert.equal(n.occurred_at,'2026-10-20T10:00:00.000Z');
 assert.doesNotThrow(()=>command({workspace:W,entity:'interactions',action:'create',data:n}));
});
test('the CRM page loads the import after the CSV core, writes only after confirm, one create at a time',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8');
 assert.ok(html.indexOf('crm-csv-core.js')<html.indexOf('crm-import-deals-core.js'));assert.ok(html.indexOf('crm-import-deals-core.js')<html.indexOf('crm-import-deals.js"'));
 assert.match(html,/href="sales\/crm-import-deals\.css"/);
 const src=fs.readFileSync(__dirname+'/../sales/crm-import-deals.js','utf8');
 assert.match(src,/if\(!window\.confirm\(msg\)\)return;/);
 assert.ok(src.indexOf('window.confirm(msg)')<src.indexOf("await post(kind,r.data)"),'no create before the confirmation');
 assert.match(src,/for\(const r of rows\)\{\s*try\{const res=await post\(kind,r\.data\)/);
 assert.doesNotMatch(src,/action:'(update|delete)'|entity:'(companies|contacts)'/,'never creates or changes companies and contacts');
 assert.match(fs.readFileSync(__dirname+'/../sales/sales.js','utf8'),/window\.RadixCrmImportDeals\?\.section\(entity,section\)/);
});
test('more than 1000 rows are refused by the CSV core',()=>{
 assert.throws(()=>csv.parse('Trattativa\n'+'x\n'.repeat(1001)),/Massimo 1000 righe/);
});
