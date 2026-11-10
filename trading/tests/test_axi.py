import numpy as np
import pandas as pd

from radix_trading import axi
from radix_trading.store import Store

T = "\t"
# Estratto MT4 di prova (numeri e biglietti inventati), nello stesso formato della pagina «Statement» di Axi:
# un lungo chiuso in guadagno, due corti chiusi in perdita (uno chiude in due pezzi), una posizione aperta.
STATEMENT = f"""Broker Demo Ltd
Name: Conto Prova{T}2026.03.10 23:59
Login ID: 1234567
Closed Transactions
Ticket{T}Open Time{T}Type{T}Size{T}Item{T}Price{T}S / L{T}T / P{T}Close Time{T}Price{T}Commission{T}R/O Swap{T}Trade P/L
1001{T}2026.03.06 11:04:25{T}buy limit{T}50 / 0{T}US500{T}5261.40{T}5184.02{T}5704.39{T}2026.03.06 13:08:11{T}5261.40{T} {T} {T}
1002{T}2026.03.06 16:39:19{T}buy{T}50 / 50{T}US500{T}market{T}0.00{T}0.00{T}2026.03.06 16:39:19{T}market{T} {T} {T}

Deals
Ticket{T}Open Time{T}Type{T}Size{T}Item{T}Price{T}Order{T}Entry{T}Comment{T}Fee{T}Commission{T}R/O Swap{T}Trade P/L
2001{T}2026.03.06 11:10:24{T}balance{T} {T} {T} {T} {T} {T}DEP TEST{T} {T} {T} {T}10 000.00
2002{T}2026.03.06 16:39:19{T}buy{T}50{T}US500{T}5400.10{T}1002{T}in{T}{T}0.00{T}0.00{T}0.00{T}0.00
2003{T}2026.03.06 17:32:10{T}sell{T}50{T}US500{T}5402.80{T}1003{T}out{T}{T}0.00{T}0.00{T}0.00{T}135.00
2004{T}2026.03.09 13:05:01{T}sell{T}25{T}US500{T}5418.83{T}1004{T}in{T}{T}0.00{T}0.00{T}0.00{T}0.00
2005{T}2026.03.09 13:29:43{T}sell{T}25{T}US500{T}5427.73{T}1005{T}in{T}{T}0.00{T}0.00{T}0.00{T}0.00
2006{T}2026.03.09 15:11:52{T}buy{T}25{T}US500{T}5461.28{T}1006{T}out{T}sl 5461.28{T}0.00{T}0.00{T}0.00{T}-838.75
2007{T}2026.03.09 17:40:00{T}buy{T}10{T}US500{T}5570.75{T}1007{T}out{T}{T}0.00{T}0.00{T}0.00{T}-1 519.20
Totals:{T}
0.00
0.00
0.00
-2 222.95
Deposits/Withdrawals:{T}
10 000.00
Credit Facility:{T}
0.00
Closed P/L:{T}
-2 222.95


Positions
   Open Time{T}Ticket{T}Type{T}Size{T}Item{T}Price{T}S / L{T}T / P{T}Market Price{T}Swap{T}Profit
2026.03.09 13:05:01{T}3001{T}sell{T}15{T}US500{T}5418.83{T}5722.96{T}5351.92{T}5533.57{T}3.09{T}-1 721.10
 {T}3.09{T} {T}-1 721.10
 {T}Floating P/L:{T}-1 718.01
Working Orders
   Open Time{T}Ticket{T}Type{T}Size{T}Item{T}Price{T}S / L{T}T / P{T}Market Price{T}Comment
2026.03.09 22:32:34{T}3101{T}sell limit{T}5{T}US500{T}5599.32{T}0.00{T}0.00{T}5533.57{T}

Account Summary
Closed Trade P/L:{T}
-2 222.95
 {T}
Total Credit Facility:
0.00
Floating P/L:{T}
-1 718.01
 {T}
Equity:
6 059.04
Deposit/Withdrawal:{T}
10 000.00
 {T}
Margin Requirement:
415.02
Balance:{T}
7 777.05
 {T}
Available Margin:
5 644.02
Previous Ledger Balance:
0.0
"""


def test_parse_statement_sections_numbers_and_server_time():
    p = axi.parse_statement(STATEMENT)
    assert p["account"] == "1234567" and p["day"] == "2026-03-10"
    assert len(p["orders"]) == 2 and p["orders"][0]["type"] == "buy limit" and p["orders"][0]["size"] == "50 / 0"
    assert len(p["deals"]) == 7
    dep = p["deals"][0]
    assert dep["type"] == "balance" and dep["pnl"] == 10000.0 and dep["comment"] == "DEP TEST"
    d = p["deals"][1]
    # ora del server (UTC+2) -> UTC
    assert d["ts"] == "2026-03-06T14:39:19Z" and d["entry"] == "in" and d["price"] == 5400.10 and d["order_ticket"] == 1002
    assert p["deals"][6]["pnl"] == -1519.20 and p["deals"][5]["comment"] == "sl 5461.28"
    assert len(p["positions"]) == 1
    pos = p["positions"][0]
    assert pos["ticket"] == 3001 and pos["type"] == "sell" and pos["size"] == 15 and pos["sl"] == 5722.96 and pos["profit"] == -1721.10
    assert len(p["working"]) == 1 and p["working"][0]["type"] == "sell limit" and p["working"][0]["price"] == 5599.32
    s = p["summary"]
    assert s == {"closed_pl": -2222.95, "floating_pl": -1718.01, "equity": 6059.04, "deposit": 10000.0,
                 "margin": 415.02, "balance": 7777.05, "free_margin": 5644.02}


