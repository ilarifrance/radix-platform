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
2008{T}2026.03.09 13:45:10{T}sell{T}15{T}US500{T}5426.73{T}1008{T}in{T}{T}0.00{T}0.00{T}0.00{T}0.00
2009{T}2026.03.09 14:49:30{T}buy{T}15{T}US500{T}5443.60{T}1009{T}out{T}sl 5443.60{T}0.00{T}0.00{T}0.00{T}-253.05
2006{T}2026.03.09 15:11:52{T}buy{T}25{T}US500{T}5461.28{T}1006{T}out{T}sl 5461.28{T}0.00{T}0.00{T}0.00{T}-838.75
2007{T}2026.03.09 17:40:00{T}buy{T}10{T}US500{T}5570.75{T}1007{T}out{T}{T}0.00{T}0.00{T}0.00{T}-1 519.20
Totals:{T}
0.00
0.00
0.00
-2 476.00
Deposits/Withdrawals:{T}
10 000.00
Credit Facility:{T}
0.00
Closed P/L:{T}
-2 476.00


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
-2 476.00
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
    assert len(p["deals"]) == 9
    dep = p["deals"][0]
    assert dep["type"] == "balance" and dep["pnl"] == 10000.0 and dep["comment"] == "DEP TEST"
    d = p["deals"][1]
    # ora del server (UTC+2) -> UTC
    assert d["ts"] == "2026-03-06T14:39:19Z" and d["entry"] == "in" and d["price"] == 5400.10 and d["order_ticket"] == 1002
    assert p["deals"][8]["pnl"] == -1519.20 and p["deals"][7]["comment"] == "sl 5461.28"
    assert len(p["positions"]) == 1
    pos = p["positions"][0]
    assert pos["ticket"] == 3001 and pos["type"] == "sell" and pos["size"] == 15 and pos["sl"] == 5722.96 and pos["profit"] == -1721.10
    assert len(p["working"]) == 1 and p["working"][0]["type"] == "sell limit" and p["working"][0]["price"] == 5599.32
    s = p["summary"]
    assert s == {"closed_pl": -2476.0, "floating_pl": -1718.01, "equity": 6059.04, "deposit": 10000.0,
                 "margin": 415.02, "balance": 7777.05, "free_margin": 5644.02}


def test_statement_without_tabs_is_read_too():
    text = STATEMENT.replace("\t", "    ")
    p = axi.parse_statement(text)
    assert len(p["deals"]) == 9 and p["summary"]["equity"] == 6059.04 and len(p["positions"]) == 1


def test_closed_trades_entry_from_pnl_and_scorecard():
    st = Store(":memory:")
    axi.save(st, axi.parse_statement(STATEMENT))
    trades = axi.closed_trades(st)
    assert [t["verso"] for t in trades] == ["lungo", "corto", "corto", "corto"]
    long = trades[0]
    assert long["lotti"] == 50 and long["entrata"] == 5400.10 and long["uscita"] == 5402.80 and long["risultato"] == 135.0
    assert abs(long["minuti"] - 52.85) < 0.1 and long["per_punto"] == 50
    # le chiusure con lo stop: entrata ricavata dal risultato (5443.60 - 253.05/15 = 5426.73; 5461.28 - 838.75/25 = 5427.73),
    # non dal primo corto aperto
    assert abs(trades[1]["entrata"] - 5426.73) < 1e-6 and trades[1]["risultato"] == -253.05
    assert abs(trades[2]["entrata"] - 5427.73) < 1e-6 and trades[2]["risultato"] == -838.75
    # la chiusura parziale di 10 lotti: entrata 5570.75 - 1519.20/10 = 5418.83
    part = trades[3]
    assert abs(part["entrata"] - 5418.83) < 1e-6 and part["lotti"] == 10
    # esposizione contemporanea: 25 + 25 + 15 corti aperti insieme = 65 $/punto, piu' della singola operazione piu' grande (50)
    assert axi.max_exposure(st) == 65
    s = axi.scorecard(trades, axi.max_exposure(st))
    assert s["operazioni"] == 4 and s["vinte"] == 1 and s["perse"] == 3 and s["vincita_media"] == 135.0
    assert abs(s["perdita_media"] + 870.33) < 0.01 and s["per_euro_perso"] == 0.05
    assert s["per_punto_massimo"] == 65 and s["per_punto_operazione"] == 50
    # salvare lo stesso estratto due volte non duplica nulla
    axi.save(st, axi.parse_statement(STATEMENT))
    assert len(axi.closed_trades(st)) == 4


