"""
Digikey Price Fetcher
=====================
Fetches real-time pricing from Digikey India API v4.

PRICE SLAB FIX:
  Digikey returns multiple price breaks (e.g. 1pc=₹9.32, 100pc=₹7.50, 2000pc=₹1.55)
  We pick the price for quantity=1 (single unit price) — NOT the bulk/MOQ price.
  This gives the true unit price for comparison.

Environment variables:
    DIGIKEY_CLIENT_ID
    DIGIKEY_CLIENT_SECRET
"""

from __future__ import annotations
import logging, os, re, threading, time
from typing import Optional
import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

load_dotenv()
log = logging.getLogger(__name__)

CLIENT_ID     = os.getenv("DIGIKEY_CLIENT_ID",     "")
CLIENT_SECRET = os.getenv("DIGIKEY_CLIENT_SECRET", "")

_TOKEN_URL = "https://api.digikey.com/v1/oauth2/token"
_BASE_URL  = "https://api.digikey.com/products/v4/search/{mpn}/productdetails"
_KEYWORD_URL = "https://api.digikey.com/products/v4/search/keyword"
_TIMEOUT   = 8

_session: Optional[requests.Session] = None
_session_lock = threading.Lock()

def _get_session() -> requests.Session:
    global _session
    with _session_lock:
        if _session is None:
            s = requests.Session()
            retry = Retry(total=2, backoff_factor=0.2,
                         status_forcelist=[429,500,502,503,504],
                         allowed_methods=["GET","POST"])
            adapter = HTTPAdapter(max_retries=retry, pool_connections=12, pool_maxsize=12)
            s.mount("https://", adapter)
            s.mount("http://",  adapter)
            _session = s
    return _session

_token_cache = {"access_token": None, "expires_at": 0.0}
_token_lock  = threading.Lock()

def get_digikey_token() -> Optional[str]:
    with _token_lock:
        if _token_cache["access_token"] and time.time() < _token_cache["expires_at"]:
            return _token_cache["access_token"]
        try:
            resp = _get_session().post(_TOKEN_URL, data={
                "client_id"    : CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "grant_type"   : "client_credentials",
            }, timeout=_TIMEOUT)
            resp.raise_for_status()
            payload = resp.json()
            token   = payload.get("access_token")
            ttl     = int(payload.get("expires_in", 1800))
            if token:
                _token_cache["access_token"] = token
                _token_cache["expires_at"]   = time.time() + ttl - 60
                return token
        except Exception as e:
            log.error("Digikey token refresh failed: %s", e)
    return None


def _normalize_pricing(price_breaks: list, package_type: str = "", min_order_qty: int | None = None) -> list:
    normalized = []
    for tier in price_breaks or []:
        try:
            qty = int(tier.get("BreakQuantity", 0))
            price = float(tier.get("UnitPrice", 0))
        except Exception:
            continue
        if qty > 0 and price > 0:
            normalized.append({
                "BreakQuantity": qty,
                "UnitPrice": price,
                "TotalPrice": tier.get("TotalPrice"),
                "PackageType": package_type,
                "MinimumOrderQuantity": min_order_qty or qty,
            })
    return normalized


def _merge_variation_pricing(product: dict) -> tuple[list, dict]:
    """Merge DigiKey package variations into one usable price ladder.

    DigiKey often returns Tape & Reel first, even when Cut Tape loose pricing exists.
    For BOM estimation we need the best available unit price at each quantity:
    1pc can come from Cut Tape, while 50,000pc can come from Tape & Reel.
    """
    variations = product.get("ProductVariations") or []
    merged_by_qty: dict[int, dict] = {}
    loose_variation: dict = {}
    first_variation: dict = {}

    for variation in variations:
        package = (variation.get("PackageType") or {}).get("Name", "")
        min_qty = variation.get("MinimumOrderQuantity")
        if not first_variation:
            first_variation = variation
        if not loose_variation and (str(package).lower().find("cut tape") >= 0 or str(package).lower().find("digi-reel") >= 0):
            loose_variation = variation
        for tier in _normalize_pricing(variation.get("StandardPricing") or [], package, min_qty):
            qty = tier["BreakQuantity"]
            current = merged_by_qty.get(qty)
            if current is None or tier["UnitPrice"] < current["UnitPrice"]:
                merged_by_qty[qty] = tier

    if not merged_by_qty:
        for tier in _normalize_pricing(product.get("StandardPricing") or [], "", product.get("MinimumOrderQuantity")):
            merged_by_qty[tier["BreakQuantity"]] = tier

    preferred = loose_variation or first_variation or {}
    return sorted(merged_by_qty.values(), key=lambda item: item["BreakQuantity"]), preferred


