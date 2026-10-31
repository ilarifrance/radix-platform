"""Corsia ETF su Fineco: la regola decide una volta al mese, Francesco esegue a mano.

Decisione di Francesco del 31/10/2026 («ok su 3»). Fineco non ha un'API per gli ordini dei clienti, quindi
il programma manda su Telegram, il primo giorno di borsa del mese, cosa comprare e cosa vendere; gli ordini
li mette Francesco dall'app (1-2 al mese). Il regime amministrato di Fineco gestisce le tasse.

Regola (riprodotta 2006-2026 con i costi Fineco: circa +9% l'anno, perdita massima −19%): cinque ETF UCITS
quotati a Milano, un quinto del capitale ciascuno; un ETF si tiene se l'ultimo prezzo e' sopra quello di
12 mesi prima, altrimenti la sua quota resta liquida. Si entra e si esce, non si ribilancia: pochi ordini.
Capitale di riferimento: `FINECO_CAPITAL_EUR` in ~/RadixTrading/.env (3.000 euro se manca).
"""

from __future__ import annotations

from datetime import date, datetime, timezone

import pandas as pd

from . import alerts
from .collectors import yahoo
from .config import env_value
from .store import Store

VENUE = "fineco"
# Classi con prezzo sotto i 200 euro, cosi' con 600-1.000 euro per ETF le quote intere lasciano pochi euro fermi
# (CSSPX, EQQQ e SGLD costano 350-750 euro a quota). Due sono su Xetra, che Fineco tratta come Milano.
ETFS = {  # ticker Yahoo -> nome breve
    "VUAA.MI": "S&P 500 (Vanguard, acc.)",
    "XNAS.MI": "Nasdaq 100 (Xtrackers)",
    "4GLD.DE": "Oro fisico (Xetra-Gold)",
    "IS04.DE": "Treasury USA 20+ anni (iShares, Xetra)",
    "IMEU.MI": "Europa MSCI (iShares Core)",
}
WEIGHT = 1.0 / len(ETFS)
LOOKBACK_DAYS = 365
SINCE = "2005-01-01"
CAPITAL_DEFAULT = 3000.0
# Regola della corsia, `FINECO_RULE` in .env (o il valore qui sotto):
#   trend     dentro se il prezzo e' sopra quello di 12 mesi prima, altrimenti liquidi (regola originale);
#   conferma  come trend, ma si entra o si esce solo se il segnale e' uguale per due mesi di fila (meno falsi segnali);
#   tieni     sempre dentro tutti e cinque, a gennaio si riporta ognuno a un quinto (comprare e tenere).
# Confronto del 31/10/2026 (confronto.py) sul 2016-2026: trend +9,6% l'anno e perdita massima -18,7%;
# conferma +10,8% e -20,5%; tieni +12,2% e -18,6% con un terzo degli ordini. Decide Francesco.
RULES = ("trend", "conferma", "tieni")
RULE_DEFAULT = "trend"
RULE_NAMES = {"trend": "trend a 12 mesi", "conferma": "trend a 12 mesi con conferma su due mesi",
              "tieni": "compra e tieni, ribilancio a gennaio"}
REBALANCE_MIN_EUR = 150.0   # sotto, il ribilancio non vale la commissione minima
ALERT_HOUR_UTC = 7       # alle 8 italiane, un'ora prima dell'apertura di Borsa Italiana
HOLIDAYS = {(1, 1), (5, 1), (8, 15), (12, 24), (12, 25), (12, 26), (12, 31)}   # chiusure fisse di Borsa Italiana
MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre",
          "ottobre", "novembre", "dicembre"]
