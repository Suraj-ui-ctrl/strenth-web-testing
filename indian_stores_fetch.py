"""
Indian Electronics Stores Price Fetcher
=========================================
Fetches real-time INR pricing from accessible Indian online stores.

Stores:
  - Sunrom.in   — HTML scraping (no auth, no Cloudflare)
  - Ktron.in    — HTML scraping (WooCommerce, no auth)

No API keys required. Prices are native INR.
"""

from __future__ import annotations

import logging
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

log = logging.getLogger(__name__)
_TIMEOUT = 12

_session: Optional[requests.Session] = None
_session_lock = threading.Lock()

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _get_session() -> requests.Session:
    global _session
    with _session_lock:
        if _session is None:
            s = requests.Session()
            retry = Retry(
                total=2, backoff_factor=0.3,
                status_forcelist=[429, 500, 502, 503, 504],
                allowed_methods=["GET"],
            )
            adapter = HTTPAdapter(
                max_retries=retry,
                pool_connections=10, pool_maxsize=10,
            )
            s.mount("https://", adapter)
            s.mount("http://",  adapter)
            s.headers.update(_HEADERS)
            _session = s
    return _session


def _to_float(val: object) -> Optional[float]:
    try:
        return float(
            str(val).replace(",", "").replace("₹", "").replace("Rs.", "").replace("Rs", "").strip()
        )
    except (TypeError, ValueError):
        return None


# ─── Sunrom ───────────────────────────────────────────────────────────────────
def _get_sunrom_price(mpn: str) -> Optional[dict]:
    """
    Search Sunrom.in for mpn and return pricing.
    Sunrom uses custom HTML blocks: <div class='pcontainer'>
    """
    try:
        url = "https://www.sunrom.com/search"
        resp = _get_session().get(url, params={"q": mpn}, timeout=_TIMEOUT)
        if resp.status_code != 200:
            return None

        html = resp.text

        # Extract product containers
        # Pattern: <div class="pcontainer">...<div class="pprice">Rs.X.XX/-</div>
        #           ...<img alt="PRODUCT NAME">...<a href="/p/slug">
        containers = re.findall(
            r'<div class="pcontainer">(.*?)</div>\s*</div>',
            html, re.DOTALL
        )
        if not containers:
            return None

        # Score each container — prefer one whose alt/slug matches mpn
        mpn_up = mpn.upper()
        best_score, best = 999, None

        for block in containers:
            alt   = re.search(r'alt="([^"]+)"', block)
            price = re.search(r'Rs\.([\d.]+)/?-?', block)
            pcode = re.search(r'Product Code:\s*</span>(\w+)', block)
            if not price:
                continue
            name  = alt.group(1).strip() if alt else ""
            score = 0 if (mpn_up in name.upper()) else 2
            if score < best_score:
                best_score = score
                best = {
                    "name":  name,
                    "price": _to_float(price.group(1)),
                    "code":  pcode.group(1) if pcode else "",
                }

        if best_score != 0:
            return None
        if best and best["price"]:
            # Build product URL from search result links
            links = re.findall(r'href="(/p/[^"]+)"', html)
            product_url = (
                f"https://www.sunrom.com{links[0]}" if links else
                f"https://www.sunrom.com/search?q={mpn}"
            )
            return {
                "mpn":          mpn,
                "store":        "sunrom",
                "store_part":   best["code"],
                "description":  best["name"],
                "manufacturer": "",
                "stock":        "In Stock",
                "lead_time":    "1-3 days",
                "moq":          1,
                "price":        best["price"],
                "url":          product_url,
            }
    except Exception as exc:
        log.debug("Sunrom error for %s: %s", mpn, exc)
    return None


# ─── Ktron ────────────────────────────────────────────────────────────────────
def _get_ktron_price(mpn: str) -> Optional[dict]:
    """
    Search Ktron.in (WooCommerce) for mpn and return pricing.
    """
    try:
        url  = "https://www.ktron.in/"
        resp = _get_session().get(
            url, params={"s": mpn, "post_type": "product"},
            timeout=_TIMEOUT,
        )
        if resp.status_code != 200:
            return None

        html   = resp.text
        mpn_up = mpn.upper()

        # WooCommerce product list — look for product price and title
        # Pattern: <a href="URL" class="woocommerce-LoopProduct..."> ... price ... </a>
        product_blocks = re.findall(
            r'<div class="product-inner[^"]*">(.*?)</div>\s*</div>\s*</li>',
            html, re.DOTALL
        )

        if not product_blocks:
            # Alternate pattern
            product_blocks = re.findall(
                r'class="[^"]*product[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
                html, re.DOTALL
            )

        # Simpler: find all product URLs and prices from listing
        product_urls  = re.findall(
            r'href="(https://www\.ktron\.in/product/[^"]+)"', html
        )
        price_amounts = re.findall(
            r'<span class="woocommerce-Price-amount[^"]*"><bdi><span[^>]*>&#8377;</span>([\d,]+(?:\.\d+)?)</bdi></span>',
            html
        )
        product_titles = re.findall(
            r'<h2 class="[^"]*woocommerce-loop-product__title[^"]*">(.*?)</h2>',
            html, re.DOTALL
        )

        if not price_amounts or not product_urls:
            return None

        # Prefer title matching mpn
        best_idx = None
        for i, title in enumerate(product_titles):
            if mpn_up in title.upper():
                best_idx = i
                break
        if best_idx is None:
            return None

        price = _to_float(price_amounts[best_idx] if best_idx < len(price_amounts) else price_amounts[0])
        url   = product_urls[best_idx] if best_idx < len(product_urls) else product_urls[0]
        title = product_titles[best_idx].strip() if product_titles and best_idx < len(product_titles) else mpn

        if price:
            return {
                "mpn":          mpn,
                "store":        "ktron",
                "store_part":   "",
                "description":  title,
                "manufacturer": "",
                "stock":        "In Stock",
                "lead_time":    "2-4 days",
                "moq":          1,
                "price":        price,
                "url":          url,
            }
    except Exception as exc:
        log.debug("Ktron error for %s: %s", mpn, exc)
    return None


# ─── Public API ───────────────────────────────────────────────────────────────
def get_indian_best_price(mpn: str) -> Optional[dict]:
    """
    Query Sunrom and Ktron in parallel.
    Returns cheapest result with all_stores field.
    """
    fetchers = [
        ("sunrom", _get_sunrom_price),
        ("ktron",  _get_ktron_price),
    ]
    found: dict[str, dict] = {}

    with ThreadPoolExecutor(max_workers=len(fetchers)) as ex:
        futures = {ex.submit(fn, mpn): name for name, fn in fetchers}
        for future in as_completed(futures):
            name = futures[future]
            try:
                result = future.result()
                if result and result.get("price"):
                    found[name] = result
            except Exception as exc:
                log.debug("Indian store %s future error: %s", name, exc)

    if not found:
        log.debug("Indian stores: no result for %s", mpn)
        return None

    best_key = min(found, key=lambda k: found[k]["price"] or float("inf"))
    best = dict(found[best_key])
    best["all_stores"] = {
        k: {"price": v["price"], "url": v["url"], "stock": v.get("stock", "")}
        for k, v in found.items()
    }
    return best


# ─── CLI self-test ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import json
    logging.basicConfig(
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        level=logging.DEBUG,
    )
    test_parts = ["LM7805", "LM358", "BC547", "7805", "ESP32"]
    for p in test_parts:
        result = get_indian_best_price(p)
        print(f"\n{p}: {json.dumps(result, indent=2)}")
