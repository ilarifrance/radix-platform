"""Corsia simulata «metodo 60%» (chiesta da Francesco il 10/11/2026): la regola che guadagna piu' di quanto perde.

Francesco: «dobbiamo trovare un metodo che abbia una percentuale di riuscita intorno al 60%... guadagno medio superiore
alla perdita». La misura concordata: euro guadagnati per euro perso (profit factor) sopra 1 dopo i costi dei CFD,
verificato su anni che la regola non ha visto. La sera del 10/11 si sono provate 1.920 combinazioni (8 mercati, soglie,
filtri di trend, stop e target, durata) su dati 2005-2019 e verifica 2020-2026: regge una sola famiglia, sugli indici
americani e non in Europa o Giappone. Questa corsia la registra con parametri FISSI, scritti qui e non piu' toccati:

- mercati: S&P 500 (SPY), Nasdaq 100 (QQQ), Russell 2000 (IWM);
- segnale: chiusura nel 10% piu' basso dell'escursione di giornata (IBS < 0,1) con la chiusura sopra la media a 200 giorni;
- entrata all'apertura del giorno dopo, una posizione per mercato alla volta (i segnali durante un'operazione si saltano);
- target +3% toccato in giornata (se l'apertura e' gia' oltre, si esce all'apertura); stop −3% misurato sulla chiusura,
  con uscita all'apertura del giorno dopo (un CFD tratta 23 ore al giorno: lo stop intraday sui minimi della seduta
  americana non e' lo stesso strumento; sullo storico, costi compresi, lo stop sulla chiusura rende 1,38 per euro perso
  contro 1,34 dello stop intraday; con lo stop intraday 21 operazioni su 672 sono passate oltre lo stop in apertura,
  la peggiore −5,7%);
- uscita a tempo alla chiusura del decimo giorno di mercato;
- misura: rischio 2% di un conto simulato da 10.000 € per operazione (nozionale 6.667 €), al massimo tre posizioni
  (leva 2); costi CFD: spread 0,02% per lato e finanziamento notturno 6,5% l'anno sul nozionale.

Cosa aspettarsi (`replay` sullo storico 2005-2026 con queste regole, misurato sul Mac il 10/11): 667 operazioni, 60%
vinte, 1,31 euro guadagnati per euro perso, vincita media +155 € contro perdita media −178 €, +14.892 € in 21 anni su
un conto simulato da 10.000 € (circa +7% l'anno), anni negativi 2008, 2010, 2012, 2014, 2015, 2022, 2026 (il peggiore
−1.470 €); con il rischio composto a leva 2 +7,7% l'anno e perdita massima −19%. Le entrate casuali con le stesse
uscite rendono 1,22: il vantaggio della regola e' reale ma modesto. Nessun euro vero: la corsia
scrive un'operazione simulata a ogni segnale e avvisa su Telegram la sera stessa («domani all'apertura...»), cosi'
Francesco vede la regola lavorare dal vivo prima di qualunque decisione. Gira nel giro `daily` (23:30 UTC): i prezzi
del giorno arrivano la sera, il segnale della sera vale per l'apertura del giorno dopo.

    python -m radix_trading metodo60                      # un giro (come nel daily)
    python -m radix_trading metodo60 --prova              # stampa gli avvisi senza mandarli
    python -m radix_trading metodo60 --from 2005-01-01    # la stessa regola sul passato
"""

from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from . import alerts
from .store import Store

MARKETS = {"SPY": "S&P 500", "QQQ": "Nasdaq 100", "IWM": "Russell 2000"}
VENUE = "yahoo"
IBS_MAX = 0.10
MA_DAYS = 200
STOP = 0.03               # sulla chiusura, uscita all'apertura dopo
TARGET = 0.03             # toccato in giornata
MAX_DAYS = 10             # giorni di mercato, entrata compresa
ACCOUNT_EUR = 10_000.0    # conto simulato
RISK = 0.02               # quota del conto persa allo stop
NOTIONAL_EUR = ACCOUNT_EUR * RISK / STOP
SPREAD = 0.0002           # per lato
FINANCING_YEAR = 0.065
LOOKBACK_DAYS = 14
TAG = "[SIMULATO metodo60]"

