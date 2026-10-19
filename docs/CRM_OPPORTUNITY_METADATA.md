# Opportunità: owner e expected close (12 ottobre 2026)

Implementato e verificato solo offline. Questo documento aggiorna i limiti storici dei rapporti Sales: ownership e data prevista ora sono modellati; DB e Preview restano NON verificati.

## Contratto effettivo
- GET /api/sales?workspace=UUID&entity=opportunities&offset=0 restituisce owner_id (integer|null) ed expected_close (YYYY-MM-DD|null). Anche command response e Customer360 contengono questi campi.
- POST create/update opportunità accetta owner_id intero 1–2147483647 oppure null; expected_close data calendario valida negli anni 0001–9999 oppure null. In update omissione conserva valore; null lo cancella. Nessun default all’attore o a oggi. Date passate ammesse, non sono timestamp né promesse di chiusura.
- Owner appartiene alla membership del medesimo workspace, qualsiasi ruolo incluso viewer. Non cambia ACL: viewer legge, member/admin/owner scrivono CRM. Owner non è un filtro di visibilità né un’autorizzazione. Nessun provisioning.
- Relazione owner cross-workspace/inesistente: FK, errore neutro 409; membership referenziata non eliminabile senza riassegnazione/scollegamento. Conflitto versione 409; date/formati invalidi 400.
- Stage resta modificabile solo con transition, non con update metadata. Audit/versione/idempotenza transizione e generazione task invariati.
- UI conserva owner fuori dalla pagina caricata, consente null esplicito e visualizza data senza conversione timezone; selettori limitati alle pagine membri caricate.

## Setup manuale: NON eseguito
1. Ottenere PostgreSQL/Neon TEST isolato autorizzato, account e membership espliciti; review indipendente.
2. Applicare una volta 001 → 002 → 003 → 004_opportunity_owner_close.sql, rispettando preflight/remediation 003 descritti in RADIX_SALES_ACTIVITIES_PHASE.md. Nessun runner automatico.
3. 004 aggiunge colonne nullable senza backfill dedotto, FK membership composita, limiti data finita e indice tenant/owner/data/id. Sostituisce sales_command preservando 003 salvo allowlist opportunità. Intera migrazione BEGIN/COMMIT.
4. API corrente richiede schema 004: non distribuire codice contro solo 003; non applicare a DB condiviso/produzione. Operatore coordina rollout e rollback revisionati.

## Prove e gate residui
71 test Sales PASS al checkpoint, incluse 10 regressioni owner/date (6 API/store/static SQL, 4 DOM/fetch). Static comparison assicura identità della funzione 003 rimuovendo i soli due campi aggiunti alle allowlist. Non è parsing/esecuzione SQL.

Da eseguire realmente in DB autorizzato: migrazione e atomic rollback; create/read/update/null/date min/max/leap; owner assente/cross-workspace; rimozione membership e concorrenza riassegnazione/revoca; ruoli; versione e audit; transizione mantiene metadata; Customer360 e driver DATE; browser date control/mobile/tastiera; percorso autenticato persistente. Nessuno di questi gate E2E è dichiarato superato.
