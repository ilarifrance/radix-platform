"""Storico orario profondo per le crypto da Binance (klines pubbliche, senza chiave).

Kraken da' solo le ultime 720 ore: per backtest e meta-modello servono anni. Binance si usa
solo come archivio storico di ricerca; i prezzi correnti e le operazioni restano su Kraken.
"""

from __future__ import annotations

import time

import pandas as pd

from .http import get

API = "https://api.binance.com/api/v3/klines"
HOUR_MS = 3_600_000


def parse_klines(rows: list) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=["open_time", "open", "high", "low", "close", "volume",
                                     "close_time", "qv", "n", "tb", "tq", "ignore"])
    df["ts"] = pd.to_datetime(df["open_time"].astype("int64"), unit="ms", utc=True)
    return df.set_index("ts")[["open", "high", "low", "close", "volume"]].astype(float)


def fetch_hourly(symbol: str, start: pd.Timestamp, end: pd.Timestamp | None = None,
                 pause: float = 0.3) -> pd.DataFrame:
    """Barre orarie chiuse da `start` a `end` (default: adesso), 1000 per richiesta."""
    end_ms = int((end or pd.Timestamp.now(tz="UTC")).timestamp() * 1000)
    cur = int(start.timestamp() * 1000)
    parts = []
    while cur < end_ms:
        rows = get(API, {"symbol": symbol, "interval": "1h", "startTime": cur, "limit": 1000}).json()
        if not rows:
            break
        parts.append(parse_klines(rows))
        cur = int(rows[-1][0]) + HOUR_MS
        time.sleep(pause)
    if not parts:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    df = pd.concat(parts)
    df = df[~df.index.duplicated(keep="last")]
    return df[df.index + pd.Timedelta(hours=1) <= pd.Timestamp.now(tz="UTC")]
