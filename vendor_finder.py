"""
LLM-powered Indian vendor discovery for CDP and Mechanical BOM components.

Flow per component:
  1. Generate 2-3 smart search queries based on part name + type
  2. Bing web search → collect top result URLs + snippets
  3. Jina Reader to fetch actual page text from top vendor sites
  4. GPT-4o-mini to extract & validate structured vendor info from page content
  5. Return verified Indian vendors with contact details, products, location

Requires: OPENAI_API_KEY in .env (Anthropic fallback if set)
"""

from __future__ import annotations

import base64
import html
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any
from urllib.parse import unquote, urlparse

import requests
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# LLM helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_openai():
    key = os.getenv("OPENAI_API_KEY", "").strip().lstrip("=")
    if not key:
        return None
    try:
        from openai import OpenAI
        return OpenAI(api_key=key)
    except Exception:
        return None


def _get_anthropic():
    key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not key:
        return None
    try:
        import anthropic
        return anthropic.Anthropic(api_key=key)
    except Exception:
        return None


def _llm_call(prompt: str, system: str = "", max_tokens: int = 2000) -> str:
    """Call best available LLM; return text response."""
    client_oai = _get_openai()
    if client_oai:
        try:
            msgs = []
            if system:
                msgs.append({"role": "system", "content": system})
            msgs.append({"role": "user", "content": prompt})
            resp = client_oai.chat.completions.create(
                model="gpt-4o-mini",
                messages=msgs,
                temperature=0,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
            return resp.choices[0].message.content or ""
        except Exception as e:
            print(f"[vendor_finder] OpenAI error: {e}")

    client_ant = _get_anthropic()
    if client_ant:
        try:
            resp = client_ant.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=max_tokens,
                system=system or "You are a helpful assistant. Always respond with valid JSON.",
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.content[0].text or ""
        except Exception as e:
            print(f"[vendor_finder] Anthropic error: {e}")

    return ""


# ─────────────────────────────────────────────────────────────────────────────
# Web search helpers
# ─────────────────────────────────────────────────────────────────────────────

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def _decode_bing_u(value: str | None) -> str | None:
    if not value:
        return None
    value = unquote(str(value)).strip()
    if value.startswith("http"):
        return value
    if value.startswith("a1"):
        value = value[2:]
    try:
        padded = value + ("=" * (-len(value) % 4))
        decoded = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8", errors="ignore")
        return decoded if decoded.startswith("http") else None
    except Exception:
        return None


_SKIP_DOMAINS = {
    "youtube.com", "facebook.com", "twitter.com", "instagram.com",
    "linkedin.com", "maps.google", "wikipedia.org", "indiamart.com",
    "tradeindia.com", "exportersindia.com", "alibaba.com", "amazon.",
    "flipkart.com", "snapdeal.com", "naukri.com", "glassdoor.com",
}


def _ddg_search(query: str, num: int = 8) -> list[dict[str, str]]:
    """Search DuckDuckGo HTML endpoint — no API key, no CAPTCHA blocking."""
    try:
        resp = requests.post(
            "https://html.duckduckgo.com/html/",
            data={"q": query, "kl": "in-en"},   # kl=in-en → India region
            headers={
                "User-Agent": _UA,
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "text/html,application/xhtml+xml",
            },
            timeout=12,
            allow_redirects=True,
        )
        if resp.status_code >= 400:
            return []

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html.unescape(resp.text), "html.parser")
        results: list[dict[str, str]] = []
        seen: set[str] = set()

        for item in soup.select("div.result, .result__body"):
            a_tag = item.select_one("a.result__a, h2 a")
            snippet_tag = item.select_one("a.result__snippet, .result__snippet")
            if not a_tag:
                continue
            raw_href = str(a_tag.get("href", ""))
            # DDG wraps in redirect — extract uddg= param
            if "duckduckgo.com/l/" in raw_href or raw_href.startswith("//duckduckgo"):
                m = re.search(r"[?&]uddg=([^&]+)", raw_href)
                if m:
                    raw_href = unquote(m.group(1))
            if not raw_href.startswith("http"):
                continue
            url = raw_href.split("?")[0].rstrip("/")
            domain = urlparse(url).netloc.lower()
            if url in seen or any(skip in domain for skip in _SKIP_DOMAINS):
                continue
            seen.add(url)
            title = a_tag.get_text(" ", strip=True)
            snippet = snippet_tag.get_text(" ", strip=True) if snippet_tag else ""
            results.append({"title": title, "url": url, "snippet": snippet})
            if len(results) >= num:
                break
        return results
    except Exception as e:
        print(f"[vendor_finder] DDG search error: {e}")
        return []


