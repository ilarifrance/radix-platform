"""Le mosse dei grandi investitori: posizioni CFTC dei fondi e dei commerciali contro i prezzi.

Idea di Francesco (30/10/2026). Ogni settimana si sa quanto i grandi speculatori (fondi) e gli
operatori commerciali sono lunghi o corti su oro, petrolio, S&P 500, Treasury, valute, Bitcoin.
Per ogni mercato si misura quanto il posizionamento e' estremo rispetto ai 3 anni prima (z-score,
solo passato) e si prova cosa fa il prezzo nelle 1, 2, 4 settimane dopo, seguendo o contrastando i
fondi. Il rapporto e' del martedi', esce il venerdi': si entra alla chiusura del lunedi' dopo.
Costi, correzione per le prove multiple, verifica sull'ultimo anno.
"""

from __future__ import annotations

import json
import math
from datetime import date

import numpy as np
import pandas as pd

from . import data, universe
from .collectors import cot
from .store import Store

SCHEMA = """CREATE TABLE IF NOT EXISTS cot (day TEXT NOT NULL, symbol TEXT NOT NULL, oi REAL,
    spec_net REAL, comm_net REAL, PRIMARY KEY (day, symbol));"""
START_YEAR = 2006
HORIZONS = (5, 10, 20)        # giorni di borsa
Z_WINDOW, Z_MIN, Z_EDGE = 156, 52, 1.5
COSTS = {"crypto": 0.005, "default": 0.0025}
VALIDATION_DAYS = 365
FDR = 0.10
MIN_CASES = 20


def collect(store: Store, now: date | None = None) -> dict:
    """Scarica gli anni che mancano; l'anno in corso e quello prima si riscaricano sempre."""
    store.conn.executescript(SCHEMA)
    now = now or date.today()
    have = {int(y) for (y,) in store.conn.execute("SELECT DISTINCT substr(day, 1, 4) FROM cot")}
    out, errors = {}, {}
    for y in range(START_YEAR, now.year + 1):
        if y in have and y < now.year - 1:
            continue
        try:
            df = cot.fetch_year(y)
        except Exception as e:  # un anno che manca non ferma gli altri
            errors[y] = str(e)[:120]
            continue
        store.conn.executemany("INSERT OR REPLACE INTO cot VALUES (?,?,?,?,?)",
                               df[["day", "symbol", "oi", "spec_net", "comm_net"]].itertuples(index=False, name=None))
        out[y] = len(df)
    store.conn.commit()
    return {"righe_per_anno": out, "errori": errors}


def _prices(store: Store) -> dict[str, pd.Series]:
    """Prezzi giornalieri dei mercati coperti dal rapporto (le valute contro il dollaro)."""
    px = {}
    for mk in ("etf", "materie_prime"):
        m = universe.MARKETS[mk]
        for s in m["symbols"]:
            if s in cot.MARKETS:
                c = data.load_close(store, m, s)
                if len(c):
                    px[s] = c
    fx = universe.MARKETS["cambi"]
    usd = data.load_close(store, fx, "USD")
    if len(usd):
        px["EUR"] = 1 / usd                                  # dollari per un euro
        for s in ("JPY", "GBP"):
            c = data.load_close(store, fx, s)
            if len(c):
                px[s] = (c / usd).dropna()
    f = universe.FAST
    b = data.load_close(store, f, "XBTEUR")
    if len(b):
        px["XBTEUR"] = b.resample("D").last().dropna()
    return px


def _z(x: pd.Series) -> pd.Series:
    m = x.rolling(Z_WINDOW, min_periods=Z_MIN).mean().shift(1)
    s = x.rolling(Z_WINDOW, min_periods=Z_MIN).std().shift(1)
    return (x - m) / s


def signals(store: Store, symbol: str = "QQQ") -> pd.DataFrame:
    """z-score di fondi e commerciali per `symbol`, indicizzati dal lunedi' in cui si possono usare."""
    store.conn.executescript(SCHEMA)
    rows = store.conn.execute("SELECT day, spec_net, comm_net FROM cot WHERE symbol = ? ORDER BY day", (symbol,)).fetchall()
    if not rows:
        return pd.DataFrame(columns=["spec_z", "comm_z"])
    df = pd.DataFrame(rows, columns=["day", "spec", "comm"])
    df.index = (pd.to_datetime(df.pop("day"), utc=True) + pd.Timedelta(days=6)).normalize()
    return pd.DataFrame({"spec_z": _z(df["spec"]), "comm_z": _z(df["comm"])})


