import numpy as np
import pandas as pd

from radix_trading import candles, multi


def _ohlc(n=1500, seed=1):
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2018-01-01", periods=n, freq="B", tz="UTC")
    c = 100 * np.exp(np.cumsum(rng.normal(0, 0.01, n)))
    o = np.r_[c[0], c[:-1]]
    h = np.maximum(o, c) * (1 + rng.uniform(0, 0.005, n))
    l = np.minimum(o, c) * (1 - rng.uniform(0, 0.005, n))
    return pd.DataFrame({"open": o, "high": h, "low": l, "close": c}, index=idx)


def test_patterns_use_only_past_candles():
    b = _ohlc()
    full = candles.patterns(b)
    cut = candles.patterns(b.iloc[:1000])
    assert full.iloc[:1000].equals(cut)
    assert {"chiusura_sul_minimo", "martello"} <= set(full.columns)


def test_study_finds_planted_rebound_after_close_on_low():
    b = _ohlc(3000)
    ibs = (b["close"] - b["low"]) / (b["high"] - b["low"])
    low_days = np.flatnonzero((ibs < 0.1).to_numpy())
    k = np.ones(len(b))
    for i in low_days:  # il giorno dopo un +2% piantato; la forma delle candele non cambia
        k[i + 1:] *= 1.02
    b2 = b.mul(k, axis=0)
    rows = candles.pattern_study({"X": ("1d", b2)}, b2.index[-250])
    best = [r for r in rows if r["figura"] == "chiusura_sul_minimo" and r["candele"] == 1][0]
    assert best["supera_correzione"] and best["netto_medio"] > 0.01


def test_ibs_reversion_holds_then_exits():
    idx = pd.date_range("2024-01-01", periods=12, freq="B", tz="UTC")
    close = pd.DataFrame({"SPY": 100.0, "TLT": 100.0}, index=idx)
    x = pd.DataFrame({"SPY": 0.5, "TLT": 0.0}, index=idx)
    x.iloc[2, 0] = 0.05     # giorno chiuso sul minimo
    x.iloc[4, 0] = 0.9      # chiusura forte: esce
    w = multi.ibs_reversion(close, x, entry=0.1, hold=5, exit_ibs=0.8, max_names=1)
    assert list(w["SPY"].iloc[:6]) == [0, 0, 1, 1, 0, 0]
    assert (w["TLT"] == 0).all()  # niente obbligazioni


def test_turn_of_month_window():
    idx = pd.bdate_range("2024-01-22", "2024-02-09", tz="UTC")
    close = pd.DataFrame({"SPY": 100.0}, index=idx)
    held = multi.turn_of_month(close, before=2, after=2)["SPY"].shift(1).fillna(0)
    on = [d.strftime("%m-%d") for d in held.index[held > 0]]
    assert on == ["01-30", "01-31", "02-01", "02-02"]


def test_tsmom_long_only_and_capped():
    idx = pd.date_range("2020-01-01", periods=400, freq="B", tz="UTC")
    up = pd.Series(np.linspace(100, 200, 400), index=idx)
    close = pd.DataFrame({"A": up, "B": up[::-1].to_numpy()}, index=idx)
    w = multi.tsmom(close, lookback=63, vol_target=0.5, rebalance=1)
    assert (w["B"].iloc[100:] == 0).all() and (w["A"].iloc[100:] > 0).all()
    assert (w.sum(axis=1) <= 1 + 1e-9).all()


def test_pre_fomc_holds_the_decision_day():
    idx = pd.bdate_range("2024-03-11", "2024-03-22", tz="UTC")
    close = pd.DataFrame({"SPY": 100.0}, index=idx)
    w = multi.pre_fomc(close, pd.DatetimeIndex(["2024-03-20"]), days_before=1)
    held = w["SPY"].shift(1).fillna(0)
    assert [d.strftime("%m-%d") for d in held.index[held > 0]] == ["03-20"]


def test_trailing_stop_exits_and_waits_for_new_cross():
    idx = pd.date_range("2024-01-01", periods=24 * 60, freq="h", tz="UTC")
    p = np.r_[np.linspace(100, 100, 24 * 10), np.linspace(100, 200, 24 * 20), np.linspace(200, 150, 24 * 5),
              np.linspace(150, 210, 24 * 25)]
    close = pd.DataFrame({"X": p}, index=idx)
    w = multi.crypto_trend_trailing(close, fast=24, slow=24 * 5, vol_target=10.0, trail=0.15)
    day = w["X"][w.index.hour == 0]
    assert day.max() == 1.0
    # nel calo da 200 a 150 si esce; si rientra solo dopo un nuovo incrocio al rialzo
    assert day.loc["2024-01-31":"2024-02-06"].eq(0).any()
    assert day.iloc[-1] == 1.0
    half = multi.crypto_trend_trailing(close, fast=24, slow=24 * 5, vol_target=10.0, trail=0.5, take=0.2)
    assert 0.5 in set(half["X"][half.index.hour == 0].round(2))
