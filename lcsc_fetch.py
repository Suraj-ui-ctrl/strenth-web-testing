"""
LCSC Electronics Price Fetcher
================================
Fetches real-time pricing and stock from LCSC.

Strategy (tried in order):
  1. wmsc.lcsc.com search API  (fast JSON; may 404 by region/time)
  2. Jina Reader + product-detail page (JS-render fallback)

Prices are in USD; converted to landed INR using LCSC_USD_TO_INR and LCSC_LANDED_MULTIPLIER env vars.

Optional env vars:
    LCSC_USD_TO_INR  — exchange rate (default: 83.5)
    JINA_API_KEY     — Jina API key for higher rate limits
"""

from __future__ import annotations

import logging
import os
import re
import html
import threading
from typing import Optional
from urllib.parse import parse_qs, quote_plus, unquote, urlparse, urlsplit

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

load_dotenv()

log = logging.getLogger(__name__)

_USD_TO_INR  = float(os.getenv("LCSC_USD_TO_INR", "83.5"))
_LANDED_MULTIPLIER = float(os.getenv("LCSC_LANDED_MULTIPLIER", "1.5"))
_JINA_API_KEY = os.getenv("JINA_API_KEY") or ""

# Two candidate API endpoints (tried in order)
_SEARCH_URLS = [
    "https://wmsc.lcsc.com/ftps/wanna/search/global",
    "https://wmsc.lcsc.com/ftps/wanna/search",
]
_TIMEOUT = 8

_session: Optional[requests.Session] = None
_session_lock = threading.Lock()


