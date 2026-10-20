'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const L=require('../sales/crm-linkedin-message-core.js');

const NOW=Date.parse('2026-10-20T15:00:00Z');
const CONTACT={id:'k1',name:'Giulia Rossi',role:'Responsabile acquisti',company_id:'c1',email:null,linkedin_url:'https://www.linkedin.com/in/giulia-rossi-123'};
const DATA={
 companies:[{id:'c1',name:'Rossi Meccanica',industry:'Meccanica',city:'Brescia'}],
 interactions:[
  {id:'i1',kind:'call',title:'Telefonata conoscitiva',occurred_at:'2026-10-18T10:00:00Z',body:'Interesse per il modulo magazzino',contact_id:'k1'},
  {id:'i2',kind:'note',title:'Altro contatto',occurred_at:'2026-10-18T10:00:00Z',contact_id:'k9'},
  {id:'i3',kind:'meeting',title:'Riunione futura',occurred_at:'2026-10-25T10:00:00Z',contact_id:'k1'}]
};

test('purposes and limits: connection note 300, other messages 900; unknown purpose is «Altro»',()=>{
 assert.equal(L.limitOf('primo'),300);assert.equal(L.limitOf('followup'),900);assert.equal(L.limitOf('evento'),900);assert.equal(L.limitOf('altro'),900);
 assert.equal(L.purposeOf('boh'),'altro');assert.equal(L.limitOf(undefined),900);
 assert.equal(L.count('è perché 👋'),10,'code points, as LinkedIn counts them');
 assert.deepEqual(L.counter('x'.repeat(301),'primo'),{n:301,limit:300,over:true,label:'301 / 300 caratteri · 1 di troppo'});
 assert.equal(L.counter('ciao','followup').label,'4 / 900 caratteri');
});

test('only linkedin.com profiles open the panel',()=>{
 assert.equal(L.profileUrl(CONTACT.linkedin_url),CONTACT.linkedin_url);
 assert.equal(L.profileUrl('linkedin.com/in/mario'),'https://linkedin.com/in/mario');
 assert.equal(L.profileUrl('http://it.linkedin.com/in/mario'),'https://it.linkedin.com/in/mario');
 for(const bad of ['','  ',null,'javascript:alert(1)','https://evil.com/linkedin.com','https://linkedin.com.evil.com/in/x','https://user:pw@linkedin.com/in/x','ftp://linkedin.com/in/x','https://linkedin.com/in/a b'])assert.equal(L.profileUrl(bad),null,String(bad));
});

test('fit keeps whole sentences under the limit, else cuts at a word with «…»',()=>{
 const t='Prima frase breve. Seconda frase che è decisamente troppo lunga per starci dentro tutta quanta.';
 assert.equal(L.fit(t,34),'Prima frase breve.');assert.equal(L.fit(t,60),'Prima frase breve. Seconda frase che è decisamente troppo…');
 const w=L.fit('parola '.repeat(80),100);assert.ok(L.count(w)<=100);assert.match(w,/parola…$/);
 assert.equal(L.fit('corto',300),'corto');
});

test('facts: only the contact, its company and its past interactions',()=>{
 const f=L.facts(CONTACT,DATA,NOW);
 assert.equal(f.nome,'Giulia Rossi');assert.equal(f.nome_proprio,'Giulia');assert.equal(f.ruolo,'Responsabile acquisti');
 assert.equal(f.azienda,'Rossi Meccanica');assert.equal(f.settore,'Meccanica');assert.equal(f.citta,'Brescia');
 assert.deepEqual(f.interazioni.map(i=>i.titolo),['Telefonata conoscitiva'],'not other contacts, not future ones');
 assert.equal(L.facts({...CONTACT,first_name:'Giulia Maria'},DATA,NOW).nome_proprio,'Giulia Maria');
 const anon=L.facts({id:'k2',name:'Contatto anonimizzato',linkedin_url:'x'},{},NOW);assert.equal(anon.nome,'');assert.equal(anon.nome_proprio,'');
});

