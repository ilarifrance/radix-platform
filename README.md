# RADIX Platform — v1.1

La piattaforma multi-agente RADIX: una dashboard con i 5 agenti del team marketing (Digital Strategist,
Copywriter, Art Director, AI Specialist, Social Media Manager), un **orchestratore** che li fa lavorare
tutti e cinque in fila su un task condiviso, un **accesso protetto opzionale**, il **salvataggio locale**
delle conversazioni e gli strumenti per **copiare, modificare, rigenerare e scaricare** il risultato —
tutto collegato per davvero a un modello Claude (Anthropic), non una demo finta.

**Cosa fa oggi**:
- Parli con un agente singolo a scelta, oppure dai un task all'**Orchestratore** ("prepara il post di
  lunedì sul tema X") e lui lo fa passare in automatico su tutti e 5 i ruoli: Digital Strategist →
  Copywriter → Art Director → AI Specialist → Social Media Manager, ognuno riceve il lavoro di chi lo
  precede (si vede lo stato passo-passo, e se un passo fallisce si ferma lì invece di proseguire con un
  input rotto).
- I 5 system prompt sono scritti con un framework professionale reale per ruolo (funnel e job-to-be-done
  per lo Strategist, tecniche di direct-response per il Copywriter, storytelling visivo per l'Art
  Director, script per avatar parlati per l'AI Specialist, content-format-fit per il Social Media
  Manager), non semplici descrizioni di ruolo — pensati per uscire da un tono "AI generico".
- Ogni passo completato ha i pulsanti **Copia**, **Modifica** (correggi il testo a mano prima che vada
  avanti nella pipeline) e **Rigenera** (richiama di nuovo l'agente su quel passo); un passo fallito ha
  **Riprova**. Se modifichi o rigeneri un passo, i passi successivi già fatti si segnano come "da
  aggiornare" invece di restare silenziosamente disallineati — nessuna rigenerazione automatica a
  cascata non richiesta, per non consumare token a tua insaputa.
- A run finito, **Copia tutto il risultato** e **Scarica come file** (.txt) mettono insieme i 5 output
  pronti da incollare o archiviare.
- Nella chat con un singolo agente, un post del Copywriter mostra il conteggio caratteri, e un pulsante
  **Rigenera** rifà l'ultima risposta se non ti convince.
- **Nuova conversazione** (chat singola) e **Nuovo task** (Orchestratore) svuotano la cronologia/il run
  corrente quando vuoi ripartire da zero.
- Se imposti `PLATFORM_PASSPHRASE` (vedi sotto), la pagina chiede una passphrase condivisa prima di poter
  usare gli agenti — così l'URL non è più utilizzabile da chiunque lo trovi, e i token Anthropic restano
  sotto controllo. Se non la imposti, funziona come prima, nessuna passphrase richiesta.
- Cronologia chat e ultimo run dell'Orchestratore restano salvati nel browser (localStorage): ricaricando
  la pagina non si riparte da zero, a meno che tu stesso li abbia svuotati con i pulsanti sopra.

**Cosa NON c'è ancora** (non blocca l'uso, sono estensioni future): un database condiviso — la cronologia
vive nel browser di chi la usa, non è condivisa tra persone/dispositivi diversi; un login per persona — la
passphrase è unica e condivisa dal team, non un account individuale.

## Changelog

**v1.1** — i 5 system prompt riscritti con un framework professionale reale dietro ogni ruolo (non solo
più lunghi: pensati per applicare davvero un metodo, restando nei vincoli di brevità dell'output già
fissati); parametri `max_tokens`/`temperature` calibrati per ruolo invece di un valore unico per tutti;
modifica manuale di un passo della pipeline prima che prosegua; rigenera/riprova per singolo passo, con
segnalazione "da aggiornare" sui passi successivi invece di ricalcolarli in automatico; scarica il
risultato come file oltre a copiarlo; rigenera l'ultima risposta anche nella chat con un singolo agente;
conteggio caratteri sui post del Copywriter; un ritentativo automatico e silenzioso su un errore di
rete/server transitorio, prima di mostrare un vero errore all'utente.

**v1** — orchestratore a 5 passi, accesso con passphrase opzionale, salvataggio locale, copia per
passo/risultato completo, reset di chat e pipeline.

## Cosa c'è dentro

- `index.html` — l'interfaccia: roster dei 5+1 agenti (cliccabili), chat con pulsante di reset e di
  rigenerazione dell'ultima risposta, quick-prompt con i temi veri del piano editoriale di Francesco (per
  l'agente Copywriter), modalità Orchestratore con stepper visivo a 5 passi (copia, modifica, rigenera,
  riprova per singolo passo; copia e scarica per l'intero risultato), gate di passphrase opzionale,
  persistenza locale
- `api/chat.js` — funzione serverless Vercel (Node, zero-config: qualunque file in `api/` diventa un
  endpoint, non serve Next.js né alcun framework) che riceve il messaggio, verifica la passphrase (se
  configurata), applica il system prompt del ruolo scelto e chiama l'API Messages di Anthropic

Il contatto tra i due è semplicissimo: `index.html` chiama `fetch("/api/chat", ...)`, `api/chat.js` gira
lato server e tiene la chiave API al sicuro (non è mai visibile nel browser).

## Come metterla online

1. **Crea un repository GitHub** (es. `radix-platform`) e caricaci il contenuto di questa cartella.
2. Su **vercel.com** → **Add New → Project** → importa il repository.
   - Framework preset: "Other" — niente build command, niente output directory da configurare.
3. **Prima del primo deploy** (o anche subito dopo, poi rifai il deploy): vai su
   **Project Settings → Environment Variables** e aggiungi:
   - `ANTHROPIC_API_KEY` = la tua chiave, creata su [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
   - `PLATFORM_PASSPHRASE` (facoltativa, consigliata) = una parola/frase a scelta. Se la imposti, chiunque
     apra l'URL deve inserirla una volta prima di poter usare gli agenti (viene ricordata nel browser dopo
     il primo accesso). Se non la imposti, la pagina resta aperta a chiunque abbia il link.
4. **Deploy**. In meno di un minuto hai un URL tipo `radix-platform.vercel.app` — apri la pagina, scegli un
   agente, scrivi un messaggio: se la chiave è configurata, risponde davvero.
5. Se vuoi un dominio dedicato (es. `platform.radixinnovationstudio.com`) puoi aggiungerlo da
   **Settings → Domains** come sottodominio, con un record CNAME su Namecheap — così non tocchi il dominio
   principale già assegnato al sito vetrina.

## Costi

Ogni messaggio inviato consuma token API a pagamento sul tuo account Anthropic (pochi centesimi a
conversazione con l'uso normale). L'Orchestratore ne consuma di più a ogni run perché chiama in sequenza 5
agenti diversi (5 chiamate invece di 1). Il pulsantino di stato in alto a destra fa solo un controllo
gratuito — non consuma token, quello succede solo quando invii davvero un messaggio o lanci un task.

## Prossimi passi possibili (non ancora costruiti)

- Un database condiviso (es. lo stesso MongoDB già usato da Aura, o Vercel KV/Postgres) per una cronologia
  vista da tutto il team invece che salvata nel browser di ciascuno.
- Un login per persona (oggi la passphrase è unica e condivisa dal team, non un account individuale con
  ruoli diversi).
- Invio diretto: oggi "Copia tutto il risultato" prepara il testo pronto, ma pubblicarlo resta un passo
  manuale (incollarlo su LinkedIn/Facebook o passarlo a HeyGen); un'integrazione diretta è un passo
  successivo, non necessario per iniziare a usarla davvero.
