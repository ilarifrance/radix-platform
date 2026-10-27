'use strict';
/* «Trova email» as a waterfall: free sources first, then paid providers from the cheapest, stopping per contact at the
   first good result (the person's own verified or published address). Pure rules shared by the CRM page
   (sales/crm-prospecting.js) and the server (api/_sales_email_finder.js): no DOM, no network.
   - Step «free» (no key, no cost): company domain from the company website/email; the public pages of that site
     (home, contatti, chi siamo, team, impressum, privacy); the person's own published address → «pubblicata sul sito»;
     else the company pattern seen in other personal addresses (nome.cognome@, n.cognome@ …) and an MX record on the
     domain → «da verificare» (nobody checked the mailbox: excluded from campaigns unless the user ticks it).
   - Paid steps, only for contacts still without a good address, in the workspace order (reserved row «__trova_email__»,
     default Hunter → Apollo → Captain Data → Dropcontact). A provider without its key is «da collegare» and skipped.
   - The goal is the PERSON's address: a generic or role mailbox (info@, commerciale@ …) is never a hit, the chain goes on;
     the server saves it at most on the company record when the company has no email. */
(function(root){
const P=typeof module==='object'&&module.exports?require('./crm-prospecting-core.js'):root.RadixCrmProspectingCore;
const RESERVED='__trova_email__',KEY='email_finder';
// cost: what the provider says it charges (check the current price list on its site).
const PROVIDERS=Object.freeze([
 Object.freeze({id:'free',label:'Fonti gratuite (sito aziendale e DNS)',paid:false,env:null,cost:'gratis'}),
 Object.freeze({id:'hunter',label:'Hunter',paid:true,env:'HUNTER_API_KEY',cost:'1 credito Hunter per email trovata, niente se non la trova',mode:'sync'}),
 Object.freeze({id:'apollo',label:'Apollo.io',paid:true,env:'APOLLO_API_KEY',cost:'1 credito Apollo per email restituita, niente senza dati',mode:'sync'}),
 Object.freeze({id:'captaindata',label:'Captain Data',paid:true,env:'CAPTAIN_DATA_API_KEY',cost:'—',mode:'none',unavailable:'Captain Data non offre un’API pubblica per trovare l’email di una persona (per le email si appoggia a Dropcontact): resta fuori dalla catena.'}),
 Object.freeze({id:'dropcontact',label:'Dropcontact',paid:true,env:'DROPCONTACT_API_KEY',cost:'1 credito Dropcontact per email trovata',mode:'batch'})]);
const PAID=PROVIDERS.filter(p=>p.paid).map(p=>p.id);
const DEFAULT_ORDER=Object.freeze(['hunter','apollo','captaindata','dropcontact']);
const byId=id=>PROVIDERS.find(p=>p.id===id)||null;
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
// Stored settings {order:[paid ids]}: listed = on, in that order; missing = off. → null when valid, else the reason.
function settingsError(v){
 if(!plain(v)||Object.keys(v).join()!=='order'||!Array.isArray(v.order))return 'formato non previsto.';
 if(v.order.length>PAID.length||v.order.some(x=>!PAID.includes(x))||new Set(v.order).size!==v.order.length)return 'servizi non validi o ripetuti.';
 return null;
}
function orderOf(row){const s=row&&plain(row.filters)?row.filters[KEY]:undefined;return s!==undefined&&!settingsError(s)?[...s.order]:[...DEFAULT_ORDER]}

// ---- free step: domain, published addresses, company pattern ----
function domainOf(v){
 let s=String(v||'').trim().toLowerCase();if(!s)return null;
 if(s.includes('@')&&!s.includes('/'))s=s.slice(s.lastIndexOf('@')+1);
 else{try{s=new URL(/^[a-z]+:\/\//.test(s)?s:'https://'+s).hostname}catch{return null}}
 s=s.replace(/^www\d?\./,'').replace(/\.$/,'');
 if(!/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,24}$/.test(s))return null;
 if(!P.businessEmail('x@'+s))return null;
 return s;
}
const ENT={'&#64;':'@','&#x40;':'@','&commat;':'@','&#46;':'.','&#x2e;':'.','&period;':'.','&amp;':'&'};
// Addresses at the domain (or a subdomain) in a page: mailto links, plain text, «[at]»/«(at)»/«&#64;» spellings.
function extractEmails(html,domain){
 let t=String(html||'').slice(0,400000).replace(/&#(?:64|x40);|&commat;|&#(?:46|x2e);|&period;|&amp;/gi,m=>ENT[m.toLowerCase()]||m);
 t=t.replace(/\s*[\[(]\s*(?:at|chiocciola)\s*[\])]\s*/gi,'@').replace(/\s*[\[(]\s*(?:dot|punto)\s*[\])]\s*/gi,'.');
 try{t=t.replace(/%40/g,'@')}catch{}
 const out=new Set(),d=String(domain||'').toLowerCase();
 for(const m of t.matchAll(/[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9.-]+\.[a-z]{2,24}/gi)){
  const e=m[0].toLowerCase().replace(/^[._%+-]+|[._-]+$/g,'');const host=e.slice(e.indexOf('@')+1);
  if(/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(host))continue;
  if(d&&host!==d&&!host.endsWith('.'+d))continue;
  if(P.emailOk(e))out.add(e);
 }
 return [...out];
}
const ascii=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z\s'-]/g,' ').replace(/['-]/g,'').trim();
// First and last name, lowercase ascii; a double surname becomes one word (de luca → deluca).
function nameParts(c){
 let first=ascii(c&&c.first_name),last=ascii(c&&c.last_name);
 if(!first||!last){const w=ascii(c&&c.name).split(/\s+/).filter(Boolean);if(w.length<2)return null;first=w[0];last=w.slice(1).join(' ')}
 first=first.split(/\s+/)[0];last=last.replace(/\s+/g,'');
 return first&&last?{first,last}:null;
}
const PATTERNS=Object.freeze({'{f}.{l}':(f,l)=>f+'.'+l,'{fi}.{l}':(f,l)=>f[0]+'.'+l,'{fi}{l}':(f,l)=>f[0]+l,'{f}{l}':(f,l)=>f+l,'{f}_{l}':(f,l)=>f+'_'+l,'{f}-{l}':(f,l)=>f+'-'+l,'{l}.{f}':(f,l)=>l+'.'+f,'{l}{fi}':(f,l)=>l+f[0],'{f}':(f)=>f,'{l}':(f,l)=>l});
// The person's own address among the published ones (any known pattern of their name), never a generic mailbox.
function personalMatch(emails,c){
 const n=nameParts(c);if(!n)return null;
 const locals=new Set(Object.values(PATTERNS).map(fn=>fn(n.first,n.last)));
 return (emails||[]).find(e=>!P.genericEmail(e)&&locals.has(P.localOf(e)))||null;
}
// The company pattern from published personal addresses (generic ones ignored). Only unambiguous shapes count;
// two different shapes → no pattern.
function detectPattern(emails){
 const seen=new Map();
 for(const e of emails||[]){if(P.genericEmail(e))continue;const l=P.localOf(e);let p=null;
  if(/^[a-z]\.[a-z]{2,}$/.test(l))p='{fi}.{l}';else if(/^[a-z]{2,}\.[a-z]{2,}$/.test(l))p='{f}.{l}';else if(/^[a-z]{2,}_[a-z]{2,}$/.test(l))p='{f}_{l}';else if(/^[a-z]{2,}-[a-z]{2,}$/.test(l))p='{f}-{l}';
  if(p)seen.set(p,(seen.get(p)||0)+1)}
 return seen.size===1?[...seen.keys()][0]:null;
}
function applyPattern(pattern,c,domain){const n=nameParts(c),fn=PATTERNS[pattern];return n&&fn&&domain?fn(n.first,n.last)+'@'+domain:null}

// SSRF guard of the site reader: only public unicast addresses.
function privateIp(ip){
 const s=String(ip||'').toLowerCase().replace(/^\[|\]$/g,'');
 const v4=s.replace(/^::ffff:/,'').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
 if(v4){const [a,b]=[Number(v4[1]),Number(v4[2])];
  return a===0||a===10||a===127||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===192&&b===0)||(a===198&&(b===18||b===19))||a>=224}
 if(s.includes(':'))return s==='::'||s==='::1'||/^f[cd]/.test(s)||/^fe[89ab]/.test(s)||/^ff/.test(s)||/^2001:db8/.test(s)||/^64:ff9b/.test(s);
 return true;
}

// ---- who goes where ----
const hasName=c=>!!nameParts(c)||!!String((c&&c.name)||'').trim();
// Free step: no email yet, a name, a company or a website. Paid steps: no email, or only a «da verificare»/catch-all one.
function candidates(contacts,{paid=false}={}){
 const ok=[],skipped={email:0,company:0,name:0,optout:0};
 for(const c of contacts||[]){
  if(P.optedOut(c)){skipped.optout++;continue}
  const has=P.emailOk(c.email);
  if(has&&(!paid||P.qualificationRank(P.qualificationOf(c))>=2||!P.qualificationOf(c))){skipped.email++;continue}
  if(!hasName(c)){skipped.name++;continue}
  if(!String(c.company||'').trim()&&!String(c.linkedin_url||'').trim()&&!domainOf(c.website)){skipped.company++;continue}
  ok.push(c);
 }
 return {contacts:ok,skipped};
}
// Chain order with each provider's state: {id,label,cost,state:'pronto'|'da collegare'|'non disponibile'|'spento'}.
function chain(order,configured){
 const on=order||DEFAULT_ORDER;
 return PAID.map(id=>byId(id)).sort((a,b)=>(on.includes(a.id)?on.indexOf(a.id):99)-(on.includes(b.id)?on.indexOf(b.id):99)).map(p=>({id:p.id,label:p.label,cost:p.cost,env:p.env,mode:p.mode,
  state:!on.includes(p.id)?'spento':p.unavailable?'non disponibile':configured&&configured[p.id]?'pronto':'da collegare',note:p.unavailable||null}));
}
const ready=ch=>ch.filter(p=>p.state==='pronto');
function firstConfirmText(n,skipped,ch){
 const r=ready(ch),off=ch.filter(p=>p.state!=='pronto'&&p.state!=='spento');
 const lines=['Cercare l’email personale aziendale di '+n+(n===1?' contatto':' contatti')+'?','',
  '1) Prima le fonti gratuite: sito dell’azienda (pagine pubbliche) e DNS. Nessun costo. Quanti se ne risolvono gratis non si può sapere prima.',
  r.length?'2) Solo per chi resta senza email buona, i servizi a pagamento in quest’ordine, fermandosi al primo risultato buono: '+r.map(p=>p.label+' ('+p.cost+')').join(' → ')+'. Prima di usarli ti chiedo un’altra conferma.':'2) Nessun servizio a pagamento collegato: si usano solo le fonti gratuite.'];
 if(off.length)lines.push('Non usati: '+off.map(p=>p.label+' — '+p.state).join(', ')+'.');
 const s=[];if(skipped.email)s.push(skipped.email+' hanno già un’email');if(skipped.company)s.push(skipped.company+' senza azienda');if(skipped.name)s.push(skipped.name+' senza nome');if(skipped.optout)s.push(skipped.optout+' disiscritti');
 if(s.length)lines.push('','Esclusi: '+s.join(', ')+'.');
 lines.push('','Si salvano solo indirizzi della persona (mai info@, commerciale@ …), con una nota su fonte e qualifica.');
 return lines.join('\n');
}
function paidConfirmText(k,ch){
 const r=ready(ch);
 return ['Le fonti gratuite non hanno trovato un indirizzo buono per '+k+(k===1?' contatto':' contatti')+'.','',
  'Usare i servizi a pagamento, in quest’ordine, fermandosi al primo risultato buono per ogni contatto?',
  ...r.map((p,i)=>(i+1)+') '+p.label+': al massimo '+k+' ricerche · '+p.cost),'',
  'I prezzi sono quelli del tuo contratto con ciascun servizio: controllali sul loro sito.'].join('\n');
}

/* The whole run in the page, with the two confirm gates. deps: ask(text)→bool, api(action,data)→result,
   wait(ms), progress(text), configured {provider:bool}, order. Nothing is sent before the first «OK»,
   no paid provider is called before the second. */
async function runFinder(contacts,{ask,api,wait=ms=>new Promise(r=>setTimeout(r,ms)),progress=()=>{},configured={},order=DEFAULT_ORDER,chunk=4,pollMs=20000,maxPolls=45}){
 const pick=candidates(contacts),ch=chain(order,configured);
 const out={ran:false,free:{saved:0,guessed:0,company:0},paid:{},remaining:0,suppressed:0,skipped:pick.skipped};
 if(!pick.contacts.length)return {...out,reason:'none'};
 if(!ask(firstConfirmText(pick.contacts.length,pick.skipped,ch)))return {...out,reason:'cancelled'};
 out.ran=true;
 let left=pick.contacts.map(c=>c.id);const open=new Set(left);
 for(let i=0;i<left.length;i+=chunk){
  progress('Fonti gratuite: '+Math.min(i+chunk,left.length)+' di '+left.length+'…');
  // A slow batch (the server reads company sites) that times out does not stop the run: its contacts stay open.
  let r;try{r=await api('free',{contacts:left.slice(i,i+chunk),confirm:true})}catch(e){if(e&&/Tempo di attesa scaduto/.test(e.message)){out.timeouts=(out.timeouts||0)+1;continue}throw e}
  out.free.saved+=r.saved||0;out.free.guessed+=r.guessed||0;out.free.company+=r.company||0;out.suppressed+=r.suppressed||0;
  for(const id of r.resolved||[])open.delete(id);
 }
 left=[...open];out.remaining=left.length;
 const paid=ready(ch);
 if(!left.length||!paid.length)return out;
 if(!ask(paidConfirmText(left.length,ch)))return {...out,reason:'paid-cancelled'};
 for(const p of paid){
  if(!left.length)break;
  const res=out.paid[p.id]={saved:0,not_found:0};
  if(p.mode==='sync'){
   for(let i=0;i<left.length;i+=chunk){
    progress(p.label+': '+Math.min(i+chunk,left.length)+' di '+left.length+'…');
    const r=await api('paid',{provider:p.id,contacts:left.slice(i,i+chunk),confirm:true});
    res.saved+=r.saved||0;res.not_found+=r.not_found||0;out.suppressed+=r.suppressed||0;for(const id of r.resolved||[])open.delete(id);
   }
  }else if(p.mode==='batch'){
   for(let i=0;i<left.length;i+=250){
    const s=await api('paid',{provider:p.id,contacts:left.slice(i,i+250),confirm:true});
    if(!s.request_id)continue;
    for(let k=0;k<maxPolls;k++){
     progress(p.label+': ricerca in corso, controllo ogni '+Math.round(pollMs/1000)+' secondi…');await wait(pollMs);
     const r=await api('result',{provider:p.id,request_id:s.request_id});
     if(!r.ready)continue;res.saved+=r.saved||0;res.not_found+=r.not_found||0;out.suppressed+=r.suppressed||0;for(const id of r.resolved||[])open.delete(id);break;
    }
   }
  }
  left=[...open];
 }
 out.remaining=left.length;
 return out;
}

// Domains a company could own, from its name only: «Acrotecna S.r.l.» → acrotecna.it, acrotecna.com. The legal form
// and filler words are dropped; at most 6 candidates, every one verified later (MX + the name on the home page).
const LEGAL=new Set(['srl','s r l','srls','spa','s p a','snc','sas','sapa','scarl','soc','societa','coop','cooperativa','ditta','di','e','&','and','group','gruppo','italia','italy','the','il','la','lo','dei','del','della','by','ltd','llc','gmbh']);
const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function nameTokens(name){
 return fold(name).replace(/\b(s\.?\s?r\.?\s?l\.?s?|s\.?\s?p\.?\s?a\.?|s\.?\s?n\.?\s?c\.?|s\.?\s?a\.?\s?s\.?)(?=\W|$)/g,' ').replace(/&/g,' ').replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(t=>t&&!LEGAL.has(t));
}
function domainCandidates(name){
 const t=nameTokens(name).slice(0,4);if(!t.length)return [];
 const bases=[];
 if(t.join('').length>=4)bases.push(t.join(''));
 if(t.length>1&&t.slice(0,2).join('').length>=4)bases.push(t.slice(0,2).join(''));
 if(t[0].length>=5)bases.push(t[0]);
 const out=[];
 for(const b of [...new Set(bases)])for(const tld of ['it','com']){const d=b+'.'+tld;if(domainOf(d)&&!out.includes(d))out.push(d)}
 return out.slice(0,6);
}
// The home page proves the guess when it mentions every distinctive word of the company's name (3 longest, 4+ letters).
// A domain that is not .it needs one more sign that it is the same company: its city, or an Italian VAT/legal form.
function pageMentions(html,name,{city,domain}={}){
 const toks=nameTokens(name).filter(t=>t.length>=4).sort((a,b)=>b.length-a.length).slice(0,3);
 if(!toks.length)return false;
 const text=fold(String(html||'').slice(0,300000)).replace(/[^a-z0-9]+/g,' ');
 if(!toks.every(t=>text.includes(t)))return false;
 const weak=!/\.it$/.test(String(domain||''));
 if(!weak)return true;
 const c=fold(city).replace(/[^a-z0-9]+/g,' ').trim();
 return (c.length>=3&&text.includes(c))||/\b(p iva|partita iva|s r l|srl|s p a)\b/.test(text);
}

const core={RESERVED,KEY,PROVIDERS,PAID,DEFAULT_ORDER,byId,settingsError,orderOf,domainOf,domainCandidates,pageMentions,nameTokens,extractEmails,nameParts,PATTERNS,personalMatch,detectPattern,applyPattern,privateIp,candidates,chain,firstConfirmText,paidConfirmText,runFinder};
if(typeof module==='object'&&module.exports){module.exports=core;return}
root.RadixCrmEmailFinderCore=core;
})(typeof globalThis!=='undefined'?globalThis:this);
