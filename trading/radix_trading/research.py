"""Ricerca larga e disciplinata: molte famiglie di strategie su tutti i mercati, un anno chiuso a chiave.

Come funziona:
1. Per ogni coppia (famiglia di strategie, mercato) un walk-forward sceglie i parametri sul passato e li
   prova sul periodo dopo, fino alla data di chiusura a chiave (gli ultimi `LOCKBOX_DAYS`).
2. La classifica si fa solo su quei risultati. Il Deflated Sharpe conta *tutte* le combinazioni provate
   in tutta la ricerca: piu' si cerca, piu' il controllo e' severo.
3. Solo le prime `FINALISTS`, se rispettano l'obiettivo (rendimento annuo e perdita massima), vengono
   aperte sull'anno chiuso a chiave, una volta sola. Se li' non reggono, erano fortuna.

Tutte le famiglie comprano soltanto (niente scoperto, niente leva) e decidono alla chiusura per il giorno dopo.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from itertools import product

import numpy as np
import pandas as pd

from . import backtest, data, strategies, universe, validation
from .store import Store

LOCKBOX_DAYS = 365
FINALISTS = 5
TARGET_CAGR = 0.10        # almeno il 10% l'anno...
TARGET_MAX_DD = -0.15     # ...con una perdita massima non oltre il 15%
TAX = {"crypto": 0.33, "default": 0.26}   # stima: plusvalenze crypto dal 2026, altri strumenti


# --- famiglie di strategie (pesi tra 0 e 1, solo dati passati) ------------------------------------------

def _vol_scale(close: pd.DataFrame, target: float, window: int = 60, ppy: int = 252) -> pd.DataFrame:
    vol = close.pct_change().rolling(window).std() * np.sqrt(ppy)
    return (target / vol).clip(upper=1.0)


def _every(w: pd.DataFrame, n: int) -> pd.DataFrame:
    keep = pd.Series(np.arange(len(w)) % n == 0, index=w.index)
    return w.where(keep, axis=0).ffill().fillna(0.0)


def ma_cross(close: pd.DataFrame, fast: int = 50, slow: int = 200, vol_target: float = 0.15) -> pd.DataFrame:
    """Investiti dove la media veloce e' sopra la lenta; peso ridotto se la volatilita' e' alta."""
    on = close.rolling(fast).mean() > close.rolling(slow).mean()
    w = on.astype(float) * _vol_scale(close, vol_target) / close.shape[1]
    return _every(w.fillna(0.0), 5)


def dual_momentum(close: pd.DataFrame, lookback: int = 126, top: int = 3, rebalance: int = 21) -> pd.DataFrame:
    """Rotazione: ogni mese tiene i `top` titoli saliti di piu', solo se sono saliti davvero (sopra zero)."""
    mom = close / close.shift(lookback) - 1
    rank = mom.rank(axis=1, ascending=False)
    pick = (rank <= top) & (mom > 0)
    w = pick.astype(float) / max(1, min(top, close.shape[1]))
    return _every(w.fillna(0.0), rebalance)


def rsi_dip(close: pd.DataFrame, rsi_len: int = 2, enter: float = 10.0, exit_ma: int = 5,
            trend: int = 200) -> pd.DataFrame:
    """Compra i cali di pochi giorni dentro un trend di fondo che sale; esce sopra la media breve."""
    delta = close.diff()
    up = delta.clip(lower=0).ewm(alpha=1 / rsi_len, adjust=False).mean()
    dn = (-delta.clip(upper=0)).ewm(alpha=1 / rsi_len, adjust=False).mean()
    rsi = 100 - 100 / (1 + up / dn.replace(0, np.nan))
    trend_up = close > close.rolling(trend).mean()
    state = pd.DataFrame(np.nan, index=close.index, columns=close.columns)
    state[(rsi < enter) & trend_up] = 1.0
    state[(close > close.rolling(exit_ma).mean()) | ~trend_up] = 0.0
    return state.ffill().fillna(0.0) / close.shape[1]


def inverse_vol_trend(close: pd.DataFrame, trend: int = 200, vol_window: int = 60, rebalance: int = 21) -> pd.DataFrame:
    """Portafoglio diversificato: piu' peso a cio' che oscilla meno, solo sopra la media lunga."""
    inv = 1 / (close.pct_change().rolling(vol_window).std())
    on = close > close.rolling(trend).mean()
    w = (inv * on).div(inv.sum(axis=1), axis=0)
    return _every(w.fillna(0.0), rebalance)


