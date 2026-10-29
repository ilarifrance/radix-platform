import json

import numpy as np
import pandas as pd

from radix_trading import __main__ as cli
from radix_trading import backtest, snapshot, strategies, universe
from radix_trading.collectors import fx
from radix_trading.config import Settings
from radix_trading.store import Store


def test_fx_in_euro():
    idx = pd.to_datetime(["2026-10-27", "2026-10-28"])
    fred = {
        "DEXUSEU": pd.Series([1.25, 1.25], index=idx),   # 1 euro = 1,25 dollari
        "DEXUSUK": pd.Series([1.50, 1.50], index=idx),   # 1 sterlina = 1,50 dollari
        "DEXJPUS": pd.Series([100.0, 100.0], index=idx), # 1 dollaro = 100 yen
    }
    v = fx.in_euro(fred)
    assert v["USD"].iloc[-1] == 0.8
    assert abs(v["GBP"].iloc[-1] - 1.2) < 1e-12
    assert abs(v["JPY"].iloc[-1] - 0.008) < 1e-12
    assert "CHF" not in v
    bars = fx.as_bars(v["USD"])
    assert list(bars.columns) == ["open", "high", "low", "close", "volume"]
    assert str(bars.index.tz) == "UTC"


def test_store_fx_writes_bars():
    st = Store(":memory:")
    idx = pd.to_datetime(["2026-10-27", "2026-10-28"])
    st.upsert_macro("DEXUSEU", pd.Series([1.25, 1.20], index=idx))
    st.upsert_macro("DEXUSUK", pd.Series([1.50, 1.44], index=idx))
    assert cli.store_fx(st, universe.MARKETS["cambi"]) == 4
    assert len(st.load_bars("cambi", "GBP", "1d")) == 2


def test_every_market_is_tested_with_its_costs():
    tests = cli.tests_to_run()
    keys = [t[0] for t in tests]
    assert "crypto_trend_daily" in keys and "crypto_trend_guarded" in keys
    for m in universe.MARKETS:
        assert f"trend_momentum@{m}" in keys
    assert cli.costs_for("crypto_trend_daily", universe.FAST).fee_bps == 25
    assert cli.costs_for("breakout_regime", universe.FAST).fee_bps == 40
    assert cli.costs_for("trend_momentum", universe.MARKETS["cambi"]).min_fee_eur > 1
    assert cli.costs_for("trend_momentum", universe.MARKETS["italia"]).fee_bps > \
        cli.costs_for("trend_momentum", universe.MARKETS["etf"]).fee_bps


def test_guarded_trend_exits_on_a_crash():
    idx = pd.date_range("2026-01-01", periods=24 * 136, freq="h", tz="UTC")
    up = np.linspace(100, 200, 24 * 130)
    crash = np.linspace(200, 165, 24 * 6)
    close = pd.DataFrame({"X": np.concatenate([up, crash])}, index=idx)
    plain = strategies.crypto_trend_daily(close, fast=240, slow=1200)
    guarded = strategies.crypto_trend_guarded(close, slow=1200, stop=0.10)
    assert plain["X"].iloc[-1] > 0          # le medie dicono ancora trend
    assert guarded["X"].iloc[-1] == 0       # la protezione e' gia' uscita


def test_snapshot_build_and_push(tmp_path, monkeypatch):
    monkeypatch.setenv("RADIX_TRADING_DATA", str(tmp_path))
    monkeypatch.delenv("RADIX_TRADING_TOKEN", raising=False)
    monkeypatch.setattr(snapshot, "env_value", lambda name: None)
    settings = Settings()
    st = Store(settings.db_path)
    snapshot.save_backtest(settings, {"x": {"strategia": "x"}}, {"x": {"date": [], "strategia": []}})
    snap = snapshot.build(st, settings)
    assert snap["modalita"] == "paper" and snap["backtest"]["risultati"]["x"]["strategia"] == "x"
    assert {m["id"] for m in snap["mercati"]} == {"crypto", "etf", "italia", "materie_prime", "cambi"}
    json.dumps(snap, default=str)
    assert snapshot.push(snap)["inviato"] is False  # senza token non parte niente

    sent = {}

    class R:
        status_code = 200

    def fake_post(url, data, headers, timeout):
        sent.update(url=url, headers=headers, body=json.loads(data))
        return R()

    monkeypatch.setattr(snapshot.requests, "post", fake_post)
    out = snapshot.push(snap, url="https://example.test/", token="rtr1.a.b")
    assert out["inviato"] is True
    assert sent["url"] == "https://example.test/api/trading"
    assert sent["headers"]["Authorization"] == "Bearer rtr1.a.b"
    assert sent["body"]["versione"] == 1


def test_clean_removes_nan():
    out = snapshot.clean({"a": float("nan"), "b": [np.float64(1.5), float("inf")], "c": np.int64(3)})
    assert out == {"a": None, "b": [1.5, None], "c": 3}
