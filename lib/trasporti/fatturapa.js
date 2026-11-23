/* Plancia (Trasporti) — electronic invoice (FatturaPA 1.2, FPR12 for companies) built from the rows to invoice of a
   customer. The XML is ready to be uploaded to the invoicing program or to the SdI through an intermediary: Plancia
   does not send it. VAT: domestic transport 22%; international transport of goods (loading and delivery in
   different countries) not taxable under art. 9 c.1 n.2 DPR 633/72 (Natura N3.4) with the 2 € virtual stamp duty
   above 77,47 €. The office can change the treatment of each row; the accountant confirms the rules. Pure functions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTrFatturaPA=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VAT={
 '22':{rate:22,label:'IVA 22%'},
 '10':{rate:10,label:'IVA 10%'},
 'N3.4':{rate:0,natura:'N3.4',label:'Non imponibile art. 9 (trasporto internazionale)',norma:'Non imponibile art. 9 c.1 n.2 DPR 633/72'},
 'N2.1':{rate:0,natura:'N2.1',label:'Non soggetta art. 7-ter (cliente estero)',norma:'Operazione non soggetta art. 7-ter DPR 633/72, inversione contabile'}
};
// the SdI accepts only Basic Latin and Latin-1: arrows, curly quotes and dashes are replaced, anything else dropped
const latin1=s=>String(s??'').replace(/[→⇒➔]/g,'-').replace(/[‘’‚‛]/g,"'").replace(/[“”„]/g,'"').replace(/[–—]/g,'-').replace(/…/g,'...').replace(/€/g,'EUR').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g,'');
const xml=s=>latin1(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const amt=c=>(Math.round(c)/100).toFixed(2);
const cut=(s,n)=>String(s||'').replace(/\s+/g,' ').trim().slice(0,n);

/* Default VAT treatment of a row: international when loading and delivery countries differ. */
function vatOf(row,customer){
 if(row.vat&&VAT[row.vat])return row.vat;
 const cc=(customer&&customer.nazione)||'IT';
 if(cc!=='IT')return 'N2.1';
 const a=row.load_country||'IT',b=row.delivery_country||'IT';
 return a!==b?'N3.4':'22';
}

/* company: {name, vat, cf?, street, cap, comune, provincia, regime?, iban?}
   customer: {name, vat, vat_country?, cf?, street, cap, comune, provincia?, nazione?, sdi?, pec?}
   rows: [{description, amount_cents, qty?, unit?, ddt?:{numero,data}, vat?, load_country?, delivery_country?}]
   → {xml, file_name, totals:{taxable_cents, vat_cents, total_cents, stamp}, errors:[]} */
