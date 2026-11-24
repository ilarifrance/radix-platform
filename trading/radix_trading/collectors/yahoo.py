"""Storico giornaliero di ETF e indici da Yahoo Finance (endpoint chart pubblico, senza chiave).

Sostituisce Stooq, che dal 2026 risponde con una verifica anti-bot. Prezzi aggiustati per
dividendi e split usando il rapporto adjclose/close.
"""

from __future__ import annotations

import pandas as pd

from .http import BROWSER_UA, get

# query1 risponde spesso 429 dal bordo della rete; query2 di solito no. Si prova in ordine.
HOSTS = ("https://query2.finance.yahoo.com", "https://query1.finance.yahoo.com")
PATH = "/v8/finance/chart/{symbol}"


def parse_chart(payload: dict) -> pd.DataFrame:
    chart = payload.get("chart", {})
    if chart.get("error"):
        raise RuntimeError(f"Yahoo: {chart['error']}")
    res = chart["result"][0]
    if not res.get("timestamp"):
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    q = res["indicators"]["quote"][0]
    df = pd.DataFrame({k: q[k] for k in ("open", "high", "low", "close", "volume")},
                      index=pd.to_datetime(res["timestamp"], unit="s", utc=True).normalize())
    adj = res["indicators"].get("adjclose", [{}])[0].get("adjclose")
    if adj:
        ratio = pd.Series(adj, index=df.index) / df["close"]
        for c in ("open", "high", "low", "close"):
            df[c] = df[c] * ratio
    df.index.name = "ts"
    df = df.dropna(subset=["close"]).astype(float)
    return df[~df.index.duplicated(keep="last")]


def fetch_daily(symbol: str, period: str = "max") -> pd.DataFrame:
    """L'ultima barra (la giornata in corso) viene scartata finche' il mercato e' aperto."""
    params = {"range": period, "interval": "1d", "events": "div,splits"}
    last: Exception | None = None
    for host in HOSTS:
        try:
            r = get(host + PATH.format(symbol=symbol), params, retries=2, user_agent=BROWSER_UA, rate_limit_wait=10)
            break
        except RuntimeError as e:
            last = e
    else:
        raise RuntimeError(f"Yahoo non raggiungibile per {symbol}: {last}")
    df = parse_chart(r.json())
    today = pd.Timestamp.now(tz="UTC").normalize()
    return df[df.index < today]
