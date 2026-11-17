'use strict';
/* «Campagne» of Sales Orbis (#campagne, Francesco 17/11): email campaigns in their own menu entry instead of a button in
   the Contatti bar. The same panels as before, already open: the contact segment (crm-tools.js) and the sequences and
   campaigns on it (crm-campaigns.js); every send still asks for its confirmation there. When the workspace has no
   connected mailbox, a note links to Impostazioni › Caselle email (the queue sends from those mailboxes). */
(()=>{
const content=document.getElementById('content');if(!content)return;
const app=()=>window.RadixSalesApp,ws=()=>app()?.state?.workspace||null;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
let busy=false,drawnWs=null;
function ensure(){
 if((location.hash||'')!=='#campagne'){document.getElementById('campagne')?.remove();return null}
 let s=document.getElementById('campagne');
 if(!s||s.parentNode!==content){s=E('section',undefined,'panel cg-section');s.id='campagne';const r=E('div',undefined,'row');r.append(E('h2','Campagne email'));s.append(r);content.append(s);drawnWs=null}
 content.querySelectorAll(':scope>section.rx-view').forEach(x=>{if(x!==s)x.classList.remove('rx-view')});s.classList.add('rx-view');document.documentElement.classList.add('rx-has-view');return s}
async function mailboxNote(s){
 if(!app()?.writable('interactions'))return;let d=null;try{d=await app().api('mailboxes',{})}catch{return}
 if(!s.isConnected||(d&&Array.isArray(d.rows)&&d.rows.length))return;
 const p=E('p','Nessuna casella email collegata: le campagne in coda partono dalle caselle del workspace. ','notice cg-mailbox');
 const a=E('a','Collega una casella in Impostazioni');a.href='/impostazioni.html?area=sales#caselle';p.append(a);
 s.querySelector(':scope>.row').after(p)}
function draw(){
 const s=ensure();if(!s||!ws()||!window.RadixCrmTools?.segmentPanel||!window.RadixCrmCampaigns)return;
 if(drawnWs===ws()&&s.querySelector(':scope>.crm-segment'))return;
 busy=true;drawnWs=ws();
 [...s.children].forEach(n=>{if(!n.classList.contains('row'))n.remove()});
 const lead=E('p','Scegli i contatti con il segmento, poi prepara la campagna o la sequenza: ogni invio chiede conferma. ','muted cg-lead');
 const plan=E('a','Pianifica le campagne (progetti, obiettivi, canali e budget)');plan.href='/sales-growth-campaigns.html';lead.append(plan);s.append(lead);
 const seg=RadixCrmTools.segmentPanel();seg.open=true;s.append(seg);
 const camp=RadixCrmCampaigns.panel(seg.filterOf);camp.open=true;s.append(camp);
 mailboxNote(s);
 requestAnimationFrame(()=>{busy=false})}
let q=false;const later=()=>{if(busy||q)return;q=true;setTimeout(()=>{q=false;draw()},60)};
new MutationObserver(()=>{if(!busy)later()}).observe(content,{childList:true});
addEventListener('hashchange',later);
document.getElementById('workspace')?.addEventListener('change',()=>{drawnWs=null;setTimeout(later,0)});
later();
})();
