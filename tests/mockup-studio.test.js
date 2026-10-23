const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const M=require('../lib/mockup-studio.js'),F=require('./fixtures/mockup-forno-aurora.js'),PS=require('../lib/print-studio.js');
const root=path.join(__dirname,'..');
const close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,a+' ≈ '+b);
const full=()=>M.inventory(F.PROFILE,F.agentsDoc(),{projectName:'Forno Aurora'});

// ---- homography ----
test('the homography maps the 4 known points exactly and points in between projectively',()=>{
 const src=[[0,0],[100,0],[100,50],[0,50]],dst=[[12,30],[180,10],[210,140],[5,120]],H=M.homography(src,dst);
 src.forEach((p,i)=>{const q=M.apply(H,p[0],p[1]);close(q[0],dst[i][0],1e-7);close(q[1],dst[i][1],1e-7)});
 assert.equal(H[8],1);
 // straight lines stay straight: the centre is where the diagonals of the destination cross
 const c=M.apply(H,50,25),[a,b,cc,d]=dst,den=(a[0]-cc[0])*(b[1]-d[1])-(a[1]-cc[1])*(b[0]-d[0]),t=((a[0]-b[0])*(b[1]-d[1])-(a[1]-b[1])*(b[0]-d[0]))/den;
 close(c[0],a[0]+t*(cc[0]-a[0]),1e-7);close(c[1],a[1]+t*(cc[1]-a[1]),1e-7);
 // an affine case is reproduced exactly (no perspective terms)
 const A=M.homography(src,src.map(([x,y])=>[2*x+3,2*y-1]));close(A[6],0,1e-12);close(A[7],0,1e-12);close(M.apply(A,33,17)[0],69,1e-9);
});
test('the inverse homography brings every point back; degenerate quads give null',()=>{
 const H=M.homography([[0,0],[400,0],[400,300],[0,300]],[[40,60],[700,20],[760,520],[10,480]]),I=M.invert(H);
 for(const [x,y] of [[0,0],[123,45],[400,300],[250.5,299],[-20,10]]){const q=M.apply(H,x,y),b=M.apply(I,q[0],q[1]);close(b[0],x,1e-6);close(b[1],y,1e-6)}
 assert.equal(M.homography([[0,0],[1,0],[2,0],[3,0]],[[0,0],[1,0],[1,1],[0,1]]),null,'collinear source points');
 assert.equal(M.invert([1,2,3,2,4,6,0,0,0]),null);
});
test('the mesh covers the source with 2n² triangles whose affine maps agree with the homography at their corners',()=>{
 const H=M.homography([[0,0],[200,0],[200,100],[0,100]],[[0,0],[300,40],[280,260],[20,220]]),tris=M.mesh(200,100,H,6);
 assert.equal(tris.length,72);
 let area=0;for(const t of tris){const A=M.affine(t.s,t.d);t.s.forEach((p,i)=>{close(A[0]*p[0]+A[2]*p[1]+A[4],t.d[i][0],1e-6);close(A[1]*p[0]+A[3]*p[1]+A[5],t.d[i][1],1e-6)});area+=Math.abs(M.area2(t.s))}
 close(area,200*100,1e-6);
});
test('the camera keeps a flat rectangle seen from above a true rectangle (no keystone), and foreshortens it at an angle',()=>{
 const top=M.camera({target:[0,0,0],pitch:90,yaw:0,dist:1000,W:1200,H:800}),q=M.rect3([0,0,0],[1,0,0],[0,1,0],210,297).map(top.project);
 close(Math.hypot(q[1][0]-q[0][0],q[1][1]-q[0][1]),Math.hypot(q[2][0]-q[3][0],q[2][1]-q[3][1]),1e-6);
 close((q[0][1]+q[2][1])/2,400,1e-6);assert.ok(q[0][1]<q[3][1],'the top edge (far side) is up on the screen');
 const low=M.camera({target:[0,0,0],pitch:35,yaw:0,dist:1000,W:1200,H:800}),r=M.rect3([0,0,0],[1,0,0],[0,1,0],210,297).map(low.project);
 assert.ok(Math.hypot(r[1][0]-r[0][0],r[1][1]-r[0][1])<Math.hypot(r[2][0]-r[3][0],r[2][1]-r[3][1]),'the far edge is shorter');
 // the homography of the projected rectangle is the projection itself: the centre of the material lands on the 3D centre
 const H=M.homography([[0,0],[210,0],[210,297],[0,297]],r),c=M.apply(H,105,148.5),p=low.project([0,0,0]);close(c[0],p[0],1e-6);close(c[1],p[1],1e-6);
});

