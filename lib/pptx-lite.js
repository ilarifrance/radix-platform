/* RADIX pptx-lite: a small PowerPoint (.pptx, Office Open XML PresentationML) writer and checker, no dependencies.
   The package is a «store» zip (lib/zip-lite.js: valid for OOXML) with [Content_Types].xml first, the package rels, the
   core and app properties, presentation.xml, one theme with the brand colours and fonts (clrScheme, fontScheme), one slide
   master with five slide layouts (Titolo, Sezione, Contenuto, Due colonne, Chiusura), a notes master with its own theme,
   the slides and one notes slide per slide (the speaker notes). Every text is a native, editable text box (a placeholder
   of its layout for titles and bullets): no image of text. Sizes in mm (1 mm = 36000 EMU), font sizes in pt.
   build(deck) → Uint8Array; inspect(bytes) re-reads a package: parts, content types, every relationship target, slide
   count, the texts and the notes of each slide, XML well-formedness. Runs in the browser (window.RadixPptx) and in Node. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPptx=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const ZIP=root.RadixZip||(typeof require==='function'?require('./zip-lite.js'):null);
const EMU=36000,NS_A='http://schemas.openxmlformats.org/drawingml/2006/main',NS_R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',NS_P='http://schemas.openxmlformats.org/presentationml/2006/main';
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships/',PKG_REL='http://schemas.openxmlformats.org/package/2006/relationships';
const CT={
 rels:'application/vnd.openxmlformats-package.relationships+xml',xml:'application/xml',png:'image/png',jpeg:'image/jpeg',
 presentation:'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
 master:'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',layout:'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
 slide:'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',notesMaster:'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml',
 notes:'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',theme:'application/vnd.openxmlformats-officedocument.theme+xml',
 presProps:'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml',viewProps:'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml',
 tableStyles:'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml',core:'application/vnd.openxmlformats-package.core-properties+xml',
 app:'application/vnd.openxmlformats-officedocument.extended-properties+xml'};
// The five layouts: name, ST_SlideLayoutType, placeholders (default boxes in mm on a 254 × 142.875 slide).
const LAYOUTS=[
 {id:'title',name:'Titolo',type:'title',ph:[{type:'ctrTitle',box:[20,40,214,36]},{type:'subTitle',idx:1,box:[20,82,214,24]}]},
 {id:'section',name:'Sezione',type:'secHead',ph:[{type:'title',box:[20,50,214,30]},{type:'body',idx:1,box:[20,84,214,20]}]},
 {id:'content',name:'Contenuto',type:'obj',ph:[{type:'title',box:[18,12,218,22]},{type:'body',idx:1,box:[18,40,218,88]}]},
 {id:'two',name:'Due colonne',type:'twoObj',ph:[{type:'title',box:[18,12,218,22]},{type:'body',idx:1,sz:'half',box:[18,40,105,88]},{type:'body',idx:2,sz:'half',box:[131,40,105,88]}]},
 {id:'closing',name:'Chiusura',type:'cust',ph:[{type:'title',box:[20,40,214,30]},{type:'body',idx:1,box:[20,76,214,40]}]}
];
const layoutIndex=id=>{const i=LAYOUTS.findIndex(l=>l.id===id);return i<0?2:i};

// ---- XML helpers ----
// Characters XML 1.0 does not allow are dropped (control characters except tab, newline, carriage return).
const xmlText=s=>String(s==null?'':s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const xmlAttr=s=>xmlText(s).replace(/"/g,'&quot;');
const HEAD='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const emu=mm=>Math.round(mm*EMU);
const hexVal=h=>{const s=String(h||'').replace(/^#/,'').toUpperCase();return /^[0-9A-F]{6}$/.test(s)?s:'000000'};
const xfrm=(x,y,w,h)=>'<a:xfrm><a:off x="'+emu(x)+'" y="'+emu(y)+'"/><a:ext cx="'+Math.max(0,emu(w))+'" cy="'+Math.max(0,emu(h))+'"/></a:xfrm>';
const grp='<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const rels=list=>HEAD+'<Relationships xmlns="'+PKG_REL+'">'+list.map((r,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+(/^https?:/.test(r[0])?r[0]:REL+r[0])+'" Target="'+xmlAttr(r[1])+'"/>').join('')+'</Relationships>';
const phTag=p=>'<p:ph'+(p.type&&p.type!=='body'?' type="'+p.type+'"':'')+(p.sz?' sz="'+p.sz+'"':'')+(p.idx!=null?' idx="'+p.idx+'"':'')+'/>';

// ---- theme ----
// colors: {dk1, lt1, dk2, lt2, accent1…accent6, hlink, folHlink} as #RRGGBB; fonts: {major, minor} (font family names).
const SCHEME=['dk1','lt1','dk2','lt2','accent1','accent2','accent3','accent4','accent5','accent6','hlink','folHlink'];
function themeXml(theme,name){const c=theme.colors||{},f=theme.fonts||{};
 const font=n=>'<a:latin typeface="'+xmlAttr(n||'Arial')+'"/><a:ea typeface=""/><a:cs typeface=""/>';
 const solid='<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
 return HEAD+'<a:theme xmlns:a="'+NS_A+'" name="'+xmlAttr(name)+'"><a:themeElements><a:clrScheme name="'+xmlAttr(name)+'">'+
  SCHEME.map(k=>'<a:'+k+'><a:srgbClr val="'+hexVal(c[k]||(k[0]==='d'?'#000000':'#FFFFFF'))+'"/></a:'+k+'>').join('')+'</a:clrScheme>'+
  '<a:fontScheme name="'+xmlAttr(name)+'"><a:majorFont>'+font(f.major)+'</a:majorFont><a:minorFont>'+font(f.minor)+'</a:minorFont></a:fontScheme>'+
  '<a:fmtScheme name="'+xmlAttr(name)+'"><a:fillStyleLst>'+solid+solid+solid+'</a:fillStyleLst><a:lnStyleLst>'+[6350,12700,19050].map(w=>'<a:ln w="'+w+'">'+solid+'</a:ln>').join('')+'</a:lnStyleLst>'+
  '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'+
  '<a:bgFillStyleLst>'+solid+solid+solid+'</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>'}
const CLRMAP='<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

// ---- text ----
// para: {text, size (pt), bold, color, align 'l'|'ctr'|'r', bullet, font 'major'|'minor', spcBef (pt), caps}
function paraXml(p,inPlaceholder){const size=Math.round((p.size||18)*100),algn=p.align&&p.align!=='l'?' algn="'+p.align+'"':'';
 const bullet=p.bullet?'<a:buFont typeface="Arial"/><a:buChar char="•"/>':'<a:buNone/>',mar=p.bullet?' marL="'+emu(p.indent||5)+'" indent="-'+emu(p.indent||5)+'"':(inPlaceholder?' marL="0" indent="0"':'');
 const ppr='<a:pPr'+mar+algn+'><a:lnSpc><a:spcPct val="'+Math.round((p.line||1)*100000)+'"/></a:lnSpc><a:spcBef><a:spcPts val="'+Math.round((p.spcBef||0)*100)+'"/></a:spcBef>'+bullet+'</a:pPr>';
 const rpr='<a:rPr lang="it-IT" sz="'+size+'" b="'+(p.bold?1:0)+'" dirty="0"><a:solidFill><a:srgbClr val="'+hexVal(p.color)+'"/></a:solidFill><a:latin typeface="'+(p.font==='major'?'+mj-lt':'+mn-lt')+'"/></a:rPr>';
 const t=String(p.text==null?'':p.text);
 return '<a:p>'+ppr+(t?'<a:r>'+rpr+'<a:t>'+xmlText(t)+'</a:t></a:r>':'')+'<a:endParaRPr lang="it-IT" sz="'+size+'" dirty="0"/></a:p>'}
function txBody(s,inPlaceholder){const anchor=s.anchor||'t',scale=s.scale&&s.scale<1?' fontScale="'+Math.round(s.scale*100000)+'"':'';
 const ps=(s.paras&&s.paras.length?s.paras:[{text:''}]).map(p=>paraXml(p,inPlaceholder)).join('');
 return '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="'+anchor+'" rtlCol="0"><a:normAutofit'+scale+'/></a:bodyPr><a:lstStyle/>'+ps+'</p:txBody>'}

// ---- slide shapes ----
// shapes: {t:'rect',x,y,w,h,fill} · {t:'text',ph?,idx?,sz?,name,x,y,w,h,anchor,paras} · {t:'image',media,x,y,w,h,crop:{l,t,r,b} (0–1),name}
function shapeXml(s,id,mediaRel){
 if(s.t==='rect')return '<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="'+xmlAttr(s.name||'Forma '+id)+'"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>'+xfrm(s.x,s.y,s.w,s.h)+'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="'+hexVal(s.fill)+'"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>';
 if(s.t==='text'){const ph=s.ph?phTag({type:s.ph,idx:s.idx,sz:s.sz}):'';
  return '<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="'+xmlAttr(s.name||'Testo '+id)+'"/><p:cNvSpPr'+(ph?'><a:spLocks noGrp="1"/></p:cNvSpPr>':' txBox="1"/>')+'<p:nvPr>'+ph+'</p:nvPr></p:nvSpPr><p:spPr>'+xfrm(s.x,s.y,s.w,s.h)+'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'+txBody(s,!!ph)+'</p:sp>'}
 if(s.t==='image'){const rid=mediaRel(s.media);if(!rid)return '';const c=s.crop||{},pc=v=>Math.round(Math.max(0,Math.min(.99,v||0))*100000);
  const src=c.l||c.t||c.r||c.b?'<a:srcRect l="'+pc(c.l)+'" t="'+pc(c.t)+'" r="'+pc(c.r)+'" b="'+pc(c.b)+'"/>':'';
  return '<p:pic><p:nvPicPr><p:cNvPr id="'+id+'" name="'+xmlAttr(s.name||'Immagine '+id)+'"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="'+rid+'"/>'+src+'<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>'+xfrm(s.x,s.y,s.w,s.h)+'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'}
 return ''}
const bgXml=h=>h?'<p:bg><p:bgPr><a:solidFill><a:srgbClr val="'+hexVal(h)+'"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>':'';
const root3='xmlns:a="'+NS_A+'" xmlns:r="'+NS_R+'" xmlns:p="'+NS_P+'"';

function masterXml(theme){const c=theme.colors||{},dark=hexVal(c.dk1),W=theme.size.w,H=theme.size.h;
 const lvl=(n,sz,bullet)=>'<a:lvl'+n+'pPr'+(bullet?' marL="'+emu(5*n)+'" indent="-'+emu(5)+'"':' marL="0" indent="0"')+'><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="'+(bullet?600:0)+'"/></a:spcBef>'+(bullet?'<a:buFont typeface="Arial"/><a:buChar char="•"/>':'<a:buNone/>')+'<a:defRPr sz="'+sz+'"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl'+n+'pPr>';
 return HEAD+'<p:sldMaster '+root3+'><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>'+grp+
  '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Titolo"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>'+xfrm(18,12,W-36,22)+'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="b"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="it-IT"/><a:t>Titolo</a:t></a:r></a:p></p:txBody></p:sp>'+
  '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Testo"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr>'+xfrm(18,40,W-36,H-54)+'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="it-IT"/><a:t>Testo</a:t></a:r></a:p></p:txBody></p:sp>'+
  '</p:spTree></p:cSld>'+CLRMAP+'<p:sldLayoutIdLst>'+LAYOUTS.map((l,i)=>'<p:sldLayoutId id="'+(2147483649+i)+'" r:id="rId'+(i+1)+'"/>').join('')+'</p:sldLayoutIdLst>'+
  '<p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:buNone/><a:defRPr sz="3200" b="1"><a:solidFill><a:srgbClr val="'+dark+'"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>'+
  '<p:bodyStyle>'+lvl(1,2000,true)+lvl(2,1800,true)+'</p:bodyStyle><p:otherStyle>'+lvl(1,1800,false)+'</p:otherStyle></p:txStyles></p:sldMaster>'}
function layoutXml(l){return HEAD+'<p:sldLayout '+root3+' type="'+l.type+'" preserve="1"><p:cSld name="'+xmlAttr(l.name)+'"><p:spTree>'+grp+
 l.ph.map((p,i)=>'<p:sp><p:nvSpPr><p:cNvPr id="'+(i+2)+'" name="'+xmlAttr((p.type==='ctrTitle'||p.type==='title'?'Titolo':p.type==='subTitle'?'Sottotitolo':'Testo')+' '+(i+1))+'"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>'+phTag(p)+'</p:nvPr></p:nvSpPr><p:spPr>'+xfrm(...p.box)+'</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="it-IT"/></a:p></p:txBody></p:sp>').join('')+
 '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'}
function notesMasterXml(){return HEAD+'<p:notesMaster '+root3+'><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>'+grp+
 '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Immagine diapositiva"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="381000" y="685800"/><a:ext cx="6096000" cy="3429000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr></p:sp>'+
 '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Note"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="it-IT"/></a:p></p:txBody></p:sp>'+
 '</p:spTree></p:cSld>'+CLRMAP+'<p:notesStyle><a:lvl1pPr marL="0" algn="l"><a:defRPr sz="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>'}
function notesXml(text){const ps=String(text||'').replace(/\r/g,'').split('\n').map(l=>'<a:p>'+(l?'<a:r><a:rPr lang="it-IT" dirty="0"/><a:t>'+xmlText(l)+'</a:t></a:r>':'')+'<a:endParaRPr lang="it-IT" dirty="0"/></a:p>').join('');
 return HEAD+'<p:notes '+root3+'><p:cSld><p:spTree>'+grp+
 '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Immagine diapositiva"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>'+
 '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Note del relatore"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>'+ps+'</p:txBody></p:sp>'+
 '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>'}

// deck: {title, author, date, size:{w,h} mm (default 16:9, 254 × 142.875), theme:{name, colors, fonts}, slides:[{layout, bg, shapes, notes}],
// media:{key:{type:'png'|'jpeg', data:Uint8Array}}}. Returns the .pptx bytes.
function build(deck){const size=deck.size||{w:254,h:142.875},theme={name:'RADIX',...(deck.theme||{}),size},slides=deck.slides||[],media=deck.media||{},when=(deck.date||new Date()).toISOString().replace(/\.\d+Z$/,'Z');
 if(!slides.length)throw Error('Nessuna slide da salvare.');
 const files=[],ct=[],put=(name,data,type)=>{files.push({name,data});if(type)ct.push([name,type])};
 const mediaNames={};let mi=0;for(const [k,m] of Object.entries(media)){if(!m||!m.data||!m.data.length)continue;const ext=m.type==='jpeg'?'jpeg':'png';mediaNames[k]='image'+(++mi)+'.'+ext}
 put('_rels/.rels',rels([['officeDocument','ppt/presentation.xml'],[PKG_REL.replace(/relationships$/,'relationships/metadata/core-properties'),'docProps/core.xml'],['extended-properties','docProps/app.xml']]));
 put('docProps/core.xml',HEAD+'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>'+xmlText(deck.title||'Presentazione')+'</dc:title><dc:creator>'+xmlText(deck.author||'RADIX')+'</dc:creator><cp:lastModifiedBy>RADIX</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">'+when+'</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">'+when+'</dcterms:modified></cp:coreProperties>',CT.core);
 put('docProps/app.xml',HEAD+'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>RADIX Studio Documenti</Application><PresentationFormat>Personalizzato</PresentationFormat><Slides>'+slides.length+'</Slides><Notes>'+slides.filter(s=>s.notes).length+'</Notes></Properties>',CT.app);
 const pres=[['slideMaster','slideMasters/slideMaster1.xml'],...slides.map((s,i)=>['slide','slides/slide'+(i+1)+'.xml']),['notesMaster','notesMasters/notesMaster1.xml'],['theme','theme/theme1.xml'],['presProps','presProps.xml'],['viewProps','viewProps.xml'],['tableStyles','tableStyles.xml']];
 const nm=slides.length+2;
 put('ppt/presentation.xml',HEAD+'<p:presentation '+root3+' saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId'+nm+'"/></p:notesMasterIdLst><p:sldIdLst>'+
  slides.map((s,i)=>'<p:sldId id="'+(256+i)+'" r:id="rId'+(i+2)+'"/>').join('')+'</p:sldIdLst><p:sldSz cx="'+emu(size.w)+'" cy="'+emu(size.h)+'"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="it-IT"/></a:defPPr></p:defaultTextStyle></p:presentation>',CT.presentation);
 put('ppt/_rels/presentation.xml.rels',rels(pres));
 put('ppt/presProps.xml',HEAD+'<p:presentationPr '+root3+'/>',CT.presProps);
 put('ppt/viewProps.xml',HEAD+'<p:viewPr '+root3+'><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>',CT.viewProps);
 put('ppt/tableStyles.xml',HEAD+'<a:tblStyleLst xmlns:a="'+NS_A+'" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>',CT.tableStyles);
 put('ppt/theme/theme1.xml',themeXml(theme,theme.name),CT.theme);put('ppt/theme/theme2.xml',themeXml(theme,theme.name+' note'),CT.theme);
 put('ppt/slideMasters/slideMaster1.xml',masterXml(theme),CT.master);
 put('ppt/slideMasters/_rels/slideMaster1.xml.rels',rels([...LAYOUTS.map((l,i)=>['slideLayout','../slideLayouts/slideLayout'+(i+1)+'.xml']),['theme','../theme/theme1.xml']]));
 LAYOUTS.forEach((l,i)=>{put('ppt/slideLayouts/slideLayout'+(i+1)+'.xml',layoutXml(l),CT.layout);put('ppt/slideLayouts/_rels/slideLayout'+(i+1)+'.xml.rels',rels([['slideMaster','../slideMasters/slideMaster1.xml']]))});
 put('ppt/notesMasters/notesMaster1.xml',notesMasterXml(),CT.notesMaster);put('ppt/notesMasters/_rels/notesMaster1.xml.rels',rels([['theme','../theme/theme2.xml']]));
 slides.forEach((s,i)=>{const n=i+1,r=[['slideLayout','../slideLayouts/slideLayout'+(layoutIndex(s.layout)+1)+'.xml'],['notesSlide','../notesSlides/notesSlide'+n+'.xml']],used={};
  const mediaRel=k=>{if(!mediaNames[k])return '';if(!used[k]){r.push(['image','../media/'+mediaNames[k]]);used[k]='rId'+r.length}return used[k]};
  let id=1;const body=(s.shapes||[]).map(sh=>shapeXml(sh,++id,mediaRel)).join('');
  put('ppt/slides/slide'+n+'.xml',HEAD+'<p:sld '+root3+'><p:cSld>'+bgXml(s.bg)+'<p:spTree>'+grp+body+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>',CT.slide);
  put('ppt/slides/_rels/slide'+n+'.xml.rels',rels(r));
  put('ppt/notesSlides/notesSlide'+n+'.xml',notesXml(s.notes),CT.notes);
  put('ppt/notesSlides/_rels/notesSlide'+n+'.xml.rels',rels([['notesMaster','../notesMasters/notesMaster1.xml'],['slide','../slides/slide'+n+'.xml']]))});
 for(const [k,name] of Object.entries(mediaNames))put('ppt/media/'+name,media[k].data);
 const types=HEAD+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="'+CT.rels+'"/><Default Extension="xml" ContentType="'+CT.xml+'"/><Default Extension="png" ContentType="'+CT.png+'"/><Default Extension="jpeg" ContentType="'+CT.jpeg+'"/>'+
  ct.map(([n,t])=>'<Override PartName="/'+n+'" ContentType="'+t+'"/>').join('')+'</Types>';
 return ZIP.zip([{name:'[Content_Types].xml',data:types},...files],{date:deck.date||new Date()})}

// ---- checker ----
const decode=b=>new TextDecoder().decode(b);
const unescape=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
// A small well-formedness check: every start tag closed in order, one root element.
function xmlProblems(s,name){const out=[];if(!/^<\?xml [^>]*\?>/.test(s))out.push(name+': manca la dichiarazione XML.');const body=s.replace(/^<\?xml[^>]*\?>\s*/,'');const stack=[];let roots=0,m;const re=/<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|<!--[\s\S]*?-->|([^<]+)/g;let last=0;
 while((m=re.exec(body))){if(m.index!==last){out.push(name+': XML non valido vicino a «'+body.slice(last,last+30)+'».');break}last=re.lastIndex;
  if(m[5]!=null){if(!stack.length&&m[5].trim())out.push(name+': testo fuori dall’elemento radice.');if(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(m[5]))out.push(name+': «&» non codificato.');continue}
  if(!m[2])continue;if(m[1]){if(stack.pop()!==m[2]){out.push(name+': tag </'+m[2]+'> non corrisponde.');break}continue}
  if(!stack.length)roots++;if(!m[4])stack.push(m[2])}
 if(last!==body.length&&!out.length)out.push(name+': XML troncato.');if(stack.length&&!out.length)out.push(name+': <'+stack[stack.length-1]+'> non chiuso.');if(roots!==1&&!out.length)out.push(name+': deve avere un solo elemento radice.');return out}
