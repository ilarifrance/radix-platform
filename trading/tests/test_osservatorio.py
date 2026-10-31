from datetime import datetime, timezone

import numpy as np
import pandas as pd

from radix_trading import events, osservatorio as oss
from radix_trading.store import Store

RULE_GOLD = oss.RULES[0]


def _bars(prices, start="2026-01-01", lows=None):
    idx = pd.bdate_range(start, periods=len(prices), tz="UTC")
    c = np.array(prices, dtype=float)
    lows = c if lows is None else np.array(lows, dtype=float)
    return pd.DataFrame({"open": c, "high": c, "low": lows, "close": c, "volume": 1.0}, index=idx)


def test_simulate_long_trade_and_close_out():
    # barre: gio 1, ven 2, lun 5, mar 6, mer 7, gio 8, ven 9 gennaio
    bars = _bars([100, 100, 100, 100, 102, 104, 106]).tz_localize(None)
    t = oss.simulate(RULE_GOLD, bars, pd.Timestamp("2026-01-05"))   # segnale lunedi' 5/1 -> entra il 6 a 100, esce il 8 a 104
    assert t["entry_day"] == "2026-01-06" and t["entry"] == 100 and t["exit_day"] == "2026-01-08" and t["exit"] == 104
    nozionale = oss.MARGIN_EUR * 20
    costs = 2 * RULE_GOLD.spread * nozionale + oss.FINANCING_YEAR / 365 * nozionale * 2
    assert abs(t["pnl"] - (0.04 * nozionale - costs)) < 1e-9 and abs(t["pnl_1x"] - 8.0) < 1e-9 and t["status"] == "chiusa"
    # il giorno dopo l'entrata il minimo scende del 3%: a leva 20 il broker chiude a -2,5%
    bars2 = _bars([100, 100, 100, 100, 101, 102], lows=[100, 100, 100, 97, 101, 102]).tz_localize(None)
    t2 = oss.simulate(RULE_GOLD, bars2, pd.Timestamp("2026-01-05"))
    assert t2["closed_out"] == 1 and t2["exit"] == 97.5 and t2["pnl"] < -0.025 * nozionale
    # segnale dopo l'ultima barra: entrata non ancora disponibile
    assert oss.simulate(RULE_GOLD, bars, pd.Timestamp("2026-01-09")) is None
    # regola «nel verso della giornata» (Fed): giornata in rialzo -> lungo il giorno dopo
    fed = oss.RULES[2]
    bars3 = _bars([100, 100, 103, 105, 104]).tz_localize(None)
    t3 = oss.simulate(fed, bars3, pd.Timestamp("2026-01-05"))
    assert t3["side"] == 1 and t3["entry_day"] == "2026-01-06" and t3["exit_day"] == "2026-01-06" and t3["exit"] == 105


def _store_with_news(spike_day="2026-10-20"):
    st = Store(":memory:")
    events.init(st)
    days = pd.date_range("2025-06-01", spike_day)
    rows, items = [], []
    for d in days:
        rows.append((d.date().isoformat(), 1))
        items.append((d.date().isoformat(), "Politics", f"Parliament debates budget {d.date()}"))
    for k in range(5):
        items.append((spike_day, "Armed conflicts", f"Missile strike and invasion reported, airstrike number {k}"))
    rows[-1] = (spike_day, 6)
    st.conn.executemany("INSERT OR REPLACE INTO news_days VALUES (?,?)", rows)
    st.conn.executemany("INSERT OR IGNORE INTO news_items VALUES (?,?,?)", items)
    st.conn.commit()
    return st


def test_step_opens_on_a_geopolitical_spike_then_closes_and_reports():
    st = _store_with_news("2026-10-20")   # martedi'
    # oro fermo a 100 fino al 20/10, poi sale: entrata il 21 all'apertura (100), uscita il 23 in chiusura
    idx = pd.bdate_range("2025-06-02", "2026-10-21", tz="UTC")
    gold = _bars([100.0] * len(idx), start="2025-06-02")
    st.upsert_bars("materie", "GLD", "1d", gold)
    sent = []
    out = oss.step(st, datetime(2026, 10, 21, 23, 30, tzinfo=timezone.utc), send=sent.append)
    assert out["aperte"] == ["geopolitica_oro"] and out["chiuse"] == []
    assert sent and sent[0].startswith("[SIMULATO leva] Segnale «geopolitica_oro» del 2026-10-20") and "LUNGO su Oro" in sent[0]
    # il giro dopo: stesso segnale, niente doppioni
    out2 = oss.step(st, datetime(2026, 10, 22, 23, 30, tzinfo=timezone.utc), send=sent.append)
    assert out2["aperte"] == [] and out2["chiuse"] == []
    # arrivano le barre del 22 e 23 (oro 102 e 104): si chiude in guadagno; venerdi' 23 parte il riepilogo
    more = _bars([102.0, 104.0], start="2026-10-22")
    st.upsert_bars("materie", "GLD", "1d", more)
    sent.clear()
    out3 = oss.step(st, datetime(2026, 10, 23, 23, 30, tzinfo=timezone.utc), send=sent.append)
    assert out3["chiuse"] == ["geopolitica_oro"]
    assert any("Chiusa (uscita a tempo)" in m and "da 100.00 a 104.00" in m for m in sent)
    assert out3["riepilogo"] and "1 operazioni chiuse (1 in guadagno)" in out3["riepilogo"]
    row = st.conn.execute("SELECT status, exit, closed_out FROM oss_trades").fetchone()
    assert row == ("chiusa", 104.0, 0)
    # il riepilogo della settimana non si ripete
    out4 = oss.step(st, datetime(2026, 10, 23, 23, 50, tzinfo=timezone.utc), send=sent.append)
    assert out4["riepilogo"] is None


def test_replay_summarises_each_rule():
    st = _store_with_news("2026-10-20")
    idx = pd.bdate_range("2025-06-02", "2026-10-30", tz="UTC")
    flat = sum(idx <= pd.Timestamp("2026-10-21", tz="UTC"))
    prices = [100.0] * flat + [100.0 + 2 * k for k in range(1, len(idx) - flat + 1)]   # dal 22/10 sale di 2 al giorno
    st.upsert_bars("materie", "GLD", "1d", _bars(prices, start="2025-06-02"))
    out = oss.replay(st, since="2025-01-01")
    g = out["regole"]["geopolitica_oro"]
    assert g["operazioni"] == 1 and g["risultato"] > 0 and out["totale"]["operazioni"] == 1
    assert out["regole"]["panico_spx"]["operazioni"] == 0
