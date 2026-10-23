/* RADIX xlsx-lite: a small Excel (.xlsx, Office Open XML SpreadsheetML) writer and checker, no dependencies.
   The package is a «store» zip (lib/zip-lite.js: valid for OOXML) with [Content_Types].xml first, the package rels, the
   core and app properties, xl/workbook.xml, xl/styles.xml (a fixed set of named styles: bold header on a tinted fill,
   euro and percent number formats, totals with a top rule, wrapped text, a grey note), xl/sharedStrings.xml and one
   worksheet per sheet with column widths, a frozen header row (and first column), merged cells and a print setup that
   fits the width of the page. Formulas are written with the value they give («cached value»), so a reader that does not
   compute (a preview, the RADIX reader lib/lead-xlsx-parser.js with {formulas:true}) shows the right number; the
   workbook asks Excel, LibreOffice and Google Sheets to compute them again on open (fullCalcOnLoad).
   build({sheets,title,creator,date}) → Uint8Array. A sheet: {name, cols:[width in characters], rows:[[cell]], freeze:
   {rows,cols}, merges:['A1:D1'], heights:{row index: points}, landscape}. A cell: a string, a number, a boolean, null (empty) or {v, s, f}: value,
   style name (STYLES) and formula without «=». colName(i), ref(row, col) give A1 references (0-based).
   inspect(bytes) re-reads a package: parts, content types, relationship targets, XML well-formedness, the sheets with
   their cells (value, formula, style) and every SUM checked against its cached value.
   Runs in the browser (window.RadixXlsx) and in Node. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixXlsx=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const ZIP=root.RadixZip||(typeof require==='function'?require('./zip-lite.js'):null);
const PX=()=>root.RadixPptx||(typeof require==='function'?require('./pptx-lite.js'):null);
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main',NS_R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',
 REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships/',PKG_REL='http://schemas.openxmlformats.org/package/2006/relationships';
const CT={rels:'application/vnd.openxmlformats-package.relationships+xml',xml:'application/xml',
 workbook:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',sheet:'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',
 styles:'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml',strings:'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml',
 core:'application/vnd.openxmlformats-package.core-properties+xml',app:'application/vnd.openxmlformats-officedocument.extended-properties+xml'};
const HEAD='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const xmlText=s=>PX().xmlText(s),xmlAttr=s=>xmlText(s).replace(/"/g,'&quot;');
const fin=v=>typeof v==='number'&&Number.isFinite(v);

// ---- references ----
function colName(i){let n=Math.floor(i)+1,s='';while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s}
const ref=(r,c)=>colName(c)+(r+1);
function parseRef(a){const m=/^\$?([A-Z]{1,3})\$?(\d+)$/.exec(String(a||''));if(!m)return null;let c=0;for(const ch of m[1])c=c*26+ch.charCodeAt(0)-64;return {r:+m[2]-1,c:c-1}}

// ---- styles: fonts, fills, borders, number formats and the cell formats built from them ----
const NUMFMTS=[[164,'#,##0" €"'],[165,'0.0%'],[166,'#,##0.0']];
const FONTS=['<font><sz val="11"/><color rgb="FF1D1A27"/><name val="Calibri"/><family val="2"/></font>',
 '<font><b/><sz val="11"/><color rgb="FF1D1A27"/><name val="Calibri"/><family val="2"/></font>',
 '<font><b/><sz val="14"/><color rgb="FF1D1A27"/><name val="Calibri"/><family val="2"/></font>',
 '<font><i/><sz val="10"/><color rgb="FF6B6880"/><name val="Calibri"/><family val="2"/></font>',
 '<font><b/><sz val="11"/><color rgb="FF9A3A00"/><name val="Calibri"/><family val="2"/></font>'];
const FILLS=['<fill><patternFill patternType="none"/></fill>','<fill><patternFill patternType="gray125"/></fill>',
 '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF0FF"/><bgColor indexed="64"/></patternFill></fill>',
 '<fill><patternFill patternType="solid"><fgColor rgb="FFF6F5FA"/><bgColor indexed="64"/></patternFill></fill>',
 '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF4E5"/><bgColor indexed="64"/></patternFill></fill>'];
const BORDERS=['<border><left/><right/><top/><bottom/><diagonal/></border>',
 '<border><left/><right/><top/><bottom style="thin"><color rgb="FFB9B3C9"/></bottom><diagonal/></border>',
 '<border><left/><right/><top style="thin"><color rgb="FF1D1A27"/></top><bottom/><diagonal/></border>'];
// name → [numFmtId, font, fill, border, alignment]
const STYLE_DEFS=[
 ['default',0,0,0,0,''],
 ['header',0,1,2,1,'<alignment horizontal="center" vertical="center" wrapText="1"/>'],
 ['headerLeft',0,1,2,1,'<alignment horizontal="left" vertical="center" wrapText="1"/>'],
 ['label',0,1,0,0,'<alignment vertical="top"/>'],
 ['text',0,0,0,0,'<alignment vertical="top" wrapText="1"/>'],
 ['eur',164,0,0,0,''],
 ['eurTotal',164,1,3,2,''],
 ['pct',165,0,0,0,''],
 ['pctTotal',165,1,3,2,''],
 ['labelTotal',0,1,3,2,''],
 ['title',0,2,0,0,''],
 ['note',0,3,0,0,'<alignment vertical="top" wrapText="1"/>'],
 ['int',3,0,0,0,''],
 ['tbd',0,3,0,0,'<alignment horizontal="right"/>'],
 ['eurWarn',164,4,4,0,''],
 ['dec',4,0,0,0,''],
 ['eurBold',164,1,3,0,''],
 ['pctBold',165,1,3,0,''],
 ['dec1',166,0,0,0,'']];
const STYLES=Object.freeze(Object.fromEntries(STYLE_DEFS.map((s,i)=>[s[0],i])));
function stylesXml(){
 const xf=s=>'<xf numFmtId="'+s[1]+'" fontId="'+s[2]+'" fillId="'+s[3]+'" borderId="'+s[4]+'" xfId="0"'+(s[1]?' applyNumberFormat="1"':'')+(s[2]?' applyFont="1"':'')+(s[3]?' applyFill="1"':'')+(s[4]?' applyBorder="1"':'')+(s[5]?' applyAlignment="1">'+s[5]+'</xf>':'/>');
 return HEAD+'<styleSheet xmlns="'+NS+'"><numFmts count="'+NUMFMTS.length+'">'+NUMFMTS.map(([id,f])=>'<numFmt numFmtId="'+id+'" formatCode="'+xmlAttr(f)+'"/>').join('')+'</numFmts>'
  +'<fonts count="'+FONTS.length+'">'+FONTS.join('')+'</fonts><fills count="'+FILLS.length+'">'+FILLS.join('')+'</fills><borders count="'+BORDERS.length+'">'+BORDERS.join('')+'</borders>'
  +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="'+STYLE_DEFS.length+'">'+STYLE_DEFS.map(xf).join('')+'</cellXfs>'
  +'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>'}

// ---- sheet names: at most 31 characters, none of []:*?/\ , unique (case does not count) ----
function sheetNames(list){const seen=new Set();return list.map((n,i)=>{let s=String(n==null?'':n).replace(/[\[\]:*?\/\\]/g,' ').replace(/^'+|'+$/g,'').replace(/\s+/g,' ').trim().slice(0,31)||'Foglio '+(i+1);
 let k=s,j=2;while(seen.has(k.toLowerCase())){const suf=' ('+j+++')';k=s.slice(0,31-suf.length)+suf}seen.add(k.toLowerCase());return k})}

// ---- the parts ----
const rels=list=>HEAD+'<Relationships xmlns="'+PKG_REL+'">'+list.map((r,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+(/^https?:/.test(r[0])?r[0]:REL+r[0])+'" Target="'+xmlAttr(r[1])+'"/>').join('')+'</Relationships>';
const cellOf=x=>x!=null&&typeof x==='object'&&!(x instanceof Date)?x:{v:x};
function sheetXml(sh,strings,first){
 const rows=sh.rows||[],widest=Math.max(1,(sh.cols||[]).length,...rows.map(r=>(r||[]).length)),fr=sh.freeze||{},fRows=Math.max(0,fr.rows|0),fCols=Math.max(0,fr.cols|0);
 const out=[HEAD+'<worksheet xmlns="'+NS+'" xmlns:r="'+NS_R+'">','<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>','<dimension ref="A1:'+ref(Math.max(0,rows.length-1),widest-1)+'"/>'];
 let pane='';if(fRows||fCols){const active=fRows&&fCols?'bottomRight':fRows?'bottomLeft':'topRight';
  pane='<pane'+(fCols?' xSplit="'+fCols+'"':'')+(fRows?' ySplit="'+fRows+'"':'')+' topLeftCell="'+ref(fRows,fCols)+'" activePane="'+active+'" state="frozen"/><selection pane="'+active+'" activeCell="'+ref(fRows,fCols)+'" sqref="'+ref(fRows,fCols)+'"/>'}
 out.push('<sheetViews><sheetView'+(first?' tabSelected="1"':'')+' workbookViewId="0">'+pane+'</sheetView></sheetViews>','<sheetFormatPr defaultRowHeight="15"/>');
 if((sh.cols||[]).length)out.push('<cols>'+sh.cols.map((w,i)=>fin(w)&&w>0?'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+Math.min(255,Math.round(w*100)/100)+'" customWidth="1"/>':'').join('')+'</cols>');
 out.push('<sheetData>');
 rows.forEach((row,r)=>{const cells=[];(row||[]).forEach((raw,c)=>{if(raw===undefined)return;const x=cellOf(raw),s=x.s!=null?(STYLES[x.s]!=null?STYLES[x.s]:0):0,f=x.f?'<f>'+xmlText(String(x.f).replace(/^=/,''))+'</f>':'',at=' r="'+ref(r,c)+'"'+(s?' s="'+s+'"':'');let v=x.v;
   if(v==null||v===''){if(f)cells.push('<c'+at+'>'+f+'</c>');else if(s)cells.push('<c'+at+'/>');return}
   if(typeof v==='boolean')cells.push('<c'+at+' t="b">'+f+'<v>'+(v?1:0)+'</v></c>');
   else if(typeof v==='number'){if(fin(v))cells.push('<c'+at+'>'+f+'<v>'+v+'</v></c>');else if(s)cells.push('<c'+at+'/>')}
   else if(f)cells.push('<c'+at+' t="str">'+f+'<v>'+xmlText(v)+'</v></c>');
   else{const t=String(v);let i=strings.index.get(t);if(i==null){i=strings.list.length;strings.list.push(t);strings.index.set(t,i)}strings.count++;cells.push('<c'+at+' t="s"><v>'+i+'</v></c>')}});
  const ht=sh.heights&&fin(sh.heights[r])?' ht="'+sh.heights[r]+'" customHeight="1"':'';
  if(cells.length||ht)out.push('<row r="'+(r+1)+'"'+ht+'>'+cells.join('')+'</row>')});
 out.push('</sheetData>');
 if((sh.merges||[]).length)out.push('<mergeCells count="'+sh.merges.length+'">'+sh.merges.map(m=>'<mergeCell ref="'+xmlAttr(m)+'"/>').join('')+'</mergeCells>');
 out.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>','<pageSetup paperSize="9" orientation="'+(sh.landscape===false?'portrait':'landscape')+'" fitToWidth="1" fitToHeight="0"/>','</worksheet>');
 return out.join('')}
const iso=d=>(d instanceof Date&&!isNaN(d)?d:new Date()).toISOString().replace(/\.\d{3}Z$/,'Z');
// book: {sheets, title, creator, date} → Uint8Array (.xlsx)
function build(book){const list=(book&&book.sheets||[]).filter(Boolean);if(!list.length)throw Error('Nessun foglio da scrivere.');
 const names=sheetNames(list.map(s=>s.name)),strings={list:[],index:new Map(),count:0},sheets=list.map((s,i)=>sheetXml(s,strings,i===0));
 const date=book.date instanceof Date?book.date:new Date(),title=String(book.title||names[0]),creator=String(book.creator||'RADIX');
 // Rows (and the first columns) frozen at the top repeat on every printed page.
 const prints=list.map((s,i)=>{const f=s.freeze||{},q="'"+names[i].replace(/'/g,"''")+"'",parts=[];if(f.cols>0)parts.push(q+'!$A:$'+colName(f.cols-1));if(f.rows>0)parts.push(q+'!$1:$'+f.rows);
  return parts.length?'<definedName name="_xlnm.Print_Titles" localSheetId="'+i+'">'+xmlText(parts.join(','))+'</definedName>':''}).join('');
 const files=[
  {name:'[Content_Types].xml',data:HEAD+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="'+CT.rels+'"/><Default Extension="xml" ContentType="'+CT.xml+'"/>'
   +'<Override PartName="/xl/workbook.xml" ContentType="'+CT.workbook+'"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="'+CT.sheet+'"/>').join('')
   +'<Override PartName="/xl/styles.xml" ContentType="'+CT.styles+'"/><Override PartName="/xl/sharedStrings.xml" ContentType="'+CT.strings+'"/>'
   +'<Override PartName="/docProps/core.xml" ContentType="'+CT.core+'"/><Override PartName="/docProps/app.xml" ContentType="'+CT.app+'"/></Types>'},
  {name:'_rels/.rels',data:rels([['officeDocument','xl/workbook.xml'],['http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties','docProps/core.xml'],['extended-properties','docProps/app.xml']])},
  {name:'docProps/core.xml',data:HEAD+'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
   +'<dc:title>'+xmlText(title)+'</dc:title><dc:creator>'+xmlText(creator)+'</dc:creator><cp:lastModifiedBy>'+xmlText(creator)+'</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">'+iso(date)+'</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">'+iso(date)+'</dcterms:modified></cp:coreProperties>'},
  {name:'docProps/app.xml',data:HEAD+'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>RADIX</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>'
   +'<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Fogli di lavoro</vt:lpstr></vt:variant><vt:variant><vt:i4>'+names.length+'</vt:i4></vt:variant></vt:vector></HeadingPairs>'
   +'<TitlesOfParts><vt:vector size="'+names.length+'" baseType="lpstr">'+names.map(n=>'<vt:lpstr>'+xmlText(n)+'</vt:lpstr>').join('')+'</vt:vector></TitlesOfParts><AppVersion>16.0300</AppVersion></Properties>'},
  {name:'xl/workbook.xml',data:HEAD+'<workbook xmlns="'+NS+'" xmlns:r="'+NS_R+'"><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="16000" activeTab="0"/></bookViews>'
   +'<sheets>'+names.map((n,i)=>'<sheet name="'+xmlAttr(n)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets>'+(prints?'<definedNames>'+prints+'</definedNames>':'')+'<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'},
  {name:'xl/_rels/workbook.xml.rels',data:rels([...sheets.map((_,i)=>['worksheet','worksheets/sheet'+(i+1)+'.xml']),['styles','styles.xml'],['sharedStrings','sharedStrings.xml']])},
  {name:'xl/styles.xml',data:stylesXml()},
  ...sheets.map((x,i)=>({name:'xl/worksheets/sheet'+(i+1)+'.xml',data:x})),
  {name:'xl/sharedStrings.xml',data:HEAD+'<sst xmlns="'+NS+'" count="'+strings.count+'" uniqueCount="'+strings.list.length+'">'+strings.list.map(t=>'<si><t'+(/^\s|\s$|\n/.test(t)?' xml:space="preserve"':'')+'>'+xmlText(t)+'</t></si>').join('')+'</sst>'}];
 return ZIP.zip(files,{date})}

// ---- the checker ----
const decode=b=>new TextDecoder().decode(b);
const unescape=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&amp;/g,'&');
const attrs=t=>{const o={};for(const m of t.matchAll(/([\w:]+)="([^"]*)"/g))o[m[1]]=unescape(m[2]);return o};
function resolve(base,target){if(target.startsWith('/'))return target.slice(1);const parts=((base.includes('/')?base.slice(0,base.lastIndexOf('/')+1):'')+target).split('/'),out=[];for(const p of parts){if(p==='..')out.pop();else if(p!=='.'&&p!=='')out.push(p)}return out.join('/')}
// SUM(A1:B2, C3, …) on the values read: null when a reference is not a number or the formula is something else.
function sumOf(f,cells){const m=/^SUM\(([^()]*)\)$/i.exec(String(f).trim());if(!m)return null;let s=0;
 for(const part of m[1].split(/[,;]/)){const [a,b]=part.trim().split(':').map(parseRef);if(!a)return null;const e=b||a;
  for(let r=Math.min(a.r,e.r);r<=Math.max(a.r,e.r);r++)for(let c=Math.min(a.c,e.c);c<=Math.max(a.c,e.c);c++){const x=cells[ref(r,c)];if(x&&typeof x.v==='number')s+=x.v;else if(x&&x.v!==''&&x.v!=null)return null}}
 return Math.round(s*1e6)/1e6}
// bytes → {parts, sheets:[{name, cells:{A1:{v,f,s}}, rows:[[value]], freeze, cols}], sums, problems}
function inspect(bytes){const problems=[];let files;try{files=ZIP.unzip(bytes)}catch(e){return {parts:[],sheets:[],sums:0,problems:['Archivio non leggibile: '+e.message]}}
 const map=new Map(files.map(f=>[f.name,f.data])),names=files.map(f=>f.name),xml=n=>map.has(n)?decode(map.get(n)):null;
 if(names[0]!=='[Content_Types].xml')problems.push('[Content_Types].xml deve essere il primo file.');
 const ctx=xml('[Content_Types].xml');if(!ctx)return {parts:names,sheets:[],sums:0,problems:problems.concat('Manca [Content_Types].xml.')};
 const defaults={},overrides={};for(const m of ctx.matchAll(/<Default ([^>]*)\/>/g)){const a=attrs(m[1]);defaults[String(a.Extension).toLowerCase()]=a.ContentType}
 for(const m of ctx.matchAll(/<Override ([^>]*)\/>/g)){const a=attrs(m[1]),p=String(a.PartName).replace(/^\//,'');overrides[p]=a.ContentType;if(!map.has(p))problems.push('Content type per una parte che non c’è: '+a.PartName)}
 const typeOf=n=>overrides[n]||defaults[(n.split('.').pop()||'').toLowerCase()];
 for(const n of names){if(n==='[Content_Types].xml')continue;if(!typeOf(n))problems.push('Parte senza content type: '+n);if(/\.(xml|rels)$/.test(n))problems.push(...PX().xmlProblems(xml(n),n))}
 for(const n of names.filter(n=>/\.rels$/.test(n))){const src=n==='_rels/.rels'?'':n.replace(/_rels\/([^/]+)\.rels$/,'$1'),seen=new Set();if(src&&!map.has(src))problems.push(n+': descrive una parte che non c’è ('+src+').');
  for(const m of xml(n).matchAll(/<Relationship ([^>]*)\/>/g)){const a=attrs(m[1]);if(seen.has(a.Id))problems.push(n+': Id ripetuto '+a.Id);seen.add(a.Id);if(a.TargetMode==='External')continue;const t=resolve(src,a.Target);if(!map.has(t))problems.push(n+': '+a.Id+' punta a una parte che non c’è ('+t+').')}}
 const wb=xml('xl/workbook.xml');if(!wb)return {parts:names,sheets:[],sums:0,problems:problems.concat('Manca xl/workbook.xml.')};
 if(typeOf('xl/workbook.xml')!==CT.workbook)problems.push('Content type sbagliato per xl/workbook.xml.');
 const wr=xml('xl/_rels/workbook.xml.rels')||'',byId=Object.fromEntries([...wr.matchAll(/<Relationship ([^>]*)\/>/g)].map(m=>{const a=attrs(m[1]);return [a.Id,resolve('xl/workbook.xml',a.Target)]}));
 const sst=xml('xl/sharedStrings.xml'),strings=sst?[...sst.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t(?: [^>]*)?>([^<]*)<\/t>/g)].map(t=>unescape(t[1])).join('')):[];
 const ns=[...wb.matchAll(/<sheet ([^>]*)\/>/g)].map(m=>attrs(m[1]));if(!ns.length)problems.push('Nessun foglio.');
 const seenNames=new Set();let sums=0;
 const sheets=ns.map(a=>{const name=a.name||'',p=byId[a['r:id']];if(!name||name.length>31||/[\[\]:*?\/\\]/.test(name))problems.push('Nome di foglio non valido: «'+name+'».');if(seenNames.has(name.toLowerCase()))problems.push('Foglio ripetuto: '+name);seenNames.add(name.toLowerCase());
  const sx=p&&xml(p);if(!sx){problems.push('Foglio '+name+' senza file.');return {name,cells:{},rows:[]}}if(typeOf(p)!==CT.sheet)problems.push(p+': content type sbagliato.');
  const cells={},rows=[];
  for(const m of sx.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){const at=attrs(m[1]),body=m[2]||'',f=(/<f>([^<]*)<\/f>/.exec(body)||[])[1],raw=(/<v>([^<]*)<\/v>/.exec(body)||[])[1],pos=parseRef(at.r);
   if(!pos){problems.push(name+': cella senza riferimento.');continue}let v=raw==null?'':unescape(raw);
   if(at.t==='s'){const i=+v;if(!Number.isInteger(i)||i<0||i>=strings.length)problems.push(name+' '+at.r+': testo condiviso inesistente.');v=strings[i]}
   else if(at.t==='b')v=v==='1';else if(at.t==='str'||at.t==='inlineStr')v=at.t==='inlineStr'?[...body.matchAll(/<t(?: [^>]*)?>([^<]*)<\/t>/g)].map(t=>unescape(t[1])).join(''):v;
   else if(v!==''){v=Number(v);if(!Number.isFinite(v))problems.push(name+' '+at.r+': numero non valido.')}
   cells[at.r]={v,f:f==null?null:unescape(f),s:at.s==null?0:+at.s};(rows[pos.r]=rows[pos.r]||[])[pos.c]=v}
  for(const [r,x] of Object.entries(cells)){if(!x.f)continue;const s=sumOf(x.f,cells);if(s==null)continue;sums++;if(typeof x.v!=='number'||Math.abs(s-x.v)>.005)problems.push(name+' '+r+': '+x.f+' dà '+s+', il valore salvato è '+x.v+'.')}
  const pane=/<pane ([^>]*)\/>/.exec(sx),pa=pane?attrs(pane[1]):{};
  return {name,cells,rows:Array.from(rows,r=>Array.from(r||[],x=>x===undefined?'':x)),freeze:{rows:+pa.ySplit||0,cols:+pa.xSplit||0,frozen:pa.state==='frozen'},cols:[...sx.matchAll(/<col ([^>]*)\/>/g)].map(m=>+attrs(m[1]).width)}});
 return {parts:names,sheets,sums,problems:[...new Set(problems)]}}
return Object.freeze({CT,STYLES,colName,ref,parseRef,sheetNames,build,inspect,sumOf});
});
