"""
Shopping Search Fallback
=========================
Jab koi part Mouser / DigiKey / LCSC / existing scrapers se nahi milta,
tab yeh module kaam karta hai:

  1. Description se SIRF key specs extract karta hai:
       - Capacitor: value (100nF) + package (0402)         [voltage optional]
       - Resistor:  value (100R)  + package (0402)         [wattage optional]
       - IC / module: MPN ke pehle 6-8 characters

  2. Un specs se shopping-friendly query banata hai

  3. Seedha Indian stores pe search karta hai:
       - Sharvi Electronics  (WooCommerce, direct HTTP)
       - ElectronicsComp     (OpenCart, direct HTTP)
       - Evelta              (BigCommerce, direct HTTP)
       - Robu.in             (Jina Reader fallback)
       - Tenettech           (Jina Reader fallback)

  4. Results ko validate karta hai: title mein value AND package
     DONO match hone chahiye (loose matching, sirf key tokens)

Returns list[dict] — same format as vendor_pricing supplemental candidates.
"""

from __future__ import annotations

import json as _json
import logging
import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor, wait as _cf_wait
from typing import Optional
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup

# Load .env so GEMINI_API_KEY, GOOGLE_API_KEY etc. are available
# when this module is imported standalone (tests / CLI).
try:
    from dotenv import load_dotenv as _load_dotenv
    _load_dotenv()
except ImportError:
    pass

log = logging.getLogger(__name__)

_TIMEOUT = 1.8        # per-request timeout (seconds)
_JINA_TIMEOUT = 3.5   # Jina Reader timeout

# ─────────────────────────────────────────────────────────────────────────────
# Spec extractor
# ─────────────────────────────────────────────────────────────────────────────

def _pf(num: float, unit: str) -> float:
    return num * {"pf": 1, "nf": 1_000, "uf": 1_000_000, "mf": 1_000_000_000}.get(unit.lower(), 1)

def _norm_cap(num: float, unit: str) -> str:
    pf = _pf(num, unit)
    if pf >= 1_000_000:
        n, u = pf / 1_000_000, "uF"
    elif pf >= 1_000:
        n, u = pf / 1_000, "nF"
    else:
        n, u = pf, "pF"
    ns = str(int(n)) if n == int(n) else f"{n:.1f}".rstrip("0").rstrip(".")
    return f"{ns}{u}"


