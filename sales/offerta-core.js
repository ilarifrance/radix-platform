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
/* lang: 'it' (default) or 'en' (British English, when the CRM runs in English): texts, dates and number formats. */
const LANG=l=>l==='en'?'en':'it',LOCALE={it:'it-IT',en:'en-GB'};
const euro=(c,lang)=>{const n=Number(c||0)/100;return (LANG(lang)==='en'?'€':'€ ')+n.toLocaleString(LOCALE[LANG(lang)],{minimumFractionDigits:2,maximumFractionDigits:2})};
const pct=(bp,lang)=>{const n=Number(bp||0)/100;return (Number.isInteger(n)?String(n):n.toLocaleString(LOCALE[LANG(lang)],{maximumFractionDigits:2}))+'%'};
const qty=(q,lang)=>{const n=Number(q||0);return Number.isInteger(n)?String(n):n.toLocaleString(LOCALE[LANG(lang)],{maximumFractionDigits:3})};
const MONTHS={it:['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'],en:['January','February','March','April','May','June','July','August','September','October','November','December']};
const longDate=(v,lang)=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(str(v));return m?Number(m[3])+' '+MONTHS[LANG(lang)][Number(m[2])-1]+' '+m[1]:''};

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

/* The English of every text above (same ids). Any id left out keeps the Italian. */
const EN={
 business:{
  servizi:{label:'Services and consulting',hint:'Firms, consultants, service agencies, training',linesTitle:'What we will do',linesWord:'Activity',perche:['Hands-on experience on projects like yours','One point of contact from start to finish','Results measured and shared at every stage'],metodo:['Initial analysis and shared goals','Work plan with dates and responsibilities','Progress and periodic reviews','Delivery and handover']},
  prodotto:{label:'Products and machinery',hint:'Supply of goods, plants, equipment',linesTitle:'Supply details',linesWord:'Supply',perche:['Selected, guaranteed products','Delivery, installation and commissioning included where stated','After-sales support with firm response times'],metodo:['Order and configuration confirmed','Production or procurement','Delivery and installation','Commissioning and training']},
  software:{label:'Software and subscriptions',hint:'Platforms, licences, recurring fees',linesTitle:'Plans and services included',linesWord:'Plan',perche:['Live in days, nothing to install','Your data, secure and always exportable','Support included in the fee'],metodo:['Environment activation','Set-up and data import','Team training','Go-live and ongoing support']},
  agenzia:{label:'Creative and communication agency',hint:'Campaigns, content, websites, events',linesTitle:'What we will create',linesWord:'Work',perche:['One team for strategy and production','Content ready for every channel','Timings and revisions agreed before we start'],metodo:['Brief and strategy','Creative proposals and choice','Production and revisions','Publication and results']},
  edilizia:{label:'Construction and installations',hint:'Works, renovations, building systems',linesTitle:'Proposed works',linesWord:'Work item',perche:['A tidy site and deadlines met','Certified materials and written guarantees','A site manager always reachable'],metodo:['Survey and detailed design','Site start','Works and checks in progress','Completion and handover']},
  retail:{label:'Retail, food service and hospitality',hint:'Shops, venues, hotels, recurring supplies',linesTitle:'The proposal in detail',linesWord:'Item',perche:['Consistent quality, delivery after delivery','Punctual, flexible deliveries','A clear price list, no surprises'],metodo:['Proposal confirmed','First delivery or start','Review together after the first month','Regular supply']}},
 goals:{nuovo:['New customer','Introduce ourselves and convince'],rinnovo:['Renewal or extension','Confirm a relationship that works'],gara:['Comparison with other suppliers','Make the differences count']},
 tones:{sicuro:'Confident and direct',caldo:'Warm and close',tecnico:'Precise and technical'},
 looks:{elegante:['Elegant','Serif, ink blue and gold, lots of space'],deciso:['Bold','Bold sans, colour blocks, big numbers'],caldo:['Warm','Terracotta and cream, soft corners']},
 sections:{situazione:'Where we start from',soluzione:'The solution we propose',brief:'What we understood',perche:'Why us',metodo:'How we will work',processo:'The journey',consegna:'Delivery and installation',attivazione:'Activation',tempi:'Timing and site',investimento:'The investment',passi:'Next steps',condizioni:'Terms'}
};
const T=(lang,it,en)=>LANG(lang)==='en'?en:it;
const locBusiness=(b,lang)=>LANG(lang)==='en'&&EN.business[b.id]?{...b,...EN.business[b.id]}:b;
const locGoal=(g,lang)=>LANG(lang)==='en'&&EN.goals[g[0]]?[g[0],...EN.goals[g[0]]]:g;
const locTone=(t,lang)=>LANG(lang)==='en'&&EN.tones[t[0]]?[t[0],EN.tones[t[0]]]:t;
const locLook=(l,lang)=>LANG(lang)==='en'&&EN.looks[l.id]?{...l,label:EN.looks[l.id][0],hint:EN.looks[l.id][1]}:l;
const sectionTitle=(id,lang)=>LANG(lang)==='en'&&EN.sections[id]||SECTION_TITLES[id];
const byId=(list,id)=>list.find(x=>x.id===id)||null;
/* The business type to propose: the one saved for the workspace, else the customer's sector, else services. */
function suggestBusiness(doc,saved){
 if(saved&&byId(BUSINESS,saved))return saved;
 const sector=str(doc&&doc.customer&&doc.customer.company&&doc.customer.company.industry)||str(doc&&doc.company_industry);
 const hit=sector&&BUSINESS.find(b=>b.industries.test(sector));return hit?hit.id:'servizi';
}
/* Questions of the configurator (step 1). answers: {business, goal, tone, include:{perche,metodo,passi}}. */
function questions(doc,saved,lang){
 return [
  {id:'business',label:T(lang,'Chi vende: che tipo di attività è la vostra?','Who sells: what kind of business are you?'),type:'choice',options:BUSINESS.map(b=>locBusiness(b,lang)).map(b=>({value:b.id,label:b.label,hint:b.hint})),value:suggestBusiness(doc,saved)},
  {id:'goal',label:T(lang,'A cosa serve questa offerta?','What is this proposal for?'),type:'choice',options:GOALS.map(g=>locGoal(g,lang)).map(([v,l,h])=>({value:v,label:l,hint:h})),value:'nuovo'},
  {id:'tone',label:T(lang,'Che tono deve avere?','Which tone should it have?'),type:'choice',options:TONES.map(t=>locTone(t,lang)).map(([v,l])=>({value:v,label:l})),value:'sicuro'}
 ];
}
const lineNet=l=>{const gross=Number(l.quantity||0)*Number(l.unit_price_cents||0);return Math.round(gross*(1-Number(l.discount_bp||0)/10000))};
/* The content model: every text here can be edited in step 3; numbers come from the quote only. */
function plan(doc,answers,opts){
 const a=answers||{},lang=LANG(opts&&opts.lang),b=locBusiness(byId(BUSINESS,a.business)||BUSINESS[0],lang),goal=a.goal||'nuovo',tone=a.tone||'sicuro';
 const cust=(doc&&doc.customer)||{},co=cust.company||{},ct=cust.contact||{},issuer=(doc&&doc.issuer)||{};
 const customer=str(co.name)||str(co.legal_name)||T(lang,'il cliente','the customer'),seller=str(issuer.name)||str(issuer.legal_name)||'';
 const lines=(doc&&doc.lines||[]).map(l=>({description:str(l.description),quantity:qty(l.quantity,lang),unit:str(l.unit)||T(lang,'pz','pcs'),unit_price:euro(l.unit_price_cents,lang),discount:Number(l.discount_bp||0)?pct(l.discount_bp,lang):'',vat:pct(l.vat_rate_bp,lang),net:euro(l.net_cents!=null?l.net_cents:lineNet(l),lang)}));
 const title=str(doc&&doc.title)||(lang==='en'?(b.id==='software'?'Activation proposal':b.id==='agenzia'?'Creative proposal':'Commercial proposal'):(b.id==='software'?'Proposta di attivazione':b.id==='agenzia'?'Proposta creativa':'Proposta commerciale'));
 const greet=lang==='en'?'Dear':tone==='caldo'?'Gentile':tone==='tecnico'?'Spett.le':'Gentile';
 const who=str(ct.name)?greet+' '+str(ct.name)+',':greet+' '+customer+',';
 const opening=lang==='en'?{nuovo:'thank you for the time you gave us. In these pages you will find our proposal for '+customer+': what we will do, how, and with what investment.',
  rinnovo:'thank you for your trust over these months. Here is our proposal to continue and extend the work together, with the same clear rules as always.',
  gara:'thank you for involving us. We have prepared a proposal that makes clear what is included, what is not, and why it is worth it: so the comparison is simple.'}[goal]
 :{nuovo:'grazie per il tempo che ci avete dedicato. In queste pagine trovate la nostra proposta per '+customer+': cosa faremo, come e con quale investimento.',
  rinnovo:'grazie per la fiducia di questi mesi. Qui trovate la proposta per continuare e ampliare il lavoro insieme, con le stesse regole chiare di sempre.',
  gara:'grazie per averci coinvolto. Abbiamo preparato una proposta che mette in chiaro cosa include, cosa non include e perché conviene: così il confronto è semplice.'}[goal];
 const intro=who+'\n'+opening;
 const sections=b.sections.map(id=>{
  if(id==='lines')return {id,title:b.linesTitle,kind:'lines'};
  const title=sectionTitle(id,lang);
  if(id==='perche')return {id,title,kind:'bullets',items:b.perche.slice()};
  if(id==='metodo'||id==='processo'||id==='consegna'||id==='attivazione'||id==='tempi')return {id,title,kind:'steps',items:b.metodo.slice()};
  if(id==='investimento')return {id,title,kind:'totals',note:T(lang,'Importi IVA esclusa dove indicato. ','Amounts exclude VAT where stated. ')+(doc&&doc.valid_until?T(lang,'Offerta valida fino al ','Proposal valid until ')+longDate(doc.valid_until,lang)+'.':'')};
  if(id==='passi')return {id,title,kind:'steps',items:lang==='en'?['Confirm the proposal with a signature or an email','Plan the start date together','Start of the work']:['Conferma dell’offerta con una firma o una email','Pianificazione insieme della data di avvio','Avvio del lavoro']};
  if(id==='condizioni')return {id,title,kind:'text',text:str(doc&&doc.terms)||T(lang,'Pagamento come da accordi. Offerta non vincolante fino alla conferma scritta.','Payment as agreed. This proposal is not binding until confirmed in writing.')};
  return {id,title,kind:'text',text:str(doc&&doc.notes)||(lang==='en'?(id==='brief'?'The brief we gathered and the agreed goals: add here, in a few lines, what the customer needs to achieve.':'The context and goals of '+customer+': add here, in a few lines, where we start from and where we want to get to.'):(id==='brief'?'Il brief raccolto e gli obiettivi concordati: aggiungi qui, in poche righe, cosa deve ottenere il cliente.':'Il contesto e gli obiettivi di '+customer+': aggiungi qui, in poche righe, da dove si parte e dove si vuole arrivare.'))};
 });
 return {lang,business:b.id,goal,tone,title,subtitle:T(lang,'Per ','For ')+customer,customer,contact:str(ct.name),seller,date:longDate(doc&&doc.issue_date,lang)||longDate(new Date().toISOString(),lang),number:str(doc&&doc.number),
  validUntil:longDate(doc&&doc.valid_until,lang),intro,sections,lines,totals:{subtotal:euro(doc&&doc.subtotal_cents,lang),discount:Number(doc&&doc.discount_cents||0)?euro(doc.discount_cents,lang):'',vat:(doc&&doc.vat_summary||[]).map(r=>({label:T(lang,'IVA ','VAT ')+pct(r.vat_rate_bp,lang),amount:euro(r.vat_cents,lang)})),total:euro(doc&&doc.total_cents,lang)},
  signature:seller?T(lang,'A presto,\n','Kind regards,\n')+seller:T(lang,'A presto','Kind regards'),contactLine:[str(issuer.email),str(issuer.phone),str(issuer.website)].filter(Boolean).join(' · ')};
}
/* Editable fields (step 3), in page order; value/limit for the inputs, apply() writes them back into the model. */
function fields(model){
 const lang=model.lang;const out=[{key:'title',label:T(lang,'Titolo','Title'),value:model.title,max:FIELD_MAX},{key:'subtitle',label:T(lang,'Sottotitolo','Subtitle'),value:model.subtitle,max:FIELD_MAX},{key:'intro',label:T(lang,'Apertura','Opening'),value:model.intro,max:TEXT_MAX,multiline:true}];
 model.sections.forEach((s,i)=>{if(s.kind==='text')out.push({key:'section:'+i,label:s.title,value:s.text,max:TEXT_MAX,multiline:true});
  else if(s.kind==='bullets'||s.kind==='steps')out.push({key:'section:'+i,label:s.title+T(lang,' (una riga per voce)',' (one line per item)'),value:s.items.join('\n'),max:TEXT_MAX,multiline:true,list:true})});
 out.push({key:'signature',label:T(lang,'Firma','Signature'),value:model.signature,max:FIELD_MAX,multiline:true});return out;
}
function apply(model,key,value){
 const v=str(value);const m=/^section:(\d+)$/.exec(key);
 if(m){const s=model.sections[Number(m[1])];if(!s)return model;if(s.kind==='text')s.text=v.slice(0,TEXT_MAX);else s.items=v.split('\n').map(str).filter(Boolean).slice(0,8).map(t=>t.slice(0,FIELD_MAX));return model}
 if(['title','subtitle','signature'].includes(key))model[key]=v.slice(0,FIELD_MAX);else if(key==='intro')model.intro=v.slice(0,TEXT_MAX);return model;
}
/* «Riscrivi con l’AI» (sales/offerta.js, one /api/chat call after a confirmation): the prompt carries every editable
   text with its key and the facts of the quote; the answer is JSON {key: text}. aiParse keeps only known keys, within
   the limits, and drops any text that brings an amount the quote does not have (nothing invented about money). */
