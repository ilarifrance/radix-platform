'use strict';
// «Importa storico»: calls, meetings, emails and notes from Salesforce, HubSpot, Pipedrive or Excel.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const csv=require('../sales/crm-csv-core.js');
const S=require('../sales/crm-import-storico-core.js');
const {command}=require('../api/_sales');
const W='11111111-1111-4111-8111-111111111111';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const local=(y,m,d,h=9,mi=0)=>new Date(y,m-1,d,h,mi,0).toISOString();
const ctx={
 companies:[{id:id(1),name:'Acme S.r.l.'},{id:id(2),name:'Società Àlfa'},{id:id(3),name:'Gemelli'},{id:id(4),name:'Gemelli'}],
 contacts:[{id:id(11),name:'Anna Rossi',email:'anna@acme.it',company_id:id(1)},{id:id(12),name:'Bruno Neri',email:'bruno@alfa.it',company_id:id(2)},{id:id(13),name:'Carla Bo',email:null,company_id:null},{id:id(14),name:'Mario Bianchi',email:'m1@x.it',company_id:id(1)},{id:id(15),name:'Mario Bianchi',email:'m2@x.it',company_id:id(2)}],
 opportunities:[{id:id(21),title:'Rinnovo 2026',company_id:id(1),contact_id:id(11)}],
 interactions:[{id:id(31),title:'Chiamata di presentazione',kind:'call',occurred_at:'2025-03-10T09:30:00.000Z',company_id:id(1),contact_id:id(11),opportunity_id:null}]
};
const plan=(text,c=ctx,o)=>S.plan(csv.parse(text),c,{now:Date.parse('2026-10-20T10:00:00Z'),...o});

test('Salesforce, Pipedrive, HubSpot and Italian headers are recognised, each column used once',()=>{
 assert.deepEqual(S.columns(['Subject','Task Subtype','Activity Date','Comments','Account Name','Name','Email','Assigned To','Duration']),
  {title:'Subject',kind:'Task Subtype',date:'Activity Date',body:'Comments',duration:'Duration',company:'Account Name',contact_email:'Email',contact:'Name',owner:'Assigned To'});
 assert.deepEqual(S.columns(['Activity - Subject','Activity - Type','Activity - Due date','Activity - Due time','Activity - Note','Activity - Organization','Activity - Contact person','Activity - Deal','Activity - Assigned to user']),
  {title:'Activity - Subject',kind:'Activity - Type',date:'Activity - Due date',time:'Activity - Due time',body:'Activity - Note',opportunity:'Activity - Deal',company:'Activity - Organization',contact:'Activity - Contact person',owner:'Activity - Assigned to user'});
 assert.deepEqual(S.columns(['Activity date','Activity type','Call title','Call notes','Call outcome','Call duration (HH:mm:ss)','Associated Company','Associated Contact','Activity assigned to']),
  {title:'Call title',kind:'Activity type',date:'Activity date',body:'Call notes',outcome:'Call outcome',duration:'Call duration (HH:mm:ss)',company:'Associated Company',contact:'Associated Contact',owner:'Activity assigned to'});
 assert.deepEqual(S.columns(['Data','Ora','Tipo','Oggetto','Azienda','Contatto','Email','Note','Durata','Responsabile']),
  {title:'Oggetto',kind:'Tipo',date:'Data',time:'Ora',body:'Note',duration:'Durata',company:'Azienda',contact_email:'Email',contact:'Contatto',owner:'Responsabile'});
 // Salesforce exports «Type» and «Task Subtype»: the first one in the alias order wins, the other is unused.
 assert.equal(S.columns(['Type','Task Subtype','Date']).kind,'Type');
});

