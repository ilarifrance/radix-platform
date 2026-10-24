// Command Center design layer (command-center-universo + layout mockups):
// 1) the overview of the network view: RADIX as a green nucleus of particles and, around it, the platform services (or, with
//    the «Progetti» switch, the projects) as nuclei in their own colours, joined by luminous beams that react to the pointer;
//    each nucleus opens a small panel on hover or focus;
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

  // The overview is a particle field on black: RADIX is a green nucleus of dots at the centre and around it, by default, the
  // platform's SERVICES (the areas of the shell nav), each a nucleus of dots in its own colour. Luminous beams carry energy
  // from RADIX to every service and directly between the services that really exchange data (SERVICE_LINKS). The pointer
  // bends and brightens the beams near it and pushes the dots softly; hovering or focusing a service lights its beams and
  // the services it talks to and dims the rest. The «Progetti» switch brings back one nucleus per project (the previous
  // view), whose click opens the page's own map of the project. Canvas 2D only; names stay real links and buttons.
  var MAX = 8, world = null, cv = null, ctx = null, nodes = null, W = 0, H = 0, dpr = 1, core = null, items = [], beams = [], small = false, stars = [];
  var raf = 0, clock = 0, lastStamp = 0, inView = true, sprites = {}, legendHtml = null;
  var reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener: function () {} };
  var CORE_GREEN = '#2dffa8';
  var mode = 'servizi';
  try { if (localStorage.getItem('cc-network-mode') === 'progetti') mode = 'progetti'; } catch (e) { /* storage blocked: services */ }
  // the pointer in stage coordinates; k eases in and out so the field never jumps
  var ptr = { x: 0, y: 0, on: false, k: 0 };

  // The platform services, from the shell nav (shell/radix-shell.js NAV): names, main page and sub-pages. Every href is a
  // page of this repo (tests/cc-network-services.test.js checks both). Studio groups Commerciale, Legal and Accounting.
  var SERVICES = [
    { id: 'crm', name: 'CRM e Vendite', sub: 'Contatti, pipeline, campagne', href: '/radix-sales.html', color: '#4aa8ff', pages: [['CRM', '/radix-sales.html'], ['Pipeline', '/sales-pipeline-premium.html'], ['Sales Orbit', '/sales-orbit-higgsfield.html'], ['Campagne', '/sales-growth-campaigns.html'], ['Progetti commerciali', '/sales-growth-projects.html'], ['LinkedIn', '/sales-linkedin.html']] },
    { id: 'lead', name: 'Lead Intelligence', sub: 'Acquisisci e qualifica i lead', href: '/lead-intelligence.html', color: '#ffd04a', pages: [['Lead Intelligence', '/lead-intelligence.html']] },
    { id: 'agents', name: 'Agenti AI', sub: 'Orchestratori e specialisti', href: '/agents.html', color: '#a27bff', pages: [['Agenti AI', '/agents.html'], ['Agenti dell’agenzia', '/agency/index.html#agenti']] },
    { id: 'studio', name: 'Studio', sub: 'Commerciale, Legal, Accounting', href: '/commercial/index.html', color: '#3fd8ff', pages: [['Commerciale', '/commercial/index.html'], ['Legal', '/legal/index.html'], ['Accounting', '/accounting/index.html']] },
    { id: 'pm', name: 'Project Management', sub: 'Attività, Gantt, carico', href: '/radix-pm-concept.html', color: '#ff7a45', pages: [['Project Management', '/radix-pm-concept.html']] },
    { id: 'marketing', name: 'Marketing Agency', sub: 'Campagne, PED, clienti', href: '/agency/orbit.html', color: '#ff5fa2', pages: [['Marketing Orbit', '/agency/orbit.html'], ['Cosa vuoi fare', '/agency/crea.html'], ['Agenzia e divisioni', '/agency/index.html'], ['Clienti', '/agency/clients.html'], ['Progetti', '/agency/projects.html'], ['Piano editoriale', '/project-editorial.html'], ['Studio Avatar', '/agency/avatar.html'], ['Operations', '/agency/operations.html'], ['Memoria', '/agency/memory.html']] }
  ];
  // Direct links between services: only the ones the code really implements.
  //  lead ↔ crm        «Porta nel CRM»: sales/lead-bulk-crm-core.js creates companies, contacts and deals via /api/sales
  //                    (lead-intelligence.html, step 3 of the guided flow).
  //  marketing ↔ crm   a newsletter of the Piano editoriale becomes a CRM email campaign: editorial-workspace.js
  //                    («Prepara la campagna nel CRM», radix-crm-campaign-draft) → sales/crm-campaigns.js; lib/ped-views.js.
  //  marketing ↔ pm    PED contents and agency briefs become plan tasks: lib/pm-views.js syncFromPed / syncFromAgency,
  //                    called by radix-pm-concept.html (tests/pm-ped-sync.test.js).
  //  agents ↔ marketing  project-editorial.html loads lib/radix-agent-runtime.js (agents write the PED).
  //  agents ↔ crm      sales/crm-copilot.js (role crm-copilot) and sales/crm-email-ideas.js call /api/chat.
  //  agents ↔ lead     sales/lead-newsletter.js asks the comm-email-outreach agent via /api/chat.
  //  agents ↔ pm       radix-pm-concept.html loads lib/radix-agent-runtime.js (agents assigned to tasks do the work).
  //  agents ↔ studio   commercial/, legal/ and accounting/index.html load lib/radix-agent-runtime.js.
  var SERVICE_LINKS = [
    ['lead', 'crm', 'Porta nel CRM'],
    ['marketing', 'crm', 'Newsletter del PED → campagna CRM'],
    ['marketing', 'pm', 'PED e incarichi → attività'],
    ['agents', 'marketing', 'Agenti del PED e dell’agenzia'],
    ['agents', 'crm', 'Copilota CRM e idee email'],
    ['agents', 'lead', 'Newsletter con Email Outreach'],
    ['agents', 'pm', 'Agenti assegnati alle attività'],
    ['agents', 'studio', 'Agenti dello studio']
  ];

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
  function deeper() { var crumb = document.getElementById('networkBreadcrumb'); return !!(crumb && crumb.querySelector('[data-level=project],[data-level=workflow]')); }
  function hasProjects() { return !!svg.querySelector('.project-hub[data-network-type=project]'); }
  // the overview shows at the root of the map: services always, projects once renderNetwork() has drawn them
  function atRoot() { return !deeper() && (mode === 'servizi' || hasProjects()); }
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
  function flowList(rnd, count, speed) {
    var out = [];
    for (var f = 0; f < count; f++) out.push({ u: rnd(), v: speed + rnd() * .04, back: rnd() < .4, w: (rnd() - .5) * 2, ph: rnd() * 6.283, s: .7 + rnd() * .6 });
    return out;
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
    var base = Math.min(W, H), bottom = small ? 14 : 58, top = small ? 52 : 50;
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
        // a phone is tall and narrow: half the nuclei above RADIX and half below, alternating sides with a little swing
        var upper = Math.ceil(n / 2), mine = i < upper, k = mine ? i : i - upper, rows = mine ? upper : n - upper;
        var y0 = mine ? top : core.cy + R + 30, y1 = mine ? core.cy - R * 1.1 : H - bottom, span = (y1 - y0) / Math.max(rows, 1);
        it.up = mine; it.x = W * ((k + (mine ? 0 : 1)) % 2 ? .7 : .3) + (rnd() - .5) * W * .08;
        it.y = mine ? y0 + span * (k + 1) - it.r - 6 : y0 + span * k + it.r + 6;
      }
      it.el.classList.toggle('cc-up', it.up);
    });
    // Separate everything that could touch: the RADIX nucleus with its name, each nucleus with its label.
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
    beams = [];
    items.forEach(function (it, i) {
      var rnd = seeded(it.name + '#');
      it.pts = cloud(Math.round((small ? .75 : 1) * (150 + 100 * it.level)), rnd, false);
      it.spin = (.00008 + rnd() * .00008) * (i % 2 ? -1 : 1); it.tilt = (rnd() - .5) * .9;
      // RADIX ↔ nucleus: a main beam with energy travelling both ways and two thin filaments braided around it
      var bend = (i % 2 ? 1 : -1) * (.16 + rnd() * .1);
      beams.push({ a: core, b: it, bend: bend, strands: [-.09, .08], flow: flowList(rnd, Math.round((small ? .7 : 1) * (it.active ? 36 : 22)), it.active ? .07 : .05), gain: it.active ? 1 : .7 });
    });
    // service ↔ service: the direct exchanges, bowing away from the centre and, when the straight line would cross RADIX,
    // far enough that the curve goes around the nucleus instead of through it
    links().forEach(function (l) {
      var rnd = seeded(l.a.name + '>' + l.b.name), dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, d = Math.hypot(dx, dy) || 1;
      var nx = -dy / d, ny = dx / d, off = ((l.a.x + l.b.x) / 2 - core.cx) * nx + ((l.a.y + l.b.y) / 2 - core.cy) * ny, sign = off >= 0 ? 1 : -1;
      // the curve's middle sits halfway to the control point: keep it ≥ 1.9 R from the centre on the outer side
      var need = Math.max(0, 2 * (R * 1.9 - Math.abs(off))) / d, bend = sign * Math.min(.5, Math.max(.1 + rnd() * .06, need));
      beams.push({ a: l.a, b: l.b, bend: bend, strands: [.06], flow: flowList(rnd, Math.round((small ? .7 : 1) * 18), .06), gain: .85, link: l.label });
    });
    layout();
    paintOnce();
  }
  function links() {
    if (mode !== 'servizi') return [];
    var by = {}; items.forEach(function (it) { by[it.id] = it; });
    return SERVICE_LINKS.filter(function (l) { return by[l[0]] && by[l[1]]; }).map(function (l) { return { a: by[l[0]], b: by[l[1]], label: l[2] }; });
  }
  function layout() {
    if (!core) return;
    items.forEach(function (it) {
      it.el.style.setProperty('--r', it.r + 'px');
      it.hub.style.left = it.x + 'px'; it.hub.style.top = (it.up ? it.y + it.r - it.hub.offsetHeight : it.y - it.r) + 'px';
      // the panel sits under the name, or over the nucleus when it would leave the map
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
  // hover and keyboard focus: the nucleus whose wrap holds the pointer or the focus
  function watchHot(it) {
    var wrap = it.el;
    var hot = function (v) { return function () { it.hot = v || wrap.matches(':hover') || wrap.contains(document.activeElement); focusChanged(); }; };
    wrap.addEventListener('pointerenter', hot(true)); wrap.addEventListener('pointerleave', hot(false));
    wrap.addEventListener('focusin', hot(true)); wrap.addEventListener('focusout', function () { setTimeout(hot(false)); });
  }
  // the focused service and the ones it exchanges data with stay lit; everything else dims (labels too)
  function focusItem() { return items.find(function (it) { return it.hot; }) || null; }
  function related(f, it) { return !f || f === it || beams.some(function (b) { return b.link && ((b.a === f && b.b === it) || (b.b === f && b.a === it)); }); }
  function focusChanged() {
    var f = focusItem();
    items.forEach(function (it) { it.el.classList.toggle('cc-dim', !!f && !related(f, it)); it.el.classList.toggle('cc-rel', !!f && f !== it && related(f, it)); });
    if (reduce.matches) paintOnce();
  }
  function modeSwitch() {
    var box = node('div', 'cc-modes'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Cosa mostrare intorno a RADIX');
    [['servizi', 'Servizi'], ['progetti', 'Progetti']].forEach(function (m) {
      var b = node('button', 'cc-mode', m[1]); b.type = 'button'; b.setAttribute('aria-pressed', String(mode === m[0]));
      b.addEventListener('click', function () {
        if (mode === m[0]) return;
        mode = m[0]; try { localStorage.setItem('cc-network-mode', mode); } catch (e) { /* not remembered */ }
        build(); var again = nodes.querySelector('.cc-mode[aria-pressed=true]'); if (again) again.focus();
      });
      box.append(b);
    });
    return box;
  }
  function buildServices() {
    return SERVICES.map(function (s) {
      var wrap = node('div', 'cc-proj cc-svc'); wrap.style.setProperty('--c', s.color); wrap.dataset.service = s.id;
      var a = node('a', 'cc-hub'); a.href = s.href;
      var t = node('span', 'cc-hub-t'); t.append(node('b', '', s.name), node('small', '', s.sub));
      a.append(node('i'), t); a.setAttribute('aria-label', 'Apri ' + s.name + ' · ' + s.sub);
      var tip = node('div', 'cc-tip'); tip.setAttribute('role', 'group'); tip.setAttribute('aria-label', 'Pagine di ' + s.name);
      var head = node('div', 'cc-tip-head'); head.append(node('b', '', s.name), node('small', '', 'Servizio')); tip.append(head);
      var chips = node('div', 'cc-tip-list');
      s.pages.forEach(function (p) { var e = node('a', 'cc-sat cc-sat-page'); e.href = p[1]; e.append(node('i'), node('span', '', p[0])); chips.append(e); });
      tip.append(chips);
      // the services it exchanges data with, and what travels on the beam
      var ex = SERVICE_LINKS.filter(function (l) { return l[0] === s.id || l[1] === s.id; });
      if (ex.length) {
        var lk = node('ul', 'cc-tip-links'); lk.setAttribute('aria-label', 'Scambia dati con');
        ex.forEach(function (l) {
          var other = SERVICES.find(function (x) { return x.id === (l[0] === s.id ? l[1] : l[0]); }), li = node('li');
          var dot = node('i'); dot.style.setProperty('--c2', other.color); li.append(dot, node('b', '', other.name), node('span', '', ' · ' + l[2])); lk.append(li);
        });
        tip.append(node('div', 'cc-tip-sub', 'Scambia dati con'), lk);
      }
      wrap.append(a, tip); nodes.append(wrap);
      var it = { id: s.id, el: wrap, hub: a, label: t, tip: tip, name: s.name, color: s.color, active: true, level: s.id === 'agents' ? .85 : .65, hot: false };
      watchHot(it);
      return it;
    });
  }
  function serviceCaption() {
    var caption = document.getElementById('networkCaption'), text = SERVICES.length + ' servizi · ' + SERVICE_LINKS.length + ' scambi diretti · passa sopra un servizio';
    if (caption && caption.textContent !== text) caption.textContent = text;
  }
  function buildProjects() {
    var all = mapProjects(); distinctColors(all);
    var caption = document.getElementById('networkCaption');
    if (caption) caption.textContent = all.length + (all.length === 1 ? ' progetto' : ' progetti') + ' · passa sopra un nucleo per le sue sezioni';
    var shown = all.slice(0, MAX);
    var list = shown.map(function (p) {
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
      var it = { id: 'p' + p.name, el: wrap, hub: b, label: t, tip: tip, name: p.name, color: p.color, active: active, level: Math.min(1, score / 7), hot: false };
      watchHot(it);
      return it;
    });
    if (all.length > MAX) {
      var m = node('button', 'cc-more'); m.type = 'button'; m.textContent = '+' + (all.length - MAX) + ' progetti';
      m.addEventListener('click', function () { var l = document.getElementById('projectsTab'); if (l) l.click(); });
      nodes.append(m);
    }
    if (!all.length) nodes.append(node('p', 'cc-empty', 'Nessun progetto ancora: crealo da Marketing Agency › Progetti.'));
    var un = svg.querySelector('.unassigned-node');
    if (un) {
      var u = node('button', 'cc-shared'); u.type = 'button';
      u.textContent = ((un.getAttribute('aria-label') || 'Workflow condivisi').split(' · ')[0]) + ' →';
      u.addEventListener('click', function () { un.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      nodes.append(u);
    }
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
      // the pointer, in stage coordinates (the stage can be zoomed by the page's camera)
      world.addEventListener('pointermove', function (e) {
        var r = stage.getBoundingClientRect(), z = stage.offsetWidth ? r.width / stage.offsetWidth : 1;
        ptr.x = (e.clientX - r.left) / z; ptr.y = (e.clientY - r.top) / z; ptr.on = e.pointerType !== 'touch' || e.buttons > 0;
      });
      world.addEventListener('pointerleave', function () { ptr.on = false; });
      // the map's drag-to-pan captures the pointer on pointerdown and only spares buttons: keep the service links clickable
      world.addEventListener('pointerdown', function (e) { if (e.target.closest && e.target.closest('a[href]')) e.stopPropagation(); });
    }
    // the services do not depend on the map: when only renderNetwork() redrew, keep them (and the hover) as they are
    if (mode === 'servizi' && !world.hidden && world.dataset.mode === 'servizi' && items.length) { serviceCaption(); return; }
    world.hidden = false; nodes.replaceChildren(); world.dataset.mode = mode;
    var cap = node('div', 'cc-core-label'); cap.append(node('b', '', 'RADIX'), node('small', '', 'CORE')); nodes.append(cap, modeSwitch());
    items = mode === 'servizi' ? buildServices() : buildProjects();
    if (mode === 'servizi') serviceCaption();
    focusChanged();
    size(); schedule();
  }
  // The legend explains the particle view while it is shown; inside a project the page's own legend comes back.
  function legend(on) {
    var l = document.getElementById('networkLegend'); if (!l) return;
    if (legendHtml === null) legendHtml = l.innerHTML;
    if (on) {
      if (l.dataset.ccMode === mode && l.querySelector('.cc-legend')) return;
      l.replaceChildren(); l.dataset.ccMode = mode;
      var rows = mode === 'servizi'
        ? [['cc-legend core', 'RADIX'], ['cc-legend svc', 'servizio'], ['cc-legend flow', 'verso RADIX'], ['cc-legend link', 'scambio diretto']]
        : [['cc-legend core', 'RADIX'], ['cc-legend proj', 'nucleo progetto'], ['cc-legend flow', 'scia: attività in corso']];
      rows.forEach(function (r) { var s = node('span', r[0]); s.append(node('i'), document.createTextNode(r[1])); l.append(s); });
    } else if (l.querySelector('.cc-legend')) { l.innerHTML = legendHtml; delete l.dataset.ccMode; }
  }
  function rgba(hex, a) { var h = hex.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return isNaN(n) ? 'rgba(54,237,189,' + a + ')' : 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
  // One crisp dot per colour, drawn once and stamped for every particle: a solid bright core with a hard edge and only a
  // thin halo (no soft blur), at 64px so it stays sharp when scaled for devicePixelRatio 2.
  function sprite(color) {
    if (sprites[color]) return sprites[color];
    var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.16, 'rgba(255,255,255,.95)'); gr.addColorStop(.3, rgba(color, 1)); gr.addColorStop(.42, rgba(color, 1));
    gr.addColorStop(.5, rgba(color, .28)); gr.addColorStop(.68, rgba(color, .06)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (sprites[color] = c);
  }
  // the soft push of the pointer on a point (repel), strongest at the cursor and gone at 80px
  var PUSH = 80;
  function drawNucleus(pts, cx, cy, R, color, t, spin, tilt, gain) {
    var img = sprite(color), ca = Math.cos(t * spin), sa = Math.sin(t * spin), cb = Math.cos(tilt), sb = Math.sin(tilt), ringA = t * spin * 1.8, cr = Math.cos(ringA), sr = Math.sin(ringA);
    var unit = Math.max(2.6, R * .07), n = pts.length / 5, pk = ptr.k, near = pk > .01 && Math.hypot(ptr.x - cx, ptr.y - cy) < R * 1.8 + PUSH;
    for (var k = 0; k < n; k++) {
      var o = k * 5, x = pts[o], y = pts[o + 1], z = pts[o + 2], rx, rz;
      if (x * x + z * z > 1.6) { rx = x * cr + z * sr; rz = -x * sr + z * cr; } else { rx = x * ca + z * sa; rz = -x * sa + z * ca; }
      var ry = y * cb - rz * sb, dz = y * sb + rz * cb, depth = (dz + 1.6) / 3.2;
      var tw = .78 + .22 * Math.sin(t * .002 + pts[o + 4]);
      var px = cx + rx * R, py = cy + ry * R;
      if (near) {
        var ddx = px - ptr.x, ddy = py - ptr.y, d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d < PUSH && d > .01) { var f = (1 - d / PUSH); f = f * f * 14 * pk; px += ddx / d * f; py += ddy / d * f; }
      }
      ctx.globalAlpha = Math.min(1, (.32 + .68 * depth) * tw * gain);
      var s = unit * pts[o + 3] * (.7 + .5 * depth);
      ctx.drawImage(img, px - s / 2, py - s / 2, s, s);
    }
  }
  // a beam's curve: from the edge of one nucleus to the edge of the other, bowed by its bend and pulled toward the pointer
  function curve(bm, R, extra) {
    var A = bm.a, B = bm.b, ra = A === core ? R * 1.02 : A.r * 1.08, rb = B.r * 1.08;
    var dx = B.x - (A.x != null ? A.x : A.cx), dy = B.y - (A.y != null ? A.y : A.cy), ax = A.x != null ? A.x : A.cx, ay = A.y != null ? A.y : A.cy;
    var d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    var sx = ax + ux * ra, sy = ay + uy * ra, ex = B.x - ux * rb, ey = B.y - uy * rb, bend = bm.bend + (extra || 0);
    var mx = (sx + ex) / 2 - uy * d * bend, my = (sy + ey) / 2 + ux * d * bend;
    if (ptr.k > .01) { var pd = Math.hypot(ptr.x - mx, ptr.y - my), pull = .3 * ptr.k * Math.exp(-pd * pd / (170 * 170)); mx += (ptr.x - mx) * pull; my += (ptr.y - my) * pull; }
    return { sx: sx, sy: sy, ex: ex, ey: ey, mx: mx, my: my, ux: ux, uy: uy };
  }
  function at(c, u) { var q = 1 - u; return [q * q * c.sx + 2 * q * u * c.mx + u * u * c.ex, q * q * c.sy + 2 * q * u * c.my + u * u * c.ey]; }
  // how close the pointer is to a beam, 0..1
  function nearness(c) {
    if (ptr.k < .01) return 0;
    var best = 1e9; for (var i = 0; i <= 12; i++) { var p = at(c, i / 12); best = Math.min(best, Math.hypot(p[0] - ptr.x, p[1] - ptr.y)); }
    return ptr.k * Math.exp(-best * best / (70 * 70));
  }
  function colorOf(n) { return n === core ? CORE_GREEN : n.color; }
  function frame(t) {
    if (!ctx || !core || !W) return;
    var g = core, R = g.R * (1 + .018 * Math.sin(t * .0012)), f = focusItem();
    // the pointer eases in and out (instant under reduced motion: no pointer physics there)
    ptr.k = reduce.matches ? 0 : ptr.k + ((ptr.on ? 1 : 0) - ptr.k) * .12;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    stars.forEach(function (s) { ctx.globalAlpha = .12 + .22 * Math.abs(Math.sin(t * .0004 + s[3] * 9)); ctx.fillStyle = s[3] > .85 ? '#b9ffe6' : '#5c8f80'; ctx.fillRect(s[0], s[1], s[2], s[2]); });
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
    var halo = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, R * 2.2); halo.addColorStop(0, 'rgba(30,255,160,.12)'); halo.addColorStop(.45, 'rgba(30,255,160,.03)'); halo.addColorStop(1, 'rgba(30,255,160,0)');
    ctx.fillStyle = halo; ctx.fillRect(g.cx - R * 2.2, g.cy - R * 2.2, R * 4.4, R * 4.4);
    var sec = t / 1000;
    beams.forEach(function (bm) {
      // with a focus: its beams blaze, the beams of the services it talks to stay, the rest fades almost out
      var touches = f && (bm.a === f || bm.b === f), lit = !f ? 1 : touches ? 1.7 : bm.link ? .12 : .18;
      var c = curve(bm, R), near = nearness(c), gain = bm.gain * lit + near * .9;
      var ca = colorOf(bm.a), cb = colorOf(bm.b);
      var lg = ctx.createLinearGradient(c.sx, c.sy, c.ex, c.ey); lg.addColorStop(0, rgba(ca, 1)); lg.addColorStop(1, rgba(cb, 1));
      ctx.strokeStyle = lg;
      ctx.beginPath(); ctx.moveTo(c.sx, c.sy); ctx.quadraticCurveTo(c.mx, c.my, c.ex, c.ey);
      ctx.lineWidth = 4; ctx.globalAlpha = Math.min(1, .07 * gain); ctx.stroke();
      ctx.lineWidth = 1.6; ctx.globalAlpha = Math.min(1, .16 * gain); ctx.stroke();
      ctx.lineWidth = .8; ctx.globalAlpha = Math.min(1, .7 * gain); ctx.stroke();
      // the braided filaments: thin and quieter, they cross the main beam as they travel
      bm.strands.forEach(function (o, si) {
        var sc = curve(bm, R, o * Math.sin(t * .0006 + si * 2.1 + bm.bend * 10));
        ctx.beginPath(); ctx.moveTo(sc.sx, sc.sy); ctx.quadraticCurveTo(sc.mx, sc.my, sc.ex, sc.ey);
        ctx.lineWidth = .6; ctx.globalAlpha = Math.min(1, .32 * gain); ctx.stroke();
      });
      var imgA = sprite(ca), imgB = sprite(cb);
      bm.flow.forEach(function (p) {
        var head = (p.u + sec * p.v) % 1;
        for (var k = 0; k < 4; k++) {
          var fr = head - k * .012; if (fr < 0) continue;
          var u = p.back ? 1 - fr : fr, pt = at(c, u);
          var wob = Math.sin(u * Math.PI) * 3 * p.w * Math.sin(t * .0016 + p.ph), px = pt[0] - c.uy * wob, py = pt[1] + c.ux * wob;
          var fade = Math.sin(u * Math.PI), a = fade * (1 - k / 4) * Math.min(1.6, gain) * .9, s = (k ? 2.2 : 3.4) * p.s;
          ctx.globalAlpha = Math.min(1, a * (1 - u)); ctx.drawImage(imgA, px - s / 2, py - s / 2, s, s);
          ctx.globalAlpha = Math.min(1, a * u); ctx.drawImage(imgB, px - s / 2, py - s / 2, s, s);
        }
      });
    });
    // the nuclei, then RADIX on top
    items.forEach(function (it) {
      var on = !f || related(f, it), r = it.r * (it.hot ? 1.08 : 1), gl = ctx.createRadialGradient(it.x, it.y, 0, it.x, it.y, r * 1.7);
      gl.addColorStop(0, rgba(it.color, !on ? .03 : it.active || it.hot ? .14 : .08)); gl.addColorStop(1, rgba(it.color, 0));
      ctx.globalAlpha = 1; ctx.fillStyle = gl; ctx.fillRect(it.x - r * 1.7, it.y - r * 1.7, r * 3.4, r * 3.4);
      drawNucleus(it.pts, it.x, it.y, r, it.color, t, it.spin, it.tilt, !on ? .25 : it.hot ? 1.25 : it.active ? 1 : .72);
    });
    drawNucleus(g.pts, g.cx, g.cy, R, CORE_GREEN, t, .00011, -.38, f ? .8 : 1);
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
  // reduced motion: one still, fully formed frame (and again on resize, hover or focus)
  function paintOnce() { if (world && !world.hidden) frame(reduce.matches ? 4000 : clock); }
  if (svg && stage) {
    new MutationObserver(build).observe(svg, { childList: true });
    var crumb = document.getElementById('networkBreadcrumb'); if (crumb) new MutationObserver(build).observe(crumb, { childList: true, subtree: true, characterData: true });
    build();
    loadJourneys().then(function (j) { journeys = j; if (mode === 'progetti') build(); });
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
