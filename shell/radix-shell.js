/* RADIX shell — injects the global sidebar, top bar and search palette. Source of truth: /DESIGN.md
   Page contract (on <body>):
     data-shell-area   cc | agency | sales | studio | pm | system   (accent + area name under the wordmark)
     data-shell-page   id of the active nav item (see NAV below)
     data-shell-state  live | demo | partial | off                   (data-state badge, optional)
   Elements marked data-rx-local-nav (the page's old sidebar) are hidden by radix-shell.css. */
(function () {
  'use strict';
  if (window.__radixShell) return;
  window.__radixShell = true;

  var AREAS = {
    cc: 'Command Center', agency: 'Marketing Agency', sales: 'Sales Intelligence',
    studio: 'Studio', pm: 'Project Management', system: 'AI Operating System'
  };
  var STATES = {
    live: ['Live', 'Dati reali dal database RADIX'],
    demo: ['Demo', 'Dati dimostrativi: nessun dato reale collegato'],
    partial: ['Parziale', 'Alcune sezioni usano dati reali, altre no'],
    off: ['Non collegato', 'Questa pagina non è ancora collegata ai dati'],
    local: ['Solo questo browser', 'I dati sono salvati in questo browser: non sono condivisi con altri utenti o dispositivi']
  };
  var I = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.8-5"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="m7 15 4-4 3 3 5-6"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    scale: '<path d="M12 4v16M7 20h10M5 8h14"/><path d="m5 8-2.5 6a3 3 0 0 0 5 0Zm14 0-2.5 6a3 3 0 0 0 5 0Z"/>',
    gantt: '<path d="M4 6h9M7 12h10M10 18h10"/>',
    bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/>',
    book: '<path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4Z"/><path d="M5 16a4 4 0 0 1 4-4h10"/>',
    plug: '<path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0Zm5 8v5"/>',
    rocket: '<path d="M12 15c4-3 6-7 6-11-4 0-8 2-11 6l5 5Z"/><path d="M9 13 6 16M7 10H4l2-3h4M14 17v3l3-2v-4"/>',
    crown: '<path d="m4 8 4 4 4-6 4 6 4-4-2 10H6Z"/>',
    radar: '<circle cx="12" cy="12" r="8.5"/><path d="M12 12 18 6"/><path d="M12 7a5 5 0 1 0 5 5"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>',
    cog: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    chev: '<path d="m9 6 6 6-6 6"/>'
  };
  function svg(name, cls) {
    return '<svg class="' + (cls || 'rx-ico') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[name] + '</svg>';
  }

  // Global navigation. CRM / Sales / Lead pages are only linked (owned by another workstream).
  var NAV = [
    { label: 'Comando' },
    { id: 'cc', text: 'Command Center', href: '/control-center-v2.html', icon: 'home' },
    { id: 'cc-projects', text: 'Progetti', href: '/control-center-v2.html#projects', icon: 'grid' },
    { id: 'cc-approvals', text: 'Approvazioni', href: '/control-center-v2.html#approvals', icon: 'check' },
    { id: 'agents', text: 'Agenti AI', href: '/agents.html', icon: 'bot', kw: 'chat orchestratore pipeline post' },
    { label: 'Aree' },
    { group: 'agency', text: 'Marketing Agency', icon: 'spark', items: [
      { id: 'agency', text: 'Panoramica', href: '/agency/index.html' },
      { id: 'agency-clients', text: 'Clienti', href: '/agency/clients.html' },
      { id: 'agency-projects', text: 'Progetti', href: '/agency/projects.html' },
      { id: 'agency-ped', text: 'Piano editoriale', href: '/project-editorial.html', project: 'project', kw: 'ped social calendario contenuti' },
      { id: 'agency-operations', text: 'Operations', href: '/agency/operations.html' },
      { id: 'agency-memory', text: 'Memoria', href: '/agency/memory.html' }
    ] },
    { group: 'sales', text: 'Sales Intelligence', icon: 'target', items: [
      { id: 'sales-orbit', text: 'Sales Orbit', href: '/sales-orbit-higgsfield.html' },
      { id: 'sales-pipeline', text: 'Pipeline', href: '/sales-pipeline-premium.html' },
      { id: 'sales-crm', text: 'CRM', href: '/radix-sales.html' },
      { id: 'sales-lead', text: 'Lead Intelligence', href: '/lead-intelligence.html' },
      { id: 'sales-projects', text: 'Progetti commerciali', href: '/sales-growth-projects.html' },
      { id: 'sales-campaigns', text: 'Campagne', href: '/sales-growth-campaigns.html' },
      { id: 'sales-linkedin', text: 'LinkedIn', href: '/sales-linkedin.html' }
    ] },
    { id: 'pm', text: 'Project Management', href: '/radix-pm-concept.html', icon: 'gantt', project: 'project', kw: 'pm gantt attività' },
    { group: 'studio', text: 'Studio', icon: 'scale', items: [
      { id: 'commercial', text: 'Commerciale', href: '/commercial/index.html' },
      { id: 'legal', text: 'Legal', href: '/legal/index.html' },
      { id: 'accounting', text: 'Accounting', href: '/accounting/index.html' }
    ] },
    { id: 'executive', text: 'Executive', icon: 'crown', soon: true },
    { id: 'venture', text: 'Venture Studio', icon: 'rocket', soon: true },
    { label: 'Intelligence' },
    { id: 'cc-knowledge', text: 'Knowledge', href: '/control-center-v2.html#knowledge', icon: 'book' },
    { id: 'archive', text: 'Archivio v3.7', href: '/archive.html', icon: 'clock', kw: 'archivio conversazioni vecchia piattaforma' },
    { id: 'cc-analytics', text: 'Analytics', href: '/control-center-v2.html#analytics', icon: 'chart' },
    { id: 'cc-integrations', text: 'Integrazioni', href: '/control-center-v2.html#integrations', icon: 'plug' }
  ];
  var FOOT = [
    { id: 'coordination', text: 'Control Room', href: '/coordination/index.html', icon: 'radar' },
    { id: 'ecosystem', text: 'Tutte le aree', href: '/radix-ecosystem.html', icon: 'globe' },
    { id: 'admin', text: 'Amministrazione', href: '/admin.html', icon: 'cog' }
  ];

  var body = document.body;
  var root = document.documentElement;
  var area = body.dataset.shellArea || 'system';
  var page = body.dataset.shellPage || '';
  var state = body.dataset.shellState || '';

  // Project-scoped pages keep the project open when you move between them (?id= / ?project= on the current URL).
  var qs = new URLSearchParams(location.search), curProject = qs.get('project') || qs.get('id') || '';
  if (!/^[a-z0-9-]{1,80}$/i.test(curProject) || !/(project|editorial|pm-concept|agents|memory|profile)/.test(location.pathname)) curProject = '';
  function href(n) { return n.project && curProject ? n.href + '?' + n.project + '=' + encodeURIComponent(curProject) : n.href; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function item(n) {
    var cur = n.id === page ? ' aria-current="page"' : '';
    if (n.soon) return '<a class="rx-item" aria-disabled="true" tabindex="-1" title="In arrivo">' + svg(n.icon) + '<span>' + esc(n.text) + '</span><span class="rx-soon">In arrivo</span></a>';
    return '<a class="rx-item" href="' + esc(href(n)) + '" data-rx-id="' + n.id + '" title="' + esc(n.text) + '"' + cur + '>' +
      (n.icon ? svg(n.icon) : '') + '<span>' + esc(n.text) + '</span>' + (n.note ? '<span class="rx-ext">' + esc(n.note) + '</span>' : '') + '</a>';
  }
  function navHtml() {
    return NAV.map(function (n) {
      if (n.label) return '<div class="rx-label">' + esc(n.label) + '</div>';
      if (n.group) {
        var active = n.items.some(function (s) { return s.id === page; });
        return '<details class="rx-group" data-active="' + active + '"' + (active ? ' open' : '') + '><summary title="' + esc(n.text) + '">' + svg(n.icon) +
          '<span>' + esc(n.text) + '</span>' + svg('chev', 'rx-chev') + '</summary><div class="rx-sub">' + n.items.map(item).join('') + '</div></details>';
      }
      return item(n);
    }).join('');
  }

  // Hide the page's own sidebar even if the markup was not annotated.
  var locals = [];
  ['.shell>.side', '.shell>.sidebar', '.app>.sidebar', 'body>aside'].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (el && el.querySelector('nav') && locals.indexOf(el) === -1) { el.setAttribute('data-rx-local-nav', ''); locals.push(el); }
  });
  // Page-level links the old sidebar carried (marked data-rx-keep) become tabs under the top bar.
  var keep = [];
  locals.forEach(function (el) { keep = keep.concat([].slice.call(el.querySelectorAll('[data-rx-keep]'))); });

  root.classList.add('rx-shell');
  root.setAttribute('data-rx-area', area);

  // A div, not an aside: page scripts look up their own sidebar with querySelector('aside nav').
  var side = document.createElement('div');
  side.className = 'rx-sidebar';
  side.id = 'rx-sidebar';
  side.innerHTML = '<a class="rx-brand" href="/control-center-v2.html"><b>RADIX</b><small>' + esc(AREAS[area] || AREAS.system) + '</small></a>' +
    '<nav class="rx-nav" aria-label="Aree RADIX">' + navHtml() + '</nav>' +
    '<nav class="rx-nav rx-foot" aria-label="Sistema">' + FOOT.map(item).join('') + '</nav>';

  var top = document.createElement('header');
  top.className = 'rx-topbar';
  var st = STATES[state];
  function menuEl() {
    var b = document.createElement('button');
    b.className = 'rx-iconbtn rx-menu'; b.type = 'button';
    b.setAttribute('aria-label', 'Apri menu'); b.setAttribute('aria-controls', 'rx-sidebar'); b.setAttribute('aria-expanded', 'false');
    b.innerHTML = svg('menu');
    return b;
  }
  top.innerHTML = menuEl().outerHTML +
    '<button class="rx-search" type="button" aria-haspopup="dialog">' + svg('search') + '<span>Cerca pagine e aree</span><kbd>⌘K</kbd></button>' +
    '<span class="rx-spacer"></span>' +
    (st ? '<span class="rx-state" data-state="' + state + '" title="' + esc(st[1]) + '"><i></i><span>' + esc(st[0]) + '</span></span>' : '') +
    '<span class="rx-user" hidden><span class="rx-avatar"></span><span class="rx-user-name"></span></span>';

  var scrim = document.createElement('div');
  scrim.className = 'rx-scrim';

  var pal = document.createElement('div');
  pal.className = 'rx-palette';
  pal.setAttribute('role', 'dialog');
  pal.setAttribute('aria-modal', 'true');
  pal.setAttribute('aria-label', 'Cerca in RADIX');
  pal.innerHTML = '<div class="rx-palette-box"><input type="search" placeholder="Vai a…" aria-label="Cerca pagine" autocomplete="off"><ul role="listbox"></ul></div>';

  body.insertBefore(side, body.firstChild);
  body.appendChild(scrim);
  body.appendChild(pal);
  // Top bar sits above the page content, right after the sidebar (body is a block in shell mode).
  // Pages with their own working search bar (data-shell-top="page") keep it; the shell only adds the menu button.
  var pageTop = body.dataset.shellTop === 'page' && document.querySelector('header.topbar');
  if (pageTop) { top = pageTop; top.classList.add('rx-pagetop'); top.insertBefore(menuEl(), top.firstChild); }
  else body.insertBefore(top, side.nextSibling);
  var tabs = null;
  function tabsEl() {
    if (tabs) return tabs;
    tabs = document.createElement('nav');
    tabs.className = 'rx-tabs';
    tabs.setAttribute('aria-label', 'Sezioni della pagina');
    body.insertBefore(tabs, top.nextSibling);
    return tabs;
  }
  if (keep.length) keep.forEach(function (a) { tabsEl().appendChild(a); });
  // Project links a page adds to its old sidebar after loading (data-project-link) are mirrored as tabs.
  function syncProjectLinks() {
    var links = [];
    locals.forEach(function (el) { links = links.concat([].slice.call(el.querySelectorAll('a[data-project-link]'))); });
    if (!links.length && !tabs) return;
    var t = tabsEl();
    [].slice.call(t.querySelectorAll('[data-rx-proj]')).forEach(function (a) { a.remove(); });
    links.forEach(function (a) {
      var c = document.createElement('a');
      c.href = a.href; c.textContent = a.textContent; c.setAttribute('data-rx-proj', ''); c.className = 'rx-tab-proj';
      t.appendChild(c);
    });
  }
  if (locals.length && window.MutationObserver) {
    var mo = new MutationObserver(syncProjectLinks);
    locals.forEach(function (el) { mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] }); });
    syncProjectLinks();
  }

  // Project bar: every project-scoped page shows the same steps, so a project reads as one flow.
  var STEPS = [
    { id: 'brief', text: 'Brief e strategia', href: '/project-editorial.html?project={p}#brief', mod: 'editorial', local: 'briefNav' },
    { id: 'ped', text: 'Piano editoriale', href: '/project-editorial.html?project={p}#ped', mod: 'editorial', local: 'pedNav' },
    { id: 'tasks', text: 'Incarichi', href: '/agency/project-workspace.html?id={p}', mod: 'agency-workspace' },
    { id: 'pm', text: 'Attività', href: '/radix-pm-concept.html?project={p}', mod: 'pm' },
    { id: 'agents', text: 'Agenti AI', href: '/agents.html?agent=marketing-orchestrator&project={p}', mod: 'agents' }
  ];
  var EXTRA = [
    { id: 'memory', text: 'Memoria', href: '/agency/memory.html?id={p}' },
    { id: 'profile', text: 'Profilo', href: '/project-profile.html?id={p}' }
  ];
  var PATH_STEP = { 'project-workspace': 'tasks', 'radix-pm-concept': 'pm', agents: 'agents', memory: 'memory', 'project-profile': 'profile' };
  var pbar = null, barProject = '';
  function stepNow() {
    var f = location.pathname.split('/').pop().replace('.html', '');
    if (f === 'project-editorial') return location.hash === '#ped' ? 'ped' : 'brief';
    return PATH_STEP[f] || '';
  }
  function markStep() {
    if (!pbar) return;
    var now = stepNow();
    [].slice.call(pbar.querySelectorAll('[data-step]')).forEach(function (el) {
      var a = el.tagName === 'A' ? el : el.querySelector('a');
      if (el.getAttribute('data-step') === now) { if (!a.id) a.setAttribute('aria-current', 'step'); }
      else if (!a.id) a.removeAttribute('aria-current');
    });
  }
  function buildBar(id) {
    if (!id || id === barProject || body.dataset.shellProject === 'off') return;
    barProject = id;
    var P = encodeURIComponent(id), fresh = !pbar;
    var onPed = /project-editorial/.test(location.pathname);
    var owns = STEPS.map(function (s) { return onPed && s.local && document.getElementById(s.local); });
    if (fresh) {
      pbar = document.createElement('nav');
      pbar.className = 'rx-project';
      pbar.setAttribute('aria-label', 'Fasi del progetto');
    }
    pbar.innerHTML = '<div class="rx-project-id"><small>Progetto</small><b class="rx-project-name">' + esc(id) + '</b>' +
      '<a class="rx-project-switch" href="/agency/projects.html">Cambia</a></div>' +
      '<ol class="rx-steps">' + STEPS.map(function (s, i) {
        return '<li data-step="' + s.id + '"><a href="' + esc(s.href.replace('{p}', P)) + '"><i>' + (i + 1) + '</i><span>' + esc(s.text) + '</span></a></li>';
      }).join('') + '</ol>' +
      '<div class="rx-project-extra">' + EXTRA.map(function (s) {
        return '<a data-step="' + s.id + '" href="' + esc(s.href.replace('{p}', P)) + '">' + esc(s.text) + '</a>';
      }).join('') + '</div>';
    // The PED page switches brief/plan in place: its own links (ids used by the page script) become those two steps.
    STEPS.forEach(function (s, i) {
      var own = owns[i];
      if (!own) return;
      var li = pbar.querySelector('[data-step="' + s.id + '"]'), a = li.querySelector('a');
      own.className = ''; own.innerHTML = a.innerHTML; own.removeAttribute('data-rx-keep');
      li.replaceChild(own, a);
    });
    markStep();
    if (fresh) {
      body.insertBefore(pbar, top.nextSibling); root.classList.add('rx-has-project');
      var setH = function () { root.style.setProperty('--rx-projectbar', pbar.offsetHeight + 'px'); };
      setH(); window.addEventListener('resize', setH);
    }
    // Name and which steps already hold saved work come from the shared registry.
    if (window.fetch) fetch('/api/workspace?resource=projects&id=' + P, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var it = d && d.item; if (!it || id !== barProject) return;
      pbar.querySelector('.rx-project-name').textContent = it.name || id;
      var mods = (it.documents || []).map(function (x) { return x.module; });
      STEPS.forEach(function (s) { if (mods.indexOf(s.mod) !== -1) pbar.querySelector('[data-step="' + s.id + '"]').setAttribute('data-saved', ''); });
    }).catch(function () {});
  }
  buildBar(curProject);
  window.addEventListener('hashchange', markStep);
  // Pages that switch project in place rewrite the URL; the bar (and project-aware sidebar links) follow.
  if (/(project|editorial|pm-concept|agents|memory|profile)/.test(location.pathname) && history.replaceState) {
    var rs = history.replaceState;
    history.replaceState = function () {
      var r = rs.apply(history, arguments);
      var q = new URLSearchParams(location.search), id = q.get('project') || q.get('id') || '';
      if (/^[a-z0-9-]{1,80}$/i.test(id) && id !== barProject) {
        curProject = id;
        [].slice.call(side.querySelectorAll('.rx-item[data-rx-id]')).forEach(function (a) {
          var n = null; NAV.forEach(function (x) { (x.items || [x]).forEach(function (y) { if (y.id === a.getAttribute('data-rx-id')) n = y; }); });
          if (n && n.project) a.setAttribute('href', href(n));
        });
        buildBar(id);
      }
      return r;
    };
  }

  // Mobile drawer
  var menuBtn = top.querySelector('.rx-menu');
  function setNav(open) {
    root.classList.toggle('rx-nav-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) { var f = side.querySelector('a[href]'); if (f) f.focus(); }
  }
  menuBtn.addEventListener('click', function () { setNav(!root.classList.contains('rx-nav-open')); });
  scrim.addEventListener('click', function () { setNav(false); });

  // Search palette over every navigable item
  var entries = [];
  NAV.concat(FOOT, [{ text: 'Profilo progetto', href: curProject ? '/project-profile.html?id=' + encodeURIComponent(curProject) : '/agency/projects.html', kw: 'profilo agenti brand tone of voice' }]).forEach(function (n) {
    if (n.items) n.items.forEach(function (s) { entries.push({ text: s.text, href: href(s), where: n.text, kw: s.kw || '' }); });
    else if (n.href) entries.push({ text: n.text, href: href(n), where: '', kw: n.kw || '' });
  });
  var input = pal.querySelector('input');
  var list = pal.querySelector('ul');
  var sel = 0, shown = [];
  function render() {
    var q = input.value.trim().toLowerCase();
    shown = entries.filter(function (e) { return !q || (e.text + ' ' + e.where + ' ' + e.kw).toLowerCase().indexOf(q) !== -1; });
    sel = Math.min(sel, Math.max(shown.length - 1, 0));
    list.innerHTML = shown.length ? shown.map(function (e, i) {
      return '<li><a role="option" href="' + e.href + '" aria-selected="' + (i === sel) + '">' + esc(e.text) + (e.where ? '<small>' + esc(e.where) + '</small>' : '') + '</a></li>';
    }).join('') : '<li><a aria-disabled="true">Nessun risultato</a></li>';
  }
  var lastFocus = null;
  function openPal() { lastFocus = document.activeElement; pal.setAttribute('open', ''); input.value = ''; sel = 0; render(); input.focus(); }
  function closePal() { pal.removeAttribute('open'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  var searchBtn = top.querySelector('.rx-search');
  if (searchBtn) searchBtn.addEventListener('click', openPal);
  pal.addEventListener('click', function (e) { if (e.target === pal) closePal(); });
  input.addEventListener('input', function () { sel = 0; render(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); render(); e.preventDefault(); }
    else if (e.key === 'Enter' && shown[sel]) { location.href = shown[sel].href; closePal(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented) return; // the page handled it (e.g. Command Center search)
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); pal.hasAttribute('open') ? closePal() : openPal(); }
    else if (e.key === 'Escape') { if (pal.hasAttribute('open')) closePal(); else if (root.classList.contains('rx-nav-open')) { setNav(false); menuBtn.focus(); } }
  });

  // Command Center: sidebar links with #view switch the internal view.
  if (area === 'cc') {
    var VIEW_PAGE = { projects: 'cc-projects', approvals: 'cc-approvals', knowledge: 'cc-knowledge', analytics: 'cc-analytics', integrations: 'cc-integrations' };
    var applyHash = function () {
      var v = location.hash.slice(1);
      var btn = v && document.querySelector('[data-radix-view="' + v.replace(/[^a-z-]/g, '') + '"]');
      if (btn) btn.click();
      var id = VIEW_PAGE[v] || 'cc';
      side.querySelectorAll('.rx-item[data-rx-id]').forEach(function (a) {
        if (a.getAttribute('data-rx-id') === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
    };
    window.addEventListener('hashchange', applyHash);
    if (location.hash) setTimeout(applyHash, 0);
  }

  // Signed-in user chip with "Esci" (best effort; pages with a strict CSP simply skip it).
  // Pages that keep their own top bar get only the logout button, next to their user pill.
  function logoutButton() {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'rx-logout'; b.textContent = 'Esci';
    b.addEventListener('click', function () {
      fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
        .then(function () { location.reload(); }, function () { location.reload(); });
    });
    return b;
  }
  if (window.fetch && body.dataset.shellUser !== 'off') {
    fetch('/api/auth/me', { credentials: 'same-origin', headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var u = d && (d.user || d);
        var name = u && (u.name || u.displayName || u.email);
        if (!name) return;
        if (pageTop) {
          var pill = top.querySelector('.user-pill');
          (pill ? pill.parentNode : top).insertBefore(logoutButton(), pill ? pill.nextSibling : null);
          return;
        }
        var chip = top.querySelector('.rx-user');
        if (!chip) return;
        chip.querySelector('.rx-avatar').textContent = String(name).trim().charAt(0).toUpperCase();
        chip.querySelector('.rx-user-name').textContent = String(name).split('@')[0];
        chip.appendChild(logoutButton());
        chip.hidden = false;
      })
      .catch(function () {});
  }
})();
