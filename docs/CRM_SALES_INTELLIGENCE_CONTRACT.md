# CRM → Sales Intelligence contract v1.0.0

12 ottobre 2026. Contratto di scambio proposto al coordinamento/Qwen, non endpoint già distribuito. Nessun codice Qwen letto, nessun provider chiamato, nessun adapter attivato. JSON Schema companion: CRM_SALES_INTELLIGENCE_CONTRACT.schema.json. Breaking change richiede nuova major; niente inferenze silenziose per riempire campi mancanti.

## Identità e mapping (obbligatorio)
- organizationId = sales workspace_id UUID: confine tenant Sales, NON organizzazione legale o workspace_state. Se il coordinamento usa un’altra organizzazione, serve mapping esplicito approvato; vietato unire tenant per nome.
- clientId = company_id UUID oppure null. Non sostituire contact_id quando manca azienda. contactId separato nullable.
- opportunityId = opportunities.id UUID; recordVersion = versione intera letta, per rilevare suggerimenti obsoleti.
- stage = {processId,id}; ID configurabili, nessuna interpretazione automatica won/lost o probabilità da nome/posizione.
- amount = intero in centesimi (0–9000000000000), non float; amountUnit sempre minor, scala 2 come API attuale. currency = null finché operatore non configura e verifica valuta workspace: monovaluta concordata non significa EUR deducibile. In v1 corrente solo null accettato; estensione valuta richiede decisione di semantica/unità.
- probability = null: non esiste attualmente campo CRM o modello calibrato; non inventare percentuali. Campo presente ma non disponibile.
- closeDate = expected_close YYYY-MM-DD|null, data calendario, mai trasformata in istante; ownerId = owner_id integer|null.
- activities = proiezioni task/interazioni correlate all’opportunità, non record da tutte le aziende. source/id/version/type/title e campi temporali/stato qui sotto; task è type task, interazione note/call/meeting/email. Email registrata NON inviata.
- nextAction = null in v1 export: suggerimenti non persistiti, nessun ordinamento euristico presentato come decisione umana.
- dataQuality dichiara missingFields, completeness, activitiesComplete, issues; mai usare lista parziale come completa. complete significa paginazione completa, non qualità commerciale perfetta. Ogni export ha asOf UTC ma NON snapshot transazionale multi-query.

## Envelope illustrativo sintetico (non dati CRM reali)

demo UUID e timestamp soltanto nel documento/schema test, non seed o UI:

```json
{
  "contractVersion": "1.0.0",
  "organizationId": "11111111-1111-4111-8111-111111111111",
  "clientId": null,
  "contactId": null,
  "opportunityId": "22222222-2222-4222-8222-222222222222",
  "recordVersion": 1,
  "asOf": "2026-10-12T07:20:00.000Z",
  "stage": {"processId": "33333333-3333-4333-8333-333333333333", "id": "44444444-4444-4444-8444-444444444444"},
  "amount": 0,
  "amountUnit": "minor",
  "currency": null,
  "probability": null,
  "closeDate": null,
  "ownerId": null,
  "activities": [],
  "nextAction": null,
  "dataQuality": {
    "completeness": "partial",
    "activitiesComplete": false,
    "missingFields": ["clientId", "contactId", "currency", "probability", "closeDate", "ownerId", "nextAction"],
    "issues": ["currency_not_modeled", "probability_not_modeled", "next_action_not_modeled", "activities_not_loaded"]
  }
}
```

