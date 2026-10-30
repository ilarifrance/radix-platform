"""Avvisi sul telefono via Telegram (bot personale di Francesco).

Servono TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID in ~/RadixTrading/.env. Senza, gli avvisi non partono
e nessun giro si ferma per questo: un avviso mancato non deve mai bloccare un'uscita.
"""

from __future__ import annotations

import requests

from .config import env_value

API = "https://api.telegram.org/bot{token}/sendMessage"


def configured() -> bool:
    return bool(env_value("TELEGRAM_BOT_TOKEN") and env_value("TELEGRAM_CHAT_ID"))


def send(text: str, post=requests.post) -> bool:
    token, chat = env_value("TELEGRAM_BOT_TOKEN"), env_value("TELEGRAM_CHAT_ID")
    if not (token and chat):
        return False
    try:
        r = post(API.format(token=token), data={"chat_id": chat, "text": text[:4000]}, timeout=15)
        return r.status_code == 200
    except requests.RequestException:
        return False


def order_text(prefix: str, symbol: str, units: float, price: float, fee: float) -> str:
    side = "Compro" if units > 0 else "Vendo"
    return f"{prefix} {side} {abs(units):.6g} {symbol} a {price:,.2f} € (circa {abs(units) * price:,.2f} €, commissione {fee:.2f} €)"
