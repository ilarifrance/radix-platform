import pandas as pd

from radix_trading import __main__ as cli
from radix_trading.store import Store


def test_collect_tiers(monkeypatch):
    calls = []
    bars = pd.DataFrame({c: [1.0] for c in ["open", "high", "low", "close", "volume"]},
                        index=pd.to_datetime(["2026-10-28"], utc=True))
    monkeypatch.setattr(cli.kraken, "fetch_ohlc", lambda s, tf: calls.append("kraken") or bars)
    monkeypatch.setattr(cli.gdelt, "fetch_articles", lambda q: calls.append("gdelt") or [])
    monkeypatch.setattr(cli.stooq, "fetch_daily", lambda s: calls.append("stooq") or bars)
    monkeypatch.setattr(cli.fred, "fetch_series", lambda s: calls.append("fred") or pd.Series(dtype=float))
    cli.collect(Store(":memory:"), "fast")
    assert set(calls) == {"kraken", "gdelt"}
    calls.clear()
    cli.collect(Store(":memory:"), "slow")
    assert set(calls) == {"stooq", "fred"}
