/* Impostazioni keeps the menu of the area you came from. Reached from a Sales page (the Sales menu's link carries
   ?area=sales, or the referrer is a Sales page), the page shows the Sales sidebar (sales/sales-nav.js) instead of the
   global shell, so you are still inside Sales Intelligence; from anywhere else it keeps the global shell. The choice is
   remembered for the tab (sessionStorage rx-settings-area), so moving between sections keeps it.
   UMD: areaOf() is pure for the tests; boot(window) runs in the browser before shell/radix-shell.js (both deferred). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.RadixSettingsArea=api;if(root.document)api.boot(root)}})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const SALES_PAGE=/^\/(radix-sales|sales-[a-z0-9-]+|lead-intelligence)\.html$/;
// 'sales' or 'system': the query wins, then the referrer (same origin), then what the tab remembers.
function areaOf({search='',referrer='',origin='',stored=''}={}){
 const q=new URLSearchParams(search).get('area');
 if(q==='sales')return 'sales';if(q==='system'||q==='cc')return 'system';
 if(referrer){try{const u=new URL(referrer);if(origin&&u.origin===origin&&SALES_PAGE.test(u.pathname))return 'sales'}catch(e){}}
 return stored==='sales'?'sales':'system';
}
function boot(win){const doc=win.document,body=doc.body;if(!body||win.__radixSettingsArea)return;win.__radixSettingsArea=true;
 let stored='';try{stored=win.sessionStorage.getItem('rx-settings-area')||''}catch(e){}
 const area=areaOf({search:win.location.search,referrer:doc.referrer,origin:win.location.origin,stored});
 try{win.sessionStorage.setItem('rx-settings-area',area)}catch(e){}
 if(area!=='sales')return;
 // No global shell on this visit: the Sales sidebar and the Regia loader of the Sales pages take its place.
 doc.documentElement.setAttribute('data-rx-shell-off','');
 body.classList.add('st-sales');body.dataset.shellArea='sales';
 if(!doc.querySelector('link[href="/sales/sales-nav.css"]')){const l=doc.createElement('link');l.rel='stylesheet';l.href='/sales/sales-nav.css';doc.head.appendChild(l)}
 const side=doc.createElement('aside');side.className='sidebar';
 const main=doc.getElementById('main');body.insertBefore(side,main||body.firstChild);
 // sales-nav.js takes the <aside> right before its own <script> tag.
 const nav=doc.createElement('script');nav.src='/sales/sales-nav.js';side.after(nav);
 const regia=doc.createElement('script');regia.src='/sales/regia-loader.js';regia.defer=true;body.appendChild(regia);
}
return {areaOf,boot,SALES_PAGE};
});
