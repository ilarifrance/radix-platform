from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from radix_trading import events
from radix_trading import metodo60 as m60
from radix_trading.collectors import wikinews
from radix_trading.store import Store


@pytest.fixture(autouse=True)
def no_wikipedia(monkeypatch):
    """Il giro della sera riscarica la pagina di oggi da Wikipedia: nei test niente rete (archivio com'e')."""
    monkeypatch.setattr(wikinews, "fetch_days", lambda days: {})


def _bars(rows, start="2025-01-01"):
    """rows: (open, high, low, close) per giorno di borsa."""
    idx = pd.bdate_range(start, periods=len(rows))
    a = np.array(rows, dtype=float)
    return pd.DataFrame({"open": a[:, 0], "high": a[:, 1], "low": a[:, 2], "close": a[:, 3]}, index=idx)


def _flat(n, p=100.0):
    return [(p, p + 1, p - 1, p)] * n


def test_signal_needs_close_on_low_and_above_ma200():
    base = _flat(200)
    # chiusura sul minimo, ma sotto la media (prezzo crollato): niente segnale
    bars = _bars(base + [(90, 91, 89, 89.1)])
    assert len(m60.signal_days(bars)) == 0
    # chiusura sul minimo sopra la media: segnale
    bars = _bars(base + [(101, 103, 100.5, 100.6)])
    days = m60.signal_days(bars)
    assert len(days) == 1 and days[0] == bars.index[-1]
    # chiusura a meta' escursione: niente
    bars = _bars(base + [(101, 103, 100.5, 102)])
    assert len(m60.signal_days(bars)) == 0
    # storico corto: niente
    assert len(m60.signal_days(_bars(_flat(100)))) == 0


def test_simulate_target_stop_time_and_gap():
    sig = pd.Timestamp("2025-01-01")
    # target toccato il secondo giorno: uscita al livello del target
    bars = _bars([(100, 101, 99, 99.1), (100, 101, 99, 100), (100, 103.5, 99.5, 102)])
    t = m60.simulate(bars, sig)
    assert t["status"] == "chiusa" and t["how"] == "target" and t["entry"] == 100 and t["exit"] == 103.0
    assert t["exit_day"] == "2025-01-03" and t["pnl"] > 0
    costs = 2 * m60.SPREAD * m60.NOTIONAL_EUR + m60.FINANCING_YEAR / 365 * m60.NOTIONAL_EUR * 1
    assert abs(t["pnl"] - (0.03 * m60.NOTIONAL_EUR - costs)) < 1e-9
    # apertura gia' oltre il target: uscita all'apertura
    bars = _bars([(100, 101, 99, 99.1), (100, 101, 99, 100), (104, 105, 103, 104.5)])
    t = m60.simulate(bars, sig)
    assert t["how"] == "target in apertura" and t["exit"] == 104
    # stop sulla chiusura: uscita all'apertura del giorno dopo, anche sotto lo stop (gap)
    bars = _bars([(100, 101, 99, 99.1), (100, 101, 96, 96.5), (95, 97, 94, 96)])
    t = m60.simulate(bars, sig)
    assert t["how"] == "stop" and t["exit"] == 95 and t["exit_day"] == "2025-01-03" and t["pnl"] < -0.05 * m60.NOTIONAL_EUR
    # stop scattato ma apertura dopo non ancora in archivio: resta aperta
    bars = _bars([(100, 101, 99, 99.1), (100, 101, 96, 96.5)])
    t = m60.simulate(bars, sig)
    assert t["status"] == "aperta" and t["how"] == "stop" and t["exit"] is None
    # il minimo intraday sotto -3% NON chiude se la chiusura e' sopra lo stop
    bars = _bars([(100, 101, 99, 99.1), (100, 101, 96, 99), (99, 100, 98, 99.5)])
    t = m60.simulate(bars, sig)
    assert t["status"] == "aperta" and t["how"] is None
    # uscita a tempo alla chiusura del decimo giorno
    bars = _bars([(100, 101, 99, 99.1)] + [(100, 101, 99.5, 100.2)] * 12)
    t = m60.simulate(bars, sig)
    assert t["how"] == "tempo" and t["exit_day"] == bars.index[10].date().isoformat() and t["exit"] == 100.2
    # segnale senza apertura dopo: segnalata
    bars = _bars([(100, 101, 99, 99.1)])
    assert m60.simulate(bars, sig)["status"] == "segnalata"