function build({company,customer,number,date,rows,progressive,due_days=60,due_date,payment='MP05',stamp_duty=true,causale,bank}){
 const errors=[];const c=company||{},k=customer||{};
 if(!c.name)errors.push('Ragione sociale della tua azienda');
 if(!/^\d{11}$/.test(String(c.vat||'').replace(/^IT/i,'')))errors.push('Partita IVA della tua azienda (11 cifre)');
 if(!c.street||!c.cap||!c.comune)errors.push('Indirizzo della tua azienda');
 if(!k.name)errors.push('Ragione sociale del cliente');
 if(!k.vat&&!k.cf)errors.push('Partita IVA o codice fiscale del cliente');
 if(!k.street||!k.comune)errors.push('Indirizzo del cliente');
 if(!number)errors.push('Numero della fattura');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))errors.push('Data della fattura');
 if(!(rows||[]).length)errors.push('Almeno una riga');
 const foreign=(k.nazione||'IT')!=='IT';
 const lines=(rows||[]).map((r,i)=>{const v=vatOf(r,k);return {n:i+1,desc:cut(r.description,1000),qty:r.qty||1,unit:cut(r.unit,10),cents:Math.round(r.amount_cents||0),v,ddt:r.ddt};});
 // summary per VAT treatment
 const sum=new Map();
 for(const l of lines){const s=sum.get(l.v)||{taxable:0};s.taxable+=l.cents;sum.set(l.v,s);}
 let taxable=0,tax=0;
 for(const [v,s] of sum){s.tax=Math.round(s.taxable*VAT[v].rate/100);taxable+=s.taxable;tax+=s.tax;}
 const exempt=[...sum].filter(([v])=>VAT[v].natura).reduce((a,[,s])=>a+s.taxable,0);
 const stamp=stamp_duty!==false&&exempt>7747; // the accountant can switch it off for cases exempt from stamp duty
 const total=taxable+tax+(stamp?200:0);
 const due=/^\d{4}-\d{2}-\d{2}$/.test(due_date||'')?due_date:date?new Date(Date.parse(date)+due_days*86400000).toISOString().slice(0,10):'';
 const iban=String((bank&&bank.iban)||c.iban||'').replace(/\s/g,'').toUpperCase();
 const vatC=String(c.vat||'').replace(/^IT/i,'');
 const prog=String(progressive||number||'1').replace(/[^A-Za-z0-9]/g,'').slice(-5).padStart(5,'0');
 const kVat=k.vat?String(k.vat).replace(/^[A-Z]{2}/i,''):null,kCountry=k.vat_country||(String(k.vat||'').match(/^([A-Z]{2})/i)||[])[1]||k.nazione||'IT';
 const sede=(s,isForeign)=>'<Sede><Indirizzo>'+xml(cut(s.street,60))+'</Indirizzo><CAP>'+xml(isForeign?'00000':String(s.cap||'').slice(0,5))+'</CAP><Comune>'+xml(cut(s.comune,60))+'</Comune>'+(!isForeign&&s.provincia?'<Provincia>'+xml(s.provincia)+'</Provincia>':'')+'<Nazione>'+xml(isForeign?(k.nazione||'IT'):'IT')+'</Nazione></Sede>';
 const ddts=lines.filter(l=>l.ddt&&l.ddt.numero&&/^\d{4}-\d{2}-\d{2}$/.test(l.ddt.data||''));
 const out='<?xml version="1.0" encoding="UTF-8"?>\n'
 +'<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">\n'
 +'<FatturaElettronicaHeader>'
 +'<DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>'+xml(vatC)+'</IdCodice></IdTrasmittente><ProgressivoInvio>'+xml(prog)+'</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione>'
 +'<CodiceDestinatario>'+xml(foreign?'XXXXXXX':(k.sdi&&/^[A-Z0-9]{7}$/i.test(k.sdi)?k.sdi.toUpperCase():'0000000'))+'</CodiceDestinatario>'+(!foreign&&!k.sdi&&k.pec?'<PECDestinatario>'+xml(k.pec)+'</PECDestinatario>':'')+'</DatiTrasmissione>'
 +'<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>'+xml(vatC)+'</IdCodice></IdFiscaleIVA>'+(c.cf?'<CodiceFiscale>'+xml(c.cf)+'</CodiceFiscale>':'')+'<Anagrafica><Denominazione>'+xml(cut(c.name,80))+'</Denominazione></Anagrafica><RegimeFiscale>'+xml(c.regime||'RF01')+'</RegimeFiscale></DatiAnagrafici>'+sede(c,false)+'</CedentePrestatore>'
 +'<CessionarioCommittente><DatiAnagrafici>'+(kVat?'<IdFiscaleIVA><IdPaese>'+xml(kCountry.toUpperCase())+'</IdPaese><IdCodice>'+xml(kVat)+'</IdCodice></IdFiscaleIVA>':'')+(k.cf?'<CodiceFiscale>'+xml(k.cf)+'</CodiceFiscale>':'')+'<Anagrafica><Denominazione>'+xml(cut(k.name,80))+'</Denominazione></Anagrafica></DatiAnagrafici>'+sede(k,foreign)+'</CessionarioCommittente>'
 +'</FatturaElettronicaHeader>'
 +'<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa><Data>'+xml(date)+'</Data><Numero>'+xml(cut(number,20))+'</Numero>'
 +(stamp?'<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>2.00</ImportoBollo></DatiBollo>':'')
 +'<ImportoTotaleDocumento>'+amt(total)+'</ImportoTotaleDocumento><Causale>'+xml(cut(causale||'Servizi di autotrasporto merci',200))+'</Causale></DatiGeneraliDocumento>'
 +ddts.map(l=>'<DatiDDT><NumeroDDT>'+xml(cut(l.ddt.numero,20))+'</NumeroDDT><DataDDT>'+xml(l.ddt.data)+'</DataDDT><RiferimentoNumeroLinea>'+l.n+'</RiferimentoNumeroLinea></DatiDDT>').join('')
 +'</DatiGenerali><DatiBeniServizi>'
 +lines.map(l=>{const v=VAT[l.v];const unitPrice=l.cents/l.qty;return '<DettaglioLinee><NumeroLinea>'+l.n+'</NumeroLinea><Descrizione>'+xml(l.desc||'Trasporto')+'</Descrizione><Quantita>'+Number(l.qty).toFixed(2)+'</Quantita>'+(l.unit?'<UnitaMisura>'+xml(l.unit)+'</UnitaMisura>':'')
   +'<PrezzoUnitario>'+(unitPrice/100).toFixed(4)+'</PrezzoUnitario><PrezzoTotale>'+amt(l.cents)+'</PrezzoTotale><AliquotaIVA>'+v.rate.toFixed(2)+'</AliquotaIVA>'+(v.natura?'<Natura>'+v.natura+'</Natura>':'')+'</DettaglioLinee>';}).join('')
 +[...sum].map(([k2,s])=>{const v=VAT[k2];return '<DatiRiepilogo><AliquotaIVA>'+v.rate.toFixed(2)+'</AliquotaIVA>'+(v.natura?'<Natura>'+v.natura+'</Natura>':'')+'<ImponibileImporto>'+amt(s.taxable)+'</ImponibileImporto><Imposta>'+amt(s.tax)+'</Imposta>'+(v.natura?'':'<EsigibilitaIVA>I</EsigibilitaIVA>')+(v.norma?'<RiferimentoNormativo>'+xml(v.norma)+'</RiferimentoNormativo>':'')+'</DatiRiepilogo>';}).join('')
 +'</DatiBeniServizi><DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento><DettaglioPagamento>'+(bank&&bank.holder?'<Beneficiario>'+xml(cut(bank.holder,200))+'</Beneficiario>':'')+'<ModalitaPagamento>'+xml(payment)+'</ModalitaPagamento>'+(due?'<DataScadenzaPagamento>'+due+'</DataScadenzaPagamento>':'')+'<ImportoPagamento>'+amt(total)+'</ImportoPagamento>'+(bank&&bank.bank&&iban?'<IstitutoFinanziario>'+xml(cut(bank.bank,80))+'</IstitutoFinanziario>':'')+(iban?'<IBAN>'+xml(iban)+'</IBAN>':'')+(bank&&bank.bic&&iban?'<BIC>'+xml(String(bank.bic).replace(/\s/g,'').toUpperCase())+'</BIC>':'')+'</DettaglioPagamento></DatiPagamento>'
 +'</FatturaElettronicaBody></p:FatturaElettronica>\n';
 return {xml:out,file_name:'IT'+vatC+'_'+prog+'.xml',totals:{taxable_cents:taxable,vat_cents:tax,total_cents:total,stamp},due,lines:lines.map(l=>({n:l.n,description:l.desc,amount_cents:l.cents,vat:l.v,vat_label:VAT[l.v].label})),summary:[...sum].map(([k2,x])=>({vat:k2,label:VAT[k2].label,norma:VAT[k2].norma||null,taxable_cents:x.taxable,tax_cents:x.tax})),errors};
}
return {VAT,vatOf,build};
});
