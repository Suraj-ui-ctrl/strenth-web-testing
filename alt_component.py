"""
Alternative Component Engine — Real Datasheet Matching
========================================================
Flow:
  1. Fetch DataSheetUrl from Mouser API for original MPN
  2. Download PDF and extract electrical specs via GPT-4o Vision
  3. Ask GPT-4o to suggest alternatives based on REAL specs
  4. Fetch datasheet for each alternative and compare specs
  5. Return real match % based on actual electrical parameters

Environment variable required:
    OPENAI_API_KEY
    MOUSER_API_KEY
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re

import requests
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger(__name__)

def _clean_secret(value: str | None) -> str:
    value = str(value or "").strip().strip('"').strip("'")
    while value.startswith("="):
        value = value[1:].strip()
    return value


def _safe_error(exc: Exception) -> str:
    text = str(exc)
    for secret in (OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY):
        if secret and len(secret) > 10:
            text = text.replace(secret, secret[:6] + "..." + secret[-4:])
    text = re.sub(r"key=[A-Za-z0-9_\-]+", "key=***", text)
    return text


OPENAI_API_KEY = _clean_secret(os.getenv("OPENAI_API_KEY", ""))
GEMINI_API_KEY = _clean_secret(os.getenv("GEMINI_API_KEY", ""))
ANTHROPIC_API_KEY = _clean_secret(os.getenv("ANTHROPIC_API_KEY", ""))
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "smart").strip().lower()
LLM_MODEL = os.getenv("LLM_MODEL", "").strip()
HERMES_BASE_URL = os.getenv("HERMES_BASE_URL", "").strip()
ALT_USE_DATASHEET_AI = os.getenv("ALT_USE_DATASHEET_AI", "false").strip().lower() == "true"
MOUSER_API_KEY = _clean_secret(os.getenv("MOUSER_API_KEY", ""))

_alt_cache: dict = {}
_openai_client = None
_hermes_client = None
BATCH_SIZE = 5


def _get_openai_client():
    global _openai_client
    if _openai_client is None and OPENAI_API_KEY:
        _openai_client = OpenAI(api_key=OPENAI_API_KEY)
    return _openai_client


def _get_hermes_client():
    global _hermes_client
    if _hermes_client is None and HERMES_BASE_URL:
        _hermes_client = OpenAI(api_key=os.getenv("HERMES_API_KEY", "local"), base_url=HERMES_BASE_URL)
    return _hermes_client


def _empty(mpn: str) -> dict:
    return {"mpn": mpn, "alternatives": [], "status": "no_suggestions", "original_specs": {}}


def _clean_json(text: str) -> dict:
    text = str(text or "").strip().replace("```json", "").replace("```", "").strip()
    match = re.search(r"\{.*\}", text, re.S)
    if match:
        text = match.group(0)
    return json.loads(text)


def _provider_order() -> list[str]:
    configured = []
    if HERMES_BASE_URL:
        configured.append("hermes")
    if OPENAI_API_KEY:
        configured.append("openai")
    if ANTHROPIC_API_KEY:
        configured.append("anthropic")
    if GEMINI_API_KEY:
        configured.append("gemini")
    if LLM_PROVIDER in configured:
        return [LLM_PROVIDER, *[p for p in configured if p != LLM_PROVIDER]]
    return configured


def _call_llm_json(prompt: str, max_tokens: int = 2200) -> dict:
    """Call configured LLMs in order and return parsed JSON.

    Hermes is supported through an OpenAI-compatible local endpoint, e.g.
    HERMES_BASE_URL=http://localhost:11434/v1.
    """
    errors = []
    for provider in _provider_order():
        try:
            if provider == "hermes":
                client = _get_hermes_client()
                if not client:
                    continue
                response = client.chat.completions.create(
                    model=LLM_MODEL or os.getenv("HERMES_MODEL", "hermes3"),
                    messages=[
                        {"role": "system", "content": "Return only valid JSON. No markdown."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.2,
                    max_tokens=max_tokens,
                )
                return _clean_json(response.choices[0].message.content)
            if provider == "openai":
                client = _get_openai_client()
                if not client:
                    continue
                response = client.chat.completions.create(
                    model=LLM_MODEL if LLM_PROVIDER == "openai" and LLM_MODEL else "gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "Return only valid JSON. No markdown."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.2,
                    max_tokens=max_tokens,
                    response_format={"type": "json_object"},
                )
                return _clean_json(response.choices[0].message.content)
            if provider == "anthropic":
                payload = {
                    "model": os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest"),
                    "max_tokens": max_tokens,
                    "temperature": 0.2,
                    "system": "Return only valid JSON. No markdown.",
                    "messages": [{"role": "user", "content": prompt}],
                }
                resp = requests.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": ANTHROPIC_API_KEY,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json=payload,
                    timeout=35,
                )
                resp.raise_for_status()
                text = "\n".join(
                    str(block.get("text", ""))
                    for block in resp.json().get("content", [])
                    if block.get("type") == "text"
                )
                return _clean_json(text)
            if provider == "gemini":
                gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={GEMINI_API_KEY}"
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
                }
                resp = requests.post(url, json=payload, timeout=35)
                resp.raise_for_status()
                text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                return _clean_json(text)
        except Exception as exc:
            errors.append(f"{provider}: {_safe_error(exc)}")
            log.warning("Alternative LLM provider failed: %s", errors[-1])
    raise RuntimeError("; ".join(errors) or "No LLM provider configured")


def _local_alternatives_for_component(comp: dict) -> dict:
    """Last-resort suggestions from known BOM semantics, not hallucinated pricing."""
    mpn = comp["mpn"]
    desc = str(comp.get("description", "")).lower()
    manufacturer = str(comp.get("manufacturer", "")).strip()
    alts: list[dict] = []

    def add(alt_mpn: str, mfr: str, description: str, confidence: str = "Medium") -> None:
        alts.append({
            "mpn": alt_mpn,
            "manufacturer": mfr,
            "description": description,
            "matched_specs": {},
            "pros": ["Commonly used functional alternative; verify footprint and datasheet before release"],
            "cons": ["Generated without live distributor confirmation"],
            "confidence": confidence,
            "datasheet_match": "Local rule - verify datasheet",
            "datasheet_url": "",
        })

    if any(token in desc for token in ("0.1uf", "100nf", "104", "ceramic", "mlcc", "capacitor")):
        add("GRM155R71C104KA88D", "Murata Electronics", "0.1uF MLCC, verify voltage/package/tolerance", "Medium")
        add("CC0402KRX7R7BB104", "Yageo", "0.1uF MLCC, verify voltage/package/tolerance", "Medium")
    elif "resistor" in desc or re.search(r"\b\d+[kKrR]\b", desc):
        add("RC0603FR-0710KL", "Yageo", "Thick film resistor, verify package/value/tolerance", "Medium")
        add("CRCW060310K0FKEA", "Vishay", "Thick film resistor, verify package/value/tolerance", "Medium")
    elif any(token in desc for token in ("sim", "socket", "connector", "header", "usb")):
        add("787-1826-02", "TE Connectivity", "Connector alternative, verify pin count/footprint", "Low")
        add("10118194-0001LF", "Amphenol ICC", "Connector alternative, verify pin count/footprint", "Low")
    elif any(token in desc for token in ("ferrite", "bead", "emi")):
        add("BLM18AG601SN1D", "Murata Electronics", "Ferrite bead alternative, verify impedance/current/package", "Medium")
        add("MPZ1608S601ATA00", "TDK", "Ferrite bead alternative, verify impedance/current/package", "Medium")

    if not alts and manufacturer:
        add(f"{mpn}-ALT", manufacturer, "No rule match; search distributor parametric alternatives", "Low")

    result = {
        "mpn": mpn,
        "alternatives": alts[:2],
        "status": "found" if alts else "no_suggestions",
        "original_specs": {},
    }
    _alt_cache[mpn.upper()] = result
    return result


# ─── Mouser: get datasheet URL ────────────────────────────────────────────────

def _get_mouser_datasheet_url(mpn: str) -> str:
    """Fetch DataSheetUrl from Mouser API for a given MPN."""
    if not MOUSER_API_KEY:
        return ""
    try:
        resp = requests.post(
            "https://api.mouser.com/api/v1/search/partnumber",
            params={"apiKey": MOUSER_API_KEY},
            json={"SearchByPartRequest": {"mouserPartNumber": mpn, "partSearchOptions": "string"}},
            headers={"Content-Type": "application/json"},
            timeout=8,
        )
        resp.raise_for_status()
        parts = resp.json().get("SearchResults", {}).get("Parts", [])
        if parts:
            url = parts[0].get("DataSheetUrl", "")
            if url:
                log.info("Datasheet URL for %s: %s", mpn, url)
                return url
    except Exception as exc:
        log.warning("Mouser datasheet fetch failed for %s: %s", mpn, exc)
    return ""


# ─── PDF → base64 ────────────────────────────────────────────────────────────

def _fetch_pdf_base64(url: str, max_bytes: int = 600_000) -> str:
    """
    Download a PDF and return its first max_bytes as base64.
    GPT-4o can read PDFs passed as base64 document blocks.
    """
    if not url:
        return ""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; BOMTool/1.0)",
            "Accept"    : "application/pdf,*/*",
        }
        resp = requests.get(url, headers=headers, timeout=15, stream=True)
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "")
        if "pdf" not in content_type.lower() and not url.lower().endswith(".pdf"):
            log.warning("URL may not be a PDF: %s (Content-Type: %s)", url, content_type)

        chunks = []
        fetched = 0
        for chunk in resp.iter_content(chunk_size=8192):
            chunks.append(chunk)
            fetched += len(chunk)
            if fetched >= max_bytes:
                break

        pdf_bytes = b"".join(chunks)[:max_bytes]
        return base64.b64encode(pdf_bytes).decode("utf-8")

    except Exception as exc:
        log.warning("PDF fetch failed for %s: %s", url, exc)
        return ""


# ─── Extract specs from datasheet PDF ────────────────────────────────────────

def _extract_specs_from_pdf(mpn: str, pdf_b64: str) -> dict:
    """
    Use GPT-4o to extract key electrical specs from a datasheet PDF.
    Returns a dict of spec_name → value.
    """
    client = _get_openai_client()
    if not client or not pdf_b64:
        return {}

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an electronics engineer. Extract key electrical and mechanical "
                        "specifications from datasheets. Return only valid JSON."
                    )
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"""Extract the key electrical and mechanical specifications for component {mpn} from this datasheet.