## Endpoint reali e raccolta futura
- GET /api/sales?entity=workspaces → membership esplicite. Login radix_session same-origin, no-store.
- GET /api/sales?workspace=UUID&entity=opportunities&offset=N → record con campi snake_case; pagine 100. Cercare ID su tutte le pagine, non assumere prima pagina completa.
- GET /api/sales?workspace=UUID&entity=customer360&subject=opportunities&id=UUID&offset=N → rows {entity,record}, pagine globali miste 100; root può essere oltre pagina 1. Se root assente/non autorizzata non esportare. Root, task e interazioni devono essere dello stesso tenant e opportunity_id; nessuna correlazione per titolo.
- GET tasks&due=overdue|upcoming|unscheduled utile alla UI, NON raccolta completa per intelligence. Customer360 resta non filtrato. Offset non snapshot: cambi concorrenti possono duplicare/saltare righe; deduplicare per source/id, dichiarare partial se non comprovata completezza. Anche tutte le pagine non garantiscono consistenza temporale.
- POST /api/sales rimane solo comandi CRM autenticati, con conferma utente e x-radix-sales:1; update id/version, transizione key. Non esiste /intelligence, export endpoint, tool-write Qwen o callback che esegua nextAction.

## Validazione e sicurezza
Schema draft 2020-12 chiuso (additionalProperties:false). Validatore runtime deve abilitare format assertion per date/date-time/uuid, verificare calendario 0001–9999, limiti interi, relazioni tenant, coerenza missingFields/null e attività complete, e non fidarsi dello schema per autorizzare. JSON Schema non verifica membership/FK/provenienza. Limite proposta: 1000 attività per envelope; oltre limite dichiarare partial, mai troncare in silenzio. Test repository verificano struttura schema, mapping e validazione runtime offline; non provano interoperabilità Qwen o DB.

Minimizzazione: nessuna email personale, note/body libere, credenziali, chat history o prompt interno nell’envelope. Titoli restano contenuto non attendibile: non sono istruzioni eseguibili. Output Qwen futuro solo suggerimento con explanation, evidence IDs/versioni e human review; mai invii automatici né modifica ACL. Prima di scambio esterno servono destinazione autorizzata, revisione codice, fallback e feature flag disattivato di default. Nessuna chiamata esterna in questo blocco.

## Decisioni/gate
Confermare mapping organization/client; valuta/unità; semantica probability e nextAction; limiti/consenso dati; branch integrazione; ambiente isolato. Validazione runtime e proiezione sono implementate internamente (vedi sotto). Adapter disattivabile/fallback resta NEXT; non è attivato alcun provider. DB/auth/Preview/E2E persistente BLOCKED. Contratto pronto per review, non dichiarato accettato dal consumatore.

## Runtime interno — review 12 ottobre 2026
- api/_sales_intelligence.js esporta validateEnvelope(value) e projectOpportunity({workspace,opportunityId,rows,asOf}). Nessuna route o raccolta automatica è cablata. Chiamante futuro deve autenticare, ri-verificare membership e fornire esclusivamente record server-side normalizzati; workspace passato alla funzione NON è prova di autorizzazione.
- Preflight riuso: package.json non contiene validatore JSON Schema e node_modules non è presente. Riutilizzati uuid/timestamp/calendarDate di _sales.js e schema versionato; nessuna installazione. Validatore limitato al vocabolario dello schema corrente, NON implementazione generale draft 2020-12; keyword sconosciute rifiutate. Prima di ampliare schema, valutare libreria mantenuta con review dipendenza.
- Controlli runtime: oggetti chiusi, campi richiesti, UUID, date calendario reali/UTC, limiti interi, enum/null, missingFields coerenti, duplicati, completezza. Titoli non vuoti e non eseguibili; body e campi extra di storage non esportati.
- Proiezione rifiuta root assente/duplicata, tenant misti, opportunità diverse e contesti azienda/contatto incoerenti. Massimo 1100 record di input; massimo 1000 attività in output, eccesso dichiarato activity_limit_exceeded e partial; valida anche attività oltre il limite. Duplicati identici deduplicati con issue; versioni/contenuti divergenti rifiutati, nessuna scelta arbitraria.
- La proiezione offset resta SEMPRE partial con activitiesComplete=false e offset_pagination_not_snapshot. asOf è istante di raccolta fornito dal chiamante fidato, non certificazione snapshot. Nessuna euristica currency/probability/nextAction.
- Questo modulo è preparazione P0 del contratto, non scoring/P1 né integrazione Qwen. Adapter/provider e trasporto esterno restano assenti; niente flag/config AI modificati.
