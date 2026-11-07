"""Eventi al minuto: entrare subito dopo l'uscita di un dato e seguire (o contrastare) la prima reazione.

Come fa l'amico di Francesco: vede la notizia ed entra subito. Qui si provano gli eventi con un orario
preciso e noto in anticipo (ora di New York):
- inflazione USA (CPI) e rapporto sul lavoro: 8:30, cioe' 14:30 in Italia;
- comunicato della Fed (FOMC): 14:00, cioe' 20:00 in Italia.

Per ogni evento: prezzo prima dell'uscita, prezzo dopo `ritardo` minuti (la prima reazione e il prezzo
di entrata), poi uscita dopo 30 minuti, 2 ore, alla chiusura di Wall Street o dopo un giorno.
"Segui" entra nel verso della prima reazione, "contrasta" nel verso opposto. Il prezzo usato a un dato
istante e' sempre quello di una barra gia' chiusa: niente informazioni dal futuro.

Dati: Bitcoin ed Ethereum al minuto (Binance, solo le finestre degli eventi), SPY, QQQ, GLD, TLT ogni
5 minuti (Tiingo, borsa IEX). Con l'S&P 500 chiuso alle 8:30 la prima reazione si misura all'apertura.
Costi andata e ritorno: crypto 0,5% (entrata subito a mercato), ETF 0,25% (minimo IBKR su 1.000 euro).
"""

from __future__ import annotations

import json
import math
import zlib
from datetime import timedelta

import numpy as np
import pandas as pd

from . import events, universe
from .collectors import binance, tiingo
from .store import Store

TZ = "America/New_York"
KINDS = {k: v[2] for k, v in events.RELEASES.items()}
CRYPTO = {"Bitcoin": "XBTEUR", "Ethereum": "ETHEUR"}
ETFS = {"S&P 500": "SPY", "Nasdaq": "QQQ", "Oro": "GLD", "Treasury 20+ anni": "TLT"}
DELAYS = (1, 5, 15)                      # minuti dopo l'uscita
EXITS = {"30 minuti": 30, "2 ore": 120, "chiusura": "close", "giorno dopo": 1440}
COSTS = {"crypto": 0.005, "etf": 0.0025}
VALIDATION_DAYS = 365
FDR = 0.10
MIN_EVENTS = 15
SCHEMA = "CREATE TABLE IF NOT EXISTS intraday_done (kind TEXT, ts TEXT, source TEXT, PRIMARY KEY (kind, ts, source));"


def event_times(store: Store) -> list[tuple[str, pd.Timestamp]]:
    events.init(store)
    rows = store.conn.execute("SELECT day, kind FROM calendar WHERE kind IN (%s) ORDER BY day"
                              % ",".join("?" * len(KINDS)), tuple(KINDS)).fetchall()
    out = []
    for day, kind in rows:
        local = pd.Timestamp(f"{day} {KINDS[kind]}").tz_localize(TZ)
        out.append((kind, local.tz_convert("UTC")))
    return out


def collect(store: Store, max_crypto: int = 1500, max_iex: int = 40, now: pd.Timestamp | None = None) -> dict:
    """Scarica solo le finestre intorno agli eventi, un po' per giro (Tiingo gratis: ~50 richieste l'ora)."""
    store.conn.executescript(SCHEMA)
    now = now or pd.Timestamp.now(tz="UTC")
    done = {(k, t, s) for k, t, s in store.conn.execute("SELECT kind, ts, source FROM intraday_done")}
    f = universe.FAST
    report = {"crypto": 0, "iex": 0, "errori": []}
    budget = {"crypto": max_crypto, "iex": max_iex}
    # ordine mescolato (sempre lo stesso): servono sia anni vecchi (scoperta) sia l'ultimo anno (verifica)
    times = sorted(event_times(store), key=lambda e: zlib.crc32(f"{e[0]}{e[1].isoformat()}".encode()))
    for kind, t in times:
        if t > now - pd.Timedelta(days=2):
            continue
        ts = t.isoformat()
        for name, sym in CRYPTO.items():
            if (kind, ts, sym) in done or budget["crypto"] < 2:
                continue
            try:
                bars = binance.fetch_klines(f["history_symbols"][sym], t - pd.Timedelta(minutes=30),
                                            end=t + pd.Timedelta(hours=26), interval="1m", max_requests=2)
                store.upsert_bars(f["history_venue"], sym, "1m", bars)
                store.conn.execute("INSERT OR IGNORE INTO intraday_done VALUES (?,?,?)", (kind, ts, sym))
                report["crypto"] += 1
            except Exception as e:  # una finestra che non arriva non ferma le altre
                report["errori"].append(f"{sym} {ts}: {e}")
            budget["crypto"] -= 2
        if not tiingo.api_key():
            continue
        day = t.tz_convert(TZ).date()
        for name, sym in ETFS.items():
            if (kind, ts, sym) in done or budget["iex"] < 1:
                continue
            try:
                bars = tiingo.fetch_intraday(sym, (day - timedelta(days=1)).isoformat(), (day + timedelta(days=1)).isoformat())
                store.upsert_bars("iex", sym, "5m", bars)
                store.conn.execute("INSERT OR IGNORE INTO intraday_done VALUES (?,?,?)", (kind, ts, sym))
                report["iex"] += 1
            except Exception as e:
                report["errori"].append(f"{sym} {ts}: {e}")
                if "429" in str(e):
                    budget["iex"] = 0
            budget["iex"] -= 1
    store.conn.commit()
    missing = sum(1 for kind, t in event_times(store) if t <= now - pd.Timedelta(days=2)
                  for s in list(CRYPTO.values()) + list(ETFS.values()) if (kind, t.isoformat(), s) not in
                  {(k, x, y) for k, x, y in store.conn.execute("SELECT kind, ts, source FROM intraday_done")})
    report["finestre_mancanti"] = missing
    report["errori"] = report["errori"][:5]
    return report


