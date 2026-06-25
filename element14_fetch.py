"""
Element14 Price Fetcher
========================
Fetches real-time pricing, stock, and lead-time from the
Element14 / Farnell Product Search API for the Indian store.

Environment variable required:
    ELEMENT14_API_KEY — partner portal API key
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Optional

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

load_dotenv()

log = logging.getLogger(__name__)

API_KEY  = os.getenv("ELEMENT14_API_KEY", "")
_BASE_URL = "https://api.element14.com/catalog/products"
_STORE_ID = "in.element14.com"
_TIMEOUT  = 8

# ─── Shared session ───────────────────────────────────────────────────────────
_session: Optional[requests.Session] = None
_session_lock = threading.Lock()

def _get_session() -> requests.Session:
    global _session
    with _session_lock:
        if _session is None:
            s     = requests.Session()
            retry = Retry(
                total=2,
                backoff_factor=0.2,
                status_forcelist=[429, 500, 502, 503, 504],
                allowed_methods=["GET"],
            )
            adapter = HTTPAdapter(
                max_retries=retry,
                pool_connections=12,
                pool_maxsize=12,
            )
            s.mount("https://", adapter)
            s.mount("http://",  adapter)
            _session = s
    return _session


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _to_float(value: object) -> Optional[float]:
    try:
        return float(str(value).replace("₹", "").replace(",", "").strip())
    except (TypeError, ValueError):
        return None


# ─── Price fetch ──────────────────────────────────────────────────────────────
def get_element14_price(mpn: str) -> Optional[dict]:
    """
    Return pricing and availability for *mpn* from Element14 India.

    Returns
    -------
    dict with keys: mpn, element14_part, description, stock,
                    lead_time, moq, price, url
    None if the part is not found or an error occurs.
    """
    params = {
        "term"                            : f"manuPartNum:{mpn}",
        "storeInfo.id"                    : _STORE_ID,
        "resultsSettings.offset"          : 0,
        "resultsSettings.numberOfResults" : 1,
        "resultsSettings.responseGroup"   : "large",
        "callInfo.apiKey"                 : API_KEY,
        "callInfo.responseDataFormat"     : "json",
    }

    try:
        resp = _get_session().get(_BASE_URL, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()

        body     = resp.json()
        # The top-level key name varies — safely grab the first value
        search   = next(iter(body.values()), {})
        products = search.get("products", [])

        if not products:
            log.debug("Element14: no product found for %s", mpn)
            return None

        product = products[0]
        prices  = product.get("prices", [])
        stock   = product.get("stock", {})

        price: Optional[float] = _to_float(prices[0].get("cost")) if prices else None
        moq:   Optional[int]   = None
        if prices:
            try:
                moq = int(prices[0].get("from", 1))
            except (TypeError, ValueError):
                pass
        normalized_breaks = []
        for tier in prices:
            tier_price = _to_float(tier.get("cost"))
            if not tier_price:
                continue
            try:
                tier_qty = int(tier.get("from", 1))
            except (TypeError, ValueError):
                tier_qty = 1
            normalized_breaks.append({"qty": tier_qty, "price": tier_price})

        return {
            "mpn"           : mpn,
            "element14_part": product.get("sku"),
            "description"   : product.get("displayName"),
            "stock"         : stock.get("level"),
            "lead_time"     : f"{stock.get('leastLeadTime', 'N/A')} days",
            "moq"           : moq,
            "price"         : price,
            "price_breaks"  : normalized_breaks,
            "url"           : f"https://in.element14.com/search?st={mpn}",
            "datasheet_url" : (product.get("datasheets") or [{}])[0].get("url", "") if isinstance(product.get("datasheets"), list) else "",
        }

    except Exception as exc:
        log.warning("Element14 error for %s: %s", mpn, exc)
        return None


# ─── CLI self-test ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        level=logging.INFO,
    )
    test_parts = ["CC0603KRX7R9BB104", "PEC11R-4015F-S0024", "74HCT1G08GW"]
    for part in test_parts:
        print(get_element14_price(part))
