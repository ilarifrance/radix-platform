'use strict';
// Panoramica (agency/orbit.html) on a phone: a short page (5.851 → ~2.200 px at 390) with «Aspettano te» on the first
// screen. Nothing is removed: long lists show three items and «Mostra … (N)», the eight areas are one-line rows, the
// globe folds under its title. On a computer every rule here is off (the phone-only controls do not show).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const media=(src,q)=>{const out=[];let i=0;const tag='@media ('+q+')';while((i=src.indexOf(tag,i))>=0){let d=0,j=src.indexOf('{',i);for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&--d===0)break}out.push(src.slice(src.indexOf('{',i),j+1));i=j}return out.join('\n')};
const html=read('agency/orbit.html'),js=read('agency/orbit.js'),css=read('agency/orbit.css'),phone=media(css,'max-width:640px');
const desktop=css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g,'');

test('phone-only controls: real buttons tied to their list, hidden on a computer',()=>{
 for(const [id,box] of [['moWaitMore','moWait'],['moFlowMore','moFlow'],['moJobsMore','moJobs']])
  assert.match(html,new RegExp('<button type="button" class="mo-more" id="'+id+'" aria-controls="'+box+'" aria-expanded="false" hidden></button>'),id);
 assert.match(html,/<button type="button" class="mo-fold" id="moOrbitFold" aria-controls="moStage" aria-expanded="true">Nascondi<\/button>/);
 assert.match(html,/<a class="ma-link mo-all" href="\/agency\/crea\.html" id="moAllServicesFoot">Tutti i servizi<\/a>/,'«Tutti i servizi →» to Cosa vuoi fare');
 assert.match(desktop,/\.mo-more,\.mo-fold,\.mo-all\{display:none\}/,'on a computer none of them shows');
 assert.ok(!/data-collapsed|is-near|data-open/.test(desktop),'the folds act only on a phone');
 assert.match(phone,/\.mo-more:not\(\[hidden\]\)\{display:flex;[^}]*min-height:44px/,'«Mostra …» keeps hidden when there is nothing more, 44px');
 assert.match(phone,/\.mo-fold\{display:inline-flex;[^}]*min-height:44px/);
});

test('three items, then «Mostra … (N)»: «Aspettano te», the path around the phase to do now, the work in progress',()=>{
 assert.match(js,/function setFold\(id,box,n,what\)\{const b=\$\(id\),open=opened\.has\(id\),many=n>3;/);
 assert.match(js,/box\.dataset\.collapsed=String\(many&&!open\);b\.setAttribute\('aria-expanded',String\(many&&open\)\);b\.textContent=open\?'Mostra meno':'Mostra '\+what\+' \('\+n\+'\)'/);
 assert.match(js,/setFold\('moWaitMore',box,w\.items\.length,'tutti'\)/);
 assert.match(js,/setFold\('moJobsMore',box,j\.rows\.length,'tutti'\)/);
 assert.match(js,/setFold\('moFlowMore',\$\('moFlow'\),steps\.length,'tutte le fasi'\)/);
 assert.match(js,/from=k<0\?0:Math\.max\(0,Math\.min\(k-1,steps\.length-3\)\)/,'the phase before, the one to do now, the next');
 assert.match(phone,/\.mo-wait-list\[data-collapsed=true\]>li:nth-child\(n\+4\)\{display:none\}/);
 assert.match(phone,/#moJobs\[data-collapsed=true\] \.mo-job:nth-child\(n\+4\)\{display:none\}/);
 assert.match(phone,/\.mo-flow \[data-collapsed=true\]>\.ma-step:not\(\.is-near\)\{display:none\}/);
 // the logic of the window, as in orbit.js
 const win=(n,k)=>{const from=k<0?0:Math.max(0,Math.min(k-1,n-3));return [from,from+1,from+2]};
 assert.deepEqual(win(9,4),[3,4,5]);assert.deepEqual(win(9,0),[0,1,2]);assert.deepEqual(win(9,8),[6,7,8]);assert.deepEqual(win(9,-1),[0,1,2]);
});

test('the eight areas as one-line rows on a phone; the whole row opens the area; the cards on a computer as approved',()=>{
 assert.match(phone,/\.mo-areas \.ma-area\{display:grid;grid-template-columns:28px minmax\(0,1fr\) auto;[^}]*min-height:52px/);
 assert.match(phone,/\.mo-areas \.ma-area-num,\.mo-areas \.ma-area-line,\.mo-areas \.ma-area-services\{display:none\}/);
 assert.match(phone,/\.mo-areas \.mo-all\{display:inline-flex/);
 assert.match(desktop,/\.mo-area-grid\{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:12px\}/,'two cards a row on a computer');
 assert.match(js,/const h=node\('h3'\);const a=node\('a','ma-area-title',p\.group\);a\.href=p\.href;/,'the row link is the area title (its ::after covers the row)');
});

test('the globe folds on a phone (a picture there: the rows are the links), and lays out when it opens',()=>{
 assert.match(js,/showGlobe\(!phone\.matches\);orbitFold\.addEventListener\('click',\(\)=>showGlobe\(orbitBox\.dataset\.open!=='true'\)\)/);
 assert.match(js,/orbitFold\.setAttribute\('aria-expanded',String\(open\)\);orbitFold\.textContent=open\?'Nascondi':'Mostra il globo'/);
 assert.match(phone,/\.mo-orbit:not\(\[data-open=true\]\) \.mo-stage\{display:none\}/);
 assert.match(js,/const sizes=els\.map\(\(\{li\}\)=>\{li\.hidden=false;/,'labels measured shown, not at the 0 size of the folded stage');
});

test('the top on a phone: no date line, chips on one row, «Inizia» beside the text, suggestions in one row; titles stay for screen readers',()=>{
 assert.match(phone,/\.mo-crumb,\.mo-note\[data-state=live\]\{display:none\}/,'the status line shows when something is wrong');
 assert.match(phone,/\.mo-project\{flex-wrap:nowrap;overflow-x:auto;/);
 assert.match(phone,/\.mo-ask-title\{position:absolute;width:1px;height:1px;[^}]*clip:rect\(0 0 0 0\)/,'visually hidden, still the heading');
 assert.match(js,/input\.placeholder=phone\.matches\?'Cosa vuoi fare oggi\?':/);
 assert.match(phone,/\.mo-ask \.ma-command-bar\{flex-wrap:nowrap;/);
 assert.match(phone,/\.mo-ask \.ma-suggest\{flex-wrap:nowrap;overflow-x:auto;/);
 assert.match(phone,/\.mo-kpi\{flex-direction:column;align-items:stretch;gap:6px;padding:10px 12px\}/,'KPI tiles 2×2 and compact');
 assert.match(media(css,'max-width:1180px'),/\.mo-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
 assert.match(desktop,/\.mo-kpis\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\);gap:16px\}/,'four tiles a row on a computer');
});
