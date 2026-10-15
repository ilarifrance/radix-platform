/* RADIX PED views — channels, the status board and the brief for the AI copywriter, computed from the
   editorial state. Pure functions shared by project-editorial.html and the tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPedViews=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const CHANNELS=Object.freeze(['LinkedIn','Instagram','Facebook','TikTok','YouTube','X','Blog','Newsletter']);
const COLUMNS=Object.freeze([
 {id:'draft',label:'Bozza'},{id:'review',label:'In revisione'},{id:'approved',label:'Approvato'},{id:'queued',label:'In coda di pubblicazione'}
]);

function channelSlug(channel){
 const c=String(channel||'').trim().toLowerCase();
 const known=CHANNELS.find(x=>c===x.toLowerCase()||c.startsWith(x.toLowerCase()+' '));
 return known?known.toLowerCase():(c.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'altro');
}

// A content is queued only while its approved version is the one sent to the publishing queue.
function isQueued(item){return !!(item&&item.status==='approved'&&item.publication&&item.publication.revision===item.revision)}
function columnOf(item){return isQueued(item)?'queued':item.status}

function board(contents){
 const cols=COLUMNS.map(c=>({...c,items:[]}));
 for(const item of contents||[]){const col=cols.find(c=>c.id===columnOf(item));if(col)col.items.push(item)}
 cols.forEach(c=>c.items.sort((a,b)=>((a.date||'9999')+(a.time||'99:99')).localeCompare((b.date||'9999')+(b.time||'99:99'))));
 return cols;
}

function channelsFromBrief(brief){
 const listed=String(brief&&brief.channels||'').split(/[,;/\n]+/).map(s=>s.trim()).filter(Boolean);
 const named=listed.map(s=>CHANNELS.find(c=>s.toLowerCase().includes(c.toLowerCase()))||s);
 return [...new Set(named.concat(CHANNELS))].slice(0,20);
}

// The copywriter receives the approved strategy and the content's own fields, never other projects' data.
function copyPrompt(brief,item){
 const b=brief||{},lines=[
  'Scrivi il testo di un contenuto del piano editoriale, pronto per la revisione umana.',
  'Canale: '+(item.channel||'da definire'),'Titolo / tema: '+(item.title||'da definire'),
  item.date?'Data prevista: '+item.date+(item.time?' alle '+item.time:''):'',
  'Obiettivo del progetto: '+(b.goal||'—'),'Pubblico: '+(b.audience||'—'),'Tone of voice e vincoli: '+(b.voice||'—'),
  'Messaggi chiave: '+(b.messages||'—'),'Rubriche: '+(b.topics||'—'),
  item.copy&&item.copy.trim()?'Bozza attuale da migliorare:\n'+item.copy.trim():'',
  'Adatta lunghezza, struttura e call to action al formato del canale. Rispondi solo con il testo del post (con eventuali hashtag), senza commenti o alternative.'
 ];
 return lines.filter(Boolean).join('\n');
}

return Object.freeze({CHANNELS,COLUMNS,channelSlug,isQueued,columnOf,board,channelsFromBrief,copyPrompt});
});
