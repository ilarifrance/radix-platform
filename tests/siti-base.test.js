'use strict';
// Base comune dei siti pubblici (siti/): foglio di stile, script del modulo, pagine legali generate, pagina dei prodotti.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const sito=require('../siti/comune/sito.js');

test('il foglio comune usa il prefisso sx- e un accento per prodotto',()=>{
 const css=read('siti/comune/sito.css');
 assert.ok(!/\bct-/.test(css),'nessuna classe ct- residua');
 for(const p of ['orbit','marketing','contabilita','radix'])assert.ok(css.includes('[data-prodotto='+p+']'),'accento '+p);
 assert.ok(css.includes('.sx-menu'),'menu mobile');
 assert.ok(read('siti/comune/fonts/fonts.css').includes('/siti/comune/fonts/inter-latin.woff2'));
});

test('buildPayload manda solo i campi che api/_site_form.js accetta, puliti e limitati',()=>{
 const p=sito.buildPayload({token:' tok ',name:'  Mario   Rossi ',email:'MARIO@ESEMPIO.IT',phone:'+39 333',message:'  ciao\nmondo ','privacy':'on',website:''});
 assert.deepEqual(Object.keys(p).sort(),['email','marketing','message','name','phone','privacy','t','website']);
 assert.equal(p.t,'tok');assert.equal(p.name,'Mario Rossi');assert.equal(p.email,'mario@esempio.it');assert.equal(p.message,'ciao\nmondo');assert.equal(p.privacy,'1');assert.equal(p.marketing,'');
 assert.equal(sito.buildPayload({name:'x'.repeat(500)}).name.length,sito.LIMITS.name);
});

test('invalid spiega cosa manca, nell ordine giusto',()=>{
 const base={t:'tok',name:'Anna',email:'anna@esempio.it',message:'Vorrei una demo',privacy:'1'};
 assert.equal(sito.invalid(base),'');
 assert.match(sito.invalid({...base,t:''}),/non è ancora collegato/);
 assert.match(sito.invalid({...base,name:''}),/nome/);
 assert.match(sito.invalid({...base,email:'nope'}),/e-mail/);
 assert.match(sito.invalid({...base,message:''}),/messaggio/);
 assert.match(sito.invalid({...base,privacy:''}),/privacy/);
});

test('le pagine legali generate sono aggiornate e segnano i dati societari mancanti',()=>{
 const gen=require('../tools/siti-legali.js').build();
 for(const f of ['privacy.html','cookie.html','grazie.html']){
  assert.equal(read('siti/legali/'+f),gen[f],'siti/legali/'+f+' va rigenerato con node tools/siti-legali.js');
  assert.ok(gen[f].includes('href="/siti/"'),'torna all elenco dei siti');
 }
 const facts=JSON.parse(read('siti/comune/societa.json'));
 if(!facts.legalName)assert.ok(gen['privacy.html'].includes('[da completare: ragione sociale]'));
 assert.ok(!/undefined/.test(gen['privacy.html']));
});

test('la pagina dei prodotti ha il modulo spento finché manca il token e i link ai quattro prodotti',()=>{
 const html=read('siti/index.html');
 assert.ok(html.includes('data-site-form'));
 assert.match(html,/data-token=""/);
 assert.ok(html.includes('name="website"'),'campo trappola');
 for(const href of ['/siti/orbit/','/siti/marketing/','/contabilita/'])assert.ok(html.includes('href="'+href+'"'),href);
 assert.ok(html.includes('/siti/legali/privacy.html'));
 assert.ok(!/J\.?A\.?R\.?V\.?I\.?S/i.test(html));
});
