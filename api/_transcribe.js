// POST /api/integrations/transcribe — one audio segment of a meeting (app «Meeting», meeting.html) to text, through the
// OpenAI transcription API. The key stays on the server (OPENAI_API_KEY, the same one of the images). The page sends one
// segment at a time as base64 (under 2.8 MB of audio, so the body stays under the 4.5 MB Vercel accepts) and only after
// the person confirmed the cost: a request without `confirm: true` is refused, so nothing is spent by mistake.
// The audio is not stored: it goes to OpenAI and the text comes back. Model from OPENAI_TRANSCRIBE_MODEL
// (default gpt-4o-transcribe), with whisper-1 as fallback when the key cannot use it.
// GET answers only whether the key is configured.
"use strict";
const { getSessionUser } = require("./_auth");

const DEFAULT_MODEL = "gpt-4o-transcribe";
const FALLBACK_MODEL = "whisper-1";
const MAX_BYTES = 3200000;
// The file name tells OpenAI the format: only the containers the API reads.
const TYPES = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
  "video/webm": "webm",
  "video/mp4": "mp4",
};
const LANGS = ["it", "en", "fr", "de", "es"];

// The request to OpenAI from the page's body, or { error } with the reason.
function transcribeRequest(body, env) {
  const b = body && typeof body === "object" ? body : {};
  if (b.confirm !== true) return { status: 400, error: "Conferma la trascrizione: ha un costo." };
  const mime = String(b.mime || "").split(";")[0].trim().toLowerCase();
  const ext = TYPES[mime];
  if (!ext) return { status: 415, error: "Formato audio non supportato (" + (mime || "sconosciuto") + ")." };
  const raw = String(b.audio || "").replace(/^data:[^,]*,/, "");
  if (!raw || !/^[A-Za-z0-9+/=\s]+$/.test(raw)) return { status: 400, error: "Audio mancante o non valido." };
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length < 200) return { status: 400, error: "Audio troppo corto." };
  if (bytes.length > MAX_BYTES) return { status: 413, error: "Segmento audio troppo grande: dividilo in parti più piccole." };
  const model = String((env && env.OPENAI_TRANSCRIBE_MODEL) || DEFAULT_MODEL).trim();
  const language = LANGS.includes(b.language) ? b.language : "";
  const prompt = String(b.prompt || "").slice(-800);
  const n = Number.isInteger(b.n) && b.n >= 0 && b.n < 10000 ? b.n : 0;
  return { model, bytes, mime, filename: "meeting-" + n + "." + ext, language, prompt };
}

function form(plan, model) {
  const fd = new FormData();
  fd.append("file", new Blob([plan.bytes], { type: plan.mime }), plan.filename);
  fd.append("model", model);
  fd.append("response_format", "json");
  if (plan.language) fd.append("language", plan.language);
  if (plan.prompt) fd.append("prompt", plan.prompt);
  return fd;
}

async function call(apiKey, plan, model, fetchImpl) {
  return (fetchImpl || fetch)("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey },
    body: form(plan, model),
  });
}

async function handler(req, res, deps) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Sessione mancante o scaduta. Rifai il login." });
  const env = (deps && deps.env) || process.env;
  if (req.method === "GET") return res.status(200).json({ configured: !!env.OPENAI_API_KEY, model: env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_MODEL });
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST o GET (per lo stato)" });
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Trascrizione non configurata: manca OPENAI_API_KEY su Vercel." });
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const plan = transcribeRequest(body, env);
  if (plan.error) return res.status(plan.status).json({ error: plan.error });
  const fetchImpl = deps && deps.fetch;
  try {
    let model = plan.model;
    let upstream = await call(apiKey, plan, model, fetchImpl);
    if (!upstream.ok && model !== FALLBACK_MODEL && [400, 403, 404].includes(upstream.status)) {
      const err = await upstream.clone().json().catch(() => ({}));
      if (/model|access|permission|not found|does not exist/i.test(String((err && err.error && (err.error.message || err.error.code)) || ""))) {
        model = FALLBACK_MODEL;
        upstream = await call(apiKey, plan, model, fetchImpl);
      }
    }
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const msg = (data && data.error && data.error.message) || "Errore dall'API OpenAI";
      const status = upstream.status === 429 ? 429 : upstream.status >= 500 ? 502 : upstream.status;
      return res.status(status).json({ error: /quota|billing/i.test(msg) ? "Credito OpenAI esaurito: ricarica il credito su platform.openai.com." : msg });
    }
    return res.status(200).json({ text: String((data && data.text) || "").trim(), model });
  } catch (err) {
    return res.status(502).json({ error: "Chiamata a OpenAI fallita: " + (err && err.message ? err.message : String(err)) });
  }
}

module.exports = (req, res) => handler(req, res);
module.exports.handler = handler;
module.exports.transcribeRequest = transcribeRequest;
module.exports.MAX_BYTES = MAX_BYTES;
