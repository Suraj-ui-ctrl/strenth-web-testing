"""
HSN Code + Manufacturer Lookup
==============================
Uses OpenAI first and Gemini as fallback. Returns proposed HSN for UI display,
with confidence so duty calculation can restrict itself to verified/high-confidence codes.
"""

from __future__ import annotations

import json
import logging
import os
import re

import requests
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

log = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
AI_COMPARE_MODE = os.getenv("AI_COMPARE_MODE", "smart").strip().lower()
AI_MAX_COMPONENTS_PER_LLM_BATCH = int(os.getenv("AI_MAX_COMPONENTS_PER_LLM_BATCH", "25") or "25")

_cache: dict = {}
_client = None


def _get_client():
    global _client
    if _client is None and OPENAI_API_KEY:
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


def _empty() -> dict:
    return {
        "hsn_code": "N/A",
        "hsn_desc": "N/A",
        "confidence": "N/A",
        "manufacturer": "",
    }


LOCAL_RULES = [
    {
        "needles": ["ferrite", "bead", "emi"],
        "hsn_code": "85363000",
        "hsn_desc": "Other apparatus for protecting electrical circuits",
        "confidence": "High",
    },
    {
        "needles": ["circuit protection", "esd", "tvs", "transient voltage"],
        "hsn_code": "85363000",
        "hsn_desc": "Other apparatus for protecting electrical circuits",
        "confidence": "High",
    },
    {
        "needles": ["mlcc", "ceramic capacitor", "capacitor"],
        "hsn_code": "85322400",
        "hsn_desc": "Ceramic dielectric multilayer capacitors",
        "confidence": "High",
    },
    {
        "needles": ["resistor"],
        "hsn_code": "85332900",
        "hsn_desc": "Fixed electrical resistors",
        "confidence": "High",
    },
    {
        "needles": ["connector", "socket", "header", "usb", "sim card"],
        "hsn_code": "85369010",
        "hsn_desc": "Electrical connectors and sockets",
        "confidence": "Medium",
    },
    {
        "needles": ["led", "light emitting diode"],
        "hsn_code": "85415000",
        "hsn_desc": "Light emitting diodes",
        "confidence": "High",
    },
    {
        "needles": ["ic", "microcontroller", "processor", "charger", "regulator", "converter"],
        "hsn_code": "85423900",
        "hsn_desc": "Electronic integrated circuits",
        "confidence": "Medium",
    },
]

MPN_MANUFACTURER_RULES = [
    (r"^(GRM|GCM|BLM|LQH|LQM|NFM|NCP|DLP)", "Murata Electronics"),
    (r"^(CC|RC|AC|YC|RT|RL)\d", "Yageo"),
    (r"^(CL|RC|CIG|CIM)\d", "Samsung Electro-Mechanics"),
    (r"^(CGA|C|VLS|MPZ|MMZ|B824)", "TDK"),
    (r"^(ERJ|EEE|ECJ|FK|LN)", "Panasonic"),
    (r"^(CRCW|MCT|MCS|IHLP|VJ)", "Vishay"),
    (r"^(PESD|PMEG|BAV|BAS|74HC|74HCT)", "Nexperia"),
    (r"^(MMBZ|NUP|MC74|NCP|NCV)", "onsemi"),
    (r"^(TPD|TPS|TLV|LM|SN74|BQ)", "Texas Instruments"),
    (r"^(W25|IS25|GD25)", "Winbond"),
    (r"^(STM32|ST[A-Z0-9]|L78|LDK)", "STMicroelectronics"),
    (r"^(ATMEGA|ATSAM|MCP|PIC|MIC)", "Microchip Technology"),
    (r"^(DFLS|BZT|AP[0-9]|AZ)", "Diodes Incorporated"),
    (r"^(AO|AON|AOD)", "Alpha & Omega Semiconductor"),
]


