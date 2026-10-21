'use strict';
/* CRM «Report» (#report): builder (oggetto, filtri, periodo, raggruppa per, misura, grafico), result as an
   inline SVG chart plus a table with totals, click on a bar → the records of that group (Apri uses
   Customer360 or the record editor of sales.js), «Esporta CSV» (crm-csv-core.js), six ready-made reports and
   the workspace's saved ones. Pure logic in crm-report-core.js. Rows come from the list API, 100 per page,
   up to 5000 per entity (then a note says so); they are read once per workspace and «Aggiorna dati» rereads.
   Saved reports are rows of sales_segments with filters = {report:<definition>} (no new table). */
(()=>{
const R=window.RadixCrmReport;const content=document.getElementById('content'),nav=document.getElementById('navigation');if(!R||!content||!nav)return;
const app=()=>window.RadixSalesApp;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const NS='http://www.w3.org/2000/svg',S=(tag,a,text)=>{const n=document.createElementNS(NS,tag);for(const k in a)n.setAttribute(k,String(a[k]));if(text!=null)n.textContent=String(text);return n};
const int=n=>Number(n||0).toLocaleString('it-IT');
const eur=c=>c==null?'—':'€ '+(Number(c)/100).toLocaleString('it-IT',{maximumFractionDigits:0});
const eurShort=c=>{const v=Number(c||0)/100;return '€ '+(v>=1e6?(v/1e6).toLocaleString('it-IT',{maximumFractionDigits:1})+'M':v>=1e4?Math.round(v/1e3).toLocaleString('it-IT')+'K':v.toLocaleString('it-IT',{maximumFractionDigits:0}))};
const cut=(s,n)=>{s=String(s);return s.length>n?s.slice(0,n-1)+'…':s};
const PAGE=100,CHART_MAX=30,DRILL_MAX=200;
const OPENS=['companies','contacts','opportunities'],SECTION={tasks:'#tasks',tickets:'#tickets',leads:'#leads'};

const st={def:{...R.PRESETS[0].def},active:'preset:'+R.PRESETS[0].id,name:R.PRESETS[0].name,drill:null,saved:null,savedError:'',msg:'',loading:false};
const cache=new Map();let cacheWs=null;
const ws=()=>app()?.state?.workspace||null;
async function readAll(entity){const out=[];let capped=false;
 for(let offset=0;;offset+=PAGE){const d=await app().api(entity,{offset});const rows=d.rows||[];out.push(...rows);if(rows.length<PAGE)break;if(out.length>=R.MAX_ROWS){capped=true;break}}
 return {rows:out.slice(0,R.MAX_ROWS),capped:capped||out.length>R.MAX_ROWS}}
function entityRows(entity){const w=ws();if(w!==cacheWs){cache.clear();cacheWs=w;st.saved=null}
 if(!cache.has(entity))cache.set(entity,readAll(entity).catch(e=>{cache.delete(entity);throw e}));return cache.get(entity)}
async function dataFor(def){const [main,...look]=await Promise.all([entityRows(def.entity),...R.needs(def.entity).map(entityRows)]);
 const d={rows:main.rows,capped:main.capped};R.needs(def.entity).forEach((k,i)=>{d[k]=look[i].rows});if(def.entity==='companies')d.companies=main.rows;return d}
async function loadSaved(){if(st.saved)return;try{const out=[];for(let offset=0;offset<1000;offset+=PAGE){const d=await app().api('segments',{offset});const rows=d.rows||[];out.push(...rows);if(rows.length<PAGE)break}st.saved=out.filter(R.isReport);st.savedError=''}catch(e){st.saved=[];st.savedError='Report salvati non disponibili: '+e.message}}
const post=(entity,action,data)=>app().api(entity,{body:{workspace:ws(),entity,action,data}});

function ensure(){if(!nav.querySelector('a[href="#report"]')){const a=E('a','Report');a.href='#report';const c=nav.querySelector('a[href="#analytics"]')||nav.querySelector('a[href="#calendar"]');c?c.after(a):nav.append(a)}
 if((location.hash||'')!=='#report'){document.getElementById('report')?.remove();return null}
 let s=document.getElementById('report');if(!s||s.parentNode!==content){s=E('section',undefined,'panel rp-section');s.id='report';const r=E('div',undefined,'row');r.append(E('h2','Report'));s.append(r);content.append(s)}
 content.querySelectorAll(':scope>section.rx-view').forEach(x=>{if(x!==s)x.classList.remove('rx-view')});s.classList.add('rx-view');document.documentElement.classList.add('rx-has-view');return s}

/* ---------- builder ---------- */
function setDef(next,keepActive){const v=R.validate(next);if(!v.ok){st.msg=v.error;draw();return}st.def=v.def;st.drill=null;st.msg='';if(!keepActive){st.active='';st.name='Report personalizzato'}draw()}
const field=(label,control,cls)=>{const l=E('label',undefined,'rp-field'+(cls?' '+cls:''));l.append(E('span',label),control);return l};
function select(name,options,value,onChange){const s=E('select');s.name=name;for(const [v,l] of options){const o=E('option',l);o.value=v;s.append(o)}s.value=value;s.addEventListener('change',()=>onChange(s.value));return s}
function builder(d,values){const def=st.def,e=R.ENTITIES[def.entity],box=E('section',undefined,'rp-builder');box.setAttribute('aria-label','Costruisci il report');
 const row=E('div',undefined,'rp-row');
 row.append(field('Oggetto',select('entity',Object.entries(R.ENTITIES).map(([k,x])=>[k,x.label]),def.entity,v=>{const opts=R.groupOptions(v);setDef({v:1,entity:v,filters:{},date:null,group:opts[0][0],measure:'count',chart:def.chart})})));
 row.append(field('Raggruppa per',select('group',R.groupOptions(def.entity),def.group,v=>setDef({...def,group:v,sort:v.startsWith('month:')?'label':def.sort}))));
 row.append(field('Misura',select('measure',Object.entries(R.MEASURES).filter(([k])=>k==='count'||e.amount),def.measure,v=>setDef({...def,measure:v}))));
 row.append(field('Grafico',select('chart',Object.entries(R.CHARTS),def.chart,v=>setDef({...def,chart:v},true))));
 row.append(field('Ordina',select('sort',Object.entries(R.SORTS),def.sort,v=>setDef({...def,sort:v},true))));
 box.append(row);
 /* filters: the segment filters that apply, then «is one of» on a field */
 const fr=E('div',undefined,'rp-row rp-filters');
 for(const k of e.segment){const t=R.SEGMENT[k];
  if(t==='text'){const i=E('input');i.type='text';i.name='f-'+k;i.maxLength=80;i.value=def.filters[k]||'';i.placeholder='qualsiasi';i.addEventListener('change',()=>{const f={...def.filters};const v=i.value.trim();if(v)f[k]=v;else delete f[k];setDef({...def,filters:f})});fr.append(field(R.SEGMENT_LABELS[k],i))}
  else fr.append(field(R.SEGMENT_LABELS[k],select('f-'+k,[['','Tutti'],['yes','Sì'],['no','No']],def.filters[k]||'',v=>{const f={...def.filters};if(v)f[k]=v;else delete f[k];setDef({...def,filters:f})})))}
 /* date */
 const dt=def.date||{};const dfield=select('date-field',[['','Nessun periodo'],...Object.entries(e.dates)],dt.field||'',v=>setDef({...def,date:v?{field:v,last:dt.last||(dt.from||dt.to?undefined:90),...(dt.last?{}:{from:dt.from,to:dt.to})}:null}));
 fr.append(field('Periodo su',dfield));
 if(def.date){const last=E('input');last.type='number';last.min='1';last.max='3650';last.name='last';last.value=dt.last||'';last.placeholder='—';
  last.addEventListener('change',()=>{const n=Number(last.value);setDef({...def,date:last.value===''?{field:dt.field,from:dt.from||R.dateWindow({field:dt.field,last:90},Date.now()).from}:{field:dt.field,last:Number.isInteger(n)?n:0}})});
  const day=(k,l)=>{const i=E('input');i.type='date';i.name=k;i.value=dt[k]||'';i.addEventListener('change',()=>{const n={field:dt.field,from:dt.from,to:dt.to,[k]:i.value||undefined};if(!n.from&&!n.to){setDef({...def,date:{field:dt.field,last:90}});return}setDef({...def,date:n})});return field(l,i,'rp-day')};
  fr.append(field('Ultimi giorni',last,'rp-last'),day('from','Dal'),day('to','Al'))}
 box.append(fr);
 /* field filters as chips, plus «Aggiungi filtro» with the values found in the data */
 const chips=E('div',undefined,'rp-chips');
 for(const [k,v] of Object.entries(def.filters)){if(e.segment.includes(k))continue;const s=e.groups[k];
  for(const x of Array.isArray(v)?v:[v]){const c=E('span',undefined,'rp-chip');c.append(E('span',s.label+': '+(x===''?R.EMPTY:(s.options?.[x]||values?.[k]?.get(x)||x))));
   c.append(B('×',()=>{const f={...def.filters},list=(Array.isArray(v)?v:[v]).filter(y=>y!==x);if(list.length)f[k]=list.length===1?list[0]:list;else delete f[k];setDef({...def,filters:f})},'rp-x'));c.lastChild.setAttribute('aria-label','Togli il filtro '+s.label);chips.append(c)}}
 const fk=select('add-field',[['','Filtra per campo…'],...Object.entries(e.groups).map(([k,s])=>[k,s.label])],'',()=>fillValues());
 const fv=E('select');fv.name='add-value';fv.setAttribute('aria-label','Valore del filtro');
 const fillValues=()=>{fv.replaceChildren();const m=values?.[fk.value];if(!fk.value||!m){fv.disabled=true;return}fv.disabled=false;for(const [key,label] of m){const o=E('option',label);o.value=key;fv.append(o)}};fillValues();
 const add=B('Aggiungi filtro',()=>{if(!fk.value||fv.disabled)return;const f={...def.filters},cur=f[fk.value]===undefined?[]:Array.isArray(f[fk.value])?f[fk.value]:[f[fk.value]];if(!cur.includes(fv.value))cur.push(fv.value);f[fk.value]=cur.length===1?cur[0]:cur;setDef({...def,filters:f})},'rp-ghost');
 const addRow=E('div',undefined,'rp-add');fk.setAttribute('aria-label','Campo del filtro');addRow.append(fk,fv,add);chips.append(addRow);box.append(chips);
 return box}

/* ---------- charts (inline SVG, colours from --crm-chart-* via crm-report.css) ---------- */
function clickable(node,g,label){node.setAttribute('tabindex','0');node.setAttribute('role','button');node.setAttribute('aria-label',label);node.classList.add('rp-hit');if(st.drill===g.key)node.classList.add('on');
 const go=()=>{st.drill=st.drill===g.key?null:g.key;draw('.rp-drill')};node.addEventListener('click',go);node.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();go()}})}
