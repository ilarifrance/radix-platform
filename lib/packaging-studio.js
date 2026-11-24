/* Studio «Etichette e packaging» (agency job P8, the free part): product labels and simple boxes from the brand kit, print
   ready, with NO AI and no cost.
   1. Questions: product type (alimentare, cosmetico, altro), format (adesivo tondo, etichetta rettangolare, etichetta
      avvolgente per bottiglia o vasetto, etichetta per tappo, astuccio con linguette, scatola a cuscino, cavaliere per
      sacchetto), the size in mm (common presets or free), the product name and its variants (flavours, scents).
   2. Three designs drawn here from profile.identityKit (or the colours of profile.visual): «Classica», «Minimal»,
      «Artigianale»; the person picks one.
   3. Refinement: product and legal texts typed by the person (denominazione, ingredienti, tracce, quantità netta,
      conservazione, lotto e data as a white box for the stamp, operatore e indirizzo, origine, dichiarazione nutrizionale
      in the linear form; for cosmetics funzione, INCI, PAO, persona responsabile), one colour per variant, an optional
      illustration. Allergens typed in the ingredients are set in bold when they match the 14 names of Annex II of Reg.
      (UE) 1169/2011. The EAN-13 is drawn as vector bars only for a 13-digit code with a valid check digit (never made up).
      The legal checklist (Reg. UE 1169/2011 for food, Reg. CE 1223/2009 for cosmetics, Codice del consumo for the rest)
      is shown «da verificare con il consulente», never as legal advice; the x-height of the rendered mandatory text is
      measured on the outlines that go into the PDF (lib/print-glyphs.js) against 1,2 mm (0,9 mm under 80 cm²).
   4. Export, one zip: stampa/ one PDF/X-1a-style CMYK file per variant with 3 mm bleed and crop marks (lib/print-studio.js
      writer, texts as outlines), fustella/ the die line on the same page in 100 % magenta (cut solid, creases dashed: the
      approach of the folder in lib/coordinato-studio.js), anteprime/ PNG previews with the die line, mockup/ flat SVG with
      the artwork and the die line on separate layers, LEGGIMI.txt with the checklist and the print notes.
   Nothing is invented: ingredients, nutrition values, codes, claims and dates are only what the person types.
   Saved in the project: the «agents» document under the key packaging (agents-page.js keeps it), texts and settings only.
   Pure part runs in Node for the tests; packagingStudio() is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPackagingStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.message].filter(Boolean).join('\n')))};
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const PS=()=>lib('RadixPrintStudio','./print-studio.js'),ZIP=()=>lib('RadixZip','./zip-lite.js');
const FIG=.688,FRAME=1.8,AGENT='art-director',MAX_SAVED=12,MAX_VARIANTS=6,BLEED=3,DIE='#FF00FF',DIE_W=.5,DIE_DASH=Object.freeze([4,2]);
const clean=s=>String(s==null?'':s).replace(/[ \t ]+/g,' ').trim();
const block=s=>String(s==null?'':s).replace(/\r/g,'').split('\n').map(clean).filter(Boolean).join(' ');
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>norm(s).replace(/ /g,'-').slice(0,40);
const n2=v=>{const x=Math.round(v*100)/100;return Object.is(x,-0)?0:x};
const mmText=v=>String(Math.round(v*10)/10).replace('.',',');
const copy=o=>JSON.parse(JSON.stringify(o));

// ---- what can be made ----
const TYPES=Object.freeze([
 {id:'alimentare',title:'Alimentare',line:'Pane, dolci, conserve, sughi, bevande.'},
 {id:'cosmetico',title:'Cosmetico',line:'Creme, saponi, oli, profumi.'},
 {id:'altro',title:'Altro prodotto',line:'Candele, oggetti, articoli per la casa.'}]);
const TYPE_IDS=TYPES.map(t=>t.id);
// size: the numbers the person types (mm); presets: the common ones, with a hint.
const FORMATS=Object.freeze([
 {id:'tondo',kind:'round',title:'Adesivo tondo',line:'Chiudipacco, vasetti, sacchetti',dims:['d'],presets:[[[40],'Ø 40 mm'],[[50],'Ø 50 mm'],[[60],'Ø 60 mm'],[[76],'Ø 76 mm'],[[90],'Ø 90 mm']],def:[60]},
 {id:'rettangolare',kind:'rect',title:'Etichetta rettangolare',line:'Barattoli, sacchetti, scatole',dims:['w','h'],presets:[[[70,50],'70 × 50 mm'],[[90,60],'90 × 60 mm'],[[100,70],'100 × 70 mm'],[[120,80],'120 × 80 mm'],[[148,105],'148 × 105 mm (A6)']],def:[100,70],radius:2},
 {id:'avvolgente',kind:'wrap',title:'Etichetta avvolgente',line:'Bottiglie e vasetti: fronte, retro e lato',dims:['w','h'],presets:[[[180,60],'180 × 60 mm (bottiglia 33 cl)'],[[200,70],'200 × 70 mm (vasetto 314 ml)'],[[220,90],'220 × 90 mm (bottiglia 50 cl)'],[[250,100],'250 × 100 mm (bottiglia 75 cl)']],def:[200,70],radius:1},
 {id:'tappo',kind:'round',lid:true,title:'Etichetta per tappo',line:'Sopra il tappo del vasetto',dims:['d'],presets:[[[38],'Ø 38 mm (tappo 43)'],[[46],'Ø 46 mm (tappo 53)'],[[56],'Ø 56 mm (tappo 63)'],[[62],'Ø 62 mm (tappo 70)'],[[74],'Ø 74 mm (tappo 82)']],def:[56]},
 {id:'astuccio',kind:'tuck',title:'Astuccio con linguette',line:'Scatola pieghevole a incastro',dims:['l','p','a'],presets:[[[60,30,120],'60 × 30 × 120 mm'],[[80,40,140],'80 × 40 × 140 mm'],[[100,50,150],'100 × 50 × 150 mm'],[[150,60,200],'150 × 60 × 200 mm']],def:[80,40,140]},
 {id:'cuscino',kind:'pillow',title:'Scatola a cuscino',line:'Scatolina regalo con le estremità curve',dims:['w','h'],presets:[[[80,160],'80 × 160 mm'],[[100,180],'100 × 180 mm'],[[120,200],'120 × 200 mm']],def:[100,180]},
 {id:'cavaliere',kind:'topper',title:'Cavaliere per sacchetto',line:'Cartoncino piegato sopra il sacchetto',dims:['w','h'],presets:[[[100,50],'100 × 50 mm'],[[120,60],'120 × 60 mm'],[[150,70],'150 × 70 mm'],[[180,80],'180 × 80 mm']],def:[120,60]}]);
const FORMAT_IDS=FORMATS.map(f=>f.id);
const formatOf=id=>FORMATS.find(f=>f.id===id)||FORMATS[1];
const DIM=Object.freeze({d:['Diametro',25,150],w:['Larghezza',30,320],h:['Altezza',20,300],l:['Lato fronte',30,220],p:['Profondità',15,120],a:['Altezza',40,320]});
const DIM_LABEL=Object.freeze({cuscino:{w:['Larghezza',50,200],h:['Lunghezza',80,320]},cavaliere:{w:['Larghezza',60,250],h:['Altezza (piegato)',30,120]}});
const dimSpec=(f,k)=>(DIM_LABEL[f.id]&&DIM_LABEL[f.id][k])||DIM[k];
function sizeOf(formatId,size){const f=formatOf(formatId),raw=Array.isArray(size)?size:f.def;return f.dims.map((k,i)=>{const [,min,max]=dimSpec(f,k),v=Number(String(raw[i]==null?'':raw[i]).replace(',','.'));return isFinite(v)&&v>0?Math.round(Math.max(min,Math.min(max,v))*10)/10:f.def[i]})}
const sizeText=(formatId,size)=>{const f=formatOf(formatId),s=sizeOf(formatId,size);return f.kind==='round'?'Ø '+mmText(s[0])+' mm':s.map(mmText).join(' × ')+' mm'};
const STYLES=Object.freeze([
 {id:'classica',title:'Classica',line:'Cornice sottile, fascia del gusto nel colore della variante, tutto centrato.'},
 {id:'minimal',title:'Minimal',line:'Fondo bianco, molto spazio, nome grande e un filo di colore.'},
 {id:'artigianale',title:'Artigianale',line:'Fascia piena col logo, doppio filetto e il gusto in un nastro.'}]);
const STYLE_IDS=STYLES.map(s=>s.id);
const styleOf=id=>STYLES.find(s=>s.id===id)||STYLES[0];
const COLOR_ROLES=Object.freeze(['primary','secondary','accent','dark']);
const ROLE_LABEL=Object.freeze({primary:'Primario',secondary:'Secondario',accent:'Accento',dark:'Scuro'});

// ---- the 14 allergens of Annex II of Reg. (UE) 1169/2011, with the Italian words that name them ----
const ALLERGENS=Object.freeze([
 ['glutine','Cereali contenenti glutine',['glutine','frumento','grano','segale','orzo','avena','farro','kamut','spelta']],
 ['crostacei','Crostacei',['crostacei','crostaceo','gamberi','gambero','gamberetti','scampi','aragosta','astice','granchio','mazzancolle']],
 ['uova','Uova',['uova','uovo','tuorlo','tuorli','albume','albumi']],
 ['pesce','Pesce',['pesce','acciughe','alici','tonno','salmone','merluzzo','baccalà','sgombro']],
 ['arachidi','Arachidi',['arachidi','arachide']],
 ['soia','Soia',['soia','lecitina di soia']],
 ['latte','Latte (compreso il lattosio)',['latte','lattosio','burro','panna','formaggio','formaggi','siero di latte','yogurt','ricotta','mascarpone','mozzarella','caseina','latticini']],
 ['frutta-a-guscio','Frutta a guscio',['frutta a guscio','mandorle','mandorla','nocciole','nocciola','noci','noce','anacardi','anacardo','noci pecan','noci del brasile','pistacchi','pistacchio','noci macadamia','macadamia']],
 ['sedano','Sedano',['sedano']],
 ['senape','Senape',['senape']],
 ['sesamo','Semi di sesamo',['sesamo']],
 ['solfiti','Anidride solforosa e solfiti',['anidride solforosa','solfiti','solfito','metabisolfito','bisolfito']],
 ['lupini','Lupini',['lupini','lupino']],
 ['molluschi','Molluschi',['molluschi','mollusco','cozze','vongole','calamari','polpo','seppie','ostriche','totani']]
].map(([id,label,words])=>Object.freeze({id,label,words:Object.freeze(words)})));
const ALLERGEN_WORDS=ALLERGENS.flatMap(a=>a.words.map(w=>[w,a.id])).sort((a,b)=>b[0].length-a[0].length);
const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const ALLERGEN_RE=new RegExp('(?<![\\p{L}\\p{N}])('+ALLERGEN_WORDS.map(([w])=>escRe(w).replace(/ /g,'\\s+')).join('|')+')(?![\\p{L}\\p{N}])','giu');
// Words that look like an allergen and are not one: coconut, nutmeg, cocoa butter, plant «milks».
const NOT_ALLERGEN=[[/^(noce|noci)$/i,/^\s+(di\s+cocco|moscata)/i],[/^burro$/i,/^\s+di\s+(cacao|karit|arachid)/i],[/^latte$/i,/^\s+di\s+(cocco|riso|soia|mandorl|avena)/i]];
const allergenId=w=>{const k=clean(w).toLowerCase().replace(/\s+/g,' ');const hit=ALLERGEN_WORDS.find(([x])=>x===k);return hit?hit[1]:''};
// The text as runs [{s, bold}]: the person's own **bold**, plus every allergen word (not after «senza»).
// Returns {runs, found:[allergen ids]}.
function emphasize(text){const src=block(text),runs=[],found=new Set();if(!src)return {runs,found:[]};
 const parts=src.split(/(\*\*[^*]+\*\*)/g);
 for(const part of parts){if(!part)continue;const own=/^\*\*([^*]+)\*\*$/.exec(part);if(own){runs.push({s:own[1],bold:true});const id=allergenId(own[1]);if(id)found.add(id);continue}
  let last=0;ALLERGEN_RE.lastIndex=0;let m;
  while((m=ALLERGEN_RE.exec(part))){const w=m[1],after=part.slice(m.index+w.length),before=part.slice(0,m.index);
   const skip=NOT_ALLERGEN.some(([re,next])=>next&&re.test(w)&&next.test(after))||/\bsenza\s+$/i.test(before);if(skip)continue;
   if(m.index>last)runs.push({s:part.slice(last,m.index),bold:false});runs.push({s:w,bold:true});found.add(allergenId(w));last=m.index+w.length}
  if(last<part.length)runs.push({s:part.slice(last),bold:false})}
 return {runs:merge(runs),found:ALLERGENS.map(a=>a.id).filter(id=>found.has(id))}}
function merge(runs){const out=[];for(const r of runs){if(!r.s)continue;const l=out[out.length-1];if(l&&l.bold===r.bold)l.s+=r.s;else out.push({s:r.s,bold:!!r.bold})}return out}
const allergenLabel=id=>(ALLERGENS.find(a=>a.id===id)||{label:id}).label;

// ---- EAN-13: check digit and bars (never invented: only a code typed by the person, checked) ----
const eanDigits=s=>String(s==null?'':s).replace(/[\s.-]/g,'');
function eanCheck(d12){const d=String(d12);if(!/^\d{12}$/.test(d))return -1;let s=0;for(let i=0;i<12;i++)s+=(+d[i])*(i%2?3:1);return (10-s%10)%10}
// {state:'empty'|'ok'|'bad', code, error}
function eanStatus(s){const d=eanDigits(s);if(!d)return {state:'empty',code:''};
 if(!/^\d+$/.test(d))return {state:'bad',code:d,error:'Il codice EAN-13 ha solo cifre.'};
 if(d.length!==13)return {state:'bad',code:d,error:'Il codice EAN-13 ha 13 cifre: qui ce ne sono '+d.length+'.'};
 const c=eanCheck(d.slice(0,12));if(c!==+d[12])return {state:'bad',code:d,error:'L’ultima cifra (di controllo) non torna: con queste 12 cifre dovrebbe essere '+c+'. Ricopia il codice da GS1 Italy o dal fornitore: RADIX non lo corregge.'};
 return {state:'ok',code:d}}
const EAN_L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const EAN_G=EAN_L.map(c=>c.split('').map(b=>b==='1'?'0':'1').reverse().join(''));
const EAN_R=EAN_L.map(c=>c.split('').map(b=>b==='1'?'0':'1').join(''));
const EAN_PARITY=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
// The 95 modules (1 = bar) and which are guard bars (longer).
function eanModules(code){const d=String(code),par=EAN_PARITY[+d[0]];let bits='101',guard='111';
 for(let i=1;i<=6;i++){const c=(par[i-1]==='L'?EAN_L:EAN_G)[+d[i]];bits+=c;guard+='0000000'}bits+='01010';guard+='11111';
 for(let i=7;i<=12;i++){bits+=EAN_R[+d[i]];guard+='0000000'}bits+='101';guard+='111';return {bits,guard}}
// Nominal size (GS1, 100 %): module 0.33 mm, 113 modules with the quiet zones (37.29 mm), bars 22.85 mm, guards 5 X longer.
const EAN=Object.freeze({X:.33,MODULES:113,QUIET_L:11,QUIET_R:7,BAR:22.85,MIN:.8,MAX:2,TRUNC_MIN:.5});
const eanWidth=s=>EAN.MODULES*EAN.X*s;
const eanDigitSize=s=>Math.max(6,10*s);
const eanHeight=(s,trunc=1)=>EAN.BAR*s*trunc+EAN.X*s*2.6+ptToMm(eanDigitSize(s)*(.718+.207));
// The barcode in a white box at (x, y), top-left of the quiet zones: rects and the digits (human readable line).
function eanItems(code,x,y,scale,{trunc=1}={}){const P=PS(),X=EAN.X*scale,{bits,guard}=eanModules(code),bar=EAN.BAR*scale*trunc,ext=X*5,size=eanDigitSize(scale),items=[];
 const W=eanWidth(scale),digits=P.ptToMm(size*.718),H=eanHeight(scale,trunc);
 items.push({t:'rect',x,y,w:W,h:H,fill:'#FFFFFF',label:'Fondo codice a barre'});
 const x0=x+EAN.QUIET_L*X;let i=0;
 while(i<95){if(bits[i]!=='1'){i++;continue}let j=i;while(j<95&&bits[j]==='1'&&guard[j]===guard[i])j++;
  items.push({t:'rect',x:x0+i*X,y:y+X,w:(j-i)*X,h:guard[i]==='1'?bar+ext:bar,fill:'#000000',label:'Codice a barre'});i=j}
 const d=String(code),tw=s=>P.ptToMm(P.textWidth(s,size,false)),ty=y+X+bar+digits+X*.6,txt=(s,cx)=>items.push({t:'text',x:cx-tw(s)/2,y:ty,s,size,bold:false,fill:'#000000',label:'Cifre del codice a barre',bg:'#FFFFFF',ean:true});
 txt(d[0],x+EAN.QUIET_L*X/2);for(let k=1;k<=6;k++)txt(d[k],x0+(3+(k-1)*7+3.5)*X);for(let k=7;k<=12;k++)txt(d[k],x0+(3+42+5+(k-7)*7+3.5)*X);
 return {items,w:W,h:H}}

// ---- nutrition: the person's numbers, in the linear form of Annex XV (never computed or estimated) ----
const NUTRI=Object.freeze([['kj','Energia','kJ'],['kcal','Energia','kcal'],['fat','Grassi','g'],['sat','di cui acidi grassi saturi','g'],['carb','Carboidrati','g'],['sugar','di cui zuccheri','g'],['protein','Proteine','g'],['salt','Sale','g']]);
const NUTRI_IDS=NUTRI.map(x=>x[0]);
const numText=v=>{const s=clean(v).replace(/^(<|meno di)\s*/i,'< ').replace('.',',');return /^(< )?\d+(,\d+)?$/.test(s)?s:''};
function nutrition(v){const n=(v&&v.nutr)||{},vals=Object.fromEntries(NUTRI_IDS.map(k=>[k,numText(n[k])])),filled=NUTRI_IDS.filter(k=>vals[k]),missing=NUTRI_IDS.filter(k=>!vals[k]);
 const per=/\b(ml|cl|l)\b/i.test(clean(v&&v.net))?'100 ml':'100 g';
 const text=missing.length?'':'Dichiarazione nutrizionale, valori medi per '+per+': energia '+vals.kj+' kJ / '+vals.kcal+' kcal; grassi '+vals.fat+' g, di cui acidi grassi saturi '+vals.sat+' g; carboidrati '+vals.carb+' g, di cui zuccheri '+vals.sugar+' g; proteine '+vals.protein+' g; sale '+vals.salt+' g.';
 const bad=NUTRI_IDS.filter(k=>clean(n[k])&&!vals[k]);
 return {complete:!missing.length,partial:filled.length>0&&missing.length>0,filled,missing,bad,text,per}}
