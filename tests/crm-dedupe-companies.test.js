'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const D=require('../sales/crm-dedupe-core.js');

test('company keys: Partita IVA without IT and spaces, domain without protocol, www and path, name without legal form',()=>{
 assert.equal(D.vat('IT 0123 4567 890'),D.vat('01234567890'));assert.equal(D.vat(' it01234567890 '),'01234567890');assert.equal(D.vat(''),'');assert.equal(D.vat('DE123456789'),'DE123456789');
 assert.equal(D.domain('https://www.Acme.it/contatti?x=1'),'acme.it');assert.equal(D.domain('HTTP://acme.it:8080'),'acme.it');assert.equal(D.domain('acme.it/'),'acme.it');
 assert.equal(D.domain('info@Acme.it'),'acme.it');assert.equal(D.domain('www.shop.acme.it'),'shop.acme.it');
 for(const g of ['mario@gmail.com','https://www.linkedin.com/company/acme','https://it.linkedin.com/company/acme','https://m.facebook.com/acme','facebook.com','info@libero.it','not a site'])assert.equal(D.domain(g),'',g);
 assert.equal(D.companyName('ACME S.r.l.'),D.companyName('Acme srl'));assert.equal(D.companyName('Acme SpA'),'acme');assert.equal(D.companyName('Bàrbera Società Cooperativa'),'barbera');
 assert.equal(D.companyName('Srl'),'srl','a name that is only a legal form stays');
});

test('company groups: same VAT, same domain, or same name; reasons per group; generic hosts never match',()=>{
 const g=D.companyGroups([
  {id:'a',name:'Acme S.r.l.',vat_number:'IT01234567890'},{id:'b',name:'Acme Italia',vat_number:'01234567890'},
  {id:'c',name:'Beta',website:'https://www.beta.it/chi-siamo'},{id:'d',name:'Beta Group',email:'info@beta.it'},
  {id:'e',name:'Gamma srl'},{id:'f',name:'GAMMA'},
  {id:'g',name:'Uno',email:'uno@gmail.com'},{id:'h',name:'Due',email:'due@gmail.com'},
  {id:'i',name:'Tre',website:'https://www.linkedin.com/company/tre'},{id:'j',name:'Quattro',website:'https://www.linkedin.com/company/quattro'},{id:'k',name:'Sola'}]);
 assert.deepEqual(g.map(x=>x.companies.map(c=>c.id).sort().join(',')).sort(),['a,b','c,d','e,f']);
 const reason=id=>g.find(x=>x.companies.some(c=>c.id===id)).reasons;
 assert.deepEqual(reason('a'),['stessa partita IVA']);assert.deepEqual(reason('c'),['stesso dominio']);assert.deepEqual(reason('e'),['stesso nome']);
 const chain=D.companyGroups([{id:'a',name:'Acme',vat_number:'IT01234567890'},{id:'b',name:'Altro',vat_number:'01234567890',website:'acme.it'},{id:'c',name:'Terzo',website:'https://acme.it'}]);
 assert.equal(chain.length,1);assert.deepEqual(chain[0].reasons.sort(),['stessa partita IVA','stesso dominio']);
});

