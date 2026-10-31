'use strict';
// Second round of the pre-demo check (Demo · UK): the personal calendar link masked, lists that fit at 1440,
// internal notes removed from the Sales pages, readable interaction types, «In scadenza» that lists what it counts,
// lowercase month names, the probability that follows the stage, one remembered workspace, the Regia out of the way.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const fnFrom=(file,name)=>{const line=src(file).split('\n').find(l=>l.startsWith('function '+name+'('));assert.ok(line,name);return (0,eval)('('+line+')')};

test('Calendario da abbonare: the link is masked by default, «Mostra» and «Copia link» use the real one',()=>{
 const maskUrl=fnFrom('sales/crm-calendars.js','maskUrl');
 const url='https://radix.example/api/sales?calendar=eyJ1aWQiOjd9.c2lnbmF0dXJl';
 const m=maskUrl(url);assert.equal(m,'https://radix.example/api/sales?calendar='+'•'.repeat(12));assert.ok(!m.includes('eyJ'));
 assert.equal(maskUrl(''),'');
 const js=src('sales/crm-calendars.js');
 assert.match(js,/input\.value=maskUrl\(feed\.url\)/,'masked when the box is drawn');
 assert.ok(js.includes("E('button','Mostra','cal-feed-show')")&&js.includes("'Nascondi'"));
 assert.match(js,/copy\(feed\.url,input\)/,'«Copia link» copies the real link, not the dots');
});

test('Aziende / Contatti at 1440: cut widths leave room for «Modifica» and «Elimina»',()=>{
 const css=src('sales/crm-list.css');
 assert.ok(css.includes('.lv-table td>.lv-link{display:inline-block;max-width:160px;'));
 assert.ok(css.includes('.lv-table td[data-col="name"]>.lv-name{max-width:180px}'));
 assert.ok(css.includes('.lv-table td.lv-has-li>.lv-name{max-width:152px}'));
});

test('no internal or technical copy on the pages a prospect sees',()=>{
 const gone={
  'sales/orbit-higgsfield.js':['snapshot transazionale'],'sales/orbit-universe.js':['valuta non indicata'],'sales-orbit-higgsfield.html':['La valuta non è presente'],
  'sales/sales.js':['I selettori includono','Relazioni restituite dal server','(valuta del workspace)','Data di calendario YYYY-MM-DD'],
  'sales-linkedin.html':['PREVIEW','Preview','in preparazione','collaudo','li_at','JSESSIONID'],'sales/linkedin-hub.js':['Preview','collaudare'],
  'sales-growth-campaigns.html':['PREVIEW','Preview'],'sales/growth-campaigns.js':['Preview'],
  'sales-growth-projects.html':['PREVIEW','Preview','li_at','JSESSIONID'],'sales/growth-projects.js':['Preview'],
  'lead-intelligence.html':['Vercel','x-vercel-protection-bypass','X-Radix-Provider-Token','database Preview'],'sales/lead-contact-workbench.js':['Vercel','CAPTAIN_DATA_API_KEY']};
 for(const [f,words] of Object.entries(gone)){const s=src(f);for(const w of words)assert.ok(!s.includes(w),f+': '+w)}
 assert.ok(src('sales-linkedin.html').includes('<option value="captain-data">Captain Data</option>'),'the provider stays selectable');
});

test('Paese: a two-letter code is shown as the country name',()=>{
 const F=require('../sales/crm-fields-core.js');
 assert.equal(F.countryName('GB'),'Regno Unito');assert.equal(F.countryName('gb','en-GB'),'United Kingdom');
 assert.equal(F.countryName('Italia'),'Italia');assert.equal(F.countryName(''),'');assert.equal(F.countryName('ZZ'),'ZZ');assert.equal(F.countryName('QQ'),'QQ');
 assert.equal(F.display('contacts','country',{country:'GB'}),'Regno Unito');
 assert.equal(F.display('companies','billing_country',{billing_country:'IE'}),'Irlanda');
 assert.equal(F.display('companies','billing_city',{billing_city:'GB'}),'GB','only country fields');
});

