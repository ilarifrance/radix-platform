"""Osservatorio notizie al minuto: misura, senza ordini, cosa fanno i mercati nei minuti dopo un titolo forte.

Chiesto da Francesco il 15/11/2026 («dovrebbe leggerli non dico ogni minuto ma quasi e agire di conseguenza»).
Prima di far agire qualcosa sui titoli si misura se c'e' qualcosa da prendere: la prima gamba la fanno gli algoritmi
in millisecondi, i feed gratuiti arrivano con minuti di ritardo e, per le notizie programmate al minuto (CPI, lavoro,
Fed), nessuna regola ha retto (144 prove). Qui, per 4-6 settimane:

1. ogni giro (`osservatorio-notizie`: ogni 5 minuti sul server, ogni ora dentro `hourly` sul Mac) si scaricano i titoli
   nuovi (RSS tutti i feed, GDELT una ricerca a rotazione), l'agente notizie li classifica subito se c'e' la chiave
   (i nuovi per primi, poi un pezzo di arretrato) e si registra il prezzo corrente di S&P 500 e Nasdaq (future, Yahoo),
   BTC, ETH e oro (Kraken, 24 ore su 24; l'oro e' il token PAXG, un'oncia);
2. ogni titolo forte (intensita' >= 2) visto entro 3 ore dalla pubblicazione apre un'osservazione: l'ora in cui lo
   abbiamo visto, il ritardo dalla pubblicazione, il segno dato dal modello (-1 male per le borse, +1 bene); le mosse a
   +5, +15 e +60 minuti si leggono dai prezzi registrati nei giri successivi;
3. il rapporto (`--rapporto`, piu' una riga nel riepilogo del venerdi') confronta la mossa dopo i titoli con il
   controllo a orario spostato (stessa ora, 1-3 giorni prima e dopo): quante volte nel verso della notizia, mossa media
   nel verso, ampiezza. Se dopo i costi non resta niente, non si costruisce nessun automatismo.

Nessun ordine, nessun euro: solo tabelle. Le corsie del metodo 60% non cambiano. Senza chiave si registrano comunque
i prezzi (servono al controllo) e il giro dice che la classificazione e' saltata.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from . import news_agent
from .collectors import gdelt, kraken, rss, yahoo
from .config import env_value
from .store import Store

HORIZONS = (5, 15, 60)          # minuti
TOLERANCE = 4                   # minuti: il prezzo «a +h» e' il primo registrato tra h e h+4 (giri ogni 5 minuti)
FRESH_MIN = 180                 # un titolo apre un'osservazione solo se lo vediamo entro 3 ore dalla pubblicazione
FAST_MIN = 15                   # «titoli freschi»: visti entro 15 minuti dalla pubblicazione
PER_RUN = 200                   # titoli classificati per giro (5 chiamate): i nuovi prima, poi un pezzo di arretrato
SHIFTS = (-3, -2, -1, 1, 2, 3)  # giorni del controllo a orario spostato
VERDICT_AFTER = "4-6 settimane"
FLAG_FILE = "OSSERVATORIO_NOTIZIE"   # nella cartella dati: finche' manca, il giro `hourly` del Mac non fa l'osservatorio

# nome -> (fonte, codice)
MARKETS = {
    "sp500": ("yahoo", "ES=F"),
    "nasdaq": ("yahoo", "NQ=F"),
    "btc": ("kraken", "XBTEUR"),
    "eth": ("kraken", "ETHEUR"),
    "oro": ("kraken", "PAXGUSD"),
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS news_watch_prices (ts TEXT NOT NULL, simbolo TEXT NOT NULL, prezzo REAL NOT NULL,
    PRIMARY KEY (ts, simbolo));
CREATE TABLE IF NOT EXISTS news_watch_events (url TEXT PRIMARY KEY, visto TEXT NOT NULL, ts TEXT NOT NULL,
    ritardo_min INTEGER NOT NULL, temi TEXT NOT NULL, intensita INTEGER NOT NULL, segno INTEGER NOT NULL,
    titolo TEXT, source TEXT);
CREATE INDEX IF NOT EXISTS news_watch_events_visto ON news_watch_events(visto);
CREATE TABLE IF NOT EXISTS news_watch_runs (quando TEXT PRIMARY KEY, titoli INTEGER NOT NULL, classificate INTEGER NOT NULL,
    osservazioni INTEGER NOT NULL, prezzi INTEGER NOT NULL, note TEXT);
"""


