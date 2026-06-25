"""
Component EOL / Lifecycle Status Fetcher
==========================================
Fetches End-of-Life, NRND, Obsolete and lifecycle data for components.

Sources (in priority order):
  1. Mouser API  — LifecycleStatus, SuggestedReplacement, ROHSStatus
  2. DigiKey API — ProductStatus field
  3. OpenAI GPT  — Comprehensive EOL intelligence from training data
                   (PCN announcements, known EOL dates, successors)

Environment variables required:
  MOUSER_API_KEY  — Mouser developer key
  OPENAI_API_KEY  — OpenAI key (for fallback intelligence)

Optional:
  DIGIKEY_CLIENT_ID, DIGIKEY_CLIENT_SECRET — DigiKey OAuth2
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Optional

import requests
from dotenv import load_dotenv
from openai import OpenAI
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

load_dotenv()

log = logging.getLogger(__name__)

MOUSER_API_KEY = os.getenv("MOUSER_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
DK_CLIENT_ID   = os.getenv("DIGIKEY_CLIENT_ID", "")
DK_CLIENT_SEC  = os.getenv("DIGIKEY_CLIENT_SECRET", "")

_TIMEOUT = 10

# ─── Status normaliser ────────────────────────────────────────────────────────
# Maps raw API strings → standard lifecycle labels
_STATUS_MAP = {
    "active":                     "Active",
    "obsolete":                   "Obsolete",
    "discontinued":               "Discontinued",
    "eol":                        "EOL",
    "end of life":                "EOL",
    "not recommended for new designs": "NRND",
    "nrnd":                       "NRND",
    "last time buy":              "Last Time Buy",
    "ltb":                        "Last Time Buy",
    "new product":                "Active",
    "new":                        "Active",
    "production":                 "Active",
    "in production":              "Active",
    "mature":                     "Mature",
    "preview":                    "Preview",
}

_STATUS_RISK = {
    "Active":         "low",
    "Mature":         "medium",
    "Preview":        "low",
    "NRND":           "high",
    "Last Time Buy":  "critical",
    "EOL":            "critical",
    "Obsolete":       "critical",
    "Discontinued":   "critical",
    "Unknown":        "unknown",
}

_STATUS_COLOR = {
    "low":      "green",
    "medium":   "blue",
    "high":     "orange",
    "critical": "red",
    "unknown":  "muted",
}


def _normalise_status(raw: str) -> str:
    if not raw:
        return "Unknown"
    return _STATUS_MAP.get(raw.strip().lower(), raw.strip().title())


# ─── Shared HTTP session ──────────────────────────────────────────────────────
_session: Optional[requests.Session] = None
_session_lock = threading.Lock()


def _get_session() -> requests.Session:
    global _session
    with _session_lock:
        if _session is None:
            s = requests.Session()
            retry = Retry(total=2, backoff_factor=0.3,
                          status_forcelist=[429, 500, 502, 503, 504])
            s.mount("https://", HTTPAdapter(max_retries=retry,
                                             pool_connections=10,
                                             pool_maxsize=10))
            _session = s
    return _session


# ─── OpenAI client ───────────────────────────────────────────────────────────
_oai_client = None
_oai_lock   = threading.Lock()


def _get_oai() -> Optional[OpenAI]:
    global _oai_client
    with _oai_lock:
        if _oai_client is None and OPENAI_API_KEY:
            _oai_client = OpenAI(api_key=OPENAI_API_KEY)
    return _oai_client


# ─── In-memory cache ─────────────────────────────────────────────────────────
_eol_cache: dict[str, dict] = {}
_cache_lock = threading.Lock()


def _cached(mpn: str) -> Optional[dict]:
    with _cache_lock:
        return _eol_cache.get(mpn.upper())


def _store(mpn: str, data: dict) -> dict:
    with _cache_lock:
        _eol_cache[mpn.upper()] = data
    return data


# ─── Source 1: Mouser ────────────────────────────────────────────────────────
def _mouser_lifecycle(mpn: str) -> Optional[dict]:
    if not MOUSER_API_KEY:
        return None
    try:
        resp = _get_session().post(
            "https://api.mouser.com/api/v1/search/partnumber",
            params={"apiKey": MOUSER_API_KEY},
            json={"SearchByPartRequest": {
                "mouserPartNumber": mpn,
                "partSearchOptions": "string",
            }},
            headers={"Content-Type": "application/json"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        parts = resp.json().get("SearchResults", {}).get("Parts", [])
        if not parts:
            return None

        part   = parts[0]
        status = _normalise_status(part.get("LifecycleStatus") or "")
        rohs   = part.get("ROHSStatus", "")
        replacement = str(part.get("SuggestedReplacement") or "").strip()
        stock  = str(part.get("Availability") or "")
        lead   = str(part.get("LeadTime") or "")

        # If Mouser has no lifecycle status, infer from stock
        if status == "Unknown":
            stock_lower = stock.lower()
            if "obsolete" in stock_lower or "0" in stock_lower.split()[0:1]:
                status = "Unknown"   # Don't guess

        if status == "Unknown" and not replacement:
            return None   # No useful data, fall through to AI

        return {
            "status":      status,
            "risk":        _STATUS_RISK.get(status, "unknown"),
            "color":       _STATUS_COLOR.get(_STATUS_RISK.get(status, "unknown"), "muted"),
            "replacement": replacement,
            "rohs":        rohs,
            "eol_date":    "",
            "note":        f"Mouser: stock={stock}, lead_time={lead}",
            "source":      "Mouser",
        }
    except Exception as exc:
        log.debug("Mouser lifecycle error for %s: %s", mpn, exc)
        return None


# ─── Source 2: DigiKey ────────────────────────────────────────────────────────
_dk_token:    Optional[str] = None
_dk_token_ts: float         = 0
_dk_lock      = threading.Lock()


def _get_dk_token() -> Optional[str]:
    global _dk_token, _dk_token_ts
    if not DK_CLIENT_ID or not DK_CLIENT_SEC:
        return None
    with _dk_lock:
        if _dk_token and (time.time() - _dk_token_ts) < 3000:
            return _dk_token
        try:
            resp = _get_session().post(
                "https://api.digikey.com/v1/oauth2/token",
                data={
                    "client_id":     DK_CLIENT_ID,
                    "client_secret": DK_CLIENT_SEC,
                    "grant_type":    "client_credentials",
                },
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
            _dk_token    = resp.json().get("access_token")
            _dk_token_ts = time.time()
            return _dk_token
        except Exception as exc:
            log.debug("DigiKey token error: %s", exc)
            return None


def _digikey_lifecycle(mpn: str) -> Optional[dict]:
    token = _get_dk_token()
    if not token:
        return None
    try:
        resp = _get_session().post(
            "https://api.digikey.com/products/v4/search/keyword",
            headers={
                "Authorization": f"Bearer {token}",
                "X-DIGIKEY-Client-Id": DK_CLIENT_ID,
                "Content-Type": "application/json",
            },
            json={"keywords": mpn, "limit": 1},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        products = resp.json().get("Products", [])
        if not products:
            return None

        p       = products[0]
        status  = _normalise_status(
            p.get("ProductStatus")
            or p.get("ManufacturerProductNumber")
            or ""
        )
        rohs    = "RoHS Compliant" if p.get("RoHSStatus") else ""
        replacement = str(p.get("ReplacementProduct", {}).get("DigiKeyPartNumber", "") or "")

        if status == "Unknown":
            return None

        return {
            "status":      status,
            "risk":        _STATUS_RISK.get(status, "unknown"),
            "color":       _STATUS_COLOR.get(_STATUS_RISK.get(status, "unknown"), "muted"),
            "replacement": replacement,
            "rohs":        rohs,
            "eol_date":    "",
            "note":        "",
            "source":      "DigiKey",
        }
    except Exception as exc:
        log.debug("DigiKey lifecycle error for %s: %s", mpn, exc)
        return None


# ─── Source 3: Gemini lifecycle intelligence ─────────────────────────────────
def _gemini_lifecycle_bulk(components: list[dict]) -> dict[str, dict]:
    """
    Use Google Gemini to fetch lifecycle/EOL status.
    Called before OpenAI — faster and cost-effective.
    """
    if not GEMINI_API_KEY or not components:
        return {}
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-1.5-flash")

        lines = "\n".join([
            f'{i+1}. MPN={c["mpn"]} | Mfr={c.get("manufacturer","?")} | Desc={str(c.get("description",""))[:60]}'
            for i, c in enumerate(components)
        ])
        prompt = f"""You are a senior electronics procurement engineer.
