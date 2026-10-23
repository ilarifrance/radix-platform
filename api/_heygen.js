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
const studio = require('../lib/avatar-studio');

const UPLOAD_URL = 'https://upload.heygen.com/v1/asset';
const MAX_UPLOAD = 4 * 1024 * 1024;

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
      // The account's own avatars first: photo avatar looks (avatar groups, e.g. «Professional in navy suit»)
      // and talking photos speak as talking_photo; HeyGen's public studio avatars follow.
      const own = [];
      try {
        const groups = pick(await heygenFetch(apiKey, '/v2/avatar_group.list?include_public=false', { method: 'GET' }), ['data.avatar_group_list', 'avatar_group_list'], []);
        for (const g of (Array.isArray(groups) ? groups : []).slice(0, 12)) {
          const gid = g.id || g.group_id;
          if (!gid) continue;
          try {
            const looks = pick(await heygenFetch(apiKey, '/v2/avatar_group/' + encodeURIComponent(gid) + '/avatars', { method: 'GET' }), ['data.avatar_list', 'avatar_list'], []);
            for (const a of (Array.isArray(looks) ? looks : []).slice(0, 20)) {
              const id = a.id || a.avatar_id || a.talking_photo_id;
              if (id) own.push({ id, type: 'talking_photo', name: [g.name, a.name].filter(Boolean).join(' · ') || id, previewImageUrl: a.image_url || a.preview_image_url || g.preview_image || null, defaultVoiceId: a.default_voice_id || a.voice_id || g.default_voice_id || null });
            }
          } catch {
            /* one group unreadable: the others still show */
          }
        }
      } catch {
        /* accounts without avatar groups */
      }
      const data = await heygenFetch(apiKey, '/v2/avatars', { method: 'GET' });
      const seen = new Set(own.map((a) => a.id));
      for (const t of pick(data, ['data.talking_photos', 'talking_photos'], []) || []) {
        const id = t.talking_photo_id || t.id;
        if (id && !seen.has(id)) { seen.add(id); own.push({ id, type: 'talking_photo', name: t.talking_photo_name || t.name || id, previewImageUrl: t.preview_image_url || null }); }
      }
      const list = pick(data, ['data.avatars', 'avatars'], []);
      res.status(200).json({
        avatars: own.concat((Array.isArray(list) ? list : []).map((a) => ({
          id: a.avatar_id || a.id,
          type: 'avatar',
          name: a.avatar_name || a.name || a.avatar_id || a.id,
          previewImageUrl: a.preview_image_url || a.preview_url || null,
        }))),
        own: own.length,
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
          previewAudio: /^https:\/\//.test(v.preview_audio || '') ? v.preview_audio : null,
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

    // Studio Avatar: photos of an avatar designed from the user's answers (HeyGen bills each generation).
    if (req.method === 'POST' && action === 'design') {
      if ((postBody || {}).confirm !== true) {
        res.status(400).json({ error: 'Conferma esplicita mancante: la generazione consuma crediti HeyGen.' });
        return;
      }
      let payload;
      try {
        payload = studio.designPayload(postBody.answers, postBody.name);
      } catch (e) {
        res.status(400).json({ error: e.message });
        return;
      }
      const data = await heygenFetch(apiKey, '/v2/photo_avatar/photo/generate', { method: 'POST', body: JSON.stringify(payload) });
      const generationId = pick(data, ['data.generation_id', 'generation_id'], null);
      if (!generationId) {
        res.status(502).json({ error: 'HeyGen non ha restituito un generation_id.' });
        return;
      }
      res.status(200).json({ generationId });
      return;
    }

    if (action === 'generation') {
      const id = req.query.id;
      if (!id || !/^[\w-]{6,80}$/.test(id)) {
        res.status(400).json({ error: "Manca 'id' della generazione." });
        return;
      }
      const data = await heygenFetch(apiKey, `/v2/photo_avatar/generation/${encodeURIComponent(id)}`, { method: 'GET' });
      const urls = pick(data, ['data.image_url_list', 'image_url_list'], []) || [];
      const keys = pick(data, ['data.image_key_list', 'image_key_list'], []) || [];
      res.status(200).json({
        status: pick(data, ['data.status', 'status'], 'unknown'),
        error: pick(data, ['data.msg', 'msg'], null),
        images: studio.examples(urls.map((url, i) => ({ url, key: keys[i] }))),
      });
      return;
    }

    // The user's own photo: uploaded as a HeyGen asset, so it can become the avatar.
    if (req.method === 'POST' && action === 'upload') {
      const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String((postBody || {}).dataUrl || ''));
      if (!m) {
        res.status(400).json({ error: 'Carica una foto JPG o PNG.' });
        return;
      }
      const bytes = Buffer.from(m[2], 'base64');
      if (bytes.length > MAX_UPLOAD) {
        res.status(413).json({ error: 'Foto troppo grande: massimo 4 MB.' });
        return;
      }
      const up = await fetch(UPLOAD_URL, { method: 'POST', headers: { 'Content-Type': m[1], 'X-Api-Key': apiKey }, body: bytes });
      const data = await up.json().catch(() => null);
      if (!up.ok) {
        res.status(502).json({ error: 'Caricamento su HeyGen fallito: ' + pick(data, ['message', 'error.message', 'error'], up.status) });
        return;
      }
      const imageKey = pick(data, ['data.image_key', 'image_key'], null);
      if (!imageKey) {
        res.status(502).json({ error: 'HeyGen non ha restituito la chiave della foto.' });
        return;
      }
      res.status(200).json({ imageKey, url: pick(data, ['data.url', 'url'], null) });
      return;
    }

    // The chosen photo becomes a photo avatar (an avatar group), then HeyGen trains it for new looks.
    if (req.method === 'POST' && action === 'createAvatar') {
      const { imageKey, name, confirm } = postBody || {};
      if (confirm !== true) {
        res.status(400).json({ error: 'Conferma esplicita mancante: creare l’avatar consuma crediti HeyGen.' });
        return;
      }
      if (!imageKey || !/^image\/[\w-]+\/[\w.-]+$/.test(String(imageKey))) {
        res.status(400).json({ error: "Manca la foto scelta ('imageKey')." });
        return;
      }
      const data = await heygenFetch(apiKey, '/v2/photo_avatar/avatar_group/create', {
        method: 'POST',
        body: JSON.stringify({ name: String(name || 'Avatar RADIX').slice(0, 80), image_key: imageKey }),
      });
      const avatarId = pick(data, ['data.id', 'id'], null);
      const groupId = pick(data, ['data.group_id', 'group_id'], null);
      if (!avatarId) {
        res.status(502).json({ error: 'HeyGen non ha restituito l’avatar creato.' });
        return;
      }
      let trainError = null;
      if (groupId) {
        try {
          await heygenFetch(apiKey, '/v2/photo_avatar/train', { method: 'POST', body: JSON.stringify({ group_id: groupId }) });
        } catch (e) {
          trainError = e.message;
        }
      }
      res.status(200).json({ avatarId, groupId, imageUrl: pick(data, ['data.image_url', 'image_url'], null), trainError });
      return;
    }

    if (action === 'trainStatus') {
      const id = req.query.groupId;
      if (!id || !/^[\w-]{6,80}$/.test(id)) {
        res.status(400).json({ error: "Manca 'groupId'." });
        return;
      }
      const data = await heygenFetch(apiKey, `/v2/photo_avatar/train/status/${encodeURIComponent(id)}`, { method: 'GET' });
      res.status(200).json({ status: pick(data, ['data.status', 'status'], 'unknown'), error: pick(data, ['data.error_msg', 'error_msg'], null) });
      return;
    }

    if (req.method === 'POST' && action === 'generate') {
      const { script, avatarId, voiceId, talkingPhotoId, orientation } = postBody || {};
      if (!script || !(avatarId || talkingPhotoId) || !voiceId) {
        res.status(400).json({ error: "Mancano 'script', 'avatarId' o 'voiceId'." });
        return;
      }
      // A photo avatar made in Studio Avatar speaks as a talking photo; a HeyGen studio avatar as an avatar.
      const character = talkingPhotoId
        ? { type: 'talking_photo', talking_photo_id: talkingPhotoId }
        : { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' };
      const data = await heygenFetch(apiKey, '/v2/video/generate', {
        method: 'POST',
        body: JSON.stringify({
          // YouTube is horizontal; clips for Reels/Stories/TikTok/LinkedIn stay vertical.
          dimension: orientation === 'landscape' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 },
          video_inputs: [
            {
              character,
              voice: { type: 'text', voice_id: voiceId, input_text: script },
              // A photo avatar keeps the background of its own photo (the office of the look).
              ...(talkingPhotoId ? {} : { background: { type: 'color', value: '#0F2D24' } }),
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

    res.status(400).json({ error: "Parametro 'action' mancante o non valido. Usa: avatars, voices, design, generation, upload, createAvatar, trainStatus, generate, status." });
  } catch (err) {
    res.status(err.status && err.status >= 400 && err.status < 600 ? err.status : 502).json({
      error: 'Chiamata a HeyGen fallita: ' + (err && err.message ? err.message : String(err)),
    });
  }
};
