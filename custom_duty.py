"""
Indian Custom Duty Calculator
================================
Formula (CBIC Official):
  AV        = Component Price (INR)
  BCD       = AV x BCD%
  SWS       = BCD x 10%
  IGST Base = AV + BCD + SWS
  IGST      = IGST Base x IGST%
  Landed    = AV + BCD + SWS + IGST

Example: ₹10 capacitor
  AV   = ₹10.00
  BCD  = ₹10 x 0%  = ₹0.00
  SWS  = ₹0 x 10%  = ₹0.00
  IGST = ₹10 x 18% = ₹1.80
  Duty = ₹1.80  (18%)
  Landed = ₹11.80
"""

from __future__ import annotations
import logging
import os
import json
from dotenv import load_dotenv
from cybex_lookup import verify_hsn

load_dotenv()
log = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
SWS_RATE = 10.0

# Cache — avoids repeated OpenAI calls for same HSN
_cache: dict = {}
_cybex_rate_cache: dict = {}

# ─── Local table — instant lookup, no API cost ────────────────────────────────
LOCAL_TABLE = {
    # Capacitors
    "8532": {"bcd": 0.0, "igst": 18.0, "desc": "Electrical capacitors"},
    "85321": {"bcd": 0.0, "igst": 18.0, "desc": "Fixed capacitors - tantalum"},
    "85322": {"bcd": 0.0, "igst": 18.0, "desc": "Fixed capacitors - ceramic single layer"},
    "85323": {"bcd": 0.0, "igst": 18.0, "desc": "Fixed capacitors - MLCC"},
    "85324": {"bcd": 0.0, "igst": 18.0, "desc": "Fixed capacitors - paper/plastic"},
    "85325": {"bcd": 0.0, "igst": 18.0, "desc": "Fixed capacitors - other"},
    "853224": {"bcd": 0.0, "igst": 18.0, "desc": "MLCC ceramic capacitors"},
    "85322490": {"bcd": 0.0, "igst": 18.0, "desc": "MLCC ceramic capacitors - other"},

    # Resistors
    "8533": {"bcd": 0.0, "igst": 18.0, "desc": "Electrical resistors"},
    "85331": {"bcd": 0.0, "igst": 18.0, "desc": "Fixed carbon resistors"},
    "85332": {"bcd": 0.0, "igst": 18.0, "desc": "Fixed resistors - other"},
    "85333": {"bcd": 0.0, "igst": 18.0, "desc": "Wirewound resistors"},
    "85334": {"bcd": 0.0, "igst": 18.0, "desc": "Variable resistors"},
    "853321": {"bcd": 0.0, "igst": 18.0, "desc": "Carbon resistors fixed"},
    "853329": {"bcd": 0.0, "igst": 18.0, "desc": "Fixed resistors - other"},
    "85332900": {"bcd": 0.0, "igst": 18.0, "desc": "Fixed resistors - other"},

    # Diodes / Transistors / Semiconductors
    "8541": {"bcd": 0.0, "igst": 18.0, "desc": "Semiconductor devices"},
    "85411": {"bcd": 0.0, "igst": 18.0, "desc": "Diodes"},
    "85412": {"bcd": 0.0, "igst": 18.0, "desc": "Transistors <1W"},
    "85413": {"bcd": 0.0, "igst": 18.0, "desc": "Transistors >1W"},
    "85414": {"bcd": 0.0, "igst": 18.0, "desc": "Photosensitive devices / solar cells"},
    "85415": {"bcd": 0.0, "igst": 18.0, "desc": "LEDs"},
    "85416": {"bcd": 0.0, "igst": 18.0, "desc": "Piezoelectric crystals"},
    "85419": {"bcd": 0.0, "igst": 18.0, "desc": "Semiconductor devices - other"},
    "854110": {"bcd": 0.0, "igst": 18.0, "desc": "Diodes"},
    "854140": {"bcd": 0.0, "igst": 18.0, "desc": "Photosensitive devices"},
    "854150": {"bcd": 0.0, "igst": 18.0, "desc": "LEDs"},
    "85415000": {"bcd": 0.0, "igst": 18.0, "desc": "LEDs light emitting diodes"},
    "85411000": {"bcd": 0.0, "igst": 18.0, "desc": "Diodes all types"},

    # ICs / Microcontrollers
    "8542": {"bcd": 0.0, "igst": 18.0, "desc": "Electronic integrated circuits"},
    "85421": {"bcd": 0.0, "igst": 18.0, "desc": "Monolithic ICs - digital"},
    "85422": {"bcd": 0.0, "igst": 18.0, "desc": "Monolithic ICs - analog"},
    "85423": {"bcd": 0.0, "igst": 18.0, "desc": "Microcontrollers / processors"},
    "85429": {"bcd": 0.0, "igst": 18.0, "desc": "Other ICs / hybrid circuits"},
    "854231": {"bcd": 0.0, "igst": 18.0, "desc": "Processors and controllers"},
    "854239": {"bcd": 0.0, "igst": 18.0, "desc": "Microcontrollers - other"},
    "85423100": {"bcd": 0.0, "igst": 18.0, "desc": "Processors and controllers"},
    "85423900": {"bcd": 0.0, "igst": 18.0, "desc": "Microcontrollers - other"},
    "85429000": {"bcd": 0.0, "igst": 18.0, "desc": "Other ICs"},

    # WiFi / BT / IoT Modules
    "8517": {"bcd": 0.0, "igst": 18.0, "desc": "Telephone/wireless apparatus"},
    "85171": {"bcd": 0.0, "igst": 18.0, "desc": "Telephone sets"},
    "85172": {"bcd": 0.0, "igst": 18.0, "desc": "Cellular network telephones"},
    "85176": {"bcd": 0.0, "igst": 18.0, "desc": "WiFi/BT/IoT modules"},
    "851762": {"bcd": 0.0, "igst": 18.0, "desc": "Wireless transceivers"},
    "8517629": {"bcd": 0.0, "igst": 18.0, "desc": "WiFi Bluetooth modules"},
    "85176200": {"bcd": 0.0, "igst": 18.0, "desc": "Wireless transceivers"},
    "85176299": {"bcd": 0.0, "igst": 18.0, "desc": "ESP32/IoT wireless modules"},
    "85177090": {"bcd": 0.0, "igst": 18.0, "desc": "Parts of telephone apparatus"},

    # Connectors / Switches
    "8536": {"bcd": 7.5, "igst": 18.0, "desc": "Switches fuses connectors <1kV"},
    "85361": {"bcd": 7.5, "igst": 18.0, "desc": "Fuses"},
    "85362": {"bcd": 7.5, "igst": 18.0, "desc": "Circuit breakers"},
    "85363": {"bcd": 7.5, "igst": 18.0, "desc": "Isolating switches"},
    "85363000": {"bcd": 10.0, "igst": 18.0, "desc": "Other apparatus for protecting electrical circuits"},
    "85364": {"bcd": 7.5, "igst": 18.0, "desc": "Relays"},
    "85365": {"bcd": 7.5, "igst": 18.0, "desc": "Switches"},
    "85366": {"bcd": 7.5, "igst": 18.0, "desc": "Plugs sockets lamp holders"},
    "85369": {"bcd": 7.5, "igst": 18.0, "desc": "Electrical apparatus - other"},
    "85369010": {"bcd": 7.5, "igst": 18.0, "desc": "Connectors / sockets"},
    "85365000": {"bcd": 7.5, "igst": 18.0, "desc": "Switches"},

    # Transformers / Inductors
    "8504": {"bcd": 7.5, "igst": 18.0, "desc": "Transformers / inductors"},
    "85041": {"bcd": 7.5, "igst": 18.0, "desc": "Ballasts"},
    "85042": {"bcd": 7.5, "igst": 18.0, "desc": "Liquid transformers"},
    "85043": {"bcd": 7.5, "igst": 18.0, "desc": "Other transformers"},
    "85044": {"bcd": 7.5, "igst": 18.0, "desc": "Static converters"},
    "85045": {"bcd": 7.5, "igst": 18.0, "desc": "Inductors / chokes"},

    # Special machines / Oscillators
    "8543": {"bcd": 0.0, "igst": 18.0, "desc": "Electrical machines - special"},
    "85431": {"bcd": 0.0, "igst": 18.0, "desc": "Particle accelerators"},
    "85439": {"bcd": 0.0, "igst": 18.0, "desc": "Other electrical machines"},
    "85423290": {"bcd": 0.0, "igst": 18.0, "desc": "Flash memory ICs"},

    # PCBs
    "8534": {"bcd": 0.0, "igst": 18.0, "desc": "Printed circuits (PCB)"},
    "85340000": {"bcd": 0.0, "igst": 18.0, "desc": "Printed circuit boards"},

    # Sensors / Instruments
    "9031": {"bcd": 7.5, "igst": 18.0, "desc": "Measuring instruments"},
    "9032": {"bcd": 7.5, "igst": 18.0, "desc": "Automatic regulating instruments"},

    # Batteries
    "8507": {"bcd": 7.5, "igst": 18.0, "desc": "Electric batteries"},

    # Motors
    "8501": {"bcd": 7.5, "igst": 18.0, "desc": "Electric motors generators"},

    # Wire / Cable
    "8544": {"bcd": 7.5, "igst": 18.0, "desc": "Insulated wire / cable"},

    # Chapter defaults
    "85": {"bcd": 7.5, "igst": 18.0, "desc": "Electrical machinery (Ch. 85)"},
    "84": {"bcd": 7.5, "igst": 18.0, "desc": "Machinery (Ch. 84)"},
    "90": {"bcd": 7.5, "igst": 18.0, "desc": "Optical instruments (Ch. 90)"},
}


