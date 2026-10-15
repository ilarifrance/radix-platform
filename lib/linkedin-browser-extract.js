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
    out.push({fullName:name,profileUrl,lines});seen.add(profileUrl);
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
    const role = body.find(x => x.length < 180 && (/\b(at|presso|chez)\b/i.test(x) || /\b(ceo|founder|director|manager|head|responsabile|direttore|presidente|owner)\b/i.test(x))) || '';
    let jobTitle = role, companyName = '';
    const match = role.match(/^(.+?)\s+(?:at|presso|chez)\s+(.+)$/i);
    if (match) { jobTitle = match[1]; companyName = match[2]; }
    rows.push({fullName,jobTitle:jobTitle.slice(0,180),companyName:companyName.slice(0,180),profileUrl,sourceUrl});
  }
  return rows;
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
module.exports = {visibleSearchCards, normalizeVisibleCards, csvExport};
