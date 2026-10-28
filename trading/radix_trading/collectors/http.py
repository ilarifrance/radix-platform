from __future__ import annotations

import time

import requests

USER_AGENT = "radix-trading/0.1 (+research)"


def get(url: str, params: dict | None = None, retries: int = 3, timeout: int = 30) -> requests.Response:
    """GET con pochi tentativi e attesa crescente; le fonti gratuite hanno limiti di frequenza."""
    last: Exception | None = None
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, timeout=timeout, headers={"User-Agent": USER_AGENT})
            if r.status_code == 429 or r.status_code >= 500:
                raise requests.HTTPError(f"{r.status_code} da {url}")
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            last = e
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Fonte non raggiungibile: {url}") from last
