/* RADIX Accounting — Italian periodic VAT (liquidazione IVA) and registers, from the VAT rows that
   RadixPosting produces. Output follows the LIPE quadro VP fields so the partner professional can file it.
   Rows: {register:'vendite'|'acquisti',date,rate,nature,taxable_cents,vat_cents,deductible_vat_cents,exigibility:'I'|'D'|'S',paid_date}. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixVAT=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MIN_PAYMENT=2582; // 25,82 €: below this the debit moves to the next period (art. 1 c.4 DPR 100/1998).
const QUARTER_INTEREST=1; // 1% for quarterly filers (art. 7 DPR 542/1999).
const pad=n=>String(n).padStart(2,'0');
const lastDay=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
// Settlement periods of a year with dates, F24 tax code and due date (16th; Q2 moved to 20 August; Q4 with the annual balance on 16 March).
function periods(year,periodicity){
 const y=+year;if(!Number.isInteger(y)||y<2000||y>2100)throw new Error('Anno non valido.');
 if(periodicity==='monthly')return Array.from({length:12},(_,i)=>{const m=i+1,ny=m===12?y+1:y,nm=m===12?1:m+1;return {key:y+'-M'+pad(m),label:MONTHS[i]+' '+y,from:y+'-'+pad(m)+'-01',to:y+'-'+pad(m)+'-'+pad(lastDay(y,m)),f24_code:'60'+pad(m),due:ny+'-'+pad(nm)+'-16',interest_pct:0};});
 if(periodicity==='quarterly')return [1,2,3,4].map(q=>{const m1=(q-1)*3+1,m3=q*3;return {key:y+'-T'+q,label:q+'° trimestre '+y,from:y+'-'+pad(m1)+'-01',to:y+'-'+pad(m3)+'-'+pad(lastDay(y,m3)),f24_code:q<4?'603'+q:'6099',due:q===1?y+'-05-16':q===2?y+'-08-20':q===3?y+'-11-16':(y+1)+'-03-16',interest_pct:q<4?QUARTER_INTEREST:0};});
 throw new Error('Periodicità non valida: mensile o trimestrale.');
}
const MONTHS=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
function periodOf(date,periodicity){const y=+date.slice(0,4),m=+date.slice(5,7);return periodicity==='monthly'?y+'-M'+pad(m):y+'-T'+Math.ceil(m/3);}
// When a row's VAT counts: deferred VAT (D) at payment, split payment (S) never for the seller, otherwise at registration.
function vatDate(r){if(r.register==='vendite'&&r.exigibility==='S')return null;if(r.register==='vendite'&&r.exigibility==='D')return r.paid_date||deferredLimit(r.date);return r.date;}
// Deferred VAT becomes due anyway one year after the operation.
function deferredLimit(d){const t=new Date(d+'T12:00:00Z');t.setUTCFullYear(t.getUTCFullYear()+1);return t.toISOString().slice(0,10);}
// Registers grouped by rate/nature for a range.
function registers(rows,{from,to}={}){
 const out={vendite:new Map(),acquisti:new Map()};
 for(const r of rows||[]){if((from&&r.date<from)||(to&&r.date>to))continue;const m=out[r.register];if(!m)continue;
  const k=(r.nature||'')+'|'+r.rate,t=m.get(k)||{rate:r.rate,nature:r.nature||null,taxable_cents:0,vat_cents:0,deductible_vat_cents:0,count:0};
  t.taxable_cents+=r.taxable_cents;t.vat_cents+=r.vat_cents;t.deductible_vat_cents+=r.deductible_vat_cents||0;t.count++;m.set(k,t);}
 const list=m=>[...m.values()].sort((a,b)=>b.rate-a.rate||String(a.nature).localeCompare(String(b.nature)));
 return {vendite:list(out.vendite),acquisti:list(out.acquisti)};
}
/* Liquidazione of one period.
   o: {periodicity, period (key from periods()), previousDebit_cents (debito non versato < 25,82), previousCredit_cents (credito periodo precedente),
       yearCredit_cents (credito anno precedente usato), advance_cents (acconto versato, solo dicembre/4° trimestre)} */
function settle(rows,o){
 const p=periods(o.period.slice(0,4),o.periodicity).find(x=>x.key===o.period);if(!p)throw new Error('Periodo non valido.');
 let vp2=0,vp3=0,vp4=0,vp5=0;
 for(const r of rows||[]){
  if(r.register==='vendite'){if(r.date>=p.from&&r.date<=p.to)vp2+=r.taxable_cents;const d=vatDate(r);if(d&&d>=p.from&&d<=p.to)vp4+=r.vat_cents;}
  else if(r.register==='acquisti'&&r.date>=p.from&&r.date<=p.to){vp3+=r.taxable_cents;vp5+=r.deductible_vat_cents||0;}
 }
 const vp6=vp4-vp5,vp7=Math.max(0,o.previousDebit_cents||0),vp8=Math.max(0,o.previousCredit_cents||0),vp9=Math.max(0,o.yearCredit_cents||0),vp13=Math.max(0,o.advance_cents||0);
 const before=vp6+vp7-vp8-vp9;
 const vp12=before>0&&p.interest_pct?Math.round(before*p.interest_pct/100):0;
 const vp14=before+vp12-vp13;
 const payable=vp14>=MIN_PAYMENT?vp14:0;
 return {period:p,vp2_cents:vp2,vp3_cents:vp3,vp4_cents:vp4,vp5_cents:vp5,vp6_cents:vp6,vp7_cents:vp7,vp8_cents:vp8,vp9_cents:vp9,vp12_cents:vp12,vp13_cents:vp13,vp14_cents:vp14,
  payable_cents:payable,carry_debit_cents:vp14>0&&!payable?vp14:0,carry_credit_cents:vp14<0?-vp14:0,
  status:vp14<0?'credito':payable?'da versare':vp14>0?'sotto soglia: si somma al periodo successivo':'a zero',f24_code:payable?p.f24_code:null,due:payable?p.due:null};
}
// Runs a whole year in order, carrying debits under the threshold and credits to the next period.
function settleYear(rows,{year,periodicity,openingCredit_cents=0,advance_cents=0}){
 const out=[];let debit=0,credit=0;const list=periods(year,periodicity);
 list.forEach((p,i)=>{const r=settle(rows,{periodicity,period:p.key,previousDebit_cents:debit,previousCredit_cents:credit,yearCredit_cents:i===0?openingCredit_cents:0,advance_cents:i===list.length-1?advance_cents:0});out.push(r);debit=r.carry_debit_cents;credit=r.carry_credit_cents;});
 return out;
}
// Journal entry that closes VAT accounts into Erario c/IVA for a settlement (girocono IVA).
function settlementEntry(s,{vatCredit='02.10',vatDebit='04.10',settlement='02.11'}={}){
 const lines=[];if(s.vp4_cents)lines.push({account:vatDebit,debit_cents:s.vp4_cents,credit_cents:0});if(s.vp5_cents)lines.push({account:vatCredit,debit_cents:0,credit_cents:s.vp5_cents});
 const diff=s.vp4_cents-s.vp5_cents;if(diff>0)lines.push({account:settlement,debit_cents:0,credit_cents:diff});if(diff<0)lines.push({account:settlement,debit_cents:-diff,credit_cents:0});
 return lines.length>=2?{date:s.period.to,description:'Liquidazione IVA '+s.period.label,status:'draft',source:{type:'vat',period:s.period.key},lines}:null;
}
return {MIN_PAYMENT,periods,periodOf,registers,settle,settleYear,settlementEntry,vatDate};
});
