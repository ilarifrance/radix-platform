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
ALERT_HOUR_UTC = 7       # alle 8 italiane, un'ora prima dell'apertura di Borsa Italiana
HOLIDAYS = {(1, 1), (5, 1), (8, 15), (12, 24), (12, 25), (12, 26), (12, 31)}   # chiusure fisse di Borsa Italiana
MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre",
          "ottobre", "novembre", "dicembre"]
WEEKDAYS = ["lunedi'", "martedi'", "mercoledi'", "giovedi'", "venerdi'", "sabato", "domenica"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS etf_alerts (month TEXT PRIMARY KEY, ts TEXT NOT NULL, text TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS etf_targets (month TEXT NOT NULL, symbol TEXT NOT NULL, shares INTEGER NOT NULL,
    price REAL NOT NULL, PRIMARY KEY (month, symbol));
"""


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


def plan(store: Store, closes: dict[str, pd.Series], month: str, cap: float) -> list[dict]:
    db = store.conn
    db.executescript(SCHEMA)
    prev_row = db.execute("SELECT month FROM etf_targets WHERE month < ? ORDER BY month DESC LIMIT 1", (month,)).fetchone()
    prev = dict(db.execute("SELECT symbol, shares FROM etf_targets WHERE month = ?", (prev_row[0],)).fetchall()) if prev_row else {}
    out = []
    for sym, name in ETFS.items():
        sig = signal(closes.get(sym, pd.Series(dtype=float)))
        held = int(prev.get(sym, 0))
        if sig is None:
            out.append({"symbol": sym, "name": name, "action": "dati mancanti", "shares": held, "price": None, "in": None})
            continue
        if sig["in"] and held == 0:
            shares = int(cap * WEIGHT // sig["price"])
            action = "COMPRA" if shares > 0 else "quota sotto il prezzo di una quota"
        elif sig["in"]:
            shares, action = held, "tieni"
        elif held > 0:
            shares, action = 0, "VENDI tutto"
        else:
            shares, action = 0, "resta liquido"
        out.append({"symbol": sym, "name": name, "action": action, "shares": shares, "held": held, **sig})
    return out


def alert_text(month: str, rows: list[dict], cap: float, day: date) -> str:
    y, m = month.split("-")
    lines = [f"[ETF Fineco] Piano di {MONTHS[int(m) - 1]} {y}, capitale di riferimento {cap:,.0f} €. "
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
        if r["action"] == "COMPRA":
            lines.append(f"• COMPRA {r['shares']} quote {code} ({r['name']}) a circa {r['price']:.2f} € ≈ {value:,.0f} €: "
                         f"prezzo {trend} quello di 12 mesi fa ({r['ref']:.2f}).")
        elif r["action"] == "VENDI tutto":
            lines.append(f"• VENDI tutte le {r['held']} quote {code} ({r['name']}): prezzo {r['price']:.2f} € {trend} "
                         f"quello di 12 mesi fa ({r['ref']:.2f}).")
        elif r["action"] == "tieni":
            lines.append(f"• Tieni {r['shares']} quote {code} ({r['name']}) ≈ {value:,.0f} €, trend ancora {trend}.")
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
    rows = plan(store, closes, month, cap)
    if all(r["price"] is None for r in rows):   # Yahoo giu' e archivio vuoto: niente avviso, si riprova al giro dopo
        return {"mese": month, "giorno": day.isoformat(), "errore": "dati mancanti per tutti gli ETF, riprovo al prossimo giro"}
    text = alert_text(month, rows, cap, day)
    sent = send(text)
    db.execute("INSERT OR REPLACE INTO etf_alerts VALUES (?, ?, ?)", (month, now.strftime("%Y-%m-%dT%H:%M:%SZ"), text))
    db.executemany("INSERT OR REPLACE INTO etf_targets VALUES (?, ?, ?, ?)",
                   [(month, r["symbol"], r["shares"], r["price"] or 0.0) for r in rows])
    db.commit()
    return {"mese": month, "giorno": day.isoformat(), "capitale": cap, "inviato": sent, "piano": rows, "testo": text}
