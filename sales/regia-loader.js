/* Regia RADIX on the Sales pages, which do not use shell/radix-shell.js. The same start as the shell's: for signed-in
   people (/api/auth/me), the Guide and Regia styles, then the scripts in the shell's order (confirm dialog, core, the
   page's area adapters, Guide, panel). A page names its adapters on <body> like a shell page does:
     <body data-shell-page="sales-lead" data-shell-regia="/lib/regia-sales.js">  …  <script src="/sales/regia-loader.js" defer>
   data-shell-guide="off" leaves the page without it. If the panel cannot load, the Guide «?» starts alone; without the
   confirm dialog the Regia asks with the browser's confirm(). On a page that has the shell, the shell does it all.
   UMD: the pure script list for the tests (tests/regia-sales-pagine.test.js checks it against the shell's). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.RadixRegiaLoader=api;if(root.document)api.boot(root)}})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// The shell's list without its Command Center adapter: confirm, core, (area adapters), Guide, panel.
const BASE=Object.freeze(['/lib/radix-confirm.js','/lib/radix-regia-core.js','/lib/radix-guide.js','/lib/radix-regia.js']);
const CSS=Object.freeze(['/shell/radix-guide.css','/shell/radix-regia.css']);
const ADAPTER_RE=/^\/lib\/regia-[a-z0-9-]+\.js$/;
// The scripts in order for a body's data-shell-regia (only /lib/regia-*.js files, each once), as the shell splices them.
function scripts(regia){const list=BASE.slice();
 String(regia||'').split(/\s+/).filter(u=>ADAPTER_RE.test(u)&&list.indexOf(u)<0).forEach((u,k)=>list.splice(2+k,0,u));return list}
function signedIn(d){const u=d&&(d.user||d);return !!(u&&(u.name||u.displayName||u.email))}

function boot(win){const doc=win.document,body=doc.body;
 if(!body||win.__radixShell||win.__radixRegiaLoader)return;win.__radixRegiaLoader=true;
 if(body.dataset.shellGuide==='off'||doc.getElementById('rxGuide')||doc.getElementById('rxRegia')||typeof win.fetch!=='function')return;
 win.fetch('/api/auth/me',{credentials:'same-origin',headers:{accept:'application/json'}})
  .then(r=>r.ok?r.json():null)
  .then(d=>{if(!signedIn(d)||win.__radixShell||doc.getElementById('rxGuide'))return;
   for(const href of CSS)if(!doc.querySelector('link[href$="'+href.split('/').pop()+'"]')){const l=doc.createElement('link');l.rel='stylesheet';l.href=href;doc.head.appendChild(l)}
   doc.documentElement.setAttribute('data-rx-regia','on');
   const list=scripts(body.dataset.shellRegia),guide=list.indexOf('/lib/radix-guide.js');
   const guideAlone=()=>{if(win.RadixGuide&&!doc.getElementById('rxGuide'))win.RadixGuide.start()};
   (function next(i){if(i>=list.length){if(!win.RadixRegia)guideAlone();return}
    const s=doc.createElement('script');s.src=list[i];
    s.onload=()=>next(i+1);
    // Same fallbacks as the shell: no confirm dialog is fine, no Guide stops, anything else drops to the Guide alone.
    s.onerror=()=>{if(list[i]==='/lib/radix-confirm.js'){next(i+1);return}if(list[i]==='/lib/radix-guide.js')return;
     doc.documentElement.removeAttribute('data-rx-regia');next(guide>i?guide:list.length)};
    body.appendChild(s)})(0)})
  .catch(()=>{})}
return Object.freeze({BASE,CSS,scripts,signedIn,boot});
});
