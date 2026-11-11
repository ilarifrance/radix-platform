"""Diario di un conto CFD su MetaTrader 4 (Axi): legge gli estratti incollati e tiene il registro delle operazioni.

Dal 10/11/2026 Francesco incolla gli estratti MT4 di un conto Axi gestito da una persona di fiducia: li vuole usare
come «raccolta dati» per capire se nel modo di operare di quella persona c'e' un metodo. Qui non si decide nulla e non
parte nessun ordine: si leggono gli estratti, si salvano in archivio (solo sul Mac, mai nel repository), si
ricostruiscono le operazioni chiuse (entrata, uscita, risultato, durata, dollari per punto) e si affianca a ognuna il
contesto che serve a giudicarla: le notizie del giorno in archivio (RSS, GDELT, Wikipedia) e cosa ha fatto il mercato
nei giorni dopo. Ogni dieci operazioni (o quando lo si chiede) esce la pagella: vinte/perse, vincita media contro
perdita media, euro guadagnati per euro perso, esposizione massima.

Formato letto: la pagina «Statement» di MT4 incollata come testo, con le sezioni «Closed Transactions» (ordini),
«Deals» (esecuzioni: entrata «in», uscita «out», righe «balance» per depositi e dividendi), «Positions» (aperte),
«Working Orders» (pendenti) e «Account Summary». I numeri hanno lo spazio come separatore delle migliaia
(«11 179.35»), le date sono nell'ora del server (circa UTC+2).

    python -m radix_trading axi --file estratto.txt        # legge, salva, stampa il diario e la pagella
    python -m radix_trading axi --nota 4681904 "testo"      # appunto su un'operazione (notizia o giudizio)
    python -m radix_trading axi                             # solo diario e pagella dall'archivio
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import pandas as pd

from .store import Store

# Valore di un punto per lotto, in valuta del conto. Indici su Axi: 1 lotto = 1 $ per punto.
POINT_VALUE = {"US500": 1.0, "US30": 1.0, "NAS100": 1.0, "GER40": 1.0, "UK100": 1.0, "XAUUSD": 100.0}
# Mercato in archivio che fa da riferimento per «cosa ha fatto il mercato dopo».
REFERENCE = {"US500": ("yahoo", "SPY"), "NAS100": ("yahoo", "QQQ"), "US30": ("yahoo", "SPY"), "XAUUSD": ("materie", "GLD")}
SERVER_UTC_OFFSET_HOURS = 2       # ora del server MT4 rispetto a UTC (osservato il 10/11/2026)
AFTER_DAYS = (1, 3, 5)            # giorni di borsa dopo l'operazione
SCORECARD_EVERY = 10

SCHEMA = """
CREATE TABLE IF NOT EXISTS axi_deals (ticket INTEGER PRIMARY KEY, ts TEXT NOT NULL, type TEXT NOT NULL, size REAL,
    item TEXT, price REAL, order_ticket INTEGER, entry TEXT, comment TEXT, fee REAL, commission REAL, swap REAL,
    pnl REAL, statement_day TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS axi_positions (statement_day TEXT NOT NULL, ticket INTEGER NOT NULL, open_time TEXT, type TEXT,
    size REAL, item TEXT, price REAL, sl REAL, tp REAL, market REAL, swap REAL, profit REAL,
    PRIMARY KEY (statement_day, ticket));
CREATE TABLE IF NOT EXISTS axi_orders (statement_day TEXT NOT NULL, ticket INTEGER NOT NULL, open_time TEXT, type TEXT,
    size TEXT, item TEXT, price REAL, sl REAL, tp REAL, close_time TEXT, close_price REAL, PRIMARY KEY (statement_day, ticket));
CREATE TABLE IF NOT EXISTS axi_summary (statement_day TEXT PRIMARY KEY, account TEXT, closed_pl REAL, floating_pl REAL,
    equity REAL, balance REAL, deposit REAL, margin REAL, free_margin REAL);
CREATE TABLE IF NOT EXISTS axi_note (ticket INTEGER PRIMARY KEY, testo TEXT NOT NULL, ts TEXT NOT NULL);
"""

_SECTIONS = ("Closed Transactions", "Deals", "Positions", "Working Orders", "Account Summary")
_NUM = re.compile(r"^-?\d[\d ]*(?:\.\d+)?$")


def _num(s: str | None) -> float | None:
    s = (s or "").strip()
    if not s or not _NUM.match(s):
        return None
    return float(s.replace(" ", ""))


def _ts(s: str | None) -> str | None:
    """«2026.11.06 16:39:19» (ora del server) -> ISO UTC."""
    s = (s or "").strip()
    for fmt in ("%Y.%m.%d %H:%M:%S", "%Y.%m.%d %H:%M"):
        try:
            t = datetime.strptime(s, fmt)
        except ValueError:
            continue
        return (t - timedelta(hours=SERVER_UTC_OFFSET_HOURS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return None


def _cells(line: str) -> list[str]:
    if "\t" in line:
        return [c.strip() for c in line.split("\t")]
    return [c.strip() for c in re.split(r"\s{2,}", line.strip())]


def split_sections(text: str) -> dict[str, list[str]]:
    """Righe di ogni sezione dell'estratto, piu' «intestazione» per quello che precede la prima."""
    out: dict[str, list[str]] = {"intestazione": []}
    current = "intestazione"
    for raw in text.replace("\r", "").splitlines():
        line = raw.strip()
        if line in _SECTIONS:
            current = line
            out[current] = []
            continue
        out[current].append(raw)
    return out


def _table(lines: list[str], first_col: str, date_first: bool = False) -> list[list[str]]:
    """Le righe di dati di una tabella: dopo la riga di intestazione, finche' la prima cella e' un numero (o una data)."""
    rows, started = [], False
    for line in lines:
        cells = _cells(line)
        if not started:
            started = bool(cells) and cells[0] == first_col
            continue
        if not cells or not cells[0]:
            if rows:
                break          # riga vuota o di totali: la tabella e' finita
            continue
        ok = _ts(cells[0]) is not None if date_first else _num(cells[0]) is not None
        if not ok:
            break
        rows.append(cells)
    return rows


def parse_statement(text: str, day: str | None = None) -> dict:
    """`day` (AAAA-MM-GG) forza il giorno dell'estratto; senza, si legge dall'intestazione «Name: ... 2026.11.06 23:59»
    e, se l'estratto e' stato incollato senza intestazione, si prende l'ultima data che compare nel testo."""
    sec = split_sections(text)
    head = "\n".join(sec["intestazione"])
    m = re.search(r"Login ID:\s*(\S+)", head)
    account = m.group(1) if m else None
    if not day:
        m = re.search(r"(\d{4}\.\d{2}\.\d{2}) \d{2}:\d{2}", head)
        dates = re.findall(r"\d{4}\.\d{2}\.\d{2}", text)
        day = (m.group(1) if m else max(dates) if dates else None)
        day = day.replace(".", "-") if day else None
    deals = []
    for c in _table(sec.get("Deals", []), "Ticket"):
        c += [""] * (13 - len(c))
        deals.append({"ticket": int(_num(c[0])), "ts": _ts(c[1]), "type": c[2].lower(), "size": _num(c[3]), "item": c[4] or None,
                      "price": _num(c[5]), "order_ticket": int(_num(c[6])) if _num(c[6]) is not None else None,
                      "entry": c[7].lower() or None, "comment": c[8] or None, "fee": _num(c[9]), "commission": _num(c[10]),
                      "swap": _num(c[11]), "pnl": _num(c[12])})
    orders = []
    for c in _table(sec.get("Closed Transactions", []), "Ticket"):
        c += [""] * (13 - len(c))
        orders.append({"ticket": int(_num(c[0])), "open_time": _ts(c[1]), "type": c[2].lower(), "size": c[3], "item": c[4],
                       "price": _num(c[5]), "sl": _num(c[6]), "tp": _num(c[7]), "close_time": _ts(c[8]), "close_price": _num(c[9])})
    positions = []
    for c in _table(sec.get("Positions", []), "Open Time", date_first=True):
        c += [""] * (11 - len(c))
        positions.append({"ticket": int(_num(c[1]) or 0), "open_time": _ts(c[0]), "type": c[2].lower(), "size": _num(c[3]),
                          "item": c[4], "price": _num(c[5]), "sl": _num(c[6]), "tp": _num(c[7]), "market": _num(c[8]),
                          "swap": _num(c[9]), "profit": _num(c[10])})
    working = []
    for c in _table(sec.get("Working Orders", []), "Open Time", date_first=True):
        c += [""] * (10 - len(c))
        working.append({"ticket": int(_num(c[1]) or 0), "open_time": _ts(c[0]), "type": c[2].lower(), "size": _num(c[3]),
                        "item": c[4], "price": _num(c[5]), "sl": _num(c[6]), "tp": _num(c[7]), "market": _num(c[8])})
    return {"account": account, "day": day, "deals": deals, "orders": orders, "positions": positions,
            "working": working, "summary": _summary(sec.get("Account Summary", []))}


_SUMMARY_KEYS = {"Closed Trade P/L": "closed_pl", "Floating P/L": "floating_pl", "Equity": "equity", "Balance": "balance",
                 "Deposit/Withdrawal": "deposit", "Margin Requirement": "margin", "Available Margin": "free_margin"}


def _summary(lines: list[str]) -> dict:
    """«Etichetta:» su una riga e il numero sulla successiva (a volte sulla stessa, dopo un tab)."""
    out: dict[str, float] = {}
    pending = None
    for line in lines:
        for cell in _cells(line):
            if not cell:
                continue
            label = cell.rstrip(":").strip()
            if label in _SUMMARY_KEYS:
                pending = _SUMMARY_KEYS[label]
                continue
            v = _num(cell)
            if v is not None and pending:
                out[pending] = v
                pending = None
    return out


# --- archivio ------------------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def save(store: Store, parsed: dict) -> dict:
    db = store.conn
    db.executescript(SCHEMA)
    day = parsed["day"] or _now()[:10]
    for d in parsed["deals"]:
        db.execute("INSERT OR REPLACE INTO axi_deals VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                   (d["ticket"], d["ts"], d["type"], d["size"], d["item"], d["price"], d["order_ticket"], d["entry"],
                    d["comment"], d["fee"], d["commission"], d["swap"], d["pnl"], day))
    for o in parsed["orders"]:
        db.execute("INSERT OR REPLACE INTO axi_orders VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                   (day, o["ticket"], o["open_time"], o["type"], o["size"], o["item"], o["price"], o["sl"], o["tp"],
                    o["close_time"], o["close_price"]))
    db.execute("DELETE FROM axi_positions WHERE statement_day = ?", (day,))
    for p in parsed["positions"]:
        db.execute("INSERT OR REPLACE INTO axi_positions VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                   (day, p["ticket"], p["open_time"], p["type"], p["size"], p["item"], p["price"], p["sl"], p["tp"],
                    p["market"], p["swap"], p["profit"]))
    s = parsed["summary"]
    if s:
        db.execute("INSERT OR REPLACE INTO axi_summary VALUES (?,?,?,?,?,?,?,?,?)",
                   (day, parsed["account"], s.get("closed_pl"), s.get("floating_pl"), s.get("equity"), s.get("balance"),
                    s.get("deposit"), s.get("margin"), s.get("free_margin")))
    db.commit()
    return {"giorno": day, "esecuzioni": len(parsed["deals"]), "ordini": len(parsed["orders"]),
            "aperte": len(parsed["positions"]), "pendenti": len(parsed["working"])}