def init(store: Store) -> None:
    news_agent.init(store)
    store.conn.executescript(SCHEMA)


def flag_file(store: Store) -> Path:
    return Path(store.path).parent / FLAG_FILE


def enabled(store: Store) -> bool:
    """Acceso: file OSSERVATORIO_NOTIZIE nella cartella dati (`osservatorio-notizie --accendi`) oppure
    RADIX_OSSERVATORIO_NOTIZIE=si nell'ambiente (server). Il comando esplicito gira sempre; qui si decide solo l'hourly."""
    return flag_file(store).exists() or (env_value("RADIX_OSSERVATORIO_NOTIZIE") or "").strip().lower() in ("si", "sì", "1", "true")


def switch(store: Store, on: bool) -> dict:
    f = flag_file(store)
    if on:
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(f"acceso il {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC\n")
    elif f.exists():
        f.unlink()
    return {"osservatorio": "acceso" if on else "spento", "file": str(f)}


def _minute(t: datetime) -> str:
    return t.astimezone(timezone.utc).replace(second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


# --- prezzi -----------------------------------------------------------------------------------------

def fetch_prices(markets: dict = MARKETS, fetch_yahoo=yahoo.fetch_quote, fetch_kraken=kraken.fetch_ticker) -> tuple[dict, dict]:
    """Prezzo corrente di ogni mercato; una fonte giu' non ferma le altre. Torna (prezzi, errori)."""
    prices: dict[str, float] = {}
    errors: dict[str, str] = {}
    for name, (source, code) in markets.items():
        try:
            prices[name] = float(fetch_kraken(code) if source == "kraken" else fetch_yahoo(code)["price"])
        except Exception as e:  # noqa: BLE001
            errors[name] = f"{type(e).__name__}: {e}"[:200]
    return prices, errors


def save_prices(store: Store, when: str, prices: dict[str, float]) -> int:
    init(store)
    store.conn.executemany("INSERT OR REPLACE INTO news_watch_prices VALUES (?,?,?)",
                           [(when, k, float(v)) for k, v in prices.items() if v and math.isfinite(v)])
    store.conn.commit()
    return len(prices)


# --- titoli ------------------------------------------------------------------------------------------

def collect_headlines(store: Store, now: datetime) -> dict:
    """Tutti i feed RSS e una ricerca GDELT a rotazione (una ogni 5 minuti: ogni tema torna ogni 20)."""
    report: dict = {"rss": sum(v for v in rss.collect(store).values() if isinstance(v, int))}
    q = gdelt.DEFAULT_QUERIES[(int(now.timestamp()) // 300) % len(gdelt.DEFAULT_QUERIES)]
    try:
        items = gdelt.fetch_articles(q)
        store.upsert_news(items)
        report["gdelt"] = len(items)
    except Exception as e:  # noqa: BLE001
        report["gdelt"] = f"errore: {e}"[:200]
    return report


def open_observations(store: Store, when: str, now: datetime) -> int:
    """Apre un'osservazione per ogni titolo forte classificato in questo giro e visto entro FRESH_MIN dalla pubblicazione.
    L'arretrato (titoli vecchi classificati ora) non apre niente: non lo abbiamo visto in tempo."""
    init(store)
    rows = store.conn.execute(
        "SELECT c.url, c.ts, c.temi, c.intensita, c.segno, c.source, n.title FROM news_llm c JOIN news n ON n.url = c.url "
        "WHERE c.quando = ? AND c.intensita >= ?", (when, news_agent.STRONG)).fetchall()
    out = []
    for url, ts, temi, inten, segno, source, title in rows:
        published = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        lag = (now - published).total_seconds() / 60
        if lag < -FAST_MIN or lag > FRESH_MIN:
            continue
        out.append((url, when, ts, int(max(0, round(lag))), temi, int(inten), int(segno or 0), title, source))
    if out:
        store.conn.executemany("INSERT OR IGNORE INTO news_watch_events VALUES (?,?,?,?,?,?,?,?,?)", out)
        store.conn.commit()
    return len(out)


def tick(store: Store, now: datetime | None = None, raccolta: bool = True, prices_fn=fetch_prices,
         collect_fn=None, call=None, prov=None) -> dict:
    """Un giro: titoli nuovi (se `raccolta`), classificazione subito, prezzi correnti, nuove osservazioni."""
    init(store)
    now = now or datetime.now(timezone.utc)
    when = _minute(now)
    result: dict = {"quando": when}
    if raccolta:
        try:
            result["titoli"] = (collect_fn or collect_headlines)(store, now)
        except Exception as e:  # noqa: BLE001
            result["titoli"] = {"errore": f"{e}"[:200]}
    # il minuto del giro e' la chiave comune di prezzi, classificazione (`quando`) e osservazioni
    agent = news_agent.step(store, limit=PER_RUN, call=call, now=now.replace(second=0, microsecond=0), prov=prov)
    result["agente"] = {k: v for k, v in agent.items() if k in ("saltato", "classificate", "chiamate", "arretrato", "errore", "costo_stimato_usd")}
    prices, errors = prices_fn()
    saved = save_prices(store, when, prices)
    result["prezzi"] = {**{k: round(v, 2) for k, v in prices.items()}, **({"errori": errors} if errors else {})}
    result["osservazioni_nuove"] = open_observations(store, when, now) if not agent.get("saltato") else 0
    result["osservazioni_totali"] = int(store.conn.execute("SELECT count(*) FROM news_watch_events").fetchone()[0])
    titles = result.get("titoli", {})
    n_titles = sum(v for v in titles.values() if isinstance(v, int)) if isinstance(titles, dict) else 0
    note = "; ".join(filter(None, [agent.get("saltato"), agent.get("errore")] + [f"{k}: {v}" for k, v in errors.items()]))
    store.conn.execute("INSERT OR REPLACE INTO news_watch_runs VALUES (?,?,?,?,?,?)",
                       (when, n_titles, int(agent.get("classificate", 0)), result["osservazioni_nuove"], saved, note or None))
    store.conn.commit()
    return result


# --- rapporto -----------------------------------------------------------------------------------------

def _series(store: Store) -> dict[str, pd.Series]:
    df = pd.read_sql_query("SELECT ts, simbolo, prezzo FROM news_watch_prices ORDER BY ts", store.conn)
    out = {}
    for name, g in df.groupby("simbolo"):
        s = pd.Series(g["prezzo"].to_numpy(), index=pd.to_datetime(g["ts"], utc=True))
        out[name] = s[~s.index.duplicated()].sort_index()
    return out


def price_at(s: pd.Series, t: pd.Timestamp, tol: int = TOLERANCE) -> float:
    """Il primo prezzo registrato tra t e t+tol minuti; NaN se in quella finestra non c'e' nessun giro."""
    if s.empty:
        return math.nan
    i = s.index.searchsorted(t)
    if i < len(s) and s.index[i] <= t + pd.Timedelta(minutes=tol):
        return float(s.iloc[i])
    return math.nan


def moves(s: pd.Series, t0: pd.Timestamp, horizons=HORIZONS) -> dict[int, float]:
    """Variazione percentuale dal prezzo visto a t0 a quello a t0+h, per ogni orizzonte."""
    p0 = price_at(s, t0)
    out = {}
    for h in horizons:
        p1 = price_at(s, t0 + pd.Timedelta(minutes=h))
        out[h] = round((p1 / p0 - 1) * 100, 4) if p0 and not math.isnan(p0) and not math.isnan(p1) else math.nan
    return out


def _stats(signed: list[float], absolute: list[float]) -> dict:
    sg = [x for x in signed if not math.isnan(x)]
    ab = [x for x in absolute if not math.isnan(x)]
    return {
        "n": len(ab),
        "nel_verso_pct": round(100 * sum(1 for x in sg if x > 0) / len(sg), 1) if sg else None,
        "media_nel_verso_pct": round(sum(sg) / len(sg), 3) if sg else None,
        "ampiezza_media_pct": round(sum(ab) / len(ab), 3) if ab else None,
    }


def report(store: Store, now: datetime | None = None) -> dict:
    """Mosse dopo i titoli forti contro il controllo a orario spostato, per mercato e orizzonte; per tema a +15 minuti."""
    init(store)
    now = now or datetime.now(timezone.utc)
    ev = pd.read_sql_query("SELECT url, visto, ts, ritardo_min, temi, intensita, segno FROM news_watch_events ORDER BY visto", store.conn)
    prices = _series(store)
    n_prices = int(store.conn.execute("SELECT count(*) FROM news_watch_prices").fetchone()[0])
    days = int(store.conn.execute("SELECT count(DISTINCT substr(ts,1,10)) FROM news_watch_prices").fetchone()[0])
    out: dict = {
        "osservazioni": int(len(ev)), "giorni_di_prezzi": days, "prezzi_registrati": n_prices,
        "giri_al_giorno": round(n_prices / max(1, len(prices)) / max(1, days), 1) if n_prices else 0,
        "ritardo_mediano_min": int(ev["ritardo_min"].median()) if len(ev) else None,
        "freschi_entro_15_min": int((ev["ritardo_min"] <= FAST_MIN).sum()) if len(ev) else 0,
        "con_segno": int((ev["segno"] != 0).sum()) if len(ev) else 0,
        "verdetto": f"dopo {VERDICT_AFTER} di osservazioni; nessun ordine nel frattempo",
        "per_mercato": {}, "per_tema": {},
    }
    if not len(ev) or not prices:
        return out
    visto = pd.to_datetime(ev["visto"], utc=True)
    theme_rows: dict[str, dict[str, list]] = {}
    for name, s in prices.items():
        real = {h: ([], []) for h in HORIZONS}
        ctrl = {h: ([], []) for h in HORIZONS}
        for i in range(len(ev)):
            segno = int(ev["segno"].iloc[i])
            t0 = visto.iloc[i]
            m = moves(s, t0)
            for h, x in m.items():
                real[h][0].append(segno * x if segno else math.nan)
                real[h][1].append(abs(x))
            for d in SHIFTS:
                mc = moves(s, t0 + pd.Timedelta(days=d))
                for h, x in mc.items():
                    ctrl[h][0].append(segno * x if segno else math.nan)
                    ctrl[h][1].append(abs(x))
            if name in ("sp500", "btc") and not math.isnan(m[15]):
                for t in str(ev["temi"].iloc[i]).split(","):
                    if t:
                        theme_rows.setdefault(t, {}).setdefault(name, []).append(segno * m[15] if segno else math.nan)
        out["per_mercato"][name] = {
            f"+{h}": {"reale": _stats(*real[h]), "controllo": _stats(*ctrl[h])} for h in HORIZONS}
    for t, by_market in sorted(theme_rows.items(), key=lambda kv: -len(next(iter(kv[1].values())))):
        entry = {}
        for name, xs in by_market.items():
            vals = [x for x in xs if not math.isnan(x)]
            entry[name] = {"n": len(xs), "media_nel_verso_pct_a_15": round(sum(vals) / len(vals), 3) if vals else None}
        out["per_tema"][t] = entry
    return out


def weekly_line(store: Store, now: datetime | None = None) -> str:
    """Una riga per il riepilogo del venerdi'; vuota finche' non c'e' nessuna osservazione."""
    try:
        r = report(store, now)
    except Exception:  # noqa: BLE001 - una riga informativa non deve fermare il riepilogo
        return ""
    if not r["osservazioni"]:
        return ""
    parts = [f"Osservatorio notizie al minuto (solo misura): {r['osservazioni']} titoli forti in {r['giorni_di_prezzi']} giorni, "
             f"ritardo mediano {r['ritardo_mediano_min']} min dalla pubblicazione"]
    for name, label in (("sp500", "S&P"), ("btc", "BTC")):
        st = r["per_mercato"].get(name, {}).get("+15")
        if st and st["reale"]["nel_verso_pct"] is not None and st["controllo"]["nel_verso_pct"] is not None:
            parts.append(f"{label} a +15 min nel verso della notizia {st['reale']['nel_verso_pct']:.0f}% "
                         f"(controllo {st['controllo']['nel_verso_pct']:.0f}%)")
    return "; ".join(parts) + f"; verdetto dopo {VERDICT_AFTER}, nessun ordine."
