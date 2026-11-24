#!/usr/bin/env node
/* Runs the precision test bench and prints the score per engine. It spends API credits: run it only when
   asked. Two ways:
     ANTHROPIC_API_KEY=... node tools/engine-bench/run.js            (calls the chat handler in this checkout)
     RADIX_URL=https://<preview> RADIX_COOKIE='<session cookie>' node tools/engine-bench/run.js
   --engine=new | legacy | both (default both), --only=id1,id2 to run some cases. */
'use strict';
const { CASES, score, summary } = require('./cases');

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const engines = arg('engine', 'both') === 'both' ? ['legacy', 'new'] : [arg('engine')];
const only = arg('only', '') ? arg('only').split(',') : null;

async function local(body) {
  require('../../api/_auth').getSessionUser = () => ({ uid: 'bench' });
  const chat = require('../../api/chat.js');
  let out, code = 200;
  const res = { status(c) { code = c; return this; }, json(b) { out = b; return this; }, setHeader() {} };
  await chat({ method: 'POST', headers: {}, body }, res);
  if (code !== 200) throw new Error((out && out.error) || 'HTTP ' + code);
  return out;
}

async function remote(body) {
  const r = await fetch(process.env.RADIX_URL.replace(/\/$/, '') + '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: process.env.RADIX_COOKIE }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
}

(async () => {
  const call = process.env.RADIX_URL ? remote : local;
  if (!process.env.RADIX_URL && !process.env.ANTHROPIC_API_KEY) { console.error('Serve ANTHROPIC_API_KEY oppure RADIX_URL + RADIX_COOKIE.'); process.exit(2); }
  const cases = CASES.filter((c) => !only || only.includes(c.id));
  for (const engine of engines) {
    const results = [];
    let input = 0, output = 0;
    for (const c of cases) {
      try {
        const r = await call({ role: c.role, project: c.project, engine: engine === 'legacy' ? 'legacy' : undefined, messages: [{ role: 'user', content: c.ask }] });
        const s = score(c, r.text || r.reply || '');
        if (r.usage) { input += r.usage.input_tokens || 0; output += r.usage.output_tokens || 0; }
        results.push(s);
        console.log((s.ok ? 'OK  ' : 'NO  ') + engine.padEnd(7) + c.id + (s.ok ? '' : '  → ' + s.fails.join('; ')));
      } catch (e) {
        results.push({ id: c.id, ok: false, fails: [e.message] });
        console.log('ERR ' + engine.padEnd(7) + c.id + '  → ' + e.message);
      }
    }
    const t = summary(results);
    console.log(`== ${engine}: ${t.ok}/${t.total} giusti (${t.pct}%), token in ${input}, out ${output}\n`);
  }
})();
