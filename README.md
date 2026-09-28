# RADIX Platform — v2.3

La piattaforma multi-agente RADIX: una dashboard con i 5 agenti del team marketing (Digital Strategist,
Copywriter, Art Director, AI Specialist, Social Media Manager), un **orchestratore** che li fa lavorare
tutti e cinque in fila su un task condiviso, **account personali veri** (email + password), una
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

- `index.html` — l'interfaccia principale: login, roster dei 5+1 agenti, chat, modalità Orchestratore con
  stepper visivo, indicatore di chi è collegato e attribuzione d'autore sui messaggi/passi.
- `admin.html` — pagina separata (non collegata dal menu, va aperta direttamente) per inizializzare il
  database e creare/resettare gli account, protetta dall'admin secret.
- `api/chat.js` — funzione serverless Vercel che riceve il messaggio, verifica la sessione (cookie), applica
  il system prompt del ruolo scelto e chiama l'API Messages di Anthropic.
- `api/state.js` — legge/scrive la cronologia condivisa del team su Postgres (protetto da sessione).
- `api/parse-file.js` — riceve un file allegato dal frontend (base64) e lo trasforma in testo semplice
  (.xlsx/.xls foglio per foglio in CSV, .csv/.txt/.md letti direttamente), protetto da sessione.
- `api/heygen.js` — collega lo script dell'AI Specialist a una vera bozza di video HeyGen (avatar/voci,
  avvio generazione, stato); richiede `HEYGEN_API_KEY`, protetto da sessione.
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
   (Se questa è la primissima installazione: vedi la sezione "Come funziona l'accesso" sopra per creare il
   primo account dopo il deploy.)
3. Dopo il primo deploy con questo codice, apri `admin.html`, inserisci l'admin secret ed esegui la
   **migrazione** una volta sola prima di creare account o usare la piattaforma.

Per mettere online da zero un progetto nuovo, vale ancora la procedura generale: repository GitHub → Vercel
**Add New → Project** → Import (Framework preset "Other", nessun build command) → **Deploy** → aggiungi le
variabili d'ambiente sopra (le prime 4 sono obbligatorie, `HEYGEN_API_KEY` opzionale) → collega un database
Postgres (Neon, dal marketplace "Storage" di Vercel) → rifai il deploy → apri `admin.html` per la migrazione
e il primo account.

## Costi

Ogni messaggio inviato consuma token API a pagamento sul tuo account Anthropic (pochi centesimi a
conversazione con l'uso normale). L'Orchestratore ne consuma di più a ogni run perché chiama in sequenza 5
agenti diversi. Il database Neon ha un piano gratuito (0.5GB, sufficiente per la cronologia testuale di
questo utilizzo). Il pulsantino di stato in alto a destra fa solo un controllo gratuito sull'API Anthropic.

## Prossimi passi possibili (non ancora costruiti)

- Una cronologia privata per persona (oggi è unica e condivisa da tutto il team) o un merge più
  intelligente per il caso "due persone lavorano insieme nello stesso momento".
- Ruoli/permessi diversi tra gli account (oggi ogni account può fare tutto tranne le azioni da admin, che
  restano dietro l'admin secret separato).
- Un flusso di "password dimenticata" self-service (oggi il reset lo fa solo chi ha l'admin secret, dalla
  pagina `admin.html`).
- Invio diretto: oggi "Copia tutto il risultato" prepara il testo pronto, ma pubblicarlo resta un passo
  manuale (incollarlo su LinkedIn/Facebook o passarlo a HeyGen); un'integrazione diretta è un passo
  successivo, non necessario per iniziare a usarla davvero.