def _openai_lookup(hsn_code: str) -> dict | None:
    """Ask OpenAI for BCD + IGST for any HSN code not in local table."""
    if not OPENAI_API_KEY:
        return None
    if hsn_code in _cache:
        return _cache[hsn_code]
    try:
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Indian customs duty expert. Return only valid JSON."},
                {"role": "user", "content": f"""Indian import duty for HSN code {hsn_code}?
Based on CBIC Customs Tariff 2024-25. Return ONLY:
{{"bcd": 0.0, "igst": 18.0, "desc": "HSN category name"}}
Note: Electronics ICs/semiconductors/capacitors/resistors = 0% BCD. Connectors/switches = 7.5% BCD. IGST always 18%.
Return ONLY JSON."""}
            ],
            temperature=0.1,
            max_tokens=150,
            response_format={"type": "json_object"}
        )
        data = json.loads(r.choices[0].message.content)
        result = {
            "bcd": float(data.get("bcd", 7.5)),
            "igst": float(data.get("igst", 18.0)),
            "sws_rate": SWS_RATE,
            "description": str(data.get("desc", f"HSN {hsn_code}")),
            "hsn_matched": hsn_code,
            "source": "OpenAI/CBIC 2024-25"
        }
        _cache[hsn_code] = result
        return result
    except Exception as e:
        log.warning("OpenAI HSN lookup failed %s: %s", hsn_code, e)
        return None


