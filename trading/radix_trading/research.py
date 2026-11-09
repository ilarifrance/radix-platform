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

from . import backtest, data, leverage, multi, strategies, universe, validation
from .store import Store

LOCKBOX_DAYS = 365
FINALISTS = 5
TARGET_CAGR = 0.10        # almeno il 10% l'anno...
TARGET_MAX_DD = -0.20     # ...con una perdita massima non oltre il 20% (scelta di Francesco, 29/10/2026)
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
    "dual_momentum": (dual_momentum, {"lookback": [63, 126, 252], "top": [1, 2, 3, 5], "rebalance": [21, 63]}),
    "rsi_dip": (rsi_dip, {"rsi_len": [2, 3], "enter": [5.0, 10.0, 20.0], "exit_ma": [5], "trend": [100, 200]}),
    "inverse_vol_trend": (inverse_vol_trend, {"trend": [100, 200], "vol_window": [20, 60], "rebalance": [5, 21, 63]}),
    "breakout_daily": (breakout_daily, {"entry": [20, 55, 100], "exit": [10, 20, 50]}),
    "crash_guard": (crash_guard, {"trend": [100, 150, 200], "dd_exit": [0.05, 0.10, 0.20], "window": [60]}),
}
# Le famiglie orarie gia' nel sistema, provate sulle crypto. Per le due di trend (le uniche vicine
# all'obiettivo) la griglia e' molto piu' larga: anche pesi piu' bassi (obiettivo di volatilita'),
# che rinunciano a parte del rendimento per perdere meno.
WIDE_HOURLY = {
    "crypto_trend_daily": {"fast": [24 * 5, 24 * 10, 24 * 20], "slow": [24 * 30, 24 * 50, 24 * 100],
                           "vol_target": [0.15, 0.25, 0.35, 0.5]},
    "crypto_trend_guarded": {"fast": [24 * 10, 24 * 20], "slow": [24 * 50, 24 * 100],
                             "stop": [0.08, 0.10, 0.15], "vol_target": [0.15, 0.2, 0.3]},
}
HOURLY_FAMILIES = {n: (fn, WIDE_HOURLY.get(n, g)) for n, (fn, tf, g) in strategies.STRATEGIES.items() if tf == "1h"}
# Con la commissione minima IBKR (1,25 euro a ordine) 300 euro divisi su molti titoli si mangiano in
# commissioni: ogni mercato con commissione minima si prova anche con 1.000 euro (tutto il conto).
CAPITAL_SCENARIOS = [1000.0]

NAMES = {
    "ma_cross": "Incrocio di medie", "dual_momentum": "Rotazione momentum", "rsi_dip": "Acquisto sui cali",
    "inverse_vol_trend": "Portafoglio diversificato con trend", "breakout_daily": "Rottura dei massimi (giorni)",
    "crash_guard": "Compra e tieni con protezione",
    "trend_brake": "Trend crypto con freno allo scoperto", "gold_macro": "Oro con segnali macro",
    "risk_switch": "Azioni o obbligazioni secondo la paura (VIX)", "portafoglio_multi": "Portafoglio di piu' strategie",
    "portafoglio_rischio_costante": "Portafoglio a rischio costante",
    "ibs_reversion": "Rimbalzo dopo chiusura sul minimo", "turn_of_month": "Fine e inizio mese",
    "tsmom": "Trend su piu' mercati", "crypto_trend_trailing": "Trend crypto con stop che segue il prezzo", "pre_fomc": "Rialzo prima della Fed",
}
# Piu' strade insieme (multi.py): scoperto solo con calo probabile, macro, e il portafoglio che le unisce.
BRAKE_GRID = {"fast": [24 * 10], "slow": [24 * 50, 24 * 100], "vol_target": [0.25, 0.5], "short_size": [0.25, 0.5],
              "exit_on": ["rebound", "trend"]}