def note(store: Store, ticket: int, testo: str) -> None:
    store.conn.executescript(SCHEMA)
    store.conn.execute("INSERT OR REPLACE INTO axi_note VALUES (?,?,?)", (int(ticket), testo, _now()))
    store.conn.commit()


# --- operazioni chiuse -----------------------------------------------------------------------------

def closed_trades(store: Store) -> list[dict]:
    """Una riga per uscita («out»): verso, lotti, entrata ricavata dal risultato (1 lotto = POINT_VALUE per punto),
    uscita, risultato, durata. L'entrata presa dal risultato e' esatta anche quando l'uscita chiude una posizione
    aperta in piu' pezzi; se il valore del punto non e' noto si usa la prima entrata aperta dello stesso verso."""
    store.conn.executescript(SCHEMA)
    rows = store.conn.execute("SELECT ticket, ts, type, size, item, price, entry, pnl, swap, commission, fee FROM axi_deals "
                              "WHERE type IN ('buy','sell') ORDER BY ts, ticket").fetchall()
    notes = dict(store.conn.execute("SELECT ticket, testo FROM axi_note").fetchall())
    open_q: dict[tuple, list] = {}
    out = []
    for ticket, ts, typ, size, item, price, entry, pnl, swap, comm, fee in rows:
        if entry == "in":
            open_q.setdefault((item, typ), []).append([ts, float(size or 0), float(price or 0)])
            continue
        if entry != "out" or not size:
            continue
        side = -1 if typ == "buy" else +1          # «buy out» chiude un corto, «sell out» chiude un lungo
        pv = POINT_VALUE.get(item or "")
        opened_ts, open_price = None, None
        derived = price - side * pnl / (float(size) * pv) if pv and pnl is not None and price is not None else None
        q = open_q.get((item, "buy" if side > 0 else "sell"), [])
        if q:
            # l'entrata e' quella aperta allo stesso prezzo ricavato dal risultato (l'ultima, se piu' d'una: gli stop
            # chiudono i pezzi recenti), altrimenti la piu' vecchia (FIFO)
            pick = q[0]
            if derived is not None:
                same = [e for e in q if abs(e[2] - derived) <= max(0.05, abs(derived) * 1e-5)]
                if same:
                    pick = same[-1]
            opened_ts, open_price = pick[0], pick[2]
            left = float(size)
            for e in [pick] + [e for e in q if e is not pick]:
                if left <= 1e-9:
                    break
                take = min(left, e[1])
                e[1] -= take
                left -= take
            q[:] = [e for e in q if e[1] > 1e-9]
        if derived is not None:
            open_price = derived
        minutes = (pd.Timestamp(ts) - pd.Timestamp(opened_ts)).total_seconds() / 60 if opened_ts and ts else None
        out.append({"ticket": int(ticket), "giorno": (ts or "")[:10], "aperta": opened_ts, "chiusa": ts, "mercato": item,
                    "verso": "lungo" if side > 0 else "corto", "lotti": float(size), "entrata": open_price, "uscita": price,
                    "risultato": float(pnl or 0), "swap": float(swap or 0), "commissioni": float(comm or 0) + float(fee or 0),
                    "minuti": minutes, "per_punto": float(size) * pv if pv else None, "nota": notes.get(int(ticket))})
    return out


