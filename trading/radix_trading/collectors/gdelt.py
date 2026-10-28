"""Notizie globali e geopolitiche da GDELT (gratuito, aggiornato ogni 15 minuti).

Il sentiment non viene calcolato qui: lo assegna l'agente di analisi testi.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone

from .http import get

API = "https://api.gdeltproject.org/api/v2/doc/doc"
# GDELT vuole le alternative OR tra parentesi.
DEFAULT_QUERIES = (
    '("interest rates" OR "central bank" OR inflation)',
    "(sanctions OR tariffs OR war OR ceasefire)",
    "(bitcoin OR crypto OR stablecoin)",
    "(recession OR earnings OR layoffs)",
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
    r = get(API, params, rate_limit_wait=8.0)
    try:
        payload = r.json()
    except json.JSONDecodeError:
        # GDELT a volte risponde con testo (es. limite di frequenza) anche con codice 200.
        raise RuntimeError(f"GDELT: risposta non JSON: {r.text[:120]!r}") from None
    return parse_artlist(payload, query)


def fetch_all(queries=DEFAULT_QUERIES, pause: float = 6.0) -> tuple[list[dict], dict]:
    """Tutte le ricerche, distanziate: GDELT accetta al massimo una richiesta ogni 5 secondi."""
    items, report = [], {}
    for i, q in enumerate(queries):
        if i:
            time.sleep(pause)
        try:
            got = fetch_articles(q)
            items += got
            report[q[:30]] = len(got)
        except Exception as e:
            report[q[:30]] = f"errore: {e}"
    return items, report
