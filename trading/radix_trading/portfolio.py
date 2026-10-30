"""Portafoglio simulato con piu' strade insieme (soldi finti, mai ordini veri).

Ogni giro (ogni ora, ma le strategie decidono al massimo una volta al giorno):
1. ogni corsia calcola i pesi che vorrebbe sui suoi mercati, con i parametri scelti dalla ricerca;
2. il direttore (`multi.allocate`) divide il capitale tra le corsie in base al rischio dell'ultimo
   anno di ciascuna (backtest con costi, solo dati passati);
3. le posizioni si portano verso i pesi totali; si opera solo se lo scarto supera `BAND` del capitale,
   cosi' i piccoli ritocchi non pagano commissioni;
4. idea di Francesco: il guadagno sopra il capitale iniziale va in una riserva, che copre i giorni
   sotto il capitale.

Lo scoperto c'e' solo nella corsia "freno" sulle crypto (perpetui), con funding addebitato ogni giro.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from . import backtest, data, multi, strategies, universe
from .store import Store

START_EUR = 1000.0
BAND = 0.03
ALLOCATION_DAYS = 400
EVENT_LANES = {"cot_nasdaq": 0.20}   # quota del capitale quando la corsia e' attiva

SCHEMA = """
CREATE TABLE IF NOT EXISTS pf_account (id INTEGER PRIMARY KEY CHECK (id = 1), cash REAL NOT NULL,
    reserve REAL NOT NULL, last_ts TEXT);
