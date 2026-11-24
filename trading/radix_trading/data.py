"""Lettura dei prezzi per strategie, backtest e paper trading."""

from __future__ import annotations

import pandas as pd

from .store import Store


def load_close(store: Store, tier: dict, symbol: str) -> pd.Series:
    """Prezzi di chiusura del simbolo. Per il livello veloce unisce lo storico lungo (Binance)
    con i dati del mercato operativo (Kraken), che hanno la precedenza dove si sovrappongono."""
    main = store.load_bars(tier["venue"], symbol, tier["timeframe"])["close"]
    hist_venue = tier.get("history_venue")
    if not hist_venue:
        return main
    hist = store.load_bars(hist_venue, symbol, tier["timeframe"])["close"]
    if hist.empty:
        return main
    merged = pd.concat([hist[~hist.index.isin(main.index)], main]).sort_index()
    return merged.rename(symbol)
