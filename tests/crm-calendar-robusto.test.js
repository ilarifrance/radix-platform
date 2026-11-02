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
test('an empty calendar says where its events come from',()=>{
 assert.ok(view.includes("if(!all.length){const why=E('p',undefined,'cal-empty cal-why')"),'the hint appears only with no event at all');
 assert.ok(view.includes("a.href='/impostazioni.html?area=sales#calendari'"),'it points to the external calendars settings');
});

test('calendar-view: a null CRM load and a broken external calendar are both visible, never a blank section', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'sales', 'calendar-view.js'), 'utf8');
  assert.match(src, /if\(!d\)\{const why=window\.RadixCrmData\?\.lastError;showError\(sec,\{message:'i dati del CRM non sono disponibili'/, 'null load → message');
  assert.match(src, /try\{return C\.busyEvents\(a,b\)\|\|\[\]\}catch\(e\)\{externalError=/, 'external() never throws');
  assert.match(src, /cal-external-error/, 'external failure line in the drawing');
});

test('crm-data: a failed read names the entity and the HTTP status in lastError, shown by the calendar', () => {
  const data = fs.readFileSync(path.join(__dirname, '..', 'sales', 'crm-data.js'), 'utf8');
  assert.match(data, /throw Error\(LABEL\[entity\]\+' \('\+\(e&&e\.message\|\|'rete'\)\+'\)'\)/);
  assert.match(data, /get lastError\(\)\{return lastError\}/);
  const cal = fs.readFileSync(path.join(__dirname, '..', 'sales', 'calendar-view.js'), 'utf8');
  assert.match(cal, /window\.RadixCrmData\?\.lastError/);
});

test('calendar-view: before sales.js sets the workspace, the loading line stays (no error flash at boot)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'sales', 'calendar-view.js'), 'utf8');
  assert.match(src, /if\(!d&&!window\.RadixCrmData\?\.workspace\?\.\(\)\)return;/);
});
