/* PM-only synthetic snapshot. No automatic reads, writes, or network. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./pm-demo.js'));else root.RadixPMStorage=factory(root.RadixPM);})(typeof globalThis!=='undefined'?globalThis:this,function(pm){
'use strict';
const KEY='radix.pm.synthetic.v1',MAX=2000000;
function controller(provider){let enabled=false;function fail(error){enabled=false;return {ok:false,error:'Archivio locale non disponibile o non valido: '+error.message+'. Le modifiche restano in memoria; la copia precedente potrebbe restare nel browser.'};}
function store(){const s=provider();if(!s)throw new Error('accesso negato');return s;}
function save(state){if(!enabled)return {ok:true,saved:false};try{const payload=JSON.stringify({kind:'radix-pm-synthetic',version:1,state:pm.validateState(state)});if(payload.length>MAX)throw new Error('dimensione eccessiva');store().setItem(KEY,payload);return {ok:true,saved:true};}catch(e){return fail(e);}}
return {get enabled(){return enabled;},enable(state,explicit){if(explicit!==true)return {ok:false,error:'Consenso esplicito richiesto.'};enabled=true;return save(state);},save,load(explicit){if(explicit!==true)return {ok:false,error:'Consenso esplicito richiesto.'};try{const raw=store().getItem(KEY);if(raw===null)return {ok:false,error:'Nessuna copia PM demo salvata.'};if(raw.length>MAX)throw new Error('dimensione eccessiva');const data=JSON.parse(raw);if(data.kind!=='radix-pm-synthetic'||data.version!==1)throw new Error('formato non supportato');return {ok:true,state:pm.validateState(data.state)};}catch(e){return fail(e);}},disable(){enabled=false;return {ok:true};},forget(explicit){if(explicit!==true)return {ok:false,error:'Conferma esplicita richiesta.'};enabled=false;try{store().removeItem(KEY);return {ok:true};}catch(e){return fail(e);}}};}
return {KEY,controller};
});