def _with_cybex_verification(rates: dict, hsn_code: str) -> dict:
    """Attach hidden Cybex verification and only override rates if parsed."""
    hsn = str(hsn_code or "").strip().replace(" ", "")
    if not hsn:
        return rates
    cache_key = f"cybex:{hsn}:{rates.get('source', '')}"
    if cache_key in _cybex_rate_cache:
        return dict(_cybex_rate_cache[cache_key])

    enriched = dict(rates)
    try:
        cybex = verify_hsn(hsn)
        enriched["cybex_verified"] = bool(cybex.get("verified"))
        enriched["cybex_url"] = cybex.get("url") or ""
        enriched["cybex_status"] = cybex.get("status") or ""
        if cybex.get("description") and not enriched.get("description"):
            enriched["description"] = cybex["description"]

        # Cybex pages are parsed defensively. Override only when a sane rate is found.
        if cybex.get("bcd") is not None:
            enriched["bcd"] = float(cybex["bcd"])
        if cybex.get("igst") is not None:
            enriched["igst"] = float(cybex["igst"])
        if enriched["cybex_verified"]:
            enriched["source"] = f"{enriched.get('source', 'Duty table')} + Cybex verified"
    except Exception as exc:
        log.info("Cybex enrichment failed for HSN %s: %s", hsn, exc)
        enriched.setdefault("cybex_verified", False)
        enriched.setdefault("cybex_url", "")
        enriched.setdefault("cybex_status", "error")

    _cybex_rate_cache[cache_key] = dict(enriched)
    return enriched