For each component below, provide lifecycle status from your knowledge.

Components:
{lines}

Return ONLY valid JSON:
{{
  "results": [
    {{
      "mpn": "EXACT_MPN",
      "status": "Active|Mature|NRND|Last Time Buy|EOL|Obsolete|Discontinued|Unknown",
      "eol_date": "year or quarter if known, else empty string",
      "replacement": "exact replacement MPN if known, else empty string",
      "rohs": "RoHS Compliant|RoHS Non-Compliant|Unknown",
      "note": "one sentence about lifecycle, PCN, or successor",
      "risk": "low|medium|high|critical|unknown"
    }}
  ]
}}"""

        response = model.generate_content(prompt)
        text = response.text.strip()
        # Strip markdown code fences
        text = text.replace("```json","").replace("```","").strip()
        data = json.loads(text)
        out  = {}
        for item in data.get("results", []):
            mpn    = str(item.get("mpn","")).strip()
            status = _normalise_status(item.get("status","Unknown"))
            risk   = item.get("risk", _STATUS_RISK.get(status,"unknown"))
            out[mpn.upper()] = {
                "status":      status,
                "risk":        risk,
                "color":       _STATUS_COLOR.get(risk,"muted"),
                "replacement": str(item.get("replacement","") or ""),
                "rohs":        str(item.get("rohs","") or ""),
                "eol_date":    str(item.get("eol_date","") or ""),
                "note":        str(item.get("note","") or ""),
                "source":      "Gemini",
            }
        return out
    except Exception as exc:
        log.warning("Gemini EOL bulk failed: %s", exc)
        return {}


# ─── Source 4: OpenAI lifecycle intelligence ──────────────────────────────────
def _ai_lifecycle_bulk(components: list[dict]) -> dict[str, dict]:
    """
    Ask GPT-4o for lifecycle/EOL status for a batch of components.
    Returns {mpn: eol_dict}
    """
    client = _get_oai()
    if not client or not components:
        return {}

    lines = "\n".join([
        f'{i+1}. MPN={c["mpn"]} | Mfr={c.get("manufacturer","?")} | Desc={str(c.get("description",""))[:60]}'
        for i, c in enumerate(components)
    ])

    prompt = f"""You are a senior electronics procurement engineer with deep knowledge of component lifecycle status.

