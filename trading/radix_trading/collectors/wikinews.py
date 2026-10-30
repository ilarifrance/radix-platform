"""Archivio storico gratuito delle notizie: Wikipedia, «Portal:Current events», una pagina al giorno.

Ogni giorno ha le notizie divise per sezione (conflitti, economia, politica, relazioni internazionali...),
scritte e verificate dai volontari, dal 2004 a oggi. Si scaricano 50 giorni per richiesta.
Le regole di Wikipedia chiedono un user-agent che dica chi siamo e poche richieste ravvicinate.
"""

from __future__ import annotations

import re
from datetime import date

from .http import get

API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "RadixTrading/1.0 (personal research; contact via radix-platform.vercel.app)"
BATCH = 50

_REF = re.compile(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", re.S | re.I)
_COMMENT = re.compile(r"<!--.*?-->", re.S)
_TEMPLATE = re.compile(r"\{\{[^{}]*\}\}")
_LINK = re.compile(r"\[\[(?:[^\[\]|]*\|)?([^\[\]]*)\]\]")
_EXT = re.compile(r"\[https?://\S+\s*([^\]]*)\]")
_HEADER = re.compile(r"^(?:'''(.+?)'''|;\s*(.+))\s*$")


def title_for(d: date) -> str:
    return f"Portal:Current events/{d.year} {d.strftime('%B')} {d.day}"


def date_of(title: str) -> date | None:
    m = re.match(r"Portal:Current events/(\d{4}) (\w+) (\d{1,2})$", title)
    if not m:
        return None
    from datetime import datetime
    try:
        return datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%Y %B %d").date()
    except ValueError:
        return None


def clean(text: str) -> str:
    t = _COMMENT.sub("", _REF.sub("", text))
    for _ in range(3):  # template annidati
        t2 = _TEMPLATE.sub("", t)
        if t2 == t:
            break
        t = t2
    t = _LINK.sub(r"\1", t)
    t = _EXT.sub(r"\1", t)
    t = t.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", t).strip(" *:")


def parse_day(wikitext: str) -> list[dict]:
    """Notizie del giorno: sezione e testo. Le righe annidate ereditano l'argomento della riga sopra
    (es. «Guerra in Ucraina: la Russia lancia...»), cosi' la classificazione ha il contesto."""
    items, section, parents = [], "", {}
    for raw in wikitext.splitlines():
        line = raw.strip()
        h = _HEADER.match(line)
        if h and not line.startswith("*"):
            section = clean(h.group(1) or h.group(2))
            parents = {}
            continue
        if not line.startswith("*"):
            continue
        depth = len(line) - len(line.lstrip("*"))
        text = clean(line[depth:])
        if not text:
            continue
        parents[depth] = text
        for k in [k for k in parents if k > depth]:
            del parents[k]
        context = [parents[k] for k in sorted(parents) if k < depth]
        items.append({"sezione": section, "testo": " — ".join(context + [text]), "livello": depth})
    # tengo solo le righe "foglia" (la notizia vera), non i soli titoli degli argomenti
    leaves = [it for i, it in enumerate(items)
              if not (i + 1 < len(items) and items[i + 1]["livello"] > it["livello"])]
    return [{"sezione": it["sezione"], "testo": it["testo"]} for it in leaves]


def fetch_days(days: list[date]) -> dict[date, list[dict]]:
    """Notizie di fino a 50 giorni con una sola richiesta. I giorni senza pagina tornano vuoti."""
    out: dict[date, list[dict]] = {d: [] for d in days}
    for i in range(0, len(days), BATCH):
        chunk = days[i:i + BATCH]
        params = {"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                  "format": "json", "formatversion": "2", "titles": "|".join(title_for(d) for d in chunk)}
        data = get(API, params, user_agent=USER_AGENT).json()
        for page in data.get("query", {}).get("pages", []):
            d = date_of(page.get("title", ""))
            revs = page.get("revisions") or []
            if d is None or not revs:
                continue
            content = revs[0].get("slots", {}).get("main", {}).get("content") or revs[0].get("content") or ""
            out[d] = parse_day(content)
    return out
