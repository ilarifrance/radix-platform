// /api/integrations/call — phone calls from the «Meeting» app (meeting.html), recorded and then transcribed.
// A phone app cannot record a normal phone call (iOS and Android forbid it), so the call goes through RADIX:
// Twilio first rings YOUR mobile from the RADIX number; when you answer it dials the other person, who hears that
// the call is recorded, and the two sides are connected. Twilio records the call; at the end the page asks (after
// the person confirms the cost) for the text, which RADIX takes from the recording and sends to OpenAI. The
// recording is then deleted from Twilio unless TWILIO_KEEP_RECORDINGS is set.
//
// Environment (Vercel): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER (the RADIX number, +39…).
// Optional: TWILIO_PUBLIC_URL (public address of this site, for the announcement to the other person; on
// production the site's own address is used), TWILIO_KEEP_RECORDINGS=1.
//
// GET                  → {configured, number} (session)
// GET ?sid=CA…         → state of the call and of its recording (session)
// GET|POST ?step=announce → the TwiML Twilio plays to the other person before connecting (public, fixed text)
// POST {action:'start', to, me, confirm:true}     → {sid}
// POST {action:'transcribe', sid, confirm:true}   → {text, seconds, model}
"use strict";
const { getSessionUser } = require("./_auth");
const transcriber = require("./_transcribe");

const API = "https://api.twilio.com/2010-04-01/Accounts/";
const E164 = /^\+[1-9]\d{7,14}$/;
const SID = /^CA[0-9a-f]{32}$/;
const MAX_CALL_SECONDS = 7200;
const CHUNK_SECONDS = 1200; // one transcription request per 20 minutes of recording
const MAX_CHUNK_BYTES = 24 * 1024 * 1024;

const xml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
const ANNOUNCE =
  '<?xml version="1.0" encoding="UTF-8"?><Response><Say language="it-IT">Buongiorno. Questa chiamata viene registrata e trascritta per il verbale della riunione.</Say></Response>';

// A phone number as Twilio wants it: +39 for Italian numbers written without the prefix.
function phone(v) {
  let s = String(v || "").replace(/[\s().\-/]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^3\d{8,9}$/.test(s) || /^0\d{5,10}$/.test(s)) s = "+39" + s;
  return E164.test(s) ? s : "";
}

function config(env) {
  const e = env || {};
  const sid = String(e.TWILIO_ACCOUNT_SID || "").trim(), token = String(e.TWILIO_AUTH_TOKEN || "").trim(), number = phone(e.TWILIO_NUMBER);
  return { sid, token, number, configured: !!(sid && token && number) };
}

