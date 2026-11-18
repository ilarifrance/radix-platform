/* Trasporti — real Excel files (.xlsx) without libraries, in the browser and in Node.
   write(sheets) → Uint8Array: one or more sheets of rows; numbers stay numbers (Excel can sum them), money columns
   get the euro format, dates "AAAA-MM-GG" become Excel dates, the first row is bold and frozen.
   read(bytes) → Promise<[{name, rows}]>: the first sheets of an .xlsx (toll invoice detail, tracker export) as
   rows of text, Excel dates turned back into "GG/MM/AAAA HH:MM". Deflated entries are opened with
   DecompressionStream (browsers) or zlib (Node). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTrXlsx=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const enc=s=>new TextEncoder().encode(s);
const dec=b=>new TextDecoder('utf-8').decode(b);
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}

// ZIP with stored (uncompressed) entries: valid for Excel, LibreOffice and Numbers.
function zip(files){
 const parts=[],central=[];let off=0;
 const u16=n=>[n&255,(n>>>8)&255],u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
 for(const [name,data] of files){
  const nb=enc(name),crc=crc32(data);
  const head=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0)]);
  parts.push(head,nb,data);
  central.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(off)]),nb);
  off+=head.length+nb.length+data.length;
 }
 const csize=central.reduce((s,b)=>s+b.length,0);
 const end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(csize),...u32(off),...u16(0)]);
 const all=[...parts,...central,end],out=new Uint8Array(all.reduce((s,b)=>s+b.length,0));let p=0;for(const b of all){out.set(b,p);p+=b.length;}
 return out;
}

const x=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
const colName=i=>{let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;};
const serial=(y,m,d,h=0,mi=0)=>(Date.UTC(y,m-1,d,h,mi)-Date.UTC(1899,11,30))/86400000;
// style ids: 0 normal, 1 header, 2 euro, 3 date, 4 date+time, 5 integer with thousands
const STYLES='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
 +'<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy hh:mm"/></numFmts>'
 +'<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
 +'<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F3"/></patternFill></fill></fills>'
 +'<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>'
 +'<cellXfs count="6"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/><xf numFmtId="166" applyNumberFormat="1"/><xf numFmtId="3" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

/* sheets: [{name, columns:[{title, type:'text'|'number'|'int'|'euro'|'date'|'datetime', width?}], rows:[[...]]}]
   euro values are in euro (not cents). */
