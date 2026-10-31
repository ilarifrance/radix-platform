'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const N=require('../lib/naming-check.js'),cs=require('../lib/copy-studio.js');

// A fake DNS-over-HTTPS: the answer for each domain, by provider; no real network.
function fakeFetch(table,{failCloudflare}={}){const calls=[];
 const f=async(url,opts)=>{calls.push(url);const u=new URL(url),name=u.searchParams.get('name'),cf=u.hostname==='cloudflare-dns.com';
  assert.equal(u.searchParams.get('type'),'NS');if(cf)assert.equal(opts.headers.accept,'application/dns-json');
  if(cf&&failCloudflare)throw Error('rete');const a=table[name];
  if(a==='error')return {ok:false,status:502,json:async()=>({})};if(a==='servfail')return {ok:true,json:async()=>({Status:2})};
  return {ok:true,json:async()=>a==='taken'?{Status:0,Answer:[{name,type:2,data:'ns1.example.net.'}]}:{Status:3}}};
 f.calls=calls;return f}

const MD=['# Nome e slogan · Radici','','## Nomi','','- Madìa — la madia dove riposa il pane','- «Lievita»','- Crosta & Co: semplice','- madia — doppione','','## Slogan','','- Il pane che aspetta','','---','Prima di usare un nome verifica…'].join('\n');

test('names from the edited Markdown: only the «Nomi» section, reason and quotes removed, duplicates dropped',()=>{
 assert.deepEqual(N.namesFromMarkdown(MD),['Madìa','Lievita','Crosta & Co']);
 assert.deepEqual(N.namesFromMarkdown('## Slogan\n\n- Solo slogan'),[]);
 assert.equal(N.nameOf('**Panora** - parola nuova'),'Panora');
 assert.equal(N.slug('Madìa'),'madia');assert.equal(N.slug('Crosta & Co'),'crostaco');
 const many='## Nomi\n'+Array.from({length:12},(_,i)=>'- Nome'+String.fromCharCode(97+i)).join('\n');assert.equal(N.namesFromMarkdown(many).length,N.MAX_NAMES);
});

test('candidate domains (.shop/.store only for a shop) and social handles as text',()=>{
 assert.deepEqual(N.domainsFor('Madìa').map(d=>d.domain),['madia.it','madia.com','madia.eu']);
 assert.deepEqual(N.domainsFor('Madìa',{shop:true}).map(d=>d.tld),['it','com','eu','shop','store']);
 assert.ok(N.wantsShop('Negozio online di ceramiche'));assert.ok(!N.wantsShop('Studio di architettura a Torino'));
 const h=N.handlesFor('Crosta & Co');assert.deepEqual(h.instagram,['crostaco','crostaco.it','crostaco_official']);
 assert.equal(h.facebook,'facebook.com/crostaco');assert.equal(h.linkedin,'linkedin.com/company/crosta-co');
 assert.ok(N.handlesFor('Unnomemoltolungochesupera trentacaratteri').instagram.every(x=>x.length<=30));
 assert.equal(N.registrarUrl('madia.it'),'https://www.namecheap.com/domains/registration/results/?domain=madia.it');
});

