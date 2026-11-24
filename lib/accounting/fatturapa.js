/* RADIX FatturaPA — parses Italian electronic invoices (FPR12/FPA12 XML) into plain objects.
   Pure functions (no DOM, no I/O). Amounts are integer euro cents, dates YYYY-MM-DD. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixFatturaPA=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

// Exact decimal string -> cents; more than 2 decimals round half away from zero. FatturaPA uses '.' only.
function cents(s){
 const str=String(s==null?'':s).trim();
 if(str.includes(','))throw new Error(`Importo non valido "${str}": FatturaPA usa il punto come separatore decimale`);
 const m=/^([+-])?(\d*)(?:\.(\d*))?$/.exec(str);
 if(!m||!(m[2]||m[3]))throw new Error(`Importo non valido "${str}"`);
 const frac=(m[3]||'')+'000',whole=m[2]||'0';
 let v=Number(whole)*100+Number(frac.slice(0,2));
 if(frac.charCodeAt(2)>=53)v+=1;
 return m[1]==='-'&&v!==0?-v:v;
}
const centsOr=(s,d)=>s==null?d:cents(s);

const ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
const decode=s=>s.indexOf('&')<0?s:s.replace(/&([^;&\s]*);?/g,(all,e)=>{
 if(!all.endsWith(';'))throw new Error(`Entità XML non terminata: ${all}`);
 if(ENT[e])return ENT[e];
 const m=/^#(?:x([0-9a-fA-F]+)|(\d+))$/.exec(e);
 if(!m)throw new Error(`Entità XML non supportata: &${e};`);
 const cp=m[1]?parseInt(m[1],16):parseInt(m[2],10);
 if(cp>0x10FFFF||cp===0)throw new Error(`Carattere non valido: &${e};`);
 return String.fromCodePoint(cp);
});
const local=n=>n.slice(n.indexOf(':')+1);

// Minimal non-validating XML tree builder: elements, attributes, text, CDATA; skips comments and PIs.
function parseXml(xml){
 let s=String(xml);if(s.charCodeAt(0)===0xFEFF)s=s.slice(1);
 const top={name:'#doc',attrs:{},children:[],text:''},stack=[top];let i=0,rootSeen=false;
 const end=(tok,from)=>{const j=s.indexOf(tok,from);if(j<0)throw new Error('XML non valido: costrutto non chiuso');return j};
 while(i<s.length){
  const lt=s.indexOf('<',i),cur=stack[stack.length-1];
  if(lt<0||lt>i){const t=s.slice(i,lt<0?s.length:lt);if(stack.length>1)cur.text+=decode(t);else if(t.trim())throw new Error('XML non valido: testo fuori dalla radice');if(lt<0)break;i=lt;continue}
  if(s.startsWith('<?',i)){i=end('?>',i)+2;continue}
  if(s.startsWith('<!--',i)){i=end('-->',i)+3;continue}
  if(s.startsWith('<![CDATA[',i)){const j=end(']]>',i);if(stack.length<2)throw new Error('XML non valido: CDATA fuori dalla radice');cur.text+=s.slice(i+9,j);i=j+3;continue}
  if(/^<!DOCTYPE/i.test(s.slice(i,i+9)))throw new Error('DOCTYPE non consentito');
  if(s.startsWith('<!',i))throw new Error('XML non valido: dichiarazione non supportata');
  if(s[i+1]==='/'){
   const j=end('>',i),name=s.slice(i+2,j).trim();
   if(stack.length<2||cur.raw!==name)throw new Error(`XML non valido: chiusura inattesa </${name}>`);
   stack.pop();i=j+1;continue;
  }
  const m=/^<([A-Za-z_][\w.\-:]*)((?:\s+[A-Za-z_][\w.\-:]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/.exec(s.slice(i,i+4096));
  if(!m)throw new Error('XML non valido: tag malformato');
  if(stack.length===1&&rootSeen)throw new Error('XML non valido: più elementi radice');
  const node={raw:m[1],name:local(m[1]),attrs:{},children:[],text:''};
  m[2].replace(/([A-Za-z_][\w.\-:]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,(_,k,a,b)=>{node.attrs[local(k)]=decode(a!=null?a:b);return''});
  cur.children.push(node);if(stack.length===1)rootSeen=true;
  if(!m[3])stack.push(node);
  i+=m[0].length;
 }
 if(stack.length>1)throw new Error(`XML non valido: elemento <${stack[stack.length-1].raw}> non chiuso`);
 if(!top.children[0])throw new Error('XML non valido: documento vuoto');
 return top.children[0];
}

const kid=(n,...path)=>{for(const p of path){n=n&&n.children.find(c=>c.name===p)}return n||null};
const kids=(n,name)=>n?n.children.filter(c=>c.name===name):[];
const txt=(n,...path)=>{const x=kid(n,...path);if(!x)return null;const t=x.text.trim();return t===''?null:t};
const num=v=>v==null?null:Number(v);
const fmt=c=>{const a=Math.abs(c);return(c<0?'-':'')+Math.floor(a/100)+'.'+String(a%100).padStart(2,'0')};
// round(taxable*rate/100) in integer arithmetic (rate with up to 2 decimals)
const vatOf=(taxable,rate)=>{const n=taxable*Math.round(rate*100),q=Math.floor(Math.abs(n)/10000),r=Math.abs(n)%10000;const v=q+(r>=5000?1:0);return n<0?-v:v};

function party(n,withRegime){
 if(!n)return null;
 const da=kid(n,'DatiAnagrafici'),an=kid(da,'Anagrafica'),sede=kid(n,'Sede');
 const country=txt(da,'IdFiscaleIVA','IdPaese'),code=txt(da,'IdFiscaleIVA','IdCodice');
 const name=txt(an,'Denominazione')||[txt(an,'Nome'),txt(an,'Cognome')].filter(Boolean).join(' ')||null;
 const p={name,vat:country&&code?country+code:null,taxCode:txt(da,'CodiceFiscale')};
 if(withRegime)p.regime=txt(da,'RegimeFiscale');
 p.address={street:txt(sede,'Indirizzo'),number:txt(sede,'NumeroCivico'),zip:txt(sede,'CAP'),city:txt(sede,'Comune'),province:txt(sede,'Provincia'),country:txt(sede,'Nazione')};
 return p;
}

function body(b,warnings){
 const dg=kid(b,'DatiGenerali'),gd=kid(dg,'DatiGeneraliDocumento'),bs=kid(b,'DatiBeniServizi');
 const doc={type:txt(gd,'TipoDocumento'),currency:txt(gd,'Divisa'),date:txt(gd,'Data'),number:txt(gd,'Numero'),
  total_cents:centsOr(txt(gd,'ImportoTotaleDocumento'),null),rounding_cents:centsOr(txt(gd,'Arrotondamento'),0),
  stamp_cents:centsOr(txt(gd,'DatiBollo','ImportoBollo'),0),
  causale:kids(gd,'Causale').map(c=>c.text.trim()).filter(Boolean).join(' ')||null};
 const label=`Documento ${doc.number||'senza numero'}`;
 doc.withholding=kids(gd,'DatiRitenuta').map(r=>({type:txt(r,'TipoRitenuta'),rate:num(txt(r,'AliquotaRitenuta')),amount_cents:centsOr(txt(r,'ImportoRitenuta'),0),reason:txt(r,'CausalePagamento')}));
 doc.fund=kids(gd,'DatiCassaPrevidenziale').map(c=>({type:txt(c,'TipoCassa'),rate:num(txt(c,'AlCassa')),amount_cents:centsOr(txt(c,'ImportoContributoCassa'),0),taxable_cents:centsOr(txt(c,'ImponibileCassa'),null),vatRate:num(txt(c,'AliquotaIVA')),withholding:txt(c,'Ritenuta')==='SI',nature:txt(c,'Natura')}));
 doc.lines=kids(bs,'DettaglioLinee').map(l=>({n:num(txt(l,'NumeroLinea')),description:txt(l,'Descrizione'),quantity:num(txt(l,'Quantita')),unit_price:txt(l,'PrezzoUnitario'),total_cents:centsOr(txt(l,'PrezzoTotale'),0),vatRate:num(txt(l,'AliquotaIVA')),nature:txt(l,'Natura'),withholding:txt(l,'Ritenuta')==='SI'}));
 doc.summary=kids(bs,'DatiRiepilogo').map(r=>({vatRate:num(txt(r,'AliquotaIVA')),nature:txt(r,'Natura'),taxable_cents:centsOr(txt(r,'ImponibileImporto'),0),vat_cents:centsOr(txt(r,'Imposta'),0),exigibility:txt(r,'EsigibilitaIVA')||'I',rounding_cents:centsOr(txt(r,'Arrotondamento'),0),reference:txt(r,'RiferimentoNormativo')}));
 doc.payments=[];
 for(const dp of kids(b,'DatiPagamento'))for(const p of kids(dp,'DettaglioPagamento'))
  doc.payments.push({terms:txt(dp,'CondizioniPagamento'),method:txt(p,'ModalitaPagamento'),due:txt(p,'DataScadenzaPagamento'),amount_cents:centsOr(txt(p,'ImportoPagamento'),0),iban:txt(p,'IBAN')});
 const ids=name=>kids(dg,name).map(x=>txt(x,'IdDocumento')).filter(Boolean);
 doc.references={orders:ids('DatiOrdineAcquisto'),linked:ids('DatiFattureCollegate')};
 doc.computed_total_cents=doc.summary.reduce((a,r)=>a+r.taxable_cents+r.vat_cents,0)+doc.rounding_cents;
 if(!doc.summary.length)warnings.push(`${label}: DatiRiepilogo mancante`);
 for(const r of doc.summary){
  const exp=vatOf(r.taxable_cents,r.vatRate||0);
  if(Math.abs(exp-r.vat_cents)>1)warnings.push(`${label}: imposta ${fmt(r.vat_cents)} non coerente con imponibile ${fmt(r.taxable_cents)} al ${r.vatRate}% (attesa ${fmt(exp)})`);
 }
 if(doc.total_cents!=null&&Math.abs(doc.total_cents-doc.computed_total_cents)>1)
  warnings.push(`${label}: totale documento ${fmt(doc.total_cents)} diverso dal totale calcolato ${fmt(doc.computed_total_cents)}`);
 if(doc.payments.length){
  // split payment ('S'): the customer pays the VAT to the treasury, so it is excluded from the amount due
  const split=doc.summary.filter(r=>r.exigibility==='S').reduce((a,r)=>a+r.vat_cents,0);
  const due=(doc.total_cents!=null?doc.total_cents:doc.computed_total_cents)-doc.withholding.reduce((a,w)=>a+w.amount_cents,0);
  const paid=doc.payments.reduce((a,p)=>a+p.amount_cents,0);
  if(paid!==due&&paid!==due-split)warnings.push(`${label}: somma pagamenti ${fmt(paid)} diversa dal netto a pagare ${fmt(due)}`);
 }
 return doc;
}

function parse(xmlString){
 const root=parseXml(xmlString);
 if(root.name!=='FatturaElettronica')throw new Error(`Il file non è una FatturaPA: elemento radice <${root.raw}> invece di FatturaElettronica`);
 const h=kid(root,'FatturaElettronicaHeader'),dt=kid(h,'DatiTrasmissione'),warnings=[];
 const bodies=kids(root,'FatturaElettronicaBody');
 if(!h)warnings.push('FatturaElettronicaHeader mancante');
 if(!bodies.length)warnings.push('Nessun FatturaElettronicaBody nel file');
 return{format:root.attrs.versione||null,
  transmitter:{country:txt(dt,'IdTrasmittente','IdPaese'),id:txt(dt,'IdTrasmittente','IdCodice'),progressive:txt(dt,'ProgressivoInvio')},
  supplier:party(kid(h,'CedentePrestatore'),true),customer:party(kid(h,'CessionarioCommittente'),false),
  documents:bodies.map(b=>body(b,warnings)),warnings};
}

return{parse,cents};
});
