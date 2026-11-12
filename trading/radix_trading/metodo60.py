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
uscite rendono 1,22: il vantaggio della regola e' reale ma modesto.

Due corsie, dall'11/11/2026 (Francesco: «le notizie sono molto importanti... sdoppiare le simulazioni»). Ogni segnale
viene registrato nella corsia «statistica»; la corsia «+ notizie» tiene solo i segnali arrivati con una NOTIZIA FORTE:
il giorno del segnale o il giorno prima una delle famiglie di notizie in `SHOCK_THEMES` (guerra, crisi bancaria,
epidemie, dazi, borse, Medio Oriente, Russia-Ucraina, sanzioni, Cina; archivio Wikipedia «Current events», regole in
`events.py`) conta piu' voci del 90° percentile dell'anno precedente. Sullo storico dal 2015 con queste regole (`replay`
sul Mac, 11/11; euro guadagnati per euro perso 2015-19 / 2020-26): tutti i segnali 1,58 / 1,32; solo con notizia forte
1,60 / 1,51 (64% e 62% vinte); senza notizia forte 1,55 / 1,11. Il vantaggio delle notizie c'e' solo dal 2020 e i casi
sono pochi (64 e 129): per questo le due corsie corrono in parallelo e si confrontano ogni venerdi'. (Con il target
misurato sulla chiusura invece che toccato in giornata i numeri salgono, 1,94 / 1,51 contro 1,77 / 1,30: variante NON
adottata, sceglierla dopo aver visto i risultati sarebbe senno di poi.) Dal vivo la pagina di Wikipedia del giorno e'
ancora in scrittura la sera: si riscarica prima del controllo e il verdetto resta quello scritto quella sera.

Corsia «oro, solo statistica» e osservazioni, dal 12/11/2026 (Francesco, 11/11: «mappare bene le notizie e dove agire, se
solo su S&P 500, su oro o altre»). La stessa regola provata su 15 mercati dal 2015: regge sugli indici USA e sull'oro
(GLD 1,42 / 1,40; con il filtro notizie peggiora, 0,84 nel 2020-26: quindi oro SENZA filtro), non su Europa, Italia,
Giappone, emergenti, petrolio, bond e settori. La mappa 16 temi × 15 mercati (33 coppie su 152 reggono in entrambi i
periodi contro il 10-21% con le date delle notizie spostate a caso: effetto reale, meta' delle coppie e' rumore) indica
due famiglie «notizia senza minimo di giornata» che qui si osservano: tregua/negoziati di pace → Nasdaq (2,8 / 2,2 per
euro perso su 11 e 35 casi) e Russia-Ucraina → oro (1,8 / 1,6 su 27 e 68; il 31/10 «sempre lungo oro» batteva le notizie:
da riverificare). Le osservazioni comprano all'apertura dopo un giorno con la notizia del tema (oggi o ieri) e chiusura
sopra la media a 200 giorni, stesse uscite; sono osservazione, non regole con soldi.

Leva (Francesco, 11/11: «la stessa simulazione con leva 5, 10, 20 e 30»): `replay` rifa' la stessa lista di operazioni
con il conto a leva L (nozionale per posizione L/3 del conto, tre insieme = leva piena, valutazione giornaliera, chiusura
forzata del broker sotto il 50% del margine). Sul Mac, 2005-2026, con le regole della corsia: leva 1 +3,7% l'anno con
perdita massima −17%; leva 2 +7,0% / −31%; leva 3 +9,9% / −45%; leva 5 +13,9% / −67% (mese peggiore −37%); leva 10
+12,3% / −95%; leva 20 e 30 conto azzerato (2010, 2009). Nessun euro vero: la corsia
scrive un'operazione simulata a ogni segnale e avvisa su Telegram la sera stessa («domani all'apertura...»), cosi'
Francesco vede la regola lavorare dal vivo prima di qualunque decisione. Gira nel giro `daily` (23:30 ora italiana): i
prezzi del giorno arrivano la sera, il segnale della sera vale per l'apertura del giorno dopo.

    python -m radix_trading metodo60                      # un giro (come nel daily)
    python -m radix_trading metodo60 --prova              # stampa gli avvisi senza mandarli
    python -m radix_trading metodo60 --from 2005-01-01    # la stessa regola sul passato: corsie, osservazioni e tabella della leva
    python -m radix_trading metodo60 --completa-notizie   # verdetto notizie alle operazioni registrate prima dell'11/11
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pandas as pd