MACRO_FAMILIES = {
    "materie_prime": ("gold_macro", multi.gold_macro, {"trend": [100, 200], "lookback": [20, 60, 120],
                                                       "vol_target": [0.0, 0.10, 0.15]}),
    "etf": ("risk_switch", multi.risk_switch, {"vix_window": [126, 252], "trend": [100, 200]}),
}
# Effetti di candela e di calendario sulle azioni (studio candele del 29/10/2026, letteratura).
BAR_FAMILIES = {
    "ibs_reversion": (multi.ibs_reversion, {"entry": [0.1, 0.2], "hold": [1, 3, 5], "exit_ibs": [0.8, 1.1],
                                            "trend": [0, 200], "max_names": [3, 5]}),
    "turn_of_month": (multi.turn_of_month, {"before": [2, 4], "after": [2, 3], "trend": [0, 200]}),
}
BAR_MARKETS = ("etf", "italia")
# Trend su piu' mercati insieme (pochi ETF ben diversi: la commissione minima pesa per ognuno).
MULTI_ASSET = {"etf": ["SPY", "EFA", "EEM", "TLT", "IEF", "HYG", "VNQ"], "materie_prime": ["GLD", "DBC", "USO"]}
MULTI_FAMILIES = {"tsmom": (multi.tsmom, {"lookback": [63, 126, 252], "vol_target": [0.10, 0.15, 0.25],
                                          "rebalance": [5, 21]})}
FOMC_GRID = {"days_before": [1, 2]}
LEVERAGE_TOP = 8
LANE_MIN_SHARPE = 0.3
TRAILING_GRID = {"fast": [24 * 10], "slow": [24 * 100], "vol_target": [0.25], "trail": [0.10, 0.15, 0.25],
                 "take": [0.0, 0.10, 0.20]}
# Le corsie del portafoglio: per ognuna si prende la versione migliore trovata dalla ricerca.
PORTFOLIO_LANES = [("crypto_trend_daily", "crypto"), ("trend_brake", "crypto"),
                   ("gold_macro", "materie_prime"), ("risk_switch", "etf"),
                   ("ibs_reversion", "etf"), ("turn_of_month", "etf"), ("tsmom", "multi_asset")]


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

    @property
    def key(self) -> str:
        return f"{self.family}@{self.market}:{self.timeframe}:{self.capital:.0f}"


def _daily_crypto(store: Store) -> pd.DataFrame:
    f = universe.FAST
    closes = {s: data.load_close(store, f, s) for s in f["symbols"]}
    df = pd.DataFrame({s: c for s, c in closes.items() if len(c)})
    return df.resample("D").last().dropna(how="all").ffill() if len(df) else df


def candidates(store: Store) -> list[Candidate]:
    out = []
    macro = multi.load_macro(store)
    for m, mk in universe.MARKETS.items():
        closes = {s: data.load_close(store, mk, s) for s in mk["symbols"]}
        close = pd.DataFrame({s: c for s, c in closes.items() if len(c)}).dropna(how="all").ffill()
        if close.empty:
            continue
        costs = backtest.Costs.named(mk["costs"])
        capitals = [mk["capital_eur"]] + ([c for c in CAPITAL_SCENARIOS if c != mk["capital_eur"]]
                                          if costs.min_fee_eur > 0 else [])
        fams = dict(DAILY_FAMILIES)
        if m in MACRO_FAMILIES:
            name, fn, grid = MACRO_FAMILIES[m]
            fams[name] = (multi.with_macro(fn, macro), grid)
        if m in BAR_MARKETS:
            bars = {s: store.load_bars(mk["venue"], s, "1d") for s in close.columns}
            frame = multi.ibs({s: b for s, b in bars.items() if len(b)}).reindex(close.index)
            for name, (fn, grid) in BAR_FAMILIES.items():
                fams[name] = (multi.with_bars(fn, frame) if name == "ibs_reversion" else fn, grid)
        if m == "etf":
            fomc = _fomc_dates(store)
            if len(fomc):
                fams["pre_fomc"] = (multi.with_bars(multi.pre_fomc, fomc, "dates"), FOMC_GRID)
        for fam, (fn, grid) in fams.items():
            for cap in capitals:
                out.append(Candidate(fam, m, "1d", fn, grid, close, costs, cap, mk["min_trade"]))
    cols = {}
    for m, syms in MULTI_ASSET.items():
        mk = universe.MARKETS[m]
        for sym in syms:
            c = data.load_close(store, mk, sym)
            if len(c):
                cols[sym] = c
    if len(cols) >= 4:
        close = pd.DataFrame(cols).dropna(how="all").ffill()
        for fam, (fn, grid) in MULTI_FAMILIES.items():
            out.append(Candidate(fam, "multi_asset", "1d", fn, grid, close, backtest.Costs.ibkr_equities(), 1000.0, 0.05))
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
        out.append(Candidate("trend_brake", "crypto", "1h", multi.trend_brake, BRAKE_GRID, crypto_h,
                             backtest.Costs.kraken_short(), 100.0, 0.0))
        out.append(Candidate("crypto_trend_trailing", "crypto", "1h", multi.crypto_trend_trailing, TRAILING_GRID,
                             crypto_h, backtest.Costs.kraken_maker(), 100.0, 0.0))
    return out


