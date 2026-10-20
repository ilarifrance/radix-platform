'use strict';
/* CSV for the CRM: parse (comma or semicolon, quoted fields), export with spreadsheet-formula
   protection, and column mapping for contacts and companies (Italian and English headers). */
(function(root){
const MAX_ROWS=1000;
function delimiterOf(line){const c=(line.match(/,/g)||[]).length,s=(line.match(/;/g)||[]).length,t=(line.match(/\t/g)||[]).length;return t>c&&t>s?'\t':s>c?';':','}
function parse(text){
 text=String(text||'').replace(/^﻿/,'');const d=delimiterOf(text.split(/\r?\n/,1)[0]||'');
 const rows=[];let row=[],cell='',q=false;
 for(let i=0;i<text.length;i++){const ch=text[i];
  if(q){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=ch;continue}
  if(ch==='"'&&cell==='')q=true;else if(ch===d){row.push(cell);cell=''}
  else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()))rows.push(row);row=[];if(rows.length>MAX_ROWS+1)throw Error('Massimo '+MAX_ROWS+' righe per importazione.')}
  else cell+=ch}
 row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 if(rows.length>MAX_ROWS+1)throw Error('Massimo '+MAX_ROWS+' righe per importazione.');
 const headers=(rows.shift()||[]).map(h=>h.trim());
 return {headers,rows:rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]??'').trim()])))};
}
// A cell starting with = + - @ (or tab/CR) is a formula in spreadsheets: prefix it so it stays text.
function safe(v){const s=v==null?'':String(v);return /^[=+\-@\t\r]/.test(s)?"'"+s:s}
function toCsv(rows,columns){
 const esc=v=>{const s=safe(v);return /[";\n\r,]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
 return '﻿'+[columns.map(c=>esc(c.label)).join(';'),...rows.map(r=>columns.map(c=>esc(typeof c.value==='function'?c.value(r):r[c.key])).join(';'))].join('\r\n');
}
const norm=s=>String(s).normalize('NFKC').trim().toLocaleLowerCase('it').replace(/[\s_.-]/g,'');
const ALIASES={
 contacts:{name:['nome','name','nomecompleto','fullname','contatto','contact'],first:['firstname','nomeproprio'],last:['lastname','cognome','surname'],role:['ruolo','role','jobtitle','titolo','position','posizione'],email:['email','mail','emailaddress','posta'],phone:['telefono','phone','tel','cellulare','mobile'],linkedin_url:['linkedin','linkedinurl','profilolinkedin','profileurl'],company:['azienda','company','companyname','societa','società','organizzazione'],notes:['note','notes']},
 companies:{name:['azienda','nome','name','company','companyname','ragionesociale','societa','società'],industry:['settore','industry'],website:['sito','website','sitoweb','url','dominio','domain'],email:['email','mail'],phone:['telefono','phone','tel'],city:['citta','città','city','comune','sede'],notes:['note','notes']}
};
const LIMITS={name:200,role:120,email:254,phone:40,linkedin_url:300,notes:4000,industry:120,website:300,city:120,company:200};
/* Fields of migration sales 011 (crm-fields-core.js), with Italian and English (Salesforce export) headers.
   Read only with opts.extended: an archive without 011 refuses them. */
const ADDR=(p,it,en)=>({[p+'street']:[...it.map(x=>'indirizzo'+x),...it.map(x=>'via'+x),...en.map(x=>x+'street'),...en.map(x=>x+'address')],[p+'zip']:[...it.map(x=>'cap'+x),...en.map(x=>x+'postalcode'),...en.map(x=>x+'zip'),...en.map(x=>x+'zipcode')],[p+'city']:[...it.map(x=>'citta'+x),...it.map(x=>'città'+x),...en.map(x=>x+'city')],[p+'province']:[...it.map(x=>'provincia'+x),...it.map(x=>'prov'+x),...en.map(x=>x+'state'),...en.map(x=>x+'province')],[p+'country']:[...it.map(x=>'paese'+x),...it.map(x=>'nazione'+x),...en.map(x=>x+'country')]});
const EXTENDED={
 contacts:{first_name:['firstname','nomeproprio'],last_name:['lastname','cognome','surname'],title:['qualifica','title','titolo professionale'.replace(/\s/g,'')],department:['reparto','department','ufficio'],division:['dipartimento','divisione','division'],
  mobile:['cellulare','mobile','mobilephone','cell','telefonocellulare'],phone:['telefono','phone','tel','telefonoufficio','businessphone','phonenumber'],
  street:['indirizzo','via','street','address','mailingstreet'],zip:['cap','zip','zipcode','postalcode','mailingpostalcode','codicepostale'],city:['citta','città','city','comune','mailingcity'],province:['provincia','prov','province','state','mailingstate'],country:['paese','nazione','country','mailingcountry'],
  birthdate:['datadinascita','birthdate','birthday','datanascita','nascita'],lead_source:['origine','fonte','leadsource','originecontatto','fontecontatto'],preferred_language:['lingua','linguapreferita','language','preferredlanguage']},
 companies:{division:['dipartimento','divisione','division'],legal_name:['ragionesociale','legalname','denominazione'],account_type:['tipo','tipoazienda','tipologia','type','accounttype'],rating:['valutazione','rating','temperatura'],
  annual_revenue_cents:['fatturato','fatturatoannuo','annualrevenue','revenue','ricavi'],employees:['dipendenti','numerodipendenti','addetti','employees','numberofemployees'],
  ...ADDR('billing_',['fatturazione'],['billing']),...ADDR('shipping_',['spedizione'],['shipping']),
  vat_number:['partitaiva','piva','vat','vatnumber','vatid','partitaivacee'],tax_code:['codicefiscale','cf','taxcode','fiscalcode'],pec:['pec','emailpec','indirizzopec'],sdi_code:['sdi','codicesdi','codicedestinatario','codiceunivoco','sdicode'],description:['descrizione','description']}
};
// Spreadsheet words for the two lists, in Italian and English.
const VALUE_WORDS={account_type:{cliente:'cliente',customer:'cliente',prospect:'prospect',potenziale:'prospect',partner:'partner',fornitore:'fornitore',supplier:'fornitore',vendor:'fornitore',altro:'altro',other:'altro'},rating:{calda:'calda',caldo:'calda',hot:'calda',tiepida:'tiepida',tiepido:'tiepida',warm:'tiepida',fredda:'fredda',freddo:'fredda',cold:'fredda'}};
// «31/12/1980», «31.12.1980», «1980-12-31» → 1980-12-31.
function isoDate(v){const s=String(v||'').trim();let m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s);if(m)return m[1]+'-'+m[2]+'-'+m[3];m=/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):s}
const fieldsCore=()=>root.RadixCrmFields||(typeof require==='function'?require('./crm-fields-core.js'):null);
/* opts.extended: also read the 011 fields. A value the CRM would refuse (Partita IVA with a wrong check
   digit, unknown type…) is left out of that row and listed in `warnings`; the row is still imported. */
