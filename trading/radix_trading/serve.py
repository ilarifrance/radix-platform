"""Un solo processo sempre acceso che fa girare i lavori del Mac su un server (es. Railway).

Chiesto il 2/11/2026 dopo una giornata di buchi di rete sul Mac (Wi-Fi dell'ufficio che filtra gli exchange,
hotspot che si stacca): ogni ora senza rete e' un'ora in cui lo stop del conto vero non e' sorvegliato.

Orari (UTC, come i job launchd del Mac):
- `hourly` ogni ora al minuto 5: raccolta veloce, conto finto, controllo ETF Fineco, sentinella mercati;
- `live`   ogni ora al minuto 15: il conto vero, solo se RADIX_TRADING_MODE=live (altrimenti e' saltato);
- `daily`  ogni giorno alle 22:30: dati lenti, backtest, osservatorio.
Ogni lavoro gira in un processo a parte (`python -m radix_trading <comando>`) con un tempo massimo, cosi' un
lavoro che si pianta non ferma gli altri; un turno saltato (processo occupato o appena riavviato) si recupera
al giro successivo. Spegnere il conto vero dal pannello del server: RADIX_TRADING_MODE=research.
"""

from __future__ import annotations

import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable

from .config import Settings


@dataclass(frozen=True)
class Job:
    name: str
    minute: int                 # minuto dell'ora in cui parte
    hour: int | None = None     # None = ogni ora; altrimenti una volta al giorno a quell'ora UTC
    timeout: int = 15 * 60      # secondi; oltre, il processo viene fermato e si riprova al turno dopo
    live_only: bool = False     # parte solo con il conto vero acceso


JOBS = (
    Job("hourly", minute=5, timeout=50 * 60),
    Job("live", minute=15, timeout=15 * 60, live_only=True),
    Job("daily", minute=30, hour=22, timeout=3 * 3600),
)


def slot(job: Job, now: datetime) -> datetime:
    """L'ultimo orario di partenza del lavoro arrivato prima di (o uguale a) `now`."""
    at = now.replace(minute=job.minute, second=0, microsecond=0)
    if job.hour is not None:
        at = at.replace(hour=job.hour)
        if at > now:
            at -= timedelta(days=1)
    elif at > now:
        at -= timedelta(hours=1)
    return at


def due(now: datetime, last: dict[str, datetime | None], settings: Settings, jobs: tuple[Job, ...] = JOBS) -> list[Job]:
    """I lavori da far partire adesso: il loro turno e' arrivato e non sono ancora partiti per quel turno."""
    out = []
    for job in jobs:
        if job.live_only and settings.mode != "live":
            continue
        at = slot(job, now)
        prev = last.get(job.name)
        if prev is None or prev < at:
            out.append(job)
    return out


def run_job(job: Job, runner: Callable = subprocess.run, log: Callable[[str], None] = print) -> int:
    """Fa girare un lavoro in un processo a parte; ritorna il codice di uscita (124 = tempo scaduto)."""
    cmd = [sys.executable, "-m", "radix_trading", job.name]
    started = time.monotonic()
    log(f"[serve] {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC {job.name}: inizio")
    try:
        code = runner(cmd, timeout=job.timeout).returncode
    except subprocess.TimeoutExpired:
        code = 124
    except Exception as e:  # il server non deve mai fermarsi per un lavoro rotto
        log(f"[serve] {job.name}: errore {e}")
        code = 1
    log(f"[serve] {job.name}: fine, codice {code}, {time.monotonic() - started:.0f} s")
    return code


def loop(settings: Settings, once: bool = False, now_fn: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
         sleep: Callable[[float], None] = time.sleep, runner: Callable = subprocess.run,
         log: Callable[[str], None] = print, jobs: tuple[Job, ...] = JOBS) -> dict[str, datetime | None]:
    """Il ciclo del server: ogni minuto guarda quali lavori sono in turno e li fa girare uno alla volta.

    All'avvio i turni gia' passati si considerano fatti: un riavvio non rifa' il `daily` di ieri sera.
    """
    now = now_fn()
    last: dict[str, datetime | None] = {job.name: slot(job, now) for job in jobs}
    log(f"[serve] avvio {now:%Y-%m-%d %H:%M} UTC, modalita' {settings.mode}, dati in {settings.data_dir}; "
        + ", ".join(f"{j.name} {'ore ' + str(j.hour) + ':' if j.hour is not None else 'minuto '}{j.minute:02d}" for j in jobs))
    while True:
        now = now_fn()
        for job in due(now, last, settings, jobs):
            last[job.name] = slot(job, now)
            run_job(job, runner, log)
        if once:
            return last
        now = now_fn()
        sleep(60 - now.second + 1)