test('the mapping edited in the preview overrides the automatic one; unknown or repeated headers are dropped',()=>{
 const h=['Quando','Cosa','Chi','Azienda'],auto=S.columns(h);
 assert.equal(auto.date,'Quando');assert.equal(auto.title,undefined);
 assert.deepEqual(S.mapping(h,auto,{title:'Cosa',contact:'Chi',company:'',kind:'Inesistente'}),{date:'Quando',title:'Cosa',contact:'Chi'});
 assert.deepEqual(S.mapping(h,auto,{title:'Azienda'}),{date:'Quando',title:'Azienda'},'a header used twice is kept for the first field only');
 const p=plan('Quando;Cosa;Chi\n15/03/2025;Telefonata;anna@acme.it\n',ctx,{columns:{title:'Cosa',contact:'Chi'}});
 assert.equal(p.rows[0].status,'create');assert.equal(p.rows[0].data.title,'Telefonata');assert.equal(p.rows[0].data.contact_id,id(11));
});

test('types: call, meeting, email and note in Italian and English; unknown → note with a warning',()=>{
 const cases={Call:'call','Chiamata in uscita':'call',Telefonata:'call','Logged call':'call',Meeting:'meeting',Riunione:'meeting',Incontro:'meeting',Appuntamento:'meeting',Event:'meeting','Video call':'meeting',Email:'email','E-mail':'email','List Email':'email',Mail:'email',Nota:'note',Note:'note',Task:'note',Other:'note',Altro:'note'};
 for(const [v,k] of Object.entries(cases))assert.equal(S.kindOf(v),k,v);
 assert.equal(S.kindOf('Fax'),null);assert.equal(S.kindOf(''),null);
 assert.equal(S.kindFromTitle('Email: Proposta'),'email');assert.equal(S.kindFromTitle('Call'),'call');assert.equal(S.kindFromTitle('Riunione di avvio'),'meeting');assert.equal(S.kindFromTitle('Proposta'),null);
 const p=plan('Tipo;Data;Contatto\nFax;15/03/2025;Anna Rossi\n');
 assert.equal(p.rows[0].data.kind,'note');assert.match(p.rows[0].problems[0],/tipo «Fax» non riconosciuto/);
 const q=plan('Subject;Activity Date;Name\nEmail: Offerta;15/03/2025;Anna Rossi\n');
 assert.equal(q.rows[0].data.kind,'email');assert.deepEqual(q.rows[0].problems,[]);
});

