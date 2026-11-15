import json
from datetime import datetime, timezone

import pytest

from radix_trading import events
from radix_trading import news_agent as na
from radix_trading.store import Store


def _store(titles):
    """Archivio in memoria con i titoli in `news` (url, ts, title, source)."""
    store = Store(":memory:")
    store.upsert_news([{"url": f"https://x/{i}", "ts": ts, "title": title, "source": src, "language": "en",
                        "country": "US", "query": None, "sentiment": None} for i, (ts, title, src) in enumerate(titles)])
    return store


TITLES = [
    ("2026-11-13T14:00:00Z", "Israel strikes Iranian missile sites as oil jumps 6%", "cnbc_top"),
    ("2026-11-13T09:00:00Z", "Fed holds rates steady, as expected", "marketwatch_top"),
    ("2026-11-12T20:00:00Z", "Ten tips for a better sourdough", "bbc_world"),
    ("2026-11-12T08:00:00Z", "US announces 60% tariffs on all Chinese imports", "cnbc_economy"),
    ("2026-11-12T07:00:00Z", "short", "bbc_world"),      # troppo corto: non si classifica
    ("2026-10-01T07:00:00Z", "An old headline from before the RSS collection started", "cnbc_top"),   # prima del 3/11: si ignora
]


def fake_call(system, user):
    """Finto modello: risponde con regole fisse sui numeri dei titoli ricevuti, con testo intorno al JSON."""
    assert "JSON" in system and "dazi" in system
    items = []
    for line in user.splitlines()[1:]:
        n = int(line.split(".")[0])
        if "Israel" in line:
            items.append({"n": n, "temi": ["medio_oriente", "guerra", "petrolio", "inventato"], "intensita": 3, "segno": -1})
        elif "Fed" in line:
            items.append({"n": n, "temi": ["fed_tassi"], "intensita": 1})
        elif "tariffs" in line:
            items.append({"n": n, "temi": ["dazi", "cina"], "intensita": 7, "segno": -5})   # fuori scala: si tagliano a 3 e -1
        else:
            items.append({"n": n, "temi": [], "intensita": 0})
    return "Here you go:\n" + json.dumps({"items": items}) + "\nthanks", 1200, 300


def test_parse_is_robust_to_noise_and_bad_values():
    text = 'ok {"items": [{"n": 1, "temi": ["dazi", "boh"], "intensita": 9}, {"n": "2", "temi": ["cina"], "intensita": "1"}, ' \
           '{"n": 5, "temi": ["guerra"], "intensita": 2}, {"temi": ["guerra"]}, {"n": 3, "temi": "cina", "intensita": "x"}]} fine'
    got = na.parse(text, 3)
    assert got[1] == (["dazi"], 3, 0)          # senza «segno» -> 0
    assert got[2] == (["cina"], 1, 0)
    assert 5 not in got            # fuori intervallo
    assert got[3] == ([], 0, 0)    # temi non lista -> nessun tema; intensita' rotta -> 0
    got = na.parse('{"items": [{"n": 1, "temi": [], "intensita": 2, "segno": -1}, {"n": 2, "temi": [], "intensita": 2, "segno": "x"}, '
                   '{"n": 3, "temi": [], "intensita": 2, "segno": 4}]}', 3)
    assert [got[k][2] for k in (1, 2, 3)] == [-1, 0, 1]
    assert na.parse("niente json", 3) == {} and na.parse('{"items": [', 3) == {}


def test_pending_takes_recent_first_and_skips_short_titles():
    store = _store(TITLES)
    items = na.pending(store)
    assert [it["title"] for it in items][:2] == ["Israel strikes Iranian missile sites as oil jumps 6%", "Fed holds rates steady, as expected"]
    assert all(it["title"] != "short" for it in items) and len(items) == 4
    assert all(it["ts"] >= na.SINCE for it in items)
    assert na.pending(store, 1)[0]["title"].startswith("Israel")


def test_step_saves_rows_counts_and_is_idempotent():
    store = _store(TITLES)
    now = datetime(2026, 11, 13, 22, 30, tzinfo=timezone.utc)
    out = na.step(store, call=fake_call, now=now)
    assert out["classificate"] == 4 and out["chiamate"] == 1 and out["arretrato"] == 0 and "errore" not in out
    assert out["token_in"] == 1200 and out["costo_stimato_usd"] == round((1200 * 0.15 + 300 * 0.60) / 1e6, 4)
    assert out["oggi_forti"] == {"guerra": 1, "medio_oriente": 1, "petrolio": 1}
    rows = {r[0]: r for r in store.conn.execute("SELECT url, day, temi, intensita, modello FROM news_llm")}
    assert rows["https://x/0"][1:] == ("2026-11-13", "guerra,medio_oriente,petrolio", 3, "test")   # tema inventato scartato
    assert rows["https://x/3"][2:4] == ("cina,dazi", 3)                                        # intensita' 7 -> 3
    assert rows["https://x/2"][2:4] == ("", 0)
    counts = na.theme_counts(store)
    assert list(counts.index.strftime("%Y-%m-%d")) == ["2026-11-12", "2026-11-13"]
    assert counts.loc["2026-11-13", "medio_oriente"] == 1 and counts.loc["2026-11-12", "dazi"] == 1
    assert counts.loc["2026-11-13", "fed_tassi"] == 0      # intensita' 1 non conta come notizia forte
    assert list(counts.columns) == list(events.THEMES)
    # secondo giro: niente da fare, nessuna chiamata
    again = na.step(store, call=lambda s, u: pytest.fail("non doveva chiamare"), now=datetime(2026, 11, 14, 22, 30, tzinfo=timezone.utc))
    assert again["classificate"] == 0 and again["chiamate"] == 0
    assert store.conn.execute("SELECT count(*) FROM news_llm_runs").fetchone()[0] == 2


