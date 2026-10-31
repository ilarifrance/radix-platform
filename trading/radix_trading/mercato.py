"""Sentinella di mercato (chiesta da Francesco il 31/10/2026, dopo il venerdi' nero del 30/10 che nessuno gli aveva segnalato).

Ogni ora, dentro il giro `hourly`, guarda i mercati che contano per le due corsie (ETF Fineco e crypto_trend) e manda su
Telegram un avviso CON VALUTAZIONE quando succede qualcosa di rilevante:
- indici e ETF americani (S&P 500, Nasdaq 100, mondo ex USA, oro, Treasury, petrolio), VIX e decennale USA, con le
  quotazioni Yahoo (15 minuti di ritardo) nelle ore di Wall Street e alla chiusura;
- Bitcoin ed Ethereum sulle 24 ore, anche di notte e nel fine settimana (barre Kraken gia' in archivio).
Ogni avviso dice: cosa e' successo; le notizie del giorno collegate; cosa dice la storia dopo giornate simili (rendimento
nei 5 e 20 giorni di borsa seguenti, con la dispersione); dove stanno le regole (ogni ETF rispetto al livello di 12 mesi,
il conto crypto); il verdetto. Il verdetto non propone mai di comprare o vendere su una notizia da sola: lo studio degli
eventi (events.py) non ha trovato un vantaggio che regga la verifica, e lo dice con i suoi numeri.
Un avviso per mercato al giorno; gli eventi della stessa ora vanno in un messaggio solo. Gli avvisi informano, le
regole decidono (ETF a fine mese, crypto alle 00 UTC), gli ordini ETF li mette Francesco.
"""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from . import alerts, data, fineco, universe
from .collectors import yahoo
from .store import Store

USA = {  # ticker Yahoo -> (nome, soglia della variazione giornaliera)
    "SPY": ("S&P 500", 0.02),
    "QQQ": ("Nasdaq 100", 0.025),
    "EFA": ("azioni mondo ex USA", 0.02),
    "GLD": ("oro", 0.025),
    "TLT": ("Treasury 20+ anni", 0.02),
    "USO": ("petrolio", 0.05),
}
VIX = ("^VIX", "VIX", 0.20)              # +20% in giornata: la paura sale
TNX = ("^TNX", "decennale USA", 15.0)    # 15 punti base; Yahoo da' il rendimento in punti percentuali (4.98 = 4,98%)
CRYPTO = {"XBTEUR": ("Bitcoin", 0.05), "ETHEUR": ("Ethereum", 0.06)}   # variazione sulle 24 ore
USA_HOURS_UTC = range(13, 23)            # Wall Street 13:30-20:00 o 14:30-21:00 UTC secondo l'ora legale; fuori non si chiama Yahoo
CONTEXT_MOVE = 0.01                      # sotto l'1% un mercato non si cita nemmeno come contorno
STORE_OF = {"SPY": "etf", "QQQ": "etf", "EFA": "etf", "TLT": "etf", "GLD": "materie_prime", "USO": "materie_prime"}
NEAR_LEVEL = 0.03                        # un ETF Fineco entro il 3% dal livello di 12 mesi merita «attenzione»
HORIZONS = (5, 20)                       # giorni di borsa dopo l'evento
MIN_CASES = 10
MIN_HISTORY = 500
NEWS_HOURS = 36
NEWS_THEMES = ("borse", "big_tech", "petrolio", "fed_tassi", "medio_oriente", "crisi_banche", "dazi", "guerra", "cina")
# Parole in piu' rispetto ai temi dello studio eventi (che non si toccano): trimestrali, chip, tassi di mercato.
NEWS_EXTRA = re.compile(r"\bIntel\b|\bAMD\b|semiconductor|chipmaker|chip ?stocks?|\bearnings\b|Wall Street|bond yields?|Treasur(?:y|ies)|"
                        r"\bbitcoin\b|\bcrypto|\bgold\b|oil prices?|\bBrent\b|\bECB\b|European Central Bank|\bLagarde\b|\bBCE\b", re.I)
TAG = "[Mercati]"
SCHEMA = "CREATE TABLE IF NOT EXISTS market_events (key TEXT PRIMARY KEY, ts TEXT NOT NULL, text TEXT NOT NULL);"


def _pct(x: float) -> str:
    return f"{x * 100:+.1f}%"


def studio(settings) -> dict | None:
    """Numeri dello studio eventi (events.json): quante prove, quante reggono la verifica fuori campione."""
    p = Path(settings.data_dir) / "events.json"
    if not p.exists():
        return None
    try:
        r = json.loads(p.read_text())
    except (OSError, ValueError):
        return None
    if "prove" not in r:
        return None
    return {"prove": int(r["prove"]), "reggono": int(r.get("reggono_verifica") or 0)}


