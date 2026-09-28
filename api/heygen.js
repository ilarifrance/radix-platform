// Vercel serverless function — collega lo script video dell'AI Specialist a una vera bozza di video
// su HeyGen (da controllare prima di pubblicare), invece di lasciare solo il copione da incollare a
// mano. Richiede HEYGEN_API_KEY nelle variabili d'ambiente del progetto Vercel (Settings ->
// Environment Variables) — la chiave si crea sul tuo account HeyGen, app.heygen.com -> Settings ->
// API Keys. Mai passata al browser né salvata da nessuna parte, letta solo qui da process.env.
//
// NOTA SULLA FORMA DELLE RISPOSTE: la documentazione pubblica di HeyGen non mostra in modo coerente
// l'involucro esatto di ogni risposta (a volte {data:{...}}, a volte il campo diretto). Per questo
// pick() prova più percorsi possibili invece di assumerne uno solo — se HeyGen cambia qualcosa, il
// messaggio d'errore include comunque la risposta grezza per capire subito cosa non torna. Prima
// build: consigliato un test reale (avatars/voices, poi una generazione breve) appena la chiave è
// configurata, perché non è stato possibile verificarla dal vivo in fase di sviluppo.
//
// Azioni (query 'action' su GET, body.action su POST):
//   GET  ?action=avatars              -> { avatars: [{id, name, previewImageUrl}] }
//   GET  ?action=voices               -> { voices: [{id, name, language, gender}] }
//   POST { action:'generate', script, avatarId, voiceId } -> { videoId }
//   GET  ?action=status&videoId=...   -> { status, videoUrl, thumbnailUrl, error }

const { getSessionUser } = require('./_auth');

const HEYGEN_BASE = 'https://api.heygen.com';

function pick(obj, paths, fallback) {
  for (const path of paths) {
    let cur = obj;
    let ok = true;
    for (const key of path.split('.')) {
      if (cur && typeof cur === 'object' && key in cur) {
        cur = cur[key];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return fallback;
}

async function heygenFetch(apiKey, path, opts) {
  opts = opts || {};
  const res = await fetch(HEYGEN_BASE + path, {
    method: opts.method || 'GET',
    body: opts.body,
    headers: Object.assign({ 'content-type': 'application/json', 'x-api-key': apiKey }, opts.headers || {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* risposta non JSON (pagina di errore): data resta null, gestito sotto */
  }
  if (!res.ok) {
    const msg = pick(data, ['message', 'error.message', 'error'], `HeyGen ha risposto ${res.status}`);
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.raw = data;
    throw err;
  }
  return data;
}

module.exports = async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Sessione mancante o scaduta. Rifai il login.' });
    return;
  }

  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error:
        'HEYGEN_API_KEY non configurata su Vercel. Vai su Project Settings -> Environment Variables, ' +
        'aggiungila (dal tuo account HeyGen: Settings -> API Keys su app.heygen.com) e rifai il deploy.',
    });
    return;
  }

  let postBody = req.body;
  if (typeof postBody === 'string') {
    try {
      postBody = JSON.parse(postBody);
    } catch {
      postBody = {};
    }
  }
  const action = req.method === 'GET' ? req.query.action : (postBody || {}).action;

  try {
    if (action === 'avatars') {
      const data = await heygenFetch(apiKey, '/v2/avatars', { method: 'GET' });
      const list = pick(data, ['data.avatars', 'avatars'], []);
      res.status(200).json({
        avatars: (Array.isArray(list) ? list : []).map((a) => ({
          id: a.avatar_id || a.id,
          name: a.avatar_name || a.name || a.avatar_id || a.id,
          previewImageUrl: a.preview_image_url || a.preview_url || null,
        })),
      });
      return;
    }

    if (action === 'voices') {
      const data = await heygenFetch(apiKey, '/v2/voices', { method: 'GET' });
      const list = pick(data, ['data.voices', 'voices'], []);
      res.status(200).json({
        voices: (Array.isArray(list) ? list : []).map((v) => ({
          id: v.voice_id || v.id,
          name: v.name || v.voice_id || v.id,
          language: v.language || null,
          gender: v.gender || null,
        })),
      });
      return;
    }

    if (action === 'status') {
      const videoId = req.query.videoId;
      if (!videoId) {
        res.status(400).json({ error: "Manca 'videoId'." });
        return;
      }
      const data = await heygenFetch(apiKey, `/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, { method: 'GET' });
      res.status(200).json({
        status: pick(data, ['data.status', 'status'], 'unknown'),
        videoUrl: pick(data, ['data.video_url', 'video_url'], null),
        thumbnailUrl: pick(data, ['data.thumbnail_url', 'thumbnail_url'], null),
        error: pick(data, ['data.error', 'error'], null),
      });
      return;
    }

    if (req.method === 'POST' && action === 'generate') {
      const { script, avatarId, voiceId } = postBody || {};
      if (!script || !avatarId || !voiceId) {
        res.status(400).json({ error: "Mancano 'script', 'avatarId' o 'voiceId'." });
        return;
      }
      const data = await heygenFetch(apiKey, '/v2/video/generate', {
        method: 'POST',
        body: JSON.stringify({
          dimension: { width: 1080, height: 1920 }, // verticale — Reels/Stories/TikTok/LinkedIn video
          video_inputs: [
            {
              character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' },
              voice: { type: 'text', voice_id: voiceId, input_text: script },
              background: { type: 'color', value: '#0F2D24' },
            },
          ],
        }),
      });
      const videoId = pick(data, ['data.video_id', 'video_id'], null);
      if (!videoId) {
        res.status(502).json({ error: 'HeyGen non ha restituito un video_id. Risposta: ' + JSON.stringify(data) });
        return;
      }
      res.status(200).json({ videoId });
      return;
    }

    res.status(400).json({ error: "Parametro 'action' mancante o non valido. Usa: avatars, voices, generate, status." });
  } catch (err) {
    res.status(err.status && err.status >= 400 && err.status < 600 ? err.status : 502).json({
      error: 'Chiamata a HeyGen fallita: ' + (err && err.message ? err.message : String(err)),
    });
  }
};
