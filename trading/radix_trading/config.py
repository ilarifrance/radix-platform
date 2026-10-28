"""Impostazioni e limiti di rischio.

I limiti sono numeri fissi letti all'avvio: nessun agente o modello puo' cambiarli a runtime.
Per modificarli si cambia il codice (o le variabili d'ambiente) e si riavvia il motore.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class RiskLimits:
    # Capitale totale destinato ai test (euro). Il motore non usa mai piu' di questo.
    capital_eur: float = 1000.0
    # Rischio massimo per singola operazione, come quota del capitale (perdita allo stop).
    risk_per_trade: float = 0.005
    # Importo massimo di una singola posizione (euro): i test sono da circa 100 euro.
    max_position_eur: float = 100.0
    # Esposizione totale massima, come quota del capitale.
    max_gross_exposure: float = 1.0
    # Perdita giornaliera oltre la quale il motore si ferma fino al giorno dopo.
    max_daily_loss: float = 0.02
    # Drawdown dal picco oltre il quale il motore si ferma del tutto.
    max_drawdown: float = 0.10
    # Ordini massimi per ora (protezione da loop impazziti).
    max_orders_per_hour: int = 20
    # Leva consentita (1.0 = nessuna leva).
    max_leverage: float = 1.0
    # Mercati ammessi.
    allowed_venues: tuple[str, ...] = ("ibkr", "kraken")


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("RADIX_TRADING_DATA", "./data")))
    # Modalita': "research" (solo dati e backtest), "paper", "live". Il default e' sempre research.
    mode: str = field(default_factory=lambda: os.environ.get("RADIX_TRADING_MODE", "research"))
    # File che, se presente, blocca ogni nuovo ordine (kill switch).
    kill_switch_file: Path = field(
        default_factory=lambda: Path(os.environ.get(
            "RADIX_TRADING_KILL", str(Path(os.environ.get("RADIX_TRADING_DATA", "./data")) / "KILL_SWITCH")))
    )
    limits: RiskLimits = field(default_factory=RiskLimits)

    def __post_init__(self) -> None:
        if self.mode not in ("research", "paper", "live"):
            raise ValueError(f"Modalita' sconosciuta: {self.mode}")
        if self.mode == "live" and os.environ.get("RADIX_TRADING_LIVE_CONFIRMED") != "si-confermo-denaro-reale":
            # Il denaro reale richiede una conferma esplicita di Francesco, scritta nell'ambiente.
            raise PermissionError("Modalita' live non confermata: serve l'OK esplicito di Francesco.")

    @property
    def db_path(self) -> Path:
        return self.data_dir / "radix_trading.sqlite"
