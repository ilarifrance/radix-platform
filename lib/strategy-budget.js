/* Studio «Budget e KPI della strategia» (agency job S1, the part after the brief): the strategy approved in the
   project («editorial» document, the 14 fields of project-editorial.html#brief) gets a budget per channel, the KPI with
   the way each one is measured, and the client files. No AI and no cost: every number comes from the person or from
   the data RADIX already has.
   1. «Strategia e budget»: the approved brief (goal, channels, period); without an approved brief the studio stops and
      sends to the brief. The goal is read from the brief by fixed words (GOALS, the person can change it) and the
      channels from the «Canali» field (CHANNELS, the person can add or remove them). The monthly budget is typed by the
      person: there is no default and RADIX never proposes one. Months and the first month of the plan are chosen.
   2. Three splits by fixed rules (PROPOSALS): «Prudente» (the 2 channels that serve the goal best, 15% kept for tests),
      «Bilanciata» (every channel by its weight for the goal, 10% for tests), «Crescita» (paid channels weigh more, no
      reserve). Weights: WEIGHTS[goal][channel] (0-5), LinkedIn +2 and TikTok -1 when the audience is companies. A paid
      channel that would get less than its minimum (MIN, a RADIX rule of thumb shown to the person, not a market price)
      is left out and its share goes to the others; amounts are whole euros and always add up to the budget.
   3. «Rifinisci»: amounts edited by hand; the total must match the budget (an export is blocked until it does), a paid
      channel under its minimum is flagged, «Metti la differenza nella riserva» closes the gap.
   4. «KPI»: for each channel with budget (and the general ones: leads in the CRM, contacts from the site form) the KPI
      of KPI_DEFS with its source of measure. The current value («dato attuale») comes ONLY from what RADIX has, for the
      month just closed: social numbers per channel in the PED (lib/ped-results.js through lib/report-studio.js),
      Search Console imports, the CRM of a chosen workspace (leads, email campaigns), the last communication audit
      (lib/audit-studio.js, its area scores). A KPI without it is «da misurare»: no target is suggested for it. Targets
      are typed by the person, or derived from the current value with a growth the person types («+N% sul dato
      attuale»). Every target has the date of the end of the plan. Low audit scores become priorities.
   5. «Export»: the full brief as a branded A4 PDF (the own writer of lib/print-studio.js), a 16:9 PowerPoint deck
      (lib/doc-studio.js layouts → lib/pptx-lite.js, editable text, the kit's colours and fonts), the budget as CSV
      (semicolons, Italian decimals, for Excel). Checks before export: total, minimums, KPI sources, targets, numbers
      written in the brief that look like market figures without a source (the number reading of
      sales/crm-campaign-next-core.js).
   Saved in the project: the «agents» document, key strategyBudget (agents-page.js keeps it), with the brief revision it
   was made on, so a later change of the strategy is visible.
   Pure part runs in Node for the tests; strategyBudgetStudio() is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixStrategyBudget=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.message].filter(Boolean).join('\n')))};
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const PS=()=>lib('RadixPrintStudio','./print-studio.js'),DS=()=>lib('RadixDocStudio','./doc-studio.js'),REP=()=>lib('RadixReportStudio','./report-studio.js'),
 AUD=()=>lib('RadixAuditStudio','./audit-studio.js'),NEXT=()=>lib('RadixCrmCampaignNextCore','../sales/crm-campaign-next-core.js');
const AGENT='strategist',MAX_SAVED=12,TBD='da misurare',NA='non disponibile';
const clean=s=>String(s==null?'':s).replace(/[\s ]+/g,' ').trim();
const block=s=>String(s==null?'':s).replace(/\r/g,'').split('\n').map(clean).join('\n').replace(/\n{3,}/g,'\n\n').trim();
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const slug=s=>norm(s).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
const fin=v=>typeof v==='number'&&Number.isFinite(v);
const round=(n,d=0)=>fin(n)?Math.round(n*10**d)/10**d:null;

// ---- numbers, Italian style ----
function fmtNum(v,d=0){if(!fin(v))return NA;const n=round(Math.abs(v),d),[i,f]=n.toFixed(d).split('.');const s=i.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(f&&+f?','+f.replace(/0+$/,''):'');return (v<0&&n?'-':'')+s}
const eur=v=>fin(v)?fmtNum(v)+' €':NA;
const fmtVal=(v,unit,d)=>!fin(v)?NA:unit==='€'?fmtNum(v,d==null?0:d)+' €':fmtNum(v,d==null?(unit==='%'?1:0):d)+(unit==='%'?'%':unit==='/100'?'/100':'');
// «1.500», «1500», «1.500,50 €» → 1500.5; anything else → null.
function parseAmount(s){const t=String(s==null?'':s).replace(/[€\s ]/g,'').replace(/eur(o)?$/i,'');if(!t)return null;
 const x=/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)?t.replace(/\./g,'').replace(',','.'):t.replace(',','.');const n=Number(x);return Number.isFinite(n)&&n>=0?n:null}

// ---- months ----
const MONTHS=Object.freeze(['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']);
const MONTH=/^(\d{4})-(0[1-9]|1[0-2])$/;
function shiftMonth(m,k){const [y,mo]=m.split('-').map(Number),t=y*12+(mo-1)+k;return Math.floor(t/12)+'-'+String(t%12+1).padStart(2,'0')}
const monthOf=d=>(d instanceof Date?d:new Date(d)).toISOString().slice(0,7);
const monthLabel=m=>{const n=MONTHS[+m.slice(5,7)-1];return n.charAt(0).toUpperCase()+n.slice(1)+' '+m.slice(0,4)};
const lastDay=m=>{const [y,mo]=m.split('-').map(Number);return m+'-'+String(new Date(Date.UTC(y,mo,0)).getUTCDate()).padStart(2,'0')};
const dayIt=iso=>String(iso||'').slice(0,10).split('-').reverse().join('/');
const MONTH_CHOICES=Object.freeze([3,6,9,12]);
// The plan: first month, months, last month, the date of the targets.
function periodOf(start,months){const m=MONTH.test(String(start||''))?start:null,n=Math.max(1,Math.min(24,Math.round(+months)||0));if(!m||!n)return null;const end=shiftMonth(m,n-1);
 return {start:m,months:n,end,until:lastDay(end),label:monthLabel(m)+(n>1?' – '+monthLabel(end):''),untilLabel:dayIt(lastDay(end))}}
const startChoices=(today=new Date())=>{const cur=monthOf(today);return [0,1,2,3].map(i=>{const m=shiftMonth(cur,i);return {id:m,label:monthLabel(m)+(i?'':' (in corso)')}})};

// ---- goal and channels, read from the brief by fixed words ----
const GOALS=Object.freeze([
 {id:'contatti',label:'Più contatti',re:/contatt|lead\b|lead |richiest|preventiv|prenotazion|appuntament|telefonat|chiamat/},
 {id:'vendite',label:'Più vendite',re:/vendit|vender|ordin|e-?commerce|shop|acquist|fattur|carrello/},
 {id:'notorieta',label:'Farsi conoscere',re:/notoriet|conoscer|visibilit|awareness|reputazion|brand awareness|farsi trovare|riconoscib/},
 {id:'lancio',label:'Lanciare un prodotto',re:/lanci|nuovo prodotto|nuova apertura|inaugura|apertura|debutt|novita/},
 {id:'fidelizzare',label:'Fidelizzare',re:/fideliz|clienti abituali|tornar|ritorn|riacquist|community|passaparola|fedelt/}].map(Object.freeze));
const goal=id=>GOALS.find(g=>g.id===id)||null;
// The goal named most often in the «Obiettivo» field (ties: the first written); '' when no word matches.
function detectGoal(text){const t=norm(text);let best='',score=0,pos=1e9;
 for(const g of GOALS){const all=t.match(new RegExp(g.re.source,'g'))||[];if(!all.length)continue;const p=t.search(g.re);if(all.length>score||(all.length===score&&p<pos)){best=g.id;score=all.length;pos=p}}return best}
const isB2b=text=>/\bb2b\b|aziend|impres|professionist|uffic|studi |ristorator|negozi(anti)? |rivenditor|hotel/.test(norm(text));
// min: the monthly amount under which a paid channel cannot learn (a RADIX rule of thumb, shown and editable by
// hand, not a market price). Owned channels (site/SEO, Google listing, email, WhatsApp) have none: their budget is
// production and tools.
const CHANNELS=Object.freeze([
 {id:'instagram',label:'Instagram',kind:'social',paid:true,min:150,buys:'post sponsorizzati e produzione dei contenuti',re:/instagram|\big\b|reels?\b/},
 {id:'facebook',label:'Facebook',kind:'social',paid:true,min:150,buys:'inserzioni Meta e produzione dei contenuti',re:/facebook|\bfb\b|\bmeta\b/},
 {id:'linkedin',label:'LinkedIn',kind:'social',paid:true,min:300,buys:'post sponsorizzati e contenuti per le aziende',re:/linkedin/},
 {id:'tiktok',label:'TikTok',kind:'social',paid:true,min:150,buys:'video brevi e Spark Ads',re:/tik ?tok/},
 {id:'youtube',label:'YouTube',kind:'social',paid:true,min:200,buys:'video e annunci video',re:/youtube|\byt\b/},
 {id:'googleads',label:'Google Ads',kind:'search',paid:true,min:300,buys:'annunci sulla ricerca di Google',re:/google ads|adwords|\bsem\b|annunci (su )?google|search ads|campagne google|ppc/},
 {id:'gbp',label:'Scheda Google',kind:'owned',paid:false,min:0,buys:'foto, post e risposte alle recensioni',re:/scheda google|google business|google maps|\bmaps\b|\bgbp\b|google my business|recension/},
 {id:'seo',label:'Sito e SEO',kind:'owned',paid:false,min:0,buys:'contenuti del sito, SEO e GEO',re:/\bseo\b|\bgeo\b|sito|blog|search console|landing|web\b/},
 {id:'email',label:'Newsletter ed email',kind:'owned',paid:false,min:0,buys:'newsletter, sequenze e strumento di invio',re:/newsletter|e-?mail|\bdem\b|mailchimp|brevo/},
 {id:'whatsapp',label:'WhatsApp',kind:'owned',paid:false,min:0,buys:'messaggi e catalogo WhatsApp Business',re:/whatsapp|\bwa\b/},
 {id:'offline',label:'Stampa ed eventi',kind:'offline',paid:true,min:100,buys:'volantini, affissioni, eventi e fiere',re:/volantin|stampa|locandin|event|fier|radio|affission|cartellon|offline|vetrin|flyer/}].map(Object.freeze));
const CHANNEL_IDS=CHANNELS.map(c=>c.id);
const channel=id=>CHANNELS.find(c=>c.id===id)||null;
const RESERVE=Object.freeze({id:'riserva',label:'Riserva per i test',kind:'reserve',paid:false,min:0,buys:'test di nuovi formati e imprevisti'});
const lineInfo=id=>id==='riserva'?RESERVE:channel(id);
// The channels of the «Canali» field, in the order written (each piece checked in CHANNELS order).
function parseChannels(text){const out=[];for(const piece of norm(text).split(/[,;\n\/+|·•]+|\s+e\s+|\s+ed\s+/)){const p=' '+piece.trim()+' ';if(!p.trim())continue;
  for(const c of CHANNELS)if(c.re.test(p)&&!out.includes(c.id)){out.push(c.id);break}}
 return out}
// A channel name of the PED («Instagram», «Facebook Page») → its id.
const channelOf=name=>parseChannels(name)[0]||'';

// ---- the split rules ----
const WEIGHTS=Object.freeze({
 contatti:   {googleads:5,seo:4,gbp:4,facebook:3,instagram:3,linkedin:3,email:3,whatsapp:2,offline:2,tiktok:1,youtube:1},
 vendite:    {googleads:5,instagram:4,facebook:4,email:4,seo:3,tiktok:3,youtube:2,gbp:2,whatsapp:2,linkedin:1,offline:1},
 notorieta:  {instagram:5,facebook:4,tiktok:4,youtube:4,linkedin:3,offline:3,seo:2,gbp:2,googleads:1,email:1,whatsapp:1},
 lancio:     {instagram:5,facebook:4,googleads:4,tiktok:3,youtube:3,email:3,offline:3,linkedin:2,seo:2,gbp:2,whatsapp:2},
 fidelizzare:{email:5,whatsapp:4,instagram:3,facebook:3,gbp:3,offline:2,seo:1,linkedin:1,googleads:1,tiktok:1,youtube:1}});
function weightOf(goalId,id,b2b){let w=(WEIGHTS[goal(goalId)?goalId:'contatti']||{})[id]||1;if(b2b&&id==='linkedin')w+=2;if(b2b&&id==='tiktok')w=Math.max(1,w-1);return w}
const PROPOSALS=Object.freeze([
 {id:'prudente',title:'Prudente',line:'Pochi canali, i soldi dove rendono prima per l’obiettivo; il 15% resta per i test.',reserve:.15,top:2,paidBoost:1},
 {id:'bilanciata',title:'Bilanciata',line:'Tutti i canali del brief, in proporzione a quanto servono all’obiettivo; il 10% resta per i test.',reserve:.10,top:0,paidBoost:1},
 {id:'crescita',title:'Crescita',line:'Più peso ai canali a pagamento che portano volume; nessuna riserva.',reserve:0,top:0,paidBoost:1.6}].map(Object.freeze));
const proposal=id=>PROPOSALS.find(p=>p.id===id)||PROPOSALS[1];
// Whole euros in proportion to the weights, adding up exactly to total (largest remainder; ties: the order given).
function split(total,weights){const ids=Object.keys(weights).filter(k=>weights[k]>0),sum=ids.reduce((a,k)=>a+weights[k],0),T=Math.max(0,Math.round(total));const out={};
 if(!ids.length||!sum)return out;const raw=ids.map((k,i)=>({k,i,v:T*weights[k]/sum}));raw.forEach(r=>{out[r.k]=Math.floor(r.v)});
 let left=T-raw.reduce((a,r)=>a+out[r.k],0);raw.slice().sort((a,b)=>(b.v-Math.floor(b.v))-(a.v-Math.floor(a.v))||a.i-b.i).forEach(r=>{if(left>0){out[r.k]++;left--}});return out}
// One proposal: {id,title,line,lines:[{id,amount,weight,min}],excluded:[{id,reason}],total}. budget: euros a month.
function allocate(budget,channels,goalId,proposalId,{b2b=false}={}){const P=proposal(proposalId),B=Math.round(budget);
 const ids=[...new Set((channels||[]).filter(id=>channel(id)))];
 let pool=ids.map((id,i)=>({id,i,w:weightOf(goalId,id,b2b)*(channel(id).paid?P.paidBoost:1)})).sort((a,b)=>b.w-a.w||a.i-b.i);
 const excluded=[];
 if(P.top&&pool.length>P.top){pool.slice(P.top).forEach(x=>excluded.push({id:x.id,reason:'Fuori dalla proposta prudente: serve meno all’obiettivo.'}));pool=pool.slice(0,P.top)}
 const reserve=pool.length?Math.round(B*P.reserve):0;let spend=B-reserve,amounts={};
 // While a paid channel stays under its minimum, leave out the channel that serves the goal least (ties: the last
 // written): its share goes to the others. When that channel is the one under the minimum, it is the one left out.
 for(;;){amounts=split(spend,Object.fromEntries(pool.map(x=>[x.id,x.w])));
  const under=pool.filter(x=>channel(x.id).min>0&&amounts[x.id]<channel(x.id).min);if(!under.length||pool.length<=1)break;
  const drop=pool.slice().sort((a,b)=>a.w-b.w||b.i-a.i)[0],self=under.some(x=>x.id===drop.id),u=under.sort((a,b)=>b.w-a.w||a.i-b.i)[0];
  excluded.push({id:drop.id,reason:self?'Con questo budget avrebbe '+eur(amounts[drop.id])+' al mese, sotto la soglia di '+eur(channel(drop.id).min)+': la sua quota va agli altri canali.'
   :'Serve meno all’obiettivo: lasciato fuori per portare '+channel(u.id).label+' sopra la soglia di '+eur(channel(u.id).min)+' al mese.'});pool=pool.filter(x=>x.id!==drop.id)}
 const lines=pool.map(x=>({id:x.id,amount:amounts[x.id]||0,weight:x.w,min:channel(x.id).min}));
 if(reserve)lines.push({id:'riserva',amount:reserve,weight:0,min:0});
 // order: the channels as in the brief, the reserve last
 lines.sort((a,b)=>(a.id==='riserva')-(b.id==='riserva')||ids.indexOf(a.id)-ids.indexOf(b.id));
 return {id:P.id,title:P.title,line:P.line,lines,excluded,total:lines.reduce((a,l)=>a+l.amount,0)}}
function proposals(budget,channels,goalId,opts){return PROPOSALS.map(p=>allocate(budget,channels,goalId,p.id,opts))}
// The sum of the lines against the budget.
function totals(lines,budget){const sum=(lines||[]).reduce((a,l)=>a+(fin(l.amount)?l.amount:0),0),B=fin(budget)?budget:0;return {sum:round(sum,2),budget:B,diff:round(B-sum,2),ok:Math.abs(B-sum)<.005}}
const share=(amount,budget)=>budget>0&&fin(amount)?round(amount*100/budget,1):null;
const below=l=>{const c=lineInfo(l.id);return !!(c&&c.min>0&&l.amount>0&&l.amount<c.min)};
// «Metti la differenza nella riserva»: the reserve line takes the gap (created when missing, never negative).
function fillReserve(lines,budget){const t=totals(lines,budget),out=lines.map(l=>({...l}));if(t.ok)return out;let r=out.find(l=>l.id==='riserva');
 if(!r){if(t.diff<0)return out;r={id:'riserva',amount:0,weight:0,min:0};out.push(r)}r.amount=round(Math.max(0,r.amount+t.diff),2);return out}

// ---- KPI: definitions, current values (only data RADIX has), targets ----
// base: the key of baselines() that gives the current value, or null («da misurare»: RADIX has no source for it).
const SOCIAL_KPI=[
 {id:'impressions',label:'Impression al mese',unit:'',better:'up',source:'Buffer o CSV importato nel piano editoriale',base:'social.impressions'},
 {id:'interactions',label:'Interazioni al mese',unit:'',better:'up',source:'Buffer o CSV importato nel piano editoriale',base:'social.interactions'},
 {id:'engagementRate',label:'Engagement medio',unit:'%',d:2,better:'up',source:'Buffer o CSV importato nel piano editoriale',base:'social.engagementRate'},
 {id:'cpr',label:'Costo per risultato degli annunci',unit:'€',d:2,better:'down',source:'Gestione inserzioni della piattaforma',base:null,paidOnly:true}];
const KPI_DEFS=Object.freeze({
 generale:[{id:'newLeads',label:'Lead nuovi nel CRM al mese',unit:'',better:'up',source:'CRM RADIX (workspace del cliente)',base:'crm.newLeads'},
  {id:'siteLeads',label:'Contatti dal modulo del sito al mese',unit:'',better:'up',source:'CRM RADIX, fonte «sito»',base:'crm.siteLeads'}],
 instagram:SOCIAL_KPI,facebook:SOCIAL_KPI,linkedin:SOCIAL_KPI,tiktok:SOCIAL_KPI,youtube:SOCIAL_KPI,
 googleads:[{id:'adsClicks',label:'Clic dagli annunci al mese',unit:'',better:'up',source:'Google Ads',base:null},
  {id:'cpl',label:'Costo per contatto',unit:'€',d:2,better:'down',source:'Google Ads e CRM RADIX',base:null}],
 seo:[{id:'seoClicks',label:'Clic da Google al mese',unit:'',better:'up',source:'Search Console importata in «Risultati SEO»',base:'seo.clicks'},
  {id:'position',label:'Posizione media su Google',unit:'',d:1,better:'down',source:'Search Console importata in «Risultati SEO»',base:'seo.position'},
  {id:'siteScore',label:'Punteggio del sito nell’audit',unit:'/100',better:'up',source:'Audit di comunicazione RADIX',base:'audit.sito'}],
 gbp:[{id:'gbpScore',label:'Punteggio della Scheda Google nell’audit',unit:'/100',better:'up',source:'Audit di comunicazione RADIX',base:'audit.google'},
  {id:'reviewsScore',label:'Punteggio delle recensioni nell’audit',unit:'/100',better:'up',source:'Audit di comunicazione RADIX',base:'audit.recensioni'},
  {id:'gbpActions',label:'Chiamate e indicazioni dalla scheda al mese',unit:'',better:'up',source:'Google Business Profile (statistiche)',base:null}],
 email:[{id:'clickRate',label:'Tasso di clic delle email',unit:'%',d:1,better:'up',source:'CRM RADIX, report campagne',base:'crm.clickRate'},
  {id:'clickers',label:'Persone che cliccano al mese',unit:'',better:'up',source:'CRM RADIX, report campagne',base:'crm.clickers'}],
 whatsapp:[{id:'chats',label:'Conversazioni avviate al mese',unit:'',better:'up',source:'WhatsApp Business (statistiche)',base:null}],
 offline:[{id:'codes',label:'Contatti con il codice o il QR dedicato al mese',unit:'',better:'up',source:'CRM RADIX con una fonte dedicata',base:null}]});
const kpiKey=(ch,id)=>ch+':'+id;
const chLabel=id=>id==='generale'?'Obiettivo generale':(lineInfo(id)||{label:id}).label;
// The current values for the month just closed, from the project data (input of lib/report-studio.js gather) and the
// last saved audit. {month,label,social:{<channel>:{impressions,interactions,engagementRate}},seo:{clicks,position},
// crm:{newLeads,siteLeads,clickRate,clickers}|null, audit:{at,areas:{<area>:score}}|null, notes:[]}
function baselines(src={}){const R=REP(),today=src.today instanceof Date?src.today:new Date(src.today||Date.now()),month=R.defaultMonth(today);
 const d=R.gather({...src,month,today}),K=(sec,k)=>{const x=R.kpisOf(d,sec).find(y=>y.id===k);return x&&fin(x.value)?x.value:null},notes=[];
 const social={};for(const c of (d.social&&d.social.byChannel)||[]){const id=channelOf(c.channel);if(!id||social[id])continue;social[id]={impressions:fin(c.impressions)?c.impressions:null,interactions:fin(c.interactions)?c.interactions:null,engagementRate:fin(c.engagementRate)?c.engagementRate:null}}
 if(!d.social.available)notes.push('Social: '+(d.social.note||NA));
 const seo=d.seo.available?{clicks:K('seo','clicks'),position:K('seo','position')}:{clicks:null,position:null};if(!d.seo.available)notes.push('Google: '+(d.seo.note||NA));
 let crm=null;if(d.leads.available||d.campaigns.available){crm={newLeads:d.leads.available?K('leads','newLeads'):null,siteLeads:d.leads.available?K('leads','siteLeads'):null,
  clickRate:d.campaigns.available?K('campaigns','clickRate'):null,clickers:d.campaigns.available&&d.campaigns.list.length?K('campaigns','clickers'):null}}
 else notes.push('CRM: '+(d.leads.note||NA));
 let audit=null;const A=AUD();if(A){const s=A.readStore(src.agents);const last=s.items.slice().sort((a,b)=>String(a.at).localeCompare(String(b.at))).pop();
  if(last){const areas={};for(const [k,a] of Object.entries(last.data.areas||{}))if(a&&a.available&&fin(a.score))areas[k]=a.score;audit={at:String(last.at||'').slice(0,10),overall:fin(last.overall)?last.overall:null,areas}}}
 if(!audit)notes.push('Audit di comunicazione: nessuno salvato nel progetto.');
 return {month,label:R.monthLabel(month),social,seo,crm,audit,crmWorkspace:d.leads.workspace||'',notes}}
function baseValue(base,path,ch){if(!base||!path)return null;const [sec,k]=path.split('.');
 if(sec==='social'){const s=base.social&&base.social[ch];return s&&fin(s[k])?s[k]:null}
 if(sec==='audit')return base.audit&&fin(base.audit.areas[k])?base.audit.areas[k]:null;
 const s=base[sec];return s&&fin(s[k])?s[k]:null}
const baseFrom=(base,path)=>!path?'':path.startsWith('audit.')?'audit del '+dayIt(base&&base.audit&&base.audit.at):(base&&base.label||'');
// The KPI rows of a plan: the general ones, then each channel with budget > 0 (in the order of the lines). prev: the
// rows already there (their targets are kept).
function kpisFor(lines,base,prev=[]){const funded=(lines||[]).filter(l=>l.id!=='riserva'&&l.amount>0).map(l=>l.id),keep=new Map((prev||[]).map(k=>[k.key,k])),out=[];
 for(const ch of ['generale',...funded])for(const def of KPI_DEFS[ch]||[]){if(def.paidOnly&&!(channel(ch)||{}).paid)continue;const key=kpiKey(ch,def.id),value=baseValue(base,def.base,ch),old=keep.get(key);
  out.push({key,channel:ch,id:def.id,label:def.label,unit:def.unit,d:def.d==null?(def.unit==='%'?1:0):def.d,better:def.better,source:def.source,
   baseline:fin(value)?{value,from:baseFrom(base,def.base)}:null,target:old&&fin(old.target)?old.target:null,targetBy:old&&fin(old.target)?old.targetBy||'persona':''})}
 return out}
const status=k=>!k.baseline?(fin(k.target)?'senza-base':'da-misurare'):fin(k.target)?'pronto':'da-fissare';
const kpiStatus=k=>status(k);
const STATUS_LABEL=Object.freeze({'da-misurare':TBD,'senza-base':TBD+' · obiettivo tuo','da-fissare':'obiettivo da fissare',pronto:'obiettivo fissato'});
// A target from the current value and a growth the person typed (for «better: down» the value has to go down).
function deriveTarget(k,growthPct){if(!k.baseline||!fin(growthPct))return null;const f=k.better==='down'?1-growthPct/100:1+growthPct/100,v=k.baseline.value*f;
 const d=k.unit==='%'||k.unit==='€'?Math.max(k.d,1):k.d;let t=round(v,d);if(k.unit==='/100')t=Math.min(100,Math.round(v));if(k.unit===''&&!k.d)t=Math.round(v);return t}
function deriveTargets(kpis,growthPct,{overwrite=false}={}){return kpis.map(k=>{if(!k.baseline||(!overwrite&&fin(k.target)&&k.targetBy==='persona'))return {...k};const t=deriveTarget(k,growthPct);return fin(t)?{...k,target:t,targetBy:'+'+fmtNum(growthPct,1)+'% sul dato attuale'}:{...k}})}
// Priorities from the last audit: areas under 60, lowest first, with the channels they hold back.
const AUDIT_AREAS=Object.freeze({sito:{title:'Sito web',channels:['seo','googleads','facebook','instagram']},seo:{title:'Google Search',channels:['seo']},dati:{title:'Dati strutturati',channels:['seo']},
 google:{title:'Scheda Google',channels:['gbp']},recensioni:{title:'Recensioni',channels:['gbp']},social:{title:'Social',channels:['instagram','facebook','linkedin','tiktok','youtube']},brand:{title:'Coerenza dell’identità',channels:[]}});
function priorities(base,lines){if(!base||!base.audit)return [];const funded=(lines||[]).filter(l=>l.amount>0).map(l=>l.id);
 return Object.entries(base.audit.areas).filter(([,s])=>s<60).sort((a,b)=>a[1]-b[1]).map(([id,s])=>{const a=AUDIT_AREAS[id]||{title:id,channels:[]},hit=funded.filter(c=>a.channels.includes(c));
  return {area:id,title:a.title,score:s,channels:hit,text:a.title+': '+s+'/100 nell’audit del '+dayIt(base.audit.at)+(hit.length?'. Prima di spendere su '+hit.map(chLabel).join(', ')+', sistema quest’area.':'. Da sistemare nel piano.')}})}

// ---- the plan (what the studio edits, exports and saves) ----
const FIELDS=Object.freeze([['goal','Obiettivo'],['audience','Pubblico e bisogno principale'],['channels','Canali'],['period','Periodo'],['voice','Tone of voice e vincoli'],['brand','Brand e contesto'],['offer','Offerta e proposta di valore'],
 ['positioning','Posizionamento'],['messages','Messaggi chiave'],['topics','Rubriche e argomenti'],['frequency','Frequenza per canale'],['kpis','KPI e criteri di successo'],['materials','Materiali e riferimenti'],['gaps','Lacune e vincoli da risolvere']].map(Object.freeze));
// The approved strategy of the «editorial» document: {ok, reason, brief, revision, approvedAt}.
function strategyOf(editorial){const e=editorial&&typeof editorial==='object'?editorial:null;
 if(!e||!e.brief)return {ok:false,reason:'Il progetto non ha ancora una strategia: compila il brief.',brief:{},revision:0,approvedAt:''};
 const brief=Object.fromEntries(FIELDS.map(([k])=>[k,block(e.brief[k])])),rev=e.strategyRevision||0,ap=e.strategyApproval;
 const approved=!!(e.briefApproved&&ap&&ap.revision===rev);
 return {ok:approved,reason:approved?'':'La strategia v'+rev+' non è ancora approvata: approvala nel brief, poi torna qui.',brief,revision:rev,approvedAt:approved?String(ap.approvedAt||'').slice(0,10):''}}
// plan: {project, at, strategy:{brief,revision,approvedAt}, goal, b2b, channels, budget, months, start, proposal, lines, kpis, growth, base, note}
function newPlan({strategy,projectName,today,base}={}){const s=strategy||{brief:{},revision:0},t=today instanceof Date?today:new Date(today||Date.now());
 return {v:1,project:clean(projectName).slice(0,120),at:t.toISOString(),strategy:{brief:{...s.brief},revision:s.revision||0,approvedAt:s.approvedAt||''},
  goal:detectGoal(s.brief&&s.brief.goal)||'',b2b:isB2b(s.brief&&s.brief.audience),channels:parseChannels(s.brief&&s.brief.channels),budget:null,months:6,start:shiftMonth(monthOf(t),1),
  proposal:'',lines:[],excluded:[],kpis:[],growth:null,base:base||null,note:''}}
const periodOfPlan=p=>periodOf(p.start,p.months);
const fundedLines=p=>(p.lines||[]).filter(l=>l.amount>0);

// ---- checks before the export ----
// Numbers in the brief that look like market figures (a % or the words of a market statistic) and are not one of the
// plan's own numbers: «Nessuna cifra di mercato senza fonte».
const MARKET=/%|per ?cento|mercato|settore|media nazionale|benchmark|istat|statistic|crescita del|ogni anno/i;
function allowedNumbers(p){const out=new Set(),add=v=>{if(!fin(v))return;const n=Math.abs(v);[String(n),String(Math.round(n)),String(Math.round(n*10)/10)].forEach(x=>out.add(x))};
 add(p.budget);add(p.months);if(fin(p.budget)&&fin(p.months))add(p.budget*p.months);(p.lines||[]).forEach(l=>{add(l.amount);add(share(l.amount,p.budget))});
 (p.kpis||[]).forEach(k=>{add(k.target);if(k.baseline)add(k.baseline.value)});const per=periodOfPlan(p);if(per){per.start.split('-').map(Number).forEach(add);per.end.split('-').map(Number).forEach(add)}
 return out}
function marketFigures(p){const N=NEXT(),inText=t=>N?N.numbersIn(t):(String(t||'').match(/\d+(?:[.,]\d+)?/g)||[]),allowed=allowedNumbers(p),out=[];
 for(const [k,label] of FIELDS){for(const sentence of String(p.strategy.brief[k]||'').split(/(?<=[.!?;])\s+|\n/)){if(!MARKET.test(sentence)||/fonte|source|https?:\/\//i.test(sentence))continue;
  const odd=inText(sentence).filter(n=>!allowed.has(n));if(odd.length)out.push(label+': «'+clean(sentence).slice(0,110)+'»')}}
 return out}
function checksOf(p){const out=[],add=(id,label,state,detail,issues=[])=>out.push({id,label,state,detail,issues});
 add('strategia','Strategia approvata',p.strategy.approvedAt?'ok':'fail',p.strategy.approvedAt?'Versione '+p.strategy.revision+' approvata il '+dayIt(p.strategy.approvedAt)+'.':'Approva la strategia nel brief prima di mandare budget e KPI al cliente.');
 add('budget','Budget del cliente',fin(p.budget)&&p.budget>0?'ok':'fail',fin(p.budget)&&p.budget>0?eur(p.budget)+' al mese per '+p.months+' mesi: '+eur(p.budget*p.months)+' in tutto.':'Scrivi il budget mensile: RADIX non lo propone e non lo stima.');
 const t=totals(p.lines,p.budget);
 add('totale','Somma dei canali',!p.lines.length?'fail':t.ok?'ok':'fail',!p.lines.length?'Scegli una ripartizione.':t.ok?'La somma dei canali è uguale al budget: '+eur(t.sum)+'.':'La somma è '+eur(t.sum)+', il budget '+eur(t.budget)+': '+(t.diff>0?'mancano ':'avanzano ')+eur(Math.abs(t.diff))+'.');
 const low=fundedLines(p).filter(below);
 add('minimi','Soglie minime',low.length?'warn':'ok',low.length?'Sotto la soglia RADIX il canale raccoglie troppi pochi dati per imparare: alza la cifra o togli il canale.':'Ogni canale a pagamento è sopra la sua soglia minima.',low.map(l=>chLabel(l.id)+': '+eur(l.amount)+' al mese, soglia '+eur(lineInfo(l.id).min)));
 const ks=p.kpis||[],funded=fundedLines(p).filter(l=>l.id!=='riserva').map(l=>l.id),noKpi=funded.filter(ch=>!ks.some(k=>k.channel===ch));
 add('fonti','KPI con una fonte di misura',!ks.length||noKpi.length?'fail':'ok',!ks.length?'Nessun KPI: prepara i KPI.':noKpi.length?'Canali senza KPI.':'Ogni canale con budget ha i suoi KPI, ognuno con la fonte da cui si misura.',noKpi.map(chLabel));
 const tbd=ks.filter(k=>!k.baseline);
 add('base','Dato attuale',tbd.length?'warn':'ok',tbd.length?tbd.length+' KPI su '+ks.length+' sono «'+TBD+'»: RADIX non ha ancora il dato, il primo mese serve a misurarlo.':'Ogni KPI ha il suo dato attuale.',tbd.map(k=>chLabel(k.channel)+' · '+k.label));
 const noT=ks.filter(k=>k.baseline&&!fin(k.target)),per=periodOfPlan(p);
 add('obiettivi','Obiettivi con numero e data',noT.length?'warn':'ok',noT.length?'Questi KPI hanno il dato attuale ma non l’obiettivo: scrivilo o usa «+N% sul dato attuale».':'Ogni obiettivo fissato ha un numero e una data'+(per?': il '+per.untilLabel:'')+'.',noT.map(k=>chLabel(k.channel)+' · '+k.label));
 const mf=marketFigures(p);
 add('cifre','Cifre di mercato',mf.length?'warn':'ok',mf.length?'Nel brief ci sono cifre senza fonte: scrivi da dove vengono o toglile.':'Nessuna cifra di mercato senza fonte nel brief.',mf.slice(0,6));
 return out}
const blocking=cs=>cs.filter(c=>c.state==='fail');

// ---- the brand ----
function brandFor(profile,projectName){const R=REP();if(R&&R.brandFor)return R.brandFor(profile,projectName);const b=PS().brandOf(profile,projectName);return {...b,source:b.fromKit?'kit':'default'}}
const mix=(a,b,t)=>{const x=[1,3,5].map(i=>parseInt(a.slice(i,i+2),16)),y=[1,3,5].map(i=>parseInt(b.slice(i,i+2),16));return '#'+x.map((v,i)=>Math.round(v*t+y[i]*(1-t)).toString(16).padStart(2,'0')).join('').toUpperCase()};
const SUB='#55516A',WARN='#9A3A00';

// ---- the A4 PDF of the full brief (print-studio document: items in mm, origin top-left) ----
const W=210,H=297,MG=16,CW=W-2*MG;
function titleOf(p){return 'Strategia di marketing'+(p.project?' · '+p.project:'')}
function layoutBrief(p,brand,{date}={}){const P=PS(),b=brand||P.brandOf(null,p.project),pal=b.palette,when=date instanceof Date?date:new Date(p.at||Date.now()),per=periodOfPlan(p),br=p.strategy.brief;
 const safe=s=>Array.from(String(s==null?'':s)).map(ch=>P.winAnsi(ch)===63&&ch!=='?'?(/[←-⇿]/.test(ch)?'-':''):ch).join('');
 const tw=(s,size,bold)=>P.ptToMm(P.textWidth(safe(s),size,bold)),lead=(size,f=1.38)=>P.ptToMm(size*f);
 const ink=P.ink('#FFFFFF',pal,pal.dark,'#1C1C1E'),head=P.ink(pal.primary,pal,'#FFFFFF',pal.light),accent=P.contrast(pal.primary,'#FFFFFF')>=4.5?pal.primary:ink,tile=mix(pal.primary,'#FFFFFF',.07),line='#D9D6E3';
 const pages=[];let pg=null,y=0;const TOP=34,BOTTOM=H-20;
 const T=(s,x,yy,size,fill,bold,align)=>{s=safe(s);if(!s)return;const w=tw(s,size,bold);pg.items.push({t:'text',x:align==='right'?x-w:align==='center'?x-w/2:x,y:yy,s,size,bold:!!bold,fill})};
 const R=(x,yy,w,h,fill)=>pg.items.push({t:'rect',x,y:yy,w,h,fill});
 const Ln=(x1,y1,x2,y2,stroke,width=.5)=>pg.items.push({t:'line',x1,y1,x2,y2,stroke,width});
 const fit=(s,size,w,bold)=>{s=safe(s);if(tw(s,size,bold)<=w)return s;while(s.length>1&&tw(s+'…',size,bold)>w)s=s.slice(0,-1);return s.trimEnd()+'…'};
 function newPage(){pg={w:W,h:H,items:[],label:'Pagina '+(pages.length+1),folds:[]};pages.push(pg);const vb=b.logo?P.viewBox(b.logo):null;
  if(vb){const h=10,w=Math.min(46,h*vb[2]/vb[3]);pg.items.push({t:'logo',x:MG,y:9,w,h:w*vb[3]/vb[2],svg:b.logo,vb,bg:'#FFFFFF'})}else T(fit(b.name||p.project||'',12,90,true),MG,17,12,ink,true);
  T(fit('Strategia di marketing'+(per?' · '+per.label:''),8.5,100),W-MG,15,8.5,SUB,false,'right');if(p.project)T(fit(p.project,8.5,90),W-MG,19.5,8.5,SUB,false,'right');R(MG,23,CW,.8,pal.primary);y=TOP}
 const need=h=>{if(y+h>BOTTOM)newPage()};
 function para(text,size=10,fill=ink,{bold=false,gap=2.2,indent=0}={}){for(const l of P.wrap(safe(text),size,CW-indent,bold).filter(x=>x!=='')){need(lead(size));y+=lead(size);T(l,MG+indent,y,size,fill,bold)}y+=gap}
 function heading(text,right){need(32);y+=6;R(MG,y,2.4,5.6,pal.primary);T(fit(text,13,CW-50,true),MG+5,y+4.6,13,ink,true);if(right)T(fit(right,9,60),W-MG,y+4.6,9,SUB,false,'right');y+=10}
 function field(label,text){if(!clean(text))return;need(lead(8.5)+lead(10)+2);y+=lead(8.5);T(label.toUpperCase(),MG,y,7.5,accent,true);y+=.8;para(text,10,ink,{gap:2.6})}
 function tiles(list){const cols=list.length,gap=4,w=(CW-gap*(cols-1))/cols,h=24;need(h+4);list.forEach((k,j)=>{const x=MG+j*(w+gap);R(x,y,w,h,tile);R(x,y,w,.7,pal.primary);T(fit(k[0],8,w-6),x+3,y+6.5,8,SUB);T(fit(k[1],15,w-6,true),x+3,y+15.5,15,ink,true);if(k[2])T(fit(k[2],7.5,w-6),x+3,y+21,7.5,SUB)});y+=h+4}
 function table(cols,rows,{size=9}={}){const rh=lead(size,1.75),ws=cols.map(c=>c.w*CW),xs=ws.map((_,i)=>MG+ws.slice(0,i).reduce((a,c)=>a+c,0));
  const headRow=()=>{need(rh+2);y+=rh-1;cols.forEach((c,i)=>T(fit(c.label,8,ws[i]-2,true),c.align==='right'?xs[i]+ws[i]-1:xs[i]+1,y-1.4,8,SUB,true,c.align));Ln(MG,y,MG+CW,y,ink,.6)};
  headRow();for(const r of rows){if(y+rh>BOTTOM){newPage();headRow()}y+=rh;r.cells.forEach((v,i)=>{const c=cols[i],s=String(v==null?'':v),grey=s===TBD||s===NA||s==='—';T(fit(s,size,ws[i]-2,(c.bold||r.bold)&&!grey),c.align==='right'?xs[i]+ws[i]-1:xs[i]+1,y-1.6,size,grey?SUB:r.warn&&i===cols.length-1?WARN:ink,!!(c.bold||r.bold)&&!grey,c.align)});Ln(MG,y,MG+CW,y,r.bold?ink:line,r.bold?.6:.35)}y+=4}
 function bars(list){const max=Math.max(...list.map(l=>l.amount),0);if(!max)return;for(const l of list){need(7);y+=6;T(fit(chLabel(l.id),9,44),MG,y,9,ink);const bw=Math.max(.6,(CW-80)*l.amount/max);R(MG+46,y-3.4,bw,4,l.id==='riserva'?mix(pal.primary,'#FFFFFF',.35):pal.primary);T(eur(l.amount)+' · '+fmtNum(share(l.amount,p.budget),1)+'%',MG+48+bw,y,9,ink)}y+=4}
 function list(items,numbered){items.forEach((t,i)=>{const ls=P.wrap(safe(t),10,CW-8,false).filter(x=>x!=='');need(lead(10)*ls.length+1);ls.forEach((l,j)=>{y+=lead(10);if(!j)T(numbered?(i+1)+'.':'•',MG+1,y,10,accent,true);T(l,MG+7,y,10,ink)});y+=1.4});y+=2}
 // first page: title band and the plan in four numbers
 newPage();R(MG,y-4,CW,32,pal.primary);T(fit('Strategia di marketing',22,CW-12,true),MG+6,y+8,22,head,true);
 T(fit([p.project,per&&per.label].filter(Boolean).join(' · '),10.5,CW-12),MG+6,y+16.5,10.5,head);
 T(fit('Strategia v'+p.strategy.revision+(p.strategy.approvedAt?' approvata il '+dayIt(p.strategy.approvedAt):' da approvare')+(goal(p.goal)?' · obiettivo: '+goal(p.goal).label.toLowerCase():''),9,CW-12),MG+6,y+23,9,head);y+=34;
 const ks=p.kpis||[],withBase=ks.filter(k=>k.baseline).length,funded=fundedLines(p).filter(l=>l.id!=='riserva');
 tiles([['Budget al mese',eur(p.budget),'scritto dal cliente'],['Totale del periodo',fin(p.budget)?eur(p.budget*p.months):NA,p.months+' mesi'],['Canali con budget',String(funded.length),proposal(p.proposal).title.toLowerCase()],['KPI con dato attuale',withBase+' su '+ks.length,ks.length-withBase?(ks.length-withBase)+' '+TBD:'']]);
 if(clean(p.note))para(p.note,10.5,ink,{gap:3});
 heading('Situazione');field('Brand e contesto',br.brand);field('Offerta e proposta di valore',br.offer);field('Materiali e riferimenti',br.materials);
 heading('Obiettivo',per?'entro il '+per.untilLabel:'');field('Obiettivo',br.goal);field('KPI scritti nel brief',br.kpis);
 heading('Pubblico e posizionamento');field('Pubblico e bisogno principale',br.audience);field('Posizionamento',br.positioning);field('Messaggi chiave',br.messages);field('Tone of voice e vincoli',br.voice);
 heading('Canali e piano');field('Canali',br.channels);field('Frequenza per canale',br.frequency);field('Periodo',br.period);field('Rubriche e argomenti',br.topics);
 heading('Budget per canale',proposal(p.proposal).title+(per?' · '+per.months+' mesi':''));
 para('Budget mensile scritto dal cliente: '+eur(p.budget)+'. La ripartizione segue regole fisse sull’obiettivo e i canali del brief, poi rifinita a mano.',9,SUB,{gap:1});
 bars(p.lines.filter(l=>l.amount>0));
 table([{label:'Canale',w:.25},{label:'Al mese',w:.15,align:'right',bold:true},{label:'Quota',w:.1,align:'right'},{label:'Totale '+p.months+' mesi',w:.17,align:'right'},{label:'Note',w:.33}],
  p.lines.map(l=>({cells:[chLabel(l.id),eur(l.amount),fmtNum(share(l.amount,p.budget),1)+'%',eur(l.amount*p.months),below(l)?'Sotto la soglia di '+eur(lineInfo(l.id).min)+' al mese':l.amount?lineInfo(l.id).buys:'Senza budget: solo lavoro organico'],warn:below(l)}))
   .concat([{cells:['Totale',eur(totals(p.lines,p.budget).sum),'100%',eur(totals(p.lines,p.budget).sum*p.months),totals(p.lines,p.budget).ok?'Uguale al budget':'Diverso dal budget'],bold:true}]));
 if((p.excluded||[]).length)para('Lasciati fuori: '+p.excluded.map(x=>chLabel(x.id)+' ('+x.reason.replace(/\.$/,'').toLowerCase()+')').join('; ')+'.',8.5,SUB);
 heading('KPI e modalità di misura',per?'obiettivi al '+per.untilLabel:'');
 table([{label:'Canale',w:.15},{label:'KPI',w:.29},{label:'Dato attuale',w:.13,align:'right'},{label:'Obiettivo',w:.12,align:'right',bold:true},{label:'Fonte di misura',w:.31}],
  ks.map(k=>({cells:[chLabel(k.channel),k.label,k.baseline?fmtVal(k.baseline.value,k.unit,k.d):TBD,fin(k.target)?fmtVal(k.target,k.unit,k.d):'—',k.source]})),{size:8.5});
 const tbd=ks.filter(k=>!k.baseline);
 if(tbd.length)para('«'+TBD+'»: RADIX non ha ancora questo dato per il progetto; il primo mese serve a misurarlo dalla fonte indicata, poi si fissa l’obiettivo. '+(p.base?'Dato attuale: '+p.base.label+', dai dati del progetto.':''),8.5,SUB);
 const gr=ks.filter(k=>/sul dato attuale/.test(k.targetBy||''));if(gr.length)para('Obiettivi calcolati: '+gr[0].targetBy+' (scelta dell’agenzia).',8.5,SUB);
 const pr=priorities(p.base,p.lines);if(pr.length){heading('Priorità dall’audit');list(pr.map(x=>x.text),true)}
 if(clean(br.gaps)){heading('Lacune e vincoli');para(br.gaps,10)}
 need(14);y+=4;para('Budget scritto dal cliente: RADIX non lo propone e non lo stima. Soglie minime per canale: regole interne RADIX, non prezzi di mercato. Un dato che RADIX non ha è scritto «'+TBD+'»: non è uno zero e non è stimato.',7.5,SUB);
 const day=dayIt(when.toISOString());
 pages.forEach((x,i)=>{pg=x;Ln(MG,H-13,W-MG,H-13,line,.35);T(fit('Preparato con RADIX il '+day+(b.name?' per '+b.name:''),7.5,CW-30),MG,H-8.5,7.5,SUB);T('Pagina '+(i+1)+' di '+pages.length,W-MG,H-8.5,7.5,SUB,false,'right')});
 return {title:titleOf(p),format:'a4-report',values:{name:b.name||p.project},brand:b,pages}}
function fitProblems(doc){const P=PS(),out=[];doc.pages.forEach((pg,i)=>pg.items.forEach(it=>{if(it.t!=='text')return;const w=P.ptToMm(P.textWidth(it.s,it.size,it.bold));if(it.x<MG-.5||it.x+w>W-MG+.5||it.y>H-4)out.push({page:i+1,text:it.s.slice(0,40)})}));return out}
function briefPdf(p,brand,{date,doc}={}){const P=PS(),d=doc||layoutBrief(p,brand,{date});return P.pdf(d,{mode:'web',date:date||new Date(p.at||Date.now()),title:d.title,producer:'RADIX Budget e KPI della strategia'})}

// ---- the slides (lib/doc-studio.js «presentazione» model → deck → .pptx) ----
const firstSentences=(s,max=150)=>{const t=clean(String(s||'').replace(/\n+/g,' '));if(t.length<=max)return t;const cut=t.slice(0,max),i=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('; '));return (i>60?cut.slice(0,i+1):cut.replace(/\s+\S*$/,'')+'…')};
const linesOf=(s,n)=>String(s||'').split(/\n|;\s+|(?<=\.)\s+(?=[A-ZÀ-Ú])/).map(x=>clean(x.replace(/^[-*•\d.)\s]+/,''))).filter(Boolean).slice(0,n).map(x=>firstSentences(x,90));
function deckModel(p){const per=periodOfPlan(p),br=p.strategy.brief,ks=p.kpis||[],t=totals(p.lines,p.budget);
 const kLine=k=>chLabel(k.channel)+' · '+k.label.replace(/ al mese$/,'')+': '+(k.baseline?fmtVal(k.baseline.value,k.unit,k.d):TBD)+(fin(k.target)?' → '+fmtVal(k.target,k.unit,k.d):'');
 const set=ks.filter(k=>fin(k.target)),tbd=ks.filter(k=>!k.baseline);
 const slides=[
  {layout:'title',title:'Strategia di marketing',bullets:[[p.project,per&&per.label].filter(Boolean).join(' · '),'Budget per canale e KPI'],note:'Strategia v'+p.strategy.revision+(p.strategy.approvedAt?' approvata il '+dayIt(p.strategy.approvedAt):'')+'.'},
  {layout:'content',title:'Obiettivo e pubblico',bullets:[firstSentences(br.goal,120),firstSentences(br.audience,120),per?'Entro il '+per.untilLabel:''].filter(Boolean),note:block(br.goal)+'\n\n'+block(br.audience)},
  {layout:'content',title:'Posizionamento e messaggi',bullets:[firstSentences(br.positioning,110),...linesOf(br.messages,3)].filter(Boolean),note:block(br.positioning)+'\n\n'+block(br.messages)},
  {layout:'section',title:'Budget per canale',bullets:[eur(p.budget)+' al mese per '+p.months+' mesi: '+eur(t.sum*p.months)+' in tutto'],note:'Budget scritto dal cliente. Proposta «'+proposal(p.proposal).title+'»: '+proposal(p.proposal).line},
  {layout:'two',title:'Ripartizione al mese',bullets:p.lines.filter(l=>l.amount>0).map(l=>chLabel(l.id)+' · '+eur(l.amount)+' ('+fmtNum(share(l.amount,p.budget),1)+'%)'),note:p.lines.map(l=>chLabel(l.id)+': '+eur(l.amount)+' al mese, '+eur(l.amount*p.months)+' nel periodo. '+(lineInfo(l.id).buys||'')+(below(l)?' Sotto la soglia RADIX di '+eur(lineInfo(l.id).min)+'.':'')).join('\n')},
  {layout:'content',title:'KPI e obiettivi'+(per?' al '+per.untilLabel:''),bullets:(set.length?set:ks.filter(k=>k.baseline)).slice(0,5).map(kLine),note:ks.map(k=>kLine(k)+' · fonte: '+k.source).join('\n')}];
 if(tbd.length)slides.push({layout:'content',title:'Da misurare il primo mese',bullets:tbd.slice(0,5).map(k=>chLabel(k.channel)+' · '+k.label.replace(/ al mese$/,'')),note:'RADIX non ha ancora questi dati: si misurano dalla fonte indicata, poi si fissa l’obiettivo.\n'+tbd.map(k=>chLabel(k.channel)+' · '+k.label+': '+k.source).join('\n')});
 const pr=priorities(p.base,p.lines);if(pr.length)slides.push({layout:'content',title:'Priorità dall’audit',bullets:pr.slice(0,4).map(x=>x.title+': '+x.score+'/100'),note:pr.map(x=>x.text).join('\n')});
 slides.push({layout:'closing',title:'Prossimi passi',bullets:['Approvare budget e KPI','Attivare la misura dei KPI «'+TBD+'»','Piano editoriale del primo mese'],note:''});
 return {type:'presentazione',name:p.project,title:titleOf(p),slides:slides.map(s=>({...s,bullets:s.bullets.filter(Boolean)}))}}
function deckOf(p,brand,style){const D=DS();return D.deckFrom(deckModel(p),brand,{style:style||'editorial'})}
function slidesDoc(p,brand,style){const D=DS(),deck=deckOf(p,brand,style),doc=D.slideDoc(deck,brand);doc.deck=deck;return doc}
function pptxBytes(p,brand,media={},{style,date}={}){const D=DS();return D.pptxDeck(deckOf(p,brand,style),brand,media,{date:date||new Date(p.at||Date.now()),author:brand&&brand.name||p.project||'RADIX'})}

// ---- the budget as CSV (Excel in Italian: semicolons, decimal comma, BOM, CRLF) ----
const csvCell=v=>{const s=String(v==null?'':v);return /[;"\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
const csvNum=v=>fin(v)?String(round(v,2)).replace('.',','):'';
function budgetCsv(p){const per=periodOfPlan(p),rows=[['Canale','Tipo','Euro al mese','Quota %','Mesi','Totale periodo (euro)','Soglia minima RADIX (euro al mese)','Note']];
 const kind={social:'Social',search:'Ricerca a pagamento',owned:'Canale proprio',offline:'Offline',reserve:'Riserva'};
 for(const l of p.lines){const c=lineInfo(l.id);rows.push([chLabel(l.id),kind[c.kind]||'',csvNum(l.amount),csvNum(share(l.amount,p.budget)),String(p.months),csvNum(l.amount*p.months),c.min?csvNum(c.min):'',below(l)?'Sotto la soglia minima':l.amount?c.buys:'Senza budget'])}
 const t=totals(p.lines,p.budget);rows.push(['Totale','',csvNum(t.sum),t.ok?'100':csvNum(share(t.sum,p.budget)),String(p.months),csvNum(t.sum*p.months),'',t.ok?'Uguale al budget':'Diverso dal budget di '+csvNum(p.budget)]);
 rows.push([]);rows.push(['Progetto',p.project]);rows.push(['Periodo',per?per.label:'']);rows.push(['Proposta',proposal(p.proposal).title]);rows.push(['Strategia','v'+p.strategy.revision+(p.strategy.approvedAt?' approvata il '+dayIt(p.strategy.approvedAt):'')]);
 return '﻿'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n')+'\r\n'}
const fileBase=(p,brand)=>'strategia-'+(slug(brand&&brand.name||p.project)||'progetto')+'-'+(p.start||'');

// ---- saved in the project: the «agents» document, key strategyBudget ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(doc){const s=doc&&doc.strategyBudget;return s&&typeof s==='object'&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>x&&typeof x==='object'&&x.plan&&Array.isArray(x.plan.lines))}:emptyStore()}
function savedRecord(p,{by,at}={}){const when=at||new Date().toISOString();
 return {id:'budget-'+when.replace(/\D/g,'').slice(0,14),at:when,by:clean(by).slice(0,80),revision:p.strategy.revision,budget:p.budget,months:p.months,start:p.start,proposal:p.proposal,plan:JSON.parse(JSON.stringify(p)),checks:checksOf(p).map(c=>({id:c.id,state:c.state}))}}
function addRecord(store,rec){const s=readStore({strategyBudget:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');const doc=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await doc.load())||{},next=addRecord(readStore(cur),rec);
  try{await doc.save({...cur,schemaVersion:1,conversations:cur.conversations||{},strategyBudget:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
// A saved plan made on an older strategy: the brief changed after it.
const outdated=(rec,strategy)=>!!(rec&&strategy&&strategy.revision&&rec.revision!==strategy.revision);

// ---- the widget (browser) ----
let counter=0;
const dom=()=>root.document;
const E=(tag,text,cls)=>{const n=dom().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
const svgImg=(svg,alt)=>{const i=E('img');i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);i.alt=alt||'';i.decoding='async';return i};
async function canvasBytes(c){const blob=await new Promise(r=>c.toBlob(r,'image/png'));return new Uint8Array(await blob.arrayBuffer())}
async function logoImage(svg,maxW){const P=PS(),vb=P.viewBox(svg);if(!vb)return null;const s=Math.min(4,maxW/vb[2]),w=Math.max(1,Math.round(vb[2]*s)),h=Math.max(1,Math.round(vb[3]*s)),img=new root.Image();img.src=P.svgUrl(svg);await img.decode();
 const c=dom().createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);return {type:'png',data:await canvasBytes(c),w,h}}
async function deckMedia(deck,brand){const P=PS(),media={};if(!brand.logo)return media;for(const s of deck.slides)for(const x of s.shapes){if(x.t!=='logo')continue;const k=x.mono?'logo:'+String(x.mono).toUpperCase():'logo';if(media[k])continue;
  try{media[k]=await logoImage(k==='logo'?brand.logo:P.monoSvg(brand.logo,k.slice(5)),1200)}catch(e){/* the name takes its place */}}return media}
