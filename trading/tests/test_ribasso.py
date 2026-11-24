import numpy as np
import pandas as pd

from radix_trading import ribasso
from radix_trading.store import Store


def _close(seed=0, years=10, vol=0.25):
    idx = pd.bdate_range("2014-01-02", periods=252 * years, tz="UTC")
    rng = np.random.default_rng(seed)
    cols = {}
    for i, sym in enumerate(("CSSPX.MI", "EQQQ.MI", "SGLD.MI", "IS04.DE", "SWDA.MI")):
        r = rng.standard_t(4, len(idx)) * (vol if i != 3 else 0.08) / np.sqrt(252) / 1.4 + 0.07 / 252
        cols[sym] = 100.0 * np.exp(np.cumsum(r))
    return pd.DataFrame(cols, index=idx)


def test_fixed_plan_has_no_dip_buys_and_reserve_sits_in_cash():
    close = _close()
    base = ribasso.simula(close)
    assert base["ingressi"] == 0 and base["cassa_media"] < 0.03 and base["guida"] == "EQQQ.MI"
    assert base["ordini"] >= 5 and base["perdita_massima"] < 0
    ferma = ribasso.simula(close, riserva=0.20)
    assert ferma["ingressi"] == 0 and 0.15 < ferma["cassa_media"] < 0.25


def test_dip_rule_buys_after_bad_days_and_rebound_variant_sells_back():
    close = _close()
    cadute = int((close["EQQQ.MI"].pct_change() <= -0.02).sum())
    assert cadute >= 10
    tiene = ribasso.simula(close, riserva=0.20, soglia=0.02, tranche=0.5)
    assert 0 < tiene["ingressi"] <= cadute
    assert tiene["cassa_media"] < 0.20                     # la cassa viene usata
    rimbalzo = ribasso.simula(close, riserva=0.20, soglia=0.02, tranche=0.5, rimbalzo=20)
    assert rimbalzo["ingressi"] >= tiene["ingressi"]       # la cassa torna e si puo' ricomprare
    assert rimbalzo["ordini"] > tiene["ordini"]            # le tranche si rivendono
    assert rimbalzo["commissioni"] > tiene["commissioni"]


def test_run_builds_the_text_with_all_baskets(monkeypatch):
    st = Store(":memory:")
    fake = _close(seed=1, years=6)
    fetch = lambda sym: pd.DataFrame({"open": 1.0, "high": 1.0, "low": 1.0, "close": fake.iloc[:, hash(sym) % 5], "volume": 1.0}, index=fake.index)
    for sym in ("SPY", "QQQ", "EFA", "TLT"):
        st.upsert_bars("yahoo", sym, "1d", fetch(sym))
    st.upsert_bars("materie", "GLD", "1d", fetch("GLD"))
    res = ribasso.run(st, fetch=fetch, pausa=0)
    assert set(res["panieri"]) == {"prova", "operativo", "usa_2005"}
    p = res["panieri"]["usa_2005"]
    assert p["guida"] == "QQQ" and len(p["righe"]) == 1 + len(ribasso.RISERVE) * (1 + len(ribasso.SOGLIE) * len(ribasso.TRANCHE) * len(ribasso.RIMBALZI))
    assert "## Paniere usa_2005" in res["testo"] and "tutto dentro (piano fisso)" in res["testo"] and "Battono il piano fisso" in res["testo"]
    assert ribasso.simula(fake.iloc[:100]) == {"errore": "storico troppo corto"}
