import base64
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from radix_trading import alerts, live
from radix_trading.config import Settings
from radix_trading.store import Store

PAIRS = {"XBTEUR": ("XXBT", 0.00005, 8), "ETHEUR": ("XETH", 0.002, 8)}


class FakeKraken:
    def __init__(self, balance):
        self.bal, self.orders = balance, []

    def pairs(self, symbols):
        return {s: {"base": PAIRS[s][0], "ordermin": PAIRS[s][1], "lot_decimals": PAIRS[s][2]} for s in symbols if s in PAIRS}

    def balance(self):
        return dict(self.bal)

    def market_order(self, symbol, side, volume, validate):
        self.orders.append((symbol, side, volume, validate))
        return {"descr": {"order": f"{side} {volume} {symbol} @ market"}, "txid": [] if validate else ["T1"]}


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
    k, sent = FakeKraken({"ZEUR": 500.0}), []
    out = live.step(_store(), _settings(tmp_path), k, prova=True, send=sent.append)
    assert k.orders and all(o[1] == "buy" and o[3] is True for o in k.orders)
    spent = sum(v * out_o["prezzo"] for (_, _, v, _), out_o in zip(k.orders, out["ordini"]))
    assert spent <= live.CAPITAL_EUR + 1e-6
    assert all(m.startswith("[PROVA]") for m in sent)


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