// The net quantity: the number and its unit, for the height of the figures (Dir. 76/211/CEE, Annex I).
function netOf(s){const m=/(\d+(?:[.,]\d+)?)\s*(kg|g|mg|l|cl|ml)\b/i.exec(clean(s));if(!m)return null;const v=parseFloat(m[1].replace(',','.')),u=m[2].toLowerCase();
 const base=u==='kg'||u==='l'?v*1000:u==='cl'?v*10:u==='mg'?v/1000:v;return {value:v,unit:u,grams:base}}
const netMinFigure=g=>g<=50?2:g<=200?3:g<=1000?4:6;

// ---- the model ----
const emptyVariant=(i=0)=>({id:'v'+(i+1),name:'',color:COLOR_ROLES[i%3],ingredients:'',traces:'',net:'',ean:'',nutr:{}});
const COMMON_KEYS=['legalName','storage','usage','precautions','materials','producer','plant','origin','extra','responsible'];
function emptyModel(){return {type:'alimentare',format:'rettangolare',size:formatOf('rettangolare').def.slice(),style:'',name:'',payoff:'',small:false,dateKind:'tmc',stampBox:true,pao:'',nutriExempt:false,
 common:Object.fromEntries(COMMON_KEYS.map(k=>[k,''])),variants:[emptyVariant(0)],illustration:null,sample:false,infoOn:true,from:{}}}
function variantOf(x,i){const o=x&&typeof x==='object'?x:{},v=emptyVariant(i);v.id=clean(o.id).slice(0,20)||v.id;v.name=clean(o.name).slice(0,60);v.color=COLOR_ROLES.includes(o.color)?o.color:v.color;
 v.ingredients=block(o.ingredients).slice(0,1500);v.traces=clean(o.traces).slice(0,200);v.net=clean(o.net).slice(0,30);v.ean=eanDigits(o.ean).slice(0,20);
 v.nutr=Object.fromEntries(NUTRI_IDS.map(k=>[k,clean(o.nutr&&o.nutr[k]).slice(0,10)]).filter(([,x])=>x));return v}
// Everything cut to its length; nothing added.
function modelOf(input){const i=input&&typeof input==='object'?input:{},m=emptyModel();
 m.type=TYPE_IDS.includes(i.type)?i.type:m.type;m.format=FORMAT_IDS.includes(i.format)?i.format:m.format;m.size=sizeOf(m.format,i.size);m.style=STYLE_IDS.includes(i.style)?i.style:'';
 m.name=clean(i.name).slice(0,60);m.payoff=clean(i.payoff).slice(0,70);m.small=!!i.small;m.dateKind=['tmc','scadenza','pao'].includes(i.dateKind)?i.dateKind:(m.type==='cosmetico'?'pao':'tmc');
 m.stampBox=i.stampBox!==false;m.infoOn=formatOf(m.format).lid?false:formatOf(m.format).kind==='round'?i.infoOn===true:i.infoOn!==false;m.pao=String(i.pao==null?'':i.pao).replace(/\D/g,'').slice(0,2);m.nutriExempt=!!i.nutriExempt;m.sample=!!i.sample;
 const c=i.common&&typeof i.common==='object'?i.common:{};for(const k of COMMON_KEYS)m.common[k]=block(c[k]).slice(0,k==='extra'?300:400);
 const vs=(Array.isArray(i.variants)?i.variants:[]).slice(0,MAX_VARIANTS).map(variantOf);m.variants=vs.length?vs:[emptyVariant(0)];
 const il=i.illustration;m.illustration=il&&typeof il==='object'&&il.name?{name:clean(il.name).slice(0,120),w:+il.w||0,h:+il.h||0}:null;
 m.from=i.from&&typeof i.from==='object'?{...i.from}:{};return m}

// ---- prefill: producer and address from the project (never invented) ----
function prefill(profile,{projectName,agentsDoc}={}){const p=profile||{},legal=p.legal&&typeof p.legal==='object'?p.legal:{},c=p.contacts&&typeof p.contacts==='object'?p.contacts:{},from={};
 let ragione=clean(legal.ragioneSociale||legal.name||p.ragioneSociale||p.legalName),addr=clean(legal.address||c.address||p.address);
 const co=agentsDoc&&agentsDoc.coordinato&&Array.isArray(agentsDoc.coordinato.items)?agentsDoc.coordinato.items[agentsDoc.coordinato.items.length-1]:null,cc=co&&co.model&&co.model.company;
 if(cc&&(!ragione||!addr)){ragione=ragione||clean(cc.ragione);addr=addr||clean(cc.indirizzo)}
 const producer=[ragione,addr].filter(Boolean).join(', ');if(producer)from.producer=cc&&clean(cc.ragione)===ragione?'coordinato':'progetto';
 const brand=PS().brandOf(p,projectName);return {producer,brand:brand.name,from}}
function newModel({profile,projectName,agentsDoc}={}){const m=emptyModel(),pre=prefill(profile,{projectName,agentsDoc});m.common.producer=pre.producer;m.from=pre.from;return m}

// ---- brand: the kit, else the colours written in profile.visual, else neutral ----
const HEX_RE=/#[0-9a-f]{6}\b/gi;
function brandFor(profile,projectName){const P=PS(),b=P.brandOf(profile,projectName);if(b.fromKit)return {...b,source:'kit'};
 const hs=String(profile&&profile.visual||'').match(HEX_RE)||[];if(!hs.length)return {...b,source:'default'};
 const pal={...b.palette,primary:hs[0].toUpperCase()};if(hs[1])pal.secondary=hs[1].toUpperCase();if(hs[2])pal.accent=hs[2].toUpperCase();
 const light=hs.map(h=>h.toUpperCase()).find(h=>P.contrast(h,'#000000')>15);if(light)pal.light=light;return {...b,palette:pal,source:'visual'}}

// ---- geometry: the sheet (trim), its die line and the areas for the artwork, all in mm (origin top left) ----
const circle=(cx,cy,r)=>'M'+n2(cx-r)+' '+n2(cy)+'A'+n2(r)+' '+n2(r)+' 0 1 0 '+n2(cx+r)+' '+n2(cy)+'A'+n2(r)+' '+n2(r)+' 0 1 0 '+n2(cx-r)+' '+n2(cy)+'Z';
function roundRect(x,y,w,h,r){r=Math.max(0,Math.min(r,w/2,h/2));if(!r)return 'M'+n2(x)+' '+n2(y)+'H'+n2(x+w)+'V'+n2(y+h)+'H'+n2(x)+'Z';
 return 'M'+n2(x+r)+' '+n2(y)+'H'+n2(x+w-r)+'A'+n2(r)+' '+n2(r)+' 0 0 1 '+n2(x+w)+' '+n2(y+r)+'V'+n2(y+h-r)+'A'+n2(r)+' '+n2(r)+' 0 0 1 '+n2(x+w-r)+' '+n2(y+h)+'H'+n2(x+r)+'A'+n2(r)+' '+n2(r)+' 0 0 1 '+n2(x)+' '+n2(y+h-r)+'V'+n2(y+r)+'A'+n2(r)+' '+n2(r)+' 0 0 1 '+n2(x+r)+' '+n2(y)+'Z'}
const poly=pts=>'M'+pts.map(p=>n2(p[0])+' '+n2(p[1])).join('L');
const seg=(x1,y1,x2,y2)=>'M'+n2(x1)+' '+n2(y1)+'L'+n2(x2)+' '+n2(y2);
// Areas: {id, label, x, y, w, h, round?:{cx,cy,r}, flip?:true (drawn upside down: the back of the bag topper, the box lid)}.
function geometry(formatId,size){const f=formatOf(formatId),s=sizeOf(formatId,size);
 if(f.kind==='round'){const d=s[0],r=d/2;return {kind:f.kind,w:d,h:d,cut:[circle(r,r,r)],crease:[],outline:circle(r,r,r),safe:3,largest:Math.PI*r*r/100,
  areas:[{id:'all',label:f.lid?'Tappo':'Etichetta',x:0,y:0,w:d,h:d,round:{cx:r,cy:r,r}}]}}
 if(f.kind==='rect'||f.kind==='wrap'){const [w,h]=s,o=roundRect(0,0,w,h,f.radius||0);let areas;
  if(f.kind==='wrap'){const a=Math.round(w*.4*10)/10,b=Math.round(w*.36*10)/10;areas=[{id:'back',label:'Retro',x:0,y:0,w:a,h},{id:'front',label:'Fronte',x:a,y:0,w:b,h},{id:'side',label:'Lato',x:a+b,y:0,w:w-a-b,h}]}
  else if(w>=h*1.35){const a=Math.round(w*.44*10)/10;areas=[{id:'front',label:'Fronte',x:0,y:0,w:a,h},{id:'back',label:'Informazioni',x:a,y:0,w:w-a,h}]}
  else areas=[{id:'all',label:'Etichetta',x:0,y:0,w,h}];
  return {kind:f.kind,w,h,cut:[o],crease:[],outline:o,safe:3,largest:w*h/100,areas,folds:f.kind==='wrap'?[areas[1].x,areas[2].x]:[]}}
 if(f.kind==='topper'){const [w,h]=s,o=roundRect(0,0,w,2*h,0);
  return {kind:f.kind,w,h:2*h,cut:[o],crease:[seg(0,h,w,h)],outline:o,safe:3,largest:w*h/100,foldsY:[h],
   areas:[{id:'back',label:'Retro (capovolto)',x:0,y:0,w,h,flip:true},{id:'front',label:'Fronte',x:0,y:h,w,h}]}}
 if(f.kind==='tuck'){const [L,W,Hh]=s,G=14,T=Math.max(10,Math.min(18,W*.5)),D=Math.min(L*.42,Math.max(W*.85,12)),top=Math.max(W+T,D),yb0=top,yb1=top+Hh,X1=G,X2=G+L,X3=G+L+W,X4=G+2*L+W,X5=G+2*L+2*W,R=Math.min(5,T*.45),S=Math.min(3,W*.12);
  const tuckTop=(a,b,yy)=>[[a,yy],[a+1.5,yy],[a+1.5,yy-T+R],null,[b-1.5,yy-T],[b-1.5,yy]];
  // the outline, clockwise from the bottom of the glue flap
  const d=['M'+n2(X1)+' '+n2(yb1),'L'+n2(0)+' '+n2(yb1-6),'L0 '+n2(yb0+6),'L'+n2(X1)+' '+n2(yb0),
   'L'+n2(X1)+' '+n2(yb0-W),'L'+n2(X1+1.5)+' '+n2(yb0-W),'L'+n2(X1+1.5)+' '+n2(yb0-W-T+R),'A'+n2(R)+' '+n2(R)+' 0 0 1 '+n2(X1+1.5+R)+' '+n2(yb0-W-T),'L'+n2(X2-1.5-R)+' '+n2(yb0-W-T),'A'+n2(R)+' '+n2(R)+' 0 0 1 '+n2(X2-1.5)+' '+n2(yb0-W-T+R),'L'+n2(X2-1.5)+' '+n2(yb0-W),'L'+n2(X2)+' '+n2(yb0-W),'L'+n2(X2)+' '+n2(yb0),
   'L'+n2(X2+1.5)+' '+n2(yb0-D),'L'+n2(X3-W*.3)+' '+n2(yb0-D),'L'+n2(X3)+' '+n2(yb0-S),'L'+n2(X3)+' '+n2(yb0),
   'L'+n2(X4)+' '+n2(yb0),'L'+n2(X4)+' '+n2(yb0-S),'L'+n2(X4+W*.3)+' '+n2(yb0-D),'L'+n2(X5-1.5)+' '+n2(yb0-D),'L'+n2(X5)+' '+n2(yb0),
   'L'+n2(X5)+' '+n2(yb1),
   'L'+n2(X5-1.5)+' '+n2(yb1+D),'L'+n2(X4+W*.3)+' '+n2(yb1+D),'L'+n2(X4)+' '+n2(yb1+S),'L'+n2(X4)+' '+n2(yb1),
   'L'+n2(X4)+' '+n2(yb1+W),'L'+n2(X4-1.5)+' '+n2(yb1+W),'L'+n2(X4-1.5)+' '+n2(yb1+W+T-R),'A'+n2(R)+' '+n2(R)+' 0 0 1 '+n2(X4-1.5-R)+' '+n2(yb1+W+T),'L'+n2(X3+1.5+R)+' '+n2(yb1+W+T),'A'+n2(R)+' '+n2(R)+' 0 0 1 '+n2(X3+1.5)+' '+n2(yb1+W+T-R),'L'+n2(X3+1.5)+' '+n2(yb1+W),'L'+n2(X3)+' '+n2(yb1+W),'L'+n2(X3)+' '+n2(yb1),
   'L'+n2(X3)+' '+n2(yb1+S),'L'+n2(X3-W*.3)+' '+n2(yb1+D),'L'+n2(X2+1.5)+' '+n2(yb1+D),'L'+n2(X2)+' '+n2(yb1),'Z'].join('');
  const crease=[seg(X1,yb0,X1,yb1),seg(X2,yb0,X2,yb1),seg(X3,yb0,X3,yb1),seg(X4,yb0,X4,yb1),seg(X1,yb0,X2,yb0),seg(X1,yb0-W,X2,yb0-W),seg(X2,yb0,X3,yb0),seg(X4,yb0,X5,yb0),
   seg(X3,yb1,X4,yb1),seg(X3,yb1+W,X4,yb1+W),seg(X2,yb1,X3,yb1),seg(X4,yb1,X5,yb1)];
  const h=yb1+Math.max(W+T,D);
  return {kind:f.kind,w:X5,h,cut:[d],crease,outline:d,safe:3,largest:Math.max(L*Hh,W*Hh,L*W)/100,glue:{x:0,y:yb0,w:X1,h:Hh},dims:{L,W,H:Hh,G,T,D,yb0,yb1},
   areas:[{id:'back',label:'Retro',x:X1,y:yb0,w:L,h:Hh},{id:'side',label:'Fianco',x:X2,y:yb0,w:W,h:Hh},{id:'front',label:'Fronte',x:X3,y:yb0,w:L,h:Hh},{id:'side2',label:'Fianco',x:X4,y:yb0,w:W,h:Hh},{id:'lid',label:'Coperchio (capovolto)',x:X1,y:yb0-W,w:L,h:W,flip:true}]}}
 // pillow: glue flap | back | front, ends closed by lens-shaped flaps (cut bulging out, crease bulging in)
 const [L,Hh]=s,G=12,B=Math.max(10,Math.round(L*.18)),y0=B,y1=B+Hh,X1=G,X2=G+L,X3=G+2*L,arc=(a,b,y,dy)=>'Q'+n2((a+b)/2)+' '+n2(y+2*dy)+' '+n2(b)+' '+n2(y);
 const d='M'+n2(X1)+' '+n2(y0)+arc(X1,X2,y0,-B)+arc(X2,X3,y0,-B)+'L'+n2(X3)+' '+n2(y1)+arc(X3,X2,y1,B)+arc(X2,X1,y1,B)+'L'+n2(X1)+' '+n2(y1-4)+'L0 '+n2(y1-10)+'L0 '+n2(y0+10)+'L'+n2(X1)+' '+n2(y0+4)+'Z';
 const crease=[seg(X1,y0,X1,y1),seg(X2,y0,X2,y1),'M'+n2(X1)+' '+n2(y0)+arc(X1,X2,y0,B),'M'+n2(X2)+' '+n2(y0)+arc(X2,X3,y0,B),'M'+n2(X1)+' '+n2(y1)+arc(X1,X2,y1,-B),'M'+n2(X2)+' '+n2(y1)+arc(X2,X3,y1,-B)];
 return {kind:'pillow',w:X3,h:y1+B,cut:[d],crease,outline:d,safe:4,largest:L*Hh/100,glue:{x:0,y:y0,w:X1,h:Hh},dims:{L,H:Hh,G,B},
  areas:[{id:'back',label:'Retro',x:X1,y:y0+B,w:L,h:Hh-2*B},{id:'front',label:'Fronte',x:X2,y:y0+B,w:L,h:Hh-2*B}]}}