For each component below, provide:
1. Lifecycle status: Active / Mature / NRND / Last Time Buy / EOL / Obsolete / Discontinued / Unknown
2. EOL/NRND date if known (e.g., "Q4 2022", "2019", or "")
3. Recommended replacement MPN (exact part number, or "")
4. RoHS compliance: "RoHS Compliant" / "RoHS Non-Compliant" / "Unknown"
5. Short note about lifecycle (PCN, datasheet end date, successor announcement, etc.)
6. Risk: low / medium / high / critical

Use your training knowledge. Be specific — if you know a part is NRND or EOL, say so.

Components:
{lines}

Return ONLY this JSON:
{{
  "results": [
    {{
      "mpn": "EXACT_MPN",
      "status": "Active",
      "eol_date": "",
      "replacement": "",
      "rohs": "RoHS Compliant",
      "note": "Industry-standard op-amp, actively produced by multiple manufacturers",
      "risk": "low"
    }}
  ]
}}"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are an electronics engineer. Return only valid JSON."},
                {"role": "user",   "content": prompt},
            ],
            max_tokens=2000,
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        data = json.loads(response.choices[0].message.content)
        out  = {}
        for item in data.get("results", []):
            mpn    = str(item.get("mpn", "")).strip()
            status = _normalise_status(item.get("status", "Unknown"))
            risk   = item.get("risk", _STATUS_RISK.get(status, "unknown"))
            out[mpn.upper()] = {
                "status":      status,
                "risk":        risk,
                "color":       _STATUS_COLOR.get(risk, "muted"),
                "replacement": str(item.get("replacement", "") or ""),
                "rohs":        str(item.get("rohs", "") or ""),
                "eol_date":    str(item.get("eol_date", "") or ""),
                "note":        str(item.get("note", "") or ""),
                "source":      "AI",
            }
        return out
    except Exception as exc:
        log.warning("AI lifecycle bulk failed: %s", exc)
        return {}


# ─── Public API ───────────────────────────────────────────────────────────────
def get_eol_status(mpn: str, manufacturer: str = "", description: str = "") -> dict:
    """Return lifecycle/EOL status for a single component."""
    cached = _cached(mpn)
    if cached:
        return cached

    # Try Mouser first
    result = _mouser_lifecycle(mpn)
    if result:
        return _store(mpn, result)

    # Try DigiKey
    result = _digikey_lifecycle(mpn)
    if result:
        return _store(mpn, result)

    # AI fallback
    ai = _ai_lifecycle_bulk([{
        "mpn": mpn, "manufacturer": manufacturer, "description": description
    }])
    result = ai.get(mpn.upper()) or {
        "status": "Unknown", "risk": "unknown", "color": "muted",
        "replacement": "", "rohs": "", "eol_date": "", "note": "", "source": "None",
    }
    return _store(mpn, result)