def _fomc_dates(store: Store) -> pd.DatetimeIndex:
    """Giorni delle decisioni Fed: tutti i comunicati FOMC (con la chiave FRED), altrimenti i cambi di tasso."""
    try:
        rows = store.conn.execute("SELECT day, kind FROM calendar WHERE kind IN ('fomc', 'fed')").fetchall()
    except Exception:
        return pd.DatetimeIndex([])
    fomc = [d for d, k in rows if k == "fomc"]
    days = fomc if len(fomc) >= 20 else [d for d, _ in rows]
    return pd.DatetimeIndex(sorted(set(pd.to_datetime(days))))


def _leverage(rows: list[dict], target_dd: float) -> list[dict]:
    """Le strategie migliori (e il portafoglio) con la leva: margine IBKR e CFD."""
    ok = [r for r in rows if "_returns" in r and "ricerca" in r and "annuo" in r["ricerca"]]
    ok.sort(key=lambda r: r["dsr"], reverse=True)
    pick = ok[:LEVERAGE_TOP] + [r for r in ok[LEVERAGE_TOP:] if r["famiglia"].startswith("portafoglio")]
    out = []
    for r in pick:
        cut = r["_returns"].index[-1] - pd.Timedelta(days=LOCKBOX_DAYS)
        search = r["_returns"][r["_returns"].index <= cut]
        last = r["_returns"][r["_returns"].index > cut]
        item = {"famiglia": r["famiglia"], "nome": r.get("nome"), "mercato": r["mercato"], "timeframe": r["timeframe"]}
        for kind in leverage.FINANCING:
            t = leverage.table(search, r["timeframe"], r["mercato"], kind, target_dd)
            best = t["leva_migliore_entro_limite"]
            if best and len(last) > 30:
                x, closed = leverage.levered(last, best, r["timeframe"], r["mercato"], kind)
                m = backtest.metrics(x, r["timeframe"])
                t["ultimo_anno_con_leva"] = {"annuo": m.get("cagr"), "max_drawdown": m.get("max_drawdown"),
                                             "chiusura_forzata": closed}
            item[kind] = t
        out.append(item)
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
            rows.append({"famiglia": c.family, "mercato": c.market, "timeframe": c.timeframe, "capitale": c.capital, "errore": str(e)})
            continue
        r = wf.oos_returns
        if r.empty:
            rows.append({"famiglia": c.family, "mercato": c.market, "timeframe": c.timeframe,
                         "capitale": c.capital, "errore": "storico insufficiente"})
            continue
        cut = r.index[-1] - pd.Timedelta(days=lockbox_days)
        search, lock = r[r.index <= cut], r[r.index > cut]
        if len(search) < 30:
            rows.append({"famiglia": c.family, "mercato": c.market, "timeframe": c.timeframe,
                         "capitale": c.capital, "errore": "storico troppo corto prima dell'anno chiuso a chiave"})
            continue
        s = _summary(search, c.timeframe, c.market)
        rows.append({"famiglia": c.family, "nome": NAMES.get(c.family, c.family), "mercato": c.market,
                     "timeframe": c.timeframe, "capitale": c.capital, "combinazioni": _grid_size(c.grid), "ricerca": s,
                     "dsr": validation.deflated_sharpe(search, total_trials),
                     "parametri_ultimi": wf.folds[-1]["params"], "_lock": lock, "_returns": r})
    port = _portfolio(rows, lockbox_days, total_trials)
    if port:
        rows.append(port)
        vt = _vol_managed(port, lockbox_days, total_trials)
        if vt:
            rows.append(vt)
    ok = [r for r in rows if "ricerca" in r and "annuo" in r["ricerca"]]
    ok.sort(key=lambda r: r["dsr"], reverse=True)
    meets = [r for r in ok if r["ricerca"]["annuo"] >= target_cagr and r["ricerca"]["max_drawdown"] >= target_dd]
    final = meets[:finalists]
    for r in final:
        lk = _summary(r["_lock"], r["timeframe"], r["mercato"])
        r["anno_chiuso"] = lk
        r["supera_anno_chiuso"] = bool(lk.get("annuo", -1) >= target_cagr and lk.get("max_drawdown", -1) >= target_dd)
    lev = _leverage(rows, target_dd)
    for r in rows:
        r.pop("_lock", None)
        r.pop("_returns", None)
    return {
        "leva": lev,
        "obiettivo": {"annuo": target_cagr, "max_drawdown": target_dd, "anno_chiuso_giorni": lockbox_days},
        "combinazioni_totali": total_trials,
        "prove": len(rows),
        "classifica": ok[:30],
        "rispettano_obiettivo": len(meets),
        "finaliste": final,
        "errori": [r for r in rows if "errore" in r],
    }