// ---- text: measured with the PDF writer's Helvetica metrics ----
const ptToMm=pt=>pt*25.4/72;
const capMm=size=>ptToMm(size*.718),descMm=size=>ptToMm(size*.207);
const wMm=(s,size,bold)=>ptToMm(PS().textWidth(s,size,bold));
// The x-height of the outlines that go into the print PDF (the «x» of lib/print-glyphs.js), as a share of the size.
let XH=null;
function xRatio(){if(XH)return XH;const G=root.RadixPrintGlyphs||(typeof require==='function'&&typeof module==='object'?lib('RadixPrintGlyphs','./print-glyphs.js'):null);
 if(!G||!G.R||!G.R[120])return 1082/2048;const ys=(G.R[120][1].match(/-?\d+/g)||[]).map(Number).filter((v,i)=>i%2===1);const r=Math.max(...ys)/G.UPM;if(isFinite(r)&&r>0)XH=r;return XH||1082/2048}
const xHeightMm=size=>ptToMm(size)*xRatio();
// Words as segment lists ([{s,bold}] glued without spaces), from runs.
function words(runs){const out=[];let cur=[];const push=()=>{if(cur.length)out.push(cur);cur=[]};
 for(const r of runs){const parts=String(r.s).split(/(\s+)/);for(const p of parts){if(!p)continue;if(/^\s+$/.test(p)){push();continue}const l=cur[cur.length-1];if(l&&l.bold===r.bold)l.s+=p;else cur.push({s:p,bold:r.bold})}}push();return out}
const wordW=(w,size)=>w.reduce((a,x)=>a+wMm(x.s,size,x.bold),0);
// Lines of rich text from `top`: span(yTop, yBottom) → [left, right] available. Returns {lines:[{y, x, segs}], bottom, overflow, long}.
function flow(runs,size,{top,span,lead=1.22,align='left',maxY=Infinity}){const L=ptToMm(size*lead),ws=words(runs),sp=wMm(' ',size,false),lines=[];let y=top+capMm(size),i=0,overflow=false,long=false;
 while(i<ws.length){if(y+descMm(size)>maxY+1e-6){overflow=true;break}const [l,r]=span(y-capMm(size),y+descMm(size)),W=r-l;if(W<=2){y+=L;if(y>maxY+20)break;continue}
  const line=[];let w=0;while(i<ws.length){const ww=wordW(ws[i],size),nw=line.length?w+sp+ww:ww;if(nw<=W+1e-6||!line.length){if(!line.length&&ww>W+1e-6)long=true;line.push(ws[i]);w=nw;i++}else break}
  const x=align==='center'?l+(W-w)/2:align==='right'?r-w:l,segs=[];
  line.forEach((wd,k)=>{wd.forEach((sg,j)=>{const last=segs[segs.length-1],s=(k>0&&j===0?' ':'')+sg.s;if(last&&last.bold===sg.bold)last.s+=s;else if(k>0&&j===0&&last){last.s+=' ';segs.push({s:sg.s,bold:sg.bold})}else segs.push({s,bold:sg.bold})})});
  lines.push({y,x,segs,w});y+=L}
 return {lines,bottom:lines.length?lines[lines.length-1].y+descMm(size):top,overflow,long,lead:L}}

// ---- drawing ----
const mixHex=(a,b,t)=>{const x=[1,3,5].map(i=>parseInt(a.slice(i,i+2),16)),y=[1,3,5].map(i=>parseInt(b.slice(i,i+2),16));return '#'+x.map((v,i)=>Math.round(v*t+y[i]*(1-t)).toString(16).padStart(2,'0')).join('').toUpperCase()};
// A drawing context on the sheet: items in mm, every text with the colour behind it (for the contrast check).
function canvas(){const P=PS(),items=[];const c={items,
 rect(x,y,w,h,fill,o={}){if(fill&&w>0&&h>0)items.push({t:'rect',x,y,w,h,fill,label:o.label||''})},
 path(d,o={}){items.push({t:'path',d,fill:o.fill||null,stroke:o.stroke||null,width:o.width||0,dash:o.dash||null,big:!!o.big,label:o.label||'',die:!!o.die})},
 text(x,y,s,size,o={}){s=clean(s);if(!s)return;items.push({t:'text',x,y,s,size,bold:!!o.bold,fill:o.fill,label:o.label||'',bg:o.bg,legal:!!o.legal,area:o.area,role:o.role||''})},
 // one line fitted to w (shrinks down to min*size), aligned; returns the baseline used and the size
 line(x,y,w,s,size,o={}){s=clean(s);if(!s)return {size:0};let z=size;const min=size*(o.min||.7);while(wMm(s,z,o.bold)>w&&z>min)z=Math.max(min,z-.25);
  const tw=wMm(s,z,o.bold),lx=o.align==='center'?x+(w-tw)/2:o.align==='right'?x+w-tw:x;c.text(lx,y,s,z,o);return {size:z,w:tw,x:lx,fit:wMm(s,z,o.bold)<=w+1e-6}},
 rich(lines,size,o={}){for(const ln of lines){let x=ln.x;for(const sg of ln.segs){c.text(x,ln.y,sg.s,size,{...o,bold:sg.bold||o.bold});x+=wMm(sg.s,size,sg.bold||o.bold)}}},
 logo(brand,x,y,w,h,o={}){const vb=P.viewBox(brand.logo);if(brand.logo&&vb){const s=Math.min(w/vb[2],h/vb[3]),lw=vb[2]*s,lh=vb[3]*s,lx=o.align==='left'?x:o.align==='right'?x+w-lw:x+(w-lw)/2;
   items.push({t:'logo',x:lx,y:y+(h-lh)/2,w:lw,h:lh,svg:o.mono?P.monoSvg(brand.logo,o.mono):brand.logo,vb,bg:o.bg||'#FFFFFF',label:'Logo',area:o.area});return {w:lw,h:lh,x:lx,y:y+(h-lh)/2}}
  const name=clean(brand.name)||'Il tuo marchio';let size=Math.min(ptToMm(1)>0?h/ptToMm(1)*.62:10,40);while(size>5&&wMm(name,size,true)>w)size-=.25;const tw=wMm(name,size,true),lx=o.align==='left'?x:o.align==='right'?x+w-tw:x+(w-tw)/2;
  c.text(lx,y+h/2+capMm(size)/2,name,size,{bold:true,fill:o.mono||P.ink(o.bg||'#FFFFFF',{dark:'#1C1C1E',light:'#FFFFFF'},brand.palette.primary,brand.palette.dark),bg:o.bg,label:'Nome (logotipo)',area:o.area});return {w:tw,h:capMm(size),x:lx,y}}};
 return c}
// The colours of a design: background, ink, soft ink, the variant colour and the readable ink on it.
function colours(style,brand,variant){const P=PS(),pal=brand.palette,light=P.contrast(pal.light||'#FFFFFF','#1C1C1E')>=12?pal.light:'#FFFFFF',vc=pal[variant&&variant.color]||pal.primary;
 const bg=style==='minimal'?'#FFFFFF':light,ink=P.ink(bg,pal,pal.dark,'#1C1C1E'),soft=P.ink(bg,pal,pal.secondary,pal.dark),onV=P.ink(vc,pal,'#FFFFFF',pal.light,pal.dark),vText=P.ink(bg,pal,vc,pal.primary,pal.dark),head=P.ink(bg,pal,pal.primary,pal.dark);
 return {bg,ink,soft,vc,onV,vText,head,primary:pal.primary,accent:pal.accent,onPrimary:P.ink(pal.primary,pal,'#FFFFFF',pal.light,pal.dark)}}
// The span [left, right] of an area between two heights, inside the safe margin (chords on a round label).
function spanFn(a,safe){if(a.round){const {cx,cy,r}=a.round,R=r-safe;return (y0,y1)=>{const dy=Math.max(Math.abs(y0-cy),Math.abs(y1-cy));if(dy>=R)return [cx,cx];const h=Math.sqrt(R*R-dy*dy);return [cx-h,cx+h]}}
 return ()=>[a.x+safe,a.x+a.w-safe]}

// The legal block of a variant as paragraphs [{label, runs}] (only what the person typed).
function legalParas(m,v){const c=m.common,out=[],P=(label,head,text,{rich=false,bold=false}={})=>{const t=block(text);if(!t)return;const e=rich?emphasize(t):{runs:[{s:t,bold}]};out.push({label,runs:merge([...(head?[{s:head+' ',bold:true}]:[]),...e.runs])})};
 if(m.type==='alimentare'){P('Denominazione','',c.legalName,{bold:true});P('Ingredienti','Ingredienti:',v.ingredients,{rich:true});P('Tracce','',v.traces,{rich:true});
  const nu=nutrition(v);if(nu.complete&&!m.nutriExempt)P('Dichiarazione nutrizionale','',nu.text);
  P('Conservazione','',c.storage);P('Istruzioni','',c.usage)}
 else if(m.type==='cosmetico'){P('Funzione','',c.legalName,{bold:true});P('Ingredienti','Ingredients:',v.ingredients);P('Modo d’uso','',c.usage);P('Precauzioni','Avvertenze:',c.precautions)}
 else{P('Descrizione','',c.legalName,{bold:true});P('Materiali','Materiali:',c.materials);P('Uso','',c.usage);P('Avvertenze','Avvertenze:',c.precautions)}
 const date=m.type==='cosmetico'?(m.dateKind==='tmc'?'Usare preferibilmente entro: vedi riquadro.':''):m.type==='alimentare'?(m.dateKind==='scadenza'?'Da consumare entro: vedi riquadro.':'Da consumarsi preferibilmente entro: vedi riquadro.'):'';
 const lot=m.stampBox?'Lotto: vedi riquadro.':'';if(date||lot)out.push({label:'Lotto e data',runs:[{s:[date,lot].filter(Boolean).join(' '),bold:false}]});
 if(m.type==='cosmetico')P('Persona responsabile','Persona responsabile:',c.producer);else P('Operatore','Prodotto da:',c.producer);
 P('Stabilimento','Stabilimento:',c.plant);P('Origine','',c.origin);P('Altro','',c.extra);return out}
// The front texts.
const fullName=(m,v)=>clean(m.name)||'Nome del prodotto';

// One variant on the sheet, in a style. Returns the document (print-studio shape) with the checks' raw data.
function draw(m,brand,vi,{style}={}){const g=geometry(m.format,m.size),f=formatOf(m.format),st=style||m.style||'classica',v=m.variants[vi]||m.variants[0],col=colours(st,brand,v),c=canvas(),warnings=[],P=PS();
 const S=g.safe,B=BLEED;
 // background to the bleed (the glue flap stays unprinted)
 if(g.glue){c.rect(g.glue.w-B,-B,g.w-g.glue.w+2*B,g.h+2*B,col.bg,{label:'Fondo'})}else c.rect(-B,-B,g.w+2*B,g.h+2*B,col.bg,{label:'Fondo'});
 const info={paras:legalParas(m,v),size:0,area:null};
 if(st==='classica'&&(g.kind==='round'||g.kind==='rect'||g.kind==='wrap')){const r0=g.areas[0].round;c.path(r0?circle(r0.cx,r0.cy,r0.r-FRAME):roundRect(FRAME,FRAME,g.w-2*FRAME,g.h-2*FRAME,1.2),{stroke:col.vc,width:.75,label:'Cornice'})}
 for(const a of g.areas)drawArea(c,a,{m,v,f,g,brand,col,st,info,warnings,vi});
 const doc={format:'packaging-'+f.id,variant:st,title:fullName(m,v)+(clean(v.name)?' · '+clean(v.name):'')+' · '+f.title,margin:S,brand,values:{name:brand.name},dpi:300,
  pages:[{label:f.title+(clean(v.name)?' · '+clean(v.name):''),w:g.w,h:g.h,items:c.items,folds:[],foldsY:[],hidden:null}],warnings,geometry:g,info:{size:info.size,overflow:!!info.overflow,placed:!!info.placed},ean:info.ean||null};
 if(m.sample)doc.pages[0].slugTexts=[{s:'DATI DI ESEMPIO · non stampare',x:BLEED+6+2,y:BLEED+6-2.2,size:6,bold:true}];
 return doc}
// Lay out one area of the sheet.
function drawArea(c,a,ctx){const {m,v,f,g,brand,col,st,info,warnings}=ctx,S=g.safe,P=PS(),sub=canvas(),k=Math.max(.6,Math.min(1.6,Math.min(a.w,a.h)/55));
 const inner={x:a.x+S,y:a.y+S,w:a.w-2*S,h:a.h-2*S};
 const id=a.id,front=id==='front'||id==='all',isLid=!!f.lid||!m.infoOn,legal=(id==='back'||id==='all')&&!isLid,isRound=!!a.round;
 const out=sub;// items of this area (flipped afterwards for the back of the topper and the lid)
 if(id==='lid'){out.logo(brand,inner.x+inner.w*.15,inner.y+inner.h*.15,inner.w*.7,inner.h*.7,{mono:st==='artigianale'?col.onPrimary:null,bg:st==='artigianale'?col.primary:col.bg,area:a});
  if(st==='artigianale'){c.rect(a.x,a.y,a.w,a.h,col.primary,{label:'Coperchio'})}}
 else if(id==='side2'){const lh=Math.min(inner.h*.18,inner.w*.6);out.logo(brand,inner.x,inner.y+4,inner.w,lh,{bg:col.bg,area:a});
  if(clean(v.name)){const runs=[{s:clean(v.name),bold:true}],fl=flow(runs,Math.min(10,7*k),{top:inner.y+lh+10,span:()=>[inner.x,inner.x+inner.w],align:'center',maxY:inner.y+inner.h});out.rich(fl.lines,Math.min(10,7*k),{fill:col.vText,bg:col.bg,label:'Variante',area:a})}
  if(m.stampBox)stampBox(out,inner.x+(inner.w-Math.min(inner.w,30))/2,inner.y+inner.h-11,Math.min(inner.w,30),11,col,a)}
 else if(id==='side'&&g.kind==='tuck'){placeEan(out,inner,v,info,col,a,{bottom:true})}
 else{
  let y=inner.y;const span=spanFn(a,S),areaW=inner.w;
  if(front&&isRound&&!legal){// a front-only round label: the stack centred in the circle, smaller until it stays in the safe circle
   let kk=k,best=null;for(let i=0;i<14;i++){const t=canvas();drawFront(t,a,inner,{m,v,f,g,brand,col,st,k:kk,span,isRound,isLid,warnings,info});centerRound(t.items,a);best=t;
    if(t.items.every(it=>{const bb=bboxOf(it);return !bb||!it.area||insideShape(bb,it.area,g)}))break;kk*=.9}
   out.items.push(...best.items)}
  else if(front)y=drawFront(out,a,inner,{m,v,f,g,brand,col,st,k,span,isRound,isLid,warnings,info});
  if(legal&&!isLid){const back=id==='back';drawLegal(out,a,inner,{m,v,g,col,st,k,span,isRound,info,top:front?y+1.5:inner.y,warnings,withEan:g.kind!=='wrap'||false,f})}
  if(id==='side')drawSide(out,a,inner,{m,v,col,info,k})}
 // the style's frame and bands drawn under the texts
 const under=[];
 if(st==='classica'&&g.kind==='topper'){const inset=FRAME;under.push({t:'path',d:roundRect(a.x+inset,a.y+inset,a.w-2*inset,a.h-2*inset,1.2),fill:null,stroke:col.vc,width:.75,label:'Cornice'})}
 const items=under.concat(out.items);if(a.flip)for(const it of items)flip(it,a);
 c.items.push(...items)}
// Centres the front stack of a round label on the circle (the full band of «Artigianale» stays anchored at the top).
function centerRound(items,a){let y0=Infinity,y1=-Infinity;for(const it of items){if(it.label==='Fascia')continue;const bb=bboxOf(it)||(it.t==='rect'||it.t==='path'&&it.h?{y0:it.y,y1:it.y+it.h}:null);if(!bb)continue;y0=Math.min(y0,bb.y0);y1=Math.max(y1,bb.y1)}
 if(!isFinite(y0))return;const dy=a.round.cy-(y0+y1)/2;if(Math.abs(dy)<.2)return;for(const it of items){if(it.label==='Fascia'){it.h=Math.max(0,it.h+dy);continue}shift(it,0,dy)}}
