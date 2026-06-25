"""
BOM Tool Chat Agent — adapted from langchain-agent-poc.

A LangChain ReAct agent with BOM-specific tools:
  - classify_component   : keyword-based BOP/CDP/MECHANICAL/ASSEMBLY detection
  - lookup_component_price: Mouser + Element14 price query
  - search_component_online: multi-store shopping fallback search
  - calculate            : safe math evaluator (from PoC)

LLM priority: Azure OpenAI (from PoC env vars) → Anthropic → OpenAI
"""
from __future__ import annotations

import ast
import logging
import operator
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from dotenv import load_dotenv
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

load_dotenv()

# ── Redis cache (optional — gracefully skipped if not available) ──────────────

def _redis():
    try:
        import redis
        url = os.getenv("REDIS_URL", "")
        if url:
            return redis.from_url(url, socket_timeout=1, socket_connect_timeout=1)
    except Exception:
        pass
    return None


def _cache_get(key: str) -> str | None:
    try:
        r = _redis()
        if r:
            v = r.get(key)
            return v.decode() if v else None
    except Exception:
        pass
    return None


def _cache_set(key: str, value: str, ttl: int = 3600) -> None:
    try:
        r = _redis()
        if r:
            r.setex(key, ttl, value)
    except Exception:
        pass


# ── Comprehensive keyword taxonomy for electronics + mechanical procurement ──────

_ASSEMBLY_WORDS = frozenset([
    "assembly", "pcba", "smt", "fatp", "testing", "packaging", "box build",
    "through-hole", "through hole", "thru-hole", "wave solder", "reflow",
    "conformal coat", "potting", "programming", "flashing", "burn-in",
    "functional test", "ict test", "aoi", "x-ray inspection", "kitting",
    "sub-assembly", "system integration", "final assembly", "rework", "repair",
])

_CDP_WORDS = frozenset([
    "custom", "machined", "mould", "mold", "enclosure", "bracket", "sheet metal",
    "cnc", "fabricated", "extrusion", "harness", "cable assembly", "wire harness",
    "injection mold", "die cast", "stamping", "laser cut", "3d print", "prototype",
    "bespoke", "designed to spec", "custom pcb", "flex pcb", "rigid flex",
    "custom label", "overlay", "silk screen", "anodized", "powder coat",
    "special order", "made to order", "non-standard", "custom winding",
])

_MECHANICAL_WORDS = frozenset([
    "screw", "bolt", "nut", "washer", "standoff", "spacer", "bushing", "bearing",
    "spring", "clip", "fastener", "rivet", "insert", "grommet", "o-ring", "gasket",
    "seal", "heatsink", "heat sink", "fan", "blower", "grille", "panel",
    "hinge", "latch", "handle", "knob", "foot", "rubber foot", "adhesive",
    "tape", "foam", "velcro", "cable tie", "zip tie", "clamp", "bracket standard",
    "din rail", "rack mount", "chassis", "frame", "rail", "track",
])

_BOP_WORDS = frozenset([
    # Passives
    "resistor", "capacitor", "inductor", "ferrite", "bead", "varistor", "thermistor",
    "ptc", "ntc", "fuse", "tvs", "zener", "schottky", "crystal", "oscillator",
    "resonator", "filter", "balun", "transformer", "choke",
    # Semiconductors
    "ic", "chip", "microcontroller", "mcu", "mpu", "dsp", "fpga", "cpld",
    "op-amp", "opamp", "comparator", "adc", "dac", "mosfet", "igbt", "bjt",
    "transistor", "diode", "rectifier", "regulator", "ldo", "dc-dc", "buck",
    "boost", "driver", "gate driver", "motor driver", "h-bridge", "multiplexer",
    "shift register", "buffer", "logic gate", "flip flop", "counter", "timer",
    "memory", "flash", "eeprom", "sdram", "ddr", "nand", "nor", "sram",
    "microprocessor", "arm", "cortex", "esp32", "esp8266", "stm32", "atmega",
    "pic", "raspberry", "arduino",
    # Connectivity
    "connector", "header", "socket", "terminal", "usb", "hdmi", "rj45", "sma",
    "rf connector", "coax", "antenna", "bluetooth", "wifi", "zigbee", "lora",
    "can", "rs232", "rs485", "uart", "spi", "i2c", "ethernet",
    # Display & UI
    "led", "rgb led", "lcd", "oled", "display", "7-segment", "dot matrix",
    "touch screen", "button", "switch", "push button", "toggle", "rotary",
    "encoder", "potentiometer", "relay", "buzzer", "speaker", "microphone",
    # Power
    "battery", "cell", "supercapacitor", "power module", "psu", "smps",
    "solar", "charger", "bms", "protection ic", "hot swap",
    # Sensors
    "sensor", "accelerometer", "gyroscope", "imu", "magnetometer", "compass",
    "temperature sensor", "humidity sensor", "pressure sensor", "proximity",
    "infrared", "ir sensor", "ultrasonic", "lidar", "camera", "image sensor",
    "current sensor", "hall effect", "encoder", "load cell", "strain gauge",
    # Mechanical-electronic
    "motor", "stepper", "servo", "dc motor", "bldc", "solenoid", "actuator",
    "pump", "valve",
])

