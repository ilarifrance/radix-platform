'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {aiPrompt,cleanDraft,plan}=require('../sales/crm-ticket-reply.js');
const T={id:'t1',version:3,title:'Accesso al portale',body:'Non riesco ad accedere.',status:'open',contact_id:'c1',company_id:null};
const C={id:'c1',name:'Giulia Test',email:' giulia@test.it ',company_id:'k1'};

test('AI prompt names the ticket, the request and the limits, and asks for the email text only',()=>{
 const p=aiPrompt(T,C);
 assert.match(p,/«Accesso al portale» per Giulia Test/);assert.match(p,/«Non riesco ad accedere\.»/);
 assert.match(p,/non promettere/);assert.match(p,/\[DA COMPLETARE/);assert.match(p,/solo con il testo dell’email/);
 assert.match(aiPrompt({...T,body:''},{name:'Contatto anonimizzato'}),/per il cliente\. Tono/);
});

test('cleanDraft strips fences, subject line and quotes',()=>{
 assert.equal(cleanDraft('```\nOggetto: Re: accesso\n\nGentile Giulia,\nverifichiamo.\n```'),'Gentile Giulia,\nverifichiamo.');
 assert.equal(cleanDraft('«Gentile Giulia, grazie.»'),'Gentile Giulia, grazie.');
 assert.equal(cleanDraft(null),'');assert.equal(cleanDraft('x'.repeat(5000)).length,4000);
});

test('plan: email, interaction on contact and company, open ticket goes to pending',()=>{
 const p=plan(T,C,'  Gentile Giulia  ',Date.parse('2026-10-17T09:05:30.123Z'));
 assert.equal(p.error,null);assert.equal(p.to,'giulia@test.it');assert.equal(p.subject,'Re: Accesso al portale');assert.equal(p.body,'Gentile Giulia');
 assert.deepEqual(p.interaction,{title:'Risposta al ticket: Accesso al portale',kind:'email',occurred_at:'2026-10-17T09:05:30Z',body:'Gentile Giulia',contact_id:'c1',company_id:'k1'});
 assert.deepEqual(p.ticket,{id:'t1',version:3,status:'pending'});
 assert.equal(plan({...T,status:'pending'},C,'ok').ticket,null,'pending stays pending');
 assert.equal(plan(T,{...C,email:'non-valida'},'ok').to,null);assert.equal(plan(T,null,'ok').to,null);
 assert.equal(plan({...T,contact_id:null},null,'ok').interaction,null,'no contact nor company: no interaction');
 assert.equal(plan({...T,contact_id:null,company_id:'k9'},null,'ok').interaction.company_id,'k9');
 assert.match(plan(T,C,'   ').error,/Scrivi la risposta/);assert.match(plan(T,C,'x'.repeat(4001)).error,/4000/);
});

test('ticket cards mount the reply block; the page loads it before crm-tools',()=>{
 assert.ok(fs.readFileSync('sales/crm-tools.js','utf8').includes("RadixCrmTicketReply.mount(c,row)"));
 const html=fs.readFileSync('radix-sales.html','utf8');assert.ok(html.indexOf('sales/crm-ticket-reply.js')>0&&html.indexOf('sales/crm-ticket-reply.js')<html.indexOf('sales/crm-tools.js'));
});
