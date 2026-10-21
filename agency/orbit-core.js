/* Marketing Orbit (agency/orbit.html): the entry page of the Marketing Agency. A core (the brand) with one planet per
   service area of «Cosa vuoi fare oggi?» (the groups of agency/crea-core.js), and below it the cards of every section.
   Pure part (planets, sections, counts, orbit geometry) runs in Node for the tests; the page lives in agency/orbit.js.
   Counts come only from the registry (clients, projects) and the Command Center summary (approvals awaiting a
   decision): a missing number stays missing, never estimated. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixOrbit=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const crea=()=>typeof module==='object'&&module.exports?require('./crea-core.js'):root.RadixCrea;
// One colour per area; pink is Marketing's colour in the Command Center (shell/cc-universe.js).
const LOOK={brand:['#ff5fa2','✦'],strategia:['#a68bff','◎'],web:['#42dcf7','⌂'],social:['#608dff','▦'],stampa:['#f4bd5f','⎙'],immagini:['#36edbd','◉'],video:['#ff8a65','▶']};
const CREA='/agency/crea.html';
// The planets: one per group that has services, in the panel's order, each opening the panel filtered on it.
function planets(core){
 const c=core||crea();
 return c.groups().map(group=>{const slug=c.areaOf(group),cards=c.inGroup(group),look=LOOK[slug]||['#a68bff','◇'];
  return {slug,group,color:look[0],icon:look[1],count:cards.length,services:cards.map(x=>x.title),href:CREA+'?area='+encodeURIComponent(slug)}});
}
// The studios and where each one starts: the avatar has its own page, the others open inline in the panel.
const STUDIOS=[['Avatar','/agency/avatar.html'],['Immagini',CREA+'?open=images'],['Video',CREA+'?open=video'],['Sito',CREA+'?open=site'],
 ['SEO e GEO',CREA+'?open=seo'],['Identità',CREA+'?open=identita'],['Stampa',CREA+'?open=stampa'],['Catalogo',CREA+'?open=catalogo']].map(([label,href])=>({label,href}));
// count: the key of counts() shown on the card, with its label; no key, no number.
const SECTIONS=[
 {id:'servizi',icon:'✧',title:'Cosa vuoi fare',line:'Tutti i servizi guidati: poche domande, tre proposte, scegli tu.',href:CREA,count:'servizi',unit:['servizio','servizi']},
 {id:'clienti',icon:'♧',title:'Clienti',line:'Le aziende per cui lavori, con i loro progetti.',href:'/agency/clients.html',count:'clienti',unit:['cliente','clienti']},
 {id:'progetti',icon:'▣',title:'Progetti',line:'Brief, incarichi, output e approvazioni di ogni progetto.',href:'/agency/projects.html',count:'progetti',unit:['progetto attivo','progetti attivi']},
 {id:'ped',icon:'▤',title:'Piano editoriale',line:'Calendario, testi e grafiche dei post; pubblichi solo con il tuo clic.',href:'/project-editorial.html#ped'},
 {id:'studi',icon:'◇',title:'Studi',line:'Gli strumenti guidati, uno per tipo di lavoro.',href:CREA,links:STUDIOS},
 {id:'risultati',icon:'▥',title:'Risultati',line:'Come stanno andando i contenuti pubblicati e la ricerca su Google.',href:'/project-editorial.html#results',
  links:[{label:'Risultati del piano editoriale',href:'/project-editorial.html#results'},{label:'Risultati SEO',href:CREA+'?open=seo'}]},
 {id:'approvazioni',icon:'✓',title:'Approvazioni',line:'Strategie, piani e contenuti in attesa di una decisione.',href:'/control-center-v2.html#approvals',count:'approvazioni',unit:['in attesa','in attesa']},
 {id:'memoria',icon:'◈',title:'Memoria',line:'Decisioni, fatti confermati e risultati che gli agenti ricordano.',href:'/agency/memory.html'}
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
// Where planet i of n sits at time t (seconds) on a w×h stage: two tilted rings, the inner one faster. depth is -1
// (behind the core) to 1 (in front); scale follows it so the orbit reads in perspective.
function orbitPoint(i,n,t,w,h){
 const ring=i%2,inRing=ring?Math.floor(n/2):Math.ceil(n/2),k=Math.floor(i/2),speed=ring?.07:.045;
 const rx=Math.max(60,Math.min(w/2-(ring?150:115),(ring?.28:.46)*w)),ry=Math.max(30,Math.min(h/2-(ring?70:45),rx*.62));
 const a=(k/inRing)*Math.PI*2+(ring?.75:0)+t*speed,tilt=-.12;
 const x0=Math.cos(a)*rx,y0=Math.sin(a)*ry;
 const depth=Math.sin(a);
 return {x:w/2+x0*Math.cos(tilt)-y0*Math.sin(tilt),y:h/2+x0*Math.sin(tilt)+y0*Math.cos(tilt),depth,scale:.84+.16*(depth+1)/2,ring,rx,ry,tilt};
}
return Object.freeze({LOOK,STUDIOS,SECTIONS,planets,counts,countText,orbitPoint});
});
