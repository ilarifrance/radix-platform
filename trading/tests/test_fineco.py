from datetime import date, datetime, timezone

import numpy as np
import pandas as pd

from radix_trading import fineco
from radix_trading.store import Store


def _bars(p0, yearly):
    idx = pd.bdate_range("2022-01-03", "2026-10-30", tz="UTC")
    t = np.arange(len(idx)) / 252
    c = p0 * np.exp(yearly * t)
    return pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0}, index=idx)


UP, DOWN = 0.10, -0.10
FAKE = {"VUAA.MI": _bars(80.0, UP), "XNAS.MI": _bars(40.0, UP), "4GLD.DE": _bars(70.0, UP),
        "IS04.DE": _bars(3.0, DOWN), "IMEU.MI": _bars(25.0, UP)}


def _fetch(sym):
    if sym == "IMEU.MI":
        raise RuntimeError("Yahoo giu'")
    return FAKE[sym]


def test_first_trading_day_skips_weekends_and_holidays():
    assert fineco.first_trading_day(2026, 11) == date(2026, 11, 2)   # l'1/11 e' domenica
    assert fineco.first_trading_day(2027, 1) == date(2027, 1, 4)     # 1/1 festa, 2-3 fine settimana
    assert fineco.first_trading_day(2026, 12) == date(2026, 12, 1)


def test_monthly_plan_buys_the_etfs_above_their_12_month_price(monkeypatch):
    monkeypatch.setattr(fineco, "env_value", lambda n: None)
    st, sent = Store(":memory:"), []
    sunday = datetime(2026, 11, 1, 9, 0, tzinfo=timezone.utc)
    assert fineco.maybe_alert(st, sunday, send=sent.append, fetch=_fetch) is None     # non ancora il primo giorno di borsa
    early = datetime(2026, 11, 2, 6, 30, tzinfo=timezone.utc)
    assert fineco.maybe_alert(st, early, send=sent.append, fetch=_fetch) is None      # prima delle 8 italiane
    out = fineco.maybe_alert(st, datetime(2026, 11, 2, 7, 10, tzinfo=timezone.utc), send=sent.append, fetch=_fetch)
    assert out["giorno"] == "2026-11-02" and out["capitale"] == 3000.0 and len(sent) == 1
    by = {r["symbol"]: r for r in out["piano"]}
    assert by["VUAA.MI"]["action"] == "COMPRA" and by["VUAA.MI"]["shares"] == int(600 // by["VUAA.MI"]["price"]) == 4
    assert by["IS04.DE"]["action"] == "resta liquido" and by["IS04.DE"]["shares"] == 0
    assert by["IMEU.MI"]["action"] == "dati mancanti"
    text = sent[0]
    assert text.startswith("[ETF Fineco] Piano di novembre 2026, capitale di riferimento 3,000 €")
    assert "COMPRA 4 quote VUAA" in text and "IS04.DE (Treasury USA 20+ anni (iShares, Xetra)): niente" in text
    assert "Da eseguire 02/11" in text
    # lo stesso mese non si rimanda; il mese dopo si tiene quel che c'e' e si vende cio' che scende
    assert fineco.maybe_alert(st, datetime(2026, 11, 20, 9, 0, tzinfo=timezone.utc), send=sent.append, fetch=_fetch) is None
    down = {s: (_bars(p.iloc[0]["close"], DOWN) if s == "XNAS.MI" else p) for s, p in FAKE.items()}
    out2 = fineco.maybe_alert(st, datetime(2026, 12, 1, 8, 0, tzinfo=timezone.utc), send=sent.append,
                              fetch=lambda s: down[s], cap=5000.0)
    by2 = {r["symbol"]: r for r in out2["piano"]}
    assert by2["VUAA.MI"]["action"] == "tieni" and by2["VUAA.MI"]["shares"] == by["VUAA.MI"]["shares"]
    assert by2["XNAS.MI"]["action"] == "VENDI tutto" and by2["IMEU.MI"]["action"] == "COMPRA"   # archivio ora pieno
    assert "VENDI tutte le 9 quote XNAS" in sent[1] and "Tieni 4 quote VUAA" in sent[1]
    # a mano l'ultimo giorno del mese: e' il piano del mese dopo, senza toccare quello gia' mandato
    out3 = fineco.maybe_alert(st, datetime(2026, 12, 31, 15, 0, tzinfo=timezone.utc), send=sent.append,
                              fetch=lambda s: down[s], force=True)
    assert out3["mese"] == "2027-01" and out3["giorno"] == "2027-01-04" and "Piano di gennaio 2027" in sent[2]


def test_capital_from_env(monkeypatch):
    monkeypatch.setattr(fineco, "env_value", lambda n: "4500")
    assert fineco.capital() == 4500.0
    monkeypatch.setattr(fineco, "env_value", lambda n: "boh")
    assert fineco.capital() == 3000.0
