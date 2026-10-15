# RADIX LinkedIn / Sales Navigator — integrazione visiva e funzionale
Aggiornamento 2026-10-15. Branch `integration/radix-unified-platform-20261013`. Preview soltanto.

## Analisi screenshot LydGen
- LydGen distingue onboarding commerciale (Company, ICP, Offer, Sending, LinkedIn, Calendars, Review) da account LinkedIn su una schermata profilo.
- La schermata account chiede di esportare e incollare cookie di sessione (es. `li_at`, `JSESSIONID`) e User-Agent. Dichiara di cifrarli lato server. Dallo screenshot non è possibile verificare effettivamente sicurezza/architettura.
- Gli screenshot NON mostrano il componente in cui si incolla la ricerca Sales Navigator e si avvia materialmente la raccolta o il monitoraggio.

## Funzioni realizzate ora
- Nuova `/sales-linkedin.html` con 4 tappe visuali: Connessione, Ricerca, Importazione, CRM. Design RADIX cockpit responsive.
- Selezione workspace Preview e progetto commerciale; verifica read-only della presenza della chiave API Captain Data e dell'UID utente; pulsante di test per confermare credenziali e integrazione `linkedin` solo se il provider effettivamente la riporta nell'endpoint `GET /v4/users/{user_uid}`.
- Campo URL Sales Navigator con validazione stretta HTTPS `linkedin.com/sales/search/people` o `linkedin.com/sales/lists/people`, più quantità indicativa 1–5000. Il pulsante **Prepara lavoro** NON lancia azioni pagate né naviga/scrapa LinkedIn: passa l'URL tramite sessionStorage temporaneo al già esistente `/lead-intelligence.html`, con eventuale collegamento al progetto, e lo precompila nel motore contatti.
- Link nella sidebar Sales, Command Center e tappa LinkedIn dell'onboarding progetto.
- Il motore contatti esistente importa risultati JSON del provider autorizzato, normalizza persone, deduplica lotti e gestisce export e archivio Preview (migration 006 da applicare).
- Test Node per sorgenti URL, connessione reale indicata dal provider, assenza di form cookie, trasferimento locale URL.

## Cosa ancora manca per l'operatività completa
1. Una vera identità LinkedIn collegata a Captain Data e una API key Preview. Non chiedere all'utente cookie/credenziali in RADIX. Il provider documenta un login hosted `identity_login_links.linkedin`, che potrà essere usato dopo averlo abilitato e verificato l'autorizzazione.
2. **Compatibilità Advanced Plus da chiarire**: la tabella pubblica Captain Data elenca esplicitamente Sales Navigator Core; non assume supporto Advanced Plus. Referenza: https://docs.captaindata.com/v4/linkedin/accounts.
3. **Nessuna estrazione live avviata**: endpoint documentato per l'azione async `POST /v4/actions/salesnavigator-search-people/run/async` con `inputs[].sales_navigator_profile_search_url`, paginazione e callback: https://docs.captaindata.com/v4/api/actions/salesnavigator-search-people-async. Serve verificare condizioni LinkedIn, limiti e tariffe prima di attivarlo.
4. Applicare migrations 006 (contact vault) e 007 (growth projects) solo al database isolato Preview `LEAD_DATABASE_URL`, quindi testare login, salvataggi, versioni e callback. Non sono state applicate automaticamente.
5. Configurare `CAPTAIN_DATA_API_KEY`, `CAPTAIN_DATA_USER_UID`, `CAPTAIN_DATA_CALLBACK_SECRET` in Vercel Preview e accesso callback protetto Vercel, senza disabilitare la protezione.
6. Test browser autenticato, test responsive e campione autorizzato end-to-end.
Non confondere una API key verificata o un URL precompilato con un profilo LinkedIn operativo.
