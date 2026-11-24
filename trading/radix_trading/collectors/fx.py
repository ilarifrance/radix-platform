"""Cambi principali visti da chi ha euro: quanti euro vale una unita' di ogni valuta.

FRED pubblica i cambi giornalieri della Federal Reserve contro il dollaro. Da quelli si ricava il
valore in euro: per esempio il dollaro vale 1 / DEXUSEU euro, la sterlina DEXUSUK / DEXUSEU.
Salire significa che quella valuta si rafforza contro l'euro (comprarla guadagna).
"""

from __future__ import annotations

import pandas as pd

# Valuta -> (serie FRED, True se la serie e' "dollari per unita' di valuta").
SERIES = {
    "USD": None,
    "GBP": ("DEXUSUK", True),
    "JPY": ("DEXJPUS", False),
    "CHF": ("DEXSZUS", False),
    "AUD": ("DEXUSAL", True),
    "CAD": ("DEXCAUS", False),
}
EURUSD = "DEXUSEU"  # dollari per un euro
FRED_SERIES = (EURUSD,) + tuple(s[0] for s in SERIES.values() if s)


def in_euro(fred: dict[str, pd.Series]) -> dict[str, pd.Series]:
    """Dalle serie FRED al valore in euro di ogni valuta. Solo i giorni in cui ci sono entrambe."""
    eurusd = fred.get(EURUSD)
    if eurusd is None or eurusd.empty:
        return {}
    usd = (1.0 / eurusd).rename("USD")
    out = {"USD": usd}
    for code, spec in SERIES.items():
        if spec is None:
            continue
        series, usd_per_unit = spec
        s = fred.get(series)
        if s is None or s.empty:
            continue
        per_usd_in_eur = usd.reindex(s.index)
        value = (s if usd_per_unit else 1.0 / s) * per_usd_in_eur
        out[code] = value.dropna().rename(code)
    return out


def as_bars(value: pd.Series) -> pd.DataFrame:
    """Una sola quotazione al giorno: apertura, massimo e minimo uguali alla chiusura."""
    idx = pd.DatetimeIndex(value.index)
    idx = idx.tz_localize("UTC") if idx.tz is None else idx.tz_convert("UTC")
    v = pd.Series(value.values, index=idx).astype(float)
    return pd.DataFrame({"open": v, "high": v, "low": v, "close": v, "volume": 0.0})
