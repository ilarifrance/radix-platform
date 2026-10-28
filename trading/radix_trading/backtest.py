"""Motore di backtest vettoriale, con costi realistici e walk-forward.

Regole che il motore impone sempre:
- il peso deciso con i dati della barra t viene applicato dalla barra t+1 (niente sguardo al futuro);
- ogni variazione di posizione paga commissione, spread/slippage e una commissione minima in euro,
  che con posizioni da 100 euro pesa molto;
- solo posizioni lunghe e senza leva (pesi tra 0 e 1, somma al massimo 1).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from itertools import product
from typing import Callable

import numpy as np
import pandas as pd

PERIODS_PER_YEAR = {"1d": 252, "1h": 24 * 365, "4h": 6 * 365, "15m": 4 * 24 * 365}


@dataclass(frozen=True)
class Costs:
    fee_bps: float = 10.0       # commissione proporzionale (0,10%)
    slippage_bps: float = 5.0   # spread + slittamento stimato
    min_fee_eur: float = 0.0    # commissione minima per ordine (es. 1.0 su IBKR azioni)

    @classmethod
    def kraken(cls) -> "Costs":
        # Kraken Pro, livello base: circa 0,25% maker / 0,40% taker. Usiamo il taker, prudente.
        return cls(fee_bps=40.0, slippage_bps=5.0, min_fee_eur=0.0)

    @classmethod
    def ibkr_equities(cls) -> "Costs":
        # IBKR Tiered su azioni/ETF europei: circa 0,05% con minimo intorno a 1,25 euro.
        return cls(fee_bps=5.0, slippage_bps=5.0, min_fee_eur=1.25)


@dataclass
class Result:
    returns: pd.Series
    equity: pd.Series
    weights: pd.DataFrame
    costs_paid: pd.Series
    metrics: dict = field(default_factory=dict)


def run(
    prices: pd.DataFrame | pd.Series,
    target_weights: pd.DataFrame | pd.Series,
    timeframe: str = "1d",
    costs: Costs = Costs(),
    capital_eur: float = 100.0,
    min_trade: float = 0.0,
) -> Result:
    """`min_trade`: variazioni di peso piu' piccole di questa quota non vengono eseguite
    (banda di non intervento), cosi' i piccoli ritocchi non pagano la commissione minima."""
    close = _frame(prices)
    w = _frame(target_weights).reindex(close.index).reindex(columns=close.columns).fillna(0.0)
    w = w.clip(lower=0.0)
    gross = w.sum(axis=1)
    w = w.div(gross.where(gross > 1.0, 1.0), axis=0)  # mai oltre il 100% del capitale

    if min_trade > 0:
        w = _apply_band(w, min_trade)
    held = w.shift(1).fillna(0.0)  # decisione a t, posizione da t+1
    asset_ret = close.pct_change().fillna(0.0)
    gross_ret = (held * asset_ret).sum(axis=1)

    trades = held.diff().abs().fillna(held.abs())
    prop_cost = trades.sum(axis=1) * (costs.fee_bps + costs.slippage_bps) / 1e4
    min_cost = (trades > 1e-9).sum(axis=1) * costs.min_fee_eur / capital_eur
    # La commissione minima sostituisce quella proporzionale quando e' piu' alta.
    fee_only = trades.sum(axis=1) * costs.fee_bps / 1e4
    cost = prop_cost + (min_cost - fee_only).clip(lower=0.0)

    net = gross_ret - cost
    equity = (1.0 + net).cumprod()
    res = Result(returns=net, equity=equity, weights=held, costs_paid=cost)
    res.metrics = metrics(net, timeframe, held, trades)
    return res


