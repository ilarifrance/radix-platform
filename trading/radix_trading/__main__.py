"""Riga di comando.

    python -m radix_trading collect          # scarica prezzi, macro e notizie nell'archivio
    python -m radix_trading collect --tier fast   # solo crypto e notizie (ogni ora)
    python -m radix_trading hourly           # raccolta veloce + un giro di paper trading simulato
    python -m radix_trading daily            # raccolta lenta + backtest (aggiorna le strategie approvate)
    python -m radix_trading report           # riepilogo del conto paper
    python -m radix_trading backtest         # walk-forward delle strategie di partenza + cancello 1
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import replace

import pandas as pd

from . import backtest, data, paper, strategies, universe, validation
from .collectors import binance, fred, gdelt, kraken, tiingo, yahoo
from .config import Settings
from .store import Store


def collect(store: Store, tier: str = "all") -> dict:
    """`tier`: "fast" (crypto e notizie, ogni ora), "slow" (ETF e macro, una volta al giorno) o "all"."""
    report: dict[str, object] = {}
    fast, slow = tier in ("fast", "all"), tier in ("slow", "all")
    if fast:
        f = universe.FAST
        for sym in f["symbols"]:
            report[f"kraken:{sym}"] = _safe(lambda: store.upsert_bars("kraken", sym, "1h", kraken.fetch_ohlc(sym, "1h")))
            report[f"storico:{sym}"] = _safe(lambda: backfill_history(store, sym))
        # GDELT limita molto: una sola ricerca per giro, a rotazione (4 temi in 4 ore).
        q = gdelt.DEFAULT_QUERIES[pd.Timestamp.now(tz="UTC").hour % len(gdelt.DEFAULT_QUERIES)]
        items, news_report = gdelt.fetch_all((q,))
        store.upsert_news(items)
        report.update({f"gdelt:{k}": v for k, v in news_report.items()})
    if slow:
        for i, sym in enumerate(universe.SLOW["symbols"]):
            if i:
                time.sleep(2)  # Yahoo limita le richieste ravvicinate
            report[f"etf:{sym}"] = _safe(lambda: store.upsert_bars("yahoo", sym, "1d", fetch_etf(sym)))
        for series in fred.DEFAULT_SERIES:
            report[f"fred:{series}"] = _safe(lambda: store.upsert_macro(series, fred.fetch_series(series)))
    return report


def fetch_etf(symbol: str) -> pd.DataFrame:
    """Tiingo se c'e' la chiave (affidabile), altrimenti Yahoo (spesso bloccato con 429)."""
    return tiingo.fetch_daily(symbol) if tiingo.api_key() else yahoo.fetch_daily(symbol)


def backfill_history(store: Store, symbol: str) -> int:
    """Scarica (solo la parte mancante) lo storico orario lungo del simbolo."""
    f = universe.FAST
    have = store.load_bars(f["history_venue"], symbol, "1h")
    start = (have.index[-1] + pd.Timedelta(hours=1) if len(have)
             else pd.Timestamp.now(tz="UTC").floor("h") - pd.DateOffset(years=f["history_years"]))
    bars = binance.fetch_hourly(f["history_symbols"][symbol], start)
    return store.upsert_bars(f["history_venue"], symbol, "1h", bars)


def run_backtests(store: Store) -> dict:
    out = {}
    for name, (fn, timeframe, grid) in strategies.STRATEGIES.items():
        tier = universe.FAST if timeframe == "1h" else universe.SLOW
        closes = {s: data.load_close(store, tier, s) for s in tier["symbols"]}
        close = pd.DataFrame({s: c for s, c in closes.items() if len(c)}).dropna(how="all").ffill()
        if close.empty:
            out[name] = {"errore": "nessun dato nell'archivio: eseguire prima `collect`"}
            continue
        costs = backtest.Costs.kraken() if timeframe == "1h" else backtest.Costs.ibkr_equities()
        train, test = (24 * 120, 24 * 30) if timeframe == "1h" else (756, 252)
        wf = backtest.walk_forward(close, fn, grid, timeframe, costs, train, test,
                                   capital_eur=tier["capital_eur"], min_trade=tier["min_trade"])
        if wf.oos_returns.empty:
            out[name] = {"errore": f"storico insufficiente ({len(close)} barre)"}
            continue
        gate = validation.passes_gate(wf.oos_returns, wf.trials)
        out[name] = {"metriche_fuori_campione": wf.metrics, "cancello_1": gate, "finestre": len(wf.folds),
                     "parametri_ultimi": wf.folds[-1]["params"]}
        store.save_strategy_status(name, timeframe, gate["passed"], gate["deflated_sharpe"],
                                   wf.metrics.get("sharpe", 0.0), wf.folds[-1]["params"])
    return out


def _safe(fn):
    try:
        return fn()
    except Exception as e:  # una fonte giu' non deve fermare le altre
        return f"errore: {e}"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="radix_trading")
    p.add_argument("command", choices=["collect", "backtest", "paper", "hourly", "daily", "report"])
    p.add_argument("--tier", choices=["fast", "slow", "all"], default="all", help="solo per collect")
    args = p.parse_args(argv)
    settings = Settings()
    store = Store(settings.db_path)
    try:
        if args.command == "collect":
            result = collect(store, args.tier)
        elif args.command == "backtest":
            result = run_backtests(store)
        elif args.command == "daily":
            # Ogni sera: dati lenti e nuovo backtest, che decide quali strategie il paper puo' usare.
            result = {"raccolta": collect(store, "slow"), "backtest": run_backtests(store)}
        elif args.command == "report":
            result = paper.report(store)
        else:
            # paper / hourly: il giro di paper trading usa sempre un conto simulato.
            result = {"raccolta": collect(store, "fast")} if args.command == "hourly" else {}
            engine = paper.PaperEngine(store, replace(settings, mode="paper"))
            result["paper"] = engine.step()
    finally:
        store.close()
    json.dump(result, sys.stdout, indent=2, default=str, ensure_ascii=False)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
