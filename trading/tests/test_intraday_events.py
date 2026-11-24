import numpy as np
import pandas as pd

from radix_trading import events, intraday_events as ie
from radix_trading.store import Store


def _store_with_calendar(days, kind="cpi"):
    st = Store(":memory:")
    events.init(st)
    st.conn.executemany("INSERT INTO calendar VALUES (?,?)", [(d, kind) for d in days])
    return st


def test_event_times_in_new_york_time():
    st = _store_with_calendar(["2025-01-15", "2025-07-15"])
    st.conn.execute("INSERT INTO calendar VALUES ('2025-07-30', 'fomc')")
    t = dict((str(ts), k) for k, ts in ie.event_times(st))
    assert "2025-01-15 13:30:00+00:00" in t  # 8:30 a New York d'inverno
    assert "2025-07-15 12:30:00+00:00" in t  # 8:30 con l'ora legale
    assert t["2025-07-30 18:00:00+00:00"] == "fomc"


def test_trades_for_uses_only_completed_bars():
    idx = pd.date_range("2025-03-12 12:00", periods=600, freq="min", tz="UTC")
    px = pd.Series(100.0, index=idx)
    px[idx >= pd.Timestamp("2025-03-12 12:30", tz="UTC")] = 101.0  # salto all'uscita del dato
    px[idx >= pd.Timestamp("2025-03-12 13:30", tz="UTC")] = 102.0
    close = ie._completed(pd.DataFrame({"close": px}), 1)
    tr = ie.trades_for(close, pd.Timestamp("2025-03-12 12:30", tz="UTC"), delay=1)
    assert abs(tr["reazione"] - 0.01) < 1e-12
    assert abs(tr["uscite"]["2 ore"] - (102 / 101 - 1)) < 1e-12
    assert abs(tr["uscite"]["30 minuti"]) < 1e-12
    # la barra che inizia alle 12:30 finisce alle 12:31: con ritardo 0 non si "vede" ancora il salto
    tr0 = ie.trades_for(close, pd.Timestamp("2025-03-12 12:30", tz="UTC"), delay=0)
    assert tr0["reazione"] == 0


def test_study_finds_planted_momentum():
    rng = np.random.default_rng(5)
    days = pd.bdate_range("2019-01-10", "2026-10-01", freq="C", weekmask="Wed")[::3]
    st = _store_with_calendar([d.date().isoformat() for d in days])
    frames = []
    for d in days:
        t = pd.Timestamp(f"{d.date()} 08:30").tz_localize(ie.TZ).tz_convert("UTC")
        idx = pd.date_range(t - pd.Timedelta(minutes=30), t + pd.Timedelta(hours=3), freq="min")
        r = rng.normal(0, 0.0005, len(idx))
        jump = rng.choice([-1, 1]) * 0.006
        k = idx.get_loc(t)
        r[k] += jump
        r[k + 5: k + 125] += jump / 120 * 3  # la prima reazione continua nelle 2 ore dopo
        c = 100 * np.exp(np.cumsum(r))
        frames.append(pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0}, index=idx))
    st.upsert_bars("binance", "XBTEUR", "1m", pd.concat(frames))
    out = ie.study(st, today=pd.Timestamp("2026-10-29", tz="UTC"))
    assert out["prove"] > 0
    top = out["legami"][0]
    assert (top["mercato"], top["modo"]) == ("Bitcoin", "segui") and top["netto_medio"] > 0
    assert any(r["regge_verifica"] for r in out["legami"])
    assert not any(r["modo"] == "contrasta" for r in out["legami"])