function aiPrompt(model,answers){
 const a=answers||{},lang=LANG(model.lang),b=locBusiness(byId(BUSINESS,a.business)||BUSINESS[0],lang),goal=locGoal(GOALS.find(g=>g[0]===(a.goal||'nuovo'))||GOALS[0],lang),tone=locTone(TONES.find(t=>t[0]===(a.tone||'sicuro'))||TONES[0],lang);
 if(lang==='en'){const f=fields(model).map(x=>'['+x.key+'] '+x.label+' (max '+x.max+' characters'+(x.list?', one item per line':'')+'):\n'+x.value).join('\n\n');
  return 'Rewrite the texts of this commercial proposal in British English, more convincing and concrete, without inventing facts, figures, discounts, timings or references that are not below. Who sells: '+b.label+'. Purpose: '+goal[1]+'. Tone: '+tone[1]+'.\n'
  +'Customer: '+model.customer+(model.contact?' ('+model.contact+')':'')+'. Seller: '+(model.seller||'not stated')+'. Title: '+model.title+'. Total: '+model.totals.total+'.\n'
  +'Quote lines:\n'+(model.lines.map(l=>'- '+l.description+' × '+l.quantity+' '+l.unit+' = '+l.net).join('\n')||'(none)')+'\n\n'
  +'CURRENT TEXTS (key in square brackets):\n\n'+f+'\n\n'
  +'Answer ONLY with a JSON object {key: text} with the same keys, all of them, plain text without markdown; in lists separate the items with \\n. Keep the names and the greeting of the opening.'}
 const f=fields(model).map(x=>'['+x.key+'] '+x.label+(x.multiline?' (max '+x.max+' caratteri'+(x.list?', una voce per riga':'')+')':' (max '+x.max+' caratteri)')+':\n'+x.value).join('\n\n');
 return 'Riscrivi i testi di questa proposta commerciale in italiano, più convincenti e concreti, senza inventare fatti, numeri, sconti, tempi o referenze che non siano qui sotto. Chi vende: '+b.label+'. Scopo: '+goal[1]+'. Tono: '+tone[1]+'.\n'
 +'Cliente: '+model.customer+(model.contact?' ('+model.contact+')':'')+'. Venditore: '+(model.seller||'non indicato')+'. Titolo: '+model.title+'. Totale: '+model.totals.total+'.\n'
 +'Righe del preventivo:\n'+(model.lines.map(l=>'- '+l.description+' × '+l.quantity+' '+l.unit+' = '+l.net).join('\n')||'(nessuna)')+'\n\n'
 +'TESTI ATTUALI (chiave tra parentesi quadre):\n\n'+f+'\n\n'
 +'Rispondi SOLO con un oggetto JSON {chiave: testo} con le stesse chiavi, tutte, testo semplice senza markdown; nelle liste separa le voci con \\n. Mantieni i nomi e il saluto iniziale dell’apertura.';
}
function aiParse(text,model){
 const m=/\{[\s\S]*\}/.exec(String(text||''));if(!m)return null;let d;try{d=JSON.parse(m[0])}catch{return null}
 const allowed=new Set();const addNums=t=>{for(const n of String(t||'').match(/\d[\d.,]*/g)||[])allowed.add(n.replace(/[.,]$/,''))};
 for(const l of model.lines){addNums(l.quantity);addNums(l.unit_price);addNums(l.net);addNums(l.discount);addNums(l.vat);addNums(l.description)}
 addNums(model.totals.subtotal);addNums(model.totals.total);addNums(model.totals.discount);for(const v of model.totals.vat||[])addNums(v.amount+' '+v.label);addNums(model.validUntil);addNums(model.date);addNums(model.number);
 for(const x of fields(model))addNums(x.value);
 const out={},dropped=[];
 for(const x of fields(model)){const v=d[x.key];if(typeof v!=='string')continue;const t=v.trim().slice(0,x.max);if(!t||t===x.value)continue;
  const money=(t.match(/€\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|euro)/gi)||[]).map(s=>s.replace(/[^\d.,]/g,'').replace(/[.,]$/,''));
  if(money.some(n=>!allowed.has(n))){dropped.push(x.label);continue}out[x.key]=t}
 return {texts:out,dropped};
}
/* Checks before printing: what a careful seller would not send. */
function check(model){
 const lang=model.lang,out=[];if(!model.lines.length)out.push(T(lang,'Il preventivo non ha righe: l’offerta uscirebbe senza importi.','The quote has no lines: the proposal would go out without amounts.'));
 if(!model.seller)out.push(T(lang,'Manca l’intestazione del venditore: compilala in Vendite › Intestazione.','The seller letterhead is missing: fill it in Sales › Letterhead.'));
 for(const s of model.sections)if(s.kind==='text'&&/aggiungi qui|add here/i.test(s.text))out.push(T(lang,'La sezione «'+s.title+'» ha ancora il testo di esempio.','The section «'+s.title+'» still has the sample text.'));
 if(!model.validUntil)out.push(T(lang,'Il preventivo non ha una data di validità.','The quote has no validity date.'));return out;
}
/* The pages as HTML (string). look: id or object; brand: {primary,accent,font} from the identity kit overrides the look's colours. */
function html(model,look,brand){
 const lang=model.lang;const L={...(typeof look==='string'?byId(LOOKS,look)||LOOKS[0]:look||LOOKS[0]),...(brand||{})};
 const P=(cls,...inner)=>'<section class="of-page of-'+L.id+' '+cls+'" style="--of-primary:'+esc(L.primary)+';--of-accent:'+esc(L.accent)+';--of-paper:'+esc(L.paper)+';--of-ink:'+esc(L.ink)+';--of-font:'+esc(L.font)+';--of-head:'+esc(L.head)+'">'+inner.join('')+'</section>';
 const para=t=>esc(t).split(/\n+/).map(x=>'<p>'+x+'</p>').join('');
 const cover=P('of-cover','<div class="of-cover-band"></div><div class="of-cover-body"><p class="of-eyebrow">'+esc(model.seller||T(lang,'Proposta','Proposal'))+(model.number?T(lang,' · n. ',' · no. ')+esc(model.number):'')+'</p><h1>'+esc(model.title)+'</h1><p class="of-sub">'+esc(model.subtitle)+'</p><p class="of-date">'+esc(model.date)+(model.contact?T(lang,' · alla cortese attenzione di ',' · for the attention of ')+esc(model.contact):'')+'</p></div>');
 const body=[];body.push('<div class="of-block of-intro">'+para(model.intro)+'</div>');
 for(const s of model.sections){
  if(s.kind==='text')body.push('<div class="of-block"><h2>'+esc(s.title)+'</h2>'+para(s.text)+'</div>');
  else if(s.kind==='bullets')body.push('<div class="of-block"><h2>'+esc(s.title)+'</h2><ul class="of-bullets">'+s.items.map(i=>'<li>'+esc(i)+'</li>').join('')+'</ul></div>');
  else if(s.kind==='steps')body.push('<div class="of-block"><h2>'+esc(s.title)+'</h2><ol class="of-steps">'+s.items.map((i,n)=>'<li><span class="of-n">'+(n+1)+'</span><span>'+esc(i)+'</span></li>').join('')+'</ol></div>');
  else if(s.kind==='lines')body.push('<div class="of-block of-lines"><h2>'+esc(s.title)+'</h2><table><thead><tr><th>'+esc(locBusiness(byId(BUSINESS,model.business)||BUSINESS[0],lang).linesWord)+'</th><th class="num">'+T(lang,'Q.tà','Qty')+'</th><th class="num">'+T(lang,'Prezzo','Price')+'</th><th class="num">'+T(lang,'Importo','Amount')+'</th></tr></thead><tbody>'+model.lines.map(l=>'<tr><td>'+esc(l.description)+'</td><td class="num">'+esc(l.quantity)+' '+esc(l.unit)+'</td><td class="num">'+esc(l.unit_price)+(l.discount?'<small> −'+esc(l.discount)+'</small>':'')+'</td><td class="num">'+esc(l.net)+'</td></tr>').join('')+'</tbody></table></div>');
  else if(s.kind==='totals')body.push('<div class="of-block of-invest"><h2>'+esc(s.title)+'</h2><div class="of-totals"><div><span>'+T(lang,'Imponibile','Net total')+'</span><b>'+esc(model.totals.subtotal)+'</b></div>'+model.totals.vat.map(v=>'<div><span>'+esc(v.label)+'</span><b>'+esc(v.amount)+'</b></div>').join('')+'<div class="of-total"><span>'+T(lang,'Totale','Total')+'</span><b>'+esc(model.totals.total)+'</b></div></div><p class="of-note">'+esc(s.note)+'</p></div>');
 }
 body.push('<div class="of-block of-sign">'+para(model.signature)+(model.contactLine?'<p class="of-contact">'+esc(model.contactLine)+'</p>':'')+'</div>');
 return cover+P('of-body','<header class="of-run"><span>'+esc(model.seller||'')+'</span><span>'+esc(model.title)+'</span></header>'+body.join(''));
}
const looks=lang=>LOOKS.map(l=>locLook(l,lang));
const api={BUSINESS,GOALS,TONES,LOOKS,SECTION_TITLES,FIELD_MAX,TEXT_MAX,looks,suggestBusiness,questions,plan,fields,apply,check,aiPrompt,aiParse,html,euro,pct,longDate};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixOffertaCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
