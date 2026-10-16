// Agency overview design layer (agenzia-mockup.png): dotted earth in the hero, a 14th "Progetto personalizzato" tile,
// and agent rows that name their division and its deliverables. Presentation only: it reads what the page and
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

  function watch(el, fn) { if (!el) return; fn(); new MutationObserver(fn).observe(el, { childList: true }); }
  loadGlobe();
  watch(grid, customTile);
  fetch('/agency/catalog.json', { cache: 'force-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) { catalog = c; watch(agents, agentRows); }, function () {});
})();
