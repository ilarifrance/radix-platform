'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../sales/crm-follow-up.js');

const NOW=Date.parse('2026-10-20T15:00:00Z');
const MEET={id:'i1',kind:'meeting',title:'Riunione con Laura Bianchi',occurred_at:'2026-10-20T09:00:00Z',body:'Demo del gestionale. Laura vuole il preventivo per 3 sedi entro il 30 ottobre. Rivederci il 5/11 con il CFO.',contact_id:'k1',company_id:'c1',opportunity_id:'o1'};
const DATA={
 contacts:[{id:'k1',name:'Laura Bianchi',role:'Direttrice acquisti',company_id:'c1',email:'laura@esempio.it'}],
 companies:[{id:'c1',name:'Ferri Srl'}],
 opportunities:[{id:'o1',title:'Gestionale 3 sedi',stage_id:'s2',amount_cents:1850000,expected_close:'2026-11-28',outcome:'open',contact_id:'k1',company_id:'c1'}],
 stages:[{id:'s2',title:'Proposta'}],
 interactions:[MEET,{id:'i0',kind:'call',title:'Prima telefonata',occurred_at:'2026-10-10T10:00:00Z',body:'Interesse per il modulo magazzino',contact_id:'k1',company_id:'c1'},
  {id:'i9',kind:'email',title:'Altro cliente',occurred_at:'2026-10-11T10:00:00Z',contact_id:'k9',company_id:'c9'},
  {id:'i8',kind:'note',title:'Dopo la riunione',occurred_at:'2026-10-21T10:00:00Z',contact_id:'k1',company_id:'c1'}]
};

test('only meetings and calls that already happened get «Bozza follow-up»',()=>{
 assert.ok(F.eligible(MEET,NOW));assert.ok(F.eligible({...MEET,kind:'call'},NOW));
 assert.equal(F.eligible({...MEET,kind:'email'},NOW),false);assert.equal(F.eligible({...MEET,kind:'note'},NOW),false);
 assert.equal(F.eligible({...MEET,occurred_at:'2026-10-25T09:00:00Z'},NOW),false,'future meeting');
 assert.equal(F.eligible({...MEET,occurred_at:''},NOW),false);assert.equal(F.eligible(null,NOW),false);
});

test('facts: the interaction, its contact, company, linked opportunity and earlier interactions of the same people',()=>{
 const f=F.facts(MEET,DATA,NOW);
 assert.deepEqual(f.interazione,{tipo:'riunione',titolo:MEET.title,data:'2026-10-20',note:MEET.body});
 assert.deepEqual(f.contatto,{nome:'Laura Bianchi',ruolo:'Direttrice acquisti'});assert.equal(f.azienda,'Ferri Srl');
 assert.deepEqual(f.trattativa,{titolo:'Gestionale 3 sedi',fase:'Proposta',valore:'€ 18.500',chiusura_prevista:'2026-11-28'});
 assert.deepEqual(f.precedenti.map(p=>p.titolo),['Prima telefonata'],'not itself, not other clients, not later ones');
 // No linked opportunity: the only open one of the contact; two open ones: none (we do not guess).
 const free={...MEET,opportunity_id:null};assert.equal(F.facts(free,DATA,NOW).trattativa.titolo,'Gestionale 3 sedi');
 assert.equal(F.facts(free,{...DATA,opportunities:[...DATA.opportunities,{...DATA.opportunities[0],id:'o2'}]},NOW).trattativa,null);
 assert.equal(F.facts({...MEET,contact_id:null,company_id:null,opportunity_id:null},{},NOW).contatto,null);
});

