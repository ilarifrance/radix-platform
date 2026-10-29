"""Riga di comando.

    python -m radix_trading collect          # scarica prezzi, macro e notizie nell'archivio
    python -m radix_trading collect --tier fast   # solo crypto e notizie (ogni ora)
    python -m radix_trading hourly           # raccolta veloce + un giro di paper trading + invio a RADIX
    python -m radix_trading daily            # raccolta lenta + backtest (aggiorna le strategie approvate)
    python -m radix_trading report           # riepilogo del conto paper
    python -m radix_trading export > x.json  # la fotografia che riceve il pannello di RADIX
    python -m radix_trading push             # manda la fotografia a RADIX adesso
    python -m radix_trading backtest         # walk-forward delle strategie di partenza + cancello 1
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import replace

import pandas as pd

from . import backtest, data, intraday, paper, snapshot, strategies, universe, validation
from .collectors import binance, fred, fx, gdelt, kraken, tiingo, yahoo
from .config import Settings
from .store import Store


def collect(store: Store, tier: str = "all") -> dict:
    """`tier`: "fast" (crypto e notizie, ogni ora), "slow" (mercati giornalieri e macro) o "all"."""
    report: dict[str, object] = {}
    fast, slow = tier in ("fast", "all"), tier in ("slow", "all")
    if fast:
        f = universe.FAST
        for sym in f["symbols"]:
            report[f"kraken:{sym}"] = _safe(lambda: store.upsert_bars("kraken", sym, "1h", kraken.fetch_ohlc(sym, "1h")))
            report[f"storico:{sym}"] = _safe(lambda: backfill_history(store, sym))
        for sym in intraday.SYMBOLS:
            report[f"minuti:{sym}"] = _safe(lambda: backfill_minutes(store, sym))
        # GDELT limita molto: una sola ricerca per giro, a rotazione (4 temi in 4 ore).
        q = gdelt.DEFAULT_QUERIES[pd.Timestamp.now(tz="UTC").hour % len(gdelt.DEFAULT_QUERIES)]
        items, news_report = gdelt.fetch_all((q,))
        store.upsert_news(items)
        report.update({f"gdelt:{k}": v for k, v in news_report.items()})
    if slow:
        for series in fred.DEFAULT_SERIES + fx.FRED_SERIES:
            report[f"fred:{series}"] = _safe(lambda: store.upsert_macro(series, fred.fetch_series(series)))
        for name, market in universe.MARKETS.items():
            if market["source"] == "fred_fx":
                report[f"{name}"] = _safe(lambda: store_fx(store, market))
                continue
            for sym in market["symbols"]:
                src = universe.source_of(market, sym)
                if src == "yahoo" or not tiingo.api_key():
                    time.sleep(2)  # Yahoo limita le richieste ravvicinate
                report[f"{name}:{sym}"] = _safe(
                    lambda: store.upsert_bars(market["venue"], sym, "1d", fetch_daily(sym, src)))
    return report


def fetch_daily(symbol: str, source: str = "tiingo") -> pd.DataFrame:
    """Tiingo se c'e' la chiave (affidabile), altrimenti Yahoo (spesso bloccato con 429).
    Le azioni di Piazza Affari (.MI) ci sono solo su Yahoo."""
    if source == "tiingo" and tiingo.api_key():
        return tiingo.fetch_daily(symbol)
    return yahoo.fetch_daily(symbol)


# Compatibilita' con il nome precedente.
fetch_etf = fetch_daily


def store_fx(store: Store, market: dict) -> int:
    """I cambi si ricavano dalle serie FRED gia' salvate: nessuna richiesta in piu'."""
    values = fx.in_euro({s: store.load_macro(s) for s in fx.FRED_SERIES})
    return sum(store.upsert_bars(market["venue"], code, "1d", fx.as_bars(v))
               for code, v in values.items() if code in market["symbols"])


def backfill_history(store: Store, symbol: str) -> int:
    """Scarica (solo la parte mancante) lo storico orario lungo del simbolo."""
    f = universe.FAST
    have = store.load_bars(f["history_venue"], symbol, "1h")
    start = (have.index[-1] + pd.Timedelta(hours=1) if len(have)
             else pd.Timestamp.now(tz="UTC").floor("h") - pd.DateOffset(years=f["history_years"]))
    bars = binance.fetch_hourly(f["history_symbols"][symbol], start)
    return store.upsert_bars(f["history_venue"], symbol, "1h", bars)


def backfill_minutes(store: Store, symbol: str, max_requests: int = 120) -> int:
    """Storico al minuto per il day trading selettivo: al massimo `max_requests` richieste per giro
    (120 mila minuti), cosi' il primo anno arriva in qualche ora senza bloccare il giro orario."""
    f = universe.FAST
    last = store.conn.execute("SELECT MAX(ts) FROM bars WHERE venue = ? AND symbol = ? AND timeframe = '1m'",
                              (f["history_venue"], symbol)).fetchone()[0]
    start = (pd.Timestamp(last) + pd.Timedelta(minutes=1) if last
             else pd.Timestamp.now(tz="UTC").floor("min") - pd.Timedelta(days=intraday.HISTORY_DAYS))
    bars = binance.fetch_klines(f["history_symbols"][symbol], start, interval="1m", max_requests=max_requests)
    return store.upsert_bars(f["history_venue"], symbol, "1m", bars)