def extract_search_specs(description: str, mpn: str = "") -> dict:
    """
    Return a dict with:
      component_type, query (primary), query_short (fallback), tokens_must_match
    """
    desc = str(description or "")
    # Excel/Windows sometimes turns micro into '?' during encoding conversion:
    # "0.1 ?F" should still be treated as "0.1uF".
    desc = re.sub(r"(?<=\d)\s*\?f\b", "uF", desc, flags=re.I)
    desc = (
        desc.replace("µ", "u")
        .replace("μ", "u")
        .replace("Âµ", "u")
        .replace("Î¼", "u")
        .replace("Ω", "ohm")
        .replace("Ω", "ohm")
        .replace("Î©", "ohm")
        .replace("±", "+/-")
        .replace("Â±", "+/-")
    )
    low  = desc.lower()
    mpn  = str(mpn or "").strip()

    # ── Package ──────────────────────────────────────────────────────────────
    pkg_m = re.search(r"\b(0201|0402|0603|0805|1206|1210|1812|2010|2512)\b", low)
    pkg = pkg_m.group(1) if pkg_m else ""

    mpn_core = re.split(r"\s+", mpn)[0] if mpn else ""

    # ── CAPACITOR ────────────────────────────────────────────────────────────
    cap_m = re.search(r"\b(\d+(?:\.\d+)?)\s*(pf|nf|uf|mf)\b", low, re.I)
    is_cap = cap_m or bool(re.search(r"\b(capacitor|mlcc|ceramic cap|electrolytic|tant)\b", low))

    if is_cap and cap_m:
        val = _norm_cap(float(cap_m.group(1)), cap_m.group(2))
        volt_m = re.search(r"\b(\d+(?:\.\d+)?)\s*v\b", low)
        volt = f"{volt_m.group(1)}V" if volt_m else ""

        # Primary: value + package + type
        cap_type = (
            "electrolytic capacitor" if re.search(r"electrolytic|alum", low)
            else "tantalum capacitor" if re.search(r"tant", low)
            else "ceramic capacitor"
        )
        query       = f"{val} {pkg} {cap_type}".strip()
        query_short = f"{val} {pkg} capacitor".strip() if pkg else f"{val} capacitor"

        # Tokens that MUST appear in matched product title
        must = {val.lower()}
        if pkg: must.add(pkg)

        return {
            "component_type": "capacitor",
            "query": query,
            "query_short": query_short,
            "tokens_must_match": must,
            "value": val,
            "package": pkg,
            "voltage": volt,
        }

    # ── RESISTOR ─────────────────────────────────────────────────────────────
    res_m = re.search(r"\b(\d+(?:\.\d+)?)\s*(k\s*ohm|kohm|mohm|ohm|[kKrR])\b", desc)
    is_res = res_m or bool(re.search(r"\bresistor\b", low))

    if is_res and res_m:
        num = float(res_m.group(1))
        raw_unit = res_m.group(2).lower().replace(" ", "")
        if raw_unit in ("kohm", "k"):
            val = f"{int(num) if num == int(num) else num}k"
            val_alt = f"{int(num) if num == int(num) else num}kohm"
        elif raw_unit in ("mohm",) and res_m.group(2)[0].islower():
            val = f"{int(num) if num == int(num) else num}mR"
            val_alt = val
        elif raw_unit in ("ohm", "r"):
            val = f"{int(num) if num == int(num) else num}R"
            val_alt = f"{int(num) if num == int(num) else num}ohm"
        else:
            val = f"{int(num) if num == int(num) else num}R"
            val_alt = val

        watt_m = re.search(r"\b(\d+(?:/\d+)?(?:\.\d+)?)\s*w(?:att)?\b", low)
        watt = watt_m.group(0).replace(" ", "") if watt_m else ""

        query       = f"{val} {pkg} resistor".strip()
        query_short = f"{val} {pkg}".strip() if pkg else f"{val} resistor"

        must = {val.lower().replace("r", "").lstrip("0") or val.lower()}
        if pkg: must.add(pkg)

        return {
            "component_type": "resistor",
            "query": query,
            "query_short": query_short,
            "tokens_must_match": must,
            "value": val,
            "value_alt": val_alt,
            "package": pkg,
            "wattage": watt,
        }

    # ── INDUCTOR ─────────────────────────────────────────────────────────────
    ind_m = re.search(r"\b(\d+(?:\.\d+)?)\s*(uh|mh|nh)\b", low, re.I)
    if ind_m:
        num = float(ind_m.group(1))
        u_map = {"uh": "uH", "mh": "mH", "nh": "nH"}
        val = f"{int(num) if num == int(num) else num}{u_map.get(ind_m.group(2).lower(), ind_m.group(2))}"
        comp_type = "ferrite bead" if re.search(r"ferrite|bead", low) else "inductor"
        query       = f"{val} {pkg} {comp_type}".strip()
        query_short = f"{val} {comp_type}".strip()
        must = {val.lower()}
        if pkg: must.add(pkg)
        return {
            "component_type": comp_type.replace(" ", "_"),
            "query": query, "query_short": query_short,
            "tokens_must_match": must, "value": val, "package": pkg,
        }

    # â”€â”€ CONNECTORS / HEADERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if re.search(r"\b(connector|header|berg|burg|stick|sim|usb|socket)\b", low):
        pin_m = re.search(r"\b(\d+)\s*(?:pin|p)\b", low, re.I) or re.search(r"\b(\d+)p\b", mpn, re.I)
        if not pin_m:
            pin_m = re.search(r"2541(\d)", mpn, re.I) or re.search(r"[-_](\d{2})p\b", mpn, re.I)
        pins = f"{int(pin_m.group(1))} pin" if pin_m else ""
        pitch = "2.54mm" if re.search(r"254|2\.54|berg|burg|jumper", f"{low} {mpn.lower()}") else ""
        if "sim" in low:
            base_query = f"{pins} sim card connector".strip()
        elif "usb" in low:
            base_query = "usb connector"
        elif "burg" in low or "berg" in low or "stick" in low:
            base_query = f"{pins} {pitch} berg strip header".strip()
        else:
            base_query = f"{pins} {pitch} header connector".strip()
        queries = [q for q in [mpn, mpn_core, base_query] if q]
        must = {
            token for token in re.findall(r"[a-z0-9]+", base_query.lower())
            if token not in {"card", "connector", "pin", "2", "4", "54mm", "254mm"}
        }
        return {
            "component_type": "connector",
            "query": queries[0],
            "query_short": queries[1] if len(queries) > 1 else base_query,
            "tokens_must_match": must or {mpn_core.lower()[:4]},
            "value": mpn or base_query,
            "package": pins,
            "extra_queries": queries[2:],
        }

    # â”€â”€ DISCRETES / LED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if re.search(r"\b(mosfet|transistor|bjt|p-channel|n-channel|led)\b", low):
        if "mosfet" in low:
            base_query = re.sub(r"\s+", " ", f"{mpn_core or mpn} mosfet sot-23").strip()
        elif "transistor" in low or "bjt" in low:
            base_query = re.sub(r"\s+", " ", f"{mpn_core or mpn} transistor sot-23").strip()
        else:
            base_query = re.sub(r"\s+", " ", f"{mpn_core or mpn} led").strip()
        return {
            "component_type": "discrete",
            "query": mpn or base_query,
            "query_short": base_query,
            "tokens_must_match": {mpn_core.lower()[:4]} if mpn_core else set(re.findall(r"[a-z0-9]+", base_query.lower())),
            "value": mpn or base_query,
            "package": pkg,
            "extra_queries": [base_query],
        }

    # ── IC / MODULE — use first 6–8 chars of MPN ────────────────────────────
    if mpn:
        short = mpn[:8] if len(mpn) > 8 else mpn
        query = f"{short} IC"
        must: set[str] = {short.lower()[:4]}
        return {
            "component_type": "ic",
            "query": mpn,
            "query_short": query,
            "tokens_must_match": must,
            "value": mpn,
            "package": pkg,
        }

    return {}   # cannot extract specs → skip


