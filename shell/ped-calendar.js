// PED design layer (ped-mockup-orbitly): week and day views as an hour grid with a now-line, status pills and channel icons,
// plus a left rail (Overview, Calendario, Libreria contenuti, Analytics, Canali, Progetti).
// Presentation only: it reads what editorial-workspace.js rendered in #calendar and never changes the plan or its ids.
'use strict';
(function () {
  var cal = document.getElementById('calendar'), page = document.getElementById('pedPage');
  if (!cal || !page) return;
  var H0 = 7, H1 = 23, ROW = 92; // visible hours and pixels per hour
  var STATUS = { draft: 'Bozza', review: 'In revisione', approved: 'Approvato', queued: 'In coda', published: 'Pubblicato', scheduled: 'Programmato' };
  var root = document.documentElement;
  root.style.setProperty('--ped-row', ROW + 'px');
  root.style.setProperty('--ped-hours', String(H1 - H0));

  function minutes(t) { var m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function tz() { var s = document.getElementById('timezone'); return (s && s.value) || 'Europe/Rome'; }
  function todayLabel() {
    try { return new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz() }).format(new Date()); } catch (e) { return ''; }
  }
  function nowMinutes() {
    try {
      var p = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz() }).format(new Date());
      return minutes(p);
    } catch (e) { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  }

  // Phones read the week as an agenda (one row per content, days stacked) instead of the hour grid.
  var phone = window.matchMedia ? window.matchMedia('(max-width: 767px)') : { matches: false };
  var WD = { lun: 1, mar: 2, mer: 3, gio: 4, ven: 5, sab: 6, dom: 7 };
  var busy = false;
  function decorate() {
    var timed = /view-(week|day)/.test(cal.className) && !phone.matches;
    root.classList.toggle('ped-agenda', phone.matches);
    root.classList.toggle('ped-grid', timed);
    busy = true;
    [].slice.call(cal.querySelectorAll('.calendar-event')).forEach(function (ev) {
      var st = (/status-([a-z]+)/.exec(ev.className) || [])[1];
      if (st && !ev.querySelector('.ped-pill')) {
        var pill = document.createElement('em'); pill.className = 'ped-pill'; pill.textContent = STATUS[st] || st; ev.append(pill);
      }
      var sel = cal.dataset.pedChannel;
      ev.classList.toggle('ped-dim', !!sel && ev.dataset.channel !== sel);
      if (ev.dataset.channel && !ev.querySelector('.ped-ch')) {
        var ch = document.createElement('i'); ch.className = 'ped-ch'; ch.setAttribute('aria-hidden', 'true'); ev.prepend(ch);
      }
    });
    // Today's column in every view; the month starts under its weekday.
    var today = todayLabel().toLowerCase();
    [].slice.call(cal.querySelectorAll('.calendar-column')).forEach(function (col, i) {
      var head = ((col.querySelector('h3') || {}).textContent || '').toLowerCase();
      col.classList.toggle('ped-today', !!today && head === today);
      col.classList.toggle('ped-empty', !col.querySelector('.calendar-event'));
      if (i === 0) col.style.gridColumnStart = /view-month/.test(cal.className) ? String(WD[head.slice(0, 3)] || 1) : '';
    });
    if (timed) layoutGrid(); else clearGrid();
    busy = false;
  }
  function clearGrid() {
    [].slice.call(cal.querySelectorAll('.ped-allday')).forEach(function (n) { var col = n.parentElement; [].slice.call(n.children).forEach(function (c) { col.append(c); }); n.remove(); });
    [].slice.call(cal.querySelectorAll('.ped-hours,.ped-now')).forEach(function (n) { n.remove(); });
    cal.style.removeProperty('--ped-allday');
    [].slice.call(cal.querySelectorAll('.calendar-event')).forEach(function (ev) { ev.style.removeProperty('top'); ev.style.removeProperty('height'); ev.style.removeProperty('left'); ev.style.removeProperty('width'); delete ev.dataset.pedTop; });
  }
  function layoutGrid() {
    if (!cal.querySelector('.ped-hours')) {
      var hours = document.createElement('div'); hours.className = 'ped-hours'; hours.setAttribute('aria-hidden', 'true');
      var corner = document.createElement('i'); corner.className = 'ped-corner'; corner.textContent = 'Senza orario'; hours.append(corner);
      for (var h = H0; h < H1; h++) { var s = document.createElement('span'); s.textContent = (h < 10 ? '0' : '') + h + ':00'; hours.append(s); }
      cal.prepend(hours);
    }
    var today = todayLabel().toLowerCase();
    [].slice.call(cal.querySelectorAll('.calendar-column')).forEach(function (col) {
      var evs = [].slice.call(col.querySelectorAll('.calendar-event'));
      var items = evs.map(function (ev) { var t = ev.querySelector('small'); return { ev: ev, m: minutes(t && t.textContent) }; });
      // Contents without a time sit in a strip above the grid.
      var undated = items.filter(function (x) { return x.m == null; });
      var strip = col.querySelector('.ped-allday');
      if (undated.length) {
        if (!strip) { strip = document.createElement('div'); strip.className = 'ped-allday'; col.querySelector('h3').after(strip); }
        undated.forEach(function (x) { strip.append(x.ev); });
      } else if (strip) strip.remove();
      // Timed contents: one hour each, side by side when they overlap.
      var timed = items.filter(function (x) { return x.m != null; }).sort(function (a, b) { return a.m - b.m; });
      var lanes = [];
      timed.forEach(function (x) {
        var m = Math.min(Math.max(x.m, H0 * 60), H1 * 60 - 30);
        x.top = (m - H0 * 60) / 60 * ROW; x.end = x.top + ROW;
        var lane = 0; while (lanes[lane] != null && lanes[lane] > x.top + 1) lane++;
        lanes[lane] = x.end; x.lane = lane;
      });
      timed.forEach(function (x) {
        var over = timed.filter(function (y) { return y.top < x.end - 1 && y.end > x.top + 1; });
        var n = Math.max.apply(null, over.map(function (y) { return y.lane; })) + 1;
        // Narrow day columns stack overlapping contents inside the hour instead of splitting it into slivers.
        var stack = n > 1 && col.clientWidth < 240, h = stack ? ROW / n : ROW, base = Math.min.apply(null, over.map(function (y) { return y.top; })), top = stack ? base + x.lane * h : x.top;
        x.ev.dataset.pedTop = top; x.ev.style.top = 'calc(var(--ped-off) + ' + top + 'px)'; x.ev.style.height = (h - 6) + 'px';
        x.ev.classList.toggle('ped-compact', stack);
        x.ev.style.left = stack ? '3px' : 'calc(' + (x.lane / n * 100) + '% + 3px)'; x.ev.style.width = stack ? 'calc(100% - 6px)' : 'calc(' + (100 / n) + '% - 6px)';
      });
      var empty = col.querySelector('.calendar-empty'); if (empty) empty.hidden = true;
      var head = (col.querySelector('h3') || {}).textContent || '';
      col.classList.toggle('ped-today', !!today && head.toLowerCase() === today);
      var line = col.querySelector('.ped-now');
      if (col.classList.contains('ped-today')) {
        var nm = nowMinutes();
        if (nm != null && nm >= H0 * 60 && nm <= H1 * 60) {
          if (!line) { line = document.createElement('div'); line.className = 'ped-now'; col.append(line); }
          line.style.top = 'calc(var(--ped-off) + ' + ((nm - H0 * 60) / 60 * ROW) + 'px)';
          line.dataset.time = (Math.floor(nm / 60) < 10 ? '0' : '') + Math.floor(nm / 60) + ':' + ((nm % 60) < 10 ? '0' : '') + (nm % 60);
        } else if (line) line.remove();
      } else if (line) line.remove();
    });
    // Undated strips share one height so the hour rows line up across the days.
    var strips = [].slice.call(cal.querySelectorAll('.ped-allday'));
    strips.forEach(function (s) { s.style.minHeight = '0'; });
    var hMax = strips.reduce(function (m, s) { return Math.max(m, s.offsetHeight); }, 0);
    strips.forEach(function (s) { s.style.minHeight = hMax + 'px'; });
    cal.style.setProperty('--ped-allday', hMax + 'px');
    cal.classList.toggle('ped-has-allday', hMax > 0);
    // Scroll the grid to the first content (or to the current hour) once per render.
    var tops = [].slice.call(cal.querySelectorAll('.calendar-event[data-ped-top]')).map(function (e) { return +e.dataset.pedTop; });
    var y = tops.length ? Math.min.apply(null, tops) : ((nowMinutes() || 9 * 60) - H0 * 60) / 60 * ROW;
    cal.scrollTop = Math.max(0, y - ROW * 0.6);
    // Phones show one day at a time: start on today when it is in the week.
    var tcol = cal.querySelector('.calendar-column.ped-today'), gut = cal.querySelector('.ped-hours');
    if (tcol && cal.scrollWidth > cal.clientWidth + 4) cal.scrollLeft = tcol.offsetLeft - (gut ? gut.offsetWidth : 0);
  }

  // Left rail as in the mockup: page sections, channels (highlight in the calendar), the team's projects.
  function rail() {
    if (page.querySelector('.ped-rail')) return;
    var r = document.createElement('nav'); r.className = 'ped-rail'; r.setAttribute('aria-label', 'Piano editoriale');
    function sect(label) { var p = document.createElement('p'); p.className = 'ped-rail-label'; p.textContent = label; r.append(p); }
    function a(text, href, ic, onclick) {
      var x = document.createElement('a'); x.href = href; x.className = 'ped-rail-link'; x.dataset.ic = ic;
      var L = window.RadixMarketingLook, icons = { overview: 'layers', calendar: 'calendar', library: 'folder', analytics: 'check', results: 'chart' };
      if (L && icons[ic]) { x.insertAdjacentHTML('afterbegin', L.svg(icons[ic], 'ml-ico')); x.classList.add('has-ico'); }
      var s = document.createElement('span'); s.textContent = text; x.append(s);
      if (onclick) x.addEventListener('click', onclick);
      r.append(x); return x;
    }
    // The four entries switch what the page shows (html[data-ped-section]); the calendar is the default.
    function show(section) { return function (e) { e.preventDefault(); setSection(section); }; }
    a('Overview', '#metrics', 'overview', show('overview')).dataset.section = 'overview';
    a('Calendario', '#calendar', 'calendar', show('calendar')).dataset.section = 'calendar';
    a('Libreria contenuti', '#board', 'library', show('library')).dataset.section = 'library';
    a('Analytics', '#analytics', 'analytics', show('analytics')).dataset.section = 'analytics';
    a('Risultati', '#results', 'results', show('results')).dataset.section = 'results';
    sect('Canali');
    var chBox = document.createElement('div'); chBox.className = 'ped-rail-channels'; r.append(chBox);
    sect('Progetti');
    var prBox = document.createElement('div'); prBox.className = 'ped-rail-projects'; r.append(prBox);
    page.prepend(r);
    page.classList.add('ped-has-rail');
    fillProjects(prBox);
  }
  function setSection(section) {
    root.dataset.pedSection = section;
    [].slice.call(page.querySelectorAll('.ped-rail-link[data-section]')).forEach(function (x) { if (x.dataset.section === section) x.setAttribute('aria-current', 'true'); else x.removeAttribute('aria-current'); });
    var an = document.getElementById('analytics'); if (section === 'analytics' && an && an.tagName === 'DETAILS') an.open = true;
    var rs = document.getElementById('results'); if (section === 'results' && rs && rs.tagName === 'DETAILS') rs.open = true;
    if (section === 'calendar') later();
    window.scrollTo({ top: 0 });
  }
  function fillChannels() {
    var box = page.querySelector('.ped-rail-channels'); if (!box) return;
    // One entry per channel slug (the same slug editorial-workspace.js writes on each calendar card).
    var slugOf = (window.RadixPedViews && window.RadixPedViews.channelSlug) || function (v) { return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
    var names = {};
    [].slice.call(document.querySelectorAll('#channel option')).forEach(function (o) { var k = o.value !== 'all' && slugOf(o.value); if (k && !names[k]) names[k] = o.textContent; });
    [].slice.call(cal.querySelectorAll('.calendar-event[data-channel]')).forEach(function (ev) {
      var slug = ev.dataset.channel; if (names[slug]) return;
      var label = (ev.querySelector('span') || {}).textContent || slug; names[slug] = label.split(' · ')[0];
    });
    var keys = Object.keys(names).map(function (k) { return { k: k, slug: k }; });
    var sig = keys.map(function (x) { return x.slug; }).join(',');
    if (box.dataset.sig === sig) return; box.dataset.sig = sig; box.textContent = '';
    keys.forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ped-rail-link ped-rail-ch'; b.dataset.channel = x.slug;
      b.setAttribute('aria-pressed', String(cal.dataset.pedChannel === x.slug));
      var s = document.createElement('span'); s.textContent = names[x.k]; b.append(s);
      var n = cal.querySelectorAll('.calendar-event[data-channel="' + x.slug + '"]').length;
      if (n) { var c = document.createElement('b'); c.textContent = n; b.append(c); }
      b.onclick = function () {
        var on = cal.dataset.pedChannel === x.slug;
        if (on) delete cal.dataset.pedChannel; else cal.dataset.pedChannel = x.slug;
        [].slice.call(box.querySelectorAll('button')).forEach(function (y) { y.setAttribute('aria-pressed', String(!on && y === b)); });
        [].slice.call(cal.querySelectorAll('.calendar-event')).forEach(function (ev) { ev.classList.toggle('ped-dim', !on && ev.dataset.channel !== x.slug); });
        // «Risultati» follows the same chip: its numbers narrow to this channel (or widen back to all).
        try { window.dispatchEvent(new CustomEvent('ped:channel', { detail: { slug: on ? '' : x.slug } })); } catch (e) {}
      };
      box.append(b);
    });
  }
  function fillProjects(box) {
    var W = window.RadixWorkspace; if (!W || !W.projects || !W.projects.list) return;
    var cur = new URLSearchParams(location.search).get('project') || '';
    Promise.resolve(W.ready ? W.ready() : null).then(function () { return W.projects.list(); }).then(function (list) {
      (list || []).filter(function (p) { return p.status !== 'archived'; }).slice(0, 8).forEach(function (p) {
        var x = document.createElement('a'); x.className = 'ped-rail-link ped-rail-project'; x.href = '/project-editorial.html?project=' + encodeURIComponent(p.id) + '#ped';
        var s = document.createElement('span'); s.textContent = p.name || p.id; x.append(s);
        if (p.id === cur) x.setAttribute('aria-current', 'page');
        box.append(x);
      });
    }).catch(function () {});
  }

  var timer = 0;
  function later() { if (busy) return; clearTimeout(timer); timer = setTimeout(function () { decorate(); fillChannels(); }, 30); }
  new MutationObserver(later).observe(cal, { childList: true, attributes: true, attributeFilter: ['class'] });
  if (phone.addEventListener) phone.addEventListener('change', later);
  var tzSel = document.getElementById('timezone'); if (tzSel) tzSel.addEventListener('change', later);
  setInterval(function () { if (root.classList.contains('ped-grid')) later(); }, 60000);
  rail();
  // #results (the Marketing Orbit «Risultati» link) opens the Risultati section; otherwise the calendar.
  setSection(location.hash === '#results' ? 'results' : 'calendar');
  later();
})();