test('DNS check: NXDOMAIN probably free, an answer taken, errors not verified; Google when Cloudflare fails',async()=>{
 assert.equal(N.stateOf({Status:3}),'free');assert.equal(N.stateOf({Status:0}),'taken');assert.equal(N.stateOf({Status:2}),'unknown');assert.equal(N.stateOf(null),'unknown');
 const f=fakeFetch({'madia.it':'taken','madia.com':'free','madia.eu':'servfail'});
 assert.deepEqual(await N.checkDomain('madia.it',{fetch:f}),{domain:'madia.it',state:'taken',provider:'cloudflare'});
 assert.equal((await N.checkDomain('madia.com',{fetch:f})).state,'free');
 const u=await N.checkDomain('madia.eu',{fetch:f});assert.equal(u.state,'unknown');assert.ok(u.error);
 assert.ok(f.calls.some(c=>c.startsWith('https://dns.google/resolve?name=madia.eu')),'falls back to Google');
 const g=fakeFetch({'x.it':'free'},{failCloudflare:true});assert.deepEqual(await N.checkDomain('x.it',{fetch:g}),{domain:'x.it',state:'free',provider:'google'});
 const e=fakeFetch({'y.it':'error'});assert.equal((await N.checkDomain('y.it',{fetch:e})).state,'unknown');
 const slow=()=>new Promise(()=>{});assert.equal((await N.checkDomain('z.it',{fetch:slow,timeout:20})).state,'unknown','a hung request is not verified');
 assert.equal((await N.checkDomain('z.it',{fetch:null})).state,'unknown');
});

