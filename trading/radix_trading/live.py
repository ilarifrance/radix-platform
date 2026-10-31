"""Conto vero su Kraken, solo la corsia crypto_trend. Spento finche' Francesco non lo accende.

Si muove solo se:
- `RADIX_TRADING_MODE=live` e `RADIX_TRADING_LIVE_CONFIRMED=si-confermo-denaro-reale` (config.Settings);
- in ~/RadixTrading/.env ci sono KRAKEN_API_KEY e KRAKEN_API_SECRET, creati da Francesco con i soli
  permessi di consultare e fare ordini (prelievi disattivati);
- il file KILL_SWITCH non esiste.

`--prova` (dry run) usa le stesse chiavi ma chiede a Kraken solo di convalidare gli ordini
(`validate=true`): nessun ordine viene eseguito e non serve la modalita' live.

Il conto Kraken va usato solo per questo: il patrimonio del conto (euro + crypto) e' il patrimonio
del test. Si investe al massimo CAPITAL_EUR (l'eventuale eccedenza resta in euro); se il patrimonio scende sotto
quello del primo giro meno MAX_LOSS_EUR si vende tutto e il conto resta fermo finche' qualcuno non cancella la riga in live_halt.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import math
import time
import urllib.parse
from datetime import datetime, timezone

import requests

from . import alerts, portfolio, universe
from .config import Settings, env_value
from .store import Store

CAPITAL_EUR = 100.0
MAX_LOSS_EUR = 20.0
BAND = 0.03             # come il conto finto: non si ritocca sotto il 3% del capitale
MIN_ORDER_EUR = 1.0      # i minimi veri li decide Kraken (ordermin); con 100 euro le quote piccole sono ~3 euro
MAX_ORDERS_PER_RUN = 10
TAKER_FEE = 0.004        # commissione Kraken Pro sugli ordini a mercato con volumi piccoli (stima per gli avvisi)
STATUS_EVERY_HOURS = 3   # un riepilogo su Telegram ogni 3 ore (e al primo giro), oltre agli avvisi per ogni ordine
API = "https://api.kraken.com"

SCHEMA = """
CREATE TABLE IF NOT EXISTS live_account (id INTEGER PRIMARY KEY CHECK (id = 1), start REAL NOT NULL, ts TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS live_halt (id INTEGER PRIMARY KEY CHECK (id = 1), ts TEXT NOT NULL, equity REAL NOT NULL);
CREATE TABLE IF NOT EXISTS live_orders (ts TEXT NOT NULL, symbol TEXT NOT NULL, side TEXT NOT NULL, volume REAL,
    price REAL, txid TEXT, prova INTEGER NOT NULL, esito TEXT);
CREATE TABLE IF NOT EXISTS live_equity (ts TEXT PRIMARY KEY, equity REAL NOT NULL);
"""


class Kraken:
    def __init__(self, key: str, secret: str, http=requests):
        self.key, self.secret, self.http = key, secret, http

    def _sign(self, path: str, data: dict) -> str:
        post = urllib.parse.urlencode(data)
        digest = hashlib.sha256((str(data["nonce"]) + post).encode()).digest()
        mac = hmac.new(base64.b64decode(self.secret), path.encode() + digest, hashlib.sha512)
        return base64.b64encode(mac.digest()).decode()

    def private(self, method: str, data: dict | None = None) -> dict:
        path = f"/0/private/{method}"
        data = {"nonce": int(time.time() * 1000), **(data or {})}
        headers = {"API-Key": self.key, "API-Sign": self._sign(path, data)}
        r = self.http.post(API + path, data=data, headers=headers, timeout=30)
        body = r.json()
        if body.get("error"):
            raise RuntimeError(f"Kraken {method}: {body['error']}")
        return body["result"]

    def public(self, method: str, params: dict | None = None) -> dict:
        r = self.http.get(f"{API}/0/public/{method}", params=params, timeout=30)
        body = r.json()
        if body.get("error"):
            raise RuntimeError(f"Kraken {method}: {body['error']}")
        return body["result"]

    def pairs(self, symbols: list[str]) -> dict[str, dict]:
        """Per ogni simbolo (nome breve, es. XBTEUR): codice della moneta nel saldo, minimo e decimali."""
        res = self.public("AssetPairs", {"pair": ",".join(symbols)})
        out = {}
        for info in res.values():
            alt = info.get("altname")
            if alt in symbols:
                out[alt] = {"base": info["base"], "ordermin": float(info.get("ordermin") or 0),
                            "lot_decimals": int(info.get("lot_decimals", 8))}
        return out

    def balance(self) -> dict[str, float]:
        return {k: float(v) for k, v in self.private("Balance").items()}

    def market_order(self, symbol: str, side: str, volume: float, validate: bool) -> dict:
        data = {"ordertype": "market", "type": side, "pair": symbol, "volume": f"{volume:.8f}"}
        if validate:
            data["validate"] = "true"
        return self.private("AddOrder", data)


def client_from_env() -> Kraken:
    key, secret = env_value("KRAKEN_API_KEY"), env_value("KRAKEN_API_SECRET")
    if not (key and secret):
        raise PermissionError("Mancano KRAKEN_API_KEY e KRAKEN_API_SECRET in ~/RadixTrading/.env")
    return Kraken(key, secret)


def _floor(x: float, decimals: int) -> float:
    f = 10 ** decimals
    return math.floor(abs(x) * f) / f


def targets(store: Store) -> tuple[dict[str, float], dict[str, float]]:
    """Pesi di crypto_trend all'ultima ora e ultimi prezzi, dagli stessi dati del conto finto."""
    lane = next(l for l in portfolio.LANES if l.key == "crypto_trend")
    close, _, _ = portfolio._closes(store, "crypto")
    if close.empty or len(close) < 300:
        raise RuntimeError("Dati crypto insufficienti per decidere")
    w = portfolio.lane_weights(lane, close, None)
    prices = {s: float(close[s].dropna().iloc[-1]) for s in close.columns if close[s].notna().any()}
    return {s: float(x) for s, x in w.iloc[-1].items() if x == x}, prices


def status_text(tag: str, now: datetime, equity: float, start: float, eur: float,
                held: dict[str, float], prices: dict[str, float], halted: bool) -> str:
    pos = [f"{s.removesuffix('EUR').replace('XBT', 'BTC')} {u * prices[s]:.2f} €"
           for s, u in sorted(held.items()) if u * prices.get(s, 0) >= 0.5]
    stop = start - MAX_LOSS_EUR
    margin = equity - stop
    return (f"{tag} Riepilogo {now:%H:%M} UTC: patrimonio {equity:.2f} € ({equity / start - 1:+.1%} dall'inizio), "
            f"euro liberi {eur:.2f} €, posizioni: {', '.join(pos) or 'nessuna'}. "
            + ("Conto FERMO per lo stop." if halted else f"Stop a {stop:.2f} € (margine {margin:.2f} €)."))


def step(store: Store, settings: Settings, client: Kraken | None = None, prova: bool = False,
         now: datetime | None = None, send=alerts.send) -> dict:
    if not prova and settings.mode != "live":
        raise PermissionError("Conto vero spento: serve RADIX_TRADING_MODE=live con la conferma di Francesco")
    now = now or datetime.now(timezone.utc)
    ts = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    tag = "[PROVA]" if prova else "[REALE]"
    db = store.conn
    db.executescript(SCHEMA)
    if settings.kill_switch_file.exists():
        send(f"{tag} Kill switch presente: nessun ordine.")
        return {"fermo": "kill switch", "ordini": []}
    client = client or client_from_env()
    weights, prices = targets(store)
    symbols = [s for s in universe.FAST["symbols"] if s in prices]
    info = client.pairs(symbols)
    bal = client.balance()
    held = {s: bal.get(info[s]["base"], 0.0) for s in symbols if s in info}
    eur = bal.get("ZEUR", 0.0)
    equity = eur + sum(u * prices[s] for s, u in held.items())
    row = db.execute("SELECT start FROM live_account").fetchone()
    if row is None:
        start = equity  # lo stop guarda il patrimonio vero del conto (es. 110 euro con 10 di margine)
        if not prova:
            db.execute("INSERT INTO live_account VALUES (1, ?, ?)", (start, ts))
    else:
        start = row[0]
    halted = db.execute("SELECT ts FROM live_halt").fetchone() is not None
    if not halted and equity <= start - MAX_LOSS_EUR:
        halted = True
        if not prova:
            db.execute("INSERT INTO live_halt VALUES (1, ?, ?)", (ts, equity))
        send(f"{tag} Stop: patrimonio {equity:.2f} € sotto {start - MAX_LOSS_EUR:.2f} €. Vendo tutto e mi fermo.")
    base = min(equity, CAPITAL_EUR)
    plan = []
    for s in symbols:
        if s not in info:
            continue
        want = 0.0 if halted else weights.get(s, 0.0) * base / prices[s]
        delta = want - held[s]
        vol = _floor(delta, info[s]["lot_decimals"])
        exit_all = want == 0 and held[s] > 0
        if exit_all:
            vol = _floor(held[s], info[s]["lot_decimals"])
        if vol < info[s]["ordermin"] or vol * prices[s] < MIN_ORDER_EUR:
            continue
        if not exit_all and vol * prices[s] < BAND * base:
            continue
        plan.append((s, "buy" if delta > 0 else "sell", vol))
    plan.sort(key=lambda o: o[1] != "sell")   # prima le vendite: liberano euro e riducono il rischio
    orders, cash = [], eur
    for s, side, vol in plan[:MAX_ORDERS_PER_RUN]:
        if side == "buy":
            vol = min(vol, _floor(cash * 0.99 / prices[s], info[s]["lot_decimals"]))
            if vol < info[s]["ordermin"] or vol * prices[s] < MIN_ORDER_EUR:
                continue
        try:
            res = client.market_order(s, side, vol, validate=prova)
            txid, esito = ",".join(res.get("txid", []) or []), (res.get("descr") or {}).get("order", "ok")
        except Exception as e:  # un ordine rifiutato non ferma gli altri
            txid, esito = "", f"errore: {e}"
        cash += (-1 if side == "buy" else 1) * vol * prices[s]
        db.execute("INSERT INTO live_orders VALUES (?,?,?,?,?,?,?,?)", (ts, s, side, vol, prices[s], txid, int(prova), esito))
        units = vol if side == "buy" else -vol
        send(alerts.order_text(tag, s, units, prices[s], TAKER_FEE * vol * prices[s]) + ("" if not esito.startswith("errore") else f" — {esito}"))
        orders.append({"simbolo": s, "lato": side, "quantita": vol, "prezzo": prices[s], "esito": esito})
    first = db.execute("SELECT COUNT(*) FROM live_equity").fetchone()[0] == 0
    if not prova:
        db.execute("INSERT OR REPLACE INTO live_equity VALUES (?, ?)", (ts, equity))
    db.commit()
    if prova or first or now.hour % STATUS_EVERY_HOURS == 0:
        send(status_text(tag, now, equity, start, eur, held, prices, halted))
    return {"prova": prova, "patrimonio": round(equity, 2), "inizio": round(start, 2), "euro": round(eur, 2),
            "fermo": halted, "pesi": {s: round(w, 4) for s, w in weights.items() if w}, "ordini": orders}
