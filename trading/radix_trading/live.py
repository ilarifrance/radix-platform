"""Conto vero su Kraken, solo la corsia crypto_trend. Spento finche' Francesco non lo accende.

Si muove solo se:
- `RADIX_TRADING_MODE=live` e `RADIX_TRADING_LIVE_CONFIRMED=si-confermo-denaro-reale` (config.Settings);
- in ~/RadixTrading/.env ci sono KRAKEN_API_KEY e KRAKEN_API_SECRET, creati da Francesco con i soli
  permessi di consultare e fare ordini (prelievi disattivati);
- il file KILL_SWITCH non esiste.

`--prova` (dry run) usa le stesse chiavi ma chiede a Kraken solo di convalidare gli ordini
(`validate=true`): nessun ordine viene eseguito e non serve la modalita' live.

Staking (decisione di Francesco del 31/10/2026): le monete in portafoglio vanno nelle strategie Earn «instant»
di Kraken (sblocco immediato, vedi earn.py); prima di una vendita si sbloccano. Serve il permesso «Earn Funds»
sulla chiave; senza, il conto avvisa e va avanti senza staking. `RADIX_TRADING_EARN=no` lo spegne.

Ordini (decisione di Francesco del 31/10/2026): gli acquisti e le vendite della regola partono come ordini
limite «post only» al miglior prezzo del momento (compro al bid, vendo all'ask), cosi' si paga la commissione
da maker invece di quella da taker piu' lo spread. Un ordine resta in coda al massimo LIMIT_HOURS ore: se non si
e' eseguito viene annullato e la parte mancante si compra o vende a mercato. Le vendite dello stop sono sempre
a mercato. `RADIX_TRADING_ORDERS=market` torna agli ordini a mercato per tutto.

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

from . import alerts, earn, portfolio, universe
from .config import Settings, env_value
from .store import Store

CAPITAL_EUR = 100.0
MAX_LOSS_EUR = 20.0
BAND = 0.03             # come il conto finto: non si ritocca sotto il 3% del capitale
MIN_ORDER_EUR = 1.0      # i minimi veri li decide Kraken (ordermin); con 100 euro le quote piccole sono ~3 euro
MAX_ORDERS_PER_RUN = 10
TAKER_FEE = 0.008        # commissione Kraken Pro da taker al livello base: lo 0,80% pagato davvero il 30/10/2026
STATUS_EVERY_HOURS = 3   # un riepilogo su Telegram ogni 3 ore (e al primo giro), oltre agli avvisi per ogni ordine
LIMIT_HOURS = 6          # un ordine limite resta in coda al massimo 6 ore, poi la parte mancante va a mercato
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
        for name, info in res.items():
            alt = info.get("altname")
            if alt in symbols:
                out[alt] = {"name": name, "base": info["base"], "ordermin": float(info.get("ordermin") or 0),
                            "lot_decimals": int(info.get("lot_decimals", 8)),
                            "pair_decimals": int(info.get("pair_decimals", 2))}
        return out

    def ticker(self, info: dict[str, dict]) -> dict[str, tuple[float, float]]:
        """Miglior prezzo di acquisto (bid) e di vendita (ask) per ogni simbolo di `pairs()`."""
        res = self.public("Ticker", {"pair": ",".join(info)})
        out = {}
        for alt, i in info.items():
            t = res.get(i.get("name") or alt) or res.get(alt)
            if t:
                out[alt] = (float(t["b"][0]), float(t["a"][0]))
        return out

    def balance(self) -> dict[str, float]:
        return {k: float(v) for k, v in self.private("Balance").items()}

    def market_order(self, symbol: str, side: str, volume: float, validate: bool) -> dict:
        data = {"ordertype": "market", "type": side, "pair": symbol, "volume": f"{volume:.8f}"}
        if validate:
            data["validate"] = "true"
        return self.private("AddOrder", data)

    def limit_order(self, symbol: str, side: str, volume: float, price: float, decimals: int, validate: bool) -> dict:
        """Ordine limite «post only»: o resta in coda da maker o Kraken lo rifiuta, mai eseguito da taker.
        Scade da solo poco dopo LIMIT_HOURS, cosi' non resta appeso se il giro orario non parte."""
        data = {"ordertype": "limit", "type": side, "pair": symbol, "volume": f"{volume:.8f}",
                "price": f"{price:.{decimals}f}", "oflags": "post", "expiretm": f"+{LIMIT_HOURS * 3600 + 300}"}
        if validate:
            data["validate"] = "true"
        return self.private("AddOrder", data)

    def query_orders(self, txids: list[str]) -> dict[str, dict]:
        out: dict[str, dict] = {}
        for i in range(0, len(txids), 50):
            out.update(self.private("QueryOrders", {"txid": ",".join(txids[i:i + 50])}))
        return out

    def cancel_order(self, txid: str) -> dict:
        return self.private("CancelOrder", {"txid": txid})