def _google_cse_search(query: str, num: int = 8) -> list[dict[str, str]]:
    """Google Custom Search API fallback (needs GOOGLE_API_KEY + CSE_ID)."""
    api_key = os.getenv("GOOGLE_API_KEY", "").strip()
    cse_id = os.getenv("GOOGLE_CSE_ID", "").strip()
    if not api_key or not cse_id:
        return []
    try:
        resp = requests.get(
            "https://www.googleapis.com/customsearch/v1",
            params={"key": api_key, "cx": cse_id, "q": query,
                    "num": min(num, 10), "gl": "in", "hl": "en"},
            timeout=10,
        )
        data = resp.json()
        results = []
        for item in data.get("items", []):
            url = item.get("link", "").split("?")[0]
            domain = urlparse(url).netloc.lower()
            if not url or any(skip in domain for skip in _SKIP_DOMAINS):
                continue
            results.append({
                "title": item.get("title", ""),
                "url": url,
                "snippet": item.get("snippet", ""),
            })
        return results
    except Exception as e:
        print(f"[vendor_finder] Google CSE error: {e}")
        return []


def _web_search(query: str, num: int = 8) -> list[dict[str, str]]:
    """Try DDG → Google CSE fallback."""
    results = _ddg_search(query, num)
    if not results:
        results = _google_cse_search(query, num)
    return results


def _jina_fetch(url: str, timeout: int = 12) -> str:
    """Fetch page text via Jina Reader (bypasses Cloudflare/JS)."""
    try:
        resp = requests.get(
            f"https://r.jina.ai/{url}",
            headers={"User-Agent": _UA, "Accept": "text/plain,*/*"},
            timeout=timeout,
        )
        if resp.status_code >= 400:
            return ""
        text = resp.text or ""
        # Reject bot challenge pages
        if any(kw in text.lower() for kw in ("just a moment", "captcha", "enable javascript")):
            return ""
        return text[:6000]  # Keep reasonable size for LLM
    except Exception:
        return ""


# ─────────────────────────────────────────────────────────────────────────────
# Search query builder
# ─────────────────────────────────────────────────────────────────────────────

_MJF_KEYWORDS = ("mjf", "multi jet fusion", "multi-jet")
_RUBBER_KEYWORDS = ("rubber", "silicone", "molding", "moulding", "elastomer")
_3D_KEYWORDS = ("3d print", "additive", "sls ", "fdm ", "sla ")

_SCALE_HINTS = {
    "proto": {
        "qty_range": "1–50 pieces (prototype/R&D)",
        "vendor_type": "small shops, hobbyist-friendly, rapid prototyping services, local makers",
        "examples": "Think3D, Karkhana.io, local PCB fabs, university-linked workshops, freelance fabricators",
        "avoidance": "Do NOT suggest large OEM factories, mass-production plants, or companies with MOQ > 100 pcs",
    },
    "sample": {
        "qty_range": "50–500 pieces (pre-production samples / pilot batch)",
        "vendor_type": "mid-size manufacturers, distributors with flexible MOQ, regional suppliers",
        "examples": "regional electronics distributors, mid-size plastic molding shops, contract assemblers",
        "avoidance": "Avoid both tiny hobbyist shops (can't do 100+ pcs) and giant factories (minimum order too high)",
    },
    "production": {
        "qty_range": "500+ pieces (mass production / commercial volume)",
        "vendor_type": "large-scale OEM manufacturers, established factories, ISO-certified suppliers",
        "examples": "Exide, Tata, Amara Raja, large PCB/PCBA factories in Bangalore/Pune/Noida",
        "avoidance": "Avoid small hobby shops or one-off prototype services — need proper production capability",
    },
}


