"""Candele: le figure classiche e un modello che impara da solo le figure, con le probabilita' di dopo.

Idea di Francesco (29/10/2026): studiare tutte le candele e ricavarne modelli probabilistici di cosa
succede dopo.

1. Figure classiche (martello, doji, engulfing, stelle, tre soldati/corvi, inside/outside bar...), su
   giorni (ETF, materie prime, Italia) e ore (crypto). Per ognuna: con che frequenza e di quanto il
   prezzo va nel verso "promesso" nelle 1, 3, 5 candele dopo, al netto dei costi. Correzione per le
   prove multiple (Benjamini-Hochberg) sugli anni di scoperta, verifica sull'ultimo anno.
2. Modello a vicini (k-nearest neighbours): descrive le ultime candele (rendimenti e forma, divisi per
   l'oscillazione tipica), cerca nel passato le situazioni piu' simili e stima la probabilita' che il
   prezzo salga nelle prossime `h` candele. Si allena solo sul passato, mese per mese; si opera solo
   quando la probabilita' e' netta (sopra 58% o sotto 42%).

Si entra alla chiusura della candela della figura (decisione con la candela finita).
"""

from __future__ import annotations

import json
import math

import numpy as np
import pandas as pd

from . import data, universe
from .store import Store

HORIZONS = (1, 3, 5)
VALIDATION_DAYS = 365
FDR = 0.10
MIN_CASES = 30
COSTS = {"1d": 0.0025, "1h": 0.005}   # andata e ritorno: ETF con minimo IBKR su 1.000 euro; crypto Kraken
KNN_K, KNN_LOOKBACK, KNN_TRAIN_MAX = 50, 10, 6000
KNN_LONG, KNN_SHORT = 0.58, 0.42

# figura -> verso promesso (+1 rialzo, -1 ribasso)
DIRECTION = {
    "martello": 1, "stella_cadente": -1, "engulfing_rialzo": 1, "engulfing_ribasso": -1,
    "stella_del_mattino": 1, "stella_della_sera": -1, "tre_soldati": 1, "tre_corvi": -1,
    "doji_dopo_rialzo": -1, "doji_dopo_ribasso": 1, "inside_bar_rialzo": 1, "inside_bar_ribasso": -1,
    "outside_bar_rialzo": 1, "outside_bar_ribasso": -1, "piercing": 1, "dark_cloud": -1,
    # chiusura nel 10% piu' basso/alto dell'escursione della candela ("internal bar strength")
    "chiusura_sul_minimo": 1, "chiusura_sul_massimo": -1,
}


def patterns(ohlc: pd.DataFrame) -> pd.DataFrame:
    """Figure classiche, calcolate solo con la candela corrente e quelle prima."""
    o, h, l, c = (ohlc[k].astype(float) for k in ("open", "high", "low", "close"))
    rng = (h - l).replace(0, np.nan)
    body = (c - o).abs()
    up, down = c > o, c < o
    upper = h - np.maximum(o, c)
    lower = np.minimum(o, c) - l
    trend = c / c.shift(10) - 1
    falling, rising = trend < 0, trend > 0
    small = body <= 0.1 * rng
    p = {}
    p["martello"] = falling & (lower >= 2 * body) & (upper <= 0.3 * body + 0.1 * rng) & (body > 0)
    p["stella_cadente"] = rising & (upper >= 2 * body) & (lower <= 0.3 * body + 0.1 * rng) & (body > 0)
    po, pc = o.shift(1), c.shift(1)
    p["engulfing_rialzo"] = falling & up & (pc < po) & (c >= po) & (o <= pc)
    p["engulfing_ribasso"] = rising & down & (pc > po) & (c <= po) & (o >= pc)
    b2 = body.shift(2)
    mid2 = (o.shift(2) + c.shift(2)) / 2
    p["stella_del_mattino"] = falling & (c.shift(2) < o.shift(2)) & (body.shift(1) <= 0.3 * b2) & up & (c > mid2)
    p["stella_della_sera"] = rising & (c.shift(2) > o.shift(2)) & (body.shift(1) <= 0.3 * b2) & down & (c < mid2)
    three_up = up & up.shift(1, fill_value=False) & up.shift(2, fill_value=False) & (c > pc) & (pc > c.shift(2))
    three_dn = down & down.shift(1, fill_value=False) & down.shift(2, fill_value=False) & (c < pc) & (pc < c.shift(2))
    p["tre_soldati"] = three_up & (body > 0.5 * rng)
    p["tre_corvi"] = three_dn & (body > 0.5 * rng)
    p["doji_dopo_rialzo"] = small & rising
    p["doji_dopo_ribasso"] = small & falling
    inside = (h < h.shift(1)) & (l > l.shift(1))
    outside = (h > h.shift(1)) & (l < l.shift(1))
    p["inside_bar_rialzo"] = inside & rising
    p["inside_bar_ribasso"] = inside & falling
    p["outside_bar_rialzo"] = outside & up & (c > h.shift(1) - 0.25 * rng.shift(1))
    p["outside_bar_ribasso"] = outside & down & (c < l.shift(1) + 0.25 * rng.shift(1))
    p["piercing"] = falling & (pc < po) & up & (o < pc) & (c > (po + pc) / 2) & (c < po)
    p["dark_cloud"] = rising & (pc > po) & down & (o > pc) & (c < (po + pc) / 2) & (c > po)
    ibs = (c - l) / rng
    p["chiusura_sul_minimo"] = ibs < 0.1
    p["chiusura_sul_massimo"] = ibs > 0.9
    return pd.DataFrame(p).fillna(False).astype(bool)


