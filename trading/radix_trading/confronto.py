"""Confronto fra pochi modelli: stessi dati, stessi costi, quote intere, tasse stimate.

Chiesto dopo la verifica indipendente del 31/10/2026 (ChatGPT) e il commento di Claude. Solo ricerca:
non tocca il conto vero ne' la regola dal vivo (patto del 30/10).

Candidati:
- A0  regola dal vivo: trend 10/100 giorni su 8 crypto, volatilita' obiettivo 25%, pesi a 1/32, decisione 00 UTC;
- A1  solo BTC ed ETH, stessa regola, volatilita' obiettivo 15%, 20%, 25%;
- B0  cinque ETF, trend 12 mesi (paniere operativo VUAA/XNAS/4GLD/IS04/IMEU e paniere di prova CSSPX/EQQQ/SGLD/IS04/SWDA);
- B1  tre attivi (azioni mondo, governativi euro 1-3 anni, oro), trend 12 mesi e media a 10 mesi;
- B2  tre attivi, comprare e tenere con ribilancio a gennaio;
- B3  trend 12 mesi con conferma su due mesi (meno falsi segnali);
- combinazione crypto + ETF con i pesi reali (3/97, 17/83) oltre al 50/50.

Costi: Kraken 0,80% taker (e 0,40% maker) + 0,05% di slittamento; Fineco 0,19% con minimo 2,95 e massimo 19 euro
per ordine + 0,05% di spread. Tasse: 33% sulle crypto (dal 2026), 26% sugli ETF alla vendita, minusvalenze ETF non
compensabili. Le tasse crypto sono stimate sul risultato di ogni anno civile con riporto delle perdite: una
approssimazione, perche' la regola gira circa 1,5 volte il capitale l'anno e quasi tutto il guadagno e' realizzato.
"""

from __future__ import annotations

import math
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from . import backtest, data, fineco, universe
from .collectors import yahoo
from .store import Store

VENUE = "confronto"
SINCE = "2005-01-01"
# La ricerca dei parametri (29/10/2026) ha usato i dati dall'ottobre 2022: questi mesi non li ha mai visti.
PULITO = ("2018-06-01", "2022-09-30")
INTERO = ("2018-06-01", None)
TASSA_CRYPTO = 0.33
TASSA_ETF = 0.26
PASSO = 1 / 32
CAPITALE_CRYPTO = 100.0
CAPITALE_ETF = 3000.0
SPREAD_ETF = 0.0005
PANIERI = {
    "operativo": list(fineco.ETFS),
    "prova": ["CSSPX.MI", "EQQQ.MI", "SGLD.MI", "IS04.DE", "SWDA.MI"],
    "tre": ["SWDA.MI", "IBGS.MI", "SGLD.MI"],
}
# Se Yahoo non ha il simbolo di Milano si prova la stessa classe su un'altra borsa (sempre in euro).
ALTERNATIVE = {"SWDA.MI": ["IWDA.AS"], "IBGS.MI": ["IBGS.AS", "IBGS.L"], "SGLD.MI": ["4GLD.DE"],
               "CSSPX.MI": ["CSPX.AS"], "EQQQ.MI": ["EQQQ.DE"]}
PESI_COMBINAZIONE = ((0.5, 0.5), (0.03, 0.97), (0.17, 0.83))


# --- crypto ------------------------------------------------------------------------------------

def regola_live(close: pd.DataFrame, fast: int = 240, slow: int = 2400, vol_target: float = 0.25,
                hour: int = 0, passo: float = PASSO) -> pd.DataFrame:
    """La regola del conto vero: media veloce sopra la lenta, dosaggio per volatilita', pesi a multipli di 1/32,
    decisione una volta al giorno. Una moneta senza dati vale zero e il suo ottavo resta liquido."""
    n = close.shape[1]
    on = close.rolling(fast).mean() > close.rolling(slow).mean()
    vol = np.log(close).diff().rolling(24 * 30).std() * np.sqrt(24 * 365)
    scale = (vol_target / vol).clip(upper=1.0)
    w = (on.astype(float) * scale / n).fillna(0.0)
    w = (w / passo).round() * passo
    at_hour = pd.Series(close.index.hour == hour, index=close.index)
    return w.where(at_hour, axis=0).ffill().fillna(0.0)


