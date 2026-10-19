'use strict';
// Browser extraction is limited to information rendered in the visible page.
function visibleSearchCards() {
  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const links = Array.from(document.querySelectorAll('a[href]'));
  const out = [], seen = new Set();
  for (const a of links) {
    let url;
    try { url = new URL(a.getAttribute('href'), location.href); } catch { continue; }
    if (!['www.linkedin.com','linkedin.com'].includes(url.hostname)) continue;
    if (!/^\/(sales\/lead\/|in\/)/.test(url.pathname)) continue;
    if (!a.getClientRects().length) continue;
    const profileUrl = url.origin + url.pathname.replace(/\/$/, '');
    if (seen.has(profileUrl)) continue;
    const name = clean(a.innerText || a.getAttribute('aria-label')).split(/\s+[•·]\s*|\n/)[0].trim();
    if (!name || name.length < 3 || name.length > 130 || !/[a-zA-ZÀ-ÿ]/.test(name)) continue;
    if (/^(view profile|visualizza profilo|open|apri|save|salva|message|messaggio)$/i.test(name)) continue;
    const card = a.closest('li.artdeco-list__item,li[data-view-name],.search-results__result-item,article,[data-testid*="search-result"],li') || a.parentElement?.parentElement?.parentElement;
    const lines = (card?.innerText || '').split(/\n+/).map(clean).filter(Boolean).slice(0, 25);
    // Read the position row directly from the rendered DOM. On Sales Navigator
    // the visual dot may be a separate span, lost when card.innerText is flattened.
    // Keep these values separate rather than attempting to infer employers later.
    const visible = el => !!(el && el.getClientRects().length);
    const field = selector => {
      const el = card?.querySelector(selector);
      return visible(el) ? clean(el.innerText || el.textContent) : '';
    };
    const roleText = field('[data-anonymize="title"]');
    const companyText = field('[data-anonymize="company-name"]');
    let positionText = '';
    if (!roleText || !companyText) {
      const candidates = Array.from(card?.querySelectorAll('span,div,p') || []);
      for (const element of candidates) {
        if (!visible(element) || element.contains(a)) continue;
        const value = clean(element.innerText || element.textContent);
        // Do not treat connection degree or profile name as position.
        if (value.length < 5 || value.length > 240 || value.includes(name)) continue;
        if (!/[·•]/.test(value)) continue;
        const match = value.match(/^(.{2,120}?)\s*[·•]\s*(.{2,180})$/);
        if (match && !/^\d+[°º]$/.test(match[2].trim())) {
          positionText = value;
          break;
        }
      }
    }
    out.push({fullName:name,profileUrl,lines,roleText,companyText,positionText});seen.add(profileUrl);
  }
  return out;
}
function normalizeVisibleCards(cards, sourceUrl) {
  if (!Array.isArray(cards)) throw Error('Lista risultati non valida');
  const ignore = /^(save|saved|salva|salvato|message|messaggio|connect|collegati|see more|mostra altro|visualizza|view profile|apri profilo|lead details|altre azioni|more)$/i;
  const rows = [], seen = new Set();
  for (const card of cards) {
    if (!card || typeof card !== 'object') continue;
    const fullName = String(card.fullName || '').replace(/\s+/g, ' ').trim();
    let parsed;
    try { parsed = new URL(String(card.profileUrl || '')); } catch { continue; }
    if (!['www.linkedin.com', 'linkedin.com'].includes(parsed.hostname) || !/^\/(sales\/lead\/|in\/)/.test(parsed.pathname) || parsed.protocol !== 'https:') continue;
    if (fullName.length < 3 || fullName.length > 130) continue;
    const profileUrl = parsed.origin + parsed.pathname.replace(/\/$/, '');
    if (seen.has(profileUrl)) continue;
    seen.add(profileUrl);
    const lines = (Array.isArray(card.lines) ? card.lines : []).map(v => String(v || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const body = lines.filter(x => x !== fullName && !ignore.test(x) && !/^\d+(st|nd|rd|th|°)\s*(degree|grado)?$/i.test(x));
    // Sales Navigator displays the position as "Ruolo · Azienda", frequently
    // without English role keywords. Treat explicit separators as authoritative;
    // never guess a company from a location, bio or an event description.
    let jobTitle = String(card.roleText || '').replace(/\s+/g,' ').trim();
    let companyName = String(card.companyText || '').replace(/\s+/g,' ').trim();
    if (jobTitle && companyName && jobTitle.includes(companyName)) {
      jobTitle = jobTitle.replace(companyName,'').replace(/[·•|\s]+$/,'').trim();
    }
    if (jobTitle && !companyName) {
      const parts = jobTitle.match(/^(.{2,120}?)\s*[·•]\s*(.{2,180})$/);
      if (parts) {jobTitle = parts[1].trim();companyName = parts[2].trim();}
    }
    const noise = /^(?:informazioni:|information:|mostra altro|see more|salva|save|messaggio|message|\d+\s+(?:anni|mesi|years|months|collegamenti|connections)\b)/i;
    for (const line of [card.positionText, ...body].filter(Boolean)) {
      if (line.length > 300 || noise.test(line)) continue;
      const parts = line.match(/^(.{2,120}?)\s+[·•|]\s+(.{2,180})$/);
      const at = line.match(/^(.{2,120}?)\s+(?:at|presso|chez)\s+(.{2,180})$/i);
      const matched = parts || at;
      if (!matched) continue;
      const left = matched[1].trim(), right = matched[2].trim();
      if (/^(?:\d+[°º]|\d+(?:st|nd|rd|th)|1st|2nd|3rd)$/i.test(right)) continue;
      if (/\b(?:anni|mesi|years|months)\s+(?:nel ruolo|in the role)\b/i.test(right)) continue;
      if (left === fullName || noise.test(left) || noise.test(right)) continue;
      if (!jobTitle) jobTitle = left;
      if (!companyName) companyName = right;
      if (jobTitle && companyName) break;
    }
    if (!jobTitle) {
      // When the company is not explicitly separated, keep only an identifiable
      // role and leave the company empty instead of manufacturing an employer.
      const role = body.find(x => x.length < 180 && /\b(ceo|founder|director|manager|head|responsabile|direttore|presidente|owner|proprietario|titolare|amministratore|imprenditore)\b/i.test(x) && !/^informazioni:/i.test(x)) || '';
      jobTitle = role;
    }
    rows.push({fullName,jobTitle:jobTitle.slice(0,180),companyName:companyName.slice(0,180),profileUrl,sourceUrl});
  }
  return rows;
}

// Reads only fields visible on the open individual lead profile.
// Do not infer private contact details or guess employer from arbitrary text.
function visibleProfileDetails() {
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const visible=el=>!!(el&&el.getClientRects().length);
 const get=selector=>{
  for(const el of document.querySelectorAll(selector)){
   if(visible(el)){const value=clean(el.innerText||el.textContent);if(value&&value.length<250)return value;}
  }
  return '';
 };
 const heading=get('[data-anonymize="person-name"],h1');
 const title=get('[data-anonymize="title"]');
 const company=get('[data-anonymize="company-name"]');
 const location=get('[data-anonymize="location"]');
 const headingText=get('main h2');
 const lines=(document.querySelector('main')?.innerText||'').split(/\n+/).map(clean).filter(Boolean).slice(0,65);
 return {fullName:heading,roleText:title,companyText:company,location,headingText,lines};
}
function normalizeProfileDetails(raw,current,sourceUrl) {
 if(!raw||typeof raw!=='object'||!current||!current.profileUrl)return current;
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const out={...current};
 const role=clean(raw.roleText);
 const company=clean(raw.companyText);
 const knownBad=/^(?:mostra altro|see more|informazioni|about|esperienze|experience|contatta|contact|visualizza|view|salva|save)$/i;
 const split=value=>{
  const match=value.match(/^(.{2,120}?)\s*[·•|]\s*(.{2,180})$/);
  return match?[clean(match[1]),clean(match[2])]:null;
 };
 let parsed=split(role);
 let jobTitle=parsed?parsed[0]:role;
 let companyName=company||(parsed?parsed[1]:'');
 if(!companyName){
  for(const line of (Array.isArray(raw.lines)?raw.lines:[])){
   const pieces=split(clean(line));
   if(pieces&&!pieces[0].includes('°')&&!/^\d+(?:st|nd|rd|th|°)$/i.test(pieces[1])) {
    if(!jobTitle)jobTitle=pieces[0];
    companyName=pieces[1];
    break;
   }
  }
 }
 const accept=v=>v&&v.length<=180&&!knownBad.test(v)&&!/mostra altro|see more/i.test(v);
 // Explicit profile fields win over ambiguous search snippets.
 if(accept(jobTitle))out.jobTitle=jobTitle;
 if(accept(companyName))out.companyName=companyName;
 const loc=clean(raw.location);
 if(loc&&loc.length<=180&&!knownBad.test(loc))out.location=loc;
 out.sourceUrl=sourceUrl||current.sourceUrl;
 return out;
}
function csvExport(job) {
  const cols = ['fullName','firstName','lastName','jobTitle','companyName','companyDomain','profileUrl','companyUrl','email','phone','location','country','industry','companySize','sourceUrl'];
  const esc = value => {
    let v = String(value || '');
    if (/^[=+@-]/.test(v)) v = "'" + v;
    return '"' + v.replace(/"/g, '""') + '"';
  };
  return '\ufeff' + [cols.join(','), ...(job.records || []).map(row => cols.map(c => esc(row[c])).join(','))].join('\r\n');
}
module.exports = {visibleSearchCards, normalizeVisibleCards, visibleProfileDetails, normalizeProfileDetails, csvExport};
