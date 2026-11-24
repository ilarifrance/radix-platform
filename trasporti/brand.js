/* Trasporti — the product name in one place. "Plancia" is the proposed name (to be confirmed by Francesco): to change
   it, edit this file and trasporti/marchio/; the pages read the name from here. Colours are in trasporti.css (:root). */
(function(root){
'use strict';
const BRAND={name:'Plancia',app:'Plancia Autista',console:'Plancia · centro operativo',tagline:'Il centro operativo della tua flotta, l\'app per i tuoi autisti.',proposed:true};
root.TR_BRAND=BRAND;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{for(const el of document.querySelectorAll('[data-brand]'))el.textContent=BRAND[el.dataset.brand]||BRAND.name;});
if(typeof module==='object'&&module.exports)module.exports=BRAND;
})(typeof globalThis!=='undefined'?globalThis:this);