def metrics(returns: pd.Series, timeframe: str, held: pd.DataFrame | None = None,
            trades: pd.DataFrame | None = None) -> dict:
    ppy = PERIODS_PER_YEAR[timeframe]
    r = returns.dropna()
    n = len(r)
    if n < 2:
        return {"periods": n}
    equity = (1 + r).cumprod()
    years = n / ppy
    vol = r.std(ddof=1) * np.sqrt(ppy)
    downside = r[r < 0].std(ddof=1) * np.sqrt(ppy) if (r < 0).sum() > 1 else np.nan
    dd = equity / equity.cummax() - 1
    out = {
        "periods": n,
        "total_return": float(equity.iloc[-1] - 1),
        "cagr": float(equity.iloc[-1] ** (1 / years) - 1) if equity.iloc[-1] > 0 else -1.0,
        "volatility": float(vol),
        "sharpe": float(r.mean() / r.std(ddof=1) * np.sqrt(ppy)) if r.std(ddof=1) > 0 else 0.0,
        "sortino": float(r.mean() * ppy / downside) if downside and downside > 0 else np.nan,
        "max_drawdown": float(dd.min()),
        "skew": float(r.skew()),
        "kurtosis": float(r.kurt() + 3),
    }
    if held is not None:
        out["exposure"] = float((held.sum(axis=1) > 0).mean())
    if trades is not None:
        out["orders"] = int((trades > 1e-9).sum().sum())
        out["turnover_per_year"] = float(trades.sum(axis=1).sum() / years)
    return out


@dataclass
class WalkForward:
    oos_returns: pd.Series
    folds: list[dict]
    trials: int
    metrics: dict


def walk_forward(
    prices: pd.DataFrame | pd.Series,
    strategy: Callable[..., pd.DataFrame | pd.Series],
    grid: dict[str, list],
    timeframe: str = "1d",
    costs: Costs = Costs(),
    train: int = 750,
    test: int = 250,
    capital_eur: float = 100.0,
    min_trade: float = 0.0,
) -> WalkForward:
    """Sceglie i parametri sul periodo di allenamento e li prova sul periodo successivo.

    `strategy(prices, **params)` deve restituire i pesi desiderati. I segnali vengono calcolati
    sull'intera serie fino alla fine del periodo di test, poi si valuta solo il test: e' corretto
    finche' la strategia usa solo dati passati (cosa che i test di `strategies` verificano).
    """
    close = _frame(prices)
    combos = [dict(zip(grid, values)) for values in product(*grid.values())]
    folds, oos, oos_w = [], [], []
    start = 0
    while start + train + test <= len(close):
        tr = close.iloc[start:start + train]
        te_end = start + train + test
        best, best_sharpe = combos[0], -np.inf
        for params in combos:
            r = run(tr, strategy(tr, **params), timeframe, costs, capital_eur, min_trade).returns
            s = r.mean() / r.std(ddof=1) if r.std(ddof=1) > 0 else -np.inf
            if s > best_sharpe:
                best, best_sharpe = params, s
        window = close.iloc[:te_end]
        res = run(window, strategy(window, **best), timeframe, costs, capital_eur, min_trade)
        test_ret = res.returns.iloc[start + train:te_end]
        oos.append(test_ret)
        folds.append({
            "train_start": tr.index[0], "test_start": test_ret.index[0], "test_end": test_ret.index[-1],
            "params": best, "test_return": float((1 + test_ret).prod() - 1),
        })
        held = res.weights.iloc[start + train:te_end]
        oos_w.append(held)
        start += test
    oos_returns = pd.concat(oos) if oos else pd.Series(dtype=float)
    if not oos:
        return WalkForward(oos_returns, folds, len(combos), {"periods": 0})
    held = pd.concat(oos_w)
    trades = held.diff().abs().fillna(held.abs())
    return WalkForward(oos_returns, folds, len(combos), metrics(oos_returns, timeframe, held, trades))


def _apply_band(w: pd.DataFrame, band: float) -> pd.DataFrame:
    vals = w.to_numpy(copy=True)
    for i in range(1, len(vals)):
        prev, want = vals[i - 1], vals[i]
        # Si esce sempre del tutto (peso 0); altrimenti si tratta solo oltre la banda.
        small = (np.abs(want - prev) < band) & (want > 0)
        vals[i] = np.where(small, prev, want)
    return pd.DataFrame(vals, index=w.index, columns=w.columns)


def _frame(x: pd.DataFrame | pd.Series) -> pd.DataFrame:
    return x.to_frame() if isinstance(x, pd.Series) else x
