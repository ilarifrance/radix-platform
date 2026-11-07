'use strict';
/* «Prospezione B2B» and «Trova email»: pure rules shared by the CRM page and the server
   (api/_sales_mailboxes.js, api/_sales_queue_core.js, api/_sales_email_finder.js). No database, no network.
   The owner chose to write to business contacts without prior marketing consent (legittimo interesse B2B),
   so these rules keep it as narrow as possible:
   - only business addresses (no webmail, no PEC, no no-reply), never a person who opted out;
   - an address found by Dropcontact counts only when Dropcontact qualified it «nominative@pro»
     (catch-all and generic addresses only when the user ticks it, personal or invalid ones never);
   - one first email per person every 90 days, then at most 2 follow-ups, never after a reply;
   - a fixed footer that says who writes, why, where the data came from, with the one-click opt-out link.
   Opt-out marker: any note with «Disiscrizione…» (the unsubscribe link writes one, a user can write one by hand)
   or a timeline note titled «Disiscrizione dalle email commerciali» (written by the unsubscribe link). */
(function(root){
const DAY=864e5;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const B2B_PREFIX='B2B · ';
const FOLLOW_UP=' · follow-up ';
const MAX_FOLLOW_UPS=2;
const WINDOW_DAYS=90;          // a person gets one first email per 90 days
const FOLLOW_UP_MIN_DAYS=3;    // a follow-up waits at least 3 days after the previous step
const BASE_MAX=80-B2B_PREFIX.length-(FOLLOW_UP.length+1);
const OPTOUT=/disiscrizione/i;
const OPTOUT_TITLE='Disiscrizione dalle email commerciali';
// «Email trovata con <fonte> il DD/MM/YYYY (qualifica: <q>): <email>», written by «Trova email» (api/_sales_email_finder.js).
const NOTE_RE=/Email trovata con ([^\n]{1,60}?) il (\d{2}\/\d{2}\/\d{4}) \(qualifica: ([^)\n]{1,40})\)(?::\s*(\S+@\S+))?/g;
const VERIFIED='nominative@pro';
// Qualifications of every source, normalized: «ok» goes into a B2B campaign by default, «unverified» only when the
// user ticks it, anything else never. Dropcontact keeps its own words (nominative@pro …); Hunter and Apollo «verificata»
// when they verified the mailbox; the free steps «pubblicata sul sito» (the person's own address on the company site)
// or «da verificare» (built from the company's address pattern: nobody checked the mailbox).
const QUAL_OK=['nominative@pro','verificata','pubblicata sul sito'];
const QUAL_UNVERIFIED=['catch_all@pro','random@pro','catch_all','da verificare'];
// Role or shared mailboxes: never a person's address (never a «Trova email» hit, never a B2B recipient); at most the company's.
const GENERIC=new Set(['info','infos','informazioni','commerciale','commerciali','vendite','vendita','sales','amministrazione','admin','administration','office','ufficio','segreteria','secretary','contatti','contatto','contact','contacts','contactus','hello','hi','ciao','noreply','no-reply','donotreply','do-not-reply','support','supporto','assistenza','help','helpdesk','service','servizioclienti','customercare','customerservice','marketing','press','stampa','ufficiostampa','media','hr','risorseumane','jobs','job','lavoro','careers','career','recruiting','privacy','dpo','gdpr','legal','legale','webmaster','web','postmaster','abuse','mailer-daemon','acquisti','purchasing','ordini','orders','order','booking','prenotazioni','reception','direzione','management','export','import','logistica','logistics','spedizioni','fatture','fatturazione','billing','invoice','invoices','accounting','contabilita','tesoreria','finance','amministrativo','tecnico','technical','qualita','quality','produzione','eventi','events','newsletter','news','team','staff','general','mail','email','posta','pec','bounce','bounces','notifiche','notifications','it','ict','sistemi','commercial','export-sales','italia','italy']);
const localOf=v=>{const e=String(v||'').trim().toLowerCase(),at=e.lastIndexOf('@');return at>0?e.slice(0,at):''};
const genericEmail=v=>{const l=localOf(v);return !!l&&(GENERIC.has(l)||GENERIC.has(l.replace(/[0-9]+$/,''))||/^(info|sales|vendite|commerciale|amministrazione|ufficio|office|contatti|segreteria|support|assistenza|marketing|ordini|acquisti|export)[._-]/.test(l))};
// Webmail and certified-mail (PEC) domains: never a business inbox for prospecting.
const FREE=new Set(['gmail.com','googlemail.com','yahoo.com','yahoo.it','ymail.com','rocketmail.com','hotmail.com','hotmail.it','outlook.com','outlook.it','live.com','live.it','msn.com','icloud.com','me.com','mac.com','aol.com','libero.it','virgilio.it','alice.it','tin.it','tiscali.it','email.it','inwind.it','iol.it','katamail.com','fastwebnet.it','tim.it','vodafone.it','teletu.it','gmx.com','gmx.net','gmx.de','gmx.it','web.de','proton.me','protonmail.com','pm.me','yandex.com','yandex.ru','mail.ru','mail.com','zoho.com','hey.com','tutanota.com','tuta.io','qq.com','163.com']);
const PEC=/(^|\.)(pec|legalmail|postacert|arubapec|pecimprese|registerpec|sicurezzapostale|casellapec|gigapec|pec\.libero)(\.|$)/i;
const NOREPLY=/^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|abuse|bounce[s]?)$/i;