def storia(close: pd.Series, move: float, horizons=HORIZONS) -> dict | None:
    """Dopo le giornate almeno cosi' forti (stesso verso), quanto ha reso il mercato nei giorni di borsa seguenti.

    Le giornate si contano tutte, anche se raggruppate nella stessa crisi: `n` sopravvaluta l'indipendenza dei casi,
    e il testo lo dice."""
    c = close.dropna()
    if len(c) < MIN_HISTORY or move == 0:
        return None
    r = c.pct_change()
    days = r[r <= move] if move < 0 else r[r >= move]
    out = {"n": int(len(days)), "dal": str(c.index[0].date()), "orizzonti": {}}
    for h in horizons:
        fwd = c.shift(-h) / c - 1
        after = fwd.reindex(days.index).dropna()
        if len(after) < MIN_CASES:
            continue
        out["orizzonti"][h] = {"n": int(len(after)), "medio": float(after.mean()), "mediano": float(after.median()),
                               "positivi": float((after > 0).mean()), "peggiore": float(after.min()),
                               "migliore": float(after.max()), "normale": float(fwd.dropna().mean())}
    return out if out["orizzonti"] else None


def _closes(store: Store, sym: str) -> pd.Series:
    market = STORE_OF.get(sym)
    if not market:
        return pd.Series(dtype=float)
    return data.load_close(store, universe.MARKETS[market], sym)


def crypto_closes(store: Store, sym: str) -> pd.Series:
    c = data.load_close(store, universe.FAST, sym).dropna()
    return c.resample("D").last().dropna() if not c.empty else c


def notizie(store: Store, now: datetime, limit: int = 3) -> list[str]:
    """Titoli delle ultime 36 ore (GDELT, raccolti ogni ora) e voci di Wikipedia di ieri e oggi sui temi di mercato,
    ognuno con la sua data (l'archivio di Wikipedia puo' essere indietro di un giorno: la data lo dice)."""
    from .events import _THEMES   # espressioni dei temi, gia' compilate
    pats = [_THEMES[t] for t in NEWS_THEMES if t in _THEMES] + [NEWS_EXTRA]
    titles: list[tuple[str, str]] = []   # (giorno ISO, titolo)
    try:
        news = store.load_news((now - timedelta(hours=NEWS_HOURS)).strftime("%Y-%m-%dT%H:%M:%SZ"))
        if not news.empty and "title" in news:
            rows = news.dropna(subset=["title"]).sort_values("ts", ascending=False)   # prima le piu' recenti
            titles += [(str(ts)[:10], str(t)) for ts, t in zip(rows["ts"], rows["title"])]
    except Exception:
        pass
    try:
        rows = store.conn.execute("SELECT day, text FROM news_items WHERE day >= ? ORDER BY day DESC",
                                  ((now - timedelta(days=1)).date().isoformat(),)).fetchall()
        titles += [(str(d), str(t)) for d, t in rows]
    except Exception:   # tabella non ancora creata
        pass
    out, seen = [], set()
    for day, t in titles:
        t = re.sub(r"\s+", " ", t).strip()
        if not t or not any(p.search(t) for p in pats):
            continue
        key = t.lower()[:60]
        if key in seen:
            continue
        seen.add(key)
        when = f"{day[8:10]}/{day[5:7]}: " if len(day) >= 10 else ""
        out.append(when + (t if len(t) <= 110 else t[:107].rstrip() + "…"))
        if len(out) >= limit:
            break
    return out


def regole(store: Store) -> dict:
    """Dove stanno le regole: ogni ETF Fineco rispetto al livello di 12 mesi (e le quote in portafoglio), il conto crypto."""
    db = store.conn
    db.executescript(fineco.SCHEMA)
    held = fineco._held(db)
    etf = []
    for sym, name in fineco.ETFS.items():
        saved = store.load_bars(fineco.VENUE, sym, "1d")
        sig = fineco.signal(saved["close"].dropna()) if not saved.empty else None
        if not sig:
            continue
        etf.append({"symbol": sym, "code": sym.split(".")[0], "name": name, "in": sig["in"],
                    "dist": sig["price"] / sig["ref"] - 1, "held": held.get(sym, {}).get("shares", 0)})
    crypto: dict = {}
    try:
        row = db.execute("SELECT ts, equity FROM live_equity ORDER BY ts DESC LIMIT 1").fetchone()
        start = db.execute("SELECT start FROM live_account").fetchone()
        if row:
            from .live import MAX_LOSS_EUR
            crypto = {"ts": row[0], "equity": float(row[1]), "stop": (float(start[0]) - MAX_LOSS_EUR) if start else None}
    except Exception:   # conto vero mai partito su questa macchina
        pass
    return {"etf": etf, "crypto": crypto, "regola_etf": fineco.rule()}