def _portfolio(rows: list[dict], lockbox_days: int, total_trials: int) -> dict | None:
    """Unisce le corsie migliori con il direttore (multi.allocate) e lo valuta come una strategia."""
    picked = {}
    for fam, market in PORTFOLIO_LANES:
        cands = [r for r in rows if r.get("famiglia") == fam and r.get("mercato") == market and "_returns" in r]
        if cands:
            best = max(cands, key=lambda r: r["dsr"])
            # solo corsie che hanno reso qualcosa per il rischio preso negli anni di ricerca:
            # le corsie deboli diluiscono le buone (prova del 29/10: da 4 a 7 corsie, DSR da 0,36 a 0,02)
            if best["ricerca"].get("sharpe", 0) >= LANE_MIN_SHARPE:
                picked[f"{fam}@{market}"] = best
    if len(picked) < 2:
        return None
    r, _ = multi.allocate({k: v["_returns"] for k, v in picked.items()})
    if len(r) < 60:
        return None
    cut = r.index[-1] - pd.Timedelta(days=lockbox_days)
    search, lock = r[r.index <= cut], r[r.index > cut]
    if len(search) < 30:
        return None
    return {"famiglia": "portafoglio_multi", "nome": NAMES["portafoglio_multi"], "mercato": "multi",
            "timeframe": "1d", "capitale": 1000.0, "combinazioni": 0, "ricerca": _summary(search, "1d", "multi"),
            "dsr": validation.deflated_sharpe(search, total_trials),
            "parametri_ultimi": {"corsie": sorted(picked)}, "_lock": lock, "_returns": r}


PORTFOLIO_VOL_TARGET = 0.08
PORTFOLIO_MAX_SCALE = 1.5


def _vol_managed(port: dict, lockbox_days: int, total_trials: int) -> dict | None:
    """Portafoglio a rischio costante (Moreira-Muir 2017): esposizione = obiettivo / volatilita' dei
    60 giorni prima, tra 0 e 1,5 volte; sopra 1 si paga il margine (4% l'anno sulla parte in prestito)."""
    r = port["_returns"]
    vol = r.rolling(60).std().shift(1) * np.sqrt(365)
    scale = (PORTFOLIO_VOL_TARGET / vol).clip(upper=PORTFOLIO_MAX_SCALE).fillna(0.0)
    x = scale * r - (scale - 1).clip(lower=0) * 0.04 / 365
    x = x.iloc[60:]
    cut = x.index[-1] - pd.Timedelta(days=lockbox_days)
    search, lock = x[x.index <= cut], x[x.index > cut]
    if len(search) < 30:
        return None
    return {"famiglia": "portafoglio_rischio_costante", "nome": NAMES["portafoglio_rischio_costante"], "mercato": "multi",
            "timeframe": "1d", "capitale": 1000.0, "combinazioni": 0, "ricerca": _summary(search, "1d", "multi"),
            "dsr": validation.deflated_sharpe(search, total_trials),
            "parametri_ultimi": port["parametri_ultimi"] | {"rischio_annuo": PORTFOLIO_VOL_TARGET,
                                                            "esposizione_max": PORTFOLIO_MAX_SCALE},
            "_lock": lock, "_returns": x}


def save(settings, result: dict) -> None:
    from .snapshot import clean
    (settings.data_dir / "research.json").write_text(json.dumps(clean(result), default=str, ensure_ascii=False))
