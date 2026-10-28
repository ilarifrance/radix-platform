"""Riga di comando.

    python -m radix_trading collect          # scarica prezzi, macro e notizie nell'archivio
    python -m radix_trading backtest         # walk-forward delle strategie di partenza + cancello 1
"""

from __future__ import annotations

import argparse
import json
import sys

import pandas as pd

from . import backtest, strategies, universe, validation
from .collectors import fred, gdelt, kraken, stooq
from .config import Settings
from .store import Store


def collect(store: Store) -> dict:
    report: dict[str, object] = {}
    for sym in universe.FAST["symbols"]:
        report[f"kraken:{sym}"] = _safe(lambda: store.upsert_bars(
            "kraken", sym, "1h", kraken.fetch_ohlc(sym, "1h")))
    for sym in universe.SLOW["symbols"]:
        report[f"stooq:{sym}"] = _safe(lambda: store.upsert_bars("stooq", sym, "1d", stooq.fetch_daily(sym)))
    for series in fred.DEFAULT_SERIES:
        report[f"fred:{series}"] = _safe(lambda: store.upsert_macro(series, fred.fetch_series(series)))
    for q in gdelt.DEFAULT_QUERIES:
        report[f"gdelt:{q[:30]}"] = _safe(lambda: store.upsert_news(gdelt.fetch_articles(q)))
    return report


def run_backtests(store: Store) -> dict:
    out = {}
    for name, (fn, timeframe, grid) in strategies.STRATEGIES.items():
        tier = universe.FAST if timeframe == "1h" else universe.SLOW
        closes = {s: store.load_bars(tier["venue"], s, timeframe)["close"] for s in tier["symbols"]}
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
        out[name] = {"metriche_fuori_campione": wf.metrics, "cancello_1": validation.passes_gate(wf.oos_returns, wf.trials),
                     "finestre": len(wf.folds)}
    return out


def _safe(fn):
    try:
        return fn()
    except Exception as e:  # una fonte giu' non deve fermare le altre
        return f"errore: {e}"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="radix_trading")
    p.add_argument("command", choices=["collect", "backtest"])
    args = p.parse_args(argv)
    settings = Settings()
    store = Store(settings.db_path)
    try:
        result = collect(store) if args.command == "collect" else run_backtests(store)
    finally:
        store.close()
    json.dump(result, sys.stdout, indent=2, default=str, ensure_ascii=False)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
