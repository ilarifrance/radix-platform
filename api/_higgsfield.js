'use strict';
// Vercel serverless function: genera immagini con l'API di Higgsfield (modello Soul, testo → immagine)
// per Agency e PED. La chiave resta sul server: HIGGSFIELD_API_KEY nelle variabili d'ambiente Vercel.
// Higgsfield autentica con «Authorization: Key ID:SECRET». La console può dare un solo valore già
// nella forma ID:SECRET, oppure i due pezzi separati: in quel caso HIGGSFIELD_API_SECRET tiene il secondo.
// L'API a consumo ha un saldo proprio, separato dai crediti dell'app: ogni generazione costa.
//
// Azioni:
//   POST { action:'generate', prompt, aspectRatio, requestKey } -> { requestId, status }
//   GET  ?action=status&id=<request_id>                         -> { status, images:[url], error }
//   GET  ?action=image&id=<request_id>                          -> the first image's bytes (for the canvas)
// «image» lets the page compose the photo with the project's style guide: the CDN may not allow
// cross-origin reads, so the server fetches the image of a request it can verify, never a URL from the page.
// Ogni generazione parte solo da un clic con conferma nella pagina; requestKey (UUID) evita doppioni
// se la stessa richiesta viene ripetuta dopo un timeout.

const auth = require('./_auth');

const BASE = 'https://api.higgsfield.ai';
const DEFAULT_MODEL = 'higgsfield-ai/soul/standard';
const ASPECT_RATIOS = Object.freeze(['1:1', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '16:9', '9:16', '21:9']);
const DONE = Object.freeze(['completed', 'failed', 'nsfw', 'canceled']);
const MAX_PROMPT = 2000;
const IMAGE_MAX = 4000000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function credentials(env) {
  const key = String(env.HIGGSFIELD_API_KEY || '').trim();
  if (!key) return '';
  const secret = String(env.HIGGSFIELD_API_SECRET || '').trim();
  return key.includes(':') || !secret ? key : key + ':' + secret;
}

function modelPath(env) {
  const m = String(env.HIGGSFIELD_IMAGE_MODEL || DEFAULT_MODEL).trim().replace(/^\/+/, '');
  return /^[a-z0-9._-]+(\/[a-z0-9._-]+){1,4}$/i.test(m) && !m.split('/').some((p) => /^\.+$/.test(p)) ? m : DEFAULT_MODEL;
}

function generateBody(input) {
  const prompt = String((input && input.prompt) || '').trim();
  if (!prompt) throw Object.assign(new Error("Manca 'prompt'."), { status: 400 });
  if (prompt.length > MAX_PROMPT) throw Object.assign(new Error('Prompt troppo lungo (massimo ' + MAX_PROMPT + ' caratteri).'), { status: 400 });
  const aspect = ASPECT_RATIOS.includes(input.aspectRatio) ? input.aspectRatio : '4:5';
  return { prompt, aspect_ratio: aspect, num_images: 1 };
}

function summarize(data) {
  const d = data && typeof data === 'object' ? data : {};
  const images = Array.isArray(d.images) ? d.images.map((i) => i && i.url).filter((u) => typeof u === 'string' && /^https:\/\//.test(u)) : [];
  return {
    requestId: typeof d.request_id === 'string' ? d.request_id : null,
    status: typeof d.status === 'string' ? d.status : 'unknown',
    done: DONE.includes(d.status),
    images,
    error: d.status === 'nsfw' ? 'Immagine bloccata dal filtro contenuti di Higgsfield: riformula il prompt.' : (typeof d.error === 'string' ? d.error : null),
  };
}

async function hfFetch(key, path, opts) {
  const res = await fetch(BASE + path, {
    method: (opts && opts.method) || 'GET',
    body: opts && opts.body,
    headers: Object.assign({ accept: 'application/json', authorization: 'Key ' + key }, (opts && opts.headers) || {}),
    redirect: 'error',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data && (data.detail || data.message || data.error);
    const msg = res.status === 401 || res.status === 403
      ? 'chiave rifiutata da Higgsfield (controlla HIGGSFIELD_API_KEY su Vercel).'
      : res.status === 402
        ? 'saldo API di Higgsfield esaurito: ricaricalo dalla console Higgsfield.'
        : (typeof detail === 'string' ? detail : 'Higgsfield ha risposto ' + res.status);
    throw Object.assign(new Error(msg), { status: res.status === 402 ? 402 : 502 });
  }
  return data;
}

function parseBody(body) {
  if (typeof body !== 'string') return body || {};
  try { return JSON.parse(body); } catch (e) { return {}; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!auth.getSessionUser(req)) return res.status(401).json({ error: 'Sessione mancante o scaduta. Rifai il login.' });
  const key = credentials(process.env);
  if (!key) return res.status(503).json({ error: 'HIGGSFIELD_API_KEY non configurata su Vercel.' });
  try {
    if (req.method === 'GET' && req.query.action === 'status') {
      const id = String(req.query.id || '');
      if (!UUID.test(id)) return res.status(400).json({ error: 'Identificativo richiesta non valido.' });
      return res.status(200).json(summarize(await hfFetch(key, '/requests/' + id + '/status')));
    }
    if (req.method === 'GET' && req.query.action === 'image') {
      const id = String(req.query.id || '');
      if (!UUID.test(id)) return res.status(400).json({ error: 'Identificativo richiesta non valido.' });
      const s = summarize(await hfFetch(key, '/requests/' + id + '/status'));
      if (s.status !== 'completed' || !s.images.length) return res.status(409).json({ error: 'Immagine non ancora pronta.' });
      const img = await fetch(s.images[0], { redirect: 'follow' });
      const type = String(img.headers.get('content-type') || '').split(';')[0];
      if (!img.ok || !/^https:\/\//.test(img.url || s.images[0]) || !/^image\/(png|jpeg|webp)$/.test(type)) return res.status(502).json({ error: 'Higgsfield: immagine non scaricabile.' });
      const buf = Buffer.from(await img.arrayBuffer());
      if (buf.length > IMAGE_MAX) return res.status(413).json({ error: 'Immagine troppo grande da comporre: scaricala e usala così com’è.' });
      res.setHeader('Content-Type', type);
      return res.status(200).send(buf);
    }
    const body = parseBody(req.body);
    if (req.method === 'POST' && body.action === 'generate') {
      const payload = generateBody(body);
      const headers = { 'content-type': 'application/json' };
      if (UUID.test(String(body.requestKey || ''))) headers['idempotency-key'] = body.requestKey;
      const out = summarize(await hfFetch(key, '/' + modelPath(process.env), { method: 'POST', body: JSON.stringify(payload), headers }));
      if (!out.requestId) return res.status(502).json({ error: 'Higgsfield non ha restituito un identificativo di richiesta.' });
      return res.status(200).json(out);
    }
    return res.status(400).json({ error: "Azione non valida. Usa POST action=generate o GET action=status|image." });
  } catch (e) {
    return res.status(e.status && e.status < 500 ? e.status : 502).json({ error: 'Higgsfield: ' + e.message });
  }
};
module.exports.credentials = credentials;
module.exports.modelPath = modelPath;
module.exports.generateBody = generateBody;
module.exports.summarize = summarize;
module.exports.ASPECT_RATIOS = ASPECT_RATIOS;
