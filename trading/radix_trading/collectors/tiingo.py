"""Storico giornaliero di ETF da Tiingo (piano gratuito, serve una chiave personale).

La chiave si mette in ~/RadixTrading/.env come `TIINGO_API_KEY=...` (mai nel repository).
Prezzi aggiustati per dividendi e split.
"""

from __future__ import annotations

import os
from pathlib import Path

import pandas as pd

from .http import get

API = "https://api.tiingo.com/tiingo/daily/{symbol}/prices"


def api_key() -> str | None:
    key = os.environ.get("TIINGO_API_KEY")
    if key:
        return key
    env = Path.home() / "RadixTrading" / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("TIINGO_API_KEY="):
                return line.split("=", 1)[1].strip() or None
    return None


def parse_prices(rows: list[dict]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    df = pd.DataFrame(rows)
    df["ts"] = pd.to_datetime(df["date"], utc=True).dt.normalize()
    df = df.rename(columns={"adjOpen": "o", "adjHigh": "h", "adjLow": "l", "adjClose": "c", "adjVolume": "v"})
    out = df.set_index("ts")[["o", "h", "l", "c", "v"]].astype(float)
    out.columns = ["open", "high", "low", "close", "volume"]
    return out


def fetch_daily(symbol: str, start: str = "2005-01-01") -> pd.DataFrame:
    key = api_key()
    if not key:
        raise RuntimeError("manca TIINGO_API_KEY in ~/RadixTrading/.env")
    return parse_prices(get(API.format(symbol=symbol.lower()), {"startDate": start, "token": key}).json())
