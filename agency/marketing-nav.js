/* One Marketing menu for every Marketing Agency page (Panoramica, Cosa vuoi fare, Clienti, Progetti, Piano editoriale,
   Studio Avatar, Produzione, Memoria; the divisions overview folded under Piattaforma), as the Sales pages have theirs (sales/sales-nav.js): the Marketing entries
   get the room, the platform entries (Command Center, Progetti, Approvazioni, Agenti AI, the other areas) shrink to one
   small link on top and two folded groups. Navigation only: it regroups the links shell/radix-shell.js already built
   (same elements, same hrefs, data-rx-id and aria-current, project-aware links included), so nothing new is linked.
   Loaded with defer right after /shell/radix-shell.js on the pages with data-shell-area="agency". */
(function () {
  'use strict';
  var body = document.body, side = document.getElementById('rx-sidebar');
  if (!body || body.getAttribute('data-shell-area') !== 'agency' || !side || side.classList.contains('mk-side')) return;

  // The menu: the ids are the shell's (data-rx-id), the text is what the Marketing menu calls them.
  var GROUPS = [
    { label: 'Marketing', items: [
      { id: 'agency-orbit', text: 'Panoramica', ic: 'home' },
      { id: 'agency-crea', text: 'Cosa vuoi fare', ic: 'spark' },
      { id: 'agency-clients', text: 'Clienti', ic: 'users' },
      { id: 'agency-projects', text: 'Progetti', ic: 'folder' },
      { id: 'agency-ped', text: 'Piano editoriale', ic: 'calendar' },
      { id: 'agency-avatar', text: 'Studio Avatar', ic: 'avatar' }
    ] },
    // «Agenzia e divisioni» (the older overview of 13 divisions, agency/index.html) and its «Workflow» anchor repeat the
    // Panoramica: the divisions page moves into the folded «Piattaforma» group, the anchor stays in the ⌘K search.
    { label: 'Agenzia', items: [
      { id: 'agency-operations', text: 'Produzione', ic: 'pulse' },
      { id: 'agency-memory', text: 'Memoria', ic: 'book' }
    ] },
    { label: 'Piattaforma', fold: true, items: [
      { id: 'cc-projects' }, { id: 'cc-approvals' }, { id: 'agents' },
      { id: 'cc-knowledge' }, { id: 'cc-analytics' }, { id: 'cc-integrations' }, { id: 'archive' },
      { id: 'agency', text: 'Divisioni dell’agenzia', ic: 'layers' }
    ] },
    { label: 'Altre aree', fold: true, items: [
      { id: 'sales-orbit', text: 'Sales Intelligence', ic: 'target' },
      { id: 'pm' },
      { id: 'commercial', text: 'Studio Commerciale', ic: 'scale' }, { id: 'legal', text: 'Legal', ic: 'scale' }, { id: 'accounting', text: 'Accounting', ic: 'scale' },
      { id: 'coordination' }, { id: 'ecosystem' }
    ] }
  ];
  var SYSTEM = ['impostazioni', 'admin'];
  var IC = {
    home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
    spark: '<path d="M12 3.5 13.8 9l5.7 1.5-5.7 1.6L12 17.5l-1.8-5.4-5.7-1.6L10.2 9Z"/><path d="M18.5 15.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6Z"/>',
    users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M15.5 5a3.5 3.5 0 0 1 0 7M17.5 14.2a6 6 0 0 1 3.5 5.3"/>',
    folder: '<path d="M3.5 7a2 2 0 0 1 2-2h3.8l2 2.2h7.2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    avatar: '<circle cx="12" cy="9" r="3.8"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    layers: '<path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8Z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16 8.5 4.5 8.5-4.5"/>',
    flow: '<rect x="3.5" y="4" width="7" height="5" rx="1.5"/><rect x="13.5" y="9.5" width="7" height="5" rx="1.5"/><rect x="3.5" y="15" width="7" height="5" rx="1.5"/><path d="M10.5 6.5h3.5v3M13.5 12H12v5.5h-1.5"/>',
    pulse: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
    book: '<path d="M5 4.5h10a4 4 0 0 1 4 4v11H9a4 4 0 0 1-4-4Z"/><path d="M5 15.5a4 4 0 0 1 4-4h10"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    scale: '<path d="M12 4v16M7 20h10M5 8h14"/><path d="m5 8-2.5 6a3 3 0 0 0 5 0Zm14 0-2.5 6a3 3 0 0 0 5 0Z"/>',
    back: '<path d="M14.5 6 8.5 12l6 6"/>'
  };
  function icon(name) {
    var ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg');
    s.setAttribute('class', 'rx-ico'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.5'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = IC[name];
    return s;
  }
  var own = {};
  [].slice.call(side.querySelectorAll('a.rx-item[data-rx-id]')).forEach(function (a) { own[a.getAttribute('data-rx-id')] = a; });
  if (!own['agency-orbit']) return;
  // One link of the shell, restyled for this menu: its own icon when the Marketing menu gives one, the menu's words.
  function take(it) {
    var a = own[it.id]; if (!a) return null;
    a.classList.add('mk-link');
    if (it.ic) { var old = a.querySelector('svg'); if (old) old.remove(); a.insertBefore(icon(it.ic), a.firstChild); }
    if (it.text) { var s = a.querySelector('span'); if (s) s.textContent = it.text; a.title = it.text; }
    return a;
  }

  var brand = side.querySelector('.rx-brand');
  if (brand) { brand.href = '/agency/orbit.html'; brand.classList.add('mk-brand'); }
  var nav = document.createElement('nav');
  nav.className = 'rx-nav mk-nav'; nav.setAttribute('aria-label', 'Menu Marketing');
  var cc = own.cc;
  if (cc) { take({ id: 'cc', ic: 'back' }); cc.classList.add('mk-back'); cc.title = 'Torna al Command Center'; nav.append(cc); }
  GROUPS.forEach(function (g) {
    var box = document.createElement(g.fold ? 'details' : 'div');
    box.className = 'mk-group' + (g.fold ? ' mk-fold' : '');
    var head = document.createElement(g.fold ? 'summary' : 'p');
    head.className = 'rx-label mk-label'; head.textContent = g.label;
    box.append(head);
    g.items.forEach(function (it) { var a = take(it); if (a) box.append(a); });
    if (box.querySelector('a')) nav.append(box);
  });
  var foot = document.createElement('nav');
  foot.className = 'rx-nav rx-foot mk-foot'; foot.setAttribute('aria-label', 'Sistema');
  SYSTEM.forEach(function (id) { var a = take({ id: id }); if (a) foot.append(a); });

  // Replace the shell's two menus with this one (the dropped links stay in the ⌘K search of the shell).
  [].slice.call(side.querySelectorAll(':scope > nav')).forEach(function (n) { n.remove(); });
  side.append(nav, foot);
  side.classList.add('mk-side');
  side.setAttribute('aria-label', 'Menu Marketing');
  document.documentElement.classList.add('mk-shell');

  // The current page: the shell marks it by data-shell-page; on the agency overview (also at #workflow) it is the
  // «Divisioni dell’agenzia» link, and a fold holding the current page opens.
  function mark() {
    var ag = own.agency;
    if (ag && /\/agency\/(index\.html)?$/.test(location.pathname)) ag.setAttribute('aria-current', 'page');
    [].slice.call(nav.querySelectorAll('details.mk-fold')).forEach(function (d) { if (d.querySelector('[aria-current]')) d.open = true; });
  }
  mark();
  window.addEventListener('hashchange', mark);
})();

/* «Altro ▾» menus (details.more, in Progetti and in the Scheda progetto): Enter/Space open them (native <details>);
   Escape closes the open one and puts the focus back on its «Altro»; a click outside closes it. Runs on every page
   that loads this file, menu or not, and only touches details.more. */
(function () {
  'use strict';
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  function open() { return [].slice.call(document.querySelectorAll('details.more[open]')); }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    // A confirmation open on top (RadixConfirm, a <dialog>) takes its own Escape first. RadixConfirm closes and removes
    // its dialog in its own keydown (preventDefault) before the key reaches the document: that Escape is spent too.
    if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
    var list = open(); if (!list.length) return;
    var act = document.activeElement, own = null;
    list.forEach(function (d) { if (d.contains(act)) own = d; d.open = false; });
    var back = (own || list[list.length - 1]).querySelector('summary');
    if (back) back.focus();
  });
  document.addEventListener('click', function (e) {
    open().forEach(function (d) { if (!d.contains(e.target)) d.open = false; });
  });
})();
