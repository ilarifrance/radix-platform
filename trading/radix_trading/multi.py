"""Piu' strade insieme: scoperto solo quando il calo e' probabile, segnali macro, un direttore.

- `trend_brake` (crypto): il trend di sempre in acquisto; va allo scoperto, con una parte piccola del
  capitale, solo quando piu' segnali insieme indicano un calo forte (trend giu', rottura dei minimi
  di 20 giorni, volatilita' in aumento). Esce dallo scoperto al primo rimbalzo (massimo di 10 giorni).
- `gold_macro` (materie prime): oro solo quando il prezzo e' in trend e i tassi reali o il dollaro
  scendono (i due motori classici dell'oro).
- `risk_switch` (ETF): azioni USA quando la paura (VIX) e' bassa e il credito non si allarga,
  altrimenti obbligazioni a medio termine. Una sola posizione alla volta: poche commissioni minime.
- `ibs_reversion` (azioni): compra un indice che ha chiuso nel 10% piu' basso dell'escursione del
  giorno e lo tiene qualche giorno ("internal bar strength", ritrovato dallo studio sulle candele).
- `turn_of_month` (azioni): investiti dagli ultimi giorni del mese ai primi del mese dopo.
- `allocate`: il "direttore" divide il capitale tra le strategie in proporzione inversa al loro
  rischio dell'ultimo anno (solo dati passati, con un minimo e un tetto del 50% per strategia),
  ribilanciando ogni mese.

I dati macro FRED escono il giorno dopo: si usano sempre con un giorno di ritardo.
"""

from __future__ import annotations

from functools import partial

import numpy as np
import pandas as pd

from . import strategies

HOUR = 24


def _daily_at(w: pd.DataFrame, hour: int = 0) -> pd.DataFrame:
    at = pd.Series(w.index.hour == hour, index=w.index)
    return w.where(at, axis=0).ffill().fillna(0.0)


def trend_brake(close: pd.DataFrame, fast: int = HOUR * 10, slow: int = HOUR * 100, vol_target: float = 0.25,
                short_size: float = 0.25, exit_on: str = "rebound", hour: int = 0) -> pd.DataFrame:
    """`exit_on`: "rebound" esce dallo scoperto al primo massimo di 10 giorni (prudente, ma nei
    mercati che scendono a strappi si fa fermare spesso); "trend" esce solo quando le medie
    tornano al rialzo."""
    n = close.shape[1]
    long_w = strategies.crypto_trend_daily(close, fast, slow, vol_target, hour)
    down = close.rolling(fast).mean() < close.rolling(slow).mean()
    breakdown = close < close.rolling(HOUR * 20).min().shift(1)
    vol = np.log(close).diff().rolling(HOUR * 30).std()
    rising_risk = vol > vol.rolling(HOUR * 365, min_periods=HOUR * 90).median()
    rebound = close > close.rolling(HOUR * 10).max().shift(1)
    state = pd.DataFrame(np.nan, index=close.index, columns=close.columns)
    state[down & breakdown & rising_risk] = 1.0
    state[(rebound | ~down) if exit_on == "rebound" else ~down] = 0.0
    short_w = -state.ffill().fillna(0.0) * short_size / n
    return _daily_at(long_w.where(long_w > 0, short_w), hour)


def _macro_frame(macro: pd.DataFrame, index: pd.DatetimeIndex) -> pd.DataFrame:
    """Serie macro allineate ai giorni di mercato, con un giorno di ritardo (pubblicazione FRED)."""
    if macro is None or macro.empty:
        return pd.DataFrame(index=index)
    m = macro.copy()
    m.index = pd.to_datetime(m.index, utc=True).normalize()
    full = m.reindex(m.index.union(index.normalize())).ffill()
    return full.shift(1).reindex(index.normalize()).set_axis(index)


def gold_macro(close: pd.DataFrame, macro: pd.DataFrame | None = None, trend: int = 100, lookback: int = 60,
               vol_target: float = 0.0, symbol: str = "GLD") -> pd.DataFrame:
    """`vol_target` > 0: peso ridotto quando l'oro oscilla piu' del valore annuo indicato."""
    w = pd.DataFrame(0.0, index=close.index, columns=close.columns)
    if symbol not in close:
        return w
    px = close[symbol]
    m = _macro_frame(macro, close.index)
    rate = m["DFII10"] if "DFII10" in m and m["DFII10"].notna().any() else m.get("DGS10")
    dollar = m.get("DTWEXBGS")
    tailwind = pd.Series(False, index=close.index)
    if rate is not None:
        tailwind |= rate < rate.shift(lookback)
    if dollar is not None:
        tailwind |= dollar < dollar.shift(lookback)
    on = ((px > px.rolling(trend).mean()) & tailwind).astype(float)
    if vol_target > 0:
        vol = px.pct_change().rolling(60).std() * np.sqrt(252)
        on = on * (vol_target / vol).clip(upper=1.0).fillna(0.0)
    w[symbol] = (on * 4).round() / 4  # pesi al 25%: meno ordini piccoli
    keep = pd.Series(np.arange(len(w)) % 5 == 0, index=w.index)  # al massimo una decisione a settimana
    return w.where(keep, axis=0).ffill().fillna(0.0)


