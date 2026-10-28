from datetime import datetime, timedelta, timezone

import pytest

from radix_trading.config import RiskLimits, Settings
from radix_trading.risk import OrderIntent, PortfolioState, RiskManager

NOW = datetime(2026, 10, 28, 12, tzinfo=timezone.utc)


@pytest.fixture
def rm(tmp_path):
    return RiskManager(Settings(data_dir=tmp_path, mode="paper", kill_switch_file=tmp_path / "KILL"))


def state(**kw):
    base = dict(equity_eur=1000.0, peak_equity_eur=1000.0, day_start_equity_eur=1000.0, positions_eur={})
    base.update(kw)
    return PortfolioState(**base)


def buy(notional=100.0, stop=0.05):
    return OrderIntent("kraken", "XBTEUR", "buy", notional, stop)


def test_research_mode_never_orders(tmp_path):
    rm = RiskManager(Settings(data_dir=tmp_path, mode="research", kill_switch_file=tmp_path / "K"))
    assert not rm.check(buy(), state(), NOW).approved


def test_live_requires_explicit_confirmation(tmp_path, monkeypatch):
    monkeypatch.delenv("RADIX_TRADING_LIVE_CONFIRMED", raising=False)
    with pytest.raises(PermissionError):
        Settings(data_dir=tmp_path, mode="live")


def test_size_limited_by_risk_per_trade(rm):
    # 0,5% di 1000 = 5 euro di rischio; con stop al 10% la posizione massima e' 50 euro.
    d = rm.check(buy(100.0, 0.10), state(), NOW)
    assert d.approved and d.notional_eur == 50.0 and "rischio" in d.reasons[0]


def test_size_limited_by_max_position(rm):
    d = rm.check(buy(500.0, 0.02), state(), NOW)
    assert d.approved and d.notional_eur == 100.0


def test_buy_requires_stop(rm):
    assert not rm.check(buy(stop=None), state(), NOW).approved


def test_daily_loss_and_drawdown_halt_buys_but_not_sells(rm):
    s = state(equity_eur=975.0, positions_eur={"kraken:XBTEUR": 80.0})
    assert not rm.check(buy(), s, NOW).approved
    sell = rm.check(OrderIntent("kraken", "XBTEUR", "sell", 200.0), s, NOW)
    assert sell.approved and sell.notional_eur == 80.0
    dd = state(equity_eur=890.0, peak_equity_eur=1000.0, day_start_equity_eur=890.0)
    assert any("drawdown" in r for r in rm.check(buy(), dd, NOW).reasons)


def test_no_short_selling(rm):
    assert not rm.check(OrderIntent("kraken", "XBTEUR", "sell", 10.0), state(), NOW).approved


def test_kill_switch_and_flatten(rm):
    s = state(positions_eur={"kraken:XBTEUR": 60.0, "ibkr:VWCE": 40.0})
    exits = rm.flatten_all(s, "test manuale")
    assert rm.kill_switch_on()
    assert {(o.venue, o.symbol) for o in exits} == {("kraken", "XBTEUR"), ("ibkr", "VWCE")}
    assert not rm.check(buy(), state(), NOW).approved
    assert rm.check(exits[0], s, NOW).approved


def test_order_rate_limit(tmp_path):
    limits = RiskLimits(max_orders_per_hour=3)
    rm = RiskManager(Settings(data_dir=tmp_path, mode="paper", kill_switch_file=tmp_path / "K", limits=limits))
    s = state()
    results = [rm.check(buy(10.0), s, NOW + timedelta(minutes=i)).approved for i in range(4)]
    assert results == [True, True, True, False]
    assert rm.check(buy(10.0), s, NOW + timedelta(minutes=70)).approved


def test_unknown_venue_rejected(rm):
    assert not rm.check(OrderIntent("binance", "BTCUSDT", "buy", 50.0, 0.05), state(), NOW).approved
