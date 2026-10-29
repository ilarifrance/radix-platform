"""Date delle decisioni della Fed (riunioni FOMC) dal sito della Federal Reserve.

FRED non ha un calendario delle riunioni: le "date di uscita" del comunicato FOMC su FRED sono
quasi tutti i giorni (le serie collegate si aggiornano ogni giorno). Qui si leggono le pagine
ufficiali: il calendario degli ultimi anni e le pagine storiche anno per anno. Il giorno della
decisione e' l'ultimo della riunione (comunicato alle 14:00 di New York). Le riunioni straordinarie
e i voti per iscritto ("notation vote") non hanno l'orario fisso e si escludono.
"""

from __future__ import annotations

import html
import re
from datetime import date

from .http import BROWSER_UA, get

CALENDAR = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
HISTORICAL = "https://www.federalreserve.gov/monetarypolicy/fomchistorical{year}.htm"
MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                       "september", "october", "november", "december"], 1)}
_MON = r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
_ENTRY = re.compile(_MON + r"(?:/" + _MON + r")?\s+(\d{1,2})(?:\s*-\s*(\d{1,2}))?(\*?)\s*(\((?:notation vote|unscheduled)\))?", re.I)


def _month(name: str) -> int:
    name = name.lower()
    return next(v for k, v in MONTHS.items() if k.startswith(name[:3]))


def text_of(page: str) -> str:
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", page, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", html.unescape(t))


def _entries(segment: str, year: int) -> list[date]:
    out = []
    for m in _ENTRY.finditer(segment):
        if m.group(6):  # straordinaria o voto per iscritto
            continue
        before, after = segment[max(0, m.start() - 25):m.start()].lower(), segment[m.end():m.end() + 7]
        if "released" in before or "minutes" in before or re.match(r",?\s*\d{4}", after):
            continue  # date di uscita dei verbali, non riunioni
        month = _month(m.group(2) or m.group(1))
        day = int(m.group(4) or m.group(3))
        try:
            out.append(date(year, month, day))
        except ValueError:
            continue
    return out


def parse_calendar(page: str) -> list[date]:
    """Pagina del calendario: una sezione «2025 FOMC Meetings» per anno."""
    t = text_of(page)
    parts = re.split(r"(\d{4}) FOMC Meetings", t)
    out = []
    for i in range(1, len(parts) - 1, 2):
        out += _entries(parts[i + 1], int(parts[i]))
    return sorted(set(out))


def parse_historical(page: str, year: int) -> list[date]:
    """Pagina storica di un anno: titoli tipo «January 26-27 Meeting»."""
    t = text_of(page)
    out = []
    for m in re.finditer(_MON + r"(?:/" + _MON + r")?\s+(\d{1,2})(?:\s*-\s*(\d{1,2}))?,?\s*(?:" + str(year) + r")?\s*(?:FOMC\s+)?Meeting",
                         t, re.I):
        month = _month(m.group(2) or m.group(1))
        try:
            out.append(date(year, month, int(m.group(4) or m.group(3))))
        except ValueError:
            continue
    return sorted(set(out))


def fetch(start_year: int = 2015) -> tuple[list[date], dict]:
    """Tutte le decisioni dal `start_year`. Torna anche quante per anno, per controllo (attese 8)."""
    days = set(parse_calendar(get(CALENDAR, user_agent=BROWSER_UA).text))
    have = {d.year for d in days}
    errors = {}
    for y in range(start_year, date.today().year + 1):
        if y in have:
            continue
        try:
            days |= set(parse_historical(get(HISTORICAL.format(year=y), user_agent=BROWSER_UA).text, y))
        except Exception as e:  # un anno che manca non ferma gli altri
            errors[y] = str(e)[:120]
    per_year = {}
    for d in days:
        per_year[d.year] = per_year.get(d.year, 0) + 1
    return sorted(d for d in days if d.year >= start_year), {"per_anno": dict(sorted(per_year.items())), "errori": errors}
