import pandas as pd
import pytest

from radix_trading import strategies


@pytest.mark.parametrize("name", list(strategies.STRATEGIES))
def test_no_future_data(name, random_walk):
    fn, timeframe, _ = strategies.STRATEGIES[name]
    close = random_walk(n=1500, assets=2, freq="h" if timeframe == "1h" else "D", seed=3)
    full = fn(close)
    cut = fn(close.iloc[:1000])
    pd.testing.assert_frame_equal(full.iloc[:1000], cut)


@pytest.mark.parametrize("name", list(strategies.STRATEGIES))
def test_weights_in_range(name, random_walk):
    fn, timeframe, _ = strategies.STRATEGIES[name]
    w = fn(random_walk(n=1500, assets=3, freq="h" if timeframe == "1h" else "D"))
    assert w.min().min() >= 0 and w.sum(axis=1).max() <= 1.0 + 1e-9


def test_crypto_trend_daily_changes_only_once_a_day(random_walk):
    close = random_walk(n=24 * 200, assets=1, freq="h", seed=4)
    w = strategies.crypto_trend_daily(close)
    changes = w["A0"].diff().fillna(0) != 0
    assert (w.index[changes].hour == 0).all()
