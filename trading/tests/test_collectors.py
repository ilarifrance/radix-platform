from radix_trading.collectors import fred, gdelt, kraken, stooq


def test_kraken_parse():
    payload = {"error": [], "result": {"XXBTZEUR": [
        [1730000000, "60000.0", "60500.0", "59900.0", "60400.0", "60200.0", "12.5", 300],
        [1730003600, "60400.0", "61000.0", "60300.0", "60900.0", "60700.0", "8.1", 210],
    ], "last": 1730003600}}
    df, last = kraken.parse_ohlc(payload)
    assert last == 1730003600
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert df["close"].iloc[-1] == 60900.0
    assert str(df.index.tz) == "UTC"


def test_kraken_error():
    import pytest
    with pytest.raises(RuntimeError):
        kraken.parse_ohlc({"error": ["EQuery:Unknown asset pair"], "result": {}})


def test_stooq_parse():
    text = "Date,Open,High,Low,Close,Volume\n2026-10-26,580,585,579,584,1000\n2026-10-27,584,590,583,589,1200\n"
    df = stooq.parse_daily_csv(text)
    assert len(df) == 2 and df["close"].iloc[0] == 584
    assert stooq.parse_daily_csv("No data").empty


def test_fred_parse_missing_values():
    text = "observation_date,DGS10\n2026-10-23,4.10\n2026-10-24,.\n2026-10-27,4.15\n"
    s = fred.parse_csv(text, "DGS10")
    assert list(s.values) == [4.10, 4.15]


def test_gdelt_parse():
    payload = {"articles": [{"url": "https://x.example/a", "title": "Rates on hold", "seendate": "20261028T120000Z",
                             "domain": "x.example", "language": "English", "sourcecountry": "United States"}]}
    items = gdelt.parse_artlist(payload, "rates")
    assert items[0]["ts"] == "2026-10-28T12:00:00Z"
    assert items[0]["sentiment"] is None
