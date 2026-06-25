"""
Mouser Price Fetcher
=====================
Fetches real-time pricing, stock, lead-time, manufacturer name
and HSN code from the Mouser Search API.

Environment variable required:
    MOUSER_API_KEY — API key from developer.mouser.com
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

API_KEY   = os.getenv("MOUSER_API_KEY", "")
_BASE_URL = "https://api.mouser.com/api/v1/search/partnumber"
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
                total=1,
                backoff_factor=0.1,
                status_forcelist=[429, 500, 502, 503, 504],
                # 403 = API key invalid/expired — do NOT retry, fail immediately
                allowed_methods=["POST"],
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


def _extract_hsn(compliance: list) -> str:
    """
    Extract HSN code from Mouser ProductCompliance list.
    Priority: CNHTS → USHTS → TARIC → BRHTS
    """
    priority = ["CNHTS", "USHTS", "TARIC", "BRHTS"]
    lookup   = {c.get("ComplianceName"): c.get("ComplianceValue", "") for c in compliance}
    for key in priority:
        val = lookup.get(key, "")
        if val:
            return str(val)[:8]
    return ""


# ─── Price fetch ──────────────────────────────────────────────────────────────
def get_mouser_price(mpn: str) -> Optional[dict]:
    """
    Return pricing, availability, manufacturer and HSN code
    for *mpn* from Mouser India.

    Returns
    -------
    dict with keys: mpn, mouser_part, description, manufacturer,
                    hsn_code, stock, lead_time, moq, price, url
    None if the part is not found or an error occurs.
    """
    payload = {
        "SearchByPartRequest": {
            "mouserPartNumber" : mpn,
            "partSearchOptions": "string",
        }
    }

    if not API_KEY:
        log.debug("Mouser: MOUSER_API_KEY not set, skipping")
        return None

    try:
        resp = _get_session().post(
            _BASE_URL,
            params={"apiKey": API_KEY},
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=_TIMEOUT,
        )
        # 401/403 = key expired/invalid — log once and skip silently
        if resp.status_code in (401, 403):
            log.warning("Mouser API key invalid/expired (HTTP %s) — skipping Mouser. Renew at developer.mouser.com", resp.status_code)
            return None
        resp.raise_for_status()

        parts = resp.json().get("SearchResults", {}).get("Parts", [])
        if not parts:
            log.debug("Mouser: no product found for %s", mpn)
            return None

        part         = parts[0]
        price_breaks = part.get("PriceBreaks", [])

        price: Optional[float] = None
        moq:   Optional[int]   = None
        if price_breaks:
            price = _to_float(price_breaks[0].get("Price"))
            try:
                moq = int(price_breaks[0].get("Quantity", 1))
            except (TypeError, ValueError):
                pass
        normalized_breaks = []
        for tier in price_breaks:
            tier_price = _to_float(tier.get("Price"))
            if not tier_price:
                continue
            try:
                tier_qty = int(tier.get("Quantity", 1))
            except (TypeError, ValueError):
                tier_qty = 1
            normalized_breaks.append({"qty": tier_qty, "price": tier_price})

        mouser_part  = part.get("MouserPartNumber", "")
        manufacturer = part.get("Manufacturer", "") or part.get("ManufacturerName", "")
        hsn_code     = _extract_hsn(part.get("ProductCompliance", []))

        return {
            "mpn"         : mpn,
            "mouser_part" : mouser_part,
            "description" : part.get("Description"),
            "manufacturer": manufacturer,
            "hsn_code"    : hsn_code,
            "stock"       : part.get("Availability"),
            "lead_time"   : part.get("LeadTime"),
            "moq"         : moq,
            "price"       : price,
            "price_breaks": normalized_breaks,
            "url"         : f"https://www.mouser.in/ProductDetail/{mouser_part}",
            "datasheet_url": part.get("DataSheetUrl") or part.get("DatasheetUrl") or "",
        }

    except Exception as exc:
        log.warning("Mouser error for %s: %s", mpn, exc)
        return None


# ─── CLI self-test ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        level=logging.INFO,
    )
    test_parts = ["CC0603KRX7R9BB104", "PEC11R-4015F-S0024", "74HCT1G08GW"]
    for part in test_parts:
        print(get_mouser_price(part))