def open_positions(store: Store) -> tuple[str | None, list[dict], dict]:
    """Le posizioni aperte e il riepilogo dell'ultimo estratto."""
    store.conn.executescript(SCHEMA)
    row = store.conn.execute("SELECT MAX(statement_day) FROM axi_summary").fetchone()
    day = row[0] if row else None
    if not day:
        return None, [], {}
    cols = ("ticket", "open_time", "type", "size", "item", "price", "sl", "tp", "market", "swap", "profit")
    pos = [dict(zip(cols, r)) for r in store.conn.execute(
        f"SELECT {', '.join(cols)} FROM axi_positions WHERE statement_day = ? ORDER BY open_time", (day,))]
    keys = ("closed_pl", "floating_pl", "equity", "balance", "deposit", "margin", "free_margin")
    s = store.conn.execute(f"SELECT {', '.join(keys)} FROM axi_summary WHERE statement_day = ?", (day,)).fetchone()
    return day, pos, dict(zip(keys, s)) if s else {}


def exposure(positions: list[dict], equity: float | None) -> list[dict]:
    """Per ogni posizione aperta: dollari per punto, perdita allo stop e quota del patrimonio, nozionale."""
    out = []
    for p in positions:
        pv = POINT_VALUE.get(p["item"] or "", 0.0)
        per_point = float(p["size"] or 0) * pv
        side = +1 if p["type"] == "buy" else -1
        loss_at_stop = side * (p["sl"] - p["price"]) * per_point if p.get("sl") and p.get("price") and pv else None
        out.append({**p, "per_punto": per_point, "allo_stop": loss_at_stop,
                    "allo_stop_quota": (loss_at_stop / equity) if (loss_at_stop is not None and equity) else None,
                    "nozionale": float(p["size"] or 0) * float(p.get("market") or p.get("price") or 0) * pv})
    return out


