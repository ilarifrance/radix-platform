/* English for the CRM pages (radix-sales.html and the Sales pages in sales/sales-nav.js) and the Command Center pages
   (control-center-v2, Project manager, Settings, Agents, Archive, Project profile, All areas), without rewriting them.
   The pages keep writing Italian; with the language set to English this layer swaps the known UI strings for
   their English version as they reach the page: text nodes, a few attributes (placeholder, title, aria-label, alt,
   button values), <title>, and the messages of confirm()/alert()/prompt(). Only strings in the dictionary
   (lib/radix-i18n-en.js) change, exactly or through its {0}-placeholder patterns, so record data (names, notes,
   companies) stays as typed. Dates and numbers formatted for 'it-IT' come out as 'en-GB' (26 Oct 2026, €1,200.00).
   Italian is the default and then nothing here runs except the language switch in the top bar.
   Language: ?lang=en|it in the URL (remembered), else localStorage «rx-lang», else Italian.
   UMD: the pure translator for the tests (tests/radix-i18n.test.js); in the browser it starts at once, in <head>. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.RadixI18n = api; if (root.document) api.boot(root); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEY = 'rx-lang';
  const LANGS = ['it', 'en'];

  // ---- language choice -------------------------------------------------------------------------------------
  function readLang(win) {
    let lang = null;
    try {
      const q = new URLSearchParams(win.location.search).get('lang');
      if (LANGS.includes(q)) { lang = q; try { win.localStorage.setItem(KEY, q); } catch (e) { /* storage off */ } }
    } catch (e) { /* no URL */ }
    if (!lang) { try { const s = win.localStorage.getItem(KEY); if (LANGS.includes(s)) lang = s; } catch (e) { /* storage off */ } }
    return lang || 'it';
  }
  function saveLang(win, lang) {
    if (!LANGS.includes(lang)) return false;
    try { win.localStorage.setItem(KEY, lang); return true; } catch (e) { return false; }
  }

  // ---- dates written by the pages themselves -----------------------------------------------------------------
  const MONTHS = { gennaio: 'January', febbraio: 'February', marzo: 'March', aprile: 'April', maggio: 'May', giugno: 'June', luglio: 'July', agosto: 'August', settembre: 'September', ottobre: 'October', novembre: 'November', dicembre: 'December',
    gen: 'Jan', feb: 'Feb', mar: 'Mar', apr: 'Apr', mag: 'May', giu: 'Jun', lug: 'Jul', ago: 'Aug', set: 'Sep', sett: 'Sep', ott: 'Oct', nov: 'Nov', dic: 'Dec' };
  const DAYS = { 'lunedì': 'Monday', 'martedì': 'Tuesday', 'mercoledì': 'Wednesday', 'giovedì': 'Thursday', 'venerdì': 'Friday', 'sabato': 'Saturday', 'domenica': 'Sunday',
    lun: 'Mon', mer: 'Wed', gio: 'Thu', ven: 'Fri', sab: 'Sat', dom: 'Sun' };
  const DATE_WORDS = Object.assign({}, MONTHS, DAYS, { alle: 'at', ore: '', oggi: 'today', ieri: 'yesterday', domani: 'tomorrow' });
  const WORD = '(?:' + Object.keys(DATE_WORDS).sort((a, b) => b.length - a.length).join('|') + ')';
  // A string made only of date words, numbers and separators: «lunedì 26 ottobre», «26 ott · 14:30», «Ott 2026».
  const DATE_ONLY = new RegExp('^(?:(?:' + WORD + ')\\.?|\\d{1,4}|[\\s,.:/–\\-·h]+)+$', 'i');
  const DATE_TOKEN = new RegExp('(^|[^\\p{L}])(' + WORD + ')(?=$|[^\\p{L}])', 'giu');
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function dateWords(s) {
    if (!/\d/.test(s) && !/\s/.test(s.trim())) return null; // a lone word goes through the dictionary
    if (!DATE_ONLY.test(s) || !new RegExp(WORD, 'i').test(s)) return null;
    const out = s.replace(DATE_TOKEN, (m, pre, w) => { const en = DATE_WORDS[w.toLowerCase()]; return pre + (en === undefined ? w : w[0] !== w[0].toLowerCase() ? cap(en) : en); })
      .replace(/\bat (\d{1,2})[.:](\d{2})\b/g, 'at $1:$2').replace(/\s{2,}/g, ' ');
    return out === s ? null : out;
  }

  // ---- the translator (pure) ---------------------------------------------------------------------------------
  const SLOT = /\{(\d+)\}/g;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  // English singulars after «1 »: «1 tasks» → «1 task».
  const SINGULAR = { tasks: 'task', contacts: 'contact', companies: 'company', deals: 'deal', days: 'day', hours: 'hour', minutes: 'minute', weeks: 'week', months: 'month', years: 'year', records: 'record', rows: 'row', activities: 'activity', opportunities: 'opportunity', leads: 'lead', interactions: 'interaction', emails: 'email', calls: 'call', results: 'result', items: 'item', files: 'file', lists: 'list', fields: 'field', meetings: 'meeting', notes: 'note', messages: 'message', recipients: 'recipient', products: 'product', quotes: 'quote', invoices: 'invoice', campaigns: 'campaign', steps: 'step', members: 'member', addresses: 'address', duplicates: 'duplicate', groups: 'group', prospects: 'prospect', tickets: 'ticket', segments: 'segment', reports: 'report', stages: 'stage', rules: 'rule', mailboxes: 'mailbox', sends: 'send', clicks: 'click', replies: 'reply', changes: 'change', errors: 'error', slots: 'slot', events: 'event', columns: 'column', values: 'value', lines: 'line', sheets: 'sheet', pages: 'page', characters: 'character', credits: 'credit', profiles: 'profile', projects: 'project', versions: 'version', suggestions: 'suggestion', accounts: 'account', people: 'person', overdue: 'overdue', open: 'open', completed: 'completed' };
  function singular(s) {
    return s.replace(/(^|[^\d.,])1 ((?:[a-z]+-[a-z]+ )?)([a-z]+)\b/g, (m, pre, adj, w) => SINGULAR[w] && SINGULAR[w] !== w ? pre + '1 ' + adj + SINGULAR[w] : m);
  }

  // A slot glued to an Italian word stem carries a gender/number ending, which English cannot reuse.
  const GENDER = /[a-zà-ù][bcdfghlmnpqrstvz]\{\d+\}/u;
  const LOAN = /(email|account|lead|link|post|ticket|task|report)(?=\{)/g;

  // ---- money: the one helper for amounts in English mode --------------------------------------------------------
  // Stored amounts are unchanged; on screen the English CRM shows pounds: «€ 1,200», «1,200 €» → «£1,200».
  const NUM = '\\d[\\d.,\\u00a0\\u202f]*(?:\\s?[KkMm](?!\\p{L}))?';
  const PRE = new RegExp('€[\\s\\u00a0\\u202f]?(' + NUM + ')', 'gu');
  const POST = new RegExp('(' + NUM + ')[\\s\\u00a0\\u202f]?€', 'gu');
  function money(s) {
    if (typeof s !== 'string' || (s.indexOf('€') < 0 && s.indexOf('EUR') < 0)) return s;
    return s.replace(PRE, (m, n) => '£' + n.trim()).replace(POST, (m, n) => '£' + n.trim())
      .replace(/€/g, '£').replace(/\bEUR\b/g, 'GBP').replace(/\beuro\b/gi, w => (w[0] === 'E' ? 'Pounds' : 'pounds'));
  }
  function gbp(o) {
    if (!o || typeof o !== 'object' || String(o.currency || '').toUpperCase() !== 'EUR') return o;
    return Object.assign({}, o, { currency: 'GBP' });
  }

  function compile(dict, extra) {
    const exact = new Map(), lower = new Map(), patterns = [];
    for (const k of Object.keys(dict || {})) {
      const key = norm(k), val = dict[k];
      if (typeof val !== 'string' || !key) continue;
      if (/\{\d+\}/.test(key)) {
        const parts = key.split(/(\{\d+\})/).filter(p => p !== '');
        const slots = [];
        // A slot glued to the word before it is an optional tail («venerdì{0},» with {0} = «» or « e sabato»): it may be empty.
        // «{0}{1}»: two slots side by side cannot be split reliably, so the first takes everything and the next is empty.
        const isSlot = x => /^\{\d+\}$/.test(x || '');
        const src = parts.map((p, i) => {
          const m = /^\{(\d+)\}$/.exec(p);
          if (!m) return esc(p);
          slots.push(+m[1]);
          if (isSlot(parts[i - 1])) return '()';
          if (isSlot(parts[i + 1])) return '(.+)';
          return i > 0 && /\S$/.test(parts[i - 1]) ? '(.*?)' : '(.+?)';
        }).join('');
        const literal = key.replace(SLOT, ' ').trim();
        if (!literal.replace(/[^\p{L}\p{N}]/gu, '')) continue; // «{0} · {1}»: separators alone are not a UI string
        if (GENDER.test(key.replace(LOAN, ''))) continue; // «Nuov{0}», «trovat{1}»: an Italian ending in the slot
        const pieces = key.split(SLOT).filter((p, i) => i % 2 === 0).map(p => p.trim()).filter(Boolean);
        const anchor = pieces.slice().sort((a, b) => b.length - a.length)[0] || '';
        // Strong: a word of 4+ letters around the slots, so «{0} e {1}» never rewrites «Rossi e Figli».
        const strong = /\p{L}{4,}/u.test(literal) || /\d/.test(literal);
        const edge = !/^\{\d+\}/.test(key) || !/\{\d+\}$/.test(key);
        patterns.push({ re: new RegExp('^' + src + '$', 'u'), slots, val, anchor, strong, edge, weight: literal.length, sep: / · | — | \| /.test(key) });
      } else {
        exact.set(key, val);
        const lk = key.toLowerCase();
        if (!lower.has(lk)) lower.set(lk, val);
      }
    }
    patterns.sort((a, b) => b.weight - a.weight);
    const handPatterns = (extra || []).map(p => ({ re: p[0], fn: p[1] }));
    const cache = new Map();

    function exactOf(s) {
      if (exact.has(s)) return exact.get(s);
      // «aperta» in a sentence / «Aperta» as a label: same entry, the case of the first letter follows the page.
      const lv = lower.get(s.toLowerCase());
      if (lv !== undefined && s.toLowerCase() !== s.toUpperCase()) {
        if (s === s.toUpperCase() && /\p{L}{2}/u.test(s)) return lv.toUpperCase();
        const f = s.charAt(0);
        if (f === f.toLowerCase() && f !== f.toUpperCase()) return lv.charAt(0).toLowerCase() + lv.slice(1);
        if (f === f.toUpperCase() && f !== f.toLowerCase()) return cap(lv);
      }
      return undefined;
    }

    // s: one normalised string (no outer spaces). depth > 0: a value captured by a pattern.
    function core(s, depth) {
      if (!s || !/\p{L}/u.test(s)) return null;
      let hit = exactOf(s);
      if (hit !== undefined) return hit;
      const dw = dateWords(s);
      if (dw) return dw;
      for (const h of handPatterns) { const m = h.re.exec(s); if (m) { const r = h.fn(m, x => tr(x, depth + 1)); if (r != null) return r; } }
      // Symbols and punctuation around a known string: «+ Nuova azienda», «Salvato.», «Note:», «Apri ↗», «(Bozza)».
      const am = /^([^\p{L}\p{N}«"']*)(.*?)([\s:.,;…!?*↗→›»)\]↑↓]*)$/u.exec(s);
      if (am && (am[1] || am[3]) && am[2] && am[2] !== s) {
        hit = exactOf(am[2]);
        if (hit === undefined && /^[«"'].*[»"']$/.test(am[2])) { const q = exactOf(am[2].slice(1, -1)); if (q !== undefined) hit = am[2][0] + q + am[2].slice(-1); }
        if (hit !== undefined) return am[1] + hit + am[3];
      }
      for (const p of patterns) {
        if (p.anchor && s.indexOf(p.anchor) < 0) continue;
        if (!p.strong && !(depth > 0 && p.edge)) continue;
        const m = p.re.exec(s);
        // A capture holding « · » when the key has none: the string is pieces joined together, split it below.
        if (m && !p.sep && m.slice(1).some(v => /(^|\s)[·—|](\s|$)/.test(v))) continue;
        if (!m) continue;
        const caps = {};
        p.slots.forEach((n, i) => { const v = m[i + 1]; caps[n] = depth < 3 && v ? (tr(v, depth + 1) ?? v) : v; });
        return p.val.replace(SLOT, (x, n) => (caps[n] !== undefined ? caps[n] : x));
      }
      // Pieces joined by separators: «3 aperte · 1 scaduta», «Bozza — salvata».
      for (const sep of [' · ', ' — ', ' – ', ' | ', ' • ', ' / ']) {
        if (s.indexOf(sep) < 0) continue;
        const parts = s.split(sep);
        let changed = false;
        const out = parts.map(x => { const t = tr(x, depth); if (t != null && t !== x) { changed = true; return t; } return x; });
        if (changed) return out.join(sep);
      }
      // Sentences built from separate pieces: «Vinte 2 su 3 chiuse (67%). Vinto € 5.000 in più…», «…; 1 scaduta».
      if (depth < 2) {
        const sents = s.split(/(?<=[.!?;])\s+(?=[\p{Lu}\d«])/u);
        if (sents.length > 1) {
          let changed = false;
          const out = sents.map(x => { const t = tr(x, depth + 1); if (t != null && t !== x) { changed = true; return t; } return x; });
          if (changed) return out.join(' ');
        }
      }
      // Symbols around a string that only a pattern knows: «; 1 scaduta e non completata.»
      if (am && (am[1] || am[3]) && am[2] && am[2] !== s && depth < 2) { const r = tr(am[2], depth + 1); if (r != null) return am[1] + r + am[3]; }
      // «Etichetta: valore» where only the label is known.
      const cm = /^([^:]{2,40}):\s(.+)$/u.exec(s);
      if (cm) { const lab = exactOf(cm[1]); if (lab !== undefined) { const v = depth < 3 ? (tr(cm[2], depth + 1) ?? cm[2]) : cm[2]; return lab + ': ' + v; } }
      return null;
    }
    // Keeps the outer whitespace; null when nothing is known about the string.
    function tr(text, depth) {
      if (text == null) return null;
      const str = String(text);
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(str);
      const body = norm(m[2]);
      if (!body) return null;
      const d = depth || 0;
      let out;
      if (d === 0 && cache.has(body)) out = cache.get(body);
      else {
        out = core(body, d);
        if (out != null) out = singular(out);
        if (d === 0) { if (cache.size > 20000) cache.clear(); cache.set(body, out); }
      }
      return out == null ? null : m[1] + out + m[3];
    }
    // Multi-line messages (confirm/alert): each line on its own.
    function message(text) {
      const s = String(text == null ? '' : text);
      return display(s, true) ?? s;
    }
    // display(): the full English form of a UI string, translation plus pounds; tr() stays null for unknowns.
    function display(s, lines) {
      // Several lines (a tooltip, a message): each line on its own, so a pattern never swallows the next line.
      let o = tr(s);
      if (typeof s === 'string' && s.trim().indexOf('\n') >= 0) {
        let n = 0;
        const per = s.split('\n').map(line => { const t = tr(line); if (t != null) n++; return t ?? line; }).join('\n');
        if (lines ? n >= 2 || o == null : o == null) o = per;
      }
      if (o === s) o = null;
      const m = money(o != null ? o : s);
      return m === s ? null : m;
    }
    return { t: s => money(display(s) ?? s), tr: s => tr(s), display, message, size: exact.size + patterns.length };
  }

  // Strings with counts, built in many places; checked before the dictionary patterns.
  const P = (n, one, many) => (String(n) === '1' ? one : many);
  const HAND = [
    [/^(\d+) giorn[oi] fa$/, m => m[1] + ' ' + P(m[1], 'day', 'days') + ' ago'],
    [/^(\d+) or[ae] fa$/, m => m[1] + ' ' + P(m[1], 'hour', 'hours') + ' ago'],
    [/^(\d+) minut[oi] fa$/, m => m[1] + ' ' + P(m[1], 'minute', 'minutes') + ' ago'],
    [/^(\d+) settiman[ae] fa$/, m => m[1] + ' ' + P(m[1], 'week', 'weeks') + ' ago'],
    [/^(\d+) mes[ei] fa$/, m => m[1] + ' ' + P(m[1], 'month', 'months') + ' ago'],
    [/^tra (\d+) giorn[oi]$/i, m => 'in ' + m[1] + ' ' + P(m[1], 'day', 'days')],
    [/^(\d+) giorn[oi]$/, m => m[1] + ' ' + P(m[1], 'day', 'days')],
    [/^(\d+) or[ae]$/, m => m[1] + ' ' + P(m[1], 'hour', 'hours')],
    [/^(\d+) minut[oi]$/, m => m[1] + ' ' + P(m[1], 'minute', 'minutes')],
    [/^(\d+) g$/, m => m[1] + ' d'],
    [/^(\d+) g (\d+) h$/, m => m[1] + ' d ' + m[2] + ' h'],
    [/^Ieri(?: alle (\d{1,2}[:.]\d{2}))?$/, m => 'Yesterday' + (m[1] ? ' at ' + m[1].replace('.', ':') : '')],
    [/^Oggi(?: alle (\d{1,2}[:.]\d{2}))?$/, m => 'Today' + (m[1] ? ' at ' + m[1].replace('.', ':') : '')],
    [/^Domani(?: alle (\d{1,2}[:.]\d{2}))?$/, m => 'Tomorrow' + (m[1] ? ' at ' + m[1].replace('.', ':') : '')],
    [/^(\d+) scadut[aeio]$/, m => m[1] + ' overdue'],
    [/^(\d+) apert[aeio]$/, m => m[1] + ' open'],
    [/^(\d+) chius[aeio]$/, m => m[1] + ' closed'],
    [/^(\d+) vint[aeio]$/, m => m[1] + ' won'],
    [/^(\d+) pers[aeio]$/, m => m[1] + ' lost'],
    [/^(\d+) completat[aeio]$/, m => m[1] + ' completed'],
    [/^(\d+) assegnat[aeio] a te$/, m => m[1] + ' assigned to you'],
    [/^(\d+) attività scadut[ae]$/, m => m[1] + ' overdue ' + P(m[1], 'task', 'tasks')],
    [/^(\d+) attività$/, m => m[1] + ' ' + P(m[1], 'task', 'tasks')],
    [/^(\d+) trattativ[ae]$/, m => m[1] + ' ' + P(m[1], 'deal', 'deals')],
    [/^(\d+) contatt[oi]$/, m => m[1] + ' ' + P(m[1], 'contact', 'contacts')],
    [/^(\d+) aziend[ae]$/, m => m[1] + ' ' + P(m[1], 'company', 'companies')],
    [/^(\d+) interazion[ei]$/, m => m[1] + ' ' + P(m[1], 'interaction', 'interactions')],
    [/^(\d+) opportunità$/, m => m[1] + ' ' + P(m[1], 'opportunity', 'opportunities')],
    [/^(\d+) element[oi]$/, m => m[1] + ' ' + P(m[1], 'item', 'items')],
    [/^(\d+) record caricati$/, m => m[1] + ' ' + P(m[1], 'record', 'records') + ' loaded'],
    [/^(\d+) scadut[ae] e non completat[ae]$/, m => m[1] + ' overdue and not completed'],
    [/^(\d+) righ[ae]$/, m => m[1] + ' ' + P(m[1], 'row', 'rows')],
    [/^(\d+) mes[ei]$/, m => m[1] + ' ' + P(m[1], 'month', 'months')],
    [/^(\d+) total[ei]$/, m => m[1] + ' total'],
    [/^(\d+) attiv[aeio]$/, m => m[1] + ' active'],
    [/^(\d+) registrat[aeio]$/, m => m[1] + ' recorded'],
    [/^(\d+) a rischio$/, m => m[1] + ' at risk'],
    [/^su (\d+) vint[ae]$/, m => 'over ' + m[1] + ' won'],
    [/^entro (.+)$/, (m, t) => { const v = t(m[1]); return v == null ? null : 'within ' + v; }],
    // Sequence presets: «Nuovo contatto · 3 tocchi (g0 email, g3 telefonata, g7 email)».
    [/^(.+) \(((?:g\d+ (?:email|telefonata|attività)(?:, )?)+)\)$/, (m, t) => {
      const steps = m[2].replace(/g(\d+)/g, 'd$1').replace(/telefonata/g, 'call').replace(/attività/g, 'task');
      return (t(m[1]) ?? m[1]) + ' (' + steps + ')';
    }],
    [/^(\d+) di (\d+)$/, m => m[1] + ' of ' + m[2]],
    [/^Pagina (\d+) di (\d+)$/, m => 'Page ' + m[1] + ' of ' + m[2]]
  ];

  // ---- browser -----------------------------------------------------------------------------------------------
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'aria-description', 'label', 'data-tip', 'aria-roledescription', 'value', 'data-label'];
  const SKIP = 'script,style,textarea,code,noscript,[data-i18n-skip],[translate="no"],[contenteditable=""],[contenteditable="true"]';

  // 'it-IT' (and no locale) → 'en-GB' while the page is English; any other explicit locale stays as written.
  function mapLocale(l) {
    if (l === undefined || l === null) return 'en-GB';
    if (Array.isArray(l)) return l.length ? l.map(mapLocale) : 'en-GB';
    return /^it(-|$)/i.test(String(l)) ? 'en-GB' : l;
  }
  function shimLocales(win) {
    const I = win.Intl;
    ['DateTimeFormat', 'NumberFormat', 'RelativeTimeFormat', 'PluralRules', 'ListFormat', 'DisplayNames'].forEach(name => {
      const Orig = I && I[name];
      if (typeof Orig !== 'function') return;
      const Shim = function (l, o) { return new Orig(mapLocale(l), name === 'NumberFormat' ? gbp(o) : o); };
      Shim.prototype = Orig.prototype;
      Shim.supportedLocalesOf = Orig.supportedLocalesOf;
      try { I[name] = Shim; } catch (e) { /* frozen */ }
    });
    [[win.Date.prototype, ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']], [win.Number.prototype, ['toLocaleString']]].forEach(([proto, names]) => names.forEach(n => {
      const orig = proto[n];
      const num = proto === win.Number.prototype;
      proto[n] = function (l, o) { return orig.call(this, mapLocale(l), num ? gbp(o) : o); };
    }));
  }

  function makeDom(win, translator) {
    const doc = win.document;
    const orig = new WeakMap(), last = new WeakMap(), origAttr = new WeakMap();
    const skipped = el => !!(el && el.closest && el.closest(SKIP));
    function text(node) {
      const cur = node.data;
      if (last.get(node) === cur) return;
      const p = node.parentElement;
      if (!p || skipped(p)) return;
      const out = translator.display(cur);
      if (out != null && out !== cur) { orig.set(node, cur); last.set(node, out); node.data = out; }
      else { orig.delete(node); last.set(node, cur); }
    }
    function attr(el, name) {
      if (!el.hasAttribute(name)) return;
      if (name === 'value' && !(el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type))) return;
      if (name === 'label' && !/^(OPTION|OPTGROUP|TRACK)$/.test(el.tagName)) return;
      if (el.closest('[data-i18n-skip],[translate="no"]')) return;
      const cur = el.getAttribute(name);
      let mem = origAttr.get(el);
      if (mem && mem['>' + name] === cur) return;
      const out = translator.display(cur, true);
      // data-label is also a CSS hook (td[data-label="…"]): keep it, and hand the English caption to
      // `content: var(--rx-label, attr(data-label))` through a custom property instead.
      if (name === 'data-label') { if (out != null && out !== cur) el.style.setProperty('--rx-label', JSON.stringify(out)); return; }
      if (out != null && out !== cur) {
        if (!mem) { mem = {}; origAttr.set(el, mem); }
        mem[name] = cur; mem['>' + name] = out;
        el.setAttribute(name, out);
      }
    }
    function tree(node) {
      if (!node) return;
      if (node.nodeType === 3) { text(node); return; }
      if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
      if (node.nodeType === 1) { if (skipped(node)) { if (node.tagName === 'TEXTAREA') ATTRS.forEach(a => attr(node, a)); return; } ATTRS.forEach(a => attr(node, a)); }
      const w = doc.createTreeWalker(node, 5 /* elements + text */, {
        // A skipped element keeps its content; a textarea still gets its placeholder / label translated.
        acceptNode: n => (n.nodeType === 1 && n.matches(SKIP) ? (n.tagName === 'TEXTAREA' && ATTRS.forEach(a => attr(n, a)), 2 /* reject subtree */) : 1)
      });
      let n;
      while ((n = w.nextNode())) { if (n.nodeType === 3) text(n); else ATTRS.forEach(a => attr(n, a)); }
    }
    // The Italian the page wrote, for page code that reads labels back (sales/contacts-view.js, sales/tasks-view.js).
    function source(el) {
      if (!el) return '';
      if (el.nodeType === 3) return orig.has(el) ? orig.get(el) : el.data;
      let s = '';
      const w = doc.createTreeWalker(el, 4);
      let n;
      while ((n = w.nextNode())) s += orig.has(n) ? orig.get(n) : n.data;
      return s;
    }
    function sourceAttr(el, name) { const m = el && origAttr.get(el); return m && m['>' + name] === el.getAttribute(name) ? m[name] : (el ? el.getAttribute(name) : null); }
    function observe() {
      const mo = new win.MutationObserver(records => {
        for (const r of records) {
          if (r.type === 'characterData') text(r.target);
          else if (r.type === 'attributes') attr(r.target, r.attributeName);
          else r.addedNodes.forEach(tree);
        }
      });
      mo.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
      tree(doc.documentElement);
      return mo;
    }
    return { observe, tree, source, sourceAttr };
  }

  // ---- the switch in the top bar -----------------------------------------------------------------------------
  const SVG = 'http://www.w3.org/2000/svg';
  function flag(doc, lang) {
    const s = doc.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 60 40'); s.setAttribute('width', '22'); s.setAttribute('height', '15'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    s.setAttribute('class', 'rx-lang-flag');
    const add = (tag, at) => { const e = doc.createElementNS(SVG, tag); for (const k in at) e.setAttribute(k, at[k]); s.appendChild(e); return e; };
    if (lang === 'it') { add('rect', { width: 20, height: 40, fill: '#009246' }); add('rect', { x: 20, width: 20, height: 40, fill: '#ffffff' }); add('rect', { x: 40, width: 20, height: 40, fill: '#ce2b37' }); }
    else {
      add('rect', { width: 60, height: 40, fill: '#012169' });
      add('path', { d: 'M0,0 L60,40 M60,0 L0,40', stroke: '#ffffff', 'stroke-width': 8 });
      add('path', { d: 'M0,0 L60,40 M60,0 L0,40', stroke: '#C8102E', 'stroke-width': 3 });
      add('path', { d: 'M30,0 V40 M0,20 H60', stroke: '#ffffff', 'stroke-width': 12 });
      add('path', { d: 'M30,0 V40 M0,20 H60', stroke: '#C8102E', 'stroke-width': 7 });
    }
    return s;
  }
  // Where the switch goes on each page: the first of these that exists (top bar end), else a fixed corner.
  const SLOTS = [
    ['body > header #refresh', 'before'],      // radix-sales.html
    ['main > header .actions', 'append'],       // sales-pipeline-premium.html
    ['.topbar .top-end', 'prepend'],            // sales-orbit-higgsfield.html
    ['.topbar .top-actions', 'prepend'],
    ['header.topbar .top-status', 'prepend'],   // control-center-v2.html (its own top bar, before the status pill)
    ['.topbar', 'append'],                      // growth / LinkedIn pages
    ['header.vd-top', 'append'],                // sales-vendite.html
    ['.lp-topbar', 'append'],
    ['header.rx-topbar .rx-spacer', 'after']    // pages in shell/radix-shell.js (Project manager, Settings, Agents…)
  ];
  function mountSwitch(win, lang) {
    const doc = win.document;
    if (doc.getElementById('rx-lang')) return null;
    const box = doc.createElement('div');
    box.id = 'rx-lang'; box.className = 'rx-lang'; box.setAttribute('data-i18n-skip', '');
    const btn = doc.createElement('button');
    btn.type = 'button'; btn.className = 'rx-lang-btn';
    btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'rx-lang-menu');
    btn.setAttribute('aria-label', lang === 'en' ? 'Language: English' : 'Lingua: Italiano');
    btn.title = lang === 'en' ? 'Language' : 'Lingua';
    btn.appendChild(flag(doc, lang));
    const code = doc.createElement('span'); code.className = 'rx-lang-code'; code.textContent = lang.toUpperCase(); btn.appendChild(code);
    const menu = doc.createElement('div');
    menu.id = 'rx-lang-menu'; menu.className = 'rx-lang-menu'; menu.setAttribute('role', 'menu'); menu.hidden = true;
    menu.setAttribute('aria-label', lang === 'en' ? 'Language' : 'Lingua');
    const items = [['it', 'Italiano'], ['en', 'English']].map(([l, name]) => {
      const it = doc.createElement('button');
      it.type = 'button'; it.className = 'rx-lang-item'; it.setAttribute('role', 'menuitemradio'); it.setAttribute('lang', l);
      it.setAttribute('aria-checked', String(l === lang)); it.tabIndex = -1; it.dataset.lang = l;
      it.appendChild(flag(doc, l)); const t = doc.createElement('span'); t.textContent = name; it.appendChild(t);
      it.addEventListener('click', () => choose(l));
      menu.appendChild(it);
      return it;
    });
    function open(focusIdx) {
      menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
      items[focusIdx == null ? Math.max(0, items.findIndex(i => i.dataset.lang === lang)) : focusIdx].focus();
    }
    function close(focusBtn) { if (menu.hidden) return; menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (focusBtn) btn.focus(); }
    function choose(l) {
      close(true);
      if (l === lang) return;
      saveLang(win, l);
      try {
        const u = new URL(win.location.href);
        if (u.searchParams.has('lang')) { u.searchParams.set('lang', l); win.location.href = u.toString(); return; }
      } catch (e) { /* fall through */ }
      win.location.reload();
    }
    btn.addEventListener('click', () => (menu.hidden ? open() : close(false)));
    btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(e.key === 'ArrowUp' ? items.length - 1 : 0); } });
    menu.addEventListener('keydown', e => {
      const i = items.indexOf(doc.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') close(false);
    });
    doc.addEventListener('click', e => { if (!box.contains(e.target)) close(false); });
    box.append(btn, menu);
    let placed = false;
    for (const [sel, how] of SLOTS) {
      const at = doc.querySelector(sel);
      if (!at) continue;
      if (how === 'before') at.before(box); else if (how === 'after') at.after(box); else if (how === 'prepend') at.prepend(box); else at.append(box);
      placed = true; break;
    }
    if (!placed) { box.classList.add('rx-lang-float'); doc.body.appendChild(box); }
    return box;
  }

  let state = { lang: 'it', translator: null, dom: null };
  // AI replies in English: a POST to /api/chat with a JSON body gets lang:'en' (unless it already names a language).
  // Anything else (other URLs, non-JSON bodies) passes through untouched.
  function isChatUrl(u) {
    const s = typeof u === 'string' ? u : (u && typeof u.url === 'string' ? u.url : '');
    return /^(?:https?:\/\/[^/]+)?\/api\/chat(?:[?#]|$)/.test(s);
  }
  function withLang(input, init, lang) {
    if (lang !== 'en' || !isChatUrl(input) || !init || typeof init.body !== 'string') return init;
    if (String(init.method || 'GET').toUpperCase() !== 'POST') return init;
    let body;
    try { body = JSON.parse(init.body); } catch (e) { return init; }
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.lang || body.language) return init;
    return Object.assign({}, init, { body: JSON.stringify(Object.assign({}, body, { lang: 'en' })) });
  }
  function wrapFetch(win, lang) {
    const f = win.fetch;
    if (typeof f !== 'function' || f.__rxLang) return;
    const wrapped = function (input, init) { return f.call(win, input, withLang(input, init, lang)); };
    wrapped.__rxLang = true;
    win.fetch = wrapped;
  }

  function boot(win) {
    if (win.__radixI18n) return;
    win.__radixI18n = true;
    const lang = readLang(win);
    state.lang = lang;
    const doc = win.document;
    const ready = fn => (doc.readyState === 'loading' ? doc.addEventListener('DOMContentLoaded', fn) : fn());
    ready(() => mountSwitch(win, lang));
    if (lang !== 'en') return;
    doc.documentElement.lang = 'en';
    doc.documentElement.setAttribute('data-lang', 'en');
    const translator = compile(win.RadixI18nEn || {}, HAND);
    state.translator = translator;
    shimLocales(win);
    wrapFetch(win, lang);
    ['alert', 'confirm', 'prompt'].forEach(n => {
      const o = win[n];
      if (typeof o !== 'function') return;
      win[n] = function (msg, ...rest) { return o.call(win, msg === undefined ? msg : translator.message(msg), ...rest); };
    });
    const dom = makeDom(win, translator);
    state.dom = dom;
    dom.observe();
  }

  return Object.freeze({
    KEY, readLang, saveLang, compile, dateWords, mapLocale, toPounds: money, gbp, HAND, makeDom, mountSwitch, boot, withLang, wrapFetch,
    get lang() { return state.lang; },
    get en() { return state.lang === 'en'; },
    t: s => (state.translator ? state.translator.t(s) : s),
    // Amounts for page code that formats money itself: pounds in English, euro (unchanged) in Italian.
    money: s => (state.lang === 'en' ? money(s) : s),
    // Italian text of an element as the page wrote it (identical to textContent when nothing was translated).
    source: el => (state.dom ? state.dom.source(el) : (el ? el.textContent : '')),
    sourceAttr: (el, name) => (state.dom ? state.dom.sourceAttr(el, name) : (el ? el.getAttribute(name) : null))
  });
});