// Upside down inside its area (the back of the bag topper, the box lid): what reads right once folded.
function flip(it,a){const X=x=>2*a.x+a.w-x,Y=y=>2*a.y+a.h-y;
 if(it.t==='rect'){it.x=X(it.x+it.w);it.y=Y(it.y+it.h)}
 else if(it.t==='text'){it.x=X(it.x);it.y=Y(it.y);it.rot=180}
 else if(it.t==='logo'){it.x=X(it.x+it.w);it.y=Y(it.y+it.h);it.rot=180}
 else if(it.t==='path'){it.d=String(it.d).replace(/([MLHVQA])([^MLHVQAZ]*)/g,(m0,cmd,args)=>{const v=args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
   if(cmd==='A'){return 'A'+v[0]+' '+v[1]+' '+v[2]+' '+v[3]+' '+v[4]+' '+n2(X(v[5]))+' '+n2(Y(v[6]))}
   if(cmd==='H')return 'H'+n2(X(v[0]));if(cmd==='V')return 'V'+n2(Y(v[0]));const o=[];for(let i=0;i+1<v.length;i+=2)o.push(n2(X(v[i]))+' '+n2(Y(v[i+1])));return cmd+o.join(' ')})}}
// Front: logo, name, variant, payoff, net quantity, illustration. Returns the y under it.
function drawFront(c,a,inner,{m,v,f,g,brand,col,st,k,span,isRound,isLid,info}){const P=PS(),alone=a.id==='all',hasLegal=alone&&!isLid,cx=inner.x+inner.w/2,c0=c;c=canvas();
 const name=fullName(m,v),vname=clean(v.name),net=clean(v.net);
 // sizes: the name takes the room the area gives
 const nameSize=Math.max(9,Math.min(30,(hasLegal?11:16)*k)),vSize=Math.max(7,Math.min(16,(hasLegal?8:10)*k)),netSize=Math.max(7,Math.min(14,(hasLegal?7.5:9.5)*k));
 const logoH=Math.min(inner.h*(hasLegal?.16:.24),inner.w*.3,(hasLegal?12:20)*k),align=st==='minimal'&&!isRound?'left':'center';
 let y=inner.y+(isRound?inner.h*(hasLegal?.04:.1):0);
 const air=isRound?inner.w*.07:0,sp=(y0,y1)=>{const [l,r]=span(y0,y1);return [Math.max(l,inner.x)+air,Math.min(r,inner.x+inner.w)-air]};
 if(st==='artigianale'){// a full band with the logo in one colour
  const bandH=logoH+ (isRound?inner.h*.12:6)+(isRound?g.safe:0);
  const top=a.y-(a.y===0?BLEED:0);if(isRound){c.rect(a.x-BLEED,top,a.w+2*BLEED,a.y+(isRound?g.safe:0)+bandH-top,col.primary,{label:'Fascia'})}else c.rect(a.x-(a.x===0?BLEED:0),top,a.w+(a.x===0?BLEED:0)+(a.x+a.w>=g.w-.01?BLEED:0),inner.y+bandH-top,col.primary,{label:'Fascia'});
  const ly=isRound?a.y+g.safe+bandH*.42:inner.y+3,lw=sp(ly,ly+logoH);c.logo(brand,lw[0],ly,lw[1]-lw[0],logoH,{mono:col.onPrimary,bg:col.primary,area:a});y=(isRound?a.y+g.safe:inner.y)+bandH+3}
 else if(st==='minimal'){const lw=sp(y,y+logoH*.8);c.logo(brand,lw[0],y,lw[1]-lw[0],logoH*.8,{align,bg:col.bg,area:a});y+=logoH*.8+3}
 else{const lw=sp(y,y+logoH);c.logo(brand,lw[0],y,lw[1]-lw[0],logoH,{bg:col.bg,area:a});y+=logoH+2.5}
 // illustration (front only, contained)
 if(m.illustration&&m.illustration.src&&!hasLegal){const box=Math.min(inner.h*.3,inner.w*.55),r=m.illustration.w&&m.illustration.h?m.illustration.w/m.illustration.h:1,iw=r>=1?box:box*r,ih=r>=1?box/r:box;
  c.items.push({t:'image',photo:true,x:cx-iw/2,y,w:iw,h:ih,src:m.illustration.src,px:{w:m.illustration.w,h:m.illustration.h},bg:col.bg,label:'Illustrazione',area:a});y+=ih+2.5}
 // name (two lines at most)
 const nRuns=[{s:name,bold:true}];let ns=nameSize,fl;for(;;){fl=flow(nRuns,ns,{top:y,span:sp,align,lead:1.08});if(fl.lines.length<=2&&!fl.long||ns<=7)break;ns-=.5}
 c.rich(fl.lines.slice(0,2),ns,{fill:st==='minimal'?col.ink:col.head,bg:col.bg,label:'Nome del prodotto',area:a,role:'name'});y=fl.bottom+2;
 if(st==='minimal'&&!isRound){c.rect(inner.x,y,10,.6,col.vc,{label:'Filetto'});y+=2.4}
 // variant
 if(vname){if(st==='classica'){const bh=ptToMm(vSize)*1.75,[l,r]=sp(y,y+bh),bx=a.round?l-air*.6:inner.x,bw=a.round?r-l+air*1.2:inner.w;c.rect(bx,y,bw,bh,col.vc,{label:'Fascia della variante'});c.line(l,y+bh/2+capMm(vSize)/2,r-l,vname,vSize,{bold:true,fill:col.onV,bg:col.vc,align:'center',label:'Variante',area:a});y+=bh+2}
  else if(st==='artigianale'){const tw=Math.min(wMm(vname,vSize,true)+6,inner.w),bh=ptToMm(vSize)*1.7,bx=cx-tw/2;c.path(roundRect(bx,y,tw,bh,bh/2),{fill:col.vc,label:'Nastro della variante'});c.line(bx+3,y+bh/2+capMm(vSize)/2,tw-6,vname,vSize,{bold:true,fill:col.onV,bg:col.vc,align:'center',label:'Variante',area:a});y+=bh+2}
  else{const [l,r]=sp(y,y+ptToMm(vSize));c.line(l,y+capMm(vSize),r-l,vname,vSize,{bold:true,fill:col.vText,bg:col.bg,align,label:'Variante',area:a});y+=ptToMm(vSize)+1.5}}
 if(clean(m.payoff)&&!hasLegal){const pf=flow([{s:clean(m.payoff),bold:false}],Math.max(6.5,vSize*.85),{top:y,span:sp,align});c.rich(pf.lines.slice(0,2),Math.max(6.5,vSize*.85),{fill:col.soft,bg:col.bg,label:'Frase',area:a});y=pf.bottom+2}
 if(st==='artigianale'&&!isRound&&!hasLegal){const [l,r]=sp(y,y);const w=Math.min(r-l,24);c.rect(cx-w/2,y,w,.35,col.accent,{label:'Filetto'});c.rect(cx-w/2,y+1,w,.35,col.accent,{label:'Filetto'});y+=2.6}
 // net quantity: same visual field as the name; at the bottom of a front-only area
 let netLine=null;const yUsed=y;
 if(net){const nq=netOf(net),z=Math.min(40,Math.max(netSize,nq&&m.type!=='altro'?netMinFigure(nq.grams)/ptToMm(FIG)+.25:0)),bot=hasLegal||isRound?null:inner.y+inner.h-descMm(z)-(isRound?inner.h*.08:0);const yy=bot!=null?Math.max(y+capMm(z),bot):y+capMm(z);const [l,r]=sp(yy-capMm(z),yy+descMm(z));
  netLine={l,r,yy,z,net};y=yy+descMm(z)+1.5}
 // a front-only rectangular area: the stack centred in the room above the net quantity
 if(!hasLegal&&!isRound&&!a.flip){const room=(netLine?netLine.yy-capMm(netLine.z)-3:inner.y+inner.h)-inner.y,used=(netLine?yUsed:y)-inner.y,dy=Math.max(0,(room-used)/2)*(st==='artigianale'?0:1);if(dy>.5)for(const it of c.items)shift(it,0,dy)}
 if(netLine)c.line(netLine.l,netLine.yy,netLine.r-netLine.l,netLine.net,netLine.z,{bold:true,fill:col.ink,bg:col.bg,align,label:'Quantità netta',area:a,legal:true,role:'net',min:1});
 c0.items.push(...c.items);return y}
// Moves an item by (dx, dy) mm.
function shift(it,dx,dy){if(it.t==='rect'||it.t==='text'||it.t==='logo'||it.t==='image'){it.x+=dx;it.y+=dy}
 else if(it.t==='path')it.d=String(it.d).replace(/([MLHVQA])([^MLHVQAZ]*)/g,(m0,cmd,args)=>{const v=args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if(cmd==='A')return 'A'+v.slice(0,5).join(' ')+' '+n2(v[5]+dx)+' '+n2(v[6]+dy);if(cmd==='H')return 'H'+n2(v[0]+dx);if(cmd==='V')return 'V'+n2(v[0]+dy);const o=[];for(let i=0;i+1<v.length;i+=2)o.push(n2(v[i]+dx)+' '+n2(v[i+1]+dy));return cmd+o.join(' ')})}
// The mandatory texts, fitted: the largest size from 7.5 pt down to 4.5 pt that lets everything in.
function drawLegal(c,a,inner,{m,v,g,col,st,k,span,isRound,info,top,withEan,f}){const paras=info.paras,P=PS(),sp=(y0,y1)=>{const [l,r]=span(y0,y1);return [Math.max(l,inner.x),Math.min(r,inner.x+inner.w)]};
 const ean=eanStatus(v.ean),wantEan=ean.state==='ok'&&g.kind!=='tuck'&&g.kind!=='wrap'&&!isRound;
 const boxW=m.stampBox?Math.min(28,inner.w*.45):0,boxH=m.stampBox?10:0;
 // the bottom strip: EAN and the stamp box side by side (rectangular areas)
 // the barcode as tall as GS1 asks; shortened only when the mandatory texts would otherwise go under the legal x-height
 const zMin=m.type==='alimentare'?(m.small?.9:1.2)/xHeightMm(1):0;
 const run=(cap,c)=>{(()=>{let bottom=inner.y+inner.h,eanPlaced=null;
 if(!isRound&&(wantEan||m.stampBox)){let s=0,bw=boxW,stacked=false;const fit=r=>Math.min(1,r/eanWidth(1));
  if(wantEan){s=fit(inner.w-(m.stampBox?bw+3:0));
   if(s<EAN.MIN&&m.stampBox){const bw2=inner.w-3-eanWidth(EAN.MIN);if(bw2>=17){bw=Math.min(bw,bw2);s=fit(inner.w-bw-3)}else{stacked=true;s=fit(inner.w)}}
   if(s<EAN.MIN){info.ean={placed:false,reason:'room',scale:s};s=0}}
  const eh=s?Math.min(eanHeight(s),Math.max(eanHeight(s,EAN.TRUNC_MIN),cap)):0,stripH=stacked?eh+boxH+2:Math.max(eh,boxH);
  if(s){const trunc=eh<eanHeight(s)-1e-6?Math.max(EAN.TRUNC_MIN,(eh-eanHeight(s,0))/(EAN.BAR*s)):1,e=eanItems(ean.code,inner.x+inner.w-eanWidth(s),inner.y+inner.h-eanHeight(s,trunc),s,{trunc});c.items.push(...e.items.map(it=>({...it,area:it.t==='text'?a:undefined})));info.ean={placed:true,scale:s,trunc}}
  if(m.stampBox)stampBox(c,inner.x,inner.y+inner.h-(stacked?eh+2:0)-boxH,bw,boxH,col,a);
  bottom=inner.y+inner.h-stripH-2.5}
 else if(isRound&&m.stampBox){const w=Math.min(26,inner.w*.42),[l,r]=sp(inner.y+inner.h-boxH-2,inner.y+inner.h-2);const yb=inner.y+inner.h-boxH-(a.round?a.round.r*.12:0);const sp2=span(yb,yb+boxH);stampBox(c,(sp2[0]+sp2[1])/2-w/2,yb,w,boxH,col,a);bottom=yb-1.5}
 if(ean.state==='ok'&&!wantEan&&g.kind!=='tuck'&&g.kind!=='wrap')info.ean={placed:false,reason:isRound?'round':'room'};
 if(!paras.length){info.size=info.size||0;info.placed=true;return}
 const align=isRound?'center':'left';let chosen=null;
 for(let z=7.5;z>=4.5-1e-9;z-=.25){let y=top,ok=true;const lines=[];for(const p of paras){const fl=flow(p.runs,z,{top:y,span:sp,align,maxY:bottom,lead:1.18});if(fl.overflow||fl.long){ok=false;break}lines.push([p,fl]);y=fl.bottom+ptToMm(z)*.45}
  if(ok){chosen={z,lines};break}}
 if(!chosen){const z=4.5;let y=top;const lines=[];for(const p of paras){const fl=flow(p.runs,z,{top:y,span:sp,align,maxY:bottom,lead:1.18});lines.push([p,fl]);y=fl.bottom+ptToMm(z)*.32;if(fl.overflow)break}chosen={z,lines,overflow:true}}
 for(const [p,fl] of chosen.lines)c.rich(fl.lines,chosen.z,{fill:p.label==='Denominazione'||p.label==='Funzione'||p.label==='Descrizione'?col.ink:col.ink,bg:col.bg,label:p.label,area:a,legal:true});
 info.size=chosen.z;info.overflow=!!chosen.overflow;info.placed=true;
 if(m.type==='cosmetico'&&m.dateKind==='pao'&&m.pao){const s=Math.min(9,Math.max(6,inner.w*.08));const last=chosen.lines[chosen.lines.length-1];const yy=last?last[1].bottom+1.5:top;if(yy+s<=bottom+1e-6){const [l]=sp(yy,yy+s);pao(c,isRound?(inner.x+inner.w/2-s/2):l,yy,s,m.pao,col,a)}else info.paoOut=true}})();return info.size||0};
 let pick=null;for(const cap of [1e9,inner.h*.5,inner.h*.42,inner.h*.34,0]){const z=run(cap,canvas());if(!pick||z>pick.z+1e-9)pick={cap,z};if(z+1e-9>=zMin&&!info.overflow)break}
 run(pick.cap,c)}
// The white box for the lot and the date stamped by the producer.
function stampBox(c,x,y,w,h,col,a){c.rect(x,y,w,h,'#FFFFFF',{label:'Riquadro lotto e data'});c.path(roundRect(x,y,w,h,0),{stroke:col.ink,width:.5,label:'Riquadro lotto e data'});
 const z=5;c.text(x+1.2,y+1.2+capMm(z),'Lotto e data',z,{fill:'#4D4D4D',bg:'#FFFFFF',label:'Riquadro lotto e data',area:a})}
// The PAO symbol (open jar) with the months, e.g. «12M».
function pao(c,x,y,s,months,col,a){const ink=col.ink;c.path(poly([[x+s*.12,y+s*.38],[x+s*.88,y+s*.38],[x+s*.8,y+s],[x+s*.2,y+s]])+'Z',{stroke:ink,width:.6,label:'PAO'});
 c.path(poly([[x+s*.1,y+s*.3],[x+s*.84,y+s*.06],[x+s*.88,y+s*.18],[x+s*.14,y+s*.42]])+'Z',{stroke:ink,width:.6,label:'PAO'});
 const z=Math.max(5,s*1.2),t=months+'M';c.text(x+s/2-wMm(t,z,true)/2,y+s*.78,t,z,{bold:true,fill:ink,bg:col.bg,label:'PAO',area:a,legal:true})}
// The side panel of the wrap label: EAN and the stamp box.
function drawSide(c,a,inner,{m,v,col,info,k}){const ean=eanStatus(v.ean);let y=inner.y+inner.h;
 if(m.stampBox){const w=Math.min(inner.w,30);stampBox(c,inner.x+(inner.w-w)/2,y-10,w,10,col,a);y-=13}
 if(ean.state==='ok')placeEan(c,{...inner,h:y-inner.y},v,info,col,a,{bottom:true})}
function placeEan(c,inner,v,info,col,a){const ean=eanStatus(v.ean);if(ean.state!=='ok')return;let s=Math.min(1,inner.w/eanWidth(1));if(s<EAN.MIN){info.ean={placed:false,reason:'room',scale:s};return}
 let trunc=1;if(eanHeight(s)>inner.h){trunc=(inner.h-eanHeight(s,0))/(EAN.BAR*s);if(trunc<EAN.TRUNC_MIN){info.ean={placed:false,reason:'room',scale:s};return}}
 const e=eanItems(ean.code,inner.x+(inner.w-eanWidth(s))/2,inner.y+inner.h-eanHeight(s,trunc),s,{trunc});c.items.push(...e.items.map(it=>({...it,area:it.t==='text'?a:undefined})));info.ean={placed:true,scale:s,trunc}}

// ---- the die line: same page as the artwork, 100 % magenta, cut solid, creases dashed (lib/coordinato-studio.js) ----
function dieDoc(m,brand){const g=geometry(m.format,m.size),f=formatOf(m.format),c=canvas();
 for(const d of g.cut)c.path(d,{stroke:DIE,width:DIE_W,label:'Taglio',die:true});
 for(const d of g.crease)c.path(d,{stroke:DIE,width:DIE_W,dash:DIE_DASH.slice(),label:'Cordonatura',die:true});
 const z=5.5,legend=['Fustella · '+f.title+' · '+sizeText(m.format,m.size),'Linea continua = taglio'+(g.crease.length?' · tratteggio = cordonatura (piega)':''),'Magenta 100 %: non si stampa'];
 const slugTexts=[{s:legend.join('   ·   ').replace(/ · Linea/,' · Linea'),x:BLEED+6,y:BLEED+6+g.h+BLEED+3.6,size:z,bold:false}];
 return {format:'packaging-'+f.id+'-fustella',variant:'die',title:'Fustella · '+f.title,margin:0,brand,values:{name:brand.name},dpi:300,guide:true,
  pages:[{label:'Fustella · '+f.title,w:g.w,h:g.h,items:c.items,folds:[],foldsY:[],hidden:null,slugTexts}],warnings:[],geometry:g}}

