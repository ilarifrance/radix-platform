// api/send-email.js
// Endpoint reale di invio email per lo Specialista Email Outreach (e in futuro altri agenti).
// Usa SMTP Gmail con una "Password per le app" (NON la password normale di Gmail).
//
// Variabili d'ambiente richieste su Vercel:
//   GMAIL_USER         -> l'indirizzo Gmail da cui si invia (es. ilari.france@gmail.com)
//   GMAIL_APP_PASSWORD -> la password per le app a 16 caratteri generata su
//                         myaccount.google.com -> Sicurezza -> Password per le app
//
// Design volutamente senza invio massivo: questo endpoint manda SEMPRE un singolo messaggio
// per chiamata. Ogni chiamata deve corrispondere a un invio che l'utente ha confermato
// esplicitamente nell'interfaccia (vedi il pulsante "Invia questa email" nel frontend) --
// non va mai richiamato in un ciclo automatico senza conferma a ogni singolo invio.
//
// «Indirizzi disiscritti» (migrazione sales 017): prima di ogni invio si controlla che nessun destinatario sia nella
// lista permanente dei disiscritti di un workspace CRM dell'utente (o di quello del link di disiscrizione). Se c'è, non
// si invia (409). Fanno eccezione solo le risposte ai ticket di assistenza (kind: "service"): non sono email commerciali.
// La lista contiene solo hash: qui si calcola l'hash di ogni destinatario e si cerca quello.

const { getSessionUser: sessionUser } = require("./_auth");
const optout = require("./_sales_optout");
const unsubscribeLinks = require("./_sales_unsubscribe");

// Destinatari di "to" (anche più indirizzi separati da virgola o punto e virgola, anche «Nome <indirizzo>»), normalizzati.
function recipientsOf(to) {
  return String(to || "")
    .split(/[,;]/)
    .map((x) => { const m = x.match(/<([^<>]+)>/); return optout.normalEmail(m ? m[1] : x); })
    .filter(Boolean);
}
// → motivo della disiscrizione se almeno un destinatario è nella lista, altrimenti null.
// Un archivio senza la migrazione 017 non ha la lista: nessun blocco (le note di disiscrizione restano valide nel CRM).
async function suppressedReason(sql, uid, to, workspace) {
  const hashes = recipientsOf(to).map(optout.emailHash);
  if (!hashes.length) return null;
  try {
    const rows = await sql(
      "SELECT s.reason FROM sales_email_suppressions s WHERE s.email_hash=ANY($2::text[]) AND (s.workspace_id IN (SELECT m.workspace_id FROM sales_memberships m WHERE m.user_id=$1) OR s.workspace_id=$3::uuid) LIMIT 1",
      [uid, hashes, workspace || null]
    );
    return rows.length ? rows[0].reason || "manual" : null;
  } catch (e) {
    if (e && e.code === "42P01") return null;
    throw e;
  }
}

function buildTransport(createTransport, env) {
  const user = env.GMAIL_USER;
  const pass = env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "Mancano GMAIL_USER e/o GMAIL_APP_PASSWORD nelle variabili d'ambiente."
    );
  }
  return createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

function createHandler({
  getSessionUser = sessionUser,
  getSql = () => require("./_db").sql(),
  createTransport = (opts) => require("nodemailer").createTransport(opts),
  env = process.env,
} = {}) {
return async function handler(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Sessione mancante o scaduta. Rifai il login." });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Metodo non consentito, usa POST." });
    return;
  }

  let payload = req.body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  const { to, subject, body: emailBody, confirm, unsubscribeUrl, kind } = payload || {};

  // Email commerciali del CRM: link personale di disiscrizione, anche come intestazione
  // List-Unsubscribe (RFC 8058) perché i client mostrino il pulsante «Annulla iscrizione».
  // Si accetta solo un link a questo stesso sito.
  let unsubscribe = null;
  let token = "";
  if (unsubscribeUrl !== undefined) {
    try {
      const u = new URL(String(unsubscribeUrl));
      const host = String((req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "").split(",")[0].trim();
      token = u.searchParams.get("unsubscribe") || "";
      if (!/^https?:$/.test(u.protocol) || u.host !== host || u.pathname !== "/api/sales" || !/^[A-Za-z0-9_-]{64}$/.test(token)) throw new Error("bad");
      unsubscribe = u.origin + "/api/sales?unsubscribe=" + token;
    } catch {
      res.status(400).json({ error: "Link di disiscrizione non valido." });
      return;
    }
  }

  if (!to || !subject || !emailBody) {
    res.status(400).json({ error: "Servono 'to', 'subject' e 'body'." });
    return;
  }
  if (confirm !== true) {
    // Difesa aggiuntiva lato server: anche se qualcuno chiama l'endpoint direttamente,
    // senza il flag esplicito di conferma non si invia nulla.
    res.status(400).json({
      error:
        "Invio non confermato: il payload deve includere confirm: true, impostato solo dopo " +
        "che l'utente ha visto l'anteprima e ha cliccato conferma nell'interfaccia.",
    });
    return;
  }

  // Lista dei disiscritti, prima di aprire la connessione SMTP. Solo le risposte di assistenza ne sono escluse.
  if (kind !== "service") {
    let workspace = null;
    if (unsubscribe) {
      try { const who = unsubscribeLinks.verify(unsubscribeLinks.secretOf(env), token); workspace = who ? who.workspace : null; } catch { workspace = null; }
    }
    let reason;
    try {
      reason = await suppressedReason(getSql(), user.uid, to, workspace);
    } catch (e) {
      console.error("send-email suppression check failed", e && e.code);
      res.status(503).json({ ok: false, error: "Controllo degli indirizzi disiscritti non disponibile: email non inviata. Riprova tra poco." });
      return;
    }
    if (reason) {
      res.status(409).json({ ok: false, suppressed: true, error: "Indirizzo nella lista dei disiscritti del CRM: email non inviata." });
      return;
    }
  }

  try {
    const transporter = buildTransport(createTransport, env);
    const info = await transporter.sendMail({
      from: env.GMAIL_USER,
      to,
      subject,
      text: emailBody,
      ...(unsubscribe ? { list: { unsubscribe: unsubscribe }, headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    });
    res.status(200).json({ ok: true, messageId: info.messageId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
};
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.recipientsOf = recipientsOf;
