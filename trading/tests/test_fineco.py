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
    assert "Da eseguire lunedi' 02/11" in text and "Prezzi di chiusura del 30/10" in text
    # Yahoo giu' e archivio vuoto: nessun messaggio, si riprova al giro dopo
    st2, sent2 = Store(":memory:"), []
    out0 = fineco.maybe_alert(st2, datetime(2026, 11, 2, 7, 10, tzinfo=timezone.utc), send=sent2.append,
                              fetch=lambda s: (_ for _ in ()).throw(RuntimeError("429")))
    assert "errore" in out0 and sent2 == []
    assert "piano" in fineco.maybe_alert(st2, datetime(2026, 11, 2, 8, 10, tzinfo=timezone.utc), send=sent2.append, fetch=_fetch) and len(sent2) == 1
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


def _env(values):
    return lambda n: values.get(n)


def test_confirmation_rule_waits_a_second_month_before_selling(monkeypatch):
    # XNAS sale fino a 15 giorni fa, poi perde il 20%: oggi e' sotto il prezzo di 12 mesi fa, a fine mese scorso era sopra.
    flip = FAKE["XNAS.MI"].copy()
    flip.iloc[-15:, :4] *= 0.8
    prices = {**FAKE, "XNAS.MI": flip}
    when = datetime(2026, 11, 2, 7, 10, tzinfo=timezone.utc)
    for regola, atteso in (("trend", "VENDI tutto"), ("conferma", "tieni")):
        monkeypatch.setattr(fineco, "env_value", _env({"FINECO_RULE": regola}))
        st, sent = Store(":memory:"), []
        st.conn.executescript(fineco.SCHEMA)
        st.conn.execute("INSERT INTO etf_targets VALUES ('2026-10', 'XNAS.MI', 9, 40.0)")   # gia' in portafoglio
        out = fineco.maybe_alert(st, when, send=sent.append, fetch=lambda s: prices[s])
        by = {r["symbol"]: r for r in out["piano"]}
        assert out["regola"] == regola and by["XNAS.MI"]["action"] == atteso, (regola, by["XNAS.MI"])
        assert by["IS04.DE"]["action"] == "resta liquido"          # sotto da sempre: nessuna conferma da aspettare
    assert "regola: trend a 12 mesi con conferma su due mesi" in sent[0]
    assert "Tieni 9 quote XNAS" in sent[0] and "segnale cambiato da un mese solo" not in sent[0]


