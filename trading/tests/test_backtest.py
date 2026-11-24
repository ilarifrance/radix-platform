import numpy as np
import pandas as pd

from radix_trading import backtest


def test_no_lookahead():
    idx = pd.date_range("2026-01-01", periods=4, freq="D", tz="UTC")
    close = pd.Series([100.0, 110.0, 121.0, 121.0], index=idx, name="X")
    # Decidiamo di essere investiti solo alla barra 1: guadagniamo il movimento 1->2, non 0->1.
    w = pd.Series([0.0, 1.0, 0.0, 0.0], index=idx, name="X")
    r = backtest.run(close, w, costs=backtest.Costs(0, 0, 0)).returns
    assert np.allclose(r.values, [0.0, 0.0, 0.10, 0.0])


def test_costs_and_min_fee():
    idx = pd.date_range("2026-01-01", periods=3, freq="D", tz="UTC")
    close = pd.Series([100.0, 100.0, 100.0], index=idx, name="X")
    w = pd.Series([1.0, 1.0, 1.0], index=idx, name="X")
    # Entrata unica: 0,05% + 0,05% proporzionale, ma minimo 1,25 euro su 100 euro = 1,25%.
    res = backtest.run(close, w, costs=backtest.Costs(5, 5, 1.25), capital_eur=100.0)
    assert np.isclose(res.costs_paid.sum(), 0.0125 + 0.0005)
    assert res.metrics["orders"] == 1


def test_weights_capped_and_long_only(random_walk):
    close = random_walk(n=50, assets=2)
    w = pd.DataFrame({"A0": 2.0, "A1": -1.0}, index=close.index)
    res = backtest.run(close, w)
    assert (res.weights.sum(axis=1) <= 1.0 + 1e-12).all()
    assert (res.weights >= 0).all().all()


def test_walk_forward_is_out_of_sample(random_walk):
    close = random_walk(n=1300, assets=1)

    def always(c, level=1.0):
        return pd.DataFrame(level, index=c.index, columns=c.columns)

    wf = backtest.walk_forward(close, always, {"level": [0.5, 1.0]}, train=500, test=200)
    assert wf.trials == 2 and len(wf.folds) == 4
    assert wf.oos_returns.index[0] == close.index[500]
    assert not wf.oos_returns.index.duplicated().any()