// ---- SVG: previews, the flat mockup file ----
let svgN=0;
// opts: {bleed: show the bleed washed out, die: overlay the die line, safe: the safe line, layers: named groups (mockup), clip: cut to the outline, px: width in px}
function labelSvg(doc,{bleed=false,die=true,safe=false,layers=false,clip=false,px=0}={}){const P=PS(),p=doc.pages[0],g=doc.geometry,B=bleed?BLEED:0,id='pk'+(++svgN),W=g.w+2*B,H=g.h+2*B;
 const o=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[-B,-B,W,H].map(n2).join(' ')+'" width="'+(px?px:n2(W)+'mm')+'" height="'+(px?Math.round(px*H/W):n2(H)+'mm')+'">'];
 o.push('<defs><clipPath id="'+id+'c"><path d="'+(clip?g.outline:roundRect(-B,-B,W,H,0))+'"/></clipPath></defs>');
 o.push('<g'+(layers?' id="grafica" data-name="Grafica"':'')+' clip-path="url(#'+id+'c)">');for(const it of p.items)o.push(P.itemSvg(it));o.push('</g>');
 if(bleed)o.push('<path fill="#ffffff" fill-opacity=".6" fill-rule="evenodd" d="'+roundRect(-B,-B,W,H,0)+' '+g.outline+'"/>');
 if(safe){const s=g.safe;for(const a of g.areas){if(a.id==='lid')continue;o.push('<path d="'+(a.round?circle(a.round.cx,a.round.cy,a.round.r-s):roundRect(a.x+s,a.y+s,a.w-2*s,a.h-2*s,0))+'" fill="none" stroke="#2f80ed" stroke-width="'+n2(Math.max(.15,g.w/900))+'" stroke-dasharray="1.2 .9"/>')}}
 if(die){const sw=n2(Math.max(.2,g.w/650));o.push('<g'+(layers?' id="fustella" data-name="Fustella (non si stampa)"':'')+' fill="none" stroke="'+DIE+'" stroke-width="'+sw+'">');
  for(const d of g.cut)o.push('<path d="'+d+'"'+(layers?'':' stroke-dasharray="'+n2(Math.max(1,g.w/120))+' '+n2(Math.max(.6,g.w/220))+'"')+'/>');for(const d of g.crease)o.push('<path d="'+d+'" stroke-dasharray="'+n2(Math.max(.8,g.w/180))+' '+n2(Math.max(.6,g.w/260))+'"/>');o.push('</g>')}
 o.push('</svg>');return o.join('')}

// ---- checks ----
// state: ok | warn | fail. The legal list is always «da verificare con il consulente».
function insideShape(bb,a,g){const s=g.safe-1e-6;if(a.round){const {cx,cy,r}=a.round,R=r-s;return [[bb.x0,bb.y0],[bb.x1,bb.y0],[bb.x0,bb.y1],[bb.x1,bb.y1]].every(([x,y])=>Math.hypot(x-cx,y-cy)<=R+1e-6)}
 return bb.x0>=a.x+s&&bb.x1<=a.x+a.w-s&&bb.y0>=a.y+s&&bb.y1<=a.y+a.h-s}
function bboxOf(it){if(it.t==='text'){const w=wMm(it.s,it.size,it.bold);return it.rot===180?{x0:it.x-w,x1:it.x,y0:it.y-descMm(it.size),y1:it.y+capMm(it.size)}:{x0:it.x,x1:it.x+w,y0:it.y-capMm(it.size),y1:it.y+descMm(it.size)}}
 if(it.t==='logo'||it.t==='image')return {x0:it.x,x1:it.x+it.w,y0:it.y,y1:it.y+it.h};return null}
function legalChecklist(m,docs){const c=m.common,vs=m.variants,all=f=>vs.every(f),some=f=>vs.some(f),out=[],row=(id,label,ok,detail)=>out.push({id,label,state:ok===true?'ok':ok===null?'info':'todo',detail});
 const lidOnly=formatOf(m.format).lid;
 if(m.type==='alimentare'){
  row('denominazione','Denominazione dell’alimento',!!clean(c.legalName),clean(c.legalName)?'«'+clean(c.legalName)+'»: è la denominazione legale o usuale, non il nome di fantasia?':'Scrivi la denominazione legale o usuale (es. «Biscotti di farina di mais»): il nome di fantasia non basta.');
  row('ingredienti','Elenco degli ingredienti',all(v=>!!clean(v.ingredients)),all(v=>!!clean(v.ingredients))?'In ordine di peso decrescente, preceduto da «Ingredienti».':'Manca in: '+vs.filter(v=>!clean(v.ingredients)).map(v=>clean(v.name)||'variante').join(', ')+'.');
  const found=[...new Set(vs.flatMap(v=>emphasize(v.ingredients).found.concat(emphasize(v.traces).found)))];
  row('allergeni','Allergeni evidenziati nell’elenco',null,found.length?'Messi in grassetto in automatico: '+found.map(allergenLabel).map(s=>s.toLowerCase()).join(', ')+'. Controlla che non ne manchi nessuno (anche nei semilavorati) e le «tracce».':'Nessuno dei 14 allergeni riconosciuto nel testo: controlla che sia davvero così.');
  row('quid','Quantità degli ingredienti messi in evidenza (QUID)',null,'Se un ingrediente compare nel nome o nelle immagini (es. «al cacao»), va indicata la sua percentuale nell’elenco.');
  row('netta','Quantità netta',all(v=>!!netOf(v.net)),all(v=>!!netOf(v.net))?'Nello stesso campo visivo del nome. Altezza minima delle cifre: 2 mm fino a 50 g, 3 mm fino a 200 g, 4 mm fino a 1 kg, 6 mm oltre.':'Scrivi la quantità con l’unità (es. «250 g», «500 ml») per ogni variante.');
  row('data',m.dateKind==='scadenza'?'Data di scadenza («da consumare entro»)':'Termine minimo di conservazione («da consumarsi preferibilmente entro»)',m.stampBox?true:false,m.stampBox?'Riquadro bianco per la data stampata a parte: «da consumare entro» per i deperibili, «preferibilmente entro» per gli altri.':'Senza riquadro: la data deve comparire in un altro punto della confezione.');
  row('conservazione','Condizioni di conservazione e d’uso',null,clean(c.storage)?'«'+clean(c.storage).slice(0,80)+'»':'Obbligatorie se il prodotto richiede condizioni particolari (es. «conservare in luogo fresco e asciutto»).');
  row('operatore','Nome o ragione sociale e indirizzo dell’operatore',!!clean(c.producer),clean(c.producer)?'«'+clean(c.producer).slice(0,90)+'»':'Scrivi chi mette in commercio il prodotto, con l’indirizzo.');
  row('stabilimento','Sede dello stabilimento (Italia, D.Lgs. 145/2017)',null,clean(c.plant)?'«'+clean(c.plant).slice(0,80)+'»':'Se lo stabilimento di produzione o confezionamento è diverso dalla sede dell’operatore.');
  row('lotto','Lotto di produzione',m.stampBox?true:false,m.stampBox?'Nel riquadro bianco, timbrato o stampato a parte.':'Senza riquadro: il lotto deve stare su un’altra parte della confezione.');
  row('origine','Paese d’origine o luogo di provenienza',null,clean(c.origin)?'«'+clean(c.origin).slice(0,80)+'»':'Obbligatorio quando ometterlo può trarre in inganno e per alcuni alimenti (carni, miele, ortofrutta, olio…), o se l’ingrediente primario ha un’origine diversa.');
  const nu=vs.map(v=>nutrition(v));
  row('nutrizionale','Dichiarazione nutrizionale',m.nutriExempt?null:nu.every(x=>x.complete),m.nutriExempt?'Indicata come esente: va verificato (Allegato V, es. punto 19 per i prodotti artigianali forniti direttamente dal produttore in piccole quantità al consumatore o a negozi locali; punto 18 per confezioni con la superficie maggiore sotto 25 cm²).':nu.every(x=>x.complete)?'Energia, grassi, saturi, carboidrati, zuccheri, proteine e sale per 100 g o 100 ml: valori tuoi, da analisi o calcolo documentato.':'Mancano valori in: '+vs.filter((v,i)=>!nu[i].complete).map(v=>clean(v.name)||'variante').join(', ')+'. Se il prodotto è esente (Allegato V) spuntalo; RADIX non stima i valori.');
  const xs=docs.map(d=>legalSize(d)).filter(Boolean),min=m.small?.9:1.2,xh=xs.length?Math.min(...xs.map(x=>x.xh)):0;
  row('xheight','Altezza della «x» ≥ '+mmText(min)+' mm'+(m.small?' (confezione sotto 80 cm²)':''),xs.length?xh+1e-9>=min:null,xs.length?'Misurata sul testo stampato: '+mmText(Math.floor(xh*100)/100)+' mm (testo a '+mmText(Math.min(...xs.map(x=>x.size)))+' pt).'+(m.small?'':' 0,9 mm solo se la superficie maggiore della confezione è sotto 80 cm².'):'Nessun testo obbligatorio sull’etichetta.');
  if(lidOnly)row('tappo','L’etichetta del tappo da sola non basta',null,'Le informazioni obbligatorie vanno sull’etichetta del vasetto, nello stesso campo visivo per nome e quantità.')}
 else if(m.type==='cosmetico'){
  row('responsabile','Persona responsabile: nome e indirizzo',!!clean(c.producer),clean(c.producer)?'«'+clean(c.producer).slice(0,90)+'»':'Nome o ragione sociale e indirizzo della persona responsabile nell’UE.');
  row('contenuto','Contenuto nominale (peso o volume)',all(v=>!!netOf(v.net)),all(v=>!!netOf(v.net))?'Al momento del confezionamento.':'Scrivi il contenuto con l’unità (es. «50 ml»).');
  row('durata',m.dateKind==='pao'?'Periodo dopo l’apertura (PAO)':'Data di durata minima',m.dateKind==='pao'?!!m.pao:m.stampBox,m.dateKind==='pao'?(m.pao?'Simbolo del vasetto aperto con «'+m.pao+'M»: per i prodotti che durano più di 30 mesi.':'Scrivi i mesi dopo l’apertura.'):'«Usare preferibilmente entro»: per i prodotti che durano 30 mesi o meno, nel riquadro bianco.');
  row('precauzioni','Precauzioni particolari d’impiego',null,clean(c.precautions)?'«'+clean(c.precautions).slice(0,80)+'»':'Quelle richieste per le sostanze usate (allegati del regolamento) e le avvertenze utili.');
  row('lotto','Numero di lotto',m.stampBox?true:false,m.stampBox?'Nel riquadro bianco.':'Senza riquadro: va su un’altra parte della confezione.');
  row('funzione','Funzione del prodotto',!!clean(c.legalName),clean(c.legalName)?'«'+clean(c.legalName)+'»':'Se non è chiara dalla presentazione (es. «crema mani nutriente»).');
  row('inci','Elenco ingredienti (INCI)',all(v=>!!clean(v.ingredients)),all(v=>!!clean(v.ingredients))?'Preceduto da «Ingredients», in ordine decrescente di peso, con i nomi INCI.':'Manca in: '+vs.filter(v=>!clean(v.ingredients)).map(v=>clean(v.name)||'variante').join(', ')+'.');
  row('origine','Paese d’origine',null,'Obbligatorio per i prodotti fabbricati fuori dall’UE.');
  row('lingua','Lingua italiana',null,'Contenuto, durata, precauzioni e funzione in italiano per la vendita in Italia.')}
 else{
  row('denominazione','Nome o descrizione del prodotto',!!clean(c.legalName),clean(c.legalName)?'«'+clean(c.legalName)+'»':'Cosa è il prodotto, in italiano.');
  row('produttore','Produttore o importatore: nome e sede',!!clean(c.producer),clean(c.producer)?'«'+clean(c.producer).slice(0,90)+'»':'Nome, ragione sociale o marchio e sede di chi produce o importa nell’UE.');
  row('materiali','Materiali e sostanze',null,clean(c.materials)?'«'+clean(c.materials).slice(0,80)+'»':'Quando sono importanti per la qualità o per la sicurezza.');
  row('avvertenze','Istruzioni e avvertenze',null,clean(c.precautions)?'«'+clean(c.precautions).slice(0,80)+'»':'Le precauzioni d’uso e le eventuali sostanze pericolose (es. candele: avvertenze sulla fiamma).');
  row('origine','Paese d’origine',null,'Per i prodotti fabbricati fuori dall’UE.');
  row('lotto','Lotto',m.stampBox?true:null,m.stampBox?'Nel riquadro bianco.':'Consigliato per la tracciabilità.')}
 return out}
// The smallest size and x-height of the mandatory texts on a sheet.
function legalSize(doc){const ts=doc.pages[0].items.filter(it=>it.t==='text'&&it.legal&&it.role!=='net');if(!ts.length)return null;const size=Math.min(...ts.map(t=>t.size));return {size,xh:xHeightMm(size)}}
function checksOf(m,brand,{docs,illustrationDpi}={}){const P=PS(),list=docs||m.variants.map((v,i)=>draw(m,brand,i)),out=[],add=(id,label,state,detail,issues)=>out.push({id,label,state,detail,issues:issues||[]}),g=geometry(m.format,m.size);
 add('nome','Nome e varianti',clean(m.name)&&m.variants.every(v=>clean(v.name)||m.variants.length===1)?'ok':'fail',clean(m.name)?m.variants.length+(m.variants.length===1?' versione':' versioni')+': '+m.variants.map(v=>clean(v.name)||'senza nome').join(', ')+'.':'Scrivi il nome del prodotto.');
 // EAN
 const eans=m.variants.map(v=>({v,s:eanStatus(v.ean)})),bad=eans.filter(x=>x.s.state==='bad'),given=eans.filter(x=>x.s.state==='ok');
 const unplaced=list.map((d,i)=>({d,v:m.variants[i]})).filter(x=>eanStatus(x.v.ean).state==='ok'&&!(x.d.ean&&x.d.ean.placed));
 if(bad.length)add('ean','Codice a barre EAN-13','fail',bad.map(x=>(clean(x.v.name)||'Variante')+': '+x.s.error).join(' '));
 else if(unplaced.length)add('ean','Codice a barre EAN-13','warn',unplaced.map(x=>(clean(x.v.name)||'Variante')+': '+(x.d.ean&&x.d.ean.reason==='round'||g.areas.some(a=>a.round)?'su un’etichetta tonda il codice non sta bene: mettilo sul retro della confezione o scegli un’etichetta rettangolare':'non entra al minimo dell’80 %: scegli un formato più grande')).join(' · ')+'.');
 else if(given.length){const sc=list.map(d=>d.ean).filter(Boolean),min=Math.min(...sc.map(e=>e.scale)),tr=sc.some(e=>e.trunc<1);add('ean','Codice a barre EAN-13',tr?'warn':'ok','Cifra di controllo giusta; barre nere su fondo bianco con i margini di silenzio, al '+Math.round(min*100)+' % della misura nominale'+(tr?'; barre accorciate per stare nello spazio: GS1 lo sconsiglia, chiedi una prova di lettura':'')+'. Il codice deve essere assegnato alla tua azienda (GS1 Italy).')}
 else add('ean','Codice a barre EAN-13','ok','Nessun codice: se il prodotto va nei negozi, chiedi a GS1 Italy i codici della tua azienda. RADIX non li inventa.');
 // texts fit and safe area
 const over=list.filter(d=>d.info.overflow),safe=[];
 list.forEach((d,i)=>{const seen=new Set();for(const it of d.pages[0].items){const bb=bboxOf(it);if(!bb||!it.area)continue;if(!insideShape(bb,it.area,g)){const k=(it.label||it.t)+'|'+it.area.id;if(seen.has(k))continue;seen.add(k);safe.push((clean(m.variants[i].name)||'Etichetta')+': «'+(it.label||'Testo')+'» ('+it.area.label.toLowerCase()+')')}}});
 add('testi','I testi entrano',over.length?'fail':'ok',over.length?'Non entrano tutti nemmeno a 4,5 pt: '+over.map(d=>d.title.split(' · ')[1]||d.title).join(', ')+'. Accorcia i testi o scegli una misura più grande.':'Testi obbligatori impaginati a '+mmText(Math.min(...list.map(d=>d.info.size||7.5)))+' pt o più.');
 add('sicura','Area sicura ('+mmText(g.safe)+' mm dal taglio)',safe.length?'fail':'ok',safe.length?'Troppo vicino al taglio: può essere tagliato.':'Testi, logo e codice ad almeno '+mmText(g.safe)+' mm dal taglio e dalle pieghe.',safe.slice(0,8));
 // x-height (food: legal minimum; others: readability)
 const xs=list.map(d=>legalSize(d)).filter(Boolean);
 if(xs.length){const min=m.type==='alimentare'?(m.small?.9:1.2):.9,xh=Math.min(...xs.map(x=>x.xh)),sz=Math.min(...xs.map(x=>x.size));
  add('xheight','Altezza della «x» dei testi obbligatori',xh+1e-9>=min?'ok':m.type==='alimentare'?'fail':'warn','Misurata sui tracciati del PDF: '+String(Math.floor(xh*100)/100).replace('.',',')+' mm (testo a '+mmText(sz)+' pt). '+(m.type==='alimentare'?'Minimo '+mmText(min)+' mm (Reg. UE 1169/2011, art. 13 e allegato IV'+(m.small?': confezione sotto 80 cm²':'')+').':'Sotto 0,9 mm il testo è difficile da leggere.')+(xh+1e-9>=min?'':' Accorcia i testi, scegli una misura più grande o un formato con il retro.'))}
 // net quantity figures
 const nets=list.map((d,i)=>{const t=d.pages[0].items.find(it=>it.role==='net'),n=netOf(m.variants[i].net);return t&&n?{v:m.variants[i],h:ptToMm(t.size*FIG),min:netMinFigure(n.grams)}:null}).filter(Boolean);
 if(nets.length&&m.type!=='altro'){const low=nets.filter(x=>x.h+1e-6<x.min);add('netta','Altezza delle cifre della quantità',low.length?'warn':'ok',low.length?low.map(x=>(clean(x.v.name)||'Variante')+': '+mmText(x.h)+' mm, servono '+x.min+' mm').join(' · ')+'. Da verificare: aumenta la misura dell’etichetta.':'Cifre alte '+mmText(Math.min(...nets.map(x=>x.h)))+' mm: rispettano la tabella delle quantità nominali.')}
 // contrast of every text on its background
 const low=[];list.forEach(d=>{for(const it of d.pages[0].items)if(it.t==='text'&&it.bg&&it.fill&&P.contrast(it.fill,it.bg)<4.5)low.push((it.label||'Testo')+' '+P.contrast(it.fill,it.bg)+':1')});
 add('contrasto','Contrasto dei testi',low.length?'warn':'ok',low.length?'Sotto 4,5:1: '+[...new Set(low)].slice(0,5).join(', ')+'.':'Ogni testo ha almeno 4,5:1 sul suo fondo.');
 // ink, glyphs, bleed
 const ink=list.map(d=>P.inkReport(d,{})),maxInk=Math.max(...ink.map(r=>r.max));add('inchiostro','Inchiostro totale ≤ '+P.INK_LIMIT+'%',maxInk<=P.INK_LIMIT?'ok':'fail',maxInk<=P.INK_LIMIT?'Massimo '+Math.round(maxInk)+'%.':'Troppo inchiostro ('+Math.round(maxInk)+'%): scegli un altro colore.');
 const gl=[...new Set(list.flatMap(d=>P.glyphs(d).map(w=>w.text)))];add('caratteri','Caratteri',gl.length?'fail':'ok',gl.length?gl.join(' '):'Tutti i caratteri esistono nel font del PDF: i testi diventano tracciati.');
 if(m.illustration){add('illustrazione','Illustrazione',!m.illustration.src?'warn':illustrationDpi&&illustrationDpi<300?'warn':'ok',!m.illustration.src?'Ricarica l’immagine «'+m.illustration.name+'»: nel progetto si salva solo il nome.':illustrationDpi?illustrationDpi+' dpi alla misura di stampa'+(illustrationDpi<300?': servono 300 dpi, usa un file più grande o un vettoriale convertito ad alta risoluzione.':'.'):'Pronta.')}
 add('fustella','Fustella','ok',g.cut.length+' tracciato di taglio'+(g.crease.length?' e '+g.crease.length+' cordonature':'')+' alla stessa scala del file di stampa, in un PDF a parte. Se la tipografia ha già una fustella sua, usa la sua.');
 if(brand.source!=='kit')add('kit','Kit identità','warn',brand.source==='visual'?'Uso i colori scritti nell’identità visiva del profilo, senza logo: al suo posto c’è il nome.':'Nessun Kit identità: colori neutri e il nome al posto del logo. Crea il Kit identità per usare i colori del marchio.');
 return out}
