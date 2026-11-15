(function () {
  'use strict';
  var C = window.MktCore;
  var state = { step: 0, brief: {}, analysisSeen: false, plan: null, chosen: null };
  var stage = document.getElementById('stage');
  var stepper = document.getElementById('stepper');
  var chatMsg = document.getElementById('chatMsg');
  var TITLES = ['Il progetto', 'Analisi', 'Piano', 'Strategia'];
  var view = 0; // 0 brief, 1 analisi, 2 piano, 3 strategia

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function renderStepper() {
    clear(stepper);
    TITLES.forEach(function (t, i) {
      stepper.appendChild(el('li', { 'class': i === view ? 'on' : (i < view ? 'done' : ''), text: (i + 1) + '. ' + t }));
    });
  }
  function renderChat() { chatMsg.textContent = C.guide(state).message; }

  function renderBrief() {
    var s = C.STEPS[state.step];
    clear(stage);
    stage.appendChild(el('h1', { text: s.title }));
    stage.appendChild(el('p', { 'class': 'mk-note', text: 'Passo ' + (state.step + 1) + ' di ' + C.STEPS.length }));
    s.fields.forEach(function (f) {
      var wrap = el('div', { 'class': 'mk-field' });
      wrap.appendChild(el('span', { text: f.label + (f.required ? '' : ' (facoltativo)') }));
      if (f.options) {
        var box = el('div', { 'class': 'mk-opts', role: 'group', 'aria-label': f.label });
        f.options.forEach(function (o) {
          var cur = state.brief[f.id];
          var on = f.multi ? (cur || []).indexOf(o) >= 0 : cur === o;
          var b = el('button', { type: 'button', 'class': 'mk-opt', 'aria-pressed': String(on), text: o });
          b.addEventListener('click', function () {
            if (f.multi) {
              var arr = (state.brief[f.id] || []).slice(); var i = arr.indexOf(o);
              if (i >= 0) arr.splice(i, 1); else arr.push(o);
              state.brief[f.id] = arr;
            } else state.brief[f.id] = o;
            renderBrief(); renderChat();
          });
          box.appendChild(b);
        });
        wrap.appendChild(box);
      } else {
        var inp = el('input', { type: 'text', id: 'f-' + f.id, 'aria-label': f.label });
        inp.value = state.brief[f.id] || '';
        inp.addEventListener('input', function () { state.brief[f.id] = inp.value; renderChat(); });
        wrap.appendChild(inp);
      }
      stage.appendChild(wrap);
    });
    var err = el('p', { 'class': 'mk-err', id: 'err' });
    stage.appendChild(err);
    var actions = el('div', { 'class': 'mk-actions' });
    if (state.step > 0) {
      var back = el('button', { type: 'button', 'class': 'mk-btn ghost', text: 'Indietro' });
      back.addEventListener('click', function () { state.step--; renderBrief(); renderChat(); });
      actions.appendChild(back);
    }
    var last = state.step === C.STEPS.length - 1;
    var next = el('button', { type: 'button', 'class': 'mk-btn', id: 'next', text: last ? 'Vedi l\'analisi' : 'Avanti' });
    next.addEventListener('click', function () {
      var errs = C.validate(state.brief, s.id);
      if (errs.length) { err.textContent = errs[0].message + '.'; return; }
      if (last) { view = 1; state.analysisSeen = true; render(); } else { state.step++; renderBrief(); renderChat(); }
    });
    actions.appendChild(next);
    stage.appendChild(actions);
  }

  function factList(items) {
    var ul = el('ul', { 'class': 'mk-list' });
    items.forEach(function (f) {
      ul.appendChild(el('li', {}, [el('span', { 'class': 'mk-tag ' + f.source, text: f.source }), el('span', { text: f.text })]));
    });
    return ul;
  }

  function renderAnalysis() {
    var a = C.analyze(state.brief);
    clear(stage);
    stage.appendChild(el('h1', { text: 'Analisi generale' }));
    stage.appendChild(el('p', { text: a.summary }));
    stage.appendChild(el('h3', { text: 'Da dove parti' })); stage.appendChild(factList(a.strengths));
    stage.appendChild(el('h3', { text: 'Dove sei scoperto' })); stage.appendChild(factList(a.gaps));
    stage.appendChild(el('h3', { text: 'Rischi' })); stage.appendChild(factList(a.risks));
    stage.appendChild(el('h3', { text: 'Adattamento dei canali al tuo settore' }));
    var ul = el('ul', { 'class': 'mk-list' });
    a.ranking.forEach(function (r) {
      var bar = el('div', { 'class': 'mk-bar' }, [el('i', { 'class': 'w' + (Math.round(r.fit / 5) * 5) })]);
      ul.appendChild(el('li', {}, [el('span', { text: r.channel + ' · ' + r.fit + '/100' + (r.inUse ? ' · lo usi gia' : '') }), bar]));
    });
    stage.appendChild(ul);
    stage.appendChild(el('p', { 'class': 'mk-note', text: a.note }));
    var actions = el('div', { 'class': 'mk-actions' });
    var go = el('button', { type: 'button', 'class': 'mk-btn', id: 'toPlan', text: 'Scegli il piano' });
    go.addEventListener('click', function () { view = 2; render(); });
    actions.appendChild(go); stage.appendChild(actions);
  }

  function renderPlan() {
    clear(stage);
    stage.appendChild(el('h1', { text: 'Scegli il piano' }));
    var cols = el('div', { 'class': 'mk-cols' });
    Object.keys(C.PLANS).forEach(function (id) {
      var p = C.PLANS[id];
      var card = el('div', { 'class': 'mk-card' + (state.plan === id ? ' pick' : '') }, [
        el('h3', { text: p.label }),
        el('p', { text: p.strategies + (p.strategies > 1 ? ' strategie: consigliata + variante piu performante' : ' strategia consigliata') }),
        el('p', { 'class': 'mk-note', text: 'Fino a ' + p.channels + ' canali · ' + p.credits + ' crediti al mese' + (p.loop ? ' · revisione mensile dei risultati' : '') })
      ]);
      var b = el('button', { type: 'button', 'class': 'mk-btn', 'data-plan': id, text: 'Scegli ' + p.label });
      b.addEventListener('click', function () { state.plan = id; state.chosen = null; view = 3; render(); });
      card.appendChild(b); cols.appendChild(card);
    });
    stage.appendChild(cols);
    stage.appendChild(el('p', { 'class': 'mk-note', text: 'Prezzi da definire. Nessun pagamento in questa bozza.' }));
  }

  function renderStrategy() {
    var r = C.strategies(state.brief, state.plan);
    clear(stage);
    stage.appendChild(el('h1', { text: 'Strategia · piano ' + r.plan.label }));
    var cols = el('div', { 'class': 'mk-cols' });
    r.strategies.forEach(function (s) {
      var card = el('div', { 'class': 'mk-card' + (state.chosen === s.id ? ' pick' : ''), 'data-strategy': s.id }, [
        el('h3', { text: s.label }), el('p', { text: s.idea })
      ]);
      var ch = el('ul', { 'class': 'mk-list' });
      s.channels.forEach(function (c) { ch.appendChild(el('li', { text: c.channel + ': ' + c.postsPerWeek + ' uscite a settimana' })); });
      card.appendChild(ch);
      card.appendChild(el('p', { 'class': 'mk-note', text: 'Indicatori: ' + s.kpis.join(', ') }));
      var rm = el('ul', { 'class': 'mk-list' });
      s.roadmap.forEach(function (x) { rm.appendChild(el('li', { text: 'Settimane ' + x.weeks + ': ' + x.what })); });
      card.appendChild(rm);
      card.appendChild(el('p', { 'class': 'mk-note', text: s.postsPerMonth + ' contenuti al mese · circa ' + s.creditsPerMonth + ' crediti' + (s.withinPlan ? ' (nel tuo piano)' : ' (oltre il tuo piano: servirebbe una ricarica)') }));
      var b = el('button', { type: 'button', 'class': 'mk-btn', 'data-choose': s.id, text: 'Scelgo questa' });
      b.addEventListener('click', function () { state.chosen = s.id; render(); });
      card.appendChild(b); cols.appendChild(card);
    });
    stage.appendChild(cols);
    if (r.monthlyReview) stage.appendChild(el('p', { 'class': 'mk-note', text: 'Ogni mese: misura dei risultati e nuova proposta di aggiustamento.' }));
    if (state.chosen) stage.appendChild(el('p', { id: 'done', text: 'Strategia scelta. Il piano editoriale parte solo con la tua conferma: nessun credito speso.' }));
  }

  function render() {
    renderStepper();
    if (view === 0) renderBrief(); else if (view === 1) renderAnalysis(); else if (view === 2) renderPlan(); else renderStrategy();
    renderChat();
  }
  render();
})();
