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

const { getSessionUser } = require("./_auth");
const nodemailer = require("nodemailer");

function buildTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "Mancano GMAIL_USER e/o GMAIL_APP_PASSWORD nelle variabili d'ambiente."
    );
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

module.exports = async function handler(req, res) {
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
  const { to, subject, body: emailBody, confirm, unsubscribeUrl } = payload || {};

  // Email commerciali del CRM: link personale di disiscrizione, anche come intestazione
  // List-Unsubscribe (RFC 8058) perché i client mostrino il pulsante «Annulla iscrizione».
  // Si accetta solo un link a questo stesso sito.
  let unsubscribe = null;
  if (unsubscribeUrl !== undefined) {
    try {
      const u = new URL(String(unsubscribeUrl));
      const host = String((req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "").split(",")[0].trim();
      const token = u.searchParams.get("unsubscribe") || "";
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

  try {
    const transporter = buildTransport();
    const info = await transporter.sendMail({
      from: process.env.GMAIL_USER,
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