def get_duty_rates(hsn_code: str) -> dict:
    """
    Get BCD + IGST for any HSN code.
    1. Exact match in local table
    2. Prefix match (longest first: 8→7→6→5→4→2)
    3. OpenAI live lookup
    4. Fallback default
    """
    if not hsn_code or str(hsn_code).strip() in ("N/A", "", "None", "nan"):
        return {"bcd": 0.0, "igst": 18.0, "sws_rate": SWS_RATE,
                "description": "Electronics default", "hsn_matched": "default", "source": "default",
                "cybex_verified": False, "cybex_url": "", "cybex_status": "no_hsn"}

    hsn = str(hsn_code).strip().replace(" ", "")

    # Try exact match first
    if hsn in LOCAL_TABLE:
        r = LOCAL_TABLE[hsn]
        return _with_cybex_verification({"bcd": r["bcd"], "igst": r["igst"], "sws_rate": SWS_RATE,
                "description": r["desc"], "hsn_matched": hsn, "source": "Local CBIC table"}, hsn)

    # Prefix match — longest first
    for length in [8, 7, 6, 5, 4, 2]:
        prefix = hsn[:length]
        if prefix in LOCAL_TABLE:
            r = LOCAL_TABLE[prefix]
            return _with_cybex_verification({"bcd": r["bcd"], "igst": r["igst"], "sws_rate": SWS_RATE,
                    "description": r["desc"], "hsn_matched": prefix, "source": "Local CBIC table"}, hsn)

    # OpenAI fallback for unknown HSN
    ai = _openai_lookup(hsn)
    if ai:
        return _with_cybex_verification(ai, hsn)

    return _with_cybex_verification({"bcd": 7.5, "igst": 18.0, "sws_rate": SWS_RATE,
            "description": f"General electronics (HSN {hsn})", "hsn_matched": "fallback", "source": "fallback"}, hsn)


