/* «Cosa vuoi fare oggi?»: the single Marketing panel. One card per service, each opening the tool that already does it
   (strategy, PED, avatar) or a guided studio inline (photo, avatar video, site, SEO and GEO, and the text services of
   lib/copy-studio.js: inline 'copy:<service>'). Each card has a `group`, one of GROUPS, for the panel's filters.
   Pure part (cards, groups, links) runs in Node for the tests; the page lives in agency/crea.html. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrea=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// The panel's filters, in order; every card has one.
const GROUPS=['Brand','Strategia','Web e annunci','Social e contenuti','Stampa e documenti','Immagini','Video'];
// state: 'ready' = guided tool in RADIX, 'agent' = for now an agent with a prefilled request (never sent on its own).
// cost: what the person is asked to confirm before anything is spent; no prices are invented here.
const CARDS=[
 {id:'strategy',group:'Strategia',icon:'◎',title:'Strategia',line:'Obiettivi, pubblico e tono: RADIX propone 3 direzioni e tu scegli.',state:'ready',action:'Imposta la strategia',cost:'Una chiamata AI, con conferma.',href:'/project-editorial.html?project={p}#brief',noProject:'/agency/new-project.html'},
 {id:'lancio',group:'Strategia',icon:'➚',title:'Piano di lancio prodotto',line:'Fasi, canali e messaggi per lanciare un prodotto: 3 piani a 30, 60 e 90 giorni, scegli tu.',state:'ready',action:'Prepara il lancio',cost:'Una chiamata AI al Digital Strategist, con conferma.',inline:'copy:lancio'},
 {id:'naming',group:'Brand',icon:'✦',title:'Nome e slogan',line:'Idee di nome per la marca o un prodotto e lo slogan: 3 proposte, scegli tu.',state:'ready',action:'Trova nome e slogan',cost:'Una chiamata AI allo Stratega di Marca, con conferma.',inline:'copy:naming',hint:'Il marchio va verificato su UIBM, TMview e WIPO prima di usarlo.'},
 {id:'social',group:'Social e contenuti',icon:'▦',title:'Social e post',line:'Il piano editoriale del mese: calendario, testi e pubblicazione su Buffer.',state:'ready',action:'Apri il piano editoriale',cost:'Ogni testo AI chiede conferma; pubblicare è sempre un tuo clic.',href:'/project-editorial.html?project={p}#ped'},
 {id:'graphics',group:'Social e contenuti',icon:'▣',title:'Post grafici',line:'Caroselli e post con testo sopra, nei colori del brand.',state:'ready',action:'Crea dai post del piano',cost:'L’Art Director AI chiede conferma prima di disegnare.',href:'/project-editorial.html?project={p}#ped',hint:'Apri un post del piano e premi «Grafica».'},
 {id:'testi',group:'Social e contenuti',icon:'¶',title:'Testi per sito, blog e prodotti',line:'Una pagina del sito, un articolo o una descrizione prodotto: 3 versioni, scegli e modifichi.',state:'ready',action:'Scrivi un testo',cost:'Una chiamata AI al Content e UX Writer, con conferma.',inline:'copy:testi'},
 {id:'newsletter',group:'Social e contenuti',icon:'✉',title:'Newsletter',line:'Oggetto, anteprima e testo della mail: 3 versioni, scegli e modifichi.',state:'ready',action:'Scrivi la newsletter',cost:'Una chiamata AI al Copywriter, con conferma.',inline:'copy:newsletter'},
 {id:'images',group:'Immagini',icon:'◉',title:'Immagini',line:'Foto per post e sito: poche domande, 3 proposte, scegli e componi.',state:'ready',action:'Crea un’immagine',cost:'3 generazioni Higgsfield, con conferma.',inline:'photo'},
 {id:'avatar',group:'Video',icon:'☺',title:'Avatar',line:'Il volto del brand per i video: disegnato dall’AI o dalla tua foto.',state:'ready',action:'Crea l’avatar',cost:'Ogni passo HeyGen chiede conferma.',href:'/agency/avatar.html?project={p}'},
 {id:'video',group:'Video',icon:'▶',title:'Video',line:'Video brevi con l’avatar che parla: poche domande, 3 copioni, scegli e crei la bozza.',state:'ready',action:'Fai parlare l’avatar',cost:'Una chiamata AI per i copioni e una bozza HeyGen, ognuna con conferma.',inline:'video'},
 {id:'site',group:'Web e annunci',icon:'⌂',title:'Sito web',line:'Una landing o un piccolo sito: poche domande, 3 proposte con anteprima, scegli e scarichi o salvi.',state:'ready',action:'Prepara il sito',cost:'Una chiamata AI al Web Developer, con conferma.',inline:'site'},
 {id:'seo',group:'Web e annunci',icon:'⌖',title:'SEO e GEO',line:'Farsi trovare su Google e citare dalle AI: poche domande, 3 strategie, scegli e salvi il piano.',state:'ready',action:'Prepara la strategia SEO',cost:'Una chiamata AI allo Specialista SEO e GEO, con conferma.',inline:'seo'},
 {id:'annunci',group:'Web e annunci',icon:'◆',title:'Testi per annunci Google e Meta',line:'Titoli e descrizioni nei limiti di Google e Meta: 3 set, scegli e copi. Le campagne restano nel tuo account.',state:'ready',action:'Scrivi gli annunci',cost:'Una chiamata AI al Paid Media Specialist, con conferma.',inline:'copy:annunci'},
 {id:'brochure',group:'Stampa e documenti',icon:'▤',title:'Brochure e company profile',line:'I testi di una brochure o del company profile, sezione per sezione: 3 versioni, scegli tu.',state:'ready',action:'Scrivi la brochure',cost:'Una chiamata AI al Copywriter, con conferma.',inline:'copy:brochure'},
 {id:'scheda',group:'Stampa e documenti',icon:'▥',title:'Scheda tecnica',line:'Caratteristiche, misure e materiali in ordine, solo dai dati che scrivi tu: 3 impostazioni, scegli tu.',state:'ready',action:'Prepara la scheda',cost:'Una chiamata AI al Copywriter, con conferma.',inline:'copy:scheda',hint:'Nessun dato inventato: i numeri che non hai scritto vengono segnalati.'},
 {id:'presentazione',group:'Stampa e documenti',icon:'▭',title:'Presentazione',line:'La scaletta slide per slide: titolo, punti e cosa dire. 3 versioni, scegli e modifichi.',state:'ready',action:'Prepara la scaletta',cost:'Una chiamata AI allo Stratega di Marca, con conferma.',inline:'copy:presentazione'}
];
const ID=/^[a-z0-9-]{1,80}$/i;
// Where a card leads for a project; null when it opens inline (photo, video, site, SEO or text studio) or needs a project that is missing.
function linkFor(card,projectId){
 const p=ID.test(String(projectId||''))?String(projectId):'';
 if(card.inline)return null;
 if(card.agent)return '/agents.html?agent='+card.agent+(p?'&project='+encodeURIComponent(p):'')+'&q='+encodeURIComponent(card.ask);
 if(!p)return card.noProject||null;
 return card.href.replace('{p}',encodeURIComponent(p));
}
function card(id){return CARDS.find(c=>c.id===id)||null}
// The filters that have cards, in GROUPS order; '' (or an unknown group) is «Tutti».
const groups=()=>GROUPS.filter(g=>CARDS.some(c=>c.group===g));
const inGroup=group=>groups().includes(group)?CARDS.filter(c=>c.group===group):CARDS;
return Object.freeze({CARDS,GROUPS,linkFor,card,groups,inGroup});
});
