"""Piu' strade insieme: scoperto solo quando il calo e' probabile, segnali macro, un direttore.

- `trend_brake` (crypto): il trend di sempre in acquisto; va allo scoperto, con una parte piccola del
  capitale, solo quando piu' segnali insieme indicano un calo forte (trend giu', rottura dei minimi
  di 20 giorni, volatilita' in aumento). Esce dallo scoperto al primo rimbalzo (massimo di 10 giorni).
- `gold_macro` (materie prime): oro solo quando il prezzo e' in trend e i tassi reali o il dollaro
  scendono (i due motori classici dell'oro).
- `risk_switch` (ETF): azioni USA quando la paura (VIX) e' bassa e il credito non si allarga,
  altrimenti obbligazioni a medio termine. Una sola posizione alla volta: poche commissioni minime.
- `allocate`: il "direttore" divide il capitale tra le strategie in proporzione inversa al loro
  rischio recente (solo dati passati), ribilanciando ogni mese.

I dati macro FRED escono il giorno dopo: si usano sempre con un giorno di ritardo.
"""

from __future__ import annotations

from functools import partial

import numpy as np
import pandas as pd

from . import strategies

HOUR = 24


def _daily_at(w: pd.DataFrame, hour: int = 0) -> pd.DataFrame:
    at = pd.Series(w.index.hour == hour, index=w.index)
    return w.where(at, axis=0).ffill().fillna(0.0)


def trend_brake(close: pd.DataFrame, fast: int = HOUR * 10, slow: int = HOUR * 100, vol_target: float = 0.25,
                short_size: float = 0.25, hour: int = 0) -> pd.DataFrame:
    n = close.shape[1]
    long_w = strategies.crypto_trend_daily(close, fast, slow, vol_target, hour)
    down = close.rolling(fast).mean() < close.rolling(slow).mean()
    breakdown = close < close.rolling(HOUR * 20).min().shift(1)
    vol = np.log(close).diff().rolling(HOUR * 30).std()
    rising_risk = vol > vol.rolling(HOUR * 365, min_periods=HOUR * 90).median()
    rebound = close > close.rolling(HOUR * 10).max().shift(1)
    state = pd.DataFrame(np.nan, index=close.index, columns=close.columns)
    state[down & breakdown & rising_risk] = 1.0
    state[rebound | ~down] = 0.0
    short_w = -state.ffill().fillna(0.0) * short_size / n
    return _daily_at(long_w.where(long_w > 0, short_w), hour)


def _macro_frame(macro: pd.DataFrame, index: pd.DatetimeIndex) -> pd.DataFrame:
    """Serie macro allineate ai giorni di mercato, con un giorno di ritardo (pubblicazione FRED)."""
    if macro is None or macro.empty:
        return pd.DataFrame(index=index)
    m = macro.copy()
    m.index = pd.to_datetime(m.index, utc=True).normalize()
    full = m.reindex(m.index.union(index.normalize())).ffill()
    return full.shift(1).reindex(index.normalize()).set_axis(index)


def gold_macro(close: pd.DataFrame, macro: pd.DataFrame | None = None, trend: int = 100, lookback: int = 60,
               symbol: str = "GLD") -> pd.DataFrame:
    w = pd.DataFrame(0.0, index=close.index, columns=close.columns)
    if symbol not in close:
        return w
    px = close[symbol]
    m = _macro_frame(macro, close.index)
    rate = m["DFII10"] if "DFII10" in m and m["DFII10"].notna().any() else m.get("DGS10")
    dollar = m.get("DTWEXBGS")
    tailwind = pd.Series(False, index=close.index)
    if rate is not None:
        tailwind |= rate < rate.shift(lookback)
    if dollar is not None:
        tailwind |= dollar < dollar.shift(lookback)
    w[symbol] = ((px > px.rolling(trend).mean()) & tailwind).astype(float)
    keep = pd.Series(np.arange(len(w)) % 5 == 0, index=w.index)  # al massimo una decisione a settimana
    return w.where(keep, axis=0).ffill().fillna(0.0)


def risk_switch(close: pd.DataFrame, macro: pd.DataFrame | None = None, vix_window: int = 252,
                trend: int = 200, risk_on: str = "SPY", risk_off: str = "IEF") -> pd.DataFrame:
    w = pd.DataFrame(0.0, index=close.index, columns=close.columns)
    if risk_on not in close or risk_off not in close:
        return w
    m = _macro_frame(macro, close.index)
    calm = pd.Series(True, index=close.index)
    if "VIXCLS" in m:
        vix = m["VIXCLS"]
        calm &= (vix < vix.rolling(vix_window, min_periods=60).median()).fillna(True)
    if "BAMLH0A0HYM2" in m:
        hy = m["BAMLH0A0HYM2"]
        calm &= ~(hy > hy.shift(20)).fillna(False)
    px = close[risk_on]
    on = calm & (px > px.rolling(trend).mean())
    w[risk_on] = on.astype(float)
    w[risk_off] = (~on).astype(float)
    keep = pd.Series(np.arange(len(w)) % 5 == 0, index=w.index)
    return w.where(keep, axis=0).ffill().fillna(0.0)


def with_macro(fn, macro: pd.DataFrame):
    """La ricerca chiama `fn(close, **params)`: qui si lega il quadro macro una volta sola."""
    f = partial(fn, macro=macro)
    f.__name__ = fn.__name__
    return f


def load_macro(store, series=("DFII10", "DGS10", "DTWEXBGS", "VIXCLS", "BAMLH0A0HYM2")) -> pd.DataFrame:
    cols = {s: store.load_macro(s) for s in series}
    return pd.DataFrame({k: v for k, v in cols.items() if len(v)})


def to_daily(r: pd.Series) -> pd.Series:
    """Rendimenti orari -> giornalieri (composti), per mettere insieme strategie diverse."""
    if len(r) < 2:
        return r
    step = r.index.to_series().diff().median()
    if step >= pd.Timedelta(hours=20):
        return r.set_axis(r.index.normalize())
    return (1 + r).groupby(r.index.normalize()).prod() - 1


def allocate(returns: dict[str, pd.Series], window: int = 90, rebalance: int = 21) -> tuple[pd.Series, pd.DataFrame]:
    """Il direttore: pesi inversi alla volatilita' dei 90 giorni precedenti, rivisti ogni mese.
    Nei giorni in cui un mercato e' chiuso la sua strategia rende 0 (soldi fermi)."""
    df = pd.DataFrame({k: to_daily(v) for k, v in returns.items()}).sort_index()
    df = df.dropna(how="all").fillna(0.0)
    vol = df.rolling(window, min_periods=30).std().shift(1)
    inv = 1 / vol.replace(0, np.nan)
    w = inv.div(inv.sum(axis=1), axis=0)
    keep = pd.Series(np.arange(len(w)) % rebalance == 0, index=w.index)
    w = w.where(keep, axis=0).ffill().fillna(0.0)
    return (w * df).sum(axis=1), w