// ---- the materials ----
test('the inventory reads every saved material of the project, with its real size and origin',()=>{
 const inv=full(),k=Object.keys(inv.byKind).sort();
 assert.deepEqual(k,['biglietto-fronte','biglietto-retro','busta','carta','cartellina','copertina','logo','menu','pannello','post','profilo','rollup','sito-desktop','sito-mobile','storia']);
 assert.deepEqual([inv.byKind['biglietto-fronte'].w,inv.byKind['biglietto-fronte'].h],[85,55]);
 assert.deepEqual([inv.byKind.carta.w,inv.byKind.carta.h],[210,297]);
 assert.deepEqual(inv.byKind.cartellina.crop,{x:220,y:0,w:220,h:310},'the folder: its front cover only');
 assert.deepEqual([inv.byKind.rollup.crop.w,inv.byKind.rollup.crop.h],[850,1900],'the roll-up without the 10 cm hidden in the base');
 assert.equal(inv.byKind.busta.w,220);assert.equal(inv.byKind['sito-desktop'].source.type,'html');
 assert.match(inv.byKind.carta.source.svg,/^<svg/);assert.match(inv.byKind.carta.source.svg,/Forno Aurora/);
 assert.match(inv.byKind['biglietto-fronte'].from,/Coordinato aziendale del 2026-10-22/);
 assert.deepEqual(inv.missing,[]);assert.deepEqual(inv.notes,[]);
 // the company data on the materials are the saved ones, nothing else
 assert.match(inv.byKind['biglietto-retro'].source.svg,/Giulia Rinaldi/);assert.doesNotMatch(JSON.stringify(inv.list.map(m=>m.source.svg||'')),/Mario|Rossi|lorem/i);
});
test('missing materials are named with the studio that makes them; nothing is drawn in their place',()=>{
 const inv=M.inventory(F.PROFILE,F.agentsDoc(['menu']),{projectName:'Forno Aurora'});
 assert.deepEqual(Object.keys(inv.byKind).sort(),['logo','menu']);
 assert.deepEqual(inv.missing.map(m=>[m.id,m.studio]),[['biglietto','coordinato'],['carta','coordinato'],['busta','coordinato'],['cartellina','coordinato'],['grande','stampa'],['social','socialgrafica'],['sito','site']]);
 for(const m of inv.missing){assert.ok(m.why.length>20);assert.ok(m.studioName)}
 // the scenes: only those the materials allow
 assert.deepEqual(M.proposals(inv),['menu','insegna']);
 assert.equal(M.possible(M.scene('scrivania'),inv),false);assert.equal(M.possible(M.scene('portatile'),inv),false);
 // the menu scene leaves the business card out (it does not exist) and says so
 const pl=M.plan({scene:'menu'},inv,{W:1200,H:800}),ch=M.checksOf(pl,inv);
 assert.deepEqual(pl.filled,{menu:'menu'});assert.equal(ch.find(c=>c.id==='materiali').state,'warn');
 assert.ok(ch.find(c=>c.id==='materiali').issues.some(i=>/Biglietto da visita · fronte manca/.test(i)));
 // a scene whose required material is missing fails the check instead of inventing it
 const bad=M.plan({scene:'rollup'},inv,{W:1200,H:800});assert.deepEqual(bad.filled,{});assert.equal(M.checksOf(bad,inv).find(c=>c.id==='materiali').state,'fail');
 assert.equal(bad.ops.filter(o=>o.op==='texture').length,0);
});
test('no kit and no materials: an empty inventory, every group missing, no scene',()=>{
 const inv=M.inventory({},{schemaVersion:1,conversations:{}},{projectName:'Prova'});
 assert.deepEqual(inv.list,[]);assert.equal(inv.missing.length,M.GROUPS.length);assert.deepEqual(M.proposals(inv),[]);
 const kitOnly=M.inventory(F.PROFILE,null,{});assert.deepEqual(Object.keys(kitOnly.byKind),['logo']);assert.deepEqual(M.proposals(kitOnly),['insegna']);
 const pl=M.plan({scene:'insegna'},kitOnly,{W:1200,H:800});assert.deepEqual(pl.filled,{insegna:'logo'});
 assert.match(M.checksOf(pl,kitOnly).find(c=>c.id==='dati').detail,/targa dell’insegna è il logo del kit/);
});
test('materials with texts still to complete are flagged',()=>{
 const doc=F.agentsDoc(['social']);doc.socialKit.items[0].texts={};
 const inv=M.inventory(F.PROFILE,doc,{projectName:'Forno Aurora'});assert.ok(inv.byKind.post.placeholders.length>0);
 const pl=M.plan({scene:'telefono'},inv,{W:1200,H:800});assert.equal(M.checksOf(pl,inv).find(c=>c.id==='segnaposto').state,'warn');
});