def _pick_price_for_qty(price_breaks: list, want_qty: int = 1) -> tuple:
    """
    Pick the correct unit price for a given quantity.

    Digikey price breaks example:
      [{"BreakQuantity":1,    "UnitPrice":9.32},
       {"BreakQuantity":100,  "UnitPrice":7.50},
       {"BreakQuantity":2000, "UnitPrice":1.55}]

    Logic:
      - Find the highest BreakQuantity <= want_qty
      - That is the applicable price tier
      - Default to BreakQuantity=1 (single unit price) if want_qty=1

    Returns (price, moq) tuple.
    """
    if not price_breaks:
        return None, None

    # Sort by BreakQuantity ascending
    try:
        breaks = sorted(price_breaks, key=lambda x: int(x.get("BreakQuantity", 0)))
    except Exception:
        breaks = price_breaks

    # Always use BreakQuantity=1 price as the unit price
    # This is the real single-unit price — MOQ is shown separately
    unit_price = None
    moq        = None

    for b in breaks:
        try:
            bq = int(b.get("BreakQuantity", 0))
            up = float(b.get("UnitPrice", 0))
            if bq == 1:
                unit_price = up   # Single unit price — this is what we want
                moq = bq
                break
        except Exception:
            continue

    # If no BreakQuantity=1 exists, DigiKey is not offering loose single-piece pricing.
    # Use the first available break and expose that break quantity as the enforced MOQ.
    if unit_price is None and breaks:
        try:
            unit_price = float(breaks[0].get("UnitPrice", 0))
            moq        = int(breaks[0].get("BreakQuantity", 1))
        except Exception:
            pass

    return unit_price, moq


def _product_to_result(product: dict, requested_mpn: str) -> Optional[dict]:
    price_breaks, preferred_variation = _merge_variation_pricing(product)
    unit_price, moq = _pick_price_for_qty(price_breaks, want_qty=1)
    if not unit_price:
        return None
    actual_moq = preferred_variation.get("MinimumOrderQuantity") or product.get("MinimumOrderQuantity") or moq or 1
    preferred_package = (preferred_variation.get("PackageType") or {}).get("Name", "")
    preferred_part = (
        preferred_variation.get("DigiKeyProductNumber")
        or product.get("DigiKeyPartNumber")
        or product.get("DigiKeyProductNumber")
    )
    manufacturer = product.get("Manufacturer") or {}
    description = product.get("Description") or {}
    return {
        "mpn"         : requested_mpn,
        "manufacturer_part_number": product.get("ManufacturerProductNumber") or requested_mpn,
        "manufacturer": manufacturer.get("Name") if isinstance(manufacturer, dict) else "",
        "digikey_part": preferred_part,
        "description" : description.get("ProductDescription") if isinstance(description, dict) else "",
        "stock"       : product.get("QuantityAvailable"),
        "lead_time"   : f"{product.get('ManufacturerLeadWeeks', 'N/A')} weeks",
        "moq"         : actual_moq,
        "price"       : unit_price,
        "min_price_qty": actual_moq,
        "loose_available": bool(moq == 1 or actual_moq == 1),
        "package_type" : preferred_package,
        "url"         : product.get("ProductUrl"),
        "datasheet_url": product.get("DatasheetUrl") or product.get("PrimaryDatasheet"),
        "price_breaks": price_breaks,
    }


