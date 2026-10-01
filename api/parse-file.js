// Vercel serverless function — riceve un file allegato dal frontend (base64, mai salvato su disco:
// letto in memoria e scartato subito dopo aver risposto) e lo trasforma in testo semplice, così può
// essere incollato nel contesto di un agente. Copre fogli di calcolo (.xlsx/.xls), testo semplice
// (.txt/.md/.csv), contratti e documenti Word (.docx, via mammoth) e PDF con testo vero, non
// scansionato (.pdf, via pdf-parse) — utile soprattutto per l'Area Legale, dove un contratto arriva
// quasi sempre in uno di questi due formati.
const { getSessionUser } = require('./_auth');
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

const MAX_BYTES = 4 * 1024 * 1024; // ~4MB — ben sotto il limite del body delle funzioni Vercel
const TEXT_EXTENSIONS = ['txt', 'md', 'csv'];
const SPREADSHEET_EXTENSIONS = ['xlsx', 'xls'];
const WORD_EXTENSIONS = ['docx'];
const PDF_EXTENSIONS = ['pdf'];

module.exports = async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Sessione mancante o scaduta. Rifai il login.' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Usa POST' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const { filename, contentBase64 } = body || {};
  if (!filename || !contentBase64) {
    res.status(400).json({ error: "Mancano 'filename' o 'contentBase64' nel corpo della richiesta." });
    return;
  }

  let buf;
  try {
    buf = Buffer.from(contentBase64, 'base64');
  } catch {
    res.status(400).json({ error: 'contentBase64 non è una stringa base64 valida.' });
    return;
  }
  if (!buf.length) {
    res.status(400).json({ error: 'Il file risulta vuoto.' });
    return;
  }
  if (buf.length > MAX_BYTES) {
    res.status(413).json({
      error: `File troppo grande (${(buf.length / 1024 / 1024).toFixed(1)}MB). Limite attuale: 4MB.`,
    });
    return;
  }

  const ext = (String(filename).split('.').pop() || '').toLowerCase();

  try {
    if (TEXT_EXTENSIONS.includes(ext)) {
      const text = buf.toString('utf8');
      res.status(200).json({ text, sheets: null });
      return;
    }

    if (SPREADSHEET_EXTENSIONS.includes(ext)) {
      const wb = XLSX.read(buf, { type: 'buffer' });
      const parts = [];
      wb.SheetNames.forEach((name) => {
        const sheet = wb.Sheets[name];
        // CSV per foglio: compatto e senza ambiguità di allineamento colonne, più affidabile da far
        // leggere al modello di una tabella markdown larga che si tronca facilmente.
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
        if (csv) parts.push(`## Foglio: ${name}\n${csv}`);
      });
      const text = parts.join('\n\n');
      if (!text) {
        res.status(200).json({ text: '(il file non contiene celle con dati leggibili)', sheets: wb.SheetNames });
        return;
      }
      res.status(200).json({ text, sheets: wb.SheetNames });
      return;
    }

    if (WORD_EXTENSIONS.includes(ext)) {
      // mammoth legge il .docx vero (zip + XML) — non il trucco "HTML con namespace Word" che usiamo
      // noi in uscita per l'export: se qualcuno riallega un file scaricato da RADIX stesso con quel
      // trucco (estensione .doc, non .docx), finisce nel ramo sotto e viene segnalato come non supportato.
      const result = await mammoth.extractRawText({ buffer: buf });
      const text = (result.value || '').trim();
      if (!text) {
        res.status(200).json({ text: '(il documento Word non contiene testo estraibile)', sheets: null });
        return;
      }
      res.status(200).json({ text, sheets: null });
      return;
    }

    if (PDF_EXTENSIONS.includes(ext)) {
      const data = await pdfParse(buf);
      const text = (data.text || '').trim();
      if (!text) {
        // Un PDF scansionato (foto di pagine) non ha testo selezionabile: pdf-parse legge solo testo
        // reale, non fa OCR — meglio dirlo chiaramente che restituire un testo vuoto senza spiegazione.
        res.status(200).json({
          text: '(il PDF non contiene testo selezionabile — probabilmente è una scansione/foto: servirebbe un OCR, che questa funzione non fa)',
          sheets: null,
        });
        return;
      }
      res.status(200).json({ text, sheets: null });
      return;
    }

    res.status(415).json({
      error: `Formato ".${ext}" non supportato. Formati accettati: .xlsx, .xls, .csv, .txt, .md, .docx, .pdf.`,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Errore durante la lettura del file: ' + (err && err.message ? err.message : String(err)),
    });
  }
};
