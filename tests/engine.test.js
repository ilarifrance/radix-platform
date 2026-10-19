const sysText = (s) => (typeof s === 'string' ? s : (s || []).map((b) => b.text).join(''));
const test = require('node:test');
const assert = require('node:assert');
const engine = require('../api/_engine');

const TOOLS = { search: { type: 'web_search_20250305', name: 'web_search', max_uses: 3 }, fetch: { type: 'web_fetch_20260318', name: 'web_fetch', max_uses: 5 } };

test('agents that plan or check facts use the precise level, writers the standard one', () => {
  assert.equal(engine.tierFor('strategist', {}, {}), 'precise');
  assert.equal(engine.tierFor('legal-contracts', {}, {}), 'precise');
  assert.equal(engine.tierFor('pm-planner', {}, {}), 'precise');
  assert.equal(engine.tierFor('fact-checker', {}, {}), 'precise');
  assert.equal(engine.tierFor('copywriter', {}, {}), 'standard');
  assert.equal(engine.tierFor('copywriter', { tier: 'precise' }, {}), 'precise');
  assert.equal(engine.tierFor('strategist', {}, { RADIX_ENGINE: 'legacy' }), 'legacy');
});

test('newer models: reasoning on, effort set, no temperature, room for the reasoning', () => {
  const { model, body } = engine.requestBody({ key: 'strategist', agent: { maxTokens: 6000, temperature: 0.4, system: 'S' }, messages: [{ role: 'user', content: 'ciao', extra: 1 }], env: {}, tools: TOOLS });
  assert.equal(model, engine.DEFAULTS.precise);
  assert.deepEqual(body.thinking, { type: 'adaptive' });
  assert.deepEqual(body.output_config, { effort: 'high' });
  assert.equal(body.temperature, undefined);
  assert.equal(body.max_tokens, 22000);
  assert.deepEqual(body.system, [{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }], 'instructions cached for the series of requests');
  assert.deepEqual(body.messages, [{ role: 'user', content: 'ciao' }]);
  assert.equal(body.tools[0].type, 'web_search_20260209');
  assert.equal(body.tools[1].type, 'web_fetch_20260318');
  const copy = engine.requestBody({ key: 'copywriter', agent: { maxTokens: 60000, effort: 'low' }, messages: [], env: {}, tools: TOOLS });
  assert.equal(copy.model, engine.DEFAULTS.standard);
  assert.equal(copy.body.max_tokens, 64000);
  assert.equal(copy.body.output_config.effort, 'low');
});

test('model names come from the environment when set', () => {
  const { model } = engine.requestBody({ key: 'copywriter', agent: {}, messages: [], env: { RADIX_MODEL_STANDARD: 'altro-modello' }, tools: TOOLS });
  assert.equal(model, 'altro-modello');
});

test('previous engine keeps temperature, the old search tool and the half-written reply', () => {
  const msgs = [{ role: 'user', content: 'scrivi' }, { role: 'assistant', content: 'Art. 1 ' }];
  const { body } = engine.requestBody({ key: 'strategist', agent: { maxTokens: 3000, temperature: 0.3, tools: 'search' }, messages: msgs, env: {}, tools: TOOLS, tier: 'legacy' });
  assert.equal(body.model, engine.DEFAULTS.legacy);
  assert.equal(body.temperature, 0.3);
  assert.equal(body.max_tokens, 3000);
  assert.equal(body.thinking, undefined);
  assert.deepEqual(body.tools, [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]);
  assert.deepEqual(body.messages, msgs);
});

test('a half-written reply becomes a request to continue for the newer models', () => {
  const out = engine.continuationSafe([{ role: 'user', content: 'scrivi' }, { role: 'assistant', content: 'Art. 1 testo  \n' }]);
  assert.equal(out.length, 3);
  assert.equal(out[1].content, 'Art. 1 testo');
  assert.equal(out[2].role, 'user');
  assert.equal(out[2].content, engine.CONTINUE_NOTE);
  assert.equal(engine.continuationSafe([{ role: 'user', content: 'x' }]).length, 1);
});

test('tools off stay off', () => {
  assert.equal(engine.requestBody({ key: 'x', agent: { tools: false }, messages: [], env: {}, tools: TOOLS }).body.tools, undefined);
});