// ---- scenes and plans ----
test('three varied proposals from a full project; every scene is possible',()=>{
 const inv=full();assert.deepEqual(M.proposals(inv),['scrivania','portatile','rollup']);
 for(const s of M.SCENES)assert.ok(M.possible(s,inv),s.id);
 assert.equal(new Set(M.proposals(inv).map(id=>M.scene(id).family)).size,3,'three families');
});
test('every plan keeps the materials in their own proportions, inside the frame, with shadows under them',()=>{
 const inv=full();
 for(const s of M.SCENES)for(const angle of Object.keys(M.ANGLES)){const pl=M.plan({scene:s.id,angle},inv,{W:1200,H:800}),tex=pl.ops.filter(o=>o.op==='texture');
  assert.ok(tex.length>0,s.id);assert.equal(M.checksOf(pl,inv).find(c=>c.id==='proporzioni').state,'ok',s.id+' '+angle);
  for(const t of tex){const m=inv.byKind[t.mat];if(!t.screen)close(m.crop.w/m.crop.h,t.rect.w/t.rect.h,1e-9);
   for(const p of t.quad){assert.ok(p[0]>-1&&p[0]<1201&&p[1]>-1&&p[1]<801,s.id+' '+angle+' '+t.slot+' inside: '+p)}
   assert.ok(M.area2(t.quad)>0,'not mirrored: '+s.id+' '+t.slot)}
  if(s.surface==='table')assert.ok(pl.ops.findIndex(o=>o.op==='shadow')<pl.ops.findIndex(o=>o.op==='texture'),'shadow first');
  assert.equal(pl.ops[0].op,'surface')}
});
test('the desk scene stacks the pieces in order and fits them in the frame; options change only what they should',()=>{
 const inv=full(),pl=M.plan({scene:'scrivania'},inv,{W:2400,H:1600});
 assert.deepEqual(pl.ops.filter(o=>o.op==='texture').map(o=>o.slot),['cartellina','carta','busta','retro','fronte']);
 const pts=pl.ops.filter(o=>o.op==='texture').flatMap(o=>o.quad),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
 assert.ok(Math.max(...xs)-Math.min(...xs)>2400*.7||Math.max(...ys)-Math.min(...ys)>1600*.7,'fills the frame');
 const off=M.plan({scene:'scrivania',off:{busta:true,cartellina:true}},inv,{W:1200,H:800});
 assert.deepEqual(off.ops.filter(o=>o.op==='texture').map(o=>o.slot),['carta','retro','fronte']);
 assert.equal(M.checksOf(off,inv).find(c=>c.id==='materiali').state,'ok','switched off on purpose: not missing');
 const dark=M.plan({scene:'scrivania',tone:'dark'},inv);assert.ok(dark.colours.dark);assert.notEqual(dark.ops[0].colour,pl.ops[0].colour);
 const soft=M.plan({scene:'scrivania',shadow:'morbida'},inv),strong=M.plan({scene:'scrivania',shadow:'forte'},inv);
 assert.ok(soft.ops.find(o=>o.op==='shadow').alpha<strong.ops.find(o=>o.op==='shadow').alpha);
 assert.deepEqual(M.normalize({scene:'scrivania',angle:'boh',tone:'viola',off:{carta:true,xx:true}}),{scene:'scrivania',angle:'frontale',shadow:'media',tone:'neutro',off:{carta:true},pref:{}});
 assert.deepEqual(M.normalize({scene:'biglietti',off:{pila:true}}).off,{},'a required slot cannot be switched off');
});
test('the phone shows the chosen screen; screens are filled at the screen proportions',()=>{
 const inv=full();for(const k of ['post','storia','copertina','sito-mobile']){const pl=M.plan({scene:'telefono',pref:{schermo:k}},inv,{W:1200,H:800}),t=pl.ops.find(o=>o.op==='texture'&&o.screen);
  assert.equal(t.mat,k);assert.equal(t.screen.kind,k);close(t.screen.w/t.screen.h,(M.PHONE.w-2*M.PHONE.inset)/(M.PHONE.h-2*M.PHONE.inset),1e-9);assert.ok(t.clip.length>8,'rounded screen')}
 const lap=M.plan({scene:'portatile'},inv,{W:1200,H:800}).ops.find(o=>o.op==='texture'&&o.slot==='schermo');close(lap.screen.w/lap.screen.h,16/10,.01);
});
test('the resolution check compares the sources with the export size',()=>{
 const inv=full(),pl=M.plan({scene:'portatile'},inv,{W:1200,H:800});
 assert.equal(M.checksOf(pl,inv,{sources:{'sito-desktop':{w:2880,h:1800,vector:false},'sito-mobile':{w:1170,h:2532,vector:false}}}).find(c=>c.id==='risoluzione').state,'ok');
 assert.equal(M.checksOf(pl,inv,{sources:{'sito-desktop':{w:400,h:250,vector:false}}}).find(c=>c.id==='risoluzione').state,'fail');
 const need=pl.items.find(i=>i.mat==='sito-desktop').need.w*2;
 assert.equal(M.checksOf(pl,inv,{sources:{'sito-desktop':{w:need*.9,h:10000,vector:false}}}).find(c=>c.id==='risoluzione').state,'warn');
 assert.ok(M.blocking(M.checksOf(pl,inv,{sources:{'sito-desktop':{w:400,h:250,vector:false}}})).length===1);
});
test('the site page is found in the Web Developer thread; scripts never travel with it',()=>{
 const s=M.siteHtml(F.agentsDoc(['sito']));assert.ok(s&&/Forno Aurora/.test(s.html));assert.equal(M.siteHtml({conversations:{}}),null);
 assert.match(fs.readFileSync(path.join(root,'lib','mockup-studio.js'),'utf8'),/querySelectorAll\('script,link,iframe,object,embed,noscript'\)\.forEach\(n=>n\.remove\(\)\)/);
});

