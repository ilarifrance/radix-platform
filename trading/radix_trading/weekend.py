"""Chiusura del venerdi' e riapertura del lunedi': ci sono legami sfruttabili?

Idea di Francesco (29/10/2026). Le borse sono chiuse dal venerdi' sera al lunedi' mattina, le crypto
no e le notizie nemmeno. Si provano, con i costi, solo operazioni che si possono fare davvero:
1. tenere nel fine settimana: comprare alla chiusura del venerdi', vendere all'apertura o alla chiusura
   del lunedi', sempre o solo dopo un venerdi' forte/debole;
2. il lunedi' all'apertura, seguire o contrastare il salto (gap) rispetto al venerdi', uscita alla
   chiusura del lunedi';
3. il fine settimana delle crypto (dal venerdi' 22:00 al lunedi' 14:00 UTC, prima dell'apertura di
   Wall Street) come segnale per il lunedi' delle borse, dall'apertura alla chiusura;
4. tanti titoli nei notiziari del weekend (archivio Wikipedia) come segnale per il lunedi'.
Scoperta fino a un anno fa, verifica sull'ultimo anno, correzione per le prove multiple.
"""

from __future__ import annotations

import json
import math

import numpy as np
import pandas as pd

from . import universe
from .store import Store

COST = 0.0025          # andata e ritorno ETF (minimo IBKR su 1.000 euro)
VALIDATION_DAYS = 365
FDR = 0.10
MIN_CASES = 40


def _weeks(b: pd.DataFrame) -> pd.DataFrame:
    """Una riga per ogni fine settimana: giovedi'/venerdi' e il primo giorno di borsa dopo."""
    b = b.sort_index()
    idx = b.index
    nxt = pd.Series(idx, index=idx).shift(-1)
    gap_days = (nxt - pd.Series(idx, index=idx)).dt.days
    fri = idx[(idx.dayofweek == 4) & (gap_days.to_numpy() >= 3)]
    rows = []
    for t in fri:
        i = idx.get_loc(t)
        if i < 1 or i + 1 >= len(idx):
            continue
        prev, f, m = b.iloc[i - 1], b.iloc[i], b.iloc[i + 1]
        rows.append({"venerdi": t, "lunedi": idx[i + 1], "ven_ret": f["close"] / prev["close"] - 1,
                     "gap": m["open"] / f["close"] - 1, "lun_giorno": m["close"] / m["open"] - 1,
                     "weekend_chiusura": m["close"] / f["close"] - 1})
    return pd.DataFrame(rows).set_index("lunedi") if rows else pd.DataFrame()


def _crypto_weekend(store: Store) -> pd.Series:
    f = universe.FAST
    b = store.load_bars(f["history_venue"], "XBTEUR", "1h")
    k = store.load_bars(f["venue"], "XBTEUR", "1h")
    b = pd.concat([b[~b.index.isin(k.index)], k]).sort_index() if len(k) else b
    if b.empty:
        return pd.Series(dtype=float)
    c = b["close"]
    # barre orarie: quella che inizia alle 21 UTC finisce alle 22 (dopo la chiusura USA)
    out = {}
    for fri in c.index[(c.index.dayofweek == 4) & (c.index.hour == 21)]:
        mon = fri.normalize() + pd.Timedelta(days=3, hours=13)  # finisce alle 14 UTC, prima delle 14:30
        if mon in c.index:
            out[mon.normalize()] = c[mon] / c[fri] - 1
    return pd.Series(out)


def _weekend_news(store: Store) -> pd.Series:
    try:
        rows = store.conn.execute("SELECT day, COUNT(*) FROM news_items GROUP BY day").fetchall()
    except Exception:
        return pd.Series(dtype=float)
    s = pd.Series({pd.Timestamp(d, tz="UTC"): n for d, n in rows}).sort_index()
    out = {}
    for d in s.index[s.index.dayofweek == 0]:
        out[d] = float(s.reindex([d - pd.Timedelta(days=2), d - pd.Timedelta(days=1)]).fillna(0).sum())
    return pd.Series(out)


