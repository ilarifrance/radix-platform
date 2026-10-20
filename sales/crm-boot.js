// radix-sales.html loading state: until the first view is on screen (html.rx-has-view, sales-views.js) the page
// shows the name of the section being opened over a light skeleton, instead of an old hero or server notes.
// Runs right after #crm-boot is parsed (not deferred), so the right title is there on the first paint.
'use strict';
(function () {
  var NAMES = { dashboard: 'Panoramica', today: 'Oggi', companies: 'Aziende', contacts: 'Contatti', tasks: 'Attività', tickets: 'Assistenza',
    calendar: 'Calendario', analytics: 'Analisi', opportunities: 'Opportunità', leads: 'Lead', interactions: 'Interazioni',
    members: 'Membri', processes: 'Processi', stages: 'Fasi' };
  var boot = document.getElementById('crm-boot');
  if (!boot) return;
  function title() {
    var h = (location.hash || '#dashboard').slice(1).split(/[?&/]/)[0];
    var t = boot.querySelector('.crm-boot-title');
    if (t) t.textContent = NAMES[h] || 'Sales';
  }
  title();
  window.addEventListener('hashchange', title);
  // The server notes (#membership, #status) are not shown while the first load runs: some views (Calendario,
  // Analisi) draw their header before the data, and the notes would sit above it as loading text.
  var root = document.documentElement, ms = document.getElementById('membership'), st = document.getElementById('status'), er = document.getElementById('error');
  if (!ms || !st) return;
  var first = ms.textContent;
  root.classList.add('crm-booting');
  function check() {
    var loading = st.textContent === 'Caricamento dal server…';
    if ((ms.textContent !== first && !loading) || (er && !er.hidden)) { root.classList.remove('crm-booting'); obs.disconnect(); }
  }
  var obs = new MutationObserver(check);
  [ms, st, er].forEach(function (n) { if (n) obs.observe(n, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }); });
})();