def risk_switch(close: pd.DataFrame, macro: pd.DataFrame | None = None, vix_window: int = 252,
                trend: int = 200, risk_on: str = "SPY", risk_off: str = "IEF") -> pd.DataFrame:
    w = pd.DataFrame(0.0, index=close.index, columns=close.columns)
    if risk_on not in close or risk_off not in close:
        return w
    m = _macro_frame(macro, close.index)
    calm = pd.Series(True, index=close.index)
    if "VIXCLS" in m:
        vix = m["VIXCLS"]
        calm &= (vix < vix.rolling(vix_window, min_periods=60).median()).fillna(True)
    if "BAMLH0A0HYM2" in m:
        hy = m["BAMLH0A0HYM2"]
        calm &= ~(hy > hy.shift(20)).fillna(False)
    px = close[risk_on]
    on = calm & (px > px.rolling(trend).mean())
    w[risk_on] = on.astype(float)
    w[risk_off] = (~on).astype(float)
    keep = pd.Series(np.arange(len(w)) % 5 == 0, index=w.index)
    return w.where(keep, axis=0).ffill().fillna(0.0)


BONDS = {"TLT", "IEF", "LQD", "HYG"}


def ibs(bars: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Posizione della chiusura nell'escursione del giorno: 0 = sul minimo, 1 = sul massimo."""
    out = {}
    for s, b in bars.items():
        rng = (b["high"] - b["low"]).replace(0, np.nan)
        out[s] = (b["close"] - b["low"]) / rng
    return pd.DataFrame(out)


IBS_UNIVERSE = ("SPY", "QQQ", "IWM", "EFA", "EEM", "EWJ", "VGK", "XLK", "XLE", "EWI")


def ibs_reversion(close: pd.DataFrame, ibs: pd.DataFrame | None = None, entry: float = 0.1, hold: int = 5,
                  exit_ibs: float = 0.8, trend: int = 0, max_names: int = 5) -> pd.DataFrame:
    """Entrata alla chiusura del giorno "brutto", uscita dopo `hold` giorni o alla prima chiusura forte.
    `max_names` posti fissi da 1/`max_names` del capitale: una posizione aperta non viene mai
    ridimensionata (ogni ritocco paga la commissione minima); a posti pieni i nuovi segnali si saltano.
    Solo indici azionari principali."""
    w = pd.DataFrame(0.0, index=close.index, columns=close.columns)
    if ibs is None:
        return w
    names = [s for s in close.columns if s in ibs.columns and (s in IBS_UNIVERSE or s.endswith(".MI"))]
    if not names:
        return w
    x = ibs[names].reindex(close.index).to_numpy()
    sig = x < entry
    if trend:
        sig &= (close[names] > close[names].rolling(trend).mean()).to_numpy()
    left = {}                         # simbolo -> giorni rimasti
    out = np.zeros((len(close), len(names)))
    for i in range(len(close)):
        for j in list(left):
            if x[i, j] > exit_ibs:
                del left[j]
        for j in np.flatnonzero(sig[i]):
            if j in left:
                left[j] = hold        # nuovo segnale sullo stesso titolo: si prolunga
            elif len(left) < max_names:
                left[j] = hold
        for j in list(left):
            out[i, j] = 1.0 / max_names
            left[j] -= 1
            if left[j] <= 0:
                del left[j]
    w[names] = out
    return w


def turn_of_month(close: pd.DataFrame, before: int = 4, after: int = 3, trend: int = 0,
                  symbols: tuple = ("SPY",)) -> pd.DataFrame:
    """Investiti dagli ultimi `before` giorni di borsa del mese ai primi `after` del mese dopo."""
    w = pd.DataFrame(0.0, index=close.index, columns=close.columns)
    names = [s for s in symbols if s in close.columns] or [c for c in close.columns if c not in BONDS][:1]
    # giorni lavorativi dal calendario (non dai dati): l'ultimo mese, ancora a meta', non sembra finito
    day = close.index.tz_localize(None).normalize().values.astype("datetime64[D]")
    first = close.index.tz_localize(None).to_period("M").start_time.values.astype("datetime64[D]")
    end = (close.index.tz_localize(None).to_period("M").end_time.normalize().values.astype("datetime64[D]")
           + np.timedelta64(1, "D"))
    pos = pd.Series(np.busday_count(first, day), index=close.index)
    left = pd.Series(np.busday_count(day, end), index=close.index)  # 1 = ultimo giorno lavorativo del mese
    # decisione a t, posizione da t+1: si entra la sera del giorno before+1 dalla fine
    on = ((left >= 2) & (left <= before + 1)) | (left == 1) | (pos < after - 1)
    for s in names:
        ok = on
        if trend:
            ok = on & (close[s] > close[s].rolling(trend).mean())
        w[s] = ok.astype(float) / len(names)
    return w


def tsmom(close: pd.DataFrame, lookback: int = 252, vol_target: float = 0.10, rebalance: int = 21) -> pd.DataFrame:
    """Trend su piu' mercati insieme (Moskowitz-Ooi-Pedersen): investiti in cio' che e' salito
    nell'ultimo periodo, con peso tale che ogni mercato pesi lo stesso rischio. Solo acquisti."""
    ret = close.pct_change()
    vol = ret.rolling(60).std() * np.sqrt(252)
    on = (close / close.shift(lookback) - 1) > 0
    n = close.notna().sum(axis=1).clip(lower=1)
    w = (on * (vol_target / vol.clip(lower=0.02))).div(n, axis=0)
    gross = w.sum(axis=1)
    w = w.div(gross.where(gross > 1, 1.0), axis=0)
    keep = pd.Series(np.arange(len(w)) % rebalance == 0, index=w.index)
    return w.where(keep, axis=0).ffill().fillna(0.0)


def pre_fomc(close: pd.DataFrame, dates: pd.DatetimeIndex | None = None, days_before: int = 1,
             symbols: tuple = ("SPY", "QQQ")) -> pd.DataFrame:
    """Rialzo prima della Fed (Lucca-Moench 2015): investiti dalla chiusura di `days_before` giorni
    prima della decisione fino alla chiusura del giorno della decisione."""
    w = pd.DataFrame(0.0, index=close.index, columns=close.columns)
    names = [s for s in symbols if s in close.columns]
    if dates is None or not len(dates) or not names:
        return w
    day = close.index.tz_localize(None).normalize() if close.index.tz is not None else close.index.normalize()
    pos = pd.Series(np.arange(len(close)), index=day)
    on = np.zeros(len(close))
    for d in pd.DatetimeIndex(dates).tz_localize(None).normalize() if pd.DatetimeIndex(dates).tz is not None \
            else pd.DatetimeIndex(dates).normalize():
        i = pos.index.searchsorted(d)
        if i < len(pos) and pos.index[i] == d:
            # decisione a t, posizione da t+1: per stare investiti nel giorno i si decide in i-1
            on[max(0, i - days_before):i] = 1.0
    for s in names:
        w[s] = on / len(names)
    return w


def crypto_trend_trailing(close: pd.DataFrame, fast: int = HOUR * 10, slow: int = HOUR * 100,
                          vol_target: float = 0.25, trail: float = 0.15, take: float = 0.0,
                          hour: int = 0) -> pd.DataFrame:
    """Trend crypto con uscita all'inversione e stop che segue il prezzo (idea di Francesco, 30/10).

    Entrata quando la media veloce supera la lenta; uscita quando il trend si gira oppure quando il
    prezzo scende di `trail` sotto il massimo dall'entrata. Con `take` > 0 si incassa meta' della
    posizione al primo +`take` dall'entrata e il resto corre. Dopo uno stop si rientra solo con un
    nuovo incrocio al rialzo. Decisioni una volta al giorno all'ora `hour` UTC."""
    on = (close.rolling(fast).mean() > close.rolling(slow).mean()).to_numpy()
    vol = np.log(close).diff().rolling(HOUR * 30).std() * np.sqrt(HOUR * 365)
    scale = (vol_target / vol).clip(upper=1.0).fillna(0.0).to_numpy()
    px = close.to_numpy()
    rows = np.flatnonzero(close.index.hour == hour)
    n = close.shape[1]
    w = np.full(close.shape, np.nan)
    for j in range(n):
        held, entry, peak, part, prev_on = False, 0.0, 0.0, 1.0, False
        for i in rows:
            p, sig = px[i, j], bool(on[i, j])
            if not np.isfinite(p):
                continue
            if held:
                peak = max(peak, p)
                if not sig or p < peak * (1 - trail):
                    held = False
                elif take and part == 1.0 and p >= entry * (1 + take):
                    part = 0.5
            elif sig and not prev_on:
                held, entry, peak, part = True, p, p, 1.0
            prev_on = sig
            x = part * scale[i, j] / n if held else 0.0
            w[i, j] = round(x * 4 * n) / (4 * n)
    return pd.DataFrame(w, index=close.index, columns=close.columns).ffill().fillna(0.0)


def cot_long(close: pd.DataFrame, cot: pd.DataFrame | None = None, symbol: str = "QQQ", edge: float = 1.5,
             hold: int = 10) -> pd.DataFrame:
    """Grandi operatori (studio CFTC del 30/10): compra `symbol` per `hold` giorni quando i fondi sono
    molto corti o i commerciali molto lunghi rispetto ai 3 anni prima. Si decide alla chiusura del
    lunedi' dopo il rapporto (`cot` e' gia' indicizzato da quel lunedi')."""
    w = pd.DataFrame(0.0, index=close.index, columns=close.columns)
    if cot is None or cot.empty or symbol not in close.columns:
        return w
    fire = cot.index[((cot["spec_z"] < -edge) | (cot["comm_z"] > edge)).to_numpy()]
    day = close.index.normalize()
    on = np.zeros(len(close))
    for t in fire:
        i = day.searchsorted(t)
        if i < len(day) and (day[i] - t).days <= 3:
            on[i:i + hold] = 1.0
    w[symbol] = on
    return w


def with_bars(fn, frame: pd.DataFrame, name: str = "ibs"):
    f = partial(fn, **{name: frame})
    f.__name__ = fn.__name__
    return f


def with_macro(fn, macro: pd.DataFrame):
    """La ricerca chiama `fn(close, **params)`: qui si lega il quadro macro una volta sola."""
    f = partial(fn, macro=macro)
    f.__name__ = fn.__name__
    return f


def load_macro(store, series=("DFII10", "DGS10", "DTWEXBGS", "VIXCLS", "BAMLH0A0HYM2")) -> pd.DataFrame:
    cols = {s: store.load_macro(s) for s in series}
    return pd.DataFrame({k: v for k, v in cols.items() if len(v)})


def to_daily(r: pd.Series) -> pd.Series:
    """Rendimenti orari -> giornalieri (composti), per mettere insieme strategie diverse."""
    if len(r) < 2:
        return r
    step = r.index.to_series().diff().median()
    if step >= pd.Timedelta(hours=20):
        return r.set_axis(r.index.normalize())
    return (1 + r).groupby(r.index.normalize()).prod() - 1


MIN_DAILY_VOL = 0.005   # circa 8% l'anno: una strategia ferma in liquidita' non sembra "senza rischio"
MAX_WEIGHT = 0.5


def allocate(returns: dict[str, pd.Series], window: int = 365, rebalance: int = 21) -> tuple[pd.Series, pd.DataFrame]:
    """Il direttore: pesi inversi alla volatilita' dell'ultimo anno (solo passato), rivisti ogni mese.
    La volatilita' ha un minimo e nessuna strategia supera meta' del capitale: altrimenti una corsia
    rimasta a lungo in liquidita' (volatilita' quasi zero) prenderebbe quasi tutto il capitale proprio
    quando rientra. Nei giorni in cui un mercato e' chiuso la sua strategia rende 0 (soldi fermi)."""
    df = pd.DataFrame({k: to_daily(v) for k, v in returns.items()}).sort_index()
    live = df.notna().cummax()  # una corsia conta da quando ha i primi risultati (anche nei weekend)
    df = df.dropna(how="all").fillna(0.0)
    live = live.reindex(df.index).fillna(False)
    vol = df.rolling(window, min_periods=60).std().shift(1).clip(lower=MIN_DAILY_VOL)
    inv = (1 / vol).where(live.shift(1, fill_value=False))
    w = inv.div(inv.sum(axis=1), axis=0)
    for _ in range(len(df.columns)):  # tetto per corsia: l'eccesso va alle altre, in proporzione
        capped = w >= MAX_WEIGHT - 1e-12
        w = w.clip(upper=MAX_WEIGHT)
        free = w.where(~capped)
        spare = (1 - w.sum(axis=1)).clip(lower=0)
        w = w + free.div(free.sum(axis=1), axis=0).mul(spare, axis=0).fillna(0.0).where(~capped, 0.0)
    keep = pd.Series(np.arange(len(w)) % rebalance == 0, index=w.index)
    w = w.where(keep, axis=0).ffill().fillna(0.0)
    return (w * df).sum(axis=1), w