def _store(rows, start, by_sym=None, gold_rows=None):
    """Archivio finto: SPY = rows, gli altri indici piatti (o `by_sym`), l'oro (venue materie) piatto o `gold_rows`."""
    st = Store(":memory:")
    by_sym = by_sym or {}
    for sym in m60.MARKETS:
        b = _bars(by_sym.get(sym, rows if sym == "SPY" else _flat(len(rows))), start)
        b.index = b.index.tz_localize("UTC")
        st.upsert_bars(m60.VENUE, sym, "1d", b.assign(volume=1.0))
    g = _bars(gold_rows or _flat(len(rows), 180.0), start)
    g.index = g.index.tz_localize("UTC")
    st.upsert_bars(m60.GOLD_VENUE, "GLD", "1d", g.assign(volume=1.0))
    return st


def test_step_signals_then_opens_then_closes_and_reports():
    start = "2025-01-01"
    rows = _flat(200) + [(101, 103, 100.5, 100.6)]          # ultimo giorno: segnale su SPY
    st = _store(rows, start)
    last = pd.bdate_range(start, periods=len(rows))[-1]
    sent = []
    now = datetime(last.year, last.month, last.day, 23, 30, tzinfo=timezone.utc)
    out = m60.step(st, now, send=sent.append)
    assert out["segnali"] == ["SPY"] and out["aperte"] == [] and out["chiuse"] == []
    assert len(sent) == 1 and sent[0].startswith("[SIMULATO metodo60] Segnale di oggi su S&P 500 (SPY)") and "Domani all'apertura" in sent[0]
    # senza archivio notizie il verdetto e' «non so»: il segnale resta nella corsia statistica
    assert "Notizie: archivio notizie non disponibile → solo la corsia statistica." in sent[0]
    row = st.conn.execute("SELECT status, entry FROM m60_trades").fetchone()
    assert row == ("segnalata", None)
    # il giro dopo, senza dati nuovi: niente doppioni
    sent.clear()
    out = m60.step(st, now, send=sent.append)
    assert out == {"segnali": [], "aperte": [], "chiuse": [], "riepilogo": None, "notizie": 0} and sent == []
    # arriva la barra dopo: entrata all'apertura, poi il target nel giorno seguente
    d1, d2 = pd.bdate_range(last, periods=3)[1:]
    more = pd.DataFrame({"open": [101.0, 102.0], "high": [102.0, 104.5], "low": [100.0, 101.5], "close": [101.5, 104.0], "volume": 1.0},
                        index=pd.DatetimeIndex([d1, d2]).tz_localize("UTC"))
    st.upsert_bars(m60.VENUE, "SPY", "1d", more.iloc[:1])
    out = m60.step(st, datetime(d1.year, d1.month, d1.day, 23, 30, tzinfo=timezone.utc), send=sent.append)
    assert out["aperte"] == ["SPY"] and "Entrata su S&P 500 (SPY) a 101.00" in sent[-1]
    st.upsert_bars(m60.VENUE, "SPY", "1d", more.iloc[1:])
    now2 = datetime(d2.year, d2.month, d2.day, 23, 30, tzinfo=timezone.utc)
    out = m60.step(st, now2, send=sent.append)
    assert out["chiuse"] == ["SPY"]
    row = st.conn.execute("SELECT status, how, exit, pnl FROM m60_trades").fetchone()
    assert row[0] == "chiusa" and row[1] == "target" and abs(row[2] - 101 * 1.03) < 1e-9 and row[3] > 0
    assert any("Chiusa (target)" in m for m in sent)
    # un venerdi': riepilogo una volta sola
    friday = now2 + pd.Timedelta(days=(4 - now2.weekday()) % 7)
    first = out if now2.weekday() == 4 else m60.step(st, friday, send=sent.append)
    assert first["riepilogo"] and "Corsia statistica (tutti i segnali): 1 operazioni chiuse, 1 vinte (100%)" in first["riepilogo"]
    assert "Corsia + notizie (solo i segnali con una notizia forte): nessuna operazione chiusa" in first["riepilogo"]
    assert "leva 1: +" in first["riepilogo"] and "+ notizie —" in first["riepilogo"]
    assert m60.step(st, friday, send=sent.append)["riepilogo"] is None
    assert st.conn.execute("SELECT notizie, temi FROM m60_trades").fetchone() == (None, "archivio notizie non disponibile")