def _get_session() -> requests.Session:
    global _session
    with _session_lock:
        if _session is None:
            s = requests.Session()
            retry = Retry(
                total=1,
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
            s.headers.update({
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                "Referer": "https://www.lcsc.com/",
                "Origin":  "https://www.lcsc.com",
                "Accept":  "application/json, text/plain, */*",
            })
            _session = s
    return _session


def _to_float(val: object) -> Optional[float]:
    try:
        return float(str(val).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _lcsc_landed_inr(price_usd: float) -> float:
    """Convert raw LCSC USD unit price to internal landed INR price."""
    return round(price_usd * _USD_TO_INR * _LANDED_MULTIPLIER, 4)


# ─── JSON API path ────────────────────────────────────────────────────────────

def _parse_api_response(body: dict) -> Optional[dict]:
    """Extract product info from LCSC wmsc JSON response body."""
    if body.get("code") not in (0, 200, None):
        return None
    result = body.get("result") or body.get("data") or {}
    if isinstance(result, list):
        products = result
    else:
        products = (
            result.get("productList")
            or result.get("dataList")
            or result.get("products")
            or []
        )
    return {"products": products} if products else None


def _fetch_api(mpn: str) -> Optional[list]:
    """Try each wmsc search URL in turn; return product list or None."""
    params = {
        "keyword":       mpn,
        "currentPage":   1,
        "pageSize":      10,
        "paramLanguage": "en",
    }
    session = _get_session()
    for url in _SEARCH_URLS:
        try:
            resp = session.get(url, params=params, timeout=_TIMEOUT)
            if resp.status_code >= 400:
                continue
            body = resp.json()
            parsed = _parse_api_response(body)
            if parsed:
                return parsed["products"]
        except Exception as exc:
            log.debug("LCSC API %s error: %s", url, exc)
    return None


# ─── Jina Reader fallback ─────────────────────────────────────────────────────

_JINA_CACHE: dict[str, Optional[dict]] = {}
_JINA_LOCK = threading.Lock()


def _jina_get(url: str, timeout: float = 15) -> requests.Response:
    headers: dict[str, str] = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/plain, text/markdown, */*",
    }
    if _JINA_API_KEY:
        headers["Authorization"] = f"Bearer {_JINA_API_KEY}"
    return requests.get(f"https://r.jina.ai/{url}", headers=headers, timeout=timeout)


def _jina_price_usd(text: str) -> Optional[float]:
    """Extract the smallest-quantity (first tier) USD unit price from Jina-rendered LCSC page.

    Handles both:
      - Markdown tables:  | 100+ | $ 0.002 | ...
      - Inline text:      USD 0.002  /  $0.002
    """
    # Markdown table rows: | qty+ | $ price |
    # Match "$ 0.002" or "$0.002" with optional spaces
    table_m = re.search(r"\|\s*\d+\+?\s*\|\s*\$\s*([\d,]+\.[\d]+)", text)
    if table_m:
        return _to_float(table_m.group(1))
    # Generic patterns
    for pat in [r"\$\s*([\d,]+\.[\d]+)", r"USD\s*([\d,]+\.[\d]+)"]:
        m = re.search(pat, text, re.I)
        if m:
            val = _to_float(m.group(1))
            # Skip "$399" free-shipping banner — prices above $10 for a passive are wrong
            if val and val < 50:
                return val
    return None


def _jina_price_breaks(text: str) -> list[dict]:
    """Extract all price break tiers from Jina-rendered LCSC markdown table."""
    breaks: list[dict] = []
    # Pattern: | 100+ | $ 0.002 | ...
    for m in re.finditer(r"\|\s*(\d[\d,]*)\+?\s*\|\s*\$\s*([\d,]+\.[\d]+)", text):
        try:
            qty   = int(m.group(1).replace(",", ""))
            price = _to_float(m.group(2))
            if price:
                breaks.append({"qty": qty, "price": _lcsc_landed_inr(price)})
        except (ValueError, TypeError):
            pass
    return breaks


def _jina_stock(text: str) -> str:
    # "1,043,300 In stock" or "In stock" or "In-Stock: 1,043,300"
    m = re.search(r"(In-?[Ss]tock[:\s]+([\d,]+)|[\d,]+\s+[Ii]n\s+stock|In\s+stock|Out\s+of\s+stock|Available|Unavailable)", text, re.I)
    return m.group(0).strip() if m else "N/A"


def _extract_bing_urls(text: str) -> list[str]:
    urls: list[str] = []

    def add(value: str | None) -> None:
        if not value:
            return
        value = html.unescape(str(value)).strip()
        if value.startswith("/"):
            value = "https://www.bing.com" + value
        if "bing.com/ck/a" in value:
            parsed = urlsplit(value)
            for encoded in parse_qs(parsed.query).get("u", []):
                decoded = unquote(encoded)
                if decoded.startswith("a1"):
                    import base64
                    try:
                        payload = decoded[2:]
                        padded = payload + ("=" * (-len(payload) % 4))
                        decoded = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8", "ignore")
                    except Exception:
                        decoded = ""
                if decoded.startswith("http") and decoded not in urls:
                    urls.append(decoded)
            return
        if value.startswith("http") and value not in urls:
            urls.append(value)

    for href in re.findall(r'href=["\']([^"\']+)["\']', text, flags=re.I):
        add(href)
    for match in re.findall(r"https?://[^\"'<>\s]+", text):
        add(match.rstrip(").,"))
    return urls


def _discover_lcsc_product_url(mpn: str) -> Optional[str]:
    try:
        resp = requests.get(
            "https://www.bing.com/search",
            params={"q": f"site:lcsc.com/product-detail {mpn}"},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=5,
        )
        if resp.status_code >= 400:
            return None
        for candidate in _extract_bing_urls(resp.text):
            parsed = urlparse(candidate)
            if parsed.netloc.lower().replace("www.", "") != "lcsc.com":
                continue
            if "/product-detail/" not in parsed.path:
                continue
            return candidate.split("?")[0].split("#")[0]
    except Exception as exc:
        log.debug("LCSC URL discovery failed for %s: %s", mpn, exc)
    return None


def _fetch_direct_product_page(mpn: str, product_url: str) -> Optional[dict]:
    try:
        resp = _get_session().get(product_url, headers={"Accept": "text/html,*/*"}, timeout=_TIMEOUT)
        if resp.status_code >= 400:
            return None
        text = resp.text
        if mpn.upper() not in text.upper():
            return None

        price_breaks: list[dict] = []
        row_re = re.compile(
            r"<tr[^>]*>.*?<td[^>]*>.*?<span[^>]*>([\d,]+)\+?</span>.*?</td>.*?"
            r"<span[^>]*class=\"price--text[^\"]*\"[^>]*>\s*\$\s*([\d.]+)\s*</span>",
            re.I | re.S,
        )
        for qty_text, price_text in row_re.findall(text):
            try:
                qty = int(qty_text.replace(",", ""))
                price = _to_float(price_text)
                if qty > 0 and price:
                    price_breaks.append({"qty": qty, "price": _lcsc_landed_inr(price)})
            except Exception:
                continue
        if not price_breaks:
            return None

        price_breaks = sorted(price_breaks, key=lambda item: item["qty"])
        title_m = re.search(r"<title>(.*?)</title>", text, re.I | re.S)
        title = re.sub(r"\s+", " ", title_m.group(1)).strip() if title_m else mpn
        stock_m = re.search(r"In-Stock:\s*([\d,]+)", text, re.I)
        moq_m = re.search(r"<td[^>]*>\s*Minimum\s*</td>\s*<td[^>]*>\s*(\d+)\s*</td>", text, re.I | re.S)
        code_m = re.search(r"\b(C\d{5,8})\b", product_url) or re.search(r"\b(C\d{5,8})\b", text)
        mfr_m = re.search(r"Manufacturer\s*</td>\s*<td[^>]*>\s*([^<]+)", text, re.I | re.S)
        return {
            "source": "direct_html",
            "mpn": mpn,
            "lcsc_part": code_m.group(1) if code_m else "",
            "description": title,
            "manufacturer": re.sub(r"\s+", " ", mfr_m.group(1)).strip() if mfr_m else "",
            "stock": stock_m.group(1) if stock_m else "N/A",
            "lead_time": "N/A",
            "moq": int(moq_m.group(1)) if moq_m else price_breaks[0]["qty"],
            "price": price_breaks[0]["price"],
            "price_breaks": price_breaks,
            "url": product_url,
            "datasheet_url": "",
        }
    except Exception as exc:
        log.debug("LCSC direct page failed for %s: %s", mpn, exc)
    return None


def _fetch_via_jina(mpn: str) -> Optional[dict]:
    """
    Fallback: use Jina Reader to render the LCSC product detail page.

    LCSC product detail URLs follow the pattern:
      https://www.lcsc.com/product-detail/Description_Brand_MPN_CODE.html
    We discover the URL by rendering the search page via Jina and extracting
    the first product-detail href.
    """
    with _JINA_LOCK:
        if mpn in _JINA_CACHE:
            return _JINA_CACHE[mpn]

    result = _do_jina_fetch(mpn)
    with _JINA_LOCK:
        _JINA_CACHE[mpn] = result
    return result


def _do_jina_fetch(mpn: str) -> Optional[dict]:
    search_url = f"https://www.lcsc.com/search?q={quote_plus(mpn)}&lang=en"
    try:
        resp = _jina_get(search_url, timeout=15)
        if resp.status_code >= 400:
            log.debug("LCSC Jina search %s returned %s", mpn, resp.status_code)
            return None
        text = resp.text or ""

        # Extract product-detail URL from Jina markdown
        product_url: Optional[str] = None
        for m in re.finditer(
            r"\]\((https?://(?:www\.)?lcsc\.com/product-detail/[^)\s]+)\)", text, re.I
        ):
            product_url = m.group(1).split("?")[0].rstrip(").,")
            break
        if not product_url:
            for m in re.finditer(
                r"https?://(?:www\.)?lcsc\.com/product-detail/[^\s\"'<>)]+", text, re.I
            ):
                product_url = m.group(0).split("?")[0].rstrip(").,")
                break

        # Extract LCSC part code (C\d+) from any text
        code_m = re.search(r"\b(C\d{5,8})\b", text)
        part_code = code_m.group(1) if code_m else ""

        if not product_url and not part_code:
            log.debug("LCSC Jina: no product URL found for %s", mpn)
            return None

        # If we have a code but no URL, construct the detail URL
        if not product_url and part_code:
            product_url = f"https://www.lcsc.com/product-detail/{part_code}.html"

        # Fetch the product detail page via Jina
        det_resp = _jina_get(product_url, timeout=15)
        if det_resp.status_code >= 400:
            return None
        detail = det_resp.text or ""

        # Validate: MPN must appear on the page
        if mpn.upper() not in detail.upper():
            log.debug("LCSC Jina: MPN %s not found on detail page %s", mpn, product_url)
            return None

        price_usd = _jina_price_usd(detail)
        if not price_usd:
            log.debug("LCSC Jina: no price found on detail page for %s", mpn)
            return None

        price_inr  = _lcsc_landed_inr(price_usd)
        price_breaks = _jina_price_breaks(detail) or [{"qty": 1, "price": price_inr}]
        moq = price_breaks[0]["qty"] if price_breaks else 1
        stock_text = _jina_stock(detail)

        # Extract LCSC part code from detail URL or page
        code_in_url = re.search(r"_(C\d{5,8})\.html", product_url)
        if not code_in_url:
            code_in_url = re.search(r"/(C\d{5,8})\.html", product_url)
        final_code = (code_in_url.group(1) if code_in_url else part_code) or ""

        # Try to extract manufacturer / title from Jina header
        title_m = re.search(r"^#\s+([^\n]+)", detail, re.M)
        title = title_m.group(1).strip() if title_m else mpn
        # Extract manufacturer from "MPN | Brand | Price" title pattern
        mfr_title_m = re.search(r"(?:^|#)\s*" + re.escape(mpn) + r"\s*\|\s*([^|#\n]+?)\s*\|", detail, re.I | re.M)
        if mfr_title_m:
            mfr = mfr_title_m.group(1).strip()
        else:
            mfr_m = re.search(
                r"\b(muRata|Murata|TDK|Yageo|Samsung Electro|Vishay|NXP|ON Semi|STMicro"
                r"|Texas Instruments|Panasonic|Nichicon|AVX|Kemet|Bourns|ROHM|Infineon|Microchip)\b",
                detail, re.I
            )
            mfr = mfr_m.group(0) if mfr_m else ""

        return {
            "source": "jina",
            "mpn": mpn,
            "lcsc_part": final_code,
            "description": title,
            "manufacturer": mfr,
            "stock": stock_text,
            "lead_time": "N/A",
            "moq": moq,
            "price": price_inr,
            "price_breaks": price_breaks,
            "url": product_url,
            "datasheet_url": "",
        }

    except Exception as exc:
        log.debug("LCSC Jina error for %s: %s", mpn, exc)
        return None


# ─── Public entry point ───────────────────────────────────────────────────────

def get_lcsc_price(mpn: str) -> Optional[dict]:
    """
    Return pricing and stock for *mpn* from LCSC Electronics.
    Prices are converted from USD to INR.

    Returns dict with keys:
        mpn, lcsc_part, description, manufacturer,
        stock, lead_time, moq, price, price_breaks, url
    None if not found or error.
    """
    # ── Strategy 1: JSON API ─────────────────────────────────────────────────
    products = _fetch_api(mpn)
    if products is not None:
        # Prefer exact productModel or productCode match
        exact = [
            p for p in products
            if str(p.get("productModel", "")).upper() == mpn.upper()
            or str(p.get("productCode",  "")).upper() == mpn.upper()
        ]
        if not exact:
            log.debug("LCSC API: no exact match for %s in %d results", mpn, len(products))
        else:
            part = exact[0]
            price_list = part.get("priceList") or []
            price_usd: Optional[float] = None
            moq: int = 1
            if price_list:
                tier0 = price_list[0]
                price_usd = (
                    _to_float(tier0.get("productPrice"))
                    or _to_float(tier0.get("currencyPrice"))
                    or _to_float(tier0.get("price"))
                )
                try:
                    moq = int(
                        tier0.get("ladder")
                        or tier0.get("quantity")
                        or part.get("minBuyNumber")
                        or 1
                    )
                except (TypeError, ValueError):
                    moq = 1
            if price_usd is None:
                log.debug("LCSC API: no price for %s", mpn)
            else:
                price_inr = _lcsc_landed_inr(price_usd)
                normalized_breaks = []
                for tier in price_list:
                    tp = (
                        _to_float(tier.get("productPrice"))
                        or _to_float(tier.get("currencyPrice"))
                        or _to_float(tier.get("price"))
                    )
                    if not tp:
                        continue
                    try:
                        tq = int(tier.get("ladder") or tier.get("quantity") or 1)
                    except (TypeError, ValueError):
                        tq = 1
                    normalized_breaks.append({"qty": tq, "price": _lcsc_landed_inr(tp)})

                part_code   = str(part.get("productCode") or "").strip()
                stock_count = part.get("stockNumber") or part.get("stockCount") or 0
                return {
                    "mpn":          mpn,
                    "lcsc_part":    part_code,
                    "description":  (
                        part.get("productIntroEn") or part.get("productModel") or ""
                    ),
                    "manufacturer": (
                        part.get("brandNameEn") or part.get("productBrandEn") or ""
                    ),
                    "stock":     str(stock_count),
                    "lead_time": "N/A",
                    "moq":       moq,
                    "price":     price_inr,
                    "price_breaks": normalized_breaks,
                    "url": (
                        f"https://www.lcsc.com/product-detail/{part_code}.html"
                        if part_code
                        else f"https://www.lcsc.com/search?q={mpn}"
                    ),
                }

    # ── Strategy 2: Jina Reader fallback ────────────────────────────────────
    log.debug("LCSC API unavailable for %s, trying Jina fallback", mpn)
    jina_result = _fetch_via_jina(mpn)
    if jina_result:
        return jina_result

    direct_url = _discover_lcsc_product_url(mpn)
    if direct_url:
        direct_result = _fetch_direct_product_page(mpn, direct_url)
        if direct_result:
            return direct_result

    log.debug("LCSC: no product found for %s", mpn)
    return None


# ─── CLI self-test ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import json
    logging.basicConfig(
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        level=logging.DEBUG,
    )
    test_parts = ["CC0603KRX7R9BB104", "GRM033R61A104KE15D", "74HCT1G08GW", "GD25Q64CSIG", "LM358"]
    for p in test_parts:
        result = get_lcsc_price(p)
        print(f"{p}: {json.dumps(result, indent=2) if result else 'Not found'}")
