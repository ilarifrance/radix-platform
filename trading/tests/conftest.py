import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture
def random_walk():
    def make(n=2000, assets=2, drift=0.0, vol=0.01, freq="D", seed=0):
        rng = np.random.default_rng(seed)
        idx = pd.date_range("2018-01-01", periods=n, freq=freq, tz="UTC")
        rets = rng.normal(drift, vol, size=(n, assets))
        return pd.DataFrame(100 * np.exp(np.cumsum(rets, axis=0)), index=idx,
                            columns=[f"A{i}" for i in range(assets)])
    return make
