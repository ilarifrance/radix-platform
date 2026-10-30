'use strict';
const test=require('node:test'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
for(const file of ['control-center-v2.html','radix-crm-concept.html','radix-pm-concept.html'])test('inline JavaScript syntax: '+file,()=>{const html=fs.readFileSync(file,'utf8');for(const part of html.split('<script').slice(1)){const body=part.slice(part.indexOf('>')+1).split('</script>')[0];new vm.Script(body,{filename:file})}});
test('dashboard uses the authenticated summary without legacy fallback',()=>{const s=fs.readFileSync('control-center-v2.html','utf8');assert.ok(s.includes('state?view=dashboard'));assert.ok(!s.includes('/api/dashboard')&&!s.includes('legacyProjection'));assert.ok(s.includes('if(loadInFlight||authStopped)return'));assert.ok(s.includes('controller.abort'));assert.ok(s.includes('clearPrivate()'))});
// Every page's inline scripts must parse; a stray brace once left agency/new-project.html blank.
// index.html (v3.7) is skipped: its scripts build other scripts as strings, which this split cannot follow.
test('inline JavaScript syntax: every page',()=>{
 const path=require('node:path');
 const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.name==='node_modules'||e.name.startsWith('.')?[]:e.isDirectory()?walk(path.join(d,e.name)):e.name.endsWith('.html')?[path.join(d,e.name)]:[]);
 const files=walk('.').filter(f=>f!=='index.html');assert.ok(files.length>20);
 for(const file of files){const html=fs.readFileSync(file,'utf8');for(const part of html.split('<script').slice(1)){const tag=part.slice(0,part.indexOf('>'));if(/src=|type="(module|application\/(ld\+)?json|importmap)/.test(tag))continue;new vm.Script(part.slice(part.indexOf('>')+1).split('</script>')[0],{filename:file})}}
});
