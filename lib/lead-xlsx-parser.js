'use strict';
(function(root){
 const LIMIT_BYTES=3*1024*1024, LIMIT_UNCOMPRESSED=16*1024*1024, LIMIT_ENTRIES=800;
 const fail=message=>{throw Error('Excel: '+message)};
 const u16=(v,i)=>v[i]|v[i+1]<<8;
 const u32=(v,i)=>(v[i]|(v[i+1]<<8)|(v[i+2]<<16)|(v[i+3]<<24))>>>0;
 const decode=u=>new TextDecoder('utf-8',{fatal:false}).decode(u);
 const nodes=(element,local)=>Array.from(element.getElementsByTagNameNS('*',local));
 const first=(element,local)=>nodes(element,local)[0]||null;
 function xml(content){
  const doc=new DOMParser().parseFromString(content,'application/xml');
  if(nodes(doc,'parsererror').length||doc.documentElement.localName==='parsererror')fail('struttura XML non valida');
  return doc;
 }
 function entries(buffer){
  const a=new Uint8Array(buffer);
  if(a.length<22||a.length>LIMIT_BYTES)fail('file vuoto o oltre 3 MB');
  let end=-1;
  for(let i=a.length-22;i>=Math.max(0,a.length-65557);i--){if(u32(a,i)===0x06054b50){end=i;break}}
  if(end<0)fail('archivio ZIP non valido');
  const count=u16(a,end+10),start=u32(a,end+16),centralSize=u32(a,end+12);
  if(count>LIMIT_ENTRIES||count<1||start===0xffffffff||centralSize===0xffffffff||start+centralSize>a.length)fail('archivio ZIP non supportato');
  const files=new Map();let pos=start,total=0;
  for(let n=0;n<count;n++){
   if(pos+46>a.length||u32(a,pos)!==0x02014b50)fail('indice ZIP danneggiato');
   const flags=u16(a,pos+8),method=u16(a,pos+10),compressed=u32(a,pos+20),uncompressed=u32(a,pos+24),len=u16(a,pos+28),extra=u16(a,pos+30),comment=u16(a,pos+32),offset=u32(a,pos+42);
   if(flags&1||flags&0x40||compressed===0xffffffff||uncompressed===0xffffffff)fail('archivio ZIP cifrato o non supportato');
   if(![0,8].includes(method))fail('compressione ZIP non supportata');
   if(pos+46+len+extra+comment>a.length)fail('nomi ZIP non validi');
   const name=decode(a.subarray(pos+46,pos+46+len));
   if(!name.includes('..')&&!name.startsWith('/')&&!name.endsWith('/')){
    total+=uncompressed;if(total>LIMIT_UNCOMPRESSED)fail('archivio Excel troppo grande dopo la decompressione');
    if(files.has(name))fail('file Excel duplicato');
    files.set(name,{method,compressed,uncompressed,offset});
   }
   pos+=46+len+extra+comment;
  }
  return{a,files};
 }
 async function read(z,path){
  const f=z.files.get(path);if(!f)fail('parte mancante: '+path);
  if(f.uncompressed>8*1024*1024)fail('foglio troppo grande');
  const a=z.a,p=f.offset;
  if(p+30>a.length||u32(a,p)!==0x04034b50)fail('intestazione ZIP non valida');
  const off=p+30+u16(a,p+26)+u16(a,p+28);
  if(off+f.compressed>a.length)fail('dati ZIP incompleti');
  const raw=a.subarray(off,off+f.compressed);
  if(f.method===0){if(raw.length!==f.uncompressed)fail('dimensione ZIP incoerente');return decode(raw)}
  if(typeof DecompressionStream==='undefined')fail('browser senza decompressione ZIP locale');
  let uncompressed;
  try{uncompressed=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()}
  catch{fail('impossibile decomprimere XLSX: prova un browser aggiornato')}
  if(uncompressed.byteLength!==f.uncompressed)fail('dimensione foglio non valida');
  return decode(new Uint8Array(uncompressed));
 }
 function pathFrom(base,target){
  if(!target||/^\w+:/.test(target))fail('percorso foglio non valido');
  const pieces=(target.startsWith('/')?target.slice(1):base.split('/').slice(0,-1).concat(target.split('/')).join('/')).split('/');
  const path=[];for(const piece of pieces){if(piece==='..'){if(!path.length)fail('percorso foglio fuori archivio');path.pop()}else if(piece&&piece!=='.')path.push(piece)}
  return path.join('/');
 }
 function asStrings(doc){return nodes(doc,'si').map(si=>nodes(si,'t').map(t=>t.textContent).join(''))}
 function sheetRows(doc,strings,maxRows){
  const results=[];
  for(const row of nodes(doc,'row')){
   const cells=[];let cursor=0;
   for(const c of nodes(row,'c')){
    const ref=c.getAttribute('r'),match=ref&&/^([A-Z]{1,3})[1-9]\d*$/i.exec(ref);
    let idx=cursor;
    if(match){idx=0;for(const letter of match[1].toUpperCase())idx=idx*26+letter.charCodeAt(0)-64;idx--}
    if(idx>1000)fail('foglio con troppe colonne');
    cursor=idx+1;
    // Formula results are not verified; importing them may misrepresent a prospect's fields.
    if(first(c,'f'))fail('contiene formule: converti i risultati in valori prima dell’importazione');
    const type=c.getAttribute('t')||'n';let value='';
    if(type==='inlineStr')value=nodes(c,'t').map(x=>x.textContent).join('');
    else{
     value=first(c,'v')?.textContent||'';
     if(type==='s'){
      const k=Number(value);if(!Number.isSafeInteger(k)||k<0||k>=strings.length)fail('indice testo condiviso non valido');value=strings[k];
     }
     if(type==='e')fail('errore in una cella del foglio');
    }
    cells[idx]=String(value);
   }
   if(cells.some(c=>c&&c.trim()))results.push(cells.map(x=>x||''));
   if(results.length>maxRows+1)fail('massimo '+maxRows+' aziende per file');
  }
  return results;
 }
 async function parseXlsx(buffer,{maxRows=250}={}){
  const z=entries(buffer);
  if(!z.files.has('xl/workbook.xml')||!z.files.has('xl/_rels/workbook.xml.rels'))fail('non è un documento Excel XLSX valido');
  const [workbook,reln]=await Promise.all([read(z,'xl/workbook.xml'),read(z,'xl/_rels/workbook.xml.rels')]);
  const sheets=nodes(xml(workbook),'sheet'),rels=nodes(xml(reln),'Relationship');
  if(!sheets.length)fail('nessun foglio disponibile');
  const firstSheet=sheets[0];
  const relationshipId=firstSheet.getAttribute('r:id')||firstSheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
  const rel=rels.find(r=>r.getAttribute('Id')===relationshipId&&/\/worksheet$/.test(r.getAttribute('Type')||''));
  if(!rel||rel.getAttribute('TargetMode')==='External')fail('foglio Excel non accessibile');
  const path=pathFrom('xl/workbook.xml',rel.getAttribute('Target'));
  const [sheet,ss]=await Promise.all([read(z,path),z.files.has('xl/sharedStrings.xml')?read(z,'xl/sharedStrings.xml'):Promise.resolve(null)]);
  const rows=sheetRows(xml(sheet),ss?asStrings(xml(ss)):[],maxRows);
  if(!rows.length)fail('foglio vuoto');
  const keys=['name','domain','country','industry','companySize','contactRole','source'];
  const aliases={name:['name','azienda','company'],domain:['domain','dominio','website'],country:['country','paese'],industry:['industry','settore'],companySize:['companysize','dimensione','size'],contactRole:['contactrole','ruolo','role'],source:['source','fonte']};
  const norm=s=>String(s||'').normalize('NFKC').trim().toLocaleLowerCase('it').replace(/[\s_-]/g,'');
  const header=rows.shift().map(norm),positions={};
  for(const key of keys){
   const hits=header.flatMap((h,i)=>aliases[key].includes(h)?[i]:[]);
   if(hits.length>1)fail('intestazione duplicata: '+key);
   positions[key]=hits[0]??-1;
  }
  if(positions.name<0&&positions.domain<0)fail('colonna name oppure domain mancante');
  // Optional person columns, same names as the CSV parser.
  const person=(root.RadixLeadCsv&&root.RadixLeadCsv.PERSON)||{},extra=Object.entries(person).map(([key,names])=>[key,header.findIndex(h=>names.includes(h))]).filter(([,i])=>i>=0);
  if(!rows.length)fail('nessun prospect presente');
  return rows.map((row,i)=>{
   if(row.length>header.length&&row.slice(header.length).some(x=>String(x||'').trim()))fail('colonne extra alla riga '+(i+2));
   const obj={};for(const key of keys){const value=positions[key]<0?'':String(row[positions[key]]||'').trim();if(value.length>2000||value.includes('\0'))fail('cella non valida alla riga '+(i+2));obj[key]=value;}
   for(const [key,col] of extra){const value=String(row[col]||'').trim();if(value.length>2000||value.includes('\0'))fail('cella non valida alla riga '+(i+2));obj[key]=value}
   return obj;
  });
 }
 const api={parseXlsx};if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLeadXlsx=api;
})(typeof window!=='undefined'?window:globalThis);
