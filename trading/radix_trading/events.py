"""Studio degli eventi: da una parte cosa e' successo nel mondo, dall'altra come si sono mossi i mercati.

Idea di Francesco (29/10/2026): ricostruire dal passato i legami tra eventi (guerre, dazi, Trump, Fed,
inflazione, petrolio, grandi aziende) e movimenti di oro, S&P 500, Nasdaq, petrolio, obbligazioni,
dollaro e crypto nei giorni dopo.

Tre famiglie di eventi:
- notizie: Wikipedia «Current events» (dal 2015), classificate per tema con parole chiave; un giorno conta
  come evento quando le notizie di quel tema sono insolitamente tante (sopra il 90° percentile);
- calendario: decisioni della Fed sui tassi (dalle variazioni del tasso FRED) e, con una chiave FRED
  gratuita, le date di uscita di inflazione (CPI) e lavoro USA;
- shock di mercato: giorni con movimenti estremi di VIX, petrolio, oro, tassi, dollaro, S&P 500.

Lo studio guarda il rendimento dal *giorno dopo* l'evento (si entra alla chiusura del giorno
dell'evento: quello che e' gia' successo quel giorno non si puo' comprare), su 1, 3 e 5 giorni,
meno il rendimento medio normale. Prove separate:
- scoperta: tutto fino a un anno fa; con tante combinazioni evento × mercato × giorni molte sembrano
  buone per caso, quindi si tiene solo cio' che passa la correzione di Benjamini-Hochberg;
- verifica: l'ultimo anno, mai usato per scegliere. Un legame vale se si ripete nello stesso verso
  e copre i costi.
"""

from __future__ import annotations

import json
import math
import re
from datetime import date, timedelta

import numpy as np
import pandas as pd

from . import data, universe
from .collectors import fred, wikinews
from .config import env_value
from .store import Store

START = date(2015, 1, 1)
HORIZONS = (1, 3, 5)
VALIDATION_DAYS = 365
FDR = 0.10
COST_ROUND_TRIP = 0.002   # 0,1% per lato: ETF liquidi su IBKR con ordini non minuscoli
MIN_EVENTS = 12
BATCHES_PER_RUN = 12      # 600 giorni di notizie per giro: tutto lo storico in pochi giri

SCHEMA = """
CREATE TABLE IF NOT EXISTS news_days (day TEXT PRIMARY KEY, items INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS news_items (day TEXT NOT NULL, section TEXT, text TEXT NOT NULL,
    PRIMARY KEY (day, text));
CREATE TABLE IF NOT EXISTS calendar (day TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY (day, kind));
"""

# Temi: parole chiave in inglese (Wikipedia e' in inglese). Ogni notizia puo' avere piu' temi.
THEMES = {
    "dazi": r"\btariff|trade war|import dut|export control|trade deal",
    "trump": r"\bTrump\b",
    "guerra": r"\binvasion|\binvades?\b|airstrike|air strike|missile|declares? war|offensive|drone attack|bombing|shelling",
    "tregua": r"ceasefire|cease-fire|truce|peace (?:deal|agreement|talks|plan)",
    "sanzioni": r"\bsanction",
    "petrolio": r"\bOPEC|\boil (?:price|production|output|supply|field|tanker)|\bcrude\b|\bgasoline|\bdiesel",
    "fed_tassi": r"Federal Reserve|interest rate|rate (?:cut|hike)|central bank|\bECB\b",
    "inflazione": r"\binflation|consumer price",
    "crisi_banche": r"bank (?:collapse|failure|run)|\bbankrupt|\bdefault(?:s|ed)? on|insolven",
    "big_tech": r"\b(?:Nvidia|Apple|Microsoft|Tesla|Amazon|Alphabet|Google|Meta Platforms|OpenAI|TSMC)\b",
    "cina": r"\bChina\b|\bChinese\b|\bBeijing\b|\bTaiwan\b",
    "medio_oriente": r"\bIran\b|\bIsrael|\bGaza\b|\bHezbollah|\bHouthi|Strait of Hormuz|Red Sea|\bSaudi",
    "russia_ucraina": r"\bRussia|\bUkrain",
    "elezioni": r"\belection",
    "epidemie": r"pandemic|COVID|epidemic|outbreak",
    "borse": r"stock market|stock exchange|\bshares (?:fell|rose|plunged|soared)|Dow Jones|S&P 500|Nasdaq|sell-off|selloff",
}
_THEMES = {k: re.compile(v, re.I) for k, v in THEMES.items()}
# Sezioni di Wikipedia in cui un tema e' quasi sempre un falso positivo (es. processi per un vecchio
# attentato nella cronaca giudiziaria non sono una guerra in corso).
SKIP_SECTIONS = {"guerra": ("law and crime",), "tregua": ("law and crime",)}