from . import alerts, events
from .store import Store

MARKETS = {"SPY": "S&P 500", "QQQ": "Nasdaq 100", "IWM": "Russell 2000"}
VENUE = "yahoo"
GOLD = {"GLD": "Oro"}
GOLD_VENUE = "materie"    # il GLD di Tiingo nella tabella delle materie prime (quello del venue yahoo e' fermo)
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
TAG_GOLD = "[SIMULATO metodo60 oro]"
TAG_OBS = "[SIMULATO osservazione]"
# Corsie con il minimo di giornata: nome -> (mercati, venue). Le notizie filtrano solo la corsia «indici».
LANES = {"indici": (MARKETS, VENUE), "oro": (GOLD, GOLD_VENUE)}
# Osservazioni «notizia senza minimo»: nome -> tema, mercato, venue, nome leggibile (dalla mappa dell'11/11).
OBSERVATIONS = {
    "tregua_nasdaq": {"theme": "tregua", "symbol": "QQQ", "venue": VENUE, "name": "tregua → Nasdaq 100 (QQQ)"},
    "russia_oro": {"theme": "russia_ucraina", "symbol": "GLD", "venue": GOLD_VENUE, "name": "Russia-Ucraina → oro (GLD)"},
}
NAMES = {**MARKETS, **GOLD, **{k: v["name"] for k, v in OBSERVATIONS.items()}}
# Corsia «+ notizie»: famiglie di notizie (events.THEMES) che fanno «notizia forte» il giorno del segnale o il giorno prima.
SHOCK_THEMES = ("guerra", "crisi_banche", "epidemie", "dazi", "borse", "medio_oriente", "russia_ucraina", "sanzioni", "cina")
THEME_LABELS = {"guerra": "guerra", "crisi_banche": "crisi bancaria", "epidemie": "epidemie", "dazi": "dazi", "borse": "borse",
                "medio_oriente": "Medio Oriente", "russia_ucraina": "Russia-Ucraina", "sanzioni": "sanzioni", "cina": "Cina",
                "tregua": "tregua"}
NEWS_WARMUP_DAYS = 61     # il 90° percentile vuole almeno 60 giorni di archivio prima: fino ad allora il verdetto e' «non so»
# Leva: la stessa lista di operazioni con il conto a leva L (nozionale per posizione L/3 del conto).
LEVERS = (1, 2, 3, 5, 10, 20, 30)
REPORT_LEVERS = (1, 3, 5)
LANE_LEVER = NOTIONAL_EUR * 3 / ACCOUNT_EUR     # = 2: la misura della corsia equivale a leva 2 con tre posizioni
VERIFY_FROM = "2020-01-01"

SCHEMA = """
CREATE TABLE IF NOT EXISTS m60_trades (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, signal_day TEXT NOT NULL,
    entry_day TEXT, entry REAL, exit_day TEXT, exit REAL, how TEXT, pnl REAL, costs REAL, status TEXT NOT NULL,
    notizie INTEGER, temi TEXT, lane TEXT,
    UNIQUE (symbol, signal_day));
CREATE TABLE IF NOT EXISTS m60_reports (week TEXT PRIMARY KEY, ts TEXT NOT NULL);
"""
_COLS = ("symbol", "signal_day", "entry_day", "entry", "exit_day", "exit", "how", "pnl", "costs", "status", "notizie", "temi", "lane")


def _init(db) -> None:
    db.executescript(SCHEMA)
    have = {r[1] for r in db.execute("PRAGMA table_info(m60_trades)")}
    for col, typ in (("notizie", "INTEGER"), ("temi", "TEXT"), ("lane", "TEXT")):      # tabella nata il 10/11 con meno colonne
        if col not in have:
            db.execute(f"ALTER TABLE m60_trades ADD COLUMN {col} {typ}")
    db.execute("UPDATE m60_trades SET lane = 'indici' WHERE lane IS NULL")


def load_bars(store: Store, symbol: str, venue: str = VENUE) -> pd.DataFrame:
    df = store.load_bars(venue, symbol, "1d")
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