def _bh(rows: list[dict]) -> set:
    m = len(rows)
    order = sorted(range(m), key=lambda i: rows[i]["p"])
    passed = set()
    for rank, i in enumerate(order, 1):
        if rows[i]["p"] <= FDR * rank / m:
            passed = set(order[:rank])
    return passed


def pattern_study(series: dict[str, tuple[str, pd.DataFrame]], cutoff: pd.Timestamp) -> list[dict]:
    rows = []
    for name, (tf, ohlc) in series.items():
        pats = patterns(ohlc)
        c = ohlc["close"].astype(float)
        cost = COSTS[tf]
        for h in HORIZONS:
            fwd = c.shift(-h) / c - 1
            for pat, d in DIRECTION.items():
                hits = pats.index[pats[pat]]
                # niente casi sovrapposti: almeno h candele tra un caso e l'altro
                keep, last = [], -10 ** 9
                pos = ohlc.index.get_indexer(hits)
                for i, ts in zip(pos, hits):
                    if i - last >= h:
                        keep.append(ts)
                        last = i
                r = (d * fwd.reindex(keep) - cost).dropna()
                disc, val = r[r.index <= cutoff], r[r.index > cutoff]
                if len(disc) < MIN_CASES:
                    continue
                sd = float(disc.std(ddof=1)) or 1e-9
                t = float(disc.mean() / (sd / math.sqrt(len(disc))))
                rows.append({"figura": pat, "mercato": name, "timeframe": tf, "candele": h, "n": int(len(disc)),
                             "netto_medio": float(disc.mean()), "vince": float((disc > 0).mean()), "t": t,
                             "p": 0.5 * math.erfc(t / math.sqrt(2)),  # una coda: interessa il guadagno
                             "verifica_n": int(len(val)), "verifica_netto": float(val.mean()) if len(val) else None})
    passed = _bh(rows)
    for i, r in enumerate(rows):
        r["supera_correzione"] = i in passed
        r["regge_verifica"] = bool(i in passed and r["verifica_n"] >= 5 and (r["verifica_netto"] or 0) > 0)
    rows.sort(key=lambda r: r["p"])
    return rows


def features(ohlc: pd.DataFrame, lookback: int = KNN_LOOKBACK) -> pd.DataFrame:
    """Ultime candele in forma confrontabile: rendimenti e forma divisi per l'oscillazione tipica."""
    o, h, l, c = (ohlc[k].astype(float) for k in ("open", "high", "low", "close"))
    r = np.log(c).diff()
    vol = r.rolling(100, min_periods=50).std()
    cols = {f"r{k}": r.shift(k) / vol for k in range(lookback)}
    rng = (h - l).replace(0, np.nan)
    for k in range(3):
        cols[f"corpo{k}"] = ((c - o) / rng).shift(k)
        cols[f"sopra{k}"] = ((h - np.maximum(o, c)) / rng).shift(k)
        cols[f"sotto{k}"] = ((np.minimum(o, c) - l) / rng).shift(k)
    cols["trend20"] = (np.log(c) - np.log(c.shift(20))) / (vol * math.sqrt(20))
    return pd.DataFrame(cols).clip(-5, 5)


def knn_walk_forward(ohlc: pd.DataFrame, h: int, tf: str, step: str = "MS") -> pd.DataFrame:
    """Ogni mese: vicini cercati solo nel passato (finito h candele prima), previsione per il mese."""
    X = features(ohlc)
    c = ohlc["close"].astype(float)
    y = (c.shift(-h) / c - 1)
    ok = X.notna().all(axis=1)
    X, y = X[ok], y[ok]
    out = []
    starts = pd.date_range(X.index[0] + pd.Timedelta(days=365), X.index[-1], freq=step, tz=X.index.tz)
    for a, b in zip(starts, list(starts[1:]) + [X.index[-1] + pd.Timedelta(seconds=1)]):
        test = X[(X.index >= a) & (X.index < b)]
        if test.empty:
            continue
        # il rendimento di un esempio di allenamento si conosce solo h candele dopo: tolgo la coda
        train_idx = X.index[X.index < a]
        train_idx = train_idx[:-h] if len(train_idx) > h else train_idx[:0]
        train_idx = train_idx[-KNN_TRAIN_MAX:]
        ytr = y.reindex(train_idx).dropna()
        if len(ytr) < 500:
            continue
        A = X.loc[ytr.index].to_numpy()
        T = test.to_numpy()
        d2 = (T ** 2).sum(1)[:, None] + (A ** 2).sum(1)[None, :] - 2 * T @ A.T
        nn = np.argpartition(d2, KNN_K, axis=1)[:, :KNN_K]
        prob = (ytr.to_numpy()[nn] > 0).mean(axis=1)
        out.append(pd.DataFrame({"prob": prob, "fwd": y.reindex(test.index).to_numpy()}, index=test.index))
    if not out:
        return pd.DataFrame(columns=["prob", "fwd"])
    return pd.concat(out)


