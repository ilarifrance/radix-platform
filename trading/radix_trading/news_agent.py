"""Agente notizie: un modello di linguaggio legge i titoli delle testate (RSS e GDELT, tabella `news`, dal 3/11/2026)
e li classifica nelle famiglie di `events.THEMES` con un'intensita' da 0 a 3. E' SOLO un classificatore: non decide
niente e non tocca le corsie del metodo 60%, i cui parametri sono congelati fino al cancello del 23/12/2026.

Scopo (Francesco, 14/11/2026: «implementa quello che ci serviva»): costruire giorno per giorno una seconda fonte di
«notizia forte», indipendente da Wikipedia, da confrontare con la corsia «+ notizie» quando lo storico avra' ~60 giorni
(gennaio 2027), con il controllo a date spostate come per ogni altro filtro. I conteggi per giorno e tema
(`theme_counts`) hanno la stessa forma di `events.theme_counts`, cosi' `events.news_events` ci gira sopra senza modifiche.

Chiave: OPENAI_API_KEY oppure ANTHROPIC_API_KEY in ~/RadixTrading/.env (la inserisce Francesco, mai nel repository, mai in
chat). Senza chiave il passo non fa nulla e lo dice. Le chiamate usano `requests` (nessun pacchetto in piu'), titoli in
lotti di 40, modello piccolo (RADIX_NEWS_MODEL per cambiarlo): qualche centesimo al giorno. I piu' recenti si
classificano per primi, l'arretrato (dal 3/11) si smaltisce in pochi giri con un tetto per giro; i titoli piu' vecchi del 3/11 si ignorano.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

import pandas as pd
import requests

from . import events
from .config import env_value
from .store import Store

BATCH = 40                  # titoli per chiamata
MAX_PER_RUN = 4000          # titoli per giro (~100 chiamate): l'arretrato dal 3/11 (~12.000 titoli il 14/11) si smaltisce in 3 sere
SINCE = "2026-11-03"        # i titoli delle testate si raccolgono da questo giorno: quelli sparsi piu' vecchi non servono
STRONG = 2                  # intensita' minima per contare un titolo come «notizia forte» nei conteggi per giorno
WARMUP_DAYS = 60            # giorni di storico prima del confronto con Wikipedia
TIMEOUT = 90
DEFAULT_MODELS = {"openai": "gpt-4o-mini", "anthropic": "claude-haiku-5-5"}
# prezzi stimati per milione di token (USD), modificabili da .env: solo per la riga «costo stimato» del rapporto
PRICE_IN, PRICE_OUT = 0.15, 0.60

SCHEMA = """
CREATE TABLE IF NOT EXISTS news_llm (url TEXT PRIMARY KEY, day TEXT NOT NULL, ts TEXT NOT NULL, source TEXT,
    temi TEXT NOT NULL, intensita INTEGER NOT NULL, modello TEXT NOT NULL, quando TEXT NOT NULL,
    segno INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS news_llm_day ON news_llm(day);
CREATE TABLE IF NOT EXISTS news_llm_runs (quando TEXT PRIMARY KEY, classificate INTEGER NOT NULL, chiamate INTEGER NOT NULL,
    token_in INTEGER NOT NULL, token_out INTEGER NOT NULL, modello TEXT NOT NULL, errori INTEGER NOT NULL);
"""

# Descrizioni brevi delle famiglie (le chiavi sono quelle di events.THEMES, cosi' i conteggi sono confrontabili).
THEME_HELP = {
    "dazi": "tariffs, trade war, export controls, trade deals",
    "trump": "Donald Trump (statements, decisions, legal cases)",
    "guerra": "war, invasion, airstrikes, missile or drone attacks, military offensives",
    "tregua": "ceasefire, truce, peace talks or peace deal",
    "sanzioni": "economic sanctions",
    "petrolio": "oil, OPEC, crude, gasoline, energy supply",
    "fed_tassi": "Federal Reserve, ECB, other central banks, interest rates",
    "inflazione": "inflation, consumer prices, CPI",
    "crisi_banche": "bank failure or run, bankruptcy, default, insolvency, credit stress",
    "big_tech": "Nvidia, Apple, Microsoft, Tesla, Amazon, Alphabet/Google, Meta, OpenAI, TSMC",
    "cina": "China, Taiwan, Beijing (politics, economy, military)",
    "medio_oriente": "Iran, Israel, Gaza, Hezbollah, Houthis, Hormuz, Red Sea, Saudi Arabia",
    "russia_ucraina": "Russia, Ukraine",
    "elezioni": "elections and election results",
    "epidemie": "pandemic, epidemic, disease outbreak",
    "borse": "stock markets themselves: sell-off, crash, record, index moves, market turmoil",
}

SYSTEM = (
    "You classify news headlines for a market-research archive. For each headline return the themes it belongs to, "
    "chosen ONLY from this list of keys: " + ", ".join(f"{k} ({v})" for k, v in THEME_HELP.items()) + ". "
    "A headline may have several themes or none. Also give an intensity from 0 to 3 for financial markets: "
    "0 = not relevant to markets or routine (sport, celebrities, local news, opinion, how-to); "
    "1 = relevant but ordinary (scheduled data as expected, commentary, analyst notes, routine politics); "
    "2 = a significant new development (surprise data, policy change, escalation, big corporate shock); "
    "3 = a shock that moves whole markets (war escalation or attack on a major country, bank failure, surprise tariff "
    "wall, market crash, pandemic declared, major default). Also give a sign for US stock markets: -1 if the news is "
    "bad for stocks (risk-off), +1 if good for stocks (risk-on), 0 if neutral or unclear. Judge only the headline text. "
    "Answer with JSON only, in this exact shape: {\"items\": [{\"n\": <headline number>, \"temi\": [<keys>], "
    "\"intensita\": <0-3>, \"segno\": <-1|0|1>}, ...]}, one entry per headline, in order."
)


def init(store: Store) -> None:
    store.conn.executescript(SCHEMA)
    # 15/11: colonna «segno» (-1 male per le borse, +1 bene) sulle tabelle gia' create prima
    if "segno" not in {r[1] for r in store.conn.execute("PRAGMA table_info(news_llm)")}:
        store.conn.execute("ALTER TABLE news_llm ADD COLUMN segno INTEGER NOT NULL DEFAULT 0")
        store.conn.commit()


# --- chiave e modello -----------------------------------------------------------------------------

def provider() -> tuple[str, str, str] | None:
    """(fornitore, chiave, modello) dalla .env; None se non c'e' nessuna chiave."""
    for name, key_var in (("openai", "OPENAI_API_KEY"), ("anthropic", "ANTHROPIC_API_KEY")):
        key = env_value(key_var)
        if key:
            return name, key, env_value("RADIX_NEWS_MODEL") or DEFAULT_MODELS[name]
    return None


def call_openai(key: str, model: str, system: str, user: str, post=requests.post) -> tuple[str, int, int]:
    r = post("https://api.openai.com/v1/chat/completions", timeout=TIMEOUT,
             headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
             json={"model": model, "temperature": 0, "response_format": {"type": "json_object"},
                   "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
    r.raise_for_status()
    data = r.json()
    usage = data.get("usage") or {}
    return data["choices"][0]["message"]["content"], int(usage.get("prompt_tokens", 0)), int(usage.get("completion_tokens", 0))


def call_anthropic(key: str, model: str, system: str, user: str, post=requests.post) -> tuple[str, int, int]:
    r = post("https://api.anthropic.com/v1/messages", timeout=TIMEOUT,
             headers={"x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
             json={"model": model, "max_tokens": 4000, "temperature": 0, "system": system,
                   "messages": [{"role": "user", "content": user}]})
    r.raise_for_status()
    data = r.json()
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    usage = data.get("usage") or {}
    return text, int(usage.get("input_tokens", 0)), int(usage.get("output_tokens", 0))


def make_call(prov: tuple[str, str, str], post=requests.post):
    """Chiusura `call(system, user) -> (testo, token_in, token_out)` per il fornitore scelto."""
    name, key, model = prov
    fn = call_openai if name == "openai" else call_anthropic
    return lambda system, user: fn(key, model, system, user, post)


# --- titoli da classificare e lettura della risposta -------------------------------------------

def pending(store: Store, limit: int = MAX_PER_RUN) -> list[dict]:
    """Titoli in `news` non ancora classificati, i piu' recenti per primi (oggi prima dell'arretrato)."""
    init(store)
    rows = store.conn.execute(
        "SELECT n.url, n.ts, n.title, n.source FROM news n LEFT JOIN news_llm c ON c.url = n.url "
        "WHERE c.url IS NULL AND n.ts >= ? AND n.title IS NOT NULL AND length(trim(n.title)) >= 12 ORDER BY n.ts DESC LIMIT ?",
        (SINCE, int(limit))).fetchall()
    return [{"url": u, "ts": ts, "title": t.strip(), "source": s} for u, ts, t, s in rows]


def user_text(items: list[dict]) -> str:
    lines = [f"{i}. [{it.get('source') or '?'}] {it['title'][:300]}" for i, it in enumerate(items, 1)]
    return f"Classify these {len(items)} headlines:\n" + "\n".join(lines)


_JSON = re.compile(r"\{.*\}", re.S)


def parse(text: str, n: int) -> dict[int, tuple[list[str], int, int]]:
    """Dalla risposta del modello: {numero: (temi validi, intensita' 0-3, segno -1/0/+1)}. Voci mancanti o rotte si saltano
    (restano «da classificare» e si riprovano al giro dopo)."""
    m = _JSON.search(text or "")
    if not m:
        return {}
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return {}
    out: dict[int, tuple[list[str], int, int]] = {}
    for it in data.get("items", []) if isinstance(data, dict) else []:
        try:
            k = int(it.get("n"))
        except (TypeError, ValueError, AttributeError):
            continue
        if not 1 <= k <= n:
            continue
        temi = [t for t in (it.get("temi") or []) if isinstance(t, str) and t in events.THEMES]
        try:
            inten = max(0, min(3, int(it.get("intensita", 0))))
        except (TypeError, ValueError):
            inten = 0
        try:
            segno = max(-1, min(1, int(it.get("segno", 0) or 0)))
        except (TypeError, ValueError):
            segno = 0
        out[k] = (sorted(set(temi)), inten, segno)
    return out


def classify(items: list[dict], call, batch: int = BATCH) -> tuple[list[dict], dict]:
    """Classifica a lotti. Torna le righe pronte per l'archivio e il conto di chiamate, token ed errori.
    Un errore di rete o del fornitore ferma il giro (si riprende al prossimo) e si conta."""
    rows: list[dict] = []
    usage = {"chiamate": 0, "token_in": 0, "token_out": 0, "errori": 0, "errore": None}
    for start in range(0, len(items), batch):
        lot = items[start:start + batch]
        try:
            text, tin, tout = call(SYSTEM, user_text(lot))
        except Exception as e:  # noqa: BLE001 - una chiamata fallita non deve far cadere il daily
            usage["errori"] += 1
            usage["errore"] = f"{type(e).__name__}: {e}"[:300]
            break
        usage["chiamate"] += 1
        usage["token_in"] += tin
        usage["token_out"] += tout
        got = parse(text, len(lot))
        for k, (temi, inten, segno) in got.items():
            it = lot[k - 1]
            rows.append({"url": it["url"], "day": it["ts"][:10], "ts": it["ts"], "source": it.get("source"),
                         "temi": ",".join(temi), "intensita": inten, "segno": segno})
    return rows, usage


def save(store: Store, rows: list[dict], model: str, when: str) -> int:
    init(store)
    store.conn.executemany("INSERT OR REPLACE INTO news_llm VALUES (?,?,?,?,?,?,?,?,?)",
                           [(r["url"], r["day"], r["ts"], r["source"], r["temi"], r["intensita"], model, when, r.get("segno", 0)) for r in rows])
    store.conn.commit()
    return len(rows)


def estimated_cost_usd(token_in: int, token_out: int) -> float:
    pin = float(env_value("RADIX_NEWS_PRICE_IN") or PRICE_IN)
    pout = float(env_value("RADIX_NEWS_PRICE_OUT") or PRICE_OUT)
    return round((token_in * pin + token_out * pout) / 1e6, 4)


def step(store: Store, limit: int = MAX_PER_RUN, call=None, now: datetime | None = None, prov=None) -> dict:
    """Il passo del daily: classifica i titoli nuovi (e un pezzo di arretrato), salva, riassume.
    Senza chiave non fa nulla. `call` e `prov` si passano nei test."""
    init(store)
    prov = prov or provider()
    if prov is None and call is None:
        return {"saltato": "manca OPENAI_API_KEY o ANTHROPIC_API_KEY in ~/RadixTrading/.env: nessun titolo classificato",
                "arretrato": count_pending(store)}
    model = prov[2] if prov else "test"
    call = call or make_call(prov)
    when = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
    items = pending(store, limit)
    rows, usage = classify(items, call)
    n = save(store, rows, model, when)
    store.conn.execute("INSERT OR REPLACE INTO news_llm_runs VALUES (?,?,?,?,?,?,?)",
                       (when, n, usage["chiamate"], usage["token_in"], usage["token_out"], model, usage["errori"]))
    store.conn.commit()
    out = {"classificate": n, "chiamate": usage["chiamate"], "token_in": usage["token_in"], "token_out": usage["token_out"],
           "costo_stimato_usd": estimated_cost_usd(usage["token_in"], usage["token_out"]), "modello": model,
           "arretrato": count_pending(store), "giorni_di_storico": days_covered(store),
           "oggi_forti": strong_today(store, when[:10])}
    if usage["errore"]:
        out["errore"] = usage["errore"]
    return out


def count_pending(store: Store) -> int:
    init(store)
    return int(store.conn.execute(
        "SELECT count(*) FROM news n LEFT JOIN news_llm c ON c.url = n.url "
        "WHERE c.url IS NULL AND n.ts >= ? AND n.title IS NOT NULL AND length(trim(n.title)) >= 12", (SINCE,)).fetchone()[0])


# --- conteggi per giorno e tema (stessa forma di events.theme_counts) -------------------------

def theme_counts(store: Store, min_intensity: int = STRONG) -> pd.DataFrame:
    """Per ogni giorno (UTC) quanti titoli di intensita' >= `min_intensity` toccano ciascuna famiglia.
    Tutti i giorni dal primo all'ultimo classificato, anche quelli a zero: `events.news_events` ci gira sopra."""
    init(store)
    rows = store.conn.execute("SELECT day, temi FROM news_llm WHERE intensita >= ? AND temi != ''", (int(min_intensity),)).fetchall()
    span = store.conn.execute("SELECT min(day), max(day) FROM news_llm").fetchone()
    if not span or span[0] is None:
        return pd.DataFrame(columns=list(events.THEMES))
    days = pd.date_range(span[0], span[1], freq="D")
    counts = pd.DataFrame(0, index=days, columns=list(events.THEMES))
    for day, temi in rows:
        for t in temi.split(","):
            if t in counts.columns:
                counts.at[pd.Timestamp(day), t] += 1
    return counts


def days_covered(store: Store) -> int:
    init(store)
    return int(store.conn.execute("SELECT count(DISTINCT day) FROM news_llm").fetchone()[0])


def strong_today(store: Store, day: str) -> dict[str, int]:
    """Famiglie con titoli di intensita' 3 nel giorno (UTC) indicato, con il conteggio."""
    init(store)
    out: dict[str, int] = {}
    for (temi,) in store.conn.execute("SELECT temi FROM news_llm WHERE day = ? AND intensita >= 3 AND temi != ''", (day,)):
        for t in temi.split(","):
            out[t] = out.get(t, 0) + 1
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


def weekly_line(store: Store, now: datetime | None = None) -> str:
    """Una riga per il riepilogo del venerdi': quanto storico c'e' e quali famiglie hanno fatto notizia forte
    nella settimana. Vuota finche' non c'e' nulla di classificato."""
    init(store)
    total = int(store.conn.execute("SELECT count(*) FROM news_llm").fetchone()[0])
    if not total:
        return ""
    now = now or datetime.now(timezone.utc)
    since = (now - pd.Timedelta(days=7)).strftime("%Y-%m-%d")
    week: dict[str, int] = {}
    for (temi,) in store.conn.execute("SELECT temi FROM news_llm WHERE day >= ? AND intensita >= 3 AND temi != ''", (since,)):
        for t in temi.split(","):
            week[t] = week.get(t, 0) + 1
    top = ", ".join(f"{t} {n}" for t, n in sorted(week.items(), key=lambda kv: -kv[1])[:4]) or "nessuna"
    days = days_covered(store)
    return (f"Agente notizie (titoli delle testate letti da un modello, solo osservazione): {total} titoli in {days} giorni; "
            f"notizie forti della settimana: {top}; confronto con Wikipedia dopo {WARMUP_DAYS} giorni ({days}/{WARMUP_DAYS}).")
