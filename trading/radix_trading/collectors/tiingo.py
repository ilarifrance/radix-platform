"""Storico giornaliero di ETF da Tiingo (piano gratuito, serve una chiave personale).

La chiave si mette in ~/RadixTrading/.env come `TIINGO_API_KEY=...` (mai nel repository).
Prezzi aggiustati per dividendi e split.
"""

from __future__ import annotations

import pandas as pd

from ..config import env_value
from .http import get

API = "https://api.tiingo.com/tiingo/daily/{symbol}/prices"


def api_key() -> str | None:
    return env_value("TIINGO_API_KEY")


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


IEX = "https://api.tiingo.com/iex/{symbol}/prices"


def parse_iex(rows: list[dict]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    df = pd.DataFrame(rows)
    df["ts"] = pd.to_datetime(df["date"], utc=True)
    out = df.set_index("ts")[["open", "high", "low", "close"]].astype(float)
    out["volume"] = df["volume"].astype(float).values if "volume" in df else 0.0
    return out[~out.index.duplicated(keep="last")]


def fetch_intraday(symbol: str, start: str, end: str, freq: str = "5min") -> pd.DataFrame:
    """Barre intraday (borsa IEX) tra due date, per gli studi al minuto intorno agli eventi."""
    key = api_key()
    if not key:
        raise RuntimeError("manca TIINGO_API_KEY in ~/RadixTrading/.env")
    params = {"startDate": start, "endDate": end, "resampleFreq": freq, "token": key,
              "columns": "open,high,low,close,volume"}
    return parse_iex(get(IEX.format(symbol=symbol.lower()), params).json())