// The chat handler with a fake network: the newer model declines, the previous engine answers.
test('chat falls back to the previous engine on a refusal or a rejected request', async () => {
  require('../api/_auth').getSessionUser = () => ({ uid: 'u1' });
  delete require.cache[require.resolve('../api/chat.js')];
  const chat = require('../api/chat.js');
  const sent = [];
  const replies = [
    { ok: true, status: 200, json: { content: [], stop_reason: 'refusal' } },
    { ok: true, status: 200, json: { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Risposta' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } },
    { ok: false, status: 400, json: { error: { type: 'invalid_request_error', message: 'x' } } },
    { ok: true, status: 200, json: { content: [{ type: 'text', text: 'Seconda' }], stop_reason: 'end_turn' } },
  ];
  const realFetch = global.fetch, key = process.env.ANTHROPIC_API_KEY;
  global.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); const r = replies.shift(); return { ok: r.ok, status: r.status, json: async () => r.json }; };
  process.env.ANTHROPIC_API_KEY = 'test';
  const run = async (role, engine) => {
    let out;
    const res = { status() { return this; }, json(b) { out = b; return this; }, setHeader() {} };
    await chat({ method: 'POST', headers: {}, body: { role, engine, messages: [{ role: 'user', content: 'ciao' }] } }, res);
    return out;
  };
  try {
    const a = await run('legal-contracts');
    assert.equal(sent[0].model, engine.DEFAULTS.precise);
    assert.equal(sent[1].model, engine.DEFAULTS.legacy);
    assert.equal(sent[1].thinking, undefined);
    assert.match(JSON.stringify(a), /Risposta/);
    assert.match(sysText(sent[0].system), /REGOLE DI PRECISIONE/);
    const b = await run('constructor');
    assert.equal(sent[2].model, engine.DEFAULTS.precise, 'unknown roles fall back to the strategist');
    assert.equal(sent[3].model, engine.DEFAULTS.legacy);
    assert.match(JSON.stringify(b), /Seconda/);
  } finally {
    global.fetch = realFetch;
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = key;
  }
});

test('a request can ask for the previous engine', async () => {
  require('../api/_auth').getSessionUser = () => ({ uid: 'u1' });
  const chat = require('../api/chat.js');
  const sent = [];
  const realFetch = global.fetch, key = process.env.ANTHROPIC_API_KEY;
  global.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }) }; };
  process.env.ANTHROPIC_API_KEY = 'test';
  let out;
  const res = { status() { return this; }, json(b) { out = b; return this; }, setHeader() {} };
  try {
    await chat({ method: 'POST', headers: {}, body: { role: 'strategist', engine: 'legacy', messages: [{ role: 'user', content: 'x' }] } }, res);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].model, engine.DEFAULTS.legacy);
    assert.equal(out.engine, 'legacy');
  } finally {
    global.fetch = realFetch;
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = key;
  }
});

test('agents that write about RADIX get its real feature list, others do not', async () => {
  require('../api/_auth').getSessionUser = () => ({ uid: 'u1' });
  const chat = require('../api/chat.js');
  const sent = [], realFetch = global.fetch, key = process.env.ANTHROPIC_API_KEY;
  global.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }) }; };
  process.env.ANTHROPIC_API_KEY = 'test';
  const res = { status() { return this; }, json() { return this; }, setHeader() {} };
  try {
    for (const role of ['copywriter', 'comm-email-outreach', 'legal-gdpr']) await chat({ method: 'POST', headers: {}, body: { role, messages: [{ role: 'user', content: 'x' }] } }, res);
    assert.match(sysText(sent[0].system), /STRUMENTI REALI DI RADIX/);
    assert.match(sysText(sent[1].system), /STRUMENTI REALI DI RADIX/);
    assert.doesNotMatch(sysText(sent[2].system), /STRUMENTI REALI DI RADIX/);
  } finally {
    global.fetch = realFetch;
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = key;
  }
});

test('API errors the user can act on are explained in plain words', () => {
  const { friendlyApiError } = require('../api/chat.js');
  assert.match(friendlyApiError(Object.assign(new Error('Your credit balance is too low to access the Anthropic API.'), { status: 400 })), /Credito API esaurito/);
  assert.match(friendlyApiError(Object.assign(new Error('invalid x-api-key'), { status: 401 })), /chiave API/);
  assert.match(friendlyApiError(Object.assign(new Error('Overloaded'), { status: 529 })), /sovraccarico/);
  assert.match(friendlyApiError(new Error('boom')), /^Chiamata all'API fallita: boom$/);
});
