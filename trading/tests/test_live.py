import base64
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import pytest

from radix_trading import alerts, live
from radix_trading.config import Settings
from radix_trading.store import Store

PAIRS = {"XBTEUR": ("XXBT", 0.00005, 8), "ETHEUR": ("XETH", 0.002, 8)}


QUOTES = {"XBTEUR": (111000.0, 111100.0), "ETHEUR": (4450.0, 4451.0)}   # (bid, ask) vicini ai prezzi dello store


class FakeKraken:
    def __init__(self, balance, quotes=None, open_orders=None):
        self.bal, self.orders, self.limits, self.canceled = balance, [], [], []
        self.quotes = quotes or {}            # senza quotazioni il conto va a mercato (come prima del 31/10)
        self.open = open_orders or {}         # txid -> stato dell'ordine come lo racconta Kraken

    def pairs(self, symbols):
        return {s: {"name": s, "base": PAIRS[s][0], "ordermin": PAIRS[s][1], "lot_decimals": PAIRS[s][2],
                    "pair_decimals": 1} for s in symbols if s in PAIRS}

    def balance(self):
        return dict(self.bal)

    def ticker(self, info):
        return {s: self.quotes[s] for s in info if s in self.quotes}

    def market_order(self, symbol, side, volume, validate):
        self.orders.append((symbol, side, volume, validate))
        return {"descr": {"order": f"{side} {volume} {symbol} @ market"}, "txid": [] if validate else ["T1"]}

    def limit_order(self, symbol, side, volume, price, decimals, validate):
        self.limits.append((symbol, side, volume, price, validate))
        return {"descr": {"order": f"{side} {volume} {symbol} @ limit {price:.{decimals}f}"},
                "txid": [] if validate else [f"L{len(self.limits)}"]}

    def query_orders(self, txids):
        return {t: self.open[t] for t in txids if t in self.open}

    def cancel_order(self, txid):
        self.canceled.append(txid)
        return {"count": 1}


def _store(up=True):
    st = Store(":memory:")
    idx = pd.date_range("2025-01-01", periods=24 * 200, freq="h", tz="UTC")
    rng = np.random.default_rng(1)
    for s, p0 in (("XBTEUR", 50000.0), ("ETHEUR", 2000.0)):
        trend = np.linspace(0, 0.8 if up else -0.8, len(idx))
        c = p0 * np.exp(trend + rng.normal(0, 0.002, len(idx)))
        st.upsert_bars("kraken", s, "1h", pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0}, index=idx))
    return st


def _settings(tmp_path, mode="research"):
    return Settings(data_dir=tmp_path, mode=mode, kill_switch_file=tmp_path / "KILL_SWITCH")


def test_live_is_off_without_the_confirmed_mode(tmp_path):
    with pytest.raises(PermissionError):
        live.step(_store(), _settings(tmp_path), FakeKraken({"ZEUR": 100.0}))


def test_dry_run_validates_buys_within_the_100_euro_cap(tmp_path):
    k, sent = FakeKraken({"ZEUR": 500.0}, quotes=QUOTES), []
    out = live.step(_store(), _settings(tmp_path), k, prova=True, send=sent.append)
    assert k.orders == [] and k.limits and all(o[1] == "buy" and o[4] is True for o in k.limits)
    assert all(o[3] == QUOTES[o[0]][0] for o in k.limits)   # si compra al bid, da maker
    spent = sum(o["quantita"] * o["prezzo"] for o in out["ordini"])
    assert spent <= live.CAPITAL_EUR + 1e-6
    assert all(o["tipo"] == "limite" and o["esito"] != "in coda" for o in out["ordini"])   # in prova niente coda
    assert all(m.startswith("[PROVA]") for m in sent) and any("ordine limite" in m for m in sent)


def test_stop_sells_everything_and_stays_stopped(tmp_path, monkeypatch):
    monkeypatch.setenv("RADIX_TRADING_LIVE_CONFIRMED", "si-confermo-denaro-reale")
    st, s = _store(), _settings(tmp_path, mode="live")
    k = FakeKraken({"ZEUR": 100.0})
    live.step(st, s, k, send=lambda m: None)
    # le crypto crollano: il conto vale circa 65 euro (BTC a ~110.000)
    k2 = FakeKraken({"ZEUR": 20.0, "XXBT": 0.0004})
    out = live.step(st, s, k2, send=lambda m: None)
    assert out["fermo"] and k2.orders == [("XBTEUR", "sell", 0.0004, False)]
    k3 = FakeKraken({"ZEUR": 70.0})
    out = live.step(st, s, k3, send=lambda m: None)
    assert out["fermo"] and k3.orders == []