def test_one_position_per_market_and_replay_stats():
    # due segnali consecutivi su SPY: il secondo cade dentro l'operazione del primo e si salta
    rows = _flat(200) + [(101, 103, 100.5, 100.6), (101, 103, 100.5, 100.6)] + [(101, 102, 100, 101.5)] * 12
    bars = _bars(rows)
    days = m60.signal_days(bars)
    assert len(days) == 2
    st = _store(rows, "2025-01-01")
    # giro della sera del primo segnale, con le barre dopo gia' in archivio: entrata, uscita a tempo, secondo segnale saltato
    d = days[0] + pd.Timedelta(days=1)
    sent = []
    out = m60.step(st, datetime(d.year, d.month, d.day, 23, 30, tzinfo=timezone.utc), send=sent.append)
    assert out["segnali"] == ["SPY"] and out["aperte"] == ["SPY"] and out["chiuse"] == ["SPY"]
    assert st.conn.execute("SELECT COUNT(*) FROM m60_trades").fetchone()[0] == 1
    rep = m60.replay(st, "2025-01-01")
    assert rep["totale"]["operazioni"] == 1 and rep["mercati"]["SPY"]["operazioni"] == 1 and rep["mercati"]["QQQ"]["operazioni"] == 0
    assert rep["totale"]["per_uscita"]["tempo"] == 1 and len(rep["anni"]) == 1
    # senza archivio notizie niente sezione «notizie»; la tabella della leva c'e' per ogni leva (operazione in utile: conto su)
    assert "notizie" not in rep and set(rep["leva"]) == set(m60.LEVERS)
    assert rep["leva"][1]["conto_finale"] > m60.ACCOUNT_EUR and rep["leva"][1]["azzerato"] is None and rep["leva"][1]["chiusure_forzate"] == 0


def _news_archive(st, days, items_by_day):
    """Archivio Wikipedia finto: per ogni giorno le voci indicate (default una voce neutra)."""
    events.init(st)
    for d in days:
        items = items_by_day.get(d, [("Politics", "Parliament debates the budget")])
        st.conn.executemany("INSERT OR IGNORE INTO news_items VALUES (?,?,?)", [(d.date().isoformat(), s, t) for s, t in items])
        st.conn.execute("INSERT OR REPLACE INTO news_days VALUES (?, ?)", (d.date().isoformat(), len(items)))
    st.conn.commit()


def test_news_check_flags_strong_days_only_after_warmup():
    st = Store(":memory:")
    days = pd.date_range("2025-01-01", periods=120, freq="D")
    iran = [("International relations", f"Iran summons the Saudi envoy, round {k}") for k in range(5)]
    _news_archive(st, days, {days[-1]: iran, days[30]: iran})          # il giorno 30 e' nei primi 61: percentile non ancora pronto
    counts, flags = m60.news_flags(st)
    assert counts.index[0] == days[m60.NEWS_WARMUP_DAYS] and list(flags.columns) == list(m60.SHOCK_THEMES)
    assert m60.news_check(counts, flags, days[-1]) == (True, "Medio Oriente 5 (oggi)")
    assert m60.news_check(counts, flags, days[-1] + pd.Timedelta(days=1)) == (True, "Medio Oriente 5 (ieri)")   # il giorno dopo vede «ieri»
    assert m60.news_check(counts, flags, days[-2]) == (False, "nessuna")
    assert m60.news_check(counts, flags, days[30])[0] is None                    # dentro il riscaldamento: non so
    assert m60.news_check(counts, flags, "2030-01-01") == (None, "archivio notizie senza questi giorni")
    assert m60.news_check(pd.DataFrame(), pd.DataFrame(), days[-1]) == (None, "archivio notizie non disponibile")