# Costo per lato del day trading: entrata a mercato, uscita con ordine limite sull'obiettivo.
INTRADAY_COSTS = {"kraken": (0.0040 + 0.0025) / 2 + 0.0002, "economico": 0.0010}


def run_intraday(store: Store, curves: dict | None = None) -> dict:
    out = {}
    for sym in intraday.SYMBOLS:
        bars = store.load_bars(universe.FAST["history_venue"], sym, "1m")
        for label, cost in INTRADAY_COSTS.items():
            key = f"intraday_momentum@{sym}:{label}"
            base = {"strategia": "intraday_momentum", "mercato": "crypto", "simboli": [sym], "costi_livello": label}
            if len(bars) < 1440 * 120:
                out[key] = {**base, "errore": f"storico al minuto insufficiente ({len(bars) // 1440} giorni su 120)"}
                continue
            wf = intraday.walk_forward(bars, cost)
            res = intraday.summarize(wf, cost)
            out[key] = {**base, **res}
            if "cancello_1" in res:
                close = bars["close"]
                r = wf["returns"]
                bh = close.resample("D").last().reindex(r.index).ffill()
                bh = bh / bh.iloc[0]
                out[key]["compra_e_tieni"] = {"rendimento": float(bh.iloc[-1] - 1),
                                              "max_drawdown": float((bh / bh.cummax() - 1).min())}
                store.save_strategy_status(key, "1m", res["cancello_1"]["passed"], res["cancello_1"]["deflated_sharpe"],
                                           res["metriche_fuori_campione"]["sharpe"], res["parametri_ultimi"])
                if curves is not None:
                    eq = (1 + r).cumprod().resample("ME").last()
                    curves[key] = {"date": [d.strftime("%Y-%m-%d") for d in eq.index],
                                   "strategia": [round(float(v), 4) for v in eq.values],
                                   "compra_e_tieni": [round(float(v), 4) for v in bh.resample("ME").last().reindex(eq.index).values]}
    return out


def tests_to_run() -> list[tuple[str, str, str, dict]]:
    """(chiave, strategia, mercato, impostazioni): le orarie sulle crypto, le giornaliere su ogni
    mercato lento. La chiave delle crypto e' il nome della strategia (la usa il paper trading)."""
    out = []
    for name, (_, timeframe, _) in strategies.STRATEGIES.items():
        if timeframe == "1h":
            out.append((name, name, "crypto", universe.FAST))
        else:
            out += [(f"{name}@{m}", name, m, market) for m, market in universe.MARKETS.items()]
    return out


def costs_for(strategy: str, market: dict) -> backtest.Costs:
    if market is universe.FAST:
        # Chi decide una volta al giorno puo' usare ordini limite (commissione maker).
        return backtest.Costs.kraken_maker() if strategy in strategies.DAILY_DECISION else backtest.Costs.kraken()
    return backtest.Costs.named(market["costs"])


