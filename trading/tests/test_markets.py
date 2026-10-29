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


def _minute_bars(days=200, seed=1, jump_every=None):
    rng = np.random.default_rng(seed)
    n = days * 1440
    r = rng.normal(0, 0.0005, n)
    if jump_every:
        # rialzi forti e brevi seguiti da un ulteriore +1,5%: la regola deve coglierli
        for s in range(600, n - 200, jump_every):
            r[s:s + 30] += 0.0012
            r[s + 30:s + 60] += 0.0005
    close = 100 * np.exp(np.cumsum(r))
    idx = pd.date_range("2026-01-01", periods=n, freq="min", tz="UTC")
    return pd.DataFrame({"open": close, "high": close, "low": close, "close": close, "volume": 1.0}, index=idx)


def test_intraday_rules_are_respected():
    from radix_trading import intraday
    bars = _minute_bars(days=20, jump_every=1440 * 2)
    rule = intraday.Rule(k=3.0, tp=0.01, max_trades=2)
    t = intraday.simulate(bars, rule, cost_side=0.001)
    assert len(t) > 0
    per_day = t.groupby(pd.DatetimeIndex(t["entrata"]).normalize()).size()
    assert per_day.max() <= 2
    assert (pd.DatetimeIndex(t["entrata"]).normalize() == pd.DatetimeIndex(t["uscita"]).normalize()).all()
    hit = t[t["motivo"] == "obiettivo"]
    assert np.allclose(hit["lordo"], 0.01)
    assert np.allclose(t["netto"], t["lordo"] - 0.002)
    # nessuna operazione si sovrappone
    assert (t["entrata"].iloc[1:].values > t["uscita"].iloc[:-1].values).all()


def test_intraday_on_noise_does_not_pass_the_gate():
    from radix_trading import intraday
    bars = _minute_bars(days=150, seed=3)
    wf = intraday.walk_forward(bars, cost_side=0.001, grid={"k": [3.0, 4.0], "tp": [0.01], "stop": [0.0]})
    res = intraday.summarize(wf, 0.001)
    assert res["cancello_1"]["passed"] is False
    assert wf["trials"] == intraday.RESEARCH_TRIALS


def test_run_intraday_end_to_end():
    st = Store(":memory:")
    st.upsert_bars("binance", "XBTEUR", "1m", _minute_bars(days=125, seed=5, jump_every=1440 * 3))
    curves = {}
    out = cli.run_intraday(st, curves)
    k = "intraday_momentum@XBTEUR:economico"
    assert "cancello_1" in out[k] and out[k]["metriche_fuori_campione"]["giorni"] > 0
    assert "compra_e_tieni" in out[k] and curves[k]["date"]
    assert "errore" in out["intraday_momentum@ETHEUR:kraken"]
    json.dumps(snapshot.clean(out), allow_nan=False, default=str)


def test_research_lockbox_and_trials(tmp_path, monkeypatch):
    from radix_trading import research
    st = Store(":memory:")
    rng = np.random.default_rng(7)
    idx = pd.date_range("2016-01-01", periods=2600, freq="B", tz="UTC")
    for s in ["SPY", "QQQ", "TLT"]:
        c = 100 * np.exp(np.cumsum(rng.normal(0.0003, 0.01, len(idx))))
        st.upsert_bars("yahoo", s, "1d", pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0}, index=idx))
    monkeypatch.setattr(research, "HOURLY_FAMILIES", {})
    monkeypatch.setattr(research, "MACRO_FAMILIES", {})
    monkeypatch.setattr(research, "DAILY_FAMILIES", {"ma_cross": research.DAILY_FAMILIES["ma_cross"],
                                                     "dual_momentum": research.DAILY_FAMILIES["dual_momentum"]})
    out = research.run(st, target_cagr=-1.0, target_dd=-1.0)  # obiettivo largo: tutte finaliste
    # ETF con commissione minima: ogni famiglia si prova con 300 e con 1.000 euro
    assert out["combinazioni_totali"] == (18 + 24) * 2
    assert out["prove"] == 4 and len(out["finaliste"]) == 4
    assert sorted({f["capitale"] for f in out["finaliste"]}) == [300.0, 1000.0]
    for f in out["finaliste"]:
        assert "anno_chiuso" in f and f["anno_chiuso"]["periodi"] > 200
        assert 0 <= f["dsr"] <= 1
    json.dumps(snapshot.clean(out), allow_nan=False, default=str)
    # su prezzi casuali nessuna rispetta l'obiettivo vero
    strict = research.run(st)
    assert all(not f["supera_anno_chiuso"] for f in strict["finaliste"])


def test_daily_families_use_only_the_past():
    from radix_trading import research
    rng = np.random.default_rng(11)
    idx = pd.date_range("2018-01-01", periods=900, freq="B", tz="UTC")
    close = pd.DataFrame({s: 100 * np.exp(np.cumsum(rng.normal(0, 0.01, len(idx)))) for s in "ABC"}, index=idx)
    for name, (fn, grid) in research.DAILY_FAMILIES.items():
        params = {k: v[0] for k, v in grid.items()}
        full = fn(close, **params)
        cut = fn(close.iloc[:600], **params)
        pd.testing.assert_frame_equal(full.iloc[:600], cut, check_freq=False, obj=name)
        assert (full.values >= 0).all() and (full.sum(axis=1) <= 1 + 1e-9).all(), name


def test_daily_metrics_use_real_calendar():
    from radix_trading import backtest
    week = pd.Series(0.001, index=pd.date_range("2024-01-01", periods=366, freq="D", tz="UTC"))
    work = pd.Series(0.001, index=pd.date_range("2024-01-01", periods=262, freq="B", tz="UTC"))
    for r in (week, work):  # un anno di calendario in entrambi i casi
        m = backtest.metrics(r, "1d")
        assert abs(m["cagr"] - m["total_return"]) < 0.01 * abs(m["total_return"]) + 1e-3
