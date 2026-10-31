from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from radix_trading import fineco, mercato
from radix_trading.store import Store


def _daily(p0, yearly, start="2000-01-03", end="2026-10-29", seed=0, vol=0.18):
    idx = pd.bdate_range(start, end, tz="UTC")
    rng = np.random.default_rng(seed)
    r = rng.normal(yearly / 252, vol / np.sqrt(252), len(idx))
    c = p0 * np.exp(np.cumsum(r))
    return pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0}, index=idx)


def _store(btc_move=-0.06, now=None):
    now = now or datetime(2026, 10, 30, 21, 17, tzinfo=timezone.utc)
    st = Store(":memory:")
    for sym in ("SPY", "QQQ", "EFA", "TLT"):   # code grasse come nella realta': una giornata a -3,5% capita
        st.upsert_bars("yahoo", sym, "1d", _daily(100.0, 0.08, seed=hash(sym) % 100, vol=0.28))
    for sym in ("GLD", "USO"):
        st.upsert_bars("materie", sym, "1d", _daily(100.0, 0.05, seed=hash(sym) % 100, vol=0.28))
    # ETF Fineco con storico: quattro in salita, i Treasury in discesa, l'oro appena sopra il livello di 12 mesi
    for sym, (p0, yearly) in {"VUAA.MI": (80.0, 0.15), "XNAS.MI": (40.0, 0.15), "IMEU.MI": (25.0, 0.15),
                              "IS04.DE": (3.0, -0.10), "4GLD.DE": (70.0, 0.02)}.items():
        st.upsert_bars(fineco.VENUE, sym, "1d", _daily(p0, yearly, start="2022-01-03", end="2026-10-30", vol=0.0))
    # Bitcoin orario: piatto, poi la mossa delle ultime 24 ore
    idx = pd.date_range(now - timedelta(days=400), now - timedelta(minutes=17), freq="h", tz="UTC")
    rng = np.random.default_rng(1)
    c = 60000 * np.exp(np.cumsum(rng.normal(0, 0.5 / np.sqrt(24 * 365), len(idx))))
    c[-24:] = c[-25] * (1 + btc_move)
    st.upsert_bars("kraken", "XBTEUR", "1h", pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0}, index=idx))
    st.conn.executescript(fineco.SCHEMA)
    st.conn.execute("INSERT INTO etf_targets VALUES ('2026-10', 'XNAS.MI', 10, 150.0)")
    st.conn.execute("CREATE TABLE IF NOT EXISTS live_account (id INTEGER PRIMARY KEY, start REAL NOT NULL, ts TEXT NOT NULL)")
    st.conn.execute("CREATE TABLE IF NOT EXISTS live_equity (ts TEXT PRIMARY KEY, equity REAL NOT NULL)")
    st.conn.execute("INSERT INTO live_account VALUES (1, 109.8, '2026-10-30T22:15:00Z')")
    st.conn.execute("INSERT INTO live_equity VALUES ('2026-10-30T21:15:05Z', 109.84)")
    st.upsert_news([{"url": "u1", "ts": "2026-10-30T20:40:00Z", "title": "Intel plunges 29% as Nasdaq suffers worst sell-off since June",
                     "source": "x", "language": "en", "country": "US", "query": "q", "sentiment": 0.0},
                    {"url": "u2", "ts": "2026-10-30T18:00:00Z", "title": "Local bakery wins award", "source": "x",
                     "language": "en", "country": "US", "query": "q", "sentiment": 0.0},
                    {"url": "u3", "ts": "2026-10-28T08:00:00Z", "title": "Nasdaq hits record", "source": "x",
                     "language": "en", "country": "US", "query": "q", "sentiment": 0.0}])
    st.conn.commit()
    return st


FRIDAY = {"SPY": (769.36, 755.72), "QQQ": (715.34, 690.49), "EFA": (104.35, 103.37), "GLD": (368.57, 355.78),
          "TLT": (81.49, 81.84), "USO": (168.19, 168.83), "^VIX": (17.2, 19.5), "^TNX": (4.93, 4.98)}


def _quote_at(when):
    def quote(sym):
        prev, price = FRIDAY[sym]
        return {"price": price, "prev_close": prev, "time": when}
    return quote


def test_history_after_similar_days_and_too_short_history():
    c = _daily(100.0, 0.07, seed=3)["close"]
    big = c.pct_change().quantile(0.02)
    st = mercato.storia(c, float(big))
    assert st and st["n"] >= mercato.MIN_CASES and set(st["orizzonti"]) == {5, 20}
    h = st["orizzonti"][20]
    assert 0 <= h["positivi"] <= 1 and h["peggiore"] <= h["mediano"] <= h["migliore"]
    assert mercato.storia(c.iloc[-100:], float(big)) is None          # storico corto
    assert mercato.storia(c, -0.5) is None                              # mai successo: niente casi


