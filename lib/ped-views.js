/* RADIX PED views — channels, the status board and the brief for the AI copywriter, computed from the
   editorial state. Pure functions shared by project-editorial.html and the tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPedViews=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const CHANNELS=Object.freeze(['LinkedIn','Instagram','Facebook','TikTok','YouTube','X','Blog','Newsletter']);
const COLUMNS=Object.freeze([
 {id:'draft',label:'Bozza'},{id:'review',label:'In revisione'},{id:'approved',label:'Approvato'},{id:'queued',label:'In coda di pubblicazione'}
]);

function channelSlug(channel){
 const c=String(channel||'').trim().toLowerCase();
 const known=CHANNELS.find(x=>c===x.toLowerCase()||c.startsWith(x.toLowerCase()+' '));
 return known?known.toLowerCase():(c.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'altro');
}

// A content is queued only while its approved version is the one sent to the publishing queue.
function isQueued(item){return !!(item&&item.status==='approved'&&item.publication&&item.publication.revision===item.revision)}
function columnOf(item){return isQueued(item)?'queued':item.status}

function board(contents){
 const cols=COLUMNS.map(c=>({...c,items:[]}));
 for(const item of contents||[]){const col=cols.find(c=>c.id===columnOf(item));if(col)col.items.push(item)}
 cols.forEach(c=>c.items.sort((a,b)=>((a.date||'9999')+(a.time||'99:99')).localeCompare((b.date||'9999')+(b.time||'99:99'))));
 return cols;
}

function channelsFromBrief(brief){
 const listed=String(brief&&brief.channels||'').split(/[,;/\n]+/).map(s=>s.trim()).filter(Boolean);
 const named=listed.map(s=>CHANNELS.find(c=>s.toLowerCase().includes(c.toLowerCase()))||s);
 return [...new Set(named.concat(CHANNELS))].slice(0,20);
}

// The copywriter receives the approved strategy and the content's own fields, never other projects' data.
function copyPrompt(brief,item){
 const b=brief||{},lines=[
  'Scrivi il testo di un contenuto del piano editoriale, pronto per la revisione umana.',
  'Canale: '+(item.channel||'da definire'),'Titolo / tema: '+(item.title||'da definire'),
  item.date?'Data prevista: '+item.date+(item.time?' alle '+item.time:''):'',
  'Obiettivo del progetto: '+(b.goal||'—'),'Pubblico: '+(b.audience||'—'),'Tone of voice e vincoli: '+(b.voice||'—'),
  'Messaggi chiave: '+(b.messages||'—'),'Rubriche: '+(b.topics||'—'),
  item.copy&&item.copy.trim()?'Bozza attuale da migliorare:\n'+item.copy.trim():'',
  'Adatta lunghezza, struttura e call to action al formato del canale. Rispondi solo con il testo del post (con eventuali hashtag), senza commenti o alternative.'
 ];
 return lines.filter(Boolean).join('\n');
}

// Plan analytics from the PED itself and the publishing log: production and timing, not engagement
// (Buffer statistics are not read). Dates are compared as local days in the plan's time zone.
const DAY=86400000;
const isoDay=ms=>new Date(ms).toISOString().slice(0,10);
function localToday(now,tz){try{return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))}catch(e){return isoDay(now)}}
function addDays(day,n){return isoDay(Date.parse(day+'T12:00:00Z')+n*DAY)}
function mondayOf(day){const d=new Date(day+'T12:00:00Z');return addDays(day,-((d.getUTCDay()+6)%7))}
function analytics(state,opts={}){
 const items=(state&&state.contents)||[],pubs=opts.pubs||[],tz=(state&&state.timezone)||'Europe/Rome';
 const today=opts.today||localToday(opts.now==null?Date.now():opts.now,tz),weeks=opts.weeks||8;
 const by={draft:0,review:0,approved:0,queued:0},channels={};
 items.forEach(x=>{const c=columnOf(x);by[c]=(by[c]||0)+1;const ch=channels[x.channel]||(channels[x.channel]={channel:x.channel,total:0,draft:0,review:0,approved:0,queued:0});ch.total++;ch[c]=(ch[c]||0)+1});
 const start=mondayOf(today),buckets=Array.from({length:weeks},(_,i)=>({start:addDays(start,i*7),end:addDays(start,i*7+6),count:0,ready:0}));
 items.forEach(x=>{if(!x.date)return;const b=buckets.find(w=>x.date>=w.start&&x.date<=w.end);if(b){b.count++;if(['approved','queued'].includes(columnOf(x)))b.ready++}});
 const failed=new Set(pubs.filter(p=>p.status==='failed').map(p=>p.content_id+'#'+p.revision));
 const attention=[];
 items.forEach(x=>{const c=columnOf(x),base={id:x.id,title:x.title,channel:x.channel,date:x.date||''};
  if(failed.has(x.id+'#'+x.revision)&&c!=='queued')attention.push({...base,kind:'failed',label:'Invio a Buffer non riuscito'});
  else if(!x.date)attention.push({...base,kind:'undated',label:'Senza data'});
  else if(x.date<today&&c!=='queued')attention.push({...base,kind:'late',label:'Data passata, non in coda'});
  else if(x.date<=addDays(today,7)&&(c==='draft'||c==='review'))attention.push({...base,kind:'soon',label:c==='review'?'Esce entro 7 giorni, ancora in revisione':'Esce entro 7 giorni, ancora in bozza'});
  else if(c==='approved'&&x.date>=today)attention.push({...base,kind:'ready',label:'Approvato, da mettere in coda'})});
 const order={failed:0,late:1,soon:2,ready:3,undated:4};attention.sort((a,b)=>order[a.kind]-order[b.kind]||(a.date||'9999').localeCompare(b.date||'9999'));
 const next14=items.filter(x=>x.date&&x.date>=today&&x.date<=addDays(today,13)),done=c=>c==='approved'||c==='queued';
 const pct=(n,d)=>d?Math.round(n*100/d):null;
 return {today,timezone:tz,total:items.length,byStatus:by,
  kpis:{approvedShare:pct(by.approved+by.queued,items.length),next14:next14.length,next14Ready:pct(next14.filter(x=>done(columnOf(x))).length,next14.length),
   emptyWeeks:buckets.filter(w=>!w.count).length,avgRevisions:items.length?Math.round(items.reduce((a,x)=>a+(x.revision||1),0)*10/items.length)/10:0,late:attention.filter(a=>a.kind==='late').length},
  channels:Object.values(channels).sort((a,b)=>b.total-a.total||a.channel.localeCompare(b.channel)),weeks:buckets,attention,
  publications:{queued:pubs.filter(p=>p.status==='queued').length,failed:pubs.filter(p=>p.status==='failed').length,sending:pubs.filter(p=>p.status==='sending').length}};
}

return Object.freeze({CHANNELS,COLUMNS,channelSlug,isQueued,columnOf,board,channelsFromBrief,copyPrompt,analytics,mondayOf});
});