def test_buy_and_hold_rule_buys_all_five_and_rebalances_in_january(monkeypatch):
    monkeypatch.setattr(fineco, "env_value", _env({"FINECO_RULE": "tieni"}))
    st, sent = Store(":memory:"), []
    out = fineco.maybe_alert(st, datetime(2026, 12, 1, 8, 0, tzinfo=timezone.utc), send=sent.append, fetch=lambda s: FAKE[s])
    by = {r["symbol"]: r for r in out["piano"]}
    assert all(r["action"] == "COMPRA" for r in out["piano"])                   # anche IS04, che il trend terrebbe fuori
    assert by["IS04.DE"]["shares"] == int(600 // by["IS04.DE"]["price"])
    assert "regola: compra e tieni, ribilancio a gennaio" in sent[0] and "solo informativo" in sent[0]
    # gennaio: VUAA e' salito del 40% e XNAS sceso del 40% -> si vende un po' di VUAA e si compra XNAS
    jan = {s: p.copy() for s, p in FAKE.items()}
    jan["VUAA.MI"].iloc[:, :4] *= 1.4
    jan["XNAS.MI"].iloc[:, :4] *= 0.6
    out2 = fineco.maybe_alert(st, datetime(2027, 1, 4, 8, 0, tzinfo=timezone.utc), send=sent.append, fetch=lambda s: jan[s])
    by2 = {r["symbol"]: r for r in out2["piano"]}
    assert by2["VUAA.MI"]["action"] == "RIBILANCIA" and by2["VUAA.MI"]["delta"] < 0
    assert by2["XNAS.MI"]["action"] == "RIBILANCIA" and by2["XNAS.MI"]["delta"] > 0
    assert by2["4GLD.DE"]["action"] == "tieni"                                    # scarto sotto i 150 euro
    assert "RIBILANCIA VUAA" in sent[1] and "VENDI" in sent[1] and "RIBILANCIA XNAS" in sent[1]
    # febbraio: niente ribilancio, si tiene tutto
    out3 = fineco.maybe_alert(st, datetime(2027, 2, 1, 8, 0, tzinfo=timezone.utc), send=sent.append, fetch=lambda s: jan[s])
    assert all(r["action"] == "tieni" for r in out3["piano"])


def test_hourly_watch_alerts_once_per_event_and_summarises_at_close(monkeypatch):
    monkeypatch.setattr(fineco, "env_value", lambda n: None)
    st, sent = Store(":memory:"), []
    out = fineco.maybe_alert(st, datetime(2026, 12, 1, 8, 0, tzinfo=timezone.utc), send=sent.append, fetch=lambda s: FAKE[s])
    plan = {r["symbol"]: r["price"] for r in out["piano"]}
    del sent[:]
    when = datetime(2026, 12, 2, 10, 0, tzinfo=timezone.utc)
    moves = {"VUAA.MI": 0.96, "XNAS.MI": 0.91, "4GLD.DE": 0.85, "IS04.DE": 1.0, "IMEU.MI": 1.001}

    def quote(sym):
        return {"price": plan[sym] * moves[sym], "prev_close": plan[sym], "time": when}

    assert fineco.watch(st, datetime(2026, 12, 5, 10, 0, tzinfo=timezone.utc), send=sent.append, quote=quote) == {"mercato": "chiuso"}
    assert fineco.watch(st, datetime(2026, 12, 2, 6, 0, tzinfo=timezone.utc), send=sent.append, quote=quote)["mercato"] == "non ancora aperto"
    res = fineco.watch(st, when, send=sent.append, quote=quote)
    assert "giorno:VUAA" in res["avvisi"] and "giorno:XNAS" in res["avvisi"] and "ingresso:XNAS:-8" in res["avvisi"]
    assert "soglia:4GLD" in res["avvisi"] and "paniere" in res["avvisi"]           # 4GLD sotto il livello di 12 mesi fa
    assert "ingresso:VUAA:-8" not in res["avvisi"] and "riepilogo" not in res["avvisi"]
    testo = " ".join(sent)
    assert "XNAS (Nasdaq 100 (Xtrackers)) perde il 9.0% oggi" in testo and "sotto il prezzo del piano" in testo
    assert "se resta così a fine mese la regola lo vende" in testo and "il paniere ETF in portafoglio perde il" in testo
    n = len(sent)
    assert fineco.watch(st, when.replace(hour=11), send=sent.append, quote=quote)["avvisi"] == []   # stessa giornata: niente doppioni
    assert len(sent) == n
    # VIX +33% (serie FRED gia' in archivio): un avviso solo
    st.upsert_macro("VIXCLS", pd.Series([15.0, 20.0], index=pd.to_datetime(["2026-12-01", "2026-12-02"], utc=True)))
    assert fineco.watch(st, when.replace(hour=12), send=sent.append, quote=quote)["avvisi"] == ["vix"]
    assert fineco.watch(st, when.replace(hour=13), send=sent.append, quote=quote)["avvisi"] == []
    # alle 18 italiane il riepilogo, una volta sola
    res2 = fineco.watch(st, when.replace(hour=17, minute=5), send=sent.append, quote=quote)
    assert res2["avvisi"] == ["riepilogo"] and sent[-1].startswith("[ETF Fineco] Chiusura del 02/12:") and "↓12m" in sent[-1]
    assert fineco.watch(st, when.replace(hour=18), send=sent.append, quote=quote)["avvisi"] == []
    # Yahoo giu' per tutti: un solo avviso di dati mancanti
    boom = lambda s: (_ for _ in ()).throw(RuntimeError("429"))
    assert fineco.watch(st, when.replace(hour=14), send=sent.append, quote=boom)["avvisi"] == ["dati"]
    assert fineco.watch(st, when.replace(hour=15), send=sent.append, quote=boom)["avvisi"] == []