def test_stop_counts_from_the_real_starting_balance(tmp_path, monkeypatch):
    # 110 euro sul conto: si investono al massimo 100, lo stop scatta a 90 (−20 veri), non a 80
    monkeypatch.setenv("RADIX_TRADING_LIVE_CONFIRMED", "si-confermo-denaro-reale")
    st, s = _store(), _settings(tmp_path, mode="live")
    out = live.step(st, s, FakeKraken({"ZEUR": 110.0}), send=lambda m: None)
    assert out["inizio"] == 110.0
    out = live.step(st, s, FakeKraken({"ZEUR": 89.0}), send=lambda m: None)
    assert out["fermo"]


def test_kill_switch_blocks_orders(tmp_path):
    (tmp_path / "KILL_SWITCH").write_text("stop")
    k = FakeKraken({"ZEUR": 100.0})
    out = live.step(_store(), _settings(tmp_path), k, prova=True, send=lambda m: None)
    assert out["fermo"] == "kill switch" and k.orders == []


def test_signature_matches_kraken_reference():
    # esempio della documentazione Kraken (REST authentication)
    secret = "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg=="
    data = {"nonce": "1616492376594", "ordertype": "limit", "pair": "XBTUSD", "price": 37500, "type": "buy", "volume": 1.25}
    k = live.Kraken("k", secret)
    assert k._sign("/0/private/AddOrder", data) == \
        "4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ=="


def test_alert_text_and_missing_config(monkeypatch):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.setattr(alerts, "env_value", lambda n: None)
    assert alerts.send("x") is False
    assert alerts.order_text("[finto]", "XBTEUR", -0.001, 60000, 0.1).startswith("[finto] Vendo 0.001 XBTEUR")


def test_status_summary_on_first_run_and_every_three_hours(tmp_path, monkeypatch):
    monkeypatch.setenv("RADIX_TRADING_LIVE_CONFIRMED", "si-confermo-denaro-reale")
    monkeypatch.setattr(live.portfolio, "lane_weights", lambda lane, close, macro: close * 0 + 0.0)
    st, s = _store(), _settings(tmp_path, mode="live")
    sent = []
    live.step(st, s, FakeKraken({"ZEUR": 110.0}), now=datetime(2026, 10, 30, 22, 15, tzinfo=timezone.utc), send=sent.append)
    assert any("Riepilogo" in m and "Stop a 90.00" in m for m in sent)
    sent.clear()
    live.step(st, s, FakeKraken({"ZEUR": 110.0}), now=datetime(2026, 10, 30, 23, 15, tzinfo=timezone.utc), send=sent.append)
    assert not any("Riepilogo" in m for m in sent)
    live.step(st, s, FakeKraken({"ZEUR": 110.0}), now=datetime(2026, 10, 31, 0, 15, tzinfo=timezone.utc), send=sent.append)
    assert any(m.startswith("[REALE] Riepilogo 00:15") for m in sent)


def _fixed_weights(monkeypatch, w=0.3):
    monkeypatch.setattr(live.portfolio, "lane_weights", lambda lane, close, macro: close * 0 + w)


