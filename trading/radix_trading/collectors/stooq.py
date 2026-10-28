"""Storico giornaliero di azioni, ETF e indici da Stooq (CSV gratuito).

Simboli: `spy.us`, `aapl.us`, `vwce.de`, `eunl.de`, `^spx`. Prezzi aggiustati per split e dividendi.
"""

from __future__ import annotations

import io

import pandas as pd

from .http import get

API = "https://stooq.com/q/d/l/"


def parse_daily_csv(text: str) -> pd.DataFrame:
    if not text.strip() or text.lstrip().startswith("No data"):
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    df = pd.read_csv(io.StringIO(text))
    df.columns = [c.strip().lower() for c in df.columns]
    if "volume" not in df:
        df["volume"] = 0.0
    df["ts"] = pd.to_datetime(df["date"], utc=True)
    return df.set_index("ts")[["open", "high", "low", "close", "volume"]].astype(float)


def fetch_daily(symbol: str) -> pd.DataFrame:
    return parse_daily_csv(get(API, {"s": symbol, "i": "d"}).text)
