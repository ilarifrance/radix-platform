/* Studio «Campagne Google Ads Search» (agency job W5): the structure of a Search account ready for Google Ads Editor.
   1. Questions: goal (calls, form requests, site visits), services or products, area (cities, or a radius around an
      address), daily budget, landing page (prefilled from the project's site online or its links), brand terms.
   2. ONE AI call to the Paid Media Specialist (/api/chat through RadixAgents.reply, after RadixConfirm) returns three
      structures as JSON: per service, per intent, per area. Each has campaigns → ad groups → keywords with their match
      type, negative keywords, one responsive search ad per ad group (up to 15 headlines of 30 characters, 4 descriptions
      of 90, two paths of 15) and the assets (sitelinks, callouts, a structured snippet). parseStructures() validates
      everything and DROPS what is invalid (over a limit, empty, keyword with characters Google refuses, sitelink to
      another site…), counting what it dropped.
   3. The person picks one structure and refines it with live checks (checks()): character limits, too few headlines or
      descriptions, duplicate headlines, duplicate keywords, a negative that blocks a keyword, the keyword in the
      headlines, and the Italian ad policy no-nos: ALL CAPS, «!» in a headline or more than one in a description,
      repeated punctuation, symbols and emoji, phone numbers in the text, claims («il migliore», «gratis», «numero 1»…)
      and numbers that are not in the brief or in the confirmed facts.
      The budget split is arithmetic only: the daily budget the person typed, split by the shares the person sets (equal
      by default), to the cent; the monthly ceiling is 30,4 × the daily budget (Google's rule).
      Search volumes and CPC are «non disponibile (serve Google Ads API)»: RADIX never estimates them.
   4. Export: one zip with the CSV files for Google Ads Editor (Account › Importa › Da file), one per kind of row, in the
      format of Editor's own export: UTF-16 LE with BOM, tab-separated, .csv, Editor's English column headers; campaigns
      are imported PAUSED. Plus LEGGIMI.txt (import order and what to check), and the summary for the client as PDF (the
      own writer of lib/print-studio.js, «per il web») and as one HTML file.
   Saved in the project: the «agents» document under the key searchAds (agents-page.js keeps it), other keys untouched.
   Pure part runs in Node for the tests; searchAdsStudio() is the browser widget. The only paid step is the AI call. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixSearchAdsStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')))};
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const PS=()=>lib('RadixPrintStudio','./print-studio.js'),CC=()=>lib('RadixCopyChecks','./copy-checks.js'),CS=()=>lib('RadixCopyStudio','./copy-studio.js'),ZIP=()=>lib('RadixZip','./zip-lite.js');
const AGENT='paid-media',COUNT=3,MAX_SAVED=12,FACTS_MAX=3000;
const NA='non disponibile (serve Google Ads API)';
const clean=s=>String(s==null?'':s).replace(/[\s ]+/g,' ').trim();
const chars=s=>[...String(s==null?'':s)].length;
const filled=a=>(Array.isArray(a)?a:[]).map(clean).filter(Boolean);
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>norm(s).replace(/ /g,'-').slice(0,40);
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ---- the rules of Google Ads (Search) ----
// Responsive search ads: 3-15 headlines of 30, 2-4 descriptions of 90, two paths of 15 (support.google.com/google-ads/answer/7684791).
// Keywords: up to 80 characters and 10 words. Sitelinks: text 25, description lines 35. Callouts 25. Snippet values 25, 3-10 of them.
const LIMITS=Object.freeze({headline:30,headlines:15,headlinesMin:3,headlinesGood:8,description:90,descriptions:4,descriptionsMin:2,path:15,keyword:80,keywordWords:10,
 sitelink:25,sitelinkLine:35,sitelinks:8,sitelinksMin:2,callout:25,callouts:10,calloutsMin:2,snippetValue:25,snippetMin:3,snippetMax:10,
 campaigns:5,groups:6,keywords:25,negatives:40,name:80,services:8,cities:10,brand:10,radiusMax:800});
const GOALS=Object.freeze([
 {id:'chiamate',label:'Chiamate',line:'ricevere telefonate da chi cerca',bid:'Maximize conversions',bidLabel:'Massimizza le conversioni (le chiamate vanno tracciate come conversioni)'},
 {id:'moduli',label:'Richieste dal modulo',line:'ricevere richieste dal modulo contatti del sito',bid:'Maximize conversions',bidLabel:'Massimizza le conversioni (l’invio del modulo va tracciato come conversione)'},
 {id:'visite',label:'Visite al sito',line:'portare persone interessate sul sito',bid:'Maximize clicks',bidLabel:'Massimizza i clic'}]);
const KINDS=Object.freeze([
 {id:'servizio',label:'Per servizio',line:'Una campagna per servizio o prodotto: budget e risultati separati per ognuno.'},
 {id:'intento',label:'Per intento',line:'Chi cerca adesso, chi confronta, chi cerca già il marchio: messaggi e budget diversi.'},
 {id:'zona',label:'Per zona',line:'Una campagna per città o zona, con parole chiave che nominano il luogo.'}]);
const MATCH=Object.freeze({broad:{label:'Generica',editor:'Broad'},phrase:{label:'A frase',editor:'Phrase'},exact:{label:'Esatta',editor:'Exact'}});
// Structured snippet headers: the Italian label shown here → the predefined header Google Ads Editor expects.
const SNIPPET_HEADERS=Object.freeze([['Servizi','Service catalog'],['Tipi','Types'],['Marchi','Brands'],['Modelli','Models'],['Corsi','Courses'],['Destinazioni','Destinations'],['Quartieri','Neighborhoods'],['Stili','Styles'],['Servizi inclusi','Amenities']]);
const goalOf=id=>GOALS.find(g=>g.id===id)||GOALS[0];
const kindOf=id=>KINDS.find(k=>k.id===id)||null;

// ---- the answers ----
const listOf=(v,max,len)=>{const seen=new Map();(Array.isArray(v)?v:String(v==null?'':v).split(/\n|,|;/)).map(x=>clean(x).replace(/^[-*•]\s*/,'').slice(0,len)).filter(x=>chars(x)>=2).forEach(x=>{if(!seen.has(norm(x)))seen.set(norm(x),x)});return [...seen.values()].slice(0,max)};
// «20», «20,50», «€ 20.5» → 20.5; anything else → null. Rounded to the cent.
function money(v){if(typeof v==='number')return Number.isFinite(v)&&v>0?Math.round(v*100)/100:null;const s=clean(v).replace(/€|eur(o)?/gi,'').replace(/\s/g,'');
 if(!/^\d{1,6}(?:[.,]\d{1,2})?$/.test(s))return null;const n=Number(s.replace(',','.'));return n>0?Math.round(n*100)/100:null}
function normalize(a){a=a||{};const r=Number(String(a.radiusKm==null?'':a.radiusKm).replace(',','.'));
 return {goal:goalOf(a.goal).id,services:listOf(a.services,LIMITS.services,80),cities:listOf(a.cities,LIMITS.cities,60),radiusKm:r>0?Math.min(LIMITS.radiusMax,Math.round(r)):null,
  center:clean(a.center).slice(0,140),budget:money(a.budget),landing:clean(a.landing).slice(0,300),brand:listOf(a.brand,LIMITS.brand,40)}}
// The landing page: https only (http becomes https), a real host. {url,host} or {error}.
function landingUrl(v){let s=clean(v);if(!s)return {error:'Scrivi l’indirizzo della pagina di destinazione (es. www.esempio.it/contatti).'};
 if(/^http:\/\//i.test(s))s='https://'+s.slice(7);else if(!/^https:\/\//i.test(s))s='https://'+s;
 let u=null;try{u=new URL(s)}catch(e){}
 if(!u||/\s/.test(clean(v))||!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname)||/^\d+(\.\d+){3}$/.test(u.hostname)||u.username||u.password)return {error:'L’indirizzo della pagina non sembra valido (es. www.esempio.it/contatti).'};
 return {url:u.origin+u.pathname+u.search,host:u.hostname.toLowerCase().replace(/^www\./,''),origin:u.origin}}
// What is missing to ask the AI: [] when the answers are enough.
function answerErrors(a0){const a=normalize(a0),out=[];
 if(!a.services.length)out.push('Scrivi almeno un servizio o prodotto da pubblicizzare.');
 if(!a.cities.length&&!(a.radiusKm&&a.center))out.push('Indica la zona: almeno una città, oppure un indirizzo con il raggio in km.');
 if(!a.budget)out.push('Scrivi il budget giornaliero in euro (es. 20).');else if(a.budget>100000)out.push('Il budget giornaliero sembra troppo alto: controllalo.');
 const l=landingUrl(a.landing);if(l.error)out.push(l.error);
 return out}
