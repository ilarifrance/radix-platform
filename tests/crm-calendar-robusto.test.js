'use strict';
/* Calendario CRM (sales/calendar-view.js): a drawing error or a slow load never leaves the section blank for good. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const view=fs.readFileSync(path.join(__dirname,'..','sales','calendar-view.js'),'utf8');
test('the calendar says it is loading, reports a drawing error and draws again afterwards',()=>{
 assert.ok(view.includes("'Caricamento degli impegni…','muted cal-loading'"),'a loading line while CRM rows load');
 assert.ok(view.includes("try{d=await window.RadixCrmData?.load()}catch(e){if(sec.isConnected)showError(sec,e);return}"),'a failed load is shown');
 assert.ok(view.includes('try{draw(sec,d)}catch(e){busy=false;showError(sec,e);return}'),'a drawing error resets busy so the next change draws again');
 assert.ok(view.includes("'notice cal-error'")&&view.includes("p.setAttribute('role','alert')"),'the error line is announced');
 assert.ok(/function draw\(sec,d\)\{sec\.querySelector\(':scope>\.cal-loading'\)\?\.remove\(\);sec\.querySelector\(':scope>\.cal-error'\)\?\.remove\(\)/.test(view),'a drawing clears the loading and error lines');
});
