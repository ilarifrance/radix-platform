/* Studio «Coordinato aziendale» (agency jobs B5 + E3 + C5): the client's saved identity kit (profile.identityKit: logo SVG,
   palette, fonts) becomes the whole set of coordinated files, with NO AI and no cost.
   1. The project's kit (if there is none: an honest empty state with a button to the Kit identità studio), the company
      data for the stationery (ragione sociale, P. IVA, indirizzo, telefono, email, sito: prefilled from the project and
      the client, never invented: what is missing stays blank and is listed before the export), the people (one business
      card and one signature each) and the pieces.
   2. Three layout directions built here, deterministically (Classico, Moderno, Audace: the Classico, Minimal and Deciso
      layouts of lib/print-studio.js), each shown as business card front and back, letterhead and email signature; the
      person picks one («Scelta»).
   3. The checks, then one zip (lib/zip-lite.js):
      - stampa/: business card 85 × 55 mm front and back (one per person), A4 letterhead, DL envelope 220 × 110 mm and
        A4 folder (440 × 310 mm open, fold marks) as PDF/X-1a-style CMYK files with 3 mm bleed and crop marks, texts as
        outlines and the vector logo (the PDF writer of lib/print-studio.js);
      - firma-email/: the HTML signature (tables, inline styles, at most 600 px, readable without images, no external
        image: the logo goes in as a PNG data URI, or from the client's own site when its address is given), its plain
        text, logo-firma.png and the instructions (Gmail drops data URIs: upload the PNG to the site and use its address);
      - social/: LinkedIn 1584 × 396, Facebook 1640 × 624 and YouTube 2560 × 1440 covers as PNG (canvas in the browser)
        and SVG, with the logo and the texts inside the area every device shows;
      - modelli-office/: a Word letterhead (.docx: minimal OOXML written here, header with the logo, footer with the
        company data) and a PowerPoint template (.pptx, lib/pptx-lite.js) in the kit's colours and fonts.
   Checks before the export: company data complete and P. IVA well formed, P. IVA on the letterhead, bleed, safe areas
   (print, envelope address zone, social covers), text at least 6 pt, fonts (outlined, or the standard fallback named),
   colours only from the palette (plus black and white), AA contrast of every text on its background (identity-studio's
   WCAG formula, through lib/print-studio.js contrast), ink ≤ 300 % and the signature rules.
   The choice is saved in the project: the «agents» document under the key coordinato (agents-page.js keeps it).
   Pure part runs in Node for the tests; coordinatoStudio() is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCoordinatoStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')))};
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const PS=()=>lib('RadixPrintStudio','./print-studio.js'),ZIP=()=>lib('RadixZip','./zip-lite.js'),PX=()=>lib('RadixPptx','./pptx-lite.js');
const AGENT='art-director',MAX_SAVED=10,MAX_PEOPLE=10,FIELD_MAX=200,SIGNATURE_W=520,SIGNATURE_MAX=600,MIN_PT=6;
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>norm(s).replace(/ /g,'-').slice(0,40);
const HEXRE=/^#[0-9A-F]{6}$/;
const up=h=>String(h||'').toUpperCase();

// ---- what can be made ----
const PIECES=Object.freeze([
 {id:'biglietto',title:'Biglietto da visita',size:'85 × 55 mm, fronte e retro'},
 {id:'carta',title:'Carta intestata',size:'A4, 210 × 297 mm'},
 {id:'busta',title:'Busta DL',size:'220 × 110 mm'},
 {id:'cartellina',title:'Cartellina',size:'A4, aperta 440 × 310 mm'},
 {id:'firma',title:'Firma email',size:'HTML, al massimo 600 px'},
 {id:'social',title:'Copertine social',size:'LinkedIn, Facebook, YouTube'},
 {id:'office',title:'Modelli Office',size:'Word e PowerPoint'}]);
const PIECE_IDS=PIECES.map(p=>p.id);
// The three directions: the same kit, three ways of laying it out (print: the lib/print-studio.js variant).
const DIRECTIONS=Object.freeze([
 {id:'classico',title:'Classico',print:'classic',line:'Logo in alto, fasce di colore sottili: ordinato e sicuro.'},
 {id:'moderno',title:'Moderno',print:'minimal',line:'Molto bianco, logo piccolo, linee sottili e testi leggeri.'},
 {id:'audace',title:'Audace',print:'bold',line:'Il colore primario a tutta pagina e il logo grande.'}]);
const direction=id=>DIRECTIONS.find(d=>d.id===id)||DIRECTIONS[0];
// Company data: [key, label, max, placeholder]; the first six are needed by the stationery.
const COMPANY=Object.freeze([
 ['ragione','Ragione sociale',120,'Es. Forno Aurora S.r.l.'],['piva','Partita IVA',20,'11 cifre'],['indirizzo','Indirizzo della sede',FIELD_MAX,'Es. Via Nizza 12, 10125 Torino'],
 ['telefono','Telefono',40,'Es. 011 555 1234'],['email','Email',80,'Es. info@azienda.it'],['sito','Sito web',80,'Es. www.azienda.it'],
 ['payoff','Payoff (facoltativo)',120,'La frase sotto il nome'],['altri','Altri dati societari (facoltativo)',FIELD_MAX,'Es. REA TO-123456 · Cap. soc. 10.000 € i.v. · PEC']]);
const REQUIRED=Object.freeze(['ragione','piva','indirizzo','telefono','email','sito']);
const LABEL=Object.fromEntries(COMPANY.map(c=>[c[0],c[1]]));
const PERSON=Object.freeze([['nome','Nome e cognome',60],['ruolo','Ruolo',60],['email','Email diretta (facoltativa)',80],['telefono','Telefono diretto (facoltativo)',40]]);

// ---- P. IVA ----
// 11 digits (an «IT» in front is fine); '' when there are none.
function pivaOf(s){const m=/(?:^|\D)(\d{11})(?!\d)/.exec(String(s||'').replace(/[\s.]/g,''));return m?m[1]:''}
// The Italian check digit (Luhn-like): odd positions as they are, even positions doubled (−9 above 9).
function pivaValid(p){const d=String(p||'');if(!/^\d{11}$/.test(d)||/^0{11}$/.test(d))return false;let s=0;
 for(let i=0;i<10;i++){let x=+d[i];if(i%2){x*=2;if(x>9)x-=9}s+=x}return (10-s%10)%10===+d[10]}

// ---- prefill: from the project profile and the client, never invented ----
function hasKit(profile){const P=PS();return !!(profile&&profile.identityKit&&typeof profile.identityKit==='object'&&P.brandOf(profile).fromKit)}
// ctx: {projectName, clientName, summary}. Returns {values, from:{key:'progetto'|'cliente'}}.
function prefill(profile,{projectName,clientName,summary}={}){const P=PS(),p=profile||{},pre=P.prefill(p,{projectName,summary}),legal=p.legal&&typeof p.legal==='object'?p.legal:{},c=p.contacts&&typeof p.contacts==='object'?p.contacts:{},from={};
 const v={ragione:clean(legal.ragioneSociale||legal.name||p.ragioneSociale||p.legalName||c.ragioneSociale||''),piva:pivaOf(legal.piva||legal.vat||p.piva||p.vat||c.piva||c.vat||''),
  indirizzo:clean(legal.address||pre.address),telefono:clean(pre.phone),email:clean(pre.email),sito:clean(pre.website),payoff:clean(pre.payoff),altri:clean(legal.extra||legal.altri||'')};
 for(const k of Object.keys(v))if(v[k])from[k]='progetto';
 if(!v.ragione&&clean(clientName)){v.ragione=clean(clientName).slice(0,120);from.ragione='cliente'}
 for(const [k,,max] of COMPANY)v[k]=String(v[k]||'').slice(0,max);return {values:v,from}}
function company(v){const o={};for(const [k,,max] of COMPANY)o[k]=clean(v&&v[k]).slice(0,max);o.piva=pivaOf(o.piva)||o.piva.replace(/[^\dA-Z]/gi,'').slice(0,16);return o}
function people(list){return (Array.isArray(list)?list:[]).map(x=>{const o={};for(const [k,,max] of PERSON)o[k]=clean(x&&x[k]).slice(0,max);return o}).filter(x=>x.nome).slice(0,MAX_PEOPLE)}
const missing=c=>REQUIRED.filter(k=>!clean(c&&c[k]));
// The model of the studio: {direction, company, people, pieces, logoUrl, brand}.
function modelOf(input,profile,{projectName}={}){const i=input||{},P=PS();
 const pieces=(Array.isArray(i.pieces)?i.pieces:PIECE_IDS).filter(x=>PIECE_IDS.includes(x));
 return {direction:direction(i.direction).id,company:company(i.company),people:people(i.people),pieces:pieces.length?PIECE_IDS.filter(x=>pieces.includes(x)):PIECE_IDS.slice(),logoUrl:clean(i.logoUrl).slice(0,300),brand:P.brandOf(profile,projectName)}}
const has=(m,id)=>m.pieces.includes(id);

// ---- the print documents (lib/print-studio.js layouts and PDF writer) ----
const site=s=>clean(s).replace(/^https?:\/\//i,'').replace(/\/+$/,'');
const legalLine=c=>[c.ragione,c.piva?'P. IVA '+c.piva:'',c.altri].map(clean).filter(Boolean).join(' · ');
function printValues(m,person){const c=m.company,p=person||{};
 return {name:m.brand.name||c.ragione,payoff:c.payoff,person:p.nome||'',role:p.ruolo||'',phone:p.telefono||c.telefono,email:p.email||c.email,website:site(c.sito),address:c.indirizzo,vat:legalLine(c)}}
const cardDoc=(m,person)=>PS().layout('biglietto',printValues(m,person),m.brand,{variant:direction(m.direction).print});
const letterDoc=m=>PS().layout('carta',printValues(m,null),m.brand,{variant:direction(m.direction).print});
function finish(P,f,b,pages,labels,variant,values,title){const doc={format:f.id,variant,title,margin:b.m,brand:b.brand,values,dpi:300,
  pages:pages.map((items,i)=>({label:labels[i],w:f.w,h:f.h,items,folds:f.folds||[],hidden:null})),warnings:b.warnings};
 doc.warnings=doc.warnings.concat(P.safeArea(doc),P.glyphs(doc));return doc}
// DL envelope 220 × 110 mm, front: logo and sender top left; the address zone (right, lower half) stays free.
const ENVELOPE=Object.freeze({id:'busta',w:220,h:110,margin:10,address:{x:110,y:48,w:100,h:52}});
function envelopeDoc(m){const P=PS(),f=ENVELOPE,v=printValues(m,null),c=m.company,variant=direction(m.direction).print,b=P.builder(f,m.brand,v,f.margin,{variant}),pal=m.brand.palette,B=P.BLEED,W='#FFFFFF',page=[];b.items=page;
 const txt=P.ink(W,pal,pal.dark),soft=P.ink(W,pal,pal.secondary,pal.dark),head=P.ink(W,pal,pal.primary,pal.dark);
 const lines=[[c.ragione||v.name,true],[c.indirizzo,false],[[site(c.sito),c.email].filter(Boolean).join('  ·  '),false]].filter(x=>clean(x[0]));
 const sender=(x,y,w,size,fill)=>{lines.forEach(([s,bold],i)=>{b.text(x,y+i*P.ptToMm(size*1.4),w,s,{size,bold,fill:bold?head:fill,label:i===0?'Mittente':i===1?'Indirizzo':'Contatti'})});return y+(lines.length-1)*P.ptToMm(size*1.4)};
 const m0=f.margin;
 if(variant==='bold'){b.rect(-B,-B,9+B,f.h+2*B,pal.primary);b.rect(9,-B,1.2,f.h+2*B,pal.accent);const x0=10.2+m0;
  b.logo(x0,m0,58,18,{align:'left',bg:W});sender(x0,m0+18+5+P.ptToMm(8*.718),90,8,txt)}
 else if(variant==='minimal'){b.logo(m0,m0,40,11,{align:'left',bg:W});const y=m0+11+4;b.rect(m0,y,10,.5,pal.accent);sender(m0,y+3+P.ptToMm(7*.718),90,7,soft)}
 else{b.logo(m0,m0,56,16,{align:'left',bg:W});const y=sender(m0,m0+16+5+P.ptToMm(8*.718),90,8,txt);b.rect(m0,y+4,14,.8,pal.accent)}
 return finish(P,f,b,[page],['Fronte'],variant,v,'Busta DL · '+(v.name||''))}
// Folder: two A4+ panels 220 × 310 mm (back | front outside, then the inside), fold at 220 mm; pocket and die cut from the print shop.
const FOLDER=Object.freeze({id:'cartellina',w:440,h:310,margin:16,folds:[220]});
function folderDoc(m){const P=PS(),f=FOLDER,v=printValues(m,null),c=m.company,variant=direction(m.direction).print,b=P.builder(f,m.brand,v,f.margin,{variant}),pal=m.brand.palette,B=P.BLEED,H=f.h,M=f.margin,pages=[];
 const back={x:0,y:0,w:220,h:H},front={x:220,y:0,w:220,h:H},full=fill=>b.rect(-B,-B,f.w+2*B,H+2*B,fill);
 const contacts=[c.indirizzo,[c.telefono,c.email].filter(Boolean).join('  ·  '),site(c.sito)].map(clean).filter(Boolean);
 const backSide=(bg,align,mono)=>{const t=mono||P.ink(bg,pal,pal.dark),s=mono||P.ink(bg,pal,pal.secondary,pal.dark),x=back.x+M,w=back.w-2*M,lead=P.ptToMm(9*1.45);let y=H-M-P.ptToMm(7.5*.207)-P.ptToMm(7.5*1.4)*(legalLine(c)?1:0)-(contacts.length-1)*lead-P.ptToMm(9*.207)-2;
  b.logo(x,y-P.ptToMm(9*.718)-24,align==='center'?w:60,16,{align:align==='center'?'center':'left',bg,mono,area:back});
  contacts.forEach((l,i)=>b.text(x,y+i*lead,w,l,{size:9,fill:t,align,label:'Contatti',area:back}));
  if(legalLine(c))b.text(x,H-M-P.ptToMm(7.5*.207),w,legalLine(c),{size:7.5,fill:s,align,label:'Dati societari',area:back})};
 let page=[];b.items=page;
 if(variant==='bold'){full(pal.primary);const on=P.ink(pal.primary,pal,pal.light,pal.dark);b.rect(front.x,H-14,front.w+B,14+B,pal.accent);
  b.logo(front.x+M+14,H*.3,front.w-2*M-28,64,{mono:on,bg:pal.primary,area:front});
  if(clean(c.payoff))b.text(front.x+M,H*.3+64+14,front.w-2*M,c.payoff,{size:13,bold:true,fill:on,align:'center',label:'Payoff',area:front});
  backSide(pal.primary,'left',on)}
 else if(variant==='minimal'){full(pal.light);const soft=P.ink(pal.light,pal,pal.secondary,pal.dark);
  b.logo(front.x+M,M+6,80,22,{align:'left',area:front});b.rect(front.x+M,M+6+22+8,14,.6,pal.accent);
  if(clean(c.payoff))b.text(front.x+M,H-M-P.ptToMm(10*.207),front.w-2*M,c.payoff,{size:10,fill:soft,label:'Payoff',area:front});
  backSide(pal.light,'left')}
 else{full(pal.light);const band=48;b.rect(front.x,H-band,front.w+B,band+B,pal.primary);b.rect(front.x,H-band-3,front.w+B,3,pal.accent);
  b.logo(front.x+M+20,H*.28,front.w-2*M-40,52,{area:front});
  if(clean(c.payoff))b.text(front.x+M,H*.28+52+12,front.w-2*M,c.payoff,{size:12,fill:P.ink(pal.light,pal,pal.secondary,pal.dark),align:'center',label:'Payoff',area:front});
  if(site(c.sito))b.text(front.x+M,H-band/2+P.ptToMm(11*.718)/2,front.w-2*M,site(c.sito),{size:11,bold:true,fill:P.ink(pal.primary,pal,pal.light,pal.dark),align:'center',label:'Sito web',area:front});
  backSide(pal.light,'center')}
 pages.push(page);
 // inside: plain, the pocket goes on the right panel (die cut by the print shop)
 page=[];b.items=page;full(variant==='minimal'?'#FFFFFF':pal.light);
 if(variant==='bold'){b.rect(-B,-B,f.w+2*B,8+B,pal.primary)}else if(variant==='classic')b.rect(-B,-B,f.w+2*B,4+B,pal.primary);
 const ib=variant==='minimal'?'#FFFFFF':pal.light;b.logo(back.x+M,H-M-14,44,12,{align:'left',bg:ib,area:back});
 if(site(c.sito))b.text(back.x+M+50,H-M-4,back.w-2*M-50,site(c.sito),{size:8,fill:P.ink(ib,pal,pal.secondary,pal.dark),align:'right',label:'Sito web',area:back});
 pages.push(page);
 return finish(P,f,b,pages,['Esterno (retro | copertina)','Interno'],variant,v,'Cartellina · '+(v.name||''))}
// Every print document of the model: [{id, name, label, doc}].
function printDocs(m){const out=[];
 if(has(m,'biglietto')){const ps=m.people.length?m.people:[null];ps.forEach((p,i)=>out.push({id:'biglietto',name:'biglietto'+(p?'-'+(slug(p.nome)||'persona-'+(i+1)):'')+'.pdf',label:'Biglietto da visita'+(p?' · '+p.nome:''),doc:cardDoc(m,p)}))}
 if(has(m,'carta'))out.push({id:'carta',name:'carta-intestata-a4.pdf',label:'Carta intestata A4',doc:letterDoc(m)});
 if(has(m,'busta'))out.push({id:'busta',name:'busta-dl.pdf',label:'Busta DL',doc:envelopeDoc(m)});
 if(has(m,'cartellina'))out.push({id:'cartellina',name:'cartellina-a4.pdf',label:'Cartellina A4',doc:folderDoc(m)});
 return out}
// Page sizes of the print PDF in points: MediaBox (trim + bleed + slug), BleedBox, TrimBox.
function pdfBoxes(w,h){const P=PS(),o=P.BLEED+P.SLUG,pt=x=>Math.round(P.mmToPt(x)*1000)/1000;
 return {media:[0,0,pt(w+2*o),pt(h+2*o)],bleed:[pt(P.SLUG),pt(P.SLUG),pt(P.SLUG+w+2*P.BLEED),pt(P.SLUG+h+2*P.BLEED)],trim:[pt(o),pt(o),pt(o+w),pt(o+h)]}}

// ---- social covers (canvas PNG in the browser, SVG everywhere) ----
// safe: the area every device shows. LinkedIn: the profile photo covers the lower left on desktop and the phone crops
// the sides; Facebook: the phone shows only the central 16:9 (1108 px wide); YouTube: the 1546 × 423 centre seen on
// every device (the rest only on TVs).
const COVERS=Object.freeze([
 {id:'linkedin',title:'LinkedIn · sfondo del profilo',w:1584,h:396,safe:{x:568,y:40,w:976,h:316},note:'In basso a sinistra c’è la foto del profilo e il telefono taglia i lati: logo e testi stanno a destra.'},
 {id:'facebook',title:'Facebook · copertina',w:1640,h:624,safe:{x:266,y:48,w:1108,h:528},note:'Sul telefono si vede solo la parte centrale (1108 px): logo e testi stanno lì.'},
 {id:'youtube',title:'YouTube · banner del canale',w:2560,h:1440,safe:{x:507,y:508,w:1546,h:423},note:'Su computer e telefono si vede solo il centro 1546 × 423 px; il resto appare sulle TV.'}]);
const ASC=.718,DESC=.207;
const wPx=(s,size,bold)=>PS().textWidth(s,size,bold);
function wrapPx(text,size,width,bold){const words=clean(text).split(' ').filter(Boolean),out=[];let line='';
 for(const w of words){const t=line?line+' '+w:w;if(wPx(t,size,bold)<=width||!line){line=t;continue}out.push(line);line=w}if(line)out.push(line);return out}
// The cover as items in px: rects, texts (baseline y) and the logo box.
function coverLayout(spec,m){const P=PS(),b=m.brand,pal=b.palette,s=spec.safe,v=direction(m.direction).id,c=m.company,W=spec.w,H=spec.h,items=[];
 const rect=(x,y,w,h,fill)=>items.push({t:'rect',x,y,w,h,fill});let bg,head,soft,mono=null;
 if(v==='audace'){bg=pal.primary;rect(0,0,W,H,bg);rect(0,H-Math.round(H*.05),W,Math.round(H*.05),pal.accent);head=soft=mono=P.ink(bg,pal,pal.light,pal.dark)}
 else if(v==='moderno'){bg='#FFFFFF';rect(0,0,W,H,bg);rect(0,0,W,Math.max(4,Math.round(H*.012)),pal.accent);head=P.ink(bg,pal,pal.primary,pal.dark);soft=P.ink(bg,pal,pal.secondary,pal.dark)}
 else{bg=pal.light;rect(0,0,W,H,bg);const band=Math.round(H*.05);rect(0,H-band,W,band,pal.primary);rect(0,H-band-Math.round(band*.25),W,Math.round(band*.25),pal.accent);head=P.ink(bg,pal,pal.primary,pal.dark);soft=P.ink(bg,pal,pal.secondary,pal.dark)}
 const pad=Math.round(s.h*.08),payoff=clean(c.payoff),url=site(c.sito),text=!!(payoff||url),vb=b.logo?P.viewBox(b.logo):null;
 // the logo (or the name as a wordmark) on the left of the safe area, the texts on the right; alone, centred
 const lb=text?{x:s.x+pad,y:s.y+pad,w:s.w*(v==='moderno'?.32:.4)-pad,h:s.h-2*pad}:{x:s.x+s.w*.15,y:s.y+pad,w:s.w*.7,h:s.h-2*pad};
 if(vb){const k=Math.min(lb.w/vb[2],lb.h/vb[3])*(v==='moderno'?.8:1),lw=vb[2]*k,lh=vb[3]*k;items.push({t:'logo',x:text?lb.x:lb.x+(lb.w-lw)/2,y:lb.y+(lb.h-lh)/2,w:lw,h:lh,svg:mono?P.monoSvg(b.logo,mono):b.logo,label:'Logo'})}
 else{const name=clean(b.name||c.ragione)||'Brand';let size=lb.h*.5;while(size>12&&wPx(name,size,true)>lb.w)size-=2;items.push({t:'text',x:text?lb.x:lb.x+(lb.w-wPx(name,size,true))/2,y:lb.y+lb.h/2+size*ASC/2,s:name,size,bold:true,fill:head,label:'Nome'})}
 if(text){const x=s.x+s.w*(v==='moderno'?.36:.44),w=s.x+s.w-pad-x;let size=Math.round(s.h*(v==='audace'?.24:.2)),lines=[];
  if(payoff){for(;size>14;size-=2){lines=wrapPx(payoff,size,w,v!=='moderno');if(lines.length<=2&&lines.every(l=>wPx(l,size,v!=='moderno')<=w))break}}
  const us=Math.max(16,Math.round((payoff?size*.42:s.h*.16))),lead=size*1.12,block=(lines.length?(lines.length-1)*lead+size*(ASC+DESC):0)+(url?(lines.length?us*.9:0)+us*(ASC+DESC):0);
  let y=s.y+(s.h-block)/2+(lines.length?size*ASC:us*ASC);
  lines.forEach((l,i)=>items.push({t:'text',x,y:y+i*lead,s:l,size,bold:v!=='moderno',fill:head,label:'Payoff'}));
  if(url){let ux=y+(lines.length?(lines.length-1)*lead+size*DESC+us*.9+us*ASC:0),usz=us;while(usz>12&&wPx(url,usz,false)>w)usz-=1;items.push({t:'text',x,y:ux,s:url,size:usz,bold:false,fill:lines.length?soft:head,label:'Sito web'})}}
 return {spec,bg,items}}
function boxOf(it){if(it.t==='text')return {x0:it.x,x1:it.x+wPx(it.s,it.size,it.bold),y0:it.y-it.size*ASC,y1:it.y+it.size*DESC};if(it.t==='logo')return {x0:it.x,x1:it.x+it.w,y0:it.y,y1:it.y+it.h};return null}
// Logo and texts outside the area every device shows: [{label, text}].
function coverProblems(L){const s=L.spec.safe,e=.5,out=[];for(const it of L.items){const bb=boxOf(it);if(!bb)continue;
 if(bb.x0<s.x-e||bb.y0<s.y-e||bb.x1>s.x+s.w+e||bb.y1>s.y+s.h+e)out.push({label:it.label,text:L.spec.title+': «'+it.label+'» esce dall’area visibile su tutti i dispositivi.'})}return out}
function coverSvg(L,{guides=false}={}){const P=PS(),{w,h}=L.spec,o=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'">'],n=x=>Math.round(x*100)/100;
 for(const it of L.items){if(it.t==='rect')o.push('<rect x="'+n(it.x)+'" y="'+n(it.y)+'" width="'+n(it.w)+'" height="'+n(it.h)+'" fill="'+it.fill+'"/>');
  else if(it.t==='text')o.push('<text x="'+n(it.x)+'" y="'+n(it.y)+'" font-family="Helvetica, Arial, \'Liberation Sans\', sans-serif" font-size="'+n(it.size)+'"'+(it.bold?' font-weight="700"':'')+' fill="'+it.fill+'" xml:space="preserve">'+esc(it.s)+'</text>');
  else if(it.t==='logo')o.push('<image x="'+n(it.x)+'" y="'+n(it.y)+'" width="'+n(it.w)+'" height="'+n(it.h)+'" preserveAspectRatio="xMidYMid meet" href="'+esc(P.svgUrl(it.svg))+'"/>')}
 if(guides){const s=L.spec.safe;o.push('<rect x="'+s.x+'" y="'+s.y+'" width="'+s.w+'" height="'+s.h+'" fill="none" stroke="#2f80ed" stroke-width="'+Math.max(2,w/400)+'" stroke-dasharray="'+Math.round(w/80)+' '+Math.round(w/120)+'"/>')}
 o.push('</svg>');return o.join('')}

// ---- email signature (E3): tables, inline styles, ≤ 600 px, readable without images ----
const FONT_STACK='Arial, Helvetica, sans-serif';
const httpsUrl=s=>{const t=clean(s);if(!t)return '';return /^https?:\/\//i.test(t)?t.replace(/^http:/i,'https:'):'https://'+t.replace(/^\/+/,'')};
const hostOf=s=>{try{return new URL(httpsUrl(s)).hostname.toLowerCase().replace(/^www\./,'')}catch(e){return ''}};
const telHref=s=>{const t=clean(s).replace(/[^\d+]/g,'');return t?'tel:'+(t.startsWith('+')?t:/^(0|3)/.test(t)?'+39'+t:t):''};
// The logo address used in the signature: the hosted one only if it is https and on the client's own site.
function logoSource(m,png){const u=clean(m.logoUrl);if(u&&/^https:\/\//i.test(u)&&hostOf(m.company.sito)&&hostOf(u)===hostOf(m.company.sito))return {src:u,hosted:true,w:png&&png.w||480,h:png&&png.h||160};
 if(png&&png.dataUrl)return {src:png.dataUrl,hosted:false,w:png.w,h:png.h};return null}
function signatureColours(m){const P=PS(),pal=m.brand.palette,W='#FFFFFF';
 return {head:P.ink(W,pal,pal.primary,pal.dark),txt:P.ink(W,pal,pal.dark),soft:P.ink(W,pal,pal.secondary,pal.dark),rule:pal.accent,band:pal.primary,on:P.ink(pal.primary,pal,pal.light,'#FFFFFF',pal.dark)}}
// opts.logo: {src (data URI or the client's https address), w, h} or null (text only).
function signatureHtml(m,person,{logo=null}={}){const c=m.company,p=person||{},v=direction(m.direction).id,col=signatureColours(m),brandName=clean(m.brand.name||c.ragione);
 const who=clean(p.nome)||brandName,role=[clean(p.ruolo),clean(p.nome)?brandName:''].filter(Boolean).join(' · ');
 const phone=clean(p.telefono||c.telefono),mail=clean(p.email||c.email),url=site(c.sito),legal=legalLine(c);
 const st=(o)=>Object.entries(o).map(([k,x])=>k+':'+x).join(';');
 const line=(html,size,color,extra={})=>'<tr><td style="'+st({padding:'0','font-family':FONT_STACK,'font-size':size+'px','line-height':Math.round(size*1.4)+'px',color,...extra})+'">'+html+'</td></tr>';
 const a=(href,text,color)=>'<a href="'+esc(href)+'" style="'+st({color,'text-decoration':'none'})+'">'+esc(text)+'</a>';
 const lw=logo?Math.min(v==='moderno'?96:120,logo.w):0,lh=logo?Math.round(lw*logo.h/logo.w):0;
 const img=logo?'<img src="'+esc(logo.src)+'" width="'+lw+'" height="'+lh+'" alt="'+esc(brandName)+'" style="'+st({display:'block',border:'0',outline:'none','text-decoration':'none',width:lw+'px',height:lh+'px'})+'">':'';
 const details=[phone?line(a(telHref(phone),phone,col.txt),13,col.txt):'',mail?line(a('mailto:'+mail,mail,col.txt),13,col.txt):'',url?line(a(httpsUrl(c.sito),url,col.head),13,col.head,{'font-weight':'bold'}):''].join('');
 const legalRow=legal?line(esc(legal),11,col.soft,{'padding-top':'8px'}):'';
 const table=(rows,extra={})=>'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="'+st({'border-collapse':'collapse',...extra})+'">'+rows+'</table>';
 let body;
 if(v==='audace'){
  const head='<tr><td bgcolor="'+col.band+'" style="'+st({padding:'10px 14px','background-color':col.band})+'">'+table(line('<strong>'+esc(who)+'</strong>',16,col.on)+(role?line(esc(role),12,col.on):''))+'</td></tr>';
  const rest='<tr><td style="'+st({padding:'10px 14px 0 14px'})+'">'+table(details+legalRow)+'</td></tr>'+(img?'<tr><td style="'+st({padding:'12px 14px 0 14px'})+'">'+img+'</td></tr>':'');
  body=table(head+rest,{width:'100%','max-width':SIGNATURE_W+'px'})}
 else if(v==='moderno'){
  const rows=line('<strong>'+esc(who)+'</strong>',15,col.txt)+(role?line(esc(role),12,col.soft):'')+'<tr><td style="'+st({padding:'8px 0 0 0'})+'"><div style="'+st({width:'32px',height:'2px','background-color':col.rule,'line-height':'2px','font-size':'2px'})+'">&nbsp;</div></td></tr>'+
   '<tr><td style="'+st({padding:'8px 0 0 0'})+'">'+table(details+legalRow)+'</td></tr>'+(img?'<tr><td style="'+st({padding:'12px 0 0 0'})+'">'+img+'</td></tr>':'');
  body=table(rows,{width:'100%','max-width':SIGNATURE_W+'px'})}
 else{
  const textCell='<td valign="top" style="'+st({'vertical-align':'top',padding:img?'0 0 0 16px':'0 0 0 14px','border-left':'2px solid '+col.rule})+'">'+table(line('<strong>'+esc(who)+'</strong>',15,col.head)+(role?line(esc(role),12,col.soft):'')+'<tr><td style="padding:8px 0 0 0">'+table(details)+'</td></tr>'+legalRow)+'</td>';
  const logoCell=img?'<td valign="top" width="'+(lw+16)+'" style="'+st({'vertical-align':'top',width:(lw+16)+'px',padding:'2px 16px 0 0'})+'">'+img+'</td>':'';
  body=table('<tr>'+logoCell+textCell+'</tr>',{width:'100%','max-width':SIGNATURE_W+'px'})}
 return '<!-- firma email RADIX: copia da qui -->'+body+'<!-- fine firma -->'}
function signaturePage(fragment,title){return '<!doctype html>\n<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title||'Firma email')+'</title></head><body style="margin:0;padding:24px;background-color:#ffffff;">\n'+fragment+'\n</body></html>\n'}
function signatureText(m,person){const c=m.company,p=person||{},brandName=clean(m.brand.name||c.ragione);
 return ['-- ',clean(p.nome)||brandName,[clean(p.ruolo),clean(p.nome)?brandName:''].filter(Boolean).join(' · '),clean(p.telefono||c.telefono),clean(p.email||c.email),site(c.sito),legalLine(c)].filter(x=>clean(x)||x==='-- ').join('\n')+'\n'}
// The signature rules: ≤ 600 px, tables and inline styles only, no script, no external image or link except the
// client's own site (mailto:, tel: and a PNG data URI are fine), readable without images (names in text, alt on images).
function signatureProblems(html,m){const out=[],s=String(html||''),host=hostOf(m&&m.company&&m.company.sito),names=[clean(m&&m.brand&&m.brand.name),clean(m&&m.company&&m.company.ragione)].filter(Boolean);
 if(!/<table\b/i.test(s))out.push('La firma non usa tabelle.');
 if(/<style\b|<script\b|<link\b|<iframe\b|<form\b|\bclass="|\bon\w+="/i.test(s))out.push('Ci sono stili esterni, script, classi o eventi: servono solo stili in linea.');
 for(const mm of s.matchAll(/\bwidth(?:="(\d+)|:\s*(\d+)px)/gi)){const w=+(mm[1]||mm[2]);if(w>SIGNATURE_MAX)out.push('Larghezza '+w+' px: il massimo è '+SIGNATURE_MAX+' px.')}
 for(const mm of s.matchAll(/\b(src|href)="([^"]*)"/gi)){const [,k,raw]=mm,u=raw.replace(/&amp;/g,'&');
  if(/^mailto:[^@\s]+@[^@\s]+$/i.test(u)&&k==='href')continue;if(/^tel:\+?\d{5,}$/.test(u)&&k==='href')continue;if(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(u)&&k==='src')continue;
  let h='';try{h=/^https:\/\//i.test(u)?new URL(u).hostname.toLowerCase().replace(/^www\./,''):''}catch(e){}
  if(h&&host&&h===host)continue;out.push('Indirizzo esterno non ammesso nella firma: '+u.slice(0,80)+'.')}
 if(/url\(/i.test(s))out.push('Immagini di sfondo non ammesse.');
 for(const mm of s.matchAll(/<img\b[^>]*>/gi))if(!/\balt="[^"]+"/.test(mm[0]))out.push('Un’immagine non ha il testo alternativo.');
 const text=s.replace(/<img\b[^>]*>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ');
 if(names.length&&!names.some(n=>text.includes(esc(n))))out.push('Senza immagini la firma non mostra il nome dell’azienda.');
 return [...new Set(out)]}

// ---- checks (AA contrast with the WCAG formula, palette colours, sizes, safe areas) ----
const isLarge=(pt,bold)=>pt>=18||(bold&&pt>=14);
// Text over the last rectangle drawn under its middle (else white paper): [{label, fg, bg, ratio, need}].
function contrastIssues(items,{paper='#FFFFFF',toPt=x=>x,box}={}){const P=PS(),out=[],rects=[];
 for(const it of items){if(it.t==='rect'){rects.push(it);continue}if(it.t!=='text')continue;const bb=box(it),cx=(bb.x0+bb.x1)/2,cy=(bb.y0+bb.y1)/2;
  let bg=paper;for(let i=rects.length-1;i>=0;i--){const r=rects[i];if(cx>=r.x&&cx<=r.x+r.w&&cy>=r.y&&cy<=r.y+r.h){bg=r.fill;break}}
  const ratio=P.contrast(it.fill,bg),need=isLarge(toPt(it.size),it.bold)?3:4.5;if(ratio<need)out.push({label:it.label,fg:up(it.fill),bg:up(bg),ratio,need})}
 return out}
const docBox=it=>{const P=PS(),w=P.ptToMm(P.textWidth(it.s,it.size,it.bold));return {x0:it.x,x1:it.x+w,y0:it.y-P.ptToMm(it.size*ASC),y1:it.y+P.ptToMm(it.size*DESC)}};
function allowedColours(brand){return new Set(Object.values(brand.palette).map(up).concat(['#FFFFFF','#000000']))}
function offPalette(items,brand){const ok=allowedColours(brand),bad=new Set();for(const it of items){for(const k of ['fill','stroke'])if(it[k]&&!ok.has(up(it[k])))bad.add(up(it[k]))}return [...bad]}
const sigColours=html=>[...new Set([...String(html).matchAll(/(?:color|background-color|border-left):\s*(?:2px solid )?(#[0-9A-Fa-f]{6})|bgcolor="(#[0-9A-Fa-f]{6})"/g)].map(x=>up(x[1]||x[2])))];
// Everything built for the checks and the previews (no binary yet).
function build(m){const docs=printDocs(m),covers=has(m,'social')?COVERS.map(s=>coverLayout(s,m)):[],firstPerson=m.people[0]||null;
 const signature=has(m,'firma')?signatureHtml(m,firstPerson,{logo:null}):'';return {docs,covers,signature}}
// The checks before the export: [{id, label, state:'ok'|'warn'|'fail', detail, issues:[...]}].
function checksOf(m,built){const P=PS(),b=built||build(m),out=[],add=(id,label,state,detail,issues=[])=>out.push({id,label,state,detail,issues});
 const docs=b.docs.map(x=>x.doc),items=docs.flatMap(d=>d.pages.flatMap(p=>p.items)),c=m.company;
 const miss=missing(c);
 add('dati','Dati aziendali',miss.length?'warn':c.piva&&!pivaValid(c.piva)?'warn':'ok',miss.length?'Mancano: '+miss.map(k=>LABEL[k].toLowerCase()).join(', ')+'. Restano vuoti nei file: RADIX non li inventa.':c.piva&&!pivaValid(c.piva)?'La partita IVA '+c.piva+' non supera il controllo della cifra finale: verificala.':'Ragione sociale, P. IVA, indirizzo, telefono, email e sito ci sono.',miss.map(k=>LABEL[k]));
 if(has(m,'carta')){const letter=b.docs.find(x=>x.id==='carta').doc,txt=letter.pages[0].items.filter(i=>i.t==='text').map(i=>i.s).join(' '),ok=!!c.piva&&txt.includes('P. IVA '+c.piva);
  add('piva','P. IVA sulla carta intestata',ok?'ok':'warn',ok?'La partita IVA è nel piè di pagina della carta intestata.':'La carta intestata non ha la partita IVA: aggiungila nei dati aziendali.')}
 if(docs.length){const bp=docs.flatMap(d=>P.bleedProblems(d));add('bleed','Abbondanza '+P.BLEED+' mm e segni di taglio',bp.length?'fail':'ok',bp.length?'Fondi che toccano il taglio senza abbondanza.':'Fondi a '+P.BLEED+' mm oltre il taglio, segni di taglio (e di piega sulla cartellina) fuori dall’abbondanza.',bp)}
 const safe=docs.flatMap(d=>d.warnings.filter(w=>w.kind==='safe'||w.kind==='overflow').map(w=>d.title.split(' · ')[0]+' · '+w.text));
 if(has(m,'busta')){const env=b.docs.find(x=>x.id==='busta').doc,z=ENVELOPE.address;env.pages[0].items.forEach(it=>{const bb=it.t==='text'?docBox(it):it.t==='logo'?{x0:it.x,x1:it.x+it.w,y0:it.y,y1:it.y+it.h}:it.t==='rect'&&it.x>=0?{x0:it.x,x1:it.x+it.w,y0:it.y,y1:it.y+it.h}:null;
  if(bb&&bb.x1>z.x&&bb.x0<z.x+z.w&&bb.y1>z.y&&bb.y0<z.y+z.h)safe.push('Busta: «'+(it.label||'Forma')+'» entra nella zona dell’indirizzo del destinatario.')})}
 const cov=b.covers.flatMap(coverProblems).map(x=>x.text);
 add('safe','Aree sicure',safe.length||cov.length?'fail':'ok',safe.length||cov.length?'Qualcosa rischia di essere tagliato o coperto.':'Testi e logo ad almeno '+P.SAFE+' mm dal taglio e dalle pieghe, zona del destinatario libera sulla busta, copertine dentro l’area visibile su ogni dispositivo.',safe.concat(cov));
 const small=items.filter(i=>i.t==='text'&&i.size<MIN_PT-1e-9).map(i=>'«'+i.label+'» a '+String(Math.round(i.size*10)/10).replace('.',',')+' pt');
 if(docs.length)add('size','Testo di almeno '+MIN_PT+' pt',small.length?'fail':'ok',small.length?'Testi troppo piccoli: accorciali.':'Il testo più piccolo è di '+String(Math.round(Math.min(...items.filter(i=>i.t==='text').map(i=>i.size),99)*10)/10).replace('.',',')+' pt.',[...new Set(small)]);
 const gw=docs.flatMap(d=>d.warnings.filter(w=>w.kind==='glyph').map(w=>w.text)),f=m.brand.fonts,kit=[...new Set([f.heading,f.body].filter(Boolean))];
 add('fonts','Font',gw.length?'fail':'ok',(docs.length?'PDF: testi convertiti in tracciati con un carattere tipo Helvetica, nessun font da incorporare'+(kit.length?' (i font del kit, '+kit.join(' e ')+', non si incorporano da qui)':'')+'. ':'')+
  (has(m,'firma')?'Firma email: '+FONT_STACK+', i font standard delle caselle. ':'')+(has(m,'social')?'Copertine: Helvetica o Arial. ':'')+(has(m,'office')?'Modelli Office: '+(kit.length?kit.join(' e ')+' (se non sono installati, Word e PowerPoint li sostituiscono: installali da Google Fonts)':'Arial')+'.':''),[...new Set(gw)]);
 const off=[...new Set(offPalette(items,m.brand).concat(offPalette(b.covers.flatMap(L=>L.items),m.brand)).concat(b.signature?sigColours(b.signature).filter(h=>!allowedColours(m.brand).has(h)):[]))];
 add('colours','Colori della palette',off.length?'fail':'ok',off.length?'Colori fuori dalla palette: '+off.join(', ')+'.':'Solo i colori del kit'+(m.brand.direction?' «'+m.brand.direction+'»':'')+', più bianco e nero.',off);
 const ci=[...docs.flatMap(d=>d.pages.flatMap(p=>contrastIssues(p.items,{box:docBox}).map(x=>({...x,where:d.title.split(' · ')[0]})))),
  ...b.covers.flatMap(L=>contrastIssues(L.items,{paper:L.bg,toPt:px=>px*.75,box:boxOf}).map(x=>({...x,where:L.spec.title})))];
 if(b.signature){const col=signatureColours(m),PSx=PS();[[col.head,'#FFFFFF','Nome',15,true],[col.txt,'#FFFFFF','Contatti',13,false],[col.soft,'#FFFFFF','Dati societari',11,false]].concat(m.direction==='audace'?[[col.on,col.band,'Nome sulla fascia',16,true]]:[])
  .forEach(([fg,bg,label,px,bold])=>{const ratio=PSx.contrast(fg,bg),need=isLarge(px*.75,bold)?3:4.5;if(ratio<need)ci.push({label,fg:up(fg),bg:up(bg),ratio,need,where:'Firma email'})})}
 add('contrast','Contrasto AA',ci.length?'fail':'ok',ci.length?'Testi poco leggibili sul loro fondo.':'Ogni testo ha almeno 4,5:1 sul suo fondo (3:1 per i titoli grandi).',ci.map(x=>x.where+': «'+x.label+'» '+x.fg+' su '+x.bg+' '+String(x.ratio).replace('.',',')+':1 (serve '+String(x.need).replace('.',',')+':1)'));
 if(docs.length){const ink=docs.map(d=>P.inkReport(d)),max=Math.max(...ink.map(r=>r.max));add('ink','Inchiostro totale ≤ '+P.INK_LIMIT+'%',ink.every(r=>r.ok)?'ok':'fail','Massimo '+Math.round(max)+'%; CMYK FOGRA39, nessuna trasparenza.')}
 if(b.signature){const sp=signatureProblems(b.signature,m);add('firma','Firma email',sp.length?'fail':'ok',sp.length?'La firma non rispetta le regole delle caselle email.':'Tabelle e stili in linea, '+SIGNATURE_W+' px (massimo '+SIGNATURE_MAX+'), leggibile senza immagini, nessun indirizzo esterno tranne il sito.',sp)}
 add('logo','Logo',m.brand.logo?'ok':'warn',m.brand.logo?'Logo vettoriale del kit: nei PDF resta vettoriale, le sue scritte diventano tracciati.':'Il kit non ha un logo: al suo posto c’è il nome come logotipo.');
 return out}
const blocking=checks=>checks.filter(c=>c.state==='fail');

// ---- Office templates ----
const W_NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main',R_NS='http://schemas.openxmlformats.org/officeDocument/2006/relationships',PKG='http://schemas.openxmlformats.org/package/2006/relationships';
const XH='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const xt=s=>String(s==null?'':s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const xa=s=>xt(s).replace(/"/g,'&quot;');
const hx=h=>String(h||'').replace(/^#/,'').toUpperCase();
const FAMILY=/^[A-Za-z0-9][A-Za-z0-9 ]{1,39}$/;
const fontOr=(f,d)=>FAMILY.test(clean(f))?clean(f):d;
const rels=list=>XH+'<Relationships xmlns="'+PKG+'">'+list.map(([id,type,target])=>'<Relationship Id="'+id+'" Type="'+(/^https?:/.test(type)?type:R_NS+'/'+type)+'" Target="'+xa(target)+'"/>').join('')+'</Relationships>';
// A minimal .docx letterhead: header (logo PNG or the name, contacts, a rule in the accent), footer (company data),
// A4 with the margins of a business letter, the kit's fonts and colours as defaults, placeholders for the letter.
// logo: {data:Uint8Array (PNG), w, h} or null.
function docxLetterhead(m,{logo=null,date=new Date()}={}){const c=m.company,pal=m.brand.palette,P=PS(),W='#FFFFFF',col={head:P.ink(W,pal,pal.primary,pal.dark),txt:P.ink(W,pal,pal.dark),soft:P.ink(W,pal,pal.secondary,pal.dark)};
 const body=fontOr(m.brand.fonts.body,'Arial'),heading=fontOr(m.brand.fonts.heading,body),name=clean(m.brand.name||c.ragione)||'Azienda',when=date.toISOString().replace(/\.\d+Z$/,'Z');
 const run=(t,o={})=>'<w:r>'+(o.b||o.color||o.sz?'<w:rPr>'+(o.font?'<w:rFonts w:ascii="'+xa(o.font)+'" w:hAnsi="'+xa(o.font)+'" w:cs="'+xa(o.font)+'"/>':'')+(o.b?'<w:b/>':'')+(o.color?'<w:color w:val="'+hx(o.color)+'"/>':'')+(o.sz?'<w:sz w:val="'+o.sz+'"/><w:szCs w:val="'+o.sz+'"/>':'')+'</w:rPr>':'')+'<w:t xml:space="preserve">'+xt(t)+'</w:t></w:r>';
 const para=(runs,o={})=>'<w:p>'+(o.jc||o.after!=null?'<w:pPr>'+(o.after!=null?'<w:spacing w:after="'+o.after+'"/>':'')+(o.jc?'<w:jc w:val="'+o.jc+'"/>':'')+'</w:pPr>':'')+runs+'</w:p>';
 const p1=m.people[0]||{};
 const doc=XH+'<w:document xmlns:w="'+W_NS+'" xmlns:r="'+R_NS+'"><w:body>'+
  para(run('[Luogo], [data]'),{jc:'right',after:480})+para(run('Spett.le'))+para(run('[Destinatario]'))+para(run('[Indirizzo del destinatario]'),{after:480})+
  para(run('Oggetto: ',{b:true,color:col.head})+run('[oggetto della lettera]',{b:true}),{after:240})+para(run('[Testo della lettera]'),{after:480})+
  para(run('Cordiali saluti,'),{after:480})+para(run(clean(p1.nome)||'[Nome e cognome]',{b:true}))+para(run(clean(p1.ruolo)||'[Ruolo]',{color:col.soft}))+
  '<w:sectPr><w:headerReference w:type="default" r:id="rId2"/><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2552" w:right="1418" w:bottom="1985" w:left="1418" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>';
 const styles=XH+'<w:styles xmlns:w="'+W_NS+'"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="'+xa(body)+'" w:hAnsi="'+xa(body)+'" w:eastAsia="'+xa(body)+'" w:cs="'+xa(body)+'"/><w:color w:val="'+hx(col.txt)+'"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="it-IT"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'+
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'+
  '<w:style w:type="paragraph" w:styleId="Titolo1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="'+xa(heading)+'" w:hAnsi="'+xa(heading)+'" w:cs="'+xa(heading)+'"/><w:b/><w:color w:val="'+hx(col.head)+'"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style></w:styles>';
 const lh=14*36000,lw=logo?Math.min(Math.round(lh*logo.w/logo.h),60*36000):0;
 const drawing=logo?'<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+lw+'" cy="'+(logo?Math.round(lw*logo.h/logo.w):0)+'"/><wp:docPr id="1" name="Logo" descr="'+xa('Logo '+name)+'"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'+
  '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'+
  '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+lw+'" cy="'+Math.round(lw*logo.h/logo.w)+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>':run(name,{b:true,color:col.head,sz:32,font:heading});
 const contacts=[c.telefono,c.email,site(c.sito)].map(clean).filter(Boolean).join('  ·  ');
 const header=XH+'<w:hdr xmlns:w="'+W_NS+'" xmlns:r="'+R_NS+'" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'+
  '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="6" w:color="'+hx(pal.accent)+'"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="9070"/></w:tabs></w:pPr>'+drawing+'<w:r><w:tab/></w:r>'+run(contacts,{color:col.soft,sz:16})+'</w:p></w:hdr>';
 const legal=legalLine(c),addr=clean(c.indirizzo);
 const footer=XH+'<w:ftr xmlns:w="'+W_NS+'" xmlns:r="'+R_NS+'">'+para(run([name,addr].filter(Boolean).join('  ·  '),{b:true,color:col.head,sz:16}),{jc:'center'})+(legal?para(run(legal,{color:col.soft,sz:14}),{jc:'center'}):'')+'</w:ftr>';
 const ct=XH+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'+
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'+
  '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'+
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
 const files=[{name:'[Content_Types].xml',data:ct},
  {name:'_rels/.rels',data:rels([['rId1','officeDocument','word/document.xml'],['rId2',PKG+'/metadata/core-properties','docProps/core.xml'],['rId3','extended-properties','docProps/app.xml']])},
  {name:'docProps/core.xml',data:XH+'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>'+xt('Carta intestata · '+name)+'</dc:title><dc:creator>RADIX</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">'+when+'</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">'+when+'</dcterms:modified></cp:coreProperties>'},
  {name:'docProps/app.xml',data:XH+'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>RADIX Coordinato</Application></Properties>'},
  {name:'word/document.xml',data:doc},{name:'word/styles.xml',data:styles},{name:'word/header1.xml',data:header},{name:'word/footer1.xml',data:footer},
  {name:'word/_rels/document.xml.rels',data:rels([['rId1','styles','styles.xml'],['rId2','header','header1.xml'],['rId3','footer','footer1.xml']])}];
 if(logo){files.push({name:'word/_rels/header1.xml.rels',data:rels([['rId1','image','media/logo.png']])},{name:'word/media/logo.png',data:logo.data})}
 return ZIP().zip(files,{date})}
// Re-reads a .docx: the parts, XML well-formed, every relationship target present, the content types.
function docxInspect(bytes){const problems=[];let files;try{files=ZIP().unzip(bytes)}catch(e){return {parts:[],problems:['Archivio non leggibile: '+e.message],texts:[]}}
 const map=new Map(files.map(f=>[f.name,f.data])),dec=b=>new TextDecoder().decode(b),parts=files.map(f=>f.name);
 if(parts[0]!=='[Content_Types].xml')problems.push('[Content_Types].xml deve essere il primo file.');
 for(const need of ['[Content_Types].xml','_rels/.rels','word/document.xml','word/styles.xml','word/header1.xml','word/footer1.xml','word/_rels/document.xml.rels'])if(!map.has(need))problems.push('Manca '+need+'.');
 for(const [n,d] of map)if(/\.(xml|rels)$/.test(n))problems.push(...PX().xmlProblems(dec(d),n));
 for(const [n,d] of map){if(!/\.rels$/.test(n))continue;const base=n==='_rels/.rels'?'':n.replace(/_rels\/([^/]+)\.rels$/,'');const dir=base.includes('/')?base.slice(0,base.lastIndexOf('/')+1):'';
  for(const t of dec(d).matchAll(/Target="([^"]+)"/g)){const target=(dir+t[1]).replace(/^\//,'');if(!map.has(target))problems.push(n+': manca '+target+'.')}}
 const ct=map.has('[Content_Types].xml')?dec(map.get('[Content_Types].xml')):'';for(const n of parts)if(/^word\/(document|styles|header1|footer1)\.xml$/.test(n)&&!ct.includes('PartName="/'+n+'"'))problems.push('Tipo mancante per '+n+'.');
 const texts=[...(map.has('word/document.xml')?dec(map.get('word/document.xml')):'').matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x=>x[1]);
 const hdr=map.has('word/header1.xml')?dec(map.get('word/header1.xml')):'',ftr=map.has('word/footer1.xml')?dec(map.get('word/footer1.xml')):'';
 return {parts,problems:[...new Set(problems)],texts,header:hdr,footer:ftr,logo:map.has('word/media/logo.png')}}
// The PowerPoint template: the kit's theme (colours, fonts) and three slides (cover, content, closing) with placeholders.
function pptxTemplate(m,{logo=null,date=new Date()}={}){const P=PS(),b=m.brand,pal=b.palette,c=m.company,name=clean(b.name||c.ragione)||'Azienda',on=P.ink(pal.primary,pal,pal.light,'#FFFFFF',pal.dark),txt=P.ink(pal.light,pal,pal.dark),head=P.ink(pal.light,pal,pal.primary,pal.dark),soft=P.ink(pal.light,pal,pal.secondary,pal.dark);
 const logoShape=(x,y,w,h)=>{if(logo&&logo.data&&logo.w>0){const k=Math.min(w/logo.w,h/logo.h);return {t:'image',media:'logo',name:'Logo',x,y:y+(h-logo.h*k)/2,w:logo.w*k,h:logo.h*k}}
  return {t:'text',name:'Logo (nome)',x,y,w,h,anchor:'ctr',paras:[{text:name,size:20,bold:true,color:head,font:'major'}]}};
 const contacts=[site(c.sito),c.email,c.telefono].map(clean).filter(Boolean);
 const slides=[
  {layout:'title',bg:pal.light,shapes:[{t:'rect',x:0,y:0,w:10,h:142.875,fill:pal.primary},{t:'rect',x:10,y:0,w:1.6,h:142.875,fill:pal.accent},logoShape(24,14,60,18),
   {t:'text',ph:'ctrTitle',name:'Titolo',x:24,y:52,w:206,h:30,anchor:'b',paras:[{text:'[Titolo della presentazione]',size:36,bold:true,color:head,font:'major'}]},
   {t:'text',ph:'subTitle',idx:1,name:'Sottotitolo',x:24,y:86,w:206,h:18,paras:[{text:'[Sottotitolo · data]',size:16,color:soft,font:'minor'}]}],notes:'Copertina: sostituisci i testi tra parentesi quadre.'},
  {layout:'content',bg:'#FFFFFF',shapes:[{t:'rect',x:0,y:0,w:254,h:4,fill:pal.primary},{t:'text',ph:'title',name:'Titolo',x:18,y:12,w:218,h:22,anchor:'b',paras:[{text:'[Titolo della slide]',size:28,bold:true,color:P.ink('#FFFFFF',pal,pal.primary,pal.dark),font:'major'}]},
   {t:'text',ph:'body',idx:1,name:'Testo',x:18,y:40,w:218,h:84,paras:['[Primo punto]','[Secondo punto]','[Terzo punto]'].map(t=>({text:t,size:18,bullet:true,color:P.ink('#FFFFFF',pal,pal.dark),font:'minor',spcBef:6}))},
   {...logoShape(206,128,36,10)}],notes:'Contenuto: una idea per slide, al massimo 5 punti.'},
  {layout:'closing',bg:pal.primary,shapes:[{t:'rect',x:0,y:136,w:254,h:6.875,fill:pal.accent},{t:'text',ph:'title',name:'Titolo',x:20,y:40,w:214,h:30,anchor:'b',paras:[{text:'Grazie',size:40,bold:true,color:on,font:'major'}]},
   {t:'text',ph:'body',idx:1,name:'Contatti',x:20,y:76,w:214,h:40,paras:(contacts.length?contacts:['[sito · email · telefono]']).map(t=>({text:t,size:16,color:on,font:'minor',spcBef:4}))}],notes:'Chiusura con i contatti del coordinato.'}];
 const theme={name,colors:{dk1:pal.dark,lt1:'#FFFFFF',dk2:pal.primary,lt2:pal.light,accent1:pal.primary,accent2:pal.secondary,accent3:pal.accent,accent4:pal.dark,accent5:pal.secondary,accent6:pal.accent,hlink:pal.primary,folHlink:pal.secondary},fonts:{major:fontOr(b.fonts.heading,'Arial'),minor:fontOr(b.fonts.body,fontOr(b.fonts.heading,'Arial'))}};
 return PX().build({title:'Modello · '+name,author:name,date,theme,slides,media:logo&&logo.data?{logo:{type:'png',data:logo.data,w:logo.w,h:logo.h}}:{}})}

// ---- the files ----
const ROOT='coordinato';
const zipName=m=>'coordinato-'+(slug(m.brand.name||m.company.ragione)||'azienda')+'-'+direction(m.direction).id+'.zip';
function readme(m,checks,files,{date=new Date(),pngLogo=false}={}){const c=m.company,d=direction(m.direction),miss=missing(c),L=[];
 L.push('COORDINATO AZIENDALE · '+clean(m.brand.name||c.ragione),'Layout: '+d.title+' · Kit identità: '+(m.brand.direction||'—'),'Preparato con RADIX il '+date.toISOString().slice(0,10)+' · nessuna chiamata AI','');
 if(miss.length)L.push('DATI MANCANTI (lasciati vuoti: RADIX non li inventa)',...miss.map(k=>'- '+LABEL[k]),'');
 L.push('FILE',...files.map(f=>'- '+f.name+(f.label?': '+f.label:'')),'');
 L.push('STAMPA','- PDF in CMYK FOGRA39 in stile PDF/X-1a, formato + 3 mm di abbondanza per lato, segni di taglio fuori dall’abbondanza, testi in tracciati, logo vettoriale.','- La tipografia fa comunque il suo preflight: alcune chiedono 5 mm di abbondanza o PDF/X-3, chiedi le loro specifiche.',
  '- Busta DL: di solito si stampa su buste già pronte; i fondi a vivo richiedono buste stampate in piano e poi fustellate. La zona a destra in basso resta libera per l’indirizzo.','- Cartellina: due ante da 220 × 310 mm, piega a 220 mm; tasca e fustella le fornisce la tipografia.','');
 if(has(m,'firma'))L.push('FIRMA EMAIL','- Apri firma-*.html nel browser, seleziona la firma, copiala e incollala nelle impostazioni della firma (Gmail: Impostazioni › Firma; Outlook: Impostazioni › Posta › Firme; Apple Mail: Preferenze › Firme).',
  '- Il logo è dentro la firma come immagine PNG incorporata (data URI). Gmail e alcune caselle tolgono queste immagini: carica logo-firma.png sul tuo sito e, nello studio, scrivi il suo indirizzo in «Indirizzo del logo sul tuo sito»: la firma lo userà al posto dell’immagine incorporata.',
  '- La firma resta leggibile anche senza immagini: nome, contatti e dati societari sono testo.',...(pngLogo?[]:['- Questa firma è solo testo: il logo PNG non è stato creato.']),'');
 if(has(m,'social'))L.push('COPERTINE SOCIAL',...COVERS.map(s=>'- '+s.title+': '+s.w+' × '+s.h+' px. '+s.note),'- I file .svg sono le stesse copertine, modificabili.','');
 if(has(m,'office'))L.push('MODELLI OFFICE','- carta-intestata.docx: intestazione con logo e contatti, piè di pagina con ragione sociale, P. IVA e indirizzo. Scrivi la lettera al posto dei testi tra parentesi quadre.','- presentazione.pptx: tema con i colori e i font del kit e tre slide (copertina, contenuto, chiusura).','- Se i font del kit non sono installati, Word e PowerPoint usano un font simile: installali da Google Fonts.','- Non c’è un modello .dotx: salva carta-intestata.docx come modello da Word (File › Salva come › Modello) se ti serve.','');
 L.push('CONTROLLI',...checks.map(x=>'- ['+({ok:'ok',warn:'da completare',fail:'da sistemare'}[x.state])+'] '+x.label+': '+x.detail+(x.issues.length?'\n'+x.issues.map(i=>'    · '+i).join('\n'):'')),'');
 return L.join('\n')+'\n'}
// Every file of the coordinato. opts (browser): png(svg,w,h) → Uint8Array; logoPng(svg) → {data,w,h,dataUrl}; prepare(doc,{pdfx}); glyphs(); date.
async function kitFiles(m,opts={}){const P=PS(),date=opts.date||new Date(),out=[],add=(name,data,label)=>out.push({name:ROOT+'/'+name,data,label});
 const built=build(m),checks=checksOf(m,built);const logo=m.brand.logo&&opts.logoPng?await opts.logoPng(m.brand.logo):null;
 if(built.docs.length&&opts.glyphs)await opts.glyphs();
 for(const x of built.docs){if(opts.prepare)await opts.prepare(x.doc,{pdfx:true});const bytes=P.pdf(x.doc,{mode:'print',pdfx:true,date,title:x.label+' · tipografia',producer:'RADIX Coordinato'}),probs=P.checkPdf(bytes);if(probs.length)throw Error(x.label+': '+probs.join(' '));add('stampa/'+x.name,bytes,x.label+' (PDF per la tipografia)')}
 if(has(m,'firma')){const src=logoSource(m,logo),ps=m.people.length?m.people:[null];
  ps.forEach((p,i)=>{const base='firma'+(p?'-'+(slug(p.nome)||'persona-'+(i+1)):'');const html=signatureHtml(m,p,{logo:src});add('firma-email/'+base+'.html',signaturePage(html,'Firma email · '+(p?p.nome:m.brand.name)),'Firma email'+(p?' · '+p.nome:'')+' (HTML)');add('firma-email/'+base+'.txt',signatureText(m,p),'Firma email'+(p?' · '+p.nome:'')+' (testo)')});
  if(logo)add('firma-email/logo-firma.png',logo.data,'Logo per la firma (da caricare sul sito)')}
 if(has(m,'social'))for(const L of built.covers){const svg=coverSvg(L);add('social/'+L.spec.id+'-'+L.spec.w+'x'+L.spec.h+'.svg',svg,L.spec.title+' (SVG)');if(opts.png)add('social/'+L.spec.id+'-'+L.spec.w+'x'+L.spec.h+'.png',await opts.png(svg,L.spec.w,L.spec.h),L.spec.title+' (PNG)')}
 if(has(m,'office')){add('modelli-office/carta-intestata.docx',docxLetterhead(m,{logo,date}),'Carta intestata (Word)');add('modelli-office/presentazione.pptx',pptxTemplate(m,{logo,date}),'Modello di presentazione (PowerPoint)')}
 add('LEGGIMI.txt',readme(m,checks,out.map(f=>({name:f.name.slice(ROOT.length+1),label:f.label})),{date,pngLogo:!!logo}),'Istruzioni e controlli');
 return out}
const bundle=(files,{date}={})=>ZIP().zip(files.map(f=>({name:f.name,data:f.data})),{date:date||new Date()});

// ---- saved in the project: the «agents» document, key coordinato ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(doc){const s=doc&&doc.coordinato;return s&&typeof s==='object'&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>x&&typeof x==='object')}:emptyStore()}
function savedRecord(m,{by,at,checks}={}){const when=at||new Date().toISOString();
 return {id:'coordinato-'+when.replace(/\D/g,'').slice(0,14),at:when,by:clean(by).slice(0,80),direction:m.direction,pieces:m.pieces.slice(),company:{...m.company},people:m.people.map(p=>({...p})),logoUrl:m.logoUrl,
  kit:{brand:clean(m.brand.name),direction:clean(m.brand.direction)},checks:(checks||checksOf(m)).map(c=>({id:c.id,state:c.state}))}}
function addRecord(store,rec){const s=readStore({coordinato:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const d=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await d.load())||{},next=addRecord(readStore(cur),rec);
  try{await d.save({...cur,schemaVersion:1,conversations:cur.conversations||{},coordinato:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
const fromRecord=(r,profile,opts)=>modelOf({direction:r.direction,company:r.company,people:r.people,pieces:r.pieces,logoUrl:r.logoUrl},profile,opts);

// ---- the widget (browser) ----
let counter=0;
const doc=()=>root.document;
const E=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
const svgImg=(svg,alt)=>{const i=E('img');i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);i.alt=alt||'';i.decoding='async';return i};
const MIME={pdf:'application/pdf',html:'text/html;charset=utf-8',txt:'text/plain;charset=utf-8',svg:'image/svg+xml',png:'image/png',zip:'application/zip',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
const save=(name,data)=>PS().download(name.split('/').pop(),data,MIME[name.split('.').pop()]||'application/octet-stream');
function svgToPng(svg,w,h){return new Promise((res,rej)=>{const img=new root.Image();img.onload=()=>{try{const c=E('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
 c.toBlob(b=>b?b.arrayBuffer().then(x=>res(new Uint8Array(x)),rej):rej(Error('PNG non creato')),'image/png')}catch(e){rej(e)}};img.onerror=()=>rej(Error('Immagine non leggibile'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)})}
// The kit logo as a PNG 480 px wide (transparent), with its data URI for the signature.
async function logoPng(svg){const vb=PS().viewBox(svg);if(!vb)return null;const w=480,h=Math.max(1,Math.round(w*vb[3]/vb[2]));const data=await svgToPng(svg,w,h);
 let bin='';for(let i=0;i<data.length;i+=32768)bin+=String.fromCharCode.apply(null,data.subarray(i,i+32768));return {data,w,h,dataUrl:'data:image/png;base64,'+root.btoa(bin)}}
// A signature in a plain HTML preview: sandboxed, no script.
function signatureFrame(html,title){const f=E('iframe',undefined,'co-sig-frame');f.setAttribute('sandbox','allow-same-origin');f.title=title||'Anteprima della firma email';f.loading='lazy';
 f.srcdoc=signaturePage(html,title);f.onload=()=>{try{const d=f.contentDocument;if(d&&d.body)f.style.height=Math.min(420,d.body.scrollHeight+8)+'px'}catch(e){}};return f}
// ctx: {project (profileFor summary), profile, projectName, clientName, projectId, workspace, agentsUrl, by, openIdentity(), identityUrl}
function coordinatoStudio(ctx={}){const n=++counter,P=PS(),profile=ctx.profile||{},wrap=E('div',undefined,'tool photo-studio ad-studio coordinato-studio');
 const steps=E('ol',undefined,'ps-steps');['I dati','Scegli il layout','Controlli','Export'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 wrap.append(steps);setStep(1);
 const brand=P.brandOf(profile,ctx.projectName);
 if(!hasKit(profile)){const box=E('div',undefined,'co-empty');box.append(E('h3','Prima serve il Kit identità'),E('p','Il coordinato nasce dal Kit identità del progetto: logo, palette e font. Questo progetto non ne ha ancora uno salvato, e RADIX non inventa colori o logo al suo posto.','ad-idea'));
  const go=ctx.openIdentity?button('Crea il Kit identità','primary'):E('a','Crea il Kit identità','co-link primary');if(ctx.openIdentity)go.onclick=()=>ctx.openIdentity();else go.href=ctx.identityUrl||'/agency/crea.html?open=identita';
  const acts=E('div',undefined,'ps-actions');acts.append(go,E('span','Il Kit identità è una chiamata AI con conferma; il coordinato poi è gratuito.','muted'));box.append(acts);wrap.append(box);return wrap}
 const pre=prefill(profile,{projectName:ctx.projectName,clientName:ctx.clientName,summary:ctx.project});
 const st={company:{...pre.values},people:[{nome:'',ruolo:'',email:'',telefono:''}],pieces:PIECE_IDS.slice(),direction:'',logoUrl:'',files:[],busy:false};
 const model=()=>modelOf({direction:st.direction||'classico',company:st.company,people:st.people,pieces:st.pieces,logoUrl:st.logoUrl},profile,{projectName:ctx.projectName});
 // the kit in use
 const bx=E('div',undefined,'ad-brand co-brand');bx.dataset.source='kit';const sw=E('span',undefined,'ad-swatches');
 ['primary','secondary','accent','dark','light'].forEach(k=>{const i=E('i');i.style.background=brand.palette[k];i.title=k+' '+brand.palette[k];sw.append(i)});
 const bt=E('span',undefined,'ad-brand-text');bt.append(E('strong',brand.name||'Il tuo brand'),E('span','Dal Kit identità'+(brand.direction?' «'+brand.direction+'»':'')+(brand.fonts.heading?' · '+[...new Set([brand.fonts.heading,brand.fonts.body].filter(Boolean))].join(' + '):'')+(brand.logo?'':' · senza logo: uso il nome come logotipo')));
 bx.append(sw,bt);if(brand.logo){const li=svgImg(brand.logo,'Logo del kit');li.className='ad-brand-logo';bx.append(li)}
 const form=E('div',undefined,'ps-form');
 // pieces
 const pfs=E('fieldset',undefined,'ad-wide co-pieces');pfs.append(E('legend','Quali pezzi'));
 PIECES.forEach(p=>{const l=E('label',undefined,'ps-chip ad-tile'),c=E('input');c.type='checkbox';c.value=p.id;c.checked=true;c.name='co-piece-'+n;
  c.onchange=()=>{st.pieces=PIECE_IDS.filter(x=>x===p.id?c.checked:st.pieces.includes(x));changed()};const t=E('span',undefined,'ad-tile-text');t.append(E('strong',p.title),E('small',p.size));l.append(c,t);pfs.append(l)});
 // company data
 const cfs=E('fieldset',undefined,'co-company');cfs.append(E('legend','Dati aziendali per la carta intestata e i biglietti'));const grid=E('div',undefined,'co-fields'),inputs={};
 COMPANY.forEach(([k,label,max,ph])=>{const l=E('label',undefined,'co-field'+(k==='altri'?' co-wide':''));l.dataset.key=k;const s=E('span',label+(REQUIRED.includes(k)?' *':'')),i=E('input');i.type=k==='email'?'email':k==='telefono'?'tel':'text';i.maxLength=max;i.placeholder=ph||'';i.value=st.company[k]||'';i.name='co-'+k;
  i.oninput=()=>{st.company[k]=i.value;changed()};l.append(s,i);if(pre.from[k])l.append(E('small',pre.from[k]==='cliente'?'Dalla scheda del cliente: controlla':'Dal progetto: controlla','co-from'));inputs[k]=i;grid.append(l)});
 cfs.append(grid,E('p','I campi vuoti restano vuoti nei file: RADIX non inventa dati. Te li ricordo prima dell’export.','ad-note co-hint'));
 // people
 const pplFs=E('fieldset',undefined,'co-people');pplFs.append(E('legend','Persone (un biglietto e una firma per ognuna)'));const rows=E('div',undefined,'co-people-rows'),addP=button('Aggiungi una persona','co-add');
 function renderPeople(){rows.replaceChildren(...st.people.map((p,i)=>{const r=E('div',undefined,'co-person');PERSON.forEach(([k,label,max])=>{const l=E('label',undefined,'co-field'),x=E('input');x.type=k==='email'?'email':k==='telefono'?'tel':'text';x.maxLength=max;x.value=p[k]||'';x.name='co-p'+i+'-'+k;x.oninput=()=>{p[k]=x.value;changed()};l.append(E('span',label),x);r.append(l)});
   if(st.people.length>1){const del=button('Togli','co-del');del.setAttribute('aria-label','Togli la persona '+(i+1));del.onclick=()=>{st.people.splice(i,1);renderPeople();changed()};r.append(del)}return r}));addP.disabled=st.people.length>=MAX_PEOPLE}
 addP.onclick=()=>{if(st.people.length<MAX_PEOPLE){st.people.push({nome:'',ruolo:'',email:'',telefono:''});renderPeople();const last=rows.lastElementChild&&rows.lastElementChild.querySelector('input');if(last)last.focus()}};
 renderPeople();pplFs.append(rows,addP,E('p','Senza persone preparo un biglietto e una firma solo aziendali.','ad-note'));
 // the hosted logo for the signature
 const lul=E('label',undefined,'co-field co-wide'),lui=E('input');lui.type='url';lui.placeholder='https://www.tuosito.it/logo-firma.png';lui.maxLength=300;lui.name='co-logo-url';lui.oninput=()=>{st.logoUrl=lui.value;changed()};
 lul.append(E('span','Indirizzo del logo sul tuo sito (facoltativo, per la firma email)'),lui,E('small','Gmail toglie le immagini incorporate: carica logo-firma.png (è nello zip) sul tuo sito e scrivi qui il suo indirizzo. Solo indirizzi https del tuo sito.','co-from'));
 const go=button('Prepara 3 layout','primary'),bar=E('div',undefined,'ps-actions');bar.append(go,E('span','Nessuna chiamata AI: layout, controlli e file si creano qui, senza costi.','muted'));
 form.append(bx,pfs,cfs,pplFs,lul,bar);
 const status=E('p','','tool-status');status.setAttribute('role','status');
 const saved=E('div',undefined,'ad-saved co-saved');saved.hidden=true;
 const dirs=E('div',undefined,'ad-dirs co-dirs'),result=E('div',undefined,'ad-result co-result'),kit=E('div',undefined,'co-kit');dirs.hidden=result.hidden=kit.hidden=true;
 wrap.append(form,saved,status,dirs,result,kit);
 let timer=0;function changed(){if(dirs.hidden)return;clearTimeout(timer);timer=setTimeout(()=>{renderDirs();if(st.direction)renderResult()},300)}
 async function loadSaved(){if(!ctx.workspace||!ctx.projectId)return;try{const s=readStore(await ctx.workspace.bind(ctx.projectId,'agents').load());if(!s.items.length)return;
  saved.replaceChildren(E('h4','Coordinati salvati nel progetto'));const row=E('div',undefined,'ad-saved-row');
  s.items.slice(-4).reverse().forEach(r=>{const b=button(direction(r.direction).title+' · '+String(r.at||'').slice(0,10),'ad-saved-item');b.onclick=()=>{st.company={...st.company,...(r.company||{})};st.people=(r.people&&r.people.length?r.people:[{nome:'',ruolo:'',email:'',telefono:''}]).map(p=>({...p}));
   st.pieces=Array.isArray(r.pieces)&&r.pieces.length?r.pieces.slice():PIECE_IDS.slice();st.logoUrl=r.logoUrl||'';st.direction=direction(r.direction).id;for(const k of Object.keys(inputs))inputs[k].value=st.company[k]||'';lui.value=st.logoUrl;
   pfs.querySelectorAll('input').forEach(x=>x.checked=st.pieces.includes(x.value));renderPeople();renderDirs();renderResult();status.textContent='Riaperto il coordinato salvato: controlla i dati e scarica di nuovo i file.'};row.append(b)});
  saved.append(row);saved.hidden=false}catch(e){}}
 loadSaved();
 go.onclick=()=>{if(!st.pieces.length){status.textContent='Scegli almeno un pezzo.';return}renderDirs();status.textContent='Ecco i 3 layout fatti con il tuo kit: scegli quello da usare.';dirs.scrollIntoView&&dirs.scrollIntoView({behavior:'smooth',block:'start'})};
 function preview(m){const box=E('div',undefined,'co-preview');
  const cd=cardDoc(m,m.people[0]||null);const cards=E('div',undefined,'co-cards');cd.pages.forEach((p,i)=>{const f=E('figure',undefined,'co-fig co-card-fig');f.append(svgImg(P.previewSvg(cd,i,{guides:false}),'Biglietto · '+p.label),E('figcaption',p.label));cards.append(f)});
  const ld=letterDoc(m),lf=E('figure',undefined,'co-fig co-letter-fig');lf.append(svgImg(P.previewSvg(ld,0,{guides:false}),'Carta intestata'),E('figcaption','Carta intestata'));
  const sf=E('figure',undefined,'co-fig co-sig-fig');sf.append(signatureFrame(signatureHtml(m,m.people[0]||null,{logo:brand.logo?{src:P.svgUrl(brand.logo),w:480,h:Math.round(480*(P.viewBox(brand.logo)||[0,0,3,1])[3]/(P.viewBox(brand.logo)||[0,0,3,1])[2])}:null}),'Firma email · '+direction(m.direction).title),E('figcaption','Firma email'));
  box.append(cards,lf,sf);return box}
 function renderDirs(){setStep(st.direction?3:2);dirs.hidden=false;
  dirs.replaceChildren(...DIRECTIONS.map(d=>{const m=modelOf({direction:d.id,company:st.company,people:st.people,pieces:st.pieces,logoUrl:st.logoUrl},profile,{projectName:ctx.projectName});
   const card=E('article',undefined,'ad-dir co-dir');card.dataset.chosen=String(st.direction===d.id);card.dataset.direction=d.id;
   const head=E('div',undefined,'ad-dir-head');head.append(E('span','Layout','ad-angle'),E('h3',d.title),E('p',d.line,'ad-idea'));
   const pick=button(st.direction===d.id?'Layout scelto':'Scegli questo layout','primary');pick.onclick=()=>{st.direction=d.id;renderDirs();renderResult();result.scrollIntoView&&result.scrollIntoView({behavior:'smooth',block:'start'})};
   card.append(head,preview(m),pick);return card}))}
 function checkRow(c){const row=E('div',undefined,'co-check');row.dataset.state=c.state;row.dataset.check=c.id;
  row.append(E('span',{ok:'OK',warn:'Da completare',fail:'Da sistemare'}[c.state],'co-check-badge'),E('strong',c.label),E('p',c.detail,'co-check-detail'));
  if(c.issues.length){const ul=E('ul');c.issues.slice(0,8).forEach(i=>ul.append(E('li',i)));row.append(ul)}return row}
 function renderResult(){const m=model(),built=build(m),checks=checksOf(m,built),fails=blocking(checks),miss=missing(m.company);setStep(3);result.hidden=false;kit.hidden=true;
  const head=E('div',undefined,'ad-result-head'),hd=E('div');hd.append(E('span','Layout '+direction(m.direction).title,'ad-angle'),E('h3','Il coordinato di '+(m.brand.name||m.company.ragione||'il tuo brand')),E('p','Tutti i pezzi con il layout scelto. I dati li modifichi qui sopra: anteprime e controlli si aggiornano.','ad-idea'));head.append(hd);
  const warn=E('div',undefined,'co-missing');warn.hidden=!miss.length;if(miss.length){warn.setAttribute('role','alert');warn.append(E('strong','Dati mancanti: restano vuoti nei file'),E('p',miss.map(k=>LABEL[k]).join(', ')+'. Completali qui sopra, oppure esporta lo stesso: RADIX non li inventa.'))}
  const checksBox=E('div',undefined,'co-checks');checksBox.append(E('h4','Controlli prima dell’export'),...checks.map(checkRow));
  const gallery=E('div',undefined,'co-gallery');
  const fig=(cls,label,node)=>{const f=E('figure',undefined,'co-fig '+cls);f.append(node,E('figcaption',label));return f};
  for(const x of built.docs){const sec=E('section',undefined,'co-piece');sec.dataset.piece=x.id;sec.append(E('h4',x.label));const row=E('div',undefined,'co-pages');x.doc.pages.forEach((p,i)=>row.append(fig('co-page-'+x.id,p.label+' · '+String(p.w).replace('.',',')+' × '+p.h+' mm',svgImg(P.previewSvg(x.doc,i,{guides:true}),x.label+' · '+p.label))));sec.append(row);gallery.append(sec)}
  if(built.signature){const sec=E('section',undefined,'co-piece');sec.dataset.piece='firma';sec.append(E('h4','Firma email'+(m.people[0]?' · '+m.people[0].nome:'')),signatureFrame(signatureHtml(m,m.people[0]||null,{logo:brand.logo?{src:P.svgUrl(brand.logo),w:480,h:160}:null}),'Firma email'),E('p','Anteprima in una pagina HTML semplice. Nello zip il logo è un PNG incorporato'+(st.logoUrl?' oppure l’indirizzo sul tuo sito':'')+'.','ad-meta'));gallery.append(sec)}
  if(built.covers.length){const sec=E('section',undefined,'co-piece');sec.dataset.piece='social';sec.append(E('h4','Copertine social'));const row=E('div',undefined,'co-covers');built.covers.forEach(L=>row.append(fig('co-cover co-cover-'+L.spec.id,L.spec.title+' · '+L.spec.w+' × '+L.spec.h+' px',svgImg(coverSvg(L,{guides:true}),L.spec.title))));sec.append(row,E('p','La linea tratteggiata è l’area visibile su ogni dispositivo.','ad-meta'));gallery.append(sec)}
  if(has(m,'office')){const sec=E('section',undefined,'co-piece');sec.dataset.piece='office';sec.append(E('h4','Modelli Office'));const ul=E('ul',undefined,'co-office');[['carta-intestata.docx','Word: intestazione con logo e contatti, piè di pagina con i dati societari, testi tra parentesi da sostituire.'],['presentazione.pptx','PowerPoint: tema con i colori e i font del kit, copertina, contenuto e chiusura.']].forEach(([a,b])=>{const li=E('li');li.append(E('strong',a),E('span',b));ul.append(li)});sec.append(ul);gallery.append(sec)}
  const make=button('Crea lo zip del coordinato','primary'),saveB=button('Salva nel progetto'),acts=E('div',undefined,'ps-actions co-actions'),rs=E('p','','tool-status');rs.setAttribute('role','status');
  acts.append(make,saveB,E('span','Nessuna chiamata AI: i file si creano qui, senza costi.','muted'));
  if(fails.length){make.disabled=true;make.title='Si attiva quando i controlli in rosso sono sistemati.';rs.textContent='Prima sistema: '+fails.map(c=>c.label.toLowerCase()).join(', ')+'.'}
  make.onclick=async()=>{if(st.busy)return;const mm=model(),cs=checksOf(mm);if(blocking(cs).length){rs.textContent='Prima sistema i controlli in rosso.';return}
   const warns=cs.filter(c=>c.state==='warn');
   if(warns.length&&!await askConfirm({title:'Esportare con dati da completare?',message:warns.map(c=>c.label+': '+c.detail).join('\n'),ok:'Esporta lo stesso',cancel:'Torna ai dati'}))return;
   st.busy=true;make.disabled=true;rs.textContent='Creo i file: PDF per la tipografia, firma, copertine e modelli Office…';
   try{st.files=await kitFiles(mm,{logoPng,png:svgToPng,glyphs:()=>P.loadGlyphs(),prepare:(d,o)=>P.prepareImages(d,o)});renderKit(mm);rs.textContent='Pronti '+st.files.length+' file.';kit.scrollIntoView&&kit.scrollIntoView({behavior:'smooth',block:'start'})}
   catch(e){rs.textContent='File non creati: '+e.message}finally{st.busy=false;make.disabled=false}};
  saveB.onclick=async()=>{if(!ctx.workspace||!ctx.projectId){rs.textContent='Apri un progetto per salvare il coordinato.';return}saveB.disabled=true;
   try{await saveToProject(ctx.workspace,ctx.projectId,savedRecord(model(),{by:ctx.by}));rs.replaceChildren(doc().createTextNode('Coordinato salvato nel progetto: layout, dati e persone. Lo riapri da qui. '));if(ctx.agentsUrl){const a=E('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;rs.append(a)}loadSaved()}
   catch(e){rs.textContent='Salvataggio non riuscito: '+e.message}finally{saveB.disabled=false}};
  result.replaceChildren(head,warn,checksBox,gallery,acts,rs)}
 function renderKit(m){setStep(4);kit.hidden=false;const top=E('div',undefined,'co-kit-head');top.append(E('h3','Il coordinato è pronto'),E('p',st.files.length+' file: stampa, firma email, copertine social e modelli Office, con le istruzioni.','ad-idea'));
  const zipB=button('Scarica tutto (.zip)','primary');zipB.onclick=()=>save(zipName(m),bundle(st.files));
  const groups=[['stampa/','Stampa'],['firma-email/','Firma email'],['social/','Copertine social'],['modelli-office/','Modelli Office'],['','Istruzioni']],cols=E('div',undefined,'co-files');
  for(const [pfx,label] of groups){const list=st.files.filter(f=>{const rel=f.name.slice(ROOT.length+1);return pfx?rel.startsWith(pfx):!rel.includes('/')});if(!list.length)continue;
   const sec=E('section',undefined,'co-group');sec.append(E('h5',label));const ul=E('ul');list.forEach(f=>{const li=E('li'),b=button('Scarica','co-dl');b.setAttribute('aria-label','Scarica '+f.name.split('/').pop());b.onclick=()=>save(f.name,f.data);const t=E('span',undefined,'co-file');t.append(E('strong',f.label),E('small',f.name.split('/').pop()));li.append(t,b);ul.append(li)});sec.append(ul);cols.append(sec)}
  const acts=E('div',undefined,'ps-actions');acts.append(zipB);kit.replaceChildren(top,acts,cols)}
 return wrap}

return Object.freeze({AGENT,PIECES,DIRECTIONS,COMPANY,REQUIRED,PERSON,COVERS,ENVELOPE,FOLDER,SIGNATURE_W,SIGNATURE_MAX,MIN_PT,FONT_STACK,
 pivaOf,pivaValid,hasKit,prefill,company,people,missing,modelOf,printValues,legalLine,cardDoc,letterDoc,envelopeDoc,folderDoc,printDocs,pdfBoxes,
 coverLayout,coverProblems,coverSvg,logoSource,signatureHtml,signaturePage,signatureText,signatureProblems,contrastIssues,offPalette,build,checksOf,blocking,
 docxLetterhead,docxInspect,pptxTemplate,readme,kitFiles,bundle,zipName,readStore,savedRecord,addRecord,saveToProject,fromRecord,coordinatoStudio});
});