def _completed(bars: pd.DataFrame, minutes: int) -> pd.Series:
    """Prezzi di chiusura indicizzati all'istante in cui la barra e' finita (non quando e' iniziata)."""
    s = bars["close"].copy()
    s.index = s.index + pd.Timedelta(minutes=minutes)
    return s[~s.index.duplicated(keep="last")].sort_index()


def trades_for(close: pd.Series, t: pd.Timestamp, delay: int) -> dict | None:
    """Prima reazione e prezzi di uscita per un evento all'istante `t` (UTC)."""
    before = close[close.index <= t]
    after = close[close.index >= t + pd.Timedelta(minutes=delay)]
    if before.empty or after.empty:
        return None
    pre, entry_t = float(before.iloc[-1]), after.index[0]
    if entry_t - t > pd.Timedelta(hours=2) or t - before.index[-1] > pd.Timedelta(days=4):
        return None  # mercato chiuso troppo a lungo o dati mancanti
    entry = float(after.iloc[0])
    out = {"reazione": entry / pre - 1, "uscite": {}}
    for label, h in EXITS.items():
        if h == "close":
            local = entry_t.tz_convert(TZ)
            exit_t = local.normalize().tz_localize(None).tz_localize(TZ) + pd.Timedelta(hours=16)
            exit_t = exit_t.tz_convert("UTC")
            if exit_t <= entry_t:
                continue
        else:
            exit_t = entry_t + pd.Timedelta(minutes=h)
        px = close[(close.index > entry_t) & (close.index <= exit_t)]
        if px.empty or exit_t - px.index[-1] > pd.Timedelta(hours=20):
            continue
        out["uscite"][label] = float(px.iloc[-1]) / entry - 1
    return out


def study(store: Store, today: pd.Timestamp | None = None) -> dict:
    today = today or pd.Timestamp.now(tz="UTC")
    cutoff = today - pd.Timedelta(days=VALIDATION_DAYS)
    f = universe.FAST
    series = {}
    for name, sym in CRYPTO.items():
        b = store.load_bars(f["history_venue"], sym, "1m")
        if len(b):
            series[name] = ("crypto", _completed(b, 1))
    for name, sym in ETFS.items():
        b = store.load_bars("iex", sym, "5m")
        if len(b):
            series[name] = ("etf", _completed(b, 5))
    times = event_times(store)
    rows = []
    for kind in KINDS:
        ts = [t for k, t in times if k == kind]
        for name, (cls, close) in series.items():
            for delay in DELAYS:
                if cls == "etf" and delay < 5:
                    continue
                per_exit: dict[str, list] = {}
                for t in ts:
                    tr = trades_for(close, t, delay)
                    if not tr or tr["reazione"] == 0:
                        continue
                    d = math.copysign(1, tr["reazione"])
                    for label, r in tr["uscite"].items():
                        per_exit.setdefault(label, []).append((t, d * r))
                for label, items in per_exit.items():
                    for mode, sign in (("segui", 1), ("contrasta", -1)):
                        r = pd.Series([sign * x for _, x in items], index=[t for t, _ in items]) - COSTS[cls]
                        disc, val = r[r.index <= cutoff], r[r.index > cutoff]
                        if len(disc) < MIN_EVENTS:
                            continue
                        sd = float(disc.std(ddof=1)) or 1e-9
                        tstat = float(disc.mean() / (sd / math.sqrt(len(disc))))
                        rows.append({"evento": kind, "mercato": name, "ritardo_min": delay, "uscita": label,
                                     "modo": mode, "n": int(len(disc)), "netto_medio": float(disc.mean()),
                                     "vince": float((disc > 0).mean()), "t": tstat,
                                     # prova a una coda: interessa solo il guadagno netto positivo
                                     "p": 0.5 * math.erfc(tstat / math.sqrt(2)),
                                     "verifica_n": int(len(val)),
                                     "verifica_netto": float(val.mean()) if len(val) else None})
    m = len(rows)
    order = sorted(range(m), key=lambda i: rows[i]["p"])
    passed = set()
    for rank, i in enumerate(order, 1):
        if rows[i]["p"] <= FDR * rank / m:
            passed = set(order[:rank])
    for i, r in enumerate(rows):
        r["supera_correzione"] = i in passed
        r["regge_verifica"] = bool(i in passed and r["verifica_netto"] is not None and r["verifica_n"] >= 3
                                   and r["verifica_netto"] > 0)
    rows.sort(key=lambda r: r["p"])
    counts = {k: sum(1 for kk, _ in times if kk == k) for k in KINDS}
    return {"generato": today.strftime("%Y-%m-%dT%H:%M:%SZ"), "prove": m, "superano_correzione": len(passed),
            "reggono_verifica": sum(r["regge_verifica"] for r in rows), "eventi": counts,
            "mercati": sorted(series), "costi": COSTS,
            "legami": [r for r in rows if r["supera_correzione"]][:40],
            "migliori_non_corretti": [r for r in rows if not r["supera_correzione"]][:12]}


def save(settings, result: dict) -> None:
    from .snapshot import clean
    (settings.data_dir / "events_intraday.json").write_text(json.dumps(clean(result), default=str, ensure_ascii=False))
