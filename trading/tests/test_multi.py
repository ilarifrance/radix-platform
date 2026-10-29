import numpy as np
import pandas as pd

from radix_trading import backtest, multi, research
from radix_trading.config import Settings
from radix_trading.paper import PaperEngine
from radix_trading.store import Store


def _hourly(path):
    idx = pd.date_range("2023-01-01", periods=len(path), freq="h", tz="UTC")
    return pd.DataFrame({"BTC": path}, index=idx)


def test_short_only_with_allow_short_and_pays_carry():
    idx = pd.date_range("2024-01-01", periods=11, freq="D", tz="UTC")
    px = pd.Series(np.linspace(100, 90, 11), index=idx)
    w = pd.Series(-1.0, index=idx)
    long_only = backtest.run(px, w, "1d", backtest.Costs(fee_bps=0, slippage_bps=0))
    assert long_only.equity.iloc[-1] == 1.0  # senza permesso lo scoperto non esiste
    free = backtest.run(px, w, "1d", backtest.Costs(fee_bps=0, slippage_bps=0, allow_short=True))
    carry = backtest.run(px, w, "1d", backtest.Costs(fee_bps=0, slippage_bps=0, allow_short=True, short_bps_year=1e4))
    assert free.equity.iloc[-1] > 1.09
    assert carry.equity.iloc[-1] < free.equity.iloc[-1]


def test_trend_brake_shorts_only_in_a_crash():
    up = 100 * np.exp(np.linspace(0, 0.8, 24 * 400))
    rng = np.random.default_rng(1)
    crash = up[-1] * np.exp(np.cumsum(rng.normal(-0.0006, 0.006, 24 * 200)))
    close = _hourly(np.concatenate([up, crash]))
    w = multi.trend_brake(close, fast=24 * 10, slow=24 * 50, short_size=0.25)
    assert w["BTC"].iloc[: 24 * 400].min() >= 0  # mai short mentre sale
    assert w["BTC"].min() == -0.25 and w["BTC"].max() > 0
    # decide una volta al giorno
    assert (w["BTC"].diff().fillna(0).ne(0) & (w.index.hour != 0)).sum() == 0


def test_brake_uses_only_the_past():
    rng = np.random.default_rng(3)
    close = _hourly(100 * np.exp(np.cumsum(rng.normal(0, 0.01, 24 * 500))))
    full = multi.trend_brake(close, fast=24 * 10, slow=24 * 50)
    cut = multi.trend_brake(close.iloc[: 24 * 400], fast=24 * 10, slow=24 * 50)
    pd.testing.assert_frame_equal(full.iloc[: 24 * 400], cut)


def test_gold_macro_uses_macro_with_one_day_delay():
    idx = pd.date_range("2020-01-01", periods=400, freq="B", tz="UTC")
    close = pd.DataFrame({"GLD": np.linspace(100, 200, 400), "SLV": 1.0}, index=idx)
    rate = pd.Series(np.r_[np.linspace(2, 0, 300), np.linspace(0, 3, 100)], index=idx.tz_localize(None))
    macro = pd.DataFrame({"DFII10": rate, "DTWEXBGS": pd.Series(100.0, index=rate.index)})
    w = multi.gold_macro(close, macro, trend=50, lookback=20)
    assert w["SLV"].abs().sum() == 0
    assert w["GLD"].iloc[150] == 1.0 and w["GLD"].iloc[-1] == 0.0  # tassi in risalita: fuori
    m = multi._macro_frame(macro, idx)
    assert m["DFII10"].iloc[10] == rate.iloc[9]


def test_allocate_inverse_vol_and_daily():
    idx = pd.date_range("2024-01-01", periods=24 * 200, freq="h", tz="UTC")
    rng = np.random.default_rng(5)
    hourly = pd.Series(rng.normal(0, 0.004, len(idx)), index=idx)
    days = pd.date_range("2024-01-01", periods=200, freq="D", tz="UTC")
    calm = pd.Series(rng.normal(0, 0.002, 200), index=days)
    r, w = multi.allocate({"crypto": hourly, "calmo": calm})
    assert len(r) == 200
    assert w["calmo"].iloc[-1] >= w["crypto"].iloc[-1]
    assert np.allclose(w.iloc[90:].sum(axis=1), 1.0)


def test_sweep_sets_profit_aside_and_covers_losses(tmp_path):
    settings = Settings(data_dir=tmp_path, mode="paper")
    eng = PaperEngine(Store(":memory:"), settings)
    base = settings.limits.capital_eur
    eng.db.execute("UPDATE paper_account SET cash = ?", (base + 200,))
    assert round(eng.sweep({}), 2) == 200 and eng.reserve() == 200
    assert eng.state({}).equity_eur == base
    eng.db.execute("UPDATE paper_account SET cash = ?", (base - 50,))
    assert round(eng.sweep({}), 2) == -50
    assert eng.reserve() == 150 and eng.state({}).equity_eur == base


def test_research_builds_the_portfolio(monkeypatch):
    st = Store(":memory:")
    rng = np.random.default_rng(9)
    idx = pd.date_range("2015-01-01", periods=2400, freq="B", tz="UTC")
    for venue, syms in (("yahoo", ["SPY", "IEF"]), ("materie", ["GLD"])):
        for s in syms:
            c = 100 * np.exp(np.cumsum(rng.normal(0.0003, 0.01, len(idx))))
            st.upsert_bars(venue, s, "1d", pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0}, index=idx))
    for s, v in (("VIXCLS", 20.0), ("DFII10", 1.0), ("DTWEXBGS", 100.0), ("BAMLH0A0HYM2", 4.0)):
        st.upsert_macro(s, pd.Series(v + rng.normal(0, 0.5, len(idx)), index=idx.tz_localize(None)))
    monkeypatch.setattr(research, "HOURLY_FAMILIES", {})
    monkeypatch.setattr(research, "DAILY_FAMILIES", {})
    monkeypatch.setattr(research, "CAPITAL_SCENARIOS", [])
    out = research.run(st, target_cagr=-1.0, target_dd=-1.0)
    fams = {r["famiglia"] for r in out["classifica"]}
    assert {"gold_macro", "risk_switch", "portafoglio_multi"} <= fams
    port = next(r for r in out["classifica"] if r["famiglia"] == "portafoglio_multi")
    assert port["parametri_ultimi"]["corsie"] == ["gold_macro@materie_prime", "risk_switch@etf"]


def test_allocate_lane_in_cash_does_not_take_everything():
    days = pd.date_range("2024-01-01", periods=400, freq="D", tz="UTC")
    rng = np.random.default_rng(2)
    active = pd.Series(rng.normal(0.0005, 0.01, 400), index=days)
    sleepy = pd.Series(0.0, index=days)
    sleepy.iloc[300:] = rng.normal(-0.002, 0.03, 100)  # ferma in liquidita', poi rientra e perde
    weekdays = days[days.dayofweek < 5]
    etf = pd.Series(rng.normal(0.0003, 0.008, len(weekdays)), index=weekdays)
    _, w = multi.allocate({"attiva": active, "ferma": sleepy, "etf": etf})
    assert w["ferma"].max() <= multi.MAX_WEIGHT + 1e-9
    assert (w["etf"].iloc[100:] > 0).all()  # anche se il ribilancio cade di sabato
