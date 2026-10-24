'use strict';
/* Assistenza: knowledge base and quick replies (pure logic, no DOM, no network, no AI).
   Articles: {id,title,text,tags[]}. Quick replies: {id,title,text} with merge tags {{nome}}, {{azienda}}, {{ticket}}.
   Search and suggestions are a fixed rule: words in common between the query (or the ticket subject and
   body) and the article title, tags and text. Title words weigh 3, tags 2, text 1. Short words and common
   Italian words are ignored, accents do not matter and words that share their first 5 letters count as the
   same word (accesso/accessi, fattura/fatture). The data lives in the browser, per CRM workspace
   (crm-knowledge.js); importJson() checks a file before it replaces or adds anything. */
(function(root){
const LIMITS=Object.freeze({title:120,text:4000,tags:10,tag:30,articles:500,snippets:200,file:1000000});
const STOP=new Set(('alla alle allo agli anche come con contro dai dal dalla dalle dagli degli dei del della delle dello '
 +'dopo dove per perche piu poi quale quando quello questa queste questi questo sono sul sulla sulle sugli suo sua suoi '
 +'tra fra una uno che chi cosa non nel nella nelle negli nei mio mia miei mie tuo tua vostro vostra nostro nostra '
 +'gli the and for you are was buongiorno buonasera salve gentile grazie saluti cordiali ciao prego vorrei potete '
 +'riesco essere avere fare stato stata ancora sempre solo gia molto ogni tutto tutti tutte ecco').split(/\s+/));
const fold=s=>String(s??'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('it');
const stem=w=>w.length>5?w.slice(0,5):w;
// Distinct comparable words of a text (stems), in order of appearance.
function words(text){
 const out=[];for(const w of fold(text).split(/[^\p{L}\p{N}]+/u)){if(w.length<3||STOP.has(w)||/^\d+$/.test(w))continue;const s=stem(w);if(!out.includes(s))out.push(s)}
 return out;
}
// The readable form of each stem, for «parole in comune» (first spelling met in the source text).
function spellings(text){const m=new Map();for(const w of fold(text).split(/[^\p{L}\p{N}]+/u)){if(w.length<3||STOP.has(w))continue;const s=stem(w);if(!m.has(s))m.set(s,w)}return m}
function score(article,query){
 const t=words(article.title),g=words((article.tags||[]).join(' ')),b=words(article.text);
 let s=0;const hit=[];
 for(const q of query){const p=(t.includes(q)?3:0)+(g.includes(q)?2:0)+(b.includes(q)?1:0);if(p){s+=p;hit.push(q)}}
 return {score:s,hit};
}
const byTitle=(a,b)=>fold(a.title).localeCompare(fold(b.title),'it')||String(a.id).localeCompare(String(b.id));
// Search box: every article for an empty query (by title), otherwise only articles with a word in common, best first.
function search(articles,query,limit=20){
 const list=(articles||[]).filter(a=>a&&a.title),q=words(query);
 if(!q.length)return list.slice().sort(byTitle).slice(0,limit).map(a=>({article:a,score:0,words:[]}));
 const sp=spellings(query);
 return list.map(a=>{const r=score(a,q);return {article:a,score:r.score,words:r.hit.map(h=>sp.get(h)||h)}}).filter(r=>r.score>0)
  .sort((x,y)=>y.score-x.score||byTitle(x.article,y.article)).slice(0,limit);
}
// Suggestions for an open ticket: the same rule on the ticket subject and body; at least `min` points.
function suggest(articles,ticket,{limit=3,min=2}={}){
 const src=String(ticket&&ticket.title||'')+' '+String(ticket&&ticket.body||'');
 return search(articles,src,Infinity).filter(r=>r.score>=min).slice(0,limit);
}

// Merge tags. A missing value gets a neutral fallback, so a reply never shows an empty gap or a raw tag.
const FALLBACK=Object.freeze({nome:'cliente',azienda:'la vostra azienda',ticket:'la sua richiesta'});
const TAG=/\{\{\s*([\p{L}_]+)\s*\}\}/gu;
function mergeValues(ticket,contact,company){
 const clean=v=>{const s=String(v??'').replace(/\s+/g,' ').trim();return s&&s!=='Contatto anonimizzato'?s.slice(0,200):''};
 return {nome:clean(contact&&contact.name),azienda:clean(company&&company.name)||clean(contact&&contact.company),ticket:clean(ticket&&ticket.title)};
}
// Returns the filled text, the tags that used a fallback and any unknown tag (left as written).
function fill(text,values){
 const missing=[],unknown=[];
 const out=String(text??'').replace(TAG,(raw,name)=>{const k=fold(name);
  if(!(k in FALLBACK)){if(!unknown.includes(raw))unknown.push(raw);return raw}
  const v=values&&String(values[k]??'').trim();if(v)return v;if(!missing.includes(k))missing.push(k);return FALLBACK[k]});
 return {text:out,missing,unknown};
}

// Text into the reply box at the cursor, with a blank line around it; never past the box limit.
function insert(value,addition,start,end,max=4000){
 const v=String(value??''),add=String(addition??'').trim();
 const s=Number.isInteger(start)?Math.max(0,Math.min(start,v.length)):v.length,e=Number.isInteger(end)?Math.max(s,Math.min(end,v.length)):s;
 const before=v.slice(0,s).replace(/\s+$/,''),after=v.slice(e).replace(/^\s+/,'');
 const head=before?before+'\n\n':'',tail=after?'\n\n'+after:'';
 const room=max-head.length-tail.length;
 if(!add)return {value:v,cursor:e,truncated:false};
 if(room<=0)return {value:v,cursor:e,truncated:true,full:true};
 const piece=add.slice(0,room);
 return {value:head+piece+tail,cursor:(head+piece).length,truncated:piece.length<add.length};
}

// ---- data: validation, import, export ----
const str=v=>typeof v==='string'?v.replace(/\r\n?/g,'\n').trim():'';
const newId=p=>p+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
function tagsOf(v){
 const raw=Array.isArray(v)?v:typeof v==='string'?v.split(','):[];const out=[];
 for(const t of raw){if(typeof t!=='string')continue;const c=t.replace(/\s+/g,' ').trim().toLocaleLowerCase('it').slice(0,LIMITS.tag);if(c&&!out.includes(c))out.push(c)}
 return out.slice(0,LIMITS.tags);
}
// One item checked: {item} or {error}. kind: 'article' | 'snippet'.
function check(kind,x){
 if(!x||typeof x!=='object'||Array.isArray(x))return {error:'non è un oggetto'};
 const title=str(x.title),text=str(x.text);
 if(!title)return {error:'manca il titolo'};if(title.length>LIMITS.title)return {error:'titolo oltre '+LIMITS.title+' caratteri'};
 if(!text)return {error:'manca il testo'};if(text.length>LIMITS.text)return {error:'testo oltre '+LIMITS.text+' caratteri'};
 const id=typeof x.id==='string'&&/^[\w-]{1,80}$/.test(x.id)?x.id:newId(kind==='article'?'kb':'rr');
 return {item:kind==='article'?{id,title,text,tags:tagsOf(x.tags)}:{id,title,text}};
}
function empty(){return {articles:[],snippets:[]}}
// Stored data back from localStorage: anything broken is dropped, never thrown.
function normalize(data){
 const out=empty();if(!data||typeof data!=='object')return out;
 for(const [key,kind,max] of [['articles','article',LIMITS.articles],['snippets','snippet',LIMITS.snippets]]){
  const seen=new Set();for(const x of Array.isArray(data[key])?data[key]:[]){const r=check(kind,x);if(r.item&&!seen.has(r.item.id)&&out[key].length<max){seen.add(r.item.id);out[key].push(r.item)}}
 }
 return out;
}
// A file chosen by the person: JSON text → items to add (same id replaces). Invalid entries are listed, not imported.
function importJson(text){
 if(typeof text!=='string'||!text.trim())return {error:'File vuoto.'};
 if(text.length>LIMITS.file)return {error:'File troppo grande (massimo 1 MB).'};
 let d;try{d=JSON.parse(text)}catch{return {error:'Il file non è un JSON valido.'}}
 if(!d||typeof d!=='object'||Array.isArray(d))return {error:'Formato non riconosciuto: serve un oggetto con «articles» e/o «snippets».'};
 if(d.format!==undefined&&d.format!=='radix-crm-knowledge')return {error:'Il file non è un export della knowledge base RADIX.'};
 if(!Array.isArray(d.articles)&&!Array.isArray(d.snippets))return {error:'Il file non contiene «articles» né «snippets».'};
 const out=empty(),skipped=[];
 for(const [key,kind,label] of [['articles','article','Articolo'],['snippets','snippet','Risposta rapida']]){
  if(d[key]!==undefined&&!Array.isArray(d[key])){skipped.push('«'+key+'» non è un elenco');continue}
  (d[key]||[]).forEach((x,i)=>{const r=check(kind,x);if(r.error)skipped.push(label+' '+(i+1)+': '+r.error);else out[key].push(r.item)});
 }
 if(!out.articles.length&&!out.snippets.length)return {error:'Nessun elemento valido.'+(skipped.length?' '+skipped.slice(0,5).join('; ')+'.':'')};
 return {data:out,skipped};
}
// Imported items merged into the current data: same id replaces, new ids are added, within the limits.
function merge(current,incoming){
 const base=normalize(current),add=normalize(incoming);let added=0,replaced=0,dropped=0;
 for(const [key,max] of [['articles',LIMITS.articles],['snippets',LIMITS.snippets]]){
  for(const x of add[key]){const i=base[key].findIndex(y=>y.id===x.id);if(i>=0){base[key][i]=x;replaced++}else if(base[key].length<max){base[key].push(x);added++}else dropped++}
 }
 return {data:base,added,replaced,dropped};
}
function exportJson(data,workspace,now){
 const d=normalize(data);
 return JSON.stringify({format:'radix-crm-knowledge',version:1,workspace:workspace||null,exported_at:new Date(now??Date.now()).toISOString(),articles:d.articles,snippets:d.snippets},null,2);
}
const storageKey=workspace=>'radix-crm-knowledge:'+String(workspace||'');

// Starting examples, added only when the person asks («Aggiungi esempi»).
const EXAMPLES=Object.freeze({
 articles:[
  {id:'kb-esempio-password',title:'Reimpostare la password del portale',tags:['accesso','password','login'],text:'Per reimpostare la password apra la pagina di accesso, scelga «Password dimenticata» e inserisca l’email registrata. Il link arriva entro pochi minuti ed è valido 24 ore. Se non arriva, controlli la cartella spam.'},
  {id:'kb-esempio-fattura',title:'Richiedere una copia della fattura',tags:['fattura','pagamenti','amministrazione'],text:'Le fatture sono disponibili nell’area clienti, sezione «Documenti». Se serve una copia firmata o una nota di credito, ci indichi numero e data della fattura e la inviamo per email.'},
  {id:'kb-esempio-consegna',title:'Tempi di consegna e tracciamento',tags:['consegna','spedizione','ordine'],text:'Gli ordini partono entro 2 giorni lavorativi. Il codice di tracciamento arriva per email alla spedizione. Per un ritardo oltre 5 giorni ci scriva il numero d’ordine.'}
 ],
 snippets:[
  {id:'rr-esempio-presa',title:'Presa in carico',text:'Gentile {{nome}},\ngrazie per averci scritto. Abbiamo preso in carico «{{ticket}}» per {{azienda}} e le rispondiamo entro un giorno lavorativo.'},
  {id:'rr-esempio-chiusura',title:'Chiusura ticket',text:'Gentile {{nome}},\nla richiesta «{{ticket}}» risulta risolta. Se serve altro, risponda pure a questa email.\nUn saluto'}
 ]
});

const core={LIMITS,FALLBACK,EXAMPLES,words,search,suggest,mergeValues,fill,insert,tagsOf,check,empty,normalize,importJson,merge,exportJson,storageKey,newId};
if(typeof module==='object'&&module.exports)module.exports=core;else root.RadixCrmKnowledgeCore=core;
})(typeof globalThis!=='undefined'?globalThis:this);