const blocking=cs=>cs.filter(c=>c.state==='fail');

// ---- files ----
const sanitize=s=>slug(s)||'etichetta';
const fileBase=m=>'etichette-'+sanitize(m.name)+'-'+formatOf(m.format).id;
const variantFile=(m,v,i)=>sanitize(m.name)+(m.variants.length>1||clean(v.name)?'-'+(slug(v.name)||'variante-'+(i+1)):'');
function readme(m,brand,checks,legal,files,{date}={}){const f=formatOf(m.format),g=geometry(m.format,m.size),P=PS(),day=(date||new Date()).toISOString().slice(0,10),L=[];
 if(m.sample)L.push('DATI DI ESEMPIO: «'+(brand.name||m.name)+'» è un’azienda inventata. Ingredienti, valori, indirizzi e codici a barre sono finti: non stampare queste etichette.','');
 L.push('ETICHETTE E PACKAGING · '+(clean(m.name)||'prodotto')+' · '+f.title+' '+sizeText(m.format,m.size),'Preparato con RADIX il '+day+', stile «'+styleOf(m.style).title+'», '+m.variants.length+(m.variants.length===1?' versione':' versioni')+'. Nessuna AI: grafica disegnata dal Kit identità.','');
 L.push('COSA C’È NELLO ZIP',...files.filter(x=>x.name!=='LEGGIMI.txt').map(x=>'- '+x.name+': '+x.label),'');
 L.push('PER LA TIPOGRAFIA',
  '- Formato finito (taglio): '+mmText(g.w)+' × '+mmText(g.h)+' mm'+(g.kind==='tuck'||g.kind==='pillow'?' (foglio steso della scatola)':'')+'; con 3 mm di abbondanza per lato: '+mmText(g.w+6)+' × '+mmText(g.h+6)+' mm; pagina del PDF con i segni di taglio: '+mmText(g.w+18)+' × '+mmText(g.h+18)+' mm.',
  '- PDF in CMYK (FOGRA39 indicato per nome, nessun profilo ICC incorporato), testi convertiti in tracciati, nessuna trasparenza: '+P.PDFX.label+'. La tipografia fa comunque il suo preflight.',
  '- Fustella: nel PDF a parte, alla stessa scala e con gli stessi segni di taglio del file di stampa, così si sovrappongono. Linea continua = taglio'+(g.crease.length?', tratteggio = cordonatura (piega)':'')+', in magenta 100 %: non si stampa. Se la tipografia ha già una fustella standard per questa misura, chiedi il suo tracciato e confronta.',
  g.kind==='tuck'?'- Astuccio: la linguetta di colla (a sinistra) resta senza stampa. Il cartoncino va scelto con la tipografia (di solito 300–350 g/m²); controlla la direzione della fibra.':g.kind==='pillow'?'- Scatola a cuscino: le estremità curve si piegano verso l’interno; serve un cartoncino da 300–350 g/m². Fai un prototipo bianco prima della tiratura.':g.kind==='topper'?'- Cavaliere: si piega a metà sulla linea tratteggiata; il retro è capovolto apposta, così si legge dritto una volta piegato sul sacchetto.':g.kind==='wrap'?'- Etichetta avvolgente: misura la circonferenza vera del contenitore e lascia 2–3 mm di spazio, oppure la sovrapposizione che chiede l’etichettatrice.':'- Etichetta adesiva: chiedi alla tipografia il materiale giusto (carta, polipropilene per frigo e umido) e il verso di avvolgimento della bobina se usi un’etichettatrice.',
  '- Colori: i valori CMYK vengono da una conversione semplice; per i colori del marchio chiedi una prova colore.',
  '- Prima della tiratura stampa una pagina al 100 % (senza «adatta alla pagina») e misura col righello: taglio, abbondanza e testi devono tornare.','');
 L.push('CONTROLLI',...checks.map(c=>'- '+({ok:'OK',warn:'DA GUARDARE',fail:'DA SISTEMARE'}[c.state])+' · '+c.label+': '+c.detail+(c.issues&&c.issues.length?' ('+c.issues.join('; ')+')':'')),'');
 L.push('INFORMAZIONI OBBLIGATORIE · CHECKLIST DA VERIFICARE CON IL CONSULENTE',m.type==='alimentare'?'Riferimento: Reg. (UE) 1169/2011 e norme italiane collegate. Non è un parere legale: un consulente o un tecnologo alimentare deve controllare l’etichetta prima della stampa.':m.type==='cosmetico'?'Riferimento: Reg. (CE) 1223/2009, art. 19. Non è un parere legale: la persona responsabile e il valutatore della sicurezza devono controllare l’etichetta.':'Riferimento: Codice del consumo (D.Lgs. 206/2005, art. 6) e norme del tuo settore. Non è un parere legale: verifica con il consulente.',
  ...legal.map(r=>'- ['+({ok:'compilato',todo:'manca',info:'da verificare'}[r.state])+'] '+r.label+': '+r.detail),'');
 if(m.type==='alimentare'){const found=[...new Set(m.variants.flatMap(v=>emphasize(v.ingredients).found.concat(emphasize(v.traces).found)))];L.push('ALLERGENI','In grassetto nell’elenco degli ingredienti quando il nome corrisponde a uno dei 14 allergeni dell’allegato II: '+(found.length?found.map(allergenLabel).join(', ').toLowerCase():'nessuno trovato')+'. Il riconoscimento è automatico sulle parole: un ingrediente composto (es. «pan di Spagna») va scomposto o scritto con l’allergene tra parentesi.','')}
 L.push('CODICI A BARRE','- '+m.variants.map(v=>(clean(v.name)||'Variante')+': '+(eanStatus(v.ean).state==='ok'?v.ean+' (cifra di controllo verificata)':eanStatus(v.ean).state==='bad'?'codice non valido, non disegnato':'nessun codice')).join('\n- '),'- I codici devono essere assegnati alla tua azienda da GS1 Italy. Prima della tiratura fai una prova di lettura con un lettore vero sul materiale definitivo.','');
 L.push('COSA FARE ORA','1. Fai controllare la checklist e i testi al consulente (alimentare o cosmetico).','2. Stampa una pagina al 100 % e controlla le misure col righello.','3. Manda i PDF di stampa e la fustella alla tipografia per una verifica tecnica e una prova colore.');
 return L.join('\n')}
// Everything for the zip. opts: {date, png(svg,w,h) → bytes (browser), prepare(doc) (browser: illustration → CMYK)}
async function files(m,brand,opts={}){const P=PS(),date=opts.date||new Date(),out=[],add=(name,data,label)=>out.push({name,data,label});
 const docs=m.variants.map((v,i)=>draw(m,brand,i));const checks=checksOf(m,brand,{docs,illustrationDpi:opts.illustrationDpi}),legal=legalChecklist(m,docs);
 if(blocking(checks).length)throw Error('Prima sistema: '+blocking(checks).map(c=>c.label.toLowerCase()).join(', ')+'.');
 for(let i=0;i<docs.length;i++){const d=docs[i],v=m.variants[i],base=variantFile(m,v,i);if(opts.prepare)await opts.prepare(d);
  const bytes=P.pdf(d,{mode:'print',pdfx:true,date,title:d.title+' · tipografia',producer:'RADIX Etichette e packaging'}),probs=P.checkPdf(bytes);if(probs.length)throw Error(d.title+': '+probs.join(' '));
  add('stampa/'+base+'.pdf',bytes,'PDF per la tipografia · '+(clean(v.name)||'unica versione')+' (CMYK, 3 mm di abbondanza, segni di taglio)')}
 const die=dieDoc(m,brand),db=P.pdf(die,{mode:'print',pdfx:true,date,title:die.title,producer:'RADIX Etichette e packaging'}),dp=P.checkPdf(db);if(dp.length)throw Error('Fustella: '+dp.join(' '));
 add('fustella/fustella-'+formatOf(m.format).id+'.pdf',db,'Tracciato di fustella, magenta 100 %, stessa pagina dei file di stampa (non si stampa)');
 for(let i=0;i<docs.length;i++){const d=docs[i],v=m.variants[i],base=variantFile(m,v,i);
  add('mockup/'+base+'.svg',labelSvg(d,{die:true,layers:true,clip:true}),'Grafica piatta per i mockup, con la fustella su un livello a parte · '+(clean(v.name)||'unica versione'));
  if(opts.png){const g=d.geometry,px=Math.min(2400,Math.round(Math.max(g.w,g.h)*12)),k=px/Math.max(g.w,g.h);add('anteprime/'+base+'.png',await opts.png(labelSvg(d,{die:true,bleed:true,px:Math.round((g.w+6)*k)}),Math.round((g.w+6)*k),Math.round((g.h+6)*k)),'Anteprima PNG con la fustella tratteggiata · '+(clean(v.name)||'unica versione'))}}
 add('LEGGIMI.txt',readme(m,brand,checks,legal,out.concat([{name:'LEGGIMI.txt'}]),{date}),'Istruzioni, controlli e checklist');
 return out}
const bundle=(list,{date}={})=>ZIP().zip(list.map(x=>({name:x.name,data:x.data})),{date:date||new Date()});

// ---- saved in the project: the «agents» document, key packaging ({items}) ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(doc){const s=doc&&doc.packaging;if(!s||typeof s!=='object')return emptyStore();return {schemaVersion:1,items:Array.isArray(s.items)?s.items.filter(x=>x&&typeof x==='object'&&x.model):[]}}
function savedRecord(m,{by,at}={}){const mm=modelOf(m);if(mm.illustration)mm.illustration={name:mm.illustration.name,w:mm.illustration.w,h:mm.illustration.h};
 return {id:'packaging-'+sanitize(mm.name)+'-'+mm.format,at:at||new Date().toISOString(),by:clean(by).slice(0,80),name:mm.name,format:mm.format,style:mm.style,variants:mm.variants.length,model:mm}}
