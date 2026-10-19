// Vercel serverless function: genera un'immagine di sfondo per una slide del carosello tramite le
// Images API di OpenAI (modello da OPENAI_IMAGE_MODEL, vedi imageRequest), così una slide può avere uno sfondo fotografico/illustrato
// vero invece dei soli colori piatti del brand RADIX. Stesso pattern di api/heygen.js: la chiave resta
// sul server, non arriva mai al browser.
//
// Richiede una variabile d'ambiente sul progetto Vercel (Settings -> Environment Variables):
//   OPENAI_API_KEY = sk-...
// Si crea su https://platform.openai.com/api-keys — ATTENZIONE: è una chiave API a consumo, separata
// dall'abbonamento ChatGPT Plus (che non dà accesso automatico alle API). Va abilitato il billing su
// platform.openai.com perché la chiamata funzioni.

const { getSessionUser } = require("./_auth");

function isAuthorized(req) {
  const user = getSessionUser(req);
  if (!user) return false;
  req.user = user;
  return true;
}

// Model from OPENAI_IMAGE_MODEL (default: the current generation of the image API), with the previous one as a
// fallback. Drafts at medium quality, final images (`final: true`) at high. Up to 4 reference images
// (moodboard, logo, product photos) go through the edits endpoint, so the result follows them; only data URLs
// and images already in the project's Blob store are accepted, never arbitrary addresses.
const DEFAULT_MODEL = "gpt-image-2";
const FALLBACK_MODEL = "gpt-image-1";
const REF_HOST = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;
const NEW_SIZES = { portrait: "1088x1360", square: "1024x1024", landscape: "1536x1024", story: "1088x1920" };
const OLD_SIZES = { portrait: "1024x1536", square: "1024x1024", landscape: "1536x1024", story: "1024x1536" };

function imageRequest(body, env) {
  const prompt = String(body.prompt || "").trim().slice(0, 32000);
  if (!prompt) return { error: "Manca 'prompt'" };
  const model = (env && env.OPENAI_IMAGE_MODEL) || DEFAULT_MODEL;
  const newer = !/^gpt-image-1/.test(model);
  const shape = NEW_SIZES[body.shape] ? body.shape : "portrait";
  const size = /^\d{3,4}x\d{3,4}$/.test(String(body.size || "")) ? body.size : (newer ? NEW_SIZES : OLD_SIZES)[shape];
  const quality = ["low", "medium", "high"].includes(body.quality) ? body.quality : body.final ? "high" : "medium";
  const refs = (Array.isArray(body.references) ? body.references : [])
    .map((r) => String(r || ""))
    .filter((r) => /^data:image\/(png|jpeg|webp);base64,/.test(r) || REF_HOST.test(r))
    .slice(0, 4);
  if (Array.isArray(body.references) && body.references.length && !refs.length) {
    return { error: "Le immagini di riferimento devono essere caricate in RADIX." };
  }
  const payload = { model, prompt, size, quality, n: 1 };
  if (refs.length) payload.images = refs.map((u) => ({ image_url: u }));
  return { model, endpoint: refs.length ? "edits" : "generations", payload };
}

function openai(apiKey, plan) {
  return fetch("https://api.openai.com/v1/images/" + plan.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
    body: JSON.stringify(plan.payload),
  });
}

module.exports = async (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Sessione mancante o scaduta. Rifai il login." });
    return;
  }

  // Stesso pattern del pill di stato di /api/chat e /api/heygen: conferma solo se la chiave è
  // configurata, senza spendere una generazione vera ad ogni caricamento pagina.
  if (req.method === "GET") {
    res.status(200).json({ configured: !!process.env.OPENAI_API_KEY });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Usa POST o GET (per lo stato)" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error:
        "OPENAI_API_KEY non configurata su Vercel. Vai su Project Settings -> Environment Variables, " +
        "aggiungi una API key creata su platform.openai.com (non le credenziali di ChatGPT Plus — serve " +
        "billing attivo separato) e rifai il deploy.",
    });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const plan = imageRequest(body || {}, process.env);
  if (plan.error) {
    res.status(400).json({ error: plan.error });
    return;
  }

  try {
    let upstream = await openai(apiKey, plan);
    // A key that cannot use the configured model yet (organisation not verified, model not enabled)
    // still gets an image from the previous model instead of an error.
    if (!upstream.ok && plan.model !== FALLBACK_MODEL && [400, 403, 404].includes(upstream.status)) {
      const err = await upstream.clone().json().catch(() => ({}));
      if (/model|verif|access|permission/i.test(String(err?.error?.message || err?.error?.code || ""))) {
        upstream = await openai(apiKey, imageRequest(body || {}, { ...process.env, OPENAI_IMAGE_MODEL: FALLBACK_MODEL }));
      }
    }
    const data = await upstream.json();
    if (!upstream.ok) {
      const msg = (data && data.error && data.error.message) || "Errore dall'API OpenAI";
      res.status(upstream.status).json({ error: msg });
      return;
    }
    const item = data && Array.isArray(data.data) && data.data[0];
    const b64 = item && item.b64_json;
    if (!b64) {
      res.status(502).json({ error: "Risposta OpenAI senza immagine (formato inatteso)." });
      return;
    }
    res.status(200).json({ image: "data:image/png;base64," + b64, model: data.model || null });
  } catch (err) {
    res.status(502).json({ error: "Chiamata a OpenAI fallita: " + (err && err.message ? err.message : String(err)) });
  }
};

module.exports.imageRequest = imageRequest;