def client_from_env() -> Kraken:
    key, secret = env_value("KRAKEN_API_KEY"), env_value("KRAKEN_API_SECRET")
    if not (key and secret):
        raise PermissionError("Mancano KRAKEN_API_KEY e KRAKEN_API_SECRET in ~/RadixTrading/.env")
    return Kraken(key, secret)


def _total(bal: dict[str, float], base: str) -> float:
    """Saldo di una moneta: libero piu' le quote in staking (Kraken le mostra come SOL.F, SOL.B, SOL.M...)."""
    return sum(v for k, v in bal.items() if k == base or k.startswith(base + "."))


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


def _coin(symbol: str) -> str:
    return symbol.removesuffix("EUR").replace("XBT", "BTC")


def status_text(tag: str, now: datetime, equity: float, start: float, eur: float,
                held: dict[str, float], prices: dict[str, float], halted: bool,
                pending: dict[str, dict] | None = None, staked_eur: float = 0.0) -> str:
    pos = [f"{_coin(s)} {u * prices[s]:.2f} €" for s, u in sorted(held.items()) if u * prices.get(s, 0) >= 0.5]
    queue = [f"{'compro' if o['side'] == 'buy' else 'vendo'} {_coin(s)} {o['rest'] * o['price']:.2f} €"
             for s, o in sorted((pending or {}).items())]
    stop = start - MAX_LOSS_EUR
    margin = equity - stop
    return (f"{tag} Riepilogo {now:%H:%M} UTC: patrimonio {equity:.2f} €, guadagno/perdita {equity - start:+.2f} € "
            f"({equity / start - 1:+.1%}) dall'inizio, commissioni comprese. Euro liberi {eur:.2f} €, "
            f"posizioni: {', '.join(pos) or 'nessuna'}. "
            + (f"In coda: {', '.join(queue)}. " if queue else "")
            + (f"In staking: {staked_eur:.2f} €. " if staked_eur >= 0.5 else "")
            + ("Conto FERMO per lo stop." if halted else f"Stop a {stop:.2f} € (distanza dallo stop {margin:.2f} €)."))


