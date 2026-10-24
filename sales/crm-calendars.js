'use strict';
/* Calendari: the bridge between the CRM and the person's own calendars (Outlook / Microsoft 365 and Google).
   - «Calendario da abbonare» (feedBox): the personal link of the CRM appointments as an iCalendar feed
     (api/_sales_calendar_feed.js). Outlook and Google subscribe to it once and keep it updated by themselves.
     The link is asked to the server (POST entity calendar_feed) only when the box is shown, once per workspace.
   - Deep link of the feed events: radix-sales.html?ws=<workspace>&contatto=<id>#contacts opens that contact's Customer360.
   Used by calendar-view.js (the Calendario page). */
(()=>{
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const post=async(workspace,entity,action,data)=>{
 const r=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace,entity,action,data:data||{}})});
 let d={};try{d=await r.json()}catch{}
 if(!r.ok)throw new Error(typeof d.error==='string'?d.error:'Richiesta rifiutata ('+r.status+').');return d};

/* ---------- «Calendario da abbonare» ---------- */
const feed={ws:null,url:'',error:'',pending:null};
function loadFeed(ws){
 if(feed.ws===ws&&(feed.url||feed.pending))return feed.pending||Promise.resolve();
 feed.ws=ws;feed.url='';feed.error='';
 feed.pending=post(ws,'calendar_feed','create').then(d=>{if(feed.ws===ws)feed.url=location.origin+d.path}).catch(e=>{if(feed.ws===ws)feed.error=e.message}).finally(()=>{if(feed.ws===ws)feed.pending=null});
 return feed.pending;
}
async function copy(text,input){
 try{await navigator.clipboard.writeText(text);return true}
 catch{try{input.focus();input.select();return document.execCommand('copy')}catch{return false}}
}
function fillFeed(box){
 box.replaceChildren(E('h3','Calendario da abbonare'),
  E('p','I tuoi appuntamenti, richiami e attività con scadenza del CRM dentro Outlook e Google Calendar. Si aggiornano da soli: le modifiche si fanno qui.','cal-empty'));
 if(feed.error){box.append(E('p',feed.error,'cal-feed-err'));const again=E('button','Riprova','cal-btn');again.type='button';again.onclick=()=>{feed.ws=null;render(box)};box.append(again);return}
 if(!feed.url){box.append(E('p','Preparo il tuo link…','cal-empty'));return}
 const row=E('div',undefined,'cal-feed-row');const input=E('input');input.type='text';input.readOnly=true;input.value=feed.url;input.setAttribute('aria-label','Link del calendario da abbonare');input.spellcheck=false;
 input.addEventListener('focus',()=>input.select());
 const btn=E('button','Copia link','cal-feed-copy');btn.type='button';const note=E('p','','cal-feed-note');note.setAttribute('aria-live','polite');
 btn.onclick=async()=>{const ok=await copy(feed.url,input);note.textContent=ok?'Link copiato: incollalo in Outlook o in Google Calendar.':'Copia non riuscita: seleziona il link e copialo a mano.'};
 row.append(input,btn);box.append(row,note);
 const steps=E('div',undefined,'cal-feed-steps');
 const o=E('section');o.append(E('h4','Outlook / Microsoft 365'));const ol=E('ol');
 for(const s of ['Apri il Calendario di Outlook (web o nuovo Outlook).','Aggiungi calendario › Da Internet (in alcune versioni «Sottoscrivi dal web»).','Incolla il link, dai un nome, ad esempio «RADIX CRM», e conferma.'])ol.append(E('li',s));o.append(ol);
 const g=E('section');g.append(E('h4','Google Calendar'));const gl=E('ol');
 for(const s of ['Apri Google Calendar dal computer.','Accanto ad «Altri calendari» premi + › Da URL.','Incolla il link e premi «Aggiungi calendario».'])gl.append(E('li',s));g.append(gl);
 steps.append(o,g);box.append(steps);
 box.append(E('p','Google rilegge i calendari abbonati ogni qualche ora (non subito); Outlook di solito entro un’ora. Il link è personale: chi lo possiede vede i tuoi appuntamenti, non condividerlo.','cal-feed-warn'));
}
function render(box){const ws=window.RadixCrmData?.workspace();if(!ws){box.replaceChildren(E('h3','Calendario da abbonare'),E('p','Scegli un workspace.','cal-empty'));return}
 fillFeed(box);if(feed.ws!==ws||(!feed.url&&!feed.error&&!feed.pending))loadFeed(ws).then(()=>{if(box.isConnected)fillFeed(box)});}
function feedBox(){const box=E('section',undefined,'cal-card cal-feed');render(box);return box}

/* ---------- Deep link from a feed event: ?ws=…&contatto=… opens the contact's Customer360 ---------- */
(function deepLink(){
 const q=new URLSearchParams(location.search),id=q.get('contatto'),ws=q.get('ws');if(!UUID.test(id||''))return;
 let tries=0,switched=false;
 const done=()=>{clearInterval(t);const u=new URL(location.href);u.searchParams.delete('contatto');u.searchParams.delete('ws');history.replaceState(null,'',u.pathname+(u.search||'')+u.hash)};
 const t=setInterval(()=>{const a=window.RadixSalesApp;if(++tries>80)return done();if(!a||!a.state.ready||a.state.busy)return;
  if(UUID.test(ws||'')&&a.state.workspace!==ws){if(switched||!a.state.workspaces.some(w=>w.id===ws))return done();
   const sel=document.getElementById('workspace');if(!sel)return done();switched=true;sel.value=ws;sel.dispatchEvent(new Event('change'));return}
  const row=(a.rows('contacts')||[]).find(r=>r.id===id)||{id,name:'Contatto'};done();a.openCustomer('contacts',row)},250);
})();

window.RadixCrmCalendars={feedBox,post};
})();