def chiusure_crypto(store: Store, symbols: list[str] | None = None) -> pd.DataFrame:
    cols = {}
    for sym in symbols or universe.FAST["symbols"]:
        s = data.load_close(store, universe.FAST, sym)
        if not s.empty:
            cols[sym] = s[~s.index.duplicated()]
    close = pd.DataFrame(cols).sort_index()
    return close.ffill(limit=6)   # buchi orari brevi


def chiusure_crypto_csv(cartella) -> pd.DataFrame:
    """Storico orario lungo da file `SIMBOLO.csv` (es. XBTEUR.csv) con una colonna tempo e una `close`:
    il tempo in ISO o in secondi/millisecondi Unix. Serve perche' l'archivio del Mac parte dall'ottobre 2022."""
    cols = {}
    for f in sorted(Path(cartella).glob("*.csv")):
        df = pd.read_csv(f)
        low = {c.lower(): c for c in df.columns}
        tcol = next((low[k] for k in ("ts", "time", "timestamp", "open_time", "date", "datetime") if k in low), df.columns[0])
        ccol = low.get("close", df.columns[-1])
        t = df[tcol]
        if pd.api.types.is_numeric_dtype(t):
            ts = pd.to_datetime(t, utc=True, unit="ms" if t.abs().max() > 1e11 else "s")
        else:
            ts = pd.to_datetime(t, utc=True)
        serie = pd.Series(pd.to_numeric(df[ccol], errors="coerce").to_numpy(), index=ts).dropna().sort_index()
        cols[f.stem.upper()] = serie[~serie.index.duplicated()]
    return pd.DataFrame(cols).sort_index().ffill(limit=6)


def per_anno(equity: pd.Series) -> dict[int, float]:
    equity = equity.dropna()
    if equity.empty:
        return {}
    last = equity.groupby(equity.index.year).last()
    prev = last.shift(1)
    prev.iloc[0] = 1.0
    return {int(y): float(v) for y, v in (last / prev - 1).items()}


def tasse_annuali(rendimenti: dict[int, float], aliquota: float) -> float:
    """Rendimento annuo composto dopo le tasse sul risultato di ogni anno, con riporto delle perdite."""
    pool, netti = 0.0, []
    for y in sorted(rendimenti):
        r = rendimenti[y]
        if r > 0:
            imponibile = max(0.0, r - pool)
            pool = max(0.0, pool - r)
            netti.append(r - aliquota * imponibile)
        else:
            pool += -r
            netti.append(r)
    if not netti:
        return 0.0
    tot = float(np.prod([1 + x for x in netti]))
    return tot ** (1 / len(netti)) - 1 if tot > 0 else -1.0


def quota_stop(equity: pd.Series, perdita: float = 0.20, giorni: int = 365) -> float:
    """Quota dei giorni di partenza da cui, entro `giorni`, il conto sarebbe sceso del 20% sotto il capitale iniziale."""
    d = equity.resample("D").last().dropna()
    if len(d) < 30:
        return float("nan")
    fwd_min = d[::-1].rolling(giorni, min_periods=1).min()[::-1]
    hit = (fwd_min / d - 1) <= -perdita
    return float(hit.iloc[:-30].mean())


def _finestra(close: pd.DataFrame, w: pd.DataFrame, start: str, end: str | None, costs: backtest.Costs,
              capitale: float = CAPITALE_CRYPTO) -> dict:
    lo = pd.Timestamp(start, tz="UTC")
    hi = pd.Timestamp(end, tz="UTC") + pd.Timedelta(days=1) if end else None
    c = close.loc[lo:hi].dropna(axis=1, how="all")
    if len(c) < 24 * 30:
        primo = str(close.dropna(how="all").index[0].date()) if not close.dropna(how="all").empty else "mai"
        return {"errore": f"nessun dato orario nella finestra {start} → {end or 'oggi'} (archivio dal {primo}): "
                          f"servono le barre Binance lunghe, vedi --crypto-csv"}
    ww = w.loc[lo:hi][c.columns]
    res = backtest.run(c, ww, "1h", costs, capital_eur=capitale)
    m = res.metrics
    years = max(len(res.returns) / backtest.PERIODS_PER_YEAR["1h"], 1e-9)
    anni = per_anno(res.equity)
    return {
        "inizio": str(c.index[0].date()), "fine": str(c.index[-1].date()), "monete": list(c.columns),
        "rendimento_annuo": m["cagr"], "perdita_massima": m["max_drawdown"], "sharpe": m["sharpe"],
        "ordini_anno": m["orders"] / years, "giro_affari_anno": m["turnover_per_year"],
        "costi_anno": float(res.costs_paid.sum() / years),
        "esposizione_media": float(res.weights.sum(axis=1).mean()),
        "per_anno": anni, "netto_tasse_annuo": tasse_annuali(anni, TASSA_CRYPTO),
        "quota_stop_20": quota_stop(res.equity),
        "_equity": res.equity,
    }