SCHEMA = """
CREATE TABLE IF NOT EXISTS m60_trades (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, signal_day TEXT NOT NULL,
    entry_day TEXT, entry REAL, exit_day TEXT, exit REAL, how TEXT, pnl REAL, costs REAL, status TEXT NOT NULL,
    UNIQUE (symbol, signal_day));
CREATE TABLE IF NOT EXISTS m60_reports (week TEXT PRIMARY KEY, ts TEXT NOT NULL);
"""
_COLS = ("symbol", "signal_day", "entry_day", "entry", "exit_day", "exit", "how", "pnl", "costs", "status")


def load_bars(store: Store, symbol: str) -> pd.DataFrame:
    df = store.load_bars(VENUE, symbol, "1d")
    if df.empty:
        return pd.DataFrame(columns=["open", "high", "low", "close"])
    df.index = pd.to_datetime(df.index).tz_localize(None).normalize()
    df = df[~df.index.duplicated(keep="last")][["open", "high", "low", "close"]].astype(float)
    return df[(df["high"] >= df["low"]) & (df["open"] > 0)]


def signal_days(bars: pd.DataFrame) -> pd.DatetimeIndex:
    """Giorni con chiusura sul minimo (IBS < 0,1) e sopra la media a 200 giorni."""
    if len(bars) < MA_DAYS + 1:
        return pd.DatetimeIndex([])
    rng = bars["high"] - bars["low"]
    ibs = (bars["close"] - bars["low"]) / rng.where(rng > 0)
    ma = bars["close"].rolling(MA_DAYS).mean()
    sig = (ibs < IBS_MAX) & (bars["close"] > ma)
    return bars.index[sig.fillna(False)]


def simulate(bars: pd.DataFrame, signal_day: pd.Timestamp, notional: float = NOTIONAL_EUR) -> dict:
    """Una operazione simulata dal segnale: «segnalata» finche' non c'e' l'apertura dopo, «aperta», poi «chiusa»."""
    idx = bars.index
    signal_day = pd.Timestamp(signal_day).normalize()
    base = {"signal_day": signal_day.date().isoformat(), "entry_day": None, "entry": None, "exit_day": None, "exit": None,
            "how": None, "pnl": None, "costs": None, "status": "segnalata"}
    entry_pos = idx.searchsorted(signal_day, side="right")
    if entry_pos >= len(idx):
        return base
    entry = float(bars["open"].iloc[entry_pos])
    stop_level, target_level = entry * (1 - STOP), entry * (1 + TARGET)
    last_pos = entry_pos + MAX_DAYS - 1
    exit_price, exit_day, how = None, None, None
    for k in range(entry_pos, min(last_pos, len(idx) - 1) + 1):
        o, h, c = (float(bars[col].iloc[k]) for col in ("open", "high", "close"))
        if o >= target_level:
            exit_price, exit_day, how = o, idx[k], "target in apertura"
            break
        if h >= target_level:
            exit_price, exit_day, how = target_level, idx[k], "target"
            break
        if c <= stop_level:
            how = "stop"
            if k + 1 < len(idx):
                exit_price, exit_day = float(bars["open"].iloc[k + 1]), idx[k + 1]
            break
        if k == last_pos:
            exit_price, exit_day, how = c, idx[k], "tempo"
            break
    mark_day = exit_day if exit_day is not None else idx[-1]
    mark = exit_price if exit_price is not None else float(bars["close"].iloc[-1])
    nights = max((mark_day - idx[entry_pos]).days, 0)
    costs = 2 * SPREAD * notional + FINANCING_YEAR / 365 * notional * nights
    out = {**base, "entry_day": idx[entry_pos].date().isoformat(), "entry": entry, "how": how,
           "pnl": (mark / entry - 1) * notional - costs, "costs": costs,
           "status": "chiusa" if exit_price is not None else "aperta",
           "stop_level": stop_level, "target_level": target_level, "mark": mark,
           "last_day": idx[last_pos].date().isoformat() if last_pos < len(idx) else None}
    if exit_price is not None:
        out["exit_day"], out["exit"] = exit_day.date().isoformat(), exit_price
    return out


# --- testi degli avvisi --------------------------------------------------------------------------

def _name(sym: str) -> str:
    return f"{MARKETS.get(sym, sym)} ({sym})"


