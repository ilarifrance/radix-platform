const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

test('PM agent results go through the shared fact check before they are saved', () => {
  const html = fs.readFileSync(require.resolve('../radix-pm-concept.html'), 'utf8');
  assert.match(html, /src="agency\/orchestration-core.js"/);
  const run = html.slice(html.indexOf('async function runAgent'), html.indexOf('// ---- Sotto-attività'));
  assert.match(run, /role:'fact-checker'/);
  assert.ok(run.indexOf('check.applyReview') < run.indexOf('pm.recordAgentWork'), 'corrected before saving');
  assert.match(run, /recordAgentWork\(state,id,\{agent,text,/);
});