_PART_FAMILIES = {
    "MCU": ["stm32", "esp32", "esp8266", "atmega", "pic", "cortex", "nrf52", "rp2040", "psoc"],
    "POWER_IC": ["lm317", "lm7805", "ams1117", "mp2307", "tps", "lm2596", "xl4016", "ap2112"],
    "OPAMP": ["lm358", "lm741", "mcp6002", "ad823", "tl071", "opa", "ina"],
    "MOSFET": ["irf", "irfz", "aoss", "nds", "si2302", "ao3400", "stp"],
    "DRIVER": ["l293d", "l298", "drv8825", "a4988", "uln2003", "tpic"],
    "SENSOR": ["dht11", "dht22", "bmp280", "mpu6050", "hmc5883", "ds18b20", "acs712"],
    "DISPLAY": ["ssd1306", "ili9341", "st7735", "hd44780", "max7219"],
    "COMM_IC": ["max232", "max485", "ch340", "ft232", "cp2102", "cc2500"],
}

_SUPPLIER_MAP = {
    "MCU":        ["Mouser", "Digikey", "LCSC", "ElectronicsComp"],
    "POWER_IC":   ["Mouser", "Element14", "LCSC", "Robu"],
    "PASSIVE":    ["LCSC", "Mouser", "Element14", "Evelta"],
    "CONNECTOR":  ["Mouser", "Digikey", "ElectronicsComp", "Sharvi"],
    "SENSOR":     ["Robu", "Robocraze", "Mouser", "LCSC"],
    "MODULE":     ["Robu", "Robocraze", "Flyrobo", "Amazon"],
    "MECHANICAL": ["Robu", "IndiaMART", "Amazon", "local hardware"],
    "ASSEMBLY":   ["local PCBA vendor", "search_vendors for ASSEMBLY type"],
    "CDP":        ["custom quote required", "search_vendors for MANUFACTURER type"],
}

_PRICE_RANGES = {
    "resistor":      "₹0.50–5 (0402/0603 SMD), ₹1–10 (THT)",
    "capacitor":     "₹1–20 (ceramic/electrolytic)",
    "inductor":      "₹5–50",
    "mcu":           "₹50–500 (8-bit), ₹200–2000 (32-bit ARM)",
    "mosfet":        "₹10–100",
    "led":           "₹1–10 (standard), ₹20–200 (RGB/high-power)",
    "connector":     "₹5–200 depending on type/pins",
    "lcd/oled":      "₹150–800",
    "sensor":        "₹30–500",
    "relay":         "₹20–150",
    "motor driver":  "₹30–300",
    "power module":  "₹100–500",
}

_MPN_RE = re.compile(r'^[A-Z0-9][A-Z0-9\-_\.\/]{3,}$', re.IGNORECASE)


def _is_valid_mpn(mpn: str) -> bool:
    return bool(mpn and len(mpn) >= 4 and _MPN_RE.match(mpn))


def _detect_part_family(text: str) -> str:
    t = text.lower()
    for family, patterns in _PART_FAMILIES.items():
        if any(p in t for p in patterns):
            return family
    if any(w in t for w in ["resistor", "capacitor", "inductor", "ferrite"]):
        return "PASSIVE"
    if any(w in t for w in ["connector", "header", "socket", "terminal"]):
        return "CONNECTOR"
    if any(w in t for w in ["sensor", "accelerometer", "gyroscope", "temperature"]):
        return "SENSOR"
    if any(w in t for w in ["module", "board", "kit"]):
        return "MODULE"
    return "GENERAL"


def _classify_keywords(description: str, mpn: str) -> dict:
    text = f"{description} {mpn}".lower()
    if any(w in text for w in _ASSEMBLY_WORDS):
        return {"item_type": "ASSEMBLY", "confidence": 92,
                "reason": "Assembly/manufacturing process keyword detected",
                "suppliers": _SUPPLIER_MAP["ASSEMBLY"]}
    if any(w in text for w in _CDP_WORDS):
        return {"item_type": "CDP", "confidence": 89,
                "reason": "Custom design/fabrication keyword detected",
                "suppliers": _SUPPLIER_MAP["CDP"]}
    if any(w in text for w in _MECHANICAL_WORDS):
        return {"item_type": "MECHANICAL", "confidence": 87,
                "reason": "Standard mechanical hardware keyword detected",
                "suppliers": _SUPPLIER_MAP["MECHANICAL"]}
    if _is_valid_mpn(mpn) or any(w in text for w in _BOP_WORDS):
        family = _detect_part_family(text)
        conf = 88 if _is_valid_mpn(mpn) else 72
        return {"item_type": "BOP", "confidence": conf,
                "reason": f"Standard purchasable electronic component ({family})",
                "family": family,
                "suppliers": _SUPPLIER_MAP.get(family, _SUPPLIER_MAP["PASSIVE"])}
    return {"item_type": "BOP", "confidence": 45,
            "reason": "Insufficient data — needs user review",
            "suppliers": ["Mouser", "LCSC", "Robu"]}