// From the project: the landing (site online, else the first link of the profile), the brand (the project name), a city.
// agents: the «agents» document (siteOnline from the Studio Sito); project: RadixAgents.profileFor(…).
function prefill(project,agents){const p=project||{},s=agents&&agents.siteOnline,dom=s&&s.domain&&s.domain.verified&&s.domain.name?'https://'+s.domain.name:'';
 const online=dom||(s&&/^https:\/\/[^\s"'<>]+$/.test(String(s.url||''))?String(s.url):'');
 const link=(String(p.links||'').match(/https?:\/\/[^\s,;)<>"']+/i)||[''])[0].replace(/[.]+$/,'');
 const text=[p.summary,p.positioning,p.audience,p.notes].join('. '),city=(/\b(?:a|di|in|zona)\s+([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+)?)\b/.exec(text)||[])[1]||'';
 const brand=clean(String(p.name||'').split(/\s[—–-]\s/)[0]).slice(0,40);
 return {landing:online||link,landingFrom:online?'sito':link?'profilo':'',brand:brand?[brand]:[],cities:city&&!/^(?:Il|La|Lo|Le|Gli|I|Un|Una)$/.test(city)?[city]:[]}}

// ---- the budget: arithmetic on the person's own number, never an estimate ----
// total (€ per day) split by weights (any positive numbers; none or all zero = equal), to the cent: the parts add up to total.
function budgetSplit(total,weights){const n=Array.isArray(weights)?weights.length:0,cents=Math.round((Number(total)||0)*100);if(!n)return [];if(!(cents>0))return weights.map(()=>0);
 const w=weights.map(x=>Number(x)>0?Number(x):0),sum=w.reduce((a,b)=>a+b,0),ws=sum>0?w:w.map(()=>1),S=sum>0?sum:n;
 const raw=ws.map(x=>cents*x/S),base=raw.map(Math.floor);let rest=cents-base.reduce((a,b)=>a+b,0);
 const order=raw.map((r,i)=>[r-base[i],i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]);for(let k=0;rest>0;k++,rest--)base[order[k%n][1]]++;
 return base.map(c=>c/100)}
// Google may spend up to twice the daily budget on a day, but not more than 30,4 × the daily budget in a month.
const monthlyCap=daily=>Math.round((Number(daily)||0)*30.4*100)/100;
const euro=v=>{const n=Math.round((Number(v)||0)*100)/100,[i,f]=n.toFixed(2).split('.');return i.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+f+' €'};
const sharesOf=s=>{const n=s.campaigns.length,w=Array.isArray(s.shares)&&s.shares.length===n?s.shares.map(x=>Number(x)>=0?Number(x):0):s.campaigns.map(()=>1);return w};
// The split of a structure: [{name, share (%), daily, monthly}].
function budgetOf(s,budget){const w=sharesOf(s),sum=w.reduce((a,b)=>a+b,0)||1,d=budgetSplit(budget,w);
 return s.campaigns.map((c,i)=>({name:c.name,share:Math.round(w[i]*1000/sum)/10,daily:d[i]||0,monthly:monthlyCap(d[i]||0)}))}

// ---- the AI call ----
function factsText(project,profile){const C=CS(),out=C&&typeof C.projectFacts==='function'?C.projectFacts(project):[],b=(profile&&profile.brief)||{};
 if(clean(b.facts))out.push('Scheda fatti del cliente: '+clean(b.facts));return out.join('\n').slice(0,FACTS_MAX)}
// What the numbers and claims of the ads are checked against: only what the person wrote and the confirmed facts.
const inputText=(answers,facts)=>{const a=normalize(answers);return [a.services.join('\n'),a.cities.join(', '),a.center,a.brand.join(', '),facts||''].join('\n')};
function structuresPrompt(answers,values={}){const a=normalize(answers),v=values||{},p=v.project||{},g=goalOf(a.goal),errs=answerErrors(a);if(errs.length)throw Error(errs[0]);
 const land=landingUrl(a.landing),L=[];
 L.push('Prepara '+COUNT+' strutture di account Google Ads (rete di ricerca)'+(p.name?' per «'+clean(p.name).slice(0,80)+'»':'')+', davvero diverse tra loro:',
  '1) tipo "servizio": una campagna per servizio o prodotto;','2) tipo "intento": campagne per intenzione di ricerca (chi cerca adesso, chi confronta, chi cerca il marchio);','3) tipo "zona": una campagna per città o zona.');
 L.push('Obiettivo: '+g.line+'.','Servizi o prodotti: '+a.services.map(x=>'«'+x+'»').join(', ')+'.');
 L.push('Zona: '+[a.cities.length?a.cities.join(', '):'',a.radiusKm&&a.center?'raggio di '+a.radiusKm+' km da «'+a.center+'»':''].filter(Boolean).join('; ')+'.');
 L.push('Pagina di destinazione: '+land.url);
 if(a.brand.length)L.push('Termini del marchio: '+a.brand.map(x=>'«'+x+'»').join(', ')+'. Mettili in una campagna o in un gruppo «Marchio» con corrispondenza esatta o a frase, e come negative nelle altre campagne.');
 const facts=clean(v.facts)?String(v.facts).slice(0,FACTS_MAX):'';if(facts)L.push('Fatti confermati del progetto:\n'+facts);
 L.push('Regole:',
  '- Al massimo '+LIMITS.campaigns+' campagne per struttura e '+LIMITS.groups+' gruppi per campagna; da 5 a 15 parole chiave per gruppo, in italiano, come le scrive chi cerca.',
  '- Corrispondenza di ogni parola chiave: "esatta", "frase" o "generica". Parole chiave senza simboli (niente ! @ % , * ; ? e parentesi).',
  '- Negative: le ricerche da escludere (lavoro, gratis, fai da te, corsi… solo se non sono un servizio offerto).',
  '- Un annuncio adattabile per gruppo: 15 titoli di massimo '+LIMITS.headline+' caratteri, 4 descrizioni di massimo '+LIMITS.description+', due percorsi di massimo '+LIMITS.path+' caratteri senza spazi. Contali, spazi compresi: un testo più lungo viene scartato.',
  '- Almeno 3 titoli per gruppo contengono la parola chiave principale del gruppo. Titoli tutti diversi tra loro.',
  '- Regole di Google: niente punto esclamativo nei titoli, al massimo uno per descrizione, niente parole tutte in maiuscolo, niente emoji o simboli, niente numeri di telefono nel testo.',
  '- Usa solo i fatti scritti qui. Non inventare prezzi, sconti, promozioni, «gratis», garanzie, premi, recensioni, anni di attività, primati («il migliore», «numero 1», «leader») o risultati.',
  '- Non indicare volumi di ricerca, costi per clic o budget: il budget lo divide RADIX.',
  '- Estensioni: fino a 6 sitelink (testo massimo '+LIMITS.sitelink+' caratteri, due righe massimo '+LIMITS.sitelinkLine+', "pagina" è un percorso del sito come /contatti), fino a 8 callout di massimo '+LIMITS.callout+' caratteri, uno snippet strutturato con intestazione tra '+SNIPPET_HEADERS.map(h=>'"'+h[0]+'"').join(', ')+' e da 3 a 10 valori di massimo '+LIMITS.snippetValue+' caratteri.');
 const shape={tipo:'servizio | intento | zona',nome:'2-5 parole',logica:'una frase: perché questa struttura',
  campagne:[{nome:'nome della campagna',gruppi:[{nome:'nome del gruppo',parole_chiave:[{testo:'parola chiave',corrispondenza:'esatta | frase | generica'}],annuncio:{titoli:['15 titoli, max 30 caratteri'],descrizioni:['4 descrizioni, max 90 caratteri'],percorso1:'max 15',percorso2:'max 15'}}],negative:[{testo:'…',corrispondenza:'frase'}]}],
  negative_account:[{testo:'…',corrispondenza:'generica'}],sitelink:[{testo:'max 25',riga1:'max 35',riga2:'max 35',pagina:'/percorso'}],callout:['max 25'],snippet:{intestazione:'Servizi',valori:['max 25']}};
 L.push('Rispondi solo con JSON valido, senza testo prima o dopo:\n{"strutture":['+JSON.stringify(shape)+',{…},{…}]}');
 return L.join('\n')}

// ---- parsing: everything is validated, what is invalid is dropped and counted ----
function parseJson(text){const raw=String(text||'').replace(/\r/g,''),f=/```(?:json)?\s*\n?([\s\S]*?)```/i.exec(raw),body=f?f[1]:raw,s=body.search(/[[{]/),e=Math.max(body.lastIndexOf('}'),body.lastIndexOf(']'));
 if(s<0||e<=s)return null;const t=body.slice(s,e+1);for(const x of [t,t.replace(/,\s*([}\]])/g,'$1').replace(/[“”]/g,'"')]){try{return JSON.parse(x)}catch(err){}}return null}
const isObj=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
function pick(o,...keys){if(!isObj(o))return undefined;const ks=Object.keys(o);for(const k of keys){const hit=ks.find(x=>norm(x).replace(/ /g,'_')===k);if(hit!==undefined)return o[hit]}return undefined}
const arr=v=>Array.isArray(v)?v:typeof v==='string'?v.split('\n'):[];
const strip=s=>clean(String(s==null?'':s).replace(/^\s*(?:[-*•–·]|\d{1,2}[.)])\s+/,'').replace(/\s*\(\d{1,3}(?:\s*(?:\/\s*\d{1,3}|caratteri|car\.?))?\)\s*$/i,'')).replace(/^[«"“]+|[»"”]+$/g,'').trim();
const EMOJI=/\p{Extended_Pictographic}/u;
// Match types: «esatta», «exact», «[…]» → exact; «frase», «phrase», «"…"» → phrase; «generica», «broad» → broad.
function matchOf(v,fallback='phrase'){const x=norm(v);if(/^(?:esatt|exact|corrispondenza esatt)/.test(x))return 'exact';if(/^(?:frase|a frase|phrase|corrispondenza a frase|corrispondenza frase)/.test(x))return 'phrase';if(/^(?:generic|broad|ampi|corrispondenza generic)/.test(x))return 'broad';return MATCH[fallback]?fallback:'phrase'}
const KW_BAD=/[!@%,*^=;~`<>?\\|(){}[\]"«»“”#$]/;
// One keyword, from the AI or a line typed by the person: «parola», «"a frase"», «[esatta]». null when Google would refuse it.
function keywordOf(raw,match,fallback){let t=clean(isObj(raw)?pick(raw,'testo','text','keyword','parola','parola_chiave'):raw),m=isObj(raw)?matchOf(pick(raw,'corrispondenza','match','match_type','tipo'),fallback||'phrase'):matchOf(match,fallback||'phrase');
 if(/^\[[^\]]*\]$/.test(t)){t=t.slice(1,-1);m='exact'}else if(/^"[^"]*"$/.test(t)||/^«[^»]*»$/.test(t)||/^“[^”]*”$/.test(t)){t=t.slice(1,-1);m='phrase'}
 t=clean(t.replace(/(^|\s)\+(?=\S)/g,'$1')).toLowerCase();
 if(!t||chars(t)>LIMITS.keyword||t.split(' ').length>LIMITS.keywordWords||KW_BAD.test(t)||EMOJI.test(t)||!/\p{L}|\d/u.test(t))return null;
 return {text:t,match:m}}
const kwKey=k=>k.match+'|'+norm(k.text);
// A list of keywords: invalid ones dropped, exact duplicates (same text and match) kept once.
function keywordList(list,max,fallback,drop){const out=[],seen=new Set();for(const x of arr(list)){const k=keywordOf(x,undefined,fallback);if(!k){if(clean(isObj(x)?JSON.stringify(x):x))drop();continue}if(seen.has(kwKey(k))){drop();continue}seen.add(kwKey(k));if(out.length<max)out.push(k);else drop()}return out}
// Texts with a limit: over the limit or empty → dropped (never cut); duplicates kept once.
function textList(list,max,limit,drop){const out=[],seen=new Set();for(const x of arr(list)){const t=strip(isObj(x)?pick(x,'testo','text'):x);if(!t)continue;if(chars(t)>limit||seen.has(norm(t))){drop();continue}seen.add(norm(t));if(out.length<max)out.push(t);else drop()}return out}
const pathOf=v=>{const t=strip(v).replace(/^\/+|\/+$/g,'').replace(/\s+/g,'-');return t&&chars(t)<=LIMITS.path&&!/[/?#]/.test(t)?t:''};
// A sitelink's page: a path of the landing's site, or a full URL of the same site. '' when it points elsewhere.
function pageUrl(v,land){const s=clean(v);if(!s||!land||!land.origin)return '';
 if(/^https?:\/\//i.test(s)){let u=null;try{u=new URL(s.replace(/^http:/i,'https:'))}catch(e){}return u&&u.hostname.toLowerCase().replace(/^www\./,'')===land.host?u.origin+u.pathname+u.search:''}
 if(!/^\/?[a-z0-9\-._~/%]*$/i.test(s))return '';return land.origin+'/'+s.replace(/^\/+/,'')}
const headerOf=v=>{const x=norm(v);const h=SNIPPET_HEADERS.find(([it,en])=>norm(it)===x||norm(en)===x);return h?h[0]:''};
function uniqueName(name,taken,fallback){let base=clean(name).replace(/[\t\r\n]/g,' ').slice(0,LIMITS.name)||fallback,n=base,i=2;while(taken.has(norm(n)))n=base.slice(0,LIMITS.name-4)+' '+i++;taken.add(norm(n));return n}
function structureOf(x,n,ctx,drop){if(!isObj(x))return null;const land=ctx.land;
 const kindRaw=norm(pick(x,'tipo','type','kind')),kind=KINDS.find(k=>kindRaw.startsWith(k.id.slice(0,5)))?KINDS.find(k=>kindRaw.startsWith(k.id.slice(0,5))).id:KINDS[(n-1)%3].id;
 const s={id:'s'+n,kind,name:clean(pick(x,'nome','name')).replace(/[«»"]/g,'').slice(0,60)||kindOf(kind).label,logic:clean(pick(x,'logica','logic','perche','idea')).slice(0,240),campaigns:[],negatives:[],sitelinks:[],callouts:[],snippet:null,shares:null};
 const cNames=new Set();
 for(const c of arr(pick(x,'campagne','campaigns'))){if(!isObj(c)){drop('campaigns');continue}if(s.campaigns.length>=LIMITS.campaigns){drop('campaigns');continue}
  const camp={name:'',groups:[],negatives:keywordList(pick(c,'negative','negativi','negative_keywords','parole_negative'),LIMITS.negatives,'phrase',()=>drop('negatives'))},gNames=new Set();
  for(const g of arr(pick(c,'gruppi','gruppi_di_annunci','ad_groups','adgroups','groups'))){if(!isObj(g)){drop('groups');continue}if(camp.groups.length>=LIMITS.groups){drop('groups');continue}
   const kws=keywordList(pick(g,'parole_chiave','keywords','parole'),LIMITS.keywords,'phrase',()=>drop('keywords'));if(!kws.length){drop('groups');continue}
   const ad=pick(g,'annuncio','rsa','ad','annuncio_adattabile')||{},o=isObj(ad)?ad:{};
   camp.groups.push({name:uniqueName(pick(g,'nome','name'),gNames,'Gruppo '+(camp.groups.length+1)),keywords:kws,
    ad:{headlines:textList(pick(o,'titoli','headlines'),LIMITS.headlines,LIMITS.headline,()=>drop('headlines')),descriptions:textList(pick(o,'descrizioni','descriptions'),LIMITS.descriptions,LIMITS.description,()=>drop('descriptions')),
     path1:pathOf(pick(o,'percorso1','path1','percorso_1')),path2:pathOf(pick(o,'percorso2','path2','percorso_2'))}})}
  if(!camp.groups.length){drop('campaigns');continue}
  camp.name=uniqueName(pick(c,'nome','name'),cNames,'Campagna '+(s.campaigns.length+1));s.campaigns.push(camp)}
 if(!s.campaigns.length)return null;
 s.negatives=keywordList(pick(x,'negative_account','negative_comuni','negative','account_negatives'),LIMITS.negatives,'broad',()=>drop('negatives'));
 const seenSl=new Set();
 for(const l of arr(pick(x,'sitelink','sitelinks'))){if(!isObj(l)){drop('sitelinks');continue}const text=strip(pick(l,'testo','text','titolo')),url=pageUrl(pick(l,'pagina','url','link','page'),land);
  if(!text||chars(text)>LIMITS.sitelink||!url||seenSl.has(norm(text))||s.sitelinks.length>=LIMITS.sitelinks){drop('sitelinks');continue}
  let l1=strip(pick(l,'riga1','descrizione1','description1','riga_1')),l2=strip(pick(l,'riga2','descrizione2','description2','riga_2'));
  if(!l1||!l2||chars(l1)>LIMITS.sitelinkLine||chars(l2)>LIMITS.sitelinkLine){if(l1||l2)drop('sitelinkLines');l1=l2=''}// both lines or none
  seenSl.add(norm(text));s.sitelinks.push({text,line1:l1,line2:l2,url})}
 s.callouts=textList(pick(x,'callout','callouts','frasi'),LIMITS.callouts,LIMITS.callout,()=>drop('callouts'));
 const sn=pick(x,'snippet','snippets','snippet_strutturato');const sx=Array.isArray(sn)?sn[0]:sn;
 if(isObj(sx)){const header=headerOf(pick(sx,'intestazione','header','titolo')),values=textList(pick(sx,'valori','values'),LIMITS.snippetMax,LIMITS.snippetValue,()=>drop('snippetValues'));
  if(header&&values.length>=LIMITS.snippetMin)s.snippet={header,values};else drop('snippets')}
 return s}
const DROP_KEYS=['structures','campaigns','groups','keywords','negatives','headlines','descriptions','sitelinks','sitelinkLines','callouts','snippetValues','snippets'];
// The reply → {structures (up to 3), dropped:{kind:count}}; structures [] when nothing usable is there.
// ctx: {answers} (the landing gives the sitelinks their site).
function parseStructures(text,ctx={}){const a=normalize(ctx.answers),dropped={};DROP_KEYS.forEach(k=>dropped[k]=0);const drop=k=>{dropped[k]++};
 const d=parseJson(text),list=Array.isArray(d)?d:isObj(d)?pick(d,'strutture','structures','proposte','account')||[]:[],out=[],land=landingUrl(a.landing);
 for(const x of Array.isArray(list)?list:[]){if(out.length>=COUNT){drop('structures');continue}const s=structureOf(x,out.length+1,{land:land.error?null:land},drop);if(s)out.push(s);else drop('structures')}
 return {structures:out,dropped}}
const droppedTotal=d=>DROP_KEYS.reduce((a,k)=>a+((d&&d[k])||0),0);
const DROP_LABEL={structures:['struttura','strutture'],campaigns:['campagna','campagne'],groups:['gruppo','gruppi'],keywords:['parola chiave','parole chiave'],negatives:['negativa','negative'],headlines:['titolo','titoli'],descriptions:['descrizione','descrizioni'],sitelinks:['sitelink','sitelink'],sitelinkLines:['riga di sitelink','righe di sitelink'],callouts:['callout','callout'],snippetValues:['valore di snippet','valori di snippet'],snippets:['snippet','snippet']};
const plural=(n,one,many)=>n+' '+(n===1?one:many);
const droppedText=d=>DROP_KEYS.filter(k=>d&&d[k]).map(k=>plural(d[k],...DROP_LABEL[k])).join(', ');

// ---- the checks (live, on every edit) ----
// Claims an ad must not make unless the brief or the confirmed facts say so (the list of lib/ad-studio.js).
const CLAIMS=[[/\bgratis\b|\bgratuit[aoie]\b/i,'«gratis»'],[/\bgaranti(?:t[aoie]|sce|amo)\b|\bgaranzia\b/i,'garanzia'],[/\b(?:il|la|i|le|lo) miglior(?:e|i)?\b|\bmiglior[ei]? (?:di|del|della|in) /i,'«il migliore»'],
 [/\bn(?:umero|\.)\s?(?:1|uno)\b|\bleader\b|\bprimi in\b|\bprimo in\b/i,'«numero 1» o «leader»'],[/\bscont[oi]\b|\bscontat[aoie]\b|\bin offerta\b|\bpromozione\b/i,'sconto o promozione'],
 [/\bsolo oggi\b|\bultimi (?:posti|pezzi|giorni)\b|\bposti limitati\b|\btempo limitato\b|\bfino a esaurimento\b/i,'scadenza o disponibilità limitata'],
 [/\bcertificat[oaie]\b|\bpremiat[oaie]\b|\bpremio\b/i,'certificazione o premio'],[/\brecensioni\b|\bstelle\b|\bclienti soddisfatti\b/i,'recensioni o soddisfazione']];
// Acronyms that are fine in capitals.
const ACRONYMS=new Set(['IVA','SRL','SPA','SNC','SAS','DOP','IGP','DOC','DOCG','BIO','USB','LED','PDF','APP','WIFI','GPS','CAF','INPS','IMU','ASL','SPID','PEC','HACCP','UNI','ISO','CE','NCC','B2B','B2C','IT','UE','USA','TV','PC','SEO','CRM','ERP','SUV','ABS']);
const PHONE=/(?:\+39[\s.-]?)?\b(?:3\d{2}|0\d{1,3})[\s.-]?\d{3}[\s.-]?\d{3,4}\b/;
// Policy issues of one text. kind: 'headline' | 'description' | 'path' | 'sitelink' | 'callout' | 'snippet'.
function textIssues(t,kind,ctx={}){const out=[],s=String(t||''),brand=new Set((ctx.brand||[]).flatMap(b=>String(b).split(/\s+/)).map(w=>w.toUpperCase()));
 const ex=(s.match(/!/g)||[]).length;
 if(ex&&kind!=='description')out.push({level:'error',code:'esclamativo',text:'Google non accetta il «!» in '+({headline:'un titolo',path:'un percorso',sitelink:'un sitelink',callout:'un callout',snippet:'uno snippet'}[kind]||'questo testo')+'.'});
 else if(ex>1)out.push({level:'error',code:'esclamativi',text:'Al massimo un «!» per descrizione: qui sono '+ex+'.'});
 if(/([!?])\1|\?!|!\?|\.{4,}|,,|([€$%&*+=#@])\2/.test(s))out.push({level:'error',code:'punteggiatura',text:'Punteggiatura o simboli ripetuti: Google li rifiuta.'});
 const caps=(s.match(/[\p{L}]{4,}/gu)||[]).filter(w=>w===w.toUpperCase()&&w!==w.toLowerCase()&&!ACRONYMS.has(w)&&!brand.has(w));
 if(caps.length)out.push({level:'error',code:'maiuscole',text:'Parole tutte in maiuscolo («'+caps.slice(0,3).join('», «')+'»): Google le rifiuta.'});
 if(EMOJI.test(s)||/[★☆✓✔✗✘►▶◄•→←↑↓♥❤©®™]/.test(s))out.push({level:'error',code:'simboli',text:'Emoji o simboli non accettati negli annunci.'});
 if(PHONE.test(s))out.push({level:'error',code:'telefono',text:'Numero di telefono nel testo: Google lo rifiuta, usa l’asset di chiamata.'});
 const input=String(ctx.input||'');
 for(const [re,label] of CLAIMS)if(re.test(s)&&!re.test(input))out.push({level:'warn',code:'promessa',text:'Promessa da verificare: '+label+'. Nel brief non c’è: toglila o confermala.'});
 const C=CC();
 if(C){if(!out.some(i=>i.code==='promessa')&&typeof C.superlatives==='function')C.superlatives(s,input).slice(0,1).forEach(x=>out.push({level:'warn',code:'superlativo',text:'Superlativo senza un dato che lo provi: «'+x.word+'».'}));
  if(typeof C.unverifiedNumbers==='function')C.unverifiedNumbers(s,input).slice(0,2).forEach(n=>out.push({level:'warn',code:'numero',text:'Il numero «'+n+'» non è nel brief né nei fatti: verificalo o toglilo.'}))}
 return out}
const STOP=new Set('a ad al alla alle ai agli da dal dalla dei del della delle di e ed il in la le lo gli i per con su tra fra un una uno o vicino me mio mia'.split(' '));
const sig=t=>norm(t).split(' ').filter(w=>w.length>2&&!STOP.has(w));
// A negative blocks a keyword when its words are all in it (broad), are a run of it (phrase), or are it (exact).
function blocks(neg,kw){const n=norm(neg.text),k=norm(kw.text);if(!n||!k)return false;
 if(neg.match==='exact')return n===k;if(neg.match==='phrase')return (' '+k+' ').includes(' '+n+' ');const kw2=new Set(k.split(' '));return n.split(' ').every(w=>kw2.has(w))}
// Every issue of a structure: [{level:'error'|'warn', field, where, text}]. field ids: c<i>.g<j>.h<k> (headline), .d<k>, .p1/.p2,
// .kw, c<i>.neg, neg, sl<k>, co<k>, sn, landing, budget, c<i>.share. ctx: {answers, input, projectHost}.
function checks(s,ctx={}){const a=normalize(ctx.answers),input=ctx.input==null?inputText(a,''):ctx.input,out=[],add=(level,field,where,text)=>out.push({level,field,where,text});
 const opts={brand:a.brand,input};
 const land=landingUrl(a.landing);if(land.error)add('error','landing','Pagina di destinazione',land.error);
 else if(ctx.projectHost&&land.host!==String(ctx.projectHost).toLowerCase().replace(/^www\./,''))add('warn','landing','Pagina di destinazione','La pagina è su '+land.host+', il sito del progetto è '+ctx.projectHost+': controlla che sia la pagina giusta.');
 if(!a.budget)add('error','budget','Budget','Scrivi il budget giornaliero in euro.');
 const split=a.budget?budgetOf(s,a.budget):[];split.forEach((b,i)=>{if(a.budget&&!(b.daily>0))add('error','c'+i+'.share','Campagna «'+b.name+'»','Budget a zero: dai una quota a questa campagna o toglila.')});
 const allKw=[];
 s.campaigns.forEach((c,i)=>{const cw='Campagna «'+c.name+'»';if(!clean(c.name))add('error','c'+i+'.name',cw,'La campagna non ha un nome.');
  if(!c.groups.length)add('error','c'+i,cw,'La campagna non ha gruppi di annunci.');
  const seen=new Map();
  c.groups.forEach((g,j)=>{const gw=cw+' › gruppo «'+g.name+'»',f='c'+i+'.g'+j,ad=g.ad||{headlines:[],descriptions:[]};
   if(!g.keywords.length)add('error',f+'.kw',gw,'Il gruppo non ha parole chiave.');
   const inGroup=new Set();
   g.keywords.forEach(k=>{const key=kwKey(k);if(inGroup.has(key))add('error',f+'.kw',gw,'Parola chiave doppia nello stesso gruppo: «'+k.text+'».');inGroup.add(key);
    const prev=seen.get(norm(k.text));if(prev!==undefined&&prev!==j)add('warn',f+'.kw',gw,'«'+k.text+'» è anche nel gruppo «'+c.groups[prev].name+'»: i due gruppi si fanno concorrenza.');else seen.set(norm(k.text),j);
    allKw.push({k,i,j});
    if(!keywordOf(k.text,k.match,k.match))add('error',f+'.kw',gw,'Parola chiave non valida per Google: «'+k.text+'» (massimo '+LIMITS.keyword+' caratteri e '+LIMITS.keywordWords+' parole, senza simboli).')});
   const H=filled(ad.headlines),D=filled(ad.descriptions),HP=ad.headlines||[],DP=ad.descriptions||[];
   if(H.length<LIMITS.headlinesMin)add('error',f+'.h',gw,'Servono almeno '+LIMITS.headlinesMin+' titoli: ce ne sono '+H.length+'.');
   else if(H.length<LIMITS.headlinesGood)add('warn',f+'.h',gw,'Solo '+H.length+' titoli su '+LIMITS.headlines+': con più titoli Google prova più combinazioni.');
   if(D.length<LIMITS.descriptionsMin)add('error',f+'.d',gw,'Servono almeno '+LIMITS.descriptionsMin+' descrizioni: ce ne sono '+D.length+'.');
   const hs=new Map();HP.forEach((t,k)=>{t=clean(t);if(!t)return;const fk=f+'.h'+k,w=gw+' › titolo '+(k+1);if(chars(t)>LIMITS.headline)add('error',fk,w,'Titolo di '+chars(t)+' caratteri su '+LIMITS.headline+'.');
    if(hs.has(norm(t)))add('error',fk,w,'Titolo uguale al titolo '+(hs.get(norm(t))+1)+': Google non accetta titoli doppi.');else hs.set(norm(t),k);
    textIssues(t,'headline',opts).forEach(x=>add(x.level,fk,w,x.text))});
   const ds=new Set();DP.forEach((t,k)=>{t=clean(t);if(!t)return;const fk=f+'.d'+k,w=gw+' › descrizione '+(k+1);if(chars(t)>LIMITS.description)add('error',fk,w,'Descrizione di '+chars(t)+' caratteri su '+LIMITS.description+'.');
    if(ds.has(norm(t)))add('error',fk,w,'Descrizione doppia.');ds.add(norm(t));textIssues(t,'description',opts).forEach(x=>add(x.level,fk,w,x.text))});
   ['path1','path2'].forEach((p,k)=>{const t=ad[p]||'';if(!t)return;const fk=f+'.p'+(k+1),w=gw+' › percorso '+(k+1);if(chars(t)>LIMITS.path)add('error',fk,w,'Percorso di '+chars(t)+' caratteri su '+LIMITS.path+'.');if(/\s|\//.test(t))add('error',fk,w,'Il percorso non può avere spazi o «/».');textIssues(t,'path',opts).forEach(x=>add(x.level,fk,w,x.text))});
   if(ad.path2&&!ad.path1)add('error',f+'.p1',gw,'C’è il percorso 2 senza il percorso 1.');
   // the keyword in the headlines: at least one headline carries the words of one of the group's keywords
   const hw=H.map(t=>new Set(sig(t)));if(H.length&&g.keywords.length&&!g.keywords.some(k=>{const w=sig(k.text);return w.length&&hw.some(h=>w.every(x=>h.has(x)))}))add('warn',f+'.h',gw,'Nessun titolo contiene una parola chiave del gruppo: aggiungine almeno uno.')});
  // negatives that block the campaign's own keywords
  const negs=c.negatives.map(n=>({n,f:'c'+i+'.neg'})).concat(s.negatives.map(n=>({n,f:'neg'})));
  negs.forEach(({n,f})=>{const hit=c.groups.flatMap(g=>g.keywords).find(k=>blocks(n,k));if(hit)add('warn',f,cw,'La negativa «'+n.text+'» blocca la parola chiave «'+hit.text+'».')});
  const nk=new Set();c.negatives.forEach(n=>{if(nk.has(kwKey(n)))add('warn','c'+i+'.neg',cw,'Negativa doppia: «'+n.text+'».');nk.add(kwKey(n))})});
 // the same keyword in two campaigns
 const byText=new Map();allKw.forEach(x=>{const t=norm(x.k.text);const p=byText.get(t);if(p&&p.i!==x.i)add('warn','c'+x.i+'.g'+x.j+'.kw','Campagna «'+s.campaigns[x.i].name+'»','«'+x.k.text+'» è anche nella campagna «'+s.campaigns[p.i].name+'»: le due campagne si fanno concorrenza.');else if(!p)byText.set(t,x)});
 // assets
 if(s.sitelinks.length<LIMITS.sitelinksMin)add('warn','sl','Sitelink','Servono almeno '+LIMITS.sitelinksMin+' sitelink perché Google li mostri.');
 s.sitelinks.forEach((l,k)=>{const f='sl'+k,w='Sitelink '+(k+1);if(!clean(l.text))add('error',f,w,'Sitelink senza testo.');if(chars(l.text)>LIMITS.sitelink)add('error',f,w,'Testo di '+chars(l.text)+' caratteri su '+LIMITS.sitelink+'.');
  [l.line1,l.line2].forEach((t,m)=>{if(chars(t)>LIMITS.sitelinkLine)add('error',f,w,'Riga '+(m+1)+' di '+chars(t)+' caratteri su '+LIMITS.sitelinkLine+'.')});if(!!clean(l.line1)!==!!clean(l.line2))add('error',f,w,'Le righe di descrizione vanno scritte tutte e due, o nessuna.');
  if(!l.url||(!land.error&&landingUrl(l.url).host!==land.host))add('error',f,w,'Il link del sitelink deve essere una pagina dello stesso sito della pagina di destinazione.');
  [l.text,l.line1,l.line2].forEach(t=>textIssues(t,'sitelink',opts).forEach(x=>add(x.level,f,w,x.text)))});
 if(s.callouts.length<LIMITS.calloutsMin)add('warn','co','Callout','Servono almeno '+LIMITS.calloutsMin+' callout perché Google li mostri.');
 s.callouts.forEach((t,k)=>{const f='co'+k,w='Callout '+(k+1);if(chars(t)>LIMITS.callout)add('error',f,w,'Callout di '+chars(t)+' caratteri su '+LIMITS.callout+'.');textIssues(t,'callout',opts).forEach(x=>add(x.level,f,w,x.text))});
 if(s.snippet){const v=s.snippet.values||[];if(!headerOf(s.snippet.header))add('error','sn','Snippet','Intestazione dello snippet non tra quelle di Google.');
  if(v.length<LIMITS.snippetMin)add('error','sn','Snippet','Servono almeno '+LIMITS.snippetMin+' valori.');v.forEach((t,k)=>{if(chars(t)>LIMITS.snippetValue)add('error','sn','Snippet','Valore '+(k+1)+' di '+chars(t)+' caratteri su '+LIMITS.snippetValue+'.');textIssues(t,'snippet',opts).forEach(x=>add(x.level,'sn','Snippet',x.text))})}
 return out}
const errorsOf=list=>list.filter(i=>i.level==='error');
// Field id → 'error' | 'warn' (the worst), for the marks next to each field.
function fieldLevels(list){const m={};for(const i of list){if(m[i.field]!=='error')m[i.field]=i.level}return m}
const counts=s=>{const g=s.campaigns.flatMap(c=>c.groups);return {campaigns:s.campaigns.length,groups:g.length,keywords:g.reduce((a,x)=>a+x.keywords.length,0),negatives:s.negatives.length+s.campaigns.reduce((a,c)=>a+c.negatives.length,0),headlines:g.reduce((a,x)=>a+filled(x.ad.headlines).length,0),sitelinks:s.sitelinks.length,callouts:s.callouts.length}};

// ---- the keyword lines the person edits: «parola», «"a frase"», «[esatta]» (the notation of Google Ads) ----
const keywordLine=k=>k.match==='exact'?'['+k.text+']':k.match==='phrase'?'"'+k.text+'"':k.text;
// Lines → {keywords, invalid:[line]} (a bare line is broad match, as in Google Ads).
function parseKeywordLines(text){const keywords=[],invalid=[],seen=new Set();for(const line of String(text||'').split('\n')){const t=clean(line);if(!t)continue;const k=keywordOf(t,'broad','broad');if(!k){invalid.push(t);continue}if(seen.has(kwKey(k)))continue;seen.add(kwKey(k));keywords.push(k)}return {keywords,invalid}}

// ---- Google Ads Editor files ----
// Editor's own export format, which its import reads back: UTF-16 LE with BOM, one row per line, tab between cells.
// A cell never holds a tab or a line break (they become a space); a cell with a quote is quoted, its quotes doubled.
const tsvCell=v=>{const s=String(v==null?'':v).replace(/[\t\r\n]+/g,' ');return /"/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
const tsv=rows=>rows.map(r=>r.map(tsvCell).join('\t')).join('\r\n')+'\r\n';
function utf16le(text){const s=String(text),b=new Uint8Array(2+s.length*2);b[0]=0xFF;b[1]=0xFE;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);b[2+i*2]=c&255;b[3+i*2]=c>>8}return b}
function fromUtf16le(bytes){const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let s='';for(let i=b[0]===0xFF&&b[1]===0xFE?2:0;i+1<b.length;i+=2)s+=String.fromCharCode(b[i]|(b[i+1]<<8));return s}
const HEAD=Object.freeze({
 campaigns:['Campaign','Campaign Type','Networks','Budget','Budget type','Bid Strategy Type','Campaign Status','Languages'],
 locations:['Campaign','Location'],
 adGroups:['Campaign','Ad group'],
 keywords:['Campaign','Ad group','Keyword','Criterion Type'],
 negatives:['Campaign','Ad group','Keyword','Criterion Type'],
 ads:['Campaign','Ad group','Ad type',...Array.from({length:15},(_,i)=>'Headline '+(i+1)),...Array.from({length:4},(_,i)=>'Description '+(i+1)),'Path 1','Path 2','Final URL'],
 sitelinks:['Campaign','Link text','Description line 1','Description line 2','Final URL'],
 callouts:['Campaign','Callout text'],
 snippets:['Campaign','Header','Values']});
const FILES=Object.freeze([['campaigns','01-campagne.csv','Campagne (in pausa)'],['locations','02-localita.csv','Località'],['adGroups','03-gruppi.csv','Gruppi di annunci'],['keywords','04-parole-chiave.csv','Parole chiave'],
 ['negatives','05-negative.csv','Parole chiave negative'],['ads','06-annunci-rsa.csv','Annunci adattabili della rete di ricerca'],['sitelinks','07-sitelink.csv','Sitelink'],['callouts','08-callout.csv','Callout'],['snippets','09-snippet.csv','Snippet strutturati']]);
const money2=v=>(Math.round((Number(v)||0)*100)/100).toFixed(2);
// The rows of every file, header first. Account-level negatives go to every campaign (campaign level, Ad group empty).
function editorRows(s,answers){const a=normalize(answers),g=goalOf(a.goal),land=landingUrl(a.landing),url=land.url||'',split=budgetOf(s,a.budget||0),R={};
 for(const k of Object.keys(HEAD))R[k]=[HEAD[k].slice()];
 s.campaigns.forEach((c,i)=>{R.campaigns.push([c.name,'Search','Google search',money2(split[i]&&split[i].daily),'Daily',g.bid,'Paused','it']);
  a.cities.forEach(city=>R.locations.push([c.name,city+', Italy']));
  c.groups.forEach(gr=>{R.adGroups.push([c.name,gr.name]);gr.keywords.forEach(k=>R.keywords.push([c.name,gr.name,k.text,MATCH[k.match].editor]));
   const H=filled(gr.ad.headlines),D=filled(gr.ad.descriptions);R.ads.push([c.name,gr.name,'Responsive search ad',...Array.from({length:15},(_,k)=>H[k]||''),...Array.from({length:4},(_,k)=>D[k]||''),gr.ad.path1||'',gr.ad.path2||'',url])});
  const negs=new Map();c.negatives.concat(s.negatives).forEach(n=>{if(!negs.has(kwKey(n)))negs.set(kwKey(n),n)});
  negs.forEach(n=>R.negatives.push([c.name,'',n.text,'Negative '+MATCH[n.match].editor]));
  s.sitelinks.forEach(l=>R.sitelinks.push([c.name,l.text,l.line1||'',l.line2||'',l.url]));
  s.callouts.forEach(t=>R.callouts.push([c.name,t]));
  if(s.snippet)R.snippets.push([c.name,(SNIPPET_HEADERS.find(h=>h[0]===s.snippet.header)||[])[1]||s.snippet.header,s.snippet.values.join(';')])});
 return R}
function readme(s,answers,{brand,date}={}){const a=normalize(answers),g=goalOf(a.goal),split=budgetOf(s,a.budget||0),day=(date instanceof Date?date:new Date()).toISOString().slice(0,10),R=editorRows(s,answers),L=[];
 L.push('CAMPAGNE GOOGLE ADS SEARCH · '+clean(brand&&brand.name||''),'Struttura: '+s.name+' ('+kindOf(s.kind).label.toLowerCase()+') · preparata con RADIX il '+day.split('-').reverse().join('/'),'');
 L.push('COME IMPORTARE IN GOOGLE ADS EDITOR',
  '1. Apri Google Ads Editor e scarica l’account del cliente (le campagne restano nel suo account).',
  '2. Account › Importa › Da file: importa i file in quest’ordine, uno alla volta, e guarda l’anteprima prima di confermare:');
 FILES.forEach(([k,name,label])=>{const n=R[k].length-1;if(n)L.push('   - '+name+': '+label+' ('+n+(n===1?' riga':' righe')+')')});
 L.push('3. Controlla le modifiche in Editor, poi premi «Pubblica». Le campagne arrivano IN PAUSA: le attivi tu quando è tutto pronto.','',
  'FORMATO DEI FILE','I file sono nello stesso formato degli export di Google Ads Editor: testo UTF-16 LE con BOM, colonne separate da tabulazione, estensione .csv, intestazioni di colonna in inglese come le usa Editor. Excel li apre con un doppio clic.','',
  'DA FARE IN EDITOR PRIMA DI PUBBLICARE');
 if(a.cities.length)L.push('- Località: Editor cerca le città per nome («'+a.cities[0]+', Italy»). Se una non viene riconosciuta, sceglila dall’elenco delle località.');
 if(a.radiusKm&&a.center)L.push('- Raggio: imposta in Editor il raggio di '+a.radiusKm+' km intorno a «'+a.center+'» (Località › Raggio): non è nei file.');
 L.push('- Strategia di offerta: '+g.bidLabel+'.');
 if(g.bid==='Maximize conversions')L.push('- Conversioni: prima di attivare le campagne crea nell’account la conversione ('+(g.id==='chiamate'?'chiamate dagli annunci e dal sito':'invio del modulo')+') e controlla che registri.');
 L.push('- Snippet: se Editor non riconosce l’intestazione, sceglila dall’elenco («'+(s.snippet?s.snippet.header:'Servizi')+'»).','');
 L.push('BUDGET (diviso da RADIX solo con il tuo budget giornaliero di '+euro(a.budget)+')');split.forEach(b=>L.push('- '+b.name+': '+euro(b.daily)+' al giorno ('+String(b.share).replace('.',',')+'%), al massimo '+euro(b.monthly)+' al mese'));
 L.push('Google può spendere fino al doppio del budget in un giorno, ma in un mese non più di 30,4 volte il budget giornaliero.','',
  'VOLUMI DI RICERCA E COSTO PER CLIC','Volume di ricerca: '+NA+'. CPC: '+NA+'. RADIX non li stima: li vedi in Keyword Planner nell’account del cliente.','');
 return L.join('\n')+'\n'}
// [{name, data}] for the zip: the Editor files that have rows, LEGGIMI.txt, and (when given) the summary PDF and HTML.
function editorFiles(s,answers,opts={}){const R=editorRows(s,answers),out=[];
 FILES.forEach(([k,name])=>{if(R[k].length>1)out.push({name,data:utf16le(tsv(R[k]))})});
 out.push({name:'LEGGIMI.txt',data:'﻿'+readme(s,answers,opts)});
 if(opts.pdf)out.push({name:'riepilogo-cliente.pdf',data:opts.pdf});if(opts.html)out.push({name:'riepilogo-cliente.html',data:opts.html});
 return out}
const zipName=(s,brand)=>'google-ads-'+(slug(brand&&brand.name)||'campagne')+'-'+(s&&s.kind||'struttura')+'.zip';
const fileBase=(s,brand)=>'google-ads-'+(slug(brand&&brand.name)||'campagne')+'-riepilogo';

// ---- the summary for the client: A4 PDF (lib/print-studio.js) and one HTML file ----
function brandFor(profile,projectName){const P=PS();return P?P.brandOf(profile,projectName):{name:projectName||'',palette:{primary:'#4338CA',dark:'#1C1C1E',light:'#FFFFFF',secondary:'#6B7280',accent:'#4338CA'},logo:null}}
const W=210,H=297,MG=16,CW=W-2*MG,SUB='#55516A';
const mixHex=(a,b,t)=>{const x=[1,3,5].map(i=>parseInt(a.slice(i,i+2),16)),y=[1,3,5].map(i=>parseInt(b.slice(i,i+2),16));return '#'+x.map((v,i)=>Math.round(v*t+y[i]*(1-t)).toString(16).padStart(2,'0')).join('').toUpperCase()};
function summaryLines(s,answers){const a=normalize(answers),g=goalOf(a.goal),c=counts(s),land=landingUrl(a.landing);
 return [['Obiettivo',g.label],['Zona',[a.cities.join(', '),a.radiusKm&&a.center?a.radiusKm+' km da '+a.center:''].filter(Boolean).join(' · ')||'—'],['Budget',a.budget?euro(a.budget)+' al giorno · al massimo '+euro(monthlyCap(a.budget))+' al mese':'—'],
  ['Pagina di destinazione',land.url||'—'],['Struttura',s.name+' · '+kindOf(s.kind).label.toLowerCase()],['In numeri',c.campaigns+' campagne, '+c.groups+' gruppi, '+c.keywords+' parole chiave, '+c.negatives+' negative'],['Offerta',g.bidLabel]]}
function layoutSummary(s,answers,brand,{date,issues}={}){const P=PS(),a=normalize(answers),b=brand||brandFor(null,''),pal=b.palette,when=(date instanceof Date?date:new Date()).toISOString().slice(0,10).split('-').reverse().join('/');
 const safe=x=>Array.from(String(x==null?'':x)).map(ch=>P.winAnsi(ch)===63&&ch!=='?'?(/[←-⇿]/.test(ch)?'-':''):ch).join('');
 const tw=(x,size,bold)=>P.ptToMm(P.textWidth(safe(x),size,bold)),lead=(size,f=1.38)=>P.ptToMm(size*f);
 const ink=P.ink('#FFFFFF',pal,pal.dark,'#1C1C1E'),head=P.ink(pal.primary,pal,'#FFFFFF',pal.light),tile=mixHex(pal.primary,'#FFFFFF',.07),line='#D9D6E3';
 const pages=[];let pg=null,y=0;const TOP=34,BOTTOM=H-20;
 const T=(x0,xx,yy,size,fill,bold,align)=>{const t=safe(x0);if(!t)return;const w=tw(t,size,bold);pg.items.push({t:'text',x:align==='right'?xx-w:xx,y:yy,s:t,size,bold:!!bold,fill})};
 const Rc=(x,yy,w,h,fill)=>pg.items.push({t:'rect',x,y:yy,w,h,fill});
 const Ln=(x1,y1,x2,y2,stroke,width=.5)=>pg.items.push({t:'line',x1,y1,x2,y2,stroke,width});
 const fit=(x0,size,w,bold)=>{let t=safe(x0);if(tw(t,size,bold)<=w)return t;while(t.length>1&&tw(t+'…',size,bold)>w)t=t.slice(0,-1);return t.trimEnd()+'…'};
 function newPage(){pg={w:W,h:H,items:[],label:'Pagina '+(pages.length+1),folds:[]};pages.push(pg);const vb=b.logo?P.viewBox(b.logo):null;
  if(vb){const h=10,w=Math.min(46,h*vb[2]/vb[3]);pg.items.push({t:'logo',x:MG,y:9,w,h:w*vb[3]/vb[2],svg:b.logo,vb,bg:'#FFFFFF'})}else T(fit(b.name||'',12,90,true),MG,17,12,ink,true);
  T('Campagne Google Ads Search',W-MG,15,8.5,SUB,false,'right');T(fit(s.name,8.5,90),W-MG,19.5,8.5,SUB,false,'right');Rc(MG,23,CW,.8,pal.primary);y=TOP}
 const need=h=>{if(y+h>BOTTOM)newPage()};
 function para(text,size=10,fill=ink,{bold=false,gap=2.2,indent=0}={}){const ls=P.wrap(safe(text),size,CW-indent,bold).filter(x=>x!=='');for(const l of ls){need(lead(size));y+=lead(size);T(l,MG+indent,y,size,fill,bold)}y+=gap}
 function heading(text,size=13){need(16);y+=6;Rc(MG,y,2.4,5.6,pal.primary);T(fit(text,size,CW-6,true),MG+5,y+4.6,size,ink,true);y+=10}
 function table(cols,rows,{size=9}={}){const rh=lead(size,1.75),ws=cols.map(c=>c.w*CW),xs=ws.map((_,i)=>MG+ws.slice(0,i).reduce((p,q)=>p+q,0));
  const hr=()=>{need(rh+2);y+=rh-1;cols.forEach((c,i)=>T(fit(c.label,8,ws[i]-2,true),c.align==='right'?xs[i]+ws[i]-1:xs[i]+1,y-1.4,8,SUB,true,c.align));Ln(MG,y,MG+CW,y,ink,.6)};
  hr();for(const r of rows){if(y+rh>BOTTOM){newPage();hr()}y+=rh;r.forEach((v,i)=>{const c=cols[i],t=String(v==null?'':v),na=/^non disponibile/.test(t);T(fit(t,size,ws[i]-2,!!c.bold),c.align==='right'?xs[i]+ws[i]-1:xs[i]+1,y-1.6,na?7.5:size,na?SUB:ink,!!c.bold&&!na,c.align)});Ln(MG,y,MG+CW,y,line,.35)}y+=4}
 function bullets(items){items.forEach(t=>{const ls=P.wrap(safe(t),9.5,CW-7,false).filter(x=>x!=='');need(lead(9.5)*ls.length+1);ls.forEach((l,j)=>{y+=lead(9.5);if(!j)T('•',MG+1,y,9.5,pal.primary,true);T(l,MG+6,y,9.5,ink)});y+=1});y+=2}
 newPage();Rc(MG,y-4,CW,30,pal.primary);T(fit('Proposta di campagne Google Ads',20,CW-12,true),MG+6,y+7,20,head,true);T(fit((b.name?b.name+' · ':'')+s.name,10,CW-12),MG+6,y+17,10,head);y+=32;
 if(s.logic)para(s.logic,10.5,ink,{gap:3});
 summaryLines(s,a).forEach(([k,v])=>{const ls=P.wrap(safe(v),9.5,CW-48,false).filter(x=>x!=='');need(lead(9.5)*ls.length+2);ls.forEach((l,j)=>{y+=lead(9.5);if(!j)T(k,MG,y,9,SUB,true);T(l,MG+48,y,9.5,ink)});y+=1.5});y+=2;
 heading('Budget per campagna');
 table([{label:'Campagna',w:.46},{label:'Quota',w:.14,align:'right'},{label:'Al giorno',w:.2,align:'right',bold:true},{label:'Al mese, al massimo',w:.2,align:'right'}],budgetOf(s,a.budget||0).map(x=>[x.name,String(x.share).replace('.',',')+'%',euro(x.daily),euro(x.monthly)]));
 para('Diviso solo con il budget giornaliero indicato: nessuna stima. Google può spendere fino al doppio in un giorno, ma in un mese non più di 30,4 volte il budget giornaliero.',8,SUB);
 s.campaigns.forEach(c=>{heading('Campagna «'+c.name+'»');
  c.groups.forEach(g=>{need(24);y+=2;T(fit('Gruppo «'+g.name+'» · '+g.keywords.length+' parole chiave',10.5,CW,true),MG,y+4,10.5,ink,true);y+=6;
   table([{label:'Parola chiave',w:.46},{label:'Corrispondenza',w:.16},{label:'Volume di ricerca',w:.19},{label:'CPC',w:.19}],g.keywords.map(k=>[k.text,MATCH[k.match].label,NA,NA]),{size:8.5});
   const ad=g.ad;para('Titoli: '+filled(ad.headlines).join(' | '),8.5,ink,{gap:1});para('Descrizioni: '+filled(ad.descriptions).join(' | '),8.5,ink,{gap:1});
   const land=landingUrl(a.landing);if(land.host)para('URL visualizzato: '+[land.host,ad.path1,ad.path2].filter(Boolean).join('/'),8.5,SUB,{gap:3})});
  if(c.negatives.length)para('Negative della campagna: '+c.negatives.map(keywordLine).join(', '),8.5,SUB)});
 heading('Estensioni');
 if(s.negatives.length)para('Negative per tutte le campagne: '+s.negatives.map(keywordLine).join(', '),9,ink);
 if(s.sitelinks.length){table([{label:'Sitelink',w:.26},{label:'Righe',w:.44},{label:'Pagina',w:.3}],s.sitelinks.map(l=>[l.text,[l.line1,l.line2].filter(Boolean).join(' · ')||'—',l.url.replace(/^https:\/\//,'')]),{size:8.5})}
 if(s.callouts.length)para('Callout: '+s.callouts.join(' · '),9,ink);
 if(s.snippet)para('Snippet «'+s.snippet.header+'»: '+s.snippet.values.join(', '),9,ink);
 heading('Prima del lancio');
 const g=goalOf(a.goal),todo=['Le campagne si creano nell’account Google Ads del cliente, importate in pausa con Google Ads Editor.','Strategia di offerta: '+g.bidLabel+'.'];
 if(g.bid==='Maximize conversions')todo.push('Monitoraggio delle conversioni ('+(g.id==='chiamate'?'chiamate':'invii del modulo')+') da attivare e verificare prima di partire.');
 todo.push('Volumi di ricerca e costo per clic: '+NA+'. Si leggono in Keyword Planner nell’account del cliente.');
 const warn=(issues||[]).filter(i=>i.level==='warn');if(warn.length)todo.push(warn.length+' punti da rivedere nei testi prima del lancio (promesse, numeri, parole chiave doppie).');
 bullets(todo);
 pages.forEach((p,i)=>{pg=p;Ln(MG,H-13,W-MG,H-13,line,.35);T(fit('Preparato con RADIX il '+when+(b.name?' per '+b.name:''),7.5,CW-30),MG,H-8.5,7.5,SUB);T('Pagina '+(i+1)+' di '+pages.length,W-MG,H-8.5,7.5,SUB,false,'right')});
 return {title:'Campagne Google Ads · '+s.name,format:'a4-report',values:{name:b.name},brand:b,pages}}
function summaryPdf(s,answers,brand,{date,doc,issues}={}){const P=PS(),dd=doc||layoutSummary(s,answers,brand,{date,issues});return P.pdf(dd,{mode:'web',date:date||new Date(),title:dd.title+(brand&&brand.name?' · '+brand.name:''),producer:'RADIX Campagne Google Ads'})}
function summaryHtml(s,answers,brand,{date,issues}={}){const a=normalize(answers),b=brand||{name:'',palette:{primary:'#4338CA'}},acc=/^#[0-9A-F]{6}$/i.test(b.palette&&b.palette.primary||'')?b.palette.primary:'#4338CA',land=landingUrl(a.landing),when=(date instanceof Date?date:new Date()).toISOString().slice(0,10).split('-').reverse().join('/');
 const row=cells=>'<tr>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>',na='<span class="na">'+esc(NA)+'</span>';
 const ad=g=>'<div class="ad"><p class="ad-url">Sponsorizzato · '+esc([land.host||'',g.ad.path1,g.ad.path2].filter(Boolean).join('/'))+'</p><p class="ad-h">'+esc(filled(g.ad.headlines).slice(0,3).join(' | '))+'</p><p class="ad-d">'+esc(filled(g.ad.descriptions).slice(0,2).join(' '))+'</p></div>';
 const camps=s.campaigns.map(c=>'<section><h2>Campagna «'+esc(c.name)+'»</h2>'+c.groups.map(g=>'<h3>Gruppo «'+esc(g.name)+'»</h3>'+ad(g)+
  '<table><thead><tr><th>Parola chiave</th><th>Corrispondenza</th><th>Volume di ricerca</th><th>CPC</th></tr></thead><tbody>'+g.keywords.map(k=>row([esc(k.text),esc(MATCH[k.match].label),na,na])).join('')+'</tbody></table>'+
  '<details><summary>Tutti i titoli ('+filled(g.ad.headlines).length+') e le descrizioni ('+filled(g.ad.descriptions).length+')</summary><ol>'+filled(g.ad.headlines).map(t=>'<li>'+esc(t)+'</li>').join('')+'</ol><ol>'+filled(g.ad.descriptions).map(t=>'<li>'+esc(t)+'</li>').join('')+'</ol></details>').join('')+
  (c.negatives.length?'<p class="sub">Negative della campagna: '+esc(c.negatives.map(keywordLine).join(', '))+'</p>':'')+'</section>').join('');
 const g=goalOf(a.goal),warn=(issues||[]).filter(i=>i.level==='warn').length;
 return '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc('Campagne Google Ads · '+(b.name||s.name))+'</title><style>'
  +':root{--bg:#fff;--tx:#1C1B22;--sub:#55516A;--line:#E4E1EC;--tile:#F6F5FA;--acc:'+acc+'}@media (prefers-color-scheme:dark){:root{--bg:#17161C;--tx:#F2F1F6;--sub:#B9B6C8;--line:#34323F;--tile:#22212A;--acc:#A5B4FC}}'
  +'*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:880px;margin:0 auto;padding:32px 16px 48px}'
  +'header{border-top:4px solid var(--acc);padding-top:16px}h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:28px 0 8px}h3{font-size:15px;margin:18px 0 6px}.sub,.na{color:var(--sub);font-size:13px}'
  +'dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:16px 0}dt{color:var(--sub)}dd{margin:0;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:14px;margin:6px 0}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);overflow-wrap:anywhere}th{color:var(--sub);font-weight:600;font-size:12.5px}'
  +'.wrap{overflow-x:auto}.ad{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--tile);margin:8px 0}.ad p{margin:0}.ad-url{font-size:12.5px;color:var(--sub)}.ad-h{color:var(--acc);font-size:17px;margin:2px 0!important}'
  +'details{margin:6px 0 10px}summary{cursor:pointer;color:var(--sub)}footer{margin-top:32px;border-top:1px solid var(--line);padding-top:12px;color:var(--sub);font-size:12.5px}@media print{details{display:block}summary{display:none}}'
  +'</style></head><body><main><header><p class="sub">'+esc(b.name||'')+' · Campagne Google Ads Search</p><h1>'+esc(s.name)+'</h1>'+(s.logic?'<p>'+esc(s.logic)+'</p>':'')+'</header>'
  +'<dl>'+summaryLines(s,a).map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl>'
  +'<section><h2>Budget per campagna</h2><div class="wrap"><table><thead><tr><th>Campagna</th><th>Quota</th><th>Al giorno</th><th>Al mese, al massimo</th></tr></thead><tbody>'+budgetOf(s,a.budget||0).map(x=>row([esc(x.name),String(x.share).replace('.',',')+'%',esc(euro(x.daily)),esc(euro(x.monthly))])).join('')+'</tbody></table></div>'
  +'<p class="sub">Diviso solo con il budget giornaliero indicato: nessuna stima. Google può spendere fino al doppio in un giorno, ma in un mese non più di 30,4 volte il budget giornaliero.</p></section>'
  +camps
  +'<section><h2>Estensioni</h2>'+(s.negatives.length?'<p>Negative per tutte le campagne: '+esc(s.negatives.map(keywordLine).join(', '))+'</p>':'')
  +(s.sitelinks.length?'<div class="wrap"><table><thead><tr><th>Sitelink</th><th>Righe</th><th>Pagina</th></tr></thead><tbody>'+s.sitelinks.map(l=>row([esc(l.text),esc([l.line1,l.line2].filter(Boolean).join(' · ')||'—'),esc(l.url.replace(/^https:\/\//,''))])).join('')+'</tbody></table></div>':'')
  +(s.callouts.length?'<p>Callout: '+esc(s.callouts.join(' · '))+'</p>':'')+(s.snippet?'<p>Snippet «'+esc(s.snippet.header)+'»: '+esc(s.snippet.values.join(', '))+'</p>':'')+'</section>'
  +'<section><h2>Prima del lancio</h2><ul><li>Le campagne si creano nell’account Google Ads del cliente, importate in pausa con Google Ads Editor.</li><li>Strategia di offerta: '+esc(g.bidLabel)+'.</li>'
  +(g.bid==='Maximize conversions'?'<li>Monitoraggio delle conversioni da attivare e verificare prima di partire.</li>':'')+'<li>Volumi di ricerca e costo per clic: '+esc(NA)+'.</li>'+(warn?'<li>'+warn+' punti da rivedere nei testi prima del lancio.</li>':'')+'</ul></section>'
  +'<footer>Preparato con RADIX il '+esc(when)+(b.name?' per '+esc(b.name):'')+'.</footer></main></body></html>'}

// ---- the one AI call: ONE confirmation, ONE call ----
// {structures, dropped} or {cancelled:true}. Throws when the answers are not enough or the reply has nothing usable.
async function generateStructures({answers,values,rt,confirm,project,memoryScope,onStart}={}){const prompt=structuresPrompt(answers,values);
 if(!rt||typeof rt.reply!=='function')throw Error('Gli agenti non si sono caricati: ricarica la pagina.');
 const a=normalize(answers);
 const ok=await (confirm||askConfirm)({title:'Preparo 3 strutture di campagne Google Ads?',cost:'È una sola chiamata AI al Paid Media Specialist: usa crediti API.',
  facts:[['Servizi',a.services.length],['Budget giornaliero',euro(a.budget)],['Chiamate AI','1']],message:'Volumi e costi per clic non vengono stimati. Il budget lo divido io, solo con il tuo numero.',ok:'Prepara (1 chiamata)'});
 if(!ok)return {cancelled:true};if(typeof onStart==='function')onStart();
 const r=await rt.reply({role:AGENT,project,memoryScope,messages:[{role:'user',content:prompt}]});
 const p=parseStructures(r&&r.text,{answers});if(!p.structures.length)throw Error('la risposta non contiene strutture valide. Riprova.');return p}

// ---- saved in the project: the «agents» document, key searchAds ----
const emptyStore=()=>({schemaVersion:1,items:[]});
const validStructure=s=>isObj(s)&&Array.isArray(s.campaigns)&&s.campaigns.length>0&&s.campaigns.every(c=>isObj(c)&&Array.isArray(c.groups));
function readStore(doc){const s=doc&&doc.searchAds;return isObj(s)&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>isObj(x)&&validStructure(x.structure))}:emptyStore()}
function savedRecord(s,answers,{by,at,issues}={}){const when=at||new Date().toISOString(),a=normalize(answers);
 return {id:'gads-'+when.replace(/\D/g,'').slice(0,14)+'-'+(slug(s.name)||s.kind).slice(0,24),at:when,by:clean(by).slice(0,80),name:s.name,kind:s.kind,answers:a,structure:JSON.parse(JSON.stringify(s)),
  counts:counts(s),errors:errorsOf(issues||[]).length,warnings:(issues||[]).filter(i=>i.level==='warn').length}}
function addRecord(store,rec){const s=readStore({searchAds:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');const doc=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await doc.load())||{},next=addRecord(readStore(cur),rec);
  try{await doc.save({...cur,schemaVersion:1,conversations:cur.conversations||{},searchAds:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
const fromRecord=r=>({structure:JSON.parse(JSON.stringify(r.structure)),answers:normalize(r.answers)});

// ---- the widget (browser) ----
let counter=0;
const dom=()=>root.document;
const E=(tag,text,cls)=>{const n=dom().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
function download(name,data,type){const a=E('a');a.href=root.URL.createObjectURL(new root.Blob([data],{type}));a.download=name;dom().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),2000)}
// ctx: {project (profileFor), profile (registry profile), projectName, projectId, workspace, rt, memoryScope, agentsUrl, by}
function searchAdsStudio(ctx={}){const n=++counter,project=ctx.project||{},brand=brandFor(ctx.profile,ctx.projectName||project.name),wrap=E('div',undefined,'tool photo-studio ad-studio search-ads-studio');
 const pre=prefill(project,null),facts=factsText(project,ctx.profile);
 const st={answers:normalize({goal:'chiamate',landing:pre.landing,brand:pre.brand,cities:pre.cities}),structures:[],dropped:null,chosen:null,busy:false,projectHost:pre.landing?landingUrl(pre.landing).host||'':'',timer:0};
 const steps=E('ol',undefined,'ps-steps');['Le domande','Scegli la struttura','Rifinisci e controlla','Export'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');setStep(1);
 const form=E('div',undefined,'ps-form sa-form'),status=E('p','','tool-status');status.setAttribute('role','status');
 const saved=E('div',undefined,'ad-saved sa-saved');saved.hidden=true;
 const dirs=E('div',undefined,'ad-dirs sa-dirs'),result=E('div',undefined,'ad-result sa-result');dirs.hidden=result.hidden=true;
 wrap.append(steps,saved,form,status,dirs,result);
 // step 1: the questions
 const goalFs=E('fieldset',undefined,'sa-goal');goalFs.append(E('legend','Obiettivo'));
 GOALS.forEach(g=>{const l=E('label',undefined,'ps-chip'),r=E('input');r.type='radio';r.name='sa-goal-'+n;r.value=g.id;r.checked=st.answers.goal===g.id;r.onchange=()=>{st.answers.goal=g.id};l.append(r,dom().createTextNode(g.label));goalFs.append(l)});
 const grid=E('div',undefined,'sa-fields');
 const field=(label,el,help,wide)=>{const l=E('label',undefined,'sa-field'+(wide?' sa-wide':''));l.append(E('span',label),el);if(help)l.append(E('small',help,'sa-help'));grid.append(l);return el};
 const services=E('textarea');services.rows=3;services.maxLength=800;services.name='sa-services-'+n;services.placeholder='Uno per riga. Es.\nPane a lievito madre\nTorte su ordinazione\nCatering per eventi';
 field('Servizi o prodotti da pubblicizzare *',services,'Fino a '+LIMITS.services+'. Ogni servizio può diventare una campagna o un gruppo di annunci.',true);
 const cities=E('input');cities.type='text';cities.maxLength=400;cities.name='sa-cities-'+n;cities.value=st.answers.cities.join(', ');cities.placeholder='Es. Torino, Moncalieri, Collegno';field('Città o zone *',cities,'Separate da virgole. Oppure un indirizzo con il raggio qui sotto.');
 const radius=E('input');radius.type='number';radius.min='1';radius.max=String(LIMITS.radiusMax);radius.step='1';radius.name='sa-radius-'+n;radius.placeholder='Es. 10';field('Raggio in km (facoltativo)',radius);
 const center=E('input');center.type='text';center.maxLength=140;center.name='sa-center-'+n;center.placeholder='Es. Via Garibaldi 12, Torino';field('Indirizzo del raggio (facoltativo)',center);
 const budget=E('input');budget.type='text';budget.inputMode='decimal';budget.maxLength=10;budget.name='sa-budget-'+n;budget.placeholder='Es. 20';field('Budget giornaliero in euro *',budget,'RADIX lo divide tra le campagne con un calcolo, senza stime.');
 const landing=E('input');landing.type='url';landing.maxLength=300;landing.name='sa-landing-'+n;landing.value=st.answers.landing;landing.placeholder='Es. https://www.esempio.it/contatti';
 field('Pagina di destinazione *',landing,pre.landingFrom==='profilo'?'Dal profilo del progetto: cambiala se gli annunci devono portare a un’altra pagina.':'La pagina dove arriva chi clicca: deve parlare dei servizi degli annunci.',true);
 const brandIn=E('input');brandIn.type='text';brandIn.maxLength=300;brandIn.name='sa-brand-'+n;brandIn.value=st.answers.brand.join(', ');brandIn.placeholder='Es. Forno Aurora, fornoaurora';field('Termini del marchio',brandIn,'Il nome dell’attività come lo cercano: va in una campagna del marchio e tra le negative delle altre.',true);
 const read=()=>{st.answers=normalize({goal:st.answers.goal,services:services.value,cities:cities.value,radiusKm:radius.value,center:center.value,budget:budget.value,landing:landing.value,brand:brandIn.value});return st.answers};
 const go=button('Prepara 3 strutture','primary'),bar=E('div',undefined,'ps-actions');bar.append(go,E('span','Una chiamata AI al Paid Media Specialist: ti chiedo conferma prima. Volumi e costi per clic restano «non disponibile»: servono le API di Google Ads.','muted'));
 const note=E('p','Le campagne restano nell’account Google Ads del cliente: RADIX prepara i file per Google Ads Editor, non pubblica nulla.','sa-note');
 form.append(goalFs,grid,note,bar);
 // the site online of the project (Studio Sito) wins over the profile link
 if(ctx.workspace&&ctx.projectId)ctx.workspace.bind(ctx.projectId,'agents').load().then(d=>{const p2=prefill(project,d);if(p2.landingFrom==='sito'){if(!clean(landing.value)||landing.value===pre.landing){landing.value=p2.landing}st.projectHost=landingUrl(p2.landing).host||st.projectHost;const h=landing.parentNode&&landing.parentNode.querySelector('.sa-help');if(h)h.textContent='Dal sito online del progetto: cambiala se gli annunci devono portare a un’altra pagina.'}renderSaved(d)}).catch(()=>{});
 go.onclick=async()=>{if(st.busy)return;const a=read(),errs=answerErrors(a);if(errs.length){status.textContent=errs[0];return}
  st.busy=true;go.disabled=true;
  try{const r=await generateStructures({answers:a,values:{project,facts},rt:ctx.rt||root.RadixAgents,project,memoryScope:ctx.memoryScope,onStart:()=>{setStep(2);status.textContent='Il Paid Media Specialist prepara le 3 strutture…';dirs.hidden=false;dirs.replaceChildren(...[0,1,2].map(()=>E('div',undefined,'ad-dir ad-skeleton')));result.hidden=true}});
   if(r.cancelled){status.textContent='Nessuna chiamata: annullato.';return}
   st.structures=r.structures;st.dropped=r.dropped;st.chosen=null;go.textContent='Prepara altre 3 strutture';renderDirs();
   const dt=droppedText(r.dropped);status.textContent=(r.structures.length<COUNT?'Sono arrivate '+r.structures.length+' strutture su '+COUNT+'. ':'')+'Confrontale e scegli quella da rifinire.'+(dt?' Scartati perché non validi: '+dt+'.':'')}
  catch(e){status.textContent='Strutture non preparate: '+e.message;if(!st.structures.length){dirs.hidden=true;setStep(1)}else renderDirs()}
  finally{st.busy=false;go.disabled=false}};
 const ctxChecks=()=>({answers:st.answers,input:inputText(st.answers,facts),projectHost:st.projectHost});
 // step 2: the three structures
 function renderDirs(){dirs.hidden=false;setStep(st.chosen?3:2);
  dirs.replaceChildren(...st.structures.map((s,i)=>{const c=counts(s),is=checks(s,ctxChecks()),er=errorsOf(is).length,wn=is.length-er,card=E('article',undefined,'ad-dir sa-dir');card.dataset.chosen=String(!!st.chosen&&st.chosen.id===s.id);card.dataset.kind=s.kind;
   const hd=E('div',undefined,'ad-dir-head');hd.append(E('span',(i+1)+' · '+kindOf(s.kind).label,'ad-angle'),E('h3',s.name),E('p',s.logic||kindOf(s.kind).line,'ad-idea'));
   const nums=E('ul',undefined,'sa-nums');[[c.campaigns,'campagne'],[c.groups,'gruppi'],[c.keywords,'parole chiave'],[c.negatives,'negative']].forEach(([v,l])=>{const li=E('li');li.append(E('strong',String(v)),E('span',l));nums.append(li)});
   const camps=E('ul',undefined,'sa-camps');budgetOf(s,st.answers.budget).forEach((b,k)=>{const li=E('li');li.append(E('span',b.name,'sa-camp-name'),E('span',euro(b.daily)+'/giorno','sa-camp-budget'));const g=E('small',s.campaigns[k].groups.map(x=>x.name).join(' · '),'sa-camp-groups');li.append(g);camps.append(li)});
   const g0=s.campaigns[0].groups[0],prev=adPreview(g0,landingUrl(st.answers.landing).host);
   const flags=E('p',er?er+' da sistemare · '+wn+' da guardare':wn?wn+' punti da guardare':'Nessun problema trovato','sa-flags');flags.dataset.state=er?'fail':wn?'warn':'ok';
   const use=button(st.chosen&&st.chosen.id===s.id?'Struttura scelta':'Scegli questa','primary');use.onclick=()=>choose(s);
   card.append(hd,nums,camps,prev,flags,use);return card}))}
 function adPreview(g,host){const box=E('div',undefined,'sa-ad');box.setAttribute('aria-label','Anteprima dell’annuncio');box.append(E('span','Sponsorizzato · '+[host||'sito',g.ad.path1,g.ad.path2].filter(Boolean).join('/'),'sa-ad-url'),E('strong',filled(g.ad.headlines).slice(0,3).join(' | ')||'—','sa-ad-h'),E('span',filled(g.ad.descriptions)[0]||'','sa-ad-d'));return box}
 function choose(s){st.chosen=JSON.parse(JSON.stringify(s));if(!Array.isArray(st.chosen.shares)||st.chosen.shares.length!==st.chosen.campaigns.length)st.chosen.shares=st.chosen.campaigns.map(()=>Math.round(1000/st.chosen.campaigns.length)/10);
  renderDirs();renderResult();result.scrollIntoView&&result.scrollIntoView({behavior:'smooth',block:'start'})}
 // step 3: refine with live checks
 const issuesBox=E('div',undefined,'sa-issues'),budgetBox=E('div',undefined,'sa-budget');
 let levels={};
 const mark=(el,id)=>{el.dataset.field=id;return el};
 function refreshMarks(){const is=checks(st.chosen,ctxChecks());levels=fieldLevels(is);
  result.querySelectorAll('[data-field]').forEach(x=>{const l=levels[x.dataset.field];if(l)x.dataset.level=l;else delete x.dataset.level});
  const er=errorsOf(is),wn=is.filter(i=>i.level==='warn');issuesBox.replaceChildren();
  const head=E('div',undefined,'sa-issues-head');head.append(E('h4','Controlli'),E('span',er.length?er.length+' da sistemare':'Nessun errore','sa-pill '+(er.length?'fail':'ok')),E('span',wn.length?wn.length+' da guardare':'Nessun avviso','sa-pill '+(wn.length?'warn':'ok')));issuesBox.append(head);
  if(is.length){const ul=E('ul');is.slice(0,40).forEach(i=>{const li=E('li');li.dataset.level=i.level;li.append(E('span',i.level==='error'?'Da sistemare':'Da guardare','sa-badge'),E('span',i.where+': ','sa-where'),dom().createTextNode(i.text));ul.append(li)});if(is.length>40)ul.append(E('li','E altri '+(is.length-40)+' punti.'));issuesBox.append(ul)}
  else issuesBox.append(E('p','Limiti di caratteri, regole di Google, parole chiave e negative: tutto a posto.','sa-help'));
  renderBudget();return is}
 const changed=()=>{clearTimeout(st.timer);st.timer=setTimeout(refreshMarks,160)};
 function charCount(input,max,id){const c=E('span','','sa-count');const up=()=>{c.textContent=chars(input.value)+'/'+max;c.dataset.over=String(chars(input.value)>max)};up();input.addEventListener('input',up);if(id)mark(input,id);return c}
 function textInput(value,max,id,onv,ph){const long=max>40,l=E('label',undefined,'sa-line'+(long?' sa-long':'')),i=E(long?'textarea':'input');if(long)i.rows=3;else i.type='text';i.value=value||'';i.maxLength=max+20;if(ph)i.placeholder=ph;const c=charCount(i,max,id);i.addEventListener('input',()=>{onv(clean(i.value));changed()});l.append(i,c);return l}
 function renderBudget(){const s=st.chosen,a=st.answers,b=budgetOf(s,a.budget);budgetBox.replaceChildren(E('h4','Budget: '+euro(a.budget)+' al giorno, al massimo '+euro(monthlyCap(a.budget))+' al mese'));
  const t=E('div',undefined,'sa-budget-rows');b.forEach((x,i)=>{const row=E('div',undefined,'sa-budget-row'),inp=E('input');inp.type='number';inp.min='0';inp.max='100';inp.step='1';inp.value=String(Math.round(sharesOf(s)[i]*10)/10);inp.setAttribute('aria-label','Quota di «'+x.name+'» in percentuale');mark(inp,'c'+i+'.share');if(levels['c'+i+'.share'])inp.dataset.level=levels['c'+i+'.share'];
   inp.onchange=()=>{const v=Number(inp.value);s.shares[i]=v>=0?v:0;refreshMarks()};row.append(E('span',x.name,'sa-budget-name'),inp,E('span','%','sa-unit'),E('strong',euro(x.daily),'sa-budget-day'),E('small','al mese al massimo '+euro(x.monthly),'sa-help'));t.append(row)});
  const eq=button('Dividi in parti uguali');eq.onclick=()=>{s.shares=s.campaigns.map(()=>Math.round(1000/s.campaigns.length)/10);refreshMarks()};
  budgetBox.append(t,E('p','Le quote sono pesi: RADIX divide '+euro(a.budget)+' al centesimo in proporzione. Volumi e CPC: '+NA+'.','sa-help'),eq)}
 function keywordsBox(list,id,label,onv){const l=E('label',undefined,'sa-kw'),ta=E('textarea');ta.rows=Math.min(10,Math.max(3,list.length+1));ta.value=list.map(keywordLine).join('\n');mark(ta,id);const msg=E('small','','sa-help');
  ta.addEventListener('input',()=>{const p=parseKeywordLines(ta.value);onv(p.keywords);msg.textContent=p.invalid.length?'Non valide (non vanno nei file): '+p.invalid.slice(0,3).join(', '):'';msg.dataset.level=p.invalid.length?'error':'';changed()});
  l.append(E('span',label),ta,msg);return l}
 function renderResult(){const s=st.chosen,a=st.answers;setStep(3);result.hidden=false;
  const head=E('div',undefined,'ad-result-head'),hd=E('div');hd.append(E('span',kindOf(s.kind).label,'ad-angle'),E('h3','La struttura scelta · '+s.name),E('p','Cambia testi, parole chiave e quote: i controlli si aggiornano mentre scrivi. Parole chiave: una per riga, «"a frase"», «[esatta]», senza segni = generica.','ad-idea'));head.append(hd);
  const camps=E('div',undefined,'sa-campaigns');
  s.campaigns.forEach((c,i)=>{const det=E('details',undefined,'sa-campaign');det.open=i===0;const sum=E('summary');sum.append(E('strong','Campagna «'+c.name+'»'),E('span',plural(c.groups.length,'gruppo','gruppi')+' · '+plural(c.groups.reduce((x,g)=>x+g.keywords.length,0),'parola chiave','parole chiave'),'sa-help'));mark(sum,'c'+i);det.append(sum);
   const nl=E('label',undefined,'sa-line sa-name'),ni=E('input');ni.type='text';ni.value=c.name;ni.maxLength=LIMITS.name;mark(ni,'c'+i+'.name');ni.addEventListener('input',()=>{c.name=clean(ni.value);changed()});nl.append(E('span','Nome della campagna'),ni);det.append(nl);
   c.groups.forEach((g,j)=>{const f='c'+i+'.g'+j,gb=E('section',undefined,'sa-group');g.ad.headlines=Array.from({length:LIMITS.headlines},(_,x)=>g.ad.headlines[x]||'');g.ad.descriptions=Array.from({length:LIMITS.descriptions},(_,x)=>g.ad.descriptions[x]||'');gb.append(E('h4','Gruppo «'+g.name+'»'));
    const cols=E('div',undefined,'sa-group-cols'),left=E('div',undefined,'sa-col'),right=E('div',undefined,'sa-col');
    left.append(keywordsBox(g.keywords,f+'.kw','Parole chiave',v=>{g.keywords=v}),E('p','Volume di ricerca e CPC: '+NA+'.','sa-na'));
    const hs=E('fieldset',undefined,'sa-texts');hs.append(E('legend','Titoli ('+LIMITS.headline+' caratteri, da '+LIMITS.headlinesMin+' a '+LIMITS.headlines+')'));mark(hs,f+'.h');
    for(let k=0;k<LIMITS.headlines;k++)hs.append(textInput(g.ad.headlines[k],LIMITS.headline,f+'.h'+k,v=>{g.ad.headlines[k]=v},'Titolo '+(k+1)));
    const ds=E('fieldset',undefined,'sa-texts');ds.append(E('legend','Descrizioni ('+LIMITS.description+' caratteri, da '+LIMITS.descriptionsMin+' a '+LIMITS.descriptions+')'));mark(ds,f+'.d');
    for(let k=0;k<LIMITS.descriptions;k++)ds.append(textInput(g.ad.descriptions[k],LIMITS.description,f+'.d'+k,v=>{g.ad.descriptions[k]=v},'Descrizione '+(k+1)));
    const ps=E('fieldset',undefined,'sa-texts sa-paths');ps.append(E('legend','Percorsi dell’URL visualizzato ('+LIMITS.path+' caratteri)'));
    ps.append(textInput(g.ad.path1,LIMITS.path,f+'.p1',v=>{g.ad.path1=v},'percorso-1'),textInput(g.ad.path2,LIMITS.path,f+'.p2',v=>{g.ad.path2=v},'percorso-2'));
    right.append(hs,ds,ps);cols.append(left,right);gb.append(cols);det.append(gb)});
   det.append(keywordsBox(c.negatives,'c'+i+'.neg','Negative della campagna',v=>{c.negatives=v}));camps.append(det)});
  // assets
  const assets=E('section',undefined,'sa-assets');assets.append(E('h4','Negative per tutte le campagne ed estensioni'));
  assets.append(keywordsBox(s.negatives,'neg','Negative per tutte le campagne',v=>{s.negatives=v}));
  const sl=E('fieldset',undefined,'sa-texts sa-sitelinks');sl.append(E('legend','Sitelink (testo '+LIMITS.sitelink+', righe '+LIMITS.sitelinkLine+')'));mark(sl,'sl');
  s.sitelinks.forEach((l,k)=>{const row=E('div',undefined,'sa-sitelink');mark(row,'sl'+k);const u=E('input');u.type='url';u.value=l.url;u.setAttribute('aria-label','Pagina del sitelink '+(k+1));u.addEventListener('input',()=>{l.url=clean(u.value);changed()});
   row.append(textInput(l.text,LIMITS.sitelink,'',v=>{l.text=v},'Testo'),u,textInput(l.line1,LIMITS.sitelinkLine,'',v=>{l.line1=v},'Riga 1'),textInput(l.line2,LIMITS.sitelinkLine,'',v=>{l.line2=v},'Riga 2'));sl.append(row)});
  const co=E('label',undefined,'sa-kw'),cta=E('textarea');cta.rows=4;cta.value=s.callouts.join('\n');mark(cta,'co');cta.addEventListener('input',()=>{s.callouts=cta.value.split('\n').map(clean).filter(Boolean).slice(0,LIMITS.callouts);changed()});co.append(E('span','Callout (uno per riga, '+LIMITS.callout+' caratteri)'),cta);
  const sn=E('div',undefined,'sa-snippet'),sh=E('select');sh.setAttribute('aria-label','Intestazione dello snippet');const none=E('option','Nessuno snippet');none.value='';sh.append(none);SNIPPET_HEADERS.forEach(([it])=>{const o=E('option',it);o.value=it;sh.append(o)});sh.value=s.snippet?s.snippet.header:'';
  const sv=E('input');sv.type='text';sv.value=s.snippet?s.snippet.values.join(', '):'';sv.placeholder='Valori separati da virgole (da 3 a 10)';mark(sv,'sn');
  const upSn=()=>{s.snippet=sh.value?{header:sh.value,values:sv.value.split(',').map(clean).filter(Boolean).slice(0,LIMITS.snippetMax)}:null;changed()};sh.onchange=upSn;sv.addEventListener('input',upSn);
  sn.append(E('span','Snippet strutturato','sa-label'),sh,sv);assets.append(sl,co,sn);
  // actions
  const acts=E('div',undefined,'ps-actions sa-actions'),zipB=button('Scarica per Google Ads Editor (.zip)','primary'),pdfB=button('Scarica il riepilogo PDF'),htmlB=button('Scarica il riepilogo HTML'),saveB=button('Salva nel progetto'),rs=E('p','','tool-status');rs.setAttribute('role','status');
  acts.append(zipB,pdfB,htmlB);if(ctx.workspace&&ctx.projectId)acts.append(saveB);acts.append(E('span','Nessuna chiamata AI: file CSV per Editor (UTF-16, tabulazioni, campagne in pausa), riepilogo PDF e HTML per il cliente.','muted'));
  const guard=()=>{const is=refreshMarks(),er=errorsOf(is);if(er.length){rs.textContent='Prima sistema '+er.length+(er.length===1?' punto':' punti')+' «da sistemare» nei controlli: Google rifiuterebbe questi testi.';issuesBox.scrollIntoView&&issuesBox.scrollIntoView({behavior:'smooth',block:'center'});return null}return is};
  const summaryFiles=async is=>{const P=PS(),doc=layoutSummary(s,st.answers,brand,{issues:is});if(P.rasterize)await P.rasterize(doc);return {pdf:summaryPdf(s,st.answers,brand,{doc}),html:summaryHtml(s,st.answers,brand,{issues:is})}};
  zipB.onclick=async()=>{if(st.busy)return;const is=guard();if(!is)return;const Z=ZIP();if(!Z){rs.textContent='Lo zip non si è caricato: ricarica la pagina.';return}st.busy=true;
   try{const sf=await summaryFiles(is),files=editorFiles(s,st.answers,{brand,...sf}),name=zipName(s,brand);download(name,Z.zip(files),'application/zip');setStep(4);rs.textContent='Scaricato '+name+': '+(files.length-3)+' file CSV per Google Ads Editor, LEGGIMI.txt e il riepilogo per il cliente. Importali nell’ordine scritto in LEGGIMI.txt.'}
   catch(e){rs.textContent='Zip non creato: '+e.message}finally{st.busy=false}};
  pdfB.onclick=async()=>{if(st.busy)return;const is=guard();if(!is)return;st.busy=true;try{const sf=await summaryFiles(is);download(fileBase(s,brand)+'.pdf',sf.pdf,'application/pdf');setStep(4);rs.textContent='Riepilogo PDF scaricato.'}catch(e){rs.textContent='PDF non creato: '+e.message}finally{st.busy=false}};
  htmlB.onclick=()=>{const is=guard();if(!is)return;download(fileBase(s,brand)+'.html',summaryHtml(s,st.answers,brand,{issues:is}),'text/html;charset=utf-8');setStep(4);rs.textContent='Riepilogo HTML scaricato: un solo file da mandare al cliente.'};
  saveB.onclick=async()=>{saveB.disabled=true;try{const is=checks(s,ctxChecks());await saveToProject(ctx.workspace,ctx.projectId,savedRecord(s,st.answers,{by:ctx.by,issues:is}));rs.replaceChildren(dom().createTextNode('Struttura salvata nel progetto: la riapri da qui senza un’altra chiamata AI. '));if(ctx.agentsUrl){const l=E('a','Apri il Paid Media Specialist →');l.href=ctx.agentsUrl;rs.append(l)}
    ctx.workspace.bind(ctx.projectId,'agents').load().then(renderSaved).catch(()=>{})}catch(e){rs.textContent='Non salvata: '+e.message}finally{saveB.disabled=false}};
  const body=E('div',undefined,'sa-body'),main=E('div',undefined,'sa-main'),side=E('aside',undefined,'sa-side');main.append(camps,assets);side.append(budgetBox,issuesBox);body.append(main,side);
  result.replaceChildren(head,body,acts,rs);refreshMarks()}
 function renderSaved(d){const s=readStore(d);if(!s.items.length){saved.hidden=true;return}saved.replaceChildren(E('h4','Campagne salvate nel progetto'));const row=E('div',undefined,'ad-saved-row');
  s.items.slice(-4).reverse().forEach(r=>{const b=button(r.name+' · '+String(r.at||'').slice(0,10).split('-').reverse().join('/'),'ad-saved-item');b.onclick=()=>{const x=fromRecord(r);st.answers=x.answers;
   services.value=x.answers.services.join('\n');cities.value=x.answers.cities.join(', ');radius.value=x.answers.radiusKm||'';center.value=x.answers.center;budget.value=x.answers.budget==null?'':String(x.answers.budget).replace('.',',');landing.value=x.answers.landing;brandIn.value=x.answers.brand.join(', ');
   goalFs.querySelectorAll('input').forEach(i=>{i.checked=i.value===x.answers.goal});st.structures=[x.structure];st.chosen=null;choose(x.structure);status.textContent='Riaperta «'+r.name+'» del '+String(r.at||'').slice(0,10).split('-').reverse().join('/')+'.'};row.append(b)});
  saved.append(row);saved.hidden=false}
 return wrap}

return Object.freeze({AGENT,COUNT,NA,LIMITS,GOALS,KINDS,MATCH,SNIPPET_HEADERS,HEAD,FILES,goalOf,kindOf,money,normalize,landingUrl,answerErrors,prefill,budgetSplit,monthlyCap,euro,budgetOf,
 factsText,inputText,structuresPrompt,parseJson,matchOf,keywordOf,keywordLine,parseKeywordLines,parseStructures,droppedTotal,droppedText,textIssues,blocks,checks,errorsOf,fieldLevels,counts,
 tsvCell,tsv,utf16le,fromUtf16le,editorRows,readme,editorFiles,zipName,fileBase,brandFor,layoutSummary,summaryPdf,summaryHtml,generateStructures,readStore,savedRecord,addRecord,saveToProject,fromRecord,searchAdsStudio});
});
