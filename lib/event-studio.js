/* Studio «Evento o fiera» (with the Webinar variant): the coordinated kit of an event, before, during and after.
   A few questions (type: Fiera, Open day, Inaugurazione, Webinar, Workshop; date, times and place, or the link for a
   webinar; goal: Contatti, Vendite, Immagine; the stand size for a fair; what is presented), ONE AI call to the Stratega
   di Marca e Campagne, after a click and the RADIX confirmation, that returns three kit directions as JSON (razionale,
   emotivo, d'impatto). The AI never writes dates, times or places: it writes the placeholders {data}, {ora}, {luogo},
   {link} and {accesso}, which RADIX fills from the one record of the event, so every material carries the same values.
   The person picks a direction and refines it (event data in one place, every text material), then RADIX builds the
   files here, with no further AI call and no cost:
   - Prima: invito PDF A5 (lib/print-studio.js, web PDF) and email di invito (lib/newsletter-studio.js HTML + text),
     landing di registrazione (HTML with the form and the privacy consent, plus its structure in Markdown), social posts
     with the countdown images (SVG, and PNG in the browser), the calendar file (.ics); webinar: confirmation of
     registration and the reminders at −1 day and −1 hour.
   - Durante: roll-up 85 × 200 cm, flyer A5 and staff badge 85 × 55 mm as PDF/X-1a CMYK for the print shop
     (lib/print-studio.js), the slides as .pptx and PDF (lib/doc-studio.js, lib/pptx-lite.js).
   - Dopo: thank-you email and follow-up email, and the hand-off to the CRM sequence «Dopo l’incontro»
     (sales/crm-campaigns.js) as text and link only: nothing is sent from here.
   Everything in one zip (lib/zip-lite.js) and the kit saved in the project: the «agents» document under the key events,
   keeping every other key as it is (agents-page.js keeps it too).
   Automatic checks (spec 2.9 «Qualità ✔»): every date, weekday, time and place written in any material matches the
   event; the landing collects the privacy consent (required, never pre-ticked, with the link to the policy; marketing
   consent apart and optional); the follow-up leaves within 48 hours of the end of the event. Numbers that are not in
   the person's facts are flagged (lib/copy-checks.js).
   Pure part runs in Node for the tests; eventStudio() is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixEventStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
// The styled RADIX confirmation (lib/radix-confirm.js) before every paid step; root.confirm only if it is missing.
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')))};
const AGENT='brand-strategist',COUNT=3,FACTS_MAX=1500,MAX_SAVED=20,FOLLOW_UP_HOURS=48,MAX_DAYS=10;
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const PS=()=>lib('RadixPrintStudio','./print-studio.js'),NL=()=>lib('RadixNewsletterStudio','./newsletter-studio.js'),DS=()=>lib('RadixDocStudio','./doc-studio.js'),
 ZIP=()=>lib('RadixZip','./zip-lite.js'),CK=()=>lib('RadixCopyChecks','./copy-checks.js'),AD=()=>lib('RadixAdStudio','./ad-studio.js');
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const block=s=>String(s==null?'':s).replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>norm(s).replace(/ /g,'-').slice(0,40);
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ---- questions ----
// [id, label, line, physical]
const TYPES=Object.freeze([
 ['fiera','Fiera','Stand, roll-up, badge e contatti da seguire',true],
 ['openday','Open day','Porte aperte in sede o in negozio',true],
 ['inaugurazione','Inaugurazione','Apertura o nuova sede',true],
 ['webinar','Webinar','Online: titolo, landing, slide e promemoria',false],
 ['workshop','Workshop','Un incontro pratico con posti limitati',true]]);
// [id, label, what it means for the prompt]
const GOALS=Object.freeze([
 ['contatti','Contatti','raccogliere iscrizioni e contatti qualificati da seguire subito dopo'],
 ['vendite','Vendite','portare a ordini, preventivi o appuntamenti durante e subito dopo l’evento'],
 ['immagine','Immagine','far conoscere e ricordare la marca, con un’esperienza che resti']]);
// Stand sizes (m, front × depth) for a fair; front metres decide how many roll-ups.
const STANDS=Object.freeze([['3x2','3 × 2 m'],['3x3','3 × 3 m'],['4x3','4 × 3 m'],['6x3','6 × 3 m'],['6x6','6 × 6 m'],['altro','Altra misura']]);
// The three directions differ by angle, and each one picks its own layout in every library it uses.
const ANGLES=Object.freeze([
 {id:'razionale',label:'Razionale',line:'cosa si vede, si impara o si ottiene: chiaro e concreto',print:'classic',mail:'editoriale',slides:'editorial'},
 {id:'emotivo',label:'Emotivo',line:'le persone, l’incontro, l’esperienza: caldo e personale',print:'minimal',mail:'minimal',slides:'minimal'},
 {id:'impatto',label:'D’impatto',line:'la novità e il motivo per esserci proprio ora: deciso, senza urgenze false',print:'bold',mail:'promo',slides:'bold'}]);
// How many days before the start the invitation goes out.
const LEAD={fiera:28,workshop:21,openday:14,inaugurazione:14,webinar:14};
const COUNTDOWN=Object.freeze([7,3,1]);
const type=id=>TYPES.find(t=>t[0]===id)||null;
const goal=id=>GOALS.find(g=>g[0]===id)||null;
const isWebinar=t=>t==='webinar';
const physical=t=>!!(type(t)&&type(t)[3]);
const multiDay=t=>t==='fiera'||t==='workshop';
function normalize(a){a=a||{};const t=type(a.type)?a.type:'fiera';return {type:t,goal:goal(a.goal)?a.goal:'contatti',stand:t==='fiera'?(STANDS.some(s=>s[0]===a.stand)?a.stand:'3x3'):'',standCustom:t==='fiera'?clean(a.standCustom).slice(0,30):''}}

// ---- dates, naive local time (Europe/Rome as written by the person): minutes since 1970 on a UTC clock ----
const DAYS=['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
const MONTHS=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const ISO=/^(\d{4})-(\d{2})-(\d{2})$/,HM=/^([01]?\d|2[0-3])[:.]([0-5]\d)$/;
function parseDay(s){const m=ISO.exec(String(s||'').trim());if(!m)return null;const y=+m[1],mo=+m[2],d=+m[3],t=Date.UTC(y,mo-1,d),x=new Date(t);
 return x.getUTCFullYear()===y&&x.getUTCMonth()===mo-1&&x.getUTCDate()===d?{y,m:mo,d,t}:null}
function parseTime(s){const m=HM.exec(String(s||'').trim());return m?{h:+m[1],mi:+m[2],min:+m[1]*60+ +m[2]}:null}
const pad=n=>String(n).padStart(2,'0');
const stampOf=(day,time)=>{const d=parseDay(day),t=parseTime(time);return d&&t?d.t/6e4+t.min:null};
const isoOf=min=>{const x=new Date(min*6e4);return x.getUTCFullYear()+'-'+pad(x.getUTCMonth()+1)+'-'+pad(x.getUTCDate())};
const hmOf=min=>{const x=new Date(min*6e4);return pad(x.getUTCHours())+':'+pad(x.getUTCMinutes())};
const addDays=(day,n)=>{const d=parseDay(day);return d?isoOf(d.t/6e4+n*1440):''};
const weekday=day=>{const d=parseDay(day);return d?DAYS[new Date(d.t).getUTCDay()]:''};
function longDate(day,{year=true,wd=true}={}){const d=parseDay(day);if(!d)return '';return (wd?weekday(day)+' ':'')+d.d+' '+MONTHS[d.m-1]+(year?' '+d.y:'')}
const shortDate=day=>{const d=parseDay(day);return d?weekday(day).slice(0,3)+' '+d.d+' '+MONTHS[d.m-1].slice(0,3):''};
const hm=t=>{const x=parseTime(t);return x?pad(x.h)+':'+pad(x.mi):''};

// ---- the one record of the event ----
// e: {name, date, dateEnd, start, end, venue, address, hall, platform, link (webinar access), regUrl, privacyUrl}
function eventOf(answers,e){const a=normalize(answers),x=e||{},s=v=>clean(v);
 const date=parseDay(x.date)?String(x.date).trim():'',endOk=multiDay(a.type)&&parseDay(x.dateEnd)&&date&&parseDay(x.dateEnd).t>parseDay(date).t&&(parseDay(x.dateEnd).t-parseDay(date).t)/864e5<MAX_DAYS;
 return {type:a.type,name:s(x.name).slice(0,90),date,dateEnd:endOk?String(x.dateEnd).trim():'',start:hm(x.start),end:hm(x.end),
  venue:physical(a.type)?s(x.venue).slice(0,90):'',address:physical(a.type)?s(x.address).slice(0,140):'',hall:a.type==='fiera'?s(x.hall).slice(0,60):'',
  platform:isWebinar(a.type)?s(x.platform).slice(0,40):'',link:isWebinar(a.type)?s(x.link).slice(0,300):'',regUrl:s(x.regUrl).slice(0,300),privacyUrl:s(x.privacyUrl).slice(0,300)}}
// What is wrong with the event record before anything is written (the prompt refuses it).
function eventProblems(ev){const out=[];
 if(!ev.date)out.push('Scegli la data dell’evento.');if(!ev.start)out.push('Scrivi l’ora di inizio.');
 if(ev.start&&ev.end&&parseTime(ev.end).min<=parseTime(ev.start).min)out.push('L’ora di fine deve venire dopo l’inizio.');
 if(physical(ev.type)&&!ev.venue&&!ev.address)out.push('Scrivi il luogo o l’indirizzo dell’evento.');
 for(const [k,l] of [['regUrl','pagina di iscrizione'],['privacyUrl','informativa privacy'],['link','link del webinar']])if(ev[k]&&!/^https:\/\/[^\s]+\.[^\s]+/i.test(ev[k]))out.push('Il link della '+l+' deve iniziare con https://.');
 return out}
const days=ev=>{const a=parseDay(ev.date);if(!a)return [];const b=parseDay(ev.dateEnd)||a,out=[];for(let t=a.t;t<=b.t&&out.length<MAX_DAYS;t+=864e5)out.push(isoOf(t/6e4));return out};
// Start and end of the whole event (minutes): a missing end time is one hour after the start for a webinar, else 18:00 or start + 2 h.
function span(ev){const s=stampOf(ev.date,ev.start);if(s==null)return null;const last=ev.dateEnd||ev.date,st=parseTime(ev.start).min;
 const endMin=ev.end?parseTime(ev.end).min:isWebinar(ev.type)?st+60:Math.max(st+120,18*60);return {start:s,end:parseDay(last).t/6e4+Math.min(endMin,24*60-1)}}
// The texts every material carries, always the same.
function dateText(ev){if(!ev.date)return '';if(!ev.dateEnd)return longDate(ev.date);const a=parseDay(ev.date),b=parseDay(ev.dateEnd);
 return 'da '+longDate(ev.date,{year:a.y!==b.y}).replace(a.m===b.m&&a.y===b.y?' '+MONTHS[a.m-1]:'\u0000','')+' a '+longDate(ev.dateEnd)}
function timeText(ev){const s=hm(ev.start),e=hm(ev.end)||(isWebinar(ev.type)&&s?hmOf(span(ev)?span(ev).end:0):'');return s?(e?'dalle '+s+' alle '+e:'alle '+s):''}
function placeText(ev){if(isWebinar(ev.type))return 'online'+(ev.platform?' su '+ev.platform:'');return [ev.venue,ev.hall,ev.address].filter(Boolean).join(', ')}
const FIELDS=['data','ora','luogo','link','accesso','giorni'];
function fill(text,ev,extra={}){const v={data:dateText(ev),ora:timeText(ev),luogo:placeText(ev),link:ev.regUrl||'[link della pagina di iscrizione]',accesso:ev.link||'[link per entrare nel webinar]',...extra};
 return String(text==null?'':text).replace(/\{(data|ora|luogo|link|accesso|giorni)\}/g,(all,k)=>v[k]==null?all:String(v[k]))}

// ---- quality check 1: the same dates, times and places everywhere ----
const WD='(lunedì|lunedi|martedì|martedi|mercoledì|mercoledi|giovedì|giovedi|venerdì|venerdi|sabato|domenica)';
const MO='(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\\.?';
const RANGE=new RegExp('\\b(?:'+WD+'\\s+)?(\\d{1,2})\\s*(?:-|–|al|a|e)\\s*(?:'+WD+'\\s+)?(\\d{1,2})\\s+'+MO+'(?:\\s+(\\d{4}))?(?![\\wà-ú])','gi');
const WORDS=new RegExp('\\b(?:'+WD+'\\s+)?(\\d{1,2})(?:°|º)?\\s+'+MO+'(?:\\s+(\\d{4}))?(?![\\wà-ú])','gi');
const NUMERIC=/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])|\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g;
const TIMES=/\b(?:ore\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d.,]*\d)|\bore\s+([01]?\d|2[0-3])\b(?![:.]\d)/gi;
const monthOf=s=>{const k=norm(s).slice(0,3);return MONTHS.findIndex(m=>m.startsWith(k))+1};
const wdNorm=s=>norm(s).slice(0,3);
// Every date and time written in a text: [{kind:'date',d,m,y,wd,text}|{kind:'time',min,text}].
function mentions(text){const t=String(text||''),out=[],used=[];const free=(a,b)=>!used.some(([x,y])=>a<y&&x<b);
 for(const m of t.matchAll(RANGE)){const mo=monthOf(m[5]),y=m[6]?+m[6]:null;used.push([m.index,m.index+m[0].length]);
  out.push({kind:'date',d:+m[2],m:mo,y,wd:m[1]||'',text:m[0]},{kind:'date',d:+m[4],m:mo,y,wd:m[3]||'',text:m[0]})}
 for(const m of t.matchAll(WORDS)){if(!free(m.index,m.index+m[0].length))continue;used.push([m.index,m.index+m[0].length]);out.push({kind:'date',d:+m[2],m:monthOf(m[3]),y:m[4]?+m[4]:null,wd:m[1]||'',text:m[0]})}
 for(const m of t.matchAll(NUMERIC)){if(!free(m.index,m.index+m[0].length))continue;used.push([m.index,m.index+m[0].length]);const d=+(m[1]||m[4]),mo=+(m[2]||m[5]),yy=m[3]||m[6];
  if(d<1||d>31||mo<1||mo>12)continue;out.push({kind:'date',d,m:mo,y:yy?(yy.length===2?2000+ +yy:+yy):null,wd:'',text:m[0]})}
 for(const m of t.matchAll(TIMES)){if(!free(m.index,m.index+m[0].length))continue;const h=+(m[1]!=null?m[1]:m[3]),mi=m[2]!=null?+m[2]:0;out.push({kind:'time',min:h*60+mi,text:clean(m[0])})}
 return out}
// materials: [{id,label,text,needs:['date','time','place','access']}]. Issues: a date that is not a day of the event, a
// weekday that does not match its date, a time outside the event hours, a needed date/time/place/link missing.
function consistency(materials,ev){const ds=days(ev),dayKeys=new Set(ds.map(d=>{const p=parseDay(d);return p.d+'/'+p.m})),year=ev.date?parseDay(ev.date).y:null,issues=[];
 const sp=span(ev),st=ev.start?parseTime(ev.start).min:null,en=sp?(sp.end%1440||1440):null;
 const want={date:dateText(ev),time:timeText(ev),place:placeText(ev),access:ev.link};
 for(const mt of materials||[]){const t=String(mt.text||''),found=mentions(t);
  for(const f of found){
   if(f.kind==='date'){const key=f.d+'/'+f.m;
    if(!dayKeys.has(key)||(f.y&&f.y!==year))issues.push({kind:'date',material:mt.id,label:mt.label,text:f.text});
    else if(f.wd){const iso=ds.find(d=>{const p=parseDay(d);return p.d===f.d&&p.m===f.m});if(wdNorm(weekday(iso))!==wdNorm(f.wd))issues.push({kind:'weekday',material:mt.id,label:mt.label,text:f.text,right:weekday(iso)})}}
   else if(st!=null&&(f.min<st||f.min>en))issues.push({kind:'time',material:mt.id,label:mt.label,text:f.text})}
  for(const need of mt.needs||[]){const v=want[need];if(!v)continue;
   const has=need==='date'?t.includes(v)||found.some(f=>f.kind==='date'&&dayKeys.has(f.d+'/'+f.m)):need==='time'?t.includes(v)||found.some(f=>f.kind==='time'&&f.min===st):norm(t).includes(norm(v));
   if(!has)issues.push({kind:'missing',material:mt.id,label:mt.label,need})}}
 return issues}

// ---- quality check 2: the landing collects the consent ----
// The form of the registration page: name, email, company (optional), the privacy consent (required, unticked, with the
// link to the policy) and the marketing consent (optional, unticked, separate).
function landingForm(ev,answers){const a=normalize(answers);return {fields:[
 {name:'nome',label:'Nome e cognome',type:'text',required:true},
 {name:'email',label:'Email',type:'email',required:true},
 {name:'azienda',label:a.type==='fiera'||a.goal==='vendite'?'Azienda':'Azienda (facoltativo)',type:'text',required:a.type==='fiera'||a.goal==='vendite'},
 {name:'privacy',label:'Ho letto l’informativa privacy e acconsento al trattamento dei miei dati per l’iscrizione all’evento.',type:'checkbox',required:true,checked:false,consent:'privacy'},
 {name:'marketing',label:'Voglio ricevere aggiornamenti e offerte via email (facoltativo).',type:'checkbox',required:false,checked:false,consent:'marketing'}],
 privacyUrl:ev.privacyUrl||''}}
function consentIssues(form){const f=form||{},fields=Array.isArray(f.fields)?f.fields:[],out=[];
 if(!fields.some(x=>x.type==='email'&&x.required))out.push({kind:'email',text:'Il modulo non chiede l’email (obbligatoria).'});
 const p=fields.find(x=>x.type==='checkbox'&&/privacy|informativa|trattamento/i.test(x.label||'')&&x.consent!=='marketing');
 if(!p)out.push({kind:'consent',text:'Manca la casella del consenso privacy.'});
 else{if(!p.required)out.push({kind:'required',text:'Il consenso privacy deve essere obbligatorio per iscriversi.'});if(p.checked)out.push({kind:'prechecked',text:'Il consenso privacy non può essere già spuntato.'})}
 const m=fields.find(x=>x.consent==='marketing');if(m){if(m.required)out.push({kind:'marketing-required',text:'Il consenso al marketing deve restare facoltativo.'});if(m.checked)out.push({kind:'marketing-prechecked',text:'Il consenso al marketing non può essere già spuntato.'})}
 if(!/^https:\/\//i.test(f.privacyUrl||''))out.push({kind:'policy',text:'Aggiungi il link all’informativa privacy: senza, il consenso non è informato.'});
 return out}
// The same rules read back from the landing HTML (what is actually downloaded).
function consentInHtml(html){const h=String(html||''),boxes=[...h.matchAll(/<input\b[^>]*type="checkbox"[^>]*>/gi)].map(m=>m[0]);
 const priv=boxes.find(b=>/name="privacy"/.test(b)),mk=boxes.find(b=>/name="marketing"/.test(b)),link=/<a\b[^>]*href="(https:\/\/[^"]+)"[^>]*>[^<]*informativa/i.exec(h);
 return {fields:[{type:'email',required:/<input\b[^>]*type="email"[^>]*\brequired\b/i.test(h)},
  ...(priv?[{type:'checkbox',label:'privacy',required:/\brequired\b/.test(priv),checked:/\bchecked\b/.test(priv),consent:'privacy'}]:[]),
  ...(mk?[{type:'checkbox',label:'marketing',required:/\brequired\b/.test(mk),checked:/\bchecked\b/.test(mk),consent:'marketing'}]:[])],privacyUrl:link?link[1]:''}}

// ---- quality check 3: the follow-up leaves within 48 hours ----
// The CRM sequence «Dopo l’incontro» (sales/crm-campaigns.js SEQUENCES), started at the end of the event: tasks start
// the next day at 09:00 and its first email step is `day` days later. The real one when the CRM core is loaded.
const INCONTRO_FALLBACK=Object.freeze({id:'incontro',name:'Dopo l’incontro',steps:[{day:1,kind:'email',title:'Riepilogo dell’incontro'},{day:7,kind:'task',title:'Invia la proposta'},{day:14,kind:'call',title:'Telefonata sulla proposta'}]});
function incontro(){const C=lib('RadixCrmCampaignCore','../sales/crm-campaigns.js'),s=C&&Array.isArray(C.SEQUENCES)&&C.SEQUENCES.find(x=>x.id==='incontro');return s||INCONTRO_FALLBACK}
function crmFirstEmail(endMin,seq){const s=seq||incontro(),first=(s.steps||[]).find(x=>x.kind==='email');if(!first)return null;const startDay=Math.floor((endMin+1440)/1440)*1440;return startDay+9*60+first.day*1440}
// Default «Dopo»: the thank-you the next morning at 10:00 (two hours after a webinar that ends before 19:00), the
// follow-up when the CRM sequence would send it, or 24 hours after the end when that is later than 48 hours.
function afterDefaults(ev){const sp=span(ev);if(!sp)return {grazie:'',followup:''};const endH=sp.end%1440;
 const g=isWebinar(ev.type)&&endH<=19*60?sp.end+120:Math.floor(sp.end/1440)*1440+1440+10*60,c=crmFirstEmail(sp.end),f=c!=null&&c-sp.end<=FOLLOW_UP_HOURS*60&&c>sp.end?c:sp.end+1440;
 const v=m=>isoOf(m)+'T'+hmOf(m);return {grazie:v(g),followup:v(f)}}
const atMin=s=>{const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(String(s||''));return m?stampOf(m[1],m[2]):null};
function followUpIssues(after,ev){const sp=span(ev),out=[];if(!sp)return [{kind:'event',text:'Mancano data e ora dell’evento.'}];
 for(const [k,l] of [['grazie','L’email di ringraziamento'],['followup','Il follow-up dei contatti']]){const m=atMin(after&&after[k]);
  if(m==null){out.push({kind:'missing',which:k,text:l+' non ha data e ora.'});continue}
  if(m<=sp.end)out.push({kind:'before',which:k,text:l+' è prima della fine dell’evento.'});
  else if(m-sp.end>FOLLOW_UP_HOURS*60)out.push({kind:'late',which:k,hours:Math.round((m-sp.end)/6)/10,text:l+' parte '+String(Math.round((m-sp.end)/6)/10).replace('.',',')+' ore dopo la fine: deve partire entro '+FOLLOW_UP_HOURS+' ore.'})}
 return out}

// ---- the timeline: what goes out when ----
function schedule(ev,after,answers){const a=normalize(answers),sp=span(ev);if(!sp)return [];const s=sp.start,day=m=>Math.floor(m/1440)*1440,out=[],web=isWebinar(a.type);
 const at=(m,id,phase,label,channel)=>out.push({id,phase,label,channel,at:isoOf(m)+'T'+hmOf(m)});
 const inv=day(s)-LEAD[a.type]*1440+10*60;
 at(inv,'invito','prima',web?'Email di invito, landing online e post di annuncio':'Invito (email e PDF), landing online e post di annuncio','Email · Sito · Social');
 if(web)out.push({id:'conferma',phase:'prima',label:'Conferma di iscrizione: parte da sola a ogni iscritto',channel:'Email',at:''});
 for(const n of COUNTDOWN){const m=day(s)-n*1440+12*60+30;if(m>inv)at(m,'countdown-'+n,'prima','Countdown: '+(n===1?'manca 1 giorno':'mancano '+n+' giorni'),'Social')}
 if(web){at(s-1440,'promemoria-giorno','prima','Promemoria a −1 giorno','Email');at(s-60,'promemoria-ora','prima','Promemoria a −1 ora','Email')}
 at(s,'evento','durante',(web?'Webinar':type(a.type)[1])+' · '+timeText(ev),web?'Online':'In presenza');
 at(s+60,'live','durante','Post dal vivo','Social');
 const g=atMin(after&&after.grazie),f=atMin(after&&after.followup);
 if(g!=null)at(g,'grazie','dopo',web?'Email di ringraziamento con la registrazione':'Email di ringraziamento','Email');
 if(f!=null)at(f,'followup','dopo','Follow-up dei contatti (CRM «Dopo l’incontro»)','Email · CRM');
 return out}
const whenText=iso=>{const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(String(iso||''));return m?shortDate(m[1])+' · '+m[2]:''};

// ---- the AI call: three directions ----
function factsText(project,profile){const A=AD();return A&&typeof A.factsText==='function'?A.factsText(project,profile):''}
const inputText=v=>{const x=v||{};return [x.facts,x.projectFacts,x.eventText].map(s=>String(s||'')).join('\n')};
function directionsPrompt(answers,values={}){const a=normalize(answers),v=values||{},ev=eventOf(a,v.event),p=v.project||{},facts=block(v.facts).slice(0,FACTS_MAX),web=isWebinar(a.type);
 const probs=eventProblems(ev);if(probs.length)throw Error(probs[0]);
 if(facts.length<10)throw Error('Scrivi cosa presentate o cosa succede all’evento (almeno 10 caratteri).');
 const L=[];
 L.push('Prepara '+COUNT+' direzioni diverse tra loro per il kit di comunicazione di un evento'+(p.name?' del progetto «'+clean(p.name).slice(0,80)+'»':'')+': '+type(a.type)[1].toLowerCase()+(ev.name?' «'+ev.name+'»':'')+'.');
 L.push('Obiettivo: '+goal(a.goal)[2]+'.');
 if(a.type==='fiera')L.push('Stand: '+(a.stand==='altro'?(a.standCustom||'misura da definire'):STANDS.find(s=>s[0]===a.stand)[1])+'.');
 L.push('Cosa presentiamo o cosa succede, scritto dal cliente:\n«'+facts+'»');
 const pf=clean(v.projectFacts)?block(v.projectFacts).slice(0,2000):'';if(pf)L.push('Fatti confermati del progetto:\n'+pf);
 L.push('Le tre direzioni differiscono per angolo: 1 '+ANGLES[0].label.toLowerCase()+' ('+ANGLES[0].line+'), 2 '+ANGLES[1].label.toLowerCase()+' ('+ANGLES[1].line+'), 3 '+ANGLES[2].label.toLowerCase()+' ('+ANGLES[2].line+').');
 L.push('Regole:',
  '- Data, orario e luogo NON si scrivono mai: usa i segnaposto {data}, {ora}, {luogo}; il link di iscrizione è {link}'+(web?'; il link per entrare nel webinar è {accesso}':'')+'. RADIX li riempie uguali in tutti i materiali.',
  '- Nessun giorno della settimana, nessuna data, nessun orario scritti per esteso. Puoi dire «domani» o «tra un’ora» solo nei promemoria.',
  '- Usa solo i fatti scritti qui. Non inventare numeri, prezzi, sconti, ospiti, relatori, premi, posti disponibili o risultati.',
  '- Nelle email il nome del destinatario è {{nome}}.',
  '- «countdown» è un solo testo per i post del conto alla rovescia, con il segnaposto {giorni} (es. «Mancano {giorni} giorni»).',
  '- Titolo al massimo 60 caratteri, claim al massimo 80, oggetti email al massimo 60, anteprima 40-110.',
  '- '+(web?'Slide del webinar: da 6 a 8, la prima con il titolo e {data}, l’ultima con le domande e il prossimo passo.':'Slide da proiettare allo stand o all’incontro: da 5 a 7, la prima con il titolo e {data}.'),
  '- Italiano semplice, niente emoji, niente frasi tutte in maiuscolo.');
 const mail={oggetto:'max 60 caratteri',testo:'3-6 frasi'},shape={nome:'2-4 parole',angolo:'razionale | emotivo | impatto',idea:'una frase',titolo:'max 60 caratteri',claim:'max 80 caratteri',punti:['3 motivi per esserci'],invito_azione:'max 30 caratteri',
  invito:{oggetto:'max 60',anteprima:'40-110 caratteri',testo:'4-8 frasi con {data}, {ora}, {luogo} e {link}'},
  landing:{titolo:'max 60',sottotitolo:'max 120',testo:'2-4 frasi'},
  post:{annuncio:'con {data} e {luogo}',countdown:'con {giorni}',live:'il giorno stesso',grazie:'dopo l’evento'},
  slide:[{titolo:'...',punti:['...'],nota:'cosa dire'}],grazie:mail,followup:{oggetto:'max 60',testo:'3-6 frasi: il prossimo passo concreto'}};
 if(web)Object.assign(shape,{conferma:{oggetto:'max 60',testo:'con {data}, {ora} e {accesso}'},promemoria_giorno:{oggetto:'max 60',testo:'domani, con {ora} e {accesso}'},promemoria_ora:{oggetto:'max 60',testo:'tra un’ora, con {accesso}'}});
 else Object.assign(shape,{rollup:{titolo:'max 40 caratteri',sottotitolo:'max 80'},flyer:{titolo:'max 60',testo:'2-4 frasi'}});
 L.push('Rispondi solo con JSON valido, senza testo prima o dopo, con 3 oggetti in "kit":\n{"kit":['+JSON.stringify(shape)+',{…},{…}]}');
 return L.join('\n')}

// ---- parsing ----
function parseJson(text){const A=AD();if(A&&typeof A.parseJson==='function')return A.parseJson(text);try{return JSON.parse(text)}catch(e){return null}}
function pick(o,keys){if(!o||typeof o!=='object'||Array.isArray(o))return undefined;const ks=Object.keys(o);for(const k of keys){const hit=ks.find(x=>norm(x).replace(/ /g,'_')===k);if(hit!==undefined)return o[hit]}return undefined}
const str=(o,keys,max)=>{const v=pick(o,keys);return block(typeof v==='string'||typeof v==='number'?String(v):'').slice(0,max||2000)};
const one=(o,keys,max)=>clean(str(o,keys,max)).slice(0,max||300);
const list=v=>(Array.isArray(v)?v:typeof v==='string'?v.split('\n'):[]).map(x=>clean(typeof x==='object'&&x?pick(x,['testo','text','punto']):x).replace(/^[-*•–]\s*/,'')).filter(Boolean);
// Text templates when the reply misses a piece: the kit is always complete, and the person is told to read it again.
function fallback(kind,a,d){const t=d.title||'Ti aspettiamo',web=isWebinar(a.type);
 return ({
  invito:{subject:web?'Webinar: '+t:'Sei invitato: '+t,preheader:'{data}, {ora} · '+(web?'online':'{luogo}')+'. Iscriviti qui.',body:'Ciao {{nome}},\n\n'+(d.claim||t)+'\n\nTi aspettiamo {data}, {ora}, '+(web?'online':'a {luogo}')+'.\n\nIscriviti qui: {link}'},
  landing:{title:t,sub:d.claim||'',body:d.idea||''},
  posts:{annuncio:t+'\n'+(d.claim||'')+'\n{data} · {luogo}\nIscriviti: {link}',countdown:'Mancano {giorni} giorni a «'+t+'». Ci vediamo {data}.',live:'Ci siamo: «'+t+'» è iniziato. '+(web?'Entra ora.':'Passa a trovarci.'),grazie:'Grazie a chi c’era a «'+t+'».'},
  rollup:{title:t.slice(0,40),sub:(d.claim||'').slice(0,80)},flyer:{title:t,body:d.claim||'',cta:d.cta||'Parliamone'},
  slides:'Slide 1 · '+t+'\n- {data}\nNota: Benvenuto.\n\nSlide 2 · Perché siamo qui\n'+(d.points||[]).map(p=>'- '+p).join('\n')+'\n\nSlide 3 · Grazie\n- {link}',
  grazie:{subject:'Grazie di essere stato con noi',body:'Ciao {{nome}},\n\ngrazie per essere passato a «'+t+'».'+(web?'\n\nQui trovi la registrazione: [link alla registrazione].':'')},
  followup:{subject:'Il prossimo passo dopo «'+t+'»',body:'Ciao {{nome}},\n\nriprendiamo da dove eravamo rimasti: rispondi a questa email per fissare una chiamata.'},
  conferma:{subject:'Iscrizione confermata: '+t,body:'Ciao {{nome}},\n\nla tua iscrizione è confermata. Ci vediamo {data}, {ora}.\n\nPer entrare: {accesso}'},
  promemoria_giorno:{subject:'Domani: '+t,body:'Ciao {{nome}},\n\ndomani {ora} ci vediamo online. Per entrare: {accesso}'},
  promemoria_ora:{subject:'Tra un’ora: '+t,body:'Ciao {{nome}},\n\ntra un’ora iniziamo. Entra da qui: {accesso}'}})[kind]}
