/* RADIX Accounting — the electronic invoice (FatturaPA FPR12) for the monthly fee a client company pays.
   Pure functions: seller, buyer and amounts in, XML string out. Amounts are integer euro cents. The seller is the
   company that runs RADIX Contabilità (ACCOUNTING_SELLER on the server, still to be filled in); until it exists
   the invoices are numbered and recorded but no XML is produced. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixFeeInvoice=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const amount=c=>{const n=Math.abs(c),s=(c<0?'-':'')+Math.floor(n/100)+'.'+String(n%100).padStart(2,'0');return s;};
const el=(name,value)=>value===undefined||value===null||value===''?'':'<'+name+'>'+esc(value)+'</'+name+'>';

// Gross amount paid by card -> net and VAT, so that net + VAT is exactly the gross.
function split(grossCents,rate=22){const net=Math.round(grossCents*100/(100+rate));return {net_cents:net,vat_cents:grossCents-net,gross_cents:grossCents,rate};}

function vatId(v){const m=/^([A-Z]{2})([0-9A-Z]{2,28})$/.exec(String(v||''));return m?{country:m[1],code:m[2]}:null;}

// What is missing to issue a valid invoice to this buyer, in the client's words.
function missing(party,{seller=false}={}){
 const out=[];if(!party)return ['dati'];
 if(!party.name)out.push('ragione sociale');
 if(!vatId(party.vat)&&!party.tax_code)out.push('partita IVA o codice fiscale');
 if(!party.address)out.push('indirizzo');if(!/^\d{5}$/.test(party.zip||''))out.push('CAP');if(!party.city)out.push('comune');
 if(!/^[A-Z]{2}$/.test(party.province||''))out.push('provincia');
 if(seller){if(!vatId(party.vat))out.push('partita IVA');if(!party.regime_fiscale)out.push('regime fiscale');}
 else if(!/^[A-Z0-9]{7}$/.test(party.sdi_code||'')&&!party.pec)out.push('codice destinatario o PEC');
 return out;
}

function anagrafica(p,{seller}){
 const id=vatId(p.vat);
 return '<DatiAnagrafici>'+(id?'<IdFiscaleIVA>'+el('IdPaese',id.country)+el('IdCodice',id.code)+'</IdFiscaleIVA>':'')+el('CodiceFiscale',p.tax_code)+
  '<Anagrafica>'+el('Denominazione',p.name)+'</Anagrafica>'+(seller?el('RegimeFiscale',p.regime_fiscale):'')+'</DatiAnagrafici>'+
  '<Sede>'+el('Indirizzo',p.address)+el('CAP',p.zip)+el('Comune',p.city)+el('Provincia',p.province)+el('Nazione',p.country||'IT')+'</Sede>';
}

/* invoice: {number, date 'YYYY-MM-DD', progressive (≤10 chars), lines:[{description, net_cents}], vat_rate,
   gross_cents (what the card paid), payment:'MP08'}. The VAT summary is computed from the gross so the document
   total equals what was charged. */
function build(seller,buyer,invoice){
 const ms=missing(seller,{seller:true}),mb=missing(buyer);
 if(ms.length)throw new Error('Dati del fornitore incompleti: '+ms.join(', ')+'.');
 if(mb.length)throw new Error('Dati del cliente incompleti: '+mb.join(', ')+'.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(invoice.date||''))throw new Error('Data della fattura non valida.');
 if(!/^[0-9A-Za-z]{1,10}$/.test(invoice.progressive||''))throw new Error('Progressivo di invio non valido.');
 const rate=invoice.vat_rate??22,t=split(invoice.gross_cents,rate),lines=invoice.lines||[];
 if(!lines.length||lines.reduce((s,l)=>s+l.net_cents,0)!==t.net_cents)throw new Error('Le righe non tornano con l\'importo pagato.');
 const sid=vatId(seller.vat),pec=!/^[A-Z0-9]{7}$/.test(buyer.sdi_code||'');
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">'+
  '<FatturaElettronicaHeader><DatiTrasmissione><IdTrasmittente>'+el('IdPaese',sid.country)+el('IdCodice',sid.code)+'</IdTrasmittente>'+el('ProgressivoInvio',invoice.progressive)+el('FormatoTrasmissione','FPR12')+
  el('CodiceDestinatario',pec?'0000000':buyer.sdi_code)+(pec?el('PECDestinatario',buyer.pec):'')+'</DatiTrasmissione>'+
  '<CedentePrestatore>'+anagrafica(seller,{seller:true})+'</CedentePrestatore><CessionarioCommittente>'+anagrafica(buyer,{seller:false})+'</CessionarioCommittente></FatturaElettronicaHeader>'+
  '<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento>'+el('TipoDocumento','TD01')+el('Divisa','EUR')+el('Data',invoice.date)+el('Numero',invoice.number)+el('ImportoTotaleDocumento',amount(t.gross_cents))+
  (invoice.causale?el('Causale',String(invoice.causale).slice(0,200)):'')+'</DatiGeneraliDocumento></DatiGenerali>'+
  '<DatiBeniServizi>'+lines.map((l,i)=>'<DettaglioLinee>'+el('NumeroLinea',i+1)+el('Descrizione',String(l.description).slice(0,1000))+el('Quantita','1.00')+el('PrezzoUnitario',amount(l.net_cents))+el('PrezzoTotale',amount(l.net_cents))+el('AliquotaIVA',rate.toFixed(2))+'</DettaglioLinee>').join('')+
  '<DatiRiepilogo>'+el('AliquotaIVA',rate.toFixed(2))+el('ImponibileImporto',amount(t.net_cents))+el('Imposta',amount(t.vat_cents))+el('EsigibilitaIVA','I')+'</DatiRiepilogo></DatiBeniServizi>'+
  '<DatiPagamento>'+el('CondizioniPagamento','TP02')+'<DettaglioPagamento>'+el('ModalitaPagamento',invoice.payment||'MP08')+el('DataScadenzaPagamento',invoice.date)+el('ImportoPagamento',amount(t.gross_cents))+'</DettaglioPagamento></DatiPagamento>'+
  '</FatturaElettronicaBody></p:FatturaElettronica>';
}
// SDI file name: country + VAT number of the transmitter, then the progressive.
const fileName=(seller,progressive)=>{const id=vatId(seller.vat);return id.country+id.code+'_'+progressive+'.xml';};
// Progressive of transmission: two digits of the year and the number in base 36, unique per seller (46.655 a year).
const progressive=(year,number)=>String(year).slice(-2)+number.toString(36).toUpperCase().padStart(3,'0');

return {build,split,missing,fileName,progressive,vatId};
});
