import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture(autouse=True)
def _isolated_environment(tmp_path_factory, monkeypatch):
    """I test non leggono ~/RadixTrading/.env ne' le variabili RADIX_TRADING_* della macchina.

    Sul Mac di Francesco .env ha RADIX_TRADING_VOL_TARGET=0.75 e RADIX_TRADING_MAX_LOSS_EUR=60 (scelta del 1/11/2026):
    senza questo isolamento i test dello stop a 20 euro fallivano li' e passavano altrove."""
    home = tmp_path_factory.mktemp("home")
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))
    for name in list(os.environ):
        if name.startswith("RADIX_TRADING_") or name in ("FINECO_PAUSA", "FINECO_RULE", "FINECO_CAPITAL_EUR",
                                                          "KRAKEN_API_KEY", "KRAKEN_API_SECRET", "TELEGRAM_BOT_TOKEN",
                                                          "TELEGRAM_CHAT_ID", "TIINGO_API_KEY"):
            monkeypatch.delenv(name, raising=False)


@pytest.fixture
def random_walk():
    def make(n=2000, assets=2, drift=0.0, vol=0.01, freq="D", seed=0):
        rng = np.random.default_rng(seed)
        idx = pd.date_range("2018-01-01", periods=n, freq=freq, tz="UTC")
        rets = rng.normal(drift, vol, size=(n, assets))
        return pd.DataFrame(100 * np.exp(np.cumsum(rets, axis=0)), index=idx,
                            columns=[f"A{i}" for i in range(assets)])
    return make
