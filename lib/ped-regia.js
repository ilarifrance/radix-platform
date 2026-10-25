/* RADIX PED «Regia del piano» — the side panel. F1: shortcuts, real numbers (no AI), the proposal card and undo.
   The plan changes only on «Sì, applica», through editorial-core and the page's own save (window.RadixPedPage).
   The AI chat (role ped-director) plugs into RadixRegia.propose(text) in the next phase. */
(function(){
'use strict';
const core=window.RadixEditorial,rg=window.RadixPedRegia,page=()=>window.RadixPedPage;
if(!core||!rg)return;
const el=(t,p,...kids)=>{const n=document.createElement(t);if(p)Object.assign(n,p);for(const k of kids)if(k!=null)n.append(k);return n};
let panel,log,undoBtn,current=null;
// A post on Buffer or already out is not changed from here; the user changes it from the post itself.
const outOf=c=>{const p=page();return !!(p&&(p.isOut(c)||p.queued(c.id)))||!!(c&&c.publication&&c.publication.service==='manual')};
const say=(text,cls)=>{const m=el('div',{className:'rx-regia-msg '+(cls||'bot'),textContent:text});log.append(m);log.scrollTop=log.scrollHeight;return m};

function digest(){const p=page();if(!p||!p.state())return;
 const d=rg.statsDigest(p.state(),{today:p.today(),kindOf:window.RadixPedViews&&window.RadixPedViews.mediaKind});
 say('Com’è andata?','me');say(rg.digestText(d));
 say('Questi sono i numeri veri dei tuoi post. Presto la Regia ti proporrà anche cosa cambiare, partendo da qui.','bot muted')}
function soon(label){say(label,'me');say('Questa parte arriva con la prossima versione della Regia. Intanto puoi usare «Ottimizza i post in programma» nei Risultati.','bot muted')}

// The proposal card: every change with its line, the discarded ones with the reason, then «Sì, applica» / «No».
function propose(raw){const p=page();if(!p||!p.state())return null;open();
 const v=rg.validateProposal(raw,p.state(),{today:p.today(),isOut:outOf});
 if(v.error){say(v.error,'bot muted');return v}
 current=v;const card=el('div',{className:'rx-regia-card'});
 card.append(el('strong',{textContent:'Proposta'}),v.summary?el('p',{textContent:v.summary}):null);
 if(v.ops.length)card.append(el('ul',null,...v.ops.map(o=>el('li',null,el('b',{textContent:rg.OP_LABELS[o.op]+': '}),rg.opText(o),o.gaps&&o.gaps.length?el('em',{textContent:' · da completare: '+o.gaps.join(', ')}):null))));
 else card.append(el('p',{className:'muted',textContent:'Nessuna modifica applicabile.'}));
 if(v.rejected.length)card.append(el('details',null,el('summary',{textContent:v.rejected.length+(v.rejected.length===1?' modifica scartata':' modifiche scartate')}),el('ul',null,...v.rejected.map(r=>el('li',{textContent:(r.title?'«'+r.title+'» · ':'')+r.reason})))));
 const yes=el('button',{type:'button',className:'primary',textContent:'Sì, applica',disabled:!v.ops.some(o=>o.op!=='frequency')}),no=el('button',{type:'button',textContent:'No'});
 const foot=el('div',{className:'rx-regia-actions'},yes,no,el('small',{className:'muted',textContent:'Nessun costo: cambia solo il piano. I post nuovi o cambiati tornano in revisione.'}));
 no.onclick=()=>{current=null;card.classList.add('is-closed');foot.replaceChildren(el('small',{className:'muted',textContent:'Proposta scartata: il piano non è cambiato.'}))};
 yes.onclick=()=>apply(v,card,foot);card.append(foot);log.append(card);log.scrollTop=log.scrollHeight;return v}
function apply(v,card,foot){const p=page();if(!p||current!==v)return;if(p.busy()){p.notify('Attendi la fine del lavoro in corso.');return}
 const out=rg.applyProposal(p.state(),v,{core,newId:()=>crypto.randomUUID()});current=null;card.classList.add('is-closed');
 const n=out.changed.length;foot.replaceChildren(el('small',{className:'muted',textContent:n?n+(n===1?' post cambiato':' post cambiati')+': rileggili e approvali nel piano.':'Nessun post cambiato.'}));
 if(out.failed.length)say('Non applicate: '+out.failed.join(' · '),'bot muted');
 if(n){p.persist('Regia: '+(v.summary||n+' modifiche al piano')+' · rileggi e approva i post cambiati.');p.renderPed()}refreshUndo()}
function undo(){const p=page();if(!p||!p.state())return;const e=rg.lastApplied(p.state());if(!e)return;if(p.busy()){p.notify('Attendi la fine del lavoro in corso.');return}
 const out=rg.undoLast(p.state(),{core});say('Annullata l’ultima proposta applicata'+(e.summary?' («'+e.summary.slice(0,80)+'»)':'')+': '+out.undone+(out.undone===1?' post tornato':' post tornati')+' com’erano.'+(out.failed.length?' Non riuscito: '+out.failed.join(' · '):''),'bot');
 p.persist('Regia: ultima proposta annullata.');p.renderPed();refreshUndo()}
function refreshUndo(){const p=page();undoBtn.hidden=!(p&&p.state()&&rg.lastApplied(p.state()))}

function build(){
 panel=el('aside',{className:'rx-regia',hidden:true,id:'regiaPanel'});panel.setAttribute('aria-label','Regia del piano');
 const close=el('button',{type:'button',className:'rx-regia-x',textContent:'✕',title:'Chiudi'});close.onclick=()=>{panel.hidden=true};
 const chips=el('div',{className:'rx-regia-chips'});
 [['Com’è andata?',digest],['Prepara la prossima settimana',()=>soon('Prepara la prossima settimana')],['Collega un canale',()=>soon('Collega un canale')],['Quanto mi costa?',()=>soon('Quanto mi costa?')]]
  .forEach(([t,f])=>{const b=el('button',{type:'button',className:'rx-regia-chip',textContent:t});b.onclick=f;chips.append(b)});
 log=el('div',{className:'rx-regia-log',role:'log'});
 undoBtn=el('button',{type:'button',className:'rx-regia-undo',textContent:'↶ Annulla l’ultima proposta applicata',hidden:true});undoBtn.onclick=undo;
 const input=el('input',{type:'text',placeholder:'La chat con la Regia arriva a breve',disabled:true});
 panel.append(el('header',null,el('strong',{textContent:'Regia del piano'}),close),chips,log,undoBtn,el('form',{className:'rx-regia-ask'},input,el('button',{type:'submit',textContent:'Invia',disabled:true})),el('small',{className:'rx-regia-note',textContent:'Il piano cambia solo quando premi «Sì, applica».'}));
 document.body.append(panel);
 say('Ciao, sono la Regia del piano. Leggo i risultati dei tuoi post e ti propongo modifiche al piano: niente cambia senza il tuo sì.');
 const btn=el('button',{type:'button',id:'openRegia',textContent:'Regia',title:'Risultati, proposte e modifiche al piano in un unico posto'});btn.onclick=()=>{panel.hidden?open():panel.hidden=true};
 const bar=document.querySelector('#pedPage .actions');if(bar)bar.append(btn);
}
function open(){if(!panel)build();panel.hidden=false;refreshUndo()}
build();
window.RadixRegia=Object.freeze({open,propose,digest,undo});
})();