// Where Twilio fetches the announcement: an address it can reach. Previews are behind Vercel login, so there the
// announcement is skipped unless TWILIO_PUBLIC_URL says otherwise (you are reminded to say it yourself).
function publicBase(req, env) {
  const set = String((env && env.TWILIO_PUBLIC_URL) || "").trim().replace(/\/+$/, "");
  if (/^https:\/\/[a-z0-9.-]+$/i.test(set)) return set;
  if (env && env.VERCEL_ENV === "production") {
    const host = String((req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "").split(",")[0].trim();
    if (/^[a-z0-9.-]+$/i.test(host)) return "https://" + host;
  }
  return "";
}

// The TwiML of the call: what YOU hear when you answer, then the other person is dialled and recorded.
function bridgeTwiml({ to, from, announceUrl }) {
  const intro = announceUrl
    ? "Ti collego. La chiamata viene registrata e la persona che chiami sente l'avviso."
    : "Ti collego. La chiamata viene registrata: avvisa la persona che chiami.";
  return (
    '<?xml version="1.0" encoding="UTF-8"?><Response><Say language="it-IT">' + xml(intro) + "</Say>" +
    '<Dial callerId="' + xml(from) + '" record="record-from-answer-dual" timeout="40" timeLimit="' + MAX_CALL_SECONDS + '">' +
    "<Number" + (announceUrl ? ' url="' + xml(announceUrl) + '" method="GET"' : "") + ">" + xml(to) + "</Number></Dial>" +
    '<Say language="it-IT">La chiamata è terminata. Trovi la registrazione in RADIX Meeting.</Say></Response>'
  );
}

function twilio(cfg, fetchImpl) {
  const auth = "Basic " + Buffer.from(cfg.sid + ":" + cfg.token).toString("base64");
  const base = API + encodeURIComponent(cfg.sid);
  const f = fetchImpl || fetch;
  const request = async (path, opts = {}) => {
    const res = await f(path.startsWith("https://") ? path : base + path, { ...opts, headers: { authorization: auth, ...(opts.headers || {}) } });
    return res;
  };
  const json = async (path, opts) => {
    const res = await request(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(twilioError(res.status, data)), { status: res.status === 401 ? 502 : res.status >= 500 ? 502 : 400 });
    return data;
  };
  return { request, json, base };
}
function twilioError(status, data) {
  const msg = String((data && (data.message || data.detail)) || "");
  if (status === 401) return "Credenziali Twilio non valide: controlla TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN su Vercel.";
  if (/geo|permission to call|not authorized to call/i.test(msg)) return "Twilio non permette chiamate verso questo paese: abilitalo in Voice › Geo permissions.";
  if (/unverified|trial/i.test(msg)) return "Account Twilio di prova: puoi chiamare solo numeri verificati. Passa all'account a pagamento o verifica il numero.";
  return "Twilio: " + (msg || "errore " + status);
}

function bodyOf(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  return b && typeof b === "object" ? b : {};
}

async function start(cfg, req, env, b, fetchImpl) {
  if (b.confirm !== true) return [400, { error: "Conferma la chiamata: ha un costo." }];
  const to = phone(b.to), me = phone(b.me);
  if (!to) return [400, { error: "Numero da chiamare non valido: scrivilo con il prefisso, es. +39 333 1234567." }];
  if (!me) return [400, { error: "Il tuo numero di cellulare non è valido." }];
  if (to === me || to === cfg.number) return [400, { error: "Il numero da chiamare deve essere diverso dal tuo." }];
  const base = publicBase(req, env);
  const twiml = bridgeTwiml({ to, from: cfg.number, announceUrl: base ? base + "/api/integrations/call?step=announce" : "" });
  const form = new URLSearchParams({ To: me, From: cfg.number, Twiml: twiml, TimeLimit: String(MAX_CALL_SECONDS + 120) });
  const data = await twilio(cfg, fetchImpl).json("/Calls.json", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
  return [200, { sid: data.sid, announced: !!base }];
}

// The call (the leg to you) and the recording of the bridged conversation, when Twilio has it.
async function recordingsOf(t, sid) {
  const data = await t.json("/Recordings.json?CallSid=" + encodeURIComponent(sid) + "&PageSize=20");
  const list = Array.isArray(data.recordings) ? data.recordings : [];
  return list.filter((r) => r && /^RE[0-9a-f]{32}$/.test(r.sid));
}
async function status(cfg, sid, fetchImpl) {
  const t = twilio(cfg, fetchImpl);
  const call = await t.json("/Calls/" + sid + ".json");
  const recs = await recordingsOf(t, sid);
  const done = recs.filter((r) => r.status === "completed");
  return [200, {
    status: String(call.status || ""), seconds: Number(call.duration) || 0,
    recording: done.length ? { seconds: done.reduce((a, r) => a + (Number(r.duration) || 0), 0), count: done.length } : null,
    processing: recs.some((r) => r.status !== "completed" && r.status !== "absent" && r.status !== "failed"),
  }];
}

// MP3 frames resynchronise on their own, so a recording can be cut by bytes into parts of about 20 minutes.
function chunks(bytes, seconds) {
  const parts = Math.max(1, Math.ceil((Number(seconds) || 0) / CHUNK_SECONDS), Math.ceil(bytes.length / MAX_CHUNK_BYTES));
  const size = Math.ceil(bytes.length / parts);
  const out = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, Math.min(bytes.length, i + size)));
  return out;
}

