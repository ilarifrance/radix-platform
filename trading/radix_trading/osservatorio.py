"""Osservatorio «leva 20 su segnali concreti»: operazioni simulate con i costi dei CFD, nessun euro vero.

Decisione di Francesco del 31/10/2026: «proviamo leva 20 ma quando hai segnali concreti geopolitici o
macroeconomici». Nei nostri studi nessun segnale del genere ha retto la verifica su dati mai visti (0 su 1.124
prove su notizie, calendario e shock; 0 su 144 al minuto), quindi prima di qualunque conto a leva si osserva.

Cinque regole scritte prima e non piu' toccate (RULES). Ogni volta che una scatta si registra un'operazione
simulata: margine fisso MARGIN_EUR, leva massima ESMA per quel mercato, entrata all'apertura del primo giorno di
mercato dopo il segnale, uscita alla chiusura dopo `days` giorni di mercato, spread per lato, finanziamento
notturno dei CFD su tutto il nozionale, chiusura forzata quando la perdita arriva a meta' del margine (regola
ESMA: a leva 20 basta un movimento contrario del 2,5%). Avviso Telegram a ogni apertura e chiusura, riepilogo
il venerdi'. `replay` rifa' le stesse regole sul passato, cosi' si sa cosa aspettarsi prima di guardare.
Gira nel giro `daily` (23:30 UTC): i prezzi del giorno arrivano il giorno dopo, quindi un'operazione viene
registrata con un giorno di ritardo ma ai prezzi veri di quel giorno.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import pandas as pd

from . import alerts, events, universe
from .store import Store

MARGIN_EUR = 200.0        # margine fisso per operazione simulata
FINANCING_YEAR = 0.065    # costo notturno dei CFD, su tutto il nozionale
CLOSE_OUT = 0.5           # ESMA: il broker chiude quando la perdita arriva a meta' del margine
LOOKBACK_DAYS = 14        # a ogni giro si cercano segnali nuovi negli ultimi 14 giorni
TAG = "[SIMULATO leva]"


@dataclass(frozen=True)
class Rule:
    key: str
    title: str
    signals: tuple[str, ...]   # colonne di events (notizie:, shock:, calendario:)
    market: str                # nome in events.ASSETS
    side: int                  # +1 lungo, -1 corto, 0 = nel verso del giorno del segnale
    days: int                  # giorni di mercato di permanenza
    leverage: float            # leva massima ESMA per quel mercato
    spread: float              # costo per lato, quota del nozionale


RULES = (
    Rule("geopolitica_oro", "Shock geopolitico (guerra, Medio Oriente, Russia-Ucraina, sanzioni) → oro lungo 3 giorni, leva 20",
         ("notizie:guerra", "notizie:medio_oriente", "notizie:russia_ucraina", "notizie:sanzioni"), "Oro", +1, 3, 20, 0.0001),
    Rule("panico_spx", "Panico (VIX +25% o S&P −3σ) → S&P 500 lungo 5 giorni, leva 20",
         ("shock:vix_esplode", "shock:spx_crollo"), "S&P 500", +1, 5, 20, 0.0001),
    Rule("fed_segui", "Giorno Fed → S&P 500 nel verso della giornata, 1 giorno, leva 20",
         ("calendario:fomc",), "S&P 500", 0, 1, 20, 0.0001),
    Rule("petrolio_segui", "Shock petrolio (±3σ) → petrolio nel verso dello shock, 3 giorni, leva 10",
         ("shock:petrolio_shock",), "Petrolio", 0, 3, 10, 0.0005),
    Rule("trump_bitcoin", "Picco di notizie su Trump → Bitcoin corto 3 giorni, leva 2",
         ("notizie:trump",), "Bitcoin", -1, 3, 2, 0.001),
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS oss_trades (id INTEGER PRIMARY KEY AUTOINCREMENT, rule TEXT NOT NULL,
    signal_day TEXT NOT NULL, market TEXT NOT NULL, side INTEGER NOT NULL, leverage REAL NOT NULL,
    entry_day TEXT NOT NULL, entry REAL NOT NULL, exit_day TEXT, exit REAL, pnl REAL, pnl_1x REAL, costs REAL,
    closed_out INTEGER, status TEXT NOT NULL, UNIQUE (rule, signal_day));
CREATE TABLE IF NOT EXISTS oss_reports (week TEXT PRIMARY KEY, ts TEXT NOT NULL);
"""