def test_step_refreshes_today_and_records_the_news_lane(monkeypatch):
    start = "2025-01-01"
    rows = _flat(200) + [(101, 103, 100.5, 100.6)]          # ultimo giorno: segnale su SPY
    st = _store(rows, start)
    last = pd.bdate_range(start, periods=len(rows))[-1]
    # archivio fino a ieri con una voce neutra al giorno; la pagina di oggi arriva dal riscarico della sera
    _news_archive(st, pd.date_range(end=last - pd.Timedelta(days=1), periods=100, freq="D"), {})
    fetched = []

    def fake_fetch(days):
        fetched.append(list(days))
        return {last.date(): [{"sezione": "Armed conflicts", "testo": f"Israel strikes Gaza, round {k}"} for k in range(4)]}

    monkeypatch.setattr(wikinews, "fetch_days", fake_fetch)
    sent = []
    out = m60.step(st, datetime(last.year, last.month, last.day, 23, 30, tzinfo=timezone.utc), send=sent.append)
    assert fetched == [[(last - pd.Timedelta(days=1)).date(), last.date()]] and out["notizie"] == 4
    assert out["segnali"] == ["SPY"]
    assert st.conn.execute("SELECT notizie, temi FROM m60_trades").fetchone() == (1, "Medio Oriente 4 (oggi)")
    assert "Notizie forti (Wikipedia, oggi/ieri): Medio Oriente 4 (oggi) → entra anche la corsia «+ notizie»" in sent[0]
    # la barra dopo chiude in target: l'avviso dice che vale anche per la corsia + notizie, il venerdi' la conta
    d1 = pd.bdate_range(last, periods=2)[1]
    bar = pd.DataFrame({"open": [101.0], "high": [104.5], "low": [100.5], "close": [104.0], "volume": 1.0},
                       index=pd.DatetimeIndex([d1]).tz_localize("UTC"))
    st.upsert_bars(m60.VENUE, "SPY", "1d", bar)
    out = m60.step(st, datetime(d1.year, d1.month, d1.day, 23, 30, tzinfo=timezone.utc), send=sent.append)
    assert out["chiuse"] == ["SPY"] and "[anche corsia + notizie]" in sent[-1]
    rep = m60.report_text(st, "2025-W40")
    assert "Corsia + notizie (solo i segnali con una notizia forte): 1 operazioni chiuse, 1 vinte (100%)" in rep
    # la riga della leva: la misura della corsia e' leva 2, a leva 1 la meta', a leva 5 due volte e mezzo
    s = m60.stats(m60._rows(st.conn, ""))
    assert f"leva 1: {s['risultato'] / 2:+.0f} €" in rep and f"leva 5: {s['risultato'] * 2.5:+.0f} €" in rep