def breakout_daily(close: pd.DataFrame, entry: int = 55, exit: int = 20) -> pd.DataFrame:
    """Turtle: entra sul massimo di `entry` giorni, esce sul minimo di `exit` giorni."""
    hi = close.rolling(entry).max().shift(1)
    lo = close.rolling(exit).min().shift(1)
    state = pd.DataFrame(np.nan, index=close.index, columns=close.columns)
    state[close > hi] = 1.0
    state[close < lo] = 0.0
    return state.ffill().fillna(0.0) / close.shape[1]


def crash_guard(close: pd.DataFrame, trend: int = 150, dd_exit: float = 0.10, window: int = 60) -> pd.DataFrame:
    """Compra e tieni, ma esce quando si e' sotto la media lunga o oltre `dd_exit` sotto il massimo recente."""
    ok = (close > close.rolling(trend).mean()) & (close >= close.rolling(window).max() * (1 - dd_exit))
    return _every(ok.astype(float).fillna(0.0) / close.shape[1], 5)


DAILY_FAMILIES = {
    "ma_cross": (ma_cross, {"fast": [20, 50, 100], "slow": [100, 200, 300], "vol_target": [0.10, 0.20]}),
    "dual_momentum": (dual_momentum, {"lookback": [63, 126, 252], "top": [1, 3, 5], "rebalance": [21]}),
    "rsi_dip": (rsi_dip, {"rsi_len": [2, 3], "enter": [5.0, 10.0, 20.0], "exit_ma": [5], "trend": [100, 200]}),
    "inverse_vol_trend": (inverse_vol_trend, {"trend": [100, 200], "vol_window": [20, 60], "rebalance": [5, 21]}),
    "breakout_daily": (breakout_daily, {"entry": [20, 55, 100], "exit": [10, 20, 50]}),
    "crash_guard": (crash_guard, {"trend": [100, 150, 200], "dd_exit": [0.05, 0.10, 0.20], "window": [60]}),
}
# Le famiglie orarie gia' nel sistema, provate sulle crypto.
HOURLY_FAMILIES = {k: v for k, v in
                   ((n, (fn, g)) for n, (fn, tf, g) in strategies.STRATEGIES.items() if tf == "1h")}

NAMES = {
    "ma_cross": "Incrocio di medie", "dual_momentum": "Rotazione momentum", "rsi_dip": "Acquisto sui cali",
    "inverse_vol_trend": "Portafoglio diversificato con trend", "breakout_daily": "Rottura dei massimi (giorni)",
    "crash_guard": "Compra e tieni con protezione",
}


@dataclass
class Candidate:
    family: str
    market: str
    timeframe: str
    fn: object
    grid: dict
    close: pd.DataFrame
    costs: backtest.Costs
    capital: float
    min_trade: float


def _daily_crypto(store: Store) -> pd.DataFrame:
    f = universe.FAST
    closes = {s: data.load_close(store, f, s) for s in f["symbols"]}
    df = pd.DataFrame({s: c for s, c in closes.items() if len(c)})
    return df.resample("D").last().dropna(how="all").ffill() if len(df) else df


def candidates(store: Store) -> list[Candidate]:
    out = []
    for m, mk in universe.MARKETS.items():
        closes = {s: data.load_close(store, mk, s) for s in mk["symbols"]}
        close = pd.DataFrame({s: c for s, c in closes.items() if len(c)}).dropna(how="all").ffill()
        if close.empty:
            continue
        for fam, (fn, grid) in DAILY_FAMILIES.items():
            out.append(Candidate(fam, m, "1d", fn, grid, close, backtest.Costs.named(mk["costs"]),
                                 mk["capital_eur"], mk["min_trade"]))
    crypto_d = _daily_crypto(store)
    if not crypto_d.empty:
        for fam, (fn, grid) in DAILY_FAMILIES.items():
            out.append(Candidate(fam, "crypto", "1d", fn, grid, crypto_d, backtest.Costs.kraken_maker(), 100.0, 0.0))
    f = universe.FAST
    closes = {s: data.load_close(store, f, s) for s in f["symbols"]}
    crypto_h = pd.DataFrame({s: c for s, c in closes.items() if len(c)}).dropna(how="all").ffill()
    if not crypto_h.empty:
        for fam, (fn, grid) in HOURLY_FAMILIES.items():
            costs = backtest.Costs.kraken_maker() if fam in strategies.DAILY_DECISION else backtest.Costs.kraken()
            out.append(Candidate(fam, "crypto", "1h", fn, grid, crypto_h, costs, 100.0, 0.0))
    return out