def get_eol_bulk(components: list[dict]) -> dict[str, dict]:
    """
    Fetch EOL status for a list of components.
    Each component dict: {"mpn": str, "manufacturer": str, "description": str}

    Flow:
      1. Serve from cache
      2. Try Mouser for uncached
      3. Try DigiKey for those still missing
      4. Batch AI for remainder
    """
    if not components:
        return {}

    results = {}
    need_mouser = []

    for c in components:
        mpn = c["mpn"].strip()
        if not mpn:
            continue
        cached = _cached(mpn)
        if cached:
            results[mpn] = cached
        else:
            need_mouser.append(c)

    # Mouser + DigiKey in parallel per-component
    from concurrent.futures import ThreadPoolExecutor, as_completed

    need_ai = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        mouser_futs = {ex.submit(_mouser_lifecycle, c["mpn"]): c for c in need_mouser}
        for fut in as_completed(mouser_futs):
            c   = mouser_futs[fut]
            mpn = c["mpn"].strip()
            try:
                res = fut.result()
                if res:
                    results[mpn] = _store(mpn, res)
                else:
                    need_ai.append(c)
            except Exception:
                need_ai.append(c)

    # DigiKey for still-missing
    need_ai2 = []
    if need_ai:
        with ThreadPoolExecutor(max_workers=6) as ex:
            dk_futs = {ex.submit(_digikey_lifecycle, c["mpn"]): c for c in need_ai}
            for fut in as_completed(dk_futs):
                c   = dk_futs[fut]
                mpn = c["mpn"].strip()
                try:
                    res = fut.result()
                    if res:
                        results[mpn] = _store(mpn, res)
                    else:
                        need_ai2.append(c)
                except Exception:
                    need_ai2.append(c)

    # Gemini batch for remainder (faster + cheaper than OpenAI)
    need_ai3 = []
    if need_ai2:
        BATCH = 10
        batches = [need_ai2[i:i+BATCH] for i in range(0, len(need_ai2), BATCH)]
        for batch in batches:
            gem_res = _gemini_lifecycle_bulk(batch)
            for c in batch:
                mpn = c["mpn"].strip()
                res = gem_res.get(mpn.upper())
                if res:
                    results[mpn] = _store(mpn, res)
                else:
                    need_ai3.append(c)

    # OpenAI fallback for any still missing
    if need_ai3:
        BATCH = 8
        batches = [need_ai3[i:i+BATCH] for i in range(0, len(need_ai3), BATCH)]
        for batch in batches:
            ai_res = _ai_lifecycle_bulk(batch)
            for c in batch:
                mpn = c["mpn"].strip()
                res = ai_res.get(mpn.upper()) or {
                    "status": "Unknown", "risk": "unknown", "color": "muted",
                    "replacement": "", "rohs": "", "eol_date": "",
                    "note": "No lifecycle data available", "source": "None",
                }
                results[mpn] = _store(mpn, res)

    return results


# ─── CLI self-test ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        level=logging.INFO,
    )
    test = [
        {"mpn": "LM358",       "manufacturer": "TI",          "description": "Dual op-amp"},
        {"mpn": "LM741CN",     "manufacturer": "TI",          "description": "General purpose op-amp"},
        {"mpn": "AT89C51",     "manufacturer": "Atmel",       "description": "8051 microcontroller"},
        {"mpn": "PIC16F84A",   "manufacturer": "Microchip",   "description": "8-bit PIC MCU"},
        {"mpn": "GD25Q64CSIG", "manufacturer": "GigaDevice",  "description": "64Mb SPI Flash"},
        {"mpn": "STM32F103C8T6","manufacturer": "STMicro",    "description": "ARM Cortex-M3 MCU"},
        {"mpn": "LM7805",      "manufacturer": "TI",          "description": "5V LDO regulator"},
    ]
    results = get_eol_bulk(test)
    for mpn, r in results.items():
        risk_icon = {"low": "✅", "medium": "🔵", "high": "⚠️", "critical": "🔴", "unknown": "❓"}.get(r["risk"], "❓")
        print(f"\n{risk_icon}  {mpn}")
        print(f"   Status:  {r['status']}  (source: {r['source']})")
        print(f"   RoHS:    {r['rohs'] or 'Unknown'}")
        print(f"   EOL:     {r['eol_date'] or 'N/A'}")
        print(f"   Replace: {r['replacement'] or 'N/A'}")
        print(f"   Note:    {r['note']}")
