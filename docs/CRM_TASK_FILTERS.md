# Filtri attività / follow-up — 12 ottobre 2026

GET /api/sales?workspace=UUID&entity=tasks&due=all|overdue|upcoming|unscheduled&offset=0

- all: tutte, incluse completate.
- overdue: status diverso da done e due_at < now() DB.
- upcoming: status diverso da done e now() <= due_at < now() + interval '168 hours'. Durata esatta, non 7 giorni lavorativi o date locali; limite superiore escluso.
- unscheduled: status diverso da done e due_at IS NULL.
- Parametro omesso: contratto legacy non filtrato ordinato per id; parametro esplicito (anche all): due_at ASC NULLS LAST, id. UI usa sempre parametro esplicito.

Filtro SQL prima di LIMIT 100/OFFSET, scope workspace e membership nello statement; enum chiusa, nessun SQL o timestamp dal client. Viewer può filtrare, non scrivere. Valori invalidi o filtro su altra risorsa: 400. Nessuna nuova migrazione/dipendenza. Indici esistenti non implicano performance verificata.

UI mantiene filtro nella paginazione/reload, resetta al cambio workspace/revoca; loading, errore e vuoto distinti. Kanban raggruppa soltanto risultati caricati, non totali completi. Dashboard resta totale non filtrato. Follow-up sono task registrati internamente, non notifiche/invii o nuovo tipo.

Ogni pagina usa il proprio now() server: elenco dinamico, non snapshot. Elementi possono cambiare bucket tra pagine; offset può saltare righe sotto mutazioni. Un futuro snapshot/cursor non è implementato. Customer360 resta non filtrato.

Prove offline: 3 test API/SQL statico e 6 DOM/fetch. Nessuna query DB eseguita; confini temporali e timezone/DST descritti/ispezionati, non certificati su PostgreSQL. Gate DB/E2E resta bloccato: test reali richiesti su confini now e +168h, null, done/todo/doing, tenant, revoca, >100 righe, aggiornamento stato e browser autenticato.