def calculate_import_duty(price_inr: float, hsn_code: str, quantity: int = 1) -> dict:
    """
    Calculate accurate import duty.

    Example: ₹10 capacitor (HSN 85322490)
      AV   = ₹10.00
      BCD  = 0% = ₹0.00
      SWS  = 0% = ₹0.00
      IGST = 18% of ₹10 = ₹1.80
      Duty = ₹1.80
      Landed = ₹11.80
    """
    if not price_inr or price_inr <= 0:
        return _empty(hsn_code, quantity)

    rates     = get_duty_rates(hsn_code)
    av        = round(float(price_inr), 4)
    bcd       = round(av * rates["bcd"] / 100, 4)
    sws       = round(bcd * SWS_RATE / 100, 4)
    igst_base = round(av + bcd + sws, 4)
    igst      = round(igst_base * rates["igst"] / 100, 4)
    duty      = round(bcd + sws + igst, 4)
    landed    = round(av + duty, 4)
    eff_pct   = round(duty / av * 100, 2) if av > 0 else 0

    qty = int(quantity)
    return {
        "hsn_code"           : hsn_code,
        "hsn_matched"        : rates["hsn_matched"],
        "hsn_description"    : rates["description"],
        "source"             : rates.get("source", "CBIC"),
        "assessable_value"   : av,
        "bcd_rate"           : rates["bcd"],
        "bcd"                : bcd,
        "sws_rate"           : SWS_RATE,
        "sws"                : sws,
        "igst_base"          : igst_base,
        "igst_rate"          : rates["igst"],
        "igst"               : igst,
        "total_duty_per_unit": duty,
        "landed_cost_per_unit": landed,
        "effective_duty_pct" : eff_pct,
        "quantity"           : qty,
        "total_component_cost": round(av * qty, 2),
        "total_duty"         : round(duty * qty, 2),
        "total_landed_cost"  : round(landed * qty, 2),
        "cybex_verified"     : bool(rates.get("cybex_verified")),
        "cybex_url"          : rates.get("cybex_url", ""),
        "cybex_status"       : rates.get("cybex_status", ""),
    }


def _empty(hsn_code, qty=1):
    return {"hsn_code": hsn_code, "bcd": 0, "sws": 0, "igst": 0,
            "total_duty_per_unit": 0, "landed_cost_per_unit": 0,
            "total_duty": 0, "total_landed_cost": 0,
            "effective_duty_pct": 0, "quantity": qty, "source": "N/A",
            "cybex_verified": False, "cybex_url": "", "cybex_status": "no_price"}


def calculate_bom_duties(components: list) -> dict:
    """Bulk duty calculation for all BOM components."""
    results = []
    tc = td = tl = 0.0

    for c in components:
        mpn   = c.get("mpn", "")
        hsn   = str(c.get("hsn_code") or "N/A")
        price = float(c.get("best_price") or 0)
        qty   = int(c.get("quantity") or 1)

        if not price:
            results.append({"mpn": mpn, "status": "no_price", "duty": None})
            continue

        d = calculate_import_duty(price, hsn, qty)
        d["mpn"] = mpn
        tc += d.get("total_component_cost", 0)
        td += d.get("total_duty", 0)
        tl += d.get("total_landed_cost", 0)
        results.append({"mpn": mpn, "status": "ok", "duty": d})

    eff = round(td / tc * 100, 2) if tc > 0 else 0
    return {
        "components": results,
        "summary": {
            "total_component_cost": round(tc, 2),
            "total_duty"          : round(td, 2),
            "total_landed_cost"   : round(tl, 2),
            "effective_duty_pct"  : eff,
            "source"              : "CBIC Customs Tariff 2024-25"
        }
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    tests = [
        ("CC0603KRX7R9BB104", "85322490", 10.0,  60),
        ("ESP32-S3-WROOM-1",  "85176299", 250.0,  5),
        ("STM32F103C8T6",     "85423900", 150.0, 10),
        ("PJ-313D-B-SMT",     "85369010",  12.0,  2),
        ("Resistor",          "85332900",  10.0,  1),
    ]
    for mpn, hsn, price, qty in tests:
        d = calculate_import_duty(price, hsn, qty)
        print(f"\n{mpn} | HSN:{hsn} | ₹{price} x {qty}")
        print(f"  {d['hsn_description']} [{d['source']}]")
        print(f"  BCD:{d['bcd_rate']}% SWS:{d['sws']} IGST:{d['igst_rate']}% = Duty:₹{d['total_duty_per_unit']}/unit ({d['effective_duty_pct']}%)")
        print(f"  Total: ₹{d['total_component_cost']} + ₹{d['total_duty']} duty = ₹{d['total_landed_cost']} landed")