ASSETS = {  # nome leggibile -> (mercato, simbolo)
    "S&P 500": ("etf", "SPY"), "Nasdaq": ("etf", "QQQ"), "Europa": ("etf", "VGK"), "Emergenti": ("etf", "EEM"),
    "Treasury 20+ anni": ("etf", "TLT"), "Treasury 7-10 anni": ("etf", "IEF"), "Energia": ("etf", "XLE"),
    "Banche": ("etf", "XLF"), "Utility": ("etf", "XLU"), "Immobiliare": ("etf", "VNQ"), "Oro": ("materie_prime", "GLD"), "Argento": ("materie_prime", "SLV"),
    "Petrolio": ("materie_prime", "USO"), "Gas": ("materie_prime", "UNG"), "Rame": ("materie_prime", "CPER"),
    "Italia": ("italia", "EWI"), "Bitcoin": ("crypto", "XBTEUR"), "Ethereum": ("crypto", "ETHEUR"),
}


# --- raccolta ---------------------------------------------------------------------------------

def init(store: Store) -> None:
    store.conn.executescript(SCHEMA)


def collect_news(store: Store, batches: int = BATCHES_PER_RUN, today: date | None = None) -> dict:
    """Scarica i giorni mancanti, dai piu' recenti ai piu' vecchi (il 2025-2026 arriva per primo)."""
    init(store)
    today = today or date.today()
    have = {r[0] for r in store.conn.execute("SELECT day FROM news_days")}
    # gli ultimi 3 giorni si riscaricano: Wikipedia li completa nei giorni successivi
    recent = {(today - timedelta(days=k)).isoformat() for k in range(1, 4)}
    missing = [today - timedelta(days=k) for k in range(1, (today - START).days + 1)
               if (today - timedelta(days=k)).isoformat() not in have or (today - timedelta(days=k)).isoformat() in recent]
    todo = missing[: batches * wikinews.BATCH]
    got = wikinews.fetch_days(todo) if todo else {}
    n = 0
    for d, items in got.items():
        store.conn.execute("DELETE FROM news_items WHERE day = ?", (d.isoformat(),))
        store.conn.executemany("INSERT OR IGNORE INTO news_items VALUES (?,?,?)",
                               [(d.isoformat(), it["sezione"], it["testo"][:2000]) for it in items])
        store.conn.execute("INSERT OR REPLACE INTO news_days VALUES (?, ?)", (d.isoformat(), len(items)))
        n += len(items)
    store.conn.commit()
    left = len(missing) - len(todo)
    return {"giorni_scaricati": len(got), "notizie": n, "giorni_mancanti": max(0, left)}


def collect_calendar(store: Store) -> dict:
    """Decisioni della Fed: i giorni in cui il tasso obiettivo cambia (FRED, senza chiave).
    Con FRED_API_KEY anche le date di uscita di CPI e del rapporto sul lavoro (Employment Situation)."""
    init(store)
    out = {}
    upper = fred.fetch_series("DFEDTARU")
    changes = upper.diff()
    rows = [(d.date().isoformat(), "fed_alza" if v > 0 else "fed_taglia") for d, v in changes.items() if v and not math.isnan(v)]
    store.conn.executemany("INSERT OR IGNORE INTO calendar VALUES (?,?)", rows)
    out["fed"] = len(rows)
    key = env_value("FRED_API_KEY")
    if key:
        for kind, release_id in release_ids(key).items():
            r = fred.get("https://api.stlouisfed.org/fred/release/dates",
                         {"release_id": release_id, "api_key": key, "file_type": "json",
                          "realtime_start": START.isoformat(), "include_release_dates_with_no_data": "false",
                          "limit": 10000})
            days = [x["date"] for x in r.json().get("release_dates", [])]
            store.conn.executemany("INSERT OR IGNORE INTO calendar VALUES (?,?)", [(d, kind) for d in days])
            out[kind] = len(days)
    else:
        out["cpi"] = out["lavoro_usa"] = "manca FRED_API_KEY (gratuita) in ~/RadixTrading/.env"
    store.conn.commit()
    return out


# Uscite con orario fisso (ora di New York): l'ora esatta serve allo studio al minuto.
RELEASES = {"cpi": ("Consumer Price Index", 10, "08:30"), "lavoro_usa": ("Employment Situation", 50, "08:30"),
            "fomc": ("FOMC Press Release", None, "14:00")}


