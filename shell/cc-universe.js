// Command Center design layer (command-center-universo + layout mockups):
// 1) CRM planets (Aziende, Contatti, Opportunità, Attività, Interazioni, with their counts) orbiting the RADIX core
//    of the network view, next to the project planets the page already draws;
// 2) connected systems in the top bar, one icon per service, from /api/integrations/status (key present or not).
// Presentation only: it adds its own layer after renderNetwork() and never changes the page's nodes or handlers.
'use strict';
(function () {
  var svg = document.getElementById('networkSvg');
  var NS = 'http://www.w3.org/2000/svg';
  var PLANETS = [
    { id: 'companies', label: 'Aziende', unit: 'totali', color: '#3ff0b0', a: 205 },
    { id: 'contacts', label: 'Contatti', unit: 'totali', color: '#4aa8ff', a: 335 },
    { id: 'opportunities', label: 'Opportunità', unit: 'attive', color: '#f5b544', a: 155 },
    { id: 'tasks', label: 'Attività', unit: 'aperte', color: '#a27bff', a: 25 },
    { id: 'interactions', label: 'Interazioni', unit: 'registrate', color: '#38d6e8', a: 90 }
  ];
  var CX = 450, CY = 245, RX = 132, RY = 112, TILT = 0;
  var counts = null;

  function api(q) { return fetch('/api/sales?' + q, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }); }
  function loadCounts() {
    return api('entity=workspaces&offset=0').then(function (d) {
      var ws = d && d.rows && d.rows[0]; if (!ws) return null;
      return Promise.all(PLANETS.map(function (p) {
        return api(new URLSearchParams({ entity: p.id, offset: '0', workspace: ws.id }).toString()).then(function (r) {
          var rows = (r && r.rows) || [];
          if (p.id === 'tasks') rows = rows.filter(function (t) { return ['done', 'completed', 'closed'].indexOf(String(t.status || '').toLowerCase()) === -1; });
          return { n: rows.length, more: !!(r && r.rows && r.rows.length >= 100) };
        });
      })).then(function (list) { var o = {}; PLANETS.forEach(function (p, i) { o[p.id] = list[i]; }); return o; });
    }).catch(function () { return null; });
  }
  function el(tag, attrs) { var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function pos(deg) {
    var t = deg * Math.PI / 180, x = Math.cos(t) * RX, y = Math.sin(t) * RY, r = TILT * Math.PI / 180;
    return { x: CX + x * Math.cos(r) - y * Math.sin(r), y: CY + x * Math.sin(r) + y * Math.cos(r) };
  }
  var busy = false;
  function draw() {
    if (!svg || !counts) return;
    // Only on the overview of the projects (not inside a project or a workflow), and when the layout leaves the inner orbit free.
    var hubs = svg.querySelectorAll('.project-hub'), crumb = document.getElementById('networkBreadcrumb');
    if (crumb && crumb.textContent.indexOf('›') !== -1) return;
    if (svg.querySelector('[data-network-type]:not([data-network-type=project]):not([data-network-type=satellite]):not([data-network-type=root])') || hubs.length > 5) return;
    busy = true;
    var g = el('g', { class: 'cc-crm', 'aria-label': 'Universo commerciale dal CRM' });
    g.append(el('ellipse', { class: 'cc-crm-orbit', cx: CX, cy: CY, rx: RX, ry: RY, transform: 'rotate(' + TILT + ' ' + CX + ' ' + CY + ')' }));
    g.append(el('ellipse', { class: 'cc-crm-orbit cc-crm-orbit-2', cx: CX, cy: CY, rx: RX + 30, ry: RY + 22, transform: 'rotate(' + (TILT + 10) + ' ' + CX + ' ' + CY + ')' }));
    PLANETS.forEach(function (p, i) {
      var c = counts[p.id]; if (!c) return;
      var at = pos(p.a), a = el('a', { class: 'cc-planet', href: '/radix-sales.html#' + p.id, style: '--pl:' + p.color + ';--d:' + (-i * 1.3) + 's' });
      var title = el('title', {}); title.textContent = p.label + ': ' + c.n + (c.more ? '+' : '') + ' ' + p.unit + ' · apri nel CRM'; a.append(title);
      a.append(el('circle', { class: 'cc-planet-halo', cx: at.x, cy: at.y, r: 22 }));
      a.append(el('circle', { class: 'cc-planet-body', cx: at.x, cy: at.y, r: 14 }));
      // Labels go where the project planets leave room: above for the upper pair, below for the bottom one, outside for the rest.
      var up = at.y < CY - 20, mid = Math.abs(at.x - CX) < 20, right = at.x > CX;
      var tx = up || mid ? at.x : at.x + (right ? 22 : -22), ty = up ? at.y - 40 : mid ? at.y + 36 : at.y - 2;
      var anchor = up || mid ? 'middle' : right ? 'start' : 'end';
      var t1 = el('text', { class: 'cc-planet-name', x: tx, y: ty, 'text-anchor': anchor }); t1.textContent = p.label;
      var t2 = el('text', { class: 'cc-planet-count', x: tx, y: ty + 15, 'text-anchor': anchor }); t2.textContent = c.n + (c.more ? '+' : '') + ' ' + p.unit;
      a.append(t1, t2); g.append(a);
    });
    // Above the project links and labels, under the core (the page draws the core last).
    svg.insertBefore(g, svg.lastElementChild);
    busy = false;
  }
  if (svg) {
    new MutationObserver(function () { if (!busy && !svg.querySelector('.cc-crm')) draw(); }).observe(svg, { childList: true });
    loadCounts().then(function (c) { counts = c; draw(); });
  }

  // Connected systems: one icon per service, lit when its key is configured on this deployment.
  var ABBR = { anthropic: 'AI', database: 'DB', buffer: 'Bf', 'openai-image': 'Im', heygen: 'HG', email: '@' };
  var top = document.querySelector('.top-status');
  if (top && window.fetch) {
    fetch('/api/integrations/status', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !Array.isArray(d.items) || !d.items.length) return;
      var on = d.items.filter(function (i) { return i.configured; }).length;
      var box = document.createElement('a'); box.className = 'cc-systems'; box.href = '#integrazioni';
      box.addEventListener('click', function (e) { var v = document.querySelector('[data-radix-view="integrations"]'); if (v) { e.preventDefault(); v.click(); } });
      box.title = 'Sistemi esterni con la chiave configurata su questo ambiente. La chiave viene verificata al primo utilizzo.';
      var txt = document.createElement('span'); txt.className = 'cc-systems-text';
      var b = document.createElement('b'); b.textContent = 'Sistemi connessi';
      var s = document.createElement('small'); s.textContent = on + '/' + d.items.length + ' configurati';
      txt.append(b, s); box.append(txt);
      var icons = document.createElement('span'); icons.className = 'cc-systems-icons';
      d.items.forEach(function (i) {
        var x = document.createElement('i'); x.dataset.service = i.id; x.dataset.on = String(!!i.configured);
        x.textContent = ABBR[i.id] || String(i.label || i.id).slice(0, 2); x.title = i.label + (i.configured ? ' · chiave configurata' : ' · non collegato');
        icons.append(x);
      });
      box.append(icons);
      top.insertBefore(box, top.firstChild);
    }).catch(function () {});
  }
})();