def crypto(store: Store, close: pd.DataFrame | None = None) -> dict:
    close = chiusure_crypto(store) if close is None else close
    out = {"A0": {}, "A1": {}}
    if close.empty:
        return out
    taker, maker = backtest.Costs.kraken(), backtest.Costs.kraken_maker()
    out["archivio_dal"] = str(close.dropna(how="all").index[0].date()) if not close.dropna(how="all").empty else None
    w0 = regola_live(close)
    for nome, (start, end) in (("pulito", PULITO), ("intero", INTERO)):
        out["A0"][nome] = {"taker": _finestra(close, w0, start, end, taker),
                           "maker": _finestra(close, w0, start, end, maker)}
    due = [s for s in ("XBTEUR", "ETHEUR") if s in close.columns]
    if len(due) == 2:
        c2 = close[due]
        for vt in (0.15, 0.20, 0.25):
            w2 = regola_live(c2, vol_target=vt)
            out["A1"][f"vol_{int(vt * 100)}"] = {nome: _finestra(c2, w2, start, end, taker)
                                                 for nome, (start, end) in (("pulito", PULITO), ("intero", INTERO))}
    return out


# --- ETF ---------------------------------------------------------------------------------------

def commissione_fineco(importo: float) -> float:
    return min(max(importo * 0.0019, 2.95), 19.0)


def chiusure_etf(store: Store, tickers: list[str], fetch=None, pausa: float = 1.5) -> tuple[pd.DataFrame, dict]:
    """Chiusure aggiustate (dividendi reinvestiti) da Yahoo, salvate in archivio; con Yahoo giu' si usa l'archivio."""
    fetch = fetch or (lambda sym: yahoo.fetch_daily(sym, since=SINCE))
    cols, usati = {}, {}
    for tk in tickers:
        for cand in [tk, *ALTERNATIVE.get(tk, [])]:
            try:
                bars = fetch(cand)
                if not bars.empty:
                    store.upsert_bars(VENUE, cand, "1d", bars)
                if pausa:
                    time.sleep(pausa)
            except Exception:
                pass
            saved = store.load_bars(VENUE, cand, "1d")
            if not saved.empty:
                cols[tk], usati[tk] = saved["close"].dropna(), cand
                break
    return pd.DataFrame(cols).sort_index(), usati


def segnali(mensili: pd.DataFrame, regola: str) -> pd.DataFrame:
    """Dentro/fuori per ogni attivo a fine mese. NaN finche' non ci sono 13 mesi di storico per tutti."""
    valido = mensili.notna() & mensili.shift(12).notna()
    if regola == "trend12":
        sig = mensili > mensili.shift(12)
    elif regola == "sma10":
        sig = mensili > mensili.rolling(10).mean()
    elif regola == "conferma2":
        raw = (mensili > mensili.shift(12)).astype(float)
        stato = raw.copy()
        for col in raw.columns:
            v = raw[col].to_numpy()
            s = v.copy()
            for i in range(1, len(v)):
                s[i] = v[i] if v[i] == v[i - 1] else s[i - 1]
            stato[col] = s
        sig = stato > 0.5
    elif regola == "bh":
        sig = valido.copy()
    else:
        raise ValueError(f"Regola sconosciuta: {regola}")
    sig = sig.astype(float).where(valido)
    return sig.where(valido.all(axis=1), axis=0)