def _test(name: str, mercato: str, r: pd.Series, cutoff: pd.Timestamp) -> dict | None:
    r = r.dropna() - COST
    disc, val = r[r.index <= cutoff], r[r.index > cutoff]
    if len(disc) < MIN_CASES:
        return None
    sd = float(disc.std(ddof=1)) or 1e-9
    t = float(disc.mean() / (sd / math.sqrt(len(disc))))
    return {"regola": name, "mercato": mercato, "n": int(len(disc)), "netto_medio": float(disc.mean()),
            "vince": float((disc > 0).mean()), "t": t, "p": 0.5 * math.erfc(t / math.sqrt(2)),
            "verifica_n": int(len(val)), "verifica_netto": float(val.mean()) if len(val) else None}


def study(store: Store, today: pd.Timestamp | None = None) -> dict:
    today = today or pd.Timestamp.now(tz="UTC")
    cutoff = today - pd.Timedelta(days=VALIDATION_DAYS)
    crypto = _crypto_weekend(store)
    news = _weekend_news(store)
    rows = []
    for mk in ("etf", "materie_prime", "italia"):
        m = universe.MARKETS[mk]
        for sym in m["symbols"]:
            b = store.load_bars(m["venue"], sym, "1d")
            if len(b) < 500 or (b["open"] == b["close"]).mean() > 0.5:
                continue
            w = _weeks(b)
            if w.empty:
                continue
            w.index = w.index.normalize()
            q_hi, q_lo = w["ven_ret"].quantile(0.8), w["ven_ret"].quantile(0.2)
            tests = {
                "tieni nel weekend, esci all'apertura": w["gap"],
                "tieni nel weekend, esci alla chiusura del lunedi'": w["weekend_chiusura"],
                "tieni dopo un venerdi' forte": w["weekend_chiusura"][w["ven_ret"] > q_hi],
                "tieni dopo un venerdi' debole": w["weekend_chiusura"][w["ven_ret"] < q_lo],
                "lunedi': segui il salto d'apertura": np.sign(w["gap"]) * w["lun_giorno"],
                "lunedi': contrasta il salto d'apertura": -np.sign(w["gap"]) * w["lun_giorno"],
            }
            big = w["gap"].abs() > w["gap"].abs().quantile(0.8)
            tests["lunedi': contrasta un salto grande"] = (-np.sign(w["gap"]) * w["lun_giorno"])[big]
            tests["lunedi': segui un salto grande"] = (np.sign(w["gap"]) * w["lun_giorno"])[big]
            if len(crypto):
                c = crypto.reindex(w.index)
                strong = c.abs() > crypto.abs().quantile(0.7)
                tests["lunedi': segui il weekend del Bitcoin"] = (np.sign(c) * w["lun_giorno"])[strong]
                tests["lunedi': contrasta il weekend del Bitcoin"] = (-np.sign(c) * w["lun_giorno"])[strong]
            if len(news):
                n = news.reindex(w.index)
                busy = n > n.rolling(52, min_periods=20).quantile(0.9).shift(1)
                tests["lunedi' dopo un weekend pieno di notizie: compra all'apertura"] = w["lun_giorno"][busy]
                tests["lunedi' dopo un weekend pieno di notizie: vendi all'apertura"] = -w["lun_giorno"][busy]
            for name, r in tests.items():
                row = _test(name, sym, r, cutoff)
                if row:
                    rows.append(row)
    m = len(rows)
    order = sorted(range(m), key=lambda i: rows[i]["p"])
    passed = set()
    for rank, i in enumerate(order, 1):
        if rows[i]["p"] <= FDR * rank / m:
            passed = set(order[:rank])
    for i, r in enumerate(rows):
        r["supera_correzione"] = i in passed
        r["regge_verifica"] = bool(i in passed and r["verifica_n"] >= 8 and (r["verifica_netto"] or 0) > 0)
    rows.sort(key=lambda r: r["p"])
    return {"generato": today.strftime("%Y-%m-%dT%H:%M:%SZ"), "prove": m, "superano_correzione": len(passed),
            "reggono_verifica": sum(r["regge_verifica"] for r in rows), "costo": COST,
            "legami": [r for r in rows if r["supera_correzione"]][:30],
            "migliori_non_corretti": [r for r in rows if not r["supera_correzione"]][:10]}


def save(settings, result: dict) -> None:
    from .snapshot import clean
    (settings.data_dir / "weekend.json").write_text(json.dumps(clean(result), default=str, ensure_ascii=False))
