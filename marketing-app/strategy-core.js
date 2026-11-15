/* RADIX Marketing (prodotto separato): logica pura del percorso
   progetto guidato -> analisi -> strategia per piano.
   AI FINTA e deterministica: nessuna chiamata esterna, nessun credito. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MktCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PLANS = {
    base:     { id: 'base',     label: 'Base',     strategies: 1, channels: 2, perf: false, loop: false, credits: 60 },
    medio:    { id: 'medio',    label: 'Medio',    strategies: 2, channels: 4, perf: true,  loop: false, credits: 200 },
    avanzato: { id: 'avanzato', label: 'Avanzato', strategies: 2, channels: 6, perf: true,  loop: true,  credits: 500 }
  };

  var STEPS = [
    { id: 'azienda',  title: 'La tua attivita', fields: [
      { id: 'nome', label: 'Nome del progetto o dell\'azienda', required: true },
      { id: 'settore', label: 'Settore', required: true, options: ['Ristorazione', 'Servizi professionali', 'Negozio / e-commerce', 'Software / startup', 'Benessere e salute', 'Altro'] },
      { id: 'cosa', label: 'Cosa vendi, in una frase', required: true }] },
    { id: 'obiettivo', title: 'Dove vuoi arrivare', fields: [
      { id: 'obiettivo', label: 'Obiettivo principale', required: true, options: ['Farmi conoscere', 'Ricevere contatti', 'Vendere online', 'Fidelizzare i clienti'] },
      { id: 'orizzonte', label: 'In quanto tempo', required: true, options: ['3 mesi', '6 mesi', '12 mesi'] }] },
    { id: 'pubblico', title: 'A chi parli', fields: [
      { id: 'pubblico', label: 'Il cliente ideale', required: true },
      { id: 'mercato', label: 'Dove si trova', required: true, options: ['Citta', 'Italia', 'Europa', 'Internazionale'] }] },
    { id: 'stato', title: 'Da dove parti', fields: [
      { id: 'canali', label: 'Canali che usi gia', required: false, multi: true, options: ['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'YouTube', 'Sito', 'Newsletter'] },
      { id: 'concorrenti', label: 'Due concorrenti che conosci', required: false },
      { id: 'budget', label: 'Budget mensile per annunci', required: true, options: ['0', 'fino a 300 euro', '300-1000 euro', 'oltre 1000 euro'] }] }
  ];

  function validate(brief, stepId) {
    var errors = [];
    STEPS.forEach(function (s) {
      if (stepId && s.id !== stepId) return;
      s.fields.forEach(function (f) {
        var v = brief && brief[f.id];
        if (f.required && (v == null || String(v).trim() === '' || (Array.isArray(v) && !v.length))) errors.push({ field: f.id, message: 'Manca: ' + f.label });
        if (v && f.options && !f.multi && f.options.indexOf(v) < 0) errors.push({ field: f.id, message: 'Valore non valido: ' + f.label });
      });
    });
    return errors;
  }

  // Ogni affermazione dell'analisi dice da dove viene: cliente (scritto da lui) o stimato.
  function fact(text, source) { return { text: text, source: source }; }

  var CHANNEL_FIT = {
    'Ristorazione': { Instagram: 90, TikTok: 75, Facebook: 65, YouTube: 35, LinkedIn: 15, Newsletter: 40 },
    'Servizi professionali': { LinkedIn: 90, Newsletter: 70, YouTube: 45, Instagram: 40, Facebook: 40, TikTok: 20 },
    'Negozio / e-commerce': { Instagram: 85, TikTok: 75, Facebook: 70, Newsletter: 65, YouTube: 50, LinkedIn: 15 },
    'Software / startup': { LinkedIn: 85, YouTube: 70, Newsletter: 65, TikTok: 40, Instagram: 40, Facebook: 20 },
    'Benessere e salute': { Instagram: 85, TikTok: 65, Facebook: 60, YouTube: 55, Newsletter: 40, LinkedIn: 20 },
    'Altro': { Instagram: 65, LinkedIn: 55, Facebook: 55, Newsletter: 50, TikTok: 45, YouTube: 45 }
  };

  function analyze(brief) {
    var errs = validate(brief);
    if (errs.length) throw new Error(errs[0].message);
    var fit = CHANNEL_FIT[brief.settore] || CHANNEL_FIT.Altro;
    var used = brief.canali || [];
    var ranking = Object.keys(fit).map(function (c) { return { channel: c, fit: fit[c], inUse: used.indexOf(c) >= 0 }; })
      .sort(function (a, b) { return b.fit - a.fit || a.channel.localeCompare(b.channel); });
    var conc = String(brief.concorrenti || '').split(/[,;\n]/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 2);
    var strengths = [fact('Offerta: ' + brief.cosa, 'cliente'), fact('Pubblico: ' + brief.pubblico, 'cliente')];
    var gaps = ranking.filter(function (r) { return r.fit >= 60 && !r.inUse; }).map(function (r) { return fact('Canale adatto al settore non ancora presidiato: ' + r.channel, 'stimato'); });
    var risks = [];
    if (brief.budget === '0') risks.push(fact('Senza budget per annunci la crescita dipende dai contenuti organici: servono 3-6 mesi per vedere risultati', 'stimato'));
    if (!used.length) risks.push(fact('Nessun canale attivo: si parte da zero, serve prima l\'identita di base', 'cliente'));
    if (!conc.length) risks.push(fact('Concorrenti non indicati: il confronto resta generico finche non li aggiungi', 'cliente'));
    return {
      summary: brief.nome + ': ' + brief.obiettivo.toLowerCase() + ' in ' + brief.orizzonte + ', mercato ' + brief.mercato.toLowerCase() + '.',
      strengths: strengths, gaps: gaps, risks: risks, competitors: conc, ranking: ranking,
      note: 'Analisi con dati finti di prova: i punteggi dei canali sono stime di settore, non misure.'
    };
  }

  var CADENCE = { Instagram: 4, TikTok: 3, Facebook: 3, LinkedIn: 3, YouTube: 1, Newsletter: 1 };

  function channelsFor(analysis, plan, aggressive) {
    var n = plan.channels;
    var list = analysis.ranking.slice(0, n).map(function (r) {
      var per = CADENCE[r.channel] || 2;
      return { channel: r.channel, postsPerWeek: aggressive ? per + 1 : per };
    });
    return list;
  }

  function roadmap(brief, aggressive) {
    var base = [
      { weeks: '1-2', what: 'Identita e profili in ordine, scheda fatti compilata' },
      { weeks: '3-6', what: 'Piano editoriale in uscita, primo ciclo di contenuti' },
      { weeks: '7-12', what: 'Misura cosa funziona e rafforza i formati migliori' }];
    if (aggressive) base.splice(2, 0, { weeks: '5-8', what: 'Test A/B su titoli e immagini, una campagna a obiettivo' });
    return base;
  }

  function kpis(brief) {
    var map = { 'Farmi conoscere': ['Copertura mensile', 'Nuovi follower', 'Visite al sito'],
      'Ricevere contatti': ['Contatti ricevuti', 'Costo per contatto', 'Visite al sito'],
      'Vendere online': ['Ordini', 'Tasso di conversione', 'Ricavi da canali social'],
      'Fidelizzare i clienti': ['Iscritti newsletter', 'Clienti che tornano', 'Interazioni'] };
    return map[brief.obiettivo];
  }

  function strategies(brief, planId) {
    var plan = PLANS[planId];
    if (!plan) throw new Error('Piano sconosciuto: ' + planId);
    var an = analyze(brief);
    var out = [{
      id: 'standard', label: 'Strategia consigliata', aggressive: false,
      idea: 'Presenza costante e coerente sui canali piu adatti, per ' + brief.obiettivo.toLowerCase() + '.',
      channels: channelsFor(an, plan, false), kpis: kpis(brief), roadmap: roadmap(brief, false)
    }];
    if (plan.perf) out.push({
      id: 'performante', label: 'Variante piu performante', aggressive: true,
      idea: 'Piu uscite, test sui contenuti e una campagna a obiettivo: piu ambiziosa, richiede piu crediti e piu attenzione.',
      channels: channelsFor(an, plan, true), kpis: kpis(brief), roadmap: roadmap(brief, true)
    });
    out.forEach(function (s) {
      var posts = s.channels.reduce(function (t, c) { return t + c.postsPerWeek; }, 0);
      s.postsPerMonth = posts * 4;
      s.creditsPerMonth = Math.round(s.postsPerMonth * (s.aggressive ? 2.2 : 1.6));
      s.withinPlan = s.creditsPerMonth <= plan.credits;
    });
    return { plan: plan, analysis: an, strategies: out, monthlyReview: plan.loop };
  }

  // Chat centrale: dice dove sei e qual e il prossimo passo.
  function guide(state) {
    var b = state && state.brief || {};
    for (var i = 0; i < STEPS.length; i++) {
      var errs = validate(b, STEPS[i].id);
      if (errs.length) return { stage: 'brief', step: STEPS[i].id, message: 'Passo ' + (i + 1) + ' di ' + STEPS.length + ' (' + STEPS[i].title + '). ' + errs[0].message + '.' };
    }
    if (!state.analysisSeen) return { stage: 'analysis', message: 'Brief completo. Guarda l\'analisi: cosa funziona, dove sei scoperto e i rischi.' };
    if (!state.plan) return { stage: 'plan', message: 'Scegli il piano: Base ha una strategia, Medio e Avanzato anche la variante piu performante.' };
    if (!state.chosen) return { stage: 'strategy', message: 'Confronta le strategie e scegline una. Nessun credito viene speso finche non confermi.' };
    return { stage: 'done', message: 'Strategia scelta. Il passo dopo e il piano editoriale: parte solo con la tua conferma.' };
  }

  return { PLANS: PLANS, STEPS: STEPS, validate: validate, analyze: analyze, strategies: strategies, guide: guide };
});
