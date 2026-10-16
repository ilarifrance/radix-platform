// Command Center design layer (command-center-universo + layout mockups):
// 1) the overview of the network view as the rotating dotted earth, projects on the outer orbit, services on the inner one
//    (the CRM planets now live in Sales Orbit);
// 2) connected systems in the top bar, one icon per service, from /api/integrations/status (key present or not);
// 3) projects and a RADIX CORE box in the sidebar, Rivedi on the attention rows, icons and status rings in the activity.
// Presentation only: it adds its own layer over the map renderNetwork() draws and never changes the page's nodes or handlers.
'use strict';
(function () {
  // ---- The world (Francesco, 16/10 evening): on the overview the network becomes the rotating dotted earth, with the
  // projects on the outer orbit and the services on the inner one. Inside a project the page's own map comes back.
  // Projects, colours and workflow counts are read from the map renderNetwork() just drew; a click on a project
  // clicks its own hub, so the drill-down is the page's. Agents per project come from the project flow (saved conversations).
  var svg = document.getElementById('networkSvg'), stage = document.getElementById('networkStage');
  var SERVICES = [
    { label: 'Marketing Agency', href: '/agency/index.html', color: '#ff8fc8', a: 198 },
    { label: 'Sales Intelligence', href: '/sales-orbit-higgsfield.html', color: '#36edbd', a: 342 },
    { label: 'Project Management', href: '/radix-pm-concept.html', color: '#ffc46b', a: 162 },
    { label: 'Studio', href: '/legal/index.html', color: '#9fb4ff', a: 18 }
  ];
  var projectAgents = {};
  function loadAgents() {
    return fetch('/api/workspace?resource=projects&journey=1', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var out = {};
      ((d && d.items) || []).forEach(function (p) {
        var st = p.journey && p.journey.steps.find(function (x) { return x.id === 'agents'; });
        out[String(p.name).trim().toLowerCase()] = (st && Array.isArray(st.agents)) ? st.agents.length : 0;
      });
      return out;
    }).catch(function () { return {}; });
  }
  function landPoints() {
    var L = window.RadixGlobeLand; if (!L) return null;
    var raw = atob(L.LAND), ga = Math.PI * (3 - Math.sqrt(5)), pts = [];
    for (var i = 0; i < L.N; i += 2) {
      if (!(raw.charCodeAt(i >> 3) >> (i & 7) & 1)) continue;
      var y = 1 - (i + .5) / L.N * 2, r = Math.sqrt(1 - y * y), t = ga * i, h = Math.sin(i * 12.9898) * 43758.5453;
      pts.push([Math.cos(t) * r, y, -Math.sin(t) * r, h - Math.floor(h) < .08 ? 1 : 0]);
    }
    return pts;
  }

  var world = null, cv = null, ctx = null, nodes = null, pts = null, W = 0, H = 0, dpr = 1, geo = null, items = [];
  var reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function atRoot() {
    var crumb = document.getElementById('networkBreadcrumb');
    return !!svg.querySelector('.project-hub[data-network-type=project]') && !(crumb && crumb.querySelector('[data-level=project],[data-level=workflow]'));
  }
  function mapProjects() {
    var clusters = svg.querySelectorAll('.network-cluster'), out = [];
    svg.querySelectorAll('.project-hub[data-network-type=project]').forEach(function (h, i) {
      var name = (h.getAttribute('aria-label') || '').split(' · ')[0];
      out.push({ hub: h, name: name, color: (h.style.getPropertyValue('--node-color') || '#36edbd').trim(), wf: clusters[i] ? clusters[i].querySelectorAll('.scene-satellite').length : 0 });
    });
    return out;
  }
  function size() {
    if (!cv) return; var r = stage.getBoundingClientRect(), z = stage.offsetWidth ? r.width / stage.offsetWidth : 1;
    W = stage.offsetWidth; H = stage.offsetHeight; dpr = Math.min(2, (window.devicePixelRatio || 1) * z);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var small = W < 560, R = small ? Math.min(W * .17, H * .21) : Math.max(66, Math.min(W * .13, H * .2));
    world.classList.toggle('cc-small', small);
    geo = small ? { cx: W / 2, cy: H * .52, R: R, rx: W * .37, ry: H * .34, sx: R * 1.45, sy: R * .55 } : { cx: W / 2, cy: H * .47, R: R, rx: Math.min(W * .42, R * 3.6), ry: H * .31, sx: R * 1.8, sy: R * .62 };
  }
  function layout() {
    if (!geo) return;
    var n = items.length, top = Math.ceil(n / 2), bottom = n - top;
    items.forEach(function (it, i) {
      var up = i < top, k = up ? i : i - top, m = up ? top : bottom;
      var deg = up ? (m === 1 ? 270 : 218 + k * (104 / (m - 1))) : (m === 1 ? 90 : 142 - k * (104 / (m - 1)));
      var a = deg * Math.PI / 180;
      it.x = geo.cx + Math.cos(a) * geo.rx; it.y = geo.cy + Math.sin(a) * geo.ry;
      it.el.style.left = it.x + 'px'; it.el.style.top = it.y + 'px'; it.el.classList.toggle('cc-up', up);
    });
    nodes.querySelectorAll('.cc-svc').forEach(function (b, i) {
      var a = SERVICES[i].a * Math.PI / 180, x = geo.cx + Math.cos(a) * geo.sx, y = geo.cy + Math.sin(a) * geo.sy;
      b.style.left = x + 'px'; b.style.top = y + 'px'; b.classList.toggle('cc-left', Math.cos(a) < 0);
    });
    var core = nodes.querySelector('.cc-world-core'); if (core) { core.style.left = geo.cx + 'px'; core.style.top = (geo.cy + geo.R + 12) + 'px'; }
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
      if (window.ResizeObserver) new ResizeObserver(function () { size(); layout(); }).observe(stage);
      requestAnimationFrame(loop);
    }
    world.hidden = false; nodes.replaceChildren();
    var core = node('div', 'cc-world-core'); core.append(node('b', '', 'RADIX'), node('small', '', 'AI OPERATING SYSTEM')); nodes.append(core);
    SERVICES.forEach(function (s) {
      var a = node('a', 'cc-svc'); a.href = s.href; a.style.setProperty('--c', s.color); a.title = 'Apri ' + s.label;
      a.append(node('i'), node('span', '', s.label)); nodes.append(a);
    });
    items = mapProjects().map(function (p) {
      var b = node('button', 'cc-proj'); b.type = 'button'; b.style.setProperty('--c', p.color);
      var ag = projectAgents[p.name.trim().toLowerCase()] || 0, meta = [];
      if (p.wf) meta.push(p.wf + (p.wf === 1 ? ' workflow' : ' workflow'));
      if (ag) meta.push(ag + (ag === 1 ? ' agente' : ' agenti'));
      var t = node('span', 'cc-proj-t'); t.append(node('b', '', p.name), node('small', '', meta.length ? meta.join(' · ') : 'Profilo progetto'));
      b.append(node('i', '', initial(p.name)), t);
      b.setAttribute('aria-label', 'Apri il progetto ' + p.name + (meta.length ? ', ' + meta.join(', ') : ''));
      b.addEventListener('click', function () { p.hub.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      nodes.append(b);
      return { el: b, color: p.color };
    });
    var un = svg.querySelector('.unassigned-node');
    if (un) {
      var u = node('button', 'cc-shared'); u.type = 'button';
      u.textContent = ((un.getAttribute('aria-label') || 'Workflow condivisi').split(' · ')[0]) + ' →';
      u.addEventListener('click', function () { un.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      nodes.append(u);
    }
    size(); layout();
    if (!pts && !window.RadixGlobeLand && !document.getElementById('cc-globe-land')) {
      var s = document.createElement('script'); s.id = 'cc-globe-land'; s.src = '/sales/orbit-globe.js'; s.onload = function () { pts = landPoints(); }; document.head.appendChild(s);
    } else if (!pts) pts = landPoints();
  }
  function frame(t) {
    if (!ctx || !geo || !W) return;
    var g = geo, cx = g.cx, cy = g.cy, R = g.R, rot = t * .00005 + .6, tilt = .36, ct = Math.cos(tilt), st = Math.sin(tilt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    // orbits: projects outside, services inside, a few glints moving along them
    [[g.rx, g.ry, '84,240,210', .28, .00004], [g.sx, g.sy, '160,190,255', .32, -.00007]].forEach(function (o) {
      ctx.beginPath(); ctx.ellipse(cx, cy, o[0], o[1], 0, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(' + o[2] + ',' + o[3] + ')'; ctx.lineWidth = 1; ctx.setLineDash([2, 6]); ctx.stroke(); ctx.setLineDash([]);
      for (var k = 0; k < 4; k++) { var a = t * o[4] + k * 1.57, x = cx + Math.cos(a) * o[0], y = cy + Math.sin(a) * o[1], gr = ctx.createRadialGradient(x, y, 0, x, y, 6);
        gr.addColorStop(0, 'rgba(255,245,215,.9)'); gr.addColorStop(.35, 'rgba(' + o[2] + ',.7)'); gr.addColorStop(1, 'rgba(' + o[2] + ',0)'); ctx.fillStyle = gr; ctx.fillRect(x - 6, y - 6, 12, 12); }
    });
    // links from the earth to each project
    items.forEach(function (it) {
      var dx = it.x - cx, dy = it.y - cy, d = Math.hypot(dx, dy) || 1, sx = cx + dx / d * R * 1.04, sy = cy + dy / d * R * 1.04, ex = it.x - dx / d * 26, ey = it.y - dy / d * 26;
      var lg = ctx.createLinearGradient(sx, sy, ex, ey); lg.addColorStop(0, 'rgba(120,255,230,.05)'); lg.addColorStop(1, it.color);
      ctx.globalAlpha = .55; ctx.strokeStyle = lg; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + ex) / 2 + dy / d * 18, (sy + ey) / 2 - dx / d * 18, ex, ey); ctx.stroke();
      var f = (t * .0003 + d * .01) % 1; ctx.globalAlpha = .9; ctx.fillStyle = it.color; ctx.beginPath(); ctx.arc(sx + (ex - sx) * f, sy + (ey - sy) * f, 1.8, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    });
    // the earth
    var at = ctx.createRadialGradient(cx, cy, R * .9, cx, cy, R * 1.55); at.addColorStop(0, 'rgba(70,255,215,.45)'); at.addColorStop(1, 'rgba(40,220,190,0)');
    ctx.fillStyle = at; ctx.beginPath(); ctx.arc(cx, cy, R * 1.55, 0, Math.PI * 2); ctx.fill();
    var sea = ctx.createRadialGradient(cx - R * .35, cy - R * .4, R * .05, cx, cy, R); sea.addColorStop(0, '#1d9c8c'); sea.addColorStop(.4, '#0b5c5e'); sea.addColorStop(.85, '#05303d'); sea.addColorStop(1, '#03202a');
    ctx.fillStyle = sea; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    if (pts) {
      var cr = Math.cos(rot), sr = Math.sin(rot), s = Math.max(1, R / 110);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], x = p[0] * cr - p[2] * sr, z = p[0] * sr + p[2] * cr, y2 = p[1] * ct - z * st, z2 = p[1] * st + z * ct; if (z2 < 0) continue;
        ctx.fillStyle = p[3] ? 'rgba(255,214,120,' + (.5 + .5 * z2) + ')' : 'rgba(110,255,215,' + (.25 + .75 * z2) + ')';
        ctx.fillRect(cx + x * R - s * .7, cy - y2 * R - s * .7, s * 1.4, s * 1.4);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    var sh = ctx.createRadialGradient(cx - R * .45, cy - R * .5, R * .1, cx, cy, R * 1.02); sh.addColorStop(0, 'rgba(190,255,240,.14)'); sh.addColorStop(.55, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,10,16,.6)');
    ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(110,255,220,.85)'; ctx.shadowColor = 'rgba(70,255,210,1)'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
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