function mapRows(kind,parsed,opts){
 const ext=!!(opts&&opts.extended)&&!!EXTENDED[kind];
 const a=ext?{...ALIASES[kind],...EXTENDED[kind]}:ALIASES[kind];const col={};
 if(ext&&kind==='companies')a.name=[...ALIASES.companies.name.filter(x=>x!=='ragionesociale'),'accountname','nomeazienda'];
 if(ext&&kind==='contacts'){a.name=ALIASES.contacts.name;delete a.first;delete a.last}
 const warnings=[];
 for(const [field,names] of Object.entries(a)){const h=parsed.headers.find(x=>names.includes(norm(x)));if(h)col[field]=h}
 const out=[],skipped=[];
 parsed.rows.forEach((r,i)=>{const o={};
  for(const f of Object.keys(a))if(col[f]&&r[col[f]])o[f]=r[col[f]].slice(0,LIMITS[f]||200);
  if(ext){
   const F=fieldsCore();
   if(kind==='contacts'){
    // «Nome» beside «Cognome» is the first name: the display name becomes «Nome Cognome».
    if(o.last_name&&o.name&&!o.first_name&&!o.name.includes(o.last_name))o.first_name=o.name;
    if(!o.name&&(o.first_name||o.last_name))o.name=[o.first_name,o.last_name].filter(Boolean).join(' ').slice(0,200);
    else if(o.name&&o.last_name&&!o.name.includes(o.last_name))o.name=(o.name+' '+o.last_name).slice(0,200);
    if(o.birthdate)o.birthdate=isoDate(o.birthdate);
   }
   if(kind==='companies'&&!o.name&&o.legal_name)o.name=o.legal_name.slice(0,200);
   // Settore and Ruolo are closed lists: free text goes to the nearest voice. The exact job title
   // stays in Qualifica; a sector no word points to becomes «Altro» and is reported.
   if(F&&kind==='contacts'&&o.role){const v=F.classify('contacts','role',o.role);if(!o.title&&v!==o.role)o.title=o.role.slice(0,120);if(v)o.role=v;else delete o.role}
   if(F&&kind==='companies'&&o.industry){const v=F.classify('companies','industry',o.industry);if(!v)warnings.push({line:i+2,field:'industry',why:'settore «'+o.industry.slice(0,40)+'» messo in Altro'});o.industry=v||'Altro'}
   for(const k of Object.keys(EXTENDED[kind])){
    if(o[k]===undefined||['phone'].includes(k))continue;
    if(VALUE_WORDS[k])o[k]=VALUE_WORDS[k][String(o[k]).normalize('NFKC').trim().toLocaleLowerCase('it')]||o[k];
    if(k==='annual_revenue_cents'){const c=F?F.euroToCents(o[k]):NaN;if(Number.isSafeInteger(c)&&c>=0){o[k]=c;continue}warnings.push({line:i+2,field:k,why:'fatturato non leggibile'});delete o[k];continue}
    if(!F){delete o[k];continue}
    const res=F.parse(kind,k,o[k]);if(res.error){warnings.push({line:i+2,field:k,why:res.error});delete o[k]}else if(res.value==null)delete o[k];else o[k]=res.value;
   }
  }else{
   if(!o.name&&(o.first||o.last))o.name=[o.first,o.last].filter(Boolean).join(' ');
   else if(o.name&&o.last&&!o.name.includes(o.last))o.name=(o.name+' '+o.last).slice(0,200);
  }
  delete o.first;delete o.last;
  // «Campi aggiunti» (015): opts.custom = { field id: header } from crm-custom-fields.js columnsFor().
  if(opts&&opts.custom){const cu={};for(const [id,h] of Object.entries(opts.custom)){const v=String(r[h]??'').trim();if(v)cu[id]=v.slice(0,500)}if(Object.keys(cu).length)o.custom=cu}
  if(o.website&&!/^https?:\/\//i.test(o.website))o.website='https://'+o.website.replace(/^\/+/,'');
  if(o.linkedin_url&&!/^https?:\/\//i.test(o.linkedin_url))o.linkedin_url='https://'+o.linkedin_url.replace(/^\/+/,'');
  if(o.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)){skipped.push({line:i+2,why:'email non valida'});return}
  if(!o.name){skipped.push({line:i+2,why:'nome mancante'});return}
  out.push(o)});
 // Headers that fill nothing: shown before the import, so a missing «Aggiungi campo» is noticed.
 const used=new Set([...Object.values(col),...Object.values((opts&&opts.custom)||{})]);
 const unknown=parsed.headers.filter(h=>h&&!used.has(h));
 return ext?{rows:out,skipped,columns:col,warnings,unknown}:{rows:out,skipped,columns:col,unknown};
}
/* Rows of a sheet (header first, arrays of cell texts) → the same shape as parse(). */
function fromRows(rows){
 const all=(rows||[]).map(r=>(r||[]).map(x=>String(x??'')));
 if(all.length>MAX_ROWS+1)throw Error('Massimo '+MAX_ROWS+' righe per importazione.');
 const headers=(all.shift()||[]).map(h=>h.trim());
 return {headers,rows:all.filter(r=>r.some(x=>x.trim())).map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]??'').trim()])))};
}
const isXlsx=f=>/\.xlsx$/i.test(String(f&&f.name||''));
/* A file chosen for import: CSV (up to 2 MB) or Excel .xlsx (first sheet, up to 3 MB, via lib/lead-xlsx-parser.js). */
async function readFile(file){
 if(isXlsx(file)){
  if(file.size>3e6)throw Error('File troppo grande: massimo 3 MB per Excel.');
  if(!root.RadixLeadXlsx||!root.RadixLeadXlsx.readRows)throw Error('Lettore Excel non disponibile: aggiorna la pagina.');
  return fromRows(await root.RadixLeadXlsx.readRows(await file.arrayBuffer(),{maxRows:MAX_ROWS+1}));
 }
 if(/\.xls$/i.test(String(file&&file.name||'')))throw Error('Il vecchio formato .xls non è letto: da Excel salva come .xlsx o CSV.');
 if(file.size>2e6)throw Error('File troppo grande: massimo 2 MB.');
 return parse(await file.text());
}
const ACCEPT='.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const api={parse,toCsv,mapRows,safe,isoDate,MAX_ROWS,EXTENDED,fromRows,readFile,ACCEPT};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.RadixCrmCsv=api;
})(typeof globalThis!=='undefined'?globalThis:this);
