import pandas as pd

from radix_trading.store import Store


def test_bars_roundtrip_and_upsert(random_walk):
    prices = random_walk(n=5, assets=1)
    bars = pd.DataFrame({"open": prices["A0"], "high": prices["A0"], "low": prices["A0"],
                         "close": prices["A0"], "volume": 1.0})
    st = Store(":memory:")
    assert st.upsert_bars("kraken", "XBTEUR", "1h", bars) == 5
    st.upsert_bars("kraken", "XBTEUR", "1h", bars.iloc[-1:].assign(close=1.0))
    out = st.load_bars("kraken", "XBTEUR", "1h")
    assert len(out) == 5 and out["close"].iloc[-1] == 1.0


def test_news_and_macro():
    st = Store(":memory:")
    st.upsert_news([{"url": "u1", "ts": "2026-10-28T12:00:00Z", "title": "t"}])
    st.upsert_macro("DGS10", pd.Series([4.1, 4.2], index=pd.to_datetime(["2026-10-27", "2026-10-28"])))
    assert len(st.load_news("2026-10-01")) == 1
    assert st.load_macro("DGS10").iloc[-1] == 4.2
