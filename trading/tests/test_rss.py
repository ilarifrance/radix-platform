from datetime import datetime, timezone

import pytest

from radix_trading.collectors import rss
from radix_trading.store import Store

RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>Test Markets</title>
<item><title>Stocks slide as &amp;quot;oil prices&amp;quot; jump</title><link>https://example.com/a?id=1</link>
<pubDate>Tue, 10 Nov 2026 21:05:00 GMT</pubDate><description>x</description></item>
<item><title><![CDATA[Fed holds rates <b>steady</b>]]></title><link>https://example.com/b</link>
<pubDate>Tue, 10 Nov 2026 19:00:00 -0500</pubDate></item>
<item><title>No date here</title><link>https://example.com/c</link></item>
<item><title>No link here</title></item>
</channel></rss>"""

ATOM = """<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Press releases</title>
<entry><title>Federal Reserve issues FOMC statement</title><link rel="alternate" href="https://www.federalreserve.gov/x.htm"/>
<id>https://www.federalreserve.gov/x.htm</id><updated>2026-11-10T19:00:00Z</updated></entry>
<entry><title>Speech</title><link href="https://www.federalreserve.gov/y.htm"/><published>2026-11-10T14:30:00-05:00</published></entry>
</feed>"""


def test_parse_rss_items_dates_and_entities():
    now = datetime(2026, 11, 10, 22, 0, tzinfo=timezone.utc)
    items = rss.parse_feed(RSS, "cnbc_markets", "en", "US", now=now)
    assert [i["url"] for i in items] == ["https://example.com/a?id=1", "https://example.com/b", "https://example.com/c"]
    assert items[0]["title"] == 'Stocks slide as "oil prices" jump' and items[0]["ts"] == "2026-11-10T21:05:00Z"
    assert items[1]["title"] == "Fed holds rates steady" and items[1]["ts"] == "2026-11-11T00:00:00Z"   # -0500 -> UTC
    assert items[2]["ts"] == "2026-11-10T22:00:00Z"                                                    # senza data: ora della lettura
    assert items[0]["source"] == "cnbc_markets" and items[0]["query"] == "rss:cnbc_markets" and items[0]["language"] == "en"


def test_parse_atom_entries():
    items = rss.parse_feed(ATOM, "fed_press", "en", "US")
    assert len(items) == 2
    assert items[0]["url"] == "https://www.federalreserve.gov/x.htm" and items[0]["ts"] == "2026-11-10T19:00:00Z"
    assert items[1]["ts"] == "2026-11-10T19:30:00Z"


def test_bad_xml_is_an_error():
    with pytest.raises(RuntimeError):
        rss.parse_feed("<rss><channel>", "x")


def test_collect_saves_titles_and_isolates_a_failing_feed():
    class R:
        def __init__(self, text):
            self.text = text

    def fetch(url, timeout=20, user_agent=None):
        if "cnbc" in url:
            return R(RSS)
        if "federalreserve" in url:
            return R(ATOM)
        raise RuntimeError("giu'")

    st = Store(":memory:")
    report = rss.collect(st, feeds=("cnbc_top", "fed_press", "bbc_world"), fetch=fetch)
    assert report["cnbc_top"] == 3 and report["fed_press"] == 2 and report["bbc_world"].startswith("errore")
    news = st.load_news("2026-11-10T00:00:00Z")
    assert len(news) == 5 and set(news["query"]) == {"rss:cnbc_top", "rss:fed_press"}
    # lo stesso giro di nuovo: nessun doppione (chiave = url)
    rss.collect(st, feeds=("cnbc_top",), fetch=fetch)
    assert len(st.load_news("2026-11-10T00:00:00Z")) == 5
