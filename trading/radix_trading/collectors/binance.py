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


STEP_MS = {"1m": 60_000, "1h": HOUR_MS}


def fetch_klines(symbol: str, start: pd.Timestamp, end: pd.Timestamp | None = None, interval: str = "1h",
                 pause: float = 0.3, max_requests: int | None = None) -> pd.DataFrame:
    """Barre chiuse da `start` a `end` (default: adesso), 1000 per richiesta. `max_requests` limita
    il lavoro di un giro: il resto dello storico arriva ai giri successivi."""
    step = STEP_MS[interval]
    end_ms = int((end or pd.Timestamp.now(tz="UTC")).timestamp() * 1000)
    cur = int(start.timestamp() * 1000)
    parts, n = [], 0
    while cur < end_ms and (max_requests is None or n < max_requests):
        rows = get(API, {"symbol": symbol, "interval": interval, "startTime": cur, "limit": 1000}).json()
        n += 1
        if not rows:
            break
        parts.append(parse_klines(rows))
        cur = int(rows[-1][0]) + step
        time.sleep(pause)
    if not parts:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    df = pd.concat(parts)
    df = df[~df.index.duplicated(keep="last")]
    return df[df.index + pd.Timedelta(milliseconds=step) <= pd.Timestamp.now(tz="UTC")]


def fetch_hourly(symbol: str, start: pd.Timestamp, end: pd.Timestamp | None = None,
                 pause: float = 0.3) -> pd.DataFrame:
    """Barre orarie chiuse da `start` a `end` (default: adesso), 1000 per richiesta."""
    return fetch_klines(symbol, start, end, "1h", pause)
