'use strict';
/* Server-side reading of a secret iCal link («Calendari esterni», migration sales 018), with SSRF protections:
   - only https on port 443, no user:password in the link, only the hosts where Outlook / Microsoft 365 and Google publish
     calendars (outlook.office365.com, outlook.office.com, outlook.live.com: /owa/calendar/…/*.ics; calendar.google.com and
     www.google.com: /calendar/ical/…/*.ics); webcal:// links are read as https://;
   - the address is resolved by our own lookup, which refuses loopback, private, link-local, CGNAT, multicast, reserved and
     documentation ranges (IPv4 and IPv6, IPv4-mapped included) — the connection uses exactly the checked address;
   - redirects are followed by hand, at most 3, and only to links that pass the same checks;
   - 10 seconds in all, at most 3 MB (also after decompression), the answer must be an iCalendar.
   The link is a secret: it never appears in errors or logs (messages name only the host). */
const https=require('node:https'),dns=require('node:dns'),net=require('node:net'),zlib=require('node:zlib');
const HOSTS=Object.freeze({'outlook.office365.com':'outlook','outlook.office.com':'outlook','outlook.live.com':'outlook','calendar.google.com':'google','www.google.com':'google'});
const PATHS=Object.freeze({outlook:/^\/owa\/calendar\/[^?#]+\.ics$/i,google:/^\/calendar\/ical\/[^?#]+\.ics$/i});
const TIMEOUT_MS=10000,MAX_BYTES=3*1024*1024,MAX_REDIRECTS=3;
class CalendarFetchError extends Error{constructor(message,code,status){super(message);this.code=code;this.httpStatus=status}}

// A link as pasted by the person → {url, host, provider} or {error}. Nothing is fetched here.
function checkUrl(raw){
 if(typeof raw!=='string')return {error:'Incolla il link del calendario.'};
 let s=raw.trim();if(!s)return {error:'Incolla il link del calendario.'};
 if(s.length>2000||/[\u0000- \u007f]/.test(s))return {error:'Link non valido: incollalo di nuovo, senza spazi.'};
 if(/^webcals?:\/\//i.test(s))s='https://'+s.replace(/^webcals?:\/\//i,'');
 let u;try{u=new URL(s)}catch{return {error:'Link non valido: deve iniziare con https://.'}}
 if(u.protocol!=='https:')return {error:'Il link deve iniziare con https:// (o webcal://).'};
 if(u.username||u.password)return {error:'Link non valido.'};
 if(u.port&&u.port!=='443')return {error:'Link non valido: porta non consentita.'};
 const host=u.hostname.toLowerCase(),provider=HOSTS[host];
 if(!provider)return {error:'Sono accettati solo i link ICS pubblicati da Outlook / Microsoft 365 (outlook.office365.com, outlook.live.com) e Google Calendar (calendar.google.com).'};
 if(!PATHS[provider].test(u.pathname))return {error:provider==='outlook'?'Questo non sembra il link ICS di Outlook: in «Pubblica calendario» copia il link che finisce con .ics (non quello HTML).':'Questo non sembra l’indirizzo iCal di Google: copia l’«Indirizzo segreto in formato iCal», che finisce con basic.ics.'};
 u.hash='';u.port='';
 return {url:u.toString(),host,provider};
}

// Public unicast address? IPv4 and IPv6 (IPv4-mapped and NAT64 addresses are checked as IPv4).
function v4(ip){const p=ip.split('.').map(Number);if(p.length!==4||p.some(x=>!Number.isInteger(x)||x<0||x>255))return false;const [a,b,c]=p;
 if(a===0||a===10||a===127||a>=224)return false;if(a===100&&b>=64&&b<=127)return false;if(a===169&&b===254)return false;if(a===172&&b>=16&&b<=31)return false;
 if(a===192&&(b===168||(b===0&&(c===0||c===2))||(b===88&&c===99)))return false;if(a===198&&(b===18||b===19||(b===51&&c===100)))return false;if(a===203&&b===0&&c===113)return false;return true}
function expand6(ip){let s=ip.toLowerCase().split('%')[0];let tail=[];
 const m=/(\d+\.\d+\.\d+\.\d+)$/.exec(s);if(m){const p=m[1].split('.').map(Number);tail=[((p[0]<<8)|p[1]).toString(16),((p[2]<<8)|p[3]).toString(16)];s=s.slice(0,-m[1].length).replace(/:$/,'')||':'}
 const [head,rest]=s.includes('::')?s.split('::'):[s,null];const h=head?head.split(':').filter(Boolean):[],r=rest?rest.split(':').filter(Boolean):[];
 const fill=rest===null?[]:Array(8-h.length-r.length-tail.length).fill('0');const all=[...h,...fill,...r,...tail];
 return all.length===8?all.map(x=>parseInt(x,16)):null}
function isPublicIp(ip){
 const kind=net.isIP(String(ip||''));if(kind===4)return v4(ip);if(kind!==6)return false;
 const w=expand6(ip);if(!w||w.some(x=>!Number.isInteger(x)||x<0||x>0xffff))return false;
 const z=w.every(x=>x===0);if(z)return false;if(w.slice(0,7).every(x=>x===0)&&w[7]===1)return false;// :: and ::1
 const embedded=()=>[w[6]>>8,w[6]&255,w[7]>>8,w[7]&255].join('.');
 if(w.slice(0,5).every(x=>x===0)&&w[5]===0xffff)return v4(embedded());// ::ffff:a.b.c.d
 if(w[0]===0x64&&w[1]===0xff9b)return v4(embedded());// NAT64
 if(w.slice(0,6).every(x=>x===0))return false;// IPv4-compatible, deprecated
 if((w[0]&0xfe00)===0xfc00||(w[0]&0xffc0)===0xfe80||(w[0]&0xff00)===0xff00)return false;// ULA, link-local, multicast
 if(w[0]===0x2001&&(w[1]===0xdb8||w[1]<0x200))return false;// documentation, TEREDO/ORCHID and other special 2001::/23
 if(w[0]===0x2002)return false;// 6to4
 return true;
}
// dns.lookup replacement for https.request: every address must be public, else the connection is refused.
function safeLookup(resolve){
 return (hostname,options,cb)=>{if(typeof options==='function'){cb=options;options={}}
  resolve(hostname,{all:true},(err,list)=>{
   if(err)return cb(err);const all=(list||[]).filter(a=>a&&a.address);
   if(!all.length)return cb(Object.assign(new Error('no address'),{code:'ENOTFOUND'}));
   if(all.some(a=>!isPublicIp(a.address)))return cb(Object.assign(new Error('blocked address'),{code:'EBLOCKED'}));
   if(options&&options.all)return cb(null,all.map(a=>({address:a.address,family:a.family||net.isIP(a.address)})));
   cb(null,all[0].address,all[0].family||net.isIP(all[0].address))})};
}
const failMsg=(host,text)=>new CalendarFetchError(text+' ('+host+')','FETCH');
function once(url,host,{transport,resolve,deadline,maxBytes}){
 return new Promise((ok,ko)=>{
  const left=deadline-Date.now();if(left<=0)return ko(failMsg(host,'Il calendario non ha risposto in tempo'));
  let done=false;const finish=(f,v)=>{if(!done){done=true;clearTimeout(timer);f(v)}};
  const req=transport(url,{method:'GET',agent:false,lookup:safeLookup(resolve),headers:{'Accept':'text/calendar, text/plain;q=0.8, */*;q=0.1','Accept-Encoding':'gzip, deflate','User-Agent':'RADIX-CRM-Calendar/1.0'}},res=>{
   const status=res.statusCode||0;
   if(status>=300&&status<400){res.resume();return finish(ok,{redirect:res.headers.location,status})}
   if(status!==200){res.resume();return finish(ko,new CalendarFetchError(status===404||status===410?'Link non più valido: il calendario non è più pubblicato o il link è cambiato. Copialo di nuovo e salvalo ('+host+')':status===401||status===403?'Accesso negato dal calendario: pubblicalo di nuovo e copia il nuovo link ('+host+')':'Il calendario ha risposto con un errore '+status+' ('+host+')','HTTP',status))}
   const enc=String(res.headers['content-encoding']||'').toLowerCase();
   let body=res;if(enc==='gzip'||enc==='x-gzip')body=res.pipe(zlib.createGunzip());else if(enc==='deflate')body=res.pipe(zlib.createInflate());else if(enc&&enc!=='identity'){res.resume();return finish(ko,failMsg(host,'Formato di risposta non supportato'))}
   const declared=Number(res.headers['content-length']);if(Number.isFinite(declared)&&declared>maxBytes){res.destroy();return finish(ko,failMsg(host,'Calendario troppo grande (oltre 3 MB)'))}
   const parts=[];let n=0;
   body.on('data',c=>{n+=c.length;if(n>maxBytes){req.destroy();finish(ko,failMsg(host,'Calendario troppo grande (oltre 3 MB)'));return}parts.push(c)});
   body.on('end',()=>finish(ok,{text:Buffer.concat(parts).toString('utf8')}));
   body.on('error',()=>finish(ko,failMsg(host,'Risposta del calendario illeggibile')));
  });
  const timer=setTimeout(()=>{req.destroy();finish(ko,failMsg(host,'Il calendario non ha risposto in tempo'))},left);
  req.on('error',e=>finish(ko,e&&e.code==='EBLOCKED'?failMsg(host,'Indirizzo del calendario non consentito'):e&&e.code==='ENOTFOUND'?failMsg(host,'Server del calendario non trovato'):failMsg(host,'Calendario non raggiungibile')));
  req.end();
 });
}
/* url: an https link that passed checkUrl. → the iCalendar text. opts: transport (https.request), resolve (dns.lookup),
   timeoutMs, maxBytes, maxRedirects (for tests). */
async function fetchIcs(raw,opts){
 const o=opts||{},deadline=Date.now()+(o.timeoutMs||TIMEOUT_MS),maxBytes=o.maxBytes||MAX_BYTES;
 let c=checkUrl(raw);if(c.error)throw new CalendarFetchError(c.error,'URL');
 for(let hop=0;hop<=(o.maxRedirects??MAX_REDIRECTS);hop++){
  const r=await once(c.url,c.host,{transport:o.transport||https.request,resolve:o.resolve||dns.lookup,deadline,maxBytes});
  if(r.redirect===undefined){
   const text=r.text.replace(/^﻿/,'');
   if(!/^\s*BEGIN:VCALENDAR/i.test(text))throw failMsg(c.host,'Il link non restituisce un calendario iCal: controlla di aver copiato il link ICS');
   return text;
  }
  let next;try{next=new URL(String(r.redirect||''),c.url).toString()}catch{throw failMsg(c.host,'Reindirizzamento non valido')}
  const n=checkUrl(next);if(n.error)throw failMsg(c.host,'Il calendario rimanda a un indirizzo non consentito');
  c=n;
 }
 throw failMsg(c.host,'Troppi reindirizzamenti');
}
module.exports={checkUrl,fetchIcs,isPublicIp,safeLookup,CalendarFetchError,HOSTS,TIMEOUT_MS,MAX_BYTES};