def _llm_suggest_vendors(
    part_name: str, description: str, item_type: str, scale: str = "sample"
) -> list[dict[str, str]]:
    """
    Ask LLM to suggest known Indian vendors/manufacturers for this component.
    Returns list of {vendor_name, website, what_they_do} based on training knowledge.
    scale: "proto" | "sample" | "production"
    """
    scale = scale.lower().strip() if scale else "sample"
    if scale not in _SCALE_HINTS:
        scale = "sample"
    sh = _SCALE_HINTS[scale]

    type_hint = (
        "mechanical fabrication / 3D printing / rubber/plastic manufacturing service"
        if item_type == "MECHANICAL"
        else "electronics component supplier / OEM manufacturer"
    )
    prompt = f"""
You are an expert in Indian manufacturing and electronics procurement.

I need to source: "{part_name}"
Description: "{description}"
Component type: {item_type} ({type_hint})
Procurement scale: {sh['qty_range']}

Target vendor profile: {sh['vendor_type']}
Examples of suitable vendor types: {sh['examples']}
IMPORTANT: {sh['avoidance']}

List the top 6 real, currently operating Indian companies that supply or manufacture this
at the scale of {sh['qty_range']}.

Respond with ONLY this JSON (no markdown):
{{
  "vendors": [
    {{
      "vendor_name": "Company Name",
      "website": "https://actual-domain.com",
      "location": "City, State",
      "what_they_do": "Brief description of their relevant product/service",
      "min_order": "Minimum order quantity they typically handle"
    }}
  ]
}}

Rules (STRICT):
- Only companies you are HIGHLY CONFIDENT actually exist and operate in India RIGHT NOW
- Only include if you know their exact, working website URL
- DO NOT invent company names or guess URLs — if unsure, omit
- Prefer companies that MATCH the scale requirement ({sh['qty_range']})
- Exclude foreign companies without an Indian subsidiary/office
- Include correct website URLs (not LinkedIn, Indiamart, Amazon profiles)
"""
    raw = _llm_call(prompt, system=_SYSTEM_PROMPT)
    if not raw:
        return []
    try:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        data = json.loads(m.group(0)) if m else json.loads(raw)
        vendors = data.get("vendors", [])
        return [v for v in vendors if v.get("vendor_name") and v.get("website")]
    except Exception:
        return []


def _build_queries(part_name: str, description: str, item_type: str) -> list[str]:
    """Generate 2-3 Bing search queries to find Indian vendors/manufacturers."""
    name_clean = part_name.strip()
    desc_low = (description or "").lower()
    queries: list[str] = []

    if item_type == "MECHANICAL":
        # Detect process from description
        if any(k in desc_low for k in _MJF_KEYWORDS):
            queries += [
                f"MJF Multi Jet Fusion 3D printing service India \"{name_clean}\"",
                "Multi Jet Fusion 3D printing manufacturer India HP MJF",
            ]
        elif any(k in desc_low for k in _RUBBER_KEYWORDS):
            queries += [
                f"rubber silicone molding manufacturer India \"{name_clean}\"",
                "custom rubber parts manufacturer India supplier",
            ]
        elif any(k in desc_low for k in _3D_KEYWORDS):
            queries += [
                f"3D printing service India \"{name_clean}\" manufacturer",
                "3D printing rapid prototyping service India",
            ]
        else:
            queries += [
                f"\"{name_clean}\" mechanical manufacturing service India",
                f"\"{name_clean}\" custom parts manufacturer India supplier",
            ]

    else:  # CDP or other custom parts
        # Identify component category from name
        name_low = name_clean.lower()
        if "lte" in name_low or "antenna" in name_low:
            queries += [
                f"LTE antenna manufacturer supplier India \"{name_clean}\"",
                "LTE 4G antenna supplier India electronics",
            ]
        elif "sim" in name_low:
            queries += [
                "SIM card supplier distributor India telecom",
                f"\"{name_clean}\" supplier India",
            ]
        elif "battery" in name_low and "connector" not in name_low:
            queries += [
                f"lithium battery supplier manufacturer India \"{name_clean}\"",
                "li-ion battery pack supplier India OEM",
            ]
        elif "charger" in name_low:
            queries += [
                f"charger manufacturer supplier India \"{name_clean}\"",
                "battery charger OEM manufacturer India electronics",
            ]
        elif "speaker" in name_low:
            queries += [
                f"speaker manufacturer supplier India \"{name_clean}\"",
                "speaker transducer OEM supplier India electronics",
            ]
        elif "connector" in name_low:
            queries += [
                f"\"{name_clean}\" connector supplier India",
                f"custom connector manufacturer India {description[:40]}",
            ]
        else:
            queries += [
                f"\"{name_clean}\" supplier manufacturer India",
                f"\"{name_clean}\" {description[:30]} India vendor buy",
            ]

    # Always add a broad fallback
    queries.append(f"\"{name_clean}\" India supplier vendor contact email")
    return queries[:3]