function chart(res,fmt,fmtShort){const groups=res.groups.slice(0,CHART_MAX),max=Math.max(0,...groups.map(g=>g.value||0)),fig=E('figure',undefined,'rp-fig');
 const mLabel=R.MEASURES[res.measure]+(res.measure==='count'?'':' (€)');
 if(!max){fig.append(E('p','Nessun valore da mostrare con questi filtri.','rp-nodata'));return fig}
 const desc=R.MEASURES[res.measure]+' per '+res.spec.label.toLowerCase();
 if(res.def.chart==='bar'){const W=720,L=170,Rr=90,T=26,rowH=28,H=T+groups.length*rowH+34,w=W-L-Rr;
  const svg=S('svg',{viewBox:`0 0 ${W} ${H}`,class:'rp-svg',role:'img','aria-label':desc});
  svg.append(S('text',{x:L-10,y:14,'text-anchor':'end',class:'rp-at'},res.spec.label));
  for(const f of [0,.5,1]){const x=L+w*f;svg.append(S('line',{x1:x,x2:x,y1:T-4,y2:T+groups.length*rowH,class:'rp-grid'}));svg.append(S('text',{x,y:T+groups.length*rowH+14,'text-anchor':f===0?'start':f===1?'end':'middle',class:'rp-tick'},fmtShort(max*f)))}
  svg.append(S('text',{x:L+w/2,y:H-4,'text-anchor':'middle',class:'rp-at'},mLabel));
  groups.forEach((g,i)=>{const y=T+i*rowH,bw=Math.max(g.value?2:0,w*(g.value||0)/max);const grp=S('g',{class:'rp-bar'+(g.key===''?' empty':'')});
   const t=S('title',{},g.label+': '+fmt(g.value)+' · '+int(g.count)+' record');grp.append(t);
   grp.append(S('rect',{x:0,y,width:W,height:rowH,class:'rp-band'}));
   grp.append(S('text',{x:L-10,y:y+rowH/2+4,'text-anchor':'end',class:'rp-lab'},cut(g.label,24)));
   grp.append(S('rect',{x:L,y:y+6,width:bw,height:rowH-12,rx:3,class:'rp-fill'}));
   grp.append(S('text',{x:L+bw+6,y:y+rowH/2+4,class:'rp-val'},fmtShort(g.value)));
   clickable(grp,g,g.label+': '+fmt(g.value)+'. Mostra i record');svg.append(grp)});
  fig.append(svg)}
 else{const W=720,L=56,Rr=10,T=24,B=groups.length>8?78:42,ph=220,H=T+ph+B+18,w=W-L-Rr,col=w/groups.length,bw=Math.min(56,col*.7);
  const svg=S('svg',{viewBox:`0 0 ${W} ${H}`,class:'rp-svg',role:'img','aria-label':desc});
  for(const f of [0,.5,1]){const y=T+ph*(1-f);svg.append(S('line',{x1:L,x2:W-Rr,y1:y,y2:y,class:'rp-grid'}));svg.append(S('text',{x:L-6,y:y+4,'text-anchor':'end',class:'rp-tick'},fmtShort(max*f)))}
  svg.append(S('text',{x:L,y:12,class:'rp-at'},mLabel));svg.append(S('text',{x:L+w/2,y:H-4,'text-anchor':'middle',class:'rp-at'},res.spec.label));
  groups.forEach((g,i)=>{const cx=L+col*i+col/2,bh=Math.max(g.value?2:0,ph*(g.value||0)/max),grp=S('g',{class:'rp-bar'+(g.key===''?' empty':'')});
   grp.append(S('title',{},g.label+': '+fmt(g.value)+' · '+int(g.count)+' record'));
   grp.append(S('rect',{x:L+col*i,y:T,width:col,height:ph,class:'rp-band'}));
   grp.append(S('rect',{x:cx-bw/2,y:T+ph-bh,width:bw,height:bh,rx:3,class:'rp-fill'}));
   if(g.value&&(groups.length<=16))grp.append(S('text',{x:cx,y:T+ph-bh-5,'text-anchor':'middle',class:'rp-val'},fmtShort(g.value)));
   const lab=S('text',{x:cx,y:T+ph+16,'text-anchor':groups.length>8?'end':'middle',class:'rp-lab',...(groups.length>8?{transform:`rotate(-40 ${cx} ${T+ph+16})`}:{})},cut(g.label,groups.length>8?14:18));grp.append(lab);
   clickable(grp,g,g.label+': '+fmt(g.value)+'. Mostra i record');svg.append(grp)});
  fig.append(svg)}
 if(res.groups.length>CHART_MAX)fig.append(E('p','Il grafico mostra i primi '+CHART_MAX+' gruppi su '+res.groups.length+'; la tabella li mostra tutti.','rp-note'));
 fig.append(E('p','Clicca una barra per vedere i record del gruppo.','rp-note'));
 return fig}
