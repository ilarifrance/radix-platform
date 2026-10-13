'use strict';
(()=>{
const $=id=>document.getElementById(id);
const config={
orbit:['Sales Orbit','La vista intelligente delle relazioni commerciali.'],overview:['Panoramica','Il quadro operativo del team Sales.'],companies:['Aziende','Anagrafiche e relazioni B2B.'],contacts:['Contatti','Decisori, stakeholder e storico delle relazioni.'],pipeline:['Pipeline','Opportunità e avanzamento delle trattative.'],prospect:['Prospect Engine','Dalla ricerca al primo contatto: il percorso ispirato a Lydgen.'],lead:['Lead Intelligence','Qualificazione, scoring, enrichment e segnali di acquisto.'],outreach:['Outreach Studio','Sequenze e campagne commerciali con approvazione umana.'],email:['Email Hub','Posta, template e comunicazioni collegate al cliente.'],calendar:['Calendario','Appuntamenti, scadenze e sincronizzazione.'],todo:['To-do & Follow-up','Attività da completare e prossime azioni.'],activity:['Interazioni','Storico condiviso dei touchpoint commerciali.'],analytics:['Analytics','Trend commerciali, pipeline velocity e qualità dati.']};
const real={overview:'#dashboard',companies:'#companies',contacts:'#contacts',pipeline:'#opportunities',todo:'#tasks',activity:'#interactions'};
const e=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const add=(parent,...children)=>{children.forEach(c=>parent.append(c));return parent};
let view='orbit';
function openInfo(title,desc){$('dialog-title').textContent=title;$('dialog-desc').textContent=desc;$('dialog').showModal()}
$('close').onclick=()=>$('dialog').close();
$('ask').onclick=()=>openInfo('RADIX AI · Collegamento in sviluppo','Il motore advisory è in fase di integrazione con la proiezione Customer360 autorizzata. Nessun invio o azione automatica da questa anteprima.');
function head(title,subtitle){const wrap=e('div',undefined,'hero-head');const left=e('div');add(left,e('div','RADIX / SALES INTELLIGENCE','eyebrow'),e('h1',title),e('p',subtitle));wrap.append(left);return wrap}
function button(text,fn){const b=e('button',text);b.type='button';b.onclick=fn;return b}
function infoCard(label,content,action,fn){const c=e('article',undefined,'module-card');add(c,e('div','✧','glyph'),e('h3',label),e('p',content));if(action)c.append(button(action,fn));return c}
function realLink(hash){location.href='/radix-sales.html'+hash}
function orbit(){
 const root=e('div');const h=head('Il tuo universo commerciale','Dati, relazioni e decisioni in un unico luogo. Un concept interattivo: non rappresenta dati reali.');
 const toggle=e('div',undefined,'switch');
 const current=button('Vista Universo',()=>{toggle.querySelectorAll('button').forEach(b=>b.classList.remove('active'));current.classList.add('active');display.replaceChildren(network())});current.className='active';
 const list=button('Vista Moduli',()=>{toggle.querySelectorAll('button').forEach(b=>b.classList.remove('active'));list.classList.add('active');const grid=e('div',undefined,'module-grid');['companies','contacts','pipeline','todo','email','calendar','lead','prospect'].forEach(k=>grid.append(infoCard(config[k][0],config[k][1],'Apri',()=>navigate(k))));display.replaceChildren(grid)});
 add(toggle,current,list);h.append(toggle);root.append(h);
 const display=e('div');display.append(network());root.append(display);
 const kpi=e('div',undefined,'card-grid');
 [['◎','Opportunità','Il numero arriverà dal CRM'],['▥','Valore pipeline','Solo importi verificati'],['☑','Attività','Scadenze del workspace'],['✧','AI Copilot','Suggerimenti con evidenze']].forEach(([ico,title,sub])=>{const c=e('div',undefined,'kpi');add(c,e('span',ico,'ico'),e('strong','—'),e('b',title),e('div',sub));c.lastChild.className='muted';kpi.append(c)});root.append(kpi);
 const lower=e('div',undefined,'two');const a=e('div',undefined,'panel');a.append(e('h2','Pipeline · Vista rapida'));a.append(e('p','Indicatori e andamento saranno calcolati dai dati reali.'));a.append(button('Apri pipeline CRM ↗',()=>realLink('#opportunities')));const b=e('div',undefined,'panel');b.append(e('h2','La tua giornata'));b.append(e('p','Calendario, to-do, email e follow-up sono accessibili dal menu.'));b.append(button('Apri attività CRM ↗',()=>realLink('#tasks')));add(lower,a,b);root.append(lower);return root
}
function network(){const box=e('section',undefined,'universe');box.setAttribute('aria-label','Moduli Sales Orbit navigabili');add(box,e('div',undefined,'orbit-ring'),e('div',undefined,'orbit-ring second'),e('div',undefined,'orbit-ring third'),e('div','RADIX','planet'));[['companies','▤','Aziende','a'],['contacts','♧','Contatti','b'],['pipeline','◇','Opportunità','c'],['todo','☑','Attività','d'],['activity','≋','Interazioni','e']].forEach(([key,ico,label,pos])=>{const n=e('button',ico,'node '+pos);n.title='Apri '+label;n.type='button';n.append(e('small',label));n.onclick=()=>navigate(key);box.append(n)});return box}
function moduleView(key){
 if(key==='pipeline') { location.href='/sales-pipeline-premium.html'; return document.createElement('div'); }
 if(key==='lead'||key==='prospect') { location.href='/lead-intelligence.html'; return document.createElement('div'); }const root=e('div');root.append(head(config[key][0],config[key][1]));const stage=e('div',undefined,'detail-strip');if(real[key]){stage.append(e('span','MODULO CRM ESISTENTE','stage live'));stage.append(e('p','Apri la sezione operativa per consultare o modificare i dati autorizzati. Questa schermata è la nuova direzione grafica e non replica ancora le funzionalità backend.'));stage.append(button('Vai al CRM operativo ↗',()=>realLink(real[key])))}else{stage.append(e('span','INTERFACCIA CONCEPT · INTEGRAZIONE PIANIFICATA','stage'));stage.append(e('p','Questa sezione illustra il flusso progettato. Non è ancora collegata a posta, calendario, provider lead o invii esterni.'))}root.append(stage);
const grid=e('div',undefined,'module-grid');
const items={
email:[['Posta in arrivo','Gmail / Microsoft 365 con consenso e autorizzazione.'],['Email collegate ai clienti','Storico delle conversazioni nella Customer 360.'],['Bozze AI','Proposte modificabili e approvate prima dell’invio.'],['Template & Sequenze','Campagne con opt-out e controlli anti-spam.']],
calendar:[['Agenda personale','Eventi, appuntamenti e disponibilità.'],['Calendari condivisi','Coordinamento del team Sales.'],['Collegamento CRM','Associazione meeting a contatti e opportunità.'],['Promemoria','Scadenze e suggerimenti contestuali.']],
prospect:[['1 · Ricerca prospect','ICP, segmento, geografia e filtri avanzati.'],['2 · Enrichment','Dati aziendali e decisori con provenienza verificabile.'],['3 · Qualificazione','Scoring spiegabile e revisione commerciale.'],['4 · Outreach','Sequenze approvate, monitoraggio e CRM sync.']],
lead:[['Ideal Customer Profile','Criteri configurabili per segmento e prodotto.'],['Segnali commerciali','Intenzione e cambiamenti aziendali se disponibili le fonti.'],['Lead Scoring','Punteggio motivato da dati e regole.'],['Data Quality','Deduplica, provenienza, consensi e aggiornamento.']],
outreach:[['Campagne','Target, obiettivi, messaggi e varianti.'],['Personalizzazione','Bozze AI basate su informazioni verificate.'],['Approvazioni','Controllo umano obbligatorio prima dell’invio.'],['Misurazione','Risposte, conversioni e ROI attribuibile.']],
analytics:[['Pipeline Velocity','Tempo per fase e movimento delle opportunità.'],['Conversioni','Tassi per fonte, stage e commerciale.'],['Retention','Churn e LTV quando i dati lo consentono.'],['Campaign ROI','Costi e ricavi con fonti tracciabili.']],
todo:[['Da fare oggi','Task aperti e scadenze.'],['Follow-up suggeriti','Azioni proposte dall’advisory verificato.'],['Attività scadute','Priorità in base al contesto.'],['Assegnazioni','Task e responsabilità per workspace.']],
pipeline:[['Kanban','Fasi e opportunità configurabili.'],['Customer 360','Contatti, aziende e interazioni.'],['Forecast','Valutazioni con copertura dati dichiarata.'],['Next Best Action','Suggerimenti motivati, senza auto-esecuzione.']],
companies:[['Anagrafica','Aziende e responsabili.'],['Visione a 360°','Interazioni, task e opportunità.'],['Deduplica','Merge proposto e verificato.'],['Enrichment','Dati e aggiornamenti con provenienza.']],
contacts:[['Rubrica','Referenti e ruoli.'],['Relazioni','Storico di conversazioni e appuntamenti.'],['Consensi','Preferenze e opposizioni.'],['Attività','Prossimi contatti e promemoria.']],
activity:[['Storico','Interazioni registrate nel CRM.'],['Cronologia','Attività ordinate nel tempo.'],['Follow-up','Task collegati alle interazioni.'],['Collaborazione','Passaggi di consegne tra membri.']],
overview:[['Dashboard Sales','Indicatori dalla piattaforma.'],['Priorità','Attività e opportunità rilevanti.'],['Pipeline','Stato dei deal aperti.'],['Team','Performance e carichi autorizzati.']]
};
(items[key]||[]).forEach(([name,description])=>grid.append(infoCard(name,description,'Dettagli',()=>openInfo(name,description+' Funzione in evoluzione: nessun dato o azione simulata.'))));root.append(grid);return root}
function navigate(key){if(!config[key])key='orbit';view=key;document.querySelectorAll('#menu button').forEach(b=>{if(b.dataset.view===key)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});$('crumb').textContent=key.toUpperCase();$('page').replaceChildren(key==='orbit'?orbit():moduleView(key));history.replaceState(null,'','#'+key);window.scrollTo({top:0,behavior:'smooth'})}
document.querySelectorAll('#menu button').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
$('search').addEventListener('keydown',evt=>{if(evt.key!=='Enter')return;const q=$('search').value.trim().toLocaleLowerCase('it');const target=Object.keys(config).find(key=>config[key][0].toLocaleLowerCase('it').includes(q)||key.includes(q));if(target)navigate(target);else openInfo('Nessun modulo corrispondente','Cerca una sezione del menu, oppure utilizza il CRM operativo per cercare contatti e aziende.');});
navigate(location.hash.slice(1)||'orbit');
})();