/* RADIX CAMT — parses ISO 20022 bank statements (camt.053, also camt.052 reports / camt.054 notifications)
   into the same movement shape as RadixBankCSV.parseStatement. Pure functions (no DOM, no I/O).
   Amounts are integer cents (+ in, - out), dates YYYY-MM-DD. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCAMT=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MAX_WARNINGS=20,MAX_BYTES=5*1024*1024,MAX_DESC=500;
const NOT_CAMT='Il file non è un estratto conto CAMT (ISO 20022).';
// Message element -> per-account block element (053 Stmt, 052 Rpt, 054 Ntfctn)
const MSGS={BkToCstmrStmt:'Stmt',BkToCstmrAcctRpt:'Rpt',BkToCstmrDbtCdtNtfctn:'Ntfctn'};
const collapse=s=>String(s==null?'':s).replace(/[\s ]+/g,' ').trim();

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

// Minimal non-validating XML tree builder (names by local part): elements, attributes, text, CDATA; skips comments and PIs.
function parseXml(xml){
 const s=String(xml);
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
const txt=(n,...path)=>{const x=kid(n,...path);if(!x)return null;const t=collapse(x.text);return t===''?null:t};

// Exact decimal string -> cents (no floats); >2 decimals round half away from zero. Returns null if invalid.
function toCents(s){
 const m=/^([+-])?(\d*)(?:\.(\d*))?$/.exec(String(s==null?'':s).trim());
 if(!m||!(m[2]||m[3]))return null;
 const f=(m[3]||'')+'000',v=Number(m[2]||'0')*100+Number(f.slice(0,2))+(f.charCodeAt(2)>=53?1:0);
 return m[1]==='-'&&v!==0?-v:v;
}

const DIM=[31,28,31,30,31,30,31,31,30,31,30,31];
function isoDate(s){
 const x=/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(String(s==null?'':s).trim());if(!x)return null;
 const y=+x[1],m=+x[2],d=+x[3],leap=y%4===0&&(y%100!==0||y%400===0);
 return m>=1&&m<=12&&d>=1&&d<=(m===2&&leap?29:DIM[m-1])?`${x[1]}-${x[2]}-${x[3]}`:null;
}
const dateOf=n=>isoDate(txt(n,'Dt')||txt(n,'DtTm'));

function isCamt(text){
 const h=String(text==null?'':text).slice(0,65536);
 return h.includes('urn:iso:std:iso:20022:tech:xsd:camt.05')||/<(?:[\w.-]+:)?(?:BkToCstmrStmt|BkToCstmrAcctRpt|BkToCstmrDbtCdtNtfctn)[\s>]/.test(h);
}

// Party name: <Nm> directly (.02-.07) or under <Pty> (.08+)
const partyName=n=>n?txt(n,'Nm')||txt(n,'Pty','Nm'):null;
const signed=(amtNode,ind)=>{const v=toCents(amtNode&&amtNode.text);return v==null?null:ind==='DBIT'?-v:v};

function balances(stmt){
 let opening=null,closing=null,prcd=null;
 for(const b of kids(stmt,'Bal')){
  const cd=txt(b,'Tp','CdOrPrtry','Cd'),v=signed(kid(b,'Amt'),txt(b,'CdtDbtInd'));
  if(cd==='OPBD'&&opening==null)opening=v;else if(cd==='PRCD'&&prcd==null)prcd=v;else if(cd==='CLBD'&&closing==null)closing=v;
 }
 return{opening:opening!=null?opening:prcd,closing};
}

const utf8Len=s=>{let b=0;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);b+=c<0x80?1:c<0x800?2:c>=0xD800&&c<0xDC00?(i++,4):3}return b};

function parseStatement(text,options={}){
 let s=String(text==null?'':text);if(s.charCodeAt(0)===0xFEFF)s=s.slice(1);
 if(s.length>MAX_BYTES||(s.length*3>MAX_BYTES&&utf8Len(s)>MAX_BYTES))throw new Error('File troppo grande: il limite per un estratto conto CAMT è 5 MB.');
 if(!isCamt(s))throw new Error(NOT_CAMT);
 const root=parseXml(s),msg=MSGS[root.name]?root:root.children.find(c=>MSGS[c.name]);
 if(!msg)throw new Error(NOT_CAMT);
 const invertReversal=options.reversalInvertsSign===true;
 const stmts=kids(msg,MSGS[msg.name]),rows=[],warnings=[];let dropped=0,line=0,account=null,opening=null,closing=null,firstSeen=false,otherIban=false;
 const pend={n:0},other={};
 const warn=m=>{dropped++;if(warnings.length<MAX_WARNINGS)warnings.push(m)};
 for(const st of stmts){
  const acct=kid(st,'Acct'),iban=txt(acct,'Id','IBAN'),ccy=txt(acct,'Ccy'),bal=balances(st);
  if(!firstSeen){firstSeen=true;account={iban:iban?iban.replace(/\s/g,'').toUpperCase():null,currency:ccy?ccy.toUpperCase():null};opening=bal.opening;closing=bal.closing}
  else if((iban?iban.replace(/\s/g,'').toUpperCase():null)!==account.iban)otherIban=true;
  else if(bal.closing!=null)closing=bal.closing;
  for(const e of kids(st,'Ntry')){
   line++;
   const sts=(txt(e,'Sts','Cd')||txt(e,'Sts')||'').toUpperCase();
   if(sts==='PDNG'||sts==='PENDING'){pend.n++;continue}
   if(sts&&sts!=='BOOK'&&sts!=='BOOKED'){other[sts]=(other[sts]||0)+1;continue}
   const amtNode=kid(e,'Amt'),ind=txt(e,'CdtDbtInd');let amount=signed(amtNode,ind);
   if(amount==null||(ind!=='CRDT'&&ind!=='DBIT')){warn(`Movimento ${line}: importo non valido "${collapse(amtNode&&amtNode.text)}${ind?' '+ind:''}"`);continue}
   if(invertReversal&&/^(true|1)$/i.test(txt(e,'RvslInd')||''))amount=amount?-amount:0;
   const date=dateOf(kid(e,'BookgDt'))||dateOf(kid(e,'ValDt'));
   if(!date){warn(`Movimento ${line}: data contabile mancante o non valida`);continue}
   const txs=[];for(const d of kids(e,'NtryDtls'))txs.push(...kids(d,'TxDtls'));
   const ustrd=[],addtx=[],names=[],e2e=[];
   for(const t of txs){
    for(const r of kids(t,'RmtInf'))for(const u of kids(r,'Ustrd')){const v=collapse(u.text);if(v)ustrd.push(v)}
    const a=txt(t,'AddtlTxInf');if(a)addtx.push(a);
    const rp=kid(t,'RltdPties'),dn=partyName(kid(rp,'Dbtr')),cn=partyName(kid(rp,'Cdtr'));
    const nm=ind==='CRDT'?dn||cn:cn||dn;if(nm&&!names.includes(nm))names.push(nm);
    const r=txt(t,'Refs','EndToEndId');if(r&&r!=='NOTPROVIDED')e2e.push(r);
   }
   const seen=new Set(),parts=[...ustrd,txt(e,'AddtlNtryInf'),...addtx,...names].filter(p=>{if(!p)return false;const k=p.toLowerCase();if(seen.has(k))return false;seen.add(k);return true});
   const curr=amtNode.attrs.Ccy||(account&&account.currency)||'EUR';
   rows.push({line,date,value_date:dateOf(kid(e,'ValDt')),description:collapse(parts.join(' ')).slice(0,MAX_DESC).trim(),amount_cents:amount,currency:curr.toUpperCase(),
    reference:txt(e,'AcctSvcrRef')||txt(e,'NtryRef')||e2e[0]||null,counterpart:names.length?names.join(', '):null});
  }
 }
 if(!line)throw new Error('Nessun movimento trovato nell\'estratto conto CAMT.');
 if(dropped>MAX_WARNINGS)warnings.push(`Altri ${dropped-MAX_WARNINGS} movimenti scartati`);
 if(pend.n)warnings.push(pend.n===1?'1 movimento non contabilizzato (in attesa) ignorato':`${pend.n} movimenti non contabilizzati (in attesa) ignorati`);
 for(const[k,n]of Object.entries(other))warnings.push(`${n} ${n===1?'movimento':'movimenti'} con stato ${k} ignorat${n===1?'o':'i'}`);
 if(otherIban)warnings.push(`Il file contiene estratti di più conti: saldi e conto riferiti a ${account.iban||'il primo conto'}`);
 return{rows,columns:null,delimiter:null,warnings,account,opening_cents:opening,closing_cents:closing};
}

return{parseStatement,isCamt,toCents};
});
