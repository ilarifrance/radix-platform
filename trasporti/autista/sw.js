/* Plancia Autista — service worker: the app opens and works without signal (cab, tunnel, countryside).
   Pages and scripts: network first, cached copy when offline. /api/ is never cached. */
'use strict';
const CACHE='plancia-autista-v1';
const SHELL=['/trasporti/autista/','/trasporti/autista/app.js','/trasporti/autista/manifest.webmanifest','/trasporti/trasporti.css','/trasporti/brand.js','/trasporti/store.js','/lib/trasporti/documenti.js','/trasporti/marchio/plancia-icona.svg','/trasporti/marchio/icona-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('plancia-autista-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/'))return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;})
  .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||(e.request.mode==='navigate'?caches.match('/trasporti/autista/'):Response.error()))));
});
