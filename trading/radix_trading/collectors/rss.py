"""Notizie in tempo reale dai feed RSS/Atom gratuiti delle grandi testate (chiesto da Francesco il 10/11/2026).

L'archivio di Wikipedia arriva con un giorno di ritardo e GDELT concede una ricerca l'ora: per legare in fretta una
mossa di mercato (o un'operazione del conto Axi) a cio' che e' successo nel mondo servono i titoli di oggi. Ogni ora
il giro `hourly` scarica i feed qui sotto e salva i titoli nella tabella `news` (stessa forma di GDELT: la sentinella di
mercato e il diario Axi li leggono gia'). Un feed che non risponde non ferma gli altri. Niente chiavi, niente scraping:
solo gli RSS pubblici che le testate offrono.
"""

from __future__ import annotations

import html
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from .http import get

USER_AGENT = "RadixTrading/1.0 (personal research; RSS reader)"
# nome -> (url, lingua, paese della fonte)
FEEDS = {
    "cnbc_top": ("https://www.cnbc.com/id/100003114/device/rss/rss.html", "en", "US"),
    "cnbc_markets": ("https://www.cnbc.com/id/20910258/device/rss/rss.html", "en", "US"),
    "cnbc_economy": ("https://www.cnbc.com/id/10001147/device/rss/rss.html", "en", "US"),
    "marketwatch_top": ("https://feeds.content.dowjones.io/public/rss/mw_topstories", "en", "US"),
    "marketwatch_pulse": ("https://feeds.content.dowjones.io/public/rss/mw_marketpulse", "en", "US"),
    "yahoo_finance": ("https://finance.yahoo.com/news/rssindex", "en", "US"),
    "bbc_business": ("https://feeds.bbci.co.uk/news/business/rss.xml", "en", "GB"),
    "bbc_world": ("https://feeds.bbci.co.uk/news/world/rss.xml", "en", "GB"),
    "fed_press": ("https://www.federalreserve.gov/feeds/press_all.xml", "en", "US"),
    "ecb_press": ("https://www.ecb.europa.eu/rss/press.html", "en", "EU"),
    "aljazeera": ("https://www.aljazeera.com/xml/rss/all.xml", "en", "QA"),
    "ansa_economia": ("https://www.ansa.it/sito/notizie/economia/economia_rss.xml", "it", "IT"),
}
MAX_PER_FEED = 60
_TAG = re.compile(r"<[^>]+>")
_NS = re.compile(r"\{[^}]*\}")


def _text(el) -> str:
    if el is None:
        return ""
    t = el.text or ""
    if not t.strip() and len(el):          # titoli con contenuto HTML annidato
        t = "".join(el.itertext())
    return html.unescape(_TAG.sub("", t)).strip()


def _when(s: str) -> datetime | None:
    s = (s or "").strip()
    if not s:
        return None
    try:
        t = parsedate_to_datetime(s)               # RFC 822: «Tue, 10 Nov 2026 21:05:00 GMT»
    except (TypeError, ValueError):
        try:
            t = datetime.fromisoformat(s.replace("Z", "+00:00"))    # Atom / Dublin Core: ISO 8601
        except ValueError:
            return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t.astimezone(timezone.utc)


def parse_feed(xml_text: str, name: str, language: str | None = None, country: str | None = None,
               now: datetime | None = None) -> list[dict]:
    """Voci di un feed RSS 2.0 o Atom nella forma della tabella `news`. Le voci senza data prendono l'ora della lettura."""
    now = now or datetime.now(timezone.utc)
    try:
        root = ET.fromstring(xml_text.strip())
    except ET.ParseError:
        raise RuntimeError(f"{name}: feed non leggibile (XML non valido)") from None
    items = []
    for el in root.iter():
        tag = _NS.sub("", el.tag)
        if tag not in ("item", "entry"):
            continue
        fields = {_NS.sub("", c.tag): c for c in el}
        title = _text(fields.get("title"))
        link_el = fields.get("link")
        link = _text(link_el) if link_el is not None and (link_el.text or "").strip() else (link_el.get("href") if link_el is not None else "")
        if not link:
            link = _text(fields.get("guid")) or _text(fields.get("id"))
        if not title or not link or not link.startswith("http"):
            continue
        when = None
        for k in ("pubDate", "published", "updated", "date"):
            when = _when(_text(fields.get(k)))
            if when:
                break
        when = when or now
        items.append({"url": link, "ts": when.strftime("%Y-%m-%dT%H:%M:%SZ"), "title": title[:300], "source": name,
                      "language": language, "country": country, "query": f"rss:{name}", "sentiment": None})
        if len(items) >= MAX_PER_FEED:
            break
    return items


def fetch_feed(name: str, fetch=get) -> list[dict]:
    url, language, country = FEEDS[name]
    r = fetch(url, timeout=20, user_agent=USER_AGENT)
    return parse_feed(r.text, name, language, country)


def collect(store, feeds=None, fetch=get) -> dict:
    """Scarica tutti i feed e salva i titoli nuovi; torna quante voci per feed (o l'errore)."""
    report: dict[str, object] = {}
    for name in (feeds or FEEDS):
        try:
            items = fetch_feed(name, fetch)
            store.upsert_news(items)
            report[name] = len(items)
        except Exception as e:      # una testata giu' non ferma le altre
            report[name] = f"errore: {e}"
    return report