# ─────────────────────────────────────────────────────────────────────────────
# LLM extraction prompt
# ─────────────────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are an expert Indian procurement specialist.
Extract real Indian vendor/supplier/manufacturer details from web search results and page content.
Always respond with valid JSON only — no markdown, no explanation outside JSON.
"""

def _llm_extract_vendors(
    part_name: str,
    description: str,
    item_type: str,
    search_results: list[dict],
    page_texts: dict[str, str],
) -> list[dict[str, Any]]:
    """Use LLM to extract structured vendor info from search results."""

    # Build context block
    context_parts = []
    for i, r in enumerate(search_results[:12], 1):
        url = r.get("url", "")
        title = r.get("title", "")
        snippet = r.get("snippet", "")
        page_text = page_texts.get(url, "")[:1500]
        context_parts.append(
            f"[Result {i}]\n"
            f"Title: {title}\n"
            f"URL: {url}\n"
            f"Snippet: {snippet}\n"
            f"Page Content: {page_text if page_text else '(not fetched)'}\n"
        )

    context = "\n---\n".join(context_parts)

    prompt = f"""
Part to source: "{part_name}"
Description: "{description}"
Type: {item_type} ({"Custom Design Part – find Indian supplier/manufacturer" if item_type == "CDP" else "Mechanical Part – find Indian fabrication/manufacturing service"})

Web search results:
{context}

Task: Extract verified Indian vendors from the above results.

For each vendor, return:
{{
  "vendor_name": "Company Name",
  "website": "https://...",
  "email": "contact@... (or empty string)",
  "phone": "+91-... (or empty string)",
  "location": "City, State, India",
  "supplies": "What exactly they provide (e.g. MJF 3D printing, LTE antenna OEM, etc.)",
  "relevance": 0-100,
  "why_trusted": "One sentence why this vendor is reliable"
}}

Rules:
- Only Indian vendors/companies (India-based, .in domain or explicitly India location)
- Must actually supply the relevant product/service (check snippet + page content)
- Skip job sites, news articles, Wikipedia, Amazon, Flipkart, generic directories
- Skip if no clear connection to the requested part
- Minimum relevance 60 to include
- Return at most 5 vendors

Respond ONLY with this JSON:
{{"vendors": [ ...vendor objects... ]}}
"""

    raw = _llm_call(prompt, system=_SYSTEM_PROMPT)
    if not raw:
        return []
    try:
        # Extract JSON if wrapped in markdown
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            data = json.loads(m.group(0))
        else:
            data = json.loads(raw)
        vendors = data.get("vendors", [])
        # Ensure required fields
        result = []
        for v in vendors:
            if not v.get("vendor_name") or not v.get("website"):
                continue
            rel = int(v.get("relevance", 0))
            if rel < 60:
                continue
            result.append({
                "vendor_name": str(v.get("vendor_name", "")).strip(),
                "website": str(v.get("website", "")).strip(),
                "email": str(v.get("email", "")).strip(),
                "phone": str(v.get("phone", "")).strip(),
                "location": str(v.get("location", "India")).strip(),
                "supplies": str(v.get("supplies", "")).strip(),
                "relevance": rel,
                "why_trusted": str(v.get("why_trusted", "")).strip(),
            })
        return sorted(result, key=lambda x: x["relevance"], reverse=True)
    except Exception as e:
        print(f"[vendor_finder] JSON parse error: {e}\nRaw: {raw[:300]}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def find_indian_vendors(
    part_name: str,
    description: str = "",
    item_type: str = "CDP",
    scale: str = "sample",
) -> list[dict[str, Any]]:
    """
    Find verified Indian vendors for a CDP or Mechanical component.

    Pipeline:
      1. LLM suggests known Indian vendors (using training knowledge)
      2. Jina Reader fetches each vendor's actual website to extract contact info
      3. LLM validates relevance and extracts email/phone from page content
      4. Return only verified vendors (relevance >= 60)

    Args:
      scale: "proto" (1-50 pcs) | "sample" (50-500 pcs) | "production" (500+ pcs)

    Returns list of:
      {vendor_name, website, email, phone, location, supplies, relevance, why_trusted, scale}
    """
    part_name = (part_name or "").strip()
    description = (description or "").strip()
    scale = (scale or "sample").lower().strip()
    if not part_name:
        return []

    # ── Step 1: LLM suggests known Indian vendors ────────────────────────────
    suggested = _llm_suggest_vendors(part_name, description, item_type, scale)
    if not suggested:
        return []

    # ── Step 2: Fetch vendor websites via Jina to get contact info ───────────
    urls_to_fetch = []
    for v in suggested:
        site = str(v.get("website", "")).strip().rstrip("/")
        if site and site.startswith("http"):
            urls_to_fetch.append(site)
            # Also try /contact page
            urls_to_fetch.append(site.rstrip("/") + "/contact")

    page_texts: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=5) as ex:
        futures = {ex.submit(_jina_fetch, url): url for url in urls_to_fetch[:12]}
        for fut in as_completed(futures):
            url = futures[fut]
            text = fut.result()
            if text:
                page_texts[url] = text

    # ── Step 3: LLM validates each vendor and extracts contact details ────────
    verified: list[dict[str, Any]] = []
    for v in suggested:
        site = str(v.get("website", "")).strip().rstrip("/")
        # Combine home + contact page text
        page_text = (
            page_texts.get(site, "")
            + "\n"
            + page_texts.get(site + "/contact", "")
        )[:3000]

        sh = _SCALE_HINTS.get(scale, _SCALE_HINTS["sample"])
        has_page = bool(page_text.strip())
        prompt = f"""