def test_leverage_table_compounds_and_wipes_out():
    idx = pd.bdate_range("2025-01-01", periods=4)
    bars = pd.DataFrame({"open": [100, 100, 103, 103], "high": [101, 101, 104, 104], "low": [99, 99, 102, 102], "close": [100, 100, 103, 103]},
                        index=idx, dtype=float)
    win = {"symbol": "SPY", "status": "chiusa", "entry_day": idx[1].date().isoformat(), "entry": 100.0,
           "exit_day": idx[2].date().isoformat(), "exit": 103.0}
    tab = m60.leverage_table({"SPY": bars}, [win], levers=(1, 3))
    n = m60.ACCOUNT_EUR / 3                                   # leva 1: un terzo del conto per posizione
    expected = m60.ACCOUNT_EUR - n * m60.SPREAD              # giorno di entrata: spread, chiusura = entrata
    expected += n * 0.03 - n * m60.SPREAD - n * m60.FINANCING_YEAR / 365   # giorno dopo: target, spread, una notte
    assert abs(tab[1]["conto_finale"] - expected) < 0.01 and tab[1]["azzerato"] is None
    assert abs(tab[3]["conto_finale"] - (m60.ACCOUNT_EUR + 3 * (expected - m60.ACCOUNT_EUR))) < 0.01   # leva 3 = tre volte il guadagno
    # un crollo del 10% a leva 30 (nozionale 10 volte il conto) azzera il conto
    crash = pd.DataFrame({"open": [100, 100, 90, 90], "high": [101, 101, 91, 91], "low": [99, 99, 89, 89], "close": [100, 100, 90, 90]},
                         index=idx, dtype=float)
    lose = {**win, "exit": 90.0}
    tab = m60.leverage_table({"SPY": crash}, [lose], levers=(1, 30))
    assert tab[30]["conto_finale"] == 0 and tab[30]["azzerato"] == idx[2].date().isoformat() and tab[30]["annuo"] == -1.0
    assert tab[1]["conto_finale"] > 0 and tab[1]["azzerato"] is None and tab[1]["perdita_max"] < -0.03
    # anni di barre prima della prima operazione non contano: la resa annua parte dalla prima entrata
    long_idx = pd.bdate_range("2021-01-01", periods=len(idx) + 500)
    long_bars = pd.DataFrame({"open": 100.0, "high": 101.0, "low": 99.0, "close": 100.0}, index=long_idx)
    long_bars.iloc[-4:] = bars.values
    late = {**win, "entry_day": long_idx[-3].date().isoformat(), "exit_day": long_idx[-2].date().isoformat()}
    tab = m60.leverage_table({"SPY": long_bars}, [late], levers=(1,))
    years = (long_idx[-1] - long_idx[-3]).days / 365.25
    assert abs(tab[1]["conto_finale"] - expected) < 0.01
    assert abs(tab[1]["annuo"] - ((expected / m60.ACCOUNT_EUR) ** (1 / years) - 1)) < 0.01   # pochi giorni: tasso enorme, ma dal 2025 e non dal 2021


def test_replay_splits_the_two_lanes_when_the_archive_covers_the_days():
    rows = _flat(200) + [(101, 103, 100.5, 100.6)] + [(101, 102, 100, 101.5)] * 12
    st = _store(rows, "2025-01-01")
    bars = _bars(rows)
    sig = m60.signal_days(bars)[0]
    _news_archive(st, pd.date_range(end=sig, periods=100, freq="D"),
                  {sig: [("Business and economy", f"Stock market sell-off deepens, part {k}") for k in range(3)]})
    rep = m60.replay(st, "2025-01-01")
    assert rep["notizie"]["con_notizia_forte"]["operazioni"] == 1 and rep["notizie"]["senza_notizia_forte"]["operazioni"] == 0
    assert rep["notizie"]["dal"] == sig.date().isoformat() and rep["notizie"]["periodi"]["dal_2020"]["statistica"]["operazioni"] == 1


