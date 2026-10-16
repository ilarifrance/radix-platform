// Agency overview design layer (agenzia-mockup.png): dotted earth in the hero, a 14th "Progetto personalizzato" tile,
// agent rows that name their division and its deliverables, arrows through the featured division, status pills in Task recenti. Presentation only: it reads what the page and
// agency/catalog.json already hold and never changes the page's ids, texts or links.
'use strict';
(function () {
  var wrap = document.querySelector('.planet-wrap .planet');
  var grid = document.getElementById('divisions');
  var agents = document.getElementById('agents');

  // ---- dotted earth, from the land mask shared by sales/orbit-globe.js ----
  function globe() {
    var L = window.RadixGlobeLand;
    if (!wrap || !L || !window.HTMLCanvasElement || wrap.querySelector('canvas')) return;
    var cv = document.createElement('canvas'); cv.className = 'ag-globe'; cv.setAttribute('aria-hidden', 'true');
    var ctx = cv.getContext('2d'); if (!ctx) return;
    wrap.append(cv); document.documentElement.classList.add('ag-has-globe');
    var raw = atob(L.LAND), ga = Math.PI * (3 - Math.sqrt(5)), pts = [];
    for (var i = 0; i < L.N; i += 2) { // every other point is dense enough at this size
      if (!(raw.charCodeAt(i >> 3) >> (i & 7) & 1)) continue;
      var y = 1 - (i + .5) / L.N * 2, r = Math.sqrt(1 - y * y), t = ga * i;
      pts.push([Math.cos(t) * r, y, -Math.sin(t) * r]);
    }
    var rot = 1.9, tilt = .32, ct = Math.cos(tilt), st = Math.sin(tilt), W = 0, dpr = 1;
    var still = matchMedia('(prefers-reduced-motion: reduce)');
    function size() { var b = cv.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = b.width; cv.width = Math.round(W * dpr); cv.height = Math.round(W * dpr); }
    function draw() {
      if (!W) size();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, W);
      var R = W / 2 - 2, c = W / 2, cr = Math.cos(rot), sr = Math.sin(rot);
      for (var k = 0; k < pts.length; k++) {
        var p = pts[k], x = p[0] * cr - p[2] * sr, z = p[0] * sr + p[2] * cr, yy = p[1] * ct - z * st, zz = p[1] * st + z * ct;
        if (zz < 0) continue;
        var light = Math.max(0, .35 + .65 * (-.55 * x + .35 * yy + .75 * zz)); // lit from the upper left
        var hue = x > 0 ? 'rgba(170,120,255,' : 'rgba(110,200,255,';
        ctx.fillStyle = hue + (0.25 + light * .75).toFixed(3) + ')';
        var s = .7 + zz * .9;
        ctx.fillRect(c + x * R - s / 2, c - yy * R - s / 2, s, s);
      }
    }
    function tick() { rot += .0016; draw(); if (!still.matches && !document.hidden) requestAnimationFrame(tick); }
    window.addEventListener('resize', function () { W = 0; draw(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && !still.matches) requestAnimationFrame(tick); });
    size(); still.matches ? draw() : requestAnimationFrame(tick);
  }
  function loadGlobe() {
    if (!wrap) return;
    if (window.RadixGlobeLand) return globe();
    var s = document.createElement('script'); s.src = '/sales/orbit-globe.js'; s.onload = globe; document.body.appendChild(s);
  }

  // ---- 14th tile: a custom project combining divisions, as in the mockup ----
  function customTile() {
    if (!grid || !grid.children.length || grid.querySelector('.ag-custom')) return;
    var a = document.createElement('a'); a.className = 'division-card ag-custom'; a.href = '/agency/new-project.html';
    a.innerHTML = '<span class="ag-plus" aria-hidden="true">+</span><b>Progetto personalizzato</b><small>Combina più divisioni per soluzioni su misura.</small>';
    grid.append(a);
  }

  // ---- agent rows: division under the name, two deliverables as tags ----
  var catalog = null;
  function agentRows() {
    if (!agents || !catalog) return;
    [].slice.call(agents.querySelectorAll('.agent-row')).forEach(function (row) {
      if (row.dataset.agDone) return;
      var link = row.querySelector('a[href*="agent="]'); if (!link) return;
      var id = decodeURIComponent((/agent=([^&]+)/.exec(link.getAttribute('href')) || [])[1] || '');
      var div = (catalog.divisions || []).filter(function (d) { return (d.agentIds || []).indexOf(id) >= 0; })[0];
      row.dataset.agDone = '1';
      if (!div) return;
      var small = row.querySelector('.agent-copy small');
      if (small) { small.title = small.textContent; small.textContent = div.label; }
      var tags = document.createElement('span'); tags.className = 'ag-tags';
      (div.deliverables || []).slice(0, 2).forEach(function (t) { var e = document.createElement('i'); e.textContent = t; tags.append(e); });
      if (tags.children.length) link.before(tags);
    });
  }

  // ---- agent rows: a green dot = role available in chat (every catalogued role is) ----
  function agentDots() {
    if (!agents) return;
    agents.querySelectorAll('.agent-row').forEach(function (row) {
      if (row.querySelector('.ag-dot')) return;
      var link = row.querySelector('a.role'); if (!link) return;
      var d = document.createElement('i'); d.className = 'ag-dot'; d.title = 'Disponibile in chat';
      var tags = row.querySelector('.ag-tags'); (tags || link).before(d);
    });
  }

  // ---- Divisione in evidenza: arrows through the 13 divisions, number and deliverables ----
  var spot = document.querySelector('.spotlight'), spotIdx = -1;
  function spotlight(step) {
    if (!spot || !grid || !catalog) return;
    var cards = [].slice.call(grid.querySelectorAll('a.division-card:not(.ag-custom)')); if (!cards.length) return;
    if (spotIdx < 0) {
      var h = spot.querySelector('h4'); spotIdx = Math.max(0, cards.findIndex(function (c) { return c.querySelector('strong').textContent === (h && h.textContent); }));
      var head = spot.closest('.panel') && spot.closest('.panel').querySelector('.panel-head');
      if (head && !head.querySelector('.ag-arrows')) {
        var nav = document.createElement('span'); nav.className = 'ag-arrows';
        [['‹', -1, 'Divisione precedente'], ['›', 1, 'Divisione successiva']].forEach(function (a) {
          var b = document.createElement('button'); b.type = 'button'; b.textContent = a[0]; b.setAttribute('aria-label', a[2]);
          b.addEventListener('click', function () { spotlight(a[1]); }); nav.append(b);
        });
        head.append(nav);
      }
    } else spotIdx = (spotIdx + step + cards.length) % cards.length;
    var card = cards[spotIdx], label = card.querySelector('strong').textContent;
    var div = (catalog.divisions || []).filter(function (d) { return d.label === label; })[0] || {};
    if (step) {
      spot.querySelector('.spotlight-icon').textContent = card.querySelector('.symbol').textContent;
      spot.querySelector('h4').textContent = label;
      spot.querySelector('.spotlight-top small').textContent = (div.stages || [])[0] || '';
      spot.querySelector('p').textContent = div.description || card.querySelector('p').textContent;
      spot.querySelector('a').href = card.getAttribute('href');
      spot.style.setProperty('--accent', card.style.getPropertyValue('--accent'));
    }
    var num = spot.querySelector('.ag-num'); if (!num) { num = document.createElement('span'); num.className = 'ag-num'; spot.querySelector('.spotlight-top').append(num); }
    num.textContent = card.querySelector('.number').textContent;
    var tags = spot.querySelector('.ag-spot-tags'); if (!tags) { tags = document.createElement('span'); tags.className = 'ag-spot-tags'; spot.querySelector('p').after(tags); }
    tags.replaceChildren.apply(tags, (div.deliverables || []).slice(0, 3).map(function (t) { var e = document.createElement('i'); e.textContent = t; return e; }));
  }

  // ---- Task recenti: title, project and a status pill per row (same link, same words) ----
  var tasks = document.getElementById('recentTasks');
  var PILL = { 'Da avviare': 'todo', 'In lavorazione': 'run', 'Bozza da revisionare': 'review', 'Bozza approvata': 'done', 'Modifiche richieste': 'warn', 'Errore': 'err' };
  function taskRows() {
    if (!tasks) return;
    tasks.querySelectorAll('a.empty-task:not(.ag-task)').forEach(function (a) {
      var b = a.querySelector('b'), sm = a.querySelector('small'); if (!b || !sm) return;
      var status = b.textContent, project = (a.childNodes[1] && a.childNodes[1].textContent || '').replace(/^\s*·\s*/, '').trim();
      var txt = sm.textContent, cut = txt.indexOf(': '), role = cut > 0 ? txt.slice(0, cut) : '', title = cut > 0 ? txt.slice(cut + 2) : txt;
      a.className = 'empty-task ag-task'; a.removeAttribute('style'); a.title = status + ' · ' + project + ' · ' + txt;
      var t = document.createElement('span'); t.className = 'ag-task-title'; t.textContent = title;
      var m = document.createElement('span'); m.className = 'ag-task-meta'; m.textContent = project + (role ? ' · ' + role : '');
      var pill = document.createElement('span'); pill.className = 'ag-pill ' + (PILL[status] || 'todo'); pill.textContent = status;
      a.replaceChildren(t, m, pill);
    });
  }

  function watch(el, fn) { if (!el) return; fn(); new MutationObserver(fn).observe(el, { childList: true }); }
  loadGlobe();
  watch(grid, customTile);
  watch(tasks, taskRows);
  fetch('/agency/catalog.json', { cache: 'force-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) { catalog = c; watch(agents, function () { agentRows(); agentDots(); }); watch(grid, function () { if (spotIdx < 0) spotlight(0); }); }, function () {});
})();