const mailOf=(o,a,d,k)=>{const fb=fallback(k,a,d),x=pick(o,{invito:['invito','invite'],grazie:['grazie','ringraziamento','thank_you'],followup:['followup','follow_up','follow'],conferma:['conferma','conferma_iscrizione'],promemoria_giorno:['promemoria_giorno','promemoria_1_giorno','reminder_day'],promemoria_ora:['promemoria_ora','promemoria_1_ora','reminder_hour']}[k]);
 const subject=one(x,['oggetto','subject'],60),body=str(x,['testo','text','corpo','body'],3000),pre=one(x,['anteprima','preheader'],110);
 return {value:{subject:subject||fb.subject,...(k==='invito'?{preheader:pre||fb.preheader}:{}),body:body||fb.body},filled:!subject||!body}};
function directionOf(x,i,ctx){if(!x||typeof x!=='object'||Array.isArray(x))return null;const a=normalize(ctx.answers),web=isWebinar(a.type),filled=[];
 const title=one(x,['titolo','title'],60),claim=one(x,['claim','slogan','payoff'],80);if(!title&&!claim)return null;
 const d={title:title||claim.slice(0,60),claim,idea:one(x,['idea','concetto'],240),points:list(pick(x,['punti','motivi','points'])).slice(0,4).map(p=>p.slice(0,120)),cta:one(x,['invito_azione','cta','pulsante'],30)||(web?'Iscriviti gratis':'Registrati')};
 const angle=ANGLES[i%COUNT],texts={core:{title:d.title,claim:d.claim,points:d.points.join('\n'),cta:d.cta}};
 for(const k of ['invito','grazie','followup'].concat(web?['conferma','promemoria_giorno','promemoria_ora']:[])){const m=mailOf(x,a,d,k);texts[k]=m.value;if(m.filled)filled.push(k)}
 const lp=pick(x,['landing','pagina']),lfb=fallback('landing',a,d);texts.landing={title:one(lp,['titolo','title'],60)||lfb.title,sub:one(lp,['sottotitolo','subtitle'],120)||lfb.sub,body:str(lp,['testo','text'],1200)||lfb.body};
 const po=pick(x,['post','posts','social']),pfb=fallback('posts',a,d);texts.posts={};for(const k of ['annuncio','countdown','live','grazie']){const v=str(po,[k],1200);texts.posts[k]=v||pfb[k];if(!v)filled.push('post '+k)}
 if(!/\{giorni\}/.test(texts.posts.countdown)){const c=texts.posts.countdown.replace(/\b\d{1,2}\s+giorn[oi]\b/i,'{giorni} giorni');texts.posts.countdown=/\{giorni\}/.test(c)?c:c+' Mancano {giorni} giorni.'}
 const sl=pick(x,['slide','slides']);let slides='';
 if(Array.isArray(sl))slides=sl.slice(0,10).map((s,k)=>{const t=typeof s==='string'?clean(s):one(s,['titolo','title'],80),pts=typeof s==='object'&&s?list(pick(s,['punti','bullets','points'])).slice(0,6):[],nota=typeof s==='object'&&s?one(s,['nota','note','cosa_dire'],400):'';
  return t?'Slide '+(k+1)+' · '+t+(pts.length?'\n'+pts.map(p=>'- '+p).join('\n'):'')+(nota?'\nNota: '+nota:''):''}).filter(Boolean).join('\n\n');
 if(!slides){slides=fallback('slides',a,d);filled.push('slide')}
 if(!/\{data\}/.test(slides))slides=slides.replace(/^(Slide 1 · [^\n]*)/,'$1\n- {data}');
 texts.slides=slides;
 if(!web){const r=pick(x,['rollup','roll_up']),f=pick(x,['flyer','volantino']),rf=fallback('rollup',a,d),ff=fallback('flyer',a,d);
  texts.rollup={title:one(r,['titolo','title'],40)||rf.title,sub:one(r,['sottotitolo','subtitle'],80)||rf.sub};
  texts.flyer={title:one(f,['titolo','title'],60)||ff.title,body:str(f,['testo','text'],900)||ff.body,cta:d.cta};
  texts.badge={role:'Staff'}}
 const dir={id:'k'+(i+1),angle:angle.id,name:one(x,['nome','name'],60).replace(/[«»"]/g,'')||'Direzione '+(i+1),idea:d.idea,texts,filled};
 dir.issues=directionIssues(dir,ctx);return dir}
// «Slide 3 ·» numbers are the slide order, not claims.
const forNumbers=s=>String(s||'').replace(/^\s*Slide\s+\d{1,2}\s*·/gim,'');
function directionIssues(dir,ctx){const K=CK(),all=forNumbers(allTexts(dir.texts).join('\n')),input=String(ctx&&ctx.input||'')+'\n'+FIELDS.join(' ');
 return (K&&typeof K.unverifiedNumbers==='function'?K.unverifiedNumbers(all,input):[]).map(n=>({kind:'number',text:n})).concat((dir.filled||[]).length?[{kind:'filled',text:dir.filled.join(', ')}]:[])}
function allTexts(t){const out=[];const walk=v=>{if(typeof v==='string')out.push(v);else if(v&&typeof v==='object')Object.values(v).forEach(walk)};walk(t);return out}
// The reply → up to three directions; [] when nothing usable is there. ctx: {answers, input}.
function parseDirections(text,ctx={}){const d=parseJson(text);if(!d)return [];const l=Array.isArray(d)?d:pick(d,['kit','direzioni','proposte'])||[],out=[];
 (Array.isArray(l)?l:[]).forEach(x=>{if(out.length>=COUNT)return;const r=directionOf(x,out.length,ctx);if(r)out.push(r)});return out}
const issueText=i=>i.kind==='number'?'Il numero «'+i.text+'» non compare nei tuoi dati: verificalo o toglilo.'
 :i.kind==='filled'?'Nella risposta mancavano dei pezzi ('+i.text+'): ho messo un testo base, rileggilo.'
 :i.kind==='date'?i.label+': la data «'+i.text+'» non è un giorno dell’evento.'
 :i.kind==='weekday'?i.label+': «'+i.text+'» ha il giorno sbagliato (è '+i.right+').'
 :i.kind==='time'?i.label+': l’orario «'+i.text+'» è fuori dall’orario dell’evento.'
 :i.kind==='missing'?i.label+': manca '+({date:'la data',time:'l’orario',place:'il luogo',access:'il link per entrare'}[i.need])+' (usa {'+({date:'data',time:'ora',place:'luogo',access:'accesso'}[i.need])+'}).'
 :i.text||'';

// ---- the model being refined and its materials ----
// One direction + the event record + the «Dopo» times → the editable kit.
function modelOf(dir,answers,event,after){const a=normalize(answers),ev=eventOf(a,event);
 return {type:a.type,goal:a.goal,stand:a.stand,standCustom:a.standCustom,event:ev,direction:{id:dir.id,angle:dir.angle,name:dir.name,idea:dir.idea||''},texts:JSON.parse(JSON.stringify(dir.texts)),after:after&&after.grazie?{...after}:afterDefaults(ev)}}
// The editable materials, phase by phase: [phase, id, label, fields [[path, label, rows, max]], needs, types]
const MATERIALS=Object.freeze([
 ['prima','core','Titolo e messaggio (invito PDF, landing, roll-up, countdown)',[['core.title','Titolo',1,60],['core.claim','Claim',1,80],['core.points','Motivi per esserci (uno per riga)',3,400],['core.cta','Invito all’azione',1,30]],[],'all'],
 ['prima','invito','Email di invito',[['invito.subject','Oggetto',1,60],['invito.preheader','Anteprima',1,110],['invito.body','Testo',8,3000]],['date','time','place'],'all'],
 ['prima','invitopdf','Invito PDF (A5)',[],['date','time','place'],'physical'],
 ['prima','landing','Landing di registrazione',[['landing.title','Titolo',1,60],['landing.sub','Sottotitolo',1,120],['landing.body','Testo',4,1200]],['date','time','place'],'all'],
 ['prima','conferma','Email di conferma iscrizione',[['conferma.subject','Oggetto',1,60],['conferma.body','Testo',6,3000]],['date','time','access'],'webinar'],
 ['prima','annuncio','Post di annuncio',[['posts.annuncio','Testo del post',4,1200]],['date','place'],'all'],
 ['prima','countdown','Post del countdown (−7, −3, −1)',[['posts.countdown','Testo, con {giorni}',3,1200]],['date'],'all'],
 ['prima','promemoria_giorno','Promemoria a −1 giorno',[['promemoria_giorno.subject','Oggetto',1,60],['promemoria_giorno.body','Testo',5,3000]],['time','access'],'webinar'],
 ['prima','promemoria_ora','Promemoria a −1 ora',[['promemoria_ora.subject','Oggetto',1,60],['promemoria_ora.body','Testo',4,3000]],['access'],'webinar'],
 ['durante','live','Post dal vivo',[['posts.live','Testo del post',3,1200]],[],'all'],
 ['durante','rollup','Roll-up 85 × 200 cm',[['rollup.title','Titolo',1,40],['rollup.sub','Sottotitolo',1,80]],[],'physical'],
 ['durante','flyer','Flyer A5',[['flyer.title','Titolo',1,60],['flyer.body','Testo',4,900],['flyer.cta','Invito all’azione',1,60]],[],'physical'],
 ['durante','badge','Badge dello staff (85 × 55 mm)',[['badge.role','Ruolo sul badge',1,40]],[],'physical'],
 ['durante','slides','Slide',[['slides','Slide (Slide n · Titolo, - punti, Nota:)',12,6000]],['date'],'all'],
 ['dopo','grazie','Email di ringraziamento',[['grazie.subject','Oggetto',1,60],['grazie.body','Testo',6,3000]],[],'all'],
 ['dopo','postgrazie','Post di ringraziamento',[['posts.grazie','Testo del post',3,1200]],[],'all'],
 ['dopo','followup','Email di follow-up ai contatti',[['followup.subject','Oggetto',1,60],['followup.body','Testo',6,3000]],[],'all']]);
const PHASES=Object.freeze([['prima','Prima'],['durante','Durante'],['dopo','Dopo']]);
const getPath=(o,p)=>p.split('.').reduce((x,k)=>x&&typeof x==='object'?x[k]:undefined,o);
function setPath(o,p,v){const ks=p.split('.'),last=ks.pop();let x=o;for(const k of ks){if(!x[k]||typeof x[k]!=='object')x[k]={};x=x[k]}x[last]=v}
const materialsFor=t=>MATERIALS.filter(m=>m[5]==='all'||(m[5]==='physical'&&physical(t))||(m[5]==='webinar'&&isWebinar(t)));
// The filled text of each material, for the checks and the files. The landing always prints its «quando e dove» box.
function invitoPdfText(m){const c=m.texts.core;return [c.title,c.claim,'{data}','{ora}','{luogo}',c.points].join('\n')}
function materialTexts(m){const ev=m.event;return materialsFor(m.type).map(([phase,id,label,fields,needs])=>{
 const raw=id==='invitopdf'?invitoPdfText(m):id==='landing'?fields.map(f=>getPath(m.texts,f[0])||'').concat(['{data}','{ora}','{luogo}']).join('\n'):id==='countdown'?COUNTDOWN.map(n=>fill(m.texts.posts.countdown,ev,{giorni:n})).join('\n'):fields.map(f=>getPath(m.texts,f[0])||'').join('\n');
 return {id,phase,label,needs,text:id==='countdown'?raw:fill(raw,ev)}})}
// All the checks of the kit, as shown in the studio and written in the plan.
function checksOf(m){const ev=m.event,dates=consistency(materialTexts(m),ev),consent=consentIssues(landingForm(ev,m)),follow=followUpIssues(m.after,ev),K=CK();
 const numbers=K&&typeof K.unverifiedNumbers==='function'?K.unverifiedNumbers(forNumbers(materialTexts(m).map(x=>x.text).join('\n')),String(m.input||'')+'\n'+[dateText(ev),timeText(ev),placeText(ev),ev.regUrl,ev.link,ev.privacyUrl].join('\n')+'\n'+COUNTDOWN.join(' ')+' 85 200 55 '+(m.stand||'').replace('x',' ')):[];
 return [
  {id:'dates',label:'Date, orari e luoghi uguali in tutti i materiali',ok:!dates.length,issues:dates.map(issueText)},
  {id:'consent',label:'La landing raccoglie il consenso privacy',ok:!consent.some(i=>i.kind!=='policy'),warn:consent.some(i=>i.kind==='policy'),issues:consent.map(i=>i.text)},
  {id:'followup',label:'Il follow-up parte entro '+FOLLOW_UP_HOURS+' ore',ok:!follow.length,issues:follow.map(i=>i.text)},
  {id:'numbers',label:'Numeri presenti nei tuoi dati',ok:!numbers.length,issues:numbers.map(n=>'Il numero «'+n+'» non compare nei tuoi dati: verificalo o toglilo.')}]}

// ---- files ----
const variant=m=>ANGLES.find(x=>x.id===m.direction.angle)||ANGLES[0];
function standText(m){if(m.type!=='fiera')return '';if(m.stand==='altro')return m.standCustom||'da definire';return (STANDS.find(s=>s[0]===m.stand)||['',''])[1]}
// One roll-up every 2 m of front, 1 to 4.
function rollups(m){if(!physical(m.type))return 0;if(m.type!=='fiera')return 1;const f=parseFloat(String(m.stand==='altro'?m.standCustom:m.stand).replace(',','.'));return Number.isFinite(f)&&f>0?Math.max(1,Math.min(4,Math.round(f/2))):1}
function brandFor(ctx){const P=PS();return P.brandOf(ctx&&ctx.profile,ctx&&ctx.projectName)}
function wrapWords(t,max){const out=[];let l='';for(const w of clean(t).split(' ').filter(Boolean)){const n=l?l+' '+w:w;if(n.length>max&&l){out.push(l);l=w}else l=n}if(l)out.push(l);return out}
// The countdown image, 1080 × 1080, in the direction's style and the brand palette (text at AA contrast).
function countdownSvg(m,n,brand){const P=PS(),pal=brand.palette,v=variant(m).print,bg=v==='bold'?pal.primary:v==='minimal'?'#FFFFFF':pal.light;
 const ink=P.ink(bg,pal,pal.dark),big=P.ink(bg,pal,pal.accent,pal.primary,pal.dark),soft=P.ink(bg,pal,pal.secondary,pal.dark),ev=m.event,font=esc((brand.fonts.heading||'Helvetica')+', Helvetica, Arial, sans-serif');
 const title=wrapWords(m.texts.core.title,24).slice(0,2),date=dateText(ev),place=isWebinar(m.type)?placeText(ev):[ev.venue||ev.address,ev.hall].filter(Boolean).join(' · ');
 const o=['<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="'+esc((n===1?'Manca 1 giorno':'Mancano '+n+' giorni')+' · '+m.texts.core.title)+'">','<rect width="1080" height="1080" fill="'+bg+'"/>'];
 if(v==='classic')o.push('<rect x="0" y="0" width="1080" height="24" fill="'+pal.primary+'"/>');if(v==='minimal')o.push('<rect x="80" y="80" width="920" height="920" fill="none" stroke="'+soft+'" stroke-width="3"/>');
 o.push('<text x="120" y="190" font-family="'+font+'" font-size="40" font-weight="700" fill="'+ink+'" letter-spacing="2">'+esc(String(brand.name||'').toUpperCase().slice(0,32))+'</text>');
 o.push('<text x="120" y="'+(n>9?560:600)+'" font-family="'+font+'" font-size="'+(n>9?380:440)+'" font-weight="700" fill="'+big+'">'+n+'</text>');
 o.push('<text x="120" y="680" font-family="'+font+'" font-size="64" font-weight="700" fill="'+ink+'">'+(n===1?'giorno':'giorni')+'</text>');
 title.forEach((l,i)=>o.push('<text x="120" y="'+(780+i*62)+'" font-family="'+font+'" font-size="54" font-weight="700" fill="'+ink+'">'+esc(l)+'</text>'));
 o.push('<text x="120" y="'+(820+title.length*62)+'" font-family="'+font+'" font-size="36" fill="'+soft+'">'+esc(date)+'</text>');
 if(place)o.push('<text x="120" y="'+(870+title.length*62)+'" font-family="'+font+'" font-size="32" fill="'+soft+'">'+esc(place.slice(0,52))+'</text>');
 o.push('</svg>');return o.join('')}
// The registration page: hero, date/time/place, the reasons, the form with the consents. Static: no script, no
// action that sends anything until the person connects it to their sign-up system.
function landingHtml(m,brand){const P=PS(),pal=brand.palette,ev=m.event,t=m.texts,form=landingForm(ev,m),bg=pal.light,ink=P.ink(bg,pal,pal.dark),head=P.ink(bg,pal,pal.primary,pal.dark),onP=P.ink(pal.primary,pal,'#FFFFFF',pal.light,pal.dark);
 const f=s=>esc(fill(s,ev)),pts=block(t.core.points).split('\n').map(clean).filter(Boolean),font=esc((brand.fonts.body||'Helvetica')+', Helvetica, Arial, sans-serif'),hfont=esc((brand.fonts.heading||'Helvetica')+', Helvetica, Arial, sans-serif');
 const field=x=>x.type==='checkbox'?'<label class="ck"><input type="checkbox" name="'+x.name+'"'+(x.required?' required':'')+'> <span>'+esc(x.label)+(x.consent==='privacy'?' <a href="'+esc(form.privacyUrl||'#informativa')+'" target="_blank" rel="noopener">Leggi l’informativa</a>':'')+'</span></label>'
  :'<label>'+esc(x.label)+(x.required?' *':'')+'<input type="'+x.type+'" name="'+x.name+'" autocomplete="'+(x.name==='email'?'email':x.name==='nome'?'name':'organization')+'"'+(x.required?' required':'')+'></label>';
 return '<!doctype html>\n<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+f(t.landing.title)+'</title>\n'+
  '<meta name="description" content="'+f(t.landing.sub)+'">\n<style>*{box-sizing:border-box}body{margin:0;background:'+bg+';color:'+ink+';font:16px/1.6 '+font+'}main{max-width:720px;margin:0 auto;padding:40px 20px 64px}'+
  'h1{font:700 clamp(30px,6vw,46px)/1.15 '+hfont+';color:'+head+';margin:8px 0 12px}.brand{font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:13px}.sub{font-size:19px;margin:0 0 24px}'+
  '.when{display:grid;gap:4px;padding:16px 18px;border-left:4px solid '+pal.primary+';background:#FFFFFF;margin:0 0 24px}.when strong{color:'+head+'}ul{padding-left:20px}'+
  'form{display:grid;gap:14px;margin-top:28px;padding:22px;background:#FFFFFF;border-radius:14px}label{display:grid;gap:6px;font-weight:600}input[type=text],input[type=email]{font:inherit;padding:12px;border:1px solid #8A8F99;border-radius:8px;min-height:44px}'+
  '.ck{display:flex;gap:10px;align-items:flex-start;font-weight:400}.ck input{margin-top:5px;width:18px;height:18px}button{min-height:48px;border:0;border-radius:10px;background:'+pal.primary+';color:'+onP+';font:700 17px '+font+';cursor:pointer}'+
  'a{color:'+head+'}footer{margin-top:28px;font-size:13px}</style></head>\n<body><main>\n<p class="brand">'+esc(brand.name)+'</p>\n<h1>'+f(t.landing.title)+'</h1>\n<p class="sub">'+f(t.landing.sub)+'</p>\n'+
  '<div class="when"><strong>'+esc(dateText(ev))+'</strong><span>'+esc(timeText(ev))+'</span><span>'+esc(placeText(ev))+'</span></div>\n'+
  block(fill(t.landing.body,ev)).split(/\n\n+/).map(p=>'<p>'+esc(p).replace(/\n/g,'<br>')+'</p>').join('\n')+'\n'+(pts.length?'<ul>'+pts.map(p=>'<li>'+f(p)+'</li>').join('')+'</ul>\n':'')+
  '<!-- RADIX: collega questo modulo al tuo sistema di iscrizioni (CRM o servizio email) prima di pubblicare la pagina. -->\n'+
  '<form method="post" action="#iscrizione" id="iscrizione">\n'+form.fields.map(field).join('\n')+'\n<button type="submit">'+esc(t.core.cta||'Registrati')+'</button>\n</form>\n'+
  '<footer><p>'+esc(brand.name)+(form.privacyUrl?' · <a href="'+esc(form.privacyUrl)+'" target="_blank" rel="noopener">Informativa privacy</a>':'')+'</p></footer>\n</main></body></html>\n'}
function landingMd(m){const ev=m.event,t=m.texts,form=landingForm(ev,m);
 return ['# Landing di registrazione · '+fill(t.landing.title,ev),'','## Struttura','','1. Testata: nome del brand e titolo «'+fill(t.landing.title,ev)+'»','2. Sottotitolo: '+fill(t.landing.sub,ev),'3. Quando e dove: '+dateText(ev)+' · '+timeText(ev)+' · '+placeText(ev),'4. Testo e motivi per esserci','5. Modulo di iscrizione','6. Piè di pagina con il link all’informativa privacy','',
  '## Testo','',fill(t.landing.body,ev),'',block(t.core.points).split('\n').filter(Boolean).map(p=>'- '+fill(p,ev)).join('\n'),'','## Modulo','',
  ...form.fields.map(x=>'- '+(x.type==='checkbox'?'[ ] ':'')+x.label+(x.required?' (obbligatorio)':' (facoltativo)')+(x.type==='checkbox'?' · non spuntato':'')),'- Pulsante: '+(t.core.cta||'Registrati'),'',
  'Informativa privacy: '+(form.privacyUrl||'DA AGGIUNGERE prima di pubblicare'),'','Il modulo è una struttura: va collegato al tuo sistema di iscrizioni (CRM o servizio email). RADIX non raccoglie iscrizioni e non invia email.',''].join('\n')}
function icsText(m,now){const ev=m.event,sp=span(ev);if(!sp)return '';const dt=x=>isoOf(x).replace(/-/g,'')+'T'+hmOf(x).replace(':','')+'00',e=s=>String(s||'').replace(/\\/g,'\\\\').replace(/[,;]/g,c=>'\\'+c).replace(/\n/g,'\\n');
 const stamp=new Date(now||Date.now()).toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z'),fold=l=>{const out=[];let s=l;while(s.length>74){out.push(s.slice(0,74));s=' '+s.slice(74)}out.push(s);return out.join('\r\n')};
 // Multi-day fairs: one entry per day with the daily hours would be noisy; one span from the first opening to the last closing.
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//RADIX//Kit evento//IT','CALSCALE:GREGORIAN','BEGIN:VTIMEZONE','TZID:Europe/Rome','BEGIN:STANDARD','DTSTART:19701025T030000','RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU','TZOFFSETFROM:+0200','TZOFFSETTO:+0100','TZNAME:CET','END:STANDARD',
  'BEGIN:DAYLIGHT','DTSTART:19700329T020000','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU','TZOFFSETFROM:+0100','TZOFFSETTO:+0200','TZNAME:CEST','END:DAYLIGHT','END:VTIMEZONE','BEGIN:VEVENT',
  'UID:evento-'+slug(m.texts.core.title)+'-'+ev.date+'@radix','DTSTAMP:'+stamp,'DTSTART;TZID=Europe/Rome:'+dt(sp.start),'DTEND;TZID=Europe/Rome:'+dt(sp.end),
  fold('SUMMARY:'+e(m.texts.core.title)),fold('LOCATION:'+e(isWebinar(m.type)?(ev.link||placeText(ev)):placeText(ev))),fold('DESCRIPTION:'+e(fill(m.texts.core.claim,ev)+'\n'+dateText(ev)+' · '+timeText(ev))),...(ev.regUrl?[fold('URL:'+ev.regUrl)]:[]),'END:VEVENT','END:VCALENDAR',''].join('\r\n')}
function postsText(m){const ev=m.event,t=m.texts.posts,f=s=>fill(s,ev),sch=schedule(ev,m.after,m),w=id=>{const x=sch.find(s=>s.id===id);return x&&x.at?' ('+whenText(x.at)+')':''};
 return ['POST · '+fill(m.texts.core.title,ev),'','ANNUNCIO'+w('invito'),f(t.annuncio),'',...COUNTDOWN.map(n=>'COUNTDOWN −'+n+w('countdown-'+n)+'\n'+fill(t.countdown,ev,{giorni:n})+'\nImmagine: countdown-'+n+'.png\n'),'DAL VIVO'+w('live'),f(t.live),'','GRAZIE (dopo l’evento)',f(t.grazie),''].join('\n')}
// The CRM hand-off: text and link only, nothing is sent from here.
function crmHandoff(m,crmUrl){const ev=m.event,seq=incontro(),sp=span(ev),f=m.after||{},t=m.texts;
 return ['FOLLOW-UP NEL CRM · '+fill(t.core.title,ev),'','1. Importa nel CRM i contatti raccolti (iscritti alla landing e contatti allo stand), con il consenso che hanno dato.','2. Avvia la sequenza «'+seq.name+'» '+(sp?'alla fine dell’evento ('+whenText(isoOf(sp.end)+'T'+hmOf(sp.end))+')':'alla fine dell’evento')+': '+seq.steps.map(s=>s.title+' (giorno '+s.day+')').join(', ')+'.',
  '3. Follow-up previsto: '+whenText(f.followup)+' (entro '+FOLLOW_UP_HOURS+' ore dalla fine).','4. Ringraziamento: '+whenText(f.grazie)+'.','','EMAIL DI FOLLOW-UP','Oggetto: '+fill(t.followup.subject,ev),'',fill(t.followup.body,ev),'',
  'Apri il CRM: '+(crmUrl||'/radix-sales.html#contacts'),'Ogni email nel CRM parte solo dopo la tua conferma. RADIX qui non invia nulla.',''].join('\n')}
function planMd(m,brand){const ev=m.event,checks=checksOf(m),sch=schedule(ev,m.after,m),L=[];
 L.push('# Kit '+(isWebinar(m.type)?'webinar':type(m.type)[1].toLowerCase())+' · '+fill(m.texts.core.title,ev),'','Brand: '+brand.name+' · Direzione: '+m.direction.name+' ('+variant(m).label+') · Obiettivo: '+goal(m.goal)[1],'',
  '## Quando e dove','','- Data: '+dateText(ev),'- Orario: '+timeText(ev),'- Luogo: '+placeText(ev)+(isWebinar(m.type)?'\n- Link per entrare: '+(ev.link||'DA AGGIUNGERE'):''),'- Pagina di iscrizione: '+(ev.regUrl||'DA AGGIUNGERE'),...(m.type==='fiera'?['- Stand: '+standText(m)+' · roll-up consigliati: '+rollups(m)]:[]),'');
 for(const [ph,label] of PHASES){const items=sch.filter(s=>s.phase===ph);L.push('## '+label,'',...items.map(s=>'- '+(s.at?whenText(s.at):'Automatico')+' · '+s.label+' · '+s.channel),'')}
 L.push('## Controlli','',...checks.map(c=>'- '+(c.ok?(c.warn?'[!] ':'[ok] '):'[da sistemare] ')+c.label+(c.issues.length?'\n'+c.issues.map(i=>'  - '+i).join('\n'):'')),'');
 L.push('## Note','','- I file per la tipografia sono PDF/X-1a in CMYK FOGRA39: la tipografia fa comunque il suo preflight.','- Nessuna email parte da RADIX: le email si inviano dal CRM o dal tuo programma, con la tua conferma.','- Se aggiungi immagini generate con l’AI che sembrano reali, segnalalo dove la piattaforma lo chiede.',
  ...(isWebinar(m.type)?['- Le clip dal webinar si preparano dopo, dalla registrazione, con lo Studio Reel.']:[]),'');
 return L.join('\n')}
const mailDoc=(m,brand,k,cta)=>{const N=NL(),ev=m.event,t=m.texts[k],src={subject:fill(t.subject,ev),preheader:fill(t.preheader||'',ev),body:fill(t.body,ev),cta:cta||''},tid=variant(m).mail,nb=N.brandOf({name:brand.name},{identityKit:brand.kit||null},brand.name);
 const url=k==='invito'?ev.regUrl:/^promemoria|^conferma/.test(k)?ev.link:'';let blocks=N.blocksFor(tid,src,{goal:'evento',ctaLabel:cta||'',ctaUrl:url},{name:brand.name,address:brand.address||''});
 // no link, no button: the text carries the link (or its «[link …]» reminder)
 if(!cta||!url)blocks=blocks.filter(b=>b.type!=='button');
 return {...src,template:tid,brand:nb,blocks,logo:null}};
const MAILS=t=>['invito'].concat(isWebinar(t)?['conferma','promemoria_giorno','promemoria_ora']:[]).concat(['grazie','followup']);
const MAIL_LABEL={invito:'di invito',conferma:'di conferma iscrizione',promemoria_giorno:'promemoria −1 giorno',promemoria_ora:'promemoria −1 ora',grazie:'di ringraziamento',followup:'di follow-up'};
const MAIL_FILE={invito:'email-invito',conferma:'email-conferma-iscrizione',promemoria_giorno:'email-promemoria-1-giorno',promemoria_ora:'email-promemoria-1-ora',grazie:'email-grazie',followup:'email-follow-up'};
// Every file of the kit. opts: {profile, projectName, date, prepare(doc,{pdfx}) (browser images), glyphs() (browser), png(svg) (browser), crmUrl}.
async function kitFiles(m,opts={}){const P=PS(),D=DS(),N=NL(),brand={...brandFor(opts),address:(P.prefill(opts.profile,{projectName:opts.projectName})||{}).address||''},ev=m.event,v=variant(m),out=[],date=opts.date||new Date();
 brand.kit=opts.profile&&opts.profile.identityKit||null;
 const add=(phase,name,data,label)=>out.push({phase,name,data,label});
 const pre=P.prefill(opts.profile,{projectName:opts.projectName}),contacts={phone:pre.phone,email:pre.email,website:pre.website,address:pre.address};
 const print=async(id,values,o={})=>{const d=P.layout(id,{...contacts,name:brand.name,...values},brand,{variant:v.print});if(opts.prepare)await opts.prepare(d,{pdfx:!o.web});
  if(o.web)return P.pdf(d,{mode:'web',date,title:o.title||d.title,producer:'RADIX Kit evento'});if(opts.glyphs)await opts.glyphs();const b=P.pdf(d,{mode:'print',pdfx:true,date,title:(o.title||d.title)+' · tipografia',producer:'RADIX Kit evento'}),probs=P.checkPdf(b);if(probs.length)throw Error(probs.join(' '));return b};
 const c=m.texts.core,f=s=>fill(s,ev);
 // Prima
 for(const k of MAILS(m.type).filter(k=>!/grazie|followup/.test(k))){const d=mailDoc(m,brand,k,k==='invito'?c.cta:/promemoria|conferma/.test(k)&&ev.link?'Entra nel webinar':'');add('prima',MAIL_FILE[k]+'.html',N.buildHtml(d),'Email '+MAIL_LABEL[k]);add('prima',MAIL_FILE[k]+'.txt',N.toText(d),'Email '+MAIL_LABEL[k]+' (testo)')}
 if(physical(m.type))add('prima','invito-a5.pdf',await print('flyer',{payoff:f(c.claim),headline:f(c.title),body:[dateText(ev),timeText(ev),placeText(ev),'',block(f(c.points))].join('\n'),cta:c.cta+(ev.regUrl?': '+ev.regUrl.replace(/^https:\/\//,''):'')},{web:true,title:'Invito · '+f(c.title)}),'Invito PDF A5');
 add('prima','landing-registrazione.html',landingHtml(m,brand),'Landing di registrazione');add('prima','landing-struttura.md',landingMd(m),'Landing: struttura e testi');
 add('prima','post-social.txt',postsText(m),'Post e countdown');
 for(const n of COUNTDOWN){const svg=countdownSvg(m,n,brand);add('prima','countdown-'+n+'.svg',svg,'Countdown −'+n+' (SVG)');if(opts.png){try{add('prima','countdown-'+n+'.png',await opts.png(svg),'Countdown −'+n+' (PNG)')}catch(e){}}}
 add('prima','evento.ics',icsText(m,date),'Evento per il calendario');
 // Durante
 if(physical(m.type)){
  add('durante','rollup-85x200.pdf',await print('rollup',{payoff:f(m.texts.rollup.sub),headline:f(m.texts.rollup.title),body:'',cta:ev.hall?f(ev.hall):''}),'Roll-up 85 × 200 cm (tipografia)');
  add('durante','flyer-a5.pdf',await print('flyer',{payoff:f(c.claim),headline:f(m.texts.flyer.title),body:f(m.texts.flyer.body),cta:f(m.texts.flyer.cta)}),'Flyer A5 (tipografia)');
  add('durante','badge-85x55.pdf',await print('biglietto',{payoff:f(c.title),person:'Nome Cognome',role:clean(m.texts.badge&&m.texts.badge.role)||'Staff'}),'Badge dello staff (tipografia)')}
 const model=D.modelFrom('presentazione',f(m.texts.slides),{name:brand.name,contacts}),doc=D.render(model,brand,{style:v.slides});
 add('durante','slide.pptx',D.pptxDeck(doc.deck,brand,{},{date}),'Slide (PowerPoint)');if(opts.prepare)await opts.prepare(doc,{pdfx:false});add('durante','slide.pdf',D.pdfWeb(doc,{date}),'Slide (PDF)');
 // Dopo
 for(const k of ['grazie','followup']){const d=mailDoc(m,brand,k,'');add('dopo',MAIL_FILE[k]+'.html',N.buildHtml(d),'Email '+MAIL_LABEL[k]);add('dopo',MAIL_FILE[k]+'.txt',N.toText(d),'Email '+MAIL_LABEL[k]+' (testo)')}
 add('dopo','follow-up-crm.txt',crmHandoff(m,opts.crmUrl),'Passaggio al CRM «Dopo l’incontro»');
 add('dopo','piano-evento.md',planMd(m,brand),'Piano, calendario e controlli');
 return out}
function bundle(files,{date}={}){return ZIP().zip(files.map(f=>({name:({prima:'1-prima/',durante:'2-durante/',dopo:'3-dopo/'}[f.phase]||'')+f.name,data:f.data})),{date:date||new Date()})}
const zipName=m=>'kit-'+(isWebinar(m.type)?'webinar':m.type)+'-'+(slug(m.texts.core.title)||'evento')+'-'+(m.event.date||'')+'.zip';

// ---- saved in the project: the «agents» document, key events ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(doc){const s=doc&&doc.events;return s&&typeof s==='object'&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>x&&typeof x==='object')}:emptyStore()}
function savedRecord(m,{by,at,input}={}){const when=at||new Date().toISOString();
 return {id:'evento-'+when.replace(/\D/g,'').slice(0,14)+'-'+(slug(m.texts.core.title)||'kit').slice(0,24),at:when,by:clean(by).slice(0,80),type:m.type,goal:m.goal,stand:m.stand,standCustom:m.standCustom||'',
  event:{...m.event},direction:{...m.direction},texts:JSON.parse(JSON.stringify(m.texts)),after:{...m.after},input:String(input||m.input||'').slice(0,FACTS_MAX),
  schedule:schedule(m.event,m.after,m).map(s=>({id:s.id,phase:s.phase,label:s.label,at:s.at})),checks:checksOf(m).map(c=>({id:c.id,ok:c.ok,issues:c.issues.slice(0,10)}))}}
function addRecord(store,rec){const s=readStore({events:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const doc=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await doc.load())||{},next=addRecord(readStore(cur),rec);
  try{await doc.save({...cur,schemaVersion:1,conversations:cur.conversations||{},events:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
// A saved kit back as the model, without a new AI call.
function fromRecord(r){const ev=eventOf({type:r.type},r.event||{});return {type:normalize(r).type,goal:normalize(r).goal,stand:normalize(r).stand,standCustom:clean(r.standCustom),event:ev,direction:{...(r.direction||{id:'k1',angle:'razionale',name:'Kit salvato'})},texts:JSON.parse(JSON.stringify(r.texts||{})),after:r.after&&r.after.grazie?{...r.after}:afterDefaults(ev),input:String(r.input||'')}}

// ---- the one AI call ----
// The whole paid step: the prompt (refused before anything is asked when the answers are not enough), the RADIX
// confirmation and, only on a yes, exactly one rt.reply. Returns {directions} or {cancelled:true}; throws on errors.
async function requestDirections({answers,values,rt,project,memoryScope,confirm,onStart}={}){const prompt=directionsPrompt(answers,values);
 if(!rt||typeof rt.reply!=='function')throw Error('Gli agenti non si sono caricati: ricarica la pagina.');
 const ask=confirm||askConfirm,ev=eventOf(answers,values&&values.event);
 const ok=await ask({title:'Preparare 3 direzioni del kit con lo Stratega di Marca AI?',cost:'È una sola chiamata AI: usa crediti API.',facts:[['Evento',type(normalize(answers).type)[1]+(ev.name?' · '+ev.name:'')],['Quando',dateText(ev)+' · '+timeText(ev)],['Dove',placeText(ev)]],message:'Poi i file del kit (PDF, email, landing, slide, post) si creano qui, senza altre chiamate e senza costi.',ok:'Prepara le 3 direzioni'});
 if(!ok)return {cancelled:true};if(onStart)onStart();
 const r=await rt.reply({role:AGENT,project,memoryScope,messages:[{role:'user',content:prompt}]});
 const directions=parseDirections(r&&r.text,{answers,input:inputText(values)});if(!directions.length)throw Error('la risposta non contiene direzioni leggibili. Riprova.');
 return {directions}}

// ---- the widget (browser) ----
let counter=0;
const doc=()=>root.document;
const E=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
const svgImg=(svg,alt)=>{const i=E('img');i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);i.alt=alt||'';i.loading='lazy';return i};
const MIME={pdf:'application/pdf',html:'text/html;charset=utf-8',txt:'text/plain;charset=utf-8',md:'text/markdown;charset=utf-8',svg:'image/svg+xml',png:'image/png',ics:'text/calendar;charset=utf-8',zip:'application/zip',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
function save(name,data){const P=PS();return P.download(name,data,MIME[name.split('.').pop()]||'application/octet-stream')}
function svgToPng(svg){return new Promise((res,rej)=>{const img=new root.Image();img.onload=()=>{try{const c=E('canvas');c.width=1080;c.height=1080;c.getContext('2d').drawImage(img,0,0,1080,1080);
 c.toBlob(b=>b?b.arrayBuffer().then(x=>res(new Uint8Array(x)),rej):rej(Error('PNG non creato')),'image/png')}catch(e){rej(e)}};img.onerror=()=>rej(Error('Immagine non leggibile'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)})}
// ctx: {project (profileFor summary), profile (raw profile with identityKit), projectName, memoryScope, projectId, workspace, agentsUrl, crmUrl, by}
function eventStudio(ctx={}){const n=++counter,project=ctx.project||{},P=PS(),brand=brandFor(ctx),wrap=E('div',undefined,'tool photo-studio ad-studio event-studio');
 const answers=normalize({type:'fiera'}),st={dirs:[],model:null,files:[],values:null,busy:false};
 const steps=E('ol',undefined,'ps-steps');['Le domande','Scegli la direzione','Rifinisci','Il kit'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 // the style guide in use
 const bx=E('div',undefined,'ad-brand');bx.dataset.source=brand.fromKit?'kit':'default';const sw=E('span',undefined,'ad-swatches');
 ['primary','secondary','accent','dark','light'].forEach(k=>{const i=E('i');i.style.background=brand.palette[k];i.title=k+' '+brand.palette[k];sw.append(i)});
 const bt=E('span',undefined,'ad-brand-text');bt.append(E('strong',brand.name||'Il tuo brand'),E('span',brand.fromKit?'Dal Kit identità'+(brand.direction?' «'+brand.direction+'»':''):'Colori neutri: crea il Kit identità per usare i tuoi'));bx.append(sw,bt);
 const form=E('div',undefined,'ps-form'),qs=E('div',undefined,'ps-questions ad-questions ev-questions');
 const tiles=(id,label,opts)=>{const fs=E('fieldset',undefined,'ad-wide');fs.append(E('legend',label));opts.forEach(([v,text,sub])=>{const l=E('label',undefined,'ps-chip ad-tile'),r=E('input');r.type='radio';r.name='ev-'+id+'-'+n;r.value=v;r.checked=answers[id]===v;
   const t=E('span',undefined,'ad-tile-text');t.append(E('strong',text));if(sub)t.append(E('small',sub));l.append(r,t);fs.append(l)});return fs};
 const typeFs=tiles('type','Che evento è?',TYPES.map(t=>[t[0],t[1],t[2]])),goalFs=tiles('goal','Obiettivo',GOALS.map(g=>[g[0],g[1],g[2].replace(/^./,c=>c.toUpperCase())]));
 const standFs=E('fieldset',undefined,'ad-wide ev-stand');standFs.append(E('legend','Stand: misure'));STANDS.forEach(([v,t])=>{const l=E('label',undefined,'ps-chip'),r=E('input');r.type='radio';r.name='ev-stand-'+n;r.value=v;r.checked=answers.stand===v;l.append(r,doc().createTextNode(t));standFs.append(l)});
 const standCustom=E('input');standCustom.type='text';standCustom.maxLength=30;standCustom.placeholder='Es. 8 × 4 m';standCustom.className='ev-stand-custom';standCustom.hidden=true;standCustom.setAttribute('aria-label','Altra misura dello stand');standFs.append(standCustom);
 const fields=E('div',undefined,'ev-fields'),inputs={};
 const field=(key,label,typ,ph,cls)=>{const l=E('label',undefined,'ev-field'+(cls?' '+cls:''));l.dataset.key=key;const s=E('span',label),i=E('input');i.type=typ;if(ph)i.placeholder=ph;i.name='ev-'+key;l.append(s,i);inputs[key]=i;fields.append(l);return l};
 field('name','Nome dell’evento (facoltativo)','text','Es. Open day d’autunno','ev-wide');
 field('date','Data *','date');const endL=field('dateEnd','Ultimo giorno (se dura più giorni)','date');field('start','Inizio *','time');field('end','Fine','time');
 const venueL=field('venue','Luogo *','text','Es. Fiera Milano Rho'),addrL=field('address','Indirizzo','text','Es. Strada Statale 33, Rho (MI)'),hallL=field('hall','Padiglione e stand','text','Es. Padiglione 3, stand B12');
 const platL=field('platform','Piattaforma','text','Es. Zoom, Teams, Meet'),linkL=field('link','Link per entrare nel webinar','url','https://…','ev-wide');
 field('regUrl','Link della pagina di iscrizione (dove pubblicherai la landing)','url','https://…','ev-wide');field('privacyUrl','Link all’informativa privacy','url','https://…/privacy','ev-wide');
 const factsL=E('label',undefined,'ev-field ev-wide'),facts=E('textarea');facts.rows=3;facts.maxLength=FACTS_MAX;facts.placeholder='Es. Presentiamo la nuova linea di forni a legna; dimostrazioni ogni ora; preventivi in fiera. Solo fatti veri: il resto lo segnalo.';
 factsL.append(E('span','Cosa presentate o cosa succede *'),facts);fields.append(factsL);
 const hint=E('p','Data, orario e luogo li scrivi una volta qui: RADIX li mette uguali in tutti i materiali e controlla che nessuno sia diverso.','ad-note ev-hint');
 qs.append(typeFs,goalFs,standFs);form.append(bx,qs,fields,hint);
 const go=button('Prepara 3 direzioni del kit','primary'),cost=E('span','Una chiamata AI allo Stratega di Marca: ti chiedo conferma prima. I file poi si creano qui, senza costi.','muted'),bar=E('div',undefined,'ps-actions');bar.append(go,cost);form.append(bar);
 const status=E('p','','tool-status');status.setAttribute('role','status');
 const saved=E('div',undefined,'ad-saved ev-saved');saved.hidden=true;
 const grid=E('div',undefined,'ad-dirs ev-dirs'),result=E('div',undefined,'ad-result ev-result'),kit=E('div',undefined,'ev-kit');grid.hidden=result.hidden=kit.hidden=true;
 wrap.append(steps,form,saved,status,grid,result,kit);setStep(1);
 function shape(){const t=answers.type,web=isWebinar(t);endL.hidden=!multiDay(t);standFs.hidden=t!=='fiera';standCustom.hidden=answers.stand!=='altro'||t!=='fiera';
  venueL.hidden=addrL.hidden=web;hallL.hidden=t!=='fiera';platL.hidden=linkL.hidden=!web;venueL.querySelector('span').textContent=web?'Luogo':'Luogo *'}
 shape();
 wrap.addEventListener('change',e=>{const t=e.target;if(!t||!t.name||!t.name.startsWith('ev-'))return;const m=/^ev-(type|goal|stand)-\d+$/.exec(t.name);if(!m)return;answers[m[1]]=t.value;shape()});
 standCustom.oninput=()=>{answers.standCustom=clean(standCustom.value)};
 const eventValues=()=>{const o={};for(const k of Object.keys(inputs))o[k]=inputs[k].value;return o};
 async function loadSaved(){if(!ctx.workspace||!ctx.projectId)return;try{const s=readStore(await ctx.workspace.bind(ctx.projectId,'agents').load());if(!s.items.length)return;
  saved.replaceChildren(E('h4','Kit evento salvati nel progetto'));const row=E('div',undefined,'ad-saved-row');
  s.items.slice(-4).reverse().forEach(r=>{const b=button(clean(r.texts&&r.texts.core&&r.texts.core.title||'Kit')+' · '+(r.event&&r.event.date?shortDate(r.event.date):''),'ad-saved-item');b.onclick=()=>{st.dirs=[];grid.hidden=true;st.model=fromRecord(r);renderResult();status.textContent='Riaperto il kit salvato: nessuna nuova chiamata AI.'};row.append(b)});
  saved.append(row);saved.hidden=false}catch(e){}}
 loadSaved();
 const lock=on=>{st.busy=on;go.disabled=on;form.querySelectorAll('input,textarea').forEach(x=>x.disabled=on)};
 go.onclick=async()=>{if(st.busy)return;const values={facts:facts.value,event:eventValues(),project,projectFacts:factsText(project,ctx.profile)};
  const a=normalize(answers);values.eventText=(()=>{const ev=eventOf(a,values.event);return [dateText(ev),timeText(ev),placeText(ev),ev.name,a.standCustom].join('\n')})();
  try{directionsPrompt(a,values)}catch(e){status.textContent=e.message;return}
  lock(true);
  try{const r=await requestDirections({answers:a,values,rt:root.RadixAgents,project,memoryScope:ctx.memoryScope,onStart:()=>{setStep(2);status.textContent='Lo Stratega di Marca prepara le 3 direzioni del kit…';grid.hidden=false;grid.replaceChildren(...[0,1,2].map(()=>E('div',undefined,'ad-dir ad-skeleton')));result.hidden=kit.hidden=true}});
   if(r.cancelled){status.textContent='Nessuna chiamata fatta.';return}
   st.values=values;st.answers=a;st.dirs=r.directions;st.model=null;renderDirs();go.textContent='Prepara altre 3 direzioni';
   status.textContent=(r.directions.length<COUNT?'Sono arrivate '+r.directions.length+' direzioni su '+COUNT+'. ':'')+'Confrontale e scegli quella da rifinire.'}
  catch(e){status.textContent='Direzioni non preparate: '+e.message;setStep(1);grid.hidden=!st.dirs.length;if(st.dirs.length)renderDirs()}
  finally{lock(false)}};
 function preview(m){const fig=E('div',undefined,'ev-preview');fig.append(svgImg(countdownSvg(m,7,brand),'Countdown: mancano 7 giorni'));
  if(physical(m.type)){try{const d=P.layout('flyer',{name:brand.name,payoff:fill(m.texts.core.claim,m.event),headline:fill(m.texts.core.title,m.event),body:[dateText(m.event),timeText(m.event),placeText(m.event)].join('\n'),cta:m.texts.core.cta},brand,{variant:variant(m).print});
   fig.append(svgImg(P.previewSvg(d,0,{guides:false}),'Invito A5'))}catch(e){}}
  return fig}
 function renderDirs(){setStep(st.model?3:2);
  grid.replaceChildren(...st.dirs.map((d,i)=>{const m=modelOf(d,st.answers,st.values.event),card=E('article',undefined,'ad-dir ev-dir');card.dataset.chosen=String(!!st.model&&st.model.direction.id===d.id);
   const head=E('div',undefined,'ad-dir-head');head.append(E('span',(ANGLES.find(x=>x.id===d.angle)||ANGLES[i]).label,'ad-angle'),E('h3',d.name));if(d.idea)head.append(E('p',d.idea,'ad-idea'));
   const dl=E('dl',undefined,'ev-dl');[['Titolo',m.texts.core.title],['Claim',m.texts.core.claim],['Oggetto dell’invito',fill(m.texts.invito.subject,m.event)],['Post di annuncio',fill(m.texts.posts.annuncio,m.event)]].forEach(([k,v])=>{if(!v)return;const r=E('div');r.append(E('dt',k),E('dd',v));dl.append(r)});
   card.append(head,preview(m),dl,E('p',materialsFor(m.type).length+' materiali · '+(physical(m.type)?'PDF per la tipografia, ':'')+'email, landing, slide e post','ad-meta'));
   if(d.issues.length){const ul=E('ul',undefined,'ad-issues');d.issues.slice(0,4).forEach(x=>ul.append(E('li',issueText(x))));card.append(ul)}
   const pickB=button(st.model&&st.model.direction.id===d.id?'Direzione scelta':'Scegli questa direzione','primary');pickB.onclick=()=>{st.model=modelOf(d,st.answers,st.values.event);st.model.input=inputText(st.values);renderDirs();renderResult();result.scrollIntoView({behavior:'smooth',block:'start'})};card.append(pickB);return card}))}
 let timer=0;const later=()=>{clearTimeout(timer);timer=setTimeout(renderChecks,250)};
 const checksBox=E('div',undefined,'ev-checks'),timeline=E('div',undefined,'ev-timeline');
 function renderChecks(){const m=st.model;if(!m)return;const cs=checksOf(m);
  checksBox.replaceChildren(E('h4','Controlli automatici'),...cs.map(c=>{const row=E('div',undefined,'ev-check');row.dataset.state=c.ok?(c.warn?'warn':'ok'):'fail';
   row.append(E('span',c.ok?(c.warn?'Da completare':'OK'):'Da sistemare','ev-check-badge'),E('strong',c.label));if(c.issues.length){const ul=E('ul');c.issues.slice(0,6).forEach(i=>ul.append(E('li',i)));row.append(ul)}return row}));
  const sch=schedule(m.event,m.after,m);timeline.replaceChildren(E('h4','Calendario del kit'),...PHASES.map(([ph,label])=>{const col=E('section',undefined,'ev-phase');col.dataset.phase=ph;col.append(E('h5',label));
   const ol=E('ol');sch.filter(s=>s.phase===ph).forEach(s=>{const li=E('li');li.append(E('time',s.at?whenText(s.at):'Automatico'),E('span',s.label));ol.append(li)});col.append(ol);return col}));
  kit.hidden=true}
 function renderResult(){const m=st.model;if(!m)return;setStep(3);result.hidden=false;const ev=m.event;
  const head=E('div',undefined,'ad-result-head'),hd=E('div');hd.append(E('span',variant(m).label+' · '+m.direction.name,'ad-angle'),E('h3',fill(m.texts.core.title,ev)),E('p','Rifinisci i testi: {data}, {ora}, {luogo}, {link} e {accesso} si riempiono da soli con i dati qui sotto, uguali in tutti i materiali.','ad-idea'));head.append(hd);
  // the event data, in one place
  const tools=E('div',undefined,'ad-tools ev-data');const evIn=(key,label,typ)=>{const l=E('label',undefined,'ad-tool ev-tool'),i=E('input');i.type=typ;i.value=ev[key]||'';l.append(E('span',label,'ad-tool-label'),i);
   i.oninput=()=>{const v={...m.event,[key]:i.value};const next=eventOf(m,v);if(key==='date'||key==='start'||key==='end'||key==='dateEnd'){const before=afterDefaults(m.event);if(m.after.grazie===before.grazie&&m.after.followup===before.followup)m.after=afterDefaults(next)}m.event=next;h3.textContent=fill(m.texts.core.title,m.event);later()};tools.append(l);return i};
  evIn('date','Data','date');if(multiDay(m.type))evIn('dateEnd','Ultimo giorno','date');evIn('start','Inizio','time');evIn('end','Fine','time');
  if(isWebinar(m.type))evIn('link','Link per entrare','url');else{evIn('venue','Luogo','text');evIn('address','Indirizzo','text');if(m.type==='fiera')evIn('hall','Padiglione e stand','text')}
  evIn('regUrl','Pagina di iscrizione','url');evIn('privacyUrl','Informativa privacy','url');
  const h3=hd.querySelector('h3');
  // the «Dopo» times
  const after=E('div',undefined,'ad-tools ev-after');[['grazie','Ringraziamento'],['followup','Follow-up dei contatti']].forEach(([k,l])=>{const lab=E('label',undefined,'ad-tool ev-tool'),i=E('input');i.type='datetime-local';i.value=m.after[k]||'';lab.append(E('span',l,'ad-tool-label'),i);i.oninput=()=>{m.after[k]=i.value;later()};after.append(lab)});
  // the materials
  const mats=E('div',undefined,'ev-materials');
  for(const [ph,label] of PHASES){const sec=E('section',undefined,'ev-mat-phase');sec.append(E('h4',label));
   materialsFor(m.type).filter(x=>x[0]===ph).forEach(([,id,lbl,flds])=>{const det=E('details',undefined,'ev-mat');det.dataset.id=id;const sum=E('summary',lbl);det.append(sum);
    if(!flds.length)det.append(E('p',id==='invitopdf'?'Si compone da «Titolo e messaggio» e dai dati dell’evento.':'','ad-meta'));
    flds.forEach(([path,fl,rows,max])=>{const l=E('label',undefined,'ev-field'),x=rows>1?E('textarea'):E('input');if(rows>1)x.rows=rows;else x.type='text';x.maxLength=max;x.value=getPath(m.texts,path)||'';l.append(E('span',fl),x);
     x.oninput=()=>{setPath(m.texts,path,x.value);if(path==='core.title')h3.textContent=fill(x.value,m.event);later()};det.append(l)});
    sec.append(det)});mats.append(sec)}
  const make=button('Crea i file del kit','primary'),saveB=button('Salva nel progetto'),acts=E('div',undefined,'ps-actions ev-actions'),rStatus=E('p','','tool-status');rStatus.setAttribute('role','status');
  acts.append(make,saveB,E('span','Nessuna chiamata AI: i file si creano qui, senza costi.','muted'));
  make.onclick=async()=>{make.disabled=true;rStatus.textContent='Creo i file del kit…';
   try{const PSL=P;st.files=await kitFiles(m,{profile:ctx.profile,projectName:ctx.projectName,crmUrl:ctx.crmUrl,prepare:(d,o)=>PSL.prepareImages(d,o),glyphs:()=>PSL.loadGlyphs(),png:svgToPng});renderKit();rStatus.textContent='Pronti '+st.files.length+' file.';kit.scrollIntoView({behavior:'smooth',block:'start'})}
   catch(e){rStatus.textContent='File non creati: '+e.message}finally{make.disabled=false}};
  saveB.onclick=async()=>{if(!ctx.workspace||!ctx.projectId){rStatus.textContent='Apri un progetto per salvare il kit.';return}saveB.disabled=true;
   try{await saveToProject(ctx.workspace,ctx.projectId,savedRecord(m,{by:ctx.by}));rStatus.textContent='Kit salvato nel progetto: lo riapri da qui, senza una nuova chiamata AI.';loadSaved()}catch(e){rStatus.textContent='Salvataggio non riuscito: '+e.message}finally{saveB.disabled=false}};
  result.replaceChildren(head,tools,checksBox,timeline,E('h4','Date di invio dopo l’evento'),after,mats,acts,rStatus);renderChecks()}
 function renderKit(){const m=st.model;setStep(4);kit.hidden=false;
  const top=E('div',undefined,'ev-kit-head');top.append(E('h3','Il kit è pronto'),E('p',st.files.length+' file in 3 cartelle: prima, durante e dopo l’evento.','ad-idea'));
  const zipB=button('Scarica tutto (.zip)','primary');zipB.onclick=()=>save(zipName(m),bundle(st.files));
  const cols=E('div',undefined,'ev-files');
  for(const [ph,label] of PHASES){const sec=E('section',undefined,'ev-phase');sec.dataset.phase=ph;sec.append(E('h5',label));const ul=E('ul');
   st.files.filter(f=>f.phase===ph).forEach(f=>{const li=E('li'),b=button('Scarica','ev-dl-btn');b.setAttribute('aria-label','Scarica '+f.name);b.onclick=()=>save(f.name,f.data);const t=E('span',undefined,'ev-file');t.append(E('strong',f.label),E('small',f.name));li.append(t,b);ul.append(li)});sec.append(ul);cols.append(sec)}
  const crm=E('div',undefined,'ev-crm'),txt=crmHandoff(m,ctx.crmUrl),copy=button('Copia il testo del follow-up'),open=E('a','Apri il CRM','ev-link');open.href=ctx.crmUrl||'/radix-sales.html#contacts';
  copy.onclick=async()=>{try{await root.navigator.clipboard.writeText(txt);copy.textContent='Copiato'}catch(e){copy.textContent='Copia non riuscita: scarica follow-up-crm.txt'}};
  crm.append(E('h4','Dopo l’evento: il CRM'),E('p','Avvia la sequenza «'+incontro().name+'» con i contatti raccolti: il follow-up è previsto '+whenText(m.after.followup)+'. Da qui non parte nessuna email.','ad-meta'),(()=>{const r=E('div',undefined,'ad-imgbtns');r.append(copy,open);return r})());
  const acts=E('div',undefined,'ps-actions');acts.append(zipB);
  kit.replaceChildren(top,acts,cols,crm)}
 return wrap}

return Object.freeze({INCONTRO_FALLBACK,AGENT,COUNT,TYPES,GOALS,STANDS,ANGLES,COUNTDOWN,FOLLOW_UP_HOURS,MATERIALS,PHASES,normalize,physical,isWebinar,parseDay,longDate,eventOf,eventProblems,days,span,dateText,timeText,placeText,fill,
 mentions,consistency,landingForm,consentIssues,consentInHtml,incontro,crmFirstEmail,afterDefaults,followUpIssues,schedule,factsText,inputText,directionsPrompt,parseDirections,issueText,
 modelOf,materialsFor,materialTexts,checksOf,rollups,countdownSvg,landingHtml,landingMd,icsText,postsText,crmHandoff,planMd,kitFiles,bundle,zipName,
 readStore,savedRecord,addRecord,saveToProject,fromRecord,requestDirections,eventStudio});
});
