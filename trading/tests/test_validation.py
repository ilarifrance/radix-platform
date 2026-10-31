import numpy as np
import pandas as pd

from radix_trading import validation


def test_noise_fails_after_many_trials():
    rng = np.random.default_rng(1)
    best = max((pd.Series(rng.normal(0, 0.01, 500)) for _ in range(200)), key=lambda r: r.mean() / r.std())
    # La migliore di 200 strategie casuali sembra buona...
    assert validation.probabilistic_sharpe(best) > 0.9
    # ...ma corretta per i 200 tentativi non lo e'.
    assert validation.deflated_sharpe(best, trials=200) < 0.95


def test_real_edge_passes():
    rng = np.random.default_rng(2)
    r = pd.Series(rng.normal(0.002, 0.01, 1000))
    assert validation.deflated_sharpe(r, trials=10) > 0.99
    assert validation.passes_gate(r, trials=10)["passed"]
