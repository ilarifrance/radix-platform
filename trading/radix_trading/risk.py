"""Risk manager deterministico: l'ultima parola su ogni ordine.

Non e' un agente AI e non legge testo: applica regole fisse ai numeri. Gli agenti propongono,
il risk manager approva, riduce o rifiuta. Gli ordini che riducono una posizione (vendite)
passano sempre, anche a sistema fermo: uscire deve essere sempre possibile.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .config import RiskLimits, Settings

MIN_ORDER_EUR = 5.0


@dataclass(frozen=True)
class OrderIntent:
    venue: str
    symbol: str
    side: str                 # "buy" o "sell"
    notional_eur: float
    stop_distance: float | None = None  # distanza dello stop dal prezzo, in quota (0.03 = 3%)
    reason: str = ""

    @property
    def key(self) -> str:
        return f"{self.venue}:{self.symbol}"


@dataclass
class PortfolioState:
    equity_eur: float
    peak_equity_eur: float
    day_start_equity_eur: float
    # Chiave "mercato:simbolo", es. "kraken:XBTEUR" o "ibkr:VWCE".
    positions_eur: dict[str, float] = field(default_factory=dict)

    @property
    def gross_exposure_eur(self) -> float:
        return sum(abs(v) for v in self.positions_eur.values())


@dataclass(frozen=True)
class Decision:
    approved: bool
    notional_eur: float
    reasons: tuple[str, ...]


class RiskManager:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.limits: RiskLimits = settings.limits
        self._orders: deque[datetime] = deque()

    # --- stato del sistema ----------------------------------------------------------------
    def kill_switch_on(self) -> bool:
        return Path(self.settings.kill_switch_file).exists()

    def engage_kill_switch(self, why: str) -> None:
        path = Path(self.settings.kill_switch_file)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"{datetime.now(timezone.utc).isoformat()} {why}\n")

    def halt_reasons(self, state: PortfolioState) -> list[str]:
        reasons = []
        if self.kill_switch_on():
            reasons.append("kill switch attivo")
        if state.day_start_equity_eur > 0:
            day_loss = 1 - state.equity_eur / state.day_start_equity_eur
            if day_loss >= self.limits.max_daily_loss:
                reasons.append(f"perdita giornaliera {day_loss:.1%} oltre il limite {self.limits.max_daily_loss:.0%}")
        if state.peak_equity_eur > 0:
            dd = 1 - state.equity_eur / state.peak_equity_eur
            if dd >= self.limits.max_drawdown:
                reasons.append(f"drawdown {dd:.1%} oltre il limite {self.limits.max_drawdown:.0%}")
        return reasons

    # --- controllo ordini -----------------------------------------------------------------
    def check(self, intent: OrderIntent, state: PortfolioState, now: datetime) -> Decision:
        if self.settings.mode == "research":
            return Decision(False, 0.0, ("modalita' ricerca: nessun ordine viene inviato",))
        if intent.venue not in self.limits.allowed_venues:
            return Decision(False, 0.0, (f"mercato non ammesso: {intent.venue}",))
        if intent.notional_eur <= 0:
            return Decision(False, 0.0, ("importo non valido",))
        if not self._rate_ok(now):
            return Decision(False, 0.0, (f"troppi ordini: oltre {self.limits.max_orders_per_hour} in un'ora",))

        held = state.positions_eur.get(intent.key, 0.0)
        if intent.side == "sell":
            # Uscire e' sempre consentito, ma non si va mai corti.
            size = min(intent.notional_eur, held)
            if size <= 0:
                return Decision(False, 0.0, ("nessuna posizione da vendere (vendite allo scoperto vietate)",))
            self._orders.append(now)
            return Decision(True, size, ("riduzione della posizione",))

        if intent.side != "buy":
            return Decision(False, 0.0, (f"lato sconosciuto: {intent.side}",))
        halted = self.halt_reasons(state)
        if halted:
            return Decision(False, 0.0, tuple(halted))
        if not intent.stop_distance or intent.stop_distance <= 0:
            return Decision(False, 0.0, ("ogni acquisto deve avere uno stop",))

        capital = min(self.limits.capital_eur, state.equity_eur)
        caps = {
            "importo richiesto": intent.notional_eur,
            "massimo per posizione": self.limits.max_position_eur - held,
            "rischio per operazione": self.limits.risk_per_trade * capital / intent.stop_distance,
            "esposizione totale": self.limits.max_gross_exposure * self.limits.max_leverage * capital
            - state.gross_exposure_eur,
        }
        binding = min(caps, key=caps.get)
        size = max(0.0, caps[binding])
        if size < MIN_ORDER_EUR:
            return Decision(False, 0.0, (f"importo troppo piccolo dopo i limiti ({binding})",))
        self._orders.append(now)
        reasons = ("approvato",) if binding == "importo richiesto" else (f"ridotto per {binding}",)
        return Decision(True, round(size, 2), reasons)

    def flatten_all(self, state: PortfolioState, why: str) -> list[OrderIntent]:
        """Uscita forzata: attiva il kill switch e prepara la vendita di tutte le posizioni."""
        self.engage_kill_switch(why)
        return [
            OrderIntent(venue=k.split(":", 1)[0], symbol=k.split(":", 1)[1], side="sell", notional_eur=v,
                        reason=f"uscita forzata: {why}")
            for k, v in state.positions_eur.items() if v > 0
        ]

    def _rate_ok(self, now: datetime) -> bool:
        while self._orders and now - self._orders[0] > timedelta(hours=1):
            self._orders.popleft()
        return len(self._orders) < self.limits.max_orders_per_hour