def test_friday_sell_off_gives_one_message_with_evaluation_and_no_duplicates():
    now = datetime(2026, 10, 30, 21, 17, tzinfo=timezone.utc)   # venerdi', dopo la chiusura USA
    st, sent = _store(btc_move=-0.02, now=now), []
    res = mercato.watch(st, now, send=sent.append, quote=_quote_at(now - timedelta(hours=1)),
                        studio={"prove": 1124, "reggono": 0}, pausa=0)
    assert set(res["avvisi"]) == {"usa:QQQ", "usa:GLD"} and len(sent) == 1
    t = sent[0]
    assert t.startswith("[Mercati] Evento delle 21:17 UTC: Nasdaq 100 (QQQ) perde il 3.5% oggi (715.34 → 690.49 $).")
    assert "Anche: oro (GLD) perde il 3.5%" in t and "Contorno: S&P 500 -1.8%" in t and "VIX +13.4%" in t
    assert "Notizie: Intel plunges 29%" in t and "bakery" not in t and "record" not in t   # solo temi di mercato, solo recenti
    assert "Storia: dal 2000, dopo" in t and "giorni di borsa seguenti" in t
    assert "Regole: ETF VUAA +" in t and "4GLD +" in t and "IS04 -" in t and "XNAS +" in t and "(10 q.)" in t
    assert "Conto crypto 109.84 €, stop a 90 €" in t
    assert "Attenzione: 4GLD è a +" in t and "la regola non lo compra" in t      # non ancora in portafoglio
    assert "1124 prove, 0 reggono la verifica" in t and "ordini limite, mai a mercato in apertura" in t
    # un'ora dopo, stessi prezzi: niente doppioni; il giorno dopo sarebbe un evento nuovo
    res2 = mercato.watch(st, now + timedelta(hours=1), send=sent.append, quote=_quote_at(now - timedelta(hours=1)), pausa=0)
    assert res2["avvisi"] == [] and len(sent) == 1
    assert st.conn.execute("SELECT COUNT(*) FROM market_events").fetchone()[0] == 2


def test_weekend_uses_only_crypto_and_stale_quotes_are_ignored():
    sat = datetime(2026, 10, 31, 13, 17, tzinfo=timezone.utc)
    st, sent = _store(btc_move=-0.06, now=sat), []
    boom = lambda s: (_ for _ in ()).throw(AssertionError("di sabato Yahoo non si chiama"))
    res = mercato.watch(st, sat, send=sent.append, quote=boom, pausa=0)
    assert res["avvisi"] == ["crypto:XBTEUR"] and "Bitcoin perde il 6.0% in 24 ore" in sent[0]
    assert "Nessuna azione" in sent[0] or "Attenzione" in sent[0]
    # lunedi' mattina prima dell'apertura USA: le quotazioni sono ancora quelle di venerdi' -> nessun avviso USA
    mon = datetime(2026, 11, 2, 13, 17, tzinfo=timezone.utc)
    st2, sent2 = _store(btc_move=0.0, now=mon), []
    res2 = mercato.watch(st2, mon, send=sent2.append, quote=_quote_at(datetime(2026, 10, 30, 21, 0, tzinfo=timezone.utc)), pausa=0)
    assert res2["avvisi"] == [] and sent2 == [] and not any(k in mercato.USA or k.startswith("^") for k in res2["mosse"])


def test_prova_prints_without_sending_and_yahoo_down_does_not_crash():
    now = datetime(2026, 10, 30, 21, 17, tzinfo=timezone.utc)
    st, sent = _store(btc_move=0.0, now=now), []
    res = mercato.watch(st, now, send=sent.append, quote=_quote_at(now), pausa=0, prova=True)
    assert "testo" in res and sent == [] and st.conn.execute("SELECT COUNT(*) FROM market_events").fetchone()[0] == 0
    boom = lambda s: (_ for _ in ()).throw(RuntimeError("429"))
    res2 = mercato.watch(st, now, send=sent.append, quote=boom, pausa=0)
    assert res2["avvisi"] == [] and len(res2["errori"]) == 8 and sent == []


def test_hold_rule_changes_the_verdict(monkeypatch):
    now = datetime(2026, 10, 30, 21, 17, tzinfo=timezone.utc)
    monkeypatch.setattr(fineco, "env_value", lambda n: "tieni" if n == "FINECO_RULE" else None)
    st, sent = _store(btc_move=0.0, now=now), []
    mercato.watch(st, now, send=sent.append, quote=_quote_at(now), pausa=0)
    assert "compra e tieni" in sent[0] and "Attenzione" not in sent[0]