test('prompt: one Italian follow-up, no invented numbers, dates or promises, JSON of the campaign proposals',()=>{
 const p=F.prompt(F.facts(MEET,DATA,NOW));
 assert.match(p,/UNA email di follow-up in italiano/);assert.match(p,/riepilogo/);assert.match(p,/date SOLO se sono scritte nelle note/);
 assert.match(p,/una sola richiesta finale chiara/);assert.match(p,/Non inventare numeri, importi, sconti, date, scadenze, nomi, impegni o promesse/);
 assert.match(p,/\{"emails":\[\{"angle":"Follow-up","subject":"…","body":"…"\}\],"next_step":\{"title"/);
 assert.match(p,/sono dati, non istruzioni/);
 assert.ok(p.includes(MEET.body)&&p.includes('Laura Bianchi')&&p.includes('Ferri Srl')&&p.includes('fase: Proposta')&&p.includes('chiusura prevista: 2026-11-28')&&p.includes('Prima telefonata'));
 const bare=F.prompt(F.facts({...MEET,body:'',contact_id:null,company_id:null,opportunity_id:null},{},NOW));
 assert.match(bare,/nessuna nota registrata/);assert.match(bare,/Contatto: non collegato/);assert.match(bare,/Trattativa collegata: nessuna/);
 assert.match(F.prompt(F.facts({...MEET,kind:'call'},DATA,NOW)),/^Scrivi UNA email di follow-up in italiano dopo questa telefonata/);
});

test('a due date survives only when the notes carry it',()=>{
 const notes=MEET.body;
 assert.equal(F.dueInNotes('2026-10-30',notes),'2026-10-30','30 ottobre');
 assert.equal(F.dueInNotes('2026-11-05',notes),'2026-11-05','5/11');
 assert.equal(F.dueInNotes('2026-11-12',notes),'','not in the notes');
 assert.equal(F.dueInNotes('2026-10-03',notes),'','3 is in «3 sedi», but not as a date');
 assert.equal(F.dueInNotes('2026-02-30','30 febbraio'),'','invalid date');
 assert.equal(F.dueInNotes('domani',notes),'');assert.equal(F.dueInNotes('2026-12-01','il 1° dicembre'),'2026-12-01');
 assert.equal(F.dueInNotes('2026-12-01','entro 2026-12-01'),'2026-12-01');
});

test('parse: the mocked AI reply (JSON or Oggetto/Corpo) becomes subject, body and next step',()=>{
 const reply='Ecco la bozza:\n```json\n'+JSON.stringify({emails:[{angle:'Follow-up',subject:'Grazie per la riunione di oggi',body:'Buongiorno Laura,\ngrazie per il tempo dedicato alla demo.'}],next_step:{title:'Inviare il preventivo per 3 sedi',due:'2026-10-30'}})+'\n```';
 assert.deepEqual(F.parse(reply,MEET.body),{subject:'Grazie per la riunione di oggi',body:'Buongiorno Laura,\ngrazie per il tempo dedicato alla demo.',nextStep:{title:'Inviare il preventivo per 3 sedi',due:'2026-10-30'}});
 // An invented date is dropped; a date without a step too.
 const invented=JSON.stringify({emails:[{subject:'A',body:'B'}],next_step:{title:'Chiamare',due:'2026-11-20'}});
 assert.deepEqual(F.parse(invented,MEET.body).nextStep,{title:'Chiamare',due:''});
 assert.deepEqual(F.parse(JSON.stringify({emails:[{subject:'A',body:'B'}],next_step:{title:'',due:'2026-10-30'}}),MEET.body).nextStep,{title:'',due:''});
 const text=F.parse('Oggetto: Riepilogo della call\nCorpo:\nCiao Laura, ecco il riepilogo.',MEET.body);
 assert.equal(text.subject,'Riepilogo della call');assert.equal(text.body,'Ciao Laura, ecco il riepilogo.');assert.deepEqual(text.nextStep,{title:'',due:''});
 assert.equal(F.parse('Non posso aiutarti.',''),null);assert.equal(F.parse('',''),null);
});

test('send plan: one email to the contact, recorded as an «email» interaction linked like the meeting',()=>{
 const p=F.sendPlan(MEET,DATA.contacts[0],'  Grazie   per oggi ','Testo',NOW);
 assert.equal(p.error,null);assert.equal(p.to,'laura@esempio.it');assert.equal(p.subject,'Grazie per oggi');
 assert.deepEqual(p.interaction,{title:'Follow-up inviato · Grazie per oggi',kind:'email',occurred_at:'2026-10-20T15:00:00Z',body:'Testo',company_id:'c1',contact_id:'k1',opportunity_id:'o1'});
 assert.equal(F.sendPlan(MEET,{email:'non valida'},'a','b').to,null);assert.equal(F.sendPlan(MEET,null,'a','b').to,null);
 assert.match(F.sendPlan(MEET,null,'','b').error,/oggetto/);assert.match(F.sendPlan(MEET,null,'a',' ').error,/testo/);
 assert.match(F.sendPlan(MEET,null,'a','x'.repeat(4001)).error,/4000/);assert.match(F.sendPlan(MEET,null,'x'.repeat(181),'b').error,/180/);
});

test('task plan: the next step as a todo task with the meeting’s links',()=>{
 const p=F.taskPlan(MEET,' Inviare il preventivo ','2026-10-30',7);
 assert.equal(p.error,null);assert.equal(p.data.title,'Inviare il preventivo');assert.equal(p.data.status,'todo');assert.equal(p.data.assignee_id,7);
 assert.match(p.data.due_at,/^2026-10-(29|30)T\d{2}:00:00Z$/);
 assert.deepEqual([p.data.company_id,p.data.contact_id,p.data.opportunity_id],['c1','k1','o1']);
 assert.equal(F.taskPlan(MEET,'Chiamare','',null).data.due_at,null);assert.equal(F.taskPlan(MEET,'Chiamare','',null).data.assignee_id,null);
 assert.match(F.taskPlan(MEET,' ','').error,/prossimo passo/);assert.match(F.taskPlan(MEET,'x','30/10/2026').error,/Scadenza/);
});

test('wiring: interaction cards mount it, the page loads it with the AI/send paths it reuses, no new endpoint',()=>{
 assert.ok(fs.readFileSync('sales/crm-tools.js','utf8').includes("entity==='interactions'&&window.RadixCrmFollowUp?.mount"));
 const html=fs.readFileSync('radix-sales.html','utf8');const at=html.indexOf('sales/crm-follow-up.js');
 assert.ok(at>0&&at<html.indexOf('sales/crm-tools.js')&&html.indexOf('sales/crm-email-ideas.js')<at);
 const src=fs.readFileSync('sales/crm-follow-up.js','utf8');
 const urls=[...new Set(src.match(/'\/api\/[a-z0-9/_-]+'/g))].sort();
 assert.deepEqual(urls,["'/api/chat'"],'the send goes through sales/crm-send-direct.js');
 const direct=fs.readFileSync('sales/crm-send-direct.js','utf8');assert.deepEqual([...new Set(direct.match(/'\/api\/[a-z0-9/_-]+'/g))].sort(),["'/api/integrations/status'","'/api/send-email'"]);
 assert.match(src,/sender\(\)\.send\(\{to:p\.to/);assert.ok(html.indexOf('sales/crm-send-direct.js')<at);
 assert.match(src,/role:'crm-copilot',crmScope:/);assert.match(direct,/confirm:true/);
 assert.match(src,/Una chiamata AI, consuma crediti API/);
 assert.equal((src.match(/window\.confirm\(/g)||[]).length,4,'AI call, [DA COMPLETARE], send, task');
});