test('one workspace for the Sales pages: the URL, else the remembered one, else the only one',()=>{
 for(const f of ['sales/sales.js','sales/lead-flow.js','sales/growth-campaigns.js','sales/growth-projects.js','sales/linkedin-hub.js'])assert.ok(src(f).includes("'radix.workspace'"),f);
 assert.match(src('sales/sales.js'),/result\.rows\.find\(w=>w\.id===kept\)\|\|result\.rows\[0\]/,'the CRM restores it, else the first as before');
 // The campaigns page could never use a workspace: its UUID check was missing a group.
 const re=(0,eval)(src('sales/growth-campaigns.js').match(/UUID=(\/\^[^;]+\/i);/)[1]);
 assert.ok(re.test('7e57f0a1-0000-4000-8000-0000000000e1'));assert.ok(!re.test('7e57f0a1-0000-4000-8000'));
});

test('Regia on the Sales pages sits in the side menu, not over the page',()=>{
 assert.match(src('lib/radix-regia.js'),/querySelector\('aside\.sx-side'\)[\s\S]{0,200}rx-regia-fab--side/);
 assert.match(src('shell/radix-regia.css'),/\.sx-side>button\.rx-guide-fab\.rx-regia-fab\.rx-regia-fab--side:is\(#rxGuide\)\{position:static/);
});

test('interactions: readable type, a new one starts now',()=>{
 const js=src('sales/sales.js');
 assert.ok(js.includes("const INTERACTION_KINDS={note:'Nota',call:'Telefonata',meeting:'Incontro',email:'Email registrata'};"));
 assert.ok(js.includes("'Tipo: '+(INTERACTION_KINDS[row.kind]||row.kind)"));
 assert.ok(js.includes("addSelect('kind','Tipo *',Object.entries(INTERACTION_KINDS)"));
 assert.match(js,/localInput\('occurred_at','Data interazione \*',row\?\.occurred_at \|\| \(row\?\.id \? '' : new Date\(/);
});

test('Attività: «In scadenza» lists every task it counts; a row opens the editor',()=>{
 const js=src('sales/tasks-view.js');
 assert.ok(!js.includes('limit:5'));
 assert.match(js,/tr\.addEventListener\('click',\(\)=>app\.edit\('tasks',rec\)\)/);
 assert.ok(src('sales/crm-light-sales.css').includes('.tv-table tr.tv-open{cursor:pointer}'));
});

test('month names in lowercase inside Italian dates',()=>{
 for(const f of ['sales/sales-parity.css','sales/orbit-universe.css'])assert.ok(!/\.(cal-sub|cal-bar h3|so-date)\{[^}]*capitalize/.test(src(f)),f);
 assert.match(src('sales/calendar-view.js'),/MN\[sun\.getMonth\(\)\]\.toLowerCase\(\)/);
});

test('Pipeline: a move takes the new stage default only when the deal had the old default',()=>{
 const {nextProbability}=require('../sales/pipeline-premium.js');
 const stages=[{id:'q',probability:10},{id:'d',probability:25},{id:'n',probability:null}];
 assert.equal(nextProbability({stage_id:'q',probability:10},stages,stages[1]),25);
 assert.equal(nextProbability({stage_id:'q',probability:15},stages,stages[1]),null,'a custom value stays');
 assert.equal(nextProbability({stage_id:'q',probability:null},stages,stages[1]),null,'no value already follows the stage');
 assert.equal(nextProbability({stage_id:'q',probability:10},stages,stages[2]),null,'no default on the new stage');
 assert.equal(nextProbability({stage_id:'x',probability:10},stages,stages[1]),null,'unknown old stage');
});

test('English dictionary: the new strings are translated, the removed ones are gone',()=>{
 const I=require('../lib/radix-i18n.js');require('../lib/radix-i18n-en.js');const EN=globalThis.RadixI18nEn,T=I.compile(EN,I.HAND);
 for(const [it,en] of [['Mostra','Show'],['Dati aggiornati dal CRM','Data up to date from the CRM'],['pipeline attiva','active pipeline'],['ESTENSIONE CHROME + PROVIDER','CHROME EXTENSION + PROVIDER'],
  ['Apri l’attività','Open the task'],['Importo non valido.','Invalid amount.'],['Registrata da Ilari France','Logged by Ilari France'],
  ['Archivio non disponibile: rete. La ricerca può comunque essere preparata, ma non verificata come connessione.','Archive not available: rete. The search can still be prepared, but not verified as a connection.']])assert.equal(T.tr(it),en,it);
 for(const k of Object.keys(EN))assert.ok(!/Vercel Preview|archivio Preview|workspace Preview|snapshot transazionale|I selettori includono|Importo in centesimi/.test(k),k);
});
