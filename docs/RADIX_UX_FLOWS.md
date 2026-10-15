# RADIX — Flussi di pagine e servizi

Versione 0.1 · 15/10/2026 · thread UX/UI. Riferimenti: `DESIGN.md` (regole visive), `/mnt/project-files/radix/PIANO_OPERATIVO_2026-10-15.md` (fasi F0–F4, chi fa cosa).

Questo documento descrive **come una persona usa ogni servizio**: da dove entra, quali passi compie, cosa vede in ogni stato e dove finisce. Il thread funzionalità lo usa per collegare dati e logica, il thread UX per disegnare le pagine. Quando una pagina e questo documento non coincidono, si aggiorna prima il documento.

## 0. Regole comuni a tutti i flussi

1. **Un ingresso, una shell.** Si entra dal Command Center (`/`) o dalla sidebar globale. Ogni pagina mostra: sidebar, barra in alto con ricerca ⌘K e badge dati (Live, Demo, Parziale, Non collegato), intestazione con titolo e **una** azione primaria.
2. **Progetto come filo conduttore.** Cliente → progetto → strategia → PED / piano PM → contenuti e task → approvazioni → pubblicazione → risultati. Ogni pagina che lavora su un progetto mostra in alto *quale* progetto (nome + cliente) e permette di cambiarlo senza tornare indietro.
3. **Agenti dentro il lavoro, non in una pagina a parte.** In ogni area c'è un pannello "Copilota" (colonna destra ≥1280px, pannello scorrevole sotto) con gli agenti di quell'area: chat, allegati, documenti generati. Sostituisce la v3.7 senza perdere funzioni (F2).
4. **L'umano approva.** Tutto ciò che esce da RADIX (pubblicare, inviare, pagare) passa da un'approvazione con identità, registrata. Chi crea non approva il proprio lavoro.
5. **Stati sempre presenti.** Ogni lista o vista ha: *vuoto* (una frase + un'azione per riempirlo), *caricamento*, *errore* (cosa è successo + "Riprova"), *dati demo* (badge Demo, mai numeri inventati spacciati per reali).
6. **Linguaggio.** Frasi per l'utente, non per lo sviluppatore (vedi `DESIGN.md` §1.3).

## 1. Command Center (`/` → `control-center-v2.html`)

**Scopo:** capire in 10 secondi cosa succede e cosa richiede attenzione; partire da qui verso qualsiasi lavoro.

| Passo | Cosa vede / fa | Dove porta |
|---|---|---|
| Arrivo | Saluto, 4 KPI (progetti attivi, lavori in corso, approvazioni in attesa, agenti attivi), mappa a rete dei progetti | — |
| "Richiede attenzione" | Approvazioni e blocchi ordinati per urgenza, ognuno con azione diretta (Rivedi) | Contenuto/task specifico, già aperto |
| Clic su un progetto nella rete | Pannello laterale: stato, prossime scadenze, PED, piano PM, agenti assegnati | Pagina progetto (Agency workspace / PED / PM) |
| Attività recenti | Eventi reali dei lavori agenti e delle approvazioni | Dettaglio evento |
| Azioni rapide | Nuovo progetto · Crea contenuto · Avvia agente · Cerca · Riepilogo | Flussi relativi |
| Console agenti (F2) | Lavori in coda / in corso / falliti, con Segui e Riprova | Dettaglio lavoro |

Stati: senza progetti → rete vuota con "Crea il primo progetto"; dati parziali → badge Parziale e KPI "—" con spiegazione nel tooltip.

## 2. Marketing Agency

### 2.1 Panoramica (`agency/index.html`)
Vetrina delle 13 divisioni + lavoro in corso dell'agenzia. Azione primaria: **Nuovo progetto**. Sezioni: divisioni (clic → workspace divisione), workflow operativo (6 fasi), agenti disponibili, progetti attivi con fase corrente, task recenti.

### 2.2 Clienti (`agency/clients.html`)
Lista → scheda cliente (dati, referenti, progetti, documenti, memoria cliente) → "Nuovo progetto per questo cliente". Ricerca e filtro per stato (prospect, attivo, in pausa).

### 2.3 Nuovo progetto (`agency/new-project.html`)
Procedura a passi, **un passo per schermata**:
1. Cliente (esistente o nuovo) → 2. Obiettivo e servizi (divisioni) → 3. Brief e documenti (upload) → 4. Canali e periodo → 5. Riepilogo e conferma.
Esito: progetto creato sul server (F1), si apre il **workspace di progetto** con la fase "Ricerca" pronta da avviare.

### 2.4 Workspace di progetto (`agency/project-workspace.html`)
Il cuore del lavoro su un progetto. Barra fasi: **Brief → Ricerca → Strategia → Approvazione strategia → PED → Produzione → Revisione → Pubblicazione → Risultati**. Ogni fase ha: cosa serve, chi la fa (persona/agente), output, pulsante per passare alla successiva (bloccato finché manca l'approvazione richiesta). Colonna destra: Copilota con gli agenti delle divisioni coinvolte e la memoria del progetto.

### 2.5 Piano editoriale — PED (`project-editorial.html`, F3)
Strumento strategico e operativo su tutti i social.
- **Strategia** (tab 01): obiettivi, pubblico, pilastri/rubriche, campagne, frequenza per canale, KPI. Approvazione della strategia.
- **Piano** (tab 02): viste **Calendario** (giorno/settimana con griglia oraria, mese, anno), **Kanban** per stato (Idea → Bozza → In revisione → Approvato → Programmato → Pubblicato), **Lista**. Filtri per canale, campagna, rubrica, stato.
- **Contenuto** (pannello di dettaglio): testo master + **varianti per canale** (LinkedIn, Instagram, Facebook, TikTok, YouTube, blog, newsletter) con anteprima nel formato del canale, media, versioni, commenti, approvazione del singolo contenuto, programmazione con fuso orario.
- **Produzione con agenti**: da un contenuto → "Genera bozza / carosello / video" (pipeline post, immagini, HeyGen) → torna in revisione.
- **Pubblicazione**: coda programmata (Buffer o API ufficiali), stato e link del post pubblicato.
- **Risultati**: metriche per contenuto e per canale, confronto con i KPI della strategia.
Riferimento visivo: calendario Orbitly (settimana con fasce orarie, chip di stato, canali in sidebar del calendario).

### 2.6 Operations (`agency/operations.html`)
Tutti i task di produzione dell'agenzia, su tutti i progetti: kanban per stato, filtro per divisione / persona / agente, scadenze. È la vista "di reparto" del PM.

### 2.7 Memoria (`agency/memory.html`)
Cosa RADIX sa di clienti, brand e progetti: voci per cliente/progetto, fonte, data, chi l'ha aggiunta. Ricerca. Gli agenti la leggono automaticamente nei lavori del progetto (correzione bug F0).

### 2.8 Workspace divisione (`agency/workspace.html?division=…`)
Pagina per divisione (es. SEO & GEO): cosa fa, agenti, lavori in corso, avvio rapido di un lavoro per un progetto. Senza parametro mostra l'elenco divisioni, non "Divisione non trovata".

### 2.9 Pagine da ritirare
`marketing-agency.html` (vecchio prototipo) e `agency/ped.html` (mock) → reindirizzano a `agency/index.html` e al PED reale quando F3 è pronta.

## 3. Project Management (`radix-pm-concept.html` → modulo PM, F4)

Viste di un progetto, con selettore progetto in alto:
1. **Panoramica**: KPI (task totali, completati, in ritardo, budget usato), milestone prossime, rischi.
2. **Gantt / timeline**: fasi, task, dipendenze, oggi; trascinamento per ripianificare; ritardi evidenziati.
3. **Kanban**: Da fare · In corso · In revisione · Fatto; card con assegnatario (persona o agente), scadenza, dipendenze aperte.
4. **Carico di lavoro**: heatmap persone/agenti × settimane.
5. **Dettaglio task** (pannello): descrizione, sottotask, dipendenze, documenti, storico, approvazione.
Il riferimento 3D del mockup resta come vista panoramica opzionale; l'uso quotidiano è piatto e veloce.
Collegamento: un progetto Agency genera il suo piano PM; i task completati dagli agenti avanzano da soli.

## 4. Studio: Legal e Accounting (`legal/`, `accounting/`)

Stesso flusso per entrambi:
1. Scegli lo specialista (orchestratore o esperto) **o** un workflow guidato (es. revisione contratto).
2. Descrivi l'incarico, allega documenti, conferma l'invio (avviso privacy).
3. Ricevi la **bozza** → rivedi → approva fase → passa allo specialista successivo (workflow multi-agente).
4. Esporta il documento (Word/PDF/MD) e archivialo nel progetto o cliente.
Storico incarichi per cliente/progetto (F2). Mai presentato come parere professionale definitivo.

## 5. Sales Intelligence (CRM, Lead) — in carico a ChatGPT/Codex

Solo collegati dalla sidebar finché non vengono passati. Flusso atteso (da `docs/CRM_*`): Lead Intelligence → qualifica → azienda/contatti → opportunità in pipeline → attività → chiusura; Sales Orbit come vista universo. Quando passano a Claude: stessa shell, procedura a passi per Lead Intelligence (oggi pagina unica molto lunga).

## 6. Pagine di sistema

- **Control Room** (`coordination/`): stato dei moduli e dei lavori di sviluppo, decisioni aperte. Interno, non per clienti.
- **Tutte le aree** (`radix-ecosystem.html`): mappa delle aree con stato (attiva, in arrivo). Diventerà superflua quando la sidebar copre tutto.
- **Amministrazione** (`admin.html`): utenti, ruoli, chiavi integrazioni (Buffer, HeyGen, Gmail), modello AI per agente e costi (F2).
- **Agenti AI v3.7** (`/index.html`): resta raggiungibile finché ogni sua funzione non vive in un'area (checklist F2).

## 7. Priorità di realizzazione visiva

1. Shell unica su tutte le pagine (PR #7) ✓ bozza.
2. PED e PM allineati ai riferimenti (PR #8) ✓ bozza; Gantt/kanban/heatmap e varianti canale quando arrivano i dati (agganci concordati).
3. Agency: un solo foglio di stile condiviso, mobile corretto, testi senza gergo.
4. Studio Legal/Accounting: allineamento ai token.
5. Command Center: rifinitura verso il mockup M1 (KPI con icona e delta, pannelli inferiori).
6. Pagine di sistema.
