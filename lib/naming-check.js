/* Controllo nomi del Studio Testi («Nome e slogan», lib/copy-studio.js): for every proposed name the candidate domains
   (.it, .com, .eu and, for a shop, .shop and .store), the social handles to look up by hand (text only, nothing is
   checked) and, for the foreign markets picked, a few fixed checks (length, accents, letter groups read differently).
   Domains are checked for free through public DNS-over-HTTPS (Cloudflare, then Google as a fallback), NS records only:
   NXDOMAIN → «probabilmente libero», an answer → «già registrato», anything else → «non verificato». It is an
   indication, never a guarantee: every domain carries a link to check it at a registrar. No paid API, no purchase.
   The meaning of a name in other languages is NOT checked by rules (no invented translations): one optional AI call,
   started from a click with the RADIX confirmation, can flag doubts to verify with a native speaker.
   The results become a Markdown block of the chosen text, so «Salva nel progetto» keeps them. Pure part runs in Node
   for the tests (fetch and rt are passed in); namingPanel() is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixNamingCheck=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')))};
const MAX_NAMES=8,CONCURRENCY=4,TIMEOUT=8000,AI_MAX=3000;
const TLDS=['it','com','eu'],SHOP_TLDS=['shop','store'];
const PROVIDERS=[{id:'cloudflare',url:d=>'https://cloudflare-dns.com/dns-query?name='+encodeURIComponent(d)+'&type=NS',headers:{accept:'application/dns-json'}},
 {id:'google',url:d=>'https://dns.google/resolve?name='+encodeURIComponent(d)+'&type=NS',headers:{accept:'application/json'}}];
const STATES={free:'probabilmente libero',taken:'già registrato',unknown:'non verificato'};
const MARKETS=[['DE','Tedesco'],['FR','Francese'],['ES','Spagnolo'],['EN','Inglese']];
const HEAD='## Domini e profili (indicazione)';
const DISCLAIMER='Controllo gratuito sul DNS pubblico: è un’indicazione, non una garanzia. Prima di decidere verifica il dominio presso un registrar e il marchio su UIBM, TMview e WIPO.';
const MEANING_NOTE='Il significato dei nomi nelle altre lingue non è controllato da queste regole: chiedilo a un madrelingua.';

const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const plain=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'');
// The name of a list item: «Madia — la madia dove riposa il pane» → «Madia»; quotes and bold removed.
function nameOf(item){let t=clean(item).replace(/\*\*/g,'').replace(/\s\(\d+\/\d+\)$/,'');
 t=t.split(/\s+[—–-]\s+|:\s/)[0];return clean(t.replace(/^[«"“'‘]+|[»"”'’.]+$/g,'')).slice(0,40)}
const slug=name=>plain(name).toLowerCase().replace(/&/g,' ').replace(/[^a-z0-9]+/g,'').slice(0,63);
const words=name=>plain(name).toLowerCase().replace(/&/g,' ').split(/[^a-z0-9]+/).filter(Boolean);
// The names of the «## Nomi» section of the (edited) Markdown, deduplicated by their domain slug.
function namesFromMarkdown(md){const out=[],seen=new Set();let on=false;
 for(const line of String(md||'').split('\n')){if(/^##\s/.test(line)){on=/^##\s+nomi\s*$/i.test(line.trim());continue}
  if(line.trim()==='---')on=false;if(!on||!/^\s*[-*]\s+/.test(line))continue;
  const n=nameOf(line.replace(/^\s*[-*]\s+/,'')),s=slug(n);if(s.length<2||seen.has(s))continue;seen.add(s);out.push(n);if(out.length>=MAX_NAMES)break}
 return out}
// A shop or a product: .shop and .store are worth checking too.
const wantsShop=text=>/negozi|shop|e-?commerce|vendit|online|prodott|store|boutique|bottega/i.test(String(text||''));
function domainsFor(name,{shop}={}){const s=slug(name);if(s.length<2)return [];return TLDS.concat(shop?SHOP_TLDS:[]).map(tld=>({tld,domain:s+'.'+tld}))}
// Social handles to look up by hand: Instagram and TikTok allow a-z 0-9 . _ up to 30 characters.
function handlesFor(name){const w=words(name),base=w.join('').slice(0,30);if(!base)return null;
 const ig=[base,(base+'.it').slice(0,30),(base+'_official').slice(0,30)].filter((x,i,a)=>a.indexOf(x)===i);
 return {instagram:ig,facebook:'facebook.com/'+base,linkedin:'linkedin.com/company/'+w.join('-').slice(0,60)}}
const registrarUrl=domain=>'https://www.namecheap.com/domains/registration/results/?domain='+encodeURIComponent(domain);
// The DNS JSON answer → state. Status 3 is NXDOMAIN; 0 (NOERROR) means the name exists, with or without NS answers.
function stateOf(json){if(!json||typeof json!=='object')return 'unknown';if(json.Status===3)return 'free';if(json.Status===0)return 'taken';return 'unknown'}
function withTimeout(p,ms){let t;return Promise.race([p,new Promise((_,rej)=>{t=setTimeout(()=>rej(Error('tempo scaduto')),ms)})]).finally(()=>clearTimeout(t))}
async function checkDomain(domain,{fetch:f,timeout}={}){const fx=f||(root.fetch&&root.fetch.bind(root));if(!fx)return {domain,state:'unknown',error:'Rete non disponibile.'};
 let last='';
 for(const p of PROVIDERS){try{const r=await withTimeout(fx(p.url(domain),{headers:p.headers}),timeout||TIMEOUT);if(!r||!r.ok)throw Error('risposta '+(r&&r.status));
   const state=stateOf(await r.json());if(state!=='unknown')return {domain,state,provider:p.id};last='risposta DNS non chiara'}
  catch(e){last=clean(e&&e.message)||'errore di rete'}}
 return {domain,state:'unknown',error:last}}
// Every name → its domains (checked, at most CONCURRENCY requests at a time) and its handles.
async function checkNames(names,{fetch:f,shop,timeout,onProgress}={}){const list=(names||[]).slice(0,MAX_NAMES).map(n=>({name:n,slug:slug(n),domains:domainsFor(n,{shop}),handles:handlesFor(n)}));
 const jobs=[];list.forEach(x=>x.domains.forEach(d=>jobs.push(d)));let next=0,done=0;
 const worker=async()=>{while(next<jobs.length){const d=jobs[next++];const r=await checkDomain(d.domain,{fetch:f,timeout});d.state=r.state;if(r.error)d.error=r.error;done++;if(onProgress)onProgress(done,jobs.length)}};
 await Promise.all(Array.from({length:Math.min(CONCURRENCY,jobs.length)},worker));return list}

// ---- foreign markets: fixed checks only, no meanings ----
// Letter groups an Italian name may have that a speaker of that language reads differently.
const SOUND={
 EN:[[/gn/,'«gn» si legge g+n, non come in «gnocchi»'],[/gli/,'«gli» si legge g+li'],[/ch/,'«ch» si legge «ci», non «chi»'],[/c[ei]/,'«ce/ci» si legge «se/si»'],[/sc[ei]/,'«sce/sci» si legge «ske/ski» o «se/si»'],[/zz/,'«zz» non ha un suono chiaro']],
 DE:[[/v/,'«v» si legge «f»'],[/c[ei]/,'«ce/ci» si legge «tse/tsi»'],[/sc[ei]/,'«sce/sci» si legge «stse/stsi»'],[/ch/,'«ch» si legge aspirato'],[/gn|gli/,'«gn/gli» si legge lettera per lettera'],[/s[aeiou]/,'la «s» tra vocali o iniziale si legge sonora']],
 FR:[[/u/,'«u» si legge «ü»'],[/ch/,'«ch» si legge «sc»'],[/g[ei]/,'«ge/gi» si legge «je/ji» morbido'],[/c[ei]/,'«ce/ci» si legge «se/si»'],[/gli/,'«gli» si legge g+li'],[/e$/,'la «e» finale può diventare muta']],
 ES:[[/z/,'«z» in Spagna si legge come «th» inglese'],[/c[ei]/,'«ce/ci» in Spagna si legge «the/thi»'],[/g[ei]/,'«ge/gi» si legge aspirato, come «he/hi»'],[/v/,'«v» si legge quasi come «b»'],[/gli/,'«gli» si legge g+li'],[/sc[ei]/,'«sce/sci» si legge «sthe/sthi»'],[/(?:^|[^c])h/,'la «h» non si legge']]};
// The checks of one name for the picked markets: [{market, text}], market '' for the ones that hold everywhere.
function marketChecks(name,markets){const ms=(markets||[]).filter(m=>SOUND[m]);if(!ms.length)return [];const out=[],n=clean(name),low=plain(n).toLowerCase(),letters=low.replace(/[^a-z]/g,'');
 if(letters.length>12)out.push({market:'',text:'Lungo: '+letters.length+' lettere, più difficile da ricordare e da scrivere all’estero.'});
 if(/[̀-ͯ]/.test(n.normalize('NFD')))out.push({market:'',text:'Ha lettere accentate: nei domini e sulle tastiere estere spariscono, scrivilo anche come «'+plain(n)+'».'});
 if(/[\s&'’-]/.test(n))out.push({market:'',text:'Ha spazi o simboli: dominio e profili lo scrivono attaccato («'+slug(n)+'»).'});
 if(/[bcdfghjklmnpqrstvwxz]{4,}/.test(letters))out.push({market:'',text:'Quattro o più consonanti di fila: difficile da pronunciare.'});
 for(const m of ms){const hits=SOUND[m].filter(([re])=>re.test(letters)).map(([,t])=>t);if(hits.length)out.push({market:m,text:'Si può leggere diverso: '+hits.join('; ')+'.'})}
 return out}

// ---- the optional AI call on meanings ----
function meaningPrompt(names,markets){const langs=(markets||[]).map(m=>(MARKETS.find(x=>x[0]===m)||[m,m])[1].toLowerCase());
 return ['Controlla questi nomi di marca per i mercati esteri: '+names.map(n=>'«'+n+'»').join(', ')+'. Lingue: '+langs.join(', ')+'.',
  'Per ogni nome e lingua dimmi solo se somiglia a una parola volgare, offensiva, ridicola o negativa, o a un marchio molto noto.',
  'Scrivi una riga per nome nel formato «Nome · lingua: osservazione». Se non noti nulla scrivi «nessun problema noto». Se non sei sicuro scrivi «non so». Non inventare traduzioni né significati.'].join('\n')}
async function aiMeaning({names,markets,rt,confirm,project,memoryScope}={}){if(!rt||typeof rt.reply!=='function')throw Error('Gli agenti non si sono caricati: ricarica la pagina.');
 if(!names||!names.length)throw Error('Nessun nome da controllare.');if(!markets||!markets.length)throw Error('Scegli almeno un mercato estero.');
 const ok=await (confirm||askConfirm)({title:'Controllo i significati dei nomi con l’AI?',cost:'È una sola chiamata AI allo Stratega di Marca: usa crediti API.',facts:[['Nomi',String(names.length)],['Lingue',markets.join(', ')],['Chiamate AI','1']],ok:'Controlla i significati'});
 if(!ok)return null;
 const r=await rt.reply({role:'brand-strategist',project,memoryScope,messages:[{role:'user',content:meaningPrompt(names,markets)}]});
 const text=String(r&&r.text||'').replace(/\r/g,'').replace(/^#+\s*/gm,'').replace(/^\s*---\s*$/gm,'').trim().slice(0,AI_MAX);
 if(!text)throw Error('la risposta è vuota. Riprova.');return text}

// ---- the Markdown block ----
function toBlock(results,{markets,ai,date}={}){const out=[HEAD,'',DISCLAIMER+(date?' Controllo del '+date+'.':'')];
 for(const r of results||[]){out.push('','### '+r.name);
  r.domains.forEach(d=>out.push('- '+d.domain+': '+(STATES[d.state]||STATES.unknown)+' · verifica: '+registrarUrl(d.domain)));
  if(r.handles)out.push('- Profili social da cercare a mano (non controllati): Instagram e TikTok '+r.handles.instagram.map(h=>'@'+h).join(', ')+'; '+r.handles.facebook+'; '+r.handles.linkedin);
  marketChecks(r.name,markets).forEach(c=>out.push('- Mercati esteri'+(c.market?' '+c.market:'')+': '+c.text))}
 if(markets&&markets.length)out.push('',''+MEANING_NOTE);
 if(ai)out.push('','### Significati: indicazione AI da verificare con un madrelingua','',...ai.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>/^[-*]\s/.test(l)?l:'- '+l));
 return out.join('\n')}
// The block put into the text: a previous one is replaced; it goes before the closing «---» note when there is one.
const BLOCK_RE=/\n## Domini e profili \(indicazione\)\n[\s\S]*?\n(?=\n## |\n---\n|$)/;
function withBlock(md,block){let t=String(md||'').replace(BLOCK_RE,'');if(!block)return t;const i=t.lastIndexOf('\n---\n');
 if(i>=0){const head=t.slice(0,i);return head+(head.endsWith('\n')?'':'\n')+'\n'+block+'\n'+t.slice(i)}
 return t+(t.endsWith('\n')?'':'\n')+'\n'+block+'\n'}

// ---- browser widget ----
const doc=()=>root.document;
const el=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
let counter=0;
// ctx: {getText, setText (the chosen text's textarea), shop (default for .shop/.store), fetch, rt, project, memoryScope, today}
function namingPanel(ctx={}){const n=++counter,wrap=el('section',undefined,'cs-naming');
 wrap.append(el('h4','Domini e profili social'),el('p','Per ogni nome provo .it, .com e .eu sul DNS pubblico, gratis. È un’indicazione: tocca un dominio per verificarlo sul registrar prima di decidere. I profili social sono solo suggerimenti da cercare a mano.','cs-note'));
 const opts=el('div',undefined,'cs-naming-opts'),shopL=el('label',undefined,'ps-chip'),shopI=el('input');shopI.type='checkbox';shopI.checked=!!ctx.shop;shopL.append(shopI,doc().createTextNode(' Anche .shop e .store'));
 const fs=el('fieldset');fs.append(el('legend','Mercati esteri (facoltativo)'));const mk={};
 MARKETS.forEach(([code,label])=>{const l=el('label',undefined,'ps-chip'),i=el('input');i.type='checkbox';i.value=code;i.name='nc-m-'+n;l.title=label;l.append(i,doc().createTextNode(' '+code));fs.append(l);mk[code]=i});
 opts.append(shopL,fs);
 const go=button('Controlla domini e nomi','primary'),aiBtn=button('Significati con l’AI (facoltativo)'),bar=el('div',undefined,'ps-actions');aiBtn.hidden=true;bar.append(go,aiBtn);
 const st=el('p','','tool-status');st.setAttribute('role','status');const list=el('div',undefined,'cs-naming-list');
 wrap.append(opts,bar,st,list);
 let last=null,ai='';
 const picked=()=>MARKETS.map(m=>m[0]).filter(c=>mk[c].checked);
 const write=()=>{if(!last)return;ctx.setText&&ctx.setText(withBlock(ctx.getText?ctx.getText():'',toBlock(last,{markets:picked(),ai,date:ctx.today||new Date().toISOString().slice(0,10)})))};
 function render(){list.replaceChildren(...last.map(r=>{const c=el('article',undefined,'cs-naming-card');c.append(el('h5',r.name));
   const ul=el('ul',undefined,'cs-domains');r.domains.forEach(d=>{const li=el('li'),b=el('span',STATES[d.state]||STATES.unknown,'cs-dns');b.dataset.state=d.state||'unknown';const a=el('a',d.domain+' ↗','cs-domain');a.href=registrarUrl(d.domain);a.target='_blank';a.rel='noopener';a.title='Verifica '+d.domain+' sul registrar';
    li.append(a,b);if(d.error)li.title='Non verificato: '+d.error;ul.append(li)});c.append(ul);
   if(r.handles)c.append(el('p','Social da cercare a mano: '+r.handles.instagram.map(h=>'@'+h).join(' · '),'cs-handles'));
   const mc=marketChecks(r.name,picked());if(mc.length){const w=el('ul',undefined,'cs-issues');mc.forEach(x=>w.append(el('li',(x.market?x.market+': ':'')+x.text)));c.append(w)}
   return c}))}
 go.onclick=async()=>{const names=namesFromMarkdown(ctx.getText?ctx.getText():'');if(!names.length){st.textContent='Nessun nome da controllare: nella sezione «Nomi» del testo non ci sono voci.';return}
  go.disabled=true;st.textContent='Controllo '+names.length+' nomi sul DNS pubblico…';
  try{last=await checkNames(names,{fetch:ctx.fetch,shop:shopI.checked,onProgress:(d,t)=>{st.textContent='Controllo i domini: '+d+' di '+t+'…'}});ai='';render();write();
   const all=last.flatMap(r=>r.domains),free=all.filter(d=>d.state==='free').length,unk=all.filter(d=>d.state==='unknown').length;
   st.textContent=(free===1?'1 dominio probabilmente libero':free+' domini probabilmente liberi')+' su '+all.length+(unk?' ('+unk+(unk===1?' non verificato)':' non verificati)'):'')+'. Aggiunto al testo scelto: si salva con il testo. È un’indicazione, verifica sul registrar.';
   aiBtn.hidden=!picked().length;go.textContent='Controlla di nuovo'}
  catch(e){st.textContent='Controllo non riuscito: '+e.message}finally{go.disabled=false}};
 fs.addEventListener('change',()=>{if(last){render();write();aiBtn.hidden=!picked().length}});
 aiBtn.onclick=async()=>{aiBtn.disabled=true;try{const t=await aiMeaning({names:last.map(r=>r.name),markets:picked(),rt:ctx.rt||root.RadixAgents,project:ctx.project,memoryScope:ctx.memoryScope});
   if(t){ai=t;write();st.textContent='Indicazione AI sui significati aggiunta al testo: falla verificare a un madrelingua.'}}
  catch(e){st.textContent='Controllo dei significati non riuscito: '+e.message}finally{aiBtn.disabled=false}};
 return wrap}
return Object.freeze({TLDS,SHOP_TLDS,STATES,MARKETS,MAX_NAMES,nameOf,slug,namesFromMarkdown,wantsShop,domainsFor,handlesFor,registrarUrl,stateOf,checkDomain,checkNames,marketChecks,meaningPrompt,aiMeaning,toBlock,withBlock,namingPanel});
});
