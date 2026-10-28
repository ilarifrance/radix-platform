# RADIX Trading

Motore personale di trading multi-agente di Francesco. Piano completo e decisioni nel documento
«Ecosistema AI per il trading — proposta di architettura».

**Stato: fase Fondamenta.** Il codice raccoglie dati, fa backtest e contiene il risk manager.
Nessun modulo invia ordini a un broker. La modalita' `live` si rifiuta di partire senza la
variabile `RADIX_TRADING_LIVE_CONFIRMED`, che si imposta solo dopo l'OK scritto di Francesco.

## Due livelli

| Livello | Orizzonte | Mercato | Strategie di partenza |
| --- | --- | --- | --- |
| Veloce | minuti / ore | crypto su Kraken (XBTEUR, ETHEUR) | `breakout_regime`, `mean_reversion` |
| Lento | giorni / settimane | ETF e indici (ricerca su dati Yahoo, ordini futuri su IBKR con ETF UCITS) | `trend_momentum` |

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
