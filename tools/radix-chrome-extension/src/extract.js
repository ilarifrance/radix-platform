'use strict';
// Reads only what Sales Navigator has visibly rendered in the open tab.
// Port of lib/linkedin-browser-extract.js (visibleSearchCards and
// normalizeVisibleCards) for the Chrome extension, plus location, first/last
// name and the visible pagination/challenge controls. No cookies, no hidden
// LinkedIn API, no profile visits: missing fields stay empty.
(function(root){
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const PROFILE_PATH=/^\/(sales\/lead\/|in\/)/;
 const HOSTS=['www.linkedin.com','linkedin.com'];
 const CARD='li.artdeco-list__item,li[data-view-name],.search-results__result-item,article,[data-testid*="search-result"],tr,li';
 const visible=el=>!!(el&&el.getClientRects().length);
 function profileAnchors(doc){
  doc=doc||document;
  const base=doc.location?doc.location.href:'https://www.linkedin.com/';
  const out=[];
  for(const a of Array.from(doc.querySelectorAll('a[href]'))){
   let url;
   try{url=new URL(a.getAttribute('href'),base)}catch{continue}
   if(!HOSTS.includes(url.hostname)||!PROFILE_PATH.test(url.pathname)||!visible(a))continue;
   out.push({a,url});
  }
  return out;
 }
 function visibleSearchCards(doc){
  doc=doc||document;
  const out=[],seen=new Set();
  for(const {a,url} of profileAnchors(doc)){
   const profileUrl=url.origin+url.pathname.replace(/\/$/,'');
   if(seen.has(profileUrl))continue;
   const name=clean(a.innerText||a.getAttribute('aria-label')).split(/\s+[•·]\s*|\n/)[0].trim();
   if(!name||name.length<3||name.length>130||!/[a-zA-ZÀ-ÿ]/.test(name))continue;
   if(/^(view profile|visualizza profilo|open|apri|save|salva|message|messaggio)$/i.test(name))continue;
   const card=a.closest(CARD)||a.parentElement?.parentElement?.parentElement;
   const lines=(card?.innerText||'').split(/\n+/).map(clean).filter(Boolean).slice(0,25);
   const field=selector=>{const el=card?.querySelector(selector);return visible(el)?clean(el.innerText||el.textContent):''};
   const roleText=field('[data-anonymize="title"]');
   let companyText=field('[data-anonymize="company-name"]');
   // Company without data-anonymize: its company link, else the subtitle text next to the title
   // (companies without a LinkedIn page are plain text; the «·» may be a CSS-only separator).
   if(!companyText)for(const link of Array.from(card?.querySelectorAll('a[href*="/sales/company/"],a[href*="/company/"]')||[])){const v=visible(link)?clean(link.innerText||link.textContent):'';if(v&&v.length<=180){companyText=v;break}}
   if(!companyText&&roleText){
    const sub=card?.querySelector('[data-anonymize="title"]')?.parentElement;
    const whole=sub&&!sub.contains(a)?clean(sub.innerText||sub.textContent):'';
    const at=whole.indexOf(roleText);
    const rest=whole.length<=300&&at>=0?clean(whole.slice(0,at)+' '+whole.slice(at+roleText.length)).replace(/^[\s·•|,–—-]+|[\s·•|,–—-]+$/g,'').replace(/^(?:at|presso|chez|@)\s+/i,''):'';
    if(rest.length>=2&&rest.length<=180&&!/^\d+\s*[°º]|\b(?:anni|mesi|years|months|nel ruolo|in the role)\b/i.test(rest))companyText=rest;
   }
   const locationText=field('[data-anonymize="location"]');
   let positionText='';
   if(!roleText||!companyText){
    for(const element of Array.from(card?.querySelectorAll('span,div,p')||[])){
     if(!visible(element)||element.contains(a))continue;
     const value=clean(element.innerText||element.textContent);
     if(value.length<5||value.length>240||value.includes(name)||!/[·•]/.test(value))continue;
     const match=value.match(/^(.{2,120}?)\s*[·•]\s*(.{2,180})$/);
     if(match&&!/^\d+[°º]$/.test(match[2].trim())){positionText=value;break}
    }
   }
   out.push({fullName:name,profileUrl,lines,roleText,companyText,positionText,locationText});seen.add(profileUrl);
  }
  return out;
 }
 const PARTICLES=new Set(['de','di','da','del','della','dello','dei','degli','delle','dal','dalla','van','von','der','den','la','lo','le','du','dos','das','do','mc','bin','al','el','st','san','santa']);
 function splitName(fullName){
  // Credentials after a comma ("Mario Rossi, MBA") and emoji are not part of the name.
  const base=clean(String(fullName||'').split(',')[0].replace(/\([^)]*\)/g,' ').replace(/[^\p{L}\p{M}\s.'’-]/gu,' '));
  const parts=base.split(' ').filter(Boolean);
  if(parts.length<2)return {firstName:parts[0]||'',lastName:''};
  let at=parts.findIndex((p,i)=>i>0&&(PARTICLES.has(p.toLowerCase().replace(/[.'’]$/,''))||/^d['’]/i.test(p)));
  if(at<1)at=parts.length-1;
  return {firstName:parts.slice(0,at).join(' '),lastName:parts.slice(at).join(' ')};
 }
 function normalizeVisibleCards(cards,sourceUrl){
  if(!Array.isArray(cards))throw Error('Lista risultati non valida');
  const ignore=/^(save|saved|salva|salvato|message|messaggio|connect|collegati|see more|mostra altro|visualizza|view profile|apri profilo|lead details|altre azioni|more)$/i;
  const rows=[],seen=new Set();
  for(const card of cards){
   if(!card||typeof card!=='object')continue;
   const fullName=String(card.fullName||'').replace(/\s+/g,' ').trim();
   let parsed;
   try{parsed=new URL(String(card.profileUrl||''))}catch{continue}
   if(!HOSTS.includes(parsed.hostname)||!PROFILE_PATH.test(parsed.pathname)||parsed.protocol!=='https:')continue;
   if(fullName.length<3||fullName.length>130)continue;
   const profileUrl=parsed.origin+parsed.pathname.replace(/\/$/,'');
   if(seen.has(profileUrl))continue;
   seen.add(profileUrl);
   const lines=(Array.isArray(card.lines)?card.lines:[]).map(v=>String(v||'').replace(/\s+/g,' ').trim()).filter(Boolean);
   const body=lines.filter(x=>x!==fullName&&!ignore.test(x)&&!/^\d+(st|nd|rd|th|°)\s*(degree|grado)?$/i.test(x));
   let jobTitle=String(card.roleText||'').replace(/\s+/g,' ').trim();
   let companyName=String(card.companyText||'').replace(/\s+/g,' ').trim();
   if(jobTitle&&companyName&&jobTitle.includes(companyName))jobTitle=jobTitle.replace(companyName,'').replace(/[·•|\s]+$/,'').trim();
   if(jobTitle&&!companyName){
    const parts=jobTitle.match(/^(.{2,120}?)\s*[·•]\s*(.{2,180})$/);
    if(parts){jobTitle=parts[1].trim();companyName=parts[2].trim()}
   }
   const noise=/^(?:informazioni:|information:|mostra altro|see more|salva|save|messaggio|message|\d+\s+(?:anni|mesi|years|months|collegamenti|connections)\b)/i;
   for(const line of [card.positionText,...body].filter(Boolean)){
    if(line.length>300||noise.test(line))continue;
    const parts=line.match(/^(.{2,120}?)\s+[·•|]\s+(.{2,180})$/);
    const at=line.match(/^(.{2,120}?)\s+(?:at|presso|chez)\s+(.{2,180})$/i);
    const matched=parts||at;
    if(!matched)continue;
    const left=matched[1].trim(),right=matched[2].trim();
    if(/^(?:\d+[°º]|\d+(?:st|nd|rd|th)|1st|2nd|3rd)$/i.test(right))continue;
    if(/\b(?:anni|mesi|years|months)\s+(?:nel ruolo|in the role)\b/i.test(right))continue;
    if(left===fullName||noise.test(left)||noise.test(right))continue;
    if(!jobTitle)jobTitle=left;
    if(!companyName)companyName=right;
    if(jobTitle&&companyName)break;
   }
   // «Titolare dell'azienda Tecnomac srl»: the company is written inside the title.
   if(jobTitle&&!companyName){
    const own=jobTitle.match(/^(titolare|proprietari[oa]|owner|ceo|amministratore(?: delegato| unico)?|fondat(?:ore|rice)|founder|co-?founder)\s+(?:dell['’]azienda|della società|di|del|della|presso|at|of|@)\s+(.{2,120})$/i);
    if(own){jobTitle=own[1];companyName=own[2].trim()}
   }
   if(!jobTitle){
    jobTitle=body.find(x=>x.length<180&&/\b(ceo|founder|director|manager|head|responsabile|direttore|presidente|owner|proprietario|titolare|amministratore|imprenditore)\b/i.test(x)&&!/^informazioni:/i.test(x))||'';
   }
   const location=clean(card.locationText);
   rows.push({fullName,...splitName(fullName),jobTitle:jobTitle.slice(0,180),companyName:companyName.slice(0,180),location:location.length<=180?location:'',profileUrl,sourceUrl});
  }
  return rows;
 }
 // "Next"/"Avanti" pagination controls: by class, by aria-label, or a button or link whose own text is the word.
 const NEXT_SEL='button.artdeco-pagination__button--next,button[aria-label*="Next" i],button[aria-label*="Avanti" i],button[aria-label*="Successiv" i],a[aria-label*="Next" i],a[aria-label*="Avanti" i],a[aria-label*="Successiv" i]';
 const NEXT_TEXT=/^(avanti|next|successiv[ao])$/i;
 function nextCandidates(doc){
  const out=new Set(Array.from(doc.querySelectorAll(NEXT_SEL)));
  for(const el of Array.from(doc.querySelectorAll('button,a[role="button"]')))if(NEXT_TEXT.test(clean(el.textContent)))out.add(el);
  return Array.from(out);
 }
 const disabledEl=el=>el.disabled||el.getAttribute('aria-disabled')==='true'||/disabled/.test(el.className||'');
 // Where the pagination stands: 'next' (an enabled «Avanti» is on screen, in el), 'last' (only a disabled one:
 // last page) or 'none' (no pagination rendered yet: Sales Navigator draws it late, at the bottom).
 function paginationState(doc){
  doc=doc||document;
  let last=false;
  for(const el of nextCandidates(doc)){
   if(!visible(el))continue;
   if(disabledEl(el)){last=true;continue}
   return {state:'next',el};
  }
  return {state:last?'last':'none',el:null};
 }
 // Visible "Next"/"Avanti" pagination control, only when enabled.
 function findNextButton(doc){return paginationState(doc).el}
 // Any login, checkpoint or CAPTCHA screen stops the import: the user resolves it by hand.
 function detectChallenge(doc){
  doc=doc||document;
  const href=doc.location?doc.location.href:'';
  if(/\/(login|checkpoint|challenge|authwall|uas\/login|sales\/login)/i.test(href))return 'login';
  if(Array.from(doc.querySelectorAll('iframe[src*="captcha" i],iframe[title*="captcha" i],#captcha-internal,[id*="captcha" i],form[action*="checkpoint" i],form[action*="login" i] input[type="password"]')).some(visible))return 'captcha';
  const heading=clean(Array.from(doc.querySelectorAll('h1,h2')).slice(0,6).map(h=>h.textContent).join(' '));
  if(/verifica di sicurezza|controllo di sicurezza|security (check|verification)|verify you.?re (a )?human|accedi per continuare|sign in to continue/i.test(heading))return 'captcha';
  return '';
 }
 // Approximate result total as printed by Sales Navigator ("1.234 risultati"), display only.
 function resultsTotalText(doc){
  doc=doc||document;
  for(const el of Array.from(doc.querySelectorAll('span,div,h1,h2,p')).slice(0,1500)){
   if(el.children.length>2||!visible(el))continue;
   const m=clean(el.textContent).match(/^(?:circa\s+|about\s+)?([\d.,]+\s?[KkMm]?\+?)\s+(risultati|results|lead)$/i);
   if(m)return m[1]+' '+m[2].toLowerCase();
  }
  return '';
 }
 function lastProfileAnchor(doc){const list=profileAnchors(doc);return list.length?list[list.length-1].a:null}
 function firstProfileKey(doc){const list=profileAnchors(doc);return list.length?list[0].url.pathname:''}
 // Nearest scrollable box around the results (Sales Navigator scrolls an inner container, not the window).
 function scrollParent(el){
  const view=el&&el.ownerDocument&&el.ownerDocument.defaultView;
  for(let node=el&&el.parentElement;node&&view;node=node.parentElement){
   if(node===node.ownerDocument.body||node===node.ownerDocument.documentElement)break;
   const oy=view.getComputedStyle(node).overflowY;
   if(/(auto|scroll|overlay)/.test(oy)&&node.scrollHeight>node.clientHeight+10)return node;
  }
  return null;
 }
 const api={visibleSearchCards,normalizeVisibleCards,splitName,findNextButton,detectChallenge,resultsTotalText,lastProfileAnchor,firstProfileKey,scrollParent,paginationState};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixExtract=api;
})(typeof window!=='undefined'?window:globalThis);