const attrs=t=>{const o={};for(const m of t.matchAll(/([\w:]+)="([^"]*)"/g))o[m[1]]=unescape(m[2]);return o};
const dirOf=p=>p.includes('/')?p.slice(0,p.lastIndexOf('/')+1):'';
function resolve(base,target){if(target.startsWith('/'))return target.slice(1);const parts=(dirOf(base)+target).split('/'),out=[];for(const p of parts){if(p==='..')out.pop();else if(p!=='.'&&p!=='')out.push(p)}return out.join('/')}
// The part a .rels file describes: ppt/slides/_rels/slide1.xml.rels → ppt/slides/slide1.xml; _rels/.rels → the package.
const relSource=n=>n==='_rels/.rels'?'':n.replace(/_rels\/([^/]+)\.rels$/,'$1');
const textsOf=xml=>[...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map(p=>[...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t=>unescape(t[1])).join('')).filter(Boolean);
// bytes → {parts, slides, texts:[[...] per slide], notes:[string per slide], layouts:[name per slide], media, problems}
function inspect(bytes){const problems=[];let files;try{files=ZIP.unzip(bytes)}catch(e){return {parts:[],slides:0,texts:[],notes:[],layouts:[],media:[],problems:['Archivio non leggibile: '+e.message]}}
 const map=new Map(files.map(f=>[f.name,f.data])),names=files.map(f=>f.name);
 if(names[0]!=='[Content_Types].xml')problems.push('[Content_Types].xml deve essere il primo file.');
 const xml=n=>map.has(n)?decode(map.get(n)):null,ctx=xml('[Content_Types].xml');
 if(!ctx)return {parts:names,slides:0,texts:[],notes:[],layouts:[],media:[],problems:problems.concat('Manca [Content_Types].xml.')};
 const defaults={},overrides={};for(const m of ctx.matchAll(/<Default ([^>]*)\/>/g)){const a=attrs(m[1]);defaults[String(a.Extension).toLowerCase()]=a.ContentType}
 for(const m of ctx.matchAll(/<Override ([^>]*)\/>/g)){const a=attrs(m[1]);overrides[String(a.PartName).replace(/^\//,'')]=a.ContentType;if(!map.has(String(a.PartName).replace(/^\//,'')))problems.push('Content type per una parte che non c’è: '+a.PartName)}
 const typeOf=n=>overrides[n]||defaults[(n.split('.').pop()||'').toLowerCase()];
 for(const n of names){if(n==='[Content_Types].xml')continue;if(!typeOf(n))problems.push('Parte senza content type: '+n);if(/\.(xml|rels)$/.test(n))problems.push(...xmlProblems(xml(n),n))}
 const relsOf=n=>{const r=xml(n.replace(/([^/]*)$/,'_rels/$1.rels'));return r?[...r.matchAll(/<Relationship ([^>]*)\/>/g)].map(m=>attrs(m[1])):[]};
 for(const n of names.filter(n=>/\.rels$/.test(n))){const src=relSource(n),seen=new Set();if(src&&!map.has(src))problems.push(n+': descrive una parte che non c’è ('+src+').');
  for(const m of xml(n).matchAll(/<Relationship ([^>]*)\/>/g)){const a=attrs(m[1]);if(seen.has(a.Id))problems.push(n+': Id ripetuto '+a.Id);seen.add(a.Id);if(a.TargetMode==='External')continue;const t=resolve(src,a.Target);if(!map.has(t))problems.push(n+': '+a.Id+' punta a una parte che non c’è ('+t+').')}}
 const pres=xml('ppt/presentation.xml');if(!pres)problems.push('Manca ppt/presentation.xml.');
 if(typeOf('ppt/presentation.xml')!==CT.presentation)problems.push('Content type sbagliato per ppt/presentation.xml.');
 const pr=relsOf('ppt/presentation.xml'),byId=Object.fromEntries(pr.map(r=>[r.Id,resolve('ppt/presentation.xml',r.Target)]));
 const ids=pres?[...pres.matchAll(/<p:sldId id="(\d+)" r:id="(rId\d+)"\/>/g)]:[],slideParts=ids.map(m=>byId[m[2]]);
 if(pres&&!/<p:sldSz cx="\d+" cy="\d+"/.test(pres))problems.push('Manca la misura delle slide.');
 slideParts.forEach((p,i)=>{if(!p||!map.has(p))problems.push('Slide '+(i+1)+' senza file.');else if(typeOf(p)!==CT.slide)problems.push(p+': content type sbagliato.')});
 const texts=[],notes=[],layouts=[];
 slideParts.forEach(p=>{const s=p&&xml(p)||'';texts.push(textsOf(s));const r=relsOf(p||'');const lay=r.find(x=>/\/slideLayout$/.test(x.Type)),nt=r.find(x=>/\/notesSlide$/.test(x.Type));
  if(!lay)problems.push(p+': manca il layout.');const lx=lay&&xml(resolve(p,lay.Target))||'';layouts.push((/<p:cSld name="([^"]*)"/.exec(lx)||[])[1]||'');
  const nx=nt&&xml(resolve(p,nt.Target))||'';notes.push(textsOf(nx).join('\n'))});
 if(!slideParts.length)problems.push('Nessuna slide.');
 return {parts:names,slides:slideParts.length,texts,notes,layouts,media:names.filter(n=>/^ppt\/media\//.test(n)),problems:[...new Set(problems)]}}
return Object.freeze({EMU,LAYOUTS,CT,build,inspect,xmlText,xmlProblems});
});
