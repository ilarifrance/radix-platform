'use strict';
/* Impostazioni (impostazioni.html): the pure part, shared by the page (shell/settings.js) and the tests.
   Sections and #hash deep links, the password rule (same as api/auth/[action].js passwordProblem), the list of
   collegamenti with one plain line each, and who can change workspace settings. No DOM, no network. */
(function(root){
const SECTIONS=Object.freeze([
 {id:'profilo',label:'Profilo',hint:'Nome, email, password e lingua'},
 {id:'membri',label:'Workspace e membri',hint:'Chi lavora nel CRM e cosa vede',crm:true},
 {id:'caselle',label:'Caselle email',hint:'Da dove partono le campagne in coda',crm:true},
 {id:'collegamenti',label:'Collegamenti',hint:'Servizi esterni e estensione Chrome'},
 {id:'crm',label:'CRM',hint:'Automazioni, SLA e campi aggiunti',crm:true},
 {id:'crediti',label:'Crediti e fatturazione',hint:'In arrivo'}
]);
const IDS=SECTIONS.map(s=>s.id);
// Old names and anchors that point to the same section.
const ALIAS={profile:'profilo',password:'profilo',lingua:'profilo',members:'membri',workspace:'membri',visibilita:'membri',mailboxes:'caselle',integrazioni:'collegamenti',integrations:'collegamenti',estensione:'collegamenti',automazioni:'crm',sla:'crm',campi:'crm',billing:'crediti',fatturazione:'crediti'};
// '#caselle', 'caselle', '#members' → a section id; anything else → 'profilo'.
function sectionFromHash(hash){
 const h=String(hash||'').replace(/^#/,'').split(/[?&/]/)[0].trim().toLowerCase();
 if(IDS.includes(h))return h;
 return ALIAS[h]||'profilo';
}
const PASSWORD_MIN=8,PASSWORD_MAX=200;
// {current,password,confirm} → '' when it can be sent, otherwise the message to show.
function passwordProblem(f){
 const x=f||{};
 if(typeof x.current!=='string'||!x.current)return 'Scrivi la password attuale.';
 if(typeof x.password!=='string'||x.password.length<PASSWORD_MIN)return 'La nuova password deve avere almeno '+PASSWORD_MIN+' caratteri.';
 if(x.password.length>PASSWORD_MAX)return 'La nuova password può avere al massimo '+PASSWORD_MAX+' caratteri.';
 if(x.confirm!==undefined&&x.confirm!==x.password)return 'Le due nuove password non coincidono.';
 if(x.password===x.current)return 'La nuova password è uguale a quella attuale.';
 return '';
}
const LANGUAGES=Object.freeze([{id:'it',label:'Italiano',active:true},{id:'en',label:'English',active:false,note:'in arrivo'}]);
// Services of /api/integrations/status (api/_integrations-status.js SERVICES), in the same ids, with what they do in one line.
const SERVICES=Object.freeze([
 {id:'anthropic',label:'Anthropic',does:'Fa lavorare gli agenti AI: chat, orchestratori, Copilota del CRM.'},
 {id:'openai-image',label:'OpenAI',does:'Crea le immagini di sfondo delle slide e dei caroselli.'},
 {id:'twilio',label:'Telefonate (Twilio)',does:'Chiama dal numero RADIX e registra la telefonata per il verbale.'},
 {id:'transcribe',label:'Trascrizione meeting',does:'Trasforma in testo l’audio registrato con l’app Meeting.'},
 {id:'buffer',label:'Buffer',does:'Pubblica sui social i post approvati del Piano editoriale.'},
 {id:'heygen',label:'HeyGen',does:'Genera i video con avatar dello Studio Avatar.'},
 {id:'higgsfield',label:'Higgsfield',does:'Genera immagini e video per Agency e Piano editoriale.'},
 {id:'email',label:'Gmail',does:'Invia le email degli agenti commerciali dall’indirizzo RADIX.'},
 {id:'vercel-sites',label:'Vercel siti',does:'Mette online i siti creati nello Studio Sito.'},
 {id:'captain-data',label:'Captain Data',does:'Verifica e arricchisce i lead in Lead Intelligence.'},
 {id:'blob',label:'Vercel Blob',does:'Tiene le immagini pubbliche che Buffer deve poter leggere.'},
 {id:'database',label:'Database RADIX',does:'Conserva CRM, progetti, memoria del team e approvazioni.'}
]);
const STATE_TEXT={true:'Chiave configurata',false:'Non collegato',null:'Stato non disponibile'};
/* map: {id: boolean} from RadixWorkspace.integrations(), or null when the status could not be read.
   → [{id,label,does,state:true|false|null,text}] in SERVICES order; services the server adds later follow, by id. */
function connections(map){
 const m=map&&typeof map==='object'?map:null;
 const out=SERVICES.map(s=>{const v=m&&typeof m[s.id]==='boolean'?m[s.id]:null;return {...s,state:v,text:STATE_TEXT[v]}});
 if(m)for(const id of Object.keys(m).sort())if(!SERVICES.some(s=>s.id===id)&&typeof m[id]==='boolean')out.push({id,label:id,does:'',state:m[id],text:STATE_TEXT[m[id]]});
 return out;
}
const canManage=role=>role==='owner'||role==='admin';
const ROLE_NAMES=Object.freeze({owner:'Owner',admin:'Admin',member:'Membro',viewer:'Sola lettura'});// as in sales/sales.js
// Initials for the profile card: «Francesco Rossi» → «FR», «anna@x.it» → «A».
function initials(name,email){
 const words=String(name||'').trim().split(/\s+/).filter(Boolean);
 if(words.length)return (words[0][0]+(words.length>1?words[words.length-1][0]:'')).toUpperCase();
 const e=String(email||'').trim();return e?e[0].toUpperCase():'?';
}
const api={SECTIONS,IDS,sectionFromHash,PASSWORD_MIN,PASSWORD_MAX,passwordProblem,LANGUAGES,SERVICES,connections,canManage,ROLE_NAMES,initials};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixSettingsCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
