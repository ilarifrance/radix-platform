# RADIX Trading

Motore personale di trading multi-agente di Francesco. Piano completo e decisioni nel documento
«Ecosistema AI per il trading — proposta di architettura».

**Stato: fase Fondamenta.** Il codice raccoglie dati, fa backtest e contiene il risk manager.
Nessun modulo invia ordini a un broker. La modalita' `live` si rifiuta di partire senza la
variabile `RADIX_TRADING_LIVE_CONFIRMED`, che si imposta solo dopo l'OK scritto di Francesco.

## Due livelli

| Livello | Orizzonte | Mercato | Strategie di partenza |
| --- | --- | --- | --- |
| Veloce | ore / giorni | 8 crypto su Kraken (BTC, ETH, SOL, XRP, ADA, DOT, LINK, AVAX in euro) | `crypto_trend_daily`, `crypto_trend_guarded` (con protezione dai crolli), `breakout_regime`, `mean_reversion` |
| Lento | giorni / mesi | `universe.MARKETS`: 20 ETF (azioni, settori, obbligazioni), Borsa italiana (10 titoli FTSE MIB da Yahoo + EWI), 8 materie prime, 6 cambi contro l'euro (da FRED) | `trend_momentum`, provata su ogni mercato con i suoi costi |

Ogni mercato lento e' provato a parte con i costi propri (`backtest.Costs`): IBKR ETF, azioni italiane
con Tobin tax, cambi con il minimo di circa 2 dollari a ordine. Le strategie crypto che decidono una volta
al giorno usano la commissione maker di Kraken (ordini limite).

## Day trading selettivo

`intraday.py`: si guarda il minuto ma si opera di rado. Compra quando in un'ora il prezzo sale circa 4 volte
piu' del normale, vende al +1% (ordine limite) o a fine giornata UTC, al massimo 2 operazioni al giorno.
La ricerca del 29 ottobre (12 mesi di BTC/ETH al minuto, 6 mesi di prova alla cieca) ha dato +5,9% su
Bitcoin con costo 0,10% per lato e -1,6% su Ethereum, scegliendo tra 108 combinazioni: il cancello 1 conta
tutte quelle prove. `hourly` scarica lo storico al minuto da Binance (120 mila minuti per giro), `daily` lo
prova con due livelli di costo (Kraken e un exchange economico). Non e' ancora nel conto simulato: serve un
giro ogni minuto, da aggiungere solo se supera il cancello 1.

## Piu' strade insieme

