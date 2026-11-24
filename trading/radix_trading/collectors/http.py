from __future__ import annotations

import time

import requests

# Alcune fonti rifiutano user-agent sconosciuti (FRED si blocca, Yahoo risponde 429):
# di default si usa quello di requests, per Yahoo uno da browser.
BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def get(url: str, params: dict | None = None, retries: int = 3, timeout: int = 30,
        user_agent: str | None = None, rate_limit_wait: float = 6.0) -> requests.Response:
    """GET con pochi tentativi. Su 429 (troppe richieste) attende `rate_limit_wait` secondi o
    quanto chiede la fonte; sugli altri errori attende 1, 2, 4 secondi."""
    headers = {"User-Agent": user_agent} if user_agent else None
    last: Exception | None = None
    for attempt in range(retries):
        wait = 2 ** attempt
        try:
            r = requests.get(url, params=params, timeout=timeout, headers=headers)
            if r.status_code == 429:
                wait = max(rate_limit_wait, float(r.headers.get("Retry-After", 0) or 0))
                raise requests.HTTPError(f"429 da {url}")
            if r.status_code >= 500:
                raise requests.HTTPError(f"{r.status_code} da {url}")
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            last = e
            if attempt < retries - 1:
                time.sleep(wait)
    raise RuntimeError(f"Fonte non raggiungibile: {url} ({last})") from last
