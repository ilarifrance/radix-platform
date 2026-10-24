'use strict';
/* Date e ore del CRM in ora italiana (Europe/Rome), per l'editor «Modifica / Crea» di sales/sales.js.
   L'API resta in UTC ISO (YYYY-MM-DDTHH:mm:ssZ): qui c'è solo la conversione, pura e testabile.
   - toInput(iso)          UTC ISO → valore di <input type="datetime-local"> in ora di Roma ('' se vuoto o non valido).
   - fromInput(value)      valore datetime-local in ora di Roma → {value: UTC ISO | null} oppure {error}.
                           Ora inesistente (marzo, 02:00–02:59) → spostata avanti di un'ora, come gli orologi;
                           ora doppia (ottobre, 02:00–02:59) → la prima delle due (ora legale).
   - keep(original, value) value dell'input → UTC ISO, ma se l'utente non l'ha toccato restituisce il valore salvato
                           così com'è: nessuna deriva (secondi, millisecondi, la seconda 02:30 di ottobre).
   - label(iso)            «24/10/2026, 14:30» in ora di Roma, per le schede in sola lettura.
   - dateLabel('YYYY-MM-DD') «30/11/2026», data di calendario senza fuso.
   - inputAt(ms)           istante (ms) → 'YYYY-MM-DDTHH:mm' in ora di Roma, al minuto (default dei moduli, «domani alle 9»).
   - fromInputMs(value)    come fromInput, ma → ms oppure null (vuoto o non valido): per i moduli della scheda e del Foglio chiamate. */
(root=>{
const ZONE='Europe/Rome';
const fmt=new Map();
function parts(ms,zone){
 let f=fmt.get(zone);if(!f){f=new Intl.DateTimeFormat('en-US',{timeZone:zone,hourCycle:'h23',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric'});fmt.set(zone,f);}
 const o={};for(const p of f.formatToParts(new Date(ms)))if(p.type!=='literal')o[p.type]=Number(p.value);
 return o;
}
const pad=(n,w=2)=>String(n).padStart(w,'0');
// Offset (ms) of the zone at an instant: wall clock minus UTC.
function offsetAt(ms,zone){const w=parts(ms,zone);return Date.UTC(w.year,w.month-1,w.day,w.hour,w.minute,w.second)-Math.floor(ms/1000)*1000;}
const ISO=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/;
// Postgres / Date text with an explicit zone («2026-10-10 14:30:00+00», «…+02:00»): read, never guessed.
const ZONED=/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;
function utcMs(iso){
 const t=String(iso??'').trim(),m=ISO.exec(t);
 if(!m){if(!ZONED.test(t)||t.startsWith('0000'))return null;const z=t.replace(' ','T').replace(/([+-]\d{2})$/,'$1:00').replace(/([+-]\d{2})(\d{2})$/,'$1:$2').replace(/\.(\d{3})\d+/,'.$1');const ms=Date.parse(z);return Number.isFinite(ms)?ms:null;}
 if(m[1]==='0000')return null;
 const ms=Date.parse(m[0]);if(!Number.isFinite(ms))return null;
 return new Date(ms).toISOString().slice(0,19)===`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`?ms:null;
}
function toInput(iso,zone=ZONE){
 const ms=utcMs(iso);if(ms==null)return '';
 const w=parts(ms,zone);
 return pad(w.year,4)+'-'+pad(w.month)+'-'+pad(w.day)+'T'+pad(w.hour)+':'+pad(w.minute)+(w.second?':'+pad(w.second):'');
}
const LOCAL=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/;
function fromInput(value,zone=ZONE){
 const v=String(value??'').trim();if(!v)return {value:null};
 const m=LOCAL.exec(v);if(!m)return {error:'Data e ora non valide.'};
 const [y,mo,d,h,mi,s]=[m[1],m[2],m[3],m[4],m[5],m[6]||'0'].map(Number);
 const local=Date.UTC(y,mo-1,d,h,mi,s);
 if(y<1||y>9999||h>23||mi>59||s>59||new Date(local).getUTCDate()!==d||new Date(local).getUTCMonth()!==mo-1)return {error:'Data e ora non valide.'};
 // The offsets in force half a day before and after: in an overlap both fit (take the earlier instant,
 // i.e. summer time), in the spring gap none fits (keep the wall clock, read with the offset before the change).
 const before=offsetAt(local-12*3600e3,zone),after=offsetAt(local+12*3600e3,zone);
 const fits=[before,after].filter(o=>offsetAt(local-o,zone)===o).map(o=>local-o);
 const ms=fits.length?Math.min(...fits):local-before;
 return {value:new Date(ms).toISOString().slice(0,19)+'Z'};
}
function keep(original,value,zone=ZONE){
 const ms=original==null||original===''?null:utcMs(original);
 if(ms!=null&&String(value??'').trim()===toInput(original,zone))return {value:ISO.test(String(original).trim())?String(original).trim():new Date(ms).toISOString().slice(0,19)+'Z'};
 return fromInput(value,zone);
}
const labels=new Map();
function label(iso,zone=ZONE){
 const ms=utcMs(iso);if(ms==null)return '';
 let f=labels.get(zone);if(!f){f=new Intl.DateTimeFormat('it-IT',{timeZone:zone,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});labels.set(zone,f);}
 return f.format(new Date(ms));
}
// Calendar date of an instant in Rome («Risolto il …»).
function dayLabel(iso,zone=ZONE){const ms=utcMs(iso);if(ms==null)return '';const w=parts(ms,zone);return pad(w.day)+'/'+pad(w.month)+'/'+pad(w.year,4);}
function dateLabel(date){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date??'').trim());return m?m[3]+'/'+m[2]+'/'+m[1]:'';}
function inputAt(ms,zone=ZONE){if(!Number.isFinite(ms))return '';return toInput(new Date(Math.floor(ms/60e3)*60e3).toISOString(),zone);}
function fromInputMs(value,zone=ZONE){const r=fromInput(value,zone);return r.value?Date.parse(r.value):null;}
const api={ZONE,toInput,fromInput,keep,label,dayLabel,dateLabel,utcMs,inputAt,fromInputMs};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmDates=api;
})(typeof globalThis!=='undefined'?globalThis:this);
