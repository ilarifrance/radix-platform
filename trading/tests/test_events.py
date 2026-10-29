from datetime import date

import numpy as np
import pandas as pd

from radix_trading import events
from radix_trading.collectors import wikinews
from radix_trading.store import Store

WIKI = """{{Current events header|2025|04|02}}
<!-- All news items below this line -->
'''Armed conflicts and attacks'''
*[[Russian invasion of Ukraine]]
**[[Russia]] launches a [[missile]] strike on [[Kryvyi Rih]], killing 20.<ref>{{cite web|url=x}}</ref>
'''Business and economy'''
*[[Liberation Day tariffs|Trump announces sweeping tariffs]] on all imports, including 34% on [[China]]. <ref name="a"/>
*[[OPEC+]] agrees to raise oil output in May.
;International relations
*[[Israel]] and [[Hamas]] discuss a ceasefire in [[Gaza Strip|Gaza]].
"""


def test_wikinews_titles_and_parsing():
    assert wikinews.title_for(date(2025, 4, 2)) == "Portal:Current events/2025 April 2"
    assert wikinews.date_of("Portal:Current events/2025 April 2") == date(2025, 4, 2)
    items = wikinews.parse_day(WIKI)
    texts = [i["testo"] for i in items]
    assert len(items) == 4  # il titolo "Russian invasion of Ukraine" non e' una notizia a se'
    assert texts[0].startswith("Russian invasion of Ukraine — Russia launches a missile strike on Kryvyi Rih")
    assert "<ref" not in " ".join(texts) and "[[" not in " ".join(texts)
    assert items[1]["sezione"] == "Business and economy"
    assert texts[1].startswith("Trump announces sweeping tariffs")
    assert items[3]["sezione"] == "International relations" and "Gaza" in texts[3]


def test_collect_news_newest_first_and_themes(monkeypatch):
    st = Store(":memory:")
    asked = []

    def fake(days):
        asked.extend(days)
        return {d: wikinews.parse_day(WIKI) if d == date(2025, 4, 2) else [] for d in days}

    monkeypatch.setattr(wikinews, "fetch_days", fake)
    out = events.collect_news(st, batches=1, today=date(2025, 4, 3))
    assert asked[0] == date(2025, 4, 2) and len(asked) == 50 and out["giorni_mancanti"] > 3000
    counts = events.theme_counts(st)
    row = counts.loc[pd.Timestamp("2025-04-02")]
    assert row["dazi"] == 1 and row["trump"] == 1 and row["cina"] == 1 and row["guerra"] == 1
    assert row["petrolio"] == 1 and row["tregua"] == 1 and row["medio_oriente"] == 1 and row["russia_ucraina"] == 1
    # secondo giro: i giorni gia' presenti non si riscaricano (tranne gli ultimi 3)
    asked.clear()
    events.collect_news(st, batches=1, today=date(2025, 4, 3))
    assert date(2025, 3, 20) not in asked and date(2025, 4, 2) in asked


def test_news_events_use_only_the_past():
    idx = pd.date_range("2020-01-01", periods=400, freq="D")
    c = pd.DataFrame({"guerra": 1}, index=idx)
    c.iloc[300, 0] = 9
    ev = events.news_events(c)
    assert ev["guerra"].sum() == 1 and ev["guerra"].iloc[300]
    c2 = c.copy()
    c2.iloc[350:, 0] = 50  # il futuro non cambia gli eventi passati
    assert (events.news_events(c2)["guerra"].iloc[:350] == ev["guerra"].iloc[:350]).all()


