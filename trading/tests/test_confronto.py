import numpy as np
import pandas as pd

from radix_trading import confronto
from radix_trading.store import Store


def _hourly(start, end, p0, drift, seed):
    idx = pd.date_range(start, end, freq="h", tz="UTC")
    rng = np.random.default_rng(seed)
    r = rng.normal(drift / (24 * 365), 0.6 / np.sqrt(24 * 365), len(idx))
    return pd.Series(p0 * np.exp(np.cumsum(r)), index=idx)


def _daily(start, end, p0, yearly):
    idx = pd.bdate_range(start, end, tz="UTC")
    t = np.arange(len(idx)) / 252
    c = p0 * np.exp(yearly * t)
    return pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0}, index=idx)


def test_live_rule_weights_are_multiples_of_1_32_and_change_only_at_midnight():
    close = pd.DataFrame({"XBTEUR": _hourly("2020-01-01", "2020-12-31", 7000, 0.8, 1),
                          "ETHEUR": _hourly("2020-01-01", "2020-12-31", 150, 1.0, 2)})
    w = confronto.regola_live(close)
    assert ((w * 32).round() - w * 32).abs().max().max() < 1e-9
    assert w.max().max() <= 0.5 + 1e-9                      # mai piu' di 1/2 per moneta con due monete
    assert w.groupby(w.index.floor("D")).nunique().max().max() == 1   # dentro la giornata i pesi non cambiano
    assert w.sum(axis=1).max() > 0


def test_live_rule_gives_zero_to_a_coin_without_data():
    close = pd.DataFrame({"XBTEUR": _hourly("2020-01-01", "2020-12-31", 7000, 0.8, 1)})
    close["SOLEUR"] = np.nan
    w = confronto.regola_live(close)
    assert w["SOLEUR"].abs().sum() == 0


def test_yearly_tax_carries_losses_forward():
    assert abs(confronto.tasse_annuali({2020: 0.10}, 0.33) - 0.067) < 1e-9
    netto = confronto.tasse_annuali({2020: -0.10, 2021: 0.10}, 0.33)
    assert abs(netto - ((0.9 * 1.10) ** 0.5 - 1)) < 1e-9        # la perdita del 2020 copre il guadagno del 2021


def test_confirmation_rule_needs_two_months():
    idx = pd.date_range("2020-01-31", periods=20, freq="ME", tz="UTC")
    c = pd.Series(np.linspace(100, 200, 20), index=idx)       # sempre in salita
    c.iloc[15] = 50.0                                           # un mese solo sotto il prezzo di 12 mesi prima
    mensili = pd.DataFrame({"A": c})
    trend = confronto.segnali(mensili, "trend12")["A"]
    conf = confronto.segnali(mensili, "conferma2")["A"]
    assert trend.iloc[15] == 0.0 and conf.iloc[15] == 1.0      # il trend esce, la conferma no
    assert conf.iloc[:12].isna().all()                          # prima dei 13 mesi non si decide


def test_etf_simulation_uses_whole_shares_min_fee_and_tax_on_sale():
    close = pd.DataFrame({"UP": _daily("2019-01-01", "2023-12-29", 100.0, 0.20)["close"],
                          "DOWN": _daily("2019-01-01", "2023-12-29", 50.0, -0.20)["close"]})
    lordo = confronto.simula_etf(close, "trend12", capitale=1000.0)
    netto = confronto.simula_etf(close, "trend12", capitale=1000.0, tassa=0.26)
    assert lordo["ordini"] >= 1 and lordo["finale"] > 1000.0
    assert lordo["commissioni"] >= 2.95 * lordo["ordini"]           # minimo Fineco su ogni ordine
    assert netto["finale"] <= lordo["finale"]                          # con la tassa alla vendita non si guadagna di piu'
    assert lordo["per_anno"] and lordo["inizio"] >= "2020-01"       # si parte dopo 13 mesi di storico


def test_buy_and_hold_rebalances_in_january():
    close = pd.DataFrame({"UP": _daily("2019-01-01", "2023-12-29", 100.0, 0.30)["close"],
                          "FLAT": _daily("2019-01-01", "2023-12-29", 100.0, 0.0)["close"]})
    senza = confronto.simula_etf(close, "bh", capitale=3000.0, ribilancio=False)
    con = confronto.simula_etf(close, "bh", capitale=3000.0, ribilancio=True)
    assert senza["ordini"] == 2                                   # due acquisti e basta
    assert con["ordini"] > 2                                      # vende UP e compra FLAT ogni gennaio
    assert con["finale"] < senza["finale"]                        # ribilanciare verso il piatto costa rendimento


def test_run_end_to_end_with_fake_data(tmp_path):
    st = Store(tmp_path / "x.sqlite")
    close = pd.DataFrame({"XBTEUR": _hourly("2018-01-01", "2023-06-30", 7000, 0.6, 3),
                          "ETHEUR": _hourly("2018-01-01", "2023-06-30", 150, 0.7, 4)})
    fake = {sym: _daily("2010-01-01", "2026-10-30", 100.0 + i * 7, 0.08 - 0.02 * (i % 3))
            for i, sym in enumerate(sorted({t for ts in confronto.PANIERI.values() for t in ts}))}
    res = confronto.run(st, fetch=lambda s: fake[s], pausa=0.0, close_crypto=close)
    assert set(res["crypto"]["A0"]) == {"pulito", "intero"}
    assert res["crypto"]["A0"]["pulito"]["taker"]["fine"] <= "2022-10-01"
    assert "vol_15" in res["crypto"]["A1"]
    assert res["etf"]["risultati"]["B1_tre_trend12"]["ordini"] >= 3
    assert "combinazione" in res and "50/50" in res["combinazione"]["pesi"]
    assert "A0 pulito taker" in res["testo"] and "B2_tre_bh_ribilancio" in res["testo"]
    assert not any(k.startswith("_") for k in res["crypto"]["A0"]["pulito"]["taker"])