`multi.py`: trend crypto con "freno" allo scoperto (short piccolo solo quando trend giu', rottura dei minimi
di 20 giorni e volatilita' in salita concordano; esce al primo rimbalzo; funding dei perpetui stimato al
10% l'anno), oro con segnali macro (tassi reali e dollaro, con un giorno di ritardo), azioni o obbligazioni
secondo VIX e spread high yield, e un "direttore" che divide il capitale tra le corsie in base al rischio
recente. La ricerca (`research`) valuta anche il portafoglio intero (`portafoglio_multi`).
Nel conto simulato, ogni giorno il guadagno sopra il capitale iniziale va in una riserva che copre i giorni
sotto il capitale (`PaperEngine.sweep`). Lo scoperto vale solo nei backtest: il conto simulato resta
solo in acquisto.

## Pannello in RADIX

Ogni ora `hourly` (e ogni sera `daily`) manda una fotografia dei risultati alla pagina **Trading** di RADIX
(`/trading.html`, solo per chi l'ha collegata): backtest con le curve mensili, conto simulato, decisioni,
dati raccolti, macro e notizie (`snapshot.py`). Il token si genera nella pagina e si mette nel Mac:

```bash
echo 'RADIX_TRADING_TOKEN=rtr1....' >> ~/RadixTrading/.env && chmod 600 ~/RadixTrading/.env
python -m radix_trading push       # invio immediato; `export` stampa la stessa fotografia
```

Il token permette solo di scrivere la fotografia di quel membro. RADIX accetta solo risultati `paper`.

## Moduli

- `collectors/` — agenti di raccolta: Kraken (prezzi crypto correnti), Binance (storico crypto orario di 4 anni, solo ricerca), Tiingo (storico ETF, chiave gratuita in `~/RadixTrading/.env` come `TIINGO_API_KEY=...`; senza chiave si prova Yahoo, che spesso blocca), FRED (macro), GDELT (notizie e geopolitica, una richiesta ogni 6 secondi). Fonti gratuite, senza chiavi.
- `store.py` — archivio unico SQLite (prezzi, macro, notizie), lo stesso per backtest e live.
- `backtest.py` — backtest vettoriale: decisione a t, posizione da t+1; commissioni, slippage e commissione minima in euro; banda di non intervento; walk-forward.
- `validation.py` — Probabilistic e Deflated Sharpe Ratio; `passes_gate` e' il cancello 1 della roadmap.
- `risk.py` — risk manager deterministico: rischio per operazione, massimo per posizione, perdita giornaliera, drawdown, ordini per ora, niente leva e niente scoperto, kill switch e uscita forzata. Le vendite che riducono una posizione passano sempre.
- `config.py` — limiti di rischio (1.000 euro di capitale di test, posizioni da 100 euro).
- `probability.py` — meta-modello: regressione logistica walk-forward che stima la probabilita' che un'operazione superi i costi; misurato con il Brier score (0,25 = nessuna capacita').
- `paper.py` — paper trading interno: conto simulato da 1.000 euro con prezzi veri; ogni ora segnale → probabilita' (soglia 55%) → risk manager → esecuzione simulata, con ogni decisione registrata e motivata. `report` ne fa il riepilogo.

## Test da 100 euro veri (spento)

Solo la corsia crypto_trend, su un conto Kraken usato solo per questo (`live.py`).
- Al massimo 100 euro investiti, niente leva. Gli ordini della regola partono come limite «post only» al miglior
  prezzo del momento (commissione da maker); se dopo 6 ore non si sono eseguiti, la parte mancante va a mercato.
  Le vendite dello stop sono sempre a mercato. `RADIX_TRADING_ORDERS=market` torna agli ordini a mercato per tutto.
- Le monete in portafoglio vanno in staking flessibile su Kraken Earn (`earn.py`, solo strategie «instant», sblocco
  immediato prima di vendere). Serve il permesso «Earn Funds» sulla chiave; `RADIX_TRADING_EARN=no` lo spegne.
  Se il conto ha gia' attivo «Kraken Rewards» (Kraken alloca da solo, le monete restano nel saldo spot), quelle
  monete rendono gia' e non si toccano: niente Allocate, niente sblocco prima di vendere; il riepilogo le conta
  comunque in «In staking».
- Sentinella di mercato (`mercato.py`, nel giro `hourly`, chiesta da Francesco il 31/10/2026): nelle ore di Wall Street
  guarda S&P 500, Nasdaq 100, mondo ex USA, oro, Treasury, petrolio (quotazioni Yahoo), VIX e decennale USA; Bitcoin ed
  Ethereum sulle 24 ore anche nel fine settimana. Quando una soglia scatta (es. Nasdaq ±2,5%, VIX +20%, BTC ±5%) manda
  un avviso con valutazione: notizie del giorno in archivio, cosa ha reso il mercato dopo giornate simili (5 e 20
  giorni), ogni ETF Fineco rispetto al livello di 12 mesi, il conto crypto, e il verdetto (mai un acquisto su una
  notizia da sola: lo studio eventi non ha trovato vantaggi che reggano la verifica). Un avviso per mercato al giorno.
  Prova a mano: `python -m radix_trading mercato --prova --quando 2026-10-30T21:17Z` stampa il testo senza mandarlo.
- Se il patrimonio scende 20 euro sotto quello del primo giro, vende tutto e resta fermo.
- Ogni ordine manda un avviso su Telegram. Gli avvisi partono anche per gli ordini del conto finto, con il prefisso `[finto]`.

Passi, tutti di Francesco:
1. Su Kraken crea una chiave API con i soli permessi "Query Funds", "Query Open Orders & Trades",
   "Query Closed Orders & Trades", "Create & Modify Orders" e "Cancel/Close Orders", senza prelievi
   (gli ultimi tre servono a seguire e annullare gli ordini limite).
2. Scrivi `KRAKEN_API_KEY` e `KRAKEN_API_SECRET` in `~/RadixTrading/.env`. Per gli avvisi aggiungi `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`.
3. Prova senza rischi:
   - `python -m radix_trading alert-test`;
   - `python -m radix_trading live --prova`: Kraken convalida gli ordini senza eseguirli.
4. Per accendere il conto vero servono `RADIX_TRADING_MODE=live` e `RADIX_TRADING_LIVE_CONFIRMED=si-confermo-denaro-reale`, più un giro orario di `live`.

## Corsia ETF su Fineco (esecuzione a mano)

`fineco.py`: cinque ETF UCITS (S&P 500, Nasdaq 100, oro, Treasury 20+, Europa), un quinto del capitale ciascuno,
dentro se il prezzo e' sopra quello di 12 mesi prima. Il primo giorno di borsa del mese, dalle 8 italiane, il giro
`hourly` manda su Telegram il piano («compra N quote di…», «vendi tutto…») e Francesco esegue dall'app Fineco.
Capitale di riferimento `FINECO_CAPITAL_EUR` in `~/RadixTrading/.env` (3.000 euro se manca).
Regola `FINECO_RULE`: `trend` (12 mesi, quella originale), `conferma` (si entra o si esce solo con due mesi di fila
dello stesso segnale) oppure `tieni` (sempre dentro tutti e cinque, a gennaio si torna a un quinto ciascuno se lo
scarto vale almeno 150 euro). Il confronto del 31/10/2026 (`confronto`) e' nel modulo; la scelta e' di Francesco.
`python -m radix_trading fineco --ora` manda il piano subito.
Controllo orario (dal 31/10/2026, `fineco.watch` nel giro `hourly`): a mercato aperto legge i prezzi dei cinque ETF e
avvisa su Telegram solo se succede qualcosa di rilevante (un ETF oltre il 3% in giornata, il paniere in portafoglio
sotto del 2%, perdita dal prezzo del piano oltre 8/12/16%, prezzo che attraversa il livello di 12 mesi fa, VIX +25%);
alle 18 italiane un riepilogo della giornata. Un avviso per evento al giorno. Gli avvisi informano: la regola decide
il primo giorno del mese e gli ordini li mette Francesco.

## Osservatorio «leva 20 su segnali concreti» (solo simulazione)

`osservatorio.py`: cinque regole scritte prima e non piu' toccate (shock geopolitico → oro, panico → S&P 500, giorno Fed
→ S&P 500 nel verso della giornata, shock petrolio → petrolio, picco di notizie su Trump → Bitcoin corto). Quando una
scatta, il giro `daily` registra un'operazione simulata con margine 200 €, leva massima ESMA, spread, finanziamento
notturno dei CFD e chiusura forzata a meta' del margine, e avvisa su Telegram con il prefisso `[SIMULATO leva]`; il
venerdi' manda il riepilogo. `python -m radix_trading osservatorio --from 2015-01-01` rifa' le stesse regole sul passato.
Nessun euro vero: serve a decidere, dopo 4-8 settimane, se un conto a leva ha senso.

## Kill switch

Creare il file `~/RadixTrading/data/KILL_SWITCH` (es. `touch ~/RadixTrading/data/KILL_SWITCH`) blocca ogni
nuovo acquisto e al giro successivo chiude tutte le posizioni. Cancellarlo riattiva il sistema.

## Uso

```bash
cd trading
pip install -r requirements-dev.txt
python -m pytest -q
python -m radix_trading collect    # scarica i dati in ./data/radix_trading.sqlite
python -m radix_trading backtest   # walk-forward fuori campione + cancello 1 per ogni strategia
python -m radix_trading hourly     # raccolta veloce + un giro di paper trading simulato
python -m radix_trading report     # riepilogo del conto paper
```

La raccolta gira sul Mac di Francesco (scelta del 28 ottobre): `bash scripts/install_mac.sh` crea
un ambiente Python in `~/RadixTrading` e due job launchd, ogni ora `hourly` (crypto, notizie e un
giro di paper trading simulato) e ogni giorno alle 23:30 `daily` (ETF, macro e backtest: solo le strategie che superano il cancello 1
vengono usate dal paper trading). I dati si accumulano solo
quando il Mac e' acceso. `bash scripts/install_mac.sh --uninstall` li rimuove. L'ambiente cloud
di Claude non raggiunge queste fonti.

## Verifiche fatte

Su prezzi casuali senza tendenza (dove nessuna strategia puo' avere un vero vantaggio) nessuna
strategia supera il cancello 1, anche quando lo Sharpe fuori campione sembra buono (fino a 2,3):
il Deflated Sharpe corregge per i tentativi fatti. Con 100 euro su 8 ETF la commissione minima
IBKR azzera i rendimenti: per questo il livello lento simula 300 euro e la banda del 5%.