def valutazione(store: Store, primary: dict, studio: dict | None, now: datetime) -> list[str]:
    """Le righe dopo il fatto: notizie, storia, regole, verdetto."""
    lines = []
    news = notizie(store, now)
    lines.append("Notizie: " + (" | ".join(news) if news else "nessuna voce di mercato nelle ultime 36 ore in archivio."))
    st = primary.get("storia")
    if st:
        hz = 20 if 20 in st["orizzonti"] else next(iter(st["orizzonti"]))
        h = st["orizzonti"][hz]
        verso = "brutte" if primary["move"] < 0 else "forti"
        lines.append(f"Storia: dal {st['dal'][:4]}, dopo {h['n']} giornate di {primary['name']} almeno così {verso} "
                     f"(spesso raggruppate nelle stesse crisi), i {hz} giorni di borsa seguenti hanno reso in media {_pct(h['medio'])} "
                     f"(mediana {_pct(h['mediano'])}, positivi nel {h['positivi'] * 100:.0f}% dei casi, da {_pct(h['peggiore'])} a "
                     f"{_pct(h['migliore'])}), contro {_pct(h['normale'])} di un periodo normale. La media dice poco: la dispersione è grande.")
    else:
        lines.append("Storia: non ho abbastanza giornate simili in archivio per un confronto onesto.")
    reg = regole(store)
    parts, near = [], []
    for e in reg["etf"]:
        parts.append(f"{e['code']} {_pct(e['dist'])}" + (" ↑" if e["in"] else " ↓") + (f" ({e['held']} q.)" if e["held"] else ""))
        if abs(e["dist"]) <= NEAR_LEVEL:
            near.append(e)
    cr = reg["crypto"]
    crypto_txt = (f"Conto crypto {cr['equity']:.2f} €" + (f", stop a {cr['stop']:.0f} €" if cr.get("stop") else "")
                  + "; crypto_trend decide alle 00 UTC.") if cr else "crypto_trend decide alle 00 UTC."
    etf_txt = ("ETF " + ", ".join(parts) + " rispetto al prezzo di 12 mesi fa (↑ dentro, ↓ fuori). ") if parts else ""
    lines.append("Regole: " + etf_txt + crypto_txt)
    verdict = []
    if reg["regola_etf"] == "tieni":
        verdict.append("Nessuna azione: con «compra e tieni» si ribilancia solo a gennaio.")
    elif near:
        for e in near:
            effetto = ("se a fine mese è sotto, la regola lo vende" if e["in"] and e["held"]
                       else "se a fine mese è sotto, la regola non lo compra" if e["in"]
                       else "se a fine mese è sopra, la regola lo compra")
            verdict.append(f"Attenzione: {e['code']} è a {_pct(e['dist'])} dal livello di 12 mesi, {effetto}.")
    else:
        verdict.append("Nessuna azione: la regola ETF decide a fine mese, crypto_trend alle 00 UTC.")
    prove = (f"studio eventi: {studio['prove']} prove, {studio['reggono']} reggono la verifica" if studio
             else "studio eventi: nessuna prova regge la verifica")
    verdict.append(f"Comprare o vendere su questa notizia da sola non ha un vantaggio dimostrato ({prove}). "
                   "Se vuoi agire comunque: ordini limite, mai a mercato in apertura.")
    lines.append("Verdetto: " + " ".join(verdict))
    return lines


def _fresh(q: dict, day) -> bool:
    t = q.get("time")
    return t is None or pd.Timestamp(t).date() == day


def _quote(quote, sym: str, out: dict):
    try:
        return quote(sym)
    except Exception as e:   # Yahoo giu' o simbolo sconosciuto: si va avanti con gli altri
        out["errori"][sym] = str(e)
        return None