# --- contesto: notizie e mercato dopo ------------------------------------------------------------

# Parole che legano un titolo allo strumento trattato: contano il doppio dei temi generali di mercato.
RELEVANCE = {
    "US500": r"S&P|Wall Street|\bstocks?\b|\bDow\b|Nasdaq|\bFed\b|Federal Reserve|Nvidia|\bHuang\b|Apple|Microsoft|Amazon|Alphabet|"
             r"Treasur|yields?|earnings|tariffs?|midterm|\bjobs report|payrolls|inflation|\bCPI\b|rate (?:cut|hike)",
    "XAUUSD": r"\bgold\b|bullion|\bFed\b|Federal Reserve|dollar|yields?|inflation|war|Iran|Israel|Russia|Ukrain",
}
RELEVANCE["NAS100"] = RELEVANCE["US30"] = RELEVANCE["US500"]
_RELEVANCE = {k: re.compile(v, re.I) for k, v in RELEVANCE.items()}


# Comunicati di piccole societa' quotate («(NASDAQ: ACME)», da GDELT anche «( NASDAQ : ACME )»): non sono il mercato.
_PRESS_RELEASE = re.compile(r"\(\s*(?:NASDAQ|NYSE|OTC[A-Z]*|TSXV?|AMEX)\s*:\s*[A-Z.\-]+\s*\)", re.I)


