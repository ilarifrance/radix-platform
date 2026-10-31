import pandas as pd

from radix_trading import __main__ as cli
from radix_trading.store import Store


def test_collect_tiers(monkeypatch):
    calls = []
    bars = pd.DataFrame({c: [1.0] for c in ["open", "high", "low", "close", "volume"]},
                        index=pd.to_datetime(["2026-10-28"], utc=True))
    monkeypatch.setattr(cli.kraken, "fetch_ohlc", lambda s, tf: calls.append("kraken") or bars)
    monkeypatch.setattr(cli.gdelt, "fetch_all", lambda qs=None: calls.append("gdelt") or ([], {}))
    monkeypatch.setattr(cli.binance, "fetch_hourly", lambda s, start: calls.append("binance") or bars)
    monkeypatch.setattr(cli.yahoo, "fetch_daily", lambda s, period="max": calls.append("yahoo") or bars)
    monkeypatch.setattr(cli.tiingo, "api_key", lambda: None)
    monkeypatch.setattr(cli.time, "sleep", lambda s: None)
    monkeypatch.setattr(cli.fred, "fetch_series", lambda s: calls.append("fred") or pd.Series(dtype=float))
    cli.collect(Store(":memory:"), "fast")
    assert set(calls) == {"kraken", "binance", "gdelt"}
    calls.clear()
    cli.collect(Store(":memory:"), "slow")
    assert set(calls) == {"yahoo", "fred"}  # senza chiave Tiingo tutto passa da Yahoo


def test_refresh_start_only_new_days():
    thu = pd.Timestamp("2026-10-29", tz="UTC")
    assert cli.refresh_start(None, thu) is None
    assert cli.refresh_start(pd.Timestamp("2026-10-28", tz="UTC"), thu) == pd.Timestamp("2026-10-18", tz="UTC")
    assert cli.refresh_start(pd.Timestamp("2026-10-28", tz="UTC"), pd.Timestamp("2026-10-31", tz="UTC")) is None  # sabato
    assert cli.refresh_start(pd.Timestamp("2026-07-01", tz="UTC"), thu) is None


def test_collect_incremental_and_yahoo_stop(monkeypatch):
    store = Store(":memory:")
    bars = pd.DataFrame({c: [1.0] for c in ["open", "high", "low", "close", "volume"]},
                        index=pd.to_datetime(["2026-10-28"], utc=True))
    store.upsert_bars("yahoo", "SPY", "1d", bars)
    assert store.last_bar("yahoo", "SPY", "1d") == pd.Timestamp("2026-10-28", tz="UTC")
    starts, yahoo_calls = {}, []

    def tiingo_fetch(sym, start="2005-01-01"):
        starts[sym] = start
        return bars

    def yahoo_fetch(sym, period="max"):
        yahoo_calls.append(sym)
        raise RuntimeError("Fonte non raggiungibile (429 da yahoo)")

    monkeypatch.setattr(cli.tiingo, "api_key", lambda: "k")
    monkeypatch.setattr(cli.tiingo, "fetch_daily", tiingo_fetch)
    monkeypatch.setattr(cli.yahoo, "fetch_daily", yahoo_fetch)
    monkeypatch.setattr(cli.time, "sleep", lambda s: None)
    monkeypatch.setattr(cli.fred, "fetch_series", lambda s: pd.Series(dtype=float))
    monkeypatch.setattr(cli, "refresh_start", lambda last, now=None: None if last is None else last - pd.Timedelta(days=10))
    report = cli.collect(store, "slow")
    assert starts["SPY"] == "2026-10-18" and starts["QQQ"] == "2005-01-01"
    assert len(yahoo_calls) == 1  # dopo il primo 429 Yahoo non viene piu' chiamato in questo giro
    assert sum(str(v).startswith("rimandato") for v in report.values()) >= 9