const emailOk=v=>EMAIL.test(String(v||'').trim());
function businessEmail(v){
 const e=String(v||'').trim().toLowerCase();if(!EMAIL.test(e))return false;
 const at=e.lastIndexOf('@'),local=e.slice(0,at),domain=e.slice(at+1);
 if(FREE.has(domain)||PEC.test(domain)||NOREPLY.test(local))return false;
 return true;
}
// contact.opted_out comes from the server (notes, timeline note, same address opted out elsewhere).
const optedOut=c=>!!c&&(c.opted_out===true||OPTOUT.test(String(c.notes||'')));

// «Email trovata con Dropcontact il 23/10/2026 (qualifica: nominative@pro): mario@acme.it»
const romeDay=ms=>new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(ms));
function finderNote(now,qualification,email,source='Dropcontact'){return 'Email trovata con '+source+' il '+romeDay(now)+' (qualifica: '+qualification+'): '+email}
// The newest «Trova email» note for the contact's current address → {source,qualification}; null when the address
// was typed by hand (or the note is gone).
function findingOf(c){
 const notes=String((c&&c.notes)||''),email=String((c&&c.email)||'').trim().toLowerCase();let found=null;
 for(const m of notes.matchAll(NOTE_RE)){if(!m[4]||m[4].toLowerCase().replace(/[.,;]+$/,'')===email)found={source:m[1].trim(),qualification:m[3].trim()}}
 return found;
}
const qualificationOf=c=>{const f=findingOf(c);return f?f.qualification:null};
// 'ok' | 'unverified' | 'invalid' for a qualification (null: typed by hand → ok).
function qualificationLevel(q){
 if(!q)return 'ok';
 if(QUAL_OK.includes(q))return 'ok';
 if(QUAL_UNVERIFIED.includes(q))return 'unverified';
 return 'invalid';
}
// 2 good, 1 unverified, 0 none/unusable: «Trova email» replaces an address only with a better one.
const qualificationRank=q=>{const l=qualificationLevel(q);return q&&l==='ok'?2:l==='unverified'?1:0};

// Campaign names: «B2B · <base>» for the first email, «B2B · <base> · follow-up N» for follow-ups.
function parseCampaign(name){
 const s=String(name||'');
 if(!s.startsWith(B2B_PREFIX))return {b2b:false,base:s,step:0};
 let base=s.slice(B2B_PREFIX.length),step=0;const m=base.match(/ · follow-up ([12])$/);
 if(m){step=Number(m[1]);base=base.slice(0,-m[0].length)}
 return {b2b:true,base,step};
}
function b2bCampaign(base,step=0){
 const b=parseCampaign(String(base||'').trim()).base.replace(/\s+/g,' ').trim().slice(0,BASE_MAX).trim();
 if(!b)return null;
 return B2B_PREFIX+b+(step?FOLLOW_UP+step:'');
}

/* Who can receive a B2B email. contact: {id,email,notes,opted_out,last_reply_at}; ctx:
   step 0..2; includeUnverified; recent: Set of contact ids and lowercase addresses prospected in the last 90 days;
   firstSent: Map id→ms of the first email of this sequence; prevSent: Map id→ms of the previous step; now.
   → null when eligible, else the reason key. */
