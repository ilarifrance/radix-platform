"""Day trading selettivo sulle crypto: si guarda il minuto, si opera di rado.

Regola (dalla ricerca del 29 ottobre 2026 sul Mac di Francesco): si compra quando nell'ultima ora il
prezzo e' salito molto piu' del normale (`k` volte l'oscillazione tipica di un'ora, misurata sull'ultimo
giorno), si vende appena si guadagna `tp` (ordine limite), oppure allo stop, oppure a fine giornata UTC.
Al massimo `max_trades` operazioni al giorno, solo acquisti.

Il backtest e' a eventi (serve il prezzo minuto per minuto per sapere se l'obiettivo e' stato toccato):
la decisione presa alla chiusura del minuto t si esegue al prezzo di chiusura del minuto t+1.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass

import numpy as np
import pandas as pd

from . import validation

# Ricerca del 29/10: 108 combinazioni provate in tutto. Il cancello 1 conta tutte quelle prove.
RESEARCH_TRIALS = 108
GRID = {"k": [3.0, 4.0, 5.0], "tp": [0.005, 0.01, 0.02], "stop": [0.0, 0.01]}
SYMBOLS = ["XBTEUR", "ETHEUR"]
HISTORY_DAYS = 365


@dataclass(frozen=True)
class Rule:
    k: float = 4.0
    tp: float = 0.01
    stop: float = 0.0          # 0 = nessuno stop, si esce comunque a fine giornata
    lookback: int = 60         # minuti
    vol_window: int = 1440     # minuti (un giorno)
    max_trades: int = 2        # al giorno


def signal(close: pd.Series, rule: Rule) -> pd.Series:
    """True quando il rialzo dell'ultima ora supera k volte l'oscillazione tipica di un'ora."""
    r = close / close.shift(rule.lookback) - 1
    vol = np.log(close).diff().rolling(rule.vol_window).std() * np.sqrt(rule.lookback)
    return (r > rule.k * vol).fillna(False)


def simulate(bars: pd.DataFrame, rule: Rule, cost_side: float) -> pd.DataFrame:
    """Operazioni simulate: una riga per operazione con entrata, uscita, motivo e risultato netto."""
    close = bars["close"].to_numpy(float)
    high = bars["high"].to_numpy(float) if "high" in bars else close
    idx = bars.index
    days = idx.normalize().to_numpy()
    sig = signal(bars["close"], rule).to_numpy()
    n = len(close)
    out = []
    counts: dict = {}
    busy_until = -1
    for i in np.flatnonzero(sig):
        if i <= busy_until or i >= n - 1 or days[i + 1] != days[i]:
            continue
        if counts.get(days[i], 0) >= rule.max_trades:
            continue
        e = i + 1                      # si entra al minuto dopo il segnale
        entry = close[e]
        target = entry * (1 + rule.tp)
        floor = entry * (1 - rule.stop) if rule.stop > 0 else -np.inf
        j, exit_px, why = e + 1, None, None
        while j < n:
            if days[j] != days[e]:      # nuovo giorno: si chiude all'ultimo minuto del giorno prima
                exit_px, why, j = close[j - 1], "fine giornata", j - 1
                break
            if high[j] >= target:
                exit_px, why = target, "obiettivo"
                break
            if close[j] <= floor:
                exit_px, why = close[j], "stop"
                break
            j += 1
        if exit_px is None:            # dati finiti a meta' giornata: si chiude all'ultimo prezzo
            j = n - 1
            exit_px, why = close[j], "fine dati"
        gross = exit_px / entry - 1
        out.append({"entrata": idx[e], "uscita": idx[j], "prezzo_entrata": entry, "prezzo_uscita": exit_px,
                    "motivo": why, "lordo": gross, "netto": gross - 2 * cost_side})
        counts[days[i]] = counts.get(days[i], 0) + 1
        busy_until = j
    return pd.DataFrame(out, columns=["entrata", "uscita", "prezzo_entrata", "prezzo_uscita", "motivo", "lordo", "netto"])


def daily_returns(trades: pd.DataFrame, index: pd.DatetimeIndex) -> pd.Series:
    """Rendimento di ogni giorno (0 nei giorni senza operazioni): tutto il capitale su ogni operazione."""
    days = pd.DatetimeIndex(index.normalize().unique())
    if trades.empty:
        return pd.Series(0.0, index=days)
    by_day = (1 + trades["netto"]).groupby(pd.DatetimeIndex(trades["uscita"]).normalize()).prod() - 1
    return by_day.reindex(days, fill_value=0.0)


def walk_forward(bars: pd.DataFrame, cost_side: float, train_days: int = 90, test_days: int = 30,
                 grid: dict | None = None) -> dict:
    """Sceglie la regola sui `train_days` precedenti (rendimento netto), la prova sui `test_days` dopo."""
    grid = grid or GRID
    combos = [Rule(**dict(zip(grid, v))) for v in itertools.product(*grid.values())]
    days = pd.DatetimeIndex(bars.index.normalize().unique())
    trades, rets, folds = [], [], []
    start = train_days
    while start + 1 <= len(days):
        tr = bars[(bars.index >= days[start - train_days]) & (bars.index < days[start])]
        end_day = days[min(start + test_days, len(days)) - 1] + pd.Timedelta(days=1)
        te = bars[(bars.index >= days[start]) & (bars.index < end_day)]
        if te.empty:
            break
        best = max(combos, key=lambda r: (1 + simulate(tr, r, cost_side)["netto"]).prod())
        # Il segnale ha bisogno di un giorno di storia: il test parte con il giorno prima davanti.
        warm = bars[(bars.index >= days[start] - pd.Timedelta(days=1)) & (bars.index < end_day)]
        t = simulate(warm, best, cost_side)
        t = t[t["entrata"] >= days[start]]
        trades.append(t)
        rets.append(daily_returns(t, te.index))
        folds.append({"dal": str(days[start].date()), "regola": best.__dict__, "operazioni": len(t)})
        start += test_days
    all_trades = pd.concat(trades) if trades else pd.DataFrame(columns=["netto", "lordo", "motivo"])
    r = pd.concat(rets) if rets else pd.Series(dtype=float)
    return {"trades": all_trades, "returns": r, "folds": folds, "trials": max(len(combos), RESEARCH_TRIALS)}


def summarize(wf: dict, cost_side: float) -> dict:
    r, t = wf["returns"], wf["trades"]
    if r.empty:
        return {"errore": "storico al minuto insufficiente"}
    equity = (1 + r).cumprod()
    m = {
        "total_return": float(equity.iloc[-1] - 1),
        "max_drawdown": float((equity / equity.cummax() - 1).min()),
        "sharpe": float(r.mean() / r.std(ddof=1) * np.sqrt(365)) if r.std(ddof=1) > 0 else 0.0,
        "orders": int(2 * len(t)),
        "operazioni": int(len(t)),
        "vincenti": float((t["netto"] > 0).mean()) if len(t) else None,
        "lordo_medio": float(t["lordo"].mean()) if len(t) else None,
        "giorni": int(len(r)),
    }
    gate = validation.passes_gate(r, wf["trials"])
    return {"metriche_fuori_campione": m, "cancello_1": gate, "costo_per_lato": cost_side,
            "finestre": len(wf["folds"]), "parametri_ultimi": wf["folds"][-1]["regola"] if wf["folds"] else {}}
