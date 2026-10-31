"""«Compra sul ribasso» sugli ETF: ricerca sola, chiesta da Francesco la sera del 31/10/2026.

Domanda: conviene tenere una riserva di cassa e comprare dopo le giornate brutte, invece di stare sempre tutti dentro?
Base: compra e tieni con ribilancio a gennaio (la regola scelta per la corsia Fineco), 3.000 euro, quote intere,
commissioni Fineco e spread. Varianti:
- riserva R (10, 20, 30% del patrimonio) in cassa; quando l'ETF guida (Nasdaq 100) chiude a -S o peggio in un giorno
  (2, 3, 4%), il giorno dopo alla chiusura si investe una parte della cassa (meta' o tutta) in parti uguali negli ETF;
  a gennaio il ribilancio riporta ognuno al suo peso e la cassa alla riserva R (scarti sotto i 150 euro si ignorano);
- «rimbalzo»: come sopra, ma la tranche comprata sul ribasso si rivende dopo 20 giorni di borsa;
- riserva mai usata (soglia nulla): misura quanto costa tenere la cassa ferma.
Confronto con tutto dentro dal primo giorno (R = 0), cioe' il piano fisso. Risultati lordi, senza tasse.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from . import confronto, data, universe
from .store import Store

CAPITALE = confronto.CAPITALE_ETF
RISERVE = (0.10, 0.20, 0.30)
SOGLIE = (0.02, 0.03, 0.04)
TRANCHE = (0.5, 1.0)
RIMBALZI = (None, 20)
RIBILANCIO_MIN = 150.0
GUIDE = ("EQQQ", "XNAS", "QQQ")          # l'ETF che da' il segnale di ribasso, nell'ordine in cui lo si cerca nel paniere
PANIERI = {"prova": confronto.PANIERI["prova"], "operativo": confronto.PANIERI["operativo"]}
USA = {"SPY": "etf", "QQQ": "etf", "EFA": "etf", "GLD": "materie_prime", "TLT": "etf"}   # dal 2005, in dollari, gia' in archivio


def guida(cols) -> str:
    for g in GUIDE:
        for c in cols:
            if c.startswith(g):
                return c
    return cols[0]


def simula(close: pd.DataFrame, riserva: float = 0.0, soglia: float | None = None, tranche: float = 1.0,
           rimbalzo: int | None = None, capitale: float = CAPITALE, spread: float = confronto.SPREAD_ETF,
           commissione=confronto.commissione_fineco) -> dict:
    """Una variante dall'inizio alla fine: quote intere, commissione e spread su ogni ordine, equity giornaliera."""
    close = close.dropna(how="all").sort_index().ffill().dropna()   # si parte quando tutti hanno un prezzo
    if len(close) < 300:
        return {"errore": "storico troppo corto"}
    cols = list(close.columns)
    n = len(cols)
    g = guida(cols)
    ret_g = close[g].pct_change()
    quote = {s: 0 for s in cols}
    stato = {"cash": capitale, "comm": 0.0, "ordini": 0}
    lotti: list[tuple[int, dict]] = []
    equity, cassa, ingressi, anno_rib, pending = [], [], 0, None, False

    def compra(s, budget, p) -> int:
        q = int(min(budget, stato["cash"]) // p)
        while q > 0:
            importo = q * p
            costo = commissione(importo) + importo * spread
            if importo + costo <= stato["cash"]:
                stato["cash"] -= importo + costo
                stato["comm"] += costo
                stato["ordini"] += 1
                quote[s] += q
                return q
            q -= 1
        return 0

    def vendi(s, q, p) -> None:
        q = min(q, quote[s])
        if q <= 0:
            return
        importo = q * p
        costo = commissione(importo) + importo * spread
        stato["cash"] += importo - costo
        stato["comm"] += costo
        stato["ordini"] += 1
        quote[s] -= q

    days = close.index
    for i, day in enumerate(days):
        prezzi = close.iloc[i]
        if i == 0:
            for s in cols:
                compra(s, capitale * (1 - riserva) / n, prezzi[s])
        else:
            for lotto in [l for l in lotti if l[0] <= i]:        # tranche del rimbalzo in scadenza
                for s, q in lotto[1].items():
                    vendi(s, q, prezzi[s])
                lotti.remove(lotto)
            if pending and stato["cash"] > 0:                    # il ribasso di ieri si compra oggi alla chiusura
                budget = stato["cash"] * tranche
                comprato = {s: q for s in cols if (q := compra(s, budget / n, prezzi[s]))}
                if comprato:
                    ingressi += 1
                    if rimbalzo:
                        lotti.append((i + rimbalzo, comprato))
            pending = soglia is not None and ret_g.iloc[i] <= -soglia
            if day.month == 1 and anno_rib != day.year:          # ribilancio di gennaio: pesi uguali, cassa alla riserva
                anno_rib = day.year
                tot = stato["cash"] + sum(quote[s] * prezzi[s] for s in cols)
                obiettivo = tot * (1 - riserva) / n
                for s in cols:
                    eccesso = quote[s] * prezzi[s] - obiettivo
                    if eccesso >= RIBILANCIO_MIN:
                        vendi(s, int(eccesso // prezzi[s]), prezzi[s])
                for s in cols:
                    manca = obiettivo - quote[s] * prezzi[s]
                    if manca >= RIBILANCIO_MIN:
                        compra(s, manca, prezzi[s])
                lotti.clear()
        tot = stato["cash"] + sum(quote[s] * prezzi[s] for s in cols)
        equity.append(tot)
        cassa.append(stato["cash"] / tot)
    eq = pd.Series(equity, index=days)
    years = max((days[-1] - days[0]).days / 365.25, 1e-9)
    mensili = eq.resample("ME").last().pct_change().dropna()
    dd = eq / eq.cummax() - 1
    return {
        "riserva": riserva, "soglia": soglia, "tranche": tranche if soglia else None, "rimbalzo": rimbalzo if soglia else None,
        "guida": g, "inizio": str(days[0].date()), "fine": str(days[-1].date()), "capitale": capitale,
        "finale": float(eq.iloc[-1]), "rendimento_annuo": float((eq.iloc[-1] / capitale) ** (1 / years) - 1),
        "perdita_massima": float(dd.min()),
        "sharpe": float(mensili.mean() / mensili.std(ddof=1) * np.sqrt(12)) if mensili.std(ddof=1) > 0 else 0.0,
        "ordini": stato["ordini"], "ordini_anno": stato["ordini"] / years, "commissioni": stato["comm"],
        "ingressi": ingressi, "cassa_media": float(np.mean(cassa)), "per_anno": confronto.per_anno(eq / capitale),
    }


def varianti() -> list[dict]:
    out = [{"riserva": 0.0, "soglia": None, "tranche": 1.0, "rimbalzo": None}]
    for r in RISERVE:
        out.append({"riserva": r, "soglia": None, "tranche": 1.0, "rimbalzo": None})
        for s in SOGLIE:
            for t in TRANCHE:
                for h in RIMBALZI:
                    out.append({"riserva": r, "soglia": s, "tranche": t, "rimbalzo": h})
    return out


def nome(v: dict) -> str:
    if v["soglia"] is None:
        return "tutto dentro (piano fisso)" if not v["riserva"] else f"riserva {v['riserva']:.0%} mai usata"
    return (f"riserva {v['riserva']:.0%}, compra dopo -{v['soglia']:.0%}, {'meta' if v['tranche'] < 1 else 'tutta'} la cassa"
            + (f", rivende dopo {v['rimbalzo']} giorni" if v["rimbalzo"] else ""))


def paniere(close: pd.DataFrame, capitale: float = CAPITALE) -> dict:
    righe = []
    for v in varianti():
        r = simula(close, capitale=capitale, **v)
        if "errore" in r:
            return r
        righe.append({"nome": nome(v), **r})
    base = righe[0]
    con_ribasso = [r for r in righe if r["soglia"] is not None]
    migliore = max(con_ribasso, key=lambda r: r["rendimento_annuo"]) if con_ribasso else None
    return {"inizio": base["inizio"], "fine": base["fine"], "guida": base["guida"], "attivi": list(close.columns),
            "base": base, "migliore_ribasso": migliore,
            "battono_la_base": sum(r["rendimento_annuo"] > base["rendimento_annuo"] for r in con_ribasso),
            "varianti_ribasso": len(con_ribasso), "righe": righe}


def chiusure_usa(store: Store) -> pd.DataFrame:
    cols = {}
    for sym, market in USA.items():
        s = data.load_close(store, universe.MARKETS[market], sym).dropna()
        if not s.empty:
            cols[sym] = s
    return pd.DataFrame(cols).sort_index()


def run(store: Store, fetch=None, capitale: float = CAPITALE, pausa: float = 1.5) -> dict:
    out = {"quando": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "capitale": capitale,
           "costi": "Fineco max(0,19%, 2,95) tetto 19 euro + spread 0,05%; quote intere; lordo senza tasse", "panieri": {}}
    for key, tickers in PANIERI.items():
        close, usati = confronto.chiusure_etf(store, tickers, fetch=fetch, pausa=pausa)
        if close.empty:
            out["panieri"][key] = {"errore": "nessun dato"}
            continue
        out["panieri"][key] = {"ticker_usati": usati, **paniere(close, capitale)}
    usa = chiusure_usa(store)
    out["panieri"]["usa_2005"] = paniere(usa, capitale) if not usa.empty else {"errore": "archivio USA vuoto"}
    out["testo"] = testo(out)
    return out


def _r(r: dict) -> str:
    return (f"{confronto._pct(r['rendimento_annuo'])} | {confronto._pct(r['perdita_massima'], '')} | {r['sharpe']:.2f} | "
            f"{r['ordini_anno']:.1f} | {r['ingressi']} | {r['cassa_media'] * 100:.0f}%")


def testo(res: dict) -> str:
    lines = [f"# Compra sul ribasso: vale la pena? ({res['quando'][:10]})", "",
             f"Capitale {res['capitale']:,.0f} €, {res['costi']}. Base: compra e tieni con ribilancio a gennaio.", ""]
    for key, p in res["panieri"].items():
        lines.append(f"## Paniere {key}")
        if "errore" in p:
            lines += [p["errore"], ""]
            continue
        lines.append(f"{', '.join(p['attivi'])} dal {p['inizio']} al {p['fine']}; segnale di ribasso da {p['guida']}.")
        lines += ["", "| variante | rend. annuo | perdita max | Sharpe | ordini/anno | ingressi sul ribasso | cassa media |",
                  "|---|---|---|---|---|---|---|"]
        for r in p["righe"]:
            lines.append(f"| {r['nome']} | {_r(r)} |")
        b, m = p["base"], p["migliore_ribasso"]
        if m:
            lines += ["", f"La migliore variante con il ribasso ({m['nome']}) rende {confronto._pct(m['rendimento_annuo'])} l'anno contro "
                      f"{confronto._pct(b['rendimento_annuo'])} del piano fisso, con perdita massima {confronto._pct(m['perdita_massima'], '')} contro "
                      f"{confronto._pct(b['perdita_massima'], '')}. Battono il piano fisso {p['battono_la_base']} varianti su {p['varianti_ribasso']}."]
        lines.append("")
    return "\n".join(lines)