# ─────────────────────────────────────────────────────────────────────────────
# Title validator — does this result title match the spec?
# ─────────────────────────────────────────────────────────────────────────────

def _title_matches(title: str, specs: dict) -> bool:
    """Return True if product title contains all tokens_must_match."""
    must   = specs.get("tokens_must_match", set())
    lower  = title.lower().replace("-", "").replace("/", "")
    tokens = re.findall(r"[a-z0-9]+", lower)
    joined = " ".join(tokens)

    if specs.get("component_type") == "connector" and specs.get("package"):
        pin_m = re.search(r"\b(\d+)\s*pin\b", str(specs.get("package", "")).lower())
        if pin_m:
            pins = int(pin_m.group(1))
            pin_patterns = [
                rf"\b{pins}\s*pin\b",
                rf"\b{pins}p\b",
                rf"\b1x{pins}\b",
                rf"\b{pins}x1\b",
            ]
            title_l = title.lower()
            breakaway_header = pins <= 4 and re.search(r"\b(berg|break\s*away|breakaway|40\s*pin|1x40)\b", title_l)
            if not any(re.search(pat, title_l) for pat in pin_patterns) and not breakaway_header:
                return False

    for req in must:
        req_clean = req.lower().replace("-", "").replace("/", "")
        if req_clean.isdigit():
            if req_clean not in tokens:
                return False
            continue
        # Direct substring OR token-level match
        if req_clean not in joined and not any(req_clean in t for t in tokens):
            # Try alternate forms for resistors: "100r" ↔ "100 ohm" ↔ "100r resistor"
            alt = specs.get("value_alt", "")
            if alt and alt.lower().replace("-", "") in joined:
                continue
            return False
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Price parser
# ─────────────────────────────────────────────────────────────────────────────

def _parse_inr(text: str) -> Optional[float]:
    if not text:
        return None
    cleaned = re.sub(r"(\d),(\d{3})\b", r"\1\2", str(text))
    for pat in [r"(?:₹|Rs\.?|INR)\s*([\d]+(?:\.\d+)?)", r"\b([\d]+(?:\.\d+)?)\b"]:
        m = re.search(pat, cleaned, re.I)
        if m:
            try:
                v = float(m.group(1))
                if 0.01 < v < 500_000:   # sanity range
                    return v
            except ValueError:
                pass
    return None


def _first_price_from_soup(soup: BeautifulSoup) -> Optional[float]:
    for selector in (
        ".price--withoutTax",
        "[data-product-price-without-tax]",
        ".price--withTax",
        "[data-product-price-with-tax]",
        ".price",
    ):
        for node in soup.select(selector):
            price = _parse_inr(node.get_text(" ", strip=True))
            if price:
                return price
    return None


# ─────────────────────────────────────────────────────────────────────────────
# HTTP helpers
# ─────────────────────────────────────────────────────────────────────────────

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
}


def _get(url: str, timeout: int = _TIMEOUT) -> Optional[str]:
    """Simple GET — returns HTML text or None."""
    try:
        r = requests.get(url, headers=_BROWSER_HEADERS, timeout=timeout)
        return r.text if r.status_code < 400 else None
    except Exception:
        return None


def _jina_get(url: str) -> Optional[str]:
    """Render URL via Jina Reader — returns markdown text or None."""
    import os
    jina_key = os.getenv("JINA_API_KEY") or ""
    jh = {"User-Agent": "Mozilla/5.0", "Accept": "text/plain"}
    if jina_key:
        jh["Authorization"] = f"Bearer {jina_key}"
    try:
        r = requests.get(f"https://r.jina.ai/{url}", headers=jh, timeout=_JINA_TIMEOUT)
        if r.status_code == 429:
            log.debug("Jina rate-limited for %s", url)
            return None
        return r.text if r.status_code < 400 else None
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Store-specific scrapers (minimal, fast)
# ─────────────────────────────────────────────────────────────────────────────

