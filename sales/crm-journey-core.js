'use strict';
/* «Percorso commerciale» of a contact (Francesco, 17/11): before an opportunity exists the seller works the contact
   (calls, emails, meetings, notes, to-dos); those steps prepare the opportunity and must be visible on the contact.
   Pure helpers over the Customer360 rows ([{entity,record}]) of ONE contact or opportunity:
   - journey(): the steps on the contact, newest first, split into «preparatory» (not linked to an opportunity)
     and «on an opportunity», plus the open to-dos and the contact's opportunities.
   - stage(): where the contact stands (to work, in progress, ready for an opportunity, with an open opportunity).
   - opportunityDraft(): the fields to prefill «Crea opportunità» from the contact.
   Nothing here talks to the server. */
(function(root){
const KIND={note:'Nota',call:'Chiamata',meeting:'Incontro',email:'Email'};
const ICON={note:'✎',call:'☎',meeting:'◷',email:'✉',task:'☐',done:'☑'};
const DAY=864e5;
// Short words for the contacts list column.
const SHORT={new:'Da lavorare',working:'In corso',ready:'Pronto',opportunity:'In trattativa',won:'Cliente',closed:'Chiuso'};
const t=v=>{const n=Date.parse(v);return Number.isFinite(n)?n:NaN};

function rowsOf(related,entity){return (Array.isArray(related)?related:[]).filter(x=>x&&x.entity===entity&&x.record).map(x=>x.record)}

// One list of steps for a contact. subject: 'contacts' | 'opportunities'; id: the record shown.
function journey(subject,id,related,now){
 now=Number.isFinite(now)?now:Date.now();
 const opps=rowsOf(related,'opportunities');
 let contactId=null;
 if(subject==='contacts')contactId=id;
 else if(subject==='opportunities'){const o=opps.find(r=>r.id===id);contactId=o&&o.contact_id||null}
 if(!contactId)return null;
 const contact=rowsOf(related,'contacts').find(r=>r.id===contactId)||null;
 const mine=r=>r.contact_id===contactId;
 const steps=[];
 for(const i of rowsOf(related,'interactions').filter(mine)){
  const at=t(i.occurred_at);
  steps.push({id:i.id,entity:'interactions',kind:i.kind,label:KIND[i.kind]||'Attività',icon:ICON[i.kind]||'•',title:i.title||'',body:i.body||'',at:Number.isFinite(at)?new Date(at).toISOString():'',
   done:Number.isFinite(at)?at<=now:true,planned:Number.isFinite(at)&&at>now,overdue:false,opportunity_id:i.opportunity_id||null,record:i});
 }
 for(const k of rowsOf(related,'tasks').filter(mine)){
  const due=t(k.due_at),done=k.status==='done';
  const when=done?t(k.updated_at):due;
  steps.push({id:k.id,entity:'tasks',kind:'task',label:done?'Attività fatta':'Da fare',icon:done?ICON.done:ICON.task,title:k.title||'',body:'',
   at:Number.isFinite(when)?new Date(when).toISOString():(Number.isFinite(t(k.created_at))?new Date(t(k.created_at)).toISOString():''),
   done,planned:!done,overdue:!done&&Number.isFinite(due)&&due<now,due:Number.isFinite(due)?new Date(due).toISOString():'',opportunity_id:k.opportunity_id||null,record:k});
 }
 // Newest first; planned items (future or open) on top, ordered by when they are due.
 steps.sort((a,b)=>{
  if(a.planned!==b.planned)return a.planned?-1:1;
  if(a.planned)return String(a.due||a.at||'9999').localeCompare(String(b.due||b.at||'9999'));
  return String(b.at).localeCompare(String(a.at));
 });
 const contactOpps=opps.filter(o=>o.contact_id===contactId);
 const preparatory=steps.filter(s=>!s.opportunity_id);
 const onOpp=steps.filter(s=>s.opportunity_id);
 const doneBefore=preparatory.filter(s=>s.done);
 const firstOpp=contactOpps.map(o=>t(o.created_at)).filter(Number.isFinite).sort((a,b)=>a-b)[0];
 const last=steps.filter(s=>s.done&&s.at).map(s=>t(s.at)).filter(Number.isFinite).sort((a,b)=>b-a)[0];
 return {
  contactId,contact,steps,preparatory,onOpportunity:onOpp,
  open:steps.filter(s=>s.planned),overdue:steps.filter(s=>s.overdue),
  opportunities:contactOpps,openOpportunities:contactOpps.filter(o=>!o.outcome||o.outcome==='open'),
  counts:{done:doneBefore.length,planned:preparatory.filter(s=>s.planned).length,total:steps.length},
  firstOpportunityAt:Number.isFinite(firstOpp)?new Date(firstOpp).toISOString():'',
  daysSinceLast:Number.isFinite(last)?Math.max(0,Math.floor((now-last)/DAY)):null
 };
}

// Where the contact stands, in words a seller uses. j: journey().
function stage(j){
 if(!j)return null;
 if(j.openOpportunities.length)return {key:'opportunity',label:'Opportunità aperta',hint:j.openOpportunities.length===1?'Il lavoro continua sull’opportunità.':'Il lavoro continua sulle '+j.openOpportunities.length+' opportunità aperte.'};
 if(j.opportunities.some(o=>o.outcome==='won'))return {key:'won',label:'Cliente acquisito',hint:'Opportunità vinta: puoi aprirne una nuova per un’altra vendita.'};
 if(j.opportunities.length)return {key:'closed',label:'Opportunità chiuse',hint:'Nessuna opportunità aperta: puoi aprirne una nuova quando serve.'};
 const real=j.preparatory.filter(s=>s.done&&s.kind!=='note'&&s.kind!=='task').length;
 if(real>=2)return {key:'ready',label:'Pronto per un’opportunità',hint:real+' contatti avuti: se c’è interesse, apri l’opportunità.'};
 if(j.preparatory.length)return {key:'working',label:'In lavorazione',hint:'Attività in corso prima dell’opportunità.'};
 return {key:'new',label:'Da lavorare',hint:'Nessuna attività ancora: inizia con una chiamata o un’email.'};
}

// «Crea opportunità» from the contact: the contact and its company (the server requires the pair to match).
function opportunityDraft(contact,companyName){
 if(!contact||!contact.id)return null;
 const who=String(contact.name||[contact.first_name,contact.last_name].filter(Boolean).join(' ')||'').trim();
 const base=companyName||who;
 return {contact_id:contact.id,company_id:contact.company_id||'',title:base?('Opportunità '+base).slice(0,200):''};
}

// Short line for the contacts list: «3 attività · ultima 2 g fa», «Opportunità aperta».
function listLine(contactId,interactions,tasks,opportunities,now){
 now=Number.isFinite(now)?now:Date.now();
 const rel=[{entity:'contacts',record:{id:contactId}}]
  .concat((interactions||[]).filter(r=>r&&r.contact_id===contactId).map(r=>({entity:'interactions',record:r})))
  .concat((tasks||[]).filter(r=>r&&r.contact_id===contactId).map(r=>({entity:'tasks',record:r})))
  .concat((opportunities||[]).filter(r=>r&&r.contact_id===contactId).map(r=>({entity:'opportunities',record:r})));
 const j=journey('contacts',contactId,rel,now),s=stage(j);
 if(!j)return null;
 return {key:s.key,label:SHORT[s.key]||s.label,full:s.label,done:j.counts.done,planned:j.counts.planned,daysSinceLast:j.daysSinceLast,overdue:j.overdue.length};
}

const core={KIND,journey,stage,opportunityDraft,listLine};
if(typeof module==='object'&&module.exports)module.exports=core;
root.RadixCrmJourneyCore=core;
})(typeof window!=='undefined'?window:globalThis);
