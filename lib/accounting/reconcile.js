/* RADIX Accounting — bank reconciliation. Scores each bank movement against open items (scadenze) and
   proposes the journal entry. Proposals always need a person's confirmation. Pure functions. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./chart-of-accounts'):root.RadixChartOfAccounts);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixReconcile=api})(typeof globalThis!=='undefined'?globalThis:this,function(coa){
'use strict';
const S=coa.SYSTEM;
const STOP=new Set(['srl','spa','snc','sas','srls','societa','soc','ditta','di','e','the','ltd','gmbh','coop','cooperativa','studio','del','della','dei','il','la','lo']);
const tokens=s=>coa.norm(s).trim().split(/[^a-z0-9]+/).filter(t=>t.length>2&&!STOP.has(t));
const days=(a,b)=>Math.abs(Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/864e5));
// Movement descriptions that are not invoice payments, with the account to use.
const RULES=[
 {re:/commission|spese (?:tenuta|conto|bonifico)|canone (?:conto|mensile)|imposta di bollo|competenze/,account:S.bankFees,label:'spese bancarie'},
 {re:/\bf24\b|delega|agenzia (?:delle )?entrate|erario/,account:'04.12',label:'versamento F24'},
 {re:/stipend|emolument|retribuz|cedolino/,account:S.salaries,label:'stipendi'},
 {re:/inps|inail/,account:'04.21',label:'contributi previdenziali'},
 {re:/interessi (?:creditori|attivi)/,account:'70.20',label:'interessi attivi'},
 {re:/interessi (?:debitori|passivi)/,account:'66.01',label:'interessi passivi'},
 {re:/rata (?:mutuo|finanziamento)|finanziamento/,account:'04.30',label:'rata finanziamento'}
];
// 0-100: amount (50), invoice number in the text (25), counterpart name (15), date close to due (10).
function score(row,item){
 const open=item.amount_cents-(item.paid_cents||0);
 if(open<=0)return null;
 const incoming=row.amount_cents>0;if(incoming!==(item.kind==='receivable'))return null;
 const amt=Math.abs(row.amount_cents);let s=0;const why=[];
 if(amt===open){s+=50;why.push('importo identico');}else if(amt<open&&amt>=open*0.98){s+=30;why.push('importo quasi identico (commissioni?)');}else if(amt<open){s+=10;why.push('pagamento parziale possibile');}else return null;
 const text=coa.norm(row.description);
 if(item.doc_number){const n=coa.norm(item.doc_number).trim();const bare=n.replace(/^0+/,'');if(n&&(text.includes(' '+n)||text.includes('n.'+n)||text.includes('n '+n)||(bare.length>=3&&new RegExp('(^|[^0-9])'+bare.replace(/[.*+?^${}()|[\]\\/]/g,'\\$&')+'([^0-9]|$)').test(text)))){s+=25;why.push('numero fattura nella causale');}}
 const nt=tokens(item.counterpart);if(nt.length){const hit=nt.filter(t=>text.includes(t)).length;if(hit){s+=Math.round(15*hit/nt.length);why.push('nome '+item.counterpart);}}
 if(item.due){const d=days(row.date,item.due);s+=d<=3?10:d<=15?6:d<=45?3:0;}
 return {score:Math.min(100,s),reasons:why};
}
// For each movement: best candidates (max 3) and a suggested action.
function suggest(rows,items,{threshold=60}={}){
 return (rows||[]).map(row=>{
  const cands=(items||[]).map(item=>{const r=score(row,item);return r&&{item,...r};}).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,3);
  const best=cands[0]&&cands[0].score>=threshold?cands[0]:null;
  const rule=best?null:RULES.find(r=>r.re.test(coa.norm(row.description)));
  return {row,candidates:cands,match:best,rule:rule?{account:rule.account,label:rule.label}:null};
 });
}
// Journal entry for a confirmed movement: against the open item, or against a chosen account.
function entryFor(row,{item,account,bankAccount=S.bank}={}){
 const amt=Math.abs(row.amount_cents),incoming=row.amount_cents>0;
 const other=item?(item.kind==='receivable'?S.customers:S.suppliers):account;
 if(!other)throw new Error('Scegli la scadenza o il conto da usare.');
 const desc=(item?(incoming?'Incasso ':'Pagamento ')+(item.doc_number||'')+(item.counterpart?' · '+item.counterpart:''):row.description).trim().slice(0,200)||'Movimento bancario';
 const lines=incoming?[{account:bankAccount,debit_cents:amt,credit_cents:0},{account:other,debit_cents:0,credit_cents:amt}]:[{account:other,debit_cents:amt,credit_cents:0},{account:bankAccount,debit_cents:0,credit_cents:amt}];
 return {date:row.date,description:desc,status:'draft',source:{type:'bank',fingerprint:row.fingerprint||null},lines};
}
return {score,suggest,entryFor,RULES};
});
