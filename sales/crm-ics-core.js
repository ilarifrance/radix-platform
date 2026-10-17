'use strict';
/* Calendar export (.ics, RFC 5545) for the CRM calendar: open tasks with a due date, meetings and calls
   from the last 30 days on, open opportunities' expected closing as all-day events. The file is built
   in the browser and imported by hand into Google Calendar or Outlook; nothing is sent anywhere.
   UIDs are stable per record, so importing again updates events instead of duplicating them. */
(function(root){
const DAY=864e5;
const esc=s=>String(s==null?'':s).replace(/\\/g,'\\\\').replace(/;/g,'\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
const utc=d=>new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
const ymd=s=>String(s).slice(0,10).replace(/-/g,'');
const nextDay=s=>new Date(Date.parse(String(s).slice(0,10)+'T00:00:00Z')+DAY).toISOString().slice(0,10);
// Lines longer than 75 octets continue on the next line after a space; never split a UTF-8 character.
function fold(line){const enc=new TextEncoder();if(enc.encode(line).length<=75)return line;const out=[];let cur='',n=0,limit=75;
 for(const ch of line){const b=enc.encode(ch).length;if(n+b>limit){out.push(cur);cur='';n=0;limit=74}cur+=ch;n+=b}out.push(cur);return out.join('\r\n ')}
const valid=s=>s&&Number.isFinite(Date.parse(s));

// data: {tasks,interactions,opportunities,companies}; opts: {now,owner,base}
function events(data,opts){
 const now=opts&&opts.now||Date.now(),owner=opts&&opts.owner?String(opts.owner):'',out=[];
 const company=id=>((data.companies||[]).find(c=>c.id===id)||{}).name||'';
 const mine=v=>!owner||String(v==null?'':v)===owner;
 for(const t of data.tasks||[]){if(t.status==='done'||!valid(t.due_at)||!mine(t.assignee_id))continue;const s=Date.parse(t.due_at);
  out.push({uid:'task-'+t.id,summary:t.title||'Attività',description:company(t.company_id),start:s,end:s+60*6e4,href:'#tasks'})}
 if(!owner)for(const i of data.interactions||[]){if(!['meeting','call'].includes(i.kind)||!valid(i.occurred_at))continue;const s=Date.parse(i.occurred_at);if(s<now-30*DAY)continue;
  out.push({uid:'interaction-'+i.id,summary:(i.kind==='meeting'?'Riunione: ':'Call: ')+(i.title||''),description:[company(i.company_id),i.body].filter(Boolean).join('\n'),start:s,end:s+(i.kind==='meeting'?60:30)*6e4,href:'#interactions'})}
 for(const o of data.opportunities||[]){if(o.outcome&&o.outcome!=='open')continue;const d=String(o.expected_close||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!mine(o.owner_id))continue;
  out.push({uid:'close-'+o.id,summary:'Chiusura prevista: '+(o.title||''),description:company(o.company_id),allDay:d,href:'#opportunities'})}
 return out}

function build(data,opts){
 const now=opts&&opts.now||Date.now(),base=opts&&opts.base||'',list=events(data,opts),stamp=utc(now);
 const L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//RADIX//CRM Calendario//IT','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:RADIX CRM'];
 for(const e of list){L.push('BEGIN:VEVENT','UID:'+e.uid+'@radix-crm','DTSTAMP:'+stamp);
  if(e.allDay)L.push('DTSTART;VALUE=DATE:'+ymd(e.allDay),'DTEND;VALUE=DATE:'+ymd(nextDay(e.allDay)),'TRANSP:TRANSPARENT');else L.push('DTSTART:'+utc(e.start),'DTEND:'+utc(e.end));
  L.push('SUMMARY:'+esc(e.summary));if(e.description)L.push('DESCRIPTION:'+esc(e.description));if(base)L.push('URL:'+base+e.href);L.push('END:VEVENT')}
 L.push('END:VCALENDAR');return {count:list.length,text:L.map(fold).join('\r\n')+'\r\n'}}

const api={events,build,fold,esc};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmIcs=api;
})(typeof globalThis!=='undefined'?globalThis:this);
