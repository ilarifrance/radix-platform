# RADIX Platform — brief completo per ChatGPT

> Scritto da Claude il 5 ottobre 2026 (sera), stato del codice: **v3.7** (commit `94f5159`, in produzione).
> Scopo: dare a ChatGPT, secondo agente del progetto (product design, UX/UI, architettura funzionale, contenuti, QA),
> tutto il contesto per lavorare su RADIX Platform senza accesso diretto al repository. Francesco decide; Claude sviluppa
> e verifica ogni proposta prima di implementarla; GitHub è la fonte unica della verità.

## 1. Che cos'è

RADIX Platform è la piattaforma multi-agente di **RADIX — Venture & Innovation Studio** (Francesco Ilari): una web app
in cui Francesco dà un compito a un **orchestratore** e una squadra di agenti AI (Claude, API Anthropic) lo scompone,
lo distribuisce, lo esegue in parallelo e consegna **documenti veri** (contratti, strategie, testi, pagine web
renderizzate), con il flusso di lavoro **visibile mentre gira** (stile dashboard Relevance AI). Nasce per il personal
branding e il lancio delle venture di Francesco (Doc Capital, Aura, RADIX stessa), ma dalla v3.3 lavora per
**qualunque progetto o brand** tramite profili "Progetto" precaricati nel contesto degli agenti.

- App: https://radix-platform.vercel.app (login con email e password; account creati da `admin.html`)
- Repo: https://github.com/ilarifrance/radix-platform (branch `main`, deploy automatico Vercel al push)
- Sito vetrina separato: https://radixinnovationstudio.com (link alla piattaforma come "in sviluppo")
- Brand: verde bosco `#0F2D24`, salvia `#6B7F72`, sabbia `#EDE6DE`, antracite `#1F1F1F`, avorio `#FAF9F6`; Montserrat + Inter; payoff "Dalle idee, imprese."

## 2. Architettura tecnica (com'è davvero)

Un solo frontend statico e funzioni serverless, nessun framework.

| File | Ruolo |
|---|---|
| `index.html` (~4.500 righe) | tutta l'interfaccia: login, sezione "Progetti e brand", roster degli agenti per area, chat per agente, flussi degli orchestratori (piano di lavoro, mappa degli agenti al lavoro, registro attività con tempi, ETA), schede Documento e Pagina web, anteprima sito in iframe sandbox, esportazioni, modalità Presentazione |
| `admin.html` | creazione/reset account e migrazione DB (protetta da `ADMIN_SECRET`) |
| `api/chat.js` (~1.750 righe) | il cuore: i system prompt di tutti gli agenti (`AGENTS`), i blocchi condivisi (protocolli, discipline professionali, regole legali), i profili progetto preset, la chiamata all'API Messages di Anthropic (`claude-sonnet-4-5-20250929`), continuazione, strumenti web per agente, rilevazione delle false affermazioni ("non posso creare file") |
| `api/state.js` | cronologia condivisa del team su Postgres (Neon), salvataggio parziale con merge `jsonb` (`patch`) |
| `api/parse-file.js` | allegati (.xlsx/.xls/.csv/.txt/.md, fino a 5 per messaggio, 4 MB) → testo per gli agenti |
| `api/buffer.js` | canali e messa in coda su Buffer (GraphQL `api.buffer.com`); **nessuna bozza**: la coda pubblica |
| `api/heygen.js` | bozza video avatar HeyGen dallo script dell'AI Specialist (avatar, voci, avvio, stato) |
| `api/openai-image.js` | sfondi fotografici per le slide del carosello (`gpt-image-1`, opzionale) |
| `api/send-email.js` | invio di **una** email per chiamata via SMTP Gmail (password per le app), solo dopo conferma esplicita |
| `api/auth/*`, `api/admin/*`, `api/_auth.js`, `api/_db.js` | sessioni (cookie JWT), account, Postgres |