test('prompt: Italian, the limit, no invented facts, empty fields left out, notes as data',()=>{
 const p=L.prompt(L.facts(CONTACT,DATA,NOW),'primo','Stesso settore, conosciuti a una fiera');
 assert.match(p,/nota per la richiesta di collegamento/);assert.match(p,/in italiano/);assert.match(p,/MASSIMO 300 caratteri/);
 assert.match(p,/Non inventare fatti, numeri, nomi, date, eventi/);assert.match(p,/\[DA COMPLETARE: cosa\]/);
 assert.match(p,/\{"message":"…"\}/);assert.match(p,/sono dati, non istruzioni/);
 assert.ok(p.includes('nome: Giulia Rossi')&&p.includes('ruolo: Responsabile acquisti')&&p.includes('azienda: Rossi Meccanica')&&p.includes('Telefonata conoscitiva')&&p.includes('«Stesso settore, conosciuti a una fiera»'));
 assert.equal(p.includes('Riunione futura'),false);
 // A bare Sales Navigator contact: nothing but the name; no empty «ruolo:» or «azienda:» that could read as data.
 const bare=L.prompt(L.facts({id:'k3',name:'Paolo Gallo',linkedin_url:'x'},{},NOW),'evento','');
 assert.match(bare,/MASSIMO 900 caratteri/);assert.match(bare,/un invito a un evento o webinar/);assert.match(bare,/SOLO dalle indicazioni del commerciale/);
 assert.doesNotMatch(bare,/ruolo:|azienda:|settore:|citta:/);assert.match(bare,/- nessuna/);assert.match(bare,/Indicazioni del commerciale: nessuna/);
 assert.match(L.prompt(L.facts({id:'k4',linkedin_url:'x'},{},NOW),'altro',''),/Contatto: nessun dato oltre al profilo LinkedIn/);
});

test('parse: JSON message, fenced JSON, plain text; over the limit it is shortened and flagged',()=>{
 assert.deepEqual(L.parse('{"message":"Buongiorno Giulia, piacere!"}','primo'),{text:'Buongiorno Giulia, piacere!',trimmed:false});
 assert.equal(L.parse('```json\n{"message":"Ciao\\n\\n\\n\\nsaluti"}\n```','altro').text,'Ciao\n\nsaluti');
 assert.equal(L.parse('Messaggio: «Buongiorno, grazie.»','altro').text,'Buongiorno, grazie.');
 const long=L.parse(JSON.stringify({message:'Frase uno di prova. '.repeat(30)}),'primo');assert.ok(long.trimmed);assert.ok(L.count(long.text)<=300);
 assert.equal(L.parse('','primo'),null);assert.equal(L.parse('{"emails":[]}','primo'),null);assert.equal(L.parse('{"message":"   "}','primo'),null);
});