def test_statement_without_tabs_is_read_too():
    text = STATEMENT.replace("\t", "    ")
    p = axi.parse_statement(text)
    assert len(p["deals"]) == 7 and p["summary"]["equity"] == 6059.04 and len(p["positions"]) == 1


def test_closed_trades_entry_from_pnl_and_scorecard():
    st = Store(":memory:")
    axi.save(st, axi.parse_statement(STATEMENT))
    trades = axi.closed_trades(st)
    assert [t["verso"] for t in trades] == ["lungo", "corto", "corto"]
    long = trades[0]
    assert long["lotti"] == 50 and long["entrata"] == 5400.10 and long["uscita"] == 5402.80 and long["risultato"] == 135.0
    assert abs(long["minuti"] - 52.85) < 0.1 and long["per_punto"] == 50
    # la chiusura con lo stop: entrata ricavata dal risultato (5461.28 - 838.75/25 = 5427.73), non dal primo corto aperto
    stop = trades[1]
    assert abs(stop["entrata"] - 5427.73) < 1e-6 and stop["risultato"] == -838.75
    # la chiusura parziale di 10 lotti: entrata 5570.75 - 1519.20/10 = 5418.83
    part = trades[2]
    assert abs(part["entrata"] - 5418.83) < 1e-6 and part["lotti"] == 10
    s = axi.scorecard(trades)
    assert s["operazioni"] == 3 and s["vinte"] == 1 and s["perse"] == 2 and s["vincita_media"] == 135.0
    assert abs(s["perdita_media"] + 1178.975) < 0.01 and s["per_euro_perso"] == 0.06 and s["per_punto_massimo"] == 50
    # salvare lo stesso estratto due volte non duplica nulla
    axi.save(st, axi.parse_statement(STATEMENT))
    assert len(axi.closed_trades(st)) == 3


def test_exposure_and_diary_text_with_news_and_market_after():
    st = Store(":memory:")
    axi.save(st, axi.parse_statement(STATEMENT))
    day, positions, summary = axi.open_positions(st)
    assert day == "2026-03-10" and summary["equity"] == 6059.04
    e = axi.exposure(positions, summary["equity"])[0]
    assert e["per_punto"] == 15 and abs(e["allo_stop"] - (-(5722.96 - 5418.83) * 15)) < 1e-6
    assert abs(e["allo_stop_quota"] - e["allo_stop"] / 6059.04) < 1e-9
    # mercato di riferimento (SPY) e notizie del giorno in archivio
    idx = pd.bdate_range("2026-03-02", "2026-03-16", tz="UTC")
    c = np.linspace(100, 110, len(idx))
    st.upsert_bars("yahoo", "SPY", "1d", pd.DataFrame({"open": c, "high": c, "low": c, "close": c, "volume": 1.0}, index=idx))
    st.upsert_news([{"url": "https://x/1", "ts": "2026-03-09T12:00:00Z", "title": "Stocks fall as Nvidia probe rattles Wall Street",
                     "source": "test", "language": "en", "country": "US", "query": "rss:test", "sentiment": None},
                    {"url": "https://x/2", "ts": "2026-03-09T12:30:00Z", "title": "Local football derby ends in a draw",
                     "source": "test", "language": "en", "country": "US", "query": "rss:test", "sentiment": None}])
    after = axi.market_after(st, "US500", "2026-03-09")
    assert after["riferimento"] == "SPY" and after["dopo_1"] > 0 and "dopo_5" in after
    news = axi.news_for(st, "2026-03-09")
    assert news == ["2026-03-09: Stocks fall as Nvidia probe rattles Wall Street"]
    axi.note(st, 2007, "chiuso a mano dopo il rimbalzo del lunedi'")
    text = axi.diary_text(st)
    assert "Patrimonio 6,059.04 $" in text and "US500 corto 15 lotti a 5,418.83" in text and "-4,562 $" in text
    assert "mercato dopo (SPY)" in text and "notizia: 2026-03-09: Stocks fall" in text and "appunto: chiuso a mano" in text
    assert "3 operazioni: 1 vinte, 2 perse (33%)" in text and "euro guadagnati per euro perso 0.06" in text
    out = axi.run(st)
    assert out["pagella"]["operazioni"] == 3 and out["testo"].startswith("# Diario conto Axi")
