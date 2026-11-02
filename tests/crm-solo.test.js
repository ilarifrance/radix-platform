'use strict';
// «Solo CRM»: /crm is radix-sales.html with its own sign-in page and a menu without Command Center and the other areas.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('vercel.json rewrites /crm to the CRM page',()=>{
  const v=JSON.parse(read('vercel.json'));
  assert.ok(v.rewrites.some(r=>r.source==='/crm'&&r.destination==='/radix-sales.html'));
});
test('the CRM page loads the sign-in script and style',()=>{
  const h=read('radix-sales.html');
  assert.match(h,/<link rel="stylesheet" href="sales\/crm-solo\.css">/);
  assert.match(h,/<script src="sales\/crm-solo\.js" defer><\/script>/);
});
test('sign-in script: only on /crm, asks /api/auth/me, posts /api/auth/login, never stores a password',()=>{
  const s=read('sales/crm-solo.js');
  assert.match(s,/location\.pathname!=='\/crm'\)return/);
  assert.match(s,/\/api\/auth\/me/);assert.match(s,/\/api\/auth\/login/);
  assert.doesNotMatch(s,/localStorage|sessionStorage/);
});
test('menu: solo mode hides only Command Center and adds Esci',()=>{
  const s=read('sales/sales-nav.js');
  assert.match(s,/if \(!solo\) frag\.append\(link\(HOME\)\)/);
  assert.doesNotMatch(s,/SOLO_HIDE/);
  assert.match(s,/\/api\/auth\/logout/);
  assert.match(s,/completo=1/);
  // the logout link must not be a hash link: sales.js regrouping would take it for one of its own sections
  assert.doesNotMatch(s,/LOGOUT = \{ href: '#/);
});
