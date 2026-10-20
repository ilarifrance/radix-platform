/* «Cosa vuoi fare oggi?»: the single Marketing panel. One card per service, each opening the tool that already does it
   (strategy, PED, avatar) or a guided studio inline (photo, avatar video, SEO and GEO) or, for the services still being built, the right agent with a ready request.
   Pure part (cards, links) runs in Node for the tests; the page lives in agency/crea.html. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrea=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// state: 'ready' = guided tool in RADIX, 'agent' = for now an agent with a prefilled request (never sent on its own).
// cost: what the person is asked to confirm before anything is spent; no prices are invented here.
const CARDS=[
 {id:'strategy',icon:'◎',title:'Strategia',line:'Obiettivi, pubblico e tono: RADIX propone 3 direzioni e tu scegli.',state:'ready',action:'Imposta la strategia',cost:'Una chiamata AI, con conferma.',href:'/project-editorial.html?project={p}#brief',noProject:'/agency/new-project.html'},
 {id:'social',icon:'▦',title:'Social e post',line:'Il piano editoriale del mese: calendario, testi e pubblicazione su Buffer.',state:'ready',action:'Apri il piano editoriale',cost:'Ogni testo AI chiede conferma; pubblicare è sempre un tuo clic.',href:'/project-editorial.html?project={p}#ped'},
 {id:'graphics',icon:'▣',title:'Post grafici',line:'Caroselli e post con testo sopra, nei colori del brand.',state:'ready',action:'Crea dai post del piano',cost:'L’Art Director AI chiede conferma prima di disegnare.',href:'/project-editorial.html?project={p}#ped',hint:'Apri un post del piano e premi «Grafica».'},
 {id:'images',icon:'◉',title:'Immagini',line:'Foto per post e sito: poche domande, 3 proposte, scegli e componi.',state:'ready',action:'Crea un’immagine',cost:'3 generazioni Higgsfield, con conferma.',inline:'photo'},
 {id:'avatar',icon:'☺',title:'Avatar',line:'Il volto del brand per i video: disegnato dall’AI o dalla tua foto.',state:'ready',action:'Crea l’avatar',cost:'Ogni passo HeyGen chiede conferma.',href:'/agency/avatar.html?project={p}'},
 {id:'video',icon:'▶',title:'Video',line:'Video brevi con l’avatar che parla: poche domande, 3 copioni, scegli e crei la bozza.',state:'ready',action:'Fai parlare l’avatar',cost:'Una chiamata AI per i copioni e una bozza HeyGen, ognuna con conferma.',inline:'video'},
 {id:'site',icon:'⌂',title:'Sito web',line:'Struttura, testi e pagine del sito. Il flusso guidato è in arrivo.',state:'agent',action:'Chiedi al Web Developer',cost:'Scrivi tu la richiesta; l’agente risponde solo quando la invii.',agent:'web-developer',ask:'Proponimi la struttura del sito per questo progetto: pagine, sezioni e testi principali, partendo dai fatti confermati.'},
 {id:'seo',icon:'⌖',title:'SEO e GEO',line:'Farsi trovare su Google e citare dalle AI: poche domande, 3 strategie, scegli e salvi il piano.',state:'ready',action:'Prepara la strategia SEO',cost:'Una chiamata AI allo Specialista SEO e GEO, con conferma.',inline:'seo'}
];
const ID=/^[a-z0-9-]{1,80}$/i;
// Where a card leads for a project; null when it opens inline (photo, video or SEO studio) or needs a project that is missing.
function linkFor(card,projectId){
 const p=ID.test(String(projectId||''))?String(projectId):'';
 if(card.inline)return null;
 if(card.agent)return '/agents.html?agent='+card.agent+(p?'&project='+encodeURIComponent(p):'')+'&q='+encodeURIComponent(card.ask);
 if(!p)return card.noProject||null;
 return card.href.replace('{p}',encodeURIComponent(p));
}
function card(id){return CARDS.find(c=>c.id===id)||null}
return Object.freeze({CARDS,linkFor,card});
});
