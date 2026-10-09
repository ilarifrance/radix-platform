# RADIX Core — roadmap incrementale DAY01

RADIX è un unico workspace operativo modulare, non una collezione di SaaS separati. DAY01 non migra DB, autenticazione, scheduler o configurazioni. CRM e PM sono demo sintetiche in memoria; Marketing resta anteprima locale. La dashboard è una proiezione autenticata dei salvataggi, non un runtime live.

## Core condiviso proposto (non implementato)
- Identity/Auth: riuso sessione esistente; controlli autorizzazione server per ogni futura mutazione. Nessun token o permesso accettato dal browser come prova.
- Project: ID stabile, profilo e associazioni esplicite; nessuna attribuzione agente/progetto dedotta dai nodi decorativi.
- Artifact: documento/contenuto con ID, progetto, autore, provenienza e versione immutabile; output separati dal riepilogo cockpit.
- Revision: contenuto, allegati, destinazioni, schedule e timezone nella fingerprint; modifica implica nuova revisione.
- Approval: richiesta sulla revisione esatta, revisore autorizzato, decisione esplicita, motivazione, timestamp; cambio revisione invalida il gate.
- Audit: eventi append-only con actor verificato, entity/revision e correlazione. Lo storico in memoria delle demo NON è audit affidabile.
- Execution: run/task persistiti, assegnazioni e heartbeat verificabili solo in una fase successiva; oggi running salvato significa unverified/stale.

## Sequenza e criteri di uscita
1. Review locale e visiva dei concept, screenshot riferimento originale, prove tastiera/mobile e stati errore. Nessun rilascio automatico DAY01.
2. Progettare schema e migrazione reversibile di Project/Artifact/Revision/Approval/Audit; test concorrenti e autorizzazione. Conservare compatibilità API workspace.
3. Collegare CRM e PM al Core solo dopo schema approvato; distinguere nota originale, campi estratti, correzioni e conferma. Date relative richiedono chiarimento, mai assunzioni silenziose.
4. Marketing: riusare il modulo e il gate, aggiungere archivio revisioni e approvazioni trusted. Prima di ogni eventuale pubblicazione verificare server-side revisione, permessi, destinazioni, schedule, idempotenza e revoche in transazione. Nessuna attivazione publishing qui; le API legacy non sono state cablate o certificate da questa libreria.
5. Commercialisti AI: bozze, richieste documentali, check-list e validazione professionale; nessun invio/deposito agli enti dichiarato o attivato.
6. White-label futuro: branding configurabile dopo stabilizzazione Core. Non introdurre ora tenant routing, provisioning, fatturazione SaaS, isolamento multi-tenant o scheduler.

## Vincoli
Demo locale e libreria di dominio non sono autorizzazione server. Una fingerprint non rende attendibile un oggetto approvazione fornito dal chiamante. Né i concept né DAY01 chiamano provider, pubblicano o inviano email. Qualsiasi futura integrazione richiede un mandato distinto e prove dedicate.
