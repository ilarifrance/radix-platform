'use strict';
/* Salesforce-style fields for Aziende (Account) and Contatti (Contact), with Italian fiscal data.
   One description of the fields shared by the edit form (sales.js), the «Dettagli» block of
   Customer360 (crm-record.js), the list views (crm-list-core.js) and CSV (crm-csv-core.js).
   The fields marked `added` exist only after migrations/sales/011: an archive without them
   returns rows without those keys, and every helper here works with such rows. */
(function(root){
const ACCOUNT_TYPES=Object.freeze([['cliente','Cliente'],['prospect','Prospect'],['partner','Partner'],['fornitore','Fornitore'],['altro','Altro']]);
const RATINGS=Object.freeze([['calda','Calda'],['tiepida','Tiepida'],['fredda','Fredda']]);
/* Closed lists for Settore (companies) and Ruolo (contacts): free text made filters useless.
   Stored as the Italian label; a value typed before the list stays until someone changes it.
   Each entry: [label, words that point to it in a free text (imports, LinkedIn titles)]. */
const INDUSTRY_LIST=Object.freeze([
 ['Agricoltura e alimentare',/agricol|agri ?food|aliment|\bfood|vinicol|\bvino|\bwine|caseari|bevand|beverage|zootecn/],
 ['Moda e tessile',/\bmoda\b|fashion|tessil|textile|abbigliament|apparel|calzatur|luxury|lusso|gioiell|jewel/],
 ['Arredo e design',/arred|mobilifici|furniture|interior|\bdesign\b|illuminazion|lighting/],
 ['Automotive e meccanica',/automotive|automobil|meccanic|mechanic|macchinar|machinery|componentistic/],
 ['Chimica e farmaceutica',/chimic|chemic|farmac|pharma|cosmet|biotech|life science/],
 ['Edilizia e immobiliare',/ediliz|costruzion|construction|immobiliar|real ?estate|building|architett/],
 ['Energia e ambiente',/energ|ambient|environment|utilit|rifiuti|waste|rinnovabil|renewable|\boil\b|\bgas\b|fotovoltaic|solar/],
 ['Trasporti e logistica',/trasport|transport|logistic|spedizion|shipping|freight|corrier|courier/],
 ['Turismo, hotel e ristorazione',/turism|touris|hotel|hospitality|ristora|restaurant|travel|viagg|catering/],
 ['Informatica e software',/informatic|software|\bit\b|\bict\b|saas|technolog|tecnolog|digital|cloud|cyber|computer|web agency/],
 ['Telecomunicazioni e media',/telecom|\bmedia\b|editori|publishing|broadcast|\btv\b|\bradio\b|entertainment|spettacol/],
 ['Marketing e comunicazione',/marketing|comunicazion|communication|pubblicit|advertis|\bpr\b|eventi|events/],
 ['Banche, finanza e assicurazioni',/banc|\bbank|finanz|financ|assicura|insurance|fintech|credit|invest|leasing/],
 ['Consulenza e servizi professionali',/consulen|consult|servizi professional|professional services|\blegal|studio |commercialist|accounting|\baudit|\blaw\b|notai|outsourc/],
 ['Sanità e benessere',/sanit|health|medic|ospedal|hospital|clinic|benessere|wellness|fitness|dental/],
 ['Istruzione e formazione',/istruzion|educat|formazion|training|scuol|school|universit|e-?learning/],
 ['Pubblica amministrazione e no profit',/pubblica amministrazione|government|public sector|\bcomune\b|regione|no ?profit|non ?profit|onlus|associazion|fondazion/],
 ['Commercio al dettaglio',/dettaglio|retail|negoz|e-?commerce|\bgdo\b|supermercat/],
 ['Commercio all’ingrosso',/ingrosso|wholesale|distribuzion|distribution|import ?export/],
 ['Manifattura e industria',/manifattur|manufactur|industr|produzion|fabbric|plastic|packaging|imballagg|metallurg|steel|acciai/],
 ['Altro',null]
]);
const ROLE_LIST=Object.freeze([
 ['Assistenza clienti',/customer (service|care|success|support)|assistenza|supporto client|post ?vendita|after ?sales|help ?desk/],
 ['Titolare / CEO',/\bceo\b|titolare|\bowner\b|founder|fondat|amministratore delegato|\bpresident|\bimprenditor|\bsocio\b|chief executive/],
 ['Direzione generale',/direttore generale|direzione generale|general manager|managing director|\bcoo\b|\bdg\b|country manager|\bmanaging partner/],
 ['Amministrazione e finanza',/\bcfo\b|financ|finanz|amministrazion|contabil|accounting|accountant|controller|controllo di gestione|tesorer|treasur/],
 ['Marketing e comunicazione',/marketing|\bcmo\b|comunicazion|communication|\bbrand|social media|growth|\bpr manager/],
 ['Commerciale e vendite',/\bsales|vendit|commercial|account manager|business develop|key account|\bexport|\bagente|\bbdr\b|\bsdr\b|area manager|revenue|\bcro\b/],
 ['Acquisti',/acquist|purchas|procurement|\bbuyer|sourcing|approvvigion/],
 ['Risorse umane',/\bhr\b|risorse umane|human resources|\bpeople\b|recruit|talent|\bpersonale\b/],
 ['IT e digitale',/\bcto\b|\bcio\b|\bit\b|\bict\b|informatic|software|developer|sviluppator|\bdigital|\bdata\b|sistemi informativi|devops|\btech/],
 ['Logistica',/logistic|supply chain|magazzin|warehouse|spedizion|shipping/],
 ['Produzione e operations',/produzion|production|operation|\bplant\b|stabiliment|manufactur/],
 ['Qualità',/qualit|quality|\bqa\b|\bhse\b|sicurezza sul lavoro/],
 ['Ricerca e sviluppo',/r ?& ?d|\bricerca|research|sviluppo prodott|product develop|innovazion|innovation|\bproduct manager/],
 ['Legale',/\blegal|avvocat|lawyer|counsel|compliance|giuridic/],
 ['Altro',null]
]);
const INDUSTRIES=Object.freeze(INDUSTRY_LIST.map(([l])=>Object.freeze([l,l])));
const ROLES=Object.freeze(ROLE_LIST.map(([l])=>Object.freeze([l,l])));
const f=(key,label,type,o)=>Object.freeze({key,label,type,...(o||{})});
const address=(p,label)=>[f(p+'street',label||'Via e numero civico','text',{max:200,added:true}),f(p+'zip','CAP','zip',{max:20,added:true}),f(p+'city','Città','text',{max:120,added:true}),f(p+'province','Provincia','text',{max:60,added:true,hint:'Sigla, es. MI'}),f(p+'country','Paese','text',{max:60,added:true})];
/* Sections in the order of the form and of «Dettagli». `existing` fields predate 011. */
const SECTIONS=Object.freeze({
 companies:Object.freeze([
  {id:'info',label:'Informazioni',fields:[f('division','Dipartimento','text',{max:120,added:true,suggest:true,hint:'L’azienda o il dipartimento che segui per questo cliente'}),f('legal_name','Ragione sociale','text',{max:200,added:true}),f('account_type','Tipo','select',{options:ACCOUNT_TYPES,added:true}),f('rating','Valutazione','select',{options:RATINGS,added:true}),f('owner_id','Responsabile','member',{added:true}),f('parent_company_id','Azienda capogruppo','company',{added:true}),f('industry','Settore','choice',{options:INDUSTRIES,max:120}),f('website','Sito web','url',{max:300}),f('email','Email','email',{max:254}),f('phone','Telefono','tel',{max:40}),f('city','Città (sede)','text',{max:120}),f('annual_revenue_cents','Fatturato annuo (€)','money',{added:true}),f('employees','Dipendenti','int',{added:true})]},
  {id:'billing',label:'Indirizzo di fatturazione',fields:address('billing_')},
  {id:'shipping',label:'Indirizzo di spedizione',fields:address('shipping_')},
  {id:'tax',label:'Dati fiscali',fields:[f('vat_number','Partita IVA','vat',{max:20,added:true,hint:'11 cifre, anche con IT davanti; per l’estero il numero IVA UE'}),f('tax_code','Codice fiscale','taxcode',{max:16,added:true,hint:'11 cifre o 16 caratteri'}),f('pec','PEC','email',{max:254,added:true}),f('sdi_code','Codice destinatario SDI','sdi',{max:7,added:true,hint:'7 caratteri, 6 per la PA'})]},
  {id:'other',label:'Altro',fields:[f('description','Descrizione','area',{max:4000,added:true}),f('notes','Note','area',{max:4000})]}
 ].map(Object.freeze)),
 contacts:Object.freeze([
  {id:'info',label:'Informazioni',fields:[f('first_name','Nome','text',{max:100,added:true}),f('last_name','Cognome','text',{max:100,added:true}),f('title','Qualifica','text',{max:120,added:true}),f('role','Ruolo','choice',{options:ROLES,max:120,hint:'La funzione; il titolo esatto va in Qualifica'}),f('department','Reparto','text',{max:120,added:true}),f('company_id','Azienda','company'),f('division','Dipartimento','text',{max:120,added:true,suggest:true,hint:'L’azienda o il dipartimento che segui per questo contatto'}),f('reports_to_id','Riporta a','contact',{added:true}),f('owner_id','Responsabile','member',{added:true}),f('email','Email','email',{max:254}),f('phone','Telefono','tel',{max:40}),f('mobile','Cellulare','tel',{max:40,added:true}),f('linkedin_url','Profilo LinkedIn','url',{max:300})]},
  {id:'address',label:'Indirizzo',fields:address('')},
  {id:'other',label:'Altro',fields:[f('birthdate','Data di nascita','date',{added:true}),f('lead_source','Origine del contatto','text',{max:80,added:true,hint:'Es. Fiera, Sito web, Passaparola'}),f('preferred_language','Lingua preferita','text',{max:40,added:true}),f('notes','Note','area',{max:4000})]}
 ].map(Object.freeze))
});
const FIELDS={};for(const k of Object.keys(SECTIONS)){FIELDS[k]=Object.freeze(Object.fromEntries(SECTIONS[k].flatMap(s=>s.fields).map(x=>[x.key,x])))}
const ADDED=Object.freeze(Object.fromEntries(Object.keys(SECTIONS).map(k=>[k,Object.freeze(Object.values(FIELDS[k]).filter(x=>x.added).map(x=>x.key))])));
const fieldOf=(kind,key)=>(FIELDS[kind]||{})[key]||null;
/* An archive with migration 011 returns every added column (NULL included) in each row. */
function supported(kind,row){return !!row&&typeof row==='object'&&(ADDED[kind]||[]).some(k=>Object.hasOwn(row,k))}

/* ---------- Italian fiscal identifiers ---------- */
const squash=v=>String(v??'').replace(/[\s.\-]/g,'').toUpperCase();
// Partita IVA: 11 digits, last one is the Luhn-like check digit of the Agenzia delle Entrate.
function pivaChecksum(d){if(!/^\d{11}$/.test(d))return false;let s=0;for(let i=0;i<10;i++){let n=+d[i];if(i%2){n*=2;if(n>9)n-=9}s+=n}return (10-s%10)%10===+d[10]}
// VAT: Italian (optionally «IT» first) with its check digit, or another country's code and number.
function vat(v){const s=squash(v);if(!s)return {value:null};
 if(/^\d+$/.test(s)||s.startsWith('IT')){const d=s.startsWith('IT')?s.slice(2):s;if(!/^\d{11}$/.test(d))return {error:'Partita IVA italiana: 11 cifre.'};if(!pivaChecksum(d))return {error:'Partita IVA non valida: la cifra di controllo non torna.'};return {value:s}}
 if(!/^[A-Z]{2}[A-Z0-9+*]{2,18}$/.test(s))return {error:'Partita IVA non valida: 11 cifre italiane, oppure sigla del paese e numero (massimo 20 caratteri).'};
 return {value:s}}
const CF_ODD={0:1,1:0,2:5,3:7,4:9,5:13,6:15,7:17,8:19,9:21,A:1,B:0,C:5,D:7,E:9,F:13,G:15,H:17,I:19,J:21,K:2,L:4,M:18,N:20,O:11,P:3,Q:6,R:8,S:12,T:14,U:16,V:10,W:22,X:25,Y:24,Z:23};
const CF_RE=/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;
function cfChecksum(s){let t=0;for(let i=0;i<15;i++){const c=s[i];t+=i%2?(/\d/.test(c)?+c:c.charCodeAt(0)-65):CF_ODD[c]}return String.fromCharCode(65+t%26)===s[15]}
// Codice fiscale: 16 characters for a person, 11 digits for a company (same check as the Partita IVA).
function taxCode(v){const s=squash(v);if(!s)return {value:null};
 if(/^\d{11}$/.test(s))return pivaChecksum(s)?{value:s}:{error:'Codice fiscale numerico non valido: la cifra di controllo non torna.'};
 if(s.length!==16||!CF_RE.test(s))return {error:'Codice fiscale: 16 caratteri (persona) o 11 cifre (azienda).'};
 return cfChecksum(s)?{value:s}:{error:'Codice fiscale non valido: il carattere di controllo non torna.'}}
// Codice destinatario SDI: 7 letters or digits (0000000 when the invoice goes to the PEC), 6 for the PA.
function sdi(v){const s=squash(v);if(!s)return {value:null};return /^[A-Z0-9]{6,7}$/.test(s)?{value:s}:{error:'Codice destinatario SDI: 7 caratteri (6 per la Pubblica Amministrazione).'}}

/* ---------- Form values ---------- */
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CTRL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MAX_CENTS=9000000000000000,MAX_EMPLOYEES=10000000;
// «1.250.000», «1250000,50», «1,250,000.50», «€ 1.000» → cents. Null when empty, NaN when not a number.
// A separator followed by 1-2 digits at the end is the decimal one; any other is a thousands separator.
function euroToCents(v){const s=String(v??'').replace(/[€£\s ']/g,'').replace(/^(EUR|GBP)/i,'');if(!s)return null;if(!/^\d[\d.,]*$/.test(s)||/[.,]$/.test(s))return NaN;
 const m=/^(.*?)[.,](\d{1,2})$/.exec(s);const int=(m?m[1]:s),dec=m?m[2]:'';
 if(int&&!/^\d{1,3}([.,]?\d{3})*$/.test(int))return NaN;
 const c=Number(int.replace(/[.,]/g,'')||'0')*100+Number((dec+'00').slice(0,2));return Number.isSafeInteger(c)?c:NaN}
const centsToEuro=c=>c==null||c===''?'':(Number(c)%100?(Number(c)/100).toFixed(2).replace('.',','):String(Math.round(Number(c)/100)));
function realDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s}
/* One form value → {value} or {error}. Empty always means «not set» (null). */
function parse(kind,key,raw,opts){
 const fd=fieldOf(kind,key);if(!fd)return {error:'Campo sconosciuto: '+key};
 const s=String(raw??'').trim();if(!s)return {value:null};
 const o=opts||{};
 switch(fd.type){
  case 'select':return fd.options.some(([v])=>v===s)?{value:s}:{error:fd.label+': valore non previsto.'};
  // A value written before the list existed is kept as it is until someone picks a voice.
  case 'choice':return fd.options.some(([v])=>v===s)||(o.current!=null&&s===String(o.current).trim())?{value:s}:{error:fd.label+': scegli una voce dell’elenco.'};
  case 'member':{const n=Number(s);return /^\d+$/.test(s)&&Number.isSafeInteger(n)&&n>=1&&n<=2147483647?{value:n}:{error:'Responsabile non valido.'}}
  case 'company':case 'contact':if(!UUID.test(s))return {error:fd.label+': riferimento non valido.'};if(o.selfId&&s===o.selfId)return {error:fd.key==='parent_company_id'?'Un’azienda non può essere capogruppo di sé stessa.':'Un contatto non può riportare a sé stesso.'};return {value:s};
  case 'money':{const c=euroToCents(s);return Number.isSafeInteger(c)&&c>=0&&c<=MAX_CENTS?{value:c}:{error:'Fatturato: scrivi un importo in euro, ad esempio 1.250.000.'}}
  case 'int':{const n=Number(s.replace(/[.\s]/g,''));return /^\d[\d.\s]*$/.test(s)&&Number.isSafeInteger(n)&&n<=MAX_EMPLOYEES?{value:n}:{error:'Dipendenti: un numero intero da 0 a 10.000.000.'}}
  case 'date':{if(!realDate(s))return {error:fd.label+': usa una data reale (AAAA-MM-GG).'};const today=new Date(o.now??Date.now()).toISOString().slice(0,10);if(s<'1900-01-01'||s>today)return {error:fd.label+': tra il 1900 e oggi.'};return {value:s}}
  case 'vat':return vat(s);
  case 'taxcode':return taxCode(s);
  case 'sdi':return sdi(s);
 }
 if(s.length>(fd.max||200)||(fd.type!=='area'&&CTRL.test(s)))return {error:fd.label+': massimo '+(fd.max||200)+' caratteri.'};
 if(fd.type==='email'&&!EMAIL.test(s))return {error:fd.label+': indirizzo email non valido.'};
 if(fd.type==='url'&&!/^https?:\/\/\S+$/i.test(s))return {error:fd.label+': indirizzo web non valido, inizia con https://'};
 if(fd.type==='zip'&&!/^[A-Za-z0-9][A-Za-z0-9 -]{1,19}$/.test(s))return {error:'CAP non valido.'};
 return {value:s};
}
/* Value shown in the form for a stored value. */
function formValue(kind,key,row){const fd=fieldOf(kind,key),v=row?row[key]:null;if(v==null)return '';if(fd&&fd.type==='money')return centsToEuro(v);if(fd&&fd.type==='date')return String(v).slice(0,10);return String(v)}
/* Display name of a contact from first and last name. */
function displayName(first,last){return [first,last].map(x=>String(x??'').trim()).filter(Boolean).join(' ').slice(0,200)}
/* Data for an update: added fields left as they are stored are not resent, so an archive
   without migration 011 still accepts the save of the other fields. A new record sends only
   the added fields that were filled in. */
function prune(kind,data,row){const out={...data};for(const k of ADDED[kind]||[]){if(!Object.hasOwn(out,k))continue;const before=row?(row[k]??null):null;if((out[k]==null&&before==null)||(out[k]!=null&&before!=null&&String(out[k])===String(before)))delete out[k]}return out}

/* ---------- «Dettagli» ---------- */
const label=(options,v)=>(options.find(([k])=>k===v)||[null,v])[1];
const nameOf=r=>r&&(r.name||r.title)||'';
const money=c=>'€ '+new Intl.NumberFormat('it-IT',{maximumFractionDigits:2}).format(Number(c)/100);
const itDate=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));return m?m[3]+'/'+m[2]+'/'+m[1]:String(s)};
/* Display text of one stored value; ctx: {companies, contacts, members} to show names, not ids. */
function display(kind,key,row,ctx){
 const fd=fieldOf(kind,key),v=row?row[key]:null;if(!fd||v==null||v==='')return '';
 const c=ctx||{};const find=(list,id)=>(Array.isArray(list)?list:[]).find(x=>String(x.id)===String(id));
 switch(fd.type){
  case 'select':return label(fd.options,v);
  case 'member':return nameOf(find(c.members,v))||'Membro n. '+v;
  case 'company':return nameOf(find(c.companies,v))||'Azienda collegata';
  case 'contact':return nameOf(find(c.contacts,v))||'Contatto collegato';
  case 'money':return Number.isFinite(Number(v))?money(v):'';
  case 'int':return Number.isFinite(Number(v))?new Intl.NumberFormat('it-IT').format(Number(v)):'';
  case 'date':return itDate(v);
 }
 return String(v).trim();
}
/* Non-empty fields grouped by section; `skip` lists keys already shown elsewhere. */
function details(kind,row,ctx,skip){
 const omit=new Set(skip||[]);
 return (SECTIONS[kind]||[]).map(s=>({id:s.id,label:s.label,items:s.fields.filter(x=>!omit.has(x.key)).map(x=>{const text=display(kind,x.key,row,ctx);return text?{key:x.key,label:x.label,text,type:x.type,ref:['company','contact'].includes(x.type)?row[x.key]:null}:null}).filter(Boolean)})).filter(s=>s.items.length);
}

/* Free text («Sales Manager EMEA», «Software house») → the voice of the list, or null when no word
   points to one. A voice written with other capitals or accents is the voice itself. */
const plain=v=>String(v??'').normalize('NFD').replace(/\p{M}/gu,'').replace(/[’']/g,'\'').toLocaleLowerCase('it').trim();
function classify(kind,key,text){
 const list=kind==='companies'&&key==='industry'?INDUSTRY_LIST:kind==='contacts'&&key==='role'?ROLE_LIST:null;const t=plain(text);if(!list||!t)return null;
 for(const [l] of list)if(plain(l)===t)return l;
 for(const [l,re] of list)if(re&&re.test(t))return l;
 return null}
const api={ACCOUNT_TYPES,RATINGS,INDUSTRIES,ROLES,classify,SECTIONS,FIELDS,ADDED,MAX_CENTS,MAX_EMPLOYEES,fieldOf,supported,vat,taxCode,sdi,pivaChecksum,cfChecksum,euroToCents,centsToEuro,parse,formValue,displayName,prune,display,details};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmFields=api;
})(typeof globalThis!=='undefined'?globalThis:this);