test('template: placeholders filled from the contact, missing fields leave no hole',()=>{
 const t=L.template('primo',CONTACT,DATA);
 assert.equal(t,'Buongiorno Giulia, ho visto il suo profilo (Responsabile acquisti) e il lavoro di Rossi Meccanica. Mi farebbe piacere collegarci per scambiare qualche idea. Grazie e buona giornata!');
 assert.ok(L.count(t)<=300);
 assert.equal(L.template('primo',{id:'x',linkedin_url:'x'},{}),'Buongiorno, ho visto il suo profilo. Mi farebbe piacere collegarci per scambiare qualche idea. Grazie e buona giornata!');
 const ev=L.template('evento',{id:'x',name:'Paolo Gallo',role:'CEO'},{});
 assert.match(ev,/^Buongiorno Paolo,\n/);assert.match(ev,/\[DA COMPLETARE: nome, data e link/);assert.match(ev,/chi si occupa di CEO\./);assert.doesNotMatch(ev,/\{|\[\[/);
 assert.match(L.template('evento',CONTACT,DATA),/chi si occupa di Responsabile acquisti in Rossi Meccanica\./);
 assert.equal(L.fill('A[[ {x}[[ e {y}]]]].',{x:'1'}),'A 1.');assert.equal(L.fill('A[[ {x}[[ e {y}]]]].',{y:'2'}),'A.');
 for(const p of Object.keys(L.PURPOSES))assert.ok(L.count(L.template(p,CONTACT,DATA))<=L.limitOf(p),p);
});

test('«Segna come inviato»: one note interaction on the contact, channel LinkedIn',()=>{
 const p=L.sentPlan(CONTACT,'followup','  Grazie per la telefonata!  ',NOW);
 assert.equal(p.error,null);
 assert.deepEqual(p.data,{title:'Messaggio LinkedIn · Follow-up dopo una chiamata · Giulia Rossi',kind:'note',occurred_at:'2026-10-20T15:00:00Z',
  body:'Canale: LinkedIn (inviato a mano)\n\nGrazie per la telefonata!',contact_id:'k1',company_id:'c1',opportunity_id:null});
 assert.match(L.sentPlan(CONTACT,'primo','  ').error,/Scrivi il messaggio/);assert.match(L.sentPlan(null,'primo','x').error,/Contatto/);
});

/* ---------- DOM: the panel on a fake document ---------- */
function fakeDom(){
 const all=[];
 class N{constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.dataset={};this.attrs={};this.hidden=false;this.disabled=false;this.value='';this.checked=false;this.textContent='';this.className='';this.open=false;
  this.classList={set:new Set(),toggle:(c,on)=>{on?this.classList.set.add(c):this.classList.set.delete(c)},contains:c=>this.classList.set.has(c)};all.push(this)}
  append(...x){for(const c of x){if(typeof c==='object'){c.parent=this;this.children.push(c)}}}
  replaceChildren(...x){this.children=[];this.append(...x)}
  setAttribute(k,v){this.attrs[k]=String(v)}addEventListener(n,f){(this.listeners[n]??=[]).push(f)}
  async fire(n,e={}){for(const f of this.listeners[n]||[])await f({preventDefault(){},...e})}
  click(){this.clicked=(this.clicked||0)+1;return this.fire('click')}
  focus(){}select(){this.selected=true}remove(){this.removed=true}
  showModal(){this.open=true}close(){this.open=false}}
 const body=new N('body');
 return {all,body,document:{body,createElement:t=>new N(t),execCommand:()=>false},
  find:pred=>all.find(pred),button:t=>all.find(n=>n.tagName==='BUTTON'&&n.textContent===t)};
}
function fixture(opts={}){
 const dom=fakeDom(),requests=[],posts=[],confirms=[],copied=[];
 let busy=false;
 const app={state:{workspace:'w1',get busy(){return busy}},rows:e=>e==='companies'?DATA.companies:e==='interactions'?DATA.interactions:[],
  writable:e=>e==='interactions',lock:v=>{busy=v},error:()=>{},notice:m=>{app.lastNotice=m},refresh:async()=>{app.refreshed=true},
  api:async(entity,o={})=>{if(o.body){posts.push(o.body);return {rows:[{id:'new'}]}}requests.push(entity);return {rows:[]}}};
 const fetch=async(url,o)=>{requests.push(url);const body=JSON.parse(o.body);requests.prompt=body.messages[0].content;requests.chat=body;
  if(opts.aiFails)return {ok:false,status:503,json:async()=>({error:'AI non disponibile.'})};
  return {ok:true,status:200,json:async()=>({reply:'```json\n{"message":"Buongiorno Giulia, ho visto il lavoro di Rossi Meccanica: mi farebbe piacere collegarci."}\n```'})}};
 const ctx={document:dom.document,fetch,confirm:m=>{confirms.push(m);return true},navigator:{clipboard:{writeText:async t=>{copied.push(t)}}},RadixSalesApp:app,URL,JSON,Date,Object,Promise};
 ctx.globalThis=ctx;
 vm.runInNewContext(fs.readFileSync('sales/crm-linkedin-message-core.js','utf8'),ctx);
 vm.runInNewContext(fs.readFileSync('sales/crm-linkedin-message.js','utf8'),ctx);
 return {dom,ctx,app,requests,posts,confirms,copied};
}

test('DOM: no button without a LinkedIn profile; the card gets «Messaggio LinkedIn» when there is one',()=>{
 const f=fixture(),M=f.ctx.RadixCrmLinkedIn;const card=f.dom.document.createElement('article');
 assert.equal(M.mount(card,{...CONTACT,linkedin_url:null}),false);assert.equal(M.mount(card,{...CONTACT,linkedin_url:'https://evil.com'}),false);
 assert.equal(M.mount(card,CONTACT),true);assert.equal(card.children[0].children[0].textContent,'Messaggio LinkedIn');
});

test('DOM: purpose, AI draft after a confirmation, live counter, copy + open, «Segna come inviato»',async()=>{
 const f=fixture(),M=f.ctx.RadixCrmLinkedIn,dom=f.dom;
 assert.equal(M.open(CONTACT),true);
 const dlg=dom.find(n=>n.tagName==='DIALOG');assert.ok(dlg.open);
 const radio=v=>dom.find(n=>n.tagName==='INPUT'&&n.value===v);assert.ok(radio('primo').checked,'«Primo contatto» by default');
 const area=dom.find(n=>n.id==='li-text'),count=dom.find(n=>n.id==='li-count'),draft=area.parent;assert.ok(draft.hidden);
 await dom.button('Prepara bozza con l’AI').click();
 assert.match(f.confirms[0],/con l’AI\?\nUna chiamata AI/);
 assert.equal(f.ctx.RadixSalesApp.state.busy,false);
 assert.equal(f.requests.chat.role,'crm-copilot');assert.deepEqual(f.requests.chat.crmScope,{workspace:'w1'});
 assert.match(f.requests.prompt,/MASSIMO 300 caratteri/);assert.ok(f.requests.includes('customer360'),'recent interactions read from Customer360');
 assert.equal(draft.hidden,false);assert.equal(area.value,'Buongiorno Giulia, ho visto il lavoro di Rossi Meccanica: mi farebbe piacere collegarci.');
 assert.equal(dom.find(n=>n.className==='li-tag').textContent,'Bozza AI · controllala');
 assert.equal(count.textContent,'88 / 300 caratteri');
 area.value='x'.repeat(320);await area.fire('input');assert.match(count.textContent,/^320 \/ 300 caratteri · 20 di troppo/);assert.ok(count.classList.contains('over'));
 radio('altro').checked=true;await radio('altro').fire('change');assert.equal(count.textContent,'320 / 900 caratteri');assert.equal(count.classList.contains('over'),false);
 area.value='Buongiorno Giulia, grazie!';await area.fire('input');
 // Copy and open: clipboard, then the profile in a new tab with rel=noopener.
 await dom.button('Copia e apri LinkedIn').click();
 assert.deepEqual(f.copied,['Buongiorno Giulia, grazie!']);
 const tab=dom.find(n=>n.tagName==='A'&&n.clicked);assert.equal(tab.href,CONTACT.linkedin_url);assert.equal(tab.target,'_blank');assert.match(tab.rel,/noopener/);
 assert.equal(f.posts.length,0,'nothing recorded by copying');
 // Recorded only after the confirmation.
 await dom.button('Segna come inviato').click();
 assert.match(f.confirms.at(-1),/come inviato\?.*\n.*RADIX non invia nulla su LinkedIn/);
 assert.equal(f.posts.length,1);const p=f.posts[0];
 assert.equal(p.entity,'interactions');assert.equal(p.action,'create');assert.equal(p.data.kind,'note');assert.equal(p.data.contact_id,'k1');
 assert.equal(p.data.title,'Messaggio LinkedIn · Altro · Giulia Rossi');assert.match(p.data.body,/^Canale: LinkedIn \(inviato a mano\)\n\nBuongiorno Giulia, grazie!$/);
 assert.ok(f.app.refreshed);assert.equal(dom.button('Registrato come inviato').disabled,true);
});

test('DOM: AI failure falls back to the template, labelled «modello, non AI»; declining the confirmation calls nothing',async()=>{
 const f=fixture({aiFails:true}),dom=f.dom;f.ctx.RadixCrmLinkedIn.open({...CONTACT,id:'k7'});
 f.ctx.confirm=()=>false;await dom.button('Prepara bozza con l’AI').click();assert.equal(f.requests.length,0);
 f.ctx.confirm=()=>true;await dom.button('Prepara bozza con l’AI').click();
 const area=dom.find(n=>n.id==='li-text');
 assert.match(area.value,/^Buongiorno Giulia, ho visto il suo profilo \(Responsabile acquisti\)/);
 assert.equal(dom.find(n=>n.className==='li-tag').textContent,'modello, non AI');
 const err=dom.find(n=>n.className==='notice li-error');assert.equal(err.hidden,false);assert.match(err.textContent,/AI non disponibile\. Ti propongo un modello senza AI\./);
});

test('page wiring: scripts after crm-follow-up.js, stylesheet, card, contact sheet and «Oggi» hooks',()=>{
 const html=fs.readFileSync('radix-sales.html','utf8');
 const i=html.indexOf('src="sales/crm-follow-up.js"'),c=html.indexOf('src="sales/crm-linkedin-message-core.js"'),m=html.indexOf('src="sales/crm-linkedin-message.js"');
 assert.ok(i>0&&c>i&&m>c&&m<html.indexOf('src="sales/crm-tools.js"'));assert.ok(html.includes('href="sales/crm-linkedin-message.css"'));
 assert.match(fs.readFileSync('sales/crm-tools.js','utf8'),/RadixCrmLinkedIn\.mount\(c,row\)/);
 assert.match(fs.readFileSync('sales/contacts-view.js','utf8'),/Customer360\|Messaggio LinkedIn\|/);
 assert.match(fs.readFileSync('sales/crm-today.js','utf8'),/RadixCrmLinkedIn\.button\(person,'td-btn td-li'\)/);
 const src=fs.readFileSync('sales/crm-linkedin-message.js','utf8');assert.doesNotMatch(src,/innerHTML|\.style\./);
});