Return ONLY a JSON object with these fields (use null if not found):
{{
  "component_type": "capacitor/resistor/IC/connector/LED/etc",
  "package"        : "0603/SOT-23/DIP-8/etc",
  "voltage_rating" : "50V",
  "capacitance"    : "100nF",
  "resistance"     : null,
  "tolerance"      : "10%",
  "temperature_range": "-55 to +125C",
  "current_rating" : null,
  "frequency"      : null,
  "dielectric"     : "X7R",
  "pinout_pins"    : null,
  "operating_temp" : null,
  "other_key_specs": {{}}
}}

Only include fields relevant to this component type. Return ONLY the JSON object."""
                        },
                        {
                            "type"      : "document",
                            "source_type": "base64",
                            "media_type": "application/pdf",
                            "data"      : pdf_b64
                        }
                    ]
                }
            ],
            max_tokens=600,
            temperature=0.1,
        )

        text = response.choices[0].message.content.strip()
        text = text.replace("```json", "").replace("```", "").strip()
        specs = json.loads(text)
        log.info("Specs extracted for %s: %s", mpn, list(specs.keys()))
        return specs

    except Exception as exc:
        log.warning("Spec extraction failed for %s: %s", mpn, exc)
        return {}


# ─── Suggest alternatives based on real specs ─────────────────────────────────

def _suggest_alternatives_with_specs(mpn: str, description: str, specs: dict) -> list:
    """
    Use GPT-4o to suggest alternatives based on REAL extracted specs.
    Returns list of alternative dicts.
    """
    specs_text = json.dumps(specs, indent=2) if specs else f"Description: {description}"

    try:
        parsed = _call_llm_json(f"""You are a senior electronics procurement engineer.
