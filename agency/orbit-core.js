/* Marketing Orbit (agency/orbit.html): the entry page of the Marketing Agency. A core (the brand) with one planet per
   service area of «Cosa vuoi fare oggi?» (the groups of agency/crea-core.js), and below it the cards of every section.
   Pure part (planets, sections, counts, orbit geometry) runs in Node for the tests; the page lives in agency/orbit.js.
   Counts come only from the registry (clients, projects) and the Command Center summary (approvals awaiting a
   decision): a missing number stays missing, never estimated. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixOrbit=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const node=typeof module==='object'&&module.exports;
const crea=()=>node?require('./crea-core.js'):root.RadixCrea;
// One colour and one line icon per area (agency/marketing-look.js); pink is Marketing's colour in the Command Center.
const AREA_LOOK=(node?require('./marketing-look.js'):root.RadixMarketingLook).AREAS;
const LOOK=Object.fromEntries(Object.entries(AREA_LOOK).map(([k,v])=>[k,[v.color,v.icon]]));
const CREA='/agency/crea.html';
// The planets: one per group that has services, in the panel's order, each opening the panel filtered on it.
function planets(core){
 const c=core||crea();
 return c.groups().map(group=>{const slug=c.areaOf(group),cards=c.inGroup(group),look=LOOK[slug]||['#a68bff','spark'];
  return {slug,group,color:look[0],icon:look[1],count:cards.length,services:cards.map(x=>x.title),href:CREA+'?area='+encodeURIComponent(slug)}});
}
// The studios and where each one starts: the avatar has its own page, the others open inline in the panel.
const STUDIOS=[['Avatar','/agency/avatar.html'],['Immagini',CREA+'?open=images'],['Video',CREA+'?open=video'],['Sito',CREA+'?open=site'],
 ['SEO e GEO',CREA+'?open=seo'],['Identità',CREA+'?open=identita'],['Stampa',CREA+'?open=stampa'],['Catalogo',CREA+'?open=catalogo']].map(([label,href])=>({label,href}));
// count: the key of counts() shown on the card, with its label; no key, no number.
const SECTIONS=[
 {id:'servizi',icon:'wand',title:'Cosa vuoi fare',line:'Tutti i servizi guidati: poche domande, tre proposte, scegli tu.',href:CREA,count:'servizi',unit:['servizio','servizi']},
 {id:'clienti',icon:'users',title:'Clienti',line:'Le aziende per cui lavori, con i loro progetti.',href:'/agency/clients.html',count:'clienti',unit:['cliente','clienti']},
 {id:'progetti',icon:'folder',title:'Progetti',line:'Brief, incarichi, output e approvazioni di ogni progetto.',href:'/agency/projects.html',count:'progetti',unit:['progetto attivo','progetti attivi']},
 {id:'ped',icon:'calendar',title:'Piano editoriale',line:'Calendario, testi e grafiche dei post; pubblichi solo con il tuo clic.',href:'/project-editorial.html#ped'},
 {id:'studi',icon:'layers',title:'Studi',line:'Gli strumenti guidati, uno per tipo di lavoro.',href:CREA,links:STUDIOS},
 {id:'risultati',icon:'chart',title:'Risultati',line:'Come stanno andando i contenuti pubblicati e la ricerca su Google.',href:'/project-editorial.html#results',
  links:[{label:'Risultati del piano editoriale',href:'/project-editorial.html#results'},{label:'Risultati SEO',href:CREA+'?open=seo'}]},
 {id:'approvazioni',icon:'check',title:'Approvazioni',line:'Strategie, piani e contenuti in attesa di una decisione.',href:'/control-center-v2.html#approvals',count:'approvazioni',unit:['in attesa','in attesa']},
 {id:'memoria',icon:'book',title:'Memoria',line:'Decisioni, fatti confermati e risultati che gli agenti ricordano.',href:'/agency/memory.html'}
];
const num=v=>Number.isInteger(v)&&v>=0?v:null;
// {servizi, clienti, progetti, approvazioni}: a number only where the source answered; null otherwise.
function counts({core,clients,projects,dashboard}={}){
 const c=core||crea(),d=dashboard&&typeof dashboard==='object'?dashboard:null;
 return {
  servizi:c.CARDS.length,
  clienti:Array.isArray(clients)?clients.length:null,
  progetti:Array.isArray(projects)?projects.filter(p=>p&&p.status!=='archived').length:null,
  approvazioni:d&&d.approvalsSupported===true&&d.metrics?num(d.metrics.approvals):null
 };
}
const countText=(n,unit)=>n==null?'':n+' '+(n===1?unit[0]:unit[1]);
// The orbit: the planets sit still on one ring around the core, evenly spaced from the top, each with its label
// centred under it, so labels never cross (only a slow float and the sky move). Sizes in px; the label box is the
// widest label the stage allows (orbit.css .mo-planet-label: max-width 148px, two lines of 13–14px at most 40px).
const SIZE=Object.freeze({planet:56,label:{w:148,h:40,gap:10},core:64,pad:16});
function ring(n,w,h){
 const S=SIZE,a=i=>-Math.PI/2+i*2*Math.PI/n,angles=Array.from({length:n},(_,i)=>a(i));
 const cx=w/2,cy=h/2-(S.label.gap+S.label.h)/2;
 const below=S.planet/2+S.label.gap+S.label.h,maxSin=Math.max(...angles.map(Math.sin),.01);
 const rx=Math.max(120,Math.min(330,w/2-S.label.w/2-S.pad));
 const ry=Math.max(100,Math.min(220,rx*.72,cy-S.planet/2-S.pad,(h-S.pad-below-cy)/maxSin));
 const planets=angles.map(t=>{const x=cx+Math.cos(t)*rx,y=cy+Math.sin(t)*ry;
  return {x,y,angle:t,depth:Math.sin(t),sphere:{x:x-S.planet/2,y:y-S.planet/2,w:S.planet,h:S.planet},
   label:{x:x-S.label.w/2,y:y+S.planet/2+S.label.gap,w:S.label.w,h:S.label.h}}});
 return {cx,cy,rx,ry,core:S.core,planets};
}
// True when two boxes {x,y,w,h} share any area.
const hit=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
// Distance from the core centre to the nearest point of a box.
const reach=(cx,cy,b)=>Math.hypot(Math.max(b.x-cx,0,cx-b.x-b.w),Math.max(b.y-cy,0,cy-b.y-b.h));
return Object.freeze({LOOK,STUDIOS,SECTIONS,SIZE,planets,counts,countText,ring,hit,reach});
});
