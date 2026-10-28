'use strict';
/* «Offerta grafica» (sales-vendite.html › Preventivi): from a saved quote to a commercial proposal that is good to look
   at, in three steps and without AI: 1) the configurator asks what kind of business sells and what the offer is for,
   2) three looks are rendered from the same content, 3) the person picks one, touches up the texts and prints it
   (browser print → PDF). Pure rules, no DOM: the configurator (business types, their sections and wording), the content
   model built from the quote, the editable fields and the HTML of the pages. The quote's numbers (lines, totals, VAT,
   validity, customer and issuer snapshots) are the only figures: nothing is invented. */
(function(root){
const str=v=>v===null||v===undefined?'':String(v).trim();
const esc=s=>str(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FIELD_MAX=200,TEXT_MAX=1200;
const euro=c=>{const n=Number(c||0)/100;return '€ '+n.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})};
const pct=bp=>{const n=Number(bp||0)/100;return (Number.isInteger(n)?String(n):n.toLocaleString('it-IT',{maximumFractionDigits:2}))+'%'};
const qty=q=>{const n=Number(q||0);return Number.isInteger(n)?String(n):n.toLocaleString('it-IT',{maximumFractionDigits:3})};
const MONTHS=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const longDate=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(str(v));return m?Number(m[3])+' '+MONTHS[Number(m[2])-1]+' '+m[1]:''};

/* The configurator: who sells. Each business type decides the sections of the proposal and how it speaks of the
   lines of the quote (activities, supply, plans…). industries: the CRM sector labels (crm-fields-core.js) of the
   customer that suggest it when the issuer has not chosen yet. */
const BUSINESS=Object.freeze([
 {id:'servizi',label:'Servizi e consulenza',hint:'Studi, consulenti, agenzie di servizi, formazione',linesTitle:'Cosa faremo',linesWord:'Attività',
  sections:['situazione','lines','perche','metodo','investimento','passi','condizioni'],
  perche:['Esperienza diretta su progetti come il vostro','Un referente unico dall’inizio alla fine','Risultati misurati e condivisi a ogni fase'],
  metodo:['Analisi iniziale e obiettivi condivisi','Piano di lavoro con date e responsabilità','Avanzamento e revisioni periodiche','Consegna e passaggio di consegne'],
  industries:/consulen|professional|istruzion|formazion|marketing|comunicazion|banche|finanza|assicur|pubblica/i},
 {id:'prodotto',label:'Prodotti e macchinari',hint:'Fornitura di beni, impianti, attrezzature',linesTitle:'Dettaglio della fornitura',linesWord:'Fornitura',
  sections:['soluzione','lines','perche','consegna','investimento','passi','condizioni'],
  perche:['Prodotti selezionati e garantiti','Consegna, installazione e collaudo inclusi dove indicato','Assistenza post-vendita con tempi certi'],
  metodo:['Conferma dell’ordine e della configurazione','Produzione o approvvigionamento','Consegna e installazione','Collaudo e formazione'],
  industries:/automotive|meccanic|manifattur|industri|chimic|farmac|agricol|aliment|moda|tessil|arredo|design|energia|ingrosso/i},
 {id:'software',label:'Software e abbonamenti',hint:'Piattaforme, licenze, canoni ricorrenti',linesTitle:'Piani e servizi inclusi',linesWord:'Piano',
  sections:['soluzione','lines','perche','attivazione','investimento','passi','condizioni'],
  perche:['Attivi in pochi giorni, senza installazioni','Dati vostri, sicuri e sempre esportabili','Supporto incluso nel canone'],
  metodo:['Attivazione dell’ambiente','Configurazione e importazione dei dati','Formazione del team','Avvio e assistenza continua'],
  industries:/informatic|software|telecom|media/i},
 {id:'agenzia',label:'Agenzia creativa e comunicazione',hint:'Campagne, contenuti, siti, eventi',linesTitle:'Cosa realizziamo',linesWord:'Lavoro',
  sections:['brief','lines','processo','perche','investimento','passi','condizioni'],
  perche:['Un team che unisce strategia e produzione','Contenuti pronti per ogni canale','Tempi e revisioni concordati prima di partire'],
  metodo:['Brief e strategia','Proposte creative e scelta','Produzione e revisioni','Pubblicazione e risultati'],
  industries:/marketing|comunicazion|media|editori/i},
 {id:'edilizia',label:'Edilizia e impianti',hint:'Lavori, ristrutturazioni, impiantistica',linesTitle:'Intervento proposto',linesWord:'Lavorazione',
  sections:['soluzione','lines','tempi','perche','investimento','passi','condizioni'],
  perche:['Cantiere ordinato e tempi rispettati','Materiali certificati e garanzie scritte','Un responsabile di cantiere sempre raggiungibile'],
  metodo:['Sopralluogo e progetto esecutivo','Avvio del cantiere','Lavorazioni e verifiche in corso d’opera','Fine lavori e consegna'],
  industries:/ediliz|immobiliar|costruzion|energia|ambiente/i},
 {id:'retail',label:'Commercio, ristorazione e ospitalità',hint:'Negozi, locali, hotel, forniture ricorrenti',linesTitle:'La proposta nel dettaglio',linesWord:'Voce',
  sections:['soluzione','lines','perche','investimento','passi','condizioni'],
  perche:['Qualità costante, fornitura dopo fornitura','Consegne puntuali e flessibili','Un listino chiaro, senza sorprese'],
  metodo:['Conferma della proposta','Prima fornitura o avvio','Verifica insieme dopo il primo mese','Fornitura a regime'],
  industries:/dettaglio|retail|turism|hotel|ristoraz|sanit|benessere/i}
]);
const GOALS=Object.freeze([['nuovo','Nuovo cliente','Presentarsi e convincere'],['rinnovo','Rinnovo o ampliamento','Confermare un rapporto che funziona'],['gara','Confronto con altri fornitori','Far pesare le differenze']]);
const TONES=Object.freeze([['sicuro','Sicuro e diretto'],['caldo','Caldo e vicino'],['tecnico','Preciso e tecnico']]);
const LOOKS=Object.freeze([
 {id:'elegante',label:'Elegante',hint:'Serif, blu inchiostro e oro, molto spazio',primary:'#1b2a4a',accent:'#b8923a',paper:'#fbf8f1',ink:'#1a1a1a',font:'"Georgia","Times New Roman",serif',head:'"Georgia","Times New Roman",serif'},
 {id:'deciso',label:'Deciso',hint:'Sans grassetto, blocchi di colore, numeri grandi',primary:'#4c1d95',accent:'#f59e0b',paper:'#ffffff',ink:'#111111',font:'Inter,"Segoe UI",system-ui,sans-serif',head:'Inter,"Segoe UI",system-ui,sans-serif'},
 {id:'caldo',label:'Caldo',hint:'Terracotta e crema, angoli morbidi',primary:'#9a3412',accent:'#2f6f5e',paper:'#fff7ed',ink:'#2a1a12',font:'"Segoe UI",system-ui,sans-serif',head:'"Georgia",serif'}
]);
const SECTION_TITLES=Object.freeze({situazione:'Da dove partiamo',soluzione:'La soluzione che proponiamo',brief:'Cosa abbiamo capito',perche:'Perché noi',metodo:'Come lavoreremo',processo:'Il percorso',consegna:'Consegna e installazione',attivazione:'Attivazione',tempi:'Tempi e cantiere',investimento:'L’investimento',passi:'I prossimi passi',condizioni:'Condizioni'});