def run_backtests(store: Store, curves: dict | None = None) -> dict:
    """Se `curves` e' un dizionario, ci mette la curva del capitale fuori campione (mensile)
    di ogni prova e quella di un semplice compra-e-tieni a pesi uguali, per il pannello."""
    out = {}
    for key, name, market_id, market in tests_to_run():
        fn, timeframe, grid = strategies.STRATEGIES[name]
        closes = {s: data.load_close(store, market, s) for s in market["symbols"]}
        close = pd.DataFrame({s: c for s, c in closes.items() if len(c)}).dropna(how="all").ffill()
        base = {"strategia": name, "mercato": market_id, "simboli": list(close.columns)}
        if close.empty:
            out[key] = {**base, "errore": "nessun dato nell'archivio: eseguire prima `collect`"}
            continue
        costs = costs_for(name, market)
        train, test = (24 * 120, 24 * 30) if timeframe == "1h" else (756, 252)
        try:
            wf = backtest.walk_forward(close, fn, grid, timeframe, costs, train, test,
                                       capital_eur=market["capital_eur"], min_trade=market["min_trade"])
        except Exception as e:  # una prova che si rompe non deve fermare le altre
            out[key] = {**base, "errore": f"prova non riuscita: {e}"}
            continue
        if wf.oos_returns.empty:
            out[key] = {**base, "errore": f"storico insufficiente ({len(close)} barre)"}
            continue
        gate = validation.passes_gate(wf.oos_returns, wf.trials)
        bh = close.loc[wf.oos_returns.index]
        bh = (bh / bh.bfill().iloc[0]).mean(axis=1)
        bh_dd = float((bh / bh.cummax() - 1).min())
        if curves is not None:
            eq = (1 + wf.oos_returns).cumprod().resample("ME").last()
            curves[key] = {"date": [d.strftime("%Y-%m-%d") for d in eq.index],
                           "strategia": [round(float(v), 4) for v in eq.values],
                           "compra_e_tieni": [round(float(v), 4) for v in bh.resample("ME").last().reindex(eq.index).values]}
        out[key] = {**base, "metriche_fuori_campione": wf.metrics, "cancello_1": gate, "finestre": len(wf.folds),
                    "parametri_ultimi": wf.folds[-1]["params"],
                    "compra_e_tieni": {"rendimento": float(bh.iloc[-1] - 1), "max_drawdown": bh_dd},
                    "costi": {"commissione_bps": costs.fee_bps, "slittamento_bps": costs.slippage_bps,
                              "minimo_eur": costs.min_fee_eur}}
        store.save_strategy_status(key, timeframe, gate["passed"], gate["deflated_sharpe"],
                                   wf.metrics.get("sharpe", 0.0), wf.folds[-1]["params"])
    return out


def _safe(fn):
    try:
        return fn()
    except Exception as e:  # una fonte giu' non deve fermare le altre
        return f"errore: {e}"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="radix_trading")
    p.add_argument("command", choices=["collect", "backtest", "paper", "hourly", "daily", "report", "export", "push"])
    p.add_argument("--tier", choices=["fast", "slow", "all"], default="all", help="solo per collect")
    args = p.parse_args(argv)
    settings = Settings()
    store = Store(settings.db_path)
    try:
        if args.command == "collect":
            result = collect(store, args.tier)
        elif args.command in ("backtest", "daily"):
            # Ogni sera: dati lenti e nuovo backtest, che decide quali strategie il paper puo' usare.
            result = {"raccolta": collect(store, "slow")} if args.command == "daily" else {}
            curves: dict = {}
            result["backtest"] = run_backtests(store, curves)
            day = _safe(lambda: run_intraday(store, curves))
            if isinstance(day, dict):
                result["backtest"].update(day)
            else:
                result["backtest"]["intraday_momentum"] = {"strategia": "intraday_momentum", "mercato": "crypto", "errore": day}
            snapshot.save_backtest(settings, result["backtest"], curves)
            if args.command == "daily":
                result["radix"] = _safe(lambda: snapshot.push(snapshot.build(store, settings)))
        elif args.command == "report":
            result = paper.report(store)
        elif args.command == "export":
            result = snapshot.build(store, settings)
        elif args.command == "push":
            result = snapshot.push(snapshot.build(store, settings))
        else:
            # paper / hourly: il giro di paper trading usa sempre un conto simulato.
            result = {"raccolta": collect(store, "fast")} if args.command == "hourly" else {}
            engine = paper.PaperEngine(store, replace(settings, mode="paper"))
            result["paper"] = engine.step()
            if args.command == "hourly":
                result["radix"] = _safe(lambda: snapshot.push(snapshot.build(store, settings)))
    finally:
        store.close()
    json.dump(snapshot.clean(result), sys.stdout, indent=2, default=str, ensure_ascii=False)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