test('every name checked, with progress; the block goes into the text before the note and replaces an older one',async()=>{
 const f=fakeFetch({'madia.it':'taken','lievita.com':'taken','crostaco.eu':'error'});let seen=0;
 const res=await N.checkNames(N.namesFromMarkdown(MD),{fetch:f,onProgress:(d,t)=>{seen=d;assert.equal(t,9)}});
 assert.equal(seen,9);assert.equal(f.calls.filter(c=>c.includes('cloudflare')).length,9);
 assert.deepEqual(res[0].domains.map(d=>d.state),['taken','free','free']);assert.deepEqual(res[2].domains.map(d=>d.state),['free','free','unknown']);
 const block=N.toBlock(res,{markets:['DE'],date:'2026-10-23'});
 assert.match(block,/^## Domini e profili \(indicazione\)\n\nControllo gratuito sul DNS pubblico: è un’indicazione, non una garanzia\./);
 assert.match(block,/### Madìa\n- madia\.it: già registrato · verifica: https:\/\/www\.namecheap\.com\/domains\/registration\/results\/\?domain=madia\.it\n- madia\.com: probabilmente libero/);
 assert.match(block,/- crostaco\.eu: non verificato/);assert.match(block,/Profili social da cercare a mano \(non controllati\): Instagram e TikTok @madia, @madia\.it, @madia_official/);
 assert.match(block,/- Mercati esteri: Ha lettere accentate/);assert.match(block,/Il significato dei nomi nelle altre lingue non è controllato/);
 const md=N.withBlock(MD,block);assert.ok(md.indexOf('## Domini e profili')>md.indexOf('## Slogan')&&md.indexOf('## Domini e profili')<md.indexOf('\n---\n'),'before the note');
 assert.ok(md.endsWith('---\nPrima di usare un nome verifica…'));
 const again=N.withBlock(md,N.toBlock(res.slice(0,1),{}));assert.equal((again.match(/## Domini e profili/g)||[]).length,1);assert.ok(!again.includes('### Lievita'));
 assert.equal(N.withBlock(md,''),MD,'removing gives the text back');
 assert.match(N.withBlock('# Solo testo',block),/^# Solo testo\n\n## Domini e profili/);
 // the saved document keeps the block
 const [p]=cs.parseProposals('naming','===PROPOSTA 1===\nIDEA: Radici\nNOMI:\n- Madia\nSLOGAN:\n- Il pane');
 const [,saved]=cs.savedEntry('naming',p,md);assert.match(saved.content,/## Domini e profili \(indicazione\)[\s\S]*---FINE DOCUMENTO---/);
});

test('foreign markets: only fixed checks (length, accents, symbols, letter groups), never meanings',()=>{
 assert.deepEqual(N.marketChecks('Gnocco',[]),[],'no market picked, no checks');
 const g=N.marketChecks('Gnocchetto',['EN','DE','FR','ES','XX']);
 assert.ok(g.some(c=>c.market==='EN'&&/«gn»/.test(c.text)&&/«ch»/.test(c.text)));assert.ok(!g.some(c=>c.market==='XX'));
 assert.ok(N.marketChecks('Vivace',['DE']).some(c=>c.market==='DE'&&/«v» si legge «f»/.test(c.text)&&/«ce\/ci»/.test(c.text)));
 assert.ok(N.marketChecks('Zucca',['ES']).some(c=>/«z» in Spagna/.test(c.text)));
 assert.ok(N.marketChecks('Panificazioneartigiana',['FR']).some(c=>/Lungo: 22 lettere/.test(c.text)));
 assert.ok(N.marketChecks('Crosta & Co',['EN']).some(c=>/attaccato \(«crostaco»\)/.test(c.text)));
 assert.ok(N.marketChecks('Strppa',['EN']).some(c=>/consonanti di fila/.test(c.text)));
 assert.deepEqual(N.marketChecks('Lama',['EN']),[],'nothing to flag');
});

test('the optional AI call on meanings: confirmation first, one call, nothing without a click',async()=>{
 let calls=0,asked=null;const rt={reply:async o=>{calls++;assert.equal(o.role,'brand-strategist');assert.match(o.messages[0].content,/Non inventare traduzioni/);assert.match(o.messages[0].content,/tedesco, inglese/);return {text:'## Note\nMadia · tedesco: nessun problema noto\n---\nLievita · inglese: non so'}}};
 assert.equal(await N.aiMeaning({names:['Madia'],markets:['DE'],rt,confirm:async o=>{asked=o;return false}}),null);assert.equal(calls,0,'no call when declined');
 assert.match(asked.cost,/una sola chiamata AI/);
 const t=await N.aiMeaning({names:['Madia','Lievita'],markets:['DE','EN'],rt,confirm:async()=>true});assert.equal(calls,1);
 assert.equal(t,'Note\nMadia · tedesco: nessun problema noto\n\nLievita · inglese: non so');
 assert.match(N.toBlock([],{markets:['DE'],ai:t}),/### Significati: indicazione AI da verificare con un madrelingua\n\n- Note\n- Madia · tedesco: nessun problema noto/);
 await assert.rejects(N.aiMeaning({names:['A'],markets:[],rt,confirm:async()=>true}),/almeno un mercato/);
 await assert.rejects(N.aiMeaning({names:['A'],markets:['DE'],rt:null}),/non si sono caricati/);
 const src=fs.readFileSync(path.join(__dirname,'..','lib/naming-check.js'),'utf8');
 assert.equal((src.match(/rt\.reply\(/g)||[]).length,1,'one AI call');assert.match(src,/aiBtn\.onclick=async\(\)=>/);
 const hosts=[...new Set((src.match(/https:\/\/[a-z.-]+/g)||[]).map(u=>u.slice(8)))].sort();
 assert.deepEqual(hosts,['cloudflare-dns.com','dns.google','www.namecheap.com'],'free DNS only; the registrar is just a link');
});

test('wired in the Studio Testi for «Nome e slogan» only, loaded on the Crea page before it',()=>{
 assert.equal(cs.service('naming').domains,true);assert.ok(cs.SERVICES.filter(x=>x.domains).length===1);
 assert.match(cs.service('naming').note,/il controllo domini di RADIX è solo un’indicazione e non garantisce che sia libero/);
 const src=fs.readFileSync(path.join(__dirname,'..','lib/copy-studio.js'),'utf8');
 assert.match(src,/N\.namingPanel\(\{getText:\(\)=>out\.value,setText:v=>\{out\.value=v;/,'the check writes into the edited text, so it is saved');
 const html=fs.readFileSync(path.join(__dirname,'..','agency/crea.html'),'utf8');
 assert.ok(html.indexOf('/lib/naming-check.js')>0&&html.indexOf('/lib/naming-check.js')<html.indexOf('/lib/copy-studio.js'));
 assert.ok(!/http-equiv="Content-Security-Policy"/i.test(html),'no page CSP: DNS-over-HTTPS from the browser');
});
