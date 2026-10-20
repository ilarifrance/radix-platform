// Command Center design layer (command-center-universo + layout mockups):
// 1) the overview of the network view: RADIX as a green nucleus of particles, each project a nucleus of particles in its
//    own colour around it, joined by animated energy trails; each project's sections open on hover or focus;
// 2) connected systems in the top bar, one icon per service, from /api/integrations/status (key present or not);
// 3) projects and a RADIX CORE box in the sidebar, Rivedi on the attention rows, icons and status rings in the activity.
// Presentation only: it adds its own layer over the map renderNetwork() draws and never changes the page's nodes or handlers.
'use strict';
(function () {
  // ---- The network overview: RADIX at the centre as a nucleus of green particles and each project as a smaller nucleus in
  // its own colour at an organic position around it, with its name and where its flow stands underneath. Its sections
  // (the steps of its project flow coloured by state, the agents it has used by function, its own workflows) open in a
  // small panel on hover or focus. Inside a project the page's own map comes back: a click on a project or a section clicks
  // the project's hub. Projects, colours and own workflows come from the map renderNetwork() just drew; the flow and the
  // agents from /api/workspace?resource=projects&journey=1.
  var svg = document.getElementById('networkSvg'), stage = document.getElementById('networkStage');
  var AGENT_NAMES = { 'marketing-orchestrator': 'Orchestratore Marketing', 'brand-strategist': 'Stratega di Marca', strategist: 'Digital Strategist', copywriter: 'Copywriter', 'art-director': 'Art Director', 'ai-specialist': 'AI Specialist', 'social-media-manager': 'Social Media Manager', 'seo-geo': 'SEO e GEO', 'web-content': 'Content e UX Writer', 'video-producer': 'Video Producer', 'paid-media': 'Paid Media', analytics: 'Analytics e CRO', orchestrator: 'Pipeline post', partner: 'Orchestratore Studio', 'commercialista-senior': 'Commercialista Senior', 'commercialista-operativo': 'Commercialista Operativo', contabilita: 'Contabilità', 'lavoro-paghe': 'Lavoro e Paghe', 'segreteria-studio': 'Segreteria', 'web-developer': 'Web Developer', 'legal-orchestrator': 'Orchestratore Legale', 'legal-gdpr': 'Privacy e GDPR', 'legal-contracts': 'Contratti e IP', 'legal-banking': 'Diritto Bancario', 'legal-risk-analyst': 'Rischio Legale', 'comm-orchestrator': 'Orchestratore Commerciale', 'comm-market-analyst': 'Analista di Mercato', 'comm-contact-finder': 'Ricerca Contatti', 'comm-email-outreach': 'Email Outreach', 'comm-crm-manager': 'CRM e Sales Ops' };
  // the function an agent covers, as the satellite label (the mockup's Research, Content, Strategy…)
  var AGENT_FN = { 'marketing-orchestrator': 'Marketing', 'brand-strategist': 'Brand', strategist: 'Strategia', copywriter: 'Copy', 'art-director': 'Design', 'ai-specialist': 'AI', 'social-media-manager': 'Social', 'seo-geo': 'SEO', 'web-content': 'Content', 'video-producer': 'Video', 'paid-media': 'Adv', analytics: 'Analytics', orchestrator: 'Pubblicazione', partner: 'Studio', 'commercialista-senior': 'Fiscale', 'commercialista-operativo': 'Contabilità', contabilita: 'Contabilità', 'lavoro-paghe': 'Paghe', 'segreteria-studio': 'Segreteria', 'web-developer': 'Development', 'legal-orchestrator': 'Legale', 'legal-gdpr': 'Privacy', 'legal-contracts': 'Contratti', 'legal-banking': 'Banking', 'legal-risk-analyst': 'Rischio', 'comm-orchestrator': 'Sales', 'comm-market-analyst': 'Research', 'comm-contact-finder': 'Lead', 'comm-email-outreach': 'Outreach', 'comm-crm-manager': 'CRM' };
  var STEP_SHORT = { brief: 'Brief', ped: 'Piano editoriale', tasks: 'Incarichi', pm: 'Attività' };
  function agentName(id) { return AGENT_NAMES[id] || String(id).replace(/[-_]+/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }); }
  var journeys = {};
  function loadJourneys() {
    return fetch('/api/workspace?resource=projects&journey=1', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var out = {};
      ((d && d.items) || []).forEach(function (p) { if (p.journey) out[String(p.name).trim().toLowerCase()] = p.journey; });
      return out;
    }).catch(function () { return {}; });
  }
  // subtitle: the orchestrator the project has worked with, otherwise where its flow stands
  function subtitle(j, agents) {
    var orch = agents.find(function (a) { return /-orchestrator$|^partner$/.test(a); });
    if (orch) return agentName(orch);
    if (!j || !Array.isArray(j.steps)) return 'Profilo progetto';
    var next = j.steps.find(function (s) { return s.id === j.next; });
    if (!next) return 'Flusso completato';
    var started = j.steps.some(function (s) { return s.state !== 'todo' && s.id !== 'agents'; });
    return (started ? 'Prossimo · ' : 'Da avviare · ') + next.label;
  }

  // The overview is a particle field on black: RADIX is a green nucleus of dots at the centre, each project a smaller nucleus
  // of dots in its own colour at an organic position around it, and luminous trails carry energy between the two (outwards
  // and back, brighter where the project is active). Canvas 2D only; the names stay real buttons over the canvas, and the
  // sections that used to orbit each project (brief, piano, incarichi, agenti, workflow) open on hover or focus.
  var MAX = 8, world = null, cv = null, ctx = null, nodes = null, W = 0, H = 0, dpr = 1, core = null, items = [], small = false, stars = [];
  var raf = 0, clock = 0, lastStamp = 0, inView = true, sprites = {}, legendHtml = null;
  var reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener: function () {} };
  var CORE_GREEN = '#2dffa8';
  // a distinct hue for every project: its own map colour first, the next free one when two projects would share it
  var HUES = ['#4aa8ff', '#a27bff', '#f5b544', '#ff6f91', '#3fd8ff', '#d4f25a', '#ff8f4a', '#f07bf0', '#7f86ff', '#ffe066', '#e8eef0'];
  var assigned = {};
  function distinctColors(list) {
    var used = ['#23e69b', '#3ff0b0', '#1ef28f', '#36edbd', '#2dffa8'], out = {}; // RADIX keeps the green
    function rgb(c) { var n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    function gap(c) { var a = rgb(c); return used.reduce(function (m, u) { var b = rgb(u); return Math.min(m, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); }, 1e9); }
    function taken(c) { return gap(c) < 50; }
    // keep every map colour that is free first, then give the clashing ones the next free hue
    var keep = list.map(function (p) { var c = String(p.color || '').toLowerCase(); if (!/^#[0-9a-f]{6}$/.test(c) || taken(c)) return null; used.push(c); return c; });
    list.forEach(function (p, i) {
      var c = keep[i];
      // the next free hue, or the one farthest from every colour already on the map
      if (!c) { c = HUES.find(function (h) { return !taken(h); }) || HUES.reduce(function (best, h) { return gap(h) > gap(best) ? h : best; }, HUES[0]); used.push(c); }
      out[p.name.trim()] = c; p.color = c;
    });
    assigned = out;
  }
  function atRoot() {
    var crumb = document.getElementById('networkBreadcrumb');
    return !!svg.querySelector('.project-hub[data-network-type=project]') && !(crumb && crumb.querySelector('[data-level=project],[data-level=workflow]'));
  }
  function mapProjects() {
    var clusters = svg.querySelectorAll('.network-cluster'), out = [];
    svg.querySelectorAll('.project-hub[data-network-type=project]').forEach(function (h, i) {
      var name = (h.getAttribute('aria-label') || '').split(' · ')[0], wf = [];
      if (clusters[i]) clusters[i].querySelectorAll('.scene-satellite').forEach(function (s) {
        var parts = (s.getAttribute('aria-label') || '').split(' · '), l = (parts[0] || '').trim(), st = /stato salvato: (\w+)/.exec(s.getAttribute('aria-label') || '');
        if (l) wf.push({ label: l, status: st ? st[1] : '' });
      });
      out.push({ hub: h, name: name, color: (h.style.getPropertyValue('--node-color') || '#36edbd').trim(), wf: wf });
    });
    return out;
  }
  // seeded random: the same project keeps the same shape and position between renders
  function seeded(text) { var s = 7; for (var i = 0; i < text.length; i++) s = (s * 31 + text.charCodeAt(i)) % 2147483647; s = s || 11; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
  // A nucleus as a cloud of 3D points: a dense ball, a thin bright shell and (for RADIX) a tilted ring of dust.
  function cloud(count, rnd, ring) {
    var pts = new Float32Array(count * 5);
    for (var k = 0; k < count; k++) {
      var u = rnd(), v = rnd(), th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1), kind = rnd(), rad, x, y, z;
      if (ring && kind < .2) { var a = rnd() * Math.PI * 2; rad = 1.32 + rnd() * .34; x = Math.cos(a) * rad; z = Math.sin(a) * rad; y = (rnd() - .5) * .06; }
      else {
        rad = kind < .42 ? .96 + rnd() * .08 : Math.pow(rnd(), .62) * .95;
        x = rad * Math.sin(ph) * Math.cos(th); y = rad * Math.cos(ph); z = rad * Math.sin(ph) * Math.sin(th);
      }
      pts[k * 5] = x; pts[k * 5 + 1] = y; pts[k * 5 + 2] = z; pts[k * 5 + 3] = .55 + rnd() * .9; pts[k * 5 + 4] = rnd() * 6.283;
    }
    return pts;
  }
  function size() {
    if (!cv || !world || world.hidden) return;
    var r = stage.getBoundingClientRect(), z = stage.offsetWidth ? r.width / stage.offsetWidth : 1;
    W = stage.offsetWidth; H = stage.offsetHeight; if (!W || !H) return;
    dpr = Math.min(2, (window.devicePixelRatio || 1) * z);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    small = W < 640; world.classList.toggle('cc-small', small);
    var rs = seeded('stars' + W + 'x' + H);
    stars = []; for (var k = 0; k < Math.round(W * H / 5200); k++) stars.push([rs() * W, rs() * H, rs() * .9 + .3, rs()]);
    var base = Math.min(W, H), bottom = small ? 14 : 58, top = small ? 14 : 16;
    var R = Math.max(small ? 44 : 52, Math.min(base * (small ? .14 : .135), 84));
    core = { cx: W / 2, cy: small ? H * .5 : top + (H - top - bottom) / 2, R: R };
    var capEl = nodes.querySelector('.cc-core-label'), capH = capEl ? capEl.offsetHeight : 36;
    var n = items.length;
    items.forEach(function (it, i) {
      it.r = Math.round(Math.max(small ? 20 : 22, Math.min(base * (small ? .065 : .056), 36)) * (.82 + .3 * it.level));
      it.lw = it.label.offsetWidth; it.lh = it.label.offsetHeight;
      // evenly spread angles with a seeded swing and alternating depths: organic, never a grid
      var rnd = seeded(it.name), step = 2 * Math.PI / Math.max(n, 1);
      var angle = -Math.PI / 2 + (n === 2 ? Math.PI / 2 : .42) + i * step + (rnd() - .5) * step * .32;
      var depth = n <= 3 ? .9 : [.94, .74, .88, .7, .97, .78, .9, .72][i % 8];
      var ex = W / 2 - Math.max(it.lw / 2, it.r) - 12, ey = (H - top - bottom) / 2 - it.r - it.lh / 2 - 8;
      it.x = core.cx + Math.cos(angle) * ex * depth; it.y = core.cy + Math.sin(angle) * ey * depth;
      // above the core the trail arrives from below: the name goes over the nucleus so the trail never crosses it
      it.up = Math.sin(angle) < -.45;
      if (small) {
        // a phone is tall and narrow: half the projects above RADIX and half below, alternating sides with a little swing
        var upper = Math.ceil(n / 2), mine = i < upper, k = mine ? i : i - upper, rows = mine ? upper : n - upper;
        var y0 = mine ? top : core.cy + R + 30, y1 = mine ? core.cy - R * 1.1 : H - bottom, span = (y1 - y0) / Math.max(rows, 1);
        it.up = mine; it.x = W * ((k + (mine ? 0 : 1)) % 2 ? .7 : .3) + (rnd() - .5) * W * .08;
        it.y = mine ? y0 + span * (k + 1) - it.r - 6 : y0 + span * k + it.r + 6;
      }
      it.el.classList.toggle('cc-up', it.up);
    });
    // Separate everything that could touch: the RADIX nucleus with its name, each project's nucleus with its label.
    function box(it) { var hw = Math.max(it.r + 6, it.lw / 2 + 8); return { l: it.x - hw, r: it.x + hw, t: it.y - it.r - (it.up ? 8 + it.lh : 6), b: it.y + it.r + (it.up ? 6 : 8 + it.lh) }; }
    var coreBox = { l: core.cx - R * 1.95, r: core.cx + R * 1.95, t: core.cy - R * 1.12, b: core.cy + R + 12 + capH };
    function clamp(it) {
      var hw = Math.max(it.r + 6, it.lw / 2 + 8);
      it.x = Math.min(W - hw - 4, Math.max(hw + 4, it.x));
      it.y = it.up ? Math.min(H - bottom - it.r - 6, Math.max(top + it.r + 8 + it.lh, it.y)) : Math.min(H - bottom - it.r - 8 - it.lh, Math.max(top + it.r + 6, it.y));
    }
    for (var pass = 0; pass < 160; pass++) {
      var moved = false;
      for (var a = 0; a < n; a++) {
        var A = items[a];
        for (var b = -1; b < n; b++) {
          if (b === a) continue;
          var B = b < 0 ? null : items[b], ba = box(A), bb = B ? box(B) : coreBox;
          var ox = Math.min(ba.r, bb.r) - Math.max(ba.l, bb.l) + 10, oy = Math.min(ba.b, bb.b) - Math.max(ba.t, bb.t) + 10;
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          var share = B ? .5 : 1, dirx = (ba.l + ba.r) / 2 >= (bb.l + bb.r) / 2 ? 1 : -1, diry = (ba.t + ba.b) / 2 >= (bb.t + bb.b) / 2 ? 1 : -1;
          // slide along the cheaper axis, a little along the other so crowded rows can open up
          if (ox < oy) { A.x += dirx * ox * share; if (B) B.x -= dirx * ox * share; A.y += diry * 1.5; if (B) B.y -= diry * 1.5; }
          else { A.y += diry * oy * share; if (B) B.y -= diry * oy * share; A.x += dirx * 1.5; if (B) B.x -= dirx * 1.5; }
          clamp(A); if (B) clamp(B);
        }
      }
      if (!moved) break;
    }
    var rc = seeded('radix'), coreCount = small ? 460 : 620;
    core.pts = cloud(coreCount, rc, true);
    items.forEach(function (it, i) {
      var rnd = seeded(it.name + '#');
      it.pts = cloud(Math.round((small ? .75 : 1) * (150 + 100 * it.level)), rnd, false);
      it.spin = (.00008 + rnd() * .00008) * (i % 2 ? -1 : 1); it.tilt = (rnd() - .5) * .9;
      it.bend = (i % 2 ? 1 : -1) * (.16 + rnd() * .1);
      var flows = Math.round((small ? .7 : 1) * (it.active ? 34 : 14)); it.flow = [];
      for (var f = 0; f < flows; f++) it.flow.push({ u: rnd(), v: (it.active ? .07 : .045) + rnd() * .04, back: rnd() < .3, w: (rnd() - .5) * 2, ph: rnd() * 6.283, s: .7 + rnd() * .7 });
    });
    layout();
    paintOnce();
  }
  function layout() {
    if (!core) return;
    items.forEach(function (it) {
      it.el.style.setProperty('--r', it.r + 'px');
      it.hub.style.left = it.x + 'px'; it.hub.style.top = (it.up ? it.y + it.r - it.hub.offsetHeight : it.y - it.r) + 'px';
      // the sections panel sits under the name, or over the nucleus when it would leave the map
      var tw = it.tip.offsetWidth, th = it.tip.offsetHeight, ty;
      if (it.up) { ty = it.y - it.r - it.lh - 10 - th; if (ty < 6) ty = it.y + it.r + 10; }
      else { ty = it.y + it.r + it.lh + 10; if (ty + th > H - 6) ty = Math.max(6, it.y - it.r - th - 10); }
      it.tip.style.left = Math.min(W - tw - 6, Math.max(6, it.x - tw / 2)) + 'px'; it.tip.style.top = ty + 'px';
    });
    var cap = nodes.querySelector('.cc-core-label'); if (cap) { cap.style.left = core.cx + 'px'; cap.style.top = (core.cy + core.R + 12) + 'px'; }
    var more = nodes.querySelector('.cc-more'); if (more) { more.style.left = core.cx + 'px'; more.style.top = (core.cy + core.R + 58) + 'px'; }
  }
  function satList(p, j, agents) {
    var list = [];
    ((j && j.steps) || []).forEach(function (s) { if (STEP_SHORT[s.id]) list.push({ label: STEP_SHORT[s.id], kind: 'step-' + s.state, title: s.label + (s.detail ? ' · ' + s.detail : '') }); });
    agents.forEach(function (a) { list.push({ label: AGENT_FN[a] || agentName(a), kind: 'agent', title: 'Agente · ' + agentName(a) }); });
    if (!agents.length && j) list.push({ label: 'Agenti AI', kind: 'step-todo', title: 'Agenti AI · nessuna conversazione' });
    p.wf.forEach(function (w) { list.push({ label: w.label, kind: 'wf', title: 'Workflow · ' + w.label + (w.status ? ' · ' + w.status : '') }); });
    return list;
  }
  function build() {
    if (!svg || !stage) return;
    var on = atRoot();
    stage.classList.toggle('cc-world-on', on);
    legend(on);
    if (!on) { if (world) world.hidden = true; stop(); return; }
    if (!world) {
      world = node('div', 'cc-world'); cv = node('canvas', 'cc-world-sky'); cv.setAttribute('aria-hidden', 'true');
      nodes = node('div', 'cc-world-nodes'); world.append(cv, nodes); stage.append(world);
      ctx = cv.getContext('2d');
      if (window.ResizeObserver) new ResizeObserver(function () { size(); }).observe(stage);
      if (window.IntersectionObserver) new IntersectionObserver(function (e) { inView = e[0].isIntersecting; schedule(); }).observe(stage);
      document.addEventListener('visibilitychange', function () { lastStamp = 0; schedule(); });
      var pref = function () { stop(); paintOnce(); schedule(); };
      if (reduce.addEventListener) reduce.addEventListener('change', pref);
    }
    world.hidden = false; nodes.replaceChildren();
    var cap = node('div', 'cc-core-label'); cap.append(node('b', '', 'RADIX'), node('small', '', 'CORE')); nodes.append(cap);
    var all = mapProjects(); distinctColors(all);
    var caption = document.getElementById('networkCaption');
    if (caption) caption.textContent = all.length + (all.length === 1 ? ' progetto' : ' progetti') + ' · passa sopra un nucleo per le sue sezioni';
    var shown = all.slice(0, MAX);
    items = shown.map(function (p) {
      var j = journeys[p.name.trim().toLowerCase()], agStep = j && j.steps && j.steps.find(function (s) { return s.id === 'agents'; });
      var agents = (agStep && Array.isArray(agStep.agents)) ? agStep.agents : [];
      // the dashboard's own per-project roster (most used first) and orchestrator, when the API sends them
      var sp = snap && (snap.projects || []).find(function (x) { return String(x.name || '').trim() === p.name.trim(); });
      if (sp && Array.isArray(sp.agents)) agents = sp.agents.map(function (a) { if (a.name && !AGENT_NAMES[a.id]) AGENT_NAMES[a.id] = a.name; return a.id; });
      var open = function () { p.hub.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
      var list = satList(p, j, agents);
      // activity: steps under way or done, agents used and own workflows; active: something running or waiting on a person
      var score = list.filter(function (s) { return s.kind !== 'step-todo'; }).length;
      var active = list.some(function (s) { return s.kind === 'step-active' || s.kind === 'step-waiting'; }) || p.wf.some(function (w) { return /running|active|pending|error/.test(w.status); });
      var wrap = node('div', 'cc-proj' + (active ? ' is-active' : '')); wrap.style.setProperty('--c', p.color);
      var b = node('button', 'cc-hub'); b.type = 'button';
      var sub = sp && sp.orchestrator && sp.orchestrator.name ? sp.orchestrator.name : subtitle(j, agents), t = node('span', 'cc-hub-t'); t.append(node('b', '', p.name), node('small', '', sub));
      b.append(node('i'), t); b.setAttribute('aria-label', 'Apri il progetto ' + p.name + ' · ' + sub + (active ? ' · attività in corso' : ''));
      b.addEventListener('click', open);
      var tip = node('div', 'cc-tip'); tip.setAttribute('role', 'group'); tip.setAttribute('aria-label', 'Sezioni di ' + p.name);
      var head = node('div', 'cc-tip-head'); head.append(node('b', '', p.name), node('small', '', active ? 'Attività in corso' : 'Stato salvato')); tip.append(head);
      var chips = node('div', 'cc-tip-list');
      if (!list.length) chips.append(node('span', 'cc-tip-empty', 'Nessuna sezione avviata'));
      list.forEach(function (s) {
        var e = node('button', 'cc-sat cc-sat-' + s.kind); e.type = 'button'; e.title = s.title; e.setAttribute('aria-label', s.title + ' · apri il progetto ' + p.name);
        e.append(node('i'), node('span', '', s.label)); e.addEventListener('click', open); chips.append(e);
      });
      tip.append(chips); wrap.append(b, tip); nodes.append(wrap);
      var it = { el: wrap, hub: b, label: t, tip: tip, name: p.name, color: p.color, active: active, level: Math.min(1, score / 7), hot: false };
      var hot = function (v) { return function () { it.hot = v || wrap.matches(':hover') || wrap.contains(document.activeElement); if (reduce.matches) paintOnce(); }; };
      wrap.addEventListener('pointerenter', hot(true)); wrap.addEventListener('pointerleave', hot(false));
      wrap.addEventListener('focusin', hot(true)); wrap.addEventListener('focusout', function () { setTimeout(hot(false)); });
      return it;
    });
    if (all.length > MAX) {
      var m = node('button', 'cc-more'); m.type = 'button'; m.textContent = '+' + (all.length - MAX) + ' progetti';
      m.addEventListener('click', function () { var l = document.getElementById('projectsTab'); if (l) l.click(); });
      nodes.append(m);
    }
    var un = svg.querySelector('.unassigned-node');
    if (un) {
      var u = node('button', 'cc-shared'); u.type = 'button';
      u.textContent = ((un.getAttribute('aria-label') || 'Workflow condivisi').split(' · ')[0]) + ' →';
      u.addEventListener('click', function () { un.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      nodes.append(u);
    }
    size(); schedule();
  }
  // The legend explains the particle view while it is shown; inside a project the page's own legend comes back.
  function legend(on) {
    var l = document.getElementById('networkLegend'); if (!l) return;
    if (legendHtml === null) legendHtml = l.innerHTML;
    if (on && !l.querySelector('.cc-legend')) {
      l.replaceChildren();
      [['cc-legend core', 'RADIX'], ['cc-legend proj', 'nucleo progetto'], ['cc-legend flow', 'scia: attività in corso']].forEach(function (r) { var s = node('span', r[0]); s.append(node('i'), document.createTextNode(r[1])); l.append(s); });
    } else if (!on && l.querySelector('.cc-legend')) l.innerHTML = legendHtml;
  }
  function rgba(hex, a) { var h = hex.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return isNaN(n) ? 'rgba(54,237,189,' + a + ')' : 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
  // one soft glowing dot per colour, drawn once and stamped for every particle
  function sprite(color) {
    if (sprites[color]) return sprites[color];
    var c = document.createElement('canvas'); c.width = c.height = 32; var g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.12, rgba(color, 1)); gr.addColorStop(.3, rgba(color, .85)); gr.addColorStop(.5, rgba(color, .22)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return (sprites[color] = c);
  }
  function drawNucleus(pts, cx, cy, R, color, t, spin, tilt, gain) {
    var img = sprite(color), ca = Math.cos(t * spin), sa = Math.sin(t * spin), cb = Math.cos(tilt), sb = Math.sin(tilt), ringA = t * spin * 1.8, cr = Math.cos(ringA), sr = Math.sin(ringA);
    var unit = Math.max(3.2, R * .085), n = pts.length / 5;
    for (var k = 0; k < n; k++) {
      var o = k * 5, x = pts[o], y = pts[o + 1], z = pts[o + 2], rx, rz;
      if (x * x + z * z > 1.6) { rx = x * cr + z * sr; rz = -x * sr + z * cr; } else { rx = x * ca + z * sa; rz = -x * sa + z * ca; }
      var ry = y * cb - rz * sb, dz = y * sb + rz * cb, near = (dz + 1.6) / 3.2;
      var tw = .75 + .25 * Math.sin(t * .002 + pts[o + 4]);
      ctx.globalAlpha = Math.min(1, (.3 + .7 * near) * tw * gain);
      var s = unit * pts[o + 3] * (.7 + .5 * near);
      ctx.drawImage(img, cx + rx * R - s / 2, cy + ry * R - s / 2, s, s);
    }
  }
  function frame(t) {
    if (!ctx || !core || !W) return;
    var g = core, R = g.R * (1 + .018 * Math.sin(t * .0012));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    stars.forEach(function (s) { ctx.globalAlpha = .12 + .22 * Math.abs(Math.sin(t * .0004 + s[3] * 9)); ctx.fillStyle = s[3] > .85 ? '#b9ffe6' : '#5c8f80'; ctx.fillRect(s[0], s[1], s[2], s[2]); });
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
    var halo = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, R * 2.6); halo.addColorStop(0, 'rgba(30,255,160,.16)'); halo.addColorStop(.4, 'rgba(30,255,160,.05)'); halo.addColorStop(1, 'rgba(30,255,160,0)');
    ctx.fillStyle = halo; ctx.fillRect(g.cx - R * 2.6, g.cy - R * 2.6, R * 5.2, R * 5.2);
    var green = sprite(CORE_GREEN);
    items.forEach(function (it) {
      // the trail: a faint curved channel from RADIX to the project, with particles of energy travelling along it
      var dx = it.x - g.cx, dy = it.y - g.cy, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      var sx = g.cx + ux * R * 1.02, sy = g.cy + uy * R * 1.02, ex = it.x - ux * it.r * 1.08, ey = it.y - uy * it.r * 1.08;
      var mx = (sx + ex) / 2 - uy * d * it.bend, my = (sy + ey) / 2 + ux * d * it.bend, gain = it.active ? 1 : .55;
      if (it.hot) gain = 1.35;
      var lg = ctx.createLinearGradient(sx, sy, ex, ey); lg.addColorStop(0, 'rgba(45,255,168,' + (.22 * gain) + ')'); lg.addColorStop(1, rgba(it.color, .22 * gain));
      ctx.strokeStyle = lg; ctx.globalAlpha = 1;
      ctx.lineWidth = 5; ctx.globalAlpha = .18; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      ctx.lineWidth = 1; ctx.globalAlpha = .9; ctx.stroke();
      var img = sprite(it.color), sec = t / 1000;
      it.flow.forEach(function (p) {
        var head = (p.u + sec * p.v) % 1;
        for (var k = 0; k < 5; k++) {
          var f = head - k * .014; if (f < 0) continue;
          var u = p.back ? 1 - f : f, q = 1 - u, px = q * q * sx + 2 * q * u * mx + u * u * ex, py = q * q * sy + 2 * q * u * my + u * u * ey;
          var wob = Math.sin(u * Math.PI) * 4 * p.w * Math.sin(t * .0016 + p.ph); px += -uy * wob; py += ux * wob;
          var fade = Math.sin(u * Math.PI), a = fade * (1 - k / 5) * gain * .9, s = (k ? 2.6 : 4.2) * p.s;
          ctx.globalAlpha = Math.min(1, a * (1 - u)); ctx.drawImage(green, px - s / 2, py - s / 2, s, s);
          ctx.globalAlpha = Math.min(1, a * u); ctx.drawImage(img, px - s / 2, py - s / 2, s, s);
        }
      });
    });
    // the project nuclei, then RADIX on top
    items.forEach(function (it) {
      var r = it.r * (it.hot ? 1.08 : 1), gl = ctx.createRadialGradient(it.x, it.y, 0, it.x, it.y, r * 2.1);
      gl.addColorStop(0, rgba(it.color, it.active || it.hot ? .2 : .1)); gl.addColorStop(1, rgba(it.color, 0));
      ctx.globalAlpha = 1; ctx.fillStyle = gl; ctx.fillRect(it.x - r * 2.1, it.y - r * 2.1, r * 4.2, r * 4.2);
      drawNucleus(it.pts, it.x, it.y, r, it.color, t, it.spin, it.tilt, it.hot ? 1.25 : it.active ? 1 : .72);
    });
    drawNucleus(g.pts, g.cx, g.cy, R, CORE_GREEN, t, .00011, -.38, 1);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function animating() { return !!(world && !world.hidden && !document.hidden && inView && !reduce.matches); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; lastStamp = 0; }
  function schedule() { if (!raf && animating()) raf = requestAnimationFrame(loop); }
  function loop(stamp) {
    raf = 0; if (!animating()) { lastStamp = 0; return; }
    clock += lastStamp ? Math.min(50, stamp - lastStamp) : 0; lastStamp = stamp;
    frame(clock); schedule();
  }
  // reduced motion: one still, fully formed frame (and again on resize or hover)
  function paintOnce() { if (world && !world.hidden) frame(reduce.matches ? 4000 : clock); }
  if (svg && stage) {
    new MutationObserver(build).observe(svg, { childList: true });
    var crumb = document.getElementById('networkBreadcrumb'); if (crumb) new MutationObserver(build).observe(crumb, { childList: true, subtree: true, characterData: true });
    build();
    loadJourneys().then(function (j) { journeys = j; build(); });
  }

  // Connected systems: one icon per service, lit when its key is configured on this deployment.
  var ABBR = { anthropic: 'AI', database: 'DB', buffer: 'Bf', 'openai-image': 'Im', heygen: 'HG', email: '@', higgsfield: 'Hf', 'captain-data': 'CD' };
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
      systemsKpi(on, d.items.length);
    }).catch(function () {});
  }

  // Saved dashboard snapshot (the same one the page reads): projects, activity types, counts for the sidebar box.
  var COLORS = ['#3ff0b0', '#4aa8ff', '#a27bff', '#f5b544', '#ff7a9a', '#38d6e8'];
  function hubColor(name, i) {
    var hub = svg && Array.prototype.find.call(svg.querySelectorAll('.project-hub[data-network-type=project]'), function (h) { return String(h.getAttribute('aria-label') || '').split(' · ')[0].trim() === name; });
    if (assigned[String(name || '').trim()]) return assigned[String(name || '').trim()];
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
      if (row.querySelector('.cc-act-icon') || row.hasAttribute('data-cc-agent')) return;
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

  // Active workflows (mockup): each project's flow as a stepper with the step names under the dots.
  var STEP_LABEL = { 'Brief e strategia': 'Brief', 'Piano editoriale': 'Piano', 'Incarichi': 'Incarichi', 'Attività': 'Attività' };
  function steppers() {
    document.querySelectorAll('#workflowList .journey-dot:not([data-l])').forEach(function (d) {
      var l = String(d.getAttribute('title') || '').split(':')[0].trim(); d.setAttribute('data-l', STEP_LABEL[l] || l);
    });
  }
  // Sidebar counts, as in the mockup: projects in the snapshot, rows waiting in Needs your attention.
  function badge(href, n) {
    var a = document.querySelector('#rx-sidebar a[href$="' + href + '"]'); if (!a) return;
    var b = a.querySelector('.cc-count'); if (!b) { b = node('span', 'cc-count'); a.append(b); }
    b.textContent = String(n); b.hidden = !n; b.classList.toggle('warn', href === '#approvals');
  }
  function counts() {
    if (snap) badge('#projects', (snap.projects || []).length);
    badge('#approvals', document.querySelectorAll('#attentionList .workflow-card').length);
  }


  // Live Activity per agent (mockup): the latest saved steps with done / in progress, when the API sends agentActivity.
  var STATE = { done: ['done', 'Completato'], running: ['run', 'In corso'], error: ['err', 'Errore'], pending: ['info', 'In attesa'] };
  function hhmm(at) { var d = new Date(at); return isNaN(d) ? '' : ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function liveAgents() {
    var box = document.getElementById('activityList'), rows = snap && Array.isArray(snap.agentActivity) ? snap.agentActivity : [];
    if (!box || !rows.length || box.querySelector('[data-cc-agent]')) return;
    box.replaceChildren.apply(box, rows.slice(0, 10).map(function (a) {
      var row = node('div', 'activity-item cc-act'); row.setAttribute('data-cc-agent', a.agentId || '');
      var txt = node('div', 'activity-text'); txt.append(node('b', '', a.agentName || agentName(a.agentId)), node('br'), document.createTextNode(a.task || ''));
      var pi = (snap.projects || []).findIndex(function (p) { return p.id === a.projectId; });
      var ic = node('i', 'cc-act-icon agent', '✦'); ic.style.setProperty('--ac', pi === -1 ? '#9a6bff' : hubColor(snap.projects[pi].name, pi));
      if (pi !== -1) ic.title = snap.projects[pi].name;
      var k = STATE[a.state] || STATE.pending, r = node('i', 'cc-ring ' + k[0]); r.title = k[1];
      row.append(node('div', 'activity-time', hhmm(a.at)), txt, ic, r);
      return row;
    }));
  }

  // Digital Team by function (mockup): configured agents, how many run now, last step seen; from snap.team.
  function teamCards() {
    var grid = document.getElementById('teamGrid'), team = snap && Array.isArray(snap.team) ? snap.team : [];
    if (!grid || !team.length || grid.querySelector('.cc-team')) return;
    var note = grid.querySelector('.team-disclaimer');
    grid.replaceChildren.apply(grid, team.map(function (g) {
      var c = node('div', 'team-card cc-team' + (g.active ? ' on' : '')); c.dataset.group = g.group;
      var st = g.active ? g.active + ' in corso' : g.lastAt ? 'Ultimo passo ' + new Date(g.lastAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : 'Nessun passo salvato';
      c.title = st; c.append(node('div', 'team-title', g.label), node('div', 'team-count', String(g.configured)), node('div', 'team-sub', g.active ? 'configurati · ' + g.active + ' in corso' : 'agenti configurati'), node('div', 'team-status', st));
      return c;
    }).concat(note ? [note] : []));
  }

  // Knowledge & Resources (mockup): the counts on top of the page's resource list; unknown numbers stay «—».
  function knowledgeCounts() {
    var list = document.getElementById('knowledgeList'), k = snap && snap.knowledge;
    if (!list || !k || list.querySelector('.cc-know')) return;
    var box = node('div', 'cc-know');
    [['documents', 'Documenti'], ['conversations', 'Messaggi agenti'], ['memoryConfirmed', 'Memoria confermata'], ['memoryPending', 'Da confermare']].forEach(function (r) {
      var v = k[r[0]], c = node('div', 'cc-know-n' + (r[0] === 'memoryPending' && v ? ' warn' : ''));
      c.append(node('b', '', v == null ? '—' : String(v)), node('span', '', r[1])); box.append(c);
    });
    list.insertBefore(box, list.firstChild);
  }

  var snap = null;
  if (document.getElementById('activityList')) {
    fetch('/api/state?view=dashboard', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return; snap = d; sidebar(d); liveAgents(); activity(d); counts(); teamCards(); knowledgeCounts(); build();
    }).catch(function () {});
    attention();
    new MutationObserver(function () { attention(); counts(); }).observe(document.getElementById('attentionList'), { childList: true });
    steppers(); var wl = document.getElementById('workflowList'); if (wl) new MutationObserver(steppers).observe(wl, { childList: true });
    new MutationObserver(function () { if (snap) { liveAgents(); activity(snap); } }).observe(document.getElementById('activityList'), { childList: true });
    var tg = document.getElementById('teamGrid'); if (tg) new MutationObserver(teamCards).observe(tg, { childList: true });
    var kl = document.getElementById('knowledgeList'); if (kl) new MutationObserver(knowledgeCounts).observe(kl, { childList: true });
  }

  // 4th KPI: «Sistemi connessi» from /api/integrations/status (configured keys / services RADIX integrates).
  function systemsKpi(on, total) {
    var v = document.getElementById('metricAgents'); if (!v) return;
    var card = v.closest('.metric'), label = card && card.querySelector('.metric-label'), note = v.parentElement.querySelector('.metric-note');
    function paint() {
      if (label && label.textContent !== 'Sistemi connessi') label.textContent = 'Sistemi connessi';
      if (v.textContent !== String(on)) v.textContent = String(on);
      var n = on + '/' + total + ' configurati'; if (note && note.textContent !== n) note.textContent = n;
    }
    if (card) { card.classList.add('cc-kpi-systems'); card.title = 'Servizi esterni con la chiave configurata su questo ambiente'; }
    paint(); new MutationObserver(paint).observe(card || v, { childList: true, subtree: true, characterData: true });
  }

  // «Ask RADIX anything»: Enter sends the text to the Partner agent; search hits stay clickable below.
  var ask = document.getElementById('commandInput'), hits = document.getElementById('searchResults');
  if (ask) {
    ask.placeholder = innerWidth < 640 ? 'Chiedi a RADIX…' : 'Chiedi a RADIX o cerca…';
    ask.setAttribute('aria-label', 'Chiedi a RADIX o cerca');
    var go = function () { var q = ask.value.trim(); if (q) location.href = '/agents.html?agent=partner&q=' + encodeURIComponent(q); };
    ask.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.isComposing || !ask.value.trim()) return;
      e.preventDefault(); e.stopImmediatePropagation(); go();
    }, true);
    var askRow = function () {
      if (!hits || hits.hidden || hits.querySelector('.cc-ask-row')) return;
      var q = ask.value.trim(); if (!q) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'search-hit cc-ask-row';
      var t = document.createElement('span'); t.textContent = 'Chiedi a RADIX: «' + q.slice(0, 90) + '»';
      var k = document.createElement('small'); k.textContent = 'Invio';
      b.append(t, k); b.addEventListener('click', go); hits.insertBefore(b, hits.firstChild);
    };
    if (hits) new MutationObserver(askRow).observe(hits, { childList: true, attributes: true, attributeFilter: ['hidden'] });
  }
})();