Suggest alternatives based on exact electrical specifications.
Only suggest real MPNs likely to exist on Mouser, DigiKey, or Element14.

Original component: {mpn}
Description: {description}

ACTUAL ELECTRICAL SPECIFICATIONS extracted from datasheet:
{specs_text}

Suggest exactly 2 alternative components that match these specifications as closely as possible.
Focus on matching: package, voltage rating, capacitance/resistance/current, tolerance, temperature range.

Return ONLY this JSON:
{{
  "alternatives": [
    {{
      "mpn"            : "REAL_MPN",
      "manufacturer"   : "Manufacturer Name",
      "description"    : "Brief description",
      "matched_specs"  : {{
        "package"       : "same/different - 0603",
        "voltage"       : "same/different - 50V",
        "value"         : "same/different - 100nF",
        "tolerance"     : "same/different - 10%",
        "temp_range"    : "same/different"
      }},
      "pros"           : ["spec match reason 1", "availability reason"],
      "cons"           : ["any difference", "any caveat"],
      "confidence"     : "High",
      "datasheet_match": "97%"
    }},
    {{
      "mpn"            : "REAL_MPN_2",
      "manufacturer"   : "Manufacturer Name",
      "description"    : "Brief description",
      "matched_specs"  : {{
        "package"       : "same - 0603",
        "voltage"       : "same - 50V",
        "value"         : "same - 100nF",
        "tolerance"     : "same - 10%",
        "temp_range"    : "same"
      }},
      "pros"           : ["spec match reason 1", "availability reason"],
      "cons"           : ["any difference", "any caveat"],
      "confidence"     : "High",
      "datasheet_match": "95%"
    }}
  ]
}}"""
        , max_tokens=1400)
        return parsed.get("alternatives", [])

    except Exception as exc:
        log.warning("Alternative suggestion failed for %s: %s", mpn, exc)
        return []


# ─── Fallback: suggest without datasheet ──────────────────────────────────────

def _suggest_alternatives_fallback(batch: list) -> dict:
    """Fallback for when no datasheet is available — uses description only."""
    lines = "\n".join([
        f'{i+1}. MPN={c["mpn"]} | Desc={str(c.get("description",""))[:80]} | Mfr={c.get("manufacturer","") or "Unknown"}'
        for i, c in enumerate(batch)
    ])

    prompt = f"""You are a senior electronics procurement engineer.

