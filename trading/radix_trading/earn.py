"""Staking flessibile su Kraken (Earn) per le monete che il conto vero tiene comunque.

Decisione di Francesco del 31/10/2026: le monete in portafoglio rendono qualcosa mentre aspettano
(SOL, ADA, AVAX circa 2,5% l'anno, DOT 1,3%); si usano solo le strategie «instant» (sblocco immediato),
mai quelle bloccate, cosi' una vendita della regola o dello stop non aspetta giorni.

Serve il permesso «Earn Funds» sulla chiave API (Allocate/Deallocate); leggere strategie e allocazioni
basta «Query Funds». Senza permesso il conto continua a comprare e vendere come prima e avvisa.
Le API sono asincrone: dopo Allocate/Deallocate si interroga AllocateStatus/DeallocateStatus finche'
`pending` e' falso.
"""

from __future__ import annotations

import time

MIN_APR = 1.0        # % l'anno: sotto (BTC 0,1%) non vale la pena muovere nulla
MIN_EUR = 1.0        # non si mette in staking meno di un euro
WAIT_S = 90          # attesa massima per uno sblocco prima di vendere comunque la parte libera
EARN_ASSET = {"XXBT": "BTC", "XETH": "ETH", "XXRP": "XRP", "XXLM": "XLM", "XLTC": "LTC", "XXDG": "DOGE"}


def asset_of(base: str) -> str:
    """Dal codice del saldo (XXBT, XETH, SOL) al nome usato da Earn (BTC, ETH, SOL)."""
    return EARN_ASSET.get(base, base)


def strategies(client) -> dict[str, dict]:
    """Per ogni moneta la strategia «instant» allocabile con rendimento almeno MIN_APR: {asset: {id, min, apr}}."""
    out: dict[str, dict] = {}
    cursor = None
    for _ in range(10):
        data = {"lock_type": "instant"}
        if cursor:
            data["cursor"] = cursor
        res = client.private("Earn/Strategies", data)
        for it in res.get("items", []):
            apr = float((it.get("apr_estimate") or {}).get("low") or 0)
            if (it.get("lock_type") or {}).get("type") != "instant" or not it.get("can_allocate") or apr < MIN_APR:
                continue
            asset = it["asset"]
            if asset not in out or apr > out[asset]["apr"]:
                out[asset] = {"id": it["id"], "min": float(it.get("user_min_allocation") or 0), "apr": apr}
        cursor = res.get("next_cursor")
        if not cursor:
            break
    return out


def allocations(client) -> dict[str, float]:
    """Quantita' allocata per strategia (unita' della moneta)."""
    res = client.private("Earn/Allocations", {"hide_zero_allocations": "true"})
    out = {}
    for it in res.get("items", []):
        amount = (((it.get("amount_allocated") or {}).get("total") or {}).get("native"))
        if amount is not None:
            out[it["strategy_id"]] = float(amount)
    return out


def _wait(client, method: str, strategy_id: str, sleep=time.sleep, wait_s: float = WAIT_S) -> bool:
    deadline = time.monotonic() + wait_s
    while True:
        if not client.private(method, {"strategy_id": strategy_id}).get("pending"):
            return True
        if time.monotonic() >= deadline:
            return False
        sleep(3)


def allocate(client, strategy_id: str, amount: float, sleep=time.sleep) -> bool:
    client.private("Earn/Allocate", {"amount": f"{amount:.8f}", "strategy_id": strategy_id})
    return _wait(client, "Earn/AllocateStatus", strategy_id, sleep, wait_s=30)


def deallocate(client, strategy_id: str, amount: float, sleep=time.sleep) -> bool:
    """Sblocca `amount`; vero quando le monete sono di nuovo libere nel saldo."""
    client.private("Earn/Deallocate", {"amount": f"{amount:.8f}", "strategy_id": strategy_id})
    return _wait(client, "Earn/DeallocateStatus", strategy_id, sleep)
