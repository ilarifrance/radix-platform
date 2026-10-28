"""Paper trading interno: conto simulato con prezzi veri, nessun broker collegato.

Ogni ora (dopo la raccolta dati) `PaperEngine.step` fa un giro completo del sistema:
segnale della strategia -> probabilita' del meta-modello -> risk manager -> esecuzione simulata,
e registra ogni decisione con le sue ragioni. Serve a verificare che il comportamento dal vivo
somigli al backtest prima di qualsiasi euro reale (cancello 2 della roadmap).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from . import data, probability, strategies, universe
from .backtest import Costs
from .config import Settings
from .risk import OrderIntent, PortfolioState, RiskManager
from .store import Store

SCHEMA = """
CREATE TABLE IF NOT EXISTS paper_account (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    cash REAL NOT NULL, peak REAL NOT NULL, day TEXT NOT NULL, day_start REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS paper_positions (
    key TEXT PRIMARY KEY, units REAL NOT NULL, entry_price REAL NOT NULL, stop_price REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS paper_fills (
    ts TEXT NOT NULL, key TEXT NOT NULL, side TEXT NOT NULL, units REAL, price REAL, fee REAL, reason TEXT
);
CREATE TABLE IF NOT EXISTS decisions (
    ts TEXT NOT NULL, key TEXT NOT NULL, price REAL, signal REAL, probability REAL,
    action TEXT NOT NULL, notional REAL, reasons TEXT
);
"""


@dataclass(frozen=True)
class PaperConfig:
    min_probability: float = 0.55   # sotto questa soglia il segnale viene ignorato
    horizon: int = 24               # orizzonte del meta-modello (barre)
    train: int = 24 * 180           # storico usato per allenarlo
    min_bars: int = 24 * 25         # barre minime prima di operare
    stop_min: float = 0.02
    stop_max: float = 0.10


class PaperEngine:
    def __init__(self, store: Store, settings: Settings, costs: Costs = Costs.kraken(),
                 cfg: PaperConfig = PaperConfig()):
        if settings.mode != "paper":
            raise ValueError("PaperEngine richiede la modalita' paper")
        self.store, self.settings, self.costs, self.cfg = store, settings, costs, cfg
        self.risk = RiskManager(settings)
        self.db = store.conn
        self.db.executescript(SCHEMA)
        if self.db.execute("SELECT COUNT(*) FROM paper_account").fetchone()[0] == 0:
            cap = settings.limits.capital_eur
            self.db.execute("INSERT INTO paper_account VALUES (1, ?, ?, '', ?)", (cap, cap, cap))
            self.db.commit()

    # --- stato ----------------------------------------------------------------------------
    def positions(self) -> dict[str, dict]:
        rows = self.db.execute("SELECT key, units, entry_price, stop_price FROM paper_positions").fetchall()
        return {k: {"units": u, "entry": e, "stop": s} for k, u, e, s in rows}

    def state(self, prices: dict[str, float]) -> PortfolioState:
        cash, peak, _, day_start = self.db.execute(
            "SELECT cash, peak, day, day_start FROM paper_account").fetchone()[:4]
        pos = {k: p["units"] * prices.get(k, p["entry"]) for k, p in self.positions().items()}
        return PortfolioState(cash + sum(pos.values()), peak, day_start, pos)

    # --- un giro ---------------------------------------------------------------------------
    def step(self, now: datetime | None = None) -> dict:
        now = now or datetime.now(timezone.utc)
        tier = universe.FAST
        closes = {s: data.load_close(self.store, tier, s) for s in tier["symbols"]}
        # Il prezzo operativo e' l'ultimo di Kraken, non quello dello storico Binance.
        live = {s: self.store.load_bars(tier["venue"], s, tier["timeframe"])["close"] for s in tier["symbols"]}
        prices = {f"{tier['venue']}:{s}": float(c.iloc[-1]) for s, c in live.items() if len(c)}
        closes = {s: c for s, c in closes.items() if f"{tier['venue']}:{s}" in prices}
        self._roll_day(now, prices)
        summary: dict[str, str] = {}

        if self.risk.kill_switch_on():
            for intent in self.risk.flatten_all(self.state(prices), "kill switch"):
                self._execute(intent, prices[intent.key], now, "kill switch")
            summary["sistema"] = "kill switch attivo: posizioni chiuse, nessun nuovo acquisto"

        for sym, close in closes.items():
            key = f"{tier['venue']}:{sym}"
            if len(close) < self.cfg.min_bars:
                summary[key] = self._log(now, key, None, None, None, "attesa", 0, f"solo {len(close)} barre")
                continue
            summary[key] = self._decide(key, sym, close.to_frame(sym), prices, now)

        st = self.state(prices)
        self.db.execute("UPDATE paper_account SET peak = MAX(peak, ?)", (st.equity_eur,))
        self.db.commit()
        summary["patrimonio"] = f"{st.equity_eur:.2f} EUR"
        return summary

    def _decide(self, key: str, sym: str, close: pd.DataFrame, prices: dict, now: datetime) -> str:
        price = prices[key]
        signal = float(strategies.breakout_regime(close).iloc[-1, 0] > 0)
        pos = self.positions().get(key)
        if pos and price <= pos["stop"]:
            return self._sell(key, pos, price, now, signal, None, "stop raggiunto")
        if pos and not signal:
            return self._sell(key, pos, price, now, signal, None, "segnale di uscita")
        if pos or not signal:
            return self._log(now, key, price, signal, None, "nessuna azione", 0,
                             "posizione mantenuta" if pos else "nessun segnale")

        series = close[sym]
        sig_hist = strategies.breakout_regime(close)[sym]
        cost = 2 * (self.costs.fee_bps + self.costs.slippage_bps) / 1e4
        p = probability.latest_probability(series, sig_hist, self.cfg.horizon, cost, self.cfg.train)
        if p is None or p < self.cfg.min_probability:
            why = "meta-modello non pronto" if p is None else f"probabilita' {p:.0%} sotto la soglia"
            return self._log(now, key, price, signal, p, "scartato", 0, why)

        day_vol = float(np.log(series).diff().tail(24 * 30).std() * np.sqrt(24))
        stop = float(np.clip(2 * day_vol, self.cfg.stop_min, self.cfg.stop_max))
        intent = OrderIntent(key.split(":")[0], sym, "buy", self.settings.limits.max_position_eur, stop,
                             reason=f"breakout, p={p:.2f}")
        decision = self.risk.check(intent, self.state(prices), now)
        if not decision.approved:
            return self._log(now, key, price, signal, p, "rifiutato dal risk manager", 0, "; ".join(decision.reasons))
        cash = self.db.execute("SELECT cash FROM paper_account").fetchone()[0]
        notional = min(decision.notional_eur, cash / (1 + self.costs.fee_bps / 1e4))
        fill = self._execute(OrderIntent(intent.venue, sym, "buy", notional, stop), price, now, intent.reason,
                             stop_price=price * (1 - stop))
        return self._log(now, key, price, signal, p, "acquisto", notional,
                         f"{'; '.join(decision.reasons)}; stop a {fill['stop']:.2f}")

    def _sell(self, key, pos, price, now, signal, p, why) -> str:
        intent = OrderIntent(key.split(":")[0], key.split(":", 1)[1], "sell", pos["units"] * price, reason=why)
        decision = self.risk.check(intent, self.state({key: price}), now)
        if not decision.approved:
            return self._log(now, key, price, signal, p, "vendita bloccata", 0, "; ".join(decision.reasons))
        self._execute(intent, price, now, why)
        pnl = (price / pos["entry"] - 1)
        return self._log(now, key, price, signal, p, "vendita", intent.notional_eur, f"{why}; risultato {pnl:+.1%}")

    # --- esecuzione simulata ---------------------------------------------------------------
    def _execute(self, intent: OrderIntent, price: float, now: datetime, reason: str,
                 stop_price: float | None = None) -> dict:
        slip = self.costs.slippage_bps / 1e4
        ts = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        if intent.side == "buy":
            px = price * (1 + slip)
            units = intent.notional_eur / px
            fee = intent.notional_eur * self.costs.fee_bps / 1e4
            self.db.execute("UPDATE paper_account SET cash = cash - ?", (intent.notional_eur + fee,))
            self.db.execute("INSERT OR REPLACE INTO paper_positions VALUES (?,?,?,?)",
                            (intent.key, units, px, stop_price or 0.0))
        else:
            pos = self.positions()[intent.key]
            px = price * (1 - slip)
            units = pos["units"]
            fee = units * px * self.costs.fee_bps / 1e4
            self.db.execute("UPDATE paper_account SET cash = cash + ?", (units * px - fee,))
            self.db.execute("DELETE FROM paper_positions WHERE key = ?", (intent.key,))
        self.db.execute("INSERT INTO paper_fills VALUES (?,?,?,?,?,?,?)",
                        (ts, intent.key, intent.side, units, px, fee, reason))
        self.db.commit()
        return {"units": units, "price": px, "fee": fee, "stop": stop_price or 0.0}

    def _roll_day(self, now: datetime, prices: dict) -> None:
        day = now.strftime("%Y-%m-%d")
        if self.db.execute("SELECT day FROM paper_account").fetchone()[0] != day:
            eq = self.state(prices).equity_eur
            self.db.execute("UPDATE paper_account SET day = ?, day_start = ?", (day, eq))
            self.db.commit()

    def _log(self, now, key, price, signal, p, action, notional, reasons) -> str:
        self.db.execute("INSERT INTO decisions VALUES (?,?,?,?,?,?,?,?)",
                        (now.strftime("%Y-%m-%dT%H:%M:%SZ"), key, price, signal, p, action, notional, reasons))
        self.db.commit()
        return f"{action}: {reasons}"


def report(store: Store, days: int = 7) -> dict:
    """Riepilogo leggibile per Francesco: patrimonio, posizioni, operazioni e decisioni recenti."""
    db = store.conn
    db.executescript(SCHEMA)
    acc = db.execute("SELECT cash, peak FROM paper_account").fetchone()
    fills = pd.read_sql_query(
        "SELECT * FROM paper_fills WHERE ts >= datetime('now', ?) ORDER BY ts DESC", db, params=(f"-{days} days",))
    dec = pd.read_sql_query(
        "SELECT action, COUNT(*) AS n FROM decisions WHERE ts >= datetime('now', ?) GROUP BY action",
        db, params=(f"-{days} days",))
    return {
        "cassa": round(acc[0], 2) if acc else None,
        "picco": round(acc[1], 2) if acc else None,
        "posizioni": db.execute("SELECT key, units, entry_price, stop_price FROM paper_positions").fetchall(),
        "operazioni": fills.to_dict("records"),
        "decisioni": dict(zip(dec["action"], dec["n"])),
    }