def infer_manufacturer_local(mpn: str, description: str = "") -> str:
    """Infer manufacturer from common electronics MPN prefixes.

    This is intentionally conservative and only returns a value for known
    high-signal prefixes. Vendor/API values still take precedence.
    """
    text = re.sub(r"[^A-Z0-9]", "", str(mpn or "").upper())
    if not text:
        return ""
    for pattern, manufacturer in MPN_MANUFACTURER_RULES:
        if re.match(pattern, text):
            return manufacturer
    desc = str(description or "").lower()
    known_names = {
        "murata": "Murata Electronics",
        "yageo": "Yageo",
        "samsung": "Samsung Electro-Mechanics",
        "panasonic": "Panasonic",
        "nexperia": "Nexperia",
        "onsemi": "onsemi",
        "texas instruments": "Texas Instruments",
        "ti ": "Texas Instruments",
        "vishay": "Vishay",
        "tdk": "TDK",
        "molex": "Molex",
        "te connectivity": "TE Connectivity",
        "amphenol": "Amphenol ICC",
        "jst": "JST",
    }
    for needle, manufacturer in known_names.items():
        if needle in desc:
            return manufacturer
    return ""


def _local_rule_lookup(component: dict) -> dict | None:
    text = " ".join([
        str(component.get("mpn", "")),
        str(component.get("description", "")),
        str(component.get("manufacturer", "")),
    ]).lower()
    for rule in LOCAL_RULES:
        if any(n in text for n in rule["needles"]):
            return {
                "hsn_code": rule["hsn_code"],
                "hsn_desc": rule["hsn_desc"],
                "confidence": rule["confidence"],
                "manufacturer": str(component.get("manufacturer", "")).strip()
                or infer_manufacturer_local(component.get("mpn", ""), component.get("description", "")),
            }
    return None


def infer_hsn_local(mpn: str, description: str = "", manufacturer: str = "") -> dict:
    """Return a local HSN proposal without making an LLM call."""
    return _local_rule_lookup({"mpn": mpn, "description": description, "manufacturer": manufacturer}) or _empty()


def _clean_json(text: str) -> dict:
    text = str(text or "").strip().replace("```json", "").replace("```", "").strip()
    match = re.search(r"\{.*\}", text, re.S)
    if match:
        text = match.group(0)
    return json.loads(text)


def _build_prompt(components: list[dict]) -> str:
    lines = "\n".join(
        f'{i+1}. MPN={c["mpn"]} | Desc={str(c.get("description",""))[:90]} | KnownMfr={c.get("manufacturer","") or "-"}'
        for i, c in enumerate(components)
    )
    return f"""You are an Indian GST HSN classification expert for electronics BOM components.

For each item, identify manufacturer and provide the most likely 8-digit Indian HSN code.

Components:
{lines}

Return ONLY valid JSON:
{{
  "items": [
    {{
      "mpn": "EXACT_INPUT_MPN",
      "manufacturer": "Manufacturer",
      "hsn_code": "85322400",
      "hsn_desc": "Short HSN description",
      "confidence": "High"
    }}
  ]
}}

Rules:
- One entry per input component.
- hsn_code must be exactly 8 digits if possible.
- Ferrite bead / EMI filter / circuit-protection parts normally classify as 85363000 in India when used for circuit protection.
- MLCC/capacitors should prefer Cybex-usable 85322400 when duty detail is required.
- Fixed resistors normally classify under 85332900.
- Connectors, sockets, USB, headers normally classify under 85369010 unless a more exact 8-digit code is known.
- Integrated circuits, regulators, converters, chargers normally classify under 85423900 unless the exact IC subheading is known.
- If uncertain, still provide a proposed 8-digit HSN and set confidence to Medium or Low.
- confidence must be High, Medium, or Low.
- Use KnownMfr if provided.
- Do not return markdown or explanation."""


def _parse_items(parsed: dict, components: list[dict], results: dict) -> dict:
    for item in parsed.get("items", []):
        mpn = str(item.get("mpn", "")).strip()
        if not mpn:
            continue
        mfr = str(item.get("manufacturer", "")).strip()
        if mfr.lower() in ("unknown", "n/a", "none", "-", ""):
            mfr = ""
        res = {
            "hsn_code": str(item.get("hsn_code", "N/A")).strip(),
            "hsn_desc": str(item.get("hsn_desc", "N/A")).strip(),
            "confidence": str(item.get("confidence", "Low")).strip(),
            "manufacturer": mfr,
        }
        _cache[mpn.upper()] = res
        results[mpn] = res

    for c in components:
        if c["mpn"] not in results:
            results[c["mpn"]] = _empty()
    return results


