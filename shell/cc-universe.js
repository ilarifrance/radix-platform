// Command Center design layer (command-center-universo + layout mockups):
// 1) the overview of the network view: the RADIX earth as core, each project a constellation of its agents and workflows
//    (the CRM planets live in Sales Orbit);
// 2) connected systems in the top bar, one icon per service, from /api/integrations/status (key present or not);
// 3) projects and a RADIX CORE box in the sidebar, Rivedi on the attention rows, icons and status rings in the activity.
// Presentation only: it adds its own layer over the map renderNetwork() draws and never changes the page's nodes or handlers.
'use strict';
(function () {
  // ---- The network (Francesco, 16/10 night: the world alone did not convince, the earlier network is better and must improve):
  // on the overview, the RADIX earth (sales/orbit-globe.js) is the core and each project is a constellation around it, as in
  // command-center-layout-mockup.png: the project in its own orbit, with its agents and workflows as named satellites.
  // Inside a project the page's own map comes back. Projects, colours and workflows are read from the map renderNetwork()
  // just drew; a click on a project or one of its satellites clicks the project's own hub, so the drill-down is the page's.
  // Agents per project come from the project flow (agents with saved conversations).
  var svg = document.getElementById('networkSvg'), stage = document.getElementById('networkStage');
  var AGENT_NAMES = { 'marketing-orchestrator': 'Orchestratore Marketing', 'brand-strategist': 'Stratega di Marca', strategist: 'Digital Strategist', copywriter: 'Copywriter', 'art-director': 'Art Director', 'ai-specialist': 'AI Specialist', 'social-media-manager': 'Social Media Manager', 'seo-geo': 'SEO e GEO', 'web-content': 'Content e UX Writer', 'video-producer': 'Video Producer', 'paid-media': 'Paid Media', analytics: 'Analytics e CRO', orchestrator: 'Pipeline post', partner: 'Orchestratore Studio', 'commercialista-senior': 'Commercialista Senior', 'commercialista-operativo': 'Commercialista Operativo', contabilita: 'Contabilità', 'lavoro-paghe': 'Lavoro e Paghe', 'segreteria-studio': 'Segreteria', 'web-developer': 'Web Developer', 'legal-orchestrator': 'Orchestratore Legale', 'legal-gdpr': 'Privacy e GDPR', 'legal-contracts': 'Contratti e IP', 'legal-banking': 'Diritto Bancario', 'legal-risk-analyst': 'Rischio Legale', 'comm-orchestrator': 'Orchestratore Commerciale', 'comm-market-analyst': 'Analista di Mercato', 'comm-contact-finder': 'Ricerca Contatti', 'comm-email-outreach': 'Email Outreach', 'comm-crm-manager': 'CRM e Sales Ops' };
  function agentName(id) { return AGENT_NAMES[id] || String(id).replace(/[-_]+/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }); }
  var projectAgents = {};
  function loadAgents() {
    return fetch('/api/workspace?resource=projects&journey=1', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var out = {};
      ((d && d.items) || []).forEach(function (p) {
        var st = p.journey && p.journey.steps.find(function (x) { return x.id === 'agents'; });
        out[String(p.name).trim().toLowerCase()] = (st && Array.isArray(st.agents)) ? st.agents : [];
      });
      return out;
    }).catch(function () { return {}; });
  }

  var MAX = 6, world = null, cv = null, ctx = null, nodes = null, W = 0, H = 0, dpr = 1, core = null, items = [], small = false;
  var reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function atRoot() {
    var crumb = document.getElementById('networkBreadcrumb');
    return !!svg.querySelector('.project-hub[data-network-type=project]') && !(crumb && crumb.querySelector('[data-level=project],[data-level=workflow]'));
  }
  function mapProjects() {
    var clusters = svg.querySelectorAll('.network-cluster'), out = [];
    svg.querySelectorAll('.project-hub[data-network-type=project]').forEach(function (h, i) {
      var name = (h.getAttribute('aria-label') || '').split(' · ')[0], wf = [];
      if (clusters[i]) clusters[i].querySelectorAll('.scene-satellite').forEach(function (s) { var l = (s.getAttribute('aria-label') || '').split(' · ')[0].trim(); if (l) wf.push(l); });
      out.push({ hub: h, name: name, color: (h.style.getPropertyValue('--node-color') || '#36edbd').trim(), wf: wf });
    });
    return out;
  }
  // Slots: two columns of constellations either side of the core (2 rows up to 4 projects, 3 rows up to 6);
  // on a phone the core goes on top and the projects in a two-column grid below it.
  function size() {
    if (!cv) return; var r = stage.getBoundingClientRect(), z = stage.offsetWidth ? r.width / stage.offsetWidth : 1;
    W = stage.offsetWidth; H = stage.offsetHeight; dpr = Math.min(2, (window.devicePixelRatio || 1) * z);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    small = W < 640; world.classList.toggle('cc-small', small);
    var n = items.length, rows = small ? Math.ceil(n / 2) : (n > 4 ? 3 : 2);
    if (small) {
      var R0 = Math.min(W * .13, 50), top = 22 + R0 * 2 + 34, rh = (H - top - 10) / Math.max(1, rows);
      core = { cx: W / 2, cy: 22 + R0, R: R0 };
      items.forEach(function (it, i) { it.x = W * (i % 2 ? .74 : .26); it.y = top + rh * (Math.floor(i / 2) + .5); it.rx = W * .17; it.ry = Math.min(rh * .3, 34); it.left = !(i % 2); });
    } else {
      var R = Math.max(58, Math.min(W * .085, H * .15)), top = 14, bottom = 56, rowH = (H - top - bottom) / rows;
      core = { cx: W / 2, cy: top + (H - top - bottom) / 2, R: R };
      var rx = Math.max(70, Math.min(W * .12, 130)), col = Math.max(R + rx + 40, Math.min(W * .3, W / 2 - rx - 24));
      // alternate left / right; each column spreads its own projects over the height (5 = three on the left, two on the right)
      var per = [Math.ceil(n / 2), Math.floor(n / 2)];
      items.forEach(function (it, i) {
        var right = i % 2 === 1, row = Math.floor(i / 2), m = per[right ? 1 : 0], h = (H - top - bottom) / m;
        it.left = !right; it.x = W / 2 + (right ? col : -col); it.y = top + h * (row + .5);
        it.rx = rx; it.ry = Math.min(rowH * .3, 58);
      });
    }
    layout();
  }
  // satellites sit on the project's orbit, never under the project's own label (bottom centre)
  var SAT_DEG = [200, 340, 250, 20, 160, 295];
  function layout() {
    if (!core) return;
    items.forEach(function (it) {
      it.el.style.left = it.x + 'px'; it.el.style.top = it.y + 'px';
      it.sats.forEach(function (s, k) {
        var a = SAT_DEG[k] * Math.PI / 180;
        s.x = it.x + Math.cos(a) * it.rx; s.y = it.y + Math.sin(a) * it.ry;
        s.el.style.left = s.x + 'px'; s.el.style.top = s.y + 'px';
        // the label points away from the project, unless it would leave the map
        // or sits above / below its dot when there is no room at the side
        s.el.classList.remove('cc-left', 'cc-top', 'cc-bot'); s.el.style.marginLeft = '';
        var w = s.el.offsetWidth || 120, left = Math.cos(a) < -.05;
        if (left ? s.x - w >= 4 : s.x + w <= W - 4) { if (left) s.el.classList.add('cc-left'); }
        else {
          s.el.classList.add(Math.sin(a) < 0 ? 'cc-top' : 'cc-bot');
          var half = s.el.offsetWidth / 2, shift = Math.min(0, W - 4 - (s.x + half)) + Math.max(0, 4 - (s.x - half));
          if (shift) s.el.style.marginLeft = shift + 'px';
        }
      });
    });
    var cap = nodes.querySelector('.cc-world-core'); if (cap) { cap.style.left = core.cx + 'px'; cap.style.top = (core.cy + core.R + 14) + 'px'; }
    var more = nodes.querySelector('.cc-more'); if (more) { more.style.left = core.cx + 'px'; more.style.top = (H - 14) + 'px'; }
  }
  function build() {
    if (!svg || !stage) return;
    var on = atRoot();
    stage.classList.toggle('cc-world-on', on);
    if (!on) { if (world) world.hidden = true; return; }
    if (!world) {
      world = node('div', 'cc-world'); cv = node('canvas', 'cc-world-sky'); cv.setAttribute('aria-hidden', 'true');
      nodes = node('div', 'cc-world-nodes'); world.append(cv, nodes); stage.append(world);
      ctx = cv.getContext('2d');
      if (window.ResizeObserver) new ResizeObserver(size).observe(stage);
      requestAnimationFrame(loop);
    }
    world.hidden = false; nodes.replaceChildren();
    var cap = node('div', 'cc-world-core'); cap.append(node('b', '', 'RADIX'), node('small', '', 'CORE')); nodes.append(cap);
    var key = node('div', 'cc-key'); key.setAttribute('aria-hidden', 'true');
    key.append(node('span', 'cc-key-agent', 'agente'), node('span', 'cc-key-wf', 'workflow')); nodes.append(key);
    var all = mapProjects();
    items = all.slice(0, MAX).map(function (p) {
      var ag = (projectAgents[p.name.trim().toLowerCase()] || []).map(agentName), meta = [];
      if (p.wf.length) meta.push(p.wf.length + ' workflow');
      if (ag.length) meta.push(ag.length + (ag.length === 1 ? ' agente' : ' agenti'));
      var open = function () { p.hub.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
      var b = node('button', 'cc-proj'); b.type = 'button'; b.style.setProperty('--c', p.color);
      var t = node('span', 'cc-proj-t'); t.append(node('b', '', p.name), node('small', '', meta.length ? meta.join(' · ') : 'Profilo progetto'));
      b.append(node('i', '', initial(p.name)), t);
      b.setAttribute('aria-label', 'Apri il progetto ' + p.name + (meta.length ? ', ' + meta.join(', ') : ''));
      b.addEventListener('click', open); nodes.append(b);
      // satellites: agents first, then workflows; what does not fit goes in one +N
      var list = ag.map(function (n) { return { label: n, kind: 'agent' }; }).concat(p.wf.map(function (n) { return { label: n, kind: 'wf' }; }));
      if (list.length > SAT_DEG.length) { var rest = list.splice(SAT_DEG.length - 1); list.push({ label: '+' + rest.length, kind: 'more', title: rest.map(function (r) { return r.label; }).join(', ') }); }
      var sats = list.map(function (s) {
        var e = node('button', 'cc-sat cc-sat-' + s.kind); e.type = 'button'; e.tabIndex = -1; e.style.setProperty('--c', p.color);
        e.title = s.title || (s.kind === 'agent' ? 'Agente · ' : s.kind === 'wf' ? 'Workflow · ' : '') + s.label;
        e.append(node('i'), node('span', '', s.label)); e.addEventListener('click', open); nodes.append(e);
        return { el: e, kind: s.kind };
      });
      return { el: b, color: p.color, sats: sats };
    });
    if (all.length > MAX) {
      var m = node('button', 'cc-more'); m.type = 'button'; m.textContent = '+' + (all.length - MAX) + ' progetti · vedi la lista';
      m.addEventListener('click', function () { var l = Array.prototype.find.call(document.querySelectorAll('button'), function (x) { return x.textContent.trim() === 'Lista'; }); if (l) l.click(); });
      nodes.append(m);
    }
    var un = svg.querySelector('.unassigned-node');
    if (un) {
      var u = node('button', 'cc-shared'); u.type = 'button';
      u.textContent = ((un.getAttribute('aria-label') || 'Workflow condivisi').split(' · ')[0]) + ' →';
      u.addEventListener('click', function () { un.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      nodes.append(u);
    }
    size();
    if (!window.RadixGlobe && !document.getElementById('cc-globe-land')) {
      var s = document.createElement('script'); s.id = 'cc-globe-land'; s.src = '/sales/orbit-globe.js'; document.head.appendChild(s);
    }
  }
  function rgba(hex, a) { var h = hex.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return isNaN(n) ? 'rgba(54,237,189,' + a + ')' : 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function frame(t) {
    if (!ctx || !core || !W) return;
    var g = core, G = window.RadixGlobe;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    items.forEach(function (it) {
      // the project's own orbit: a soft halo and a dotted ellipse with a glint running along it
      var halo = ctx.createRadialGradient(it.x, it.y, 0, it.x, it.y, it.rx * 1.1);
      halo.addColorStop(0, rgba(it.color, .14)); halo.addColorStop(1, rgba(it.color, 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.ellipse(it.x, it.y, it.rx * 1.1, it.ry * 1.25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(it.color, .38); ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.ellipse(it.x, it.y, it.rx, it.ry, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      var a = t * .00018 + it.x * .01, gx = it.x + Math.cos(a) * it.rx, gy = it.y + Math.sin(a) * it.ry, gl = ctx.createRadialGradient(gx, gy, 0, gx, gy, 7);
      gl.addColorStop(0, 'rgba(255,248,225,.95)'); gl.addColorStop(.35, rgba(it.color, .8)); gl.addColorStop(1, rgba(it.color, 0)); ctx.fillStyle = gl; ctx.fillRect(gx - 7, gy - 7, 14, 14);
      // spokes to the satellites
      it.sats.forEach(function (s) { ctx.strokeStyle = rgba(it.color, .32); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(it.x, it.y); ctx.lineTo(s.x, s.y); ctx.stroke(); });
      // the link from the core: a glowing curve with a pulse travelling out to the project
      var dx = it.x - g.cx, dy = it.y - g.cy, d = Math.hypot(dx, dy) || 1, sx = g.cx + dx / d * g.R * 1.03, sy = g.cy + dy / d * g.R * 1.03, ex = it.x - dx / d * 30, ey = it.y - dy / d * 30;
      var mx = (sx + ex) / 2 - dy / d * 26 * (it.left ? 1 : -1), my = (sy + ey) / 2 + dx / d * 26 * (it.left ? 1 : -1);
      var lg = ctx.createLinearGradient(sx, sy, ex, ey); lg.addColorStop(0, 'rgba(120,255,230,.55)'); lg.addColorStop(1, rgba(it.color, .85));
      ctx.save(); ctx.strokeStyle = lg; ctx.lineWidth = 1.4; ctx.shadowColor = it.color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke(); ctx.restore();
      var f = (t * .00035 + it.y * .003) % 1, q = 1 - f, px = q * q * sx + 2 * q * f * mx + f * f * ex, py = q * q * sy + 2 * q * f * my + f * f * ey;
      ctx.fillStyle = '#fff'; ctx.shadowColor = it.color; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    });
    if (G) G.draw(ctx, g, .6 + t * .00006);
  }
  function loop(t) { if (world && !world.hidden) frame(reduce.matches ? 0 : t); requestAnimationFrame(loop); }
  if (svg && stage) {
    new MutationObserver(build).observe(svg, { childList: true });
    var crumb = document.getElementById('networkBreadcrumb'); if (crumb) new MutationObserver(build).observe(crumb, { childList: true, subtree: true, characterData: true });
    build();
    loadAgents().then(function (a) { projectAgents = a; build(); });
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
