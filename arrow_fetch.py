"""
Arrow Electronics Price Fetcher
=================================
Fetches real-time pricing and inventory from Arrow Electronics API v4.

Environment variable required:
    ARROW_API_KEY    — API key from developers.arrow.com (register free)

Optional:
    ARROW_USD_TO_INR — exchange rate for USD→INR conversion (default: 83.5)
"""

from __future__ import annotations

import logging
import os
import re
import threading
from typing import Optional
from urllib.parse import quote_plus

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

load_dotenv()

log = logging.getLogger(__name__)

API_KEY     = os.getenv("ARROW_API_KEY", "")
_BASE_URL   = "https://api.arrow.com/itemservice/v4/en-US/search"
_TIMEOUT    = 10
_USD_TO_INR = float(os.getenv("ARROW_USD_TO_INR", "83.5"))

_session: Optional[requests.Session] = None
_session_lock = threading.Lock()


def _get_session() -> requests.Session:
    global _session
    with _session_lock:
        if _session is None:
            s = requests.Session()
            retry = Retry(
                total=2,
                backoff_factor=0.3,
                status_forcelist=[429, 500, 502, 503, 504],
                allowed_methods=["GET"],
            )
            adapter = HTTPAdapter(
                max_retries=retry,
                pool_connections=10,
                pool_maxsize=10,
            )
            s.mount("https://", adapter)
            s.mount("http://",  adapter)
            _session = s
    return _session


def _to_float(val: object) -> Optional[float]:
    try:
        return float(
            str(val).replace(",", "").replace("$", "").replace("₹", "").strip()
        )
    except (TypeError, ValueError):
        return None


def get_arrow_price(mpn: str) -> Optional[dict]:
    """
    Return pricing and inventory for *mpn* from Arrow Electronics.
    Prices are converted from USD to INR.

    Returns dict with keys:
        mpn, arrow_part, description, manufacturer,
        stock, lead_time, moq, price, url
    None if API key not set, part not found, or error.
    """
    if not API_KEY:
        log.debug("Arrow: ARROW_API_KEY not set, using exact-match web fallback")
        return _scrape_arrow_price(mpn)

    params = {
        "search":        mpn,
        "responseGroup": "prices,inventory",
        "start":         0,
        "rows":          5,
    }
    headers = {
        "X-Arrow-APIKey": API_KEY,
        "Accept":         "application/json",
    }

    try:
        resp = _get_session().get(
            _BASE_URL, params=params, headers=headers, timeout=_TIMEOUT
        )
        resp.raise_for_status()
        body = resp.json()
        data = (body.get("itemServiceResult") or {}).get("data") or []

        if not data:
            log.debug("Arrow: no product found for %s", mpn)
            return None

        # Prefer exact part number match
        exact = [
            d for d in data
            if str(d.get("partNumber", "")).upper() == mpn.upper()
        ]
        if not exact:
            log.debug("Arrow: no exact API match for %s", mpn)
            return _scrape_arrow_price(mpn)
        item = exact[0]

        mfr  = (item.get("manufacturer") or {}).get("mfrName", "")
        desc = item.get("description", "")

        # Total inventory across warehouses
        inv_list = item.get("inventory") or []
        stock    = sum(int(i.get("quantity", 0)) for i in inv_list)

        # Pricing — first tier of first pricing response, convert USD→INR
        price_usd: Optional[float] = None
        moq: int = 1
        pricing = item.get("pricingResponse") or []
        if pricing:
            tiers = pricing[0].get("pricingTier") or []
            if tiers:
                price_usd = _to_float(tiers[0].get("unitPrice"))
                try:
                    moq = int(tiers[0].get("minQuantity") or 1)
                except (TypeError, ValueError):
                    moq = 1

        price_inr = round(price_usd * _USD_TO_INR, 4) if price_usd else None
        normalized_breaks = []
        for tier in (tiers if pricing else []):
            tier_price_usd = _to_float(tier.get("unitPrice"))
            if not tier_price_usd:
                continue
            try:
                tier_qty = int(tier.get("minQuantity") or 1)
            except (TypeError, ValueError):
                tier_qty = 1
            normalized_breaks.append({"qty": tier_qty, "price": round(tier_price_usd * _USD_TO_INR, 4)})

        part_no  = item.get("partNumber", "")
        mfr_slug = mfr.lower().replace(" ", "-") if mfr else "arrow"

        return {
            "mpn":          mpn,
            "arrow_part":   part_no,
            "description":  desc,
            "manufacturer": mfr,
            "stock":        str(stock),
            "lead_time":    "N/A",
            "moq":          moq,
            "price":        price_inr,
            "price_breaks": normalized_breaks,
            "url": (
                f"https://www.arrow.com/en/products/{part_no}/{mfr_slug}"
                if part_no
                else f"https://www.arrow.com/en/search?q={mpn}"
            ),
        }

    except Exception as exc:
        log.warning("Arrow error for %s: %s", mpn, exc)
        return _scrape_arrow_price(mpn)


def _scrape_arrow_price(mpn: str) -> Optional[dict]:
    """Best-effort Arrow web fallback.

    Arrow's public pages can be JS-heavy. This only returns a result when the page HTML contains
    the exact MPN and a visible price-like value; otherwise it returns None.
    """
    try:
        url = f"https://www.arrow.com/en/search?q={quote_plus(mpn)}"
        resp = _get_session().get(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html,*/*"}, timeout=_TIMEOUT)
        if resp.status_code >= 400:
            return None
        html = resp.text
        if mpn.upper() not in html.upper():
            return None
        price_match = re.search(r'(?:₹|Rs\.?|\$)\s*([\d,]+(?:\.\d+)?)', html)
        price = _to_float(price_match.group(1)) if price_match else None
        if not price:
            return None
        return {
            "mpn": mpn,
            "arrow_part": mpn,
            "description": mpn,
            "manufacturer": "",
            "stock": "N/A",
            "lead_time": "N/A",
            "moq": 1,
            "price": price,
            "price_breaks": [{"qty": 1, "price": price}],
            "url": url,
        }
    except Exception as exc:
        log.debug("Arrow web fallback error for %s: %s", mpn, exc)
        return None


# ─── CLI self-test ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import json
    logging.basicConfig(
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        level=logging.INFO,
    )
    test_parts = ["CC0603KRX7R9BB104", "74HCT1G08GW", "LM358"]
    for p in test_parts:
        result = get_arrow_price(p)
        print(f"{p}: {json.dumps(result, indent=2)}")