def test_gold_lane_signals_without_the_news_filter():
    start = "2025-01-01"
    rows = _flat(200)
    gold = _flat(200, 180.0) + [(181, 183, 180.5, 180.6)]     # ultimo giorno: GLD chiude sul minimo sopra la media
    st = _store(rows + [_flat(1)[0]], start, gold_rows=gold)
    last = pd.bdate_range(start, periods=len(gold))[-1]
    # l'archivio notizie ha una notizia forte: sull'oro si registra ma non filtra
    _news_archive(st, pd.date_range(end=last, periods=100, freq="D"),
                  {last: [("Armed conflicts", f"Israel strikes Gaza, round {k}") for k in range(4)]})
    sent = []
    out = m60.step(st, datetime(last.year, last.month, last.day, 23, 30, tzinfo=timezone.utc), send=sent.append)
    assert out["segnali"] == ["GLD"] and len(sent) == 1
    assert sent[0].startswith("[SIMULATO metodo60 oro] Segnale di oggi su Oro (GLD): chiusura 180.60")
    assert "Corsia oro, solo statistica" in sent[0] and "Nessun euro vero" in sent[0]
    assert st.conn.execute("SELECT symbol, lane, notizie, temi, status FROM m60_trades").fetchall() == \
        [("GLD", "oro", 1, "Medio Oriente 4 (oggi)", "segnalata")]
    # la barra dopo: entrata, target; il riepilogo mette l'oro nella sua riga e non nelle corsie indici
    d1 = pd.bdate_range(last, periods=2)[1]
    bar = pd.DataFrame({"open": [181.0], "high": [187.0], "low": [180.5], "close": [186.5], "volume": 1.0},
                       index=pd.DatetimeIndex([d1]).tz_localize("UTC"))
    st.upsert_bars(m60.GOLD_VENUE, "GLD", "1d", bar)
    out = m60.step(st, datetime(d1.year, d1.month, d1.day, 23, 30, tzinfo=timezone.utc), send=sent.append)
    assert out["aperte"] == ["GLD"] and out["chiuse"] == ["GLD"]
    assert sent[-1].startswith("[SIMULATO metodo60 oro] Chiusa (target) l'operazione su Oro (GLD):") and "[anche corsia" not in sent[-1]
    rep = m60.report_text(st, "2025-W40")
    assert "Corsia statistica (tutti i segnali): nessuna operazione chiusa" in rep
    assert "Corsia oro (solo statistica): 1 operazioni chiuse, 1 vinte (100%)" in rep
    assert "Osservazioni: tregua → Nasdaq 100 (QQQ): nessuna chiusa; Russia-Ucraina → oro (GLD): nessuna chiusa" in rep


def test_observation_lane_buys_after_a_theme_day_above_ma200():
    start = "2025-01-01"
    rows = _flat(200) + [_flat(1)[0]]
    qqq = _flat(200) + [(100, 101, 99.5, 100.5)]              # chiusura sopra la media, ma non sul minimo: niente IBS
    st = _store(rows, start, by_sym={"QQQ": qqq})
    last = pd.bdate_range(start, periods=len(rows))[-1]
    # la notizia «tregua» e' di IERI (giorno di calendario): vale per il giorno di borsa di oggi
    yesterday = last - pd.Timedelta(days=1)
    _news_archive(st, pd.date_range(end=last, periods=100, freq="D"),
                  {yesterday: [("International relations", f"Ceasefire talks in Cairo, round {k}") for k in range(3)]})
    sent = []
    out = m60.step(st, datetime(last.year, last.month, last.day, 23, 30, tzinfo=timezone.utc), send=sent.append)
    assert out["segnali"] == ["tregua_nasdaq"] and len(sent) == 1
    assert sent[0].startswith("[SIMULATO osservazione] tregua → Nasdaq 100 (QQQ): notizia «tregua 3 (ieri)» con chiusura 100.50")
    assert "Solo osservazione, nessun euro." in sent[0]
    assert st.conn.execute("SELECT symbol, lane, notizie, temi, status FROM m60_trades").fetchall() == \
        [("tregua_nasdaq", "tregua_nasdaq", None, "tregua 3 (ieri)", "segnalata")]
    # senza chiusura sopra la media (QQQ piatto) la stessa notizia non da' segnale
    st2 = _store(rows, start)
    _news_archive(st2, pd.date_range(end=last, periods=100, freq="D"),
                  {yesterday: [("International relations", f"Ceasefire talks in Cairo, round {k}") for k in range(3)]})
    assert m60.step(st2, datetime(last.year, last.month, last.day, 23, 30, tzinfo=timezone.utc), send=sent.append)["segnali"] == []
    # entrata e stop: l'avviso porta il prefisso dell'osservazione e il riepilogo la conta nella sua riga
    d1, d2 = pd.bdate_range(last, periods=3)[1:]
    more = pd.DataFrame({"open": [100.0, 96.0], "high": [100.5, 97.0], "low": [96.0, 95.0], "close": [96.5, 96.0], "volume": 1.0},
                        index=pd.DatetimeIndex([d1, d2]).tz_localize("UTC"))
    st.upsert_bars(m60.VENUE, "QQQ", "1d", more)
    out = m60.step(st, datetime(d2.year, d2.month, d2.day, 23, 30, tzinfo=timezone.utc), send=sent.append)
    assert out["aperte"] == ["tregua_nasdaq"] and out["chiuse"] == ["tregua_nasdaq"]
    assert any(m.startswith("[SIMULATO osservazione] Chiusa (stop) l'operazione su tregua → Nasdaq 100 (QQQ): da 100.00 a 96.00") for m in sent)
    rep = m60.report_text(st, "2025-W40")
    assert "Osservazioni: tregua → Nasdaq 100 (QQQ): 1 op., 0 vinte, — per euro perso, -" in rep
    assert "Corsia statistica (tutti i segnali): nessuna operazione chiusa" in rep