def release_ids(key: str) -> dict[str, int]:
    """Id FRED delle uscite. CPI e lavoro hanno id noti; la Fed si cerca per nome nell'elenco."""
    ids = {k: v[1] for k, v in RELEASES.items() if v[1]}
    r = fred.get("https://api.stlouisfed.org/fred/releases", {"api_key": key, "file_type": "json", "limit": 1000})
    for rel in r.json().get("releases", []):
        for kind, (name, _, _) in RELEASES.items():
            if kind not in ids and rel.get("name", "").strip().lower() == name.lower():
                ids[kind] = int(rel["id"])
    return ids


# --- eventi -----------------------------------------------------------------------------------

def theme_counts(store: Store) -> pd.DataFrame:
    """Per ogni giorno, quante notizie toccano ciascun tema."""
    init(store)
    rows = store.conn.execute("SELECT day, section, text FROM news_items").fetchall()
    days = [r[0] for r in store.conn.execute("SELECT day FROM news_days ORDER BY day")]
    if not days:
        return pd.DataFrame(columns=list(THEMES))
    counts = pd.DataFrame(0, index=pd.to_datetime(days), columns=list(THEMES))
    for day, section, text in rows:
        sec = (section or "").lower()
        for k, rx in _THEMES.items():
            if rx.search(text) and not any(sec.startswith(x) for x in SKIP_SECTIONS.get(k, ())):
                counts.at[pd.Timestamp(day), k] += 1
    return counts.sort_index()


def news_events(counts: pd.DataFrame, quantile: float = 0.9, window: int = 365) -> pd.DataFrame:
    """Giorno-evento: notizie del tema sopra il 90° percentile dell'anno precedente (solo passato)."""
    if counts.empty:
        return counts.astype(bool)
    thr = counts.rolling(window, min_periods=60).quantile(quantile).shift(1)
    return (counts > thr.clip(lower=1)) & (counts >= 2)


def market_shocks(closes: dict[str, pd.Series], macro: pd.DataFrame) -> pd.DataFrame:
    """Shock dai mercati stessi: movimento del giorno oltre 3 volte l'oscillazione tipica (ultimi 250 giorni)."""
    cols = {}

    def z(s: pd.Series) -> pd.Series:
        r = s.pct_change()
        return r / r.rolling(250, min_periods=60).std().shift(1)

    for name, sym in (("spx_crollo", "S&P 500"), ("oro_balzo", "Oro"), ("petrolio_shock", "Petrolio")):
        if sym in closes:
            zz = z(closes[sym])
            cols[name] = zz < -3 if name == "spx_crollo" else zz.abs() > 3 if name == "petrolio_shock" else zz > 3
    if "VIXCLS" in macro:
        v = macro["VIXCLS"].dropna()
        cols["vix_esplode"] = v.pct_change() > 0.25
    if "DGS10" in macro:
        d = macro["DGS10"].dropna().diff()
        cols["tassi_salto"] = d.abs() > 0.15
    if "DTWEXBGS" in macro:
        cols["dollaro_shock"] = z(macro["DTWEXBGS"].dropna()).abs() > 3
    if not cols:
        return pd.DataFrame()
    df = pd.DataFrame(cols).fillna(False).astype(bool)
    df.index = pd.to_datetime(df.index).tz_localize(None).normalize()
    return df


def calendar_events(store: Store) -> pd.DataFrame:
    init(store)
    rows = store.conn.execute("SELECT day, kind FROM calendar").fetchall()
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows, columns=["day", "kind"])
    df["day"] = pd.to_datetime(df["day"])
    return pd.crosstab(df["day"], df["kind"]).astype(bool)


def load_assets(store: Store) -> dict[str, pd.Series]:
    out = {}
    for name, (market, sym) in ASSETS.items():
        tier = universe.FAST if market == "crypto" else universe.MARKETS[market]
        s = data.load_close(store, tier, sym)
        if s.empty:
            continue
        if market == "crypto":
            s = s.resample("D").last().dropna()
        s.index = pd.to_datetime(s.index).tz_localize(None).normalize()
        out[name] = s[~s.index.duplicated(keep="last")]
    return out


# --- studio -----------------------------------------------------------------------------------

def _forward(close: pd.Series, h: int) -> pd.Series:
    """Rendimento dalla chiusura del giorno t alla chiusura di t+h (giorni di mercato)."""
    return close.shift(-h) / close - 1


def _align(event_days: pd.DatetimeIndex, index: pd.DatetimeIndex) -> pd.DatetimeIndex:
    """Un evento nel weekend o a mercato chiuso conta dal primo giorno di mercato dopo."""
    pos = index.searchsorted(event_days)
    pos = pos[pos < len(index)]
    return pd.DatetimeIndex(index[np.unique(pos)])


