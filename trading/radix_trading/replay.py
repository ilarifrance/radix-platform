"""Riproduzione: lo stesso portafoglio simulato fatto girare ora per ora sui prezzi gia' raccolti.

Invece di aspettare giorni di conto finto, si ripassano gli ultimi mesi come se fossero dal vivo:
stesse corsie, stesso direttore, stessa banda, commissioni, riserva e stop sulla perdita
(`portfolio.Portfolio`). A ogni ora si usa solo cio' che a quell'ora era noto: le barre giornaliere
contano dal giorno dopo, i pesi del direttore sono quelli calcolati sul passato.

Serve a provare la macchina (ordini, costi, stop) in pochi minuti. Non e' un esame pulito della
strategia: quei mesi li abbiamo gia' guardati durante la ricerca.
"""

from __future__ import annotations

import pandas as pd

from . import backtest, bigplayers, multi, portfolio
from .store import Store

DAILY_DELAY = pd.Timedelta(days=1)  # una chiusura giornaliera si conosce solo a giornata finita


def _asof(df: pd.DataFrame, t: pd.Timestamp) -> dict:
    i = df.index.searchsorted(t, side="right") - 1
    return {} if i < 0 else df.iloc[i].to_dict()


def run(store: Store, start: str, end: str | None = None, capital: float = portfolio.START_EUR,
        max_loss: float | None = None, lanes: list[str] | None = None, every_hours: int = 1,
        fee_share: float = portfolio.MAX_FEE_SHARE) -> dict:
    macro = multi.load_macro(store)
    cot = bigplayers.signals(store, "QQQ")
    t0 = pd.Timestamp(start, tz="UTC")
    t1 = pd.Timestamp(end, tz="UTC") if end else None
    frames, returns, clock = {}, {}, []
    for lane in portfolio.LANES + portfolio.TRIAL_LANES:
        if (lanes and lane.key not in lanes) or (not lanes and lane in portfolio.TRIAL_LANES):
            continue
        close, venue, tf = portfolio._closes(store, lane.market)
        if close.empty or len(close) < 300:
            continue
        w = portfolio.lane_weights(lane, close, macro, cot)
        returns[lane.key] = backtest.run(close, w, tf, lane.costs).returns
        known = close.index + (DAILY_DELAY if tf == "1d" else pd.Timedelta(0))
        frames[lane.key] = (w.set_axis(known), close.set_axis(known), venue)
        if tf == "1h":
            clock.append(known)
    if not frames:
        return {"errore": "nessuna corsia con dati sufficienti"}
    alloc = None
    events = [k for k in returns if k in portfolio.EVENT_LANES]
    plain = {k: v for k, v in returns.items() if k not in events}
    if len(plain) > 1:
        _, alloc = multi.allocate(plain)
        idx = pd.DatetimeIndex(alloc.index)
        alloc = alloc.set_axis((idx.tz_localize("UTC") if idx.tz is None else idx) + DAILY_DELAY)
    if clock:
        times = clock[0]
        for c in clock[1:]:
            times = times.union(c)
    else:
        times = pd.date_range(t0.normalize(), (t1 or pd.Timestamp.now(tz="UTC")).normalize(), freq="D", tz="UTC")
    times = times[(times >= t0) & ((times <= t1) if t1 is not None else True)][::max(1, every_hours)]
    if not len(times):
        return {"errore": "nessun dato nel periodo scelto"}

    sim = Store(":memory:")
    pf = portfolio.Portfolio(sim, start=capital, max_loss=max_loss, fee_share=fee_share)
    venues = {}
    for t in times:
        lane_w, prices = {}, {}
        for key, (w, close, venue) in frames.items():
            row = _asof(w, t)
            if not row:
                continue
            lane_w[key] = row
            for s, px in _asof(close, t).items():
                if pd.notna(px) and px > 0:
                    prices[s], venues[s] = float(px), venue
        if not lane_w:
            continue
        share = _asof(alloc, t) if alloc is not None else {k: 1.0 for k in plain}
        share, target = portfolio.combine(lane_w, share={k: v for k, v in share.items() if pd.notna(v)})
        pf.step(t.to_pydatetime(), {"corsie": share, "pesi": target, "prezzi": prices, "sedi": venues})
    return summary(sim, capital, times[0], times[-1], frames)


def summary(sim: Store, capital: float, first, last, frames: dict) -> dict:
    db = sim.conn
    eq = pd.DataFrame(db.execute("SELECT ts, equity, reserve FROM pf_equity ORDER BY ts").fetchall(),
                      columns=["ts", "equity", "reserve"])
    eq["totale"] = eq["equity"] + eq["reserve"]
    eq["ts"] = pd.to_datetime(eq["ts"])
    total = eq.set_index("ts")["totale"]
    daily = total.resample("D").last().dropna()
    dd = float((total / total.cummax() - 1).min()) if len(total) else 0.0
    fills = db.execute("SELECT COUNT(*), COALESCE(SUM(fee), 0) FROM pf_fills").fetchone()
    by_symbol = db.execute("SELECT symbol, COUNT(*), SUM(fee) FROM pf_fills GROUP BY symbol ORDER BY 2 DESC").fetchall()
    halt = db.execute("SELECT ts, total FROM pf_halt").fetchone()
    lanes = db.execute("SELECT lane, AVG(weight) FROM pf_lanes GROUP BY lane").fetchall()
    held = {}
    for key, (_, close, _) in frames.items():
        c = close[(close.index >= first) & (close.index <= last)].dropna(how="all")
        if len(c) > 1:
            held[key] = round(float((c.iloc[-1] / c.iloc[0]).mean() - 1), 4)
    end = float(total.iloc[-1]) if len(total) else capital
    return {
        "dal": str(first), "al": str(last), "giri": int(len(total)), "capitale": capital,
        "finale": round(end, 2), "rendimento": round(end / capital - 1, 4), "max_ribasso": round(dd, 4),
        "operazioni": int(fills[0]), "commissioni": round(float(fills[1]), 2),
        "per_simbolo": [{"simbolo": s, "operazioni": n, "commissioni": round(f, 2)} for s, n, f in by_symbol],
        "quote_medie": {k: round(w, 4) for k, w in lanes},
        "comprare_e_tenere": held,
        "fermato": {"ts": halt[0], "totale": round(halt[1], 2)} if halt else None,
        "andamento": [{"giorno": d.strftime("%Y-%m-%d"), "totale": round(v, 2)} for d, v in daily.items()],
    }
