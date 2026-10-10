const test=require('node:test');
const assert=require('node:assert/strict');
const scene=require('../command-center-network-scene.js');
test('tilted orbit projects a near and far arc with depth and closes after a revolution',()=>{
  const o={x:450,y:245,rx:110,ry:64,tilt:-19,phase:0,speed:1};
  const near=scene.orbitPoint(o,Math.PI/2),far=scene.orbitPoint(o,Math.PI*1.5);
  assert.ok(near.scale>far.scale);assert.ok(near.opacity>far.opacity);
  assert.ok(near.x>450);assert.ok(far.x<450);
  const first=scene.orbitPoint(o,0),last=scene.orbitPoint(o,2*Math.PI);
  assert.ok(Math.abs(first.x-last.x)<1e-9&&Math.abs(first.y-last.y)<1e-9);
});
test('beam anchors stay on sphere edges while the pointer changes its curve',()=>{
  const base=scene.beamPath(235,140,24,13,0,0),hover=scene.beamPath(235,140,24,13,.5,-.4);
  const values=s=>s.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const a=values(base),b=values(hover);
  assert.deepEqual(a.slice(0,2),b.slice(0,2));assert.deepEqual(a.slice(-2),b.slice(-2));
  assert.notDeepEqual(a.slice(2,6),b.slice(2,6));
  assert.ok(Math.abs(Math.hypot(a[0]-450,a[1]-245)-60)<1e-9);
  assert.ok(Math.abs(Math.hypot(a.at(-2)-235,a.at(-1)-140)-24)<1e-9);
});
test('different project bundles retain distinct curves without invalid coordinates',()=>{
  const paths=[-26,-13,0,13,26].map(b=>scene.beamPath(670,155,18,b,0,0));
  assert.equal(new Set(paths).size,5);assert.ok(paths.every(p=>!p.includes('NaN')));
  assert.ok(!scene.beamPath(450,245,18,0,0,0).includes('NaN'));
});
test('reduced motion creates a static scene without scheduling animation frames',()=>{
  const source=require('node:fs').readFileSync('command-center-network-scene.js','utf8');
  const vm=require('node:vm');let scheduled=0;
  const media={matches:true,addEventListener(){},removeEventListener(){}};
  const node={getAttribute:k=>({'data-orbit-x':450,'data-orbit-y':245,'data-orbit-rx':110,'data-orbit-ry':64,'data-orbit-phase':1,'data-orbit-tilt':-19,'data-orbit-speed':.1}[k]),matches:()=>false,closest:()=>null,style:{},setAttribute(k,v){this[k]=v}};
  const svg={style:{},closest:()=>null,querySelectorAll:s=>s==='[data-orbit-x]'?[node]:[]};
  const wrap={addEventListener(){},removeEventListener(){}};
  const ctx={window:{matchMedia:()=>media},document:{hidden:false,addEventListener(){},removeEventListener(){}},MutationObserver:class{observe(){}disconnect(){}},requestAnimationFrame(){scheduled++;return 1},cancelAnimationFrame(){}};
  vm.createContext(ctx);vm.runInContext(source,ctx);const controller=ctx.window.RadixNetworkScene.attach(svg,wrap);
  assert.equal(scheduled,0);assert.ok(node.transform.startsWith('translate('));assert.equal(svg.style.transform,'');controller.destroy();
});