WEEKDAYS = ["lunedi'", "martedi'", "mercoledi'", "giovedi'", "venerdi'", "sabato", "domenica"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS etf_alerts (month TEXT PRIMARY KEY, ts TEXT NOT NULL, text TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS etf_targets (month TEXT NOT NULL, symbol TEXT NOT NULL, shares INTEGER NOT NULL,
    price REAL NOT NULL, PRIMARY KEY (month, symbol));
CREATE TABLE IF NOT EXISTS etf_events (key TEXT PRIMARY KEY, ts TEXT NOT NULL, text TEXT NOT NULL);
"""

# Controllo orario (chiesto da Francesco il 31/10/2026): avvisi solo sugli eventi, un riepilogo a fine giornata.
WATCH_HOURS_UTC = range(7, 17)      # Milano e Xetra: 9:00-17:30 italiane, con ora legale e solare
SUMMARY_HOUR_UTC = 17
DAY_MOVE = 0.03                     # un ETF che fa +-3% in un giorno
BASKET_MOVE = 0.02                  # il paniere in portafoglio che perde il 2% in un giorno
ENTRY_LEVELS = (-0.08, -0.12, -0.16)   # perdita dal prezzo del piano d'ingresso, un avviso per livello
VIX_JUMP = 0.25                     # VIX +25% in un giorno (serie FRED, con un giorno di ritardo)


def first_trading_day(year: int, month: int) -> date:
    d = date(year, month, 1)
    while d.weekday() >= 5 or (d.month, d.day) in HOLIDAYS:
        d = d.replace(day=d.day + 1)
    return d


def capital() -> float:
    try:
        return float(env_value("FINECO_CAPITAL_EUR") or CAPITAL_DEFAULT)
    except ValueError:
        return CAPITAL_DEFAULT


def rule() -> str:
    r = (env_value("FINECO_RULE") or RULE_DEFAULT).strip().lower()
    return r if r in RULES else RULE_DEFAULT


def fetch_daily(symbol: str) -> pd.DataFrame:
    return yahoo.fetch_daily(symbol, since=SINCE)


def collect(store: Store, fetch=fetch_daily) -> dict[str, pd.Series]:
    """Scarica (o rilegge) lo storico giornaliero dei cinque ETF; ritorna le chiusure."""
    closes = {}
    for sym in ETFS:
        try:
            bars = fetch(sym)
            if not bars.empty:
                store.upsert_bars(VENUE, sym, "1d", bars)
        except Exception:  # Yahoo giu': si usa quel che c'e' in archivio
            pass
        saved = store.load_bars(VENUE, sym, "1d")
        if not saved.empty:
            closes[sym] = saved["close"].dropna()
    return closes


def signal(close: pd.Series) -> dict | None:
    """Sopra o sotto il prezzo di 12 mesi fa; None se lo storico e' corto."""
    if close.empty:
        return None
    last_ts = close.index[-1]
    past = close[: last_ts - pd.Timedelta(days=LOOKBACK_DAYS)]
    if past.empty:
        return None
    return {"price": float(close.iloc[-1]), "ref": float(past.iloc[-1]), "in": bool(close.iloc[-1] > past.iloc[-1]),
            "date": last_ts.date()}


def signal_prev(close: pd.Series) -> dict | None:
    """Lo stesso segnale com'era alla decisione del mese prima (chiusure fino alla fine del mese precedente)."""
    if close.empty:
        return None
    cut = close.index[-1].normalize().replace(day=1)
    return signal(close[close.index < cut])


def plan(store: Store, closes: dict[str, pd.Series], month: str, cap: float, regola: str | None = None) -> list[dict]:
    regola = regola or rule()
    db = store.conn
    db.executescript(SCHEMA)
    prev_row = db.execute("SELECT month FROM etf_targets WHERE month < ? ORDER BY month DESC LIMIT 1", (month,)).fetchone()
    prev = dict(db.execute("SELECT symbol, shares FROM etf_targets WHERE month = ?", (prev_row[0],)).fetchall()) if prev_row else {}
    out = []
    for sym, name in ETFS.items():
        close = closes.get(sym, pd.Series(dtype=float))
        sig = signal(close)
        held = int(prev.get(sym, 0))
        if sig is None:
            out.append({"symbol": sym, "name": name, "action": "dati mancanti", "shares": held, "held": held, "price": None,
                        "in": None, "regola": regola})
            continue
        if regola == "tieni":
            voglio = True
        elif regola == "conferma":
            before = signal_prev(close)
            voglio = sig["in"] if before is None or before["in"] == sig["in"] else held > 0
        else:
            voglio = sig["in"]
        if voglio and held == 0:
            shares = int(cap * WEIGHT // sig["price"])
            action = "COMPRA" if shares > 0 else "quota sotto il prezzo di una quota"
        elif voglio:
            shares, action = held, "tieni"
        elif held > 0:
            shares, action = 0, "VENDI tutto"
        else:
            shares, action = 0, "resta liquido"
        out.append({"symbol": sym, "name": name, "action": action, "shares": shares, "held": held, "regola": regola, **sig})
    if regola == "tieni" and month.endswith("-01"):
        _rebalance(out)
    return out


def _rebalance(rows: list[dict]) -> None:
    """A gennaio ogni ETF gia' in portafoglio torna a un quinto del valore complessivo, se lo scarto vale la commissione."""
    held_rows = [r for r in rows if r.get("price") and r["held"] > 0 and r["action"] == "tieni"]
    if len(held_rows) < 2:
        return
    total = sum(r["held"] * r["price"] for r in rows if r.get("price") and r["held"] > 0)
    target = total / len(ETFS)
    for r in held_rows:
        shares = int(target // r["price"])
        delta = shares - r["held"]
        if abs(delta) * r["price"] >= REBALANCE_MIN_EUR:
            r.update({"action": "RIBILANCIA", "shares": shares, "delta": delta})


def alert_text(month: str, rows: list[dict], cap: float, day: date) -> str:
    y, m = month.split("-")
    regola = next((r.get("regola") for r in rows if r.get("regola")), RULE_DEFAULT)
    lines = [f"[ETF Fineco] Piano di {MONTHS[int(m) - 1]} {y}, capitale di riferimento {cap:,.0f} €, regola: {RULE_NAMES[regola]}. "
             f"Da eseguire {WEEKDAYS[day.weekday()]} {day:%d/%m} all'apertura di Borsa Italiana:"]
    invested = 0.0
    for r in rows:
        code = r["symbol"].removesuffix(".MI")
        if r["price"] is None:
            lines.append(f"• {code} ({r['name']}): dati mancanti, non fare nulla.")
            continue
        trend = "sopra" if r["in"] else "sotto"
        value = r["shares"] * r["price"]
        invested += value
        why = (f"prezzo {trend} quello di 12 mesi fa ({r['ref']:.2f})" if regola != "tieni"
               else f"si tiene sempre; trend a 12 mesi {trend}, solo informativo")
        if regola == "conferma" and r["action"] in ("COMPRA", "VENDI tutto"):
            why += ", per il secondo mese di fila"
        if r["action"] == "COMPRA":
            lines.append(f"• COMPRA {r['shares']} quote {code} ({r['name']}) a circa {r['price']:.2f} € ≈ {value:,.0f} €: {why}.")
        elif r["action"] == "VENDI tutto":
            lines.append(f"• VENDI tutte le {r['held']} quote {code} ({r['name']}): prezzo {r['price']:.2f} €, {why}.")
        elif r["action"] == "RIBILANCIA":
            verb = "COMPRA" if r["delta"] > 0 else "VENDI"
            lines.append(f"• RIBILANCIA {code} ({r['name']}): {verb} {abs(r['delta'])} quote a circa {r['price']:.2f} € "
                         f"→ {r['shares']} quote ≈ {value:,.0f} €, per tornare a un quinto del paniere.")
        elif r["action"] == "tieni":
            lines.append(f"• Tieni {r['shares']} quote {code} ({r['name']}) ≈ {value:,.0f} €, {why}.")
        elif regola == "conferma" and r["in"] != (r["held"] > 0):
            lines.append(f"• {code} ({r['name']}): niente per ora, segnale cambiato da un mese solo (prezzo {trend} quello "
                         f"di 12 mesi fa); si decide il mese prossimo se conferma.")
        else:
            lines.append(f"• {code} ({r['name']}): niente, prezzo {trend} quello di 12 mesi fa; la quota resta liquida.")
    dates = [r["date"] for r in rows if r.get("price") is not None]
    lines.append(f"Investito dopo gli ordini ≈ {invested:,.0f} €, liquidita' ≈ {max(cap - invested, 0):,.0f} €. "
                 + (f"Prezzi di chiusura del {max(dates):%d/%m}. " if dates else "")
                 + "Ordini limite vicino all'ultimo prezzo, mai a mercato in apertura.")
    return "\n".join(lines)


def maybe_alert(store: Store, now: datetime | None = None, send=alerts.send, fetch=fetch_daily,
                cap: float | None = None, force: bool = False) -> dict | None:
    """Manda il piano del mese una volta sola, dal primo giorno di borsa del mese alle 8 italiane in poi."""
    now = now or datetime.now(timezone.utc)
    year, mon = now.year, now.month
    if force and now.date() > first_trading_day(year, mon):   # a mano a fine mese: e' il piano del mese prossimo
        year, mon = (year + 1, 1) if mon == 12 else (year, mon + 1)
    month = f"{year}-{mon:02d}"
    day = first_trading_day(year, mon)
    db = store.conn
    db.executescript(SCHEMA)
    if not force:
        if db.execute("SELECT 1 FROM etf_alerts WHERE month = ?", (month,)).fetchone():
            return None
        if now.date() < day or (now.date() == day and now.hour < ALERT_HOUR_UTC):
            return None
    cap = cap or capital()
    closes = collect(store, fetch)
    regola = rule()
    rows = plan(store, closes, month, cap, regola)
    if all(r["price"] is None for r in rows):   # Yahoo giu' e archivio vuoto: niente avviso, si riprova al giro dopo
        return {"mese": month, "giorno": day.isoformat(), "errore": "dati mancanti per tutti gli ETF, riprovo al prossimo giro"}
    text = alert_text(month, rows, cap, day)
    sent = send(text)
    db.execute("INSERT OR REPLACE INTO etf_alerts VALUES (?, ?, ?)", (month, now.strftime("%Y-%m-%dT%H:%M:%SZ"), text))
    db.executemany("INSERT OR REPLACE INTO etf_targets VALUES (?, ?, ?, ?)",
                   [(month, r["symbol"], r["shares"], r["price"] or 0.0) for r in rows])
    db.commit()
    return {"mese": month, "giorno": day.isoformat(), "capitale": cap, "regola": regola, "inviato": sent, "piano": rows, "testo": text}


# --- controllo orario -------------------------------------------------------------------------------

def _held(db) -> dict[str, dict]:
    row = db.execute("SELECT month FROM etf_targets ORDER BY month DESC LIMIT 1").fetchone()
    if not row:
        return {}
    return {sym: {"shares": int(sh), "price": float(pr)} for sym, sh, pr in
            db.execute("SELECT symbol, shares, price FROM etf_targets WHERE month = ? AND shares > 0", (row[0],)).fetchall()}


def _once(db, key: str, text: str, now: datetime, send) -> bool:
    """Manda `text` una volta sola per `key` (che include il giorno); torna True se e' partito ora."""
    if db.execute("SELECT 1 FROM etf_events WHERE key = ?", (key,)).fetchone():
        return False
    db.execute("INSERT INTO etf_events VALUES (?, ?, ?)", (key, now.strftime("%Y-%m-%dT%H:%M:%SZ"), text))
    db.commit()
    send(text)
    return True


def watch(store: Store, now: datetime | None = None, send=alerts.send, quote=yahoo.fetch_quote) -> dict:
    """Ogni ora, a mercato aperto: prezzi dei cinque ETF, avviso su Telegram solo se succede qualcosa di rilevante
    (giornata oltre il 3%, paniere -2%, perdita dall'ingresso oltre 8/12/16%, prezzo che attraversa il livello di
    12 mesi fa, VIX +25%); alle 18 italiane un riepilogo della giornata. Gli avvisi informano: la regola decide
    a fine mese e gli ordini li mette Francesco."""
    now = now or datetime.now(timezone.utc)
    db = store.conn
    db.executescript(SCHEMA)
    day = now.date()
    if now.weekday() >= 5 or (day.month, day.day) in HOLIDAYS:
        return {"mercato": "chiuso"}
    if now.hour not in WATCH_HOURS_UTC and now.hour < SUMMARY_HOUR_UTC:
        return {"mercato": "non ancora aperto"}
    held = _held(db)
    rows, errori = [], {}
    for sym, name in ETFS.items():
        try:
            q = quote(sym)
        except Exception as e:
            errori[sym] = str(e)
            continue
        saved = store.load_bars(VENUE, sym, "1d")
        sig = signal(saved["close"].dropna()) if not saved.empty else None
        # Prima dell'apertura Yahoo da' ancora la chiusura di ieri: niente variazione «di oggi» da segnalare.
        fresh = q.get("time") is None or pd.Timestamp(q["time"]).date() == day
        rows.append({"symbol": sym, "code": sym.split(".")[0], "name": name, **q,
                     "day": (q["price"] / q["prev_close"] - 1) if fresh and q.get("prev_close") else None,
                     "ref": sig["ref"] if sig else None, "was_in": sig["in"] if sig else None,
                     "held": held.get(sym, {}).get("shares", 0), "plan_price": held.get(sym, {}).get("price")})
    out = {"ora": now.strftime("%H:%M"), "avvisi": [], "errori": errori}
    if not rows:
        if errori:
            out["avvisi"] += [k for k in ["dati"] if _once(db, f"dati:{day}", f"[ETF Fineco] Controllo orario: Yahoo non risponde per nessun ETF ({now:%H:%M} UTC). Riprovo tra un'ora.", now, send)]
        return out
    tag = f"[ETF Fineco] Evento delle {now:%H:%M} UTC"
    if now.hour in WATCH_HOURS_UTC:
        for r in rows:
            if r["day"] is not None and abs(r["day"]) >= DAY_MOVE:
                verso = "perde" if r["day"] < 0 else "guadagna"
                pos = f"In portafoglio {r['held']} quote ≈ {r['held'] * r['price']:,.0f} €." if r["held"] else "Non in portafoglio."
                if _once(db, f"giorno:{r['symbol']}:{day}", f"{tag}: {r['code']} ({r['name']}) {verso} il {abs(r['day']) * 100:.1f}% oggi "
                         f"({r['prev_close']:.2f} → {r['price']:.2f} €). {pos} La regola decide a fine mese: nessun ordine previsto.", now, send):
                    out["avvisi"].append(f"giorno:{r['code']}")
            if r["held"] and r["plan_price"] and r["day"] is not None:
                loss = r["price"] / r["plan_price"] - 1
                for lvl in ENTRY_LEVELS:
                    if loss <= lvl and _once(db, f"ingresso:{r['symbol']}:{int(lvl * 100)}",
                                             f"{tag}: {r['code']} ({r['name']}) è il {abs(loss) * 100:.1f}% sotto il prezzo del piano "
                                             f"({r['plan_price']:.2f} → {r['price']:.2f} €), {r['held']} quote ≈ {r['held'] * r['price']:,.0f} €. "
                                             f"Avviso informativo: la regola rivede la posizione il primo giorno del mese.", now, send):
                        out["avvisi"].append(f"ingresso:{r['code']}:{int(lvl * 100)}")
            if r["day"] is not None and r["ref"] and r["was_in"] is not None and (r["price"] > r["ref"]) != r["was_in"]:
                lato = "sopra" if r["price"] > r["ref"] else "sotto"
                effetto = ("se resta così a fine mese la regola lo vende" if r["held"] and lato == "sotto"
                           else "se resta così a fine mese la regola lo compra" if not r["held"] and lato == "sopra" else "nessun effetto sulla posizione")
                if _once(db, f"soglia:{r['symbol']}:{day}", f"{tag}: {r['code']} ({r['name']}) è passato {lato} il prezzo di 12 mesi fa "
                         f"({r['ref']:.2f}; ora {r['price']:.2f} €): {effetto}.", now, send):
                    out["avvisi"].append(f"soglia:{r['code']}")
        inport = [r for r in rows if r["held"] and r["day"] is not None]
        if inport:
            v_now = sum(r["held"] * r["price"] for r in inport)
            v_prev = sum(r["held"] * r["prev_close"] for r in inport)
            move = v_now / v_prev - 1
            if move <= -BASKET_MOVE and _once(db, f"paniere:{day}", f"{tag}: il paniere ETF in portafoglio perde il {abs(move) * 100:.1f}% oggi "
                                               f"({v_prev:,.0f} → {v_now:,.0f} €). La regola decide a fine mese; se vuoi agire, ordini limite.", now, send):
                out["avvisi"].append("paniere")
        try:
            vix = store.load_macro("VIXCLS").dropna()
            if len(vix) >= 2 and vix.iloc[-1] / vix.iloc[-2] - 1 >= VIX_JUMP:
                when = vix.index[-1]
                if _once(db, f"vix:{when:%Y-%m-%d}", f"{tag}: giornata di paura sui mercati, VIX da {vix.iloc[-2]:.0f} a {vix.iloc[-1]:.0f} "
                         f"({when:%d/%m}). Nei nostri studi vendere in questi giorni ha reso meno che restare: la regola non cambia.", now, send):
                    out["avvisi"].append("vix")
        except Exception:
            pass
    if now.hour >= SUMMARY_HOUR_UTC:
        parts = []
        for r in rows:
            d = f"{r['day'] * 100:+.1f}%" if r["day"] is not None else "n.d."
            lato = "" if r["ref"] is None else (" ↑12m" if r["price"] > r["ref"] else " ↓12m")
            parts.append(f"{r['code']} {d}{lato}" + (f" ({r['held']} q.)" if r["held"] else ""))
        inport = [r for r in rows if r["held"] and r["day"] is not None]
        tot = ""
        if inport:
            v_now = sum(r["held"] * r["price"] for r in inport)
            v_prev = sum(r["held"] * r["prev_close"] for r in inport)
            tot = f" Paniere in portafoglio {v_now / v_prev - 1:+.1%} oggi, ≈ {v_now:,.0f} €."
        testo = f"[ETF Fineco] Chiusura del {day:%d/%m}: " + ", ".join(parts) + "." + tot + " ↑12m/↓12m = sopra o sotto il prezzo di 12 mesi fa."
        if _once(db, f"riepilogo:{day}", testo, now, send):
            out["avvisi"].append("riepilogo")
    return out
