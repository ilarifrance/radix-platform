const test = require('node:test');
const assert = require('node:assert');
const { imageRequest } = require('../api/_openai-image.js');

test('current image model by default, 4:5 portrait, medium for drafts and high for final images', () => {
  const d = imageRequest({ prompt: 'ufficio' }, {});
  assert.equal(d.endpoint, 'generations');
  assert.deepEqual(d.payload, { model: 'gpt-image-2', prompt: 'ufficio', size: '1088x1360', quality: 'medium', n: 1 });
  assert.equal(imageRequest({ prompt: 'x', final: true }, {}).payload.quality, 'high');
  assert.equal(imageRequest({ prompt: 'x', shape: 'square' }, {}).payload.size, '1024x1024');
});

test('the previous model keeps its own sizes', () => {
  const d = imageRequest({ prompt: 'x' }, { OPENAI_IMAGE_MODEL: 'gpt-image-1' });
  assert.equal(d.payload.model, 'gpt-image-1');
  assert.equal(d.payload.size, '1024x1536');
});

test('reference images go to the edits endpoint, only from RADIX storage or data URLs', () => {
  const ok = imageRequest({ prompt: 'x', references: ['data:image/png;base64,AAAA', 'https://abc123.public.blob.vercel-storage.com/m.png', 'https://evil.example/x.png'] }, {});
  assert.equal(ok.endpoint, 'edits');
  assert.deepEqual(ok.payload.images, [{ image_url: 'data:image/png;base64,AAAA' }, { image_url: 'https://abc123.public.blob.vercel-storage.com/m.png' }]);
  assert.match(imageRequest({ prompt: 'x', references: ['http://169.254.169.254/'] }, {}).error, /riferimento/);
  assert.match(imageRequest({}, {}).error, /prompt/);
});

test('a key without access to the current model still gets an image from the previous one', async () => {
  require('../api/_auth').getSessionUser = () => ({ uid: 'u1' });
  delete require.cache[require.resolve('../api/_openai-image.js')];
  const handler = require('../api/_openai-image.js');
  const sent = [], realFetch = global.fetch, key = process.env.OPENAI_API_KEY;
  const reply = (ok, status, body) => ({ ok, status, json: async () => body, clone() { return this; } });
  const queue = [reply(false, 403, { error: { message: 'Your organization must be verified to use the model gpt-image-2' } }), reply(true, 200, { data: [{ b64_json: 'QUJD' }] })];
  global.fetch = async (url, o) => { sent.push({ url, body: JSON.parse(o.body) }); return queue.shift(); };
  process.env.OPENAI_API_KEY = 'test';
  let out;
  try {
    await handler({ method: 'POST', headers: {}, body: { prompt: 'x' } }, { status() { return this; }, json(b) { out = b; return this; } });
    assert.equal(sent[0].body.model, 'gpt-image-2');
    assert.equal(sent[1].body.model, 'gpt-image-1');
    assert.equal(sent[1].body.size, '1024x1536');
    assert.equal(out.image, 'data:image/png;base64,QUJD');
  } finally {
    global.fetch = realFetch;
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
  }
});
