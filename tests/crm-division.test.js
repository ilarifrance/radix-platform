'use strict';
/* «Dipartimento» in the CRM header: sales/crm-division-core.js (pure rules) and the wiring of the page
   (crm-data.js filters its dataset, radix-sales.html and the Pipeline page carry the select, sales.js and
   crm-list.js follow the choice), plus the cleanup of the build notes and the «Aiuto» menu entry. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const D=require('../sales/crm-division-core.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

const data={
 companies:[{id:'a',name:'Alfa',division:'Vendite'},{id:'b',name:'Beta',division:'marketing'},{id:'c',name:'Gamma',division:''},{id:'d',name:'Delta'}],
 contacts:[{id:'k1',name:'Zoe',company_id:'a',division:'Véndite'},{id:'k2',name:'Ugo',company_id:null,division:'Marketing'},{id:'k3',name:'Ada',company_id:'c',division:null},{id:'k4',name:'Ivo',division:'Vendite'}],
 opportunities:[{id:'o1',company_id:'a'},{id:'o2',contact_id:'k2'},{id:'o3',company_id:'c',contact_id:'k4'},{id:'o4'},{id:'o5',company_id:'zz'}],
 leads:[{id:'l1',company_id:'b'},{id:'l2',contact_id:'k3'}],
 tasks:[{id:'t1',contact_id:'k1'},{id:'t2',company_id:'d'}],
 interactions:[{id:'i1',company_id:'a',contact_id:'k2'}],
 tickets:[{id:'x1',contact_id:'k4'}],
 stages:[{id:'s'}],members:[{id:1}],processes:[{id:'p'}],partial:true,counts:{companies:4,contacts:4}
};
Object.freeze(data);for(const k of Object.keys(data))if(Array.isArray(data[k]))Object.freeze(data[k]);

test('options: the departments of aziende and contatti together, counted, accents and case folded, in Italian order',()=>{
 assert.deepEqual(D.options(data.companies,data.contacts),[{value:'marketing',count:2},{value:'Vendite',count:3}]);
 assert.deepEqual(D.options(null,undefined),[]);
 assert.equal(D.hasNone(data.companies,data.contacts),true);
 assert.equal(D.hasNone([{division:'A'}],[{division:'B'}]),false);
 assert.equal(D.key('11111111-1111-4111-8111-111111111111'),'radix.division.11111111-1111-4111-8111-111111111111');
});

test('belongs: own division for aziende and contatti, company first then contact for the linked entities',()=>{
 const idx=D.index(data.companies,data.contacts);
 assert.equal(D.belongs(data.companies[0],'companies',idx,'vendite'),true,'case ignored');
 assert.equal(D.belongs(data.contacts[0],'contacts',idx,'Vendite'),true,'accents ignored');
 assert.equal(D.belongs(data.contacts[1],'contacts',idx,'Vendite'),false);
 assert.equal(D.belongs(data.opportunities[0],'opportunities',idx,'Vendite'),true,'through company_id');
 assert.equal(D.belongs(data.opportunities[1],'opportunities',idx,'Marketing'),true,'through contact_id');
 assert.equal(D.belongs(data.opportunities[2],'opportunities',idx,'Vendite'),true,'company without a department: the contact decides');
 assert.equal(D.belongs(data.opportunities[4],'opportunities',idx,'Vendite'),false,'company not loaded: no department');
 assert.equal(D.divisionOf(data.opportunities[4],'opportunities',idx),'');
 for(const r of [data.companies[0],data.opportunities[3]])assert.equal(D.belongs(r,'opportunities',idx,''),true,'«Tutti» keeps everything');
});

test('NONE: records without a department, or without any link to one',()=>{
 const idx=D.index(data.companies,data.contacts),N=D.NONE;
 assert.deepEqual(data.companies.filter(r=>D.belongs(r,'companies',idx,N)).map(r=>r.id),['c','d']);
 assert.deepEqual(data.contacts.filter(r=>D.belongs(r,'contacts',idx,N)).map(r=>r.id),['k3']);
 assert.deepEqual(data.opportunities.filter(r=>D.belongs(r,'opportunities',idx,N)).map(r=>r.id),['o4','o5']);
 assert.deepEqual(data.tasks.filter(r=>D.belongs(r,'tasks',idx,N)).map(r=>r.id),['t2']);
});

test('filterData: every entity filtered, stages/members/processes untouched, counts null, partial kept, nothing mutated',()=>{
 const out=D.filterData(data,'Vendite');
 assert.notEqual(out,data);
 assert.deepEqual(out.companies.map(r=>r.id),['a']);assert.deepEqual(out.contacts.map(r=>r.id),['k1','k4']);
 assert.deepEqual(out.opportunities.map(r=>r.id),['o1','o3']);assert.deepEqual(out.leads.map(r=>r.id),[]);
 assert.deepEqual(out.tasks.map(r=>r.id),['t1']);assert.deepEqual(out.interactions.map(r=>r.id),['i1']);assert.deepEqual(out.tickets.map(r=>r.id),['x1']);
 assert.equal(out.stages,data.stages);assert.equal(out.members,data.members);assert.equal(out.processes,data.processes);
 assert.equal(out.counts,null);assert.equal(out.partial,true);
 assert.equal(data.counts.companies,4,'the source dataset keeps its counts');assert.equal(data.companies.length,4);
 assert.equal(D.filterData(data,''),data,'«Tutti»: the same object');assert.equal(D.filterData(null,'x'),null);
 const capped=Object.assign([{id:'a',division:'X'}],{capped:true});assert.equal(D.filterData({companies:capped},'X').companies.capped,true,'capped flag follows the rows');
 const m=D.filterData(data,'Marketing');assert.deepEqual(m.leads.map(r=>r.id),['l1']);assert.deepEqual(m.opportunities.map(r=>r.id),['o2']);
});

test('filterRows: one entity against the companies and contacts of the page; unknown entities pass through',()=>{
 assert.deepEqual(D.filterRows('opportunities',data.opportunities,data,'Vendite').map(r=>r.id),['o1','o3']);
 assert.equal(D.filterRows('opportunities',data.opportunities,data,''),data.opportunities,'«Tutti»: the same rows');
 assert.deepEqual(D.filterRows('stages',data.stages,data,'Vendite'),data.stages);
 assert.deepEqual(D.filterRows('contacts',null,data,'Vendite'),[]);
});

test('page: crm-data.js serves the filtered copy and announces each read; the header carries the select; the lists follow it',()=>{
 const cd=read('sales/crm-data.js');
 assert.match(cd,/window\.RadixCrmDivision\.apply\(d\)/);assert.match(cd,/return Promise\.resolve\(filtered\(data\)\)/);assert.match(cd,/pending\.then\(filtered\)/);assert.match(cd,/start\(w,0\)\.then\(filtered\)/);
 assert.match(cd,/new CustomEvent\('radix-crm-data',\{detail:data\}\)/);assert.match(cd,/raw:\(\)=>/);
 const html=read('radix-sales.html');
 assert.match(html,/<select id="workspace"[^>]*>.*?<\/select><\/div><div hidden><label for="division">Dipartimento<\/label><select id="division"><option value="">Tutti<\/option><\/select><\/div>/s);
 const at=s=>{const i=html.indexOf(s);assert.ok(i>0,s+' missing');return i};
 assert.ok(at('sales/crm-data.js')<at('sales/crm-division-core.js')&&at('sales/crm-division-core.js')<at('sales/crm-division.js'));
 const ui=read('sales/crm-division.js');
 assert.doesNotMatch(ui,/fetch\(|\/api\//,'no reads of its own');assert.match(ui,/localStorage\.setItem\(C\(\)\.key\(w\)/);assert.match(ui,/new CustomEvent\('radix-division'/);assert.match(ui,/RadixSalesApp\?\.render\?\.\(\)/);
 assert.match(ui,/window\.RadixCrmDivision=\{current,apply,rows,source:setSource/);
 const sales=read('sales/sales.js');
 assert.match(sales,/const shown=entity=>window\.RadixCrmDivision\?window\.RadixCrmDivision\.rows\(entity,rows\(entity\),state\.rows\):rows\(entity\)/);
 assert.match(sales,/shown\(entity\)\.filter\(matches\)/);assert.match(sales,/shown\(entity\)\.forEach\(r=>section\.append\(card\(entity,r\)\)\)/);
 assert.match(sales,/const relation=|function relation\(entity,id\)\{return rows\(entity\)/,'lookups stay whole');
 const list=read('sales/crm-list.js');assert.match(list,/const global=window\.RadixCrmDivision\?\.current\(\)\|\|'';drawDivisions\(all\);if\(global\)\{divSel\.hidden=true/);assert.match(list,/division:global\|\|p\.division/);
 assert.match(read('sales/crm-leads.js'),/e==='leads'&&window\.RadixCrmDivision\?window\.RadixCrmDivision\.rows\(e,r,app\(\)\.state\.rows\):r/);
 const pp=read('sales-pipeline-premium.html');assert.match(pp,/<label for="division" hidden>Dipartimento<\/label><select id="division" hidden><option value="">Tutti<\/option><\/select>/);
 assert.ok(pp.indexOf('/sales/crm-division-core.js')<pp.indexOf('/sales/crm-division.js')&&pp.indexOf('/sales/crm-division.js')<pp.indexOf('/sales/pipeline-premium.js'));
 const pj=read('sales/pipeline-premium.js');assert.match(pj,/const visible=\(\)=>window\.RadixCrmDivision&&quick\.rows\?window\.RadixCrmDivision\.rows\('opportunities',state\.deals,quick\.rows\):state\.deals/);
 assert.match(pj,/const filtered=visible\(\)\.filter/);assert.match(pj,/const scoped=visible\(\)\.filter/);assert.match(pj,/window\.RadixCrmDivision\.source\(r\)/);assert.match(pj,/addEventListener\('radix-division'/);
});

test('cleanup: build notes gone from the CRM page and its views; «Aiuto» in the Sales menu',()=>{
 const html=read('radix-sales.html');
 for(const t of ['FOUNDATION DA VALIDARE','Cosa è collegato','Accesso e autorizzazioni verificati dal server','Il salvataggio modifica i dati reali','<footer>'])assert.equal(html.includes(t),false,t);
 assert.doesNotMatch(read('sales/sales.js'),/Le modifiche richiedono conferma/);assert.match(read('sales/sales.js'),/m\.hidden=!!state\.workspaces\.length&&role\(\)!=='viewer'/);
 for(const f of ['sales/analytics-view.js','sales/dashboard-view.js','sales/tasks-view.js','sales/crm-knowledge.js'])assert.doesNotMatch(read(f),/non AI['.]/,f);
 assert.match(read('sales/dashboard-view.js'),/Suggerimenti per oggi/);assert.match(read('sales/dashboard-view.js'),/Primi passi/);
 const en=read('lib/radix-i18n-en.js');for(const k of ['"Regola fissa, non AI"','"regole fisse, non AI"','"Cosa è collegato"','"SALES · FOUNDATION DA VALIDARE"'])assert.equal(en.includes(k),false,k);
 assert.match(en,/"Nessun record in questo dipartimento\."/);assert.match(en,/"Aiuto · Guida al CRM"/);
 const nav=read('sales/sales-nav.js');
 assert.match(nav,/text: 'Impostazioni', ic: 'sliders' \},\s*\/\/[^\n]*\n\s*\{ href: 'https:\/\/claude\.ai\/artifact\/LiTrxo5b2apoCBfp2hKX7s', text: 'Aiuto · Guida al CRM', ic: 'bulb', external: true \}/);
 assert.match(nav,/if \(item\.external\) \{ a\.target = '_blank'; a\.rel = 'noopener noreferrer'; \}/);
});
