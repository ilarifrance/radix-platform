'use strict';
// The guided studios in the Marketing look «A» (shell/crea.css on the tokens of shell/marketing-a.css): the palette
// points at the --ma-* tokens, the Marketing pink is gone from the studios, the Studio Avatar and the RadixConfirm, the
// three proposals mark the chosen one, and the phone keeps 44px controls.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const media=(src,q)=>{const out=[];let i=0;const tag='@media ('+q+')';while((i=src.indexOf(tag,i))>=0){let d=0,j=src.indexOf('{',i);for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&--d===0)break}out.push(src.slice(i,j+1));i=j}return out.join('\n')};
const PINK=/#ff5fa2|#ff74b0|#ff9cc6|#1a0610|255,\s*95,\s*162|255,\s*156,\s*198/i;

test('marketing-a.css: the tokens also on .ma-root, for pages whose dialogs live outside .ma',()=>{
 const ma=read('shell/marketing-a.css');
 assert.match(ma,/\.ma,\.ma-root\{--ma-bg:/);
 assert.match(ma,/\n\.ma\{color:var\(--ma-tx\);font-family:/,'type and colour only on .ma');
 for(const p of ['agency/crea.html','agency/avatar.html']){const h=read(p);
  assert.match(h,/<body class="[^"]*\bma-root\b/,p+': the body carries the tokens');
  assert.match(h,/<link rel="stylesheet" href="\/shell\/marketing-a\.css">/,p)}
});

test('shell/crea.css: the studio palette points at the marketing-a tokens, no pink and no old focus green',()=>{
 const css=read('shell/crea.css');
 const pal=/\.cr-page\{([^}]*)\}/.exec(css)[1];
 for(const [k,v] of [['--mk','--ma-vi'],['--ink','--ma-tx'],['--ink-2','--ma-tx2'],['--muted','--ma-tx2'],['--subtle','--ma-mut'],['--amber','--ma-warn'],['--line','--ma-line'],['--line-2','--ma-line-2'],['--cyan','--ma-cy']])
  assert.ok(pal.includes(k+':var('+v+')'),k+' → '+v);
 assert.ok(!PINK.test(css),'no Marketing pink left in the studios');
 assert.ok(!/#00eab5|--rx-core/.test(css),'focus ring is --ma-focus');
 assert.ok((css.match(/var\(--ma-focus\)/g)||[]).length>=20,'focus ring on the marketing-a token');
});

test('shell/crea.css: the «A» block styles the shared studio components',()=>{
 const css=read('shell/crea.css'),a=css.slice(css.indexOf('Marketing look «A» for every guided studio'));
 assert.ok(a.length>2000,'the block is there');
 assert.match(a,/\.ps-steps li\[data-state=current\]\{[^}]*border-image:var\(--ma-grad\)/,'stepper');
 assert.match(a,/\.ps-chip:has\(input:checked\)\{[^}]*border-color:var\(--a-sel\)/,'chips');
 assert.match(a,/button\.primary\{[^}]*background:var\(--ma-btn\);color:#fff/,'primary button');
 assert.match(a,/\.ps-actions>\.muted::before/,'cost line');
 assert.match(a,/\.tool-status:not\(:empty\)/,'status');
 // every proposal card that a studio marks with data-chosen gets the ring and the «Scelta» label
 const chosen=/:is\(([^)]*)\)\[data-chosen=true\]::before\{content:"Scelta"/.exec(a);assert.ok(chosen,'«Scelta» label');
 const list=chosen[1].split(',');
 const cards={'lib/image-studio.js':'ps-card','lib/copy-studio.js':'ps-card','lib/identity-studio.js':'ps-card','lib/seo-studio.js':'ps-card','lib/site-studio.js':'ps-card','lib/video-studio.js':'ps-card',
  'lib/ad-studio.js':'ad-dir','lib/event-studio.js':'ad-dir','lib/gbp-studio.js':'gb-version','lib/newsletter-studio.js':'nl-prop','lib/product-studio.js':'pf-style','lib/translation-studio.js':'pf-style','lib/reel-studio.js':'rs-board','lib/doc-studio.js':'ds-style'};
 for(const [f,c] of Object.entries(cards)){assert.match(read(f),new RegExp("'"+c+"[ ']"),f+' still uses .'+c);assert.ok(list.includes('.'+c),'.'+c+' marked')}
 const phone=media(a,'max-width:640px');
 assert.match(phone,/min-height:44px!important/,'44px controls on the phone');assert.match(phone,/\.ps-chip/,'chips too');
});

test('Studio Avatar and RadixConfirm: no pink, the «A» primary',()=>{
 const av=read('shell/avatar.css'),rc=read('shell/radix-confirm.css');
 assert.ok(!PINK.test(av),'avatar');assert.ok(!PINK.test(rc),'confirm');
 assert.match(rc,/\.rx-confirm-actions button:focus-visible\{outline:2px solid var\(--rc-focus\)/);
 assert.match(rc,/\.rx-confirm--danger \.rx-confirm-yes\{background:/,'a destructive confirm is not the violet button');
});