function table(res,fmt){const money=res.measure!=='count',wrap=E('div',undefined,'rp-scroll'),t=E('table',undefined,'rp-table'),hr=E('tr');
 [res.spec.label,'Record',...(money?[R.MEASURES[res.measure]]:[]),...(res.measure==='avg'?[]:['% del totale'])].forEach((x,i)=>{const th=E('th',x);if(i)th.className='num';hr.append(th)});
 const th=E('thead');th.append(hr);t.append(th);const tb=E('tbody');
 for(const g of res.groups){const tr=E('tr');if(st.drill===g.key)tr.className='on';const td=E('td');td.append(B(g.label,()=>{st.drill=st.drill===g.key?null:g.key;draw('.rp-drill')},'rp-link'));tr.append(td,E('td',int(g.count),'num'));if(money)tr.append(E('td',fmt(g.value),'num'));if(res.measure!=='avg')tr.append(E('td',g.share==null?'—':g.share.toLocaleString('it-IT')+'%','num'));tb.append(tr)}
 t.append(tb);const tf=E('tfoot'),fr=E('tr');fr.append(E('th','Totale'),E('th',int(res.total.count),'num'));if(money)fr.append(E('th',fmt(res.total.value),'num'));if(res.measure!=='avg')fr.append(E('th',res.groups.length?'100%':'—','num'));tf.append(fr);t.append(tf);wrap.append(t);return wrap}

