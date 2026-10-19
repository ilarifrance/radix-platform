// Vercel serverless function — collega la decisione del Social Media Manager (e il testo del
// Copywriter) a una vera bozza in coda su Buffer, invece di lasciare solo "copia e incolla a mano"
// come unica strada per pubblicare. Richiede BUFFER_ACCESS_TOKEN nelle variabili d'ambiente del
// progetto Vercel (Settings -> Environment Variables) — il token si crea sul tuo account Buffer,
// Settings -> API (developers.buffer.com/guides/authentication.html). Mai passato al browser né
// salvato da nessuna parte, letto solo qui da process.env.
//
// NOTA IMPORTANTE SU COSA FA "addToQueue": Buffer non offre, nella sua API pubblica attuale, una
// vera modalità "bozza" separata dalla coda di pubblicazione — l'unica documentata oltre alla
// programmazione a orario esatto (customScheduled) è "addToQueue", che mette il post nel prossimo
// slot libero del tuo calendario Buffer e **lo pubblica per davvero a quell'orario**, esattamente
// come se lo avessi messo in coda a mano dall'app Buffer. Per questo il pulsante "Invia a Buffer" in
// index.html chiede sempre una conferma esplicita prima di chiamare questo endpoint con
// action:'create' — non è un salvataggio innocuo, è una vera pubblicazione programmata. Prima di
// fidarsi del pulsante per contenuti veri, consigliato un primo test con un canale/post di prova,
// perché — come per api/heygen.js — non è stato possibile verificarlo dal vivo in fase di sviluppo
// (nessun account Buffer collegato in questo ambiente).
//
// Azioni (query 'action' su GET, body.action su POST):
//   GET  ?action=channels                          -> { channels: [{id, name, service}] }
//   POST { action:'create', channelId, text }       -> { postId, dueAt }

const { getSessionUser } = require('./_auth');

const BUFFER_BASE = 'https://api.buffer.com';

async function bufferGraphQL(apiKey, query, variables) {
  const res = await fetch(BUFFER_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({ query, variables: variables || {} }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* risposta non JSON: data resta null, gestito sotto */
  }
  if (!res.ok) {
    // 401/403: the key itself is the problem, so say that first instead of only the raw status.
    const why =
      res.status === 401 || res.status === 403
        ? 'la chiave Buffer sul server non è valida o è scaduta (rigenerala su publish.buffer.com, Settings -> API, e aggiornala su Vercel). '
        : '';
    const err = new Error(why + 'Buffer ha risposto ' + res.status + (data ? ': ' + JSON.stringify(data) : ''));
    err.status = res.status;
    throw err;
  }
  if (data && Array.isArray(data.errors) && data.errors.length) {
    const err = new Error(data.errors.map((e) => e.message).join('; '));
    err.raw = data.errors;
    throw err;
  }
  return data ? data.data : null;
}

// Crea il post su Buffer. Senza dueAt va nel prossimo slot libero (addToQueue); con dueAt (ISO UTC)
// viene programmato a quell'orario esatto (customScheduled). Errori con .status: 422 se Buffer rifiuta
// il post, 502 se la risposta non è valida.
async function createPost(apiKey, { channelId, text, dueAt, images }) {
  const scheduled = !!dueAt;
  const pics = (Array.isArray(images) ? images : []).filter((u) => /^https:\/\//.test(String(u))).slice(0, 10);
  const vars = { channelId, text };
  if (scheduled) vars.dueAt = dueAt;
  // Inline literal (see developers.buffer.com/examples/create-image-post): an ordered list, one { image: { url } } each.
  const assets = pics.length ? ', assets: [' + pics.map((url) => '{ image: { url: ' + JSON.stringify(url) + ' } }').join(', ') + ']' : '';
  const data = await bufferGraphQL(
    apiKey,
    'mutation($channelId: String!, $text: String!' + (scheduled ? ', $dueAt: DateTime!' : '') + ') {\n' +
      '  createPost(input: { text: $text, channelId: $channelId, schedulingType: automatic, mode: ' +
      (scheduled ? 'customScheduled, dueAt: $dueAt' : 'addToQueue') + assets + ' }) {\n' +
      '    ... on PostActionSuccess { post { id text dueAt } }\n' +
      '    ... on MutationError { message }\n' +
      '  }\n' +
      '}',
    vars
  );
  const result = data && data.createPost;
  const fail = (status, message) => Object.assign(new Error(message), { status });
  if (!result) throw fail(502, 'Buffer non ha restituito una risposta valida.');
  // Union "MutationError": Buffer ha capito la richiesta ma l'ha rifiutata (es. canale non
  // valido, testo troppo lungo per quel servizio) — messaggio già leggibile, lo passiamo su.
  if (result.message) throw fail(422, result.message);
  if (!result.post || !result.post.id) throw fail(502, 'Buffer non ha confermato la creazione del post.');
  return { postId: result.post.id, dueAt: result.post.dueAt || null };
}

module.exports = async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Sessione mancante o scaduta. Rifai il login.' });
    return;
  }

  const apiKey = process.env.BUFFER_ACCESS_TOKEN;
  if (!apiKey) {
    res.status(500).json({
      error:
        'BUFFER_ACCESS_TOKEN non configurata su Vercel. Vai su Project Settings -> Environment Variables, ' +
        'aggiungila (dal tuo account Buffer: Settings -> API su publish.buffer.com) e rifai il deploy.',
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
    if (action === 'channels') {
      // Un canale appartiene a un'organizzazione: prima leggiamo le organizzazioni collegate al
      // token, poi i canali di ciascuna (quasi sempre una sola, ma non si assume: si uniscono i
      // risultati di tutte per non nascondere canali se l'account Buffer ne ha più di una).
      const orgsData = await bufferGraphQL(apiKey, 'query { account { organizations { id name } } }');
      const orgs = (orgsData && orgsData.account && orgsData.account.organizations) || [];
      if (!orgs.length) {
        res.status(200).json({ channels: [] });
        return;
      }
      const channelLists = await Promise.all(
        orgs.map((org) =>
          bufferGraphQL(
            apiKey,
            'query($orgId: String!) { channels(input: { organizationId: $orgId }) { id name service } }',
            { orgId: org.id }
          ).then((d) => (d && d.channels) || [])
        )
      );
      const channels = [].concat(...channelLists).map((c) => ({ id: c.id, name: c.name, service: c.service }));
      res.status(200).json({ channels });
      return;
    }

    if (req.method === 'POST' && action === 'create') {
      const { channelId, text } = postBody || {};
      if (!channelId || !text || !String(text).trim()) {
        res.status(400).json({ error: "Mancano 'channelId' o 'text'." });
        return;
      }
      const post = await createPost(apiKey, { channelId, text: String(text) });
      res.status(200).json(post);
      return;
    }

    res.status(400).json({ error: "Parametro 'action' mancante o non valido. Usa: channels, create." });
  } catch (err) {
    res.status(err.status && err.status >= 400 && err.status < 600 ? err.status : 502).json({
      error: 'Chiamata a Buffer fallita: ' + (err && err.message ? err.message : String(err)),
    });
  }
};
module.exports.createPost = createPost;
module.exports.bufferGraphQL = bufferGraphQL;