def _grid_size(grid: dict) -> int:
    return int(np.prod([len(v) for v in grid.values()]))


def _summary(r: pd.Series, timeframe: str, market: str) -> dict:
    m = backtest.metrics(r, timeframe)
    if m.get("periods", 0) < 2:
        return {"periodi": m.get("periods", 0)}
    tax = TAX["crypto"] if market == "crypto" else TAX["default"]
    cagr = m["cagr"]
    return {"rendimento": m["total_return"], "annuo": cagr, "annuo_dopo_tasse": cagr * (1 - tax) if cagr > 0 else cagr,
            "max_drawdown": m["max_drawdown"], "sharpe": m["sharpe"], "periodi": m["periods"]}


def run(store: Store, lockbox_days: int = LOCKBOX_DAYS, finalists: int = FINALISTS,
        target_cagr: float = TARGET_CAGR, target_dd: float = TARGET_MAX_DD) -> dict:
    cands = candidates(store)
    total_trials = sum(_grid_size(c.grid) for c in cands)
    rows = []
    for c in cands:
        train, test = ((24 * 120, 24 * 30) if c.timeframe == "1h" else (504, 126))
        try:
            wf = backtest.walk_forward(c.close, c.fn, c.grid, c.timeframe, c.costs, train, test,
                                       capital_eur=c.capital, min_trade=c.min_trade)
        except Exception as e:  # una famiglia che si rompe non ferma la ricerca
            rows.append({"famiglia": c.family, "mercato": c.market, "timeframe": c.timeframe, "errore": str(e)})
            continue
        r = wf.oos_returns
        if r.empty:
            rows.append({"famiglia": c.family, "mercato": c.market, "timeframe": c.timeframe,
                         "errore": "storico insufficiente"})
            continue
        cut = r.index[-1] - pd.Timedelta(days=lockbox_days)
        search, lock = r[r.index <= cut], r[r.index > cut]
        if len(search) < 30:
            rows.append({"famiglia": c.family, "mercato": c.market, "timeframe": c.timeframe,
                         "errore": "storico troppo corto prima dell'anno chiuso a chiave"})
            continue
        s = _summary(search, c.timeframe, c.market)
        rows.append({"famiglia": c.family, "nome": NAMES.get(c.family, c.family), "mercato": c.market,
                     "timeframe": c.timeframe, "combinazioni": _grid_size(c.grid), "ricerca": s,
                     "dsr": validation.deflated_sharpe(search, total_trials),
                     "parametri_ultimi": wf.folds[-1]["params"], "_lock": lock})
    ok = [r for r in rows if "ricerca" in r and "annuo" in r["ricerca"]]
    ok.sort(key=lambda r: r["dsr"], reverse=True)
    meets = [r for r in ok if r["ricerca"]["annuo"] >= target_cagr and r["ricerca"]["max_drawdown"] >= target_dd]
    final = meets[:finalists]
    for r in final:
        lk = _summary(r["_lock"], r["timeframe"], r["mercato"])
        r["anno_chiuso"] = lk
        r["supera_anno_chiuso"] = bool(lk.get("annuo", -1) >= target_cagr and lk.get("max_drawdown", -1) >= target_dd)
    for r in rows:
        r.pop("_lock", None)
    return {
        "obiettivo": {"annuo": target_cagr, "max_drawdown": target_dd, "anno_chiuso_giorni": lockbox_days},
        "combinazioni_totali": total_trials,
        "prove": len(rows),
        "classifica": ok[:30],
        "rispettano_obiettivo": len(meets),
        "finaliste": final,
        "errori": [r for r in rows if "errore" in r],
    }


def save(settings, result: dict) -> None:
    from .snapshot import clean
    (settings.data_dir / "research.json").write_text(json.dumps(clean(result), default=str, ensure_ascii=False))