def load_bars(store: Store, market_name: str) -> pd.DataFrame:
    """Barre giornaliere (apertura, massimo, minimo, chiusura) del mercato, indice senza fuso."""
    market, sym = events.ASSETS[market_name]
    if market == "crypto":
        tier = universe.FAST
        df = store.load_bars(tier["venue"], sym, tier["timeframe"])
        hist = store.load_bars(tier["history_venue"], sym, tier["timeframe"])   # storico lungo Binance, dove Kraken manca
        if not hist.empty:
            df = pd.concat([hist[~hist.index.isin(df.index)], df]).sort_index()
        if not df.empty:
            df = df.resample("D").agg({"open": "first", "high": "max", "low": "min", "close": "last"}).dropna()
    else:
        df = store.load_bars(universe.MARKETS[market]["venue"], sym, "1d")
    if df.empty:
        return pd.DataFrame(columns=["open", "high", "low", "close"])
    df.index = pd.to_datetime(df.index).tz_localize(None).normalize()
    return df[~df.index.duplicated(keep="last")][["open", "high", "low", "close"]].astype(float)


def signals(store: Store) -> pd.DataFrame:
    """Giorni-evento come nello studio degli eventi: notizie (Wikipedia), shock di mercato, calendario Fed."""
    from . import multi
    assets = events.load_assets(store)
    macro = multi.load_macro(store, ("VIXCLS", "DGS10", "DTWEXBGS"))
    if not macro.empty:
        macro.index = pd.to_datetime(macro.index).tz_localize(None)
    frames = [events.news_events(events.theme_counts(store)).add_prefix("notizie:"),
              events.market_shocks(assets, macro).add_prefix("shock:"),
              events.calendar_events(store).add_prefix("calendario:")]
    frames = [f for f in frames if not f.empty]
    if not frames:
        return pd.DataFrame()
    ev = pd.concat(frames, axis=1).fillna(False).astype(bool).sort_index()
    ev.index = pd.to_datetime(ev.index).normalize()
    return ev


def trigger_days(rule: Rule, ev: pd.DataFrame) -> pd.DatetimeIndex:
    cols = [c for c in rule.signals if c in ev.columns]
    if not cols or ev.empty:
        return pd.DatetimeIndex([])
    return ev.index[ev[cols].any(axis=1)]


def simulate(rule: Rule, bars: pd.DataFrame, signal_day: pd.Timestamp) -> dict | None:
    """Una operazione simulata; None se il primo giorno di mercato dopo il segnale non e' ancora arrivato."""
    idx = bars.index
    side = rule.side
    if side == 0:  # nel verso del giorno del segnale (primo giorno di mercato da quel giorno in poi)
        d = idx.searchsorted(signal_day, side="left")
        if d >= len(idx) or d == 0:
            return None
        move = bars["close"].iloc[d] / bars["close"].iloc[d - 1] - 1
        if move == 0:
            return None
        side, entry_pos = (1 if move > 0 else -1), d + 1
    else:
        entry_pos = idx.searchsorted(signal_day, side="right")
    if entry_pos >= len(idx):
        return None
    entry = float(bars["open"].iloc[entry_pos])
    exit_pos = entry_pos + rule.days - 1
    stop = CLOSE_OUT / rule.leverage
    notional = MARGIN_EUR * rule.leverage
    exit_price, exit_day, closed_out, status = None, None, False, "aperta"
    for k in range(entry_pos, min(exit_pos, len(idx) - 1) + 1):
        worst = bars["low"].iloc[k] if side > 0 else bars["high"].iloc[k]
        if side * (worst / entry - 1) <= -stop:
            exit_price, exit_day, closed_out, status = entry * (1 - side * stop), idx[k], True, "chiusa"
            break
    if not closed_out and exit_pos < len(idx):
        exit_price, exit_day, status = float(bars["close"].iloc[exit_pos]), idx[exit_pos], "chiusa"
    mark_day = exit_day if exit_day is not None else idx[-1]
    mark = exit_price if exit_price is not None else float(bars["close"].iloc[-1])
    nights = max((mark_day - idx[entry_pos]).days, 0)
    costs = 2 * rule.spread * notional + FINANCING_YEAR / 365 * notional * nights
    gross = side * (mark / entry - 1)
    return {"rule": rule.key, "signal_day": signal_day.date().isoformat(), "market": rule.market, "side": side,
            "leverage": rule.leverage, "entry_day": idx[entry_pos].date().isoformat(), "entry": entry,
            "exit_day": exit_day.date().isoformat() if exit_day is not None else None, "exit": exit_price,
            "pnl": gross * notional - costs, "pnl_1x": gross * MARGIN_EUR, "costs": costs,
            "closed_out": int(closed_out), "status": status}


