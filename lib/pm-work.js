/* RADIX PM work layer — the everyday side of the project manager, taken from the tools teams use every day:
   quick add in plain words (Todoist), «Le mie attività» across projects (Asana My Tasks, Monday My Work),
   project health and status updates (Asana), month calendar, sorting and grouping of the list (Monday tables),
   project templates (Monday/ClickUp) and the AI break-down of an activity into sub-tasks (ClickUp Brain).
   Pure functions (no DOM, no I/O): the page and the tests share them. Dates are YYYY-MM-DD. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPMWork=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const DAY=86400000;
const todayIso=now=>new Date(now==null?Date.now():now).toISOString().slice(0,10);
const at=iso=>new Date(iso+'T12:00:00Z');
const iso=d=>d.toISOString().slice(0,10);
const plus=(day,n)=>{const d=at(day);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
const days=(a,b)=>Math.round((at(b)-at(a))/DAY);
const fold=s=>String(s||'').toLocaleLowerCase('it').normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
const PRIORITIES=['Urgente','Alta','Media','Bassa'];
const PRIORITY_RANK={Urgente:0,Alta:1,Media:2,Bassa:3};

// ---- Quick add: «Chiamare Rossi venerdì @Marco !alta #Vendite» → title, due, owner, priority, phase ----
// Full day names only: short forms («mar», «set») are also ordinary words in titles.
const WEEKDAYS=[['domenica','sunday'],['lunedi','monday'],['martedi','tuesday'],['mercoledi','wednesday'],['giovedi','thursday'],['venerdi','friday'],['sabato','saturday']];
const MONTHS=[['gennaio','gen','january','jan'],['febbraio','feb','february'],['marzo','mar','march'],['aprile','apr','april'],['maggio','mag','may'],['giugno','giu','june','jun'],['luglio','lug','july','jul'],['agosto','ago','august','aug'],['settembre','set','september','sep','sept'],['ottobre','ott','october','oct'],['novembre','nov','november'],['dicembre','dic','december','dec']];
const PRIORITY_WORDS={urgente:'Urgente',urgent:'Urgente','1':'Urgente',p1:'Urgente',alta:'Alta',high:'Alta','2':'Alta',p2:'Alta',media:'Media',medium:'Media','3':'Media',p3:'Media',bassa:'Bassa',low:'Bassa','4':'Bassa',p4:'Bassa'};
const weekday=w=>WEEKDAYS.findIndex(names=>names.includes(w));
const month=w=>MONTHS.findIndex(names=>names.includes(w));
function validDay(y,m,d){const x=new Date(Date.UTC(y,m,d,12));return x.getUTCFullYear()===y&&x.getUTCMonth()===m&&x.getUTCDate()===d?iso(x):null}
// A day/month without a year is the next one from today (a date already past this year means next year).
function nextOf(today,m,d){const y=at(today).getUTCFullYear();const a=validDay(y,m,d);if(a&&a>=today)return a;return validDay(y+1,m,d)}
function nextWeekday(today,w,strict){const cur=at(today).getUTCDay();let n=(w-cur+7)%7;if(n===0&&strict)n=7;return plus(today,n)}
function endOfMonth(today){const d=at(today);return iso(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)))}
function addMonths(today,n){const d=at(today),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return iso(d)}
// Date phrases, longest first. Each returns [matched word count, date] or null. Words are folded (no accents).
function dateAt(words,i,today){
 const w=words[i],n1=words[i+1],n2=words[i+2],n3=words[i+3];
 if(w==='oggi'||w==='stasera'||w==='today'||w==='tonight')return [1,today];
 if(w==='domani'||w==='tomorrow')return [1,plus(today,1)];
 if(w==='dopodomani')return [1,plus(today,2)];
 if((w==='fine'&&n1==='mese')||(w==='end'&&n1==='of'&&n2==='month'))return [w==='end'?3:2,endOfMonth(today)];
 if((w==='fine'&&n1==='settimana')||(w==='end'&&n1==='of'&&n2==='week'))return [w==='end'?3:2,nextWeekday(today,5,false)];
 if((w==='prossima'&&n1==='settimana')||(w==='settimana'&&n1==='prossima')||(w==='next'&&n1==='week'))return [2,nextWeekday(today,1,true)];
 if((w==='prossimo'&&n1==='mese')||(w==='mese'&&n1==='prossimo')||(w==='next'&&n1==='month'))return [2,addMonths(today,1)];
 if((w==='tra'||w==='fra'||w==='in')&&/^\d{1,3}$/.test(n1||'')){const n=Number(n1);
  if(/^(giorn[oi]|days?)$/.test(n2||''))return [3,plus(today,n)];
  if(/^(settiman[ae]|weeks?)$/.test(n2||''))return [3,plus(today,7*n)];
  if(/^(mes[ei]|months?)$/.test(n2||''))return [3,addMonths(today,n)];}
 if((w==='prossimo'||w==='prossima'||w==='next')&&weekday(n1)>=0)return [2,nextWeekday(today,weekday(n1),true)];
 if(weekday(w)>=0){const strict=n1==='prossimo'||n1==='prossima';return [strict?2:1,nextWeekday(today,weekday(w),true)]}
 // «15/11», «15-11-2026», «15.11.26»
 let m=/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(w);
 if(m){const d=+m[1],mo=+m[2]-1;let out;if(m[3]){const y=m[3].length===2?2000+Number(m[3]):Number(m[3]);out=validDay(y,mo,d)}else out=nextOf(today,mo,d);return out?[1,out]:null}
 // «2026-11-15»
 if(/^\d{4}-\d{2}-\d{2}$/.test(w)){const [y,mo,d]=w.split('-').map(Number);const out=validDay(y,mo-1,d);return out?[1,out]:null}
 // «15 novembre», «il 15 nov 2026», «15»
 if(/^\d{1,2}$/.test(w)&&Number(w)>=1&&Number(w)<=31){const d=Number(w);
  if(n1&&month(n1)>=0){const mo=month(n1);if(n2&&/^\d{4}$/.test(n2)){const out=validDay(Number(n2),mo,d);return out?[3,out]:null}const out=nextOf(today,mo,d);return out?[2,out]:null}
  if(i>0&&(words[i-1]==='il'||words[i-1]==='entro'))return (()=>{const t=at(today);let out=validDay(t.getUTCFullYear(),t.getUTCMonth(),d);if(!out||out<today){const nx=at(addMonths(iso(new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth(),1,12))),1));out=validDay(nx.getUTCFullYear(),nx.getUTCMonth(),d)}return out?[1,out]:null})();}
 void n3;return null;
}
const FILLERS=new Set(['entro','il','per','by','on','due','scadenza','lo','la','del','di']);
// people: names already used in the plan; phases: [{id,name}]; me: the signed-in person's name.
function parseQuick(text,{today,people=[],phases=[],me=''}={}){
 today=today||todayIso();const raw=String(text||'').replace(/\s+/g,' ').trim();
 const out={title:'',due:'',owner:'',priority:'',subproject:'',milestone:false,tokens:[],unknown:[]};
 if(!raw)return out;
 const parts=raw.split(' '),keep=new Array(parts.length).fill(true),folded=parts.map(p=>fold(p).replace(/[,;.!?]+$/,''));
 parts.forEach((p,i)=>{
  if(/^@\S+/.test(p)){const name=p.slice(1).replace(/[,;.]+$/,''),f=fold(name);keep[i]=false;
   if(['io','me','mio','mia'].includes(f)&&me){out.owner=me;out.tokens.push({kind:'owner',label:me});return}
   const match=people.find(x=>fold(x)===f)||people.find(x=>fold(x).split(/\s+/).some(part=>part.startsWith(f)));
   out.owner=match||name.charAt(0).toUpperCase()+name.slice(1);out.tokens.push({kind:'owner',label:out.owner,new:!match});return}
  if(/^#\S+/.test(p)){const f=fold(p.slice(1).replace(/[-_]+/g,' ').replace(/[,;.]+$/,''));keep[i]=false;
   const ph=phases.find(x=>fold(x.name)===f)||phases.find(x=>fold(x.name).startsWith(f))||phases.find(x=>fold(x.name).split(/\s+/).some(w=>w.startsWith(f)));
   if(ph){out.subproject=ph.id;out.tokens.push({kind:'phase',label:ph.name})}else out.unknown.push(p);return}
  if(/^!\S+/.test(p)||/^p[1-4]$/i.test(p)){const f=fold(p.replace(/^!/,''));if(f==='milestone'||f==='traguardo'){keep[i]=false;out.milestone=true;out.tokens.push({kind:'milestone',label:'Milestone'});return}
   if(PRIORITY_WORDS[f]){keep[i]=false;out.priority=PRIORITY_WORDS[f];out.tokens.push({kind:'priority',label:out.priority})}}
 });
 // the last date phrase wins (people write «domani… anzi venerdì»), fillers right before it go with it
 let found=null;for(let i=0;i<folded.length;i++){if(!keep[i])continue;const r=dateAt(folded.map((w,j)=>keep[j]?w:''),i,today);if(r){found={i,n:r[0],day:r[1]};i+=r[0]-1}}
 if(found){for(let k=found.i;k<found.i+found.n;k++)keep[k]=false;let b=found.i-1;while(b>=0&&keep[b]&&FILLERS.has(folded[b])){keep[b]=false;b--}out.due=found.day;out.tokens.push({kind:'due',label:found.day})}
 out.title=parts.filter((p,i)=>keep[i]).join(' ').replace(/\s+([,;.])/g,'$1').replace(/[\s,;-]+$/,'').trim();
 return out;
}

// ---- «Le mie attività»: open activities of one person across every project, by urgency ----
function isMe(owner,me){const a=fold(owner),b=fold(me);if(!a||!b)return false;if(a===b||a==='io')return true;const first=b.split(/\s+/)[0];return a===first||a.split(/\s+/)[0]===first&&a.split(/\s+/).length===1}
const GROUPS=[['late','Scadute'],['today','Oggi'],['week','Prossimi 7 giorni'],['later','Più avanti']];
function myWork(entries,{me,today,everyone=false}={}){
 today=today||todayIso();const groups=GROUPS.map(([id,label])=>({id,label,items:[]}));const by=Object.fromEntries(groups.map(g=>[g.id,g]));let done7=0;
 for(const e of entries||[]){const s=e&&e.state;if(!s||!Array.isArray(s.tasks))continue;const subs=new Map(((s.projects||[])[0]||{subprojects:[]}).subprojects.map(x=>[x.id,x.name]));
  for(const t of s.tasks){if(!everyone&&!isMe(t.owner,me))continue;
   if(t.status==='Completato'){if(t.completedAt&&days(String(t.completedAt).slice(0,10),today)<=7)done7++;continue}
   const d=days(today,t.due),g=d<0?'late':d===0?'today':d<=7?'week':'later';
   by[g].items.push({projectId:e.id,projectName:e.name,phase:subs.get(t.subproject)||'',task:t,inDays:d})}}
 for(const g of groups)g.items.sort((a,b)=>a.task.due.localeCompare(b.task.due)||(PRIORITY_RANK[a.task.priority]??9)-(PRIORITY_RANK[b.task.priority]??9)||a.task.title.localeCompare(b.task.title,'it'));
 return {groups,open:groups.reduce((n,g)=>n+g.items.length,0),late:by.late.items.length,doneWeek:done7};
}
// @mentions in a comment: «@Marco» matches a person of the plan by first name or whole name.
function mentions(text,people){const out=new Set();for(const m of String(text||'').matchAll(/@([\p{L}][\p{L}'-]*)/gu)){const f=fold(m[1]);const p=(people||[]).find(x=>fold(x)===f)||(people||[]).find(x=>fold(x).split(/\s+/)[0]===f);if(p)out.add(p)}return [...out]}
// Comments of the last `within` days that mention me, newest first.
function mentionsOf(entries,me,{today,within=14,people}={}){today=today||todayIso();const out=[];
 for(const e of entries||[]){const s=e&&e.state;if(!s)continue;const names=people||[...new Set(s.tasks.map(t=>t.owner).concat(me?[me]:[]))];
  for(const t of s.tasks)for(const c of t.comments||[]){if(isMe(c.by,me))continue;if(days(String(c.at).slice(0,10),today)>within)continue;if(mentions(c.text,names).some(n=>isMe(n,me)))out.push({projectId:e.id,projectName:e.name,task:t,comment:c})}}
 return out.sort((a,b)=>String(b.comment.at).localeCompare(String(a.comment.at)));}

// ---- Project health (Asana: In linea / A rischio / Fuori strada) with the reasons behind it ----
const HEALTH_EN={'In linea':'On track','A rischio':'At risk','Fuori strada':'Off track'};
function health(tasks,{today,en}={}){today=today||todayIso();const open=(tasks||[]).filter(t=>t.status!=='Completato');const L=(it,e)=>en?e:it;
 if(!(tasks||[]).length)return {health:'',reasons:[L('Il piano non ha ancora attività.','The plan has no tasks yet.')]};
 if(!open.length)return {health:'In linea',reasons:[L('Tutte le attività sono completate.','Every task is done.')],done:true};
 const late=open.filter(t=>t.due<today),lateMs=late.filter(t=>t.milestone),soon=open.filter(t=>t.due>=today&&days(today,t.due)<=3);
 const blockedSoon=soon.filter(t=>(t.dependencies||[]).some(id=>{const d=tasks.find(x=>x.id===id);return d&&d.status!=='Completato'&&d.due<today}));
 const urgentLate=late.filter(t=>t.priority==='Urgente'||t.priority==='Alta');const share=late.length/open.length,reasons=[];
 const n=(k,one,many)=>k===1?one:k+' '+many;
 if(lateMs.length)reasons.push(n(lateMs.length,L('1 milestone in ritardo','1 milestone is late'),L('milestone in ritardo','milestones are late'))+': '+lateMs.map(t=>t.title).slice(0,3).join(', ')+'.');
 if(late.length){const old=days(late.map(t=>t.due).sort()[0],today);reasons.push(n(late.length,L('1 attività aperta è scaduta','1 open task is overdue'),L('attività aperte sono scadute','open tasks are overdue'))+' ('+L('la più vecchia da ','the oldest by ')+n(old,L('1 giorno','1 day'),L('giorni','days'))+').')}
 if(urgentLate.length)reasons.push(n(urgentLate.length,L('1 attività urgente o alta è in ritardo','1 urgent or high task is late'),L('attività urgenti o alte sono in ritardo','urgent or high tasks are late'))+'.');
 if(blockedSoon.length)reasons.push(n(blockedSoon.length,L('1 scadenza dei prossimi 3 giorni aspetta','1 deadline in the next 3 days waits for'),L('scadenze dei prossimi 3 giorni aspettano','deadlines in the next 3 days wait for'))+L(' un’attività in ritardo.',' a late task.'));
 let h='In linea';if(lateMs.length||share>=.25||urgentLate.length>=2)h='Fuori strada';else if(late.length||blockedSoon.length)h='A rischio';
 if(h==='In linea')reasons.push(soon.length?n(soon.length,L('1 scadenza nei prossimi 3 giorni','1 deadline in the next 3 days'),L('scadenze nei prossimi 3 giorni','deadlines in the next 3 days'))+L(', nessun ritardo.',', nothing late.'):L('Nessun ritardo.','Nothing late.'));
 return {health:h,reasons};}
// A short status update to read and send (Asana/ClickUp project updates), from the plan only.
function statusDraft(tasks,{today,health:h,en}={}){today=today||todayIso();const all=tasks||[];const open=all.filter(t=>t.status!=='Completato');const L=(it,e)=>en?e:it;
 const done=all.filter(t=>t.status==='Completato'&&t.completedAt&&days(String(t.completedAt).slice(0,10),today)<=7);
 const late=open.filter(t=>t.due<today).sort((a,b)=>a.due.localeCompare(b.due)),next=open.filter(t=>t.due>=today&&days(today,t.due)<=7).sort((a,b)=>a.due.localeCompare(b.due));
 const fmt=d=>at(d).toLocaleDateString(en?'en-GB':'it-IT',{day:'numeric',month:'short',timeZone:'UTC'});const lines=[];
 const n=all.filter(t=>t.status==='Completato').length,pct=all.length?Math.round(100*n/all.length):0;const hl=h&&h.health?(en?HEALTH_EN[h.health]:h.health):'—';
 lines.push(L('Stato: ','Status: ')+hl+' · '+pct+L('% completato (',' % done (').replace(' %','%')+n+L(' su ',' of ')+all.length+').');
 if(h&&h.reasons&&h.reasons.length)lines.push(h.reasons.join(' '));
 lines.push('',L('Fatto negli ultimi 7 giorni:','Done in the last 7 days:'),...(done.length?done.map(t=>'• '+t.title+' ('+t.owner+')'):[L('• Nessuna attività completata.','• No task completed.')]));
 if(late.length)lines.push('',L('In ritardo:','Late:'),...late.slice(0,8).map(t=>'• '+t.title+' — '+t.owner+L(', scadeva il ',', was due ')+fmt(t.due)));
 lines.push('',L('Prossimi 7 giorni:','Next 7 days:'),...(next.length?next.slice(0,8).map(t=>'• '+t.title+' — '+t.owner+', '+fmt(t.due)):[L('• Nessuna scadenza.','• No deadlines.')]));
 const asks=open.filter(t=>t.approvalRequired&&!t.approved&&t.status==='In revisione');if(asks.length)lines.push('',L('Da approvare:','To approve:'),...asks.map(t=>'• '+t.title));
 return lines.join('\n');}

// ---- Month calendar: 6 weeks × 7 days from Monday, tasks on their due date ----
function calendar(tasks,monthIso,{today}={}){today=today||todayIso();const first=at((monthIso||today).slice(0,7)+'-01');const m=first.getUTCMonth();
 const back=(first.getUTCDay()+6)%7,start=plus(iso(first),-back),byDay=new Map();
 for(const t of tasks||[]){if(!byDay.has(t.due))byDay.set(t.due,[]);byDay.get(t.due).push(t)}
 const weeks=[];for(let w=0;w<6;w++){const row=[];for(let d=0;d<7;d++){const day=plus(start,w*7+d);row.push({day,inMonth:at(day).getUTCMonth()===m,today:day===today,weekend:d>=5,tasks:(byDay.get(day)||[]).slice().sort((a,b)=>(PRIORITY_RANK[a.priority]??9)-(PRIORITY_RANK[b.priority]??9)||a.title.localeCompare(b.title,'it'))})}weeks.push(row);if(w>=3&&at(plus(start,(w+1)*7)).getUTCMonth()!==m)break}
 return {month:iso(first).slice(0,7),label:first.toLocaleDateString('it-IT',{month:'long',year:'numeric',timeZone:'UTC'}),prev:addMonths(iso(first),-1).slice(0,7),next:addMonths(iso(first),1).slice(0,7),weeks};}

// ---- List: sorting and grouping (Monday-style table) ----
const STATUS_RANK={'Da fare':0,'In corso':1,'In revisione':2,'Completato':3};
const SORTS={due:(a,b)=>a.due.localeCompare(b.due),priority:(a,b)=>(PRIORITY_RANK[a.priority]??9)-(PRIORITY_RANK[b.priority]??9),owner:(a,b)=>a.owner.localeCompare(b.owner,'it'),status:(a,b)=>STATUS_RANK[a.status]-STATUS_RANK[b.status],title:(a,b)=>a.title.localeCompare(b.title,'it')};
function sortTasks(list,key,dir){const f=SORTS[key]||SORTS.due,sign=dir==='desc'?-1:1;return (list||[]).slice().sort((a,b)=>sign*f(a,b)||SORTS.due(a,b)||a.id.localeCompare(b.id,undefined,{numeric:true}))}
function groupTasks(list,by,subprojects){const g=new Map();const label=t=>by==='status'?t.status:by==='owner'?t.owner:by==='priority'?(t.priority||'Senza priorità'):((subprojects||[]).find(s=>s.id===t.subproject)||{name:'Generale'}).name;
 const order=by==='status'?Object.keys(STATUS_RANK):by==='priority'?[...PRIORITIES,'Senza priorità']:by==='owner'?[...new Set((list||[]).map(t=>t.owner))].sort((a,b)=>a.localeCompare(b,'it')):(subprojects||[]).map(s=>s.name);
 for(const k of order)g.set(k,[]);for(const t of list||[]){const k=label(t);if(!g.has(k))g.set(k,[]);g.get(k).push(t)}
 return [...g].filter(([,items])=>items.length).map(([name,items])=>({name,items,done:items.filter(t=>t.status==='Completato').length}));}

// ---- Project templates: phases and activities with working-day offsets from the start date ----
// Each activity: [title, owner role, start offset, duration (working days), dependencies (indexes in the template), flags].
const TEMPLATES=[
 {id:'sito',name:'Sito web',desc:'Dalla strategia alla pubblicazione, con test e annuncio.',phases:[
  ['Strategia',[['Obiettivi, pubblico e messaggi','Responsabile progetto',0,2,[]],['Analisi dei concorrenti','Marketing',0,3,[]],['Approvare la struttura del sito','Responsabile progetto',3,1,[0,1],'am']]],
  ['Contenuti',[['Testi della home','Copywriter',4,3,[2]],['Testi delle pagine dei servizi','Copywriter',6,4,[3]],['Foto e grafiche','Grafico',4,5,[2]]]],
  ['Sviluppo',[['Wireframe e design','Grafico',4,4,[2]],['Sviluppo delle pagine','Sviluppatore',8,6,[6]],['SEO tecnica e dati strutturati','Sviluppatore',14,2,[7]]]],
  ['Lancio',[['Test su telefono e computer','Responsabile progetto',16,2,[7,4,5]],['Pubblicazione','Sviluppatore',18,1,[9],'am'],['Post di annuncio','Marketing',19,1,[10]]]]]},
 {id:'campagna',name:'Campagna marketing',desc:'Brief, contenuti, lancio e misura dei risultati.',phases:[
  ['Preparazione',[['Brief e obiettivi della campagna','Responsabile marketing',0,2,[]],['Pubblico e messaggi chiave','Marketing',2,2,[0]],['Budget e canali','Responsabile marketing',2,2,[0],'a']]],
  ['Produzione',[['Testi degli annunci e dei post','Copywriter',4,3,[1]],['Grafiche e video','Grafico',4,5,[1]],['Pagina di atterraggio','Sviluppatore',5,4,[1]],['Approvare i materiali','Responsabile marketing',9,1,[3,4,5],'am']]],
  ['Lancio',[['Pubblicare e attivare gli annunci','Marketing',10,1,[6]],['Email ai contatti','Marketing',11,1,[6]]]],
  ['Risultati',[['Controllo dei risultati a una settimana','Marketing',16,1,[7]],['Report finale e lezioni imparate','Responsabile marketing',25,2,[9],'m']]]]},
 {id:'onboarding',name:'Onboarding cliente',desc:'Avvio, configurazione, formazione e verifica a 30 giorni.',phases:[
  ['Avvio',[['Kick-off con il cliente','Responsabile cliente',0,1,[],'m'],['Raccogliere dati e accessi','Responsabile cliente',1,3,[0]],['Piano di lavoro condiviso','Responsabile cliente',2,2,[0],'a']]],
  ['Configurazione',[['Configurare il servizio','Tecnico',4,5,[1,2]],['Importare i dati','Tecnico',6,3,[1]],['Verifica con il cliente','Responsabile cliente',10,1,[3,4],'a']]],
  ['Formazione',[['Sessione di formazione','Formatore',11,1,[5],'m'],['Guida rapida per gli utenti','Formatore',11,2,[5]]]],
  ['Verifica',[['Controllo a 30 giorni','Responsabile cliente',31,1,[6],'m']]]]},
 {id:'evento',name:'Evento o webinar',desc:'Data, invitati, promozione, giorno dell’evento e follow-up.',phases:[
  ['Organizzazione',[['Tema, data e relatori','Responsabile evento',0,3,[]],['Piattaforma o location','Responsabile evento',2,3,[0]],['Pagina di iscrizione','Marketing',4,2,[1]]]],
  ['Promozione',[['Inviti email','Marketing',6,1,[2]],['Post sui social','Marketing',6,8,[2]],['Promemoria agli iscritti','Marketing',13,1,[3]]]],
  ['Evento',[['Prova tecnica','Responsabile evento',13,1,[1]],['Giorno dell’evento','Responsabile evento',15,1,[6],'m']]],
  ['Dopo l’evento',[['Email di ringraziamento con registrazione','Marketing',16,1,[7]],['Contatti caldi al commerciale','Commerciale',16,2,[7]]]]]},
 {id:'prodotto',name:'Lancio prodotto',desc:'Validazione, prezzo, materiali di vendita e lancio.',phases:[
  ['Validazione',[['Interviste a 5 clienti','Responsabile prodotto',0,5,[]],['Definire l’offerta e il prezzo','Responsabile prodotto',5,2,[0],'a']]],
  ['Preparazione',[['Scheda prodotto e presentazione','Marketing',7,4,[1]],['Formazione del commerciale','Responsabile prodotto',9,2,[1]],['Pagina del prodotto','Sviluppatore',7,5,[1]]]],
  ['Lancio',[['Annuncio ai clienti','Marketing',12,1,[2,4],'m'],['Prime 10 trattative','Commerciale',13,10,[3]]]],
  ['Misura',[['Bilancio del primo mese','Responsabile prodotto',33,1,[5],'m']]]]},
 {id:'sprint',name:'Sviluppo a sprint',desc:'Due sprint di due settimane con revisione e rilascio.',phases:[
  ['Sprint 1',[['Pianificazione sprint 1','Responsabile prodotto',0,1,[]],['Sviluppo funzioni sprint 1','Sviluppatore',1,8,[0]],['Revisione e demo sprint 1','Responsabile prodotto',9,1,[1],'am']]],
  ['Sprint 2',[['Pianificazione sprint 2','Responsabile prodotto',10,1,[2]],['Sviluppo funzioni sprint 2','Sviluppatore',11,8,[3]],['Revisione e demo sprint 2','Responsabile prodotto',19,1,[4],'am']]],
  ['Rilascio',[['Test finali','Sviluppatore',20,2,[5]],['Rilascio in produzione','Sviluppatore',22,1,[6],'m']]]]}];
function workdays(startIso,n){let d=startIso;while(at(d).getUTCDay()===0||at(d).getUTCDay()===6)d=plus(d,1);let k=0;while(k<n){d=plus(d,1);if(at(d).getUTCDay()!==0&&at(d).getUTCDay()!==6)k++}return d}
// Builds a PM state (lib/pm-demo.js rules) from a template; roles become owners unless `owner` is given for all.
function fromTemplate(pm,id,{name,start,owner,note}={}){const tpl=TEMPLATES.find(t=>t.id===id);if(!tpl)throw new Error('Modello non trovato.');start=start||todayIso();
 const state={projects:[],tasks:[],nextId:1};const p=pm.createProject(state,{name:name||tpl.name,note:note||'',subprojects:tpl.phases.map(ph=>ph[0])});const ids=[];
 tpl.phases.forEach((ph,pi)=>ph[1].forEach(([title,role,off,dur,deps,flags])=>{const s=workdays(start,off),due=workdays(s,Math.max(0,dur-1));
  const t=pm.create(state,{project:p.id,subproject:p.subprojects[pi].id,title,owner:owner||role,start:s,due,details:'',dependencies:deps.map(i=>ids[i]).filter(Boolean),approvalRequired:/a/.test(flags||''),milestone:/m/.test(flags||''),assignedAgents:[],recurrence:'Nessuna'});
  t.history=['Creata dal modello «'+tpl.name+'».'];ids.push(t.id)}));
 return pm.validateState(state);}

// ---- AI: break an activity down into sub-tasks (one confirmed call, the result is editable) ----
function breakdownPrompt(task,{project,phase}={}){return ['Scomponi questa attività di progetto in 3-8 sotto-attività concrete, nell’ordine in cui si fanno.',
 'Ogni sotto-attività: una riga che inizia con «- », un verbo all’infinito, massimo 12 parole, niente numeri inventati, niente spiegazioni.',
 'Rispondi solo con l’elenco.','',
 'Progetto: '+(project||'—'),'Fase: '+(phase||'—'),'Attività: '+task.title,'Responsabile: '+task.owner,'Scadenza: '+task.due,
 'Dettagli: '+(task.details||'—'),'Sotto-attività già presenti: '+((task.checklist||[]).map(c=>c.text).join('; ')||'nessuna')].join('\n')}
function parseBreakdown(text,existing){const have=new Set((existing||[]).map(c=>fold(c.text)));const out=[];
 for(const line of String(text||'').split(/\r?\n/)){const m=/^\s*(?:[-*•]|\d+[.)])\s+(.+?)\s*$/.exec(line);if(!m)continue;const t=m[1].replace(/\*\*/g,'').replace(/[.;]+$/,'').trim().slice(0,200);if(t&&!have.has(fold(t))){have.add(fold(t));out.push(t)}if(out.length>=10)break}
 return out;}

return Object.freeze({HEALTH_EN,PRIORITIES,todayIso,plus,days,parseQuick,isMe,myWork,mentions,mentionsOf,health,statusDraft,calendar,sortTasks,groupTasks,TEMPLATES,workdays,fromTemplate,breakdownPrompt,parseBreakdown});
});
