# RADIX Platform — v3.6

La piattaforma multi-agente RADIX: una dashboard con i 5 agenti del team marketing (Digital Strategist,
Copywriter, Art Director, AI Specialist, Social Media Manager), un **orchestratore** che li fa lavorare
tutti e cinque in fila su un task condiviso, i 10 agenti dell'**Area Amministrativa e Contabile**
(uno studio commercialista virtuale, solo bozze/pareri da far rivedere a un professionista abilitato —
vedi sotto), **account personali veri** (email + password), una
**cronologia condivisa da tutto il team** su un database Postgres (non più solo nel browser di chi la usa),
e gli strumenti per **copiare, modificare, rigenerare e scaricare** il risultato — tutto collegato per
davvero a un modello Claude (Anthropic), non una demo finta.

**Cosa fa oggi**:
- Parli con un agente singolo a scelta, oppure dai un task all'**Orchestratore** ("prepara il post di
  lunedì sul tema X") e lui lo fa passare in automatico su tutti e 5 i ruoli: Digital Strategist →
  Copywriter → Art Director → AI Specialist → Social Media Manager, ognuno riceve il lavoro di chi lo
  precede (si vede lo stato passo-passo, e se un passo fallisce si ferma lì invece di proseguire con un
  input rotto).
- I 5 system prompt sono scritti con un framework professionale reale per ruolo, con un esempio concreto
  input→output ciascuno, e un controllo automatico di qualità che rileva aperture da "AI generica" e chiede
  una riscrittura prima di mostrare la risposta.
- Ogni passo completato ha i pulsanti **Copia**, **Modifica** e **Rigenera**; un passo fallito ha
  **Riprova**. Modificare o rigenerare un passo segna come "da aggiornare" i passi successivi già fatti,
  invece di ricalcolarli in automatico o lasciarli silenziosamente disallineati.
- A run finito, **Copia tutto il risultato** e **Scarica come file** (.txt) mettono insieme i 5 output.
- **Accesso con account reale**: all'apertura della pagina viene chiesto login con email e password (non
  più una passphrase unica condivisa). Gli account si creano dalla pagina `admin.html` (vedi sotto).
- **Cronologia condivisa dal team**: chat e run dell'Orchestratore non vivono più nel browser di chi li usa,
  ma in un database Postgres condiviso — chiunque nel team, da qualunque dispositivo, vede la stessa
  cronologia. Ogni messaggio/passo mostra chi l'ha scritto o aggiornato ("Ultimo aggiornamento di ...").
- In alto a destra si vede chi ha fatto login, con un pulsante **Esci** per disconnettersi.

## Come funziona l'accesso (account e database)

- **Creare/gestire account**: apri `admin.html` (es. `https://tuo-dominio/admin.html`), inserisci l'**admin
  secret** (il valore di `ADMIN_SECRET` configurato su Vercel — solo Francesco lo conosce) e da lì:
  1. **Esegui la migrazione** una volta sola (crea le tabelle nel database — è sicura da rieseguire, non
     tocca mai dati già esistenti, quindi in caso di dubbio si può rilanciare senza rischio).
  2. **Crea un account** per ogni persona del team: email, nome, password. Se inserisci di nuovo un'email
     già esistente, quell'account viene aggiornato (utile per resettare una password dimenticata).
- **Fare login**: ogni persona apre `index.html` e inserisce la propria email e password. Da lì in avanti
  resta collegata (sessione salvata in un cookie) finché non preme **Esci** o non passano 30 giorni.
- **Un'unica cronologia condivisa, non una per persona**: la scelta è stata di visibilità condivisa (tutto
  il team vede la stessa chat/pipeline) con gli account che servono solo a sapere *chi* ha scritto/aggiornato
  cosa — non a dare a ciascuno una cronologia privata separata.