async function saveStore(ws,projectId,patch){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');const doc=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await doc.load())||{},next=patch(readStore(cur));
  try{await doc.save({...cur,schemaVersion:1,conversations:cur.conversations||{},packaging:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
const withRecord=rec=>s=>({...s,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)});

// ---- the widget (browser) ----
const dom=()=>root.document;
const E=(tag,text,cls)=>{const x=dom().createElement(tag);if(text!=null)x.textContent=text;if(cls)x.className=cls;return x};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
const svgImg=(svg,alt)=>{const i=E('img');i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);i.alt=alt||'';i.decoding='async';return i};
const note=text=>E('p',text,'cs-note');
function field(label,value,on,{area=false,rows=2,max=200,ph='',help='',type='text',wide=false,mode=''}={}){const l=E('label',undefined,'rp-field'+(wide?' rp-wide':'')),x=E(area?'textarea':'input');if(area)x.rows=rows;else x.type=type;
 if(max)x.maxLength=max;if(mode)x.inputMode=mode;x.value=value==null?'':value;x.placeholder=ph;l.append(E('span',label),x);if(help)l.append(E('small',help,'rp-help'));x.oninput=()=>on(x.value,x,l);return l}
// Radio chips (the infographic's): items [{id,label,small}].
function choice(legend,items,cur,onchange,{name,cls=''}={}){const fs=E('fieldset',undefined,'ig-choice pk-choice '+cls);fs.append(E('legend',legend));
 items.forEach(it=>{const l=E('label',undefined,'ps-chip ig-chip'),x=E('input');x.type='radio';x.name=name;x.value=it.id;x.checked=it.id===cur;x.onchange=()=>{if(x.checked)onchange(it.id)};
  const t=E('span',undefined,'ig-chip-text');if(it.icon)l.append(it.icon);t.append(E('b',it.label));if(it.small)t.append(E('small',it.small));l.append(x,t);l.dataset.value=it.id;fs.append(l)});return fs}
// A small drawing of the die line of a format (for the format chips).
function formatIcon(f){const g=geometry(f.id,f.def),pad=Math.max(g.w,g.h)*.06,o=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[-pad,-pad,g.w+2*pad,g.h+2*pad].map(n2).join(' ')+'" width="44" height="44" aria-hidden="true">'];
 const sw=n2(Math.max(g.w,g.h)/30);for(const d of g.cut)o.push('<path d="'+d+'" fill="#f4f1fb" stroke="#4b3fb5" stroke-width="'+sw+'"/>');for(const d of g.crease)o.push('<path d="'+d+'" fill="none" stroke="#4b3fb5" stroke-width="'+n2(sw*.6)+'" stroke-dasharray="'+n2(sw*2)+' '+n2(sw*1.4)+'"/>');o.push('</svg>');
 const s=E('span',undefined,'pk-ficon');s.innerHTML=o.join('');return s}
const MIME={pdf:'application/pdf',zip:'application/zip'};
function svgToPng(svg,w,h){return new Promise((res,rej)=>{const img=new root.Image();img.onload=()=>{try{const c=E('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='#FFFFFF';g.fillRect(0,0,w,h);g.drawImage(img,0,0,w,h);
  c.toBlob(b=>b?b.arrayBuffer().then(x=>res(new Uint8Array(x)),rej):rej(Error('PNG non creato')),'image/png')}catch(e){rej(e)}};img.onerror=()=>rej(Error('Anteprima non leggibile'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)})}
async function loadIllustration(file){if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error(file.name+': solo JPEG, PNG o WebP.');if(file.size>15e6)throw Error(file.name+': massimo 15 MB.');
 const src=await new Promise((res,rej)=>{const r=new root.FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(Error('File non leggibile'));r.readAsDataURL(file)});
 const img=new root.Image();img.src=src;await img.decode();return {name:file.name,w:img.naturalWidth,h:img.naturalHeight,src}}
const STATE_LABEL={ok:'OK',warn:'Da guardare',fail:'Da sistemare'},LEGAL_LABEL={ok:'Compilato',todo:'Manca',info:'Da verificare'};
const COMMON_FIELDS={
 alimentare:[['legalName','Denominazione dell’alimento',{ph:'Es. Biscotti friabili con farina di mais',help:'La denominazione legale o usuale, non il nome di fantasia.',wide:true}],['storage','Conservazione',{ph:'Es. Conservare in luogo fresco e asciutto.',wide:true}],['usage','Istruzioni per l’uso (se servono)',{wide:true}],
  ['producer','Operatore: ragione sociale e indirizzo',{ph:'Es. Forno Rossi S.r.l., Via Roma 1, 10100 Torino',wide:true}],['plant','Stabilimento (se diverso)',{}],['origin','Origine (se richiesta)',{ph:'Es. Origine del grano: Italia'}],['extra','Altre indicazioni (facoltative)',{wide:true}]],
 cosmetico:[['legalName','Funzione del prodotto',{ph:'Es. Crema mani nutriente',wide:true}],['usage','Modo d’uso',{wide:true}],['precautions','Precauzioni d’impiego',{ph:'Es. Solo per uso esterno.',wide:true}],
  ['producer','Persona responsabile: nome e indirizzo',{wide:true}],['origin','Paese d’origine (se fuori UE)',{ph:'Es. Prodotto in …'}],['extra','Altre indicazioni (facoltative)',{wide:true}]],
 altro:[['legalName','Che cos’è',{ph:'Es. Candela profumata in cera di soia',wide:true}],['materials','Materiali',{wide:true}],['usage','Istruzioni',{wide:true}],['precautions','Avvertenze',{wide:true}],
  ['producer','Produttore: nome e sede',{wide:true}],['origin','Paese d’origine (se fuori UE)',{}],['extra','Altre indicazioni (facoltative)',{wide:true}]]};
// ctx: {project, profile, projectName, projectId, workspace, agentsUrl, identityUrl, openIdentity, today, by}
function packagingStudio(ctx={}){const brand=brandFor(ctx.profile||{},ctx.projectName),P=PS(),today=()=>ctx.today?new Date(ctx.today):new Date();
 const st={m:newModel({profile:ctx.profile,projectName:ctx.projectName}),touched:false,store:emptyStore(),files:null,busy:false,tab:'testi',vi:0,guides:true};
 if(P&&P.loadGlyphs)P.loadGlyphs().then(()=>{XH=null;if(!refine.hidden)drawPreview()}).catch(()=>{});
 const wrap=E('div',undefined,'tool photo-studio ad-studio report-studio infographic-studio funnel-studio media-kit-studio packaging-studio');
 const steps=E('ol',undefined,'ps-steps');['Domande','Proposte','Rifinisci','Esporta'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');setStep(1);
 const saved=E('div',undefined,'ad-saved rp-saved');saved.hidden=true;const status=E('p','','tool-status');status.setAttribute('role','status');
 const form=E('div',undefined,'ps-form pk-form'),dirs=E('div',undefined,'ad-dirs pk-dirs'),refine=E('div',undefined,'rp-result pk-refine'),result=E('div',undefined,'rp-result pk-export');dirs.hidden=refine.hidden=result.hidden=true;
 const bx=E('div',undefined,'ad-brand rp-brand');const sw=E('span',undefined,'ad-swatches');['primary','secondary','accent','dark','light'].forEach(k=>{const i=E('i');i.style.background=brand.palette[k];i.title=k+' '+brand.palette[k];sw.append(i)});
 const bt=E('span',undefined,'ad-brand-text');bt.append(E('strong',brand.name||ctx.projectName||'Il progetto'),E('span',brand.source==='kit'?'Etichette nei colori e col logo del Kit identità.':brand.source==='visual'?'Colori dall’identità visiva del profilo · senza logo: uso il nome.':'Nessun Kit identità: colori neutri e il nome al posto del logo.'));
 bx.append(sw,bt);if(brand.logo){const li=svgImg(brand.logo,'Logo del kit');li.className='ad-brand-logo';bx.append(li)}
 if(brand.source!=='kit'&&(ctx.openIdentity||ctx.identityUrl)){const a=E('a','Crea il Kit identità →','pk-kit-link');a.href=ctx.identityUrl||'#';a.onclick=e=>{if(ctx.openIdentity){e.preventDefault();ctx.openIdentity()}};bt.append(a)}
 wrap.append(steps,saved,bx,form,status,dirs,refine,result);
 const scroll=x=>x.scrollIntoView&&x.scrollIntoView({behavior:'smooth',block:'start'});
 const docs=()=>st.m.variants.map((v,i)=>draw(st.m,brand,i));
 // 1. the questions
 function renderForm(){const m=st.m,f=formatOf(m.format);form.replaceChildren();
  const intro=note('Poche domande: tipo di prodotto, formato, misura e versioni. Ingredienti, valori e codici li scriverai tu dopo: RADIX non li inventa.');
  const type=choice('Che prodotto è',TYPES.map(t=>({id:t.id,label:t.title,small:t.line})),m.type,id=>{m.type=id;m.dateKind=id==='cosmetico'?'pao':'tmc';st.touched=true;renderForm()},{name:'pk-type',cls:'pk-types'});
  const fmt=choice('Formato',FORMATS.map(x=>({id:x.id,label:x.title,small:x.line,icon:formatIcon(x)})),m.format,id=>{m.format=id;m.size=formatOf(id).def.slice();m.infoOn=formatOf(id).kind!=='round';st.touched=true;renderForm()},{name:'pk-format',cls:'pk-formats'});
  const size=E('fieldset',undefined,'ig-choice pk-size');size.append(E('legend','Misura · '+f.title));
  const chips=E('div',undefined,'pk-presets');f.presets.forEach(([v,label])=>{const b=button(label,'ps-chip pk-preset');b.setAttribute('aria-pressed',String(v.every((x,i)=>x===m.size[i])));b.onclick=()=>{m.size=v.slice();renderForm()};chips.append(b)});
  const nums=E('div',undefined,'pk-dims');f.dims.forEach((k,i)=>{const [label,min,max]=dimSpec(f,k);nums.append(field(label+' (mm)',m.size[i],v=>{const n=Number(String(v).replace(',','.'));if(isFinite(n)&&n>0){m.size[i]=n;st.touched=true}},{type:'number',max:0,mode:'decimal',help:min+'–'+max+' mm'}))});
  size.append(chips,nums);
  if(f.kind==='tuck')size.append(E('p','Lato fronte × profondità × altezza della scatola chiusa, misure interne. Il foglio steso lo calcolo io.','rp-help'));
  if(f.kind==='pillow')size.append(E('p','Larghezza e lunghezza della scatola chiusa; le estremità curve si aggiungono sopra e sotto.','rp-help'));
  if(f.kind==='topper')size.append(E('p','La parte visibile, piegata: il cartoncino aperto è alto il doppio.','rp-help'));
  if(f.kind==='round'&&!f.lid){const l=E('label',undefined,'pk-check'),x=E('input');x.type='checkbox';x.checked=m.infoOn;x.onchange=()=>{m.infoOn=x.checked};l.append(x,E('span','Metti anche ingredienti, produttore e lotto (di solito l’adesivo tondo è solo il marchio)'));size.append(l)}
  if(m.type==='alimentare'&&f.kind!=='tuck'&&f.kind!=='pillow'){const l=E('label',undefined,'pk-check'),x=E('input');x.type='checkbox';x.checked=m.small;x.onchange=()=>{m.small=x.checked};l.append(x,E('span','La confezione è piccola: la sua superficie maggiore è sotto 80 cm² (la «x» minima scende da 1,2 a 0,9 mm)'));size.append(l)}
  const names=E('fieldset',undefined,'ig-choice pk-names');names.append(E('legend','Nome e versioni'));
  const g=E('div',undefined,'rp-fields');g.append(field('Nome del prodotto',m.name,v=>{m.name=v;st.touched=true},{max:60,ph:'Es. Biscotti di meliga',wide:true}));
  const ol=E('ol',undefined,'pk-vlist');m.variants.forEach((v,i)=>{const li=E('li'),fl=field('Versione '+(i+1),v.name,x=>{v.name=x;st.touched=true},{max:60,ph:i?'Es. Al cacao':'Es. Classici (vuoto se ce n’è una sola)'});li.append(fl);
   if(m.variants.length>1){const del=button('Togli','ig-hide');del.setAttribute('aria-label','Togli la versione '+(i+1));del.onclick=()=>{m.variants.splice(i,1);renderForm()};li.append(del)}ol.append(li)});
  const add=button('+ Aggiungi una versione (gusto, profumo)','ap-add');add.disabled=m.variants.length>=MAX_VARIANTS;add.onclick=()=>{m.variants.push(emptyVariant(m.variants.length));m.variants[m.variants.length-1].id='v'+Date.now().toString(36);renderForm()};
  names.append(g,E('p','Una etichetta per ogni versione, fino a '+MAX_VARIANTS+'. Stessa grafica, colore e testi propri.','rp-help'),ol,add);
  const go=button(m.style?'Rifai le 3 proposte':'Prepara 3 proposte','primary'),bar=E('div',undefined,'ps-actions');bar.append(go,E('span','Nessuna chiamata AI: le proposte si disegnano qui, senza costi.','muted'));
  go.onclick=()=>{if(!clean(m.name)){status.textContent='Scrivi il nome del prodotto.';return}m.size=sizeOf(m.format,m.size);status.textContent='';st.files=null;refine.hidden=result.hidden=true;renderDirs();scroll(dirs)};
  form.append(intro,type,fmt,size,names,bar)}
 // 2. three designs, drawn for real
 function renderDirs(){setStep(st.m.style?3:2);dirs.hidden=false;
  dirs.replaceChildren(...STYLES.map(S=>{const m={...st.m,style:S.id},d=draw(m,brand,0),card=E('article',undefined,'ad-dir pk-dir');card.dataset.style=S.id;card.dataset.chosen=String(st.m.style===S.id);
   const hd=E('div',undefined,'ad-dir-head');hd.append(E('span',formatOf(m.format).title+' · '+sizeText(m.format,m.size),'ad-angle'),E('h3',S.title),E('p',S.line,'ad-idea'));
   const fig=E('figure',undefined,'pk-fig');fig.dataset.kind=d.geometry.kind;fig.append(svgImg(labelSvg(d,{die:true,clip:false}),S.title+': '+(clean(m.variants[0].name)||clean(m.name))));
   const vs=E('div',undefined,'pk-vchips');m.variants.forEach(v=>{const c=E('span',clean(v.name)||clean(m.name),'pk-vchip');c.style.setProperty('--v',brand.palette[v.color]||brand.palette.primary);vs.append(c)});
   const pick=button(st.m.style===S.id?'Stile scelto':'Scegli «'+S.title+'»','primary');pick.onclick=()=>{st.m.style=S.id;st.files=null;result.hidden=true;result.replaceChildren();renderDirs();renderRefine();scroll(refine)};
   card.append(hd,fig,vs,pick);return card}))}
 // 3. refine
 let timer=0;const changed=()=>{clearTimeout(timer);timer=setTimeout(()=>{st.files=null;drawPreview();if(!result.hidden)renderResult(true)},180)};
 const pv=E('div',undefined,'ig-preview pk-preview'),pvBar=E('div',undefined,'pk-pv-bar'),pvBody=E('div',undefined,'pk-pv-body'),pvChecks=E('div',undefined,'rp-checks ig-live-checks');
 function checkRow(c){const row=E('div',undefined,'rp-check');row.dataset.state=c.state;row.dataset.check=c.id;row.append(E('span',STATE_LABEL[c.state],'rp-check-badge'),E('strong',c.label),E('p',c.detail,'rp-check-detail'));
  if(c.issues&&c.issues.length){const ul=E('ul');c.issues.slice(0,8).forEach(i=>ul.append(E('li',i)));row.append(ul)}return row}
 function illustrationDpi(list){const it=list.flatMap(d=>d.pages[0].items).find(x=>x.t==='image');return it?P.effectiveDpi(it.px,it.w,it.h):0}
 function drawPreview(){if(!st.m.style)return;const m=st.m,list=docs(),vi=Math.min(st.vi,list.length-1),d=list[vi];
  pvBar.replaceChildren();if(m.variants.length>1){const g=E('div',undefined,'pk-vtabs');g.setAttribute('role','group');g.setAttribute('aria-label','Versione in anteprima');
   m.variants.forEach((v,i)=>{const b=button(clean(v.name)||'Versione '+(i+1),'pk-vtab');b.setAttribute('aria-pressed',String(i===vi));b.style.setProperty('--v',brand.palette[v.color]||brand.palette.primary);b.onclick=()=>{st.vi=i;drawPreview()};g.append(b)});pvBar.append(g)}
  const gl=E('label',undefined,'pk-check pk-guides'),gx=E('input');gx.type='checkbox';gx.checked=st.guides;gx.onchange=()=>{st.guides=gx.checked;drawPreview()};gl.append(gx,E('span','Fustella, abbondanza e area sicura'));pvBar.append(gl);
  const fig=E('figure',undefined,'pk-fig pk-big');fig.dataset.kind=d.geometry.kind;fig.append(svgImg(labelSvg(d,st.guides?{bleed:true,die:true,safe:true}:{die:false,clip:true}),'Anteprima: '+d.title));
  fig.append(E('figcaption',sizeText(m.format,m.size)+(d.geometry.kind==='tuck'||d.geometry.kind==='pillow'?' · foglio steso '+mmText(d.geometry.w)+' × '+mmText(d.geometry.h)+' mm':'')+(d.info.size?' · testi obbligatori a '+mmText(d.info.size)+' pt':'')));
  const legend=E('p',undefined,'pk-legend');if(st.guides)legend.append(E('span','Magenta: taglio e pieghe (non si stampa)','pk-l-die'),E('span','Blu: area sicura','pk-l-safe'),E('span','Velato: abbondanza di 3 mm','pk-l-bleed'));
  pvBody.replaceChildren(fig,legend);
  const cs=checksOf(m,brand,{docs:list,illustrationDpi:illustrationDpi(list)}).filter(c=>c.state!=='ok');pvChecks.replaceChildren(...(cs.length?cs.map(checkRow):[checkRow({id:'ok',label:'Tutto a posto',state:'ok',detail:'Testi, area sicura, codici e colori controllati.'})]));
  const lt=refine.querySelector('.pk-legal');if(lt&&st.tab==='legge')lt.replaceWith(legalTab()[0])}
 const TABS=[['testi','Testi'],['varianti','Versioni'],['stile','Stile e immagine'],['legge','Checklist di legge']];
 function renderRefine(){setStep(3);refine.hidden=false;const box=E('div',undefined,'ig-work'),edit=E('div',undefined,'ig-edit');
  const tabs=E('div',undefined,'fn-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Cosa rifinire');const panel=E('div',undefined,'fn-panel');panel.setAttribute('role','tabpanel');
  const show=id=>{st.tab=id;tabs.querySelectorAll('button').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.tab===id));b.tabIndex=b.dataset.tab===id?0:-1});panel.replaceChildren(...({testi:textsTab,varianti:variantsTab,stile:styleTab,legge:legalTab}[id])(()=>show(id)))};
  TABS.forEach(([id,label])=>{const b=button(label,'fn-tab');b.dataset.tab=id;b.setAttribute('role','tab');b.onclick=()=>show(id);
   b.onkeydown=e=>{const i=TABS.findIndex(x=>x[0]===id);if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const k=TABS[(i+(e.key==='ArrowRight'?1:TABS.length-1))%TABS.length][0];show(k);tabs.querySelector('[data-tab="'+k+'"]').focus()}};tabs.append(b)});
  const head=E('div',undefined,'fn-refine-head');head.append(E('h3','«'+styleOf(st.m.style).title+'» · '+(clean(st.m.name)||'etichetta')),E('p','Scrivi i testi che vanno per legge e controlla l’anteprima: si aggiorna mentre scrivi.','ad-idea'));
  const next=button('Controlla ed esporta','primary'),nb=E('div',undefined,'ps-actions');nb.append(next,E('span','PDF, fustella e anteprime si creano qui, senza AI e senza costi.','muted'));next.onclick=()=>{renderResult();scroll(result)};
  edit.append(head,tabs,panel,nb);const ph=E('div',undefined,'ig-preview-head');ph.append(E('h4','Anteprima'));pv.replaceChildren(ph,pvBar,pvBody,pvChecks);box.append(edit,pv);refine.replaceChildren(box);show(st.tab);drawPreview()}
 function textsTab(){const m=st.m,out=[],c=m.common;
  const fs=E('fieldset',undefined,'rp-refine pk-fs');fs.append(E('legend',m.type==='alimentare'?'Testi obbligatori comuni a tutte le versioni':m.type==='cosmetico'?'Testi del cosmetico':'Testi del prodotto'));const g=E('div',undefined,'rp-fields');
  for(const [k,label,o] of COMMON_FIELDS[m.type]){const h=k==='producer'&&m.from.producer&&c.producer?(m.from.producer==='coordinato'?'Dal Coordinato aziendale: controlla.':'Dal profilo del progetto: controlla.'):o.help||'';g.append(field(label,c[k],v=>{c[k]=v;changed()},{...o,help:h,max:400,area:!!o.wide&&k!=='producer'&&k!=='legalName',rows:2}))}
  fs.append(g);out.push(fs);
  const fr=E('fieldset',undefined,'rp-refine pk-fs');fr.append(E('legend','Fronte'));const g2=E('div',undefined,'rp-fields');g2.append(field('Frase sul fronte (facoltativa)',m.payoff,v=>{m.payoff=v;changed()},{max:70,ph:'Es. Dal forno di via Nizza',help:'Niente promesse che non puoi dimostrare («il migliore», «senza…» se non è vero).',wide:true}));fr.append(g2);out.push(fr);
  const dt=E('fieldset',undefined,'rp-refine pk-fs');dt.append(E('legend','Lotto e data'));const g3=E('div',undefined,'rp-fields');
  const kinds=m.type==='alimentare'?[['tmc','«Da consumarsi preferibilmente entro»'],['scadenza','«Da consumare entro» (deperibili)']]:m.type==='cosmetico'?[['pao','PAO: mesi dopo l’apertura'],['tmc','«Usare preferibilmente entro»']]:[];
  if(kinds.length){const l=E('label',undefined,'rp-field'),s=E('select');kinds.forEach(([v,t])=>{const o=E('option',t);o.value=v;o.selected=m.dateKind===v;s.append(o)});s.onchange=()=>{m.dateKind=s.value;changed();show()};l.append(E('span','Data'),s);g3.append(l)}
  if(m.type==='cosmetico'&&m.dateKind==='pao')g3.append(field('Mesi dopo l’apertura',m.pao,v=>{m.pao=String(v).replace(/\D/g,'').slice(0,2);changed()},{type:'text',mode:'numeric',max:2,ph:'Es. 12'}));
  const sb=E('label',undefined,'pk-check rp-wide'),sx=E('input');sx.type='checkbox';sx.checked=m.stampBox;sx.onchange=()=>{m.stampBox=sx.checked;changed()};sb.append(sx,E('span','Riquadro bianco per lotto e data, da timbrare o stampare a parte'));g3.append(sb);dt.append(g3);out.push(dt);
  const show=()=>{const p=refine.querySelector('.fn-panel');if(p)p.replaceChildren(...textsTab())};
  if(m.type==='alimentare'){const nx=E('label',undefined,'pk-check'),x=E('input');x.type='checkbox';x.checked=m.nutriExempt;x.onchange=()=>{m.nutriExempt=x.checked;changed()};
   nx.append(x,E('span','Il prodotto è esente dalla dichiarazione nutrizionale (Allegato V: es. artigianale venduto direttamente in piccole quantità) — da verificare'));out.push(nx)}
  out.push(note('Scrivi solo dati veri: RADIX non aggiunge ingredienti, valori, origini o promesse.'));return out}
 function variantsTab(again){const m=st.m,out=[];
  m.variants.forEach((v,i)=>{const fs=E('fieldset',undefined,'rp-refine pk-fs pk-variant');fs.style.setProperty('--v',brand.palette[v.color]||brand.palette.primary);fs.append(E('legend',(clean(v.name)||'Versione '+(i+1))));const g=E('div',undefined,'rp-fields');
   g.append(field('Nome della versione',v.name,x=>{v.name=x;changed()},{max:60}));
   const cl=E('label',undefined,'rp-field'),cs=E('select');COLOR_ROLES.forEach(r=>{const o=E('option',ROLE_LABEL[r]+' · '+brand.palette[r]);o.value=r;o.selected=v.color===r;cs.append(o)});cs.onchange=()=>{v.color=cs.value;fs.style.setProperty('--v',brand.palette[v.color]);changed()};cl.append(E('span','Colore della versione'),cs);g.append(cl);
   const al=E('p','','pk-allergens');const showAl=()=>{const f=emphasize(v.ingredients+' '+v.traces).found;al.replaceChildren();if(m.type!=='alimentare')return;
    if(!clean(v.ingredients)){al.textContent='';return}al.append(E('span',f.length?'In grassetto: ':'Nessun allergene riconosciuto: controlla.','pk-al-head'));f.forEach(id=>al.append(E('b',allergenLabel(id),'pk-al')))};
   g.append(field(m.type==='cosmetico'?'Ingredienti (INCI)':m.type==='altro'?'Composizione (facoltativa)':'Ingredienti',v.ingredients,x=>{v.ingredients=x;showAl();changed()},{area:true,rows:3,max:1500,wide:true,ph:m.type==='cosmetico'?'AQUA, GLYCERIN, …':'In ordine di peso: «Farina di frumento, burro 20%, uova, …»',help:m.type==='alimentare'?'Gli allergeni (frumento, latte, burro, uova, nocciole…) vanno in grassetto da soli. Per forzarlo scrivi **parola**.':''}));
   if(m.type==='alimentare'){g.append(field('Tracce (facoltativo)',v.traces,x=>{v.traces=x;showAl();changed()},{max:200,wide:true,ph:'Es. Può contenere tracce di frutta a guscio.'}));const w=E('div',undefined,'rp-wide');w.append(al);g.append(w);showAl()}
   g.append(field(m.type==='cosmetico'?'Contenuto nominale':'Quantità netta',v.net,x=>{v.net=x;changed()},{max:30,ph:m.type==='cosmetico'?'Es. 50 ml':'Es. 250 g'}));
   const es=E('small','','rp-help pk-ean');const upd=()=>{const s=eanStatus(v.ean);es.dataset.state=s.state;es.textContent=s.state==='ok'?'Cifra di controllo giusta: lo disegno in barre vettoriali.':s.state==='bad'?s.error:'Facoltativo. 13 cifre da GS1 Italy o dal fornitore.'};
   const ef=field('Codice EAN-13',v.ean,x=>{v.ean=eanDigits(x).slice(0,20);upd();changed()},{max:20,mode:'numeric',ph:'13 cifre'});ef.append(es);upd();g.append(ef);
   fs.append(g);
   if(m.type==='alimentare'&&!m.nutriExempt){const nu=E('details',undefined,'pk-nutri'),nv=nutrition(v);nu.open=nv.partial||nv.complete||i===0;nu.append(E('summary','Dichiarazione nutrizionale per '+nv.per+(nv.complete?' · completa':nv.partial?' · incompleta':'')));
    const ng=E('div',undefined,'pk-nutri-grid');NUTRI.forEach(([k,label,u])=>ng.append(field(label+' ('+u+')',v.nutr[k]||'',x=>{v.nutr[k]=x;changed()},{max:10,mode:'decimal',ph:'—'})));nu.append(ng,E('p','I tuoi valori, da analisi o calcolo documentato: RADIX non li stima. Va sull’etichetta solo se è completa.','rp-help'));fs.append(nu)}
   if(m.variants.length>1){const cp=button('Copia i testi della prima versione','ig-move');if(i>0){cp.onclick=()=>{const a=m.variants[0];v.ingredients=a.ingredients;v.traces=a.traces;v.net=a.net;v.nutr={...a.nutr};again();changed()};fs.append(cp)}}
   out.push(fs)});
  return out}
 function styleTab(again){const m=st.m,out=[];
  out.push(choice('Stile',STYLES.map(s=>({id:s.id,label:s.title,small:s.line})),m.style,id=>{m.style=id;refine.querySelector('.fn-refine-head h3').textContent='«'+styleOf(id).title+'» · '+(clean(m.name)||'etichetta');changed()},{name:'pk-style'}));
  const pick=E('label',undefined,'pf-drop pk-drop'),inp=E('input');inp.type='file';inp.accept='image/jpeg,image/png,image/webp';const pt=E('span',undefined,'pf-drop-text');
  pt.append(E('strong',m.illustration?'Sostituisci l’illustrazione':'Carica una tua illustrazione (facoltativa)'),E('small','JPG, PNG o WebP · trascinala qui o fai clic · va sul fronte, intera. Per la stampa servono 300 dpi alla misura reale.'));pick.append(inp,pt);
  const msg=E('p','','tool-status');msg.setAttribute('role','status');
  inp.onchange=async()=>{const f=inp.files[0];inp.value='';if(!f)return;try{m.illustration=await loadIllustration(f);again();changed()}catch(e){msg.textContent=e.message}};out.push(pick,msg);
  if(m.illustration){const row=E('div',undefined,'pk-ill');if(m.illustration.src){const im=E('img');im.src=m.illustration.src;im.alt=m.illustration.name;row.append(im)}row.append(E('span',m.illustration.name+(m.illustration.w?' · '+m.illustration.w+' × '+m.illustration.h+' px':'')+(m.illustration.src?'':' · da ricaricare')));
   const del=button('Togli','ig-hide');del.onclick=()=>{m.illustration=null;again();changed()};row.append(del);out.push(row)}
  out.push(note('Colori e logo vengono dal Kit identità; il colore di ogni versione si sceglie nella scheda «Versioni». I testi diventano tracciati vettoriali nel PDF.'));return out}
 function legalTab(){const m=st.m,rows=legalChecklist(m,docs()),box=E('div',undefined,'pk-legal');
  box.append(note(m.type==='alimentare'?'Checklist delle informazioni obbligatorie del Reg. (UE) 1169/2011, da verificare con il consulente o il tecnologo alimentare: non è un parere legale.':m.type==='cosmetico'?'Checklist dell’art. 19 del Reg. (CE) 1223/2009, da verificare con il consulente e il valutatore della sicurezza: non è un parere legale.':'Checklist essenziale (Codice del consumo, art. 6), da verificare con il consulente: non è un parere legale.'));
  const ul=E('ul',undefined,'pk-legal-list');rows.forEach(r=>{const li=E('li');li.dataset.state=r.state;li.append(E('span',LEGAL_LABEL[r.state],'pk-legal-badge'),E('strong',r.label),E('p',r.detail,'rp-check-detail'));ul.append(li)});box.append(ul);return [box]}
 // 4. checks, files, save
 function renderResult(quiet){const m=st.m;if(!quiet)setStep(4);result.hidden=false;const list=docs(),cs=checksOf(m,brand,{docs:list,illustrationDpi:illustrationDpi(list)});
  const checks=E('div',undefined,'rp-checks');checks.append(E('h4','Controlli prima dell’export'),...cs.map(checkRow));
  const what=E('div',undefined,'mk-what pk-what');what.append(E('h4','Nello zip'));const ul=E('ul');
  [m.variants.length+(m.variants.length===1?' PDF per la tipografia':' PDF per la tipografia, uno per versione')+': CMYK, 3 mm di abbondanza, segni di taglio, testi in tracciati','La fustella in un PDF a parte, alla stessa scala: magenta 100 %, taglio continuo'+(geometry(m.format,m.size).crease.length?', pieghe tratteggiate':''),'Anteprime PNG con la fustella','SVG piatti per i mockup, grafica e fustella su livelli separati','LEGGIMI.txt con controlli, checklist «da verificare» e note per la stampa'].forEach(t=>ul.append(E('li',t)));what.append(ul);
  const mk=button('Crea i file','primary'),saveB=button('Salva nel progetto'),acts=E('div',undefined,'ps-actions rp-actions'),rs=E('p','','tool-status');rs.setAttribute('role','status');const out=E('div',undefined,'ig-out');
  acts.append(mk,saveB,E('span','Nessuna chiamata AI, nessun costo.','muted'));
  mk.onclick=async()=>{if(st.busy)return;const l2=docs(),c=checksOf(m,brand,{docs:l2,illustrationDpi:illustrationDpi(l2)});if(blocking(c).length){rs.textContent='Prima sistema: '+blocking(c).map(x=>x.label.toLowerCase()).join(', ')+'.';return}
   const warns=c.filter(x=>x.state==='warn');if(warns.length&&!await askConfirm({title:'Creare i file lo stesso?',message:warns.map(x=>x.label+': '+x.detail).join('\n'),ok:'Crea lo stesso',cancel:'Torna ai controlli'}))return;
   st.busy=true;mk.disabled=true;rs.textContent='Preparo PDF, fustella e anteprime…';
   try{if(P.loadGlyphs)await P.loadGlyphs();XH=null;st.files=await files(m,brand,{date:today(),png:svgToPng,illustrationDpi:illustrationDpi(l2),prepare:d=>d.pages[0].items.some(x=>x.t==='image')?P.prepareImages(d,{pdfx:true}):d});renderFiles(out,rs);rs.textContent='Pronti '+st.files.length+' file.';scroll(out)}
   catch(e){rs.textContent='File non creati: '+e.message}finally{st.busy=false;mk.disabled=false}};
  saveB.onclick=async()=>{if(!ctx.workspace||!ctx.projectId){rs.textContent='Apri un progetto per salvare.';return}saveB.disabled=true;
   try{st.store=await saveStore(ctx.workspace,ctx.projectId,withRecord(savedRecord(m,{by:ctx.by})));rs.textContent='Etichetta salvata nel progetto (testi e impostazioni; l’illustrazione resta sul tuo computer).';renderSaved()}
   catch(e){rs.textContent='Salvataggio non riuscito: '+e.message}finally{saveB.disabled=false}};
  result.replaceChildren(checks,what,acts,rs,out);if(st.files)renderFiles(out,rs)}
 function renderFiles(out,rs){const list=st.files||[],hd=E('div',undefined,'co-kit-head ig-files-head');hd.append(E('h3','I file per la tipografia sono pronti'),E('p',list.length+' file: scarica lo zip o i singoli PDF. Stampa una prova al 100 % e misura col righello.','ad-idea'));
  const btns=E('div',undefined,'ps-actions'),zipB=button('Scarica tutto (.zip)','primary');zipB.onclick=()=>{P.download(fileBase(st.m)+'.zip',bundle(list,{date:today()}),MIME.zip);rs.textContent='Zip scaricato: '+list.length+' file.'};btns.append(zipB);
  list.filter(x=>/\.pdf$/.test(x.name)).slice(0,4).forEach(x=>{const b=button(/^fustella/.test(x.name)?'Fustella (PDF)':'PDF · '+x.name.replace(/^stampa\//,'').replace(/\.pdf$/,''));b.onclick=()=>P.download(x.name.split('/').pop(),x.data,MIME.pdf);btns.append(b)});
  const gal=E('div',undefined,'pk-gallery');list.filter(x=>/^anteprime\/.*\.png$/.test(x.name)).forEach(x=>{const f=E('figure'),im=E('img');im.src=root.URL.createObjectURL(new root.Blob([x.data],{type:'image/png'}));im.alt=x.label;f.append(im,E('figcaption',x.name.replace(/^anteprime\//,'')));gal.append(f)});
  const ul=E('ul',undefined,'ig-file-list');list.forEach(x=>{const li=E('li');li.append(E('code',x.name),E('small',x.label));ul.append(li)});out.replaceChildren(hd,btns,gal,ul)}
 function renderSaved(){const items=st.store.items;if(!items.length){saved.hidden=true;return}saved.replaceChildren(E('h4','Etichette salvate nel progetto'));const row=E('div',undefined,'ad-saved-row');
  items.slice(-4).reverse().forEach(r=>{const b=button((r.name||'Etichetta')+' · '+formatOf(r.format).title+' · '+String(r.at||'').slice(0,10),'ad-saved-item');
   b.onclick=()=>{st.m=modelOf(r.model);st.touched=true;st.files=null;st.vi=0;renderForm();if(st.m.style){renderDirs();renderRefine()}status.textContent='Riaperta l’etichetta salvata il '+String(r.at||'').slice(0,10)+(st.m.illustration?': ricarica l’illustrazione in «Stile e immagine».':'.')};row.append(b)});
  saved.append(row);saved.hidden=false}
 async function loadSaved(){if(!ctx.workspace||!ctx.projectId)return;try{const doc=await ctx.workspace.bind(ctx.projectId,'agents').load();st.store=readStore(doc);
  if(!st.touched){const pre=prefill(ctx.profile,{projectName:ctx.projectName,agentsDoc:doc});if(pre.producer&&!clean(st.m.common.producer)){st.m.common.producer=pre.producer;st.m.from=pre.from}}renderSaved()}catch(e){/* works without */}}
 renderForm();loadSaved();return wrap}


return Object.freeze({AGENT,MAX_SAVED,MAX_VARIANTS,BLEED,DIE,TYPES,FORMATS,STYLES,ALLERGENS,EAN,NUTRI,COLOR_ROLES,
 formatOf,styleOf,sizeOf,sizeText,emphasize,allergenLabel,eanCheck,eanStatus,eanModules,eanItems,eanWidth,nutrition,netOf,netMinFigure,emptyModel,modelOf,prefill,newModel,brandFor,
 geometry,flow,xRatio,xHeightMm,legalParas,draw,dieDoc,labelSvg,legalChecklist,legalSize,checksOf,blocking,readme,files,bundle,fileBase,variantFile,readStore,savedRecord,saveStore,withRecord,packagingStudio:typeof packagingStudio==='function'?packagingStudio:null});
});