def news_for(store: Store, day: str, limit: int = 3, item: str | None = None, before: str | None = None) -> list[str]:
    """Titoli del giorno e del giorno prima dall'archivio: feed RSS e GDELT (tabella news) e Wikipedia (news_items).
    Si tengono quelli sui temi di mercato dello studio eventi e si ordinano per pertinenza allo strumento (parole di
    RELEVANCE, poi temi generali), a pari punteggio prima il giorno stesso e il titolo piu' recente. `before` (ISO UTC,
    di solito l'ora di apertura dell'operazione) esclude i titoli usciti dopo: cio' che il trader non poteva sapere.
    Le voci di Wikipedia hanno solo il giorno e restano."""
    from .events import _THEMES
    from .mercato import NEWS_EXTRA, NEWS_THEMES
    pats = [_THEMES[t] for t in NEWS_THEMES if t in _THEMES] + [NEWS_EXTRA]
    rel = _RELEVANCE.get(item or "")
    d0 = (pd.Timestamp(day) - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    d1 = (pd.Timestamp(day) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    titles: list[tuple[str, str, str]] = []     # (giorno, ora, titolo)
    try:
        news = store.load_news(d0 + "T00:00:00Z")
        if not news.empty:
            news = news[news["ts"] < d1 + "T00:00:00Z"]
            if before:
                news = news[news["ts"] <= before]
            titles += [(str(ts)[:10], str(ts), str(t)) for ts, t in zip(news["ts"], news["title"]) if t]
    except Exception:
        pass
    try:
        for d, text in store.conn.execute("SELECT day, text FROM news_items WHERE day IN (?, ?) ORDER BY day", (d0, day)):
            titles.append((d, d, text))
    except Exception:
        pass
    scored, seen = [], set()
    for d, ts, t in titles:
        key = t.lower()[:60]
        themes = sum(1 for p in pats if p.search(t))
        if key in seen or not themes or _PRESS_RELEASE.search(t):
            continue
        seen.add(key)
        specific = len(rel.findall(t)) if rel else 0
        scored.append((2 * specific + themes, d == day, ts, f"{d}: {t[:140]}"))
    scored.sort(key=lambda x: (x[0], x[1], x[2]), reverse=True)
    return [s[3] for s in scored[:limit]]


def market_after(store: Store, item: str, day: str) -> dict:
    """Variazione del mercato di riferimento nei giorni di borsa dopo il giorno dell'operazione, dalla chiusura di quel giorno."""
    ref = REFERENCE.get(item or "")
    if not ref:
        return {}
    bars = store.load_bars(ref[0], ref[1], "1d")
    if bars.empty:
        return {}
    close = bars["close"]
    close.index = pd.to_datetime(close.index).tz_localize(None).normalize()
    pos = close.index.searchsorted(pd.Timestamp(day), side="right") - 1
    if pos < 0:
        return {}
    out = {"riferimento": ref[1], "chiusura_giorno": float(close.iloc[pos])}
    for h in AFTER_DAYS:
        if pos + h < len(close):
            out[f"dopo_{h}"] = float(close.iloc[pos + h] / close.iloc[pos] - 1)
    return out


# --- pagella e diario -------------------------------------------------------------------------------

def max_exposure(store: Store) -> float:
    """Massima esposizione contemporanea nel tempo, in $ per punto: somma delle posizioni aperte insieme (entrate «in»
    meno uscite «out», per strumento e verso), cosi' tre corti aperti nella stessa ora contano come uno solo grande."""
    store.conn.executescript(SCHEMA)
    rows = store.conn.execute("SELECT ts, type, size, item, entry FROM axi_deals WHERE type IN ('buy','sell') AND entry IN ('in','out') "
                              "ORDER BY ts, CASE entry WHEN 'out' THEN 0 ELSE 1 END").fetchall()
    open_pp: dict[tuple, float] = {}
    worst = 0.0
    for ts, typ, size, item, entry in rows:
        pv = POINT_VALUE.get(item or "", 0.0)
        side = typ if entry == "in" else ("sell" if typ == "buy" else "buy")    # «buy out» chiude un corto
        key = (item, side)
        open_pp[key] = open_pp.get(key, 0.0) + (1 if entry == "in" else -1) * float(size or 0) * pv
        worst = max(worst, sum(abs(v) for v in open_pp.values()))
    return worst


def scorecard(trades: list[dict], exposure_max: float | None = None) -> dict:
    if not trades:
        return {"operazioni": 0}
    pnl = [t["risultato"] for t in trades]
    wins = [p for p in pnl if p > 0]
    losses = [p for p in pnl if p < 0]
    per_trade = max((t["per_punto"] or 0) for t in trades)
    return {"operazioni": len(pnl), "vinte": len(wins), "perse": len(losses), "vinte_quota": round(len(wins) / len(pnl), 3),
            "risultato": round(sum(pnl), 2),
            "vincita_media": round(sum(wins) / len(wins), 2) if wins else None,
            "perdita_media": round(sum(losses) / len(losses), 2) if losses else None,
            "per_euro_perso": round(sum(wins) / -sum(losses), 2) if losses and wins else None,
            "peggiore": round(min(pnl), 2), "migliore": round(max(pnl), 2),
            "per_punto_massimo": max(per_trade, exposure_max or 0.0), "per_punto_operazione": per_trade}


def _fmt(x, dec=2):
    return "—" if x is None else f"{x:,.{dec}f}"


def diary_text(store: Store) -> str:
    trades = closed_trades(store)
    day, positions, summary = open_positions(store)
    lines = ["# Diario conto Axi (solo lettura: nessun ordine parte da qui)", ""]
    if day:
        eq = summary.get("equity")
        lines += [f"Ultimo estratto: {day}. Patrimonio {_fmt(eq)} $, saldo {_fmt(summary.get('balance'))} $, "
                  f"aperto {_fmt(summary.get('floating_pl'))} $, margine impegnato {_fmt(summary.get('margin'))} $.", ""]
        if positions:
            lines.append("## Posizioni aperte")
            for p in exposure(positions, eq):
                stop = (f"stop {p['sl']:,.2f} → {p['allo_stop']:+,.0f} $ ({p['allo_stop_quota']:+.0%} del patrimonio)"
                        if p["allo_stop"] is not None and p["allo_stop_quota"] is not None else "senza stop")
                lines.append(f"- {p['item']} {'lungo' if p['type'] == 'buy' else 'corto'} {p['size']:g} lotti a {p['price']:,.2f} "
                             f"({p['per_punto']:g} $/punto, nozionale {p['nozionale']:,.0f} $), {stop}, ora {p.get('profit') or 0:+,.2f} $")
            lines.append("")
    lines.append("## Operazioni chiuse")
    if not trades:
        lines.append("Nessuna.")
    for t in trades:
        dur = ("—" if t["minuti"] is None else f"{t['minuti']:.0f} min" if t["minuti"] < 180 else f"{t['minuti'] / 60:.1f} ore")
        lines.append(f"- {t['giorno']} {t['mercato']} {t['verso']} {t['lotti']:g} lotti: da {_fmt(t['entrata'])} a {_fmt(t['uscita'])}, "
                     f"{t['risultato']:+,.2f} $ in {dur} ({_fmt(t['per_punto'], 0)} $/punto)")
        after = market_after(store, t["mercato"], t["giorno"])
        if any(k.startswith("dopo_") for k in after):
            moves = ", ".join(f"{h} g {after[f'dopo_{h}']:+.1%}" for h in AFTER_DAYS if f"dopo_{h}" in after)
            lines.append(f"  - mercato dopo ({after['riferimento']}): {moves}")
        for n in news_for(store, t["giorno"], item=t["mercato"], before=t["aperta"]):
            lines.append(f"  - notizia: {n}")
        if t["nota"]:
            lines.append(f"  - appunto: {t['nota']}")
    s = scorecard(trades, max_exposure(store))
    lines += ["", "## Pagella"]
    if s["operazioni"]:
        lines.append(f"{s['operazioni']} operazioni: {s['vinte']} vinte, {s['perse']} perse ({s['vinte_quota']:.0%}); "
                     f"vincita media {_fmt(s['vincita_media'])} $, perdita media {_fmt(s['perdita_media'])} $; "
                     f"euro guadagnati per euro perso {_fmt(s['per_euro_perso'])}; risultato {s['risultato']:+,.2f} $; "
                     f"peggiore {s['peggiore']:+,.2f} $, esposizione massima {s['per_punto_massimo']:g} $/punto "
                     f"(posizioni aperte insieme; la singola piu' grande {s['per_punto_operazione']:g}).")
        if s["operazioni"] % SCORECARD_EVERY == 0:
            lines.append(f"Pagella delle {s['operazioni']} operazioni: da leggere con Francesco.")
    else:
        lines.append("Nessuna operazione chiusa.")
    return "\n".join(lines)


def run(store: Store, text: str | None = None, nota: tuple[str, str] | None = None, giorno: str | None = None) -> dict:
    out: dict = {}
    if text:
        out["letto"] = save(store, parse_statement(text, giorno))
    if nota:
        note(store, int(nota[0]), nota[1])
        out["nota"] = {"ticket": int(nota[0])}
    out["pagella"] = scorecard(closed_trades(store), max_exposure(store))
    out["testo"] = diary_text(store)
    return out
