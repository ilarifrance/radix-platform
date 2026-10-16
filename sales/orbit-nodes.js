'use strict';
/* Sales Orbit nodes as in the mockup: each company node orbit-higgsfield.js renders gets its relation type,
   its pipeline value and a red "A rischio" mark, all read from the CRM (crm-data.js). Same buttons, same links.
   Type comes from the most advanced stage of the company's opportunities: first stage = Nuovo lead,
   a stage named negoziazione/trattativa = Trattativa, a stage named vinto/cliente = Cliente, otherwise Opportunità.
   "A rischio" uses the CRM Panoramica rule: expected close passed, or closing within 14 days with no open task. */
(()=>{
const root=document.getElementById('orbit-nodes');if(!root||!window.RadixCrmData)return;
const DAY=864e5,eur=c=>'€ '+new Intl.NumberFormat('it-IT',{maximumFractionDigits:0}).format(c/100);
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
function typeOf(stages){const s=stages.filter(Boolean);if(!s.length)return'Opportunità';
  if(s.some(x=>/vint|won|client|acquisit/i.test(x.title||'')))return'Cliente';
  if(s.some(x=>/negozi|trattativ/i.test(x.title||'')))return'Trattativa';
  if(s.every(x=>Number(x.position)===1))return'Nuovo lead';return'Opportunità'}
function model(d){const t0=new Date();t0.setHours(0,0,0,0);const open=(d.tasks||[]).filter(t=>!['done','completed','closed'].includes(String(t.status||'').toLowerCase()));
  const stage=new Map((d.stages||[]).map(s=>[s.id,s]));const by=new Map();
  for(const c of d.companies||[])by.set(c.id,{c,opps:[],leads:[]});
  for(const o of d.opportunities||[]){const x=by.get(o.company_id);if(x)x.opps.push(o)}
  for(const l of d.leads||[]){const x=by.get(l.company_id);if(x)x.leads.push(l)}
  const out=new Map();
  for(const x of by.values()){const value=x.opps.reduce((s,o)=>s+(num(o.amount_cents)||0),0);
    const risk=x.opps.some(o=>{const c=o.expected_close?new Date(o.expected_close):null;if(!c||!Number.isFinite(+c))return false;const days=Math.round((c-t0)/DAY);
      return days<0||(days<=14&&!open.some(t=>t.opportunity_id===o.id))});
    const scores=[...x.opps,...x.leads].map(r=>num(r.score??r.lead_score)).filter(v=>v!==null);
    const type=x.opps.length?typeOf(x.opps.map(o=>stage.get(o.stage_id))):x.leads.length?'Nuovo lead':null;
    out.set(String(x.c.name||'').trim().toLowerCase(),{type,value,risk,score:scores.length?Math.max(...scores):null,n:x.opps.length})}
  return out}
let busy=false,timer=0;
function paint(){const nodes=[...root.querySelectorAll('.entity-node')];if(!nodes.length)return;
  RadixCrmData.load().then(d=>{if(!d)return;const m=model(d);busy=true;
    for(const b of nodes){const name=(b.querySelector('b')||{}).textContent||'';const x=m.get(name.trim().toLowerCase());if(!x||!x.type)continue;
      b.dataset.type=x.type.toLowerCase().replace(/\s+/g,'-');b.classList.toggle('at-risk',x.risk);
      const lines=b.querySelector('b').parentElement;[...lines.querySelectorAll('small')].forEach(s=>s.remove());
      const t=document.createElement('small');t.className='so-type';t.textContent=x.risk?'A rischio':x.type;lines.append(t);
      const v=document.createElement('small');v.className='so-value';v.textContent=x.score!==null?'Score '+x.score:x.value?eur(x.value):x.n+' opportunità';lines.append(v);
      b.title=x.type+(x.risk?' · a rischio: chiusura superata o vicina senza attività aperte':'')+' · apri nel CRM'}
    busy=false}).catch(()=>{busy=false})}
new MutationObserver(()=>{if(busy)return;clearTimeout(timer);timer=setTimeout(paint,80)}).observe(root,{childList:true});
paint();
})();
