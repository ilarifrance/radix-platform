"""Fotografia dello stato per il pannello «Trading» di RADIX e invio a RADIX.

Il backtest (lento, una volta al giorno) viene salvato in `backtest.json` nella cartella dati;
ogni ora la fotografia unisce quel file con il conto simulato, i dati raccolti, le notizie e il
quadro macro, e la manda a RADIX con il token personale generato dalla pagina Trading.
Nessuna chiave dei broker passa da qui: solo numeri gia' calcolati sul Mac.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

from . import paper, universe
from .collectors import fred
from .config import Settings, env_value
from .store import Store

DEFAULT_URL = "https://radix-platform.vercel.app"
MACRO_LABELS = {
    "VIXCLS": "Volatilità azioni USA (VIX)",
    "DGS10": "Rendimento Treasury 10 anni",
    "DGS2": "Rendimento Treasury 2 anni",
    "T10Y2Y": "Curva 10 anni meno 2 anni",
    "BAMLH0A0HYM2": "Spread obbligazioni high yield",
    "DTWEXBGS": "Indice del dollaro",
}


def clean(value):
    """NaN e infiniti diventano null: il JSON standard (e RADIX) non li accetta."""
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if hasattr(value, "item") and not isinstance(value, (str, bytes)):  # numeri numpy
        return clean(value.item())
    return value


def backtest_file(settings: Settings) -> Path:
    return settings.data_dir / "backtest.json"


def save_backtest(settings: Settings, results: dict, curves: dict) -> None:
    payload = {"generato": _now(), "risultati": results, "curve": curves}
    backtest_file(settings).write_text(json.dumps(clean(payload), default=str, ensure_ascii=False, allow_nan=False))


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _markets() -> list[dict]:
    fast = universe.FAST
    out = [{"id": "crypto", "titolo": "Crypto", "livello": "veloce", "simboli": fast["symbols"]}]
    out += [{"id": k, "titolo": m["title"], "livello": "lento", "simboli": m["symbols"]}
            for k, m in universe.MARKETS.items()]
    return out


def _macro(store: Store) -> list[dict]:
    out = []
    for series in fred.DEFAULT_SERIES:
        s = store.load_macro(series)
        if s.empty:
            continue
        month_ago = s[s.index <= s.index[-1] - pd.Timedelta(days=30)]
        out.append({"serie": series, "titolo": MACRO_LABELS.get(series, series),
                    "valore": round(float(s.iloc[-1]), 3), "data": s.index[-1].strftime("%Y-%m-%d"),
                    "un_mese_fa": round(float(month_ago.iloc[-1]), 3) if len(month_ago) else None})
    return out


def _research(settings: Settings) -> dict | None:
    p = settings.data_dir / "research.json"
    if not p.exists():
        return None
    r = json.loads(p.read_text())
    return {k: r.get(k) for k in ("obiettivo", "combinazioni_totali", "prove", "rispettano_obiettivo", "finaliste")} | \
        {"classifica": (r.get("classifica") or [])[:15], "generato": datetime.fromtimestamp(p.stat().st_mtime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


def build(store: Store, settings: Settings) -> dict:
    bt_path = backtest_file(settings)
    bt = json.loads(bt_path.read_text()) if bt_path.exists() else {"generato": None, "risultati": {}, "curve": {}}
    news = store.conn.execute(
        "SELECT ts, title, source, query FROM news ORDER BY ts DESC LIMIT 15").fetchall()
    return {
        "versione": 1,
        "generato": _now(),
        "modalita": "paper",  # nessun denaro reale: il pannello lo dice sempre
        "mercati": _markets(),
        "backtest": bt,
        "paper": paper.report(store, days=30),
        "dati": [dict(zip(("mercato", "simbolo", "barre", "ultima"), r)) for r in store.conn.execute(
            "SELECT venue, symbol, COUNT(*), MAX(ts) FROM bars GROUP BY 1, 2 ORDER BY 1, 2").fetchall()],
        "macro": _macro(store),
        "notizie": {
            "totale": store.conn.execute("SELECT COUNT(*) FROM news").fetchone()[0],
            "ultime": [dict(zip(("ts", "titolo", "fonte", "tema"), r)) for r in news],
        },
        "kill_switch": settings.kill_switch_file.exists(),
        "ricerca": _research(settings),
    }


def push(payload: dict, url: str | None = None, token: str | None = None, timeout: int = 30) -> dict:
    """Manda la fotografia a RADIX. Senza token non fa niente (il pannello resta com'era)."""
    token = token or env_value("RADIX_TRADING_TOKEN")
    if not token:
        return {"inviato": False, "motivo": "manca RADIX_TRADING_TOKEN in ~/RadixTrading/.env"}
    base = (url or env_value("RADIX_URL") or DEFAULT_URL).rstrip("/")
    r = requests.post(base + "/api/trading", data=json.dumps(clean(payload), default=str, ensure_ascii=False, allow_nan=False).encode(),
                      headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
                      timeout=timeout)
    if r.status_code >= 400:
        try:
            msg = r.json().get("error")
        except ValueError:
            msg = r.text[:200]
        return {"inviato": False, "stato": r.status_code, "motivo": msg}
    return {"inviato": True, "stato": r.status_code}
