/* RADIX Accounting — standard Italian chart of accounts (piano dei conti) for small companies.
   Each account has a kind (A attività, P passività, N patrimonio netto, R ricavo, C costo), the group of the
   riclassified income statement (ce) or balance sheet (sp), and optional keywords used to suggest the account
   for an invoice line. Pure data and helpers: the page, the API and the tests share them. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixChartOfAccounts=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Accounts the posting engine needs by role. Companies can rename them but not delete them.
const SYSTEM=Object.freeze({customers:'02.01',vatCredit:'02.10',vatSettlement:'02.11',withholdingCredit:'02.12',bank:'03.01',cash:'03.02',suppliers:'04.01',vatDebit:'04.10',withholdingDebit:'04.11',vatNonDeductible:'65.03',bankFees:'61.07',revenueServices:'70.02',revenueGoods:'70.01',defaultCost:'65.01',yearResult:'06.04',salaries:'04.20'});
const A=(code,name,kind,group,kw)=>Object.freeze({code,name,kind,group,keywords:kw||null});
const STANDARD=Object.freeze([
 A('01.01','Software, licenze e marchi','A','immobilizzazioni'),
 A('01.10','Impianti e macchinari','A','immobilizzazioni'),
 A('01.11','Attrezzature','A','immobilizzazioni'),
 A('01.12','Macchine d\'ufficio elettroniche','A','immobilizzazioni','computer|notebook|laptop|pc |monitor|server|stampante'),
 A('01.13','Mobili e arredi','A','immobilizzazioni','arred|mobili|scrivani|sedia|sedie'),
 A('01.14','Automezzi','A','immobilizzazioni'),
 A('01.90','Fondi ammortamento','A','immobilizzazioni'),
 A('02.01','Crediti verso clienti','A','crediti_clienti'),
 A('02.02','Fatture da emettere','A','crediti_clienti'),
 A('02.10','IVA a credito','A','crediti_tributari'),
 A('02.11','Erario c/IVA','A','crediti_tributari'),
 A('02.12','Crediti per ritenute subite','A','crediti_tributari'),
 A('02.20','Anticipi e crediti diversi','A','crediti_altri'),
 A('03.01','Banca c/c','A','liquidita'),
 A('03.02','Cassa','A','liquidita'),
 A('03.03','Carte di pagamento','A','liquidita'),
 A('04.01','Debiti verso fornitori','P','debiti_fornitori'),
 A('04.02','Fatture da ricevere','P','debiti_fornitori'),
 A('04.10','IVA a debito','P','debiti_tributari'),
 A('04.11','Erario c/ritenute da versare','P','debiti_tributari'),
 A('04.12','Debiti tributari diversi','P','debiti_tributari'),
 A('04.20','Debiti verso dipendenti','P','debiti_altri'),
 A('04.21','Debiti verso istituti previdenziali','P','debiti_altri'),
 A('04.30','Finanziamenti bancari','P','debiti_finanziari'),
 A('04.40','Debiti diversi','P','debiti_altri'),
 A('05.01','Fondo TFR','P','tfr'),
 A('06.01','Capitale sociale','N','patrimonio'),
 A('06.02','Riserve','N','patrimonio'),
 A('06.03','Utili (perdite) portati a nuovo','N','patrimonio'),
 A('06.04','Utile (perdita) d\'esercizio','N','patrimonio'),
 A('60.01','Acquisto merci e materie prime','C','acquisti','merc|materie prime|prodotti finiti|semilavorat'),
 A('60.02','Materiali di consumo','C','acquisti','cancelleria|toner|carta |materiale di consumo|consumabil|imballag'),
 A('61.01','Consulenze professionali','C','servizi','consulen|parcella|onorari|prestazione professionale|avvocat|notai|commercialist|revision'),
 A('61.02','Pubblicità e marketing','C','servizi','pubblicit|marketing|sponsor|advertising| ads|campagna|inserzion|social media'),
 A('61.03','Utenze (energia, telefono, internet)','C','servizi','energia|elettric|luce|gas |acqua|telefon|fibra|internet|mobile|sim |adsl|connettivit'),
 A('61.04','Software e servizi cloud','C','servizi','software|licenz|saas|cloud|hosting|dominio|abbonamento|subscription|aws|azure|google workspace|microsoft 365'),
 A('61.05','Trasporti e spedizioni','C','servizi','trasport|spedizion|corriere|logistic|consegna'),
 A('61.06','Manutenzioni e riparazioni','C','servizi','manutenz|riparaz|assistenza tecnica'),
 A('61.07','Spese e commissioni bancarie','C','servizi','commission|spese bancarie|canone conto|spese tenuta'),
 A('61.08','Assicurazioni','C','servizi','assicuraz|polizza|premio assicurativo'),
 A('61.09','Viaggi e trasferte','C','servizi','hotel|albergo|treno|volo|trasferta|biglietto|alloggio|taxi|noleggio auto'),
 A('61.10','Compensi amministratori','C','servizi'),
 A('61.11','Formazione','C','servizi','formazione|corso|training|seminario|master'),
 A('62.01','Affitti e locazioni','C','godimento','affitto|locazione|canone di locazione|pigione'),
 A('62.02','Noleggi e leasing','C','godimento','noleggio|leasing|canone noleggio'),
 A('63.01','Salari e stipendi','C','personale'),
 A('63.02','Oneri sociali','C','personale'),
 A('63.03','Trattamento di fine rapporto','C','personale'),
 A('64.01','Ammortamenti immateriali','C','ammortamenti'),
 A('64.02','Ammortamenti materiali','C','ammortamenti'),
 A('65.01','Oneri diversi di gestione','C','oneri_diversi'),
 A('65.02','Imposte e tasse non sul reddito','C','oneri_diversi','imposta di bollo|diritti camerali|tassa|tributo|imu'),
 A('65.03','IVA indetraibile','C','oneri_diversi'),
 A('66.01','Interessi passivi','C','oneri_finanziari','interessi passivi|interessi di mora'),
 A('66.02','Altri oneri finanziari','C','oneri_finanziari'),
 A('67.01','Imposte sul reddito','C','imposte'),
 A('70.01','Ricavi vendite prodotti','R','ricavi'),
 A('70.02','Ricavi prestazioni di servizi','R','ricavi'),
 A('70.05','Resi e sconti su vendite','R','ricavi'),
 A('70.10','Altri ricavi e proventi','R','altri_ricavi'),
 A('70.20','Proventi finanziari','R','proventi_finanziari','interessi attivi')
]);
// Riclassified income statement (a valore aggiunto) and balance sheet labels.
const CE_GROUPS=Object.freeze({ricavi:'Ricavi delle vendite e prestazioni',altri_ricavi:'Altri ricavi e proventi',acquisti:'Acquisti di merci e materiali',servizi:'Costi per servizi',godimento:'Godimento beni di terzi',personale:'Costo del personale',ammortamenti:'Ammortamenti',oneri_diversi:'Oneri diversi di gestione',proventi_finanziari:'Proventi finanziari',oneri_finanziari:'Oneri finanziari',imposte:'Imposte sul reddito'});
const SP_GROUPS=Object.freeze({immobilizzazioni:'Immobilizzazioni',crediti_clienti:'Crediti verso clienti',crediti_tributari:'Crediti tributari',crediti_altri:'Altri crediti',liquidita:'Disponibilità liquide',debiti_fornitori:'Debiti verso fornitori',debiti_tributari:'Debiti tributari',debiti_altri:'Altri debiti',debiti_finanziari:'Debiti finanziari',tfr:'Fondo TFR',patrimonio:'Patrimonio netto'});
const KINDS=Object.freeze({A:'Attività',P:'Passività',N:'Patrimonio netto',R:'Ricavo',C:'Costo'});
const CODE=/^\d{2}\.\d{2}(?:\.\d{2})?$/;
function index(accounts){const m=new Map();for(const a of accounts||STANDARD)m.set(a.code,a);return m;}
// Lowercase without accents so 'Pubblicità' matches 'pubblicit'.
function norm(s){return ' '+String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ')+' ';}
// Suggest the cost (or revenue) account for a text: the account whose keyword matches, else the fallback.
function suggest(text,{accounts=STANDARD,kind='C',fallback}={}){
 const t=norm(text);
 for(const a of accounts){if(a.kind!==kind||!a.keywords)continue;for(const k of a.keywords.split('|'))if(t.includes(norm(k).slice(1,-1)))return {code:a.code,reason:'parola chiave «'+k.trim()+'»'};}
 return {code:fallback||(kind==='R'?SYSTEM.revenueServices:SYSTEM.defaultCost),reason:'conto predefinito'};
}
// Validates a custom chart: codes unique and well formed, kinds and groups known, system accounts present.
function validate(accounts){
 const errors=[],seen=new Set();
 for(const a of accounts){
  if(!a||!CODE.test(a.code))errors.push('Codice conto non valido: '+(a&&a.code));
  else if(seen.has(a.code))errors.push('Codice duplicato: '+a.code);
  else seen.add(a.code);
  if(!a||typeof a.name!=='string'||!a.name.trim()||a.name.length>120)errors.push('Nome conto obbligatorio: '+(a&&a.code));
  if(!a||!Object.hasOwn(KINDS,a.kind))errors.push('Tipo conto non valido: '+(a&&a.code));
  else if(!(['R','C'].includes(a.kind)?Object.hasOwn(CE_GROUPS,a.group):Object.hasOwn(SP_GROUPS,a.group)))errors.push('Gruppo non valido per '+a.code);
 }
 for(const c of Object.values(SYSTEM))if(!seen.has(c))errors.push('Manca il conto di sistema '+c);
 return errors;
}
return {STANDARD,SYSTEM,CE_GROUPS,SP_GROUPS,KINDS,index,suggest,validate,norm};
});
