"""Meta-modello: trasforma i segnali in una probabilita' calibrata che l'operazione vada bene.

Per ogni barra calcola alcune caratteristiche (rendimenti recenti, volatilita', distanza dalla
media, segnale della strategia, regime) e stima con una regressione logistica la probabilita'
che il rendimento nelle prossime `horizon` barre superi i costi. Si allena solo sul passato
(walk-forward) e si misura con il Brier score: un modello che non sa nulla vale 0,25.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


def features(close: pd.Series, signal: pd.Series | None = None, bars_per_day: int = 24) -> pd.DataFrame:
    r = np.log(close).diff()
    d = bars_per_day
    f = pd.DataFrame(index=close.index)
    f["ret_1"] = r
    f["ret_day"] = r.rolling(d).sum()
    f["ret_week"] = r.rolling(7 * d).sum()
    f["vol_day"] = r.rolling(d).std()
    f["vol_ratio"] = r.rolling(d).std() / r.rolling(20 * d).std()
    f["dist_ma"] = close / close.rolling(20 * d).mean() - 1
    f["regime_up"] = (close.rolling(20 * d).mean() > close.rolling(20 * d).mean().shift(d)).astype(float)
    if signal is not None:
        f["signal"] = signal.reindex(close.index).fillna(0.0)
    return f


def labels(close: pd.Series, horizon: int, cost: float) -> pd.Series:
    """1 se il rendimento delle prossime `horizon` barre supera il costo di andata e ritorno."""
    fwd = close.shift(-horizon) / close - 1
    y = (fwd > cost).astype(float)
    return y.where(fwd.notna())


@dataclass
class Logistic:
    """Regressione logistica con regolarizzazione L2, in numpy (nessuna dipendenza in piu')."""
    l2: float = 1.0
    iters: int = 300
    lr: float = 0.1
    mean_: np.ndarray | None = None
    std_: np.ndarray | None = None
    coef_: np.ndarray | None = None

    def fit(self, X: np.ndarray, y: np.ndarray) -> "Logistic":
        self.mean_, self.std_ = X.mean(0), X.std(0) + 1e-12
        Z = np.c_[np.ones(len(X)), (X - self.mean_) / self.std_]
        w = np.zeros(Z.shape[1])
        n = len(y)
        for _ in range(self.iters):
            p = _sigmoid(Z @ w)
            grad = Z.T @ (p - y) / n
            grad[1:] += self.l2 * w[1:] / n
            w -= self.lr * grad
        self.coef_ = w
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        Z = np.c_[np.ones(len(X)), (X - self.mean_) / self.std_]
        return _sigmoid(Z @ self.coef_)


def walk_forward_proba(f: pd.DataFrame, y: pd.Series, train: int, step: int, horizon: int) -> pd.Series:
    """Probabilita' fuori campione. Tra fine allenamento e previsione si lasciano `horizon`
    barre di distacco, perche' le ultime etichette guardano avanti di `horizon` barre."""
    data = f.join(y.rename("y")).replace([np.inf, -np.inf], np.nan)
    valid = data.drop(columns="y").notna().all(axis=1)
    out = pd.Series(np.nan, index=f.index)
    start = train + horizon
    while start < len(data):
        tr = data.iloc[: start - horizon]
        tr = tr[valid.iloc[: start - horizon] & tr["y"].notna()].tail(train)
        te = data.iloc[start:start + step]
        te = te[valid.iloc[start:start + step]]
        if len(tr) > 50 and tr["y"].nunique() == 2 and len(te):
            m = Logistic().fit(tr.drop(columns="y").to_numpy(), tr["y"].to_numpy())
            out.loc[te.index] = m.predict_proba(te.drop(columns="y").to_numpy())
        start += step
    return out


def brier(p: pd.Series, y: pd.Series) -> float:
    m = p.notna() & y.notna()
    return float(((p[m] - y[m]) ** 2).mean()) if m.any() else float("nan")


def latest_probability(close: pd.Series, signal: pd.Series | None, horizon: int, cost: float,
                       train: int, bars_per_day: int = 24) -> float | None:
    """Probabilita' per l'ultima barra, allenando sul passato disponibile (per il paper trading)."""
    f = features(close, signal, bars_per_day).replace([np.inf, -np.inf], np.nan)
    y = labels(close, horizon, cost)
    tr = f.join(y.rename("y")).iloc[:-horizon].dropna().tail(train)
    last = f.iloc[[-1]]
    if len(tr) < 200 or tr["y"].nunique() < 2 or last.isna().any(axis=1).iloc[0]:
        return None
    m = Logistic().fit(tr.drop(columns="y").to_numpy(), tr["y"].to_numpy())
    return float(m.predict_proba(last.to_numpy())[0])


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))
