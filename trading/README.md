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
