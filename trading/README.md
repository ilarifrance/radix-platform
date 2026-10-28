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
| Lento | giorni / settimane | ETF e indici (ricerca su Stooq, ordini futuri su IBKR con ETF UCITS) | `trend_momentum` |

## Moduli

- `collectors/` — agenti di raccolta: Kraken (prezzi crypto), Stooq (storico ETF), FRED (macro), GDELT (notizie e geopolitica). Fonti gratuite, senza chiavi.
- `store.py` — archivio unico SQLite (prezzi, macro, notizie), lo stesso per backtest e live.
- `backtest.py` — backtest vettoriale: decisione a t, posizione da t+1; commissioni, slippage e commissione minima in euro; banda di non intervento; walk-forward.
- `validation.py` — Probabilistic e Deflated Sharpe Ratio; `passes_gate` e' il cancello 1 della roadmap.
- `risk.py` — risk manager deterministico: rischio per operazione, massimo per posizione, perdita giornaliera, drawdown, ordini per ora, niente leva e niente scoperto, kill switch e uscita forzata. Le vendite che riducono una posizione passano sempre.
- `config.py` — limiti di rischio (1.000 euro di capitale di test, posizioni da 100 euro).

## Uso

```bash
cd trading
pip install -r requirements-dev.txt
python -m pytest -q
python -m radix_trading collect    # scarica i dati in ./data/radix_trading.sqlite
python -m radix_trading backtest   # walk-forward fuori campione + cancello 1 per ogni strategia
```

La raccolta gira sul Mac di Francesco (scelta del 28 ottobre): `bash scripts/install_mac.sh` crea
un ambiente Python in `~/RadixTrading` e due job launchd, ogni ora `collect --tier fast` (crypto e
notizie) e ogni giorno alle 23:30 `collect --tier slow` (ETF e macro). I dati si accumulano solo
quando il Mac e' acceso. `bash scripts/install_mac.sh --uninstall` li rimuove. L'ambiente cloud
di Claude non raggiunge queste fonti.

## Verifiche fatte

Su prezzi casuali senza tendenza (dove nessuna strategia puo' avere un vero vantaggio) nessuna
strategia supera il cancello 1, anche quando lo Sharpe fuori campione sembra buono (fino a 2,3):
il Deflated Sharpe corregge per i tentativi fatti. Con 100 euro su 8 ETF la commissione minima
IBKR azzera i rendimenti: per questo il livello lento simula 300 euro e la banda del 5%.
