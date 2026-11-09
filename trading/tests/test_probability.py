import numpy as np
import pandas as pd

from radix_trading import probability


def test_logistic_learns_simple_rule():
    rng = np.random.default_rng(0)
    X = rng.normal(size=(2000, 2))
    y = (X[:, 0] + 0.1 * rng.normal(size=2000) > 0).astype(float)
    p = probability.Logistic().fit(X, y).predict_proba(X)
    assert ((p > 0.5) == (y == 1)).mean() > 0.9


def test_no_skill_on_noise_and_no_lookahead(random_walk):
    close = random_walk(n=24 * 200, assets=1, freq="h", seed=5)["A0"]
    f = probability.features(close)
    y = probability.labels(close, horizon=24, cost=0.0)
    p = probability.walk_forward_proba(f, y, train=24 * 60, step=24 * 10, horizon=24)
    assert p.notna().sum() > 1000
    # Su un percorso casuale il modello non deve "sapere" piu' di una moneta.
    assert probability.brier(p, y) > 0.24
    # La prima previsione arriva solo dopo allenamento + distacco.
    assert p.first_valid_index() >= close.index[24 * 60 + 24]


def test_latest_probability_range(random_walk):
    close = random_walk(n=24 * 60, assets=1, freq="h")["A0"]
    p = probability.latest_probability(close, None, horizon=24, cost=0.009, train=24 * 40)
    assert p is not None and 0 < p < 1