Verify this Indian vendor for the component we need to source.

Component: "{part_name}" — {description}
Type: {item_type}
Procurement scale: {sh['qty_range']} ({scale})

Vendor suggested: {v.get("vendor_name")}
Website: {site}
What they do: {v.get("what_they_do", "")}

Website content:
{page_text if has_page else "(website could not be fetched — do NOT invent contact details)"}

Tasks:
1. Confirm this vendor is real and relevant for "{part_name}" at scale {scale} ({sh['qty_range']})
   PENALTY: If this is a mass-production factory being suggested for prototype scale (or vice versa),
   reduce relevance score by 30.
2. ONLY extract contact email/phone if visible in the website content above.
   If website was not fetched or content is empty, return empty strings for email and phone.
   DO NOT invent or guess contact details.
3. Assign relevance score 0-100

Respond with ONLY this JSON:
{{
  "is_relevant": true/false,
  "relevance": 0-100,
  "email": "only if found in page content above, else empty string",
  "phone": "only if found in page content above, else empty string",
  "location": "city, state if found on page, else use India",
  "supplies": "what exactly they provide for this component",
  "why_trusted": "one sentence"
}}
"""
        raw = _llm_call(prompt, system=_SYSTEM_PROMPT, max_tokens=600)
        if not raw:
            continue
        try:
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            info = json.loads(m.group(0)) if m else json.loads(raw)
        except Exception:
            continue

        if not info.get("is_relevant"):
            continue
        rel = int(info.get("relevance", 0))
        if rel < 60:
            continue

        verified.append({
            "vendor_name": v.get("vendor_name", ""),
            "website": site,
            "email": str(info.get("email", "")).strip(),
            "phone": str(info.get("phone", "")).strip(),
            "location": str(info.get("location") or v.get("location", "India")).strip(),
            "supplies": str(info.get("supplies", v.get("what_they_do", ""))).strip(),
            "relevance": rel,
            "why_trusted": str(info.get("why_trusted", "")).strip(),
            "min_order": str(v.get("min_order", "")).strip(),
            "scale": scale,
        })

    # ── Step 4: Verify websites are actually reachable ───────────────────────
    def _site_reachable(url: str) -> bool:
        try:
            r = requests.head(url, headers={"User-Agent": _UA}, timeout=6, allow_redirects=True)
            return r.status_code < 400
        except Exception:
            return False

    with ThreadPoolExecutor(max_workers=6) as ex:
        reach_futures = {ex.submit(_site_reachable, v["website"]): v for v in verified}
        for fut in as_completed(reach_futures):
            reach_futures[fut]["website_reachable"] = fut.result()

    # Only return vendors with working websites — unreachable = likely hallucinated
    live = [v for v in verified if v.get("website_reachable")]
    # If ALL are unreachable (network issue), fall back to all with a flag
    if not live and verified:
        for v in verified:
            v["website_reachable"] = None  # unknown
        live = verified

    return sorted(live, key=lambda x: x["relevance"], reverse=True)


def find_vendors_bulk(
    components: list[dict[str, Any]],
    max_workers: int = 4,
    scale: str = "sample",
) -> list[dict[str, Any]]:
    """
    Process multiple components in parallel.

    Input: [{part_name, description, item_type}, ...]
    Output: [{part_name, description, item_type, vendors: [...], scale}, ...]
    scale: "proto" | "sample" | "production"
    """
    def _process(comp: dict) -> dict:
        part_name = str(comp.get("part_name") or comp.get("Part Name") or "").strip()
        description = str(comp.get("Description") or comp.get("description") or "").strip()
        item_type = str(comp.get("item_type") or "CDP").strip().upper()
        comp_scale = str(comp.get("scale") or scale or "sample").lower()
        vendors = find_indian_vendors(part_name, description, item_type, comp_scale)
        return {
            "part_name": part_name,
            "description": description,
            "item_type": item_type,
            "scale": comp_scale,
            "vendors": vendors,
            "vendor_count": len(vendors),
        }

    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        results = list(ex.map(_process, components))
    return results
