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

// The card in a sandbox (tiny fake DOM, fake RadixSalesApp, no network): after a recorded reply the page
// data is reloaded once the page is unlocked; refresh() is a no-op while it is locked (sales.js).
test('after «Segna come inviata» and «Invia» the page refreshes once unlocked, so the ticket list updates',async()=>{
 const vm=require('node:vm');
 const node=tag=>({tag,children:[],textContent:'',listeners:{},className:'',append(...n){this.children.push(...n)},addEventListener(t,f){this.listeners[t]=f},focus(){}});
 const find=(n,text)=>n.tag==='button'&&n.textContent===text?n:n.children.map(c=>find(c,text)).find(Boolean);
 const calls=[],state={busy:false,workspace:'w1'};
 const app={state,rows:()=>[{id:'c1',name:'Giulia Test',email:'giulia@test.it'}],writable:()=>true,notice(){},error(m){if(m)calls.push('error:'+m)},
  lock(v){state.busy=v},api:async(entity,o)=>{calls.push(entity+':'+o.body.action)},refresh:async()=>{calls.push(state.busy?'refresh-ignored':'refresh')}};
 const fetch=async url=>({ok:true,status:200,json:async()=>url==='/api/integrations/status'?{items:[{id:'email',configured:true}]}:{ok:true}});
 const box={tag:'div',children:[],append(...n){this.children.push(...n)}};
 const ctx={document:{createElement:node},window:{confirm:()=>true},fetch,RadixSalesApp:app};
 vm.runInNewContext(fs.readFileSync('sales/crm-send-direct.js','utf8'),ctx);
 vm.runInNewContext(fs.readFileSync('sales/crm-ticket-reply.js','utf8'),ctx);
 assert.equal(ctx.RadixCrmTicketReply.mount(box,T),true);
 const area=(function a(n){return n.tag==='textarea'?n:n.children.map(a).find(Boolean)})(box.children[0]);
 area.value='Gentile Giulia, verifichiamo.';
 await find(box.children[0],'Segna come inviata').listeners.click();
 assert.deepEqual(calls,['interactions:create','tickets:update','refresh']);
 calls.length=0;await find(box.children[0],'Invia').listeners.click();
 assert.deepEqual(calls,['interactions:create','tickets:update','refresh']);assert.equal(state.busy,false);
});
