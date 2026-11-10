from datetime import datetime, timezone

import numpy as np
import pandas as pd

from radix_trading import metodo60 as m60
from radix_trading.store import Store


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


def _store(rows, start):
    st = Store(":memory:")
    for sym in m60.MARKETS:
        b = _bars(rows, start) if sym == "SPY" else _bars(_flat(len(rows)), start)
        b.index = b.index.tz_localize("UTC")
        st.upsert_bars(m60.VENUE, sym, "1d", b.assign(volume=1.0))
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
    row = st.conn.execute("SELECT status, entry FROM m60_trades").fetchone()
    assert row == ("segnalata", None)
    # il giro dopo, senza dati nuovi: niente doppioni
    sent.clear()
    out = m60.step(st, now, send=sent.append)
    assert out == {"segnali": [], "aperte": [], "chiuse": [], "riepilogo": None} and sent == []
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
    assert first["riepilogo"] and "1 operazioni chiuse, 1 vinte (100%)" in first["riepilogo"]
    assert m60.step(st, friday, send=sent.append)["riepilogo"] is None


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