/* ---------- drill-down ---------- */
function drill(res){const box=E('section',undefined,'rp-drill');box.tabIndex=-1;if(st.drill===null)return box;
 const g=res.groups.find(x=>x.key===st.drill);if(!g){st.drill=null;return box}
 const e=R.ENTITIES[res.def.entity],rows=R.recordsOf(res,g.key),dateKey=res.def.date?.field||'created_at';
 const h=E('div',undefined,'rp-drill-h');h.append(E('h4',int(rows.length)+' '+(rows.length===1?'record':'record')+' in «'+g.label+'»'),B('Chiudi',()=>{st.drill=null;draw()},'rp-ghost'));box.append(h);
 const t=E('table',undefined,'rp-table'),hr=E('tr');[e.title==='name'?'Nome':'Titolo',e.dates[dateKey]||'Data',...(e.amount?['Importo']:[]),''].forEach((x,i)=>{const th=E('th',x);if(e.amount&&i===2)th.className='num';hr.append(th)});
 const thd=E('thead');thd.append(hr);t.append(thd);const tb=E('tbody');const a=app(),canEdit=a?.writable?.(res.def.entity);
 for(const r of rows.slice(0,DRILL_MAX)){const tr=E('tr');tr.append(E('td',r[e.title]||'—'));const d=r[dateKey];tr.append(E('td',d?new Date(String(d).length===10?d+'T12:00:00Z':d).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}):'—'));if(e.amount)tr.append(E('td',eur(r.amount_cents),'num'));
  const act=E('td',undefined,'rp-act');
  if(OPENS.includes(res.def.entity))act.append(B('Apri',()=>{if(a.state.busy)return;a.openCustomer(res.def.entity,r).then(()=>document.getElementById('customer360')?.scrollIntoView({block:'start'}))},'rp-mini'));
  else if(canEdit)act.append(B('Apri',()=>a.edit(res.def.entity,r),'rp-mini'));
  else{const l=E('a','Vai all’elenco','rp-mini');l.href=SECTION[res.def.entity]||'#dashboard';act.append(l)}
  tr.append(act);tb.append(tr)}
 t.append(tb);const wrap=E('div',undefined,'rp-scroll');wrap.append(t);box.append(wrap);
 if(rows.length>DRILL_MAX)box.append(E('p','Mostrati i primi '+DRILL_MAX+' record su '+int(rows.length)+': restringi i filtri per vederli tutti.','rp-note'));
 return box}

