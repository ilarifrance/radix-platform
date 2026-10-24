/* Studio «Set di icone» (agency job B6, the free part): the browser widget of «Cosa vuoi fare» › Brand. NO AI, no network,
   no credits: everything is drawn here from the vendored Lucide catalogue (lib/icon-set.js, ISC) by lib/icon-core.js.
   1. Domande: the concepts (suggested from the project, free text up to 24), the use (sito, social, app, stampa), the
      colours (from the Kit identità when the project has one) and the brand name for the files.
   2. Proposte: every concept mapped to an icon by the Italian synonym table, «non trovata» with alternatives, any icon
      swapped from the whole catalogue; the set drawn live in 3 coherent styles (contorno sottile, contorno spesso
      arrotondato, duotono in contenitore), the one advised for the first use marked.
   3. Rifinisci: stroke, corners, grid 24/32/48, padding, background shape, colours; preview big and at 16/24/32 px on light
      and dark.
   4. Controlli ed export: same stroke and grid, contrast, 16 px legibility, dense/missing/repeated icons; the zip (SVG per
      icon, currentColor versions, PNG 64/128/512, sprite, preview sheet, LEGGIMI, Lucide licence); «Salva nel progetto»
      writes the choices in the «agents» document under the key «icons».
   The mascot is shown as «da collegare»: it needs paid image generation, no call starts from here. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixIconStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const C=()=>lib('RadixIconCore','./icon-core.js'),ZIP=()=>lib('RadixZip','./zip-lite.js');
const AGENT='art-director';
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();

// ---- DOM helpers (browser) ----
const dom=()=>root.document;
const E=(tag,text,cls)=>{const x=dom().createElement(tag);if(text!=null)x.textContent=text;if(cls)x.className=cls;return x};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
const svgUrl=svg=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
const svgImg=(svg,alt,px)=>{const i=E('img');i.src=svgUrl(svg);i.alt=alt||'';i.decoding='async';if(px){i.width=px;i.height=px}return i};
const note=text=>E('p',text,'cs-note');
const comma=v=>String(v).replace('.',',');
function field(label,value,on,{max=80,ph='',help=''}={}){const l=E('label',undefined,'rp-field'),x=E('input');x.type='text';x.maxLength=max;x.value=value||'';x.placeholder=ph;l.append(E('span',label),x);if(help)l.append(E('small',help,'rp-help'));x.oninput=()=>on(x.value);return l}
function choice(legend,items,cur,onchange,{name,cls='',multi=false}={}){const fs=E('fieldset',undefined,'ig-choice is-choice '+cls);fs.append(E('legend',legend));
 items.forEach(it=>{const l=E('label',undefined,'ps-chip ig-chip'),x=E('input');x.type=multi?'checkbox':'radio';x.name=name;x.value=it.id;x.checked=multi?cur.includes(it.id):it.id===cur;
  x.onchange=()=>{if(multi)onchange(it.id,x.checked);else if(x.checked)onchange(it.id)};const t=E('span',undefined,'ig-chip-text');t.append(E('b',it.label));if(it.small)t.append(E('small',it.small));l.append(x,t);l.dataset.value=it.id;fs.append(l)});return fs}
function slider(label,value,min,max,step,on,{fmt=v=>comma(v),help=''}={}){const l=E('label',undefined,'rp-field is-slider'),top=E('span',undefined,'is-slider-top'),out=E('output',fmt(value)),x=E('input');
 x.type='range';x.min=String(min);x.max=String(max);x.step=String(step);x.value=String(value);top.append(E('span',label),out);l.append(top,x);if(help)l.append(E('small',help,'rp-help'));
 x.oninput=()=>{out.textContent=fmt(+x.value);on(+x.value)};return l}
function colorField(label,value,on,swatches){const l=E('div',undefined,'rp-field is-color'),row=E('div',undefined,'is-color-row'),x=E('input');x.type='color';x.value=String(value).toLowerCase();x.setAttribute('aria-label',label);
 const code=E('code',value);x.oninput=()=>{code.textContent=x.value.toUpperCase();on(x.value.toUpperCase())};row.append(x,code);
 for(const sw of swatches||[]){const b=button('','is-swatch');b.style.background=sw.hex;b.title=(sw.name||sw.role)+' '+sw.hex;b.setAttribute('aria-label',label+': '+(sw.name||sw.role||'colore')+' '+sw.hex);b.onclick=()=>{x.value=sw.hex.toLowerCase();code.textContent=sw.hex;on(sw.hex)};row.append(b)}
 l.append(E('span',label),row);return l}
const MIME={zip:'application/zip',svg:'image/svg+xml',png:'image/png'};
function download(name,bytes,type){const a=E('a');a.href=root.URL.createObjectURL(new root.Blob([bytes],{type}));a.download=name;dom().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),2000);return name}
function svgToPng(svg,w,h){return new Promise((res,rej)=>{const img=new root.Image();img.onload=()=>{try{const c=E('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.clearRect(0,0,w,h);g.imageSmoothingQuality='high';g.drawImage(img,0,0,w,h);
  c.toBlob(b=>b?b.arrayBuffer().then(x=>res(new Uint8Array(x)),rej):rej(Error('PNG non creato')),'image/png')}catch(e){rej(e)}};img.onerror=()=>rej(Error('Icona non disegnabile'));img.src=svgUrl(svg)})}
const tick=()=>new Promise(r=>setTimeout(r,0));

// ctx: {project, profile, projectName, projectId, workspace, agentsUrl, identityUrl, openIdentity, today, by}
function iconStudio(ctx={}){const K=C(),today=()=>ctx.today?new Date(ctx.today):new Date(),profile=ctx.profile||{},pal=K.kitPalette(profile),col0=K.colorsFrom(profile);
 const brand0=clean(profile.identityKit&&profile.identityKit.brand)||clean(String(ctx.projectName||'').split(/\s[—–-]\s/)[0]);
 const suggested=K.suggestConcepts(ctx.project,profile);
 const st={ans:{name:brand0,text:'',uses:['sito'],fg:col0.fg,bg:col0.bg},items:[],style:'',settings:null,files:null,busy:false,store:K.emptyStore(),picking:-1,query:''};
 const wrap=E('div',undefined,'tool photo-studio ad-studio report-studio infographic-studio icon-studio');
 const steps=E('ol',undefined,'ps-steps');['Domande','Proposte','Rifinisci','Controlli ed export'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');setStep(1);
 const saved=E('div',undefined,'ad-saved rp-saved');saved.hidden=true;const status=E('p','','tool-status');status.setAttribute('role','status');
 const form=E('div',undefined,'ps-form is-form'),mapBox=E('div',undefined,'rp-result is-map'),dirs=E('div',undefined,'ad-dirs is-dirs'),refine=E('div',undefined,'rp-result is-refine'),result=E('div',undefined,'rp-result is-export');
 mapBox.hidden=dirs.hidden=refine.hidden=result.hidden=true;
 wrap.append(steps,saved,form,status,mapBox,dirs,refine,result);
 const scroll=x=>x.scrollIntoView&&x.scrollIntoView({behavior:'smooth',block:'start'});
 const colors=()=>({fg:st.ans.fg,bg:st.ans.bg,surface:'#FFFFFF'});
 const set=()=>K.setOf(st.items);
 const iconImg=(name,s,label,px)=>svgImg(K.iconSvg(name,s),label,px);

 // 1. questions
 function renderForm(){form.replaceChildren();const a=st.ans;
  form.append(note('Scrivi i concetti che ti servono: per ognuno scelgo un’icona dal catalogo Lucide (licenza libera, uso commerciale permesso) e la disegno in 3 stili coerenti. Tutto qui nel browser, senza AI e senza costi.'));
  const g=E('div',undefined,'rp-fields is-name');g.append(field('Nome della marca',a.name,v=>{a.name=v},{max:60,ph:'Es. Forno Aurora',help:'Va nei nomi dei file e nel foglio di anteprima.'}));form.append(g);
  const cl=E('label',undefined,'rp-field is-concepts'),ta=E('textarea');ta.rows=6;ta.value=a.text;ta.placeholder='Un concetto per riga, es.\nConsegna a domicilio\nSenza glutine\nPrenotazione';
  const count=E('small','','rp-help'),upd=()=>{const n=K.parseConcepts(ta.value).length,over=String(ta.value).split(/[\n,;]+/).filter(x=>clean(x)).length>K.MAX_CONCEPTS;count.textContent=n+' di '+K.MAX_CONCEPTS+' concetti'+(over?' · oltre i '+K.MAX_CONCEPTS+' non li uso':'')+' · uno per riga o separati da virgola';go.disabled=!n};
  ta.oninput=()=>{a.text=ta.value;upd()};cl.append(E('span','Concetti (fino a '+K.MAX_CONCEPTS+')'),ta,count);
  const sug=E('div',undefined,'is-suggest');
  if(suggested.length){sug.append(E('span','Suggeriti dal progetto','rp-label'));const row=E('div',undefined,'is-suggest-row');
   suggested.forEach(l=>{const b=button('+ '+l,'is-sug');b.onclick=()=>{const cur=K.parseConcepts(ta.value);if(cur.some(x=>K.fold(x)===K.fold(l))||cur.length>=K.MAX_CONCEPTS)return;ta.value=(ta.value.trim()?ta.value.replace(/\s+$/,'')+'\n':'')+l;a.text=ta.value;upd();b.disabled=true};row.append(b)});
   const all=button('Aggiungili tutti','ig-move');all.onclick=()=>{const cur=K.parseConcepts(ta.value);ta.value=K.parseConcepts(cur.concat(suggested).join('\n')).join('\n');a.text=ta.value;upd();row.querySelectorAll('.is-sug').forEach(b=>b.disabled=true)};row.append(all);sug.append(row,E('small','Letti dal nome, dalla descrizione e dal brief del progetto, più i contatti di base. Togli quelli che non servono.','rp-help'))}
  form.append(cl,sug);
  form.append(choice('Dove le userai',K.USES.map(u=>({id:u.id,label:u.label,small:u.small})),a.uses,(id,on)=>{a.uses=on?K.USES.map(u=>u.id).filter(x=>x===id||a.uses.includes(x)):a.uses.filter(x=>x!==id)},{name:'is-uses',cls:'is-uses',multi:true}));
  const cf=E('fieldset',undefined,'rp-refine is-colors');cf.append(E('legend','Colori'));
  cf.append(colorField('Colore delle icone',a.fg,v=>{a.fg=v;a.bg=K.mix(v,'#FFFFFF',.14)},pal));
  if(pal.length)cf.append(E('small','Dal Kit identità del progetto: tocca un colore della palette. Il fondo del contenitore è una tinta chiara dello stesso colore (lo cambi nella rifinitura).','rp-help'));
  else{const p=E('p',undefined,'rp-help is-kit');p.append('Il progetto non ha un Kit identità: parto da un indaco neutro. ');if(ctx.openIdentity||ctx.identityUrl){const l=E('a','Crea il Kit identità →');l.href=ctx.identityUrl||'#';l.onclick=e=>{if(ctx.openIdentity){e.preventDefault();ctx.openIdentity()}};p.append(l)}cf.append(p)}
  form.append(cf);
  const ms=E('div',undefined,'is-mascot'),mh=E('div',undefined,'is-mascot-head');mh.append(E('strong',K.MASCOT.title),E('span',K.MASCOT.state,'is-tag'));ms.append(mh,E('p',K.MASCOT.line,'rp-help'));form.append(ms);
  const go=button(st.items.length?'Rifai le 3 proposte':'Prepara 3 proposte','primary'),bar=E('div',undefined,'ps-actions');bar.append(go,E('span','Nessuna chiamata AI: icone e file si creano qui, senza costi.','muted'));
  go.onclick=()=>{const list=K.parseConcepts(a.text);if(!list.length){status.textContent='Scrivi almeno un concetto.';return}
   const prev=new Map(st.items.map(x=>[K.fold(x.label),x]));st.items=list.map(l=>{const p=prev.get(K.fold(l));return p&&p.swapped?p:{...K.mapConcept(l),swapped:false}});
   st.style='';st.settings=null;st.files=null;st.picking=-1;refine.hidden=result.hidden=true;status.textContent='';renderMap();renderDirs();scroll(mapBox)};
  form.append(bar);upd()}

 // 2. concepts ↔ icons, and the 3 proposals
 const previewSettings=()=>st.settings||K.proposalSettings(st.style||K.advised(st.ans.uses),colors());
 function picker(i){const it=st.items[i],box=E('div',undefined,'is-picker'),top=E('div',undefined,'is-picker-top'),q=E('input');q.type='search';q.placeholder='Cerca nel catalogo: pane, auto, house…';q.value=st.query;q.setAttribute('aria-label','Cerca un’icona per «'+it.label+'»');
  const close=button('Chiudi','ig-move');close.onclick=()=>{st.picking=-1;renderMap()};top.append(q,close);
  const grid=E('div',undefined,'is-picker-grid'),info=E('small','','rp-help'),s=previewSettings();
  const fill=()=>{const names=K.searchCatalogue(q.value);info.textContent=names.length+(names.length===1?' icona':' icone')+(q.value.trim()?' per «'+q.value.trim()+'»':' nel catalogo');
   grid.replaceChildren(...names.slice(0,120).map(nm=>{const b=button('','is-pick');b.dataset.icon=nm;b.title=K.labelOf(nm);b.setAttribute('aria-label','Usa '+K.labelOf(nm));b.setAttribute('aria-pressed',String(it.icon===nm));b.append(iconImg(nm,{...s,shape:'none',padding:0,grid:24},'',28),E('small',K.labelOf(nm)));
    b.onclick=()=>{it.icon=nm;it.found=true;it.swapped=true;st.picking=-1;st.files=null;renderMap();renderDirs();if(!refine.hidden)drawPreview();if(!result.hidden)renderResult(true)};return b}))};
  q.oninput=()=>{st.query=q.value;fill()};fill();box.append(top,info,grid);setTimeout(()=>q.focus&&q.focus(),0);return box}
 function renderMap(){mapBox.hidden=false;setStep(st.style?3:2);const s=previewSettings(),list=E('ol',undefined,'is-map-list'),miss=st.items.filter(x=>!x.icon).length;
  const head=E('div',undefined,'fn-refine-head');head.append(E('h3','Concetti e icone'),E('p',st.items.length+(st.items.length===1?' concetto':' concetti')+(miss?' · '+miss+' senza icona: scegline una tra le alternative o cerca nel catalogo':' · tutti con la loro icona')+'. Tocca «Cambia» per sostituire qualsiasi icona.','ad-idea'));
  st.items.forEach((it,i)=>{const li=E('li',undefined,'is-row');li.dataset.found=String(!!it.icon);const fig=E('span',undefined,'is-row-icon');if(it.icon)fig.append(iconImg(it.icon,s,it.label,40));else fig.append(E('span','?','is-row-q'));
   const t=E('span',undefined,'is-row-text');t.append(E('b',it.label),E('small',it.icon?(it.swapped?'scelta da te · ':'')+K.labelOf(it.icon)+' ('+it.icon+')':'non trovata','is-row-state'));
   const ch=button(it.icon?'Cambia':'Cerca','ig-move');ch.onclick=()=>{st.picking=st.picking===i?-1:i;st.query=it.icon?'':it.label;renderMap()};
   const rm=button('Togli','ig-move is-remove');rm.setAttribute('aria-label','Togli «'+it.label+'»');rm.onclick=()=>{st.items.splice(i,1);st.ans.text=st.items.map(x=>x.label).join('\n');st.picking=-1;st.files=null;renderForm();if(!st.items.length){mapBox.hidden=dirs.hidden=refine.hidden=result.hidden=true;return}renderMap();renderDirs();if(!refine.hidden)drawPreview();if(!result.hidden)renderResult(true)};
   li.append(fig,t,ch,rm);
   if(!it.icon||(!it.swapped&&it.alternatives&&it.alternatives.length&&st.picking===i)){const alts=E('div',undefined,'is-alts');alts.append(E('span',it.icon?'Alternative':'Non trovata · prova:','rp-label'));
    (it.alternatives||[]).forEach(nm=>{const b=button('','is-alt');b.title=K.labelOf(nm);b.setAttribute('aria-label','Usa '+K.labelOf(nm)+' per «'+it.label+'»');b.append(iconImg(nm,{...s,shape:'none',padding:0,grid:24},'',24),E('small',K.labelOf(nm)));b.onclick=()=>{it.icon=nm;it.found=true;it.swapped=true;st.picking=-1;st.files=null;renderMap();renderDirs();if(!refine.hidden)drawPreview()};alts.append(b)});li.append(alts)}
   if(st.picking===i)li.append(picker(i));list.append(li)});
  mapBox.replaceChildren(head,list)}
 function sample(s,max=12){const g=E('div',undefined,'is-sample'),items=set();items.slice(0,max).forEach(it=>{const f=E('figure');f.append(iconImg(it.icon,s,it.label,s.shape==='none'?36:44),E('figcaption',it.label));g.append(f)});
  if(items.length>max)g.append(E('span','+'+(items.length-max),'is-more'));if(!items.length)g.append(E('p','Nessuna icona ancora: scegline almeno una qui sopra.','rp-help'));return g}
 function renderDirs(){dirs.hidden=false;const adv=K.advised(st.ans.uses),useLabel=(K.USES.find(u=>u.style===adv&&st.ans.uses.includes(u.id))||{}).label;
  dirs.replaceChildren(...K.STYLES.map(p=>{const s=K.proposalSettings(p.id,colors()),card=E('article',undefined,'ad-dir is-dir');card.dataset.style=p.id;card.dataset.chosen=String(st.style===p.id);
   const hd=E('div',undefined,'ad-dir-head');hd.append(E('span','Tratto '+comma(s.stroke)+' px'+(s.shape==='none'?'':' · contenitore'),'ad-angle'),E('h3',p.title),E('p',p.line,'ad-idea'));if(p.id===adv&&useLabel)hd.append(E('span','Consigliata per '+useLabel.toLowerCase(),'is-tag is-tag-ok'));
   const pick=button(st.style===p.id?'Stile scelto':'Scegli «'+p.title+'»','primary');pick.onclick=()=>{st.style=p.id;st.settings={...s};st.files=null;result.hidden=true;renderDirs();renderMap();renderRefine();scroll(refine)};
   card.append(hd,sample(s),pick);return card}))}

 // 3. refine
 const pv=E('div',undefined,'ig-preview is-preview');
 function drawPreview(){const s=st.settings,items=set(),head=E('div',undefined,'ig-preview-head');head.append(E('h4','Anteprima'),E('span',items.length+' icone · griglia '+s.grid+' px','is-stat'));
  const big=E('div',undefined,'is-big');big.style.background=s.surface;items.forEach(it=>{const f=E('figure');f.append(iconImg(it.icon,s,it.label,s.grid*2),E('figcaption',it.label));big.append(f)});
  const small=E('div',undefined,'is-small');const dark={...s,fg:'#FFFFFF',bg:K.mix('#FFFFFF','#1D1A27',.16),surface:'#1D1A27'};
  for(const [label,ss,cls] of [['Su chiaro',s,'is-small-light'],['Su scuro (bianco)',dark,'is-small-dark']]){const row=E('div',undefined,'is-small-row '+cls);row.append(E('span',label,'is-small-label'));
   [16,24,32].forEach(px=>{const f=E('figure');items.slice(0,8).forEach(it=>f.append(iconImg(it.icon,ss,it.label+' a '+px+' px',px)));f.append(E('figcaption',px+' px'));row.append(f)});small.append(row)}
  const px=K.strokeAt(s,16);pv.replaceChildren(head,big,E('h5','Prova in piccolo'),small,note('A 16 px il tratto è di '+comma(px)+' px'+(px<1?': rischia di sfocarsi, alza lo spessore o riduci il margine.':': resta nitido.')))}
 function renderRefine(){setStep(3);refine.hidden=false;const s=st.settings,box=E('div',undefined,'ig-work is-work'),edit=E('div',undefined,'ig-edit');
  const head=E('div',undefined,'fn-refine-head');head.append(E('h3','«'+(K.styleOf(st.style)||{title:'Su misura'}).title+'» · '+K.brandName(st.ans.name)),E('p','Ogni modifica vale per tutte le icone insieme: il set resta coerente.','ad-idea'));
  const redraw=()=>{st.files=null;drawPreview();renderDirsChosen();if(!result.hidden)renderResult(true)};
  const fs=E('fieldset',undefined,'rp-refine is-fs');fs.append(E('legend','Tratto e griglia'));const g=E('div',undefined,'is-sliders');
  g.append(slider('Spessore del tratto',s.stroke,1,3,.25,v=>{s.stroke=v;redraw()},{fmt:v=>comma(v)+' px',help:'Misurato sulla griglia da 24 px, come in Lucide.'}),
   slider('Margine interno',s.padding,0,6,.5,v=>{s.padding=v;redraw()},{fmt:v=>comma(v)+' px',help:'Spazio tra l’icona e il bordo (o il contenitore).'}));fs.append(g);
  fs.append(choice('Angoli e terminali',K.CORNERS.map(c=>({id:c.id,label:c.label})),s.corner,id=>{s.corner=id;redraw()},{name:'is-corner',cls:'is-corners'}));
  fs.append(choice('Griglia',K.GRIDS.map(n=>({id:String(n),label:n+' × '+n,small:n===24?'interfacce':n===32?'sito e social':'grandi e stampa'})),String(s.grid),id=>{s.grid=+id;redraw()},{name:'is-grid',cls:'is-grids'}));
  const fb=E('fieldset',undefined,'rp-refine is-fs');fb.append(E('legend','Sfondo e colori'));
  fb.append(choice('Forma dello sfondo',K.SHAPES.map(x=>({id:x.id,label:x.label})),s.shape,id=>{s.shape=id;if(id!=='none'&&s.padding<3)s.padding=4;renderRefine()},{name:'is-shape',cls:'is-shapes'}));
  const cg=E('div',undefined,'is-color-grid');cg.append(colorField('Icona',s.fg,v=>{s.fg=v;redraw()},pal),colorField('Contenitore',s.bg,v=>{s.bg=v;redraw()},[{role:'tinta',name:'Tinta chiara',hex:K.mix(s.fg,'#FFFFFF',.14)}].concat(pal)),colorField('Fondo dove le userai',s.surface,v=>{s.surface=v;redraw()},[{role:'bianco',name:'Bianco',hex:'#FFFFFF'},{role:'grigio',name:'Grigio chiaro',hex:'#F4F4F8'},{role:'scuro',name:'Scuro',hex:'#1D1A27'}]));fb.append(cg);
  const next=button('Controlla ed esporta','primary'),nb=E('div',undefined,'ps-actions');nb.append(next,E('span','SVG, PNG, sprite e anteprima si creano qui, senza AI e senza costi.','muted'));next.onclick=()=>{renderResult();scroll(result)};
  edit.append(head,fs,fb,nb);box.append(edit,pv);refine.replaceChildren(box);drawPreview()}
 function renderDirsChosen(){const c=dirs.querySelector('.is-dir[data-chosen=true]');if(c)c.dataset.edited='true'}

 // 4. checks and export
 function renderResult(quiet){if(!quiet)setStep(4);result.hidden=false;const s=st.settings,ck=K.checks(st.items,s);
  const checksBox=E('div',undefined,'rp-checks is-checks');checksBox.append(E('h4','Controlli'));
  ck.forEach(c=>{const row=E('div',undefined,'rp-check');row.dataset.state=c.state;row.dataset.check=c.id;row.append(E('span',{ok:'OK',warn:'Da guardare',fail:'Da sistemare'}[c.state],'rp-check-badge'),E('strong',c.label),E('p',c.text,'rp-check-detail'));checksBox.append(row)});
  const what=E('div',undefined,'mk-what is-what');what.append(E('h4','Nello zip'));const ul=E('ul');
  ['svg/: un SVG per icona, pulito, con viewBox '+s.grid+' × '+s.grid,'png/64, png/128 e png/512: PNG trasparenti','sprite.svg con tutte le icone e esempio-sprite.html per usarle nel sito','anteprima.png e anteprima.svg: il foglio con tutte le icone e la prova in piccolo','LEGGIMI.txt (stile, elenco, controlli, licenza) e LICENZA-lucide.txt'].forEach(t=>ul.append(E('li',t)));what.append(ul);
  const cc=E('label',undefined,'is-check'),cx=E('input');cx.type='checkbox';cx.checked=s.currentColor;cx.onchange=()=>{s.currentColor=cx.checked;st.files=null};cc.append(cx,E('span','Anche le versioni in currentColor (svg-currentcolor/): prendono il colore del testo intorno, utili nel sito'));what.append(cc);
  const mk=button('Crea i file','primary'),saveB=button('Salva nel progetto'),acts=E('div',undefined,'ps-actions rp-actions'),rs=E('p','','tool-status');rs.setAttribute('role','status');const out=E('div',undefined,'ig-out');
  acts.append(mk,saveB);const name=K.brandName(st.ans.name);
  if(K.blocking(ck))mk.disabled=true;
  mk.onclick=async()=>{if(st.busy)return;st.busy=true;mk.disabled=true;rs.textContent='Preparo SVG, PNG, sprite e anteprima…';
   try{await tick();st.files=await K.files(st.items,s,{name,date:today(),png:svgToPng,uses:st.ans.uses});renderFiles(out,rs);rs.textContent='Pronti '+st.files.length+' file.';scroll(out)}
   catch(e){rs.textContent='File non creati: '+e.message}finally{st.busy=false;mk.disabled=false}};
  saveB.onclick=async()=>{if(!ctx.workspace||!ctx.projectId){rs.textContent='Apri un progetto per salvare.';return}saveB.disabled=true;
   try{st.store=await K.saveStore(ctx.workspace,ctx.projectId,K.withRecord(K.savedRecord(st.items,s,{name,uses:st.ans.uses,by:ctx.by})));rs.textContent='Salvato nel progetto: concetti, icone scelte e stile (chiave «icons»). Riaprilo da «Set salvati».';renderSaved()}
   catch(e){rs.textContent='Salvataggio non riuscito: '+e.message}finally{saveB.disabled=false}};
  result.replaceChildren(checksBox,what,acts,rs,out);if(st.files)renderFiles(out,rs)}
 function renderFiles(out,rs){const list=st.files||[],name=K.brandName(st.ans.name),hd=E('div',undefined,'co-kit-head ig-files-head');hd.append(E('h3','Le icone sono pronte'),E('p',list.length+' file: scarica lo zip o il foglio di anteprima.','ad-idea'));
  const btns=E('div',undefined,'ps-actions'),zipB=button('Scarica tutto (.zip)','primary');zipB.onclick=()=>{download(K.zipName(name),K.bundle(list,{date:today()}),MIME.zip);rs.textContent='Zip scaricato: '+list.length+' file.'};btns.append(zipB);
  const sheet=list.find(x=>x.name==='anteprima.png');if(sheet){const b=button('Foglio di anteprima (PNG)');b.onclick=()=>download('anteprima-icone-'+(K.slug(name)||'set')+'.png',sheet.data,MIME.png);btns.append(b)}
  const sp=list.find(x=>x.name==='sprite.svg');if(sp){const b=button('Solo sprite.svg');b.onclick=()=>download('sprite.svg',sp.data,MIME.svg);btns.append(b)}
  const gal=E('div',undefined,'ig-gallery is-gallery');if(sheet){const f=E('figure',undefined,'ig-file'),im=E('img');im.src=root.URL.createObjectURL(new root.Blob([sheet.data],{type:MIME.png}));im.alt='Foglio di anteprima del set';f.append(im,E('figcaption','anteprima.png'));gal.append(f)}
  const groups=new Map();list.forEach(x=>{const k=x.name.includes('/')?x.name.replace(/\/[^/]+$/,'/'):x.name;groups.set(k,(groups.get(k)||0)+1)});
  const ul=E('ul',undefined,'ig-file-list');groups.forEach((n,k)=>{const li=E('li');li.append(E('code',k),E('small',k.endsWith('/')?n+' file':(list.find(x=>x.name===k)||{}).label||''));ul.append(li)});out.replaceChildren(hd,btns,gal,ul)}
 function renderSaved(){const items=st.store.items;if(!items.length){saved.hidden=true;return}saved.replaceChildren(E('h4','Set salvati nel progetto'));const row=E('div',undefined,'ad-saved-row');
  items.slice(-4).reverse().forEach(r=>{const b=button((r.name||'Set di icone')+' · '+r.concepts.length+' icone · '+((K.styleOf(r.settings.style)||{}).title||'su misura')+' · '+String(r.at||'').slice(0,10),'ad-saved-item');
   b.onclick=()=>{st.ans.name=r.name||st.ans.name;st.ans.uses=r.uses&&r.uses.length?r.uses:st.ans.uses;st.ans.text=r.concepts.map(c=>c.label).join('\n');
    st.items=r.concepts.map(c=>c.icon?{...K.mapConcept(c.label),icon:c.icon,found:true,swapped:true}:{...K.mapConcept(c.label),swapped:false});
    st.settings=K.settingsOf(r.settings);st.style=st.settings.style||'';st.ans.fg=st.settings.fg;st.ans.bg=st.settings.bg;st.files=null;renderForm();renderMap();renderDirs();renderRefine();renderResult();status.textContent='Riaperto il set salvato il '+String(r.at||'').slice(0,10)+'.';scroll(result)};row.append(b)});
  saved.append(row);saved.hidden=false}
 async function loadSaved(){if(!ctx.workspace||!ctx.projectId)return;try{st.store=K.readStore(await ctx.workspace.bind(ctx.projectId,'agents').load());renderSaved()}catch(e){/* works without */}}
 renderForm();loadSaved();return wrap}

return Object.freeze({AGENT,iconStudio});
});