def test_backfill_gives_the_news_verdict_to_rows_born_before_the_split():
    st = _store(_flat(10), "2025-01-01")
    m60._init(st.conn)
    days = pd.date_range("2025-01-01", periods=120, freq="D")
    _news_archive(st, days, {days[-1]: [("Business and economy", f"Stock market sell-off deepens, part {k}") for k in range(3)]})
    cols = "symbol, signal_day, status, lane"
    st.conn.executemany(f"INSERT INTO m60_trades ({cols}) VALUES (?, ?, 'chiusa', ?)",
                        [("SPY", days[-1].date().isoformat(), None),           # riga del 10/11: lane e notizie vuote
                         ("QQQ", days[-2].date().isoformat(), "indici"),
                         ("IWM", days[10].date().isoformat(), "indici"),       # nel riscaldamento dell'archivio: resta «non so»
                         ("GLD", days[-1].date().isoformat(), "oro")])         # l'oro non si tocca
    st.conn.commit()
    assert m60.backfill_news(st) == 2
    rows = dict((r[0], r[1:]) for r in st.conn.execute("SELECT symbol, lane, notizie, temi FROM m60_trades"))
    assert rows["SPY"] == ("indici", 1, "borse 3 (oggi) (a posteriori)")
    assert rows["QQQ"] == ("indici", 0, "nessuna (a posteriori)")
    assert rows["IWM"] == ("indici", None, None)
    assert rows["GLD"] == ("oro", None, None)
    assert m60.backfill_news(st) == 0                       # una volta sola


def test_replay_reports_gold_and_observations():
    rows = _flat(200) + [(101, 103, 100.5, 100.6)] + [(101, 102, 100, 101.5)] * 12
    gold = _flat(200, 180.0) + [(181, 183, 180.5, 180.6)] + [(181, 187, 180.5, 186.5)] * 12
    qqq = _flat(200) + [(100, 101, 99.5, 100.5)] + [(100, 100.5, 96, 96.5), (96, 97, 95, 96)] + [(96, 97, 95, 96)] * 10
    st = _store(rows, "2025-01-01", by_sym={"QQQ": qqq}, gold_rows=gold)
    sig = m60.signal_days(_bars(rows))[0]
    _news_archive(st, pd.date_range(end=sig + pd.Timedelta(days=20), periods=120, freq="D"),
                  {sig: [("International relations", f"Ceasefire talks in Cairo, round {k}") for k in range(3)]})
    rep = m60.replay(st, "2025-01-01")
    assert rep["oro"]["statistica"]["operazioni"] == 1 and rep["oro"]["statistica"]["per_uscita"]["target"] == 1
    assert rep["oro"]["periodi"]["dal_2020"]["statistica"]["operazioni"] == 1
    obs = rep["osservazioni"]
    assert set(obs) == set(m60.OBSERVATIONS) and obs["tregua_nasdaq"]["nome"] == "tregua → Nasdaq 100 (QQQ)"
    assert obs["tregua_nasdaq"]["operazioni"] == 1 and obs["tregua_nasdaq"]["per_uscita"]["stop"] == 1
    assert obs["russia_oro"]["operazioni"] == 0
    # la tabella della leva resta sugli indici: una sola operazione (SPY)
    assert rep["totale"]["operazioni"] == 1 and set(rep["leva"]) == set(m60.LEVERS)