def _keyword_search_product(mpn: str, headers: dict) -> Optional[dict]:
    try:
        resp = _get_session().post(
            _KEYWORD_URL,
            headers=headers,
            json={"Keywords": mpn, "Limit": 8, "RecordCount": 8},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        products = resp.json().get("Products") or []
        if not products:
            return None
        query = re.sub(r"[^A-Z0-9]", "", str(mpn).upper())
        ranked = []
        for product in products:
            candidate = re.sub(
                r"[^A-Z0-9]", "",
                str(product.get("ManufacturerProductNumber") or "").upper(),
            )
            desc = " ".join(str(v or "") for v in (product.get("Description") or {}).values())
            q_tokens = {t for t in re.findall(r"[a-z0-9]+", str(mpn).lower()) if len(t) >= 3}
            c_tokens = {t for t in re.findall(r"[a-z0-9]+", f"{candidate} {desc}".lower()) if len(t) >= 3}
            overlap = q_tokens & c_tokens
            score = 0
            if query and candidate == query:
                score += 100
            elif query and (query in candidate or candidate in query):
                score += 80
            elif len(query) >= 6 and query[:6] in candidate:
                score += 55
            if len(overlap) >= 2:
                score += 50 + min(len(overlap) * 8, 30)
            if int(product.get("QuantityAvailable") or 0) > 0:
                score += 10
            if product.get("ProductUrl"):
                score += 3
            ranked.append((score, product))
        ranked.sort(key=lambda item: item[0], reverse=True)
        return ranked[0][1] if ranked and ranked[0][0] >= 50 else None
    except Exception as exc:
        log.warning("Digikey keyword search failed for %s: %s", mpn, exc)
        return None


def get_digikey_price(mpn: str, token: Optional[str] = None) -> Optional[dict]:
    """
    Return pricing and availability for mpn from Digikey India.
    Price returned is the SINGLE UNIT price (BreakQuantity=1).
    """
    if not token:
        token = get_digikey_token()
    if not token:
        log.warning("No Digikey token — skipping %s", mpn)
        return None

    headers = {
        "Authorization"            : f"Bearer {token}",
        "X-DIGIKEY-Client-Id"      : CLIENT_ID,
        "X-DIGIKEY-Locale-Site"    : "IN",
        "X-DIGIKEY-Locale-Currency": "INR",
        "Content-Type"             : "application/json",
    }

    try:
        resp = _get_session().get(_BASE_URL.format(mpn=mpn), headers=headers, timeout=_TIMEOUT)

        if resp.status_code == 401:
            _token_cache["access_token"] = None
            new_token = get_digikey_token()
            if new_token:
                headers["Authorization"] = f"Bearer {new_token}"
                resp = _get_session().get(_BASE_URL.format(mpn=mpn), headers=headers, timeout=_TIMEOUT)

        if resp.status_code == 404:
            product = _keyword_search_product(mpn, headers)
        else:
            resp.raise_for_status()
            product = resp.json().get("Product")
        if not product:
            log.debug("Digikey: no product for %s", mpn)
            return None

        # Get merged price ladder across package variations.
        # Prefer loose Cut Tape/Digi-Reel at low quantity but include reel breaks for high-volume pricing.
        price_breaks, preferred_variation = _merge_variation_pricing(product)

        # ── KEY FIX: Use single unit price (BreakQty=1), not bulk MOQ price ──
        unit_price, moq = _pick_price_for_qty(price_breaks, want_qty=1)

        # Also get the actual MOQ (minimum order quantity)
        actual_moq = preferred_variation.get("MinimumOrderQuantity") or product.get("MinimumOrderQuantity") or moq or 1
        preferred_package = (preferred_variation.get("PackageType") or {}).get("Name", "")
        preferred_part = preferred_variation.get("DigiKeyProductNumber") or product.get("DigiKeyPartNumber")

        if not unit_price:
            log.debug("Digikey: no price for %s", mpn)
            return None

        log.debug("Digikey %s: unit_price=₹%.4f moq=%s stock=%s",
                  mpn, unit_price, actual_moq, product.get("QuantityAvailable"))

        return {
            "mpn"         : mpn,
            "digikey_part": preferred_part,
            "description" : product.get("Description", {}).get("ProductDescription"),
            "stock"       : product.get("QuantityAvailable"),
            "lead_time"   : f"{product.get('ManufacturerLeadWeeks', 'N/A')} weeks",
            "moq"         : actual_moq,
            "price"       : unit_price,
            "min_price_qty": actual_moq,
            "loose_available": bool(moq == 1 or actual_moq == 1),
            "package_type" : preferred_package,
            "url"         : product.get("ProductUrl"),
            "datasheet_url": product.get("DatasheetUrl") or product.get("PrimaryDatasheet"),
            "price_breaks": price_breaks, # Full slab for reference
        }

    except Exception as e:
        log.warning("Digikey error for %s: %s", mpn, e)
        return None


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    token = get_digikey_token()
    for mpn in ["CL21B105KAFNFNE", "CC0603KRX7R9BB104", "74HCT1G08GW"]:
        r = get_digikey_price(mpn, token)
        if r:
            print(f"\n{mpn}")
            print(f"  Unit Price (1pc): ₹{r['price']}")
            print(f"  MOQ             : {r['moq']}")
            print(f"  Stock           : {r['stock']}")
            print(f"  Lead Time       : {r['lead_time']}")
            pb = r.get('price_breaks',[])
            if pb:
                print("  All Price Breaks:")
                for b in sorted(pb, key=lambda x: x.get('BreakQuantity',0)):
                    print(f"    {b.get('BreakQuantity')}pc → ₹{b.get('UnitPrice')}")