async function readProject(ws,projectId){const R=REP();return R.readProject(ws,projectId)}
// ctx: {project, profile, projectName, projectId, workspace, agentsUrl, briefUrl, by, fetch, today}
function strategyBudgetStudio(ctx={}){const n=++counter,P=PS(),R=REP(),profile=ctx.profile||{},wrap=E('div',undefined,'tool photo-studio ad-studio report-studio strategy-budget');
 const steps=E('ol',undefined,'ps-steps');['Strategia e budget','Scegli la ripartizione','Rifinisci','KPI','Export'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');wrap.append(steps);setStep(1);
 const brand=brandFor(profile,ctx.projectName),today=()=>ctx.today?new Date(ctx.today):new Date();
 const st={src:null,strategy:null,plan:null,crm:'',crmList:[],busy:false,saved:[]};
 const status=E('p','','tool-status');status.setAttribute('role','status');
 const saved=E('div',undefined,'ad-saved rp-saved');saved.hidden=true;
 const head=E('div',undefined,'sb-head'),form=E('div',undefined,'ps-form sb-form'),dirs=E('div',undefined,'ad-dirs rp-dirs sb-dirs'),refine=E('div',undefined,'rp-result sb-refine'),kpiBox=E('div',undefined,'rp-result sb-kpi'),result=E('div',undefined,'rp-result sb-export');
 dirs.hidden=refine.hidden=kpiBox.hidden=result.hidden=true;
 wrap.append(saved,head,form,status,dirs,refine,kpiBox,result);
 const scroll=x=>x.scrollIntoView&&x.scrollIntoView({behavior:'smooth',block:'start'});
 // 1. the strategy, the goal, the channels and the budget
 function renderHead(){const s=st.strategy,box=E('section',undefined,'sb-strategy');box.dataset.ok=String(!!(s&&s.ok));
  const top=E('div',undefined,'rp-source-top');top.append(E('span',s&&s.ok?'Strategia approvata':'Da approvare','rp-badge'),E('h4',s&&s.revision?'Strategia v'+s.revision+(s.approvedAt?' · approvata il '+dayIt(s.approvedAt):''):'Strategia del progetto'));box.append(top);
  if(!s||!s.ok){box.append(E('p',s?s.reason:'Leggo la strategia del progetto…','rp-note'));if(ctx.briefUrl&&s){const a=E('a','Apri il brief della strategia →','sb-link');a.href=ctx.briefUrl;box.append(a)}head.replaceChildren(box);return}
  const dl=E('dl',undefined,'sb-brief');[['goal','Obiettivo'],['audience','Pubblico'],['channels','Canali'],['period','Periodo']].forEach(([k,l])=>{if(!s.brief[k])return;dl.append(E('dt',l),E('dd',firstSentences(s.brief[k],180)))});box.append(dl);head.replaceChildren(box)}
 function renderForm(){const p=st.plan;form.replaceChildren();if(!p){form.hidden=true;return}form.hidden=false;
  const bx=E('div',undefined,'ad-brand rp-brand');bx.dataset.source=brand.source;const sw=E('span',undefined,'ad-swatches');['primary','secondary','accent','dark','light'].forEach(k=>{const i=E('i');i.style.background=brand.palette[k];sw.append(i)});
  const bt=E('span',undefined,'ad-brand-text');bt.append(E('strong',brand.name||ctx.projectName||'Il progetto'),E('span',brand.source==='kit'?'Colori e logo dal Kit identità per PDF e slide':brand.source==='visual'?'Colori dall’identità visiva del profilo · senza logo: uso il nome':'Nessun Kit identità: PDF e slide in uno stile neutro con il nome.'));bx.append(sw,bt);
  const fs=E('fieldset',undefined,'rp-pick');fs.append(E('legend','Obiettivo, canali e budget'));const g=E('div',undefined,'rp-fields');
  const gl=E('label',undefined,'rp-field'),gs=E('select');gs.name='sb-goal-'+n;const g0=E('option','Scegli l’obiettivo');g0.value='';gs.append(g0);GOALS.forEach(x=>{const o=E('option',x.label);o.value=x.id;gs.append(o)});gs.value=p.goal;gs.onchange=()=>{p.goal=gs.value};
  gl.append(E('span','Obiettivo principale'),gs,E('small',p.goal&&detectGoal(p.strategy.brief.goal)===p.goal?'Letto dal campo «Obiettivo» del brief: cambialo se serve.':'Nel brief non ho trovato parole chiare: sceglilo tu.','rp-help'));
  const bl=E('label',undefined,'rp-field'),bi=E('input');bi.type='text';bi.inputMode='decimal';bi.name='sb-budget-'+n;bi.placeholder='Es. 1.200';bi.value=fin(p.budget)?fmtNum(p.budget):'';bi.autocomplete='off';
  bi.oninput=()=>{const v=parseAmount(bi.value);p.budget=v!=null?Math.round(v):null;tot.textContent=fin(p.budget)?'Totale: '+eur(p.budget*p.months)+' in '+p.months+' mesi.':'Scrivilo tu: RADIX non propone cifre.'};
  const tot=E('small',fin(p.budget)?'Totale: '+eur(p.budget*p.months)+' in '+p.months+' mesi.':'Scrivilo tu: RADIX non propone cifre.','rp-help');bl.append(E('span','Budget al mese (€)'),bi,tot);
  const ml=E('label',undefined,'rp-field'),ms=E('select');ms.name='sb-months-'+n;MONTH_CHOICES.forEach(m=>{const o=E('option',m+' mesi');o.value=String(m);ms.append(o)});ms.value=String(p.months);ms.onchange=()=>{p.months=+ms.value;bi.oninput()};ml.append(E('span','Durata del piano'),ms);
  const sl=E('label',undefined,'rp-field'),ss=E('select');ss.name='sb-start-'+n;startChoices(today()).forEach(c=>{const o=E('option',c.label);o.value=c.id;ss.append(o)});if(![...ss.options].some(o=>o.value===p.start)){const o=E('option',monthLabel(p.start));o.value=p.start;ss.append(o)}ss.value=p.start;ss.onchange=()=>{p.start=ss.value};sl.append(E('span','Primo mese'),ss);
  g.append(gl,bl,ml,sl);fs.append(g);
  const chs=E('div',undefined,'rp-secs sb-channels');chs.append(E('span','Canali (dal campo «Canali» del brief: aggiungi o togli)','rp-label'));
  CHANNELS.forEach(c=>{const l=E('label',undefined,'ps-chip rp-chip'),x=E('input');x.type='checkbox';x.value=c.id;x.checked=p.channels.includes(c.id);x.onchange=()=>{p.channels=CHANNEL_IDS.filter(id=>id===c.id?x.checked:p.channels.includes(id))};l.append(x,dom().createTextNode(' '+c.label+(c.min?' · da '+eur(c.min):'')));chs.append(l)});
  fs.append(chs);const b2=E('label',undefined,'ps-chip rp-chip'),bc=E('input');bc.type='checkbox';bc.checked=p.b2b;bc.onchange=()=>{p.b2b=bc.checked};b2.append(bc,dom().createTextNode(' Clienti aziende (B2B): più peso a LinkedIn'));fs.append(b2);
  const cr=E('label',undefined,'rp-field'),cs=E('select');cs.name='sb-crm-'+n;const none=E('option','Nessuno: KPI del CRM «da misurare»');none.value='';cs.append(none);st.crmList.forEach(w=>{const o=E('option',w.name);o.value=w.id;cs.append(o)});cs.value=st.crm;cs.disabled=!st.crmList.length;
  cs.onchange=async()=>{st.crm=cs.value;await readData(true)};cr.append(E('span','Workspace CRM per il dato attuale (facoltativo)'),cs,E('small','Lead, contatti dal sito e campagne email vengono dal CRM del cliente.','rp-help'));
  const go=button('Proponi 3 ripartizioni','primary'),bar=E('div',undefined,'ps-actions');bar.append(go,E('span','Nessuna chiamata AI: regole fisse sull’obiettivo e sui canali del brief.','muted'));
  go.onclick=()=>{if(!fin(p.budget)||p.budget<=0){status.textContent='Scrivi il budget al mese: RADIX non lo propone.';bi.focus();return}if(!p.goal){status.textContent='Scegli l’obiettivo principale.';gs.focus();return}if(!p.channels.length){status.textContent='Scegli almeno un canale.';return}
   status.textContent='';renderDirs();scroll(dirs)};
  form.append(bx,fs,cr,bar)}
 // 2. three splits
 function allocBars(a){const ul=E('ul',undefined,'sb-alloc');const max=Math.max(...a.lines.map(l=>l.amount),1);
  a.lines.forEach(l=>{const li=E('li',undefined,'sb-alloc-row');li.dataset.line=l.id;const bar=E('i');bar.style.width=Math.max(2,Math.round(l.amount*100/max))+'%';li.append(E('span',chLabel(l.id),'sb-alloc-name'),E('span',undefined,'sb-alloc-bar'),E('strong',eur(l.amount)),E('small',fmtNum(share(l.amount,st.plan.budget),1)+'%'));li.children[1].append(bar);ul.append(li)});return ul}
 function renderDirs(){const p=st.plan;setStep(p.proposal?3:2);dirs.hidden=false;const all=proposals(p.budget,p.channels,p.goal,{b2b:p.b2b});
  dirs.replaceChildren(...all.map(a=>{const card=E('article',undefined,'ad-dir rp-dir sb-dir');card.dataset.chosen=String(p.proposal===a.id);card.dataset.proposal=a.id;
   const hd=E('div',undefined,'ad-dir-head');hd.append(E('span',a.lines.filter(l=>l.id!=='riserva').length+' canali','ad-angle'),E('h3',a.title),E('p',a.line,'ad-idea'));card.append(hd,allocBars(a));
   if(a.excluded.length){const ex=E('ul',undefined,'sb-excluded');a.excluded.forEach(x=>ex.append(E('li',chLabel(x.id)+': '+x.reason)));card.append(ex)}
   const pick=button(p.proposal===a.id?'Ripartizione scelta':'Scegli questa','primary');pick.onclick=()=>{p.proposal=a.id;p.lines=a.lines.map(l=>({...l}));p.excluded=a.excluded.slice();p.kpis=kpisFor(p.lines,p.base,p.kpis);renderDirs();renderRefine();scroll(refine)};card.append(pick);return card}))}
 // 3. refinement of the amounts
 function renderRefine(){const p=st.plan;setStep(3);refine.hidden=false;const box=E('fieldset',undefined,'rp-refine');box.append(E('legend','Rifinisci il budget · '+proposal(p.proposal).title));
  const table=E('div',undefined,'sb-lines'),sum=E('p','','sb-total');sum.setAttribute('role','status');
  const draw=()=>{const t=totals(p.lines,p.budget);sum.dataset.ok=String(t.ok);sum.textContent=t.ok?'Somma '+eur(t.sum)+': uguale al budget di '+eur(p.budget)+'.':'Somma '+eur(t.sum)+' su '+eur(p.budget)+': '+(t.diff>0?'mancano ':'avanzano ')+eur(Math.abs(t.diff))+'.';fix.hidden=t.ok;
   table.querySelectorAll('[data-line]').forEach(r=>{const l=p.lines.find(x=>x.id===r.dataset.line);if(!l)return;r.dataset.below=String(below(l));r.querySelector('.sb-share').textContent=fmtNum(share(l.amount,p.budget),1)+'%';const w=r.querySelector('.sb-warn');w.textContent=below(l)?'Sotto la soglia RADIX di '+eur(lineInfo(l.id).min)+' al mese':''})};
  const row=l=>{const r=E('div',undefined,'sb-line');r.dataset.line=l.id;const lab=E('label',undefined,'rp-field'),x=E('input');x.type='text';x.inputMode='decimal';x.name='sb-line-'+l.id+'-'+n;x.value=fmtNum(l.amount);x.setAttribute('aria-label',chLabel(l.id)+', euro al mese');
   x.oninput=()=>{const v=parseAmount(x.value);l.amount=v==null?0:round(v,2);draw();changed()};lab.append(E('span',chLabel(l.id)),x);
   const rm=button('Togli','sb-remove');rm.setAttribute('aria-label','Togli '+chLabel(l.id));rm.onclick=()=>{p.lines=p.lines.filter(y=>y!==l);p.kpis=kpisFor(p.lines,p.base,p.kpis);renderRefine()};
   r.append(lab,E('span','','sb-share'),E('small',(lineInfo(l.id)||{}).buys||'','rp-help sb-buys'),rm,E('span','','sb-warn'));return r};
  p.lines.forEach(l=>table.append(row(l)));
  const fix=button('Metti la differenza nella riserva');fix.onclick=()=>{p.lines=fillReserve(p.lines,p.budget);renderRefine();changed()};
  const addSel=E('select');addSel.name='sb-add-'+n;addSel.setAttribute('aria-label','Aggiungi un canale');const a0=E('option','+ Aggiungi un canale');a0.value='';addSel.append(a0);CHANNELS.filter(c=>!p.lines.some(l=>l.id===c.id)).forEach(c=>{const o=E('option',c.label);o.value=c.id;addSel.append(o)});
  addSel.onchange=()=>{if(!addSel.value)return;const id=addSel.value;p.lines.splice(p.lines.findIndex(l=>l.id==='riserva')<0?p.lines.length:p.lines.findIndex(l=>l.id==='riserva'),0,{id,amount:0,weight:weightOf(p.goal,id,p.b2b),min:channel(id).min});p.kpis=kpisFor(p.lines,p.base,p.kpis);renderRefine()};
  const acts=E('div',undefined,'ps-actions');acts.append(fix,addSel);
  const nl=E('label',undefined,'rp-field rp-wide'),na=E('textarea');na.rows=2;na.maxLength=600;na.name='sb-note-'+n;na.placeholder='Es. Il budget di dicembre si concentra sulle torte delle feste.';na.value=p.note;na.oninput=()=>{p.note=na.value;changed()};nl.append(E('span','Nota per il cliente (facoltativa)'),na);
  const next=button('Passa ai KPI','primary'),nb=E('div',undefined,'ps-actions');nb.append(next,E('span','Il dato attuale viene solo dai dati del progetto: quello che manca è «'+TBD+'».','muted'));
  next.onclick=()=>{p.kpis=kpisFor(p.lines,p.base,p.kpis);renderKpi();scroll(kpiBox)};
  box.append(table,sum,acts,nl);refine.replaceChildren(box,nb);draw()}
 // 4. KPI
 function renderKpi(){const p=st.plan;setStep(4);kpiBox.hidden=false;const per=periodOfPlan(p);
  const hd=E('div',undefined,'rp-found-head');hd.append(E('h3','KPI e obiettivi'+(per?' al '+per.untilLabel:'')),E('p','Dato attuale: '+(p.base?p.base.label:NA)+', dai dati del progetto. Ogni KPI ha la fonte da cui si misura; gli obiettivi li scrivi tu o li calcolo dal dato attuale con la crescita che scegli.','ad-idea'));
  const gr=E('div',undefined,'ps-actions sb-growth'),gl=E('label',undefined,'rp-field'),gi=E('input');gi.type='text';gi.inputMode='decimal';gi.name='sb-growth-'+n;gi.placeholder='Es. 10';gi.value=fin(p.growth)?fmtNum(p.growth,1):'';gi.oninput=()=>{const v=parseAmount(gi.value);p.growth=v!=null&&v<=500?v:null;gb.disabled=!fin(p.growth)};
  gl.append(E('span','Crescita sul dato attuale (%)'),gi);const gb=button('Calcola gli obiettivi dal dato attuale');gb.disabled=!fin(p.growth);
  gb.onclick=()=>{p.kpis=deriveTargets(p.kpis,p.growth,{overwrite:true});renderKpi();changed()};gr.append(gl,gb,E('span','Solo per i KPI con un dato attuale; gli altri restano «'+TBD+'».','muted'));
  const groups=E('div',undefined,'rp-sources sb-kpis');
  for(const ch of [...new Set(p.kpis.map(k=>k.channel))]){const sec=E('section',undefined,'rp-source sb-kpi-ch');const ks=p.kpis.filter(k=>k.channel===ch);sec.dataset.available=String(ks.some(k=>k.baseline));sec.dataset.channel=ch;
   const top=E('div',undefined,'rp-source-top');const line=p.lines.find(l=>l.id===ch);top.append(E('span',line?eur(line.amount)+' al mese':'Tutti i canali','rp-badge'),E('h4',chLabel(ch)));sec.append(top);
   ks.forEach(k=>{const r=E('div',undefined,'sb-kpi-row');r.dataset.kpi=k.key;r.dataset.status=kpiStatus(k);
    const lt=E('div',undefined,'sb-kpi-text');lt.append(E('strong',k.label),E('small','Fonte: '+k.source,'rp-help'));
    const bv=E('div',undefined,'sb-kpi-base');bv.append(E('span','Dato attuale','rp-tile-label'),E('b',k.baseline?fmtVal(k.baseline.value,k.unit,k.d):TBD,k.baseline?'':'sb-tbd'));if(k.baseline)bv.append(E('small',k.baseline.from,'rp-help'));
    const tl=E('label',undefined,'rp-field sb-kpi-target'),ti=E('input');ti.type='text';ti.inputMode='decimal';ti.name='sb-target-'+k.key.replace(':','-')+'-'+n;ti.value=fin(k.target)?fmtNum(k.target,k.d):'';ti.placeholder=k.baseline?'Obiettivo':'Da fissare';ti.setAttribute('aria-label','Obiettivo: '+chLabel(ch)+', '+k.label);
    const tag=E('small',fin(k.target)?(k.targetBy==='persona'?'Scritto da te':k.targetBy):k.baseline?'':STATUS_LABEL['da-misurare'],'rp-help sb-kpi-by');
    ti.oninput=()=>{const v=parseAmount(ti.value);k.target=v;k.targetBy=v!=null?'persona':'';tag.textContent=v!=null?'Scritto da te':k.baseline?'':STATUS_LABEL['da-misurare'];r.dataset.status=kpiStatus(k);changed()};
    tl.append(E('span','Obiettivo'+(k.unit==='%'?' (%)':k.unit==='€'?' (€)':k.unit==='/100'?' (su 100)':'')),ti,tag);r.append(lt,bv,tl);sec.append(r)});groups.append(sec)}
  const pr=priorities(p.base,p.lines),prBox=E('div',undefined,'sb-prior');if(pr.length){prBox.append(E('h4','Priorità dall’audit'));const ol=E('ol');pr.forEach(x=>ol.append(E('li',x.text)));prBox.append(ol)}
  const notes=p.base&&p.base.notes.length?E('p','Dati che RADIX non ha: '+p.base.notes.join(' · '),'rp-note'):null;
  const next=button('Controlla ed esporta','primary'),nb=E('div',undefined,'ps-actions');nb.append(next,E('span','Nessuna chiamata AI: PDF, PowerPoint e CSV si creano qui.','muted'));next.onclick=()=>{renderResult();scroll(result)};
  kpiBox.replaceChildren(...[hd,gr,groups,pr.length?prBox:null,notes,nb].filter(Boolean))}
 // 5. export
 let timer=0;const changed=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!result.hidden)renderResult(true)},400)};
 function checkRow(c){const row=E('div',undefined,'rp-check');row.dataset.state=c.state;row.dataset.check=c.id;row.append(E('span',{ok:'OK',warn:'Da guardare',fail:'Da sistemare'}[c.state],'rp-check-badge'),E('strong',c.label),E('p',c.detail,'rp-check-detail'));
  if(c.issues.length){const ul=E('ul');c.issues.slice(0,8).forEach(i=>ul.append(E('li',i)));row.append(ul)}return row}
 function renderResult(quiet){const p=st.plan;if(!quiet)setStep(5);result.hidden=false;const cs=checksOf(p),doc=layoutBrief(p,brand,{date:today()}),sd=slidesDoc(p,brand);
  const checks=E('div',undefined,'rp-checks');checks.append(E('h4','Controlli prima dell’export'),...cs.map(checkRow));
  const pages=E('div',undefined,'rp-pages');doc.pages.forEach((pg,i)=>{const f=E('figure',undefined,'rp-fig rp-page');f.append(svgImg(P.previewSvg(doc,i,{guides:false}),'Brief · pagina '+(i+1)),E('figcaption','Pagina '+(i+1)+' di '+doc.pages.length));pages.append(f)});
  const slides=E('div',undefined,'rp-pages sb-slides');sd.pages.forEach((pg,i)=>{const f=E('figure',undefined,'rp-fig sb-slide');f.append(svgImg(P.previewSvg(sd,i,{guides:false}),pg.label),E('figcaption',pg.label));slides.append(f)});
  const pdfB=button('Scarica il PDF','primary'),pptB=button('Scarica il PowerPoint'),csvB=button('Scarica il CSV del budget'),saveB=button('Salva nel progetto'),acts=E('div',undefined,'ps-actions rp-actions'),rs=E('p','','tool-status');rs.setAttribute('role','status');
  acts.append(pdfB,pptB,csvB,saveB,E('span','Nessuna chiamata AI, nessun costo.','muted'));
  const guard=async()=>{const c=checksOf(p);if(blocking(c).length){rs.textContent='Prima sistema: '+blocking(c).map(x=>x.label.toLowerCase()).join(', ')+'.';return false}
   const warns=c.filter(x=>x.state==='warn'&&x.id!=='base');if(warns.length&&!await askConfirm({title:'Esportare lo stesso?',message:warns.map(x=>x.label+': '+x.detail).join('\n'),ok:'Esporta lo stesso',cancel:'Torna ai controlli'}))return false;return true};
  const base=fileBase(p,brand);
  pdfB.onclick=async()=>{if(st.busy||!await guard())return;st.busy=true;rs.textContent='Creo il PDF…';try{const d=layoutBrief(p,brand,{date:today()});if(P.rasterize)await P.rasterize(d);P.download(base+'.pdf',briefPdf(p,brand,{doc:d,date:today()}),'application/pdf');rs.textContent='PDF scaricato: '+d.pages.length+' pagine.'}catch(e){rs.textContent='PDF non creato: '+e.message}finally{st.busy=false}};
  pptB.onclick=async()=>{if(st.busy||!await guard())return;st.busy=true;rs.textContent='Creo il PowerPoint…';try{const deck=deckOf(p,brand),media=await deckMedia(deck,brand);P.download(base+'.pptx',pptxBytes(p,brand,media,{date:today()}),'application/vnd.openxmlformats-officedocument.presentationml.presentation');rs.textContent='PowerPoint scaricato: '+deck.slides.length+' slide con testi modificabili e note del relatore.'}catch(e){rs.textContent='PowerPoint non creato: '+e.message}finally{st.busy=false}};
  csvB.onclick=async()=>{if(!await guard())return;P.download(base+'-budget.csv',budgetCsv(p),'text/csv;charset=utf-8');rs.textContent='CSV del budget scaricato: si apre in Excel o Fogli Google.'};
  saveB.onclick=async()=>{if(!ctx.workspace||!ctx.projectId){rs.textContent='Apri un progetto per salvare.';return}saveB.disabled=true;
   try{await saveToProject(ctx.workspace,ctx.projectId,savedRecord(p,{by:ctx.by}));rs.replaceChildren(dom().createTextNode('Budget e KPI salvati nel progetto con la strategia v'+p.strategy.revision+'. '));if(ctx.agentsUrl){const a=E('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;rs.append(a)}loadSaved()}
   catch(e){rs.textContent='Salvataggio non riuscito: '+e.message}finally{saveB.disabled=false}};
  const g1=E('section',undefined,'rp-gallery');g1.append(E('h4','Anteprima del PDF'),pages);const g2=E('section',undefined,'rp-gallery');g2.append(E('h4','Anteprima delle slide'),slides);
  result.replaceChildren(checks,acts,rs,g1,g2)}
 function renderSaved(){if(!st.saved.length){saved.hidden=true;return}saved.replaceChildren(E('h4','Budget e KPI salvati nel progetto'));const row=E('div',undefined,'ad-saved-row');
  st.saved.slice(-4).reverse().forEach(r=>{const old=outdated(r,st.strategy),b=button(eur(r.budget)+' al mese · '+proposal(r.proposal).title+' · '+String(r.at||'').slice(0,10)+(old?' · strategia v'+r.revision+' (cambiata)':''),'ad-saved-item');
   b.onclick=()=>{st.plan={...JSON.parse(JSON.stringify(r.plan)),base:st.plan&&st.plan.base||r.plan.base};if(st.strategy&&st.strategy.ok)st.plan.strategy={brief:{...st.strategy.brief},revision:st.strategy.revision,approvedAt:st.strategy.approvedAt};st.plan.kpis=kpisFor(st.plan.lines,st.plan.base,st.plan.kpis);
    renderForm();renderDirs();renderRefine();renderKpi();renderResult();status.textContent='Riaperti budget e KPI salvati il '+String(r.at||'').slice(0,10)+(old?': la strategia è cambiata da allora (v'+r.revision+' → v'+st.strategy.revision+'), ricontrolla.':'.')};row.append(b)});
  saved.append(row);saved.hidden=false}
 async function loadSaved(){if(!ctx.workspace||!ctx.projectId)return;try{st.saved=readStore(await ctx.workspace.bind(ctx.projectId,'agents').load()).items;renderSaved()}catch(e){}}
 async function readData(keep){if(st.busy)return;st.busy=true;status.textContent='Leggo strategia, piano editoriale, risultati, CRM e audit del progetto…';
  try{const src=ctx.workspace&&ctx.projectId?await readProject(ctx.workspace,ctx.projectId):{};const w=st.crmList.find(x=>x.id===st.crm),crm=w?await R.readCrm({id:w.id,name:w.name},ctx.fetch):null;
   st.src=src;st.strategy=strategyOf(src.editorial);const base=baselines({...src,crm,today:today(),projectName:ctx.projectName});
   if(keep&&st.plan){st.plan.base=base;st.plan.kpis=kpisFor(st.plan.lines,base,st.plan.kpis)}else st.plan=st.strategy.ok?newPlan({strategy:st.strategy,projectName:ctx.projectName,today:today(),base}):null;
   renderHead();renderForm();renderSaved();if(keep&&st.plan&&!kpiBox.hidden)renderKpi();
   status.textContent=st.strategy.ok?'Strategia v'+st.strategy.revision+' letta. Dato attuale: '+base.label+'.':''}
  catch(e){status.textContent='Dati non letti: '+e.message}finally{st.busy=false}}
 if(ctx.workspace&&ctx.workspace.siteForm&&typeof ctx.workspace.siteForm.workspaces==='function')ctx.workspace.siteForm.workspaces().then(list=>{st.crmList=(list||[]).filter(w=>w&&w.id);if(st.plan)renderForm()}).catch(()=>{});
 renderHead();readData().then(loadSaved);
 return wrap}

return Object.freeze({AGENT,TBD,NA,GOALS,CHANNELS,CHANNEL_IDS,RESERVE,WEIGHTS,PROPOSALS,KPI_DEFS,FIELDS,MONTH_CHOICES,STATUS_LABEL,
 fmtNum,eur,fmtVal,parseAmount,shiftMonth,monthLabel,periodOf,startChoices,detectGoal,isB2b,parseChannels,channelOf,weightOf,split,allocate,proposals,totals,share,below,fillReserve,
 baselines,kpisFor,status,deriveTarget,deriveTargets,priorities,strategyOf,newPlan,allowedNumbers,marketFigures,checksOf,blocking,brandFor,
 layoutBrief,fitProblems,briefPdf,deckModel,deckOf,slidesDoc,pptxBytes,budgetCsv,fileBase,readStore,savedRecord,addRecord,saveToProject,outdated,readProject,strategyBudgetStudio});
});