def simula_etf(close: pd.DataFrame, regola: str, capitale: float = CAPITALE_ETF, ribilancio: bool = False,
               tassa: float = 0.0, spread: float = SPREAD_ETF, commissione=commissione_fineco) -> dict:
    """Quote intere, un N-esimo del patrimonio per attivo all'ingresso, niente ribilancio (salvo `ribilancio`
    a gennaio), commissione e spread su ogni ordine, tassa sulla plusvalenza alla vendita. Decisione sulla
    chiusura di fine mese, esecuzione alla chiusura del primo giorno di borsa del mese dopo."""
    # Un giorno in cui Milano e' chiusa e Xetra aperta (o viceversa) non e' una perdita: si porta avanti l'ultimo prezzo.
    close = close.dropna(how="all").sort_index().ffill()
    mensili = close.resample("ME").last()
    sig = segnali(mensili, regola).dropna(how="all")
    if sig.empty:
        return {"errore": "storico troppo corto"}
    n = close.shape[1]
    days = close.index
    esecuzioni = {}
    for m in sig.index:
        nxt = days[days > m]
        if len(nxt):
            esecuzioni[nxt[0]] = sig.loc[m]
    if not esecuzioni:
        return {"errore": "nessuna esecuzione"}
    primo = min(esecuzioni)
    quote = {s: 0 for s in close.columns}
    base = {s: 0.0 for s in close.columns}
    cash, commissioni, tasse, ordini = capitale, 0.0, 0.0, 0
    equity, anno_ribilanciato = {}, None

    def vendi(s, q, p):
        nonlocal cash, commissioni, tasse, ordini
        if q <= 0:
            return
        importo = q * p
        costo = commissione(importo) + importo * spread
        costo_base = base[s] * q / quote[s]
        guadagno = importo - costo - costo_base
        tassa_dovuta = tassa * guadagno if guadagno > 0 else 0.0
        cash += importo - costo - tassa_dovuta
        commissioni += costo
        tasse += tassa_dovuta
        ordini += 1
        base[s] -= costo_base
        quote[s] -= q

    def compra(s, budget, p):
        nonlocal cash, commissioni, ordini
        q = int(min(budget, cash) // p)
        if q <= 0:
            return
        importo = q * p
        costo = commissione(importo) + importo * spread
        if importo + costo > cash:
            q -= 1
            if q <= 0:
                return
            importo = q * p
            costo = commissione(importo) + importo * spread
        cash -= importo + costo
        commissioni += costo
        ordini += 1
        base[s] += importo + costo
        quote[s] += q

    for day in days[days >= primo]:
        prezzi = close.loc[day]
        if day in esecuzioni:
            target = esecuzioni[day]
            valore = cash + sum(quote[s] * prezzi[s] for s in close.columns if not math.isnan(prezzi[s]))
            for s in close.columns:            # prima le uscite, cosi' la cassa e' disponibile per gli ingressi
                p = prezzi[s]
                if math.isnan(p) or target[s] != 0.0 or quote[s] <= 0:
                    continue
                vendi(s, quote[s], p)
            for s in close.columns:
                p = prezzi[s]
                if math.isnan(p) or target[s] != 1.0 or quote[s] > 0:
                    continue
                compra(s, valore / n, p)
            if ribilancio and day.month == 1 and anno_ribilanciato != day.year and day != primo:
                anno_ribilanciato = day.year
                valore = cash + sum(quote[s] * prezzi[s] for s in close.columns if not math.isnan(prezzi[s]))
                obiettivo = valore / n
                for s in close.columns:
                    p = prezzi[s]
                    if math.isnan(p) or target[s] != 1.0:
                        continue
                    eccesso = quote[s] * p - obiettivo
                    if eccesso > p:
                        vendi(s, int(eccesso // p), p)
                for s in close.columns:
                    p = prezzi[s]
                    if math.isnan(p) or target[s] != 1.0:
                        continue
                    manca = obiettivo - quote[s] * p
                    if manca > p:
                        compra(s, manca, p)
        equity[day] = cash + sum(quote[s] * prezzi[s] for s in close.columns if not math.isnan(prezzi[s]))

    eq = pd.Series(equity).sort_index()
    years = max((eq.index[-1] - eq.index[0]).days / 365.25, 1e-9)
    mensili_r = eq.resample("ME").last().pct_change().dropna()
    dd = eq / eq.cummax() - 1
    anni = per_anno(eq / capitale)
    return {
        "inizio": str(eq.index[0].date()), "fine": str(eq.index[-1].date()), "attivi": list(close.columns),
        "capitale": capitale, "finale": float(eq.iloc[-1]),
        "rendimento_annuo": float((eq.iloc[-1] / capitale) ** (1 / years) - 1),
        "perdita_massima": float(dd.min()),
        "sharpe": float(mensili_r.mean() / mensili_r.std(ddof=1) * np.sqrt(12)) if mensili_r.std(ddof=1) > 0 else 0.0,
        "ordini": ordini, "ordini_anno": ordini / years, "commissioni": commissioni, "tasse": tasse,
        "per_anno": anni, "_equity": eq,
    }


def etf(store: Store, fetch=None, capitale: float = CAPITALE_ETF, pausa: float = 1.5) -> dict:
    out = {"capitale": capitale, "panieri": {}, "risultati": {}}
    chiusure = {}
    for nome, tickers in PANIERI.items():
        close, usati = chiusure_etf(store, tickers, fetch, pausa)
        chiusure[nome] = close
        primi = {tk: str(close[tk].first_valid_index().date()) for tk in close.columns if close[tk].first_valid_index() is not None}
        out["panieri"][nome] = {"richiesti": tickers, "usati": usati, "primi_dati": primi,
                                "dal": max(primi.values()) if primi else None}   # da quando ci sono tutti
    prove = [
        ("B0_operativo_trend12", "operativo", "trend12", False),
        ("B0_prova_trend12", "prova", "trend12", False),
        ("B0_prova_bh_ribilancio", "prova", "bh", True),
        ("B0_operativo_bh_ribilancio", "operativo", "bh", True),
        ("B1_tre_trend12", "tre", "trend12", False),
        ("B1_tre_sma10", "tre", "sma10", False),
        ("B2_tre_bh_ribilancio", "tre", "bh", True),
        ("B3_tre_conferma2", "tre", "conferma2", False),
        ("B3_prova_conferma2", "prova", "conferma2", False),
    ]
    for key, paniere, regola, rib in prove:
        close = chiusure[paniere]
        if close.empty or close.shape[1] < len(PANIERI[paniere]):
            out["risultati"][key] = {"errore": f"dati incompleti per il paniere {paniere}"}
            continue
        lordo = simula_etf(close, regola, capitale, rib, tassa=0.0)
        netto = simula_etf(close, regola, capitale, rib, tassa=TASSA_ETF)
        if "errore" in lordo:
            out["risultati"][key] = lordo
            continue
        out["risultati"][key] = {**lordo, "netto_tasse_annuo": netto["rendimento_annuo"], "tasse_pagate": netto["tasse"]}
    return out


# --- combinazione --------------------------------------------------------------------------------

def combinazione(eq_crypto: pd.Series, eq_etf: pd.Series, pesi=PESI_COMBINAZIONE) -> dict:
    rc = eq_crypto.resample("ME").last().pct_change().dropna().rename("crypto")
    re_ = eq_etf.resample("ME").last().pct_change().dropna().rename("etf")
    df = pd.concat([rc, re_], axis=1, join="inner").dropna()
    if len(df) < 12:
        return {"errore": "meno di 12 mesi in comune"}
    crisi = df[df["etf"] < -0.03]
    out = {"mesi": int(len(df)), "dal": str(df.index[0].date()), "al": str(df.index[-1].date()),
           "correlazione": float(df["crypto"].corr(df["etf"])),
           "correlazione_mesi_di_crisi": float(crisi["crypto"].corr(crisi["etf"])) if len(crisi) > 3 else None,
           "mesi_di_crisi": int(len(crisi)), "pesi": {}}
    for wc, we in pesi:
        r = wc * df["crypto"] + we * df["etf"]
        eq = (1 + r).cumprod()
        years = len(r) / 12
        out["pesi"][f"{int(wc * 100)}/{int(we * 100)}"] = {
            "rendimento_annuo": float(eq.iloc[-1] ** (1 / years) - 1),
            "perdita_massima": float((eq / eq.cummax() - 1).min()),
            "sharpe": float(r.mean() / r.std(ddof=1) * np.sqrt(12)) if r.std(ddof=1) > 0 else 0.0,
        }
    return out


# --- tutto insieme ---------------------------------------------------------------------------------

def _pulisci(x):
    if isinstance(x, dict):
        return {k: _pulisci(v) for k, v in x.items() if not str(k).startswith("_")}
    if isinstance(x, list):
        return [_pulisci(v) for v in x]
    if isinstance(x, (np.floating, float)):
        return None if (isinstance(x, float) and math.isnan(x)) else float(x)
    if isinstance(x, np.integer):
        return int(x)
    return x


def run(store: Store, fetch=None, capitale_etf: float = CAPITALE_ETF, pausa: float = 1.5,
        close_crypto: pd.DataFrame | None = None) -> dict:
    out = {"quando": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
           "costi": "Kraken 0,80% taker / 0,40% maker + 0,05%; Fineco 0,19% min 2,95 max 19 + 0,05%; tasse 33% crypto, 26% ETF",
           "crypto": crypto(store, close_crypto), "etf": etf(store, fetch, capitale_etf, pausa)}
    a0 = out["crypto"].get("A0", {}).get("intero", {}).get("taker")
    b0 = out["etf"]["risultati"].get("B0_prova_trend12")
    if a0 and b0 and "_equity" in b0:
        out["combinazione"] = combinazione(a0["_equity"], b0["_equity"])
    out["testo"] = testo(out)
    return _pulisci(out)


def _pct(x, segno: str = "+") -> str:
    return "n.d." if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x * 100:{segno}.1f}%"


def testo(r: dict) -> str:
    righe = [f"Confronto del {r['quando']} — {r['costi']}", ""]
    righe.append("CRYPTO (100 €, Binance orario)")
    if r["crypto"].get("archivio_dal"):
        righe.append(f"- archivio crypto dal {r['crypto']['archivio_dal']}")
    for key, blocco in r["crypto"].get("A0", {}).items():
        for tipo, f in blocco.items():
            if "errore" in f:
                righe.append(f"- A0 {key} {tipo}: {f['errore']}")
                continue
            righe.append(f"- A0 {key} {tipo}: {_pct(f['rendimento_annuo'])} l'anno, perdita massima {_pct(f['perdita_massima'])}, "
                         f"Sharpe {f['sharpe']:.2f}, netto tasse {_pct(f['netto_tasse_annuo'])}, giro d'affari {f['giro_affari_anno']:.1f}x, "
                         f"costi {_pct(f['costi_anno'], '')} l'anno, stop −20% toccato da {_pct(f['quota_stop_20'], '')} delle partenze "
                         f"({f['inizio']} → {f['fine']})")
    for key, blocco in r["crypto"].get("A1", {}).items():
        for finestra, f in blocco.items():
            if "errore" in f:
                righe.append(f"- A1 BTC+ETH {key} {finestra}: {f['errore']}")
                continue
            righe.append(f"- A1 BTC+ETH {key} {finestra}: {_pct(f['rendimento_annuo'])} l'anno, perdita massima {_pct(f['perdita_massima'])}, "
                         f"Sharpe {f['sharpe']:.2f}, netto tasse {_pct(f['netto_tasse_annuo'])}, stop −20% toccato da {_pct(f['quota_stop_20'], '')} delle partenze")
    righe += ["", f"ETF ({r['etf'].get('capitale', CAPITALE_ETF):,.0f} €, quote intere, prezzi Yahoo aggiustati)"]
    for nome, p in r["etf"]["panieri"].items():
        righe.append(f"- paniere {nome}: {', '.join(p['usati'].values())}; tutti disponibili dal {p['dal']} (primi dati: {p['primi_dati']})")
    for key, f in r["etf"]["risultati"].items():
        if "errore" in f:
            righe.append(f"- {key}: {f['errore']}")
            continue
        righe.append(f"- {key}: {_pct(f['rendimento_annuo'])} l'anno lordo, {_pct(f['netto_tasse_annuo'])} netto, perdita massima "
                     f"{_pct(f['perdita_massima'])}, Sharpe {f['sharpe']:.2f}, {f['ordini_anno']:.1f} ordini l'anno, commissioni {f['commissioni']:.0f} € "
                     f"({f['inizio']} → {f['fine']})")
    c = r.get("combinazione")
    if c and "errore" not in c:
        righe += ["", f"COMBINAZIONE A0 + B0 prova ({c['mesi']} mesi, {c['dal']} → {c['al']}): correlazione {c['correlazione']:.2f}, "
                      f"nei {c['mesi_di_crisi']} mesi di crisi ETF {c['correlazione_mesi_di_crisi'] if c['correlazione_mesi_di_crisi'] is None else round(c['correlazione_mesi_di_crisi'], 2)}"]
        for pesi, f in c["pesi"].items():
            righe.append(f"- crypto/ETF {pesi}: {_pct(f['rendimento_annuo'])} l'anno, perdita massima {_pct(f['perdita_massima'])}, Sharpe {f['sharpe']:.2f}")
    return "\n".join(righe)
