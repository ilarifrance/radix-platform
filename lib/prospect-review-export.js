'use strict';
/**
 * RADIX Sales Intelligence — offline CSV export of a human-review queue.
 * Accepts only a preview result, never prospects' raw personal/contact data.
 * No network, storage, CRM mutation or outreach capability.
 */
const MAX_ROWS = 250;
const HEADERS = Object.freeze([
  'indice', 'azienda_o_dominio', 'punteggio_icp', 'copertura_icp',
  'priorita', 'motivi_revisione', 'fonte', 'revisione_umana', 'stato'
]);
const PRIORITIES = new Set(['prioritize', 'investigate', 'deprioritize']);
function safeCell(value) {
  if (value === null || value === undefined) return '""';
  if (typeof value !== 'string' && typeof value !== 'number') throw new TypeError('Invalid CSV cell');
  let text = String(value).replace(/[\r\n\t]+/g, ' ').trim();
  if (text.length > 500) throw new RangeError('CSV cell too long');
  // Quoting alone does not prevent spreadsheet formula evaluation.
  if (/^[=+\-@\uFEFF]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function percentage(value, label) {
  if (value === null || value === undefined) return '';
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new RangeError(label + ' must be an integer 0–100 or null');
  }
  return value;
}
function exportProspectReviewCsv(review) {
  if (!review || typeof review !== 'object' || Array.isArray(review) ||
      review.status !== 'preview_only' || !Array.isArray(review.queue) ||
      review.canAutoSend !== false || review.canAutoSync !== false) {
    throw new TypeError('Only non-executable prospect review previews can be exported');
  }
  if (review.queue.length > MAX_ROWS) throw new RangeError('Review queue exceeds 250 rows');
  const rows = [HEADERS.map(safeCell).join(';')];
  for (const item of review.queue) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        !Number.isInteger(item.index) || item.index < 0 || item.index >= MAX_ROWS ||
        !PRIORITIES.has(item.recommendation) || !Array.isArray(item.reviewReasons) ||
        item.reviewReasons.some(reason => typeof reason !== 'string') ||
        item.humanReviewRequired !== true || item.outreachEnabled !== false ||
        item.syncEnabled !== false) {
      throw new TypeError('Invalid or non-reviewable queue item');
    }
    const values = [
      item.index + 1,
      typeof item.prospectKey === 'string' ? item.prospectKey : '',
      percentage(item.score, 'score'),
      percentage(item.coveragePercent, 'coveragePercent'),
      item.recommendation,
      item.reviewReasons.join(' | '),
      typeof item.dataProvenance === 'string' ? item.dataProvenance : '',
      'obbligatoria',
      'anteprima_non_sincronizzata'
    ];
    rows.push(values.map(safeCell).join(';'));
  }
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}
module.exports = { exportProspectReviewCsv, MAX_ROWS };
