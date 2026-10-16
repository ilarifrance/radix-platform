// One Sales menu for every Sales / Lead page (Sales Orbit, CRM, Pipeline, Lead Intelligence, LinkedIn, Campagne, Progetti).
// Navigation only: static pages get their <aside> menu replaced; on radix-sales.html the links sales.js renders
// in #navigation are kept (same elements, same hrefs) and only regrouped, with the cross-page links added around them.
'use strict';
(function () {
  var CRM = '/radix-sales.html';
  var GROUPS = [
    { label: 'Sales', items: [
      { href: '/sales-orbit-higgsfield.html', text: 'Sales Orbit', ic: 'globe' },
      { href: CRM + '#dashboard', text: 'Panoramica', ic: 'home' },
      { href: '/sales-pipeline-premium.html', text: 'Pipeline', ic: 'flow' },
      { href: CRM + '#companies', text: 'Aziende', ic: 'building' },
      { href: CRM + '#contacts', text: 'Contatti', ic: 'person' },
      { href: CRM + '#tasks', text: 'Attività', ic: 'check' },
      { href: CRM + '#calendar', text: 'Calendario', ic: 'cal' },
      { href: CRM + '#analytics', text: 'Analisi', ic: 'chart' }
    ] },
    { label: 'Acquisizione', items: [
      { href: '/lead-intelligence.html', text: 'Lead Intelligence', ic: 'magnet' },
      { href: '/sales-linkedin.html', text: 'LinkedIn', ic: 'team' },
      { href: '/sales-growth-campaigns.html', text: 'Campagne', ic: 'target' },
      { href: '/sales-growth-projects.html', text: 'Progetti commerciali', ic: 'steps' }
    ] },
    { label: 'Dati CRM', fold: true, items: [
      { href: CRM + '#opportunities', text: 'Opportunità', ic: 'target' },
      { href: CRM + '#leads', text: 'Lead', ic: 'magnet' },
      { href: CRM + '#interactions', text: 'Interazioni', ic: 'chat' },
      { href: CRM + '#members', text: 'Membri', ic: 'team' },
      { href: CRM + '#processes', text: 'Processi', ic: 'flow' },
      { href: CRM + '#stages', text: 'Fasi', ic: 'steps' }
    ] }
  ];
  var HOME = { href: '/control-center-v2.html', text: 'Command Center', ic: 'home' };
  var onCrm = /\/radix-sales\.html$/.test(location.pathname);

  function isCurrent(href) {
    var u = new URL(href, location.href);
    if (u.pathname !== location.pathname) return false;
    if (!onCrm) return true;
    return u.hash === (location.hash || '#dashboard');
  }
  function link(item, existing) {
    var a = existing || document.createElement('a');
    // On the CRM page its own sections stay plain hash links, as sales.js renders them.
    if (!existing) a.setAttribute('href', onCrm && item.href.indexOf(CRM + '#') === 0 ? item.href.slice(CRM.length) : item.href);
    a.className = 'sx-link';
    a.style.setProperty('--sx-ic', 'url(/sales/icons/' + item.ic + '.svg)');
    if (!existing) { var s = document.createElement('span'); s.textContent = item.text; a.append(s); }
    else if (!a.querySelector('span')) { var t = document.createElement('span'); t.textContent = item.text; a.textContent = ''; a.append(t); }
    return a;
  }
  function mark(root) {
    [].slice.call(root.querySelectorAll('a.sx-link')).forEach(function (a) {
      if (isCurrent(a.href)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var fold = root.querySelector('details.sx-fold');
    if (fold && fold.querySelector('[aria-current]')) fold.open = true;
    // On phones the menu is one scrolling row: bring the current page into view.
    var cur = root.querySelector('a.sx-link[aria-current]');
    if (cur && root.scrollWidth > root.clientWidth) root.scrollLeft = cur.offsetLeft - root.offsetLeft - 12;
  }
  function build(nav, reuse) {
    var frag = document.createDocumentFragment();
    frag.append(link(HOME));
    GROUPS.forEach(function (g) {
      var box = document.createElement(g.fold ? 'details' : 'div');
      box.className = g.fold ? 'sx-group sx-fold' : 'sx-group';
      var head = document.createElement(g.fold ? 'summary' : 'p');
      head.className = 'sx-label'; head.textContent = g.label; box.append(head);
      g.items.forEach(function (it) { box.append(link(it, reuse && reuse(it))); });
      frag.append(box);
    });
    nav.append(frag);
  }

  // Without a CRM workspace every Sales page is empty: say so once, at the top, in plain words.
  function accessNotice() {
    if (!window.fetch) return;
    fetch('/api/sales?entity=workspaces&offset=0', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      if (r.status === 401) return { login: true };
      return r.ok ? r.json() : null;
    }).then(function (d) {
      if (!d || (!d.login && Array.isArray(d.rows) && d.rows.length)) return;
      if (!d.login && !Array.isArray(d.rows)) return;
      var main = document.getElementById('main'); if (!main || main.querySelector('.sx-access')) return;
      document.documentElement.classList.add('sx-no-crm');
      var box = document.createElement('section'); box.className = 'sx-access'; box.setAttribute('role', 'status');
      var orb = document.createElement('span'); orb.className = 'sx-access-orb'; orb.setAttribute('aria-hidden', 'true');
      var txt = document.createElement('div');
      var h = document.createElement('h2'); h.textContent = d.login ? 'Accedi per vedere il CRM' : 'Il tuo account non è ancora collegato al CRM';
      var p = document.createElement('p');
      p.textContent = d.login ? 'Le pagine Sales mostrano i dati del tuo workspace dopo l’accesso a RADIX.'
        : 'Le pagine Sales mostrano solo i dati del workspace commerciale a cui appartieni, e oggi il tuo account non ne ha nessuno. Chiedi a un amministratore di aggiungerti: da quel momento qui trovi aziende, contatti, opportunità e attività.';
      txt.append(h, p);
      var act = document.createElement('div'); act.className = 'sx-access-actions';
      var home = document.createElement('a'); home.href = '/control-center-v2.html'; home.textContent = 'Torna al Command Center';
      act.append(home);
      if (!d.login && navigator.clipboard) {
        var copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copia la richiesta di accesso';
        copy.onclick = function () {
          fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (me) {
            var u = me && (me.user || me), who = u && (u.email || u.name) ? ' (' + (u.email || u.name) + ')' : '';
            return navigator.clipboard.writeText('Ciao, puoi aggiungere il mio account' + who + ' al workspace CRM di RADIX? Grazie.');
          }).then(function () { copy.textContent = 'Richiesta copiata'; }, function () { copy.textContent = 'Copia non riuscita'; });
        };
        act.append(copy);
      }
      box.append(orb, txt, act);
      var first = main.firstElementChild;
      if (first && (first.tagName === 'HEADER' || first.classList.contains('skip'))) first.after(box); else main.prepend(box);
    }).catch(function () {});
  }
  accessNotice();

  if (!onCrm) {
    // Static Sales pages: the menu lives in the page's own <aside>; this script runs right after it, before paint.
    var side = document.currentScript && document.currentScript.previousElementSibling;
    if (!side || side.tagName !== 'ASIDE') side = document.querySelector('aside');
    if (!side) return;
    side.classList.add('sx-side');
    if (side.parentElement) side.parentElement.classList.add('sx-app');
    side.textContent = '';
    var brand = document.createElement('a');
    brand.className = 'sx-brand'; brand.href = '/sales-orbit-higgsfield.html';
    brand.innerHTML = 'RAD<b>I</b>X<small>Sales Intelligence</small>';
    var nav = document.createElement('nav');
    nav.className = 'sx-nav'; nav.setAttribute('aria-label', 'Menu Sales');
    build(nav);
    side.append(brand, nav);
    mark(nav);
    return;
  }

  // radix-sales.html: regroup #navigation once sales.js and the view scripts have filled it.
  var crmNav = document.getElementById('navigation');
  if (!crmNav) return;
  document.documentElement.classList.add('sx-crm');
  if (crmNav.parentElement) crmNav.parentElement.classList.add('sx-app');
  var busy = false, timer = 0;
  function regroup() {
    var own = {};
    [].slice.call(crmNav.querySelectorAll('a[href^="#"]')).forEach(function (a) { own[a.getAttribute('href')] = a; });
    if (!own['#dashboard']) return;
    var extra = [].slice.call(crmNav.querySelectorAll('a[href^="#"]'));
    busy = true;
    var keep = [];
    build(crmNav, function (it) {
      var h = it.href.indexOf(CRM + '#') === 0 ? it.href.slice(CRM.length) : '';
      var a = h && own[h]; if (a) keep.push(a);
      return a || null;
    });
    // Anything sales.js adds that the menu does not list yet stays reachable under Dati CRM.
    var fold = crmNav.querySelector('details.sx-fold');
    extra.forEach(function (a) { if (keep.indexOf(a) === -1) { link({ ic: 'steps', text: a.textContent }, a); fold.append(a); } });
    // Drop what was there before the groups (old Sales Orbit link, stray text), keeping the grouped nodes.
    [].slice.call(crmNav.childNodes).forEach(function (n) {
      if (n.nodeType !== 1 || !(n.classList.contains('sx-group') || n.classList.contains('sx-link'))) n.remove();
    });
    var links = crmNav.querySelectorAll(':scope > a.sx-link');
    for (var i = 1; i < links.length; i++) links[i].remove();
    crmNav.classList.add('sx-nav');
    if (!crmNav.querySelector(':scope > .sx-brand')) {
      var brand = document.createElement('a'); brand.className = 'sx-brand'; brand.href = '/sales-orbit-higgsfield.html';
      brand.innerHTML = 'RAD<b>I</b>X<small>Sales Intelligence</small>';
      crmNav.prepend(brand);
    }
    mark(crmNav);
    busy = false;
  }
  function later() { if (busy || crmNav.classList.contains('sx-nav')) return; clearTimeout(timer); timer = setTimeout(regroup, 60); }
  new MutationObserver(later).observe(crmNav, { childList: true });
  window.addEventListener('hashchange', function () { mark(crmNav); });
  later();
})();
