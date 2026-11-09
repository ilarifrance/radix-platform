/* RADIX Accounting — proposes the journal entry, VAT register rows and open items (scadenze) for an invoice
   parsed by RadixFatturaPA. Proposals are never posted automatically: a person confirms them.
   direction 'purchase' (fattura passiva) or 'sale' (fattura attiva). Amounts in cents. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./chart-of-accounts'):root.RadixChartOfAccounts);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPosting=api})(typeof globalThis!=='undefined'?globalThis:this,function(coa){
'use strict';
const S=coa.SYSTEM;
const CREDIT_NOTES=new Set(['TD04','TD08']);
const isRC=s=>typeof s.nature==='string'&&s.nature.startsWith('N6');
// Splits `total` across weights proportionally; the rounding remainder goes to the largest share.
function allocate(total,weights){
 const sum=weights.reduce((a,b)=>a+Math.abs(b),0);if(!sum)return weights.map((_,i)=>i===0?total:0);
 const out=weights.map(w=>Math.trunc(total*Math.abs(w)/sum));let rest=total-out.reduce((a,b)=>a+b,0);
 const order=weights.map((w,i)=>[Math.abs(w),i]).sort((a,b)=>b[0]-a[0]);for(let k=0;rest!==0;k=(k+1)%order.length){const s=Math.sign(rest);out[order[k][1]]+=s;rest-=s;}
 return out;
}
/* options: direction, accounts (chart), learned: {[counterpartKey]: accountCode} learned from past confirmations,
   deductiblePct (0-100, default 100), reverseChargeRate (default 22), revenueAccount, costAccount, company:{vat,taxCode} */
