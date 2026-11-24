'use strict';
/* Command Center · pannello «Oggi». Solo lettura e senza AI: legge i dati che l'utente vede già nelle altre pagine
   (CRM, percorso dei progetti, servizi collegati), li passa a RadixCcBrief e disegna una riga per area con il link
   alla pagina giusta. Non salva, non invia e non propone nulla. Il testo entra sempre come testo, mai come HTML. */
(function () {
  var B = window.RadixCcBrief, host = document.getElementById('ccBrief');
  if (!B || !host || !window.fetch) return;
  var PAGE = 100, PAGES = 5, OPTS = { credentials: 'same-origin', cache: 'no-store' };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function getJson(url) { return fetch(url, OPTS).then(function (r) { if (!r.ok) { var e = new Error(String(r.status)); e.status = r.status; throw e; } return r.json(); }); }
  // Una lista del CRM, a pagine: oltre PAGES pagine si ferma e segna l'elenco come parziale.
  function readAll(entity, workspace) {
    var all = [], capped = false;
    function next(n) {
      var q = '/api/sales?entity=' + entity + '&workspace=' + encodeURIComponent(workspace) + '&offset=' + all.length + '&limit=' + PAGE;
      return getJson(q).then(function (d) {
        var rows = Array.isArray(d.rows) ? d.rows : [], size = Number(d.limit) || PAGE;
        all = all.concat(rows);
        if (rows.length < size) return;
        if (n === PAGES - 1) { capped = true; return; }
        return next(n + 1);
      });
    }
    return next(0).then(function () { return { rows: all, capped: capped }; });
  }
  // Senza accesso o senza spazio di lavoro CRM la riga «Vendite» non compare; un errore vero viene detto.
  function readSales() {
    return getJson('/api/sales?entity=workspaces&offset=0').then(function (d) {
      var w = d && Array.isArray(d.rows) && d.rows[0];
      if (!w || !w.id) return null;
      return Promise.all([readAll('tasks', w.id), readAll('opportunities', w.id), readAll('interactions', w.id)]).then(function (r) {
        return { tasks: r[0].rows, opportunities: r[1].rows, interactions: r[2].rows, partial: r[0].capped || r[1].capped || r[2].capped };
      });
    }).catch(function (e) { return e && (e.status === 401 || e.status === 403) ? null : { error: 'CRM ' + (e && e.status || 'rete') }; });
  }
  function readItems(url, name) {
    return getJson(url).then(function (d) { return d && Array.isArray(d.items) ? { items: d.items } : null; })
      .catch(function (e) { return e && (e.status === 401 || e.status === 403) ? null : { error: name + ' ' + (e && e.status || 'rete') }; });
  }
  // Per i progetti non archiviati (al massimo MAX_PROJECTS, uno alla volta): pubblicazioni e piano del Project manager.
  // Sola lettura; un progetto senza piano o non leggibile viene saltato.
  var MAX_PROJECTS = 8;
  function readPerProject(projects) {
    if (!projects || !projects.items) return Promise.resolve({ marketing: null, pm: null });
    var live = projects.items.filter(function (p) { return p && p.id && p.status !== 'archived'; }), ids = live.slice(0, MAX_PROJECTS), pubs = [], plans = [], pubError = null;
    if (!ids.length) return Promise.resolve({ marketing: null, pm: null });
    var partial = live.length > ids.length;
    return ids.reduce(function (chain, p) {
      var q = 'projectId=' + encodeURIComponent(p.id);
      return chain.then(function () { return getJson('/api/workspace?resource=publications&' + q); })
        .then(function (d) { if (d && Array.isArray(d.items)) pubs = pubs.concat(d.items); }, function (e) { if (!e || (e.status !== 401 && e.status !== 403)) pubError = 'Pubblicazioni ' + (e && e.status || 'rete'); })
        .then(function () { return getJson('/api/workspace?resource=documents&' + q + '&module=pm'); })
        .then(function (d) { var t = d && d.data && d.data.tasks; if (Array.isArray(t)) plans.push({ id: p.id, name: p.name, tasks: t }); }, function () {});
    }, Promise.resolve()).then(function () {
      return { marketing: pubError && !pubs.length ? { error: pubError } : { publications: pubs, partial: partial }, pm: { plans: plans, partial: partial } };
    });
  }
  function draw(b) {
    var head = el('div', 'cc-brief-head');
    head.append(el('span', 'cc-brief-kicker', 'Oggi'), el('strong', 'cc-brief-title', B.headline(b)));
    var again = el('button', 'cc-brief-again', 'Aggiorna'); again.type = 'button'; again.addEventListener('click', load);
    head.append(again);
    var rows = el('div', 'cc-brief-rows');
    b.lines.forEach(function (l) {
      var a = el('a', 'cc-brief-row'); a.href = l.href; a.dataset.tone = l.tone; a.dataset.area = l.area;
      a.append(el('span', 'cc-brief-count', l.count == null ? '–' : String(l.count)), el('span', 'cc-brief-area', l.label), el('span', 'cc-brief-text', l.text), el('span', 'cc-brief-go', 'Apri'));
      rows.append(a);
    });
    host.replaceChildren(head, rows);
    host.hidden = !b.lines.length;
    host.setAttribute('aria-busy', 'false');
  }
  function load() {
    host.setAttribute('aria-busy', 'true');
    var now = new Date(), end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    var projects = readItems('/api/workspace?resource=projects&journey=1', 'Progetti');
    Promise.all([readSales(), projects, readItems('/api/integrations/status', 'Servizi'), projects.then(readPerProject)]).then(function (r) {
      draw(B.brief({ now: now.getTime(), dayEnd: end, sales: r[0], projects: r[1], integrations: r[2], marketing: r[3].marketing, pm: r[3].pm,
        today: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') }));
    }).catch(function () { host.hidden = true; });
  }
  load();
})();