/* ---------- saved and ready-made reports ---------- */
function library(){const box=E('aside',undefined,'rp-lib');box.setAttribute('aria-label','Report pronti e salvati');
 box.append(E('h3','Report pronti'));const ul=E('ul');
 for(const p of R.PRESETS){const li=E('li');const b=B(p.name,()=>{st.def=R.validate(p.def).def;st.active='preset:'+p.id;st.name=p.name;st.drill=null;st.msg='';draw()},'rp-item');if(st.active==='preset:'+p.id)b.setAttribute('aria-current','true');li.append(b);ul.append(li)}
 box.append(ul,E('h3','Salvati nel workspace'));
 if(st.saved===null)box.append(E('p','Caricamento…','rp-note'));
 else{if(st.savedError)box.append(E('p',st.savedError,'rp-note'));if(!st.saved.length&&!st.savedError)box.append(E('p','Nessun report salvato. Costruiscine uno e premi «Salva report»: lo vede tutto il workspace.','rp-note'));
  const sl=E('ul');for(const r of st.saved){const li=E('li');const b=B(r.name,()=>{const v=R.validate(r.filters.report);if(!v.ok){st.msg='Report «'+r.name+'» non leggibile: '+v.error;draw();return}st.def=v.def;st.active='saved:'+r.id;st.name=r.name;st.drill=null;st.msg='';draw()},'rp-item');if(st.active==='saved:'+r.id)b.setAttribute('aria-current','true');li.append(b);sl.append(li)}box.append(sl)}
 return box}
