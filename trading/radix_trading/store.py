"""Archivio unico dei dati: prezzi, serie macro, notizie.

Backtest e motore live leggono dallo stesso archivio, cosi' i test usano esattamente i dati
che il sistema vedrebbe dal vivo. Oggi e' SQLite (un file); il passaggio a Postgres/TimescaleDB
cambia solo questo modulo.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

SCHEMA = """
CREATE TABLE IF NOT EXISTS bars (
    venue TEXT NOT NULL,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    ts TEXT NOT NULL,
    open REAL, high REAL, low REAL, close REAL, volume REAL,
    PRIMARY KEY (venue, symbol, timeframe, ts)
);
CREATE TABLE IF NOT EXISTS macro (
    series TEXT NOT NULL,
    date TEXT NOT NULL,
    value REAL,
    PRIMARY KEY (series, date)
);
CREATE TABLE IF NOT EXISTS news (
    url TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    title TEXT,
    source TEXT,
    language TEXT,
    country TEXT,
    query TEXT,
    sentiment REAL
);
CREATE INDEX IF NOT EXISTS news_ts ON news(ts);
CREATE TABLE IF NOT EXISTS strategy_status (
    name TEXT PRIMARY KEY,
    timeframe TEXT NOT NULL,
    passed INTEGER NOT NULL,
    deflated_sharpe REAL,
    sharpe REAL,
    params TEXT,
    updated TEXT NOT NULL
);
"""

BAR_COLUMNS = ["open", "high", "low", "close", "volume"]


class Store:
    def __init__(self, path: Path | str):
        self.path = Path(path)
        if str(path) != ":memory:":
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path))
        self.conn.executescript(SCHEMA)

    def close(self) -> None:
        self.conn.close()

    # --- prezzi -------------------------------------------------------------------------
    def upsert_bars(self, venue: str, symbol: str, timeframe: str, bars: pd.DataFrame) -> int:
        """Salva barre OHLCV con indice temporale UTC. Righe gia' presenti vengono aggiornate."""
        if bars.empty:
            return 0
        rows = [
            (venue, symbol, timeframe, _iso(ts), *(float(r[c]) for c in BAR_COLUMNS))
            for ts, r in bars[BAR_COLUMNS].iterrows()
        ]
        self.conn.executemany(
            "INSERT OR REPLACE INTO bars VALUES (?,?,?,?,?,?,?,?,?)",
            rows,
        )
        self.conn.commit()
        return len(rows)

    def load_bars(self, venue: str, symbol: str, timeframe: str) -> pd.DataFrame:
        df = pd.read_sql_query(
            "SELECT ts, open, high, low, close, volume FROM bars"
            " WHERE venue=? AND symbol=? AND timeframe=? ORDER BY ts",
            self.conn,
            params=(venue, symbol, timeframe),
        )
        df["ts"] = pd.to_datetime(df["ts"], utc=True)
        return df.set_index("ts")

    # --- macro --------------------------------------------------------------------------
    def upsert_macro(self, series: str, values: pd.Series) -> int:
        rows = [(series, _iso(d)[:10], float(v)) for d, v in values.dropna().items()]
        self.conn.executemany("INSERT OR REPLACE INTO macro VALUES (?,?,?)", rows)
        self.conn.commit()
        return len(rows)

    def load_macro(self, series: str) -> pd.Series:
        df = pd.read_sql_query(
            "SELECT date, value FROM macro WHERE series=? ORDER BY date", self.conn, params=(series,)
        )
        return pd.Series(df["value"].values, index=pd.to_datetime(df["date"]), name=series)

    # --- notizie ------------------------------------------------------------------------
    def upsert_news(self, items: list[dict]) -> int:
        rows = [
            (
                it["url"], it["ts"], it.get("title"), it.get("source"), it.get("language"),
                it.get("country"), it.get("query"), it.get("sentiment"),
            )
            for it in items
        ]
        self.conn.executemany("INSERT OR REPLACE INTO news VALUES (?,?,?,?,?,?,?,?)", rows)
        self.conn.commit()
        return len(rows)

    def load_news(self, since: str | None = None) -> pd.DataFrame:
        sql, params = "SELECT * FROM news", ()
        if since:
            sql, params = sql + " WHERE ts >= ?", (since,)
        return pd.read_sql_query(sql + " ORDER BY ts", self.conn, params=params)


    # --- esito dei backtest (cancello 1) ----------------------------------------------------
    def save_strategy_status(self, name: str, timeframe: str, passed: bool, dsr: float, sharpe: float,
                             params: dict) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO strategy_status VALUES (?,?,?,?,?,?,?)",
            (name, timeframe, int(passed), float(dsr), float(sharpe), json.dumps(params),
             datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")),
        )
        self.conn.commit()

    def approved_strategy(self, timeframe: str) -> tuple[str, dict] | None:
        """La strategia con il Deflated Sharpe piu' alto tra quelle che hanno superato il cancello 1."""
        row = self.conn.execute(
            "SELECT name, params FROM strategy_status WHERE timeframe = ? AND passed = 1"
            " ORDER BY deflated_sharpe DESC LIMIT 1", (timeframe,)).fetchone()
        return (row[0], json.loads(row[1])) if row else None


def _iso(ts) -> str:
    t = pd.Timestamp(ts)
    if t.tzinfo is None:
        t = t.tz_localize("UTC")
    return t.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ")
