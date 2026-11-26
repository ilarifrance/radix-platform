'use strict';
/* Sales Orbis top bar on the CRM page: one search over the records already loaded (aziende, contatti, opportunità, lead,
   attività) and a «+» that opens the «new» form of sales.js from any section. Nothing is read or written here: the
   search filters RadixSalesApp.rows() and every form is the one of sales.js. RADIX keeps its header as it is. */
(function () {
  var P = window.RadixCrmProduct;
  if (!P || !P.here()) return;
  var header = document.querySelector('body > header'); if (!header) return;
  var app = function () { return window.RadixSalesApp; };
  function el(tag, text, cls) { var n = document.createElement(tag); if (text != null) n.textContent = String(text); if (cls) n.className = cls; return n; }
  var KINDS = [['companies', 'Azienda'], ['contacts', 'Contatto'], ['opportunities', 'Opportunità'], ['leads', 'Lead'], ['tasks', 'Attività']];
  var NEW = [['contacts', 'Nuovo contatto'], ['companies', 'Nuova azienda'], ['opportunities', 'Nuova opportunità'], ['tasks', 'Nuova attività']];
  var MAX = 8;
  function norm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  // Pure: the first MAX records whose name, title or email contains every word typed. Names that start with the text come first.
  function find(q, rowsOf) {
    var words = norm(q).split(/\s+/).filter(Boolean), out = [];
    if (!words.length) return out;
    KINDS.forEach(function (k) {
      (rowsOf(k[0]) || []).forEach(function (r) {
        var name = r.name || r.title || '', hay = norm(name + ' ' + (r.email || '') + ' ' + (r.company_name || ''));
        if (!name || !words.every(function (w) { return hay.indexOf(w) >= 0; })) return;
        out.push({ entity: k[0], kind: k[1], row: r, name: name, first: norm(name).indexOf(words[0]) === 0 });
      });
    });
    out.sort(function (a, b) { return (b.first - a.first) || a.name.localeCompare(b.name); });
    return out.slice(0, MAX);
  }
  window.RadixCrmTopbar = { find: find };

  var box = el('div', null, 'tb-search'); box.setAttribute('role', 'search');
  var input = el('input', null, 'tb-input'); input.type = 'search'; input.id = 'tb-q'; input.autocomplete = 'off';
  input.placeholder = 'Cerca in tutto il CRM'; input.setAttribute('aria-label', 'Cerca in tutto il CRM');
  input.setAttribute('aria-controls', 'tb-results');
  var list = el('ul', null, 'tb-results'); list.id = 'tb-results'; list.hidden = true;
  box.append(input, list);

  function close() { list.hidden = true; list.replaceChildren(); }
  function open(hit) {
    var a = app(); close(); input.value = '';
    if (!a) return;
    if (location.hash !== '#' + hit.entity) location.hash = '#' + hit.entity;
    if (hit.entity === 'tasks' || hit.entity === 'leads') return;
    // The section draws on hashchange: open the record's «Scheda» once it has.
    setTimeout(function () {
      var p = a.openCustomer(hit.entity, hit.row);
      if (p && p.then) p.then(function () { var c = document.getElementById('customer360'); if (c) c.scrollIntoView({ block: 'start' }); });
    }, 150);
  }
  function draw() {
    var a = app(), hits = a ? find(input.value, function (e) { return a.rows(e); }) : [];
    list.replaceChildren();
    if (!input.value.trim()) { list.hidden = true; return; }
    if (!hits.length) { var none = el('li', 'Nessun risultato', 'tb-none'); list.append(none); list.hidden = false; return; }
    hits.forEach(function (h) {
      var li = el('li'), b = el('button', null, 'tb-hit'); b.type = 'button';
      b.append(el('span', h.name, 'tb-name'), el('small', h.kind));
      b.addEventListener('click', function () { open(h); });
      li.append(b); list.append(li);
    });
    list.hidden = false;
  }
  input.addEventListener('input', draw);
  input.addEventListener('focus', draw);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { close(); input.blur(); }
    else if (e.key === 'Enter') { var b = list.querySelector('.tb-hit'); if (b) { e.preventDefault(); b.click(); } }
    else if (e.key === 'ArrowDown') { var f = list.querySelector('.tb-hit'); if (f) { e.preventDefault(); f.focus(); } }
  });
  list.addEventListener('keydown', function (e) {
    var hits = [].slice.call(list.querySelectorAll('.tb-hit')), i = hits.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < hits.length - 1) { e.preventDefault(); hits[i + 1].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? hits[i - 1] : input).focus(); }
    else if (e.key === 'Escape') { close(); input.focus(); }
  });

  var add = el('details', null, 'tb-add');
  var sum = el('summary', '+'); sum.title = 'Crea'; sum.setAttribute('aria-label', 'Crea');
  var menu = el('div', null, 'tb-add-menu');
  NEW.forEach(function (n) {
    var b = el('button', n[1]); b.type = 'button';
    b.addEventListener('click', function () { add.open = false; var a = app(); if (a) a.edit(n[0]); });
    menu.append(b);
  });
  add.append(sum, menu);
  add.addEventListener('keydown', function (e) { if (e.key === 'Escape' && add.open) { add.open = false; sum.focus(); } });

  document.addEventListener('click', function (e) {
    if (!box.contains(e.target)) close();
    if (!add.contains(e.target)) add.open = false;
  });
  // «/» focuses the search, as long as the person is not typing somewhere.
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    e.preventDefault(); input.focus();
  });
  header.prepend(box, add);
  document.documentElement.classList.add('tb-on');
})();
