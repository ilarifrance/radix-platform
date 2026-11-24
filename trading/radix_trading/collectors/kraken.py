"""Prezzi crypto da Kraken (API pubblica, gratuita, nessuna chiave)."""

from __future__ import annotations

import pandas as pd

from .http import get

API = "https://api.kraken.com/0/public/OHLC"
# Kraken accetta intervalli in minuti.
INTERVALS = {"1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440}


def parse_ohlc(payload: dict) -> tuple[pd.DataFrame, int]:
    if payload.get("error"):
        raise RuntimeError(f"Kraken: {payload['error']}")
    result = dict(payload["result"])
    last = int(result.pop("last"))
    (rows,) = result.values()
    df = pd.DataFrame(rows, columns=["time", "open", "high", "low", "close", "vwap", "volume", "count"])
    df["ts"] = pd.to_datetime(df["time"].astype(int), unit="s", utc=True)
    df = df.set_index("ts")[["open", "high", "low", "close", "volume"]].astype(float)
    return df, last


def fetch_ohlc(pair: str = "XBTEUR", timeframe: str = "1h", since: int | None = None) -> pd.DataFrame:
    """Ultime ~720 barre. L'ultima barra e' ancora aperta e viene scartata."""
    params = {"pair": pair, "interval": INTERVALS[timeframe]}
    if since:
        params["since"] = since
    df, _ = parse_ohlc(get(API, params).json())
    return df.iloc[:-1]
