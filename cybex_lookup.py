"""Hidden Cybex customs-duty verification helpers.

The dashboard should not expose a manual "verify on Cybex" action, but the
backend can still cross-check an HSN against Cybex in the duty pipeline.
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
from typing import Any

import requests

log = logging.getLogger(__name__)

BASE_URL = "https://www.cybex.in/indian-custom-duty"
DEFAULT_TIMEOUT = float(os.getenv("CYBEX_TIMEOUT_SECONDS", "8"))
CACHE_TTL = int(os.getenv("CYBEX_CACHE_TTL_SECONDS", "86400"))
PRODUCT_SEARCH_ENABLED = os.getenv("CYBEX_PRODUCT_SEARCH", "false").strip().lower() == "true"

_cache: dict[str, tuple[dict[str, Any], float]] = {}
_lock = threading.Lock()


def _clean_hsn(hsn_code: str | None) -> str:
    return re.sub(r"\D", "", str(hsn_code or ""))[:8]


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": os.getenv(
                "USER_AGENT",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124 Safari/537.36",
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-IN,en;q=0.9",
        }
    )
    return s


def _cached(key: str) -> dict[str, Any] | None:
    with _lock:
        item = _cache.get(key)
        if not item:
            return None
        data, ts = item
        if time.time() - ts <= CACHE_TTL:
            return dict(data)
        _cache.pop(key, None)
    return None


def _set_cached(key: str, data: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        _cache[key] = (dict(data), time.time())
    return data


def _extract_percent_near(label: str, html: str) -> float | None:
    """Best-effort extraction; Cybex layout changes, so never trust silently."""
    compact = re.sub(r"\s+", " ", html)
    patterns = [
        rf"{label}[^%]{{0,160}}?(\d+(?:\.\d+)?)\s*%",
        rf"(\d+(?:\.\d+)?)\s*%[^%]{{0,160}}?{label}",
    ]
    for pattern in patterns:
        m = re.search(pattern, compact, flags=re.I)
        if m:
            try:
                value = float(m.group(1))
                if 0 <= value <= 100:
                    return value
            except (TypeError, ValueError):
                return None
    return None


def _extract_description(hsn: str, html: str) -> str:
    title = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.I | re.S)
    if title:
        text = re.sub(r"<[^>]+>", " ", title.group(1))
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            return text[:240]
    meta = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)', html, flags=re.I)
    if meta:
        return re.sub(r"\s+", " ", meta.group(1)).strip()[:240]
    return f"Cybex page found for HSN {hsn}"


def _parse_hsn_page(hsn: str, html: str, url: str) -> dict[str, Any]:
    digits = re.sub(r"\D", "", html)
    has_hsn = hsn in digits
    # Cybex sometimes serves a shell page that contains only the searched HSN
    # heading and newsletter/footer. Treat that as not verified because the
    # user will also see no duty details on the website.
    bcd = _extract_percent_near(r"(?:BCD|Basic Customs Duty|Basic Duty)", html)
    igst = _extract_percent_near(r"(?:IGST|Integrated GST)", html)
    verified = bool(has_hsn and (bcd is not None or igst is not None))
    return {
        "verified": bool(verified),
        "matched_hsn": hsn if verified else "",
        "description": _extract_description(hsn, html),
        "bcd": bcd,
        "igst": igst,
        "url": url,
        "source": "Cybex",
        "status": "ok" if verified else "no_duty_details",
    }


def _search_by_product(term: str) -> str | None:
    """Optional fallback to discover an HSN link from Cybex search results."""
    if not PRODUCT_SEARCH_ENABLED or not term:
        return None
    s = _session()
    try:
        landing = s.get(BASE_URL, timeout=DEFAULT_TIMEOUT)
        token_match = re.search(r'name=["\']_token["\']\s+value=["\']([^"\']+)', landing.text, flags=re.I)
        data = {"searchField": "product_name", "searchValue": term, "searchSubmitBtn": "Search"}
        if token_match:
            data["_token"] = token_match.group(1)
        resp = s.post(f"{BASE_URL}/search", data=data, headers={"Referer": BASE_URL}, timeout=DEFAULT_TIMEOUT)
        m = re.search(r"/indian-custom-duty/hs-(\d{4,8})", resp.text, flags=re.I)
        return m.group(1) if m else None
    except Exception as exc:
        log.info("Cybex product search skipped for %s: %s", term, exc)
        return None


def verify_hsn(hsn_code: str | None, description: str = "", part_number: str = "") -> dict[str, Any]:
    """Verify an HSN on Cybex without blocking the main pricing workflow.

    Returns a small normalized dict. If Cybex is down or parsing fails, callers
    keep their existing local/AI duty rates and only mark verification false.
    """
    hsn = _clean_hsn(hsn_code)
    cache_key = f"{hsn}|{part_number}|{description[:80]}"
    cached = _cached(cache_key)
    if cached:
        return cached

    if not hsn and (part_number or description):
        hsn = _clean_hsn(_search_by_product(part_number or description))
    if not hsn:
        return _set_cached(
            cache_key,
            {"verified": False, "matched_hsn": "", "url": BASE_URL, "source": "Cybex", "status": "no_hsn"},
        )

    url = f"{BASE_URL}/hs-{hsn}"
    try:
        resp = _session().get(url, timeout=DEFAULT_TIMEOUT)
        if resp.status_code == 200 and resp.text:
            return _set_cached(cache_key, _parse_hsn_page(hsn, resp.text, resp.url or url))
        return _set_cached(
            cache_key,
            {
                "verified": False,
                "matched_hsn": hsn,
                "url": url,
                "source": "Cybex",
                "status": f"http_{resp.status_code}",
            },
        )
    except Exception as exc:
        log.info("Cybex verification failed for HSN %s: %s", hsn, exc)
        return _set_cached(
            cache_key,
            {"verified": False, "matched_hsn": hsn, "url": url, "source": "Cybex", "status": "error"},
        )