def study(store: Store, today: pd.Timestamp | None = None) -> dict:
    store.conn.executescript(SCHEMA)
    today = today or pd.Timestamp.now(tz="UTC")
    cutoff = today - pd.Timedelta(days=VALIDATION_DAYS)
    rows_db = store.conn.execute("SELECT day, symbol, spec_net, comm_net FROM cot ORDER BY day").fetchall()
    if not rows_db:
        return {"errore": "mancano i dati CFTC: python -m radix_trading bigplayers --collect"}
    df = pd.DataFrame(rows_db, columns=["day", "symbol", "spec", "comm"])
    df["day"] = pd.to_datetime(df["day"], utc=True)
    prices = _prices(store)
    rows = []
    for sym, g in df.groupby("symbol"):
        if sym not in prices:
            continue
        c = prices[sym].sort_index()
        c.index = c.index.normalize()
        cost = COSTS["crypto"] if sym == "XBTEUR" else COSTS["default"]
        g = g.set_index("day").sort_index()
        for who in ("spec", "comm"):
            z = _z(g[who])
            for side, mask in (("molto lunghi", z > Z_EDGE), ("molto corti", z < -Z_EDGE)):
                # disponibili dal lunedi' dopo il martedi' del rapporto
                when = (z.index[mask.fillna(False).to_numpy()] + pd.Timedelta(days=6)).normalize()
                pos = c.index.searchsorted(when)
                for h in HORIZONS:
                    rets, last = {}, -10 ** 9
                    for t, i in zip(when, pos):
                        if i + h >= len(c) or i - last < h:
                            continue
                        rets[c.index[i]] = c.iloc[i + h] / c.iloc[i] - 1
                        last = i
                    if len(rets) < MIN_CASES:
                        continue
                    r = pd.Series(rets)
                    for mode, sign in (("segui", 1 if side == "molto lunghi" else -1),
                                       ("contrasta", -1 if side == "molto lunghi" else 1)):
                        x = sign * r - cost
                        disc, val = x[x.index <= cutoff], x[x.index > cutoff]
                        if len(disc) < MIN_CASES:
                            continue
                        sd = float(disc.std(ddof=1)) or 1e-9
                        t = float(disc.mean() / (sd / math.sqrt(len(disc))))
                        rows.append({"mercato": sym, "chi": "fondi" if who == "spec" else "commerciali",
                                     "posizione": side, "modo": mode, "giorni": h, "n": int(len(disc)),
                                     "netto_medio": float(disc.mean()), "vince": float((disc > 0).mean()), "t": t,
                                     "p": 0.5 * math.erfc(t / math.sqrt(2)), "verifica_n": int(len(val)),
                                     "verifica_netto": float(val.mean()) if len(val) else None})
    m = len(rows)
    order = sorted(range(m), key=lambda i: rows[i]["p"])
    passed = set()
    for rank, i in enumerate(order, 1):
        if rows[i]["p"] <= FDR * rank / m:
            passed = set(order[:rank])
    for i, r in enumerate(rows):
        r["supera_correzione"] = i in passed
        r["regge_verifica"] = bool(i in passed and r["verifica_n"] >= 3 and (r["verifica_netto"] or 0) > 0)
    rows.sort(key=lambda r: r["p"])
    return {"generato": today.strftime("%Y-%m-%dT%H:%M:%SZ"), "prove": m, "superano_correzione": len(passed),
            "reggono_verifica": sum(r["regge_verifica"] for r in rows), "mercati": sorted(df["symbol"].unique()),
            "legami": [r for r in rows if r["supera_correzione"]][:30],
            "migliori_non_corretti": [r for r in rows if not r["supera_correzione"]][:10]}


def save(settings, result: dict) -> None:
    from .snapshot import clean
    (settings.data_dir / "bigplayers.json").write_text(json.dumps(clean(result), default=str, ensure_ascii=False))