CREATE TABLE IF NOT EXISTS pf_positions (symbol TEXT PRIMARY KEY, venue TEXT NOT NULL, units REAL NOT NULL);
CREATE TABLE IF NOT EXISTS pf_fills (ts TEXT NOT NULL, symbol TEXT NOT NULL, units REAL, price REAL, fee REAL, lane TEXT);
CREATE TABLE IF NOT EXISTS pf_equity (ts TEXT PRIMARY KEY, equity REAL NOT NULL, reserve REAL NOT NULL);
CREATE TABLE IF NOT EXISTS pf_lanes (ts TEXT NOT NULL, lane TEXT NOT NULL, weight REAL NOT NULL);
"""


@dataclass(frozen=True)
class Lane:
    key: str
    title: str
    market: str           # "crypto" (orario) oppure una chiave di universe.MARKETS
    costs: backtest.Costs


# Parametri scelti dal walk-forward nella ricerca del 29/10/2026 (research.json sul Mac).
LANES = [
    Lane("crypto_trend", "Trend crypto", "crypto", backtest.Costs.kraken_maker()),
    Lane("trend_brake", "Trend crypto con freno allo scoperto", "crypto", backtest.Costs.kraken_short()),
    Lane("gold_macro", "Oro con segnali macro", "materie_prime", backtest.Costs.ibkr_equities()),
    Lane("risk_switch", "Azioni o obbligazioni secondo il VIX", "etf", backtest.Costs.ibkr_equities()),
    # aggiunta il 30/10: segnale CFTC sul Nasdaq, regge i controlli ma con pochi casi recenti: si osserva
    Lane("cot_nasdaq", "Nasdaq quando i grandi operatori lo indicano (CFTC)", "etf", backtest.Costs.ibkr_equities()),
]


def _closes(store: Store, market: str) -> tuple[pd.DataFrame, str, str]:
    """Prezzi di chiusura, sede dei dati e timeframe del mercato."""
    if market == "crypto":
        f = universe.FAST
        cols = {s: data.load_close(store, f, s) for s in f["symbols"]}
        venue, tf = f["venue"], "1h"
    else:
        mk = universe.MARKETS[market]
        cols = {s: data.load_close(store, mk, s) for s in mk["symbols"]}
        venue, tf = mk["venue"], "1d"
    df = pd.DataFrame({s: c for s, c in cols.items() if len(c)})
    return (df.dropna(how="all").ffill() if len(df) else df), venue, tf


def lane_weights(lane: Lane, close: pd.DataFrame, macro: pd.DataFrame, cot: pd.DataFrame | None = None) -> pd.DataFrame:
    if lane.key == "crypto_trend":
        return strategies.crypto_trend_daily(close, fast=24 * 10, slow=24 * 100, vol_target=0.25)
    if lane.key == "trend_brake":
        return multi.trend_brake(close, fast=24 * 10, slow=24 * 100, vol_target=0.25, short_size=0.25, exit_on="rebound")
    if lane.key == "gold_macro":
        return multi.gold_macro(close, macro, trend=100, lookback=60, vol_target=0.10)
    if lane.key == "risk_switch":
        return multi.risk_switch(close, macro, vix_window=252, trend=200)
    if lane.key == "cot_nasdaq":
        return multi.cot_long(close, cot, symbol="QQQ", edge=1.5, hold=10)
    raise KeyError(lane.key)


def plan(store: Store) -> dict:
    """Pesi totali voluti per simbolo, quote del direttore e ultimi prezzi."""
    macro = multi.load_macro(store)
    from . import bigplayers
    cot = bigplayers.signals(store, "QQQ")
    lanes, returns, prices, venues = {}, {}, {}, {}
    for lane in LANES:
        close, venue, tf = _closes(store, lane.market)
        if close.empty or len(close) < 300:
            continue
        w = lane_weights(lane, close, macro, cot)
        recent = close.index[-1] - pd.Timedelta(days=ALLOCATION_DAYS)
        res = backtest.run(close[close.index >= recent - pd.Timedelta(days=150)],
                           w[w.index >= recent - pd.Timedelta(days=150)], tf, lane.costs)
        returns[lane.key] = res.returns[res.returns.index >= recent]
        lanes[lane.key] = w.iloc[-1].to_dict()
        for s in close.columns:
            prices[s], venues[s] = float(close[s].dropna().iloc[-1]), venue
    if not lanes:
        return {"corsie": {}, "pesi": {}, "prezzi": prices, "sedi": venues, "obiettivo": {}}
    # le corsie "a evento" stanno quasi sempre ferme: fuori dal direttore, quota fissa solo quando attive
    events = {k: v for k, v in lanes.items() if k in EVENT_LANES}
    lanes = {k: v for k, v in lanes.items() if k not in EVENT_LANES}
    returns = {k: v for k, v in returns.items() if k not in EVENT_LANES}
    if len(returns) > 1:
        _, alloc = multi.allocate(returns)
        share = alloc.iloc[-1].fillna(0.0).to_dict()
        if sum(share.values()) <= 0:
            share = {k: 1 / len(lanes) for k in lanes}
    else:
        share = {k: 1.0 for k in lanes}
    for key, w in events.items():
        share[key] = 0.0
        if any(np.isfinite(x) and x for x in w.values()):
            share = {k: v * (1 - EVENT_LANES[key]) for k, v in share.items()}
            share[key] = EVENT_LANES[key]
        lanes[key] = w
    target: dict[str, float] = {}
    for key, w in lanes.items():
        for s, x in w.items():
            if np.isfinite(x) and x:
                target[s] = target.get(s, 0.0) + share.get(key, 0.0) * float(x)
    return {"corsie": share, "pesi": target, "prezzi": prices, "sedi": venues, "per_corsia": lanes}


class Portfolio:
    def __init__(self, store: Store):
        self.store, self.db = store, store.conn
        self.db.executescript(SCHEMA)
        if self.db.execute("SELECT COUNT(*) FROM pf_account").fetchone()[0] == 0:
            self.db.execute("INSERT INTO pf_account VALUES (1, ?, 0, NULL)", (START_EUR,))
            self.db.commit()

    def positions(self) -> dict[str, tuple[str, float]]:
        return {s: (v, u) for s, v, u in self.db.execute("SELECT symbol, venue, units FROM pf_positions")}

    def equity(self, prices: dict) -> float:
        cash = self.db.execute("SELECT cash FROM pf_account").fetchone()[0]
        return cash + sum(u * prices.get(s, 0.0) for s, (_, u) in self.positions().items())

    def step(self, now: datetime | None = None, p: dict | None = None) -> dict:
        now = now or datetime.now(timezone.utc)
        ts = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        p = p or plan(self.store)
        prices = p["prezzi"]
        cash, reserve, last = self.db.execute("SELECT cash, reserve, last_ts FROM pf_account").fetchone()
        pos = self.positions()
        # funding dello scoperto per il tempo trascorso
        if last:
            hours = max(0.0, (now - datetime.fromisoformat(last.replace("Z", "+00:00"))).total_seconds() / 3600)
            short = sum(-u * prices.get(s, 0.0) for s, (_, u) in pos.items() if u < 0)
            cash -= short * backtest.Costs.kraken_short().short_bps_year / 1e4 * hours / (24 * 365)
        self.db.execute("UPDATE pf_account SET cash = ?", (cash,))
        eq = self.equity(prices)
        trades = []
        for s in sorted(set(p["pesi"]) | set(pos)):
            px = prices.get(s)
            if not px:
                continue
            want = p["pesi"].get(s, 0.0) * eq / px
            have = pos.get(s, (p["sedi"].get(s, ""), 0.0))[1]
            delta = want - have
            if abs(delta * px) < BAND * eq and not (want == 0 and have != 0):
                continue
            venue = p["sedi"].get(s) or pos.get(s, ("", 0))[0]
            costs = _costs_for(venue)
            fee = max(abs(delta * px) * (costs.fee_bps + costs.slippage_bps) / 1e4, costs.min_fee_eur)
            cash -= delta * px + fee
            self.db.execute("INSERT OR REPLACE INTO pf_positions VALUES (?,?,?)", (s, venue, want))
            self.db.execute("INSERT INTO pf_fills VALUES (?,?,?,?,?,?)", (ts, s, delta, px, fee, venue))
            trades.append({"simbolo": s, "quantita": delta, "prezzo": px, "commissione": fee})
        self.db.execute("DELETE FROM pf_positions WHERE ABS(units) < 1e-12")
        self.db.execute("UPDATE pf_account SET cash = ?, last_ts = ?", (cash, ts))
        moved = self._sweep(prices, now, last)
        eq = self.equity(prices)
        reserve = self.db.execute("SELECT reserve FROM pf_account").fetchone()[0]
        self.db.execute("INSERT OR REPLACE INTO pf_equity VALUES (?,?,?)", (ts, eq, reserve))
        for k, w in p["corsie"].items():
            self.db.execute("INSERT INTO pf_lanes VALUES (?,?,?)", (ts, k, float(w)))
        self.db.commit()
        return {"patrimonio": eq, "riserva": reserve, "operazioni": trades, "messi_da_parte": moved}

    def _sweep(self, prices: dict, now: datetime, last: str | None) -> float:
        """Una volta al giorno: sopra il capitale iniziale si mette da parte, sotto si attinge alla riserva."""
        if last and last[:10] == now.strftime("%Y-%m-%d"):
            return 0.0
        cash, reserve = self.db.execute("SELECT cash, reserve FROM pf_account").fetchone()
        eq = self.equity(prices)
        move = min(eq - START_EUR, max(cash, 0.0)) if eq > START_EUR else -min(START_EUR - eq, reserve)
        if abs(move) < 0.01:
            return 0.0
        self.db.execute("UPDATE pf_account SET cash = cash - ?, reserve = reserve + ?", (move, move))
        return move


def _costs_for(venue: str) -> backtest.Costs:
    if venue == universe.FAST["venue"]:
        return backtest.Costs.kraken_maker()
    return backtest.Costs.ibkr_equities()


def report(store: Store, days: int = 30) -> dict:
    db = store.conn
    db.executescript(SCHEMA)
    acc = db.execute("SELECT cash, reserve FROM pf_account").fetchone()
    since = (pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    eq = db.execute("SELECT ts, equity, reserve FROM pf_equity WHERE ts >= ? ORDER BY ts", (since,)).fetchall()
    last_ts = db.execute("SELECT MAX(ts) FROM pf_lanes").fetchone()[0]
    lanes = db.execute("SELECT lane, weight FROM pf_lanes WHERE ts = ?", (last_ts,)).fetchall() if last_ts else []
    titles = {l.key: l.title for l in LANES}
    fills = db.execute("SELECT ts, symbol, units, price, fee FROM pf_fills ORDER BY ts DESC LIMIT 30").fetchall()
    return {
        "capitale_iniziale": START_EUR,
        "cassa": round(acc[0], 2) if acc else START_EUR,
        "riserva": round(acc[1], 2) if acc else 0.0,
        "patrimonio": round(eq[-1][1], 2) if eq else START_EUR,
        "corsie": [{"id": k, "titolo": titles.get(k, k), "peso": round(w, 4)} for k, w in lanes],
        "posizioni": [{"simbolo": s, "quantita": u} for s, _, u in db.execute("SELECT symbol, venue, units FROM pf_positions")],
        "operazioni": [dict(zip(("ts", "simbolo", "quantita", "prezzo", "commissione"), f)) for f in fills],
        "andamento": [{"ts": t, "patrimonio": round(e, 2), "riserva": round(r, 2)} for t, e, r in eq],
    }