def _open_orders(db, client: Kraken, now: datetime, tag: str, send) -> tuple[dict[str, dict], set[str], float]:
    """Controlla gli ordini limite rimasti in coda dai giri precedenti.

    Ritorna: ancora in coda {simbolo: {side, rest, price, txid}}, simboli da eseguire a mercato in questo giro
    (ordine scaduto o annullato dopo LIMIT_HOURS) e gli euro impegnati negli acquisti in coda."""
    pending: dict[str, dict] = {}
    fallback: set[str] = set()
    reserved = 0.0
    rows = db.execute("SELECT txid, symbol, side, volume, price FROM live_orders "
                      "WHERE esito = 'in coda' AND prova = 0 AND txid <> ''").fetchall()
    if not rows:
        return pending, fallback, reserved
    try:
        status = client.query_orders([r[0] for r in rows])
    except Exception as e:  # senza il permesso di leggere gli ordini si va avanti come se fossero tutti in coda
        send(f"{tag} Non riesco a leggere gli ordini in coda ({e}): nessun nuovo ordine sulle stesse monete.")
        for txid, s, side, vol, price in rows:
            pending[s] = {"side": side, "rest": vol, "price": price, "txid": txid}
            reserved += vol * price if side == "buy" else 0.0
        return pending, fallback, reserved
    for txid, s, side, vol, price in rows:
        o = status.get(txid)
        if not o:
            db.execute("UPDATE live_orders SET esito = 'sconosciuto a Kraken' WHERE txid = ?", (txid,))
            continue
        state, done = o.get("status"), float(o.get("vol_exec") or 0)
        rest = max(vol - done, 0.0)
        verb = "comprati" if side == "buy" else "venduti"
        if state == "closed":
            avg, fee = float(o.get("price") or price), float(o.get("fee") or 0)
            db.execute("UPDATE live_orders SET esito = 'eseguito', price = ? WHERE txid = ?", (avg, txid))
            send(f"{tag} Eseguito l'ordine limite: {verb} {vol:.6g} {s} a {avg:,.2f} € "
                 f"(circa {vol * avg:,.2f} €, commissione {fee:.2f} €).")
        elif state in ("canceled", "expired"):
            db.execute("UPDATE live_orders SET esito = ? WHERE txid = ?", (f"{state}, {verb} {done:.6g} di {vol:.6g}", txid))
            if state == "expired" and rest * price >= MIN_ORDER_EUR:
                fallback.add(s)
        else:
            age_h = (now.timestamp() - float(o.get("opentm") or now.timestamp())) / 3600
            if age_h >= LIMIT_HOURS:
                try:
                    client.cancel_order(txid)
                    db.execute("UPDATE live_orders SET esito = ? WHERE txid = ?",
                               (f"annullato dopo {LIMIT_HOURS} ore, {verb} {done:.6g} di {vol:.6g}", txid))
                    if rest * price >= MIN_ORDER_EUR:
                        fallback.add(s)
                    continue
                except Exception as e:
                    send(f"{tag} Non riesco ad annullare l'ordine limite {s} ({e}): scade da solo a breve.")
            pending[s] = {"side": side, "rest": rest, "price": price, "txid": txid}
            if side == "buy":
                reserved += rest * price
    return pending, fallback, reserved