async function save(update){const a=app();const v=R.validate(st.def);if(!v.ok){st.msg=v.error;draw();return}
 try{if(update){const r=st.saved.find(x=>'saved:'+x.id===st.active);if(!r)return;await post('segments','update',{id:r.id,version:r.version,filters:{report:v.def}});a.notice('Report «'+r.name+'» aggiornato.');st.saved=null;await loadSaved();draw();return}
  const name=(window.prompt('Nome del report (visibile a tutto il workspace):',st.active?'':st.name==='Report personalizzato'?'':st.name)||'').trim();if(!name)return;if(name.length>200){a.error('Nome troppo lungo: massimo 200 caratteri.');return}
  const res=await post('segments','create',{name,filters:{report:v.def}});st.saved=null;await loadSaved();const row=res?.rows?.[0];st.active=row?.id?'saved:'+row.id:'';st.name=name;a.notice('Report «'+name+'» salvato.');draw()}
 catch(e){a.error((e.status===409?'Esiste già un report o un segmento con questo nome. ':'')+e.message)}}
async function removeSaved(){const a=app(),r=st.saved?.find(x=>'saved:'+x.id===st.active);if(!r)return;if(!window.confirm('Eliminare il report «'+r.name+'»? I dati del CRM non vengono toccati.'))return;
 try{await post('segments','delete',{id:r.id,version:r.version});a.notice('Report eliminato.');st.saved=null;st.active='';st.name='Report personalizzato';await loadSaved();draw()}catch(e){a.error(e.message)}}
function exportCsv(res){const C=window.RadixCrmCsv;if(!C)return;const t=R.csvTable(res),slug=String(st.name||'report').toLocaleLowerCase('it').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'report';
 const a=E('a');a.href=URL.createObjectURL(new Blob([C.toCsv(t.rows,t.columns)],{type:'text/csv;charset=utf-8'}));a.download='report-'+slug+'-'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}

/* ---------- page ---------- */
// The values each field filter can take, from the loaded rows: Map key → label, «(vuoto)» last.
function valuesOf(def,d){const e=R.ENTITIES[def.entity],out={};
 for(const k of Object.keys(e.groups)){try{const res=R.run({...def,filters:{},date:null,group:k,measure:'count',sort:'label'},d,Date.now());out[k]=new Map(res.groups.map(g=>[g.key,g.label]));if(e.groups[k].options)for(const [o,l] of Object.entries(e.groups[k].options))if(!out[k].has(o))out[k].set(o,l)}catch{out[k]=new Map()}}
 return out}