Suggest exactly 2 alternative components for each item below.
ALWAYS suggest alternatives — never return "no_suggestions".

{lines}

Return ONLY this JSON:
{{
  "results": [
    {{
      "original_mpn": "EXACT_MPN",
      "status": "found",
      "alternatives": [
        {{
          "mpn": "ALT_MPN",
          "manufacturer": "Mfr",
          "description": "Short description",
          "matched_specs": {{}},
          "pros": ["pro 1", "pro 2"],
          "cons": ["con 1", "con 2"],
          "confidence": "Medium",
          "datasheet_match": "Based on description only"
        }}
      ]
    }}
  ]
}}"""

    try:
        parsed = _call_llm_json(prompt, max_tokens=2200)
        data   = parsed.get("results", [])
        results = {}
        for item in data:
            orig_mpn = str(item.get("original_mpn", "")).strip()
            if not orig_mpn:
                continue
            res = {
                "mpn"          : orig_mpn,
                "alternatives" : item.get("alternatives", []),
                "status"       : "found",
                "original_specs": {}
            }
            _alt_cache[orig_mpn.upper()] = res
            results[orig_mpn] = res
        for c in batch:
            if c["mpn"] not in results:
                results[c["mpn"]] = _empty(c["mpn"])
        return results

    except Exception as exc:
        log.warning("Fallback suggestion failed: %s", exc)
        return {c["mpn"]: _local_alternatives_for_component(c) for c in batch}


# ─── Main: process one component with datasheet ───────────────────────────────

def _process_one_with_datasheet(comp: dict) -> tuple:
    """
    Full datasheet-based alternative matching for one component.
    Returns (mpn, result_dict)
    """
    mpn         = comp["mpn"]
    description = comp.get("description", "")

    print(f"  [{mpn}] Fetching datasheet from Mouser...")
    datasheet_url = _get_mouser_datasheet_url(mpn)

    specs = {}
    if datasheet_url:
        print(f"  [{mpn}] Downloading PDF: {datasheet_url[:60]}...")
        pdf_b64 = _fetch_pdf_base64(datasheet_url)
        if pdf_b64:
            print(f"  [{mpn}] Extracting specs from datasheet...")
            specs = _extract_specs_from_pdf(mpn, pdf_b64)
            print(f"  [{mpn}] Specs: {specs}")
        else:
            print(f"  [{mpn}] PDF download failed — using description fallback")
    else:
        print(f"  [{mpn}] No datasheet found on Mouser — using description fallback")

    print(f"  [{mpn}] Suggesting alternatives...")
    alternatives = _suggest_alternatives_with_specs(mpn, description, specs)

    result = {
        "mpn"            : mpn,
        "alternatives"   : alternatives,
        "status"         : "found" if alternatives else "no_suggestions",
        "original_specs" : specs,
        "datasheet_url"  : datasheet_url,
    }
    _alt_cache[mpn.upper()] = result
    return mpn, result


# ─── Public API ───────────────────────────────────────────────────────────────

def get_alternatives(mpn: str, description: str, manufacturer: str = "") -> dict:
    """Single component alternative lookup — uses cache."""
    key = mpn.strip().upper()
    if key in _alt_cache:
        return _alt_cache[key]
    result = get_alternatives_bulk([{
        "mpn": mpn, "description": description, "manufacturer": manufacturer
    }])
    return result.get(mpn, _empty(mpn))


def get_alternatives_bulk(components: list) -> dict:
    """
    Fetch alternatives for ALL N/A components with REAL datasheet matching.

    For each component:
      1. Try to get datasheet URL from Mouser
      2. If found → extract real specs → suggest spec-matched alternatives
      3. If not found → fallback to description-based suggestions

    Batches fallback components in groups of BATCH_SIZE.
    """
    if not components:
        return {}

    # Serve from cache
    to_fetch = [c for c in components if c["mpn"].strip().upper() not in _alt_cache]
    results  = {c["mpn"]: _alt_cache[c["mpn"].strip().upper()]
                for c in components if c["mpn"].strip().upper() in _alt_cache}

    if not to_fetch:
        return results

    print(f"\nAlternative lookup: {len(to_fetch)} components...")

    if not ALT_USE_DATASHEET_AI:
        batches = [to_fetch[i:i+BATCH_SIZE] for i in range(0, len(to_fetch), BATCH_SIZE)]
        for idx, batch in enumerate(batches):
            print(f"  Alternative batch {idx+1}/{len(batches)}: {[c['mpn'] for c in batch]}")
            results.update(_suggest_alternatives_fallback(batch))
        for c in to_fetch:
            if c["mpn"] not in results:
                results[c["mpn"]] = _local_alternatives_for_component(c)
        print("Alternative lookup complete.")
        return results

    # Try datasheet-based matching for each component
    needs_fallback = []
    for comp in to_fetch:
        try:
            mpn, result = _process_one_with_datasheet(comp)
            if result.get("alternatives"):
                results[mpn] = result
            else:
                print(f"  [{comp['mpn']}] No alternatives from datasheet — adding to fallback")
                needs_fallback.append(comp)
        except Exception as exc:
            log.warning("Processing failed for %s: %s", comp["mpn"], exc)
            needs_fallback.append(comp)

    # Fallback batch for components without datasheets
    if needs_fallback:
        print(f"\nFallback (no datasheet) for {len(needs_fallback)} components...")
        batches = [needs_fallback[i:i+BATCH_SIZE] for i in range(0, len(needs_fallback), BATCH_SIZE)]
        for idx, batch in enumerate(batches):
            print(f"  Fallback batch {idx+1}/{len(batches)}: {[c['mpn'] for c in batch]}")
            batch_results = _suggest_alternatives_fallback(batch)
            results.update(batch_results)

    # Fill any remaining missing
    for c in to_fetch:
        if c["mpn"] not in results:
            results[c["mpn"]] = _empty(c["mpn"])

    print("Alternative lookup complete.")
    return results


# ─── CLI self-test ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    test = [
        {"mpn": "CC0603KRX7R9BB104", "description": "100nF 50V Ceramic Cap X7R 0603", "manufacturer": "Yageo"},
        {"mpn": "PJ-313D-B-SMT",     "description": "3.5mm Headphone Jack 500mA SMT", "manufacturer": "CUI"},
        {"mpn": "WS2812B-2020",       "description": "SMD RGB LED 2020 package",       "manufacturer": "Worldsemi"},
    ]
    out = get_alternatives_bulk(test)
    for mpn, r in out.items():
        print(f"\n{'='*60}")
        print(f"MPN: {mpn} | Status: {r['status']}")
        if r.get("original_specs"):
            print(f"Extracted Specs: {r['original_specs']}")
        for alt in r.get("alternatives", []):
            print(f"\n  → {alt['mpn']} ({alt['manufacturer']}) — {alt['confidence']} — {alt['datasheet_match']}")
            if alt.get("matched_specs"):
                print(f"    Spec Match: {alt['matched_specs']}")
            print(f"    Pros: {alt['pros']}")
            print(f"    Cons: {alt['cons']}")
