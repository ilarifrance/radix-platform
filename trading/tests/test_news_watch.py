import json
import math
from datetime import datetime, timedelta, timezone

from radix_trading import news_watch as nw
from radix_trading import serve
from radix_trading.config import Settings
from radix_trading.store import Store

NOW = datetime(2026, 11, 16, 14, 32, 10, tzinfo=timezone.utc)


def _store(titles):
    store = Store(":memory:")
    store.upsert_news([{"url": f"https://x/{i}", "ts": ts, "title": t, "source": "cnbc_top", "language": "en", "country": "US",
                        "query": None, "sentiment": None} for i, (ts, t) in enumerate(titles)])
    return store


TITLES = [
    ("2026-11-16T14:20:00Z", "Israel strikes Iranian missile sites as oil jumps 6%"),      # forte, visto 12 min dopo -> osservazione
    ("2026-11-16T14:25:00Z", "Fed holds rates steady, as expected"),                       # debole -> niente
    ("2026-11-16T09:00:00Z", "US announces 60% tariffs on all Chinese imports"),           # forte ma vecchio di 5 ore -> arretrato
    ("2026-11-16T14:30:00Z", "Ten tips for a better sourdough"),                           # irrilevante
]


def fake_call(system, user):
    assert "segno" in system
    items = []
    for line in user.splitlines()[1:]:
        n = int(line.split(".")[0])
        if "Israel" in line:
            items.append({"n": n, "temi": ["medio_oriente", "guerra", "petrolio"], "intensita": 3, "segno": -1})
        elif "Fed" in line:
            items.append({"n": n, "temi": ["fed_tassi"], "intensita": 1, "segno": 0})
        elif "tariffs" in line:
            items.append({"n": n, "temi": ["dazi", "cina"], "intensita": 2, "segno": -1})
        else:
            items.append({"n": n, "temi": [], "intensita": 0, "segno": 0})
    return json.dumps({"items": items}), 500, 100


def fake_prices():
    return {"sp500": 6700.0, "nasdaq": 24000.0, "btc": 80000.0, "eth": 2500.0}, {"oro": "RuntimeError: Kraken giu'"}


def test_tick_collects_classifies_saves_prices_and_opens_fresh_observations_only():
    store = _store(TITLES)
    seen = {}

    def collect_fn(s, now):
        seen["now"] = now
        return {"rss": 3, "gdelt": "errore: GDELT limite"}

    out = nw.tick(store, now=NOW, collect_fn=collect_fn, call=fake_call, prices_fn=fake_prices)
    assert seen["now"] == NOW and out["quando"] == "2026-11-16T14:32:00Z"
    assert out["agente"]["classificate"] == 4 and out["agente"]["arretrato"] == 0
    assert out["prezzi"] == {"sp500": 6700.0, "nasdaq": 24000.0, "btc": 80000.0, "eth": 2500.0, "errori": {"oro": "RuntimeError: Kraken giu'"}}
    assert out["osservazioni_nuove"] == 1 and out["osservazioni_totali"] == 1
    url, visto, ritardo, temi, inten, segno = store.conn.execute(
        "SELECT url, visto, ritardo_min, temi, intensita, segno FROM news_watch_events").fetchone()
    assert (url, visto, ritardo, inten, segno) == ("https://x/0", "2026-11-16T14:32:00Z", 12, 3, -1)
    assert temi == "guerra,medio_oriente,petrolio"
    assert store.conn.execute("SELECT count(*) FROM news_watch_prices").fetchone()[0] == 4
    run = store.conn.execute("SELECT titoli, classificate, osservazioni, prezzi, note FROM news_watch_runs").fetchone()
    assert run == (3, 4, 1, 4, "oro: RuntimeError: Kraken giu'")
    # secondo giro 5 minuti dopo: niente di nuovo da classificare, prezzi registrati, nessuna osservazione doppia
    out2 = nw.tick(store, now=NOW + timedelta(minutes=5), raccolta=False, call=fake_call, prices_fn=fake_prices)
    assert "titoli" not in out2 and out2["agente"]["classificate"] == 0 and out2["osservazioni_nuove"] == 0
    assert store.conn.execute("SELECT count(*) FROM news_watch_prices").fetchone()[0] == 8


def test_tick_without_key_records_prices_and_says_classification_skipped(monkeypatch):
    monkeypatch.setattr(nw.news_agent, "provider", lambda: None)
    store = _store(TITLES)
    out = nw.tick(store, now=NOW, collect_fn=lambda s, now: {"rss": 0, "gdelt": 0}, prices_fn=fake_prices)
    assert "manca OPENAI_API_KEY" in out["agente"]["saltato"] and out["agente"]["arretrato"] == 4
    assert out["osservazioni_nuove"] == 0 and store.conn.execute("SELECT count(*) FROM news_watch_prices").fetchone()[0] == 4
    assert nw.report(store)["osservazioni"] == 0 and nw.weekly_line(store) == ""


def _prices_every_5_min(store, start, days, drift_at=None):
    """Prezzi piatti a 100, ogni 5 minuti per `days` giorni; a `drift_at` il prezzo scende dell'1% per un'ora."""
    rows = []
    t = start
    end = start + timedelta(days=days)
    while t < end:
        p = 100.0
        if drift_at is not None and drift_at < t <= drift_at + timedelta(minutes=60):
            p = 99.0
        rows.append((t.strftime("%Y-%m-%dT%H:%M:%SZ"), "sp500", p))
        rows.append((t.strftime("%Y-%m-%dT%H:%M:%SZ"), "btc", 100.0))
        t += timedelta(minutes=5)
    store.conn.executemany("INSERT OR REPLACE INTO news_watch_prices VALUES (?,?,?)", rows)
    store.conn.commit()