def test_limit_orders_queue_fill_or_fall_back_to_market(tmp_path, monkeypatch):
    monkeypatch.setenv("RADIX_TRADING_LIVE_CONFIRMED", "si-confermo-denaro-reale")
    _fixed_weights(monkeypatch)
    st, s = _store(), _settings(tmp_path, mode="live")
    t0 = datetime(2026, 11, 1, 0, 15, tzinfo=timezone.utc)
    k, sent = FakeKraken({"ZEUR": 110.0}, quotes=QUOTES), []
    out = live.step(st, s, k, now=t0, send=sent.append)
    assert k.orders == [] and len(k.limits) == 2 and all(o[1] == "buy" and o[4] is False for o in k.limits)
    assert all(o["tipo"] == "limite" and o["esito"] == "in coda" for o in out["ordini"])
    assert sum("ordine limite" in m for m in sent) == 2
    # un'ora dopo gli ordini sono ancora in coda: niente doppioni, gli euro restano impegnati
    opened = {f"L{i + 1}": {"status": "open", "vol_exec": "0", "opentm": t0.timestamp()} for i in range(2)}
    k2 = FakeKraken({"ZEUR": 110.0}, quotes=QUOTES, open_orders=opened)
    out2 = live.step(st, s, k2, now=t0 + timedelta(hours=1), send=sent.append)
    assert k2.limits == [] and k2.orders == [] and out2["ordini"] == [] and k2.canceled == []
    # dopo 6 ore: il primo si e' eseguito, il secondo no -> annullato e comprato a mercato
    sent.clear()
    sym1, _, vol1, price1, _ = k.limits[0]
    sym2, _, vol2, _, _ = k.limits[1]
    states = {"L1": {"status": "closed", "vol_exec": str(vol1), "price": str(price1 - 10), "fee": "0.05"},
              "L2": {"status": "open", "vol_exec": "0", "opentm": t0.timestamp()}}
    k3 = FakeKraken({"ZEUR": 110.0 - vol1 * (price1 - 10), PAIRS[sym1][0]: vol1}, quotes=QUOTES, open_orders=states)
    out3 = live.step(st, s, k3, now=t0 + timedelta(hours=6), send=sent.append)
    assert any("Eseguito l'ordine limite" in m and "commissione 0.05" in m for m in sent)
    assert k3.canceled == ["L2"] and k3.limits == []
    assert [(o[0], o[1]) for o in k3.orders] == [(sym2, "buy")] and abs(k3.orders[0][2] - vol2) < 1e-6
    assert out3["ordini"][0]["tipo"] == "mercato" and any("a mercato" in m for m in sent)
    rows = dict(st.conn.execute("SELECT txid, esito FROM live_orders WHERE txid <> ''").fetchall())
    assert rows["L1"] == "eseguito" and rows["L2"].startswith("annullato dopo 6 ore")
    # il riepilogo elenca quello che e' in coda
    txt = live.status_text("[REALE]", t0, 110.0, 110.0, 50.0, {}, {}, False,
                           pending={"SOLEUR": {"side": "buy", "rest": 2.0, "price": 6.15, "txid": "X"}})
    assert "In coda: compro SOL 12.30 €" in txt


def test_stop_cancels_queued_buys_and_sells_at_market(tmp_path, monkeypatch):
    monkeypatch.setenv("RADIX_TRADING_LIVE_CONFIRMED", "si-confermo-denaro-reale")
    _fixed_weights(monkeypatch)
    st, s = _store(), _settings(tmp_path, mode="live")
    t0 = datetime(2026, 11, 1, 0, 15, tzinfo=timezone.utc)
    k = FakeKraken({"ZEUR": 110.0}, quotes=QUOTES)
    live.step(st, s, k, now=t0, send=lambda m: None)
    opened = {f"L{i + 1}": {"status": "open", "vol_exec": "0", "opentm": t0.timestamp()} for i in range(2)}
    # il conto e' sceso sotto lo stop (90): gli acquisti in coda si annullano, le crypto si vendono a mercato
    k2 = FakeKraken({"ZEUR": 60.0, "XETH": 0.005}, quotes=QUOTES, open_orders=opened)
    out = live.step(st, s, k2, now=t0 + timedelta(hours=1), send=lambda m: None)
    assert out["fermo"] and sorted(k2.canceled) == ["L1", "L2"]
    assert k2.limits == [] and k2.orders == [("ETHEUR", "sell", 0.005, False)]
    assert {r[0] for r in st.conn.execute("SELECT esito FROM live_orders WHERE txid LIKE 'L%'")} == {"annullato per lo stop"}


def test_market_orders_when_asked_or_without_quotes(tmp_path, monkeypatch):
    monkeypatch.setenv("RADIX_TRADING_LIVE_CONFIRMED", "si-confermo-denaro-reale")
    monkeypatch.setenv("RADIX_TRADING_ORDERS", "market")
    _fixed_weights(monkeypatch)
    st, s = _store(), _settings(tmp_path, mode="live")
    k = FakeKraken({"ZEUR": 110.0}, quotes=QUOTES)
    live.step(st, s, k, send=lambda m: None)
    assert k.limits == [] and len(k.orders) == 2
    monkeypatch.delenv("RADIX_TRADING_ORDERS")
    k2 = FakeKraken({"ZEUR": 110.0})   # Kraken non risponde con le quotazioni: si va a mercato
    live.step(_store(), _settings(tmp_path, mode="live"), k2, send=lambda m: None)
    assert k2.limits == [] and len(k2.orders) == 2
