// Command Center design layer (command-center-universo + layout mockups):
// 1) the overview of the network view: RADIX CORE and each project as an elliptical cluster with its named satellites
//    (the CRM planets live in Sales Orbit);
// 2) connected systems in the top bar, one icon per service, from /api/integrations/status (key present or not);
// 3) projects and a RADIX CORE box in the sidebar, Rivedi on the attention rows, icons and status rings in the activity.
// Presentation only: it adds its own layer over the map renderNetwork() draws and never changes the page's nodes or handlers.
'use strict';
(function () {
  // ---- The network overview (command-center-layout-mockup / cc-mockup-francesco-2232.png): RADIX CORE at the centre and
  // each project as a large elliptical cluster: the project in the middle with its orchestrator (or where its flow stands)
  // underneath, and around it named satellites from its own data only: the steps of its project flow, coloured by state,
  // and the agents it has used, named by function. Inside a project the page's own map comes back: a click on a project or
  // a satellite clicks the project's hub. Projects, colours and own workflows come from the map renderNetwork() just drew;
  // the flow and the agents from /api/workspace?resource=projects&journey=1.
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

  var MAX = 8, world = null, cv = null, ctx = null, nodes = null, W = 0, H = 0, dpr = 1, core = null, items = [], small = false, stars = [];
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
  // Two rows of clusters, above and below the core (2 + 2 as in the mockup, up to 4 + 4); on a phone one column.
  function size() {
    if (!cv) return; var r = stage.getBoundingClientRect(), z = stage.offsetWidth ? r.width / stage.offsetWidth : 1;
    W = stage.offsetWidth; H = stage.offsetHeight; dpr = Math.min(2, (window.devicePixelRatio || 1) * z);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    small = W < 640; world.classList.toggle('cc-small', small);
    var s = 11, rnd = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
    stars = []; for (var k = 0; k < Math.round(W * H / 2200); k++) stars.push([rnd() * W, rnd() * H, rnd() * 1.1 + .3, rnd()]);
    var n = items.length;
    if (small) {
      core = { cx: W / 2, cy: 64, R: 42 };
      var rh = (H - 130) / Math.max(1, n);
      items.forEach(function (it, i) { it.x = W / 2; it.y = 130 + rh * (i + .5); it.rx = Math.min(W * .42, 170); it.ry = Math.min(rh * .42, 62); });
    } else {
      var top = Math.ceil(n / 2), bottom = n - top, padY = 10, rowH = (H - padY - 48) / 2;
      // with three or four clusters in a row there is no room for names: dots only, named in their tooltip
      world.classList.toggle('cc-dense', W / Math.max(top, 2) < 260);
      core = { cx: W / 2, cy: H / 2, R: Math.max(46, Math.min(W * .065, H * .12)) };
      items.forEach(function (it, i) {
        var up = i < top, m = up ? top : bottom, k = up ? i : i - top, colW = W / Math.max(m, 2);
        // two per row sit left and right of the core; more spread across the row
        it.x = m <= 2 ? (m === 1 ? W * (up ? .27 : .73) : W * (k ? .76 : .24)) : colW * (k + .5);
        it.y = padY + rowH * (up ? .5 : 1.5);
        it.rx = Math.min(m <= 2 ? W * .2 : colW * .46, 190); it.ry = Math.min(rowH * .44, 105);
      });
    }
    layout();
  }
  function layout() {
    if (!core) return;
    items.forEach(function (it) {
      it.el.style.left = it.x + 'px'; it.el.style.top = it.y + 'px';
      var n = it.sats.length, srx = it.rx * .62, sry = it.ry * .66;
      it.sats.forEach(function (s, k) {
        // spread over the upper arc, from left to right, leaving the bottom to the project's name
        var a = (168 + k * (204 / Math.max(n - 1, 1))) * Math.PI / 180;
        if (n === 1) a = -Math.PI / 2;
        s.x = it.x + Math.cos(a) * srx; s.y = it.y + Math.sin(a) * sry; s.a = a;
        s.el.style.left = s.x + 'px'; s.el.style.top = s.y + 'px';
        s.el.classList.remove('cc-left', 'cc-up'); s.el.style.marginLeft = '';
        if (Math.abs(Math.cos(a)) <= .2) s.el.classList.add('cc-up'); else if (Math.cos(a) < 0) s.el.classList.add('cc-left');
        // a label that would leave the map goes above its dot instead, kept inside
        var w = s.el.offsetWidth;
        if ((Math.cos(a) < -.2 && s.x - w < 2) || (Math.cos(a) > .2 && s.x + w > W - 2)) {
          s.el.classList.remove('cc-left'); s.el.classList.add('cc-up');
          var half = s.el.offsetWidth / 2, shift = Math.min(0, W - 2 - (s.x + half)) + Math.max(0, 2 - (s.x - half));
          if (shift) s.el.style.marginLeft = shift + 'px';
        }
      });
    });
    var cap = nodes.querySelector('.cc-core-label'); if (cap) { cap.style.left = core.cx + 'px'; cap.style.top = core.cy + 'px'; }
    var more = nodes.querySelector('.cc-more'); if (more) { more.style.left = core.cx + 'px'; more.style.top = (core.cy + core.R + 26) + 'px'; }
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
    var cap = node('div', 'cc-core-label'); cap.append(node('b', '', 'RADIX'), node('small', '', 'CORE')); nodes.append(cap);
    var all = mapProjects();
    items = all.slice(0, MAX).map(function (p) {
      var j = journeys[p.name.trim().toLowerCase()], agStep = j && j.steps && j.steps.find(function (s) { return s.id === 'agents'; });
      var agents = (agStep && Array.isArray(agStep.agents)) ? agStep.agents : [];
      var open = function () { p.hub.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
      var b = node('button', 'cc-hub'); b.type = 'button'; b.style.setProperty('--c', p.color);
      var sub = subtitle(j, agents), t = node('span', 'cc-hub-t'); t.append(node('b', '', p.name), node('small', '', sub));
      b.append(node('i'), t); b.setAttribute('aria-label', 'Apri il progetto ' + p.name + ' · ' + sub);
      b.addEventListener('click', open); nodes.append(b);
      // satellites: the flow steps (state as colour) then the agents used (by function), then the project's own workflows
      var list = [];
      ((j && j.steps) || []).forEach(function (s) { if (STEP_SHORT[s.id]) list.push({ label: STEP_SHORT[s.id], kind: 'step-' + s.state, title: s.label + ' · ' + s.detail }); });
      agents.forEach(function (a) { list.push({ label: AGENT_FN[a] || agentName(a), kind: 'agent', title: 'Agente · ' + agentName(a) }); });
      if (!agents.length && j) list.push({ label: 'Agenti AI', kind: 'step-todo', title: 'Agenti AI · nessuna conversazione' });
      p.wf.forEach(function (w) { list.push({ label: w, kind: 'wf', title: 'Workflow · ' + w }); });
      if (list.length > 6) { var rest = list.splice(5); list.push({ label: '+' + rest.length, kind: 'more', title: rest.map(function (r) { return r.title; }).join('\n') }); }
      var sats = list.map(function (s) {
        var e = node('button', 'cc-sat cc-sat-' + s.kind); e.type = 'button'; e.tabIndex = -1; e.style.setProperty('--c', p.color); e.title = s.title;
        e.append(node('i'), node('span', '', s.label)); e.addEventListener('click', open); nodes.append(e);
        return { el: e, kind: s.kind };
      });
      return { el: b, color: p.color, sats: sats };
    });
    if (all.length > MAX) {
      var m = node('button', 'cc-more'); m.type = 'button'; m.textContent = '+' + (all.length - MAX) + ' progetti';
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
  }
  function rgba(hex, a) { var h = hex.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return isNaN(n) ? 'rgba(54,237,189,' + a + ')' : 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function frame(t) {
    if (!ctx || !core || !W) return;
    var g = core;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    stars.forEach(function (s) { ctx.globalAlpha = .25 + .45 * Math.abs(Math.sin(t * .0005 + s[3] * 9)); ctx.fillStyle = s[3] > .8 ? '#9fffe0' : '#3fe8b0'; ctx.fillRect(s[0], s[1], s[2], s[2]); });
    ctx.globalAlpha = 1;
    items.forEach(function (it) {
      // the cluster: a soft field and a dashed ellipse in the project's colour
      ctx.save(); ctx.translate(it.x, it.y); ctx.scale(1, it.ry / it.rx);
      var fld = ctx.createRadialGradient(0, 0, 0, 0, 0, it.rx); fld.addColorStop(0, rgba(it.color, .1)); fld.addColorStop(.75, rgba(it.color, .04)); fld.addColorStop(1, rgba(it.color, 0));
      ctx.fillStyle = fld; ctx.beginPath(); ctx.arc(0, 0, it.rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.strokeStyle = rgba(it.color, .42); ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.lineDashOffset = -t * .004;
      ctx.beginPath(); ctx.ellipse(it.x, it.y, it.rx, it.ry, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = rgba(it.color, .16); ctx.beginPath(); ctx.ellipse(it.x, it.y, it.rx * .62, it.ry * .66, 0, 0, Math.PI * 2); ctx.stroke();
      // spokes from the project to its satellites
      it.sats.forEach(function (s) { var lg = ctx.createLinearGradient(it.x, it.y, s.x, s.y); lg.addColorStop(0, rgba(it.color, .55)); lg.addColorStop(1, rgba(it.color, .15)); ctx.strokeStyle = lg; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(it.x, it.y); ctx.lineTo(s.x, s.y); ctx.stroke(); });
      // the beam from the core: glowing curve with a pulse running out to the project
      if (small) return;
      var dx = it.x - g.cx, dy = it.y - g.cy, d = Math.hypot(dx, dy) || 1, sx = g.cx + dx / d * g.R * 1.05, sy = g.cy + dy / d * g.R * 1.05, ex = it.x - dx / d * 30, ey = it.y - dy / d * 30;
      var bend = (dx * dy < 0 ? 1 : -1) * 30, mx = (sx + ex) / 2 - dy / d * bend, my = (sy + ey) / 2 + dx / d * bend;
      var lg = ctx.createLinearGradient(sx, sy, ex, ey); lg.addColorStop(0, 'rgba(70,255,190,.75)'); lg.addColorStop(1, rgba(it.color, .7));
      ctx.save(); ctx.strokeStyle = lg; ctx.lineWidth = 1.6; ctx.shadowColor = '#2dffb0'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke(); ctx.restore();
      for (var k = 0; k < 2; k++) {
        var f = (t * .0003 + k * .5 + it.x * .001) % 1, q = 1 - f, px = q * q * sx + 2 * q * f * mx + f * f * ex, py = q * q * sy + 2 * q * f * my + f * f * ey;
        ctx.fillStyle = '#eafff6'; ctx.shadowColor = '#2dffb0'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      }
    });
    // RADIX CORE: a glowing ring with rays and a slow rotating tick ring, as in the mockup
    var R = g.R, rot = t * .00015;
    var glow = ctx.createRadialGradient(g.cx, g.cy, R * .2, g.cx, g.cy, R * 2.2); glow.addColorStop(0, 'rgba(30,255,170,.28)'); glow.addColorStop(.45, 'rgba(30,255,170,.1)'); glow.addColorStop(1, 'rgba(30,255,170,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(g.cx, g.cy, R * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(60,255,180,.18)'; ctx.lineWidth = 1;
    for (var a = 0; a < 72; a++) { var an = a / 72 * Math.PI * 2 + rot * .5, r1 = R * 1.08, r2 = R * (1.25 + (a % 3) * .12); ctx.beginPath(); ctx.moveTo(g.cx + Math.cos(an) * r1, g.cy + Math.sin(an) * r1); ctx.lineTo(g.cx + Math.cos(an) * r2, g.cy + Math.sin(an) * r2); ctx.stroke(); }
    var body = ctx.createRadialGradient(g.cx - R * .3, g.cy - R * .35, R * .1, g.cx, g.cy, R); body.addColorStop(0, '#0c3a2c'); body.addColorStop(.7, '#03140f'); body.addColorStop(1, '#020c09');
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(g.cx, g.cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.lineWidth = 2.4; ctx.strokeStyle = '#3dffb5'; ctx.shadowColor = '#22ffa8'; ctx.shadowBlur = 24; ctx.beginPath(); ctx.arc(g.cx, g.cy, R, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = 'rgba(120,255,210,.55)'; ctx.lineWidth = 1; ctx.setLineDash([1, 6]); ctx.lineDashOffset = -t * .01;
    ctx.beginPath(); ctx.arc(g.cx, g.cy, R * .86, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  function loop(t) { if (world && !world.hidden) frame(reduce.matches ? 0 : t); requestAnimationFrame(loop); }
  if (svg && stage) {
    new MutationObserver(build).observe(svg, { childList: true });
    var crumb = document.getElementById('networkBreadcrumb'); if (crumb) new MutationObserver(build).observe(crumb, { childList: true, subtree: true, characterData: true });
    build();
    loadJourneys().then(function (j) { journeys = j; build(); });
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
      systemsKpi(on, d.items.length);
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

  var snap = null;
  if (document.getElementById('activityList')) {
    fetch('/api/state?view=dashboard', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return; snap = d; sidebar(d); activity(d); counts();
    }).catch(function () {});
    attention();
    new MutationObserver(function () { attention(); counts(); }).observe(document.getElementById('attentionList'), { childList: true });
    steppers(); var wl = document.getElementById('workflowList'); if (wl) new MutationObserver(steppers).observe(wl, { childList: true });
    new MutationObserver(function () { if (snap) activity(snap); }).observe(document.getElementById('activityList'), { childList: true });
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