def signal_text(sym: str, t: dict, close: float) -> str:
    return (f"{TAG} Segnale di oggi su {_name(sym)}: chiusura {close:,.2f} sul minimo di giornata, sopra la media a 200 giorni. "
            f"Domani all'apertura la regola COMPRA: nozionale simulato {NOTIONAL_EUR:,.0f} € (rischio {ACCOUNT_EUR * RISK:,.0f} €, "
            f"il {RISK:.0%} di un conto da {ACCOUNT_EUR:,.0f} €), target +{TARGET:.0%} in giornata, stop −{STOP:.0%} sulla chiusura, "
            f"uscita entro {MAX_DAYS} giorni di mercato. Nessun euro vero.")


def open_text(sym: str, t: dict) -> str:
    return (f"{TAG} Entrata su {_name(sym)} a {t['entry']:,.2f} il {t['entry_day']} (segnale del {t['signal_day']}): "
            f"target {t['target_level']:,.2f}, stop sulla chiusura {t['stop_level']:,.2f}, uscita a tempo il {t['last_day'] or '—'}. "
            f"Nozionale simulato {NOTIONAL_EUR:,.0f} €.")


def close_text(sym: str, t: dict) -> str:
    return (f"{TAG} Chiusa ({t['how']}) l'operazione su {_name(sym)}: da {t['entry']:,.2f} a {t['exit']:,.2f} "
            f"({t['exit'] / t['entry'] - 1:+.2%}), risultato {t['pnl']:+.2f} € su {NOTIONAL_EUR:,.0f} € simulati, costi {t['costs']:.2f} €.")


# --- giro quotidiano ----------------------------------------------------------------------------

def _rows(db, where: str, params=()) -> list[dict]:
    return [dict(zip(("id",) + _COLS, r)) for r in db.execute(f"SELECT id, {', '.join(_COLS)} FROM m60_trades {where}", params)]


def _update(db, tid: int, t: dict) -> None:
    db.execute("UPDATE m60_trades SET entry_day=?, entry=?, exit_day=?, exit=?, how=?, pnl=?, costs=?, status=? WHERE id=?",
               (t["entry_day"], t["entry"], t["exit_day"], t["exit"], t["how"], t["pnl"], t["costs"], t["status"], tid))


def _busy(trades: list[dict], signal_day: pd.Timestamp) -> bool:
    """Una posizione per mercato: segnale saltato se un'operazione e' in corso o la sua finestra copre il giorno."""
    for t in trades:
        if t["status"] in ("segnalata", "aperta"):
            return True
        if t["exit_day"] and pd.Timestamp(t["exit_day"]) > signal_day:
            return True
    return False


def step(store: Store, now: datetime | None = None, send=alerts.send) -> dict:
    now = now or datetime.now(timezone.utc)
    db = store.conn
    db.executescript(SCHEMA)
    since = pd.Timestamp(now.date()) - pd.Timedelta(days=LOOKBACK_DAYS)
    out = {"segnali": [], "aperte": [], "chiuse": [], "riepilogo": None}
    for sym in MARKETS:
        bars = load_bars(store, sym)
        if bars.empty:
            continue
        # aggiorna le operazioni in corso
        for row in _rows(db, "WHERE symbol = ? AND status IN ('segnalata', 'aperta')", (sym,)):
            t = simulate(bars, pd.Timestamp(row["signal_day"]))
            if t["status"] == row["status"] and t["status"] != "aperta":
                continue
            _update(db, row["id"], t)
            if row["status"] == "segnalata" and t["status"] in ("aperta", "chiusa"):
                send(open_text(sym, t))
                out["aperte"].append(sym)
            if t["status"] == "chiusa":
                send(close_text(sym, t))
                out["chiuse"].append(sym)
        # segnali nuovi
        existing = _rows(db, "WHERE symbol = ?", (sym,))
        done = {r["signal_day"] for r in existing}
        for day in signal_days(bars):
            if day < since or day.date().isoformat() in done or _busy(existing, day):
                continue
            t = simulate(bars, day)
            db.execute(f"INSERT OR IGNORE INTO m60_trades ({', '.join(_COLS)}) VALUES ({', '.join('?' * len(_COLS))})",
                       (sym, *(t[c] for c in _COLS[1:])))
            existing.append({**t, "symbol": sym})
            send(signal_text(sym, t, float(bars["close"].loc[day])))
            out["segnali"].append(sym)
            if t["status"] in ("aperta", "chiusa"):       # l'apertura dopo e' gia' in archivio (dati arrivati in ritardo)
                send(open_text(sym, t))
                out["aperte"].append(sym)
            if t["status"] == "chiusa":
                send(close_text(sym, t))
                out["chiuse"].append(sym)
    db.commit()
    week = now.strftime("%G-W%V")
    if now.weekday() == 4 and db.execute("SELECT 1 FROM m60_reports WHERE week = ?", (week,)).fetchone() is None:
        out["riepilogo"] = report_text(store, week)
        send(out["riepilogo"])
        db.execute("INSERT INTO m60_reports VALUES (?, ?)", (week, now.strftime("%Y-%m-%dT%H:%M:%SZ")))
        db.commit()
    return out