async function transcribeCall(cfg, env, b, fetchImpl) {
  if (b.confirm !== true) return [400, { error: "Conferma la trascrizione: ha un costo." }];
  const sid = String(b.sid || "");
  if (!SID.test(sid)) return [400, { error: "Chiamata non valida." }];
  if (!env.OPENAI_API_KEY) return [503, { error: "Trascrizione non configurata: manca OPENAI_API_KEY su Vercel." }];
  const t = twilio(cfg, fetchImpl);
  const recs = (await recordingsOf(t, sid)).filter((r) => r.status === "completed");
  if (!recs.length) return [409, { error: "La registrazione non è ancora pronta: riprova tra qualche secondo." }];
  const language = ["it", "en", "fr", "de", "es"].includes(b.language) ? b.language : "it";
  const model = String(env.OPENAI_TRANSCRIBE_MODEL || transcriber.DEFAULT_MODEL);
  const texts = [];
  let seconds = 0, used = model;
  for (const r of recs.sort((a, b2) => String(a.date_created).localeCompare(String(b2.date_created)))) {
    const res = await t.request("/Recordings/" + r.sid + ".mp3");
    if (!res.ok) return [502, { error: "Registrazione non scaricabile da Twilio (" + res.status + ")." }];
    const bytes = Buffer.from(await res.arrayBuffer());
    const dur = Number(r.duration) || 0;
    seconds += dur;
    const parts = chunks(bytes, dur);
    for (let i = 0; i < parts.length; i++) {
      const out = await transcriber.transcribe(env.OPENAI_API_KEY, { model, bytes: parts[i], mime: "audio/mpeg", filename: "call-" + i + ".mp3", language, prompt: texts.join(" ").slice(-400) }, fetchImpl);
      used = out.model;
      if (out.text) texts.push(out.text);
    }
  }
  const text = texts.join("\n\n");
  if (!env.TWILIO_KEEP_RECORDINGS) {
    for (const r of recs) { try { await t.request("/Recordings/" + r.sid + ".json", { method: "DELETE" }); } catch { /* deleted later by hand */ } }
  }
  return [200, { text, seconds, model: used, deleted: !env.TWILIO_KEEP_RECORDINGS }];
}

async function handler(req, res, deps) {
  const env = (deps && deps.env) || process.env;
  const fetchImpl = deps && deps.fetch;
  const q = req.query || {};
  if (q.step === "announce") {
    res.setHeader("content-type", "text/xml; charset=utf-8");
    return res.status(200).send(ANNOUNCE);
  }
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Sessione mancante o scaduta. Rifai il login." });
  const cfg = config(env);
  try {
    if (req.method === "GET" && !q.sid) return res.status(200).json({ configured: cfg.configured, number: cfg.configured ? cfg.number : "" });
    if (!cfg.configured) return res.status(503).json({ error: "Telefonate non attive: mancano le chiavi Twilio su Vercel (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER)." });
    if (req.method === "GET") {
      const sid = String(q.sid);
      if (!SID.test(sid)) return res.status(400).json({ error: "Chiamata non valida." });
      const [code, body] = await status(cfg, sid, fetchImpl);
      return res.status(code).json(body);
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Usa GET o POST" });
    const b = bodyOf(req);
    const [code, body] = b.action === "start" ? await start(cfg, req, env, b, fetchImpl) : b.action === "transcribe" ? await transcribeCall(cfg, env, b, fetchImpl) : [400, { error: "Azione non valida." }];
    return res.status(code).json(body);
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message || "Twilio non raggiungibile." });
  }
}

module.exports = (req, res) => handler(req, res);
module.exports.handler = handler;
module.exports.phone = phone;
module.exports.bridgeTwiml = bridgeTwiml;
module.exports.publicBase = publicBase;
module.exports.chunks = chunks;
module.exports.ANNOUNCE = ANNOUNCE;