function propose(doc,party,o={}){
 const direction=o.direction;if(!['purchase','sale'].includes(direction))throw new Error('Direzione non valida: acquisto o vendita.');
 const accounts=o.accounts||coa.STANDARD,idx=coa.index(accounts),reasons=[];
 const sign=CREDIT_NOTES.has(doc.type)?-1:1;
 const counterpart=party||{};const key=counterpartKey(counterpart);
 const summary=doc.summary||[];
 const taxable=summary.reduce((t,s)=>t+s.taxable_cents,0)+(doc.rounding_cents||0);
 const invoiceVat=summary.filter(s=>!isRC(s)).reduce((t,s)=>t+s.vat_cents,0);
 const rcRate=o.reverseChargeRate??22;
 const rcVat=direction==='purchase'?summary.filter(isRC).reduce((t,s)=>t+Math.round(s.taxable_cents*(s.vatRate||rcRate)/100),0):0;
 const withholding=(doc.withholding||[]).reduce((t,w)=>t+w.amount_cents,0);
 const split=direction==='sale'&&summary.some(s=>s.exigibility==='S');
 const splitVat=split?summary.filter(s=>s.exigibility==='S').reduce((t,s)=>t+s.vat_cents,0):0;
 const pct=Math.min(100,Math.max(0,o.deductiblePct??100));
 const lines=[],vatRows=[];
 const add=(account,dr,cr,description)=>{if(!dr&&!cr)return;if(!idx.has(account))throw new Error('Conto mancante nel piano dei conti: '+account);
  // Credit notes swap sides so amounts stay positive.
  if(sign<0)[dr,cr]=[cr,dr];if(dr<0||cr<0){[dr,cr]=[Math.max(0,-cr,dr),Math.max(0,-dr,cr)];}
  lines.push({account,debit_cents:dr,credit_cents:cr,description:description||null});};
 // Economic side: one line per suggested account, allocated on the line totals.
 const kind=direction==='purchase'?'C':'R';
 const fallback=direction==='purchase'?(o.costAccount||S.defaultCost):(o.revenueAccount||S.revenueServices);
 let byAccount=new Map();
 if(key&&o.learned&&o.learned[key]&&idx.has(o.learned[key])){byAccount.set(o.learned[key],1);reasons.push('conto già usato per '+(counterpart.name||key));}
 else{
  for(const l of doc.lines||[]){const s=coa.suggest(l.description,{accounts,kind,fallback});byAccount.set(s.code,(byAccount.get(s.code)||0)+(l.total_cents||0)||0);}
  if(!byAccount.size)byAccount.set(fallback,1);
  const named=[...byAccount.keys()].filter(c=>c!==fallback);reasons.push(named.length?'conti suggeriti dalle descrizioni delle righe':'nessuna parola chiave riconosciuta: conto predefinito da verificare');
 }
 const nonDeductible=direction==='purchase'?Math.round(invoiceVat*(100-pct)/100):0;
 const codes=[...byAccount.keys()],parts=allocate(taxable,codes.map(c=>byAccount.get(c)));
 const desc=(direction==='purchase'?'Fattura acquisto ':'Fattura vendita ')+(doc.number||'')+(counterpart.name?' · '+counterpart.name:'');
 if(direction==='purchase'){
  codes.forEach((c,i)=>add(c,parts[i],0));
  add(S.vatCredit,invoiceVat-nonDeductible+rcVat,0,rcVat?'IVA in reverse charge (integrazione)':null);
  if(nonDeductible){add(S.vatNonDeductible,nonDeductible,0,'IVA indetraibile '+(100-pct)+'%');reasons.push('IVA detraibile al '+pct+'%');}
  if(rcVat){add(S.vatDebit,0,rcVat,'IVA in reverse charge (integrazione)');reasons.push('reverse charge: IVA integrata in dare e in avere');}
  add(S.suppliers,0,taxable+invoiceVat-withholding);
  if(withholding){add(S.withholdingDebit,0,withholding,'Ritenuta d\'acconto da versare');reasons.push('ritenuta d\'acconto trattenuta al fornitore');}
 }else{
  add(S.customers,taxable+invoiceVat-splitVat-withholding,0);
  if(withholding){add(S.withholdingCredit,withholding,0,'Ritenuta d\'acconto subita');reasons.push('ritenuta d\'acconto subita dal cliente');}
  codes.forEach((c,i)=>add(c,0,parts[i]));
  add(S.vatDebit,0,invoiceVat-splitVat);
  if(splitVat)reasons.push('split payment: l\'IVA la versa il cliente pubblico');
 }
 // VAT register rows (one per rate/nature). Reverse charge purchases also go into the sales register.
 for(const s of summary){
  const rc=direction==='purchase'&&isRC(s),rate=rc?(s.vatRate||rcRate):s.vatRate,vat=rc?Math.round(s.taxable_cents*rate/100):s.vat_cents;
  const base={date:o.registrationDate||doc.date,doc_date:doc.date,doc_number:doc.number,doc_type:doc.type,counterpart:counterpart.name||null,counterpart_vat:counterpart.vat||null,rate,nature:s.nature||null,taxable_cents:sign*s.taxable_cents,exigibility:s.exigibility||'I',reverse_charge:rc};
  if(direction==='purchase'){const ded=rc?vat:Math.round(vat*pct/100);vatRows.push({...base,register:'acquisti',vat_cents:sign*vat,deductible_vat_cents:sign*ded});if(rc)vatRows.push({...base,register:'vendite',vat_cents:sign*vat,deductible_vat_cents:0});}
  else vatRows.push({...base,register:'vendite',vat_cents:sign*s.vat_cents,deductible_vat_cents:0});
 }
 // Open items (scadenze): from payment details, else one item due on the document date.
 const due=taxable+invoiceVat-withholding-splitVat;
 const pays=(doc.payments||[]).filter(p=>p.amount_cents>0);
 const items=(pays.length?pays.map(p=>({due:p.due||doc.date,amount_cents:p.amount_cents,method:p.method||null,iban:p.iban||null})):[{due:doc.date,amount_cents:due,method:null,iban:null}])
  .map(p=>({...p,kind:direction==='purchase'?'payable':'receivable',amount_cents:sign*p.amount_cents,counterpart:counterpart.name||null,doc_number:doc.number}));
 const sumItems=items.reduce((t,i)=>t+i.amount_cents,0);
 if(sumItems!==sign*due){reasons.push('le scadenze indicate in fattura non tornano col totale: verificare');}
 const entry={date:o.registrationDate||doc.date,description:desc.trim(),status:'draft',source:{type:'invoice',direction,doc_type:doc.type,number:doc.number},lines};
 const confidence=key&&o.learned&&o.learned[key]?'alta':(reasons.some(r=>r.includes('predefinito'))?'bassa':'media');
 return {entry,vat:vatRows,open_items:items,counterpart_key:key,confidence,reasons};
}
// Who the counterpart is for learning: VAT number, else tax code, else normalised name.
function counterpartKey(p){if(!p)return null;if(p.vat)return 'vat:'+String(p.vat).toUpperCase().replace(/\s/g,'');if(p.taxCode)return 'cf:'+String(p.taxCode).toUpperCase();return p.name?'name:'+coa.norm(p.name).trim():null;}
// Decides whether the company is supplier or customer in a FatturaPA file.
function directionFor(parsed,company){
 const ids=[company&&company.vat,company&&company.taxCode].filter(Boolean).map(x=>String(x).toUpperCase().replace(/^IT/,''));
 const match=p=>p&&[p.vat,p.taxCode].filter(Boolean).some(x=>ids.includes(String(x).toUpperCase().replace(/^IT/,'')));
 if(match(parsed.supplier))return 'sale';if(match(parsed.customer))return 'purchase';return null;
}
return {propose,allocate,counterpartKey,directionFor};
});
