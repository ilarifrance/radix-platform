"""Posizioni dei grandi operatori sui futures: rapporto settimanale CFTC «Commitments of Traders».

Ogni venerdi' (dati del martedi') la CFTC pubblica, per ogni future, quanto sono lunghi e corti i
grandi speculatori (fondi, "non commercial") e gli operatori commerciali (chi produce o usa la
merce e si copre). Si usa il rapporto "legacy", solo futures: file annuali gratuiti dal 1986.
"""

from __future__ import annotations

import io
import re
import zipfile

import pandas as pd

from .http import BROWSER_UA, get

URL = "https://www.cftc.gov/files/dea/history/deacot{year}.zip"

# nostro simbolo -> nome del future nel rapporto (i nomi cambiano negli anni: espressioni regolari)
MARKETS = {
    "GLD": r"^GOLD - COMMODITY EXCHANGE",
    "SLV": r"^SILVER - COMMODITY EXCHANGE",
    "CPER": r"^COPPER.*COMMODITY EXCHANGE",
    "USO": r"^(?:CRUDE OIL, LIGHT SWEET|WTI-PHYSICAL|CRUDE OIL, LIGHT SWEET-WTI) - NEW YORK MERCANTILE",
    "UNG": r"^NATURAL GAS(?: \(NYME\))? - NEW YORK MERCANTILE|^NAT GAS NYME - NEW YORK MERCANTILE",
    "SPY": r"^E-MINI S&P 500(?: STOCK INDEX)? - CHICAGO MERCANTILE",
    "QQQ": r"^(?:NASDAQ-100 STOCK INDEX \(MINI\)|NASDAQ MINI|E-MINI NASDAQ-100) - CHICAGO MERCANTILE",
    "TLT": r"^(?:U\.S\. TREASURY BONDS|UST BOND) - CHICAGO BOARD OF TRADE",
    "IEF": r"^(?:10-YEAR U\.S\. TREASURY NOTES|UST 10Y NOTE) - CHICAGO BOARD OF TRADE",
    "XBTEUR": r"^BITCOIN - CHICAGO MERCANTILE",
    "EUR": r"^EURO FX - CHICAGO MERCANTILE",
    "JPY": r"^JAPANESE YEN - CHICAGO MERCANTILE",
    "GBP": r"^(?:BRITISH POUND STERLING|BRITISH POUND) - CHICAGO MERCANTILE",
}


def _col(df: pd.DataFrame, *words: str) -> str:
    for c in df.columns:
        low = c.lower()
        if all(w in low for w in words):
            return c
    raise KeyError(" ".join(words))


def parse(raw: bytes) -> pd.DataFrame:
    """Un file annuale (zip con un .txt in formato CSV) -> righe per simbolo e data."""
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        name = next(n for n in z.namelist() if n.lower().endswith((".txt", ".csv")))
        df = pd.read_csv(z.open(name), low_memory=False)
    df.columns = [c.strip() for c in df.columns]
    name_c = _col(df, "market and exchange")
    date_c = _col(df, "yyyy-mm-dd")
    oi = _col(df, "open interest (all)")
    nl, ns = _col(df, "noncommercial positions-long (all)"), _col(df, "noncommercial positions-short (all)")
    cl, cs = _col(df, "commercial positions-long (all)"), _col(df, "commercial positions-short (all)")
    if cl == nl:  # "noncommercial" contiene "commercial": serve la colonna che inizia per Commercial
        cl = next(c for c in df.columns if c.lower().startswith("commercial positions-long (all)"))
        cs = next(c for c in df.columns if c.lower().startswith("commercial positions-short (all)"))
    rows = []
    names = df[name_c].astype(str).str.strip()
    for sym, rx in MARKETS.items():
        m = df[names.str.contains(rx, regex=True, flags=re.I)]
        for _, r in m.iterrows():
            o = float(r[oi]) or 1.0
            rows.append({"day": str(r[date_c])[:10], "symbol": sym, "oi": o,
                         "spec_net": (float(r[nl]) - float(r[ns])) / o,
                         "comm_net": (float(r[cl]) - float(r[cs])) / o})
    out = pd.DataFrame(rows)
    # se due contratti hanno lo stesso simbolo nella stessa settimana si tiene quello piu' grande
    return out.sort_values("oi").drop_duplicates(["day", "symbol"], keep="last") if len(out) else out


def fetch_year(year: int) -> pd.DataFrame:
    return parse(get(URL.format(year=year), user_agent=BROWSER_UA, timeout=60).content)