def knn_study(series: dict[str, tuple[str, pd.DataFrame]], cutoff: pd.Timestamp) -> list[dict]:
    rows = []
    for name, (tf, ohlc) in series.items():
        if len(ohlc) < 1500:
            continue
        for h in HORIZONS:
            pred = knn_walk_forward(ohlc, h, tf).dropna()
            if pred.empty:
                continue
            for mode, sel, d in (("rialzo", pred["prob"] >= KNN_LONG, 1), ("ribasso", pred["prob"] <= KNN_SHORT, -1)):
                p = pred[sel]
                keep, last = [], -10 ** 9
                pos = ohlc.index.get_indexer(p.index)
                for i, ts in zip(pos, p.index):
                    if i - last >= h:
                        keep.append(ts)
                        last = i
                r = d * p["fwd"].reindex(keep) - COSTS[tf]
                disc, val = r[r.index <= cutoff], r[r.index > cutoff]
                if len(disc) < MIN_CASES:
                    continue
                sd = float(disc.std(ddof=1)) or 1e-9
                t = float(disc.mean() / (sd / math.sqrt(len(disc))))
                calib = float((np.sign(p["fwd"]) == d).mean())
                rows.append({"modello": "vicini", "segnale": mode, "mercato": name, "timeframe": tf, "candele": h,
                             "n": int(len(disc)), "netto_medio": float(disc.mean()), "vince": float((disc > 0).mean()),
                             "verso_giusto": calib, "t": t, "p": 0.5 * math.erfc(t / math.sqrt(2)),
                             "verifica_n": int(len(val)), "verifica_netto": float(val.mean()) if len(val) else None})
    passed = _bh(rows)
    for i, r in enumerate(rows):
        r["supera_correzione"] = i in passed
        r["regge_verifica"] = bool(i in passed and r["verifica_n"] >= 5 and (r["verifica_netto"] or 0) > 0)
    rows.sort(key=lambda r: r["p"])
    return rows


def load_series(store: Store) -> dict[str, tuple[str, pd.DataFrame]]:
    out = {}
    for m, mk in universe.MARKETS.items():
        if mk.get("source") == "fred_fx":
            continue
        for sym in mk["symbols"]:
            b = store.load_bars(mk["venue"], sym, "1d")
            if len(b) >= 500 and (b["high"] != b["low"]).mean() > 0.5:
                out[f"{sym}"] = ("1d", b)
    f = universe.FAST
    for sym in f["symbols"]:
        b = store.load_bars(f["history_venue"], sym, "1h")
        k = store.load_bars(f["venue"], sym, "1h")
        b = pd.concat([b[~b.index.isin(k.index)], k]).sort_index() if len(k) else b
        if len(b) >= 2000:
            out[sym] = ("1h", b)
    return out


def run(store: Store, today: pd.Timestamp | None = None, knn: bool = True) -> dict:
    today = today or pd.Timestamp.now(tz="UTC")
    cutoff = today - pd.Timedelta(days=VALIDATION_DAYS)
    series = load_series(store)
    if not series:
        return {"errore": "mancano i prezzi"}
    pats = pattern_study(series, cutoff)
    model = knn_study(series, cutoff) if knn else []
    return {
        "generato": today.strftime("%Y-%m-%dT%H:%M:%SZ"), "mercati": len(series), "costi": COSTS,
        "figure": {"prove": len(pats), "superano_correzione": sum(r["supera_correzione"] for r in pats),
                   "reggono_verifica": sum(r["regge_verifica"] for r in pats),
                   "legami": [r for r in pats if r["supera_correzione"]][:30],
                   "migliori_non_corretti": [r for r in pats if not r["supera_correzione"]][:10]},
        "modello": {"prove": len(model), "superano_correzione": sum(r["supera_correzione"] for r in model),
                    "reggono_verifica": sum(r["regge_verifica"] for r in model),
                    "legami": [r for r in model if r["supera_correzione"]][:30],
                    "migliori_non_corretti": [r for r in model if not r["supera_correzione"]][:10]},
    }


def save(settings, result: dict) -> None:
    from .snapshot import clean
    (settings.data_dir / "candles.json").write_text(json.dumps(clean(result), default=str, ensure_ascii=False))
