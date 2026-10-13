// Vercel serverless function: genera un'immagine di sfondo per una slide del carosello tramite le
// Images API di OpenAI (gpt-image-1), così una slide può avere uno sfondo fotografico/illustrato
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
  const prompt = ((body && body.prompt) || "").trim();
  if (!prompt) {
    res.status(400).json({ error: "Manca 'prompt'" });
    return;
  }
  // 1024x1536: il formato verticale più vicino al 4:5 (1080x1350) delle slide del carosello — il
  // frontend fa poi un cover-fit sul canvas, non serve un match esatto.
  const size = (body && body.size) || "1024x1536";

  try {
    const upstream = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: prompt,
        size: size,
        quality: "medium",
        n: 1,
      }),
    });
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
    res.status(200).json({ image: "data:image/png;base64," + b64 });
  } catch (err) {
    res.status(502).json({ error: "Chiamata a OpenAI fallita: " + (err && err.message ? err.message : String(err)) });
  }
};