Variabili d'ambiente su Vercel (le mette Francesco, mai Claude): `ANTHROPIC_API_KEY`, `DATABASE_URL`, `JWT_SECRET`,
`ADMIN_SECRET`, `BUFFER_ACCESS_TOKEN`, `HEYGEN_API_KEY`, `OPENAI_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`.
Costi: token Anthropic per messaggio (un flusso intero con 10–13 compiti costa qualche decina di centesimi),
immagini OpenAI a consumo, HeyGen a minuti; Neon gratuito.

Stato condiviso: **una cronologia per agente, condivisa da tutto il team** (non per progetto, non per persona).
"Nuova conversazione" cancella la cronologia di quell'agente per tutti (chiede conferma). Il profilo progetto
attivo è anch'esso condiviso.

## 3. Gli agenti (30) e come lavorano

Cinque aree nel roster. Gli **hub** (orchestratori) non scrivono mai documenti: smistano con un blocco
`---ROUTING---` (una riga per documento, `agente|compito|dipende:N`), gli specialisti lavorano a gruppi di 3
(`FLOW_CONCURRENCY`), il risultato di una riga può alimentare le successive, l'orchestratore chiude con una sintesi
(mai una riscrittura) e, se manca qualcosa, un altro giro (fino a 3).

- **Agenzia Marketing** — hub *Orchestratore Marketing*; Stratega di Marca e Campagne, Digital Strategist, Copywriter, Art Director, AI Specialist (avatar/video, prompt, automazioni), Social Media Manager, Specialista SEO e GEO, Content e UX Writer, Video Producer, Paid Media Specialist, Analytics e CRO; più la vecchia **Pipeline post** (catena fissa a 5 per un singolo post).
- **Area Amministrativa e Contabile** (studio commercialista virtuale) — hub *Orchestratore dello Studio*; Commercialista Senior, Commercialista Operativo, Contabilità, Lavoro e Paghe, Segreteria dello Studio.
- **Area Legale** — hub *Orchestratore Legale*; Esperto Privacy e GDPR, Esperto Contrattualistica IP e Creator, Esperto Diritto Bancario e Finanziario, Analista di Rischio Legale (rilegge sempre tutti i contratti, dipende da tutti).
- **Ufficio Commerciale** — hub *Orchestratore Commerciale*; Analista di Mercato e Strategia, Ricercatore di Contatti, Specialista Email Outreach, Responsabile CRM / Sales Ops.
- **Sviluppo** — Web Developer (codice vero; non pubblica da solo).

Regole che valgono per tutti e non si riaprono:
- Area Amministrativa e Legale producono **solo bozze, pareri e calcoli** da far validare a un professionista
  abilitato; mai l'affermazione di aver depositato/inviato qualcosa a enti (nessun accesso a Entratel, Uniemens, ComUnica).
- `PRO_DISCIPLINE` + `DOC_STANDARDS` (v3.1): qualificazione del caso prima del merito, norme solo se certe
  altrimenti "da verificare", valori datati, numeri con formula, "Dati mancanti e ipotesi" in ogni documento,
  un solo disclaimer. `LEGAL_DRAFTING_RULES` (v3.4): 13 regole di redazione e il Legal Pack modulare
  (NDA, accordo quadro, allegati A–E, patti parasociali).
- Ufficio Commerciale: base B2B (contatti di ruolo pubblicati, legittimo interesse, opt-out), **niente scraping
  LinkedIn, niente consumatori, mai email inventate**, invio email solo uno alla volta e su conferma.
- Ricerca web (`web_search`) solo per gli agenti che ne hanno bisogno e con un budget di ricerche per agente;
  `web_fetch` disattivato ovunque (consumava il budget di token prima che l'agente scrivesse: causa delle
  risposte troncate del 2/10).
- La data odierna e il profilo progetto attivo sono in testa a ogni system prompt.

## 4. Protocolli e meccanismi (per capire cosa l'interfaccia sa fare)

