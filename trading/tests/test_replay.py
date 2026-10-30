from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from radix_trading import portfolio, replay
from radix_trading.store import Store


def _store(seed=4, drift=0.0001):
    st = Store(":memory:")
    rng = np.random.default_rng(seed)
    hidx = pd.date_range("2024-01-01", periods=24 * 500, freq="h", tz="UTC")
    for s in ("XBTEUR", "ETHEUR"):
        c = 100 * np.exp(np.cumsum(rng.normal(drift, 0.008, len(hidx))))
        st.upsert_bars("kraken", s, "1h", pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0}, index=hidx))
    didx = pd.date_range("2023-01-02", periods=500, freq="B", tz="UTC")
    for venue, s in (("materie", "GLD"), ("yahoo", "SPY"), ("yahoo", "IEF")):
        c = 100 * np.exp(np.cumsum(rng.normal(0.0003, 0.01, len(didx))))
        st.upsert_bars(venue, s, "1d", pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0}, index=didx))
    for s, v in (("VIXCLS", 18.0), ("DFII10", 1.5), ("DTWEXBGS", 120.0), ("BAMLH0A0HYM2", 3.5)):
        st.upsert_macro(s, pd.Series(v + rng.normal(0, 0.3, len(didx)), index=didx.tz_localize(None)))
    return st


def test_replay_runs_the_paper_portfolio_hour_by_hour():
    out = replay.run(_store(), "2025-02-01", "2025-04-30", every_hours=6)
    assert out["giri"] > 300 and out["capitale"] == 1000.0
    assert out["operazioni"] > 0 and out["commissioni"] > 0
    assert out["andamento"][0]["giorno"] == "2025-02-01"
    assert -1 < out["max_ribasso"] <= 0
    assert out["fermato"] is None


def test_replay_single_lane_with_small_capital():
    out = replay.run(_store(), "2025-02-01", "2025-03-31", capital=100.0, lanes=["crypto_trend"], every_hours=4)
    assert set(out["quote_medie"]) == {"crypto_trend"}
    assert abs(out["andamento"][0]["totale"] - 100) < 5


def test_stop_sells_everything_and_stays_stopped():
    st = Store(":memory:")
    pf = portfolio.Portfolio(st, start=100.0, max_loss=20.0)
    t0 = datetime(2026, 11, 2, 1, tzinfo=timezone.utc)
    plan = lambda px: {"corsie": {"crypto_trend": 1.0}, "pesi": {"XBTEUR": 1.0}, "prezzi": {"XBTEUR": px},
                       "sedi": {"XBTEUR": "kraken"}}
    pf.step(t0, plan(100.0))
    assert pf.positions()["XBTEUR"][1] > 0
    out = pf.step(t0 + timedelta(hours=1), plan(75.0))  # -25 euro: sotto lo stop di -20
    assert out["fermo"] and "XBTEUR" not in pf.positions()
    out = pf.step(t0 + timedelta(hours=2), plan(120.0))  # anche se il prezzo risale non ricompra
    assert out["fermo"] and out["operazioni"] == [] and pf.halted()


def test_daily_bars_count_only_from_the_next_day(monkeypatch):
    st = _store()
    sims = []
    real = replay.Store
    monkeypatch.setattr(replay, "Store", lambda path: sims.append(real(path)) or sims[-1])
    out = replay.run(st, "2024-06-01", "2024-12-31", lanes=["risk_switch"])
    assert out["operazioni"] > 0
    fills = sims[0].conn.execute("SELECT ts, symbol, price FROM pf_fills").fetchall()
    for ts, sym, px in fills:
        day = pd.Timestamp(ts).normalize()
        close = st.conn.execute("SELECT ts, close FROM bars WHERE symbol = ? ORDER BY ts", (sym,)).fetchall()
        known = [c for t, c in close if pd.Timestamp(t).tz_convert("UTC") < day]
        assert abs(px - known[-1]) < 1e-9  # il prezzo usato e' la chiusura del giorno prima