# ── Safe math evaluator (from PoC tools.py) ──────────────────────────────────

_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub,
    ast.Mult: operator.mul, ast.Div: operator.truediv,
    ast.Pow: operator.pow, ast.Mod: operator.mod,
}
_UNARY = {ast.UAdd: operator.pos, ast.USub: operator.neg}


def _eval_expr(node: ast.AST) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval_expr(node.left), _eval_expr(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY:
        return _UNARY[type(node.op)](_eval_expr(node.operand))
    raise ValueError("Unsupported expression. Use numbers and + - * / % **")


# ── LangChain Tools ───────────────────────────────────────────────────────────

@tool
def classify_component(description: str, mpn: str = "") -> str:
    """
    Classify a BOM component as BOP, CDP, MECHANICAL, or ASSEMBLY.
    Returns type, confidence, reason, and recommended suppliers.
    Use this for any component type or category question.
    """
    r = _classify_keywords(description, mpn)
    suppliers = ", ".join(r.get("suppliers", []))
    family = r.get("family", "")
    family_str = f" | Family: {family}" if family else ""
    return (
        f"Type: {r['item_type']} | Confidence: {r['confidence']}%{family_str}\n"
        f"Reason: {r['reason']}\n"
        f"Recommended suppliers: {suppliers}"
    )


@tool
def identify_part(query: str) -> str:
    """
    Deep part identification — given any description, part name, or MPN, returns:
    part type, component family, typical specs, recommended suppliers, typical price range,
    and what to check when buying. Use this when the user asks 'what is X', 'what type is X',
    or wants to understand a component before sourcing it.
    """
    q = query.lower().strip()
    result = _classify_keywords(q, q)
    family = _detect_part_family(q)

    # Build human-like intelligence response
    type_desc = {
        "BOP":        "Standard purchasable electronic/electrical component — buy off the shelf.",
        "CDP":        "Custom Designed Part — requires supplier quote, drawing, or specification.",
        "MECHANICAL": "Standard mechanical hardware — available from hardware stores or distributors.",
        "ASSEMBLY":   "Manufacturing service — requires a contract manufacturer or PCBA vendor.",
    }.get(result["item_type"], "Unknown type")

    # Typical specs hint by family
    spec_hints = {
        "MCU":        "Check: core (ARM/AVR/RISC-V), flash size, RAM, GPIO count, package, voltage",
        "POWER_IC":   "Check: input/output voltage, current rating, efficiency, package type",
        "PASSIVE":    "Check: value (R/C/L), tolerance, voltage rating, package size (0402/0603/0805)",
        "MOSFET":     "Check: Vds, Id (drain current), Rds(on), gate threshold voltage, package",
        "OPAMP":      "Check: supply voltage, bandwidth (GBW), input offset, slew rate, package",
        "CONNECTOR":  "Check: pitch (mm), pin count, current rating, mating cycles, locking type",
        "SENSOR":     "Check: measurement range, accuracy, interface (I2C/SPI/analog), supply voltage",
        "MODULE":     "Check: interface, voltage, current draw, dimensions, certifications",
        "DRIVER":     "Check: current per channel, voltage range, control interface, thermal rating",
        "DISPLAY":    "Check: resolution, interface (SPI/I2C/parallel), voltage, viewing angle",
        "COMM_IC":    "Check: protocol (UART/CAN/RS485), baud rate, voltage levels, ESD rating",
        "MECHANICAL": "Check: material, thread size, length, finish (zinc/SS/black oxide)",
        "ASSEMBLY":   "Check: quantity, IPC class, lead-free, test requirements, turnaround time",
        "CDP":        "Provide: drawing/3D model, material spec, tolerance, finish, quantity",
        "GENERAL":    "Check MPN on datasheet for full specifications",
    }.get(family if family != "GENERAL" else result["item_type"], "Check datasheet for specifications")

    price_hint = ""
    for keyword, price in _PRICE_RANGES.items():
        if keyword in q:
            price_hint = f"\nTypical price: {price}"
            break

    suppliers = ", ".join(result.get("suppliers", ["Mouser", "LCSC", "Robu"]))

    return (
        f"Part: {query}\n"
        f"Type: {result['item_type']} | Family: {family}\n"
        f"What it is: {type_desc}\n"
        f"Key specs: {spec_hints}\n"
        f"Best sources: {suppliers}"
        f"{price_hint}\n"
        f"Confidence: {result['confidence']}%"
    )


@tool
def lookup_component_price(mpn: str) -> str:
    """
    Look up real-time pricing and stock for a component MPN across Mouser and Element14.
    Use this when the user asks about price or availability.
    """
    results: list[str] = []

    try:
        from Mouser_fetch import get_mouser_price  # type: ignore
        r = get_mouser_price(mpn)
        if r:
            price = r.get("price") or r.get("unit_price") or "N/A"
            stock = r.get("stock") or r.get("availability") or "N/A"
            results.append(f"Mouser: ₹{price} (stock: {stock})")
        else:
            results.append("Mouser: not found")
    except Exception as exc:
        results.append(f"Mouser: error ({exc})")

    try:
        from element14_fetch import get_element14_price  # type: ignore
        r = get_element14_price(mpn)
        if r:
            price = r.get("price") or r.get("unit_price") or "N/A"
            stock = r.get("stock") or r.get("availability") or "N/A"
            results.append(f"Element14: ₹{price} (stock: {stock})")
        else:
            results.append("Element14: not found")
    except Exception as exc:
        results.append(f"Element14: error ({exc})")

    return " | ".join(results) if results else f"No pricing data found for MPN: {mpn}"


@tool
def search_component_online(mpn: str, description: str = "") -> str:
    """
    Search for a component across Indian online electronics stores.
    Use this when standard distributor lookup fails or for local sourcing.
    """
    try:
        from shopping_search import shopping_fallback_search  # type: ignore
        results = shopping_fallback_search(mpn=mpn, description=description, max_results=5)
        if not results:
            return f"No results found for '{mpn}'."
        parts = []
        for r in results[:4]:
            title = r.get("title") or r.get("name") or "Unknown"
            price = r.get("price") or "N/A"
            source = r.get("source") or r.get("store") or "Unknown store"
            parts.append(f"• {title} — {price} at {source}")
        return "\n".join(parts)
    except Exception as exc:
        return f"Search error: {exc}"


@tool
def calculate(expression: str) -> str:
    """Safely evaluate a math expression like '100*12 + 50*8'. Useful for BOM cost calculations."""
    try:
        parsed = ast.parse(expression, mode="eval")
        result = _eval_expr(parsed.body)
        return str(result)
    except Exception as exc:
        return f"Calculation error: {exc}"


# ── LLM selection ─────────────────────────────────────────────────────────────

def _build_llm():
    groq_key = os.getenv("GROQ_API_KEY", "")
    if groq_key:
        from langchain_groq import ChatGroq
        # llama-3.1-8b-instant: 131K TPM free — much higher than 70b (12K TPM)
        model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
        return ChatGroq(api_key=groq_key, model=model, temperature=0)

    azure_key = os.getenv("AZURE_OPENAI_API_KEY", "")
    azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "")
    azure_version = os.getenv("AZURE_OPENAI_API_VERSION", "")
    azure_deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "")

    if all([azure_key, azure_endpoint, azure_version, azure_deployment]):
        from langchain_openai import AzureChatOpenAI
        return AzureChatOpenAI(
            api_key=azure_key,
            azure_endpoint=azure_endpoint,
            api_version=azure_version,
            azure_deployment=azure_deployment,
            temperature=0,
        )

    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    if anthropic_key:
        from langchain_anthropic import ChatAnthropic
        model = os.getenv("CHAT_LLM_MODEL", "claude-haiku-4-5-20251001")
        return ChatAnthropic(api_key=anthropic_key, model=model, temperature=0)

    gemini_key = os.getenv("GOOGLE_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
    if gemini_key:
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            model = os.getenv("CHAT_LLM_MODEL", "gemini-2.0-flash")
            return ChatGoogleGenerativeAI(google_api_key=gemini_key, model=model, temperature=0)
        except ImportError:
            pass

    openai_key = os.getenv("OPENAI_API_KEY", "")
    if openai_key:
        from langchain_openai import ChatOpenAI
        model = os.getenv("CHAT_LLM_MODEL", "gpt-4o-mini")
        return ChatOpenAI(api_key=openai_key, model=model, temperature=0)

    raise RuntimeError(
        "No LLM configured. Set GROQ_API_KEY (free), ANTHROPIC_API_KEY, GOOGLE_API_KEY, "
        "AZURE_OPENAI_API_KEY, or OPENAI_API_KEY."
    )


# ── BOM Data Tools (query live uploaded BOM data) ─────────────────────────────

@tool
def get_bom_summary(rfq_code: str = "") -> str:
    """
    Get a summary of the current BOM — total items, breakdown by type (BOP/CDP/MECHANICAL),
    items needing review, and total estimated cost.
    Pass rfq_code to filter by a specific BOM, or leave empty for the latest.
    """
    try:
        from database import get_db  # type: ignore
        db = get_db()
        query = "SELECT 'BOP' as item_type, COUNT(*) as cnt FROM bom_components"
        params: list = []
        if rfq_code:
            query += " WHERE rfq_code = ?"
            params.append(rfq_code)
        query += " GROUP BY item_type"
        rows = db.execute(query, params).fetchall()
        if not rows:
            return "No BOM data found. Please upload a BOM first."
        breakdown = ", ".join(f"{r[0]}: {r[1]}" for r in rows)
        total = sum(r[1] for r in rows)
        return f"Total items: {total} | Breakdown: {breakdown}"
    except Exception as exc:
        return f"Could not fetch BOM summary: {exc}"


@tool
def search_bom_items(keyword: str, rfq_code: str = "") -> str:
    """
    Search BOM items by description or MPN keyword.
    Returns matching components with their type, quantity, and best price.
    """
    try:
        from database import get_db  # type: ignore
        db = get_db()
        query = """
            SELECT bc.description, bc.mpn, bc.quantity,
                   MIN(vp.unit_price) as best_price, vp.vendor_code
            FROM bom_components bc
            LEFT JOIN vendor_prices vp ON bc.mpn = vp.mpn AND bc.rfq_code = vp.rfq_code
            WHERE (bc.description LIKE ? OR bc.mpn LIKE ?)
        """
        params = [f"%{keyword}%", f"%{keyword}%"]
        if rfq_code:
            query += " AND bc.rfq_code = ?"
            params.append(rfq_code)
        query += " GROUP BY bc.mpn LIMIT 8"
        rows = db.execute(query, params).fetchall()
        if not rows:
            return f"No BOM items found matching '{keyword}'."
        lines = []
        for r in rows:
            desc, mpn, qty, price, vendor = r
            price_str = f"₹{price:.2f}" if price else "no price yet"
            lines.append(f"• {desc} ({mpn}) | Qty: {qty} | {price_str}")
        return "\n".join(lines)
    except Exception as exc:
        return f"Could not search BOM items: {exc}"


@tool
def get_bom_cost_summary(rfq_code: str = "") -> str:
    """
    Calculate the total BOM cost — sum of (best_price × quantity) for all priced items.
    Also shows how many items are unpriced.
    """
    try:
        from database import get_db  # type: ignore
        db = get_db()
        query = """
            SELECT MIN(vp.unit_price) as best_price, bc.quantity, bc.description
            FROM bom_components bc
            LEFT JOIN vendor_prices vp ON bc.mpn = vp.mpn AND bc.rfq_code = vp.rfq_code
        """
        params: list = []
        if rfq_code:
            query += " WHERE bc.rfq_code = ?"
            params.append(rfq_code)
        query += " GROUP BY bc.id"
        rows = db.execute(query, params).fetchall()
        if not rows:
            return "No BOM data found. Upload a BOM file first."
        total = 0.0
        unpriced = 0
        for price, qty, _ in rows:
            if price and qty:
                try:
                    total += float(price) * float(qty)
                except (TypeError, ValueError):
                    unpriced += 1
            else:
                unpriced += 1
        priced = len(rows) - unpriced
        return (
            f"Total BOM cost: ₹{total:,.2f} "
            f"({priced}/{len(rows)} items priced, {unpriced} unpriced)"
        )
    except Exception as exc:
        return f"Could not calculate BOM cost: {exc}"


@tool
def get_unpriced_items(rfq_code: str = "") -> str:
    """
    List BOM items that have no price yet — useful to identify sourcing gaps.
    """
    try:
        from database import get_db  # type: ignore
        db = get_db()
        query = """
            SELECT bc.description, bc.mpn, bc.quantity
            FROM bom_components bc
            LEFT JOIN vendor_prices vp ON bc.mpn = vp.mpn AND bc.rfq_code = vp.rfq_code
            WHERE vp.unit_price IS NULL
        """
        params: list = []
        if rfq_code:
            query += " AND bc.rfq_code = ?"
            params.append(rfq_code)
        query += " GROUP BY bc.mpn LIMIT 10"
        rows = db.execute(query, params).fetchall()
        if not rows:
            return "All BOM items have been priced."
        lines = [f"• {r[0]} ({r[1]}) — {r[2]} pcs" for r in rows]
        return f"{len(rows)} unpriced items:\n" + "\n".join(lines)
    except Exception as exc:
        return f"Could not fetch unpriced items: {exc}"


@tool
def search_vendors(query: str, rfq_type: str = "") -> str:
    """
    Search the vendor directory by name, category, or city.
    Optionally filter by rfq_type: SOURCING, MANUFACTURER, ASSEMBLY, or TECHNOLOGY.
    Use this when the user asks about suppliers or who to contact for a part.
    """
    try:
        from database import get_db  # type: ignore
        db = get_db()
        sql = """
            SELECT vendor_name, category, rfq_type, city, website
            FROM rfq_vendor_db
            WHERE (vendor_name LIKE ? OR category LIKE ? OR city LIKE ?)
        """
        params = [f"%{query}%", f"%{query}%", f"%{query}%"]
        if rfq_type:
            sql += " AND rfq_type = ?"
            params.append(rfq_type.upper())
        sql += " LIMIT 8"
        rows = db.execute(sql, params).fetchall()
        if not rows:
            return f"No vendors found matching '{query}'."
        lines = []
        for r in rows:
            name = r[0] or r["vendor_name"]
            cat = r[1] or r["category"] or "—"
            rtype = r[2] or r["rfq_type"] or "—"
            city = r[3] or r["city"] or "—"
            site = r[4] or r["website"] or ""
            lines.append(f"• {name} [{rtype}] — {cat} | {city}" + (f" | {site}" if site else ""))
        return "\n".join(lines)
    except Exception as exc:
        return f"Could not search vendors: {exc}"


def _fetch_one_price(name: str, module: str, func: str, mpn: str) -> str:
    try:
        import importlib
        m = importlib.import_module(module)
        r = getattr(m, func)(mpn)
        if r:
            price = r.get("price") or r.get("unit_price") or "N/A"
            stock = r.get("stock") or r.get("availability") or ""
            return f"{name}: ₹{price}" + (f" (stock: {stock})" if stock else "")
        return f"{name}: not found"
    except Exception as exc:
        return f"{name}: error ({exc})"


@tool
def lookup_all_prices(mpn: str) -> str:
    """
    Look up real-time pricing across ALL distributors: Mouser, Element14, Digikey, LCSC, and Arrow.
    Use this for comprehensive multi-distributor price comparison on a specific MPN.
    Results are cached for 1 hour.
    """
    cache_key = f"prices:{mpn.strip().upper()[:60]}"
    cached = _cache_get(cache_key)
    if cached:
        return f"[cached] {cached}"

    sources = [
        ("Mouser",    "Mouser_fetch",    "get_mouser_price"),
        ("Element14", "element14_fetch", "get_element14_price"),
        ("Digikey",   "Digikey_fetch",   "get_digikey_price"),
        ("LCSC",      "lcsc_fetch",      "get_lcsc_price"),
        ("Arrow",     "arrow_fetch",     "get_arrow_price"),
    ]
    results: list[str] = [""] * len(sources)
    with ThreadPoolExecutor(max_workers=5) as ex:
        futures = {
            ex.submit(_fetch_one_price, name, mod, fn, mpn): i
            for i, (name, mod, fn) in enumerate(sources)
        }
        for fut in as_completed(futures):
            results[futures[fut]] = fut.result()

    out = "\n".join(results) if any(results) else f"No pricing found for {mpn}"
    _cache_set(cache_key, out)
    return out


@tool
def search_indian_stores(mpn: str, description: str = "") -> str:
    """
    Search Indian electronics stores via web scraping: Robu, Evelta, ElectronicsComp,
    Flyrobo, Robocraze, Robokits, Sharvi, TenetTech.
    Use for local Indian sourcing when global distributors don't have the part.
    """
    try:
        from indian_stores_fetch import get_indian_best_price  # type: ignore
        results = get_indian_best_price(mpn=mpn, description=description)
        if not results:
            return f"No results found in Indian stores for '{mpn}'."
        items = results if isinstance(results, list) else [results]
        parts = []
        for r in items[:5]:
            title = r.get("title") or r.get("name") or mpn
            price = r.get("price") or "N/A"
            store = r.get("source") or r.get("store") or "Unknown"
            url   = r.get("url") or r.get("link") or ""
            line  = f"• {title} — {price} at {store}"
            if url:
                line += f"\n  {url}"
            parts.append(line)
        return "\n".join(parts)
    except Exception as exc:
        return f"Indian stores search error: {exc}"


@tool
def search_google_shopping(query: str) -> str:
    """
    Search Google Shopping for components, prices, and availability.
    Use for broad market searches when the MPN is unknown or for price benchmarking.
    """
    try:
        from shopping_search import get_google_shopping_results  # type: ignore
        results = get_google_shopping_results(query, max_results=5)
        if not results:
            return f"No Google Shopping results for '{query}'."
        parts = []
        for r in results[:5]:
            title  = r.get("title") or "Unknown"
            price  = r.get("price") or "N/A"
            source = r.get("source") or r.get("merchant") or "Unknown"
            parts.append(f"• {title} — {price} at {source}")
        return "\n".join(parts)
    except Exception as exc:
        return f"Google Shopping search error: {exc}"


@tool
def get_live_bom_context() -> str:
    """
    Get a quick snapshot of the current BOM — total items, types, cost, top unpriced.
    Call this at the start of any conversation that mentions 'my BOM', 'our BOM',
    'upload', 'components', or asks about the current project status.
    """
    try:
        from database import get_db  # type: ignore
        db = get_db()
        rows = db.execute(
            """
            SELECT COUNT(bc.id) as total,
                   SUM(CASE WHEN vp.unit_price IS NOT NULL THEN 1 ELSE 0 END) as priced,
                   SUM(CASE WHEN vp.unit_price IS NOT NULL THEN vp.unit_price * bc.quantity ELSE 0 END) as total_cost
            FROM bom_components bc
            LEFT JOIN vendor_prices vp ON bc.mpn = vp.mpn AND bc.rfq_code = vp.rfq_code
            """
        ).fetchall()
        if not rows or not rows[0][0]:
            return "No BOM loaded yet. Ask the user to upload a BOM file from the dashboard first."
        total      = rows[0][0] or 0
        priced     = rows[0][1] or 0
        total_cost = rows[0][2] or 0
        breakdown  = f"Total: {total}"
        unpriced_rows = db.execute(
            """SELECT bc.description, bc.mpn FROM bom_components bc
               LEFT JOIN vendor_prices vp ON bc.mpn=vp.mpn AND bc.rfq_code=vp.rfq_code
               WHERE vp.unit_price IS NULL GROUP BY bc.mpn LIMIT 5"""
        ).fetchall()
        unpriced_str = ""
        if unpriced_rows:
            unpriced_str = "\nTop unpriced: " + "; ".join(f"{r[0]} ({r[1]})" for r in unpriced_rows)
        return (
            f"BOM Status: {total} items | {breakdown}\n"
            f"Priced: {priced}/{total} | Estimated cost: ₹{total_cost:,.0f}"
            f"{unpriced_str}"
        )
    except Exception as exc:
        return f"Could not fetch BOM context: {exc}"


_TOOLS = [
    get_live_bom_context,
    identify_part,
    classify_component,
    lookup_component_price,
    lookup_all_prices,
    search_component_online,
    search_indian_stores,
    search_google_shopping,
    calculate,
    get_bom_summary,
    search_bom_items,
    get_bom_cost_summary,
    get_unpriced_items,
    search_vendors,
]

_SYSTEM_PROMPT = """You are an expert electronics procurement engineer with 15+ years experience \
in sourcing electronic and mechanical components for Indian manufacturing. \
You think and respond like a seasoned procurement professional.

PART TYPE LOGIC (how you think):
- BOP (Bill of Purchase): Standard off-the-shelf parts — resistors, capacitors, ICs, connectors, \
  sensors, displays, modules, motors, batteries, standard hardware. Buy from distributors.
- CDP (Custom Design Part): Requires a drawing or spec — enclosures, brackets, cable harnesses, \
  custom PCBs, injection-molded parts, sheet metal, CNC parts.
- MECHANICAL: Standard catalog hardware — screws, bolts, standoffs, heatsinks, fans, gaskets, \
  cable ties. Buy from hardware stores or Robu/Amazon.
- ASSEMBLY: Manufacturing services — PCBA, SMT, box build, testing, programming, conformal coat.

SOURCING WORKFLOW (how a procurement engineer thinks):
1. Identify part type (BOP/CDP/MECHANICAL/ASSEMBLY)
2. For BOP: find MPN → check Mouser/Element14/Digikey/LCSC/Arrow → compare with Indian stores
3. For Indian availability: Robu, Evelta, ElectronicsComp, Flyrobo, Robocraze, Robokits, Sharvi
4. If MPN unknown: use Google Shopping or describe part to find MPN
5. Check stock, lead time, MOQ, and price breaks (1/10/100/1000 pcs)
6. For custom parts: find manufacturer via vendor directory

TOOL SELECTION:
- "what is X" / "what type is X" → identify_part (gives full intelligence)
- Unknown part / first time seeing it → identify_part first, then price lookup
- Known MPN, want price fast → lookup_component_price
- Full price comparison → lookup_all_prices + search_indian_stores
- Indian local sourcing → search_indian_stores
- Market price check → search_google_shopping
- BOM data questions → BOM data tools
- Find supplier/vendor → search_vendors

RESPONSE STYLE:
- Lead with the most useful fact (price, type, availability)
- Always cite the source of prices
- Give actionable next steps ("Check Robu.in for stock", "LCSC has best price at ₹X")
- Use ₹ for Indian Rupees
- For WhatsApp: keep replies under 800 chars, use bullet points
- If Groq rate limits: give partial answer from known knowledge, note live search failed
"""


# ── LLM + Agent singletons (lazy, built once per process) ────────────────────

_agent = None
_llm   = None


def _get_llm():
    global _llm
    if _llm is None:
        _llm = _build_llm()
    return _llm


def _get_agent():
    global _agent
    if _agent is None:
        _agent = create_react_agent(_get_llm(), tools=_TOOLS, prompt=_SYSTEM_PROMPT)
    return _agent


def _format_prices_plain(raw: str, part: str) -> str:
    """Format raw price data into WhatsApp-friendly plain text — no LLM needed."""
    lines = [l.strip() for l in raw.strip().splitlines() if l.strip()]
    found, not_found = [], []
    for line in lines:
        if "not found" in line.lower() or "error" in line.lower():
            not_found.append(line.split(":")[0].strip())
        else:
            found.append(line)

    out = f"Prices for {part}:\n"
    if found:
        out += "\n".join(f"• {l}" for l in found)
    if not_found:
        out += f"\nNot found: {', '.join(not_found)}"
    return out[:700]


_PRICE_TRIGGERS  = frozenset(["price", "cost", "rate", "how much", "buy", "purchase", "rs ", "inr", "rupee"])
_INDIAN_TRIGGERS = frozenset(["india", "indian", "robu", "evelta", "local store", "local shop"])
_BOM_TRIGGERS    = frozenset(["my bom", "bom summary", "my components", "my parts", "show bom", "bom status", "analyse", "analyze", "analysis", "bom cost", "total cost"])
_VENDOR_TRIGGERS = frozenset(["vendor", "supplier", "sourcing vendor", "who supply", "who sells"])


def _extract_part(message: str) -> str:
    """Pull the most likely part name / MPN out of a message."""
    # Remove leading question words
    clean = re.sub(r"(?i)^(what is the price of|price of|cost of|how much is|find|get|show|search for|look up)\s+", "", message.strip())
    # Prefer uppercase tokens that look like MPNs (e.g. ESP32, AO3415E, 0603WAF...)
    mpn_match = re.search(r'\b([A-Z0-9][A-Z0-9\-]{3,})\b', clean.upper())
    if mpn_match:
        return mpn_match.group(1)
    return clean.strip()


def fast_chat(message: str) -> str:
    """
    Fast single-step chat for WhatsApp — bypasses the ReAct agent for common patterns.
    Uses 1 tool call + 1 LLM format call instead of 3-5 ReAct iterations.
    Falls back to the full agent for complex / unrecognised queries.
    """
    msg_lower = message.lower()

    # BOM context — no LLM needed, pure DB query
    if any(w in msg_lower for w in _BOM_TRIGGERS):
        return get_live_bom_context.invoke({})

    # Vendor search — direct DB query
    if any(w in msg_lower for w in _VENDOR_TRIGGERS):
        part = _extract_part(message)
        return search_vendors.invoke({"query": part})

    # Price lookup — parallel fetch + Python format (no LLM)
    if any(w in msg_lower for w in _PRICE_TRIGGERS):
        part = _extract_part(message)
        raw = lookup_all_prices.invoke({"mpn": part})
        return _format_prices_plain(raw, part)

    # Indian store search
    if any(w in msg_lower for w in _INDIAN_TRIGGERS):
        part = _extract_part(message)
        raw = search_indian_stores.invoke({"mpn": part, "description": message})
        return raw[:700]

    # Part identification — pure keyword logic, no LLM
    mpn_match = re.search(r'\b([A-Z0-9][A-Z0-9\-]{3,})\b', message.upper())
    if mpn_match or any(w in msg_lower for w in ["what is", "what type", "identify", "classify", "tell me about"]):
        part = mpn_match.group(1) if mpn_match else _extract_part(message)
        return identify_part.invoke({"query": part})[:700]

    # Fallback — full ReAct agent
    return chat(message)


def chat(message: str) -> str:
    """Send a message to the BOM chat agent and return the text reply."""
    agent = _get_agent()
    for attempt in range(3):
        try:
            result = agent.invoke({"messages": [("user", message)]})
            return result["messages"][-1].content
        except Exception as exc:
            if "rate_limit" in str(exc).lower() or "429" in str(exc):
                wait = 10 * (attempt + 1)
                logging.warning("Groq rate limit hit, retrying in %ds (attempt %d/3)", wait, attempt + 1)
                time.sleep(wait)
            else:
                raise
    result = agent.invoke({"messages": [("user", message)]})
    return result["messages"][-1].content
