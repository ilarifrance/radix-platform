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
