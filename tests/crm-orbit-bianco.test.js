'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=f=>fs.readFileSync(__dirname+'/../'+f,'utf8');

test('radix-sales.html: no old hero, a loading state named after the section, the ids sales.js uses are kept',()=>{
 const html=read('radix-sales.html');
 for(const old of ['Il commerciale.','Con tutto il contesto','Relazioni, contesto, prossime azioni'])assert.ok(!html.includes(old),old);
 for(const id of ['membership','status','error','content','navigation','workspace','refresh','crm-boot'])assert.ok(html.includes('id="'+id+'"'),id);
 // the boot script runs right after its element (not deferred), before #content, so the first paint has the right title
 const boot=html.indexOf('id="crm-boot"'),js=html.indexOf('<script src="sales/crm-boot.js"></script>');
 assert.ok(boot>0&&js>boot&&js<html.indexOf('id="content"'));
 assert.ok(html.indexOf('id="error"')<boot,'#error precedes #crm-boot so an error hides the skeleton');
 const css=read('sales/crm-light-sales.css');
 assert.match(css,/html\.rx-has-view #crm-boot/);assert.match(css,/html\.sx-no-crm #crm-boot/);assert.match(css,/#error:not\(\[hidden\]\)~#crm-boot/);
});

test('crm-boot.js names every Sales section of the menu',()=>{
 const src=read('sales/crm-boot.js'),nav=read('sales/sales-nav.js');
 const hashes=[...nav.matchAll(/CRM \+ '#(\w+)'/g)].map(m=>m[1]);
 assert.ok(hashes.length>=12);
 for(const h of hashes)assert.match(src,new RegExp('\\b'+h+':'),h);
});

test('Sales Orbit uses the white CRM theme and keeps the globe',()=>{
 const html=read('sales-orbit-higgsfield.html');
 const i=f=>html.indexOf('href="/sales/'+f+'"');
 assert.ok(i('crm-light.css')>i('sales-nav.css')&&i('orbit-light.css')>i('crm-light.css'),'light styles load last');
 assert.ok(i('orbit-universe.css')>0&&html.includes('/sales/orbit-globe.js')&&html.includes('class="so-sky"'));
 assert.ok(html.includes('<script src="/sales/sales-nav.js"></script>'),'same Sales menu');
 assert.ok(!/theme-color" content="#0/.test(html));
 const css=read('sales/orbit-light.css');
 assert.match(css,/\.so-layout\{background:linear-gradient\(180deg,var\(--so-hero-a\)/);
 assert.match(css,/var\(--crm-bg\) var\(--so-fade-1\)/,'the hero fades into the page white');
});

test('loading placeholders do not tell the user something false before the data arrives',()=>{
 assert.ok(!read('sales-pipeline-premium.html').includes('Seleziona un workspace per vedere il Kanban'));
 assert.match(read('sales/pipeline-premium.js'),/function idle\(msg\)/);
 const clients=read('agency/clients.html');
 assert.ok(clients.includes('Caricamento della rubrica clienti…'));
 assert.ok(clients.includes("catch(e=>{setMessage(e.message);$('cards').innerHTML='<p class=\"empty\">Accedi a RADIX"));
});