def _lookup_openai(components: list[dict], results: dict) -> dict:
    client = _get_client()
    if not client:
        raise RuntimeError("OPENAI_API_KEY not set")

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "Return only JSON. Classify Indian GST HSN for electronic components with confidence.",
            },
            {"role": "user", "content": _build_prompt(components)},
        ],
        temperature=0.1,
        max_tokens=3500,
        response_format={"type": "json_object"},
    )
    parsed = _clean_json(response.choices[0].message.content)
    return _parse_items(parsed, components, results)


def _lookup_gemini(components: list[dict], results: dict) -> dict:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{"parts": [{"text": _build_prompt(components)}]}],
        "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
    }
    resp = requests.post(url, json=payload, timeout=35)
    resp.raise_for_status()
    text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
    parsed = _clean_json(text)
    return _parse_items(parsed, components, results)


def _lookup_anthropic(components: list[dict], results: dict) -> dict:
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    payload = {
        "model": os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest"),
        "max_tokens": 1400,
        "temperature": 0.1,
        "system": "Return only JSON. Classify Indian GST HSN for electronic components with confidence.",
        "messages": [{"role": "user", "content": _build_prompt(components)}],
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
    blocks = resp.json().get("content", [])
    text = "\n".join(str(block.get("text", "")) for block in blocks if block.get("type") == "text")
    parsed = _clean_json(text)
    return _parse_items(parsed, components, results)


def _merge_provider_votes(provider_results: list[dict], components: list[dict], base_results: dict) -> dict:
    merged = dict(base_results)
    for comp in components:
        mpn = comp["mpn"]
        votes = [r.get(mpn) for r in provider_results if isinstance(r.get(mpn), dict)]
        votes = [v for v in votes if re.fullmatch(r"\d{8}", str(v.get("hsn_code", "")))]
        if not votes:
            merged[mpn] = merged.get(mpn, _empty())
            continue
        high = [v for v in votes if str(v.get("confidence", "")).lower() == "high"]
        pool = high or votes
        counts: dict[str, int] = {}
        for vote in pool:
            counts[vote["hsn_code"]] = counts.get(vote["hsn_code"], 0) + 1
        winner = max(pool, key=lambda v: (counts.get(v["hsn_code"], 0), str(v.get("confidence", "")).lower() == "high"))
        winner = dict(winner)
        if counts.get(winner["hsn_code"], 0) > 1:
            winner["confidence"] = "High"
        merged[mpn] = winner
        _cache[mpn.upper()] = winner
    return merged


def get_hsn_code(mpn: str, description: str, manufacturer: str = "") -> dict:
    key = mpn.strip().upper()
    if key in _cache:
        return _cache[key]
    results = get_hsn_bulk([{"mpn": mpn, "description": description, "manufacturer": manufacturer}])
    return results.get(mpn, _empty())


def get_hsn_bulk(components: list[dict]) -> dict:
    if not components:
        return {}

    for c in components:
        key = c["mpn"].strip().upper()
        if key not in _cache:
            local = _local_rule_lookup(c)
            if local:
                _cache[key] = local

    to_fetch = [c for c in components if c["mpn"].strip().upper() not in _cache][:AI_MAX_COMPONENTS_PER_LLM_BATCH]
    results = {
        c["mpn"]: _cache[c["mpn"].strip().upper()]
        for c in components
        if c["mpn"].strip().upper() in _cache
    }
    if not to_fetch:
        return results

    provider_calls = []
    if OPENAI_API_KEY:
        provider_calls.append(("openai", _lookup_openai))
    if GEMINI_API_KEY:
        provider_calls.append(("gemini", _lookup_gemini))
    if ANTHROPIC_API_KEY:
        provider_calls.append(("anthropic", _lookup_anthropic))

    provider_results = []
    for name, fn in provider_calls:
        try:
            attempt = fn(to_fetch, dict(results))
            provider_results.append(attempt)
            weak = [
                c for c in to_fetch
                if str(attempt.get(c["mpn"], {}).get("confidence", "")).lower() not in ("high", "medium")
            ]
            if AI_COMPARE_MODE != "all" and not weak:
                return attempt
        except Exception as exc:
            log.warning("%s HSN lookup failed: %s", name, exc)

    if provider_results:
        return _merge_provider_votes(provider_results, to_fetch, results)

    for c in to_fetch:
        results[c["mpn"]] = _empty()
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    sample = [{"mpn": "CC0603KRX7R9BB104", "description": "100nF 50V X7R ceramic capacitor", "manufacturer": ""}]
    print(get_hsn_bulk(sample))
