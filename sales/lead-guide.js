'use strict';
/* Lead Intelligence «Percorso guidato» (rules in sales/lead-guide-core.js): a card under the page title with the next step
   and the state of every source and email service for the workspace chosen in #archive-workspace. Read only: it reads
   /api/sales and opens the page's own steps (the [data-go-step] buttons of sales/lead-flow.js); it never starts a search.
   With the «Base» plan of Sales Orbis the reads answer 403 and the card stays hidden. */
(function () {
  var G = window.RadixLeadGuide, flow = document.getElementById('lead-flow');
  if (!G || !flow) return;
  var ws = document.getElementById('archive-workspace');
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var box = document.createElement('details'); box.className = 'lf-guide'; box.id = 'lf-guide'; box.hidden = true;
  // Open on wide screens; on a phone the summary line stays, one tap away.
  box.open = !window.matchMedia || window.matchMedia('(min-width: 761px)').matches;
  var head = flow.querySelector('.lf-head'); if (head) head.after(box); else flow.prepend(box);
  var gen = 0;
  function el(tag, text, cls) { var n = document.createElement(tag); if (text != null) n.textContent = String(text); if (cls) n.className = cls; return n; }
  function get(params) {
    return fetch('/api/sales?' + new URLSearchParams(params), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); });
  }
  function open(step) {
    if (step.href) { location.href = step.href; return; }
    var b = document.querySelector('[data-go-step="' + step.go + '"]'); if (b) b.click();
  }
  function render(d) {
    var list = G.steps(d), nx = G.next(list);
    box.replaceChildren();
    var sum = el('summary', null, 'lf-guide-sum');
    sum.append(el('span', 'Percorso guidato', 'lf-guide-title'), el('span', G.summary(list), 'lf-guide-count'));
    box.append(sum);
    var body = el('div', null, 'lf-guide-body');
    var ol = el('ol', null, 'lf-guide-steps');
    list.forEach(function (s) {
      var li = el('li', null, 'lf-guide-step' + (s.done ? ' is-done' : '') + (nx === s ? ' is-next' : ''));
      var mark = el('span', s.done ? '✓' : '', 'lf-guide-mark'); mark.setAttribute('aria-hidden', 'true');
      var txt = el('div'); txt.append(el('strong', s.title), el('p', s.text));
      var go = el('button', s.done ? 'Apri' : nx === s ? 'Inizia da qui' : 'Apri', nx === s ? 'lf-guide-go primary' : 'lf-guide-go');
      go.type = 'button'; go.addEventListener('click', function () { open(s); });
      if (s.done) { var sr = el('span', 'Fatto', 'lf-sr'); txt.prepend(sr); }
      li.append(mark, txt, go); ol.append(li);
    });
    var src = el('div', null, 'lf-guide-sources');
    src.append(el('h3', 'Fonti e servizi'));
    var ul = el('ul');
    G.sources(d).forEach(function (s) {
      var li = el('li'); var st = el('span', s.state, 'lf-guide-state is-' + s.state.replace(/\s+/g, '-'));
      var t = el('div'); t.append(el('span', s.label)); if (s.note) t.append(el('small', s.note));
      li.append(t, st); ul.append(li);
    });
    src.append(ul);
    body.append(ol, src); box.append(body);
    box.hidden = false;
  }
  function load() {
    var w = ws && UUID.test(ws.value) ? ws.value : '';
    var my = ++gen;
    if (!w) { box.hidden = true; return; }
    Promise.all([
      get({ entity: 'lead_lists', workspace: w, offset: '0' }),
      get({ entity: 'leads', workspace: w, offset: '0', limit: '1' }),
      get({ entity: 'email_finder', workspace: w }).catch(function () { return null; }),
      get({ entity: 'lead_provider_status', workspace: w }).catch(function () { return null; })
    ]).then(function (r) {
      if (my !== gen) return;
      var finder = r[2] && r[2].rows && r[2].rows[0];
      render({ lists: (r[0].rows || []).length, crmLeads: (r[1].rows || []).length, chain: finder ? finder.chain : [], provider: r[3] });
    }, function () { if (my === gen) box.hidden = true; });
  }
  if (ws) {
    ws.addEventListener('change', load);
    // lead-archive.js fills the picker after the page loads: wait for its first real workspace.
    new MutationObserver(function () { if (UUID.test(ws.value) && !box.dataset.started) { box.dataset.started = '1'; load(); } }).observe(ws, { childList: true, attributes: true });
    if (UUID.test(ws.value)) { box.dataset.started = '1'; load(); }
  }
})();