def test_report_measures_moves_against_shifted_control_and_weekly_line():
    store = Store(":memory:")
    nw.init(store)
    start = datetime(2026, 11, 10, 0, 0, tzinfo=timezone.utc)
    visto = datetime(2026, 11, 13, 14, 30, tzinfo=timezone.utc)
    _prices_every_5_min(store, start, days=7, drift_at=visto)
    store.conn.execute("INSERT INTO news_watch_events VALUES (?,?,?,?,?,?,?,?,?)",
                       ("https://x/0", visto.strftime("%Y-%m-%dT%H:%M:%SZ"), "2026-11-13T14:20:00Z", 10, "guerra,medio_oriente", 3, -1,
                        "Israel strikes", "cnbc_top"))
    store.conn.execute("INSERT INTO news_watch_events VALUES (?,?,?,?,?,?,?,?,?)",
                       ("https://x/1", "2026-11-14T10:00:00Z", "2026-11-14T09:40:00Z", 20, "dazi", 2, 0, "Tariffs", "cnbc_top"))
    store.conn.commit()
    r = nw.report(store, now=datetime(2026, 11, 17, tzinfo=timezone.utc))
    assert r["osservazioni"] == 2 and r["giorni_di_prezzi"] == 7 and r["giri_al_giorno"] == 288.0
    assert r["ritardo_mediano_min"] == 15 and r["freschi_entro_15_min"] == 1 and r["con_segno"] == 1
    sp = r["per_mercato"]["sp500"]
    # il titolo con segno -1 e' seguito da -1%: nel verso della notizia, +1% «nel verso»; il controllo a orario spostato e' piatto
    assert sp["+5"]["reale"] == {"n": 2, "nel_verso_pct": 100.0, "media_nel_verso_pct": 1.0, "ampiezza_media_pct": 0.5}
    assert sp["+15"]["reale"]["media_nel_verso_pct"] == 1.0 and sp["+60"]["reale"]["media_nel_verso_pct"] == 1.0
    # controllo: 6 orari spostati per titolo, meno il 17/11 10:00 (fuori dai prezzi registrati) -> 11
    assert sp["+15"]["controllo"]["n"] == 11 and sp["+15"]["controllo"]["ampiezza_media_pct"] == 0.0
    assert sp["+15"]["controllo"]["nel_verso_pct"] == 0.0
    assert r["per_mercato"]["btc"]["+15"]["reale"]["ampiezza_media_pct"] == 0.0
    assert r["per_tema"]["guerra"]["sp500"] == {"n": 1, "media_nel_verso_pct_a_15": 1.0}
    assert r["per_tema"]["dazi"]["sp500"]["media_nel_verso_pct_a_15"] is None       # senza segno non c'e' verso
    line = nw.weekly_line(store, now=datetime(2026, 11, 17, tzinfo=timezone.utc))
    assert line.startswith("Osservatorio notizie al minuto (solo misura): 2 titoli forti in 7 giorni, ritardo mediano 15 min")
    assert "S&P a +15 min nel verso della notizia 100% (controllo 0%)" in line and "nessun ordine" in line


def test_price_at_and_moves_tolerate_gaps():
    import pandas as pd
    idx = pd.to_datetime(["2026-11-16T14:32:00Z", "2026-11-16T14:37:00Z", "2026-11-16T15:40:00Z"], utc=True)
    s = pd.Series([100.0, 101.0, 103.0], index=idx)
    t0 = pd.Timestamp("2026-11-16T14:32:00Z")
    m = nw.moves(s, t0)
    assert m[5] == 1.0 and math.isnan(m[15]) and math.isnan(m[60])      # alle 15:32 non c'e' nessun giro entro 4 minuti
    assert math.isnan(nw.price_at(s, pd.Timestamp("2026-11-16T14:40:00Z")))
    assert nw.price_at(s, pd.Timestamp("2026-11-16T15:38:00Z")) == 103.0


def test_fetch_prices_isolates_failures():
    prices, errors = nw.fetch_prices(fetch_yahoo=lambda code: {"price": 6700.5} if code == "ES=F" else (_ for _ in ()).throw(RuntimeError("Yahoo 429")),
                                     fetch_kraken=lambda pair: {"XBTEUR": 80000.0, "ETHEUR": 2500.0, "PAXGUSD": 4100.0}[pair])
    assert prices == {"sp500": 6700.5, "btc": 80000.0, "eth": 2500.0, "oro": 4100.0}
    assert errors == {"nasdaq": "RuntimeError: Yahoo 429"}


def test_cli_and_friday_line_are_wired(monkeypatch, tmp_path, capsys):
    from radix_trading import __main__ as cli
    from radix_trading import metodo60 as m60
    monkeypatch.setattr(cli, "Settings", lambda: Settings(data_dir=tmp_path, mode="research"))
    assert cli.main(["osservatorio-notizie", "--rapporto"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["osservazioni"] == 0 and out["per_mercato"] == {}
    called = {}
    monkeypatch.setattr(nw, "tick", lambda store, **kw: called.setdefault("kw", kw) or {"quando": "x"})
    assert cli.main(["osservatorio-notizie"]) == 0 and called["kw"] == {}
    store = Store(":memory:")
    assert m60._news_agent_line(store) == ""
    monkeypatch.setattr(nw, "weekly_line", lambda store, now=None: "Osservatorio: 1 titolo.")
    assert m60._news_agent_line(store) == " Osservatorio: 1 titolo."