let seq=0,busy=false;
async function draw(focus){const s=ensure();if(!s)return;const my=++seq;busy=true;
 const old=s.querySelector(':scope>.rp');const wrap=E('div',undefined,'rp');
 const intro=E('p','Scegli un report pronto o costruiscine uno: oggetto, filtri, raggruppamento e misura. I numeri sono calcolati nel browser dai record del CRM.','rp-intro');
 const grid=E('div',undefined,'rp-grid'),main=E('div',undefined,'rp-main');grid.append(library(),main);wrap.append(intro,grid);
 if(!ws()){main.append(E('p','Caricamento del CRM…','rp-note'))}
 let d=null,err='';
 if(ws()){try{d=await dataFor(st.def)}catch(e){err=e.message}}
 if(my!==seq)return;
 if(!s.isConnected){busy=false;later();return}
 const values=d?valuesOf(st.def,d):null;
 main.append(builder(d,values));
 if(st.msg)main.append(E('p',st.msg,'rp-msg'));
 if(err)main.append(E('p','Dati non disponibili: '+err,'rp-msg'));
 if(d){let res=null;try{res=R.run(st.def,d,Date.now())}catch(e){main.append(E('p',e.message,'rp-msg'))}
  if(res){const money=res.measure!=='count',fmt=money?eur:int,fmtShort=money?eurShort:int;
   const out=E('section',undefined,'rp-result');const head=E('div',undefined,'rp-head');const ht=E('div');ht.append(E('h3',st.name||'Report'),E('p',R.describe(res.def),'rp-desc'));head.append(ht);
   const acts=E('div',undefined,'rp-actions');const a=app(),canSave=a?.writable?.('segments');
   acts.append(B('Esporta CSV',()=>exportCsv(res),'rp-ghost'));
   if(canSave){if(st.active.startsWith('saved:')){acts.append(B('Aggiorna report',()=>save(true)),B('Salva come nuovo',()=>save(false),'rp-ghost'),B('Elimina',()=>removeSaved(),'rp-ghost danger'))}else acts.append(B('Salva report',()=>save(false)))}
   acts.append(B('Aggiorna dati',()=>{cache.clear();st.saved=null;draw()},'rp-ghost'));head.append(acts);out.append(head);
   const kp=E('div',undefined,'rp-kpis');const tile=(l,v)=>{const x=E('div',undefined,'rp-kpi');x.append(E('small',l),E('strong',v));return x};
   kp.append(tile('Record',int(res.total.count)),tile('Gruppi',int(res.groups.length)));if(money)kp.append(tile(R.MEASURES[res.measure],fmt(res.total.value)));out.append(kp);
   if(res.capped)out.append(E('p','Calcolato sui primi '+int(R.MAX_ROWS)+' record di '+R.ENTITIES[res.def.entity].label.toLowerCase()+': il CRM ne contiene di più.','rp-msg'));
   if(!res.total.count)out.append(E('p','Nessun record con questi filtri.','rp-nodata'));
   else{if(res.def.chart!=='table')out.append(chart(res,fmt,fmtShort));out.append(table(res,fmt),drill(res))}
   main.append(out)}}
 old?old.replaceWith(wrap):s.append(wrap);
 if(ws()&&st.saved===null){loadSaved().then(()=>{if(my===seq&&s.isConnected){const l=s.querySelector('.rp-lib');l?.replaceWith(library())}})}
 if(focus){const f=s.querySelector(focus);if(f){f.focus?.();f.scrollIntoView?.({block:'nearest'})}}
 requestAnimationFrame(()=>{busy=false})}
let q=false;const later=()=>{if(busy||q)return;q=true;setTimeout(()=>{q=false;const s=document.getElementById('report');if((location.hash||'')==='#report'&&s&&s.parentNode===content&&s.querySelector(':scope>.rp')&&cacheWs===ws())return;draw()},60)};
// Re-render only when sales.js has rebuilt #content (the section is gone) or the workspace changed.
new MutationObserver(()=>{if(!busy)later()}).observe(content,{childList:true});
new MutationObserver(later).observe(nav,{childList:true});
addEventListener('hashchange',()=>{st.drill=null;later()});
document.getElementById('workspace')?.addEventListener('change',()=>{cache.clear();cacheWs=null;st.saved=null;setTimeout(later,0)});
document.getElementById('refresh')?.addEventListener('click',()=>{cache.clear();st.saved=null});
later();
})();
