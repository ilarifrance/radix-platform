'use strict';
// The Piano editoriale in the light Marketing look (shell/ped-premium.css on the tokens of shell/marketing-a.css): the
// palette points at the --ma-* tokens, the Marketing pink and the old green accents are gone, the four steps keep their
// stepper, the post previews keep the client's own colours, and the phone keeps 44px controls.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const media=(src,q)=>{const out=[];let i=0;const tag='@media ('+q+')';while((i=src.indexOf(tag,i))>=0){let d=0,j=src.indexOf('{',i);for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&--d===0)break}out.push(src.slice(i,j+1));i=j}return out.join('\n')};
const PINK=/#ff5fa2|#ff74b0|#ff9cc6|#1a0610|255,\s*95,\s*162|255,\s*156,\s*198/i;
const css=read('shell/ped-premium.css');

test('project-editorial.html: the body carries the marketing-a tokens, loaded before the PED layer; ids unchanged',()=>{
 const h=read('project-editorial.html');
 assert.match(h,/<body class="rx-ped ma-root"/);
 const a=h.indexOf('href="/shell/marketing-a.css"'),p=h.indexOf('href="/shell/ped-premium.css"');
 assert.ok(a>0&&p>a,'marketing-a.css before ped-premium.css');
 for(const id of ['pedSteps','newContent','writeAll','approveAll','scheduleAll','proposePlan','calendar','reviewDialog','reviewList','reviewApproveRest','reviewRedraw','identityDialog','identityPropose','identityApprove','results','statsRefresh','nextSteps','contentForm','approveContent'])
  assert.match(h,new RegExp('id="'+id+'"'),id);
});

test('shell/ped-premium.css: the PED palette reads the --ma-* tokens, no pink and no old green accent',()=>{
 const pal=/html\.rx-shell body\.rx-ped\{([^}]*)\}/.exec(css)[1];
 for(const [k,v] of [['--mk','--ma-vi'],['--ink','--ma-tx'],['--ink-2','--ma-tx2'],['--subtle','--ma-mut'],['--line','--ma-line'],['--line-2','--ma-line-2'],['--deep','--ma-bg'],['--st-review','--ma-warn'],['--st-approved','--ma-ok'],['--st-queued','--ma-cy'],['--rx-success','--ma-ok']])
  assert.ok(pal.includes(k+':var('+v+')'),k+' → '+v);
 assert.ok(!PINK.test(css),'no Marketing pink left in the PED');
 assert.ok(!/#00eab5|#1ef28f/i.test(css),'no old green accent');
 assert.match(css,/:focus-visible\{outline:2px solid var\(--ma-focus\)/,'focus ring on the marketing-a token');
});

test('shell/ped-premium.css: primary buttons and the current step use the light indigo button with white text at AA',()=>{
 assert.match(css,/--mk-btn:var\(--ma-btn\)/);
 assert.match(read('shell/marketing-a.css'),/--ma-btn:linear-gradient\(180deg,#5249e8,#4338ca\)/);
 const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
 for(const bg of ['#5249e8','#4338ca']){const r=1.05/(lum(bg)+.05);assert.ok(r>=4.5,bg+' '+r.toFixed(2))}
 assert.match(css,/button\.primary,html\.rx-shell body\.rx-ped \.primary\{background:var\(--mk-btn\)/);
 assert.match(css,/\.ped-steps li\[data-state=current\]::after\{[^}]*background:var\(--ma-grad\)/,'gradient bar on the current step');
 assert.match(css,/\.ped-steps li\[data-state=current\] \.ps-go\{display:inline-flex;background:var\(--mk-btn\)/,'the step action is the primary');
 assert.match(css,/\.ped-steps\{counter-reset:none;display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/,'four steps in one strip');
});

test('shell/ped-premium.css: the post previews keep the white network mock-up, not the RADIX colours',()=>{
 assert.match(css,/:is\(\.pp-mock,\.publish-preview\)\{[^}]*background:#fff;color:#1d2226/);
});

test('shell/ped-premium.css: on the phone every PED control is 44px and the steps come first in the plan card',()=>{
 const p=media(css,'max-width:767px');
 assert.match(p,/:is\(main,dialog\) :is\(button,\.button,summary,select,[^)]*\)[^{]*\{min-height:44px!important\}/);
 assert.match(p,/input\[type=color\]\{width:44px;height:44px\}/);
 assert.match(p,/#pedPage \.hero>\.ped-steps\{grid-row:1\}/);
 assert.match(css,/html\.rx-shell\.ped-agenda body\.rx-ped \.calendar\{display:flex!important;flex-direction:column/,'the calendar is a list on the phone');
});