def _woocommerce_search(base_url: str, vendor_name: str, query: str, specs: dict) -> list[dict]:
    """
    Search a WooCommerce store and return matching results.
    Works for Sharvi Electronics (and similar WooCommerce stores).
    """
    search_url = f"{base_url}/?s={quote_plus(query)}&post_type=product"
    html = _get(search_url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    results = []

    # WooCommerce product links
    for anchor in soup.select("a.woocommerce-LoopProduct-link, a[href*='/product/']"):
        href = anchor.get("href", "")
        if not href or "cart" in href or "account" in href:
            continue

        # Get title from anchor text or nearby h2
        title_el = anchor.find(["h2", "h3"]) or anchor
        title = title_el.get_text(" ", strip=True)

        # Skip empty or navigation links
        if not title or len(title) < 4:
            continue

        if not _title_matches(title, specs):
            continue

        # Get price from nearby price element
        product_li = anchor.find_parent("li")
        price_text = ""
        if product_li:
            price_el = product_li.select_one(".price .woocommerce-Price-amount, .price .amount")
            if price_el:
                price_text = price_el.get_text(strip=True)

        price = _parse_inr(price_text)
        if not price:
            # Fetch product page for price
            page_html = _get(href)
            if page_html:
                page_soup = BeautifulSoup(page_html, "html.parser")
                price_el = page_soup.select_one(
                    ".summary .price .woocommerce-Price-amount, .woocommerce-Price-amount"
                )
                if price_el:
                    price = _parse_inr(price_el.get_text(strip=True))

        if price:
            results.append({
                "vendor_name": vendor_name,
                "product_title": title,
                "unit_price": price,
                "currency": "INR",
                "product_url": href,
                "stock": "In Stock",
                "match_confidence": 72,
                "source_type": "shopping_search",
                "search_query": query,
                "price_breaks": [{"qty": 1, "price": price}],
                "moq": 1,
            })
            if len(results) >= 2:
                break

    return results


def _opencart_search(base_url: str, vendor_name: str, query: str, specs: dict) -> list[dict]:
    """Search an OpenCart store (ElectronicsComp, Ktron, Probots)."""
    search_url = (
        f"{base_url}/index.php"
        f"?route=product/search&search={quote_plus(query)}&description=true&sub_category=true"
    )
    html = _get(search_url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    results = []

    for anchor in soup.select(".product-thumb .caption h4 a, .product-thumb h4 a, a[href*='product_id']"):
        href = anchor.get("href", "")
        title = anchor.get_text(" ", strip=True)
        if not title or not href or not _title_matches(title, specs):
            continue

        product_li = anchor.find_parent(["div", "li"])
        price_el = product_li.select_one(".price-new, .price") if product_li else None
        price = _parse_inr(price_el.get_text(strip=True) if price_el else "")

        if price:
            results.append({
                "vendor_name": vendor_name,
                "product_title": title,
                "unit_price": price,
                "currency": "INR",
                "product_url": href,
                "stock": "In Stock",
                "match_confidence": 84 if re.sub(r"[^a-z0-9]", "", query.lower()) in re.sub(r"[^a-z0-9]", "", title.lower()) else 70,
                "source_type": "shopping_search",
                "search_query": query,
                "price_breaks": [{"qty": 1, "price": price}],
                "moq": 1,
            })
            if len(results) >= 2:
                break

    return results


def _bigcommerce_search(base_url: str, vendor_name: str, query: str, specs: dict) -> list[dict]:
    """Search a BigCommerce store (Evelta)."""
    search_url = f"{base_url}/search.php?search_query={quote_plus(query)}&section=product"
    html = _get(search_url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    results = []

    for anchor in soup.select("h4.card-title a, a.card-title, a[href*='/products/']"):
        href = anchor.get("href", "")
        if not href.startswith("http"):
            href = base_url + href
        title = anchor.get_text(" ", strip=True)
        if not title or not _title_matches(title, specs):
            continue

        price_el = anchor.find_parent(["article", "li", "div"])
        if price_el:
            price = _first_price_from_soup(price_el)
        else:
            price = None
        if not price:
            page_html = _get(href)
            if page_html:
                page_soup = BeautifulSoup(page_html, "html.parser")
                price = _first_price_from_soup(page_soup)

        if price:
            results.append({
                "vendor_name": vendor_name,
                "product_title": title,
                "unit_price": price,
                "currency": "INR",
                "product_url": href,
                "stock": "In Stock",
                "match_confidence": 84 if re.sub(r"[^a-z0-9]", "", query.lower()) in re.sub(r"[^a-z0-9]", "", title.lower()) else 70,
                "source_type": "shopping_search",
                "search_query": query,
                "price_breaks": [{"qty": 1, "price": price}],
                "moq": 1,
            })
            if len(results) >= 2:
                break

    return results


def _jina_search(store_search_url: str, vendor_name: str, query: str, specs: dict) -> list[dict]:
    """
    Jina Reader fallback for JS-rendered stores (Robu, Tenettech).
    Renders the search page, extracts product links → renders each link → extracts price.
    """
    domain_m = re.search(r"https?://(?:www\.)?([^/]+)", store_search_url)
    domain = domain_m.group(1) if domain_m else ""

    text = _jina_get(store_search_url)
    if not text:
        return []

    # Extract product URLs from Jina markdown
    product_links: list[str] = []
    for m in re.finditer(r"\]\((https?://[^)\s]+)\)", text, re.I):
        url = m.group(1).split("?")[0].rstrip(").,")
        if domain in url and ("product" in url.lower()) and url not in product_links:
            product_links.append(url)
    for m in re.finditer(r"https?://[^\s\"'<>)]+", text, re.I):
        url = m.group(0).split("?")[0].rstrip(").,")
        if domain in url and ("product" in url.lower()) and url not in product_links:
            product_links.append(url)

    results = []
    for product_url in product_links[:3]:
        detail = _jina_get(product_url)
        if not detail:
            continue

        # Title from Jina header
        title_m = re.search(r"^#\s+(.+)$", detail, re.M)
        if not title_m:
            continue
        title = title_m.group(1).strip()

        if not _title_matches(title, specs):
            continue

        # Price from Jina text — INR
        price = None
        for pat in [r"(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)"]:
            m2 = re.search(pat, detail, re.I)
            if m2:
                price = _parse_inr(m2.group(1))
                if price: break

        if price:
            results.append({
                "vendor_name": vendor_name,
                "product_title": title,
                "unit_price": price,
                "currency": "INR",
                "product_url": product_url,
                "stock": "In Stock",
                "match_confidence": 68,
                "source_type": "shopping_jina",
                "search_query": query,
                "price_breaks": [{"qty": 1, "price": price}],
                "moq": 1,
            })
            if len(results) >= 2:
                break

    return results


# ─────────────────────────────────────────────────────────────────────────────
# Store registry  (direct HTTP stores — no JS rendering needed)
# ─────────────────────────────────────────────────────────────────────────────

_STORES = [
    # (type, base_url, vendor_name)
    ("bigcommerce",  "https://evelta.com",                 "Evelta"),
    ("opencart",     "https://www.electronicscomp.com",    "ElectronicsComp"),
    ("woocommerce",  "https://sharvielectronics.com",      "Sharvi"),
    ("opencart",     "https://www.ktron.in",               "Ktron"),
    ("opencart",     "https://www.probots.co.in",          "Probots"),
    ("opencart",     "https://robokits.co.in",             "Robokits"),
    ("opencart",     "https://www.flyrobo.in",             "Flyrobo"),
    ("woocommerce",  "https://quartzcomponents.com",       "QuartzComponents"),
    ("sunrom",       "https://www.sunrom.com",             "Sunrom"),
    # Jina-based (JS-rendered)
    ("jina_woo",     "https://robu.in",                    "Robu"),
    ("jina_shopify", "https://www.tenettech.com",          "Tenettech"),
]

_JINA_SEARCH_TEMPLATES = {
    "jina_woo":     "https://robu.in/?s={query}&post_type=product",
    "jina_shopify": "https://www.tenettech.com/search?q={query}",
}


# ─────────────────────────────────────────────────────────────────────────────
# Sunrom scraper  (custom HTML store)
# ─────────────────────────────────────────────────────────────────────────────

def _sunrom_search(base_url: str, vendor_name: str, query: str, specs: dict) -> list[dict]:
    """Search Sunrom Electronics (custom store with keyword search)."""
    search_url = f"{base_url}/search?keyword={quote_plus(query)}"
    html = _get(search_url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    results = []
    # Sunrom uses product cards with class "product-item" or similar
    for anchor in soup.select("a[href*='/product/'], .product-name a, h4 a, h3 a"):
        href = anchor.get("href", "")
        if not href.startswith("http"):
            href = base_url + href
        title = anchor.get_text(" ", strip=True)
        if not title or len(title) < 4:
            continue
        if not _title_matches(title, specs):
            continue
        parent = anchor.find_parent(["div", "li", "article"])
        price = None
        if parent:
            price_el = parent.select_one(".price, .product-price, span[class*='price']")
            if price_el:
                price = _parse_inr(price_el.get_text(strip=True))
        if not price:
            page_html = _get(href)
            if page_html:
                page_soup = BeautifulSoup(page_html, "html.parser")
                for sel in (".price", "#product-price", ".product-price", "span[itemprop='price']"):
                    el = page_soup.select_one(sel)
                    if el:
                        price = _parse_inr(el.get_text(strip=True))
                        if price:
                            break
        if price:
            results.append({
                "vendor_name": vendor_name,
                "product_title": title,
                "unit_price": price,
                "currency": "INR",
                "product_url": href,
                "stock": "In Stock",
                "match_confidence": 72,
                "source_type": "shopping_search",
                "search_query": query,
                "price_breaks": [{"qty": 1, "price": price}],
                "moq": 1,
            })
            if len(results) >= 2:
                break
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Google Shopping via Jina Reader
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# Amazon.in scraper — excellent coverage, HTML-accessible
# ─────────────────────────────────────────────────────────────────────────────

def _amazon_search(query: str, specs: dict) -> list[dict]:
    """Search Amazon India — covers most electronics components."""
    _amazon_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-IN,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    try:
        url = f"https://www.amazon.in/s?k={quote_plus(query)}&i=electronics"
        resp = requests.get(url, headers=_amazon_headers, timeout=5)
        if resp.status_code != 200:
            return []
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception:
        return []

    results = []
    for item in soup.select("[data-component-type='s-search-result']")[:6]:
        # Title
        title_el = item.select_one("h2 a span, h2 span.a-text-normal")
        if not title_el:
            continue
        title = title_el.get_text(" ", strip=True)
        if len(title) < 5:
            continue

        # Price — Amazon uses separate whole + fraction
        price = None
        whole = item.select_one(".a-price-whole")
        if whole:
            frac_el = item.select_one(".a-price-fraction")
            frac = frac_el.get_text(strip=True) if frac_el else "0"
            try:
                price = float(whole.get_text(strip=True).replace(",", "").rstrip(".")) + float(f"0.{frac}")
            except ValueError:
                pass
        if not price:
            price_el = item.select_one(".a-offscreen, .a-price")
            if price_el:
                price = _parse_inr(price_el.get_text(strip=True))
        if not price or price < 0.5:
            continue

        # URL
        link_el = item.select_one("h2 a[href]")
        href = ""
        if link_el:
            href = link_el.get("href", "")
            if href and not href.startswith("http"):
                href = "https://www.amazon.in" + href

        # Validate — for passives require spec match; for ICs be looser
        if specs.get("component_type") in ("capacitor", "resistor", "inductor"):
            if not _title_matches(title, specs):
                continue
        else:
            # For ICs / connectors: query term must appear in title
            q_short = re.sub(r"[^a-z0-9]", "", query[:8].lower())
            if q_short and len(q_short) >= 4 and q_short not in re.sub(r"[^a-z0-9]", "", title.lower()):
                continue

        results.append({
            "vendor_name": "Amazon.in",
            "product_title": title[:120],
            "unit_price": price,
            "currency": "INR",
            "product_url": href,
            "stock": "In Stock",
            "match_confidence": 72,
            "source_type": "amazon_search",
            "search_query": query,
            "price_breaks": [{"qty": 1, "price": price}],
            "moq": 1,
        })
        if len(results) >= 2:
            break

    if results:
        log.info("amazon_search: found %d for %r", len(results), query)
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Gemini API price search — ULTIMATE FALLBACK
# Uses Gemini (Google AI) to find prices using its training data +
# real-time Google Search grounding. Works for ANY component type.
# ─────────────────────────────────────────────────────────────────────────────

def _gemini_price_search(mpn: str, description: str) -> list[dict]:
    """
    Gemini AI price lookup with Google Search grounding (real-time web).
    Falls back to training-data-only if grounding fails.
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return []

    query_part = mpn or description[:80]
    prompt = (
        f"Find the current retail price in Indian Rupees (INR) for this electronic component.\n"
        f"MPN: {mpn or 'N/A'}\n"
        f"Description: {description[:120] if description else 'N/A'}\n\n"
        f"Search Indian electronics stores: robu.in, evelta.com, electronicscomp.com, "
        f"sharvielectronics.com, ktron.in, amazon.in, flipkart.com.\n\n"
        f"Reply ONLY with this JSON (no markdown):\n"
        f'{{ "price_inr": <number or null>, "store": "<store>", "confidence": "high|medium|low", "title": "<title>" }}'
    )

    for use_grounding in (True, False):
        try:
            payload: dict = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.0, "maxOutputTokens": 300},
            }
            if use_grounding:
                payload["tools"] = [{"google_search": {}}]

            resp = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}",
                json=payload,
                timeout=14 if use_grounding else 8,
            )
            if resp.status_code != 200:
                log.debug("gemini_price (grounding=%s): status=%s", use_grounding, resp.status_code)
                continue

            raw = resp.json()
            text = (raw.get("candidates", [{}])[0]
                       .get("content", {})
                       .get("parts", [{}])[0]
                       .get("text", "")).strip()

            # Strip code fences
            if text.startswith("```"):
                text = re.sub(r"^```[a-z]*\n?", "", text)
                text = re.sub(r"\n?```$", "", text)
                text = text.strip()

            # Extract JSON block from potentially mixed grounding response
            m = re.search(r'\{[^{}]*"price_inr"[^{}]*\}', text, re.DOTALL)
            if m:
                text = m.group(0)

            try:
                data = _json.loads(text)
            except _json.JSONDecodeError:
                # Try to extract INR price from natural language fallback
                pm = re.search(r'[₹]?\s*([\d,]+(?:\.\d+)?)\s*(?:INR|rupees?)?', text, re.I)
                if pm:
                    price = _parse_inr(pm.group(1))
                    if price and price > 0.5:
                        log.info("gemini_price (text-extract, grounding=%s): ₹%.2f for %s", use_grounding, price, query_part[:30])
                        return [{"vendor_name": "AI Search", "product_title": query_part[:120],
                                 "unit_price": price, "currency": "INR", "product_url": "",
                                 "stock": "Verify availability", "match_confidence": 55,
                                 "source_type": "gemini_search", "search_query": query_part,
                                 "price_breaks": [{"qty": 1, "price": price}], "moq": 1}]
                continue

            price = data.get("price_inr")
            if not price or float(str(price or 0)) < 0.5:
                continue

            conf_map = {"high": 72, "medium": 60, "low": 48}
            conf = conf_map.get(str(data.get("confidence", "medium")).lower(), 60)

            label = "gemini+search" if use_grounding else "gemini·AI"
            log.info("%s: ₹%.2f for %s", label, float(price), mpn or description[:30])
            return [{
                "vendor_name": str(data.get("store") or label)[:30],
                "product_title": str(data.get("title") or query_part)[:120],
                "unit_price": float(price),
                "currency": "INR",
                "product_url": "",
                "stock": "Verify availability",
                "match_confidence": conf,
                "source_type": "gemini_search",
                "search_query": query_part,
                "price_breaks": [{"qty": 1, "price": float(price)}],
                "moq": 1,
            }]
        except Exception as exc:
            log.debug("gemini_price (grounding=%s) error: %s", use_grounding, exc)

    return []


# ─────────────────────────────────────────────────────────────────────────────
# Google Custom Search Engine — site-restricted price lookup
# ─────────────────────────────────────────────────────────────────────────────

def _google_cse_search(query: str, vendor_name: str, site: str) -> list[dict]:
    """
    Google Custom Search API restricted to a specific vendor site.
    Needs GOOGLE_API_KEY + GOOGLE_CSE_ID env vars.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    cse_id  = os.getenv("GOOGLE_CSE_ID")
    if not api_key or not cse_id:
        return []
    try:
        resp = requests.get(
            "https://www.googleapis.com/customsearch/v1",
            params={"key": api_key, "cx": cse_id, "q": f"site:{site} {query}", "num": 5},
            timeout=5,
        )
        if resp.status_code != 200:
            log.debug("google_cse: status=%s vendor=%s", resp.status_code, vendor_name)
            return []
        items = resp.json().get("items", [])
    except Exception as exc:
        log.debug("google_cse: %s", exc)
        return []

    results = []
    for item in items:
        title = item.get("title", "")
        link  = item.get("link", "")
        snippet = item.get("snippet", "")
        price = None
        for pat in [r"[₹]\s*([\d,]+(?:\.\d+)?)", r"Rs\.?\s*([\d,]+(?:\.\d+)?)", r"INR\s*([\d,]+(?:\.\d+)?)"]:
            m = re.search(pat, snippet, re.I)
            if m:
                price = _parse_inr(m.group(1))
                if price:
                    break
        if not price:
            offer = ((item.get("pagemap") or {}).get("offer") or [{}])[0]
            price = _parse_inr(str(offer.get("price") or offer.get("lowprice") or ""))
        if not price or price < 1:
            continue
        results.append({
            "vendor_name": vendor_name,
            "product_title": title[:120],
            "unit_price": price,
            "currency": "INR",
            "product_url": link,
            "stock": "Check availability",
            "match_confidence": 65,
            "source_type": "google_cse",
            "search_query": query,
            "price_breaks": [{"qty": 1, "price": price}],
            "moq": 1,
        })
        if len(results) >= 2:
            break
    if results:
        log.info("google_cse: %s found %d for %r", vendor_name, len(results), query)
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Store dispatch helper
# ─────────────────────────────────────────────────────────────────────────────

def _dispatch_scraper(store_type: str, base_url: str, vendor_name: str, query: str, specs: dict) -> list[dict]:
    try:
        if store_type == "woocommerce": return _woocommerce_search(base_url, vendor_name, query, specs)
        if store_type == "opencart":    return _opencart_search(base_url, vendor_name, query, specs)
        if store_type == "bigcommerce": return _bigcommerce_search(base_url, vendor_name, query, specs)
        if store_type == "sunrom":      return _sunrom_search(base_url, vendor_name, query, specs)
    except Exception as exc:
        log.debug("_dispatch_scraper %s: %s", vendor_name, exc)
    return []


# ─────────────────────────────────────────────────────────────────────────────
# Public API — fully parallel architecture
# ─────────────────────────────────────────────────────────────────────────────

def shopping_fallback_search(
    mpn: str,
    description: str,
    manufacturer: str = "",
    max_results: int = 5,
    include_jina: bool = False,
) -> list[dict]:
    """
    Parallel multi-source price search.

    All direct stores fire simultaneously (not sequentially).
    Total wall-clock time: ~2s for stores, then Gemini AI if stores found nothing.

    Sources (all concurrent):
      - 11 Indian stores: Evelta, ElectronicsComp, Sharvi, Ktron, Probots,
        Robokits, Flyrobo, QuartzComponents, Sunrom + Robu/Tenettech (Jina)
      - Gemini AI + Google Search grounding (runs in background, used if stores silent)
      - Amazon.in (HTML, no auth)
      - Google CSE (when GOOGLE_CSE_ID set)
    """
    specs = extract_search_specs(description, mpn)
    if not specs:
        if mpn:
            specs = {
                "component_type": "ic",
                "query": mpn,
                "query_short": mpn[:8] if len(mpn) > 8 else mpn,
                "tokens_must_match": {mpn[:4].lower()},
                "value": mpn,
                "package": "",
            }
        else:
            log.debug("shopping_fallback: cannot extract specs from %r / %r", description, mpn)
            return []

    queries = [specs["query"]]
    if specs.get("query_short") and specs["query_short"] != specs["query"]:
        queries.append(specs["query_short"])
    for extra in specs.get("extra_queries") or []:
        if extra and extra not in queries:
            queries.append(extra)
    if mpn and mpn not in queries and mpn[:8] not in queries:
        queries.insert(0, mpn)

    log.info("shopping_fallback [parallel]: mpn=%r type=%s queries=%s",
             mpn, specs.get("component_type"), queries[:3])

    primary_query = queries[0]

    # ── Submit ALL store scrapers in parallel ────────────────────────────────
    ex = ThreadPoolExecutor(max_workers=8)
    store_futs: dict = {}
    submitted: set[str] = set()

    for query in queries[:2]:
        for stype, base_url, vendor_name in _STORES:
            if vendor_name in submitted:
                continue
            if stype in ("jina_woo", "jina_shopify"):
                if not include_jina:
                    continue
                jurl = _JINA_SEARCH_TEMPLATES[stype].format(query=quote_plus(query))
                store_futs[ex.submit(_jina_search, jurl, vendor_name, query, specs)] = vendor_name
            else:
                store_futs[ex.submit(_dispatch_scraper, stype, base_url, vendor_name, query, specs)] = vendor_name
            submitted.add(vendor_name)

    # ── Gemini starts immediately in parallel ────────────────────────────────
    gemini_fut = None
    if mpn or description:
        gemini_fut = ex.submit(_gemini_price_search, mpn, description)

    # ── Collect store results (max 3s — they all run concurrently) ───────────
    all_results: list[dict] = []
    found_vendors: set[str] = set()
    _lock = threading.Lock()

    done_futs, _ = _cf_wait(list(store_futs.keys()), timeout=3.0)
    for fut in done_futs:
        vname = store_futs[fut]
        try:
            hits = fut.result(timeout=0)
            if hits:
                with _lock:
                    if vname not in found_vendors:
                        all_results.extend(hits)
                        found_vendors.add(vname)
                        log.info("shopping [parallel] %s: +%d for %r", vname, len(hits), primary_query)
        except Exception:
            pass

    # ── Amazon.in if stores found nothing ────────────────────────────────────
    if not all_results:
        try:
            hits = _amazon_search(primary_query, specs)
            if hits:
                all_results.extend(hits)
                log.info("shopping [Amazon]: +%d for %r", len(hits), primary_query)
        except Exception:
            pass

    # ── Google CSE (LCSC / Robu / Evelta) ────────────────────────────────────
    if len(all_results) < max_results:
        for cse_vname, cse_site in [("lcsc", "lcsc.com"), ("Robu", "robu.in"), ("Evelta", "evelta.com")]:
            if cse_vname in found_vendors:
                continue
            try:
                hits = _google_cse_search(primary_query, cse_vname, cse_site)
                if hits:
                    all_results.extend(hits)
                    found_vendors.add(cse_vname)
            except Exception:
                pass

    # ── Gemini: wait up to 12s if stores found nothing ───────────────────────
    if not all_results and gemini_fut is not None:
        try:
            hits = gemini_fut.result(timeout=12) or []
            if hits:
                all_results.extend(hits)
                log.info("shopping [Gemini]: +%d for %r", len(hits), mpn or description[:30])
        except Exception as exc:
            log.debug("shopping gemini wait: %s", exc)

    ex.shutdown(wait=False)

    all_results.sort(key=lambda r: (-(r.get("match_confidence") or 0), r.get("unit_price") or 999_999))
    return all_results[:max_results]


# ─────────────────────────────────────────────────────────────────────────────
# Google Shopping — broad CSE search, returns single best result dict
# ─────────────────────────────────────────────────────────────────────────────

def get_google_shopping_results(mpn: str, description: str = "") -> dict | None:
    """Return the best-priced Google Shopping result for an MPN.

    Uses the existing Google CSE key+ID without site restriction.
    Returns a vendor-dict compatible with the pricing pipeline, or None.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    cse_id  = os.getenv("GOOGLE_CSE_ID")
    if not api_key or not cse_id:
        return None
    query = f"{mpn} buy electronics India price"
    try:
        resp = requests.get(
            "https://www.googleapis.com/customsearch/v1",
            params={"key": api_key, "cx": cse_id, "q": query, "num": 5},
            timeout=5,
        )
        if resp.status_code != 200:
            return None
        items = resp.json().get("items", [])
    except Exception as exc:
        log.debug("google_shopping: %s", exc)
        return None

    for item in items:
        snippet = item.get("snippet", "")
        title   = item.get("title", "")
        link    = item.get("link", "")
        price: float | None = None
        for pat in [r"[₹]\s*([\d,]+(?:\.\d+)?)", r"Rs\.?\s*([\d,]+(?:\.\d+)?)", r"INR\s*([\d,]+(?:\.\d+)?)"]:
            m = re.search(pat, snippet + " " + title, re.I)
            if m:
                price = _parse_inr(m.group(1))
                if price and price > 0:
                    break
        if not price:
            offer = ((item.get("pagemap") or {}).get("offer") or [{}])[0]
            price = _parse_inr(str(offer.get("price") or offer.get("lowprice") or ""))
        if price and price > 0:
            return {
                "price":         price,
                "base_price":    price,
                "description":   title[:120],
                "stock":         "Check availability",
                "lead_time":     "N/A",
                "moq":           1,
                "price_breaks":  [{"qty": 1, "price": price}],
                "url":           link,
                "product_title": title[:120],
                "match_confidence": 55,
                "source_type":   "google_shopping",
            }
    return None


# ─────────────────────────────────────────────────────────────────────────────
# CLI self-test
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        level=logging.INFO,
    )

    tests = [
        ("GRM033R61A104KE15D", "100nF 0402 X5R 10V MLCC Murata ceramic capacitor"),
        ("RC0603FR-07100RL",   "100R 0603 1% 0.1W thin film resistor"),
        ("CC0402KRX7R9BB104",  "100nF 0402 50V X7R ceramic capacitor"),
    ]
    for mpn, desc in tests:
        print(f"\n{'='*60}")
        print(f"MPN: {mpn}  |  Desc: {desc}")
        specs = extract_search_specs(desc, mpn)
        print(f"Extracted specs: {specs}")
        results = shopping_fallback_search(mpn, desc)
        if results:
            for r in results:
                print(f"  ✅ {r['vendor_name']}: Rs.{r['unit_price']} — {r['product_title'][:60]}")
        else:
            print("  ❌ No results found")