def _thin(days: pd.DatetimeIndex, index: pd.DatetimeIndex, h: int) -> pd.DatetimeIndex:
    """Eventi a meno di h giorni dal precedente si scartano: le finestre non devono sovrapporsi."""
    keep, last = [], -10 ** 9
    for d in days:
        i = index.get_loc(d)
        if i - last >= h:
            keep.append(d)
            last = i
    return pd.DatetimeIndex(keep)


def _p_value(t: float) -> float:
    return math.erfc(abs(t) / math.sqrt(2))


def study(events: pd.DataFrame, assets: dict[str, pd.Series], cutoff: pd.Timestamp,
          horizons=HORIZONS, cost: float = COST_ROUND_TRIP, fdr: float = FDR) -> dict:
    tests = []
    for ev in events.columns:
        ev_days = pd.DatetimeIndex(events.index[events[ev].fillna(False).astype(bool)])
        for name, close in assets.items():
            idx = close.index
            aligned = _align(ev_days, idx)
            for h in horizons:
                fwd = _forward(close, h)
                base = fwd[fwd.index <= cutoff].dropna()
                if len(base) < 250:
                    continue
                normal = float(base.mean())
                days = _thin(aligned, idx, h)
                r = (fwd.reindex(days) - normal).dropna()
                disc, val = r[r.index <= cutoff - pd.Timedelta(days=h * 2)], r[r.index > cutoff]
                if len(disc) < MIN_EVENTS:
                    continue
                sd = float(disc.std(ddof=1)) or 1e-9
                t = float(disc.mean() / (sd / math.sqrt(len(disc))))
                tests.append({
                    "evento": ev, "mercato": name, "giorni": h, "n": int(len(disc)),
                    "medio": float(disc.mean()), "normale": normal, "t": t, "p": _p_value(t),
                    "verso": "su" if disc.mean() > 0 else "giu",
                    "vince": float((np.sign(disc) == np.sign(disc.mean())).mean()),
                    "verifica_n": int(len(val)), "verifica_medio": float(val.mean()) if len(val) else None,
                })
    # Benjamini-Hochberg sulle prove della scoperta
    m = len(tests)
    order = sorted(range(m), key=lambda i: tests[i]["p"])
    passed = set()
    for rank, i in enumerate(order, 1):
        if tests[i]["p"] <= fdr * rank / m:
            passed = set(order[:rank])
    for i, t in enumerate(tests):
        t["supera_correzione"] = i in passed
        gross = abs(t["medio"])
        t["copre_costi"] = gross > cost
        vm = t["verifica_medio"]
        t["regge_verifica"] = bool(t["supera_correzione"] and t["copre_costi"] and vm is not None
                                   and t["verifica_n"] >= 3 and np.sign(vm) == np.sign(t["medio"]) and abs(vm) > cost)
    tests.sort(key=lambda t: t["p"])
    return {"prove": m, "superano_correzione": len(passed),
            "reggono_verifica": sum(t["regge_verifica"] for t in tests),
            "legami": [t for t in tests if t["supera_correzione"]][:60],
            "migliori_non_corretti": [t for t in tests if not t["supera_correzione"]][:15]}


def run(store: Store, today: date | None = None) -> dict:
    from . import multi
    today = today or date.today()
    assets = load_assets(store)
    macro = multi.load_macro(store, ("VIXCLS", "DGS10", "DTWEXBGS"))
    macro.index = pd.to_datetime(macro.index).tz_localize(None)
    counts = theme_counts(store)
    frames = [news_events(counts).add_prefix("notizie:"), market_shocks(assets, macro).add_prefix("shock:"),
              calendar_events(store).add_prefix("calendario:")]
    frames = [f for f in frames if not f.empty]
    if not frames or not assets:
        return {"errore": "mancano notizie o prezzi: lanciare prima `events --collect`"}
    events = pd.concat(frames, axis=1).fillna(False).astype(bool).sort_index()
    events = events[events.index >= pd.Timestamp(START)]
    cutoff = pd.Timestamp(today) - pd.Timedelta(days=VALIDATION_DAYS)
    res = study(events, assets, cutoff)
    res.update({
        "generato": pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
        "periodo_scoperta": [START.isoformat(), cutoff.date().isoformat()],
        "periodo_verifica": [cutoff.date().isoformat(), today.isoformat()],
        "giorni_di_notizie": int(len(counts)), "eventi": {c: int(events[c].sum()) for c in events.columns},
        "costo_andata_ritorno": COST_ROUND_TRIP, "fdr": FDR,
    })
    return res


def save(settings, result: dict) -> None:
    from .snapshot import clean
    (settings.data_dir / "events.json").write_text(json.dumps(clean(result), default=str, ensure_ascii=False))
