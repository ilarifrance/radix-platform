"""Controlli statistici contro l'overfitting (Bailey e Lopez de Prado).

Piu' varianti di strategia proviamo, piu' e' probabile trovarne una che sembra buona per caso.
Il Deflated Sharpe Ratio dice con che probabilita' lo Sharpe osservato e' reale, tenendo conto
del numero di tentativi, della lunghezza del campione e delle code della distribuzione.
"""

from __future__ import annotations

import math
from statistics import NormalDist

import pandas as pd

_N = NormalDist()
EULER_GAMMA = 0.5772156649


def probabilistic_sharpe(returns: pd.Series, benchmark_sr: float = 0.0) -> float:
    """Probabilita' che lo Sharpe vero (per periodo) sia sopra `benchmark_sr`."""
    r = returns.dropna()
    n = len(r)
    if n < 3 or r.std(ddof=1) == 0:
        return 0.0
    sr = r.mean() / r.std(ddof=1)
    skew, kurt = r.skew(), r.kurt() + 3
    denom = 1 - skew * sr + (kurt - 1) / 4 * sr ** 2
    if denom <= 0:
        return 0.0
    return _N.cdf((sr - benchmark_sr) * math.sqrt(n - 1) / math.sqrt(denom))


def expected_max_sharpe(trials: int, sr_variance: float) -> float:
    """Sharpe massimo atteso per puro caso tra `trials` strategie senza valore."""
    if trials <= 1:
        return 0.0
    return math.sqrt(sr_variance) * (
        (1 - EULER_GAMMA) * _N.inv_cdf(1 - 1 / trials)
        + EULER_GAMMA * _N.inv_cdf(1 - 1 / (trials * math.e))
    )


def deflated_sharpe(returns: pd.Series, trials: int, sr_variance: float | None = None) -> float:
    """Probabilita' che lo Sharpe non sia frutto della selezione tra `trials` tentativi.

    Se la varianza degli Sharpe dei tentativi non e' nota si usa quella di uno stimatore su
    un campione della stessa lunghezza, cioe' circa 1/(n-1): una stima prudente minima.
    """
    n = len(returns.dropna())
    if sr_variance is None:
        sr_variance = 1.0 / max(n - 1, 1)
    return probabilistic_sharpe(returns, expected_max_sharpe(trials, sr_variance))


def passes_gate(returns: pd.Series, trials: int, min_dsr: float = 0.95, max_dd: float = -0.25) -> dict:
    """Cancello 1 della roadmap: una strategia va al paper trading solo se lo supera."""
    equity = (1 + returns.dropna()).cumprod()
    dd = float((equity / equity.cummax() - 1).min()) if len(equity) else 0.0
    dsr = deflated_sharpe(returns, trials)
    return {
        "deflated_sharpe": dsr,
        "max_drawdown": dd,
        "passed": bool(dsr >= min_dsr and dd >= max_dd and equity.iloc[-1] > 1.0) if len(equity) else False,
    }
