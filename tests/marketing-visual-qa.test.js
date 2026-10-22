'use strict';
// Release visual QA of the Marketing area (Orbit, «Cosa vuoi fare oggi?» and its studios, PED, Studio Avatar):
// the CSS guards behind the fixes, so a later restyle does not bring back the horizontal scroll, the small tap targets
// or the low-contrast buttons found at 390px.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const css=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const media=(src,q)=>{const out=[];let i=0;const tag='@media ('+q+')';while((i=src.indexOf(tag,i))>=0){let d=0,j=src.indexOf('{',i);const s=j;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&--d===0)break}out.push(src.slice(s,j+1));i=j}return out.join('\n')};

test('Studio Avatar: the project select never widens the page, Marketing pink with dark ink, 40px controls',()=>{
 const a=css('shell/avatar.css');
 assert.match(a,/\.av-page \.av-project\{[^}]*min-width:0;max-width:100%/);
 assert.match(a,/\.av-page \.av-project select\{[^}]*max-width:100%/);
 assert.match(a,/\.av-page \.av-primary\{[^}]*background:var\(--mk\)[^}]*color:var\(--mk-ink\)/);
 assert.match(a,/\.av-page\{--mk:#ff5fa2;--mk-ink:#1a0610\}/);
 assert.match(a,/\.av-page button,\.av-page \.av-button\{[^}]*min-height:44px/);
 assert.match(a,/\.av-page \.av-chip\{[^}]*min-height:40px/);
 assert.match(media(a,'max-width:760px'),/\.av-page \.av-project,\.av-page \.av-project select\{width:100%\}/);
});

test('phone tap targets: crea filters and studio controls, Marketing home links (44px), PED toolbar and tabs are at least 40px',()=>{
 const c=css('shell/crea.css'),c640=media(c,'max-width:640px');
 assert.match(media(css('agency/crea.css'),'max-width:640px'),/\.cp-tabs\{flex-wrap:nowrap;overflow-x:auto/,'area tabs scroll sideways on the phone');
 assert.match(css('agency/crea.css'),/\.cp-tab\{[^}]*min-height:44px/);assert.match(css('agency/crea.css'),/\.cp-go\{[^}]*min-height:44px/);
 assert.match(c640,/\.cr-panel :is\(button,summary,select,[^)]*\)[^{]*\{min-height:40px!important\}/);
 const ma=media(css('shell/marketing-a.css'),'max-width:640px');
 assert.match(ma,/\.ma-area-services a\{[^}]*min-height:44px/);assert.match(ma,/\.ma-link\{min-height:44px\}/);assert.match(ma,/\.ma-area-title\{[^}]*min-height:44px/);
 assert.match(media(css('agency/orbit.css'),'max-width:640px'),/\.mo-pause\{min-height:44px/);
 assert.match(media(css('shell/agency.css'),'max-width:640px'),/body\.rx-agency button\.rx-logout\{min-height:40px/);
 const p=media(css('shell/ped-premium.css'),'max-width:767px');
 for(const s of ['.view-switch button{min-height:40px','.period-nav>button:is(#calendarPrev,#calendarNext,#calendarToday),html.rx-shell body.rx-ped .ped-rail-ch{min-height:40px','.rx-steps a{min-height:40px','#statsRefresh'])assert.ok(p.includes(s),s);
});

test('PED: analytics and results never wider than their panel on the phone; six KPI tiles never leave one alone',()=>{
 const p=css('shell/ped-premium.css');
 assert.match(media(p,'max-width:767px'),/\.ped-analytics \.two\{grid-template-columns:minmax\(0,1fr\)\}[\s\S]*\.ped-analytics \.two>\*\{min-width:0\}/);
 assert.match(p,/\.kpi-tiles:has\(>:nth-child\(6\):last-child\)\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
 assert.match(media(p,'min-width:1280px'),/repeat\(6,minmax\(0,1fr\)\)/);
});

test('the Guida «?» button reads at AA on Marketing pages',()=>{
 assert.match(css('shell/agency.css'),/body\.rx-agency button\.rx-guide-fab\{color:#140a2e\}/);
 assert.match(css('shell/ped-premium.css'),/body\.rx-ped button\.rx-guide-fab\{color:#140a2e\}/);
 // dark ink on the lightest Marketing violet used by the shell accent
 const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
 for(const bg of ['#a68bff','#b68cff']){const r=(lum(bg)+.05)/(lum('#140a2e')+.05);assert.ok(r>=4.5,bg+' '+r.toFixed(2))}
});
