from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import pytest

from radix_trading import paper, universe
from radix_trading.config import Settings
from radix_trading.store import Store


def fill_store(st, n, drift=0.0, seed=0):
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC")
    for s in universe.FAST["symbols"]:
        c = 100 * np.exp(np.cumsum(rng.normal(drift, 0.01, n)))
        st.upsert_bars("kraken", s, "1h", pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0},
                                                       index=idx))
    return idx


@pytest.fixture
def settings(tmp_path):
    return Settings(data_dir=tmp_path, mode="paper", kill_switch_file=tmp_path / "KILL")


def test_requires_paper_mode(tmp_path):
    with pytest.raises(ValueError):
        paper.PaperEngine(Store(":memory:"), Settings(data_dir=tmp_path, mode="research"))


def test_waits_without_history(settings):
    st = Store(":memory:")
    fill_store(st, 100)
    out = paper.PaperEngine(st, settings).step(datetime(2026, 1, 5, tzinfo=timezone.utc))
    assert all(v.startswith("attesa") for k, v in out.items() if k.startswith("kraken:"))
    assert out["patrimonio"] == "1000.00 EUR"


def test_runs_over_time_and_respects_limits(settings):
    st = Store(":memory:")
    idx = fill_store(st, 24 * 120, drift=0.0004, seed=1)
    st.save_strategy_status("breakout_regime", "1h", True, 0.99, 1.0, {})
    eng = paper.PaperEngine(st, settings, cfg=paper.PaperConfig(min_probability=0.0))
    full = {s: st.load_bars("kraken", s, "1h") for s in universe.FAST["symbols"]}
    for i in range(24 * 60, len(idx), 24):
        for s, df in full.items():  # l'archivio contiene solo il passato fino a "adesso"
            st.conn.execute("DELETE FROM bars WHERE symbol = ? AND ts > ?", (s, idx[i].strftime("%Y-%m-%dT%H:%M:%SZ")))
        eng.step(idx[i].to_pydatetime())
        for s, df in full.items():
            st.upsert_bars("kraken", s, "1h", df)
    fills = st.conn.execute("SELECT side, units, price FROM paper_fills WHERE side = 'buy'").fetchall()
    assert fills, "con soglia 0 e tendenza positiva deve aver comprato almeno una volta"
    assert all(u * p <= 100.0 * 1.001 for _, u, p in fills)
    assert st.conn.execute("SELECT cash FROM paper_account").fetchone()[0] >= -1e-6
    rep = paper.report(st, days=10000)
    assert "decisioni" in rep and rep["decisioni"]


def test_kill_switch_closes_positions(settings):
    st = Store(":memory:")
    idx = fill_store(st, 24 * 40)
    eng = paper.PaperEngine(st, settings)
    eng.db.execute("INSERT INTO paper_positions VALUES ('kraken:XBTEUR', 1.0, 90.0, 50.0)")
    eng.db.execute("UPDATE paper_account SET cash = cash - 90")
    eng.risk.engage_kill_switch("test")
    out = eng.step(idx[-1].to_pydatetime() + timedelta(hours=1))
    assert "kill switch" in out["sistema"]
    assert eng.positions() == {}


def test_no_buys_without_approved_strategy(settings):
    st = Store(":memory:")
    idx = fill_store(st, 24 * 120, drift=0.001, seed=2)
    st.save_strategy_status("breakout_regime", "1h", False, 0.1, -1.0, {})
    out = paper.PaperEngine(st, settings, cfg=paper.PaperConfig(min_probability=0.0)).step(idx[-1].to_pydatetime())
    assert "cancello 1" in out["kraken:XBTEUR"]
    assert st.conn.execute("SELECT COUNT(*) FROM paper_fills").fetchone()[0] == 0
