/* RADIX bank CSV — parses statements exported by Italian banks into signed cent movements.
   Pure functions (no DOM, no I/O). Amounts are integer euro cents (+ in, - out), dates YYYY-MM-DD. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixBankCSV=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MAX_WARNINGS=20;
const norm=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[\s ]+/g,' ').trim().replace(/[.:]+$/,'');
// Synonyms in priority order (first listed wins when several columns match).
const FIELDS={
 date:['data contabile','data operazione','data registrazione','booking date','data','date'],
 value_date:['data valuta','valuta','value date'],
 description:['descrizione','causale','descrizione operazione','dettagli','description','operazione','movimento'],
 amount:['importo','importo (eur)','importo eur','importo (€)','importo €','amount','ammontare'],
 debit:['dare','uscite','addebiti','debit','addebito','importo dare'],
 credit:['avere','entrate','accrediti','credit','accredito','importo avere'],
 currency:['divisa','valuta divisa','currency']
};
const collapse=s=>String(s==null?'':s).replace(/[\s ]+/g,' ').trim();

function splitCsv(text,delim){
 const rows=[];let row=[],cell='',q=false,line=1,start=1,touched=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else{if(c==='\n')line++;cell+=c}continue}
  if(c==='"'&&cell.trim()===''){q=true;cell='';touched=true}
  else if(c===delim){row.push(cell);cell='';touched=true}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push({line:start,cells:row});row=[];cell='';touched=false;line++;start=line}
  else{cell+=c;touched=true}
 }
 if(touched||cell)row.push(cell),rows.push({line:start,cells:row});
 return rows;
}

function mapHeader(cells){
 const names=cells.map(norm),idx={};
 for(const[f,syn]of Object.entries(FIELDS)){
  for(const s of syn){const j=names.findIndex((n,k)=>n===s&&!Object.values(idx).includes(k));if(j>=0){idx[f]=j;break}}
 }
 return idx.date!=null&&(idx.amount!=null||idx.debit!=null||idx.credit!=null)?idx:null;
}

const DIM=[31,28,31,30,31,30,31,31,30,31,30,31];
function parseDate(s){
 const t=String(s==null?'':s).trim();let y,m,d,x;
 if((x=/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t)))[y,m,d]=[+x[1],+x[2],+x[3]];
 else if((x=/^(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})(?:\s.*)?$/.exec(t)))[d,m,y]=[+x[1],+x[3],x[4].length===2?2000+ +x[4]:+x[4]];
 else return null;
 const leap=y%4===0&&(y%100!==0||y%400===0);
 if(m<1||m>12||d<1||d>(m===2&&leap?29:DIM[m-1]))return null;
 return`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// Integer + fraction digit strings -> cents, rounding half away from zero (sign applied by caller).
const toCents=(int,frac)=>{const f=(frac||'')+'000';return Number(int||'0')*100+Number(f.slice(0,2))+(f.charCodeAt(2)>=53?1:0)};
function parseAmount(s){
 let t=String(s==null?'':s).replace(/[\s ']/g,'').replace(/€|eur/gi,'').replace(/−/g,'-');
 if(!t)return null;let neg=false;
 if(/^\(.*\)$/.test(t)){neg=true;t=t.slice(1,-1)}
 if(/^[+-]/.test(t)){neg=neg!==(t[0]==='-');t=t.slice(1)}
 else if(/[+-]$/.test(t)){neg=neg!==(t.endsWith('-'));t=t.slice(0,-1)}
 if(!/^[\d.,]+$/.test(t)||!/\d/.test(t))return null;
 const ld=t.lastIndexOf('.'),lc=t.lastIndexOf(','),hasD=ld>=0,hasC=lc>=0;let int,frac='';
 if(hasD&&hasC){const dec=ld>lc?'.':',',th=dec==='.'?',':'.',p=t.lastIndexOf(dec);if(t.slice(p+1).includes(th))return null;int=t.slice(0,p).split(th).join('');frac=t.slice(p+1);if(int.includes(dec))return null}
 else if(hasD||hasC){
  const sep=hasD?'.':',',parts=t.split(sep),last=parts[parts.length-1];
  // '1.234' / '1.234.567' are thousands; '1.23' / '0.125' are decimals
  if(parts.length>2||(last.length===3&&parts[0].length<=3&&!/^0*$/.test(parts[0]))){if(parts.slice(1).some(p=>p.length!==3))return null;int=parts.join('')}
  else{int=parts[0];frac=last}
 }else int=t;
 if(!/^\d*$/.test(int)||!/^\d*$/.test(frac)||!(int||frac))return null;
 const v=toCents(int,frac);return neg&&v!==0?-v:v;
}

const fingerprint=row=>`${row.date}|${row.amount_cents}|${collapse(row.description).toLowerCase()}`;

function parseStatement(text,options={}){
 let s=String(text==null?'':text);if(s.charCodeAt(0)===0xFEFF)s=s.slice(1);
 const cands=options.delimiter?[options.delimiter]:[';',',','\t'];let best=null;
 for(const d of cands){
  const rows=splitCsv(s,d);
  for(let i=0;i<rows.length&&i<60;i++){
   const idx=mapHeader(rows[i].cells);
   if(idx){const score=rows[i].cells.filter(c=>c.trim()).length;if(!best||score>best.score)best={d,rows,i,idx,score};break}
  }
 }
 if(!best)throw new Error('Intestazione non riconosciuta: servono almeno data e importo');
 const{d,rows,i:hi,idx}=best,head=rows[hi].cells,out=[],warnings=[];let dropped=0;
 const columns={};for(const f of Object.keys(FIELDS))columns[f]=idx[f]!=null?collapse(head[idx[f]]):null;
 const warn=m=>{dropped++;if(warnings.length<MAX_WARNINGS)warnings.push(m)};
 for(const r of rows.slice(hi+1)){
  const c=r.cells;if(c.every(x=>!x.trim()))continue;
  const get=f=>idx[f]!=null&&c[idx[f]]!=null?c[idx[f]].trim():'';
  const date=parseDate(get('date'));
  if(!date){if(/\b(saldo|totale|totali|total|balance)\b/i.test(c.join(' ')))continue;warn(`Riga ${r.line}: data non valida "${get('date')}"`);continue}
  let amount=null;
  if(idx.amount!=null&&get('amount'))amount=parseAmount(get('amount'));
  else if(idx.debit!=null||idx.credit!=null){
   const dr=get('debit'),cr=get('credit'),dv=dr?parseAmount(dr):0,cv=cr?parseAmount(cr):0;
   if((dr||cr)&&dv!=null&&cv!=null)amount=Math.abs(cv)-Math.abs(dv);
  }
  if(amount==null){warn(`Riga ${r.line}: importo non valido "${get('amount')||[get('debit'),get('credit')].filter(Boolean).join(' / ')}"`);continue}
  out.push({line:r.line,date,value_date:parseDate(get('value_date')),description:collapse(get('description')),amount_cents:amount,currency:(get('currency')||'EUR').toUpperCase()});
 }
 if(dropped>MAX_WARNINGS)warnings.push(`Altre ${dropped-MAX_WARNINGS} righe scartate`);
 return{rows:out,columns,delimiter:d,warnings};
}

return{parseStatement,parseDate,parseAmount,fingerprint};
});