def _cancel_pending(db, client: Kraken, pending: dict[str, dict], reason: str) -> None:
    for s, o in list(pending.items()):
        try:
            client.cancel_order(o["txid"])
            db.execute("UPDATE live_orders SET esito = ? WHERE txid = ?", (f"annullato {reason}", o["txid"]))
            del pending[s]
        except Exception:
            pass  # resta in coda: non si tocca la moneta finche' l'ordine non scade


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
    limit_mode = (env_value("RADIX_TRADING_ORDERS") or "limit") != "market"
    weights, prices = targets(store)
    symbols = [s for s in universe.FAST["symbols"] if s in prices]
    info = client.pairs(symbols)
    bal = client.balance()
    held = {s: _total(bal, info[s]["base"]) for s in symbols if s in info}   # libere + in staking
    free = {s: bal.get(info[s]["base"], 0.0) for s in symbols if s in info}
    eur = bal.get("ZEUR", 0.0)
    earn_on = not prova and (env_value("RADIX_TRADING_EARN") or "si") != "no"
    strats, staked = {}, {}
    if earn_on:
        try:
            strats = earn.strategies(client)
            staked = earn.allocations(client)
        except Exception as e:  # senza permessi o con Earn giu' si va avanti senza staking
            earn_on = False
            if now.hour % STATUS_EVERY_HOURS == 0:
                send(f"{tag} Staking non disponibile ({e}): compro e vendo come sempre, senza staking.")
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
    pending, fallback, reserved = ({}, set(), 0.0) if prova else _open_orders(db, client, now, tag, send)
    if halted and pending and not prova:
        _cancel_pending(db, client, pending, "per lo stop")   # gli acquisti in coda non servono piu'
    quotes = client.ticker(info) if limit_mode and not halted else {}
    base = min(equity, CAPITAL_EUR)
    plan = []
    for s in symbols:
        if s not in info or s in pending:
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
    orders, cash = [], eur - reserved          # gli euro degli acquisti in coda sono gia' impegnati
    for s, side, vol in plan[:MAX_ORDERS_PER_RUN]:
        if side == "buy":
            vol = min(vol, _floor(cash * 0.99 / prices[s], info[s]["lot_decimals"]))
            if vol < info[s]["ordermin"] or vol * prices[s] < MIN_ORDER_EUR:
                continue
        if side == "sell" and vol > free[s] + 1e-12:
            strat = strats.get(earn.asset_of(info[s]["base"]))
            locked = staked.get(strat["id"], 0.0) if strat else 0.0
            need = min(vol - free[s], locked)
            if earn_on and strat and need > 0:
                try:
                    if earn.deallocate(client, strat["id"], need):
                        free[s] += need
                        staked[strat["id"]] = locked - need
                except Exception as e:
                    send(f"{tag} Non riesco a sbloccare {need:.6g} {s} dallo staking ({e}).")
            if vol > free[s] + 1e-12:   # vendo intanto quel che e' libero; il resto al prossimo giro
                vol = _floor(free[s], info[s]["lot_decimals"])
                if vol < info[s]["ordermin"] or vol * prices[s] < MIN_ORDER_EUR:
                    send(f"{tag} {s}: niente da vendere finche' lo staking non si sblocca.")
                    continue
        quote = quotes.get(s)
        limit = bool(limit_mode and not halted and s not in fallback and quote)
        price = (quote[0] if side == "buy" else quote[1]) if limit else prices[s]
        try:
            if limit:
                res = client.limit_order(s, side, vol, price, info[s]["pair_decimals"], validate=prova)
            else:
                res = client.market_order(s, side, vol, validate=prova)
            txid = ",".join(res.get("txid", []) or [])
            esito = "in coda" if limit and not prova else (res.get("descr") or {}).get("order", "ok")
        except Exception as e:  # un ordine rifiutato non ferma gli altri
            txid, esito = "", f"errore: {e}"
        if side == "buy":
            cash -= vol * price
        elif not limit:
            cash += vol * price          # una vendita in coda non libera euro finche' non si esegue
        db.execute("INSERT INTO live_orders VALUES (?,?,?,?,?,?,?,?)", (ts, s, side, vol, price, txid, int(prova), esito))
        units = vol if side == "buy" else -vol
        if limit:
            text = alerts.limit_order_text(tag, s, units, price, LIMIT_HOURS)
        else:
            text = alerts.order_text(tag + (f" Dopo {LIMIT_HOURS} ore a mercato:" if s in fallback else ""),
                                     s, units, prices[s], TAKER_FEE * vol * prices[s])
        send(text + ("" if not esito.startswith("errore") else f" — {esito}"))
        orders.append({"simbolo": s, "lato": side, "quantita": vol, "prezzo": price,
                       "tipo": "limite" if limit else "mercato", "esito": esito})
    if earn_on and not halted:
        selling = {s for s, side, _ in plan if side == "sell"} | {s for s, o in pending.items() if o["side"] == "sell"}
        failed = None
        for s in symbols:
            strat = strats.get(earn.asset_of(info[s]["base"])) if s in info else None
            amount = free.get(s, 0.0)
            if not strat or s in selling or weights.get(s, 0.0) <= 0 or amount < strat["min"] or amount * prices[s] < earn.MIN_EUR:
                continue
            try:
                earn.allocate(client, strat["id"], amount)
                send(f"{tag} Metto in staking {amount:.6g} {_coin(s)} (circa {amount * prices[s]:.2f} €, {strat['apr']:.2f}% l'anno, sblocco immediato).")
            except Exception as e:  # tipicamente manca il permesso «Earn Funds»: un avviso ogni 3 ore, non uno per moneta
                failed = e
                break
        if failed is not None and now.hour % STATUS_EVERY_HOURS == 0:
            send(f"{tag} Staking non riuscito ({failed}). Se dice «Permission denied», alla chiave Kraken manca «Earn Funds».")
    first = db.execute("SELECT COUNT(*) FROM live_equity").fetchone()[0] == 0
    if not prova:
        db.execute("INSERT OR REPLACE INTO live_equity VALUES (?, ?)", (ts, equity))
    db.commit()
    if prova or first or now.hour % STATUS_EVERY_HOURS == 0:
        staked_eur = sum((held[s] - free[s]) * prices[s] for s in held)
        send(status_text(tag, now, equity, start, eur, held, prices, halted, pending, staked_eur))
    return {"prova": prova, "patrimonio": round(equity, 2), "inizio": round(start, 2), "euro": round(eur, 2),
            "fermo": halted, "pesi": {s: round(w, 4) for s, w in weights.items() if w}, "ordini": orders}
