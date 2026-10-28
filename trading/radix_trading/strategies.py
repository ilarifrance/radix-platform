"""Strategie di partenza per i due livelli. Restituiscono pesi desiderati tra 0 e 1.

Sono volutamente semplici e molto studiate in letteratura: servono come base da battere.
Ogni valore al tempo t usa solo dati fino a t (verificato dai test).
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def trend_momentum(close: pd.DataFrame, lookback: int = 252, skip: int = 21, sma: int = 200,
                   vol_window: int = 60, vol_target: float = 0.15, rebalance: int = 21) -> pd.DataFrame:
    """Livello lento (giornaliero, azioni/ETF): momentum 12-1 mesi con filtro di trend.

    Un asset e' in portafoglio se il rendimento degli ultimi 12 mesi (escluso l'ultimo) e'
    positivo e il prezzo e' sopra la media a 200 giorni. Il peso e' ridotto quando la
    volatilita' supera l'obiettivo, poi i pesi sono divisi in parti uguali tra gli asset.
    Si ribilancia ogni `rebalance` barre: con posizioni da 100 euro e commissione minima,
    ritocchi giornalieri costerebbero piu' di quanto rendono.
    """
    mom = close.shift(skip) / close.shift(lookback) - 1
    above = close > close.rolling(sma).mean()
    on = (mom > 0) & above
    vol = close.pct_change().rolling(vol_window).std() * np.sqrt(252)
    scale = (vol_target / vol).clip(upper=1.0)
    w = (on.astype(float) * scale / close.shape[1]).fillna(0.0)
    keep = np.arange(len(w)) % rebalance == 0
    return w.where(pd.Series(keep, index=w.index), axis=0).ffill().fillna(0.0)


def breakout_regime(close: pd.DataFrame, entry: int = 48, exit: int = 24, regime: int = 24 * 20) -> pd.DataFrame:
    """Livello veloce (orario, crypto): breakout di Donchian solo in regime rialzista.

    Entra quando il prezzo supera il massimo delle ultime `entry` ore e la media di lungo
    periodo sale; esce quando scende sotto il minimo delle ultime `exit` ore.
    """
    hi = close.rolling(entry).max().shift(1)
    lo = close.rolling(exit).min().shift(1)
    ma = close.rolling(regime).mean()
    bull = ma > ma.shift(24)
    state = pd.DataFrame(np.nan, index=close.index, columns=close.columns)
    state[(close > hi) & bull] = 1.0
    state[(close < lo) | ~bull] = 0.0
    w = state.ffill().fillna(0.0)
    return w / close.shape[1]


def mean_reversion(close: pd.DataFrame, window: int = 24, z_entry: float = -2.0, z_exit: float = 0.0,
                   regime: int = 24 * 20) -> pd.DataFrame:
    """Alternativa veloce: compra gli eccessi di ribasso a breve dentro un trend di fondo positivo."""
    mu = close.rolling(window).mean()
    sd = close.rolling(window).std()
    z = (close - mu) / sd
    trend_up = close > close.rolling(regime).mean()
    state = pd.DataFrame(np.nan, index=close.index, columns=close.columns)
    state[(z < z_entry) & trend_up] = 1.0
    state[(z > z_exit) | ~trend_up] = 0.0
    w = state.ffill().fillna(0.0)
    return w / close.shape[1]


STRATEGIES = {
    "trend_momentum": (trend_momentum, "1d", {"lookback": [126, 252], "sma": [100, 200]}),
    "breakout_regime": (breakout_regime, "1h", {"entry": [24, 48, 96], "exit": [12, 24]}),
    "mean_reversion": (mean_reversion, "1h", {"window": [24, 48], "z_entry": [-2.0, -2.5]}),
}