const keep={id:'K',name:'Acme',version:2,website:null,industry:'Meccanica',notes:'vecchie',employees:0,vat_number:null,annual_revenue_cents:null,parent_company_id:null,legal_name:null,billing_city:null};
const drop={id:'X',name:'ACME srl',version:5,website:'https://acme.it',industry:'Altro',notes:'nuove',employees:40,vat_number:'IT01234567890',annual_revenue_cents:'125000000',parent_company_id:'P',legal_name:'Acme S.r.l.',billing_city:'Brescia',owner_id:7};
test('company merge plan: fills empty fields (011 included), moves contacts, records and subsidiaries, keeps zero values',()=>{
 const rel=[{entity:'companies',record:drop},{entity:'contacts',record:{id:'c1',name:'Mario',company_id:'X',version:1}},
  {entity:'opportunities',record:{id:'o1',title:'Deal',company_id:'X',contact_id:null,version:3}},
  {entity:'tasks',record:{id:'t1',company_id:'X',contact_id:null,opportunity_id:null,version:1}},
  {entity:'interactions',record:{id:'i1',company_id:'X',contact_id:null,version:1}},{entity:'tickets',record:{id:'k1',company_id:'X',contact_id:null,version:2}},
  {entity:'leads',record:{id:'l1',company_id:'X',contact_id:null,version:1}},{entity:'companies',record:{id:'S',name:'Filiale',parent_company_id:'X',version:4}}];
 const p=D.companyMergePlan(keep,drop,rel);
 assert.equal(p.blocked,null);
 assert.deepEqual(p.fill,{website:'https://acme.it',legal_name:'Acme S.r.l.',owner_id:7,annual_revenue_cents:125000000,billing_city:'Brescia',vat_number:'IT01234567890',parent_company_id:'P',notes:'vecchie\n\nUnita da «ACME srl»: nuove'});
 assert.deepEqual(p.moves.map(m=>m.entity+':'+m.record.id),['contacts:c1','opportunities:o1','leads:l1','tasks:t1','interactions:i1','tickets:k1','companies:S']);
 assert.deepEqual(p.moves[0].set,{company_id:'K'});assert.deepEqual(p.moves.at(-1).set,{parent_company_id:'K'});
});
test('company merge is refused when the database forbids a move, and never makes a company its own parent',()=>{
 const contact={id:'c1',name:'Mario',company_id:'X'};
 for(const e of ['opportunities','tasks','interactions','tickets','leads']){
  const p=D.companyMergePlan(keep,drop,[{entity:'contacts',record:contact},{entity:e,record:{id:'r',title:'R',company_id:'X',contact_id:'c1'}}]);
  assert.match(p.blocked,/«Mario».*non permette di spostarlo/,e);assert.match(p.blocked,/tenendo «ACME srl»/);
 }
 assert.match(D.companyMergePlan(keep,drop,[{entity:'opportunities',record:{id:'o1',title:'Deal',company_id:'X',contact_id:null}},{entity:'interactions',record:{id:'i1',company_id:'X',opportunity_id:'o1'}}]).blocked,/«Deal».*attività/);
 assert.ok(D.companyMergePlan(keep,keep,[]).blocked);assert.ok(D.companyMergePlan(keep,null,[]).blocked);
 assert.equal(D.companyMergePlan(keep,{...drop,parent_company_id:'K'},[]).fill.parent_company_id,undefined);
 assert.equal(D.companyMergePlan({...keep,parent_company_id:'X'},drop,[]).fill.parent_company_id,'P','the parent that disappears is replaced by the other one');
 assert.deepEqual(D.companyMergePlan({...keep,parent_company_id:'X'},drop,[{entity:'companies',record:{...keep,parent_company_id:'X'}}]).moves,[],'the kept company is never its own subsidiary');
 assert.match(D.companyMergePlan({...keep,notes:'x'.repeat(3000)},{...drop,notes:'y'.repeat(1500)},[]).blocked,/4000/);
 assert.equal(D.companyMergePlan({...keep,notes:'vecchie\n\nUnita da «ACME srl»: nuove'},drop,[]).fill.notes,undefined);
});
test('an archive without migration 011 merges on the original fields only',()=>{
 const p=D.companyMergePlan({id:'K',name:'Acme',version:1,website:null,phone:'02 123'},{id:'X',name:'Acme srl',version:1,website:'https://acme.it',phone:'03 999'},[]);
 assert.deepEqual(p.fill,{website:'https://acme.it'});
});
test('Aziende shows the panel and applies the plan through the CRM API, one record at a time',()=>{
 const src=fs.readFileSync(__dirname+'/../sales/crm-tools.js','utf8');
 // Hidden under the list until «Doppioni» in the heading row opens it (and starts the search).
 assert.match(src,/entity==='companies'\)\{const bar=ioBar\('companies'\);head\.append\(bar\);if\(window\.RadixCrmDedupe&&app\(\)\.writable\('companies'\)\)\{const dd=tuck\(dedupePanel\('companies'\)\);section\.append\(dd\);bar\.append\(B\('Doppioni',reveal\(dd,findNow\)\)\)/);
 assert.match(src,/companyMergePlan\(keep,drop,/);assert.match(src,/post\(m\.entity,'update',\{id:m\.record\.id,version:m\.record\.version,\.\.\.m\.set\}\)/);
 assert.match(src,/window\.confirm\('Unire «'\+drop\.name\+'» in «'\+keep\.name\+'»\?/);assert.match(src,/post\('companies','delete'/);
});