const byId=(list,id)=>list.find(x=>x.id===id)||null;
/* The business type to propose: the one saved for the workspace, else the customer's sector, else services. */
function suggestBusiness(doc,saved){
 if(saved&&byId(BUSINESS,saved))return saved;
 const sector=str(doc&&doc.customer&&doc.customer.company&&doc.customer.company.industry)||str(doc&&doc.company_industry);
 const hit=sector&&BUSINESS.find(b=>b.industries.test(sector));return hit?hit.id:'servizi';
}
/* Questions of the configurator (step 1). answers: {business, goal, tone, include:{perche,metodo,passi}}. */
function questions(doc,saved){
 return [
  {id:'business',label:'Chi vende: che tipo di attività è la vostra?',type:'choice',options:BUSINESS.map(b=>({value:b.id,label:b.label,hint:b.hint})),value:suggestBusiness(doc,saved)},
  {id:'goal',label:'A cosa serve questa offerta?',type:'choice',options:GOALS.map(([v,l,h])=>({value:v,label:l,hint:h})),value:'nuovo'},
  {id:'tone',label:'Che tono deve avere?',type:'choice',options:TONES.map(([v,l])=>({value:v,label:l})),value:'sicuro'}
 ];
}
const lineNet=l=>{const gross=Number(l.quantity||0)*Number(l.unit_price_cents||0);return Math.round(gross*(1-Number(l.discount_bp||0)/10000))};
/* The content model: every text here can be edited in step 3; numbers come from the quote only. */
function plan(doc,answers){
 const a=answers||{},b=byId(BUSINESS,a.business)||BUSINESS[0],goal=a.goal||'nuovo',tone=a.tone||'sicuro';
 const cust=(doc&&doc.customer)||{},co=cust.company||{},ct=cust.contact||{},issuer=(doc&&doc.issuer)||{};
 const customer=str(co.name)||str(co.legal_name)||'il cliente',seller=str(issuer.name)||str(issuer.legal_name)||'';
 const lines=(doc&&doc.lines||[]).map(l=>({description:str(l.description),quantity:qty(l.quantity),unit:str(l.unit)||'pz',unit_price:euro(l.unit_price_cents),discount:Number(l.discount_bp||0)?pct(l.discount_bp):'',vat:pct(l.vat_rate_bp),net:euro(l.net_cents!=null?l.net_cents:lineNet(l))}));
 const title=str(doc&&doc.title)||(b.id==='software'?'Proposta di attivazione':b.id==='agenzia'?'Proposta creativa':'Proposta commerciale');
 const greet=tone==='caldo'?'Gentile':tone==='tecnico'?'Spett.le':'Gentile';
 const who=str(ct.name)?greet+' '+str(ct.name)+',':greet+' '+customer+',';
 const opening={nuovo:'grazie per il tempo che ci avete dedicato. In queste pagine trovate la nostra proposta per '+customer+': cosa faremo, come e con quale investimento.',
  rinnovo:'grazie per la fiducia di questi mesi. Qui trovate la proposta per continuare e ampliare il lavoro insieme, con le stesse regole chiare di sempre.',
  gara:'grazie per averci coinvolto. Abbiamo preparato una proposta che mette in chiaro cosa include, cosa non include e perché conviene: così il confronto è semplice.'}[goal];
 const intro=who+'\n'+opening;
 const sections=b.sections.map(id=>{
  if(id==='lines')return {id,title:b.linesTitle,kind:'lines'};
  if(id==='perche')return {id,title:SECTION_TITLES[id],kind:'bullets',items:b.perche.slice()};
  if(id==='metodo'||id==='processo'||id==='consegna'||id==='attivazione'||id==='tempi')return {id,title:SECTION_TITLES[id],kind:'steps',items:b.metodo.slice()};
  if(id==='investimento')return {id,title:SECTION_TITLES[id],kind:'totals',note:'Importi IVA esclusa dove indicato. '+(doc&&doc.valid_until?'Offerta valida fino al '+longDate(doc.valid_until)+'.':'')};
  if(id==='passi')return {id,title:SECTION_TITLES[id],kind:'steps',items:['Conferma dell’offerta con una firma o una email','Pianificazione insieme della data di avvio','Avvio del lavoro']};
  if(id==='condizioni')return {id,title:SECTION_TITLES[id],kind:'text',text:str(doc&&doc.terms)||'Pagamento come da accordi. Offerta non vincolante fino alla conferma scritta.'};
  return {id,title:SECTION_TITLES[id],kind:'text',text:str(doc&&doc.notes)||(id==='brief'?'Il brief raccolto e gli obiettivi concordati: aggiungi qui, in poche righe, cosa deve ottenere il cliente.':'Il contesto e gli obiettivi di '+customer+': aggiungi qui, in poche righe, da dove si parte e dove si vuole arrivare.')};
 });
 return {business:b.id,goal,tone,title,subtitle:'Per '+customer,customer,contact:str(ct.name),seller,date:longDate(doc&&doc.issue_date)||longDate(new Date().toISOString()),number:str(doc&&doc.number),
  validUntil:longDate(doc&&doc.valid_until),intro,sections,lines,totals:{subtotal:euro(doc&&doc.subtotal_cents),discount:Number(doc&&doc.discount_cents||0)?euro(doc.discount_cents):'',vat:(doc&&doc.vat_summary||[]).map(r=>({label:'IVA '+pct(r.vat_rate_bp),amount:euro(r.vat_cents)})),total:euro(doc&&doc.total_cents)},
  signature:seller?'A presto,\n'+seller:'A presto',contactLine:[str(issuer.email),str(issuer.phone),str(issuer.website)].filter(Boolean).join(' · ')};
}
/* Editable fields (step 3), in page order; value/limit for the inputs, apply() writes them back into the model. */
function fields(model){
 const out=[{key:'title',label:'Titolo',value:model.title,max:FIELD_MAX},{key:'subtitle',label:'Sottotitolo',value:model.subtitle,max:FIELD_MAX},{key:'intro',label:'Apertura',value:model.intro,max:TEXT_MAX,multiline:true}];
 model.sections.forEach((s,i)=>{if(s.kind==='text')out.push({key:'section:'+i,label:s.title,value:s.text,max:TEXT_MAX,multiline:true});
  else if(s.kind==='bullets'||s.kind==='steps')out.push({key:'section:'+i,label:s.title+' (una riga per voce)',value:s.items.join('\n'),max:TEXT_MAX,multiline:true})});
 out.push({key:'signature',label:'Firma',value:model.signature,max:FIELD_MAX,multiline:true});return out;
}
function apply(model,key,value){
 const v=str(value);const m=/^section:(\d+)$/.exec(key);
 if(m){const s=model.sections[Number(m[1])];if(!s)return model;if(s.kind==='text')s.text=v.slice(0,TEXT_MAX);else s.items=v.split('\n').map(str).filter(Boolean).slice(0,8).map(t=>t.slice(0,FIELD_MAX));return model}
 if(['title','subtitle','signature'].includes(key))model[key]=v.slice(0,FIELD_MAX);else if(key==='intro')model.intro=v.slice(0,TEXT_MAX);return model;
}
/* Checks before printing: what a careful seller would not send. */
function check(model){
 const out=[];if(!model.lines.length)out.push('Il preventivo non ha righe: l’offerta uscirebbe senza importi.');
 if(!model.seller)out.push('Manca l’intestazione del venditore: compilala in Vendite › Intestazione.');
 for(const s of model.sections)if(s.kind==='text'&&/aggiungi qui/i.test(s.text))out.push('La sezione «'+s.title+'» ha ancora il testo di esempio.');
 if(!model.validUntil)out.push('Il preventivo non ha una data di validità.');return out;
}
/* The pages as HTML (string). look: id or object; brand: {primary,accent,font} from the identity kit overrides the look's colours. */
function html(model,look,brand){
 const L={...(typeof look==='string'?byId(LOOKS,look)||LOOKS[0]:look||LOOKS[0]),...(brand||{})};
 const P=(cls,...inner)=>'<section class="of-page of-'+L.id+' '+cls+'" style="--of-primary:'+esc(L.primary)+';--of-accent:'+esc(L.accent)+';--of-paper:'+esc(L.paper)+';--of-ink:'+esc(L.ink)+';--of-font:'+esc(L.font)+';--of-head:'+esc(L.head)+'">'+inner.join('')+'</section>';
 const para=t=>esc(t).split(/\n+/).map(x=>'<p>'+x+'</p>').join('');
 const cover=P('of-cover','<div class="of-cover-band"></div><div class="of-cover-body"><p class="of-eyebrow">'+esc(model.seller||'Proposta')+(model.number?' · n. '+esc(model.number):'')+'</p><h1>'+esc(model.title)+'</h1><p class="of-sub">'+esc(model.subtitle)+'</p><p class="of-date">'+esc(model.date)+(model.contact?' · alla cortese attenzione di '+esc(model.contact):'')+'</p></div>');
 const body=[];body.push('<div class="of-block of-intro">'+para(model.intro)+'</div>');
 for(const s of model.sections){
  if(s.kind==='text')body.push('<div class="of-block"><h2>'+esc(s.title)+'</h2>'+para(s.text)+'</div>');
  else if(s.kind==='bullets')body.push('<div class="of-block"><h2>'+esc(s.title)+'</h2><ul class="of-bullets">'+s.items.map(i=>'<li>'+esc(i)+'</li>').join('')+'</ul></div>');
  else if(s.kind==='steps')body.push('<div class="of-block"><h2>'+esc(s.title)+'</h2><ol class="of-steps">'+s.items.map((i,n)=>'<li><span class="of-n">'+(n+1)+'</span><span>'+esc(i)+'</span></li>').join('')+'</ol></div>');
  else if(s.kind==='lines')body.push('<div class="of-block of-lines"><h2>'+esc(s.title)+'</h2><table><thead><tr><th>'+esc(byId(BUSINESS,model.business).linesWord)+'</th><th class="num">Q.tà</th><th class="num">Prezzo</th><th class="num">Importo</th></tr></thead><tbody>'+model.lines.map(l=>'<tr><td>'+esc(l.description)+'</td><td class="num">'+esc(l.quantity)+' '+esc(l.unit)+'</td><td class="num">'+esc(l.unit_price)+(l.discount?'<small> −'+esc(l.discount)+'</small>':'')+'</td><td class="num">'+esc(l.net)+'</td></tr>').join('')+'</tbody></table></div>');
  else if(s.kind==='totals')body.push('<div class="of-block of-invest"><h2>'+esc(s.title)+'</h2><div class="of-totals"><div><span>Imponibile</span><b>'+esc(model.totals.subtotal)+'</b></div>'+model.totals.vat.map(v=>'<div><span>'+esc(v.label)+'</span><b>'+esc(v.amount)+'</b></div>').join('')+'<div class="of-total"><span>Totale</span><b>'+esc(model.totals.total)+'</b></div></div><p class="of-note">'+esc(s.note)+'</p></div>');
 }
 body.push('<div class="of-block of-sign">'+para(model.signature)+(model.contactLine?'<p class="of-contact">'+esc(model.contactLine)+'</p>':'')+'</div>');
 return cover+P('of-body','<header class="of-run"><span>'+esc(model.seller||'')+'</span><span>'+esc(model.title)+'</span></header>'+body.join(''));
}
const api={BUSINESS,GOALS,TONES,LOOKS,SECTION_TITLES,FIELD_MAX,TEXT_MAX,suggestBusiness,questions,plan,fields,apply,check,html,euro,pct,longDate};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixOffertaCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
