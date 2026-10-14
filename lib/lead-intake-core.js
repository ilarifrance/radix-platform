'use strict';
(function(root){
 const FIELDS=['name','domain','country','industry','companySize','contactRole','source'];
 const ENRICH=['domain','country','industry','companySize','contactRole'];
 const trim=x=>String(x??'').normalize('NFKC').trim();
 const normalized=x=>trim(x).toLocaleLowerCase('it').replace(/\s+/g,' ');
 function domain(x){
  let s=trim(x).toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split(/[/?#:]/,1)[0];
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(s)&&s.length<=253?s:'';
 }
 function linkedinUrl(value){
  const raw=trim(value);if(raw.length>2400)throw Error('URL troppo lungo');
  let u;try{u=new URL(raw)}catch{throw Error('Incolla un URL completo https://linkedin.com/...')}
  const host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||!(host==='linkedin.com'||host.endsWith('.linkedin.com'))||u.port)throw Error('Inserisci un URL HTTPS autentico di LinkedIn');
  const p=u.pathname.replace(/\/+$/,'')||'/';
  const kind=/^\/sales\/(?:search|lists)\//i.test(p)?'sales-list':/^\/(?:company|school)\/[^/]+$/i.test(p)?'company':/^\/in\/[^/]+$/i.test(p)?'person':null;
  if(!kind)throw Error('URL supportati: ricerche/liste Sales Navigator, aziende e profili LinkedIn');
  u.hash='';if(u.toString().length>2400)throw Error('URL troppo lungo');
  return {url:u.toString(),kind,slug:kind==='company'?decodeURIComponent(p.split('/')[2]||''):''};
 }
 function clean(row){
  const out={};for(const f of FIELDS)out[f]=trim(row?.[f]);
  if(!out.name&&!out.domain)throw Error('Ogni prospect deve avere un nome azienda o un dominio');
  if(Object.values(out).some(v=>v.length>2000))throw Error('Campo troppo lungo');
  return out;
 }
 function identity(row){
  const d=domain(row.domain);if(d)return 'domain:'+d;
  const n=normalized(row.name),c=normalized(row.country);return n&&c?'name-country:'+n+'|'+c:'';
 }
 function link(rows,importSource){
  const source=linkedinUrl(importSource).url;
  // Save provenance per prospect when missing. A Sales Navigator search can exceed 500 characters:
  // retain the stable base path; never claim a search page is a verified company source.
  const cleanSource=source.split('?')[0].slice(0,500);
  return rows.map(raw=>{const r=clean(raw);if(!r.source)r.source=cleanSource;return r});
 }
 function plan(current,supplement,sourceOverride=''){
  if(!Array.isArray(current)||!Array.isArray(supplement))throw Error('Le liste non sono valide');
  if(current.length>250||supplement.length>250)throw Error('Massimo 250 righe per lista');
  const byDomain=new Map(),byName=new Map();
  const add=(map,key,index)=>{if(!key)return;const x=map.get(key)||[];x.push(index);map.set(key,x)};
  current.forEach((raw,i)=>{const r=clean(raw);add(byDomain,domain(r.domain),i);add(byName,normalized(r.name),i)});
  const suggestions=[],unmatched=[],ambiguous=[];
  for(let j=0;j<supplement.length;j++){
   const r=clean(supplement[j]);
   const d=domain(r.domain),n=normalized(r.name),matches=d&&byDomain.has(d)?byDomain.get(d):n&&byName.has(n)?byName.get(n):[];
   if(!matches.length){unmatched.push(j+1);continue}
   if(matches.length!==1){ambiguous.push(j+1);continue}
   const i=matches[0],existing=clean(current[i]);
   // Reject a contradictory, nonempty domain/name even on an exact-name match.
   if(d&&domain(existing.domain)&&d!==domain(existing.domain)){ambiguous.push(j+1);continue}
   let source=trim(r.source)||trim(sourceOverride);
   try{if(source){const u=new URL(source);if(u.protocol!=='https:'||u.username||u.password||!u.hostname||source.length>1600)throw Error();}else source='';}
   catch{source='';}
   for(const f of ENRICH){
    if(trim(existing[f])||!trim(r[f]))continue;
    if(trim(r[f]).length>250)continue;
    suggestions.push({index:i,field:f,value:trim(r[f]),source:source||'Fonte non indicata',from:j+1,company:existing.name||existing.domain,match:d?'dominio':'nome univoco',verified:false});
   }
  }
  const seen=new Set();const unique=suggestions.filter(x=>{const k=x.index+':'+x.field;if(seen.has(k))return false;seen.add(k);return true});
  return{suggestions:unique,unmatched,ambiguous};
 }
 function apply(rows,selected){
  if(!Array.isArray(selected)||selected.length>400)throw Error('Troppi aggiornamenti');
  const updated=rows.map(clean),evidence=[],used=new Set();
  for(const s of selected){
   if(!Number.isInteger(s.index)||s.index<0||s.index>=updated.length||!ENRICH.includes(s.field))throw Error('Suggerimento non valido');
   const key=s.index+':'+s.field;if(used.has(key))throw Error('Suggerimento duplicato');used.add(key);
   if(updated[s.index][s.field])throw Error('Il campo non è più vuoto: ricalcola i suggerimenti');
   const value=trim(s.value);if(!value||value.length>250)throw Error('Valore non valido');
   updated[s.index][s.field]=value;
   evidence.push({index:s.index,field:s.field,value,source:trim(s.source).slice(0,1600),method:'confronto-import',confirmedAt:new Date().toISOString()});
  }
  return{rows:updated,evidence};
 }
 function fromAgentExport(json,expectedUrl){
  let value=typeof json==='string'?JSON.parse(json):json;
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Il file agente deve contenere un oggetto JSON');
  const keys=Object.keys(value);
  if(keys.some(k=>!['version','sourceUrl','companies'].includes(k)))throw Error('Schema agente non riconosciuto');
  if(value.version!==1||!Array.isArray(value.companies)||value.companies.length<1||value.companies.length>250)throw Error('Versione o numero aziende non valido');
  const expected=linkedinUrl(expectedUrl),declared=linkedinUrl(value.sourceUrl);
  if(expected.url!==declared.url)throw Error('La fonte nel file differisce dall’URL inserito in RADIX');
  const rows=value.companies.map((item,i)=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!FIELDS.includes(k)))throw Error('Riga '+(i+1)+': schema non valido');
    if(FIELDS.some(f=>item[f]!==undefined&&typeof item[f]!=='string'))throw Error('Riga '+(i+1)+': campo non testuale');
    const row=clean(item);row.source=trim(row.source)||declared.url.split('?')[0].slice(0,500);
    if(row.source.length>500)throw Error('Riga '+(i+1)+': fonte troppo lunga');
    if(row.source.startsWith('https://')&&/linkedin\.com/i.test(row.source))linkedinUrl(row.source);
    return row;
  });
  return rows;
 }
 const api={FIELDS,ENRICH,domain,linkedinUrl,link,plan,apply,fromAgentExport};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLeadIntakeCore=api;
})(typeof window!=='undefined'?window:globalThis);
