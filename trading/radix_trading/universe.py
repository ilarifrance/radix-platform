"""Mercati seguiti dal sistema: un livello veloce (crypto, ogni ora) e piu' mercati lenti (giornalieri).

Ogni mercato lento viene provato a parte, con i suoi costi: un ETF americano, un'azione italiana
e una valuta non costano uguale da comprare.
"""

# Livello veloce: crypto su Kraken, barre orarie. Lo storico lungo (anni) arriva da Binance,
# salvato con lo stesso nome di simbolo sotto il mercato "binance".
FAST = {
    "venue": "kraken",
    "timeframe": "1h",
    "symbols": ["XBTEUR", "ETHEUR", "SOLEUR", "XRPEUR", "ADAEUR", "DOTEUR", "LINKEUR", "AVAXEUR"],
    "history_venue": "binance",
    "history_symbols": {"XBTEUR": "BTCEUR", "ETHEUR": "ETHEUR", "SOLEUR": "SOLEUR", "XRPEUR": "XRPEUR",
                        "ADAEUR": "ADAEUR", "DOTEUR": "DOTEUR", "LINKEUR": "LINKEUR", "AVAXEUR": "AVAXEUR"},
    "history_years": 4,
    "capital_eur": 100.0,
    "min_trade": 0.0,
}

# Livelli lenti, barre giornaliere. In ricerca si usano ETF americani (Tiingo) come misura del
# mercato; per gli ordini reali su IBKR si useranno gli equivalenti UCITS quotati in Europa.
# Con la commissione minima IBKR (~1,25 euro) si simulano 300 euro e si trattano solo variazioni
# di almeno il 5% del capitale.
MARKETS = {
    "etf": {
        "title": "ETF azioni e obbligazioni",
        "venue": "yahoo",  # nome storico: i dati arrivano da Tiingo (o Yahoo senza chiave)
        "source": "tiingo",
        "symbols": ["SPY", "QQQ", "IWM", "EFA", "VGK", "EWJ", "EEM", "TLT", "IEF", "LQD", "HYG", "VNQ",
                    "XLK", "XLF", "XLE", "XLV", "XLI", "XLY", "XLP", "XLU"],
        "costs": "ibkr_equities",
    },
    "italia": {
        "title": "Borsa italiana",
        "venue": "italia",
        # Le azioni di Piazza Affari arrivano da Yahoo (suffisso .MI); EWI (MSCI Italia) da Tiingo,
        # cosi' c'e' sempre almeno una misura del mercato italiano anche quando Yahoo blocca.
        "source": "yahoo",
        "sources": {"EWI": "tiingo"},
        "symbols": ["EWI", "ENEL.MI", "ENI.MI", "ISP.MI", "UCG.MI", "RACE.MI", "STLAM.MI", "G.MI",
                    "LDO.MI", "PRY.MI", "STMMI.MI"],
        "costs": "ibkr_italia",
    },
    "materie_prime": {
        "title": "Materie prime",
        "venue": "materie",
        "source": "tiingo",
        "symbols": ["GLD", "SLV", "PPLT", "USO", "UNG", "DBA", "CPER", "DBC"],
        "costs": "ibkr_equities",
    },
    "cambi": {
        "title": "Cambi principali",
        "venue": "cambi",
        # Valore in euro di una unita' di valuta, ricavato dai cambi giornalieri FRED (vedi collectors.fx).
        "source": "fred_fx",
        "symbols": ["USD", "GBP", "JPY", "CHF", "AUD", "CAD"],
        "costs": "ibkr_fx",
    },
}
for _m in MARKETS.values():
    _m.setdefault("timeframe", "1d")
    _m.setdefault("capital_eur", 300.0)
    _m.setdefault("min_trade", 0.05)

# Compatibilita': il vecchio livello lento e' il mercato ETF.
SLOW = MARKETS["etf"]


def source_of(market: dict, symbol: str) -> str:
    return market.get("sources", {}).get(symbol, market["source"])
