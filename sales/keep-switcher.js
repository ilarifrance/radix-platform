'use strict';
/* Selettori di vista (Schede / Tabella / Foglio chiamate, schede e filtri a pulsanti): quando si cambia vista la nuova
   può avere un'altezza diversa e la pagina restava dov'era, così i pulsanti finivano fuori schermo e per tornare
   indietro bisognava scorrere fino in fondo alla lista (23/11, Francesco). Qui, una volta sola per tutte le pagine Sales:
   dopo il clic il gruppo di pulsanti torna alla stessa altezza di prima sullo schermo, quindi la scelta resta sempre lì.
   Solo scorrimento della pagina; non cambia dati né contenuti. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') api.install(document, root);
})(typeof self !== 'undefined' ? self : this, function () {
  // Pulsanti che cambiano vista: stato premuto, schede, selettori con data-mode/-tab/-view.
  const SWITCH = 'button[aria-pressed],[role="tab"],button[data-mode],button[data-tab],button[data-view]';
  // Di quanto scorrere perché il gruppo torni dov'era (prima e dopo: distanza dal bordo alto dello schermo).
  function delta(before, after) {
    if (!Number.isFinite(before) || !Number.isFinite(after)) return 0;
    const d = after - before;
    return Math.abs(d) < 2 ? 0 : d;
  }
  function install(doc, win) {
    doc.addEventListener('click', function (e) {
      const b = e.target && e.target.closest && e.target.closest(SWITCH);
      const group = b && b.parentElement;
      if (!group || !group.getBoundingClientRect) return;
      const before = group.getBoundingClientRect().top;
      // Dopo che la pagina ha ridisegnato la vista (due fotogrammi). Se il gruppo è stato sostituito non facciamo nulla.
      win.requestAnimationFrame(function () { win.requestAnimationFrame(function () {
        if (!group.isConnected) return;
        const d = delta(before, group.getBoundingClientRect().top);
        if (d) win.scrollBy(0, d);
      }); });
    }, true);
  }
  return { SWITCH, delta, install };
});
