"""Serie macro dalla Federal Reserve di St. Louis (FRED), CSV pubblico senza chiave.

Serie utili: DGS10 (rendimento Treasury 10 anni), DGS2, T10Y2Y (curva), VIXCLS (volatilita'),
BAMLH0A0HYM2 (spread high yield), DTWEXBGS (dollaro), CPIAUCSL (inflazione USA), UNRATE.
"""

from __future__ import annotations

import io

import pandas as pd

from .http import get

API = "https://fred.stlouisfed.org/graph/fredgraph.csv"
DEFAULT_SERIES = ("DGS10", "DGS2", "T10Y2Y", "VIXCLS", "BAMLH0A0HYM2", "DTWEXBGS", "DFII10", "T10YIE")


def parse_csv(text: str, series: str) -> pd.Series:
    df = pd.read_csv(io.StringIO(text), na_values=["."])
    date_col = df.columns[0]  # "observation_date" o "DATE" a seconda della versione
    s = pd.Series(pd.to_numeric(df[series], errors="coerce").values, index=pd.to_datetime(df[date_col]), name=series)
    return s.dropna()


def fetch_series(series: str) -> pd.Series:
    return parse_csv(get(API, {"id": series}).text, series)