def test_step_without_key_does_nothing_and_says_so():
    store = _store(TITLES)
    out = na.step(store)
    assert "manca OPENAI_API_KEY" in out["saltato"] and out["arretrato"] == 4
    assert store.conn.execute("SELECT count(*) FROM news_llm").fetchone()[0] == 0


def test_limit_and_provider_error_are_reported_not_raised():
    store = _store(TITLES)
    out = na.step(store, limit=2, call=fake_call)
    assert out["classificate"] == 2 and out["arretrato"] == 2

    def broken(system, user):
        raise RuntimeError("429 Too Many Requests")
    out = na.step(store, call=broken)
    assert out["classificate"] == 0 and out["errore"].startswith("RuntimeError") and out["arretrato"] == 2


def test_batches_and_weekly_line():
    titles = [(f"2026-11-{10 + i % 4:02d}T10:00:00Z", f"Headline number {i} about tariffs on Chinese goods", "cnbc_top") for i in range(95)]
    store = _store(titles)
    calls = []

    def call(system, user):
        n = len(user.splitlines()) - 1
        calls.append(n)
        return json.dumps({"items": [{"n": k, "temi": ["dazi"], "intensita": 3} for k in range(1, n + 1)]}), 10, 5
    assert na.weekly_line(store) == ""
    out = na.step(store, call=call, now=datetime(2026, 11, 13, 22, 30, tzinfo=timezone.utc))
    assert calls == [40, 40, 15] and out["classificate"] == 95 and out["giorni_di_storico"] == 4
    line = na.weekly_line(store, now=datetime(2026, 11, 13, 22, 30, tzinfo=timezone.utc))
    assert "95 titoli in 4 giorni" in line and "dazi 95" in line and "4/60" in line


def test_provider_and_calls(monkeypatch):
    assert na.provider() is None
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k-anthropic")
    assert na.provider() == ("anthropic", "k-anthropic", "claude-haiku-5-5")
    monkeypatch.setenv("OPENAI_API_KEY", "k-openai")
    monkeypatch.setenv("RADIX_NEWS_MODEL", "gpt-x")
    assert na.provider() == ("openai", "k-openai", "gpt-x")

    class R:
        def __init__(self, data):
            self._data = data

        def raise_for_status(self):
            pass

        def json(self):
            return self._data

    seen = {}

    def post_openai(url, **kw):
        seen["url"], seen["json"], seen["headers"] = url, kw["json"], kw["headers"]
        return R({"choices": [{"message": {"content": '{"items": []}'}}], "usage": {"prompt_tokens": 7, "completion_tokens": 2}})
    text, tin, tout = na.call_openai("k", "m", "sys", "usr", post=post_openai)
    assert (text, tin, tout) == ('{"items": []}', 7, 2)
    assert seen["url"].endswith("/chat/completions") and seen["json"]["model"] == "m"
    assert seen["json"]["response_format"] == {"type": "json_object"} and seen["headers"]["Authorization"] == "Bearer k"

    def post_anthropic(url, **kw):
        seen["url"], seen["json"], seen["headers"] = url, kw["json"], kw["headers"]
        return R({"content": [{"type": "text", "text": '{"items": [{"n": 1}]}'}], "usage": {"input_tokens": 11, "output_tokens": 3}})
    text, tin, tout = na.call_anthropic("k", "m", "sys", "usr", post=post_anthropic)
    assert (text, tin, tout) == ('{"items": [{"n": 1}]}', 11, 3)
    assert seen["url"].endswith("/v1/messages") and seen["json"]["system"] == "sys" and seen["headers"]["x-api-key"] == "k"
    # make_call sceglie il fornitore dalla terna
    call = na.make_call(("openai", "k", "m"), post=post_openai)
    assert call("a", "b")[0] == '{"items": []}'


def test_friday_report_line_appears_only_with_rows():
    from radix_trading import metodo60 as m60
    store = _store(TITLES)
    assert m60._news_agent_line(store) == ""
    na.step(store, call=fake_call, now=datetime(2026, 11, 13, 22, 30, tzinfo=timezone.utc))
    line = m60._news_agent_line(store)
    assert line.startswith(" Agente notizie") and "4 titoli in 2 giorni" in line


def test_segno_is_saved_and_old_tables_get_the_column():
    store = Store(":memory:")
    # tabella «vecchia» (14/11) senza la colonna segno: init la aggiunge
    store.conn.executescript("""CREATE TABLE news_llm (url TEXT PRIMARY KEY, day TEXT NOT NULL, ts TEXT NOT NULL, source TEXT,
        temi TEXT NOT NULL, intensita INTEGER NOT NULL, modello TEXT NOT NULL, quando TEXT NOT NULL);""")
    store.conn.execute("INSERT INTO news_llm VALUES ('https://x/old','2026-11-13','2026-11-13T10:00:00Z','cnbc_top','dazi',2,'m','2026-11-14T22:30:00Z')")
    store.conn.commit()
    na.init(store)
    assert store.conn.execute("SELECT segno FROM news_llm WHERE url='https://x/old'").fetchone() == (0,)
    store.upsert_news([{"url": f"https://x/{i}", "ts": ts, "title": t, "source": s, "language": "en", "country": "US", "query": None,
                        "sentiment": None} for i, (ts, t, s) in enumerate(TITLES[:2])])
    out = na.step(store, call=fake_call, now=datetime(2026, 11, 14, 22, 30, tzinfo=timezone.utc))
    assert out["classificate"] == 2
    rows = dict(store.conn.execute("SELECT url, segno FROM news_llm WHERE url LIKE 'https://x/_'").fetchall())
    assert rows == {"https://x/0": -1, "https://x/1": 0}
