"""Universo di partenza dei due livelli. Volutamente piccolo: pochi asset liquidi."""

# Livello veloce: crypto su Kraken, barre orarie.
FAST = {"venue": "kraken", "timeframe": "1h", "symbols": ["XBTEUR", "ETHEUR"],
        "capital_eur": 100.0, "min_trade": 0.0}

# Livello lento: ETF e indici, barre giornaliere. In ricerca si usano i dati Stooq; per gli ordini
# reali su IBKR si useranno gli equivalenti UCITS quotati in Europa (es. VWCE, EUNL, SXR8).
SLOW = {
    "venue": "stooq",
    "timeframe": "1d",
    "symbols": ["spy.us", "qqq.us", "efa.us", "eem.us", "tlt.us", "ief.us", "gld.us", "dbc.us"],
    # Con la commissione minima IBKR (~1,25 euro) 100 euro su 8 ETF costano troppo: in ricerca
    # simuliamo 300 euro e trattiamo solo variazioni di almeno il 5% del capitale.
    "capital_eur": 300.0,
    "min_trade": 0.05,
}