- **Limite noto — "vince l'ultimo che salva"**: se due persone lavorano nello stesso momento sullo stesso
  agente o sullo stesso run dell'Orchestratore, chi salva per ultimo sovrascrive quello che l'altro aveva
  appena fatto (non c'è ancora un merge intelligente tra modifiche in conflitto). Per l'uso previsto — un
  team piccolo che normalmente non lavora in contemporanea sulla stessa identica conversazione — è un
  compromesso accettabile; se in futuro serve, si può risolvere con una cronologia per persona o con un
  sistema di versioning più sofisticato.

## Changelog

**v3.6** — **Orchestratore Legale, registro attività e modalità presentazione** (notte del 3/10, per il webinar del 6/10). (1) **Orchestratore Legale** (`legal-orchestrator`, hub dell'Area Legale): punto d'ingresso per contratti, privacy, bancario e immagine; non scrive mai documenti, smista a Contrattualista / Privacy / Bancario (e, per patti parasociali e lavoro subordinato, al Commercialista Senior e a Lavoro e Paghe dello Studio), un documento per riga e per categoria di controparte, e chiude sempre con l'Analista di Rischio che dipende da tutti i contratti; vale la stessa guardia nel codice degli altri hub. L'Area Legale nel roster ora è un hub con i suoi specialisti. (2) **Registro attività** sotto la mappa degli agenti: una riga per evento con l'ora — piano con numero di compiti e parallelismo, chi inizia cosa (e da chi riceve il materiale), chi consegna cosa e in quanto tempo, i passaggi di consegne ("il risultato di #1 va a …"), gli errori, la chiusura con durata totale; sopra, "in corso da … · circa … ancora" (stima dalla media dei compiti finiti) e, a fine flusso, la durata totale. Il registro è salvato nel flusso (`flow.log`, `startedAt`/`endedAt` per flusso e nodo). (3) **Modalità presentazione** (pulsante 🎥 nell'intestazione della chat, preferenza per browser): nasconde intro, progetti, roster e suggerimenti; restano conversazione, piano, agenti al lavoro, registro e documenti, con nodi più grandi. (4) Parallelismo dei flussi da 2 a 3 (`FLOW_CONCURRENCY`); Orchestratore Commerciale a 2.500 token per blocchi di smistamento lunghi; anteprima sito: schede senza duplicati, Esc anche dentro l'anteprima, icona 🌐 nel pannello documenti. Verificato con backend finto + Chromium (guardia sugli hub, flusso con dipendenze, registro, anteprima, presentazione).

**v3.5** — **Anteprima sito e agenti di contenuto a tutto campo** (Francesco, 3/10, in vista del webinar del 6/10). (1) **Anteprima sito**: il Web Developer consegna ogni pagina HTML come scheda "Pagina web" (`---DOCUMENTO: index.html---`, protocollo `WEB_PAGE_PROTOCOL` in `api/chat.js`: una pagina per blocco, CSS/JS inline, niente immagini esterne, link tra pagine con i nomi file) e la piattaforma la renderizza dal vero in un iframe sandbox (`openSitePreview` in `index.html`): schede per ogni pagina della conversazione, navigazione tra le pagine cliccando i link del sito (postMessage), vista mobile a 390px, "Apri in una scheda", download della singola pagina o di tutto il sito, vista codice. La scheda riconosce una pagina dal nome `.html` o da un documento HTML completo (anche dentro un recinto ```html). (2) **Digital Strategist, Copywriter, Art Director e AI Specialist** non sono più tarati sul singolo post del personal branding: lavorano per qualunque progetto e su tutto il perimetro del ruolo (strategia dei contenuti e piani editoriali; ogni tipo di testo, dalle sequenze email alle pagine di vendita; identità visiva, template, brief e prompt per generatori di immagini; video con avatar, pacchetti di prompt, automazioni e assistenti), con protocollo documenti e 6.000 token; nella "Pipeline post" restano brevi perché è il prompt del passo a chiederlo. Roster dell'Orchestratore Marketing aggiornato di conseguenza. (3) Nei flussi, lo stesso ruolo chiamato più volte è numerato ("Content e UX Writer · 2 di 4").

**v3.4** — **Area Legale: regole di redazione e guardia sugli orchestratori** (Francesco, 3/10: l'NDA e il contratto collaboratori di Doc Capital, riletti da un altro modello, avevano errori ricorrenti — e li aveva scritti l'Orchestratore dello Studio in prima persona, "uno per messaggio, copia e salva", saltando Contrattualista e Analista di Rischio). (1) **Profilo Doc Capital corretto**: S.r.l. in corso di costituzione con sei soci (non "fondata da Francesco Ilari"), contratti intestati alla società e da usare dopo la costituzione, prezzi 900€ waiting list / 2.800€ corso completo marcati come dati commerciali riservati da non riportare in NDA e contratti. (2) **`LEGAL_DRAFTING_RULES`** in `api/chat.js`, 13 regole condivise da tutti gli agenti legali (chi scrive e chi rilegge): fatti solo dal profilo o dal task; niente prezzi nelle clausole; un documento per categoria di controparte (autonomi 2596 c.c. in analogia, subordinati 2125 c.c., agenti 1751-bis c.c., soci → patti parasociali); penali proporzionate con "violazione autonoma" e nota ex art. 1384 c.c.; non concorrenza con perimetro ristretto, 6-12 mesi e corrispettivo a formula; IP come cessione dei diritti patrimoniali con corrispettivo incluso e autorizzazione alle modifiche al posto della (nulla) rinuncia ai diritti morali; background IP, open source, dataset, strumenti AI; account aziendali con MFA invece della consegna delle password; autorizzazione immagine/voce/nome (art. 10 c.c., 96-97 LDA, AI Act art. 50); divulgazioni obbligatorie, breach notice, clausola "nessuna licenza"; DPA art. 28 GDPR; clausola di condotta per il settore finanziario; **Legal Pack modulare** (01 NDA, 02 Accordo quadro, Allegati A Attività e compenso, B Non concorrenza, C IP e software, D Immagine e voce, E Nomina GDPR, più patti parasociali per i soci). Il Contrattualista ha la struttura del Master Agreement e quattro clausole pronte (violazione autonoma, diritti morali, nessuna licenza, divulgazioni obbligatorie). (3) **Orchestratore dello Studio**: esempio 3 riscritto sul Legal Pack (11 righe, patti parasociali al Commercialista Senior) e regola fissa: ogni smistamento di contratti termina con una riga `legal-risk-analyst` che dipende da tutti i contratti. (4) **Guardia nel codice** (`index.html`, `looksLikeDraftedDocument`): se un hub risponde senza blocco `---ROUTING---` con un testo che ha la forma di un documento (articoli numerati, `---DOCUMENTO`, "copia e salva", "DOCUMENTO 2/11", o oltre 4.500 caratteri), la risposta viene scartata e l'orchestratore richiamato una volta con l'obbligo di smistare — le regole nel prompt da sole non avevano retto all'insistenza dell'utente.

**v3.3** — **profili Progetto/Brand e Agenzia Marketing completa** (richiesto da Francesco il 3/10). (1) Nuova sezione **"Progetti e brand"** in cima alla pagina: schede per ogni progetto (RADIX, personal branding di Francesco, Doc Capital e Aura seminati come preset modificabili, più quelli creati con "+ Nuovo progetto"), con un modulo a 10 campi (nome, tipo, descrizione, pubblico, posizionamento, voce e tono, canali, identità visiva, riferimenti, note e vincoli). Il profilo attivo si sceglie dalla scheda o dal selettore "Progetto" nell'intestazione della chat e della pipeline, è condiviso con il team (campi `projects` e `activeProject` nello stato) e viene inviato con **ogni** chiamata a `/api/chat` (`project`): `api/chat.js` lo mette in testa al system prompt di qualunque agente (`projectContextBlock`), con la regola che il profilo prevale sulle abitudini del ruolo e che i dati mancanti vanno dichiarati, non inventati. Il vecchio campo `brand` (radix/personal) resta solo come fallback e per la grafica dei caroselli, che ora usano nome e palette del progetto attivo. (2) **Agenzia Marketing** al posto della sola pipeline a 5: nuovo **Orchestratore Marketing** (hub con `---ROUTING---` e `dipende:N`, come lo Studio) e sei specialisti nuovi — **Stratega di Marca e Campagne**, **Specialista SEO e GEO** (ricerca parole chiave, architettura e SEO tecnica, dati strutturati, ottimizzazione per ChatGPT/Perplexity/AI Overviews, audit), **Content e UX Writer** (struttura e testi di sito, landing, schede store), **Video Producer** (sceneggiature, storyboard, shot list, serie e avatar), **Paid Media Specialist**, **Analytics e CRO** — tutti con metodo di lavoro, standard del deliverable (schede Documento) e sezione "Dati mancanti e ipotesi"; ricerca web solo dove serve e senza `web_fetch` (`tools: "search"`). La vecchia catena resta come **"Pipeline post"**. (3) Competenze **multi-progetto**: i prompt dei cinque agenti della pipeline, del Web Developer (ora con metodo di progetto: architettura, SEO tecnica, accessibilità, cookie/consensi, deploy e checklist) e i contesti condivisi di Studio, Area Legale e Ufficio Commerciale non assumono più RADIX o Francesco come soggetto: voce, pubblico, canali e palette arrivano dal profilo. Lo sfondo Doc Capital non è più cablato nei prompt amministrativi e legali: è il profilo progetto "Doc Capital". In `index.html` gli orchestratori con smistamento sono riconosciuti da `hub: true` nel roster (`isHubAgent`), non più da un elenco fisso.

**v3.2** — **roster accorpato** (approvato da Francesco il 2/10): da 15 a 10 agenti nelle aree amministrativa e legale. Commercialista Junior + Praticante → **Commercialista Operativo**; Responsabile Contabile + Addetto Senior + Addetto Junior → **Contabilità**; Consulente del Lavoro + Addetto Paghe → **Lavoro e Paghe**; Esperto Diritto d'Immagine assorbito da **Esperto Contrattualistica, IP e Creator**. Restano Orchestratore dello Studio, Commercialista Senior, Segreteria, Esperto GDPR, Esperto Diritto Bancario, Analista di Rischio. Nessuna competenza persa: i prompt sono fusi, non tagliati. Gli identificativi vecchi restano validi come alias (`AGENT_ALIASES` in `api/chat.js` e `index.html`): le conversazioni già salvate passano automaticamente al nuovo agente al primo caricamento e i flussi salvati con i vecchi ruoli restano leggibili.

**v3.1** — **competenze degli agenti**. Francesco (2/10) ha rilevato che i documenti prodotti, riletti su Claude, avevano criticità ricorrenti. In `api/chat.js`: (1) blocco condiviso `PRO_DISCIPLINE` per tutta l'Area Amministrativa e Legale — qualificazione del caso prima del merito, riferimenti normativi solo se certi (mai inventati, "da verificare" altrimenti), valori che cambiano nel tempo sempre con anno e nota di verifica, numeri con formula e quadrature, segnaposto standard + elenco "Dati mancanti", rischio principale in evidenza, autoverifica finale silenziosa (completezza, coerenza di definizioni/numerazione/date, nessun invio dichiarato, un solo disclaimer); (2) `DOC_STANDARDS`: struttura obbligatoria per contratti, pareri, informative, checklist e calcoli; (3) approfondimenti di metodo per ciascun ruolo (tax planning e abuso del diritto, operazioni straordinarie, contenzioso, IVA/OSS per i servizi digitali di Doc Capital; OIC e riconciliazione civilistico-fiscale; calendario fiscale; liquidazione IVA con reverse charge/split/pro-rata e codici tributo; scritture di prima nota; tipologie contrattuali, costo del lavoro e cessazioni; netto in busta e TFR con formula esatta; parcella e solleciti; GDPR per marketing/cookie/DPA/AI; Codice del Consumo e e-commerce per i T&C del corso, SaaS, NDA, collaboratori; confine educazione/consulenza finanziaria e MAR; pubblicità occulta, liberatorie, contenuti AI; controlli aggiuntivi del risk analyst; qualità per Ufficio Commerciale e Web Developer); (4) la **data odierna** (fuso italiano) è iniettata in testa a ogni system prompt — prima il modello non sapeva in che anno fosse; (5) lo sfondo Doc Capital arriva anche agli agenti amministrativi; (6) budget alzati dove erano stretti (Web Developer 8192, analista di mercato 3000, ecc.). In `index.html` il renderer Markdown supporta i blocchi di codice ```…``` (prima il codice del Web Developer veniva spezzato in paragrafi).

**v3.0** — **generazione documenti definitiva e flusso di lavoro visibile (stile Relevance AI)**. Quattro cambi che rispondono ai problemi visti dal vivo il 2/10 (risposte troncate, "non posso creare file scaricabili", documenti sepolti dentro i nodi del flusso, conversazioni che "tornavano indietro"):

1. **Continuazione automatica** (`fetchAgentReply()` in `index.html`): se una risposta si interrompe per limite di spazio, il browser richiama `/api/chat` con il testo già scritto come ultimo messaggio "assistant" (prefill) e il modello riprende dalla parola esatta in cui si era fermato; le parti vengono ricucite (fino a 4 × 8192 token). Ogni parte è una chiamata serverless separata, quindi nessun timeout Vercel anche per un contratto lunghissimo. Il server (`api/chat.js`) non aggiunge più l'avviso "⚠️ Risposta troncata" al testo: restituisce solo `truncated: true`.
2. **Protocollo documenti** (`DOCUMENT_PROTOCOL` in `api/chat.js`): gli agenti amministrativi e legali racchiudono ogni deliverable tra `---DOCUMENTO: titolo---` e `---FINE DOCUMENTO---`. La pagina lo trasforma in una **scheda Documento** (titolo, autore, parole, pulsanti **Apri / Word / PDF / Markdown / Copia**) con un visualizzatore a tutta pagina — come un artifact di Claude/ChatGPT. Le esportazioni Word e PDF ora rispettano titoli, elenchi, grassetti e tabelle (prima: un paragrafo piatto con gli asterischi dentro). Tutta la chat è renderizzata in Markdown. Un pannello **"Documenti prodotti in questa conversazione"** in cima alla chat raccoglie ogni deliverable, anche quelli nati nei nodi del flusso.
3. **Orchestratore come project manager**: il blocco `---ROUTING---` accetta una riga per ogni documento da produrre (anche 10-12, stesso ruolo ripetuto) e un terzo campo opzionale `dipende:N` — il compito riceve il risultato delle righe indicate e parte solo quando sono pronte (es. l'Analista di Rischio che rilegge i contratti appena scritti). Gli specialisti lavorano a gruppi di 2 (`FLOW_CONCURRENCY`), con stato live per nodo ("in attesa", "in corso · parte 2…", "fatto · 1 documento"). La scheda **Piano di lavoro** mostra le tre fasi: piano → agenti al lavoro → consegna. La sintesi finale non riscrive i documenti (sono già consegnati), fa il punto e, se mancano pezzi, smista un altro giro (fino a 3). Una nota nascosta nella cronologia ricorda all'Orchestratore cosa è stato consegnato, così "dove sono i file?" ha una risposta vera.
4. **Salvataggio parziale dello stato** (`api/state.js`, campo `patch`): ogni browser manda solo le cronologie degli agenti che ha toccato e il server le fonde con il dato esistente (`jsonb` merge). Prima rispediva l'intero blob e "l'ultimo che salva vince": con due schede aperte si sovrascrivevano a vicenda. "Nuova conversazione" chiede conferma e ricorda quanti documenti contiene la chat; tornando sulla scheda dopo un po', lo stato condiviso viene ricaricato.

**v2.6** — **invio diretto a Buffer**: nel pannello finale dell'Orchestratore ("Deciso dal Social Media Manager") e nella chat singola del Copywriter c'e' ora un pulsante **"Invia a Buffer"** che chiama `api/buffer.js` (nuovo), mostra i canali Buffer collegati, un'anteprima del testo modificabile, e mette il post davvero in coda di pubblicazione su Buffer dopo una conferma esplicita (non e' una bozza innocua: Buffer non offre un vero stato "bozza" nella sua API pubblica, il post va nella prossima posizione libera del calendario e viene pubblicato a quel punto). Richiede `BUFFER_ACCESS_TOKEN` (vedi sotto) — senza quella variabile il resto della piattaforma funziona comunque, quel pulsante mostra solo un errore chiaro. Aggiunta anche una nuova area **"Area Amministrativa e Contabile"** nel roster: 10 agenti (Titolare/Partner, Commercialista Senior, Commercialista Junior, Praticante, Responsabile Team Contabile, Addetto Contabilita' Senior/Junior, Consulente del Lavoro, Addetto Paghe, Segretaria di Studio) che affiancano il team marketing — vedi la sezione dedicata piu' sotto per il perche' restano volutamente solo bozze/pareri da far rivedere a un professionista abilitato, mai invii reali a enti. Aggiunto anche un agente **Web Developer** (gruppo "Sviluppo" nel roster) che scrive codice vero (pagine HTML/CSS/JS, componenti, script) pronto all'uso — non pubblica/deploya nulla in autonomia, consegna il codice e i passi per metterlo online manualmente.

**v2.5** — due correzioni segnalate testando la v2.4 dal vivo:

1. **Sfondi fotografici AI per il carosello**: sulla galleria di slide (dopo "Genera immagini carosello")
   c'è ora un pulsante **"Genera sfondi fotografici AI (beta)"** che chiama `api/openai-image.js` (nuovo —
   Images API di OpenAI, `gpt-image-1`) una slide alla volta, genera una foto/illustrazione coerente col
   testo di quella slide e la usa come sfondo (cover-fit + overlay scuro in basso per il contrasto del
   testo) al posto del bagliore piatto. Richiede `OPENAI_API_KEY` (vedi sotto) — senza quella variabile il
   resto della pagina funziona comunque, quel pulsante mostra solo un errore chiaro invece di rompersi.
   **Attenzione**: è una API key a consumo da creare su platform.openai.com con billing attivo, separata
   dall'abbonamento ChatGPT Plus (che non dà accesso automatico alle API).
2. **Selettore "Brand del task" (RADIX vs Personal branding)**: sopra il campo dove si scrive il task
   dell'Orchestratore c'è ora un menu a tendina — di default "RADIX (studio)", oppure "Personal branding
   (Francesco Ilari)". Prima ogni contenuto generato dava per scontato che il soggetto fosse sempre RADIX
   come azienda (il testo lo nominava, e ogni slide del carosello aveva la scritta "RADIX" in alto a
   sinistra) anche quando il task era in realtà personal branding di Francesco come professionista — un
   post su di lui, non sull'azienda. Scegliendo "Personal branding": gli agenti ricevono un'istruzione in
   più nel system prompt (non nominare "RADIX", scrivere in prima persona come Francesco) e la scritta
   sulle slide del carosello diventa "FRANCESCO ILARI" invece di "RADIX". La scelta resta salvata per task
   (persistita come il resto dello stato condiviso) e non si può cambiare mentre un run è in corso.

**v2.4** — le immagini del carosello non sono più un rettangolo di colore pieno con testo sopra: ora hanno
un bagliore radiale che alterna angolo slide per slide (profondità senza foto), un badge numerato al posto
del numero piatto, un accento ad arco nell'angolo opposto, puntini di avanzamento in basso (si vede quante
slide compongono il carosello e a che punto si è, come nei caroselli nativi di Instagram/LinkedIn), un
invito "scorri →" sulla prima slide, e la dimensione del testo ora si adatta alla lunghezza invece di
restare fissa. Tutto ancora nei 5 colori RADIX, nessuna immagine esterna o API aggiuntiva richiesta.

**v2.3** — a run finito dell'Orchestratore, in fondo compare un riquadro **"Deciso dal Social Media
Manager — cosa creare ora"**: mostra la sua decisione (canale/formato/orario) e il pulsante di creazione
giusto già pronto — immagini carosello se ha scelto un carosello, video bozza HeyGen se ha scelto un video
— senza dover scendere fino al passo dell'Art Director o dell'AI Specialist per trovarlo. Risponde alla
domanda "chi fa cosa": Digital Strategist decide la direzione, Copywriter scrive, Art Director e AI
Specialist preparano il materiale (direzione visiva e copione), Social Media Manager decide canale/formato/
orario — la creazione vera e propria (immagini o video) resta un'azione esplicita di chi usa la piattaforma,
innescata da un pulsante, non automatica: questo riquadro la rende solo più facile da trovare.

**v2.2** — nell'Orchestratore, ogni passo completato ha ora un campo **"Rispondi a [agente]"**: se un
agente fa una domanda o segnala che manca qualcosa (es. un post troncato), si può rispondere lì invece di
dover riscrivere tutto a mano col tasto "Modifica" — la risposta torna a quello stesso agente insieme al
task e al lavoro già fatto, e marca come "da aggiornare" i passi successivi come una rigenerazione normale.
Alzato il limite di lunghezza risposta di tutti e 5 gli agenti (in particolare il Copywriter, 900→2400) per
evitare che un task con più post insieme tagliasse il testo a metà; se dovesse succedere comunque, ora è
segnalato in modo visibile in coda alla risposta invece di restare un troncamento silenzioso che si
propaga rotto ai passi successivi.

**v2.1** — si può **allegare un file** (.xlsx, .xls, .csv, .txt, .md) a un messaggio o a un task
dell'Orchestratore, letto da `api/parse-file.js` e incluso nel contesto inviato all'agente; l'Art Director
produce anche le **immagini reali del carosello** (PNG, palette RADIX, scaricabili una per una o tutte
insieme), generate lato browser da una direzione visiva strutturata che il modello ora restituisce assieme
al testo; l'AI Specialist può generare una **vera bozza di video HeyGen** dal proprio copione (scelta
avatar/voce, generazione, attesa e anteprima direttamente in pagina) tramite `api/heygen.js` — richiede la
variabile d'ambiente opzionale `HEYGEN_API_KEY`.

**v2.0** — sostituita la passphrase condivisa con **account reali per persona** (email + password, hashing
scrypt, sessione via cookie firmato); sostituito il salvataggio locale (localStorage) con una **cronologia
condivisa su Postgres** (Neon, collegato al progetto Vercel), vista identica da tutto il team; aggiunta
l'**attribuzione d'autore** (chi ha scritto un messaggio o aggiornato un passo della pipeline è visibile in
UI); nuova pagina `admin.html` per inizializzare il database e creare/resettare gli account, protetta da un
admin secret separato dagli account utente.

**v1.2** — i 5 system prompt condividono ora un unico blocco di contesto RADIX (pilastri editoriali,
pubblici, descrizione azienda) invece di ripeterlo leggermente diverso in ognuno; ogni agente ha un esempio
concreto input→output; controllo automatico di qualità (Strategist, Copywriter, AI Specialist) che rileva
aperture o espressioni da "AI generica" nella prima risposta e chiede una riscrittura in automatico prima
di mostrarla; la risposta dell'API include anche il conteggio token usato.

**v1.1** — i 5 system prompt riscritti con un framework professionale reale dietro ogni ruolo; parametri
`max_tokens`/`temperature` calibrati per ruolo; modifica manuale di un passo della pipeline; rigenera/riprova
per singolo passo con segnalazione "da aggiornare" sui passi successivi; scarica il risultato come file;
rigenera l'ultima risposta anche nella chat singola; conteggio caratteri sui post del Copywriter;
ritentativo automatico su un errore di rete/server transitorio.

**v1** — orchestratore a 5 passi, accesso con passphrase opzionale, salvataggio locale, copia per
passo/risultato completo, reset di chat e pipeline.

## Cosa c'è dentro

- `index.html` — l'interfaccia principale: login, roster dei 5+1 agenti marketing più i 10 dell'Area
  Amministrativa e Contabile (sezione separata nel roster), chat, modalità Orchestratore con
  stepper visivo, indicatore di chi è collegato e attribuzione d'autore sui messaggi/passi.
- `admin.html` — pagina separata (non collegata dal menu, va aperta direttamente) per inizializzare il
  database e creare/resettare gli account, protetta dall'admin secret.
- `api/chat.js` — funzione serverless Vercel che riceve il messaggio, verifica la sessione (cookie), applica
  il system prompt del ruolo scelto (16 in tutto: 5 marketing + 10 Area Amministrativa e Contabile + 1
  Web Developer) e
  chiama l'API Messages di Anthropic. Gli agenti amministrativi condividono un blocco `ADMIN_CONTEXT`
  che li vincola a produrre sempre bozze/pareri/calcoli di supporto, mai l'affermazione di aver
  presentato/depositato qualcosa per davvero presso Agenzia delle Entrate, INPS o Registro Imprese —
  nessun accesso a sistemi telematici reali (Entratel/Fisconline, Uniemens, ComUnica); ogni output resta
  da far validare e firmare da un professionista iscritto all'albo prima di un uso reale.
- `api/state.js` — legge/scrive la cronologia condivisa del team su Postgres (protetto da sessione).
- `api/parse-file.js` — riceve un file allegato dal frontend (base64) e lo trasforma in testo semplice
  (.xlsx/.xls foglio per foglio in CSV, .csv/.txt/.md letti direttamente), protetto da sessione.
- `api/heygen.js` — collega lo script dell'AI Specialist a una vera bozza di video HeyGen (avatar/voci,
  avvio generazione, stato); richiede `HEYGEN_API_KEY`, protetto da sessione.
- `api/openai-image.js` — genera uno sfondo fotografico/illustrato per una slide del carosello tramite le
  Images API di OpenAI (`gpt-image-1`); richiede `OPENAI_API_KEY`, protetto da sessione.
- `api/buffer.js` — collega il testo pronto del Copywriter a un vero post in coda su Buffer (elenco canali, creazione post); richiede `BUFFER_ACCESS_TOKEN`, protetto da sessione.
- `api/auth/login.js`, `logout.js`, `me.js` — login (email+password → cookie di sessione), logout, e "chi
  sono" per sapere se una sessione è ancora valida.
- `api/admin/migrate.js` — crea le tabelle del database (idempotente, protetto da admin secret).
- `api/admin/users.js` — elenca/crea/resetta gli account (protetto da admin secret).
- `api/_db.js`, `api/_auth.js` — helper condivisi: connessione al database Postgres e logica di hashing
  password/sessione, usati da tutti gli endpoint sopra.
- `package.json` — dichiara la dipendenza `@neondatabase/serverless` usata per parlare con il database.

## Come metterla online (o aggiornarla)

Il progetto Vercel e il database Postgres (Neon) sono già configurati. Per aggiornare il codice:

1. Carica il contenuto di questa cartella nel repository GitHub collegato a Vercel (sostituendo i file
   esistenti) — Vercel fa il deploy automaticamente a ogni commit.
2. Verifica che sul progetto Vercel (**Settings → Environments → Production**) siano presenti queste
   variabili d'ambiente:
   - `ANTHROPIC_API_KEY` — la chiave Anthropic, da [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).
   - `DATABASE_URL` — creata automaticamente collegando il database Neon al progetto.
   - `JWT_SECRET` — una stringa segreta a caso, usata per firmare le sessioni di login.
   - `ADMIN_SECRET` — una stringa segreta a caso, diversa da `JWT_SECRET`, usata per proteggere `admin.html`.
   - `HEYGEN_API_KEY` — (opzionale, serve solo per il pulsante "Genera video bozza" dell'AI Specialist) la
     chiave dal tuo account HeyGen: **app.heygen.com → Settings → API Keys**. Senza questa variabile il
     resto della piattaforma funziona comunque, quel singolo pulsante risponde con un errore chiaro.
   - `OPENAI_API_KEY` — (opzionale, serve solo per il pulsante "Genera sfondi fotografici AI" sulle slide
     del carosello) una chiave API creata su **platform.openai.com → API keys**, con billing attivo su
     quell'account — **non è lo stesso account/abbonamento di ChatGPT Plus**, va creata/pagata a parte.
     Senza questa variabile il resto della piattaforma funziona comunque, quel singolo pulsante risponde
     con un errore chiaro.
   - `BUFFER_ACCESS_TOKEN` — (opzionale, serve solo per il pulsante "Invia a Buffer") il token dal tuo
     account Buffer: **Settings → API** su publish.buffer.com. **Attenzione**: una volta configurato, il
     pulsante mette per davvero un post in coda di pubblicazione su Buffer (non e' una bozza) — fai un
     primo test con un canale/post non critico prima di usarlo per contenuti veri. Senza questa variabile
     il resto della piattaforma funziona comunque, quel singolo pulsante risponde con un errore chiaro.
   (Se questa è la primissima installazione: vedi la sezione "Come funziona l'accesso" sopra per creare il
   primo account dopo il deploy.)
3. Dopo il primo deploy con questo codice, apri `admin.html`, inserisci l'admin secret ed esegui la
   **migrazione** una volta sola prima di creare account o usare la piattaforma.

Per mettere online da zero un progetto nuovo, vale ancora la procedura generale: repository GitHub → Vercel
**Add New → Project** → Import (Framework preset "Other", nessun build command) → **Deploy** → aggiungi le
variabili d'ambiente sopra (le prime 4 sono obbligatorie, `HEYGEN_API_KEY`/`OPENAI_API_KEY`/`BUFFER_ACCESS_TOKEN` opzionali) →
collega un database Postgres (Neon, dal marketplace "Storage" di Vercel) → rifai il deploy → apri
`admin.html` per la migrazione e il primo account.

## Costi

Ogni messaggio inviato consuma token API a pagamento sul tuo account Anthropic (pochi centesimi a
conversazione con l'uso normale). L'Orchestratore ne consuma di più a ogni run perché chiama in sequenza 5
agenti diversi. Il database Neon ha un piano gratuito (0.5GB, sufficiente per la cronologia testuale di
questo utilizzo). Il pulsantino di stato in alto a destra fa solo un controllo gratuito sull'API Anthropic.
Ogni sfondo fotografico AI generato per una slide del carosello (v2.5, pulsante opzionale) consuma
un'immagine a pagamento sul tuo account OpenAI — un carosello da 5 slide sono 5 immagini per click su
"Genera sfondi fotografici AI" (o "Rigenera").

## Prossimi passi possibili (non ancora costruiti)

- Una cronologia privata per persona (oggi è unica e condivisa da tutto il team) o un merge più
  intelligente per il caso "due persone lavorano insieme nello stesso momento".
- Ruoli/permessi diversi tra gli account (oggi ogni account può fare tutto tranne le azioni da admin, che
  restano dietro l'admin secret separato).
- Un flusso di "password dimenticata" self-service (oggi il reset lo fa solo chi ha l'admin secret, dalla
  pagina `admin.html`).
- Invio diretto ad altri canali oltre Buffer/HeyGen: oggi copre pubblicazione social (Buffer) e bozza
  video avatar (HeyGen); Higgsfield e altri strumenti restano da valutare.
- L'agente **Web Developer** oggi scrive codice pronto (pagine, componenti, script) ma non lo pubblica da solo: costruire/pubblicare un sito o un'app intera in autonomia, passo dopo passo, resta un progetto multi-sessione, non un singolo task.
- Agenti indipendenti/paralleli (oggi ogni agente lavora un task alla volta, in sequenza nell'Orchestratore).
- **Deliberatamente non costruito**: integrazione con LinkedIn per verificare target di un'azione
  commerciale (violerebbe i Termini di Servizio di LinkedIn) e ricerca automatica di email pubbliche +
  invio di outreach via email personalizzata (rischio di non conformità GDPR per un'attività con base in
  Italia) — la parte commerciale/lead-gen resta affidata a un sistema terzo già individuato separatamente.