test('dates in Italian, English, ISO and Excel formats, with or without time; without time at 09:00 local',()=>{
 const d=(v,t,o)=>{const r=S.occurredAt(v,t,o);return r&&r.at};
 assert.equal(d('15/03/2025'),local(2025,3,15));
 assert.equal(d('15/03/2025 14:30'),local(2025,3,15,14,30));
 assert.equal(d('15.03.25, 14.30'),local(2025,3,15,14,30));
 assert.equal(d('2025-03-15 14:30:00'),local(2025,3,15,14,30));
 assert.equal(d('2025-03-15T14:30'),local(2025,3,15,14,30));
 assert.equal(d('2025-03-15T14:30:00Z'),'2025-03-15T14:30:00.000Z');
 assert.equal(d('2025-03-15T14:30:00+01:00'),'2025-03-15T13:30:00.000Z');
 assert.equal(d('15 marzo 2025 ore 9'),local(2025,3,15,9));
 assert.equal(d('lunedì 17 marzo 2025, 10:00'),local(2025,3,17,10));
 assert.equal(d('15-Mar-2025'),local(2025,3,15));
 assert.equal(d('March 15, 2025 2:30 PM'),local(2025,3,15,14,30));
 assert.equal(d('3/15/2025'),local(2025,3,15),'second number above 12: month/day');
 assert.equal(d('03/04/2025',undefined,'mdy'),local(2025,3,4));assert.equal(d('03/04/2025'),local(2025,4,3));
 assert.equal(d('45731'),local(2025,3,15),'Excel serial date');assert.equal(d('45731.6041666667'),local(2025,3,15,14,30),'Excel serial with time');
 assert.equal(d('15/03/2025','2:30 PM'),local(2025,3,15,14,30));assert.equal(d('15/03/2025','0.75'),local(2025,3,15,18),'Excel time fraction');
 assert.deepEqual(S.occurredAt('15/03/2025','dopo pranzo'),{bad:'time'});
 for(const v of ['31/02/2025','domani','15/13/2025 10:00','2025-03-15 25:00','',' '])assert.equal(S.occurredAt(v),null,v);
 assert.equal(S.occurredAt('15/03/2025').timed,false);assert.equal(S.occurredAt('15/03/2025 10:00').timed,true);
 assert.equal(S.dateOrder(['03/04/2025','3/15/2025']),'mdy');assert.equal(S.dateOrder(['03/04/2025','15/03/2025','3/15/2025']),'dmy');assert.equal(S.dateOrder(['03/04/2025']),'dmy');
 for(const v of ['15/03/2025 14:30','March 15, 2025','45731.5'])assert.match(d(v),/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
 // A US export: the whole column is read month/day once one value shows it.
 const p=plan('Subject;Activity Date;Name\nA;03/04/2025;Anna Rossi\nB;3/15/2025;Anna Rossi\n');
 assert.equal(p.order,'mdy');assert.equal(p.rows[0].data.occurred_at,local(2025,3,4));
});

test('durations, outcome and owner go into the text (interactions have no owner or duration field)',()=>{
 const cases={'15':15,'15 min':15,'00:15:00':15,'1:30':90,'1h 30m':90,'2 ore':120,'90 secondi':2,'':null};
 for(const [v,m] of Object.entries(cases))assert.equal(S.minutes(v),m,v);
 assert.ok(Number.isNaN(S.minutes('lunga')));assert.equal(S.minutes('120',true),2,'seconds column');
 const p=plan('Subject;Activity Date;Name;Comments;Duration;Assigned To;Call outcome\nCall;15/03/2025;Anna Rossi;Interessata al rinnovo;90;Giulia Verdi;Connected\n');
 assert.equal(p.rows[0].data.body,'Interessata al rinnovo\n\nEsito: Connected · Durata: 1 h 30 min · Assegnata a: Giulia Verdi');
 const long=plan('Oggetto;Data;Contatto;Note\n'+'x'.repeat(250)+';15/03/2025;Anna Rossi;'+'y'.repeat(4100)+'\n').rows[0];
 assert.equal(long.data.title.length,200);assert.equal(long.data.body.length,4000);assert.equal(long.problems.length,2);
});

test('matching: company and contact without case or accents, contact by email first then by name',()=>{
 const p=plan('Oggetto;Data;Azienda;Contatto;Email\n'+
  'A;15/03/2025;ACME s.r.l.;;\n'+                  // company only
  'B;15/03/2025;;ANNA ROSSI;\n'+                    // contact by name, its company comes along
  'C;15/03/2025;;Nome sbagliato;bruno@alfa.it\n'+   // email wins over the name
  'D;15/03/2025;societa alfa;;\n'+                  // accents do not count
  'E;15/03/2025;;Mario Bianchi;\n'+                 // two contacts with this name, no company: skipped
  'F;15/03/2025;Società Àlfa;Mario Bianchi;\n'+     // the company picks one of them
  'G;15/03/2025;Acme S.r.l.;Bruno Neri;\n'+         // contact of another company: linked to the contact and its company
  'H;15/03/2025;Acme S.r.l.;Carla Bo;\n'+           // contact without company
  'I;15/03/2025;Gemelli;;\n'+                       // two companies with that name
  'J;15/03/2025;Nuova Srl;Persona Nuova;\n'+        // nothing found: skipped
  'K;15/03/2025;;carla@nessuno.it;\n');            // email in the contact column, not found
 const r=Object.fromEntries(p.rows.map(x=>[x.data.title,x]));
 assert.deepEqual([r.A.data.company_id,r.A.data.contact_id],[id(1),undefined]);
 assert.deepEqual([r.B.data.company_id,r.B.data.contact_id],[id(1),id(11)]);
 assert.deepEqual([r.C.data.company_id,r.C.data.contact_id],[id(2),id(12)]);
 assert.equal(r.D.data.company_id,id(2));
 assert.equal(r.E.status,'error');assert.match(r.E.problems.join(' '),/più record per contatto «Mario Bianchi»/);
 assert.deepEqual([r.F.data.company_id,r.F.data.contact_id],[id(2),id(15)]);
 assert.deepEqual([r.G.data.company_id,r.G.data.contact_id],[id(2),id(12)]);assert.match(r.G.problems[0],/è di «Società Àlfa», non di «Acme S\.r\.l\.»/);
 assert.deepEqual([r.H.data.company_id,r.H.data.contact_id],[undefined,id(13)]);assert.match(r.H.problems[0],/non ha un’azienda/);
 assert.equal(r.I.status,'error');assert.match(r.I.problems.join(' '),/più record per azienda «Gemelli»/);
 assert.equal(r.J.status,'error');assert.match(r.J.problems[0],/nessuna azienda, contatto o trattativa del CRM/);assert.match(r.J.problems.join(' '),/Azienda «Nuova Srl» non trovata/);
 assert.equal(r.K.status,'error');assert.match(r.K.problems.join(' '),/Contatto «carla@nessuno\.it» non trovato/);
 // A row the CRM can hold even without the contact: warning, still imported with the company.
 const w=plan('Oggetto;Data;Azienda;Contatto\nX;15/03/2025;Acme S.r.l.;Sconosciuto\n').rows[0];
 assert.equal(w.status,'create');assert.equal(w.data.company_id,id(1));assert.match(w.problems[0],/Contatto «Sconosciuto» non trovato/);
 // Every importable row is accepted by the server's command check.
 for(const x of p.rows.filter(x=>x.status==='create'))assert.doesNotThrow(()=>command({workspace:W,entity:'interactions',action:'create',data:x.data}),x.data.title);
});

test('an opportunity links the interaction with its own company and contact',()=>{
 const p=plan('Oggetto;Data;Trattativa;Contatto\nDemo;15/03/2025;rinnovo 2026;Bruno Neri\nDemo 2;16/03/2025;Rinnovo 2026;\n');
 assert.deepEqual(p.rows[0].data,{title:'Demo',kind:'note',occurred_at:local(2025,3,15),body:'',company_id:id(1),contact_id:id(11),opportunity_id:id(21)});
 assert.match(p.rows[0].problems[0],/non è quello della trattativa/);
 assert.deepEqual(p.rows[1].problems,[]);
 for(const x of p.rows)assert.doesNotThrow(()=>command({workspace:W,entity:'interactions',action:'create',data:x.data}));
});

test('duplicates: same type, date and time, subject and contact/company already in the CRM or repeated in the file',()=>{
 const p=plan('Tipo;Data;Oggetto;Contatto;Azienda\n'+
  'Chiamata;2025-03-10T09:30:00Z;chiamata di PRESENTAZIONE;Anna Rossi;\n'+  // in the CRM
  'Chiamata;2025-03-10T09:30:00Z;Chiamata di presentazione;;Acme S.r.l.\n'+ // other link: new
  'Riunione;2025-03-10T09:30:00Z;Chiamata di presentazione;Anna Rossi;\n'+ // other type: new
  'Chiamata;2025-03-10T09:31:00Z;Chiamata di presentazione;Anna Rossi;\n'+ // other minute: new
  'Chiamata;2025-03-10T09:31:00Z;Chiamata di presentazione;anna@acme.it;\n'); // repeated in the file
 assert.deepEqual(p.rows.map(r=>r.status),['dup','create','create','create','dup']);
 assert.match(p.rows[0].problems[0],/già nel CRM/);assert.match(p.rows[4].problems[0],/ripetuta nel file \(come la riga 5\)/);
 assert.deepEqual(p.counts,{create:3,warn:0,dup:2,error:0});
 // Server timestamps with offset compare the same.
 const q=plan('Tipo;Data;Oggetto;Contatto\nCall;10/03/2025 09:30;Chiamata di presentazione;Anna Rossi\n',{...ctx,interactions:[{...ctx.interactions[0],occurred_at:new Date(2025,2,10,9,30).toISOString().replace('Z','+00:00')}]});
 assert.equal(q.rows[0].status,'dup');
});

test('rows that cannot be read are skipped with the reason; fatal errors when date or link columns are missing',()=>{
 const p=plan('Oggetto;Data;Contatto;Ora\nA;;Anna Rossi;\nB;ieri;Anna Rossi;\nC;15/03/2025;Anna Rossi;dopo pranzo\nD;15/03/2027;Anna Rossi;\n');
 assert.deepEqual(p.rows.map(r=>r.status),['error','error','error','create']);
 assert.match(p.rows[0].problems[0],/data mancante: saltata/);assert.match(p.rows[1].problems[0],/data «ieri» non leggibile/);assert.match(p.rows[2].problems[0],/ora «dopo pranzo» non leggibile/);
 assert.match(p.rows[3].problems[0],/data nel futuro/);assert.equal(p.counts.warn,1);
 assert.match(plan('Oggetto;Contatto\nA;Anna\n').fatal,/colonna della data/);
 assert.match(plan('Oggetto;Data\nA;15/03/2025\n').fatal,/collegare/);
 // Without a subject: the title is the type.
 const t=plan('Tipo;Data;Contatto\nRiunione;15/03/2025;Anna Rossi\n').rows[0];assert.equal(t.data.title,'Riunione');
 // Formula protection of our own exports is read back.
 assert.equal(plan("Oggetto;Data;Contatto\n'=Chiamata;15/03/2025;Anna Rossi\n").rows[0].data.title,'=Chiamata');
});

test('report: created and skipped rows with reasons, CSV of the skipped rows with the original columns',()=>{
 const text='Oggetto;Data;Contatto;Note\nA;15/03/2025;Anna Rossi;ok\nB;ieri;Anna Rossi;x\nC;16/03/2025;Anna Rossi;"a;b"\nD;17/03/2025;Anna Rossi;\nA;15/03/2025;Anna Rossi;doppia\n';
 const parsed=csv.parse(text),p=S.plan(parsed,ctx,{});
 const rep=S.report(p,{2:{ok:true},4:{error:'Testo troppo lungo o non valido.'}});
 assert.equal(rep.created,1);
 assert.deepEqual(rep.skipped.map(s=>[s.line,s.reason.split(':')[0]]),[[3,'data «ieri» non leggibile'],[4,'errore del CRM'],[5,'non inviata'],[6,'ripetuta nel file (come la riga 2)']]);
 assert.deepEqual(rep.byReason,{dup:1,error:1,failed:1,stopped:1});
 const out=S.skippedCsv(rep,parsed.headers);
 const back=csv.parse(out);
 assert.deepEqual(back.headers,['Riga','Motivo','Oggetto','Data','Contatto','Note']);
 assert.equal(back.rows.length,4);assert.equal(back.rows[1].Note,'a;b');assert.equal(back.rows[1].Motivo,'errore del CRM: Testo troppo lungo o non valido.');
});

test('the page loads the history import after the deals import and offers it in the interactions list',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8');
 const at=f=>html.indexOf('sales/'+f);
 assert.ok(at('crm-csv-core.js')<at('crm-import-deals-core.js')&&at('crm-import-deals-core.js')<at('crm-import-storico-core.js')&&at('crm-import-storico-core.js')<at('crm-import-storico.js'));
 const deals=fs.readFileSync(__dirname+'/../sales/crm-import-deals.js','utf8');assert.match(deals,/entity==='interactions'\)\{window\.RadixCrmImportStorico\?\.section\(section\)/);
 const ui=fs.readFileSync(__dirname+'/../sales/crm-import-storico.js','utf8');
 assert.match(ui,/readFile\(file\)/);assert.match(ui,/Importa storico \(CSV o Excel\)/);assert.match(ui,/window\.confirm\(/);assert.match(ui,/action:'create'/);
 assert.doesNotMatch(ui,/\/api\/(?:ai|copilot|claude)|sample|askClaude/i,'no AI calls');
});