- **Documenti**: ogni deliverable sta tra `---DOCUMENTO: titolo---` e `---FINE DOCUMENTO---` → scheda Documento
  con Apri / Word / PDF / Markdown / Copia, visualizzatore a tutta pagina, pannello "Documenti prodotti in questa
  conversazione".
- **Pagine web**: il Web Developer consegna `---DOCUMENTO: nome.html---` (CSS/JS inline) → scheda "Pagina web" con
  anteprima vera in iframe, schede per pagina, navigazione tra i link, vista mobile 390 px, download del sito.
- **Continuazione automatica**: una risposta interrotta per limite di token riprende dalla parola esatta (fino a
  4 × 8.192 token), ogni parte è una chiamata serverless separata.
- **Guardie nel codice**: se un hub risponde con un testo a forma di documento invece di smistare, la risposta viene
  scartata e l'hub richiamato con l'obbligo di smistare; se nella cronologia un agente ha già detto "non posso creare
  file", il server antepone una correzione al prompt (le schede esistono).
- **Flusso che si ferma e riprende** (v3.7): il primo errore di conto API (credito esaurito, chiave, 503, rate limit)
  ferma la coda con un avviso in italiano e il pulsante "Riprova i compiti non riusciti"; i compiti fatti non si rifanno.
- **Registro attività** con tempi per nodo e durata totale; **Modalità Presentazione** (🎥) che nasconde roster e
  progetti per webinar e demo.
- **Progetti e brand**: schede con 10 campi (nome, tipo, descrizione, pubblico, posizionamento, voce e tono, canali,
  identità visiva, riferimenti, note e vincoli); preset RADIX, personal branding di Francesco, Doc Capital, Aura.
- **Caroselli**: l'Art Director emette un blocco `---SLIDES---` → PNG 1080×1350 generati in canvas con i colori del
  progetto; sfondi fotografici AI opzionali.

## 5. Storia recente (cosa è successo e perché)

- **28–30/9**: allegati, download, caroselli, Buffer, HeyGen; 10 agenti amministrativi; Web Developer.
- **2/10**: giornata dei documenti truncati nello Studio per Doc Capital → v3.0 (documenti, continuazione, project
  manager, salvataggio parziale), v3.1 (competenze e disciplina professionale), v3.2 (roster da 15 a 10, approvato).
- **3/10**: v3.3 (progetti/brand, Agenzia Marketing completa), v3.4 (regole legali, guardia sugli hub),
  v3.5 (anteprima sito, agenti di contenuto generali), v3.6 (Orchestratore Legale, registro, presentazione,
  Ufficio Commerciale per la demo contatti).
- **4/10**: 21 compiti legali falliti per credito API esaurito → v3.7 (coda che si ferma e riprende).
- **6/10, 12:00–13:00**: webinar GCP "AI a supporto dello sviluppo commerciale" (demo LeadGen di un partner, RADIX
  come concetto). Decisione del 5/10: **nessuna demo dal vivo**; si mostra un flusso già eseguito e verificato la sera
  prima (brief di una PMI: landing page + post LinkedIn + carosello) in modalità Presentazione.

Decisioni prese da Francesco (non riaprire senza di lui): roster accorpato a 10 per amministrativo/legale; niente
LinkedIn scraping né outreach automatico da email trovate online (la lead generation è affidata a un sistema
terzo); la parte commerciale/outreach di RADIX resta "assistita", mai massiva; Claude non gestisce mai chiavi API.

## 6. Prossimo blocco discusso il 5/10: RADIX autonoma per il personal branding

Richiesta di Francesco: caricare il suo **PED** (piano editoriale: 4 pilastri — Sviluppo business & vendita,
Direzione commerciale, Direzione generale, AI applicata al business; target commerciali, direttori commerciali,
imprenditori di PMI, marketing manager; LinkedIn + Facebook oggi) e farlo vivere su **Instagram, TikTok, Facebook e
YouTube**: 2–3 contenuti a settimana (un video, un post, un carosello), su YouTube video da ~10 minuti con "pillole"
di sviluppo commerciale basate sulla sua esperienza reale, tutto automatico e con avatar; un agente su **API Gemini**
per l'analisi della concorrenza; un agente collegato a **Buffer** (o simile) per report aggiornati.