def theme_signal_days(bars: pd.DataFrame, flags: pd.DataFrame, theme: str) -> pd.DatetimeIndex:
    """Osservazione: giorni con la notizia del tema (oggi o ieri) e chiusura sopra la media a 200 giorni, senza minimo."""
    if flags.empty or theme not in flags.columns or len(bars) < MA_DAYS + 1:
        return pd.DatetimeIndex([])
    f = flags[theme].astype(bool)
    yesterday = f.copy()
    yesterday.index = yesterday.index + pd.Timedelta(days=1)      # la notizia di ieri vale per il giorno di borsa di oggi
    recent = f.reindex(bars.index, fill_value=False) | yesterday.reindex(bars.index, fill_value=False)
    ma = bars["close"].rolling(MA_DAYS).mean()
    sig = recent & (bars["close"] > ma)
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


# --- notizie: la corsia «+ notizie» e le osservazioni ----------------------------------------------

def news_flags(store: Store, themes=SHOCK_THEMES) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Conteggi per famiglia e giorni di «notizia forte» (sopra il 90° percentile dell'anno prima) dall'archivio Wikipedia.
    I primi 61 giorni dell'archivio non hanno un percentile alle spalle e si scartano (verdetto «non so»)."""
    try:
        counts = events.theme_counts(store)
    except Exception:
        counts = pd.DataFrame()
    if counts.empty or len(counts) <= NEWS_WARMUP_DAYS:
        return pd.DataFrame(), pd.DataFrame()
    flags = events.news_events(counts)
    cols = [t for t in themes if t in flags.columns]
    return counts[cols].iloc[NEWS_WARMUP_DAYS:], flags[cols].iloc[NEWS_WARMUP_DAYS:]


def news_check(counts: pd.DataFrame, flags: pd.DataFrame, day) -> tuple[bool | None, str]:
    """C'e' una notizia forte il giorno del segnale o il giorno prima? None = l'archivio non copre quei giorni.
    Il testo elenca le famiglie sopra soglia con il numero di voci: «Medio Oriente 7 (oggi), Cina 4 (ieri)»."""
    if flags.empty:
        return None, "archivio notizie non disponibile"
    day = pd.Timestamp(day).normalize()
    parts, known = [], False
    for d, label in ((day, "oggi"), (day - pd.Timedelta(days=1), "ieri")):
        if d not in flags.index:
            continue
        known = True
        for theme in flags.columns:
            if bool(flags.at[d, theme]):
                parts.append(f"{THEME_LABELS.get(theme, theme)} {int(counts.at[d, theme])} ({label})")
    if not known:
        return None, "archivio notizie senza questi giorni"
    return bool(parts), (", ".join(parts) if parts else "nessuna")


def theme_detail(counts: pd.DataFrame, flags: pd.DataFrame, theme: str, day) -> str:
    """Per le osservazioni: «tregua 3 (oggi), tregua 2 (ieri)»."""
    if flags.empty or theme not in flags.columns:
        return "—"
    day = pd.Timestamp(day).normalize()
    parts = [f"{THEME_LABELS.get(theme, theme)} {int(counts.at[d, theme])} ({label})"
             for d, label in ((day, "oggi"), (day - pd.Timedelta(days=1), "ieri")) if d in flags.index and bool(flags.at[d, theme])]
    return ", ".join(parts) or "—"


def refresh_news(store: Store, day: date) -> int:
    """Riscarica da Wikipedia la pagina di oggi (ancora in scrittura) e di ieri, cosi' il controllo della sera vede il giorno.
    Senza rete torna −1 e il controllo usa l'archivio com'e'."""
    try:
        return events.refresh_days(store, [day - timedelta(days=1), day])
    except Exception:
        return -1


def news_line(t: dict) -> str:
    if t.get("notizie") == 1:
        return f"Notizie forti (Wikipedia, oggi/ieri): {t.get('temi') or '—'} → entra anche la corsia «+ notizie»."
    if t.get("notizie") == 0:
        return "Notizie forti: nessuna → solo la corsia statistica."
    return f"Notizie: {t.get('temi') or 'archivio non disponibile'} → solo la corsia statistica."


def backfill_news(store: Store) -> int:
    """Verdetto notizie alle operazioni della corsia indici registrate prima dello sdoppiamento (11/11): calcolato oggi
    sull'archivio completo, quindi segnato «a posteriori»."""
    db = store.conn
    _init(db)
    counts, flags = news_flags(store)
    n = 0
    for row in _rows(db, "WHERE notizie IS NULL AND lane = 'indici'"):
        flag, detail = news_check(counts, flags, row["signal_day"])
        if flag is None:
            continue
        db.execute("UPDATE m60_trades SET notizie = ?, temi = ? WHERE id = ?", (int(flag), f"{detail} (a posteriori)", row["id"]))
        n += 1
    db.commit()
    return n


# --- testi degli avvisi --------------------------------------------------------------------------

def _name(sym: str) -> str:
    return NAMES[sym] if sym in OBSERVATIONS else f"{NAMES.get(sym, sym)} ({sym})"


def _tag(t: dict) -> str:
    lane = t.get("lane") or "indici"
    return TAG_OBS if lane in OBSERVATIONS else TAG_GOLD if lane == "oro" else TAG


def _lane(t: dict) -> str:
    return " [anche corsia + notizie]" if (t.get("lane") or "indici") == "indici" and t.get("notizie") == 1 else ""


def _rule() -> str:
    return (f"nozionale simulato {NOTIONAL_EUR:,.0f} € (rischio {ACCOUNT_EUR * RISK:,.0f} €, il {RISK:.0%} di un conto da "
            f"{ACCOUNT_EUR:,.0f} €), target +{TARGET:.0%} in giornata, stop −{STOP:.0%} sulla chiusura, uscita entro {MAX_DAYS} giorni di mercato")


def signal_text(sym: str, t: dict, close: float) -> str:
    lane = t.get("lane") or "indici"
    if lane in OBSERVATIONS:
        return (f"{TAG_OBS} {NAMES[lane]}: notizia «{t.get('temi') or '—'}» con chiusura {close:,.2f} sopra la media a 200 giorni. "
                f"Domani all'apertura la regola di osservazione COMPRA: {_rule()}. Solo osservazione, nessun euro.")
    head = (f"{_tag(t)} Segnale di oggi su {_name(sym)}: chiusura {close:,.2f} sul minimo di giornata, sopra la media a 200 giorni. "
            f"Domani all'apertura la regola COMPRA: {_rule()}. ")
    if lane == "oro":
        return head + "Corsia oro, solo statistica (le notizie si registrano ma non filtrano). Nessun euro vero."
    return head + f"{news_line(t)} Nessun euro vero."


def open_text(sym: str, t: dict) -> str:
    return (f"{_tag(t)} Entrata su {_name(sym)} a {t['entry']:,.2f} il {t['entry_day']} (segnale del {t['signal_day']}){_lane(t)}: "
            f"target {t['target_level']:,.2f}, stop sulla chiusura {t['stop_level']:,.2f}, uscita a tempo il {t['last_day'] or '—'}. "
            f"Nozionale simulato {NOTIONAL_EUR:,.0f} €.")


def close_text(sym: str, t: dict) -> str:
    return (f"{_tag(t)} Chiusa ({t['how']}) l'operazione su {_name(sym)}{_lane(t)}: da {t['entry']:,.2f} a {t['exit']:,.2f} "
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


def _run(db, lane: str, sym: str, bars: pd.DataFrame, days: pd.DatetimeIndex, verdict, since: pd.Timestamp, send, out: dict) -> None:
    """Una corsia su un mercato: aggiorna le operazioni in corso, registra i segnali nuovi (verdict(day) -> (notizie, temi))."""
    for row in _rows(db, "WHERE symbol = ? AND status IN ('segnalata', 'aperta')", (sym,)):
        t = simulate(bars, pd.Timestamp(row["signal_day"]))
        if t["status"] == row["status"] and t["status"] != "aperta":
            continue
        _update(db, row["id"], t)
        t["notizie"], t["temi"], t["lane"] = row["notizie"], row["temi"], row["lane"] or lane
        if row["status"] == "segnalata" and t["status"] in ("aperta", "chiusa"):
            send(open_text(sym, t))
            out["aperte"].append(sym)
        if t["status"] == "chiusa":
            send(close_text(sym, t))
            out["chiuse"].append(sym)
    existing = _rows(db, "WHERE symbol = ?", (sym,))
    done = {r["signal_day"] for r in existing}
    for day in days:
        if day < since or day.date().isoformat() in done or _busy(existing, day):
            continue
        t = simulate(bars, day)
        t["notizie"], t["temi"] = verdict(day)
        t["lane"] = lane
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


def step(store: Store, now: datetime | None = None, send=alerts.send) -> dict:
    now = now or datetime.now(timezone.utc)
    db = store.conn
    _init(db)
    since = pd.Timestamp(now.date()) - pd.Timedelta(days=LOOKBACK_DAYS)
    out = {"segnali": [], "aperte": [], "chiuse": [], "riepilogo": None, "notizie": refresh_news(store, now.date())}
    counts_all, flags_all = news_flags(store, tuple(events.THEMES))
    shock = [t for t in SHOCK_THEMES if t in flags_all.columns]
    counts, flags = (counts_all[shock], flags_all[shock]) if shock else (pd.DataFrame(), pd.DataFrame())

    def shock_verdict(day):
        flag, detail = news_check(counts, flags, day)
        return (None if flag is None else int(flag)), detail

    for lane, (markets, venue) in LANES.items():
        for sym in markets:
            bars = load_bars(store, sym, venue)
            if not bars.empty:
                _run(db, lane, sym, bars, signal_days(bars), shock_verdict, since, send, out)
    for key, ob in OBSERVATIONS.items():
        bars = load_bars(store, ob["symbol"], ob["venue"])
        if bars.empty or flags_all.empty:
            continue
        _run(db, key, key, bars, theme_signal_days(bars, flags_all, ob["theme"]),
             lambda day, ob=ob: (None, theme_detail(counts_all, flags_all, ob["theme"], day)), since, send, out)
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
            "per_operazione": round(sum(pnl) / len(done) / NOTIONAL_EUR, 5),
            "peggiore": round(min(pnl), 2), "migliore": round(max(pnl), 2),
            "per_uscita": {k: sum(1 for t in done if t["how"] == k) for k in ("target", "target in apertura", "stop", "tempo")}}


def _pf(s: dict) -> str:
    return f"{s['per_euro_perso']:.2f}" if s.get("per_euro_perso") is not None else "—"


def _lane_text(s: dict) -> str:
    if not s["operazioni"]:
        return "nessuna operazione chiusa"
    return (f"{s['operazioni']} operazioni chiuse, {s['vinte']} vinte ({s['vinte_quota']:.0%}), {_pf(s)} euro guadagnati per euro perso, "
            f"risultato {s['risultato']:+.2f} € ({s['risultato'] / ACCOUNT_EUR:+.1%} del conto simulato da {ACCOUNT_EUR:,.0f} €)")


def _short_text(s: dict) -> str:
    if not s["operazioni"]:
        return "nessuna chiusa"
    return f"{s['operazioni']} op., {s['vinte']} vinte, {_pf(s)} per euro perso, {s['risultato']:+.0f} €"


def _lever_text(s: dict) -> str:
    if not s["operazioni"]:
        return "—"
    return " / ".join(f"leva {L}: {s['risultato'] * L / LANE_LEVER:+.0f} €" for L in REPORT_LEVERS)


def report_text(store: Store, week: str) -> str:
    trades = _rows(store.conn, "")
    idx = [t for t in trades if (t["lane"] or "indici") == "indici"]
    s = stats(idx)
    sn = stats([t for t in idx if t.get("notizie") == 1])
    gold = stats([t for t in trades if t["lane"] == "oro"])
    aperte = sum(t["status"] in ("segnalata", "aperta") for t in trades)
    if not any(t["status"] == "chiusa" for t in trades):
        return f"{TAG} Settimana {week}: nessuna operazione simulata chiusa finora ({aperte} in corso). Attesi ~31 segnali l'anno sui tre indici."
    per_sym = "; ".join(f"{sym} {st['operazioni']} op. {st['risultato']:+.0f} €"
                        for sym in MARKETS for st in [stats([t for t in idx if t["symbol"] == sym])] if st["operazioni"]) or "—"
    obs = "; ".join(f"{ob['name']}: {_short_text(stats([t for t in trades if t['lane'] == key]))}" for key, ob in OBSERVATIONS.items())
    return (f"{TAG} Settimana {week}, dall'inizio. Corsia statistica (tutti i segnali): {_lane_text(s)}. "
            f"Corsia + notizie (solo i segnali con una notizia forte): {_lane_text(sn)}. "
            f"Lo stesso a leva 1, 3 e 5 (senza interesse composto): statistica {_lever_text(s)}; + notizie {_lever_text(sn)}. "
            f"Per mercato: {per_sym}. Corsia oro (solo statistica): {_lane_text(gold)}. Osservazioni: {obs}. "
            f"In corso: {aperte}. Costi indici: {s.get('costi', 0):.2f} €. "
            f"Atteso dallo storico: statistica 1,3-1,4 per euro perso e 58-61% vinte; + notizie 1,5 (dal 2015, casi pochi); oro 1,4. "
            f"Tutto simulato, nessun euro vero.")


# --- il passato: corsie, osservazioni e tabella della leva --------------------------------------

def _curve_summary(curve: pd.Series, account: float, closeouts: int, ruin) -> dict:
    final = float(curve.iloc[-1])
    years = max((curve.index[-1] - curve.index[0]).days / 365.25, 1 / 365.25)
    monthly = curve.resample("ME").last().pct_change().dropna()
    yearly = curve.resample("YE").last().pct_change().dropna()

    def annual(c: pd.Series, start_value: float):
        if len(c) < 2 or start_value <= 0 or float(c.iloc[-1]) <= 0:
            return None
        y = (c.index[-1] - c.index[0]).days / 365.25
        return round((float(c.iloc[-1]) / start_value) ** (1 / y) - 1, 4) if y > 0 else None

    disc, ver = curve[curve.index < pd.Timestamp(VERIFY_FROM)], curve[curve.index >= pd.Timestamp(VERIFY_FROM)]
    return {"conto_finale": round(final, 2),
            "annuo": round((final / account) ** (1 / years) - 1, 4) if final > 0 else -1.0,
            "perdita_max": round(float((curve / curve.cummax() - 1).min()), 4),
            "mese_peggiore": round(float(monthly.min()), 4) if len(monthly) else None,
            "mesi_positivi": round(float((monthly > 0).mean()), 3) if len(monthly) else None,
            "anni_negativi": int((yearly < 0).sum()),
            "chiusure_forzate": closeouts,
            "azzerato": ruin.date().isoformat() if ruin is not None else None,
            "annuo_scoperta": annual(disc, account),
            "annuo_verifica": annual(ver, float(disc.iloc[-1])) if len(disc) else annual(ver, account)}


def leverage_table(bars_by: dict[str, pd.DataFrame], trades: list[dict], levers=LEVERS, account: float = ACCOUNT_EUR) -> dict:
    """La stessa lista di operazioni con il conto a leva L: nozionale per posizione = L/3 del conto del momento (tre posizioni
    insieme = leva piena), valutazione giornaliera alla chiusura, spread per lato, finanziamento ogni notte, chiusura forzata
    del broker quando il conto scende sotto il 50% del margine (leva massima del broker max(20, L)), conto azzerato sotto l'1%."""
    done = [t for t in trades if t.get("status", "chiusa") == "chiusa" and t.get("exit_day")]
    if not done or not bars_by:
        return {}
    days = pd.DatetimeIndex(sorted(set().union(*[set(b.index) for b in bars_by.values()])))
    days = days[days >= min(pd.Timestamp(t["entry_day"]) for t in done)]   # la resa annua si misura dalla prima operazione
    closes = {sym: b["close"] for sym, b in bars_by.items()}
    by_entry: dict[pd.Timestamp, list[dict]] = {}
    for t in done:
        by_entry.setdefault(pd.Timestamp(t["entry_day"]), []).append(t)
    out = {}
    for L in levers:
        eq, pos, curve, closeouts, ruin = float(account), [], [], 0, None
        pmax = max(20.0, float(L))
        for d in days:
            pnl = 0.0
            for p in list(pos):
                c = closes[p["symbol"]]
                if d not in c.index:
                    continue
                if pd.Timestamp(p["exit_day"]) == d:
                    pnl += p["n"] * (p["exit"] / p["last"] - 1) - p["n"] * SPREAD
                    pos.remove(p)
                else:
                    px = float(c.loc[d])
                    pnl += p["n"] * (px / p["last"] - 1)
                    p["last"] = px
                pnl -= p["n"] * FINANCING_YEAR / 365
            if ruin is None:
                for t in by_entry.get(d, []):
                    used = sum(p["n"] for p in pos)
                    n = min(eq * L / 3, max(eq * L - used, 0.0))
                    if n <= 0:
                        continue
                    pnl -= n * SPREAD
                    if pd.Timestamp(t["exit_day"]) == d:
                        pnl += n * (t["exit"] / t["entry"] - 1) - n * SPREAD
                    else:
                        px = float(closes[t["symbol"]].loc[d])
                        pnl += n * (px / t["entry"] - 1)
                        pos.append({"symbol": t["symbol"], "exit_day": t["exit_day"], "exit": t["exit"], "n": n, "last": px})
            eq += pnl
            used = sum(p["n"] for p in pos)
            if pos and eq < 0.5 * used / pmax:          # chiusura forzata: margine sotto il 50%
                closeouts += 1
                pos = []
            if eq <= account * 0.01 and ruin is None:
                ruin, eq, pos = d, max(eq, 0.0), []
            curve.append(max(eq, 0.0))
        out[L] = _curve_summary(pd.Series(curve, index=days), account, closeouts, ruin)
    return out


def _replay_trades(bars: pd.DataFrame, days: pd.DatetimeIndex, since: str, sym: str, verdict) -> list[dict]:
    trades, last_exit = [], None
    for day in days:
        if day < pd.Timestamp(since) or (last_exit is not None and day < last_exit):
            continue
        t = simulate(bars, day)
        if t["status"] != "chiusa":
            continue
        t["symbol"] = sym
        t["notizie"], t["temi"] = verdict(day)
        trades.append(t)
        last_exit = pd.Timestamp(t["exit_day"])
    return trades


def _split(ts: list[dict]) -> dict:
    return {"statistica": stats(ts), "con_notizia_forte": stats([t for t in ts if t["notizie"] == 1]),
            "senza_notizia_forte": stats([t for t in ts if t["notizie"] == 0])}


def _periods(ts: list[dict], fn=stats) -> dict:
    return {f"fino_{int(VERIFY_FROM[:4]) - 1}": fn([t for t in ts if t["signal_day"] < VERIFY_FROM]),
            f"dal_{VERIFY_FROM[:4]}": fn([t for t in ts if t["signal_day"] >= VERIFY_FROM])}


def replay(store: Store, since: str = "2005-01-01", levers=LEVERS) -> dict:
    """La stessa regola sul passato, un mercato alla volta, una posizione per mercato: cosa aspettarsi.
    Torna le corsie (indici: tutti i segnali / solo con notizia forte, dove l'archivio copre i giorni; oro), le
    osservazioni, gli anni e la tabella della leva (sugli indici)."""
    out = {"dal": since, "mercati": {}, "anni": {}}
    counts_all, flags_all = news_flags(store, tuple(events.THEMES))
    shock = [t for t in SHOCK_THEMES if t in flags_all.columns]
    counts, flags = (counts_all[shock], flags_all[shock]) if shock else (pd.DataFrame(), pd.DataFrame())

    def shock_verdict(day):
        flag, detail = news_check(counts, flags, day)
        return (None if flag is None else int(flag)), detail

    bars_by, all_trades = {}, []
    for sym in MARKETS:
        bars = load_bars(store, sym)
        bars_by[sym] = bars
        trades = _replay_trades(bars, signal_days(bars), since, sym, shock_verdict)
        out["mercati"][sym] = stats(trades)
        all_trades += trades
    for t in all_trades:
        y = t["exit_day"][:4]
        out["anni"][y] = round(out["anni"].get(y, 0.0) + t["pnl"], 2)
    out["anni"] = dict(sorted(out["anni"].items()))
    out["totale"] = stats(all_trades)
    known = [t for t in all_trades if t["notizie"] is not None]
    if known:
        out["notizie"] = {"dal": min(t["signal_day"] for t in known), "temi": list(SHOCK_THEMES), **_split(known),
                          "periodi": _periods(known, _split)}
    gold_bars = load_bars(store, "GLD", GOLD_VENUE)
    if not gold_bars.empty:
        gold = _replay_trades(gold_bars, signal_days(gold_bars), since, "GLD", shock_verdict)
        out["oro"] = {**_split(gold), "periodi": _periods(gold, _split)}
    if not flags_all.empty:
        out["osservazioni"] = {}
        for key, ob in OBSERVATIONS.items():
            bars = bars_by.get(ob["symbol"]) if ob["venue"] == VENUE else load_bars(store, ob["symbol"], ob["venue"])
            if bars is None or bars.empty:
                continue
            obs = _replay_trades(bars, theme_signal_days(bars, flags_all, ob["theme"]), since, key,
                                 lambda day, ob=ob: (None, theme_detail(counts_all, flags_all, ob["theme"], day)))
            out["osservazioni"][key] = {"nome": ob["name"], **stats(obs), "periodi": _periods(obs)}
    out["leva"] = leverage_table(bars_by, all_trades, levers)
    return out
