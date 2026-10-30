"""Leva, solo in simulazione: quanto cambiano guadagni e perdite moltiplicando le posizioni.

La leva non migliora una strategia: moltiplica guadagni, perdite e costi. Serve quando una
strategia e' buona ma tranquilla (perdite massime piccole) e si vuole portarla verso l'obiettivo.
Qui si prende il rendimento giornaliero gia' testato fuori campione (walk-forward, con i costi)
e lo si moltiplica per la leva, aggiungendo:
- il costo del finanziamento: con un conto a margine (IBKR) si paga solo sulla parte presa in
  prestito; con i CFD si paga ogni notte su tutta la posizione;
- la chiusura forzata del broker: per le regole ESMA il broker chiude tutto quando il conto scende
  sotto il 50% del margine richiesto. Con dati giornalieri si vede solo la chiusura del giorno: dentro
  la giornata puo' andare peggio, quindi il risultato e' ottimista proprio dove la leva e' alta;
- i limiti di legge per i privati in UE (ESMA): 20 su indici principali e oro, 10 su altre materie
  prime e indici minori, 30 sulle valute principali, 2 sulle crypto. Le leve piu' alte si vedono come
  esempio ("fuori UE") ma non sono un'opzione.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .backtest import PERIODS_PER_YEAR, metrics

LEVELS = (1.0, 1.5, 2.0, 3.0, 5.0, 10.0, 100.0)
ESMA_MAX = {"etf": 20, "materie_prime": 10, "italia": 5, "cambi": 30, "crypto": 2, "multi": 10, "multi_asset": 10}
# costo annuo del finanziamento: (punti base, solo sulla parte in prestito?)
FINANCING = {"margine": (400.0, True), "cfd": (650.0, False)}
CLOSE_OUT = 0.5


def levered(r: pd.Series, lev: float, timeframe: str, market: str, kind: str = "cfd") -> tuple[pd.Series, str | None]:
    """Rendimenti con la leva, costo del finanziamento e chiusura forzata. Torna anche quando e' scattata."""
    if lev <= 1.0:
        return r, None
    ppy = PERIODS_PER_YEAR.get(timeframe, 252)
    if timeframe == "1d" and len(r) > 2:
        span = (r.index[-1] - r.index[0]).days / 365.25
        ppy = (len(r) - 1) / span if span > 0.25 else ppy
    bps, excess_only = FINANCING[kind]
    base = (lev - 1.0) if excess_only else lev
    out = lev * r - base * bps / 1e4 / ppy
    # margine richiesto = posizione / leva massima del prodotto; chiusura sotto il 50% di quello
    product_max = max(ESMA_MAX.get(market, 10), lev)
    floor = CLOSE_OUT * lev / product_max - 1.0   # perdita del conto in una barra che fa scattare la chiusura
    hit = out[out <= floor]
    if len(hit):
        t = hit.index[0]
        out = out.copy()
        out[t] = -1.0 + CLOSE_OUT * lev / product_max
        out[out.index > t] = 0.0
        return out, str(t)
    return out, None


def table(r: pd.Series, timeframe: str, market: str, kind: str = "cfd", target_dd: float = -0.20) -> dict:
    """Per ogni leva: guadagno annuo, perdita massima, se il broker avrebbe chiuso tutto."""
    rows = []
    for lev in LEVELS:
        x, closed = levered(r, lev, timeframe, market, kind)
        m = metrics(x, timeframe)
        rows.append({"leva": lev, "annuo": m.get("cagr"), "max_drawdown": m.get("max_drawdown"),
                     "chiusura_forzata": closed, "consentita_ue": lev <= ESMA_MAX.get(market, 10),
                     "rispetta_perdita_max": bool(closed is None and (m.get("max_drawdown") or -1) >= target_dd)})
    ok = [x for x in rows if x["rispetta_perdita_max"] and x["consentita_ue"]]
    best = max(ok, key=lambda x: x["annuo"] or -1) if ok else None
    return {"tipo": kind, "righe": rows, "leva_migliore_entro_limite": best["leva"] if best else None}
