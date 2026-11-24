import numpy as np
import pandas as pd

from radix_trading import leverage


def _r(n=800, seed=3, mu=0.0004, sd=0.006):
    idx = pd.date_range("2022-01-01", periods=n, freq="B", tz="UTC")
    return pd.Series(np.random.default_rng(seed).normal(mu, sd, n), index=idx)


def test_leverage_multiplies_and_pays_financing():
    r = _r()
    x, closed = leverage.levered(r, 2.0, "1d", "etf", "margine")
    assert closed is None
    ppy = (len(r) - 1) / ((r.index[-1] - r.index[0]).days / 365.25)
    assert np.allclose(x, 2 * r - 1.0 * 0.04 / ppy)


def test_forced_close_out_stops_the_account():
    r = _r()
    r.iloc[300] = -0.02            # con leva 100: -200% in un giorno
    x, closed = leverage.levered(r, 100.0, "1d", "etf", "cfd")
    assert closed is not None and (x.iloc[301:] == 0).all() and x.iloc[300] > -1


def test_table_picks_highest_allowed_leverage_within_drawdown():
    t = leverage.table(_r(), "1d", "crypto", "margine", target_dd=-0.20)
    assert t["leva_migliore_entro_limite"] <= 2  # limite UE sulle crypto
    assert [row["leva"] for row in t["righe"]] == list(leverage.LEVELS)