# --- numeri -------------------------------------------------------------------------------------

def stats(trades: list[dict]) -> dict:
    done = [t for t in trades if t["status"] == "chiusa"]
    if not done:
        return {"operazioni": 0}
    pnl = [t["pnl"] for t in done]
    wins, losses = [p for p in pnl if p > 0], [p for p in pnl if p <= 0]
    return {"operazioni": len(done), "vinte": len(wins), "vinte_quota": round(len(wins) / len(done), 3),
            "risultato": round(sum(pnl), 2), "costi": round(sum(t["costs"] for t in done), 2),
            "vincita_media": round(sum(wins) / len(wins), 2) if wins else None,
            "perdita_media": round(sum(losses) / len(losses), 2) if losses else None,
            "per_euro_perso": round(sum(wins) / -sum(losses), 2) if wins and losses and sum(losses) < 0 else None,
            "peggiore": round(min(pnl), 2), "migliore": round(max(pnl), 2),
            "per_uscita": {k: sum(1 for t in done if t["how"] == k) for k in ("target", "target in apertura", "stop", "tempo")}}


def report_text(store: Store, week: str) -> str:
    trades = _rows(store.conn, "")
    s = stats(trades)
    aperte = sum(t["status"] in ("segnalata", "aperta") for t in trades)
    if not s["operazioni"]:
        return f"{TAG} Settimana {week}: nessuna operazione simulata chiusa finora ({aperte} in corso). Attesi ~31 segnali l'anno sui tre indici."
    per_sym = "; ".join(f"{sym} {st['operazioni']} op. {st['risultato']:+.0f} €"
                        for sym in MARKETS for st in [stats([t for t in trades if t["symbol"] == sym])] if st["operazioni"])
    pf = f"{s['per_euro_perso']:.2f}" if s["per_euro_perso"] is not None else "—"
    return (f"{TAG} Settimana {week}, dall'inizio: {s['operazioni']} operazioni chiuse, {s['vinte']} vinte ({s['vinte_quota']:.0%}), "
            f"euro guadagnati per euro perso {pf}, risultato {s['risultato']:+.2f} € su un conto simulato da {ACCOUNT_EUR:,.0f} € "
            f"({s['risultato'] / ACCOUNT_EUR:+.1%}), costi {s['costi']:.2f} €. Per mercato: {per_sym}. In corso: {aperte}. "
            f"Atteso dallo storico: 1,3-1,4 per euro perso, 58-61% vinte. Tutto simulato, nessun euro vero.")


def replay(store: Store, since: str = "2005-01-01") -> dict:
    """La stessa regola sul passato, un mercato alla volta, una posizione per mercato: cosa aspettarsi."""
    out = {"dal": since, "mercati": {}, "anni": {}}
    all_trades = []
    for sym in MARKETS:
        bars = load_bars(store, sym)
        trades, last_exit = [], None
        for day in signal_days(bars):
            if day < pd.Timestamp(since) or (last_exit is not None and day < last_exit):
                continue
            t = simulate(bars, day)
            if t["status"] != "chiusa":
                continue
            t["symbol"] = sym
            trades.append(t)
            last_exit = pd.Timestamp(t["exit_day"])
        out["mercati"][sym] = stats(trades)
        all_trades += trades
    for t in all_trades:
        y = t["exit_day"][:4]
        out["anni"][y] = round(out["anni"].get(y, 0.0) + t["pnl"], 2)
    out["anni"] = dict(sorted(out["anni"].items()))
    out["totale"] = stats(all_trades)
    return out