def _coin(market: str) -> str:
    return market


def _open_text(t: dict) -> str:
    verso = "LUNGO" if t["side"] > 0 else "CORTO"
    return (f"{TAG} Segnale «{t['rule']}» del {t['signal_day']}: operazione simulata {verso} su {t['market']} a leva "
            f"{t['leverage']:g}, margine {MARGIN_EUR:.0f} € (nozionale {MARGIN_EUR * t['leverage']:,.0f} €), entrata "
            f"{t['entry']:,.2f} il {t['entry_day']}. Chiusura forzata a {CLOSE_OUT / t['leverage']:.1%} contro. Nessun euro vero.")


def _close_text(t: dict) -> str:
    how = "chiusura forzata del broker" if t["closed_out"] else "uscita a tempo"
    return (f"{TAG} Chiusa ({how}) l'operazione «{t['rule']}» su {t['market']}: da {t['entry']:,.2f} a {t['exit']:,.2f}, "
            f"risultato {t['pnl']:+.2f} € sul margine di {MARGIN_EUR:.0f} € ({t['pnl'] / MARGIN_EUR:+.0%}), "
            f"costi {t['costs']:.2f} €; senza leva sarebbe stato {t['pnl_1x']:+.2f} €.")


def _insert(db, t: dict) -> None:
    db.execute("INSERT OR IGNORE INTO oss_trades (rule, signal_day, market, side, leverage, entry_day, entry, exit_day, exit, "
               "pnl, pnl_1x, costs, closed_out, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
               (t["rule"], t["signal_day"], t["market"], t["side"], t["leverage"], t["entry_day"], t["entry"],
                t["exit_day"], t["exit"], t["pnl"], t["pnl_1x"], t["costs"], t["closed_out"], t["status"]))


def _busy(existing: list[tuple], signal_day: pd.Timestamp) -> bool:
    """Vero se c'e' gia' un'operazione della regola aperta o la cui finestra copre questo segnale."""
    for status, exit_day in existing:
        if status == "aperta" or (exit_day and pd.Timestamp(exit_day) > signal_day):
            return True
    return False


def step(store: Store, now: datetime | None = None, send=alerts.send) -> dict:
    now = now or datetime.now(timezone.utc)
    db = store.conn
    db.executescript(SCHEMA)
    ev = signals(store)
    since = pd.Timestamp(now.date()) - pd.Timedelta(days=LOOKBACK_DAYS)
    opened, closed = [], []
    for rule in RULES:
        bars = load_bars(store, rule.market)
        if bars.empty:
            continue
        # chiude o aggiorna le operazioni aperte
        for tid, signal_day in db.execute("SELECT id, signal_day FROM oss_trades WHERE rule = ? AND status = 'aperta'", (rule.key,)).fetchall():
            t = simulate(rule, bars, pd.Timestamp(signal_day))
            if t and t["status"] == "chiusa":
                db.execute("UPDATE oss_trades SET exit_day=?, exit=?, pnl=?, pnl_1x=?, costs=?, closed_out=?, status='chiusa' WHERE id=?",
                           (t["exit_day"], t["exit"], t["pnl"], t["pnl_1x"], t["costs"], t["closed_out"], tid))
                send(_close_text(t))
                closed.append(t)
        # apre le nuove
        existing = db.execute("SELECT status, exit_day FROM oss_trades WHERE rule = ?", (rule.key,)).fetchall()
        done = {r[0] for r in db.execute("SELECT signal_day FROM oss_trades WHERE rule = ?", (rule.key,))}
        for day in trigger_days(rule, ev):
            if day < since or day.date().isoformat() in done or _busy(existing, day):
                continue
            t = simulate(rule, bars, day)
            if t is None:
                continue
            _insert(db, t)
            existing.append((t["status"], t["exit_day"]))
            send(_open_text(t))
            opened.append(t)
            if t["status"] == "chiusa":   # entrata e uscita gia' nei dati (succede con il ritardo di un giorno)
                send(_close_text(t))
                closed.append(t)
    db.commit()
    report = None
    week = now.strftime("%G-W%V")
    if now.weekday() == 4 and db.execute("SELECT 1 FROM oss_reports WHERE week = ?", (week,)).fetchone() is None:
        report = report_text(store, week)
        send(report)
        db.execute("INSERT INTO oss_reports VALUES (?, ?)", (week, now.strftime("%Y-%m-%dT%H:%M:%SZ")))
        db.commit()
    return {"aperte": [t["rule"] for t in opened], "chiuse": [t["rule"] for t in closed], "riepilogo": report}


