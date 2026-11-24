# Plancia: app autisti per Android e iPhone

È la stessa app web di `/trasporti/autista/`, racchiusa in un'app nativa con Capacitor. In più, l'app nativa
registra la posizione **sempre**, anche a schermo spento e con il telefono in tasca: dall'accesso dell'autista in poi,
un punto ogni 2 minuti in movimento e ogni 10 da fermo. Le posizioni vanno al centro operativo (`tr_positions`) e,
senza rete, aspettano sul telefono.

- Codice app: `it.plancia.app`, nome: **Plancia**. Gli account sviluppatore sono quelli di Ilari Group.
- L'app carica le pagine dal server, indicato in `capacitor.config.json` → `server.url`: ora è l'anteprima della PR.
  Per il lancio va messo il dominio definitivo: `npm run dominio -- <dominio>` (oppure il campo «dominio» quando si lancia a mano l'azione Android). Gli aggiornamenti dell'app web arrivano senza ripubblicare l'app.

## APK Android di prova (senza installare niente)
Ogni modifica a `mobile/` fa partire su GitHub l'azione **"Plancia Android (APK di prova)"**. Si apre l'ultima
esecuzione, si scarica `plancia-android-debug` (Artifacts) e l'APK si installa sul telefono (consentendo
"installa da origini sconosciute"). Si può far partire anche a mano con "Run workflow".

## Build in locale
```
cd mobile
npm install
npm run setup        # crea android/ e ios/ (ios solo su Mac), aggiunge permessi e testi, sincronizza
npm run android      # apre Android Studio → Build → Generate Signed App Bundle
npm run ios          # apre Xcode → Product → Archive
```
`scripts/patch-native.js` aggiunge da solo:
- **Android**: posizione precisa e in background, servizio in primo piano di tipo "location", notifiche ed esclusione
  dal risparmio batteria.
- **iPhone**: i testi della richiesta "Consenti sempre" e la modalità in background "location".

## Pubblicazione privata (solo per le aziende clienti)
- **Android**: Play Console di Ilari Group → nuova app "Plancia". Per partire basta il canale di **test chiuso**, con gli
  indirizzi email degli autisti. Poi c'è la produzione oppure un'**app privata** per le aziende tramite Managed Google
  Play. Google chiede la dichiarazione per la **posizione in background**, con un breve video in cui l'app spiega e
  chiede il permesso, e il modulo "Sicurezza dei dati".
- **iPhone**: App Store Connect di Ilari Group → app "Plancia". Per i piloti si usa **TestFlight**, con inviti per email,
  senza revisione completa per i tester interni. Per le aziende si usa un'**app personalizzata** tramite Apple
  Business Manager, che non compare nello store pubblico. Nelle note per la revisione va spiegato perché serve la
  posizione "sempre": app aziendale per autisti, con accordi con i dipendenti già in essere.

## Cose da sapere sul GPS sempre attivo
- Al primo avvio l'autista deve scegliere **"Consenti sempre"**: su Android 11+ si fa dalle impostazioni, e l'app lo
  ricorda.
- Su alcuni Android (Xiaomi, Huawei, Samsung) va tolta l'app dal risparmio batteria, altrimenti il sistema la chiude.
- Mentre registra, su Android resta una notifica fissa "Plancia registra la posizione del mezzo": il sistema la
  richiede per legge.