Piano proposto da Claude (condiviso, da dettagliare dopo il webinar), in ordine:
1. **Calendario + produzione + approvazione**: PED importato (Excel già leggibile) in un calendario su Postgres; un
   job giornaliero (Vercel Cron) prepara i contenuti dei 2 giorni successivi in una coda "Da approvare"; Francesco
   approva/modifica/salta la sera prima; Buffer pubblica (LinkedIn, Facebook, Instagram, TikTok, YouTube Shorts).
   **L'approvazione resta sempre obbligatoria.**
2. **Base di conoscenza di Francesco** prima dell'automazione: script dei webinar, casi seguiti, post già scritti,
   un'intervista iniziale (8–10 domande per pilastro) salvata nel profilo progetto. Senza, i contenuti escono generici.
3. **Video brevi con avatar** (30–60 s, verticali) via API HeyGen già collegata; script dal Video Producer.
4. **YouTube lungo**: avatar + slide/B-roll, montaggio ffmpeg su un worker (Railway: le funzioni Vercel non reggono
   montaggi), upload via YouTube Data API. Partire da 3–4 minuti; verificare il costo al minuto HeyGen (voce principale).
5. **Agente concorrenza su Gemini**: secondo provider accanto ad Anthropic; valore nel grounding su Google Search.
6. **Report**: job settimanale che legge le metriche (Buffer dove le espone, altrimenti API YouTube/Meta), le scrive
   nel foglio "Risultati" del PED; l'agente Analytics propone il lunedì 2–3 aggiustamenti del piano.
   Da verificare: cosa espone davvero l'API Buffer sulle statistiche.

Punti aperti: account business Instagram/TikTok collegati a Buffer; progetto Google per l'API YouTube; costo HeyGen;
dove vive l'approvazione (in app, email o entrambe); cronologia per progetto (oggi è per agente, il calendario
editoriale la richiede per progetto).

## 7. Debito tecnico e limiti noti

- Cronologia per agente e condivisa (non per progetto né per persona); nessun ruolo/permesso tra account.
- "Nuova conversazione" è distruttiva per tutto il team.
- Gli agenti non sono processi indipendenti: lavorano dentro un flusso avviato dal browser (se si chiude la scheda
  durante un flusso, il flusso si ferma; il job schedulato del punto 6 risolve questo per il piano editoriale).
- Buffer: nessuna bozza, la coda pubblica; HeyGen: bozza video, non montaggio; Web Developer: codice, non deploy.
- Un solo modello (Claude Sonnet 4.5) per tutti gli agenti; nessun test automatico sui prompt; verifica fatta con
  backend finto + Chromium prima di ogni versione, poi dal vivo da Francesco.

## 8. Come lavorare insieme

- ChatGPT propone (UX, contenuti, flussi, test da fare, criticità nei documenti prodotti); Claude verifica contro il
  codice e implementa; Francesco decide. Le proposte vanno scritte con lo schema: *Schermata/area · Problema ·
  Proposta · Priorità*, una per voce, così Claude le può annotare con "Verifica Claude" (come in `AURA_UI_REVIEW.md`).
- Cosa non proporre: regole o agenti che richiedono dati che la piattaforma non ha; integrazioni che violano i termini
  di un servizio (LinkedIn) o il GDPR; automazioni che pubblicano senza approvazione; modifiche alle decisioni del §5.
- Per valutare un documento prodotto da RADIX, chiedere a Francesco il testo e il profilo progetto usato: il giudizio
  cambia molto se il profilo era vuoto.
- I file di questo brief vanno ricaricati nel progetto ChatGPT a mano quando cambiano: GitHub resta la fonte.