function write(sheets){
 const files=[];
 const names=sheets.map((s,i)=>(String(s.name||'Foglio '+(i+1)).replace(/[\\/?*[\]:]/g,' ').slice(0,31)||'Foglio '+(i+1)));
 sheets.forEach((s,si)=>{
  const cols=s.columns||[];
  const cell=(v,ci,ri,type)=>{
   const ref=colName(ci)+(ri+1);if(v==null||v==='')return '';
   if(ri===0)return '<c r="'+ref+'" t="inlineStr" s="1"><is><t>'+x(v)+'</t></is></c>';
   if((type==='number'||type==='int'||type==='euro')&&typeof v==='number'&&Number.isFinite(v))return '<c r="'+ref+'" s="'+(type==='euro'?2:type==='int'?5:0)+'"><v>'+v+'</v></c>';
   if(type==='date'||type==='datetime'){const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);if(m)return '<c r="'+ref+'" s="'+(m[4]!=null&&type==='datetime'?4:3)+'"><v>'+serial(+m[1],+m[2],+m[3],+(m[4]||0),+(m[5]||0))+'</v></c>';}
   return '<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+x(v)+'</t></is></c>';
  };
  const all=[cols.map(c=>c.title),...(s.rows||[])];
  const body=all.map((r,ri)=>'<row r="'+(ri+1)+'">'+r.map((v,ci)=>cell(v,ci,ri,(cols[ci]||{}).type)).join('')+'</row>').join('');
  const widths=cols.length?'<cols>'+cols.map((c,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+(c.width||Math.min(50,Math.max(10,String(c.title).length+2,...(s.rows||[]).slice(0,200).map(r=>String(r[i]??'').length+2))))+'" customWidth="1"/>').join('')+'</cols>':'';
  files.push(['xl/worksheets/sheet'+(si+1)+'.xml',enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+widths+'<sheetData>'+body+'</sheetData>'+(all.length>1&&cols.length?'<autoFilter ref="A1:'+colName(cols.length-1)+all.length+'"/>':'')+'</worksheet>')]);
 });
 files.unshift(
  ['[Content_Types].xml',enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>')],
  ['_rels/.rels',enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')],
  ['xl/workbook.xml',enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+names.map((n,i)=>'<sheet name="'+x(n)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>')],
  ['xl/_rels/workbook.xml.rels',enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')],
  ['xl/styles.xml',enc(STYLES)]);
 return zip(files);
}

// ---------- reading ----------
async function inflate(bytes){
 if(typeof DecompressionStream!=='undefined'){const s=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return new Uint8Array(await new Response(s).arrayBuffer());}
 return new Uint8Array(require('zlib').inflateRawSync(bytes));
}
async function unzip(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 let e=-1;for(let i=b.length-22;i>=Math.max(0,b.length-66000);i--)if(v.getUint32(i,true)===0x06054b50){e=i;break;}
 if(e<0)throw new Error('Non è un file Excel (.xlsx) valido.');
 const n=v.getUint16(e+10,true);let p=v.getUint32(e+16,true);const out=new Map();
 for(let k=0;k<n;k++){
  if(v.getUint32(p,true)!==0x02014b50)throw new Error('File Excel danneggiato.');
  const method=v.getUint16(p+10,true),csize=v.getUint32(p+20,true),nl=v.getUint16(p+28,true),xl=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),lo=v.getUint32(p+42,true);
  const name=dec(b.subarray(p+46,p+46+nl));p+=46+nl+xl+cl;
  if(!/^(xl\/(workbook\.xml|sharedStrings\.xml|styles\.xml|worksheets\/sheet\d+\.xml|_rels\/workbook\.xml\.rels))$/.test(name))continue;
  const start=lo+30+v.getUint16(lo+26,true)+v.getUint16(lo+28,true);const data=b.subarray(start,start+csize);
  out.set(name,method===0?data:method===8?await inflate(data):null);
 }
 return out;
}
const unx=s=>s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi,(m,c)=>({lt:'<',gt:'>',quot:'"',apos:"'",amp:'&'}[c.toLowerCase()]||(c[1]==='x'||c[1]==='X'?String.fromCodePoint(parseInt(c.slice(2),16)):String.fromCodePoint(+c.slice(1)))));
const texts=xml=>[...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>unx(m[1])).join('');
const p2=n=>String(n).padStart(2,'0');
function fromSerial(n,withTime){const ms=Math.round((n*86400000+Date.UTC(1899,11,30))/60000)*60000;const d=new Date(ms);const s=p2(d.getUTCDate())+'/'+p2(d.getUTCMonth()+1)+'/'+d.getUTCFullYear();return withTime?s+' '+p2(d.getUTCHours())+':'+p2(d.getUTCMinutes()):s;}
function fromTimeFraction(n){const m=Math.round((n%1)*1440);return p2(Math.floor(m/60)%24)+':'+p2(m%60);}

async function read(bytes,{maxSheets=3,maxRows=20000}={}){
 const f=await unzip(bytes);
 const S=f.get('xl/sharedStrings.xml');const shared=S?[...dec(S).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>texts(m[1])):[];
 // which styles are dates or times
 const st=f.get('xl/styles.xml')?dec(f.get('xl/styles.xml')):'';
 const custom=new Map([...st.matchAll(/<numFmt\s+numFmtId="(\d+)"\s+formatCode="([^"]*)"/g)].map(m=>[+m[1],unx(m[2])]));
 const xfs=((st.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)||[])[1]||'').match(/<xf\b[^>]*>/g)||[];
 const kind=xfs.map(t=>{const id=+((t.match(/numFmtId="(\d+)"/)||[])[1]||0);const code=custom.get(id)||'';const clean=code.replace(/"[^"]*"|\[[^\]]*\]/g,'');
  const date=(id>=14&&id<=17)||id===22||/[dy]/i.test(clean),time=(id>=18&&id<=21)||id===22||/h/i.test(clean)||/(^|[^a-z])s/i.test(clean);return date?(time?'datetime':'date'):time?'time':null;});
 const wb=f.get('xl/workbook.xml')?dec(f.get('xl/workbook.xml')):'';
 const rels=f.get('xl/_rels/workbook.xml.rels')?dec(f.get('xl/_rels/workbook.xml.rels')):'';
 const sheets=[...wb.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)].map(m=>{const t=(rels.match(new RegExp('Id="'+m[2]+'"[^>]*Target="([^"]+)"'))||rels.match(new RegExp('Target="([^"]+)"[^>]*Id="'+m[2]+'"'))||[])[1];return {name:unx(m[1]),path:t?('xl/'+t.replace(/^\/?xl\//,'').replace(/^\//,'')):null};});
 const out=[];
 for(const s of sheets.slice(0,maxSheets)){
  const data=s.path&&f.get(s.path);if(!data)continue;const xml=dec(data);const rows=[];
  for(const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
   if(rows.length>=maxRows)break;const row=[];
   for(const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
    const a=cm[1],inner=cm[2]||'';const ref=(a.match(/r="([A-Z]+)\d+"/)||[])[1];
    const ci=ref?[...ref].reduce((s2,ch)=>s2*26+ch.charCodeAt(0)-64,0)-1:row.length;
    const t=(a.match(/\bt="(\w+)"/)||[])[1],si=+((a.match(/\bs="(\d+)"/)||[])[1]||0);const vv=(inner.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
    let val='';
    if(t==='s')val=shared[+vv]??'';else if(t==='inlineStr')val=texts(inner);else if(t==='str'||t==='e')val=vv!=null?unx(vv):'';else if(t==='b')val=vv==='1'?'VERO':'FALSO';
    else if(vv!=null){const n=Number(vv);const k=kind[si];val=k&&Number.isFinite(n)?(k==='time'?fromTimeFraction(n):fromSerial(n,k==='datetime'||(n%1!==0&&k==='date'))):String(vv).replace('.',',');}
    while(row.length<ci)row.push('');row[ci]=val;
   }
   rows.push(row);
  }
  out.push({name:s.name,rows});
 }
 return out;
}

const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const isXlsx=bytes=>{const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);return b.length>4&&b[0]===0x50&&b[1]===0x4b&&b[2]===3&&b[3]===4;};
return {write,read,zip,crc32,isXlsx,MIME,colName};
});
