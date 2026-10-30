import io
import zipfile

import numpy as np
import pandas as pd

from radix_trading import bigplayers
from radix_trading.collectors import cot
from radix_trading.store import Store

HEAD = ["Market and Exchange Names", "As of Date in Form YYYY-MM-DD", "Open Interest (All)",
        "Noncommercial Positions-Long (All)", "Noncommercial Positions-Short (All)",
        "Commercial Positions-Long (All)", "Commercial Positions-Short (All)"]


def _zip(rows):
    buf = io.StringIO()
    pd.DataFrame(rows, columns=HEAD).to_csv(buf, index=False)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("annual.txt", buf.getvalue())
    return out.getvalue()


def test_parse_maps_markets_and_nets():
    raw = _zip([["GOLD - COMMODITY EXCHANGE INC.", "2024-01-02", 1000, 600, 100, 200, 650],
                ["E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE", "2024-01-02", 2000, 500, 700, 900, 600],
                ["WHEAT - CHICAGO BOARD OF TRADE", "2024-01-02", 10, 1, 1, 1, 1]])
    df = cot.parse(raw).set_index("symbol")
    assert set(df.index) == {"GLD", "SPY"}
    assert abs(df.loc["GLD", "spec_net"] - 0.5) < 1e-12 and abs(df.loc["GLD", "comm_net"] + 0.45) < 1e-12


def test_study_finds_planted_contrarian_signal():
    st = Store(":memory:")
    st.conn.executescript(bigplayers.SCHEMA)
    rng = np.random.default_rng(4)
    days = pd.bdate_range("2008-01-01", "2026-10-01", tz="UTC")
    tues = days[days.dayofweek == 1]
    spec = pd.Series(rng.normal(0, 0.1, len(tues)), index=tues)
    crowded = spec.index[np.arange(len(tues)) % 9 == 0]
    spec[crowded] = 0.6                                   # fondi molto lunghi ogni 9 settimane
    st.conn.executemany("INSERT INTO cot VALUES (?,?,?,?,?)",
                        [(d.date().isoformat(), "GLD", 1000.0, float(v), 0.0) for d, v in spec.items()])
    ret = pd.Series(rng.normal(0.0002, 0.008, len(days)), index=days)
    for t in crowded:                                     # nei 5 giorni dopo l'entrata il prezzo scende
        i = days.searchsorted(t + pd.Timedelta(days=6))
        ret.iloc[i + 1:i + 6] -= 0.006
    c = 100 * (1 + ret).cumprod()
    st.upsert_bars("materie", "GLD", "1d", pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0}))
    out = bigplayers.study(st, today=pd.Timestamp("2026-10-30", tz="UTC"))
    top = out["legami"][0]
    assert top["mercato"] == "GLD" and top["chi"] == "fondi" and top["modo"] == "contrasta"


def test_cot_long_holds_after_signal_monday():
    from radix_trading import multi
    idx = pd.bdate_range("2024-01-01", "2024-02-29", tz="UTC")
    close = pd.DataFrame({"QQQ": 100.0, "SPY": 100.0}, index=idx)
    cot_frame = pd.DataFrame({"spec_z": [-2.0, 0.0], "comm_z": [0.0, 0.0]},
                             index=pd.DatetimeIndex(["2024-01-08", "2024-01-15"], tz="UTC"))
    w = multi.cot_long(close, cot_frame, hold=10)
    on = w.index[w["QQQ"] > 0]
    assert on[0].strftime("%m-%d") == "01-08" and len(on) == 10 and (w["SPY"] == 0).all()


def test_signals_index_and_stale():
    st = Store(":memory:")
    assert bigplayers.stale(st)
    st.conn.executescript(bigplayers.SCHEMA)
    days = pd.date_range("2020-01-07", periods=120, freq="7D")
    st.conn.executemany("INSERT INTO cot VALUES (?,?,?,?,?)",
                        [(d.date().isoformat(), "QQQ", 1.0, float(i % 5), 0.0) for i, d in enumerate(days)])
    sig = bigplayers.signals(st, "QQQ")
    assert isinstance(sig.index, pd.DatetimeIndex) and sig.index[0].dayofweek == 0
    assert {"spec_z", "comm_z"} <= set(sig.columns)
