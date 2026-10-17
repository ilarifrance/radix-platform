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
function mapRows(kind,parsed){
 const a=ALIASES[kind];const col={};
 for(const [field,names] of Object.entries(a)){const h=parsed.headers.find(x=>names.includes(norm(x)));if(h)col[field]=h}
 const out=[],skipped=[];
 parsed.rows.forEach((r,i)=>{const o={};
  for(const f of Object.keys(a))if(col[f]&&r[col[f]])o[f]=r[col[f]].slice(0,LIMITS[f]||200);
  if(!o.name&&(o.first||o.last))o.name=[o.first,o.last].filter(Boolean).join(' ');
  else if(o.name&&o.last&&!o.name.includes(o.last))o.name=(o.name+' '+o.last).slice(0,200);
  delete o.first;delete o.last;
  if(o.website&&!/^https?:\/\//i.test(o.website))o.website='https://'+o.website.replace(/^\/+/,'');
  if(o.linkedin_url&&!/^https?:\/\//i.test(o.linkedin_url))o.linkedin_url='https://'+o.linkedin_url.replace(/^\/+/,'');
  if(o.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)){skipped.push({line:i+2,why:'email non valida'});return}
  if(!o.name){skipped.push({line:i+2,why:'nome mancante'});return}
  out.push(o)});
 return {rows:out,skipped,columns:col};
}
const api={parse,toCsv,mapRows,safe,MAX_ROWS};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.RadixCrmCsv=api;
})(typeof globalThis!=='undefined'?globalThis:this);
