from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from radix_trading import portfolio, snapshot
from radix_trading.config import Settings
from radix_trading.store import Store


def _plan(prices, weights, sedi=None):
    return {"corsie": {"crypto_trend": 0.5, "gold_macro": 0.5}, "pesi": weights, "prezzi": prices,
            "sedi": sedi or {s: "kraken" for s in prices}}


def test_step_buys_targets_then_sets_profit_aside():
    st = Store(":memory:")
    pf = portfolio.Portfolio(st)
    t0 = datetime(2026, 11, 2, 1, tzinfo=timezone.utc)
    out = pf.step(t0, _plan({"XBTEUR": 100.0}, {"XBTEUR": 0.5}))
    assert len(out["operazioni"]) == 1
    units = pf.positions()["XBTEUR"][1]
    assert abs(units - 5.0) < 1e-9
    # il giorno dopo il prezzo raddoppia: +500 sopra il capitale, finisce in riserva (c'e' cassa)
    out = pf.step(t0 + timedelta(days=1), _plan({"XBTEUR": 200.0}, {"XBTEUR": 0.5}))
    rep = portfolio.report(st)
    assert rep["riserva"] > 400
    assert abs(rep["patrimonio"] - portfolio.START_EUR) < 30  # si riparte da circa 1.000
    # stesso giorno: nessun nuovo spostamento in riserva
    assert pf.step(t0 + timedelta(days=1, hours=1), _plan({"XBTEUR": 200.0}, {"XBTEUR": 0.5}))["messi_da_parte"] == 0


def test_small_changes_do_not_trade_and_short_pays_funding():
    st = Store(":memory:")
    pf = portfolio.Portfolio(st)
    t0 = datetime(2026, 11, 2, 1, tzinfo=timezone.utc)
    pf.step(t0, _plan({"ETHEUR": 10.0}, {"ETHEUR": -0.25}))
    assert pf.positions()["ETHEUR"][1] < 0
    out = pf.step(t0 + timedelta(hours=1), _plan({"ETHEUR": 10.0}, {"ETHEUR": -0.26}))
    assert out["operazioni"] == []  # sotto la banda del 3%
    cash_before = st.conn.execute("SELECT cash FROM pf_account").fetchone()[0]
    pf.step(t0 + timedelta(hours=25), _plan({"ETHEUR": 10.0}, {"ETHEUR": -0.25}))
    cash_after = st.conn.execute("SELECT cash FROM pf_account").fetchone()[0]
    assert cash_after < cash_before  # funding dello scoperto


def test_plan_and_snapshot_on_real_shaped_data(tmp_path):
    st = Store(":memory:")
    rng = np.random.default_rng(4)
    hidx = pd.date_range("2024-01-01", periods=24 * 500, freq="h", tz="UTC")
    for s in ("XBTEUR", "ETHEUR"):
        c = 100 * np.exp(np.cumsum(rng.normal(0.0001, 0.008, len(hidx))))
        st.upsert_bars("kraken", s, "1h", pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0}, index=hidx))
    didx = pd.date_range("2023-01-02", periods=500, freq="B", tz="UTC")
    for venue, s in (("materie", "GLD"), ("yahoo", "SPY"), ("yahoo", "IEF")):
        c = 100 * np.exp(np.cumsum(rng.normal(0.0003, 0.01, len(didx))))
        st.upsert_bars(venue, s, "1d", pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0}, index=didx))
    for s, v in (("VIXCLS", 18.0), ("DFII10", 1.5), ("DTWEXBGS", 120.0), ("BAMLH0A0HYM2", 3.5)):
        st.upsert_macro(s, pd.Series(v + rng.normal(0, 0.3, len(didx)), index=didx.tz_localize(None)))
    p = portfolio.plan(st)
    assert set(p["corsie"]) == {"crypto_trend", "trend_brake", "gold_macro", "risk_switch", "cot_nasdaq"}
    assert abs(sum(p["corsie"].values()) - 1) < 1e-6
    assert sum(abs(w) for w in p["pesi"].values()) <= 1 + 1e-9
    portfolio.Portfolio(st).step(p=p)
    snap = snapshot.build(st, Settings(data_dir=tmp_path))
    assert snap["portafoglio"]["corsie"] and snap["portafoglio"]["capitale_iniziale"] == 1000.0
