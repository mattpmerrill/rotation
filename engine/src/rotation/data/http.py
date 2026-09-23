"""Shared HTTP client with retry and backoff for rate limits and transient errors."""

from __future__ import annotations

import time

import httpx

RETRY_STATUS = {429, 500, 502, 503, 504}


def get(
    client: httpx.Client,
    url: str,
    *,
    params: dict | None = None,
    retries: int = 5,
    backoff: float = 2.0,
) -> httpx.Response:
    """GET with exponential backoff. Returns 404s to the caller; raises on other failures."""
    for attempt in range(retries + 1):
        try:
            r = client.get(url, params=params)
        except httpx.TransportError:
            if attempt == retries:
                raise
        else:
            if r.status_code not in RETRY_STATUS:
                if r.status_code != 404:
                    r.raise_for_status()
                return r
            if attempt == retries:
                r.raise_for_status()
            retry_after = r.headers.get("retry-after")
            if retry_after and retry_after.isdigit():
                time.sleep(int(retry_after))
                continue
        time.sleep(backoff * 2**attempt)
    raise AssertionError("unreachable")


def client(**kwargs) -> httpx.Client:
    return httpx.Client(timeout=60, follow_redirects=True, **kwargs)