def stats(trades: list[dict]) -> dict:
    done = [t for t in trades if t["status"] == "chiusa"]
    if not done:
        return {"operazioni": 0}
    pnl = [t["pnl"] for t in done]
    return {"operazioni": len(done), "in_guadagno": sum(p > 0 for p in pnl), "risultato": round(sum(pnl), 2),
            "senza_leva": round(sum(t["pnl_1x"] for t in done), 2), "costi": round(sum(t["costs"] for t in done), 2),
            "chiusure_forzate": sum(t["closed_out"] for t in done), "peggiore": round(min(pnl), 2), "migliore": round(max(pnl), 2)}


def report_text(store: Store, week: str) -> str:
    rows = store.conn.execute("SELECT rule, market, side, leverage, entry_day, entry, exit_day, exit, pnl, pnl_1x, costs, "
                              "closed_out, status FROM oss_trades").fetchall()
    keys = ["rule", "market", "side", "leverage", "entry_day", "entry", "exit_day", "exit", "pnl", "pnl_1x", "costs", "closed_out", "status"]
    trades = [dict(zip(keys, r)) for r in rows]
    s = stats(trades)
    if not s["operazioni"]:
        return f"{TAG} Settimana {week}: nessuna operazione simulata chiusa finora ({sum(t['status'] == 'aperta' for t in trades)} aperte)."
    per_rule = []
    for rule in RULES:
        rs = stats([t for t in trades if t["rule"] == rule.key])
        if rs["operazioni"]:
            per_rule.append(f"{rule.key} {rs['operazioni']} op. {rs['risultato']:+.0f} €")
    return (f"{TAG} Settimana {week}, dall'inizio: {s['operazioni']} operazioni chiuse ({s['in_guadagno']} in guadagno), "
            f"risultato {s['risultato']:+.2f} € con margini da {MARGIN_EUR:.0f} € (senza leva {s['senza_leva']:+.2f} €), "
            f"costi {s['costi']:.2f} €, chiusure forzate {s['chiusure_forzate']}. Per regola: {'; '.join(per_rule)}. "
            f"Aperte ora: {sum(t['status'] == 'aperta' for t in trades)}. Tutto simulato, nessun euro vero.")


def replay(store: Store, since: str = "2015-01-01") -> dict:
    """Le stesse cinque regole sul passato, una dopo l'altra, senza finestre sovrapposte: cosa aspettarsi."""
    ev = signals(store)
    out = {"dal": since, "regole": {}}
    for rule in RULES:
        bars = load_bars(store, rule.market)
        trades, last_exit = [], None
        for day in trigger_days(rule, ev):
            if day < pd.Timestamp(since) or (last_exit is not None and day < last_exit):
                continue
            t = simulate(rule, bars, day) if not bars.empty else None
            if t is None or t["status"] != "chiusa":
                continue
            trades.append(t)
            last_exit = pd.Timestamp(t["exit_day"])
        s = stats(trades)
        years = {}
        for t in trades:
            years[t["exit_day"][:4]] = round(years.get(t["exit_day"][:4], 0.0) + t["pnl"], 2)
        out["regole"][rule.key] = {"titolo": rule.title, **s, "per_anno": years}
    tot = [t for r in out["regole"] for t in []]  # placeholder for totals computed below
    out["totale"] = {k: round(sum(r.get(k, 0) for r in out["regole"].values()), 2) for k in ("operazioni", "risultato", "senza_leva", "costi", "chiusure_forzate")}
    return out
