"""Notizie globali e geopolitiche da GDELT (gratuito, aggiornato ogni 15 minuti).

Il sentiment non viene calcolato qui: lo assegna l'agente di analisi testi.
"""

from __future__ import annotations

from datetime import datetime, timezone

from .http import get

API = "https://api.gdeltproject.org/api/v2/doc/doc"
DEFAULT_QUERIES = (
    '"interest rates" OR "central bank" OR inflation',
    "sanctions OR tariffs OR war OR ceasefire",
    "bitcoin OR crypto OR stablecoin",
    "recession OR earnings OR layoffs",
)


def parse_artlist(payload: dict, query: str) -> list[dict]:
    items = []
    for a in payload.get("articles", []):
        seen = datetime.strptime(a["seendate"], "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        items.append(
            {
                "url": a["url"],
                "ts": seen.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "title": a.get("title"),
                "source": a.get("domain"),
                "language": a.get("language"),
                "country": a.get("sourcecountry"),
                "query": query,
                "sentiment": None,
            }
        )
    return items


def fetch_articles(query: str, timespan: str = "1h", max_records: int = 100) -> list[dict]:
    params = {
        "query": query,
        "mode": "artlist",
        "format": "json",
        "maxrecords": max_records,
        "timespan": timespan,
        "sort": "datedesc",
    }
    return parse_artlist(get(API, params).json(), query)