function b2bReason(c,ctx={}){
 if(optedOut(c))return 'optout';
 if(!emailOk(c.email))return 'email';
 if(!businessEmail(c.email))return 'business';
 if(genericEmail(c.email))return 'generic';
 const lvl=qualificationLevel(qualificationOf(c));
 if(lvl==='invalid'||(lvl==='unverified'&&!ctx.includeUnverified))return 'unverified';
 const step=ctx.step||0,email=String(c.email).trim().toLowerCase();
 if(step===0){if(ctx.recent&&(ctx.recent.has(c.id)||ctx.recent.has(email)))return 'recent';return null}
 const first=ctx.firstSent&&ctx.firstSent.get(c.id),prev=ctx.prevSent&&ctx.prevSent.get(c.id);
 if(!first||!prev)return 'previous';
 if(ctx.now-prev<FOLLOW_UP_MIN_DAYS*DAY)return 'early';
 const reply=c.last_reply_at?Date.parse(c.last_reply_at):NaN;
 if(Number.isFinite(reply)&&reply>first)return 'replied';
 return null;
}
const fill=(t,c)=>String(t).replace(/\{nome\}/g,String(c.name||'').split(/\s+/)[0]||'').replace(/\{nome_completo\}/g,c.name||'').replace(/\{azienda\}/g,c.company||'').replace(/\{ruolo\}/g,c.role||'');
const REASONS=['optout','email','business','generic','unverified','recent','previous','early','replied'];
function planB2B(subject,body,contacts,ctx={}){
 const emails=[],skipped=Object.fromEntries(REASONS.map(k=>[k,0]));
 for(const c of contacts||[]){const r=b2bReason(c,ctx);if(r){skipped[r]++;continue}
  emails.push({contact:c,to:String(c.email).trim(),subject:fill(subject,c).slice(0,200),body:fill(body,c).slice(0,4000),qualification:qualificationOf(c)})}
 return {emails,skipped};
}

/* The footer of every B2B email: not editable, always last, the text above is cut to make room.
   issuer: document settings (Impostazioni › Documenti); sender: the mailbox; contact; url: personal opt-out link. */
function issuerReady(i){return !!(i&&String(i.legal_name||i.name||'').trim()&&String(i.street||'').trim()&&String(i.city||'').trim())}
function footer({issuer,sender,contact,url}){
 const i=issuer||{},c=contact||{},s=sender||{};
 const company=String(i.legal_name||i.name||'').trim();
 const place=[String(i.street||'').trim(),[i.zip,i.city].map(x=>String(x||'').trim()).filter(Boolean).join(' ')+(i.province?' ('+String(i.province).trim()+')':''),i.country&&!/^(it|italia|italy)$/i.test(String(i.country).trim())?String(i.country).trim():''].filter(Boolean).join(', ');
 const who=String(s.from_name||'').trim()||String(s.from_email||'').trim();
 const lines=['','','—',
  (who?who+' · ':'')+company+(i.vat_number?' · P.IVA '+String(i.vat_number).trim():'')+(place?' · '+place:''),
  'Perché ricevi questa email: ti scrivo per il tuo ruolo aziendale'+(c.company?' in '+c.company:'')+' e il tuo profilo professionale pubblico, sulla base del legittimo interesse tra aziende (B2B). È un messaggio individuale, non una newsletter.',
  'Da dove vengono i dati: nome, ruolo e azienda dal profilo professionale pubblico'+(c.linkedin_url?' (LinkedIn)':'')+'; indirizzo email aziendale'+sourceText(c)+'. Puoi chiedere quali dati abbiamo o la loro cancellazione rispondendo a questa email.',
  'Non vuoi essere ricontattato? Un clic e non ti scriveremo più: '+url];
 return lines.join('\n');
}
function sourceText(c){
 const f=findingOf(c);if(!f)return '';
 if(f.qualification==='pubblicata sul sito')return ' pubblicato sul sito della tua azienda';
 if(f.qualification==='da verificare')return ' ricostruito dallo schema degli indirizzi pubblicati sul sito della tua azienda';
 return ' trovato con '+f.source;
}
function withFooter(body,foot){
 const room=4000-foot.length;return String(body).slice(0,Math.max(0,room)).replace(/\s+$/,'')+foot;
}
const hasFooter=(body,url)=>{const b=String(body||'');return b.includes('Perché ricevi questa email:')&&b.includes('Da dove vengono i dati:')&&b.endsWith(url)};

const core={GENERIC,genericEmail,localOf,findingOf,qualificationRank,QUAL_OK,QUAL_UNVERIFIED,DAY,B2B_PREFIX,MAX_FOLLOW_UPS,WINDOW_DAYS,FOLLOW_UP_MIN_DAYS,BASE_MAX,OPTOUT,OPTOUT_TITLE,VERIFIED,REASONS,businessEmail,emailOk,optedOut,finderNote,qualificationOf,qualificationLevel,parseCampaign,b2bCampaign,b2bReason,planB2B,issuerReady,footer,withFooter,hasFooter,romeDay};
if(typeof module==='object'&&module.exports){module.exports=core;return}
root.RadixCrmProspectingCore=core;
})(typeof globalThis!=='undefined'?globalThis:this);