def test_statement_day_without_header_and_forced():
    headless = "\n".join(STATEMENT.splitlines()[3:])      # incollato senza «Name: ... 2026.03.10 23:59»
    assert "Login ID" not in headless
    p = axi.parse_statement(headless)
    assert p["account"] is None and p["day"] == "2026-03-09"     # l'ultima data che compare nel testo
    assert axi.parse_statement(headless, "2026-03-10")["day"] == "2026-03-10"
    st = Store(":memory:")
    axi.run(st, headless, giorno="2026-03-10")
    assert axi.open_positions(st)[0] == "2026-03-10"


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
    def item(i, ts, title):
        return {"url": f"https://x/{i}", "ts": ts, "title": title, "source": "test", "language": "en", "country": "US",
                "query": "rss:test", "sentiment": None}
    st.upsert_news([item(1, "2026-03-09T12:00:00Z", "Stocks fall as Nvidia probe rattles Wall Street"),
                    item(2, "2026-03-09T12:30:00Z", "Local football derby ends in a draw"),
                    item(3, "2026-03-08T18:00:00Z", "Oil prices rise as Iran tensions mount"),
                    item(4, "2026-03-08T20:00:00Z", "Former president of Paraguay charged with corruption"),
                    item(5, "2026-03-09T09:00:00Z", "China exports slow in February")])
    after = axi.market_after(st, "US500", "2026-03-09")
    assert after["riferimento"] == "SPY" and after["dopo_1"] > 0 and "dopo_5" in after
    # pertinenza: il titolo sulle borse e Nvidia prima, poi gli altri temi di mercato; il derby e il Paraguay restano fuori
    news = axi.news_for(st, "2026-03-09", item="US500")
    assert news[0] == "2026-03-09: Stocks fall as Nvidia probe rattles Wall Street" and len(news) == 3
    assert not any("derby" in n or "Paraguay" in n for n in news)
    assert axi.news_for(st, "2026-03-09", limit=1, item="US500") == ["2026-03-09: Stocks fall as Nvidia probe rattles Wall Street"]
    assert len(axi.news_for(st, "2026-03-09")) == 3      # senza strumento: solo i temi di mercato, il derby resta fuori
    # niente sguardo al futuro: con l'ora di apertura dell'operazione restano solo i titoli usciti prima
    early = axi.news_for(st, "2026-03-09", item="US500", before="2026-03-09T11:00:00Z")
    assert early and not any("Nvidia" in n for n in early) and any("China exports" in n for n in early)
    # i comunicati di piccole quotate («(NASDAQ: XXXX)») non sono notizie di mercato
    st.upsert_news([item(6, "2026-03-09T10:00:00Z", "Acme Bancorp (NASDAQ: ACME) announces quarterly earnings"),
                    item(7, "2026-03-09T10:05:00Z", "Beta Corp ( NASDAQ : BETA ) Announces Quarterly Earnings Results")])   # GDELT spazia i segni
    assert not any("Acme" in n or "Beta" in n for n in axi.news_for(st, "2026-03-09", item="US500", limit=10))
    axi.note(st, 2007, "chiuso a mano dopo il rimbalzo del lunedi'")
    text = axi.diary_text(st)
    assert "Patrimonio 6,059.04 $" in text and "US500 corto 15 lotti a 5,418.83" in text and "-4,562 $" in text
    # le operazioni del 9/3 aprono alle 11:05-11:45 UTC: il titolo su Nvidia delle 12:00 e' DOPO e non compare; quello delle 9 si'
    assert "mercato dopo (SPY)" in text and "notizia: 2026-03-09: China exports" in text and "Nvidia" not in text
    assert "appunto: chiuso a mano" in text
    assert "4 operazioni: 1 vinte, 3 perse (25%)" in text and "euro guadagnati per euro perso 0.05" in text
    assert "esposizione massima 65 $/punto (posizioni aperte insieme; la singola piu' grande 50)" in text
    out = axi.run(st)
    assert out["pagella"]["operazioni"] == 4 and out["pagella"]["per_punto_massimo"] == 65 and out["testo"].startswith("# Diario conto Axi")