def watch(store: Store, now: datetime | None = None, send=alerts.send, quote=yahoo.fetch_quote,
          studio: dict | None = None, pausa: float = 1.0, prova: bool = False) -> dict:
    """Un giro della sentinella. Con `prova` compone il testo senza mandarlo ne' registrarlo."""
    now = now or datetime.now(timezone.utc)
    db = store.conn
    db.executescript(SCHEMA)
    day = now.date()
    out: dict = {"ora": now.strftime("%H:%M"), "avvisi": [], "errori": {}, "mosse": {}}
    events, context = [], []
    if now.weekday() < 5 and now.hour in USA_HOURS_UTC:
        for i, (sym, (name, thr)) in enumerate(USA.items()):
            if i and pausa:
                time.sleep(pausa)   # Yahoo limita le richieste ravvicinate
            q = _quote(quote, sym, out)
            if not q or not _fresh(q, day) or not q.get("prev_close"):
                continue
            mv = q["price"] / q["prev_close"] - 1
            out["mosse"][sym] = round(mv, 4)
            if abs(mv) >= thr:
                desc = (f"{name} ({sym}) {'perde' if mv < 0 else 'guadagna'} il {abs(mv) * 100:.1f}% oggi "
                        f"({q['prev_close']:.2f} → {q['price']:.2f} $)")
                events.append({"symbol": sym, "name": name, "move": mv, "forza": abs(mv) / thr, "desc": desc,
                               "key": f"usa:{sym}:{day}", "storia": storia(_closes(store, sym), mv)})
            elif abs(mv) >= CONTEXT_MOVE:
                context.append(f"{name} {_pct(mv)}")
        for sym, name, thr in (VIX, TNX):
            if pausa:
                time.sleep(pausa)
            q = _quote(quote, sym, out)
            if not q or not _fresh(q, day) or not q.get("prev_close"):
                continue
            if sym == VIX[0]:
                mv = q["price"] / q["prev_close"] - 1
                out["mosse"][sym] = round(mv, 4)
                if mv >= thr:
                    events.append({"symbol": sym, "name": name, "move": mv, "forza": mv / thr, "storia": None,
                                   "desc": f"VIX da {q['prev_close']:.0f} a {q['price']:.0f} ({_pct(mv)}): la paura sale",
                                   "key": f"vix:{day}"})
                elif abs(mv) >= 0.08:
                    context.append(f"VIX {_pct(mv)}")
            else:
                bp = (q["price"] - q["prev_close"]) * 100
                out["mosse"][sym] = round(bp, 1)
                if abs(bp) >= thr:
                    events.append({"symbol": sym, "name": name, "move": bp / 10000, "forza": abs(bp) / thr, "storia": None,
                                   "desc": f"decennale USA da {q['prev_close']:.2f}% a {q['price']:.2f}% ({bp:+.0f} punti base)",
                                   "key": f"tassi:{day}"})
                elif abs(bp) >= 5:
                    context.append(f"decennale USA {bp:+.0f} pb")
    for sym, (name, thr) in CRYPTO.items():
        c = store.load_bars(universe.FAST["venue"], sym, universe.FAST["timeframe"])["close"].dropna()
        if c.empty or c.index[-1] < pd.Timestamp(now) - pd.Timedelta(hours=3):
            continue   # archivio fermo: niente da dire
        before = c[c.index <= c.index[-1] - pd.Timedelta(hours=24)]
        if before.empty:
            continue
        mv = float(c.iloc[-1] / before.iloc[-1] - 1)
        out["mosse"][sym] = round(mv, 4)
        if abs(mv) >= thr:
            events.append({"symbol": sym, "name": name, "move": mv, "forza": abs(mv) / thr,
                           "desc": f"{name} {'perde' if mv < 0 else 'guadagna'} il {abs(mv) * 100:.1f}% in 24 ore "
                                   f"({before.iloc[-1]:,.0f} → {c.iloc[-1]:,.0f} €)",
                           "key": f"crypto:{sym}:{day}", "storia": storia(crypto_closes(store, sym), mv)})
        elif abs(mv) >= 0.03:
            context.append(f"{name} {_pct(mv)} in 24 ore")
    new = [e for e in events if not db.execute("SELECT 1 FROM market_events WHERE key = ?", (e["key"],)).fetchone()]
    if not new:
        return out
    new.sort(key=lambda e: -e["forza"])
    primary, others = new[0], new[1:]
    head = f"{TAG} Evento delle {now:%H:%M} UTC: {primary['desc']}."
    if others:
        head += " Anche: " + "; ".join(o["desc"] for o in others) + "."
    if context:
        head += " Contorno: " + ", ".join(context) + "."
    text = "\n".join([head] + valutazione(store, primary, studio, now))
    if not prova:
        ts = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        for e in new:
            db.execute("INSERT INTO market_events VALUES (?, ?, ?)", (e["key"], ts, text if e is primary else f"vedi {primary['key']}"))
        db.commit()
        send(text)
    out["avvisi"] = [e["key"].rsplit(":", 1)[0] for e in new]
    out["testo"] = text
    return out