// ---- files, saving ----
test('the contact sheet: A4 landscape pages of up to 4 mockups with captions, written by the print-studio PDF writer',()=>{
 const inv=full(),shots=['scrivania','portatile','rollup','telefono','menu'].map(id=>({title:M.scene(id).title,caption:M.caption(M.plan({scene:id},inv),inv),w:2400,h:1600}));
 const d=M.contactSheet(shots,inv.brand,{date:new Date('2026-10-23T10:00:00Z')});
 assert.equal(d.pages.length,2);assert.deepEqual([d.pages[0].w,d.pages[0].h],[297,210]);
 assert.equal(d.pages[0].items.filter(i=>i.t==='image').length,4);assert.equal(d.pages[1].items.filter(i=>i.t==='image').length,1);
 for(const p of d.pages)for(const it of p.items)if(it.t==='image'){assert.ok(it.x>=10&&it.x+it.w<=287&&it.y>=20&&it.y+it.h<=200,'inside the page');close(it.w/it.h,1.5,1e-9)}
 // with a tiny JPEG on each image the writer makes a real PDF
 const jpeg=Uint8Array.from([0xFF,0xD8,0xFF,0xD9]);for(const p of d.pages)for(const it of p.items)if(it.t==='image')it.raster={w:1,h:1,jpeg};
 const pdf=PS.pdf(d,{mode:'web',date:new Date('2026-10-23T10:00:00Z'),title:d.title,producer:'RADIX Mockup'}),txt=Buffer.from(pdf).toString('latin1');
 assert.match(txt,/^%PDF-/);assert.equal((txt.match(/\/Type \/Page\b/g)||[]).length,2);assert.match(txt,/\/DCTDecode/);
 assert.match(M.readme(inv,shots.map((s,i)=>({...s,name:'m'+i+'.png'})),M.checksOf(M.plan({scene:'scrivania'},inv),inv),{date:new Date('2026-10-23')}),/Nessuna chiamata AI/);
});
test('the choice is saved under mockups in the agents document, the rest of the document kept',async()=>{
 const inv=full(),pl=M.plan({scene:'telefono',tone:'primary',pref:{schermo:'storia'}},inv),rec=M.savedRecord(pl,inv,{by:'Prova',at:'2026-10-23T10:00:00.000Z'});
 assert.equal(rec.id,'mockup-20261023100000');assert.deepEqual(M.inputOf(rec),{scene:'telefono',angle:'leggera',shadow:'media',tone:'primary',off:{},pref:{schermo:'storia'}});
 assert.equal(rec.materials.schermo.kind,'storia');assert.ok(!JSON.stringify(rec).includes('<svg'),'no drawings in the record');
 let store={schemaVersion:1,conversations:{a:[1]},coordinato:{schemaVersion:1,items:[]}};const ws={bind:()=>({load:async()=>store,save:async d=>{store=d}})};
 await M.saveToProject(ws,'demo',rec);assert.deepEqual(store.conversations,{a:[1]});assert.ok(store.coordinato);assert.equal(M.readStore(store).items.length,1);
 let s=M.readStore(store);for(let i=0;i<12;i++)s=M.addRecord(s,{...rec,id:'r'+i});assert.equal(s.items.length,10);
 const ap=fs.readFileSync(path.join(root,'agents-page.js'),'utf8');assert.match(ap,/if\(d\.mockups\)out\.mockups=d\.mockups/);assert.match(ap,/data\.mockups=fresh\.mockups/);
});
test('the studio is wired in the Marketing panel and draws without AI',()=>{
 const html=fs.readFileSync(path.join(root,'agency','crea.html'),'utf8'),js=fs.readFileSync(path.join(root,'agency','crea.js'),'utf8'),src=fs.readFileSync(path.join(root,'lib','mockup-studio.js'),'utf8');
 assert.match(html,/<script src="\/lib\/mockup-studio\.js"><\/script>/);assert.match(js,/c\.inline==='mockup'/);assert.match(js,/RadixMockupStudio/);
 assert.doesNotMatch(src,/fetch\(|\/api\/|higgsfield|openai/i,'no network and no AI');
 for(const k of Object.values(M.KINDS))assert.ok(require('../agency/crea-core.js').card(k.studio),'studio card '+k.studio);
});