def test_study_finds_a_planted_link_and_rejects_noise():
    rng = np.random.default_rng(0)
    idx = pd.bdate_range("2015-01-01", "2026-10-28")
    r = rng.normal(0, 0.01, len(idx))
    ev_days = idx[np.arange(100, len(idx) - 10, 37)]
    pos = idx.get_indexer(ev_days)
    r[pos + 1] += 0.012  # il giorno dopo l'evento l'oro sale dell'1,2% in piu'
    gold = pd.Series(100 * np.exp(np.cumsum(r)), index=idx)
    noise = pd.Series(100 * np.exp(np.cumsum(rng.normal(0, 0.01, len(idx)))), index=idx)
    evs = pd.DataFrame(False, index=idx, columns=["notizie:guerra", "notizie:nulla"])
    evs.loc[ev_days, "notizie:guerra"] = True
    evs.loc[idx[np.arange(118, len(idx) - 10, 37)], "notizie:nulla"] = True  # lontani dagli altri eventi
    out = events.study(evs, {"Oro": gold, "Rumore": noise}, pd.Timestamp("2025-10-28"))
    top = out["legami"][0]
    assert (top["evento"], top["mercato"], top["giorni"], top["verso"]) == ("notizie:guerra", "Oro", 1, "su")
    assert top["regge_verifica"] and top["verifica_n"] >= 3
    assert all(t["mercato"] == "Oro" for t in out["legami"])  # il mercato senza legami non compare
    assert not any(t["evento"] == "notizie:nulla" and t["regge_verifica"] for t in out["legami"])


def test_market_shocks_and_calendar(monkeypatch):
    idx = pd.bdate_range("2020-01-01", periods=400)
    rng = np.random.default_rng(1)
    spx = pd.Series(100 * np.exp(np.cumsum(rng.normal(0, 0.01, 400))), index=idx)
    spx.iloc[300:] *= 0.9  # crollo del 10% in un giorno
    macro = pd.DataFrame({"VIXCLS": 15.0, "DGS10": 4.0}, index=idx)
    macro.iloc[300:, 0] = 25.0
    macro.iloc[200:, 1] = 4.3
    sh = events.market_shocks({"S&P 500": spx}, macro)
    assert sh["spx_crollo"].iloc[300] and sh["vix_esplode"].iloc[300] and sh["tassi_salto"].iloc[200]
    assert sh["spx_crollo"].sum() == 1

    st = Store(":memory:")
    monkeypatch.setattr(events.fred, "fetch_series",
                        lambda s: pd.Series([5.5, 5.5, 5.25, 5.25, 5.5], index=pd.date_range("2024-09-16", periods=5)))
    monkeypatch.setattr(events, "env_value", lambda k: None)
    out = events.collect_calendar(st)
    assert out["fed"] == 2 and "FRED_API_KEY" in out["cpi"]
    cal = events.calendar_events(st)
    assert cal["fed_taglia"].sum() == 1 and cal["fed_alza"].sum() == 1


def test_run_end_to_end(tmp_path, monkeypatch):
    from radix_trading import snapshot
    from radix_trading.config import Settings
    st = Store(":memory:")
    rng = np.random.default_rng(3)
    idx = pd.bdate_range("2015-01-01", "2026-10-28", tz="UTC")
    for venue, s in (("yahoo", "SPY"), ("materie", "GLD")):
        c = 100 * np.exp(np.cumsum(rng.normal(0.0003, 0.01, len(idx))))
        st.upsert_bars(venue, s, "1d", pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0}, index=idx))
    st.upsert_macro("VIXCLS", pd.Series(15 + rng.normal(0, 1, len(idx)), index=idx.tz_localize(None)))
    events.init(st)
    days = pd.date_range("2015-01-01", "2026-10-28", freq="D")
    st.conn.executemany("INSERT INTO news_days VALUES (?, 1)", [(d.date().isoformat(),) for d in days])
    st.conn.executemany("INSERT INTO news_items VALUES (?, 'x', ?)",
                        [(d.date().isoformat(), f"Trump announces tariffs {k}" if i % 23 == 0 else f"Weather {k}")
                         for i, d in enumerate(days) for k in range(3)])
    out = events.run(st, today=date(2026, 10, 29))
    assert out["prove"] > 0 and "errore" not in out
    assert out["eventi"]["notizie:trump"] > 0
    settings = Settings(data_dir=tmp_path)
    events.save(settings, out)
    snap = snapshot.build(st, settings)
    assert snap["eventi"]["prove"] == out["prove"]
