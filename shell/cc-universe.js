// Command Center design layer (command-center-universo + layout mockups):
// 1) CRM planets (Aziende, Contatti, Opportunità, Attività, Interazioni, with their counts) orbiting the RADIX core
//    of the network view, each placed where it covers no project planet or label; around each project planet, one
//    satellite per agent that worked on it (saved conversations);
// 2) connected systems in the top bar, one icon per service, from /api/integrations/status (key present or not);
// 3) projects and a RADIX CORE box in the sidebar, Rivedi on the attention rows, icons and status rings in the activity.
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
  var CX = 450, CY = 245, RX = 128, RY = 108;
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

  // Agents that worked on each project (saved conversations), from the project flow: /api/workspace?resource=projects&journey=1.
  var roles = {}, projectAgents = null;
  function loadAgents() {
    var j = fetch('/api/workspace?resource=projects&journey=1', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; });
    var c = fetch('/agency/catalog.json', { cache: 'force-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return Promise.all([j, c]).then(function (res) {
      roles = (res[1] && res[1].roles) || {};
      var out = {};
      ((res[0] && res[0].items) || []).forEach(function (p) {
        var st = p.journey && p.journey.steps.find(function (x) { return x.id === 'agents'; });
        if (st && Array.isArray(st.agents) && st.agents.length) out[String(p.name).trim().toLowerCase()] = { id: p.id, agents: st.agents };
      });
      return out;
    }).catch(function () { return {}; });
  }
  function roleName(id) { return roles[id] || String(id).replace(/-/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); }); }

  // Boxes already on the map, in SVG units: project planets and their labels, the core.
  function toSvg(r) {
    var m = svg.getScreenCTM(); if (!m) return null; m = m.inverse();
    var a = new DOMPoint(r.left, r.top).matrixTransform(m), b = new DOMPoint(r.right, r.bottom).matrixTransform(m);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  }
  function obstacles() {
    var list = [{ x: CX - 84, y: CY - 84, w: 168, h: 168 }];
    svg.querySelectorAll('.project-hub .project-ring').forEach(function (c) {
      var x = +c.getAttribute('cx'), y = +c.getAttribute('cy'), r = +c.getAttribute('r') + 10;
      list.push({ x: x - r, y: y - r, w: 2 * r, h: 2 * r });
    });
    svg.querySelectorAll('.network-label strong, .network-label small').forEach(function (n) {
      var r = n.getBoundingClientRect(); if (!r.width) return;
      var b = toSvg(r); if (b) list.push({ x: b.x - 6, y: b.y - 3, w: b.w + 12, h: b.h + 6 });
    });
    return list;
  }
  function overlap(a, b) {
    var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function cost(boxes, list) { var c = 0; boxes.forEach(function (b) { list.forEach(function (o) { c += overlap(b, o); }); }); return c; }
  function textWidth(g, cls, str) { var t = el('text', { class: cls, x: -999, y: -999 }); t.textContent = str; g.append(t); var w = t.getComputedTextLength() || str.length * 7.5; t.remove(); return w; }
  // A label beside its dot, on the side facing away from the point it orbits.
  function labelBox(x, y, ang, r, w, h) {
    var c = Math.cos(ang), s = Math.sin(ang), side = Math.abs(c) > .45, lx, ly, anchor;
    if (side) { anchor = c > 0 ? 'start' : 'end'; lx = x + (c > 0 ? r + 6 : -r - 6); ly = y - h / 2 + 4; }
    else { anchor = 'middle'; lx = x; ly = s < 0 ? y - r - h - 2 : y + r + 4; }
    var bx = anchor === 'start' ? lx : anchor === 'end' ? lx - w : lx - w / 2;
    return { box: { x: bx - 3, y: ly - 2, w: w + 6, h: h + 4 }, x: lx, y: ly, anchor: anchor };
  }

  // Agent satellites: around each project planet, on the outer side, away from the project's own label below it.
  function drawAgents(g, taken) {
    if (!projectAgents) return;
    svg.querySelectorAll('.project-hub[data-network-type=project]').forEach(function (hub) {
      var name = String(hub.getAttribute('aria-label') || '').split(' · ')[0].trim().toLowerCase(), p = projectAgents[name];
      var ring = hub.querySelector('.project-ring'); if (!p || !ring) return;
      var hx = +ring.getAttribute('cx'), hy = +ring.getAttribute('cy'), hr = +ring.getAttribute('r');
      var color = getComputedStyle(hub).getPropertyValue('--node-color').trim() || '#3ff0b0';
      var out = Math.atan2(hy - CY, hx - CX), RXa = hr + 44, RYa = hr + 30, shown = p.agents.slice(0, 6), used = [];
      shown.forEach(function (id, i) {
        var label = roleName(id), w = textWidth(g, 'cc-agent-name', label), best = null;
        for (var k = 0; k < 24; k++) {
          var ang = out + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 12, norm = ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          if (norm > .7 && norm < 2.45) continue; // under the planet: that is where its name sits
          if (used.some(function (u) { return Math.abs(Math.atan2(Math.sin(u - ang), Math.cos(u - ang))) < .62; })) continue;
          var x = hx + Math.cos(ang) * RXa, y = hy + Math.sin(ang) * RYa, L = labelBox(x, y, ang, 7, w, 11);
          var dot = { x: x - 9, y: y - 9, w: 18, h: 18 }, c = cost([dot, L.box], taken) + k * 4;
          if (!best || c < best.c) best = { c: c, ang: ang, x: x, y: y, L: L, dot: dot };
          if (c === 0) break;
        }
        if (!best) return;
        used.push(best.ang); taken.push(best.dot, best.L.box);
        var a = el('a', { class: 'cc-agent', href: '/agents.html?agent=' + encodeURIComponent(id) + '&project=' + encodeURIComponent(p.id), style: '--pl:' + color });
        var t = el('title', {}); t.textContent = label + ' · ha lavorato su questo progetto (conversazioni salvate)'; a.append(t);
        a.append(el('line', { class: 'cc-agent-tether', x1: hx + Math.cos(best.ang) * (hr + 2), y1: hy + Math.sin(best.ang) * (hr + 2), x2: best.x, y2: best.y }));
        a.append(el('circle', { class: 'cc-agent-dot', cx: best.x, cy: best.y, r: 6.5 }));
        a.append(el('circle', { class: 'cc-agent-core', cx: best.x, cy: best.y, r: 2.4 }));
        var tx = el('text', { class: 'cc-agent-name', x: best.L.x, y: best.L.y + 9, 'text-anchor': best.L.anchor }); tx.textContent = label; a.append(tx);
        g.append(a);
      });
    });
  }

  // CRM planets on the inner orbit, each where it covers no project planet, label or agent.
  function drawCrm(g, taken) {
    if (!counts) return;
    g.append(el('ellipse', { class: 'cc-crm-orbit', cx: CX, cy: CY, rx: RX, ry: RY }));
    g.append(el('ellipse', { class: 'cc-crm-orbit cc-crm-orbit-2', cx: CX, cy: CY, rx: RX + 30, ry: RY + 22, transform: 'rotate(10 ' + CX + ' ' + CY + ')' }));
    var used = [];
    PLANETS.forEach(function (p, i) {
      var c = counts[p.id]; if (!c) return;
      var count = c.n + (c.more ? '+' : '') + ' ' + p.unit, w = Math.max(textWidth(g, 'cc-planet-name', p.label), textWidth(g, 'cc-planet-count', count)), best = null;
      [0, 18, 34].forEach(function (dr) {
        for (var k = 0; k < 72; k++) {
          var ang = (p.a + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 5) * Math.PI / 180;
          if (used.some(function (u) { return Math.abs(Math.atan2(Math.sin(u - ang), Math.cos(u - ang))) < .5; })) continue;
          var x = CX + Math.cos(ang) * (RX + dr), y = CY + Math.sin(ang) * (RY + dr * .8), L = labelBox(x, y, ang, 16, w, 30);
          var body = { x: x - 18, y: y - 18, w: 36, h: 36 }, s = cost([body, L.box], taken) + k * 6 + dr * 20;
          if (!best || s < best.s) best = { s: s, ang: ang, x: x, y: y, L: L, body: body };
        }
      });
      used.push(best.ang); taken.push(best.body, best.L.box);
      var a = el('a', { class: 'cc-planet', href: '/radix-sales.html#' + p.id, style: '--pl:' + p.color + ';--d:' + (-i * 1.3) + 's' });
      var title = el('title', {}); title.textContent = p.label + ': ' + count + ' · apri nel CRM'; a.append(title);
      a.append(el('circle', { class: 'cc-planet-halo', cx: best.x, cy: best.y, r: 20 }));
      a.append(el('circle', { class: 'cc-planet-body', cx: best.x, cy: best.y, r: 12 }));
      var t1 = el('text', { class: 'cc-planet-name', x: best.L.x, y: best.L.y + 13, 'text-anchor': best.L.anchor }); t1.textContent = p.label;
      var t2 = el('text', { class: 'cc-planet-count', x: best.L.x, y: best.L.y + 28, 'text-anchor': best.L.anchor }); t2.textContent = count;
      a.append(t1, t2); g.append(a);
    });
  }

  var busy = false;
  function draw() {
    if (!svg || (!counts && !projectAgents)) return;
    // Only on the overview of the projects (not inside a project or a workflow), and when the layout leaves the inner orbit free.
    var hubs = svg.querySelectorAll('.project-hub'), crumb = document.getElementById('networkBreadcrumb');
    if (crumb && crumb.textContent.indexOf('›') !== -1) return;
    if (svg.querySelector('[data-network-type]:not([data-network-type=project]):not([data-network-type=satellite]):not([data-network-type=root])') || hubs.length > 5) return;
    if (!svg.getBoundingClientRect().width) return;
    busy = true;
    var old = svg.querySelector('.cc-crm'); if (old) old.remove();
    var g = el('g', { class: 'cc-crm', 'aria-label': 'Universo commerciale dal CRM e agenti dei progetti' });
    // Above the project links and labels, under the core (the page draws the core last).
    svg.insertBefore(g, svg.lastElementChild);
    var taken = obstacles();
    drawAgents(g, taken);
    drawCrm(g, taken);
    busy = false;
  }
  if (svg) {
    new MutationObserver(function () { if (!busy && !svg.querySelector('.cc-crm')) draw(); }).observe(svg, { childList: true });
    // The map is laid out only when visible: draw again when it first gets a size.
    if (window.ResizeObserver) new ResizeObserver(function () { if (!svg.querySelector('.cc-crm')) draw(); }).observe(svg);
    Promise.all([loadCounts(), loadAgents()]).then(function (r) { counts = r[0]; projectAgents = r[1]; draw(); });
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

  // Saved dashboard snapshot (the same one the page reads): projects, activity types, counts for the sidebar box.
  var COLORS = ['#3ff0b0', '#4aa8ff', '#a27bff', '#f5b544', '#ff7a9a', '#38d6e8'];
  function hubColor(name, i) {
    var hub = svg && Array.prototype.find.call(svg.querySelectorAll('.project-hub[data-network-type=project]'), function (h) { return String(h.getAttribute('aria-label') || '').split(' · ')[0].trim() === name; });
    return (hub && getComputedStyle(hub).getPropertyValue('--node-color').trim()) || COLORS[i % COLORS.length];
  }
  function node(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function initial(t) { var m = String(t || '').replace(/^[^\p{L}\p{N}]+/u, ''); return (m.charAt(0) || '•').toUpperCase(); }

  // Sidebar, Command Center only: the projects, then a RADIX CORE box with the counts of the saved snapshot.
  function sidebar(d) {
    var side = document.getElementById('rx-sidebar'), foot = side && side.querySelector('.rx-foot');
    if (!side || !foot || side.querySelector('.cc-side')) return;
    var box = node('div', 'cc-side');
    var head = node('div', 'cc-side-head'); head.append(node('span', 'rx-label', 'Progetti'));
    var add = node('a', 'cc-side-add', '+'); add.href = '/agency/new-project.html'; add.title = 'Nuovo progetto'; add.setAttribute('aria-label', 'Nuovo progetto'); head.append(add);
    box.append(head);
    var list = node('div', 'cc-side-projects');
    (d.projects || []).slice(0, 6).forEach(function (p, i) {
      var a = node('a', 'cc-side-project'); a.href = '/project-profile.html?id=' + encodeURIComponent(p.id); a.style.setProperty('--pc', hubColor(p.name, i));
      a.append(node('i', '', initial(p.name)), node('span', '', p.name)); list.append(a);
    });
    var more = node('a', 'cc-side-project cc-side-new'); more.href = '/agency/new-project.html'; more.append(node('i', '', '+'), node('span', '', 'Nuovo progetto')); list.append(more);
    box.append(list);
    var m = d.metrics || {}, live = d.dataQuality && d.dataQuality.realtimeExecutionVerified === true;
    var core = node('a', 'cc-core-box'); core.href = '/agents.html';
    core.addEventListener('click', function (e) { var v = document.querySelector('[data-radix-view="agents"]'); if (v) { e.preventDefault(); v.click(); } });
    var top = node('div', 'cc-core-top'); top.append(node('i', 'cc-core-mark', '✦'));
    var tt = node('div'); tt.append(node('b', '', 'RADIX CORE'), node('small', '', live ? 'Esecuzione verificata' : 'Stato salvato · non live')); top.append(tt); core.append(top);
    // Same numbers the page shows: Digital Team total, saved workflows, rows waiting in Needs your attention.
    var rows = [['agents', live ? 'Agenti attivi' : 'Agenti configurati'], ['flows', live ? 'Workflow in corso' : 'Workflow salvati'], ['wait', 'Da decidere']];
    rows.forEach(function (r) { var row = node('div', 'cc-core-row'); row.dataset.k = r[0]; row.append(node('b', '', '—'), node('span', '', r[1])); core.append(row); });
    function fill() {
      var team = 0; document.querySelectorAll('#teamGrid .team-count').forEach(function (n) { team += parseInt(n.textContent, 10) || 0; });
      var v = { agents: live ? m.activeAgents : team || '—', flows: live ? m.activeWorkflows : m.workflows, wait: document.querySelectorAll('#attentionList .workflow-card').length };
      core.querySelectorAll('.cc-core-row').forEach(function (row) { row.firstChild.textContent = String(v[row.dataset.k] == null ? '—' : v[row.dataset.k]); });
    }
    fill();
    ['teamGrid', 'attentionList'].forEach(function (id) { var t = document.getElementById(id); if (t) new MutationObserver(fill).observe(t, { childList: true }); });
    box.append(core);
    side.insertBefore(box, foot);
  }

  // Needs your attention: a letter avatar and a Rivedi pill on each row (the row itself already opens the item).
  function attention() {
    document.querySelectorAll('#attentionList .workflow-card:not([data-cc])').forEach(function (c) {
      c.setAttribute('data-cc', '');
      var name = c.querySelector('.workflow-name');
      c.prepend(node('i', 'cc-avatar', initial(name && name.textContent)));
      var go = node('span', 'cc-review', 'Rivedi →'); go.setAttribute('aria-hidden', 'true'); c.append(go);
    });
  }

  // Live activity: an icon tile (project letter or agent mark) and a status ring from the saved event type.
  var RING = { done: ['done', 'Completato'], start: ['run', 'Avviato'], error: ['err', 'Errore registrato'], warn: ['warn', 'Avviso'], info: ['info', 'Evento salvato'] };
  function activity(d) {
    var events = (d && d.activity || []).slice(0, 10);
    document.querySelectorAll('#activityList .activity-item').forEach(function (row, i) {
      if (row.querySelector('.cc-act-icon')) return;
      var e = events[i], who = row.querySelector('.activity-text b'), name = who ? who.textContent : '';
      if (e && (e.orchestrator || 'RADIX') !== name) e = null; // a different snapshot: no guess
      var pi = (d.projects || []).findIndex(function (p) { return p.name === name; });
      var ic = node('i', 'cc-act-icon' + (pi === -1 ? ' agent' : ''), pi === -1 ? '✦' : initial(name));
      ic.style.setProperty('--ac', pi === -1 ? '#9a6bff' : hubColor(name, pi));
      row.append(ic);
      var k = RING[(e && e.type) || ''] || null;
      if (k) { var r = node('i', 'cc-ring ' + k[0]); r.title = k[1]; row.append(r); }
      row.classList.add('cc-act');
    });
  }

  var snap = null;
  if (document.getElementById('activityList')) {
    fetch('/api/state?view=dashboard', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return; snap = d; sidebar(d); activity(d);
    }).catch(function () {});
    attention();
    new MutationObserver(attention).observe(document.getElementById('attentionList'), { childList: true });
    new MutationObserver(function () { if (snap) activity(snap); }).observe(document.getElementById('activityList'), { childList: true });
  }
})();
