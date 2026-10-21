/* Marketing Agency look: one line-icon set (24px grid, 1.5px stroke, DESIGN.md §5) and one colour per service area,
   shared by Marketing Orbit (agency/orbit.html) and «Cosa vuoi fare oggi?» (agency/crea.html). Pure data: it runs in
   Node for the tests and in the page as window.RadixMarketingLook. No unicode symbols as icons. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixMarketingLook=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const P={
 spark:'<path d="M12 3.5 13.8 9l5.7 1.5-5.7 1.6L12 17.5l-1.8-5.4-5.7-1.6L10.2 9Z"/><path d="M18.5 15.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6Z"/>',
 target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".9"/>',
 globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>',
 chat:'<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4.5 3.5v-3.5h0a1 1 0 0 1-1-1Z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/>',
 printer:'<path d="M7 8.5V4h10v4.5"/><rect x="3.5" y="8.5" width="17" height="8" rx="2"/><path d="M7 14h10v6H7Z"/>',
 image:'<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="9.5" r="1.6"/><path d="m20.5 15.5-5-5-9 9"/>',
 video:'<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 10.5 5-3v9l-5-3"/>',
 wand:'<path d="m4.5 19.5 10-10"/><path d="m13 8 3 3"/><path d="M17 3.5v3M15.5 5h3M19.5 10v2M18.5 11h2M9 3.5v2M8 4.5h2"/>',
 users:'<circle cx="9" cy="8.5" r="3.5"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M15.5 5a3.5 3.5 0 0 1 0 7M17.5 14.2a6 6 0 0 1 3.5 5.3"/>',
 folder:'<path d="M3.5 7a2 2 0 0 1 2-2h3.8l2 2.2h7.2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>',
 calendar:'<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
 layers:'<path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8Z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16 8.5 4.5 8.5-4.5"/>',
 chart:'<path d="M4 20h16"/><path d="M7 16v-4M12 16V7M17 16v-6"/>',
 check:'<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/>',
 book:'<path d="M5 4.5h10a4 4 0 0 1 4 4v11H9a4 4 0 0 1-4-4Z"/><path d="M5 15.5a4 4 0 0 1 4-4h10"/>',
 rocket:'<path d="M12 15c4-3 6-7 6-11-4 0-8 2-11 6l5 5Z"/><path d="M9 13 6 16M7 10H4l2-3h4M14 17v3l3-2v-4"/><circle cx="14" cy="8" r="1.2"/>',
 type:'<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
 palette:'<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.9 0-1.3-1-1.4-1-2.6 0-1 .9-1.9 2.2-1.9H18a2.5 2.5 0 0 0 2.5-2.5C20.5 7 16.7 3.5 12 3.5Z"/><circle cx="7.6" cy="11" r="1"/><circle cx="10" cy="7.4" r="1"/><circle cx="14.6" cy="7.4" r="1"/>',
 layout:'<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9.5h17M10 9.5v11"/>',
 doc:'<path d="M6 3.5h8.5l3.5 3.5v13.5H6Z"/><path d="M14 3.5V7h4M9 11h6M9 14.5h6M9 18h3.5"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
 user:'<circle cx="12" cy="9" r="3.8"/><path d="M5 20a7 7 0 0 1 14 0"/>',
 browser:'<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9h18M6.5 6.8h.01M9 6.8h.01"/>',
 search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
 megaphone:'<path d="M4 10v4h3l7 4.5v-13L7 10Z"/><path d="M17.5 9a4 4 0 0 1 0 6M7 14l1 5h2.5l-1-4.2"/>',
 bookOpen:'<path d="M3 5.5h6a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H3Z"/><path d="M21 5.5h-6a3 3 0 0 0-3 3v11a2 2 0 0 1 2-2h7Z"/>',
 map:'<path d="M3.5 6 9 4l6 2 5.5-2v14L15 20l-6-2-5.5 2Z"/><path d="M9 4v14M15 6v14"/>',
 clipboard:'<rect x="5" y="4.5" width="14" height="16.5" rx="2.5"/><path d="M9 4.5V3h6v1.5M9 10h6M9 13.5h6M9 17h3.5"/>',
 slides:'<path d="M3 4h18M5 4v10h14V4M12 14v4M8.5 21l3.5-3 3.5 3"/>',
 arrow:'<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/>',
 close:'<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
 info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
 coin:'<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.6.8-2.6 2s1.1 1.6 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.1 0-2-.4-2.5-1.2M12 6.5V8M12 16v1.5"/>',
 adFormats:'<rect x="3" y="3.5" width="10" height="17" rx="2"/><rect x="15" y="5" width="6" height="6" rx="1.5"/><rect x="15" y="13.5" width="6" height="3.5" rx="1"/><path d="M6 15.5h4M6 17.8h2.5"/>',
 siteAudit:'<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 8h18"/><circle cx="11" cy="13" r="2.6"/><path d="m13 15 2.4 2.4"/><path d="M8 21h8"/>',
 mapPin:'<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><path d="m12 6.6 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3Z"/>',
 chev:'<path d="m9 6 6 6-6 6"/>',
 pause:'<path d="M9 6v12M15 6v12"/>',
 play:'<path d="M8 5.5v13l10.5-6.5Z"/>'
};
// One colour and one icon per service area (the groups of agency/crea-core.js); pink is Marketing's colour in the
// Command Center (shell/cc-universe.js).
const AREAS=Object.freeze({
 brand:{color:'#ff5fa2',icon:'spark'},strategia:{color:'#a68bff',icon:'target'},web:{color:'#42dcf7',icon:'globe'},
 social:{color:'#608dff',icon:'chat'},stampa:{color:'#f4bd5f',icon:'printer'},immagini:{color:'#36edbd',icon:'image'},video:{color:'#ff8a65',icon:'video'}
});
// The service cards of «Cosa vuoi fare oggi?», by id.
const CARDS=Object.freeze({strategy:'target',lancio:'rocket',naming:'type',identita:'palette',social:'calendar',graphics:'layout',testi:'doc',
 newsletter:'mail',images:'image',avatar:'user',video:'video',site:'browser',seo:'search',analisi:'siteAudit',annunci:'megaphone',creativita:'adFormats',google:'mapPin',stampa:'printer',
 catalogo:'bookOpen',brochure:'map',scheda:'clipboard',presentazione:'slides'});
const has=name=>Object.prototype.hasOwnProperty.call(P,name);
// The <svg> markup of an icon: decorative (aria-hidden), stroke in currentColor.
function svg(name,cls){
 const body=has(name)?P[name]:P.spark;
 return '<svg class="'+(cls||'ml-ico')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+body+'</svg>';
}
// An element holding the icon (browser only).
function icon(name,cls,tag){const d=document.createElement(tag||'span');if(cls)d.className=cls;d.setAttribute('aria-hidden','true');d.innerHTML=svg(name);return d}
return Object.freeze({NAMES:Object.freeze(Object.keys(P)),AREAS,CARDS,has,svg,icon});
});
