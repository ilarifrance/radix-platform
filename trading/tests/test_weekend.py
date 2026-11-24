import numpy as np
import pandas as pd

from radix_trading import weekend


def test_weeks_pairs_friday_with_next_session():
    idx = pd.bdate_range("2024-01-01", "2024-01-31", tz="UTC")
    b = pd.DataFrame({"open": 100.0, "high": 101.0, "low": 99.0, "close": 100.0}, index=idx)
    b.loc[pd.Timestamp("2024-01-08", tz="UTC"), "open"] = 102.0   # salto il lunedi'
    w = weekend._weeks(b)
    assert pd.Timestamp("2024-01-08", tz="UTC") in w.index
    assert abs(w.loc[pd.Timestamp("2024-01-08", tz="UTC"), "gap"] - 0.02) < 1e-12
    assert all(d.dayofweek == 0 for d in w.index)
