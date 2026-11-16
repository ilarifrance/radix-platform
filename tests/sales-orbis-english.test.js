'use strict';
// «Sales Orbis» in English: what a customer reads must not stay Italian. The guard for the server: every message the CRM
// API sends to the pages has its English in the dictionary (lib/radix-i18n-en.js), so a new Italian message without a
// translation fails here. Plus the sign-in, the legal footer of emails and the unsubscribe page.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('../lib/radix-i18n-en.js');
const I=require('../lib/radix-i18n.js'),T=I.compile(globalThis.RadixI18nEn,I.HAND);
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
// The CRM API files whose messages reach the product's pages.
const API=['api/_sales.js','api/_sales_store.js','api/_sales_calendars.js','api/_sales_custom_fields.js','api/_sales_documents.js','api/_sales_email_finder.js',
  'api/_sales_mail_read.js','api/_sales_mailboxes.js','api/_sales_queue_core.js','api/_sales_suppressions.js','api/_sales_unsubscribe.js','api/_sales_workspace_settings.js',
  'api/_auth.js','api/auth/[action].js','api/_send-email.js','api/_crm-context.js','api/ms-oauth.js','api/_ms_oauth.js','api/parse-file.js'].filter(f=>fs.existsSync(path.join(__dirname,'..',f)));
const ITALIAN=/\b(il|la|lo|di|del|non|per|con|un|una|è|questo|serve|solo|Accedi|Richiesta|Campo|Valore|Nessun|Record|Troppi|Sessione|Permessi)\b/i;
function messages(src){
  const out=new Set(),re=/(?:fail\(\s*\d{3}\s*,\s*|error\s*:\s*|new (?:\w*Error)\((?:\d{3}\s*,\s*)?|\[\d{3}\s*,\s*)(['"])((?:\\.|(?!\1).)+?)\1(\s*\+)?/g;let m;
  while((m=re.exec(src))){const t=m[2].replace(/\\'/g,"'");if(m[3])continue; // built with +: covered by a {0} pattern, checked below
    if(!/[a-zàèéìòù]{3}/i.test(t)||/^[A-Za-z_]+$/.test(t)||!ITALIAN.test(t))continue;out.add(t)}
  return [...out];
}
test('every full message of the CRM API has its English',()=>{
  const missing=[];let seen=0;
  for(const f of API)for(const t of messages(read(f))){seen++;if(T.tr(t)==null)missing.push(f+': '+t)}
  assert.ok(seen>150,'the scan finds the messages ('+seen+')');
  assert.deepEqual(missing,[],'add these to lib/radix-i18n-en.js');
});
test('messages built with a number or a name: the {0} patterns translate them',()=>{
  for(const [it,en] of [['Valore del campo: massimo 500 caratteri.','Field value: 500 characters at most.'],['Hai raggiunto il massimo di 40 campi aggiunti.','You have reached the maximum of 40 added fields.'],
    ['Destinatari non validi (da 1 a 200 contatti).','Invalid recipients (1 to 200 contacts).'],['Intervallo non valido: al massimo 62 giorni.','Invalid range: 62 days at most.']])assert.equal(T.t(it),en);
});
test('sign-in of Sales Orbis in English, with the language choice on the card',()=>{
  for(const [it,en] of [['Accedi con il tuo account per aprire il CRM.','Sign in with your account to open the CRM.'],['Accedi','Sign in'],['Accesso in corso…','Signing in…'],
    ['Email o password errati.','Wrong email or password.'],['Connessione non riuscita: riprova.','Connection failed: try again.'],['Vai all’accesso','Go to sign-in']])assert.equal(T.t(it),en);
  const solo=read('sales/crm-solo.js');assert.match(solo,/solo-langs/);assert.match(solo,/I\.saveLang\(window,l\)/);
});
test('the legal footer of B2B emails in English, recognised by the queue',()=>{
  const PC=require('../sales/crm-prospecting-core.js');
  const url='https://x.example/api/sales?unsubscribe=abc';
  const en=PC.footer({issuer:{name:'Demo Ltd',city:'London',country:'UK'},sender:{from_name:'Ada'},contact:{company:'Acme'},url,lang:'en'});
  assert.match(en,/Why you are receiving this email: .* at Acme/);assert.match(en,/Where the data comes from:/);assert.ok(en.endsWith(url));
  assert.doesNotMatch(en,/Perché|ricevi|dati/);
  assert.equal(PC.hasFooter('Hello'+en,url),true);
  const it=PC.footer({issuer:{name:'Demo Srl'},sender:{},contact:{},url});assert.match(it,/Perché ricevi questa email/);assert.equal(PC.hasFooter('Ciao'+it,url),true);
  assert.match(read('api/_sales_mailboxes.js'),/x-radix-lang/);
});
test('the English pages tell the CRM API their language (x-radix-lang), only on /api/sales',()=>{
  assert.deepEqual(I.withLangHeader('/api/sales',{method:'POST',headers:{'content-type':'application/json'}},'en').headers,{'content-type':'application/json','x-radix-lang':'en'});
  assert.deepEqual(I.withLangHeader('/api/sales?entity=x',{},'en').headers,{'x-radix-lang':'en'});
  const init={headers:{a:'1'}};assert.equal(I.withLangHeader('/api/sales',init,'it'),init);assert.equal(I.withLangHeader('/api/state',init,'en'),init);
});
test('the unsubscribe page speaks both languages',async()=>{
  const U=require('../api/_sales_unsubscribe.js');
  const res={headers:{},statusCode:0,body:'',setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},end(b){this.body=b},send(b){this.body=b}};
  await U.handle({method:'GET',query:{unsubscribe:'not-a-token'},headers:{}},res,{getSql:()=>async()=>[],secret:'s'.repeat(32)});
  const html=String(res.body);
  assert.match(html,/Link non valido/);assert.match(html,/<div lang="en"><h2>Invalid link<\/h2>/);
});
