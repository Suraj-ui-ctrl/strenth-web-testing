"""
Cost Benchmarking Pipeline
===========================
Standalone orchestrator that runs a full BOM cost benchmark using all
price-fetch, EOL, HSN, and duty modules.

Usage
-----
    python cost_benchmarking_pipeline.py path/to/BOM.xlsx
    python cost_benchmarking_pipeline.py path/to/BOM.csv --pcb-qty 5

Output
------
    <input_stem>_cost_report.json   — full per-part data
    <input_stem>_cost_report.csv    — spreadsheet-ready summary

Modules used
------------
    BOM_Parser            — parse CSV / Excel BOM
    Mouser_fetch          — Mouser India pricing
    Digikey_fetch         — DigiKey India pricing
    lcsc_fetch            — LCSC pricing (USD→INR landed)
    element14_fetch       — Element14 India pricing
    arrow_fetch           — Arrow Electronics pricing
    indian_stores_fetch   — Sunrom / Ktron (native INR)
    shopping_search       — Fallback: 11 Indian stores + Gemini AI
    hsn_lookup            — HSN code + manufacturer inference
    eol_fetch             — EOL / lifecycle status
    custom_duty           — CBIC BCD + IGST calculation
    cybex_lookup          — Cybex duty cross-verification (background)

Environment variables required (set in .env):
    MOUSER_API_KEY, DIGIKEY_CLIENT_ID, DIGIKEY_CLIENT_SECRET,
    ELEMENT14_API_KEY, ARROW_API_KEY (optional),
    ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY / GOOGLE_API_KEY
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed, wait as _cf_wait
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()

# ── Internal modules ──────────────────────────────────────────────────────────
from BOM_Parser import parse_bom
from Digikey_fetch import get_digikey_price, get_digikey_token
from Mouser_fetch import get_mouser_price
from arrow_fetch import get_arrow_price
from custom_duty import calculate_import_duty, get_duty_rates
from element14_fetch import get_element14_price
from eol_fetch import get_eol_bulk
from hsn_lookup import get_hsn_bulk, infer_hsn_local, infer_manufacturer_local
from indian_stores_fetch import get_indian_best_price
from lcsc_fetch import get_lcsc_price
from shopping_search import shopping_fallback_search

logging.basicConfig(
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    level=logging.INFO,
)
log = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

VENDOR_TIMEOUT = float(os.getenv("VENDOR_TIMEOUT_SECONDS", "10"))
MAX_WORKERS    = int(os.getenv("BENCH_MAX_WORKERS", "8"))

_VENDOR_FETCHERS = [
    ("mouser",     lambda mpn, _tok: get_mouser_price(mpn)),
    ("digikey",    lambda mpn,  tok: get_digikey_price(mpn, tok) if tok else None),
    ("element14",  lambda mpn, _tok: get_element14_price(mpn)),
    ("lcsc",       lambda mpn, _tok: get_lcsc_price(mpn)),
    ("arrow",      lambda mpn, _tok: get_arrow_price(mpn)),
    ("indian",     lambda mpn, _tok: get_indian_best_price(mpn)),
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_float(val: Any) -> float | None:
    try:
        return float(str(val).replace(",", "").replace("₹", "").strip())
    except (TypeError, ValueError):
        return None


def _best_vendor(prices: dict[str, dict]) -> tuple[str | None, float | None]:
    best_vendor, best_price = None, None
    for vendor, info in prices.items():
        p = _to_float(info.get("price"))
        if p and (best_price is None or p < best_price):
            best_vendor, best_price = vendor, p
    return best_vendor, best_price


def _fetch_all_prices(mpn: str, dk_token: str | None) -> dict[str, dict]:
    """Fetch prices from all vendors in parallel; return {vendor: result_dict}."""
    results: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {
            ex.submit(fn, mpn, dk_token): name
            for name, fn in _VENDOR_FETCHERS
        }
        done, _ = _cf_wait(list(futures), timeout=VENDOR_TIMEOUT)
        for future in done:
            name = futures[future]
            try:
                result = future.result(timeout=0)
                if result and _to_float(result.get("price")):
                    results[name] = result
            except Exception as exc:
                log.debug("Vendor %s failed for %s: %s", name, mpn, exc)
    return results


def _shopping_fallback(mpn: str, description: str) -> list[dict]:
    """Run shopping_fallback_search only when main vendors found nothing."""
    try:
        return shopping_fallback_search(mpn, description, max_results=4)
    except Exception as exc:
        log.debug("Shopping fallback error for %s: %s", mpn, exc)
        return []


# ── Main pipeline ──────────────────────────────────────────────────────────────

def run_cost_benchmark(
    bom_file: str,
    pcb_qty: int = 1,
) -> dict:
    """
    Run the full cost benchmarking pipeline for a BOM file.

    Returns
    -------
    dict with keys:
        components   — per-part results list
        summary      — totals and stats
        bom_file     — input file path
        pcb_qty      — PCB build quantity
        generated_at — ISO timestamp
    """
    t0 = time.time()
    log.info("Starting cost benchmark for '%s' (pcb_qty=%d)", bom_file, pcb_qty)

    # ── Step 1: Parse BOM ─────────────────────────────────────────────────────
    components = parse_bom(bom_file)
    if not components:
        raise ValueError(f"No components parsed from '{bom_file}'")
    log.info("Parsed %d components from BOM", len(components))

    # ── Step 2: Warm DigiKey token (non-blocking) ─────────────────────────────
    dk_token: str | None = None
    try:
        with ThreadPoolExecutor(max_workers=1) as ex:
            dk_fut = ex.submit(get_digikey_token)
            done, _ = _cf_wait([dk_fut], timeout=6)
            dk_token = dk_fut.result(timeout=0) if done else None
    except Exception:
        pass
    log.info("DigiKey token: %s", "ready" if dk_token else "unavailable")

    # ── Step 3: HSN codes + manufacturer in bulk (parallel AI calls) ──────────
    log.info("Fetching HSN codes for %d parts…", len(components))
    try:
        hsn_results = get_hsn_bulk(components)
    except Exception as exc:
        log.warning("HSN bulk lookup failed: %s — using local inference", exc)
        hsn_results = {}

    for comp in components:
        mpn = comp.get("MPN", "")
        desc = comp.get("Description", "")
        hsn_entry = hsn_results.get(mpn, {})
        comp["hsn_code"]     = hsn_entry.get("hsn_code") or infer_hsn_local(mpn, desc)
        comp["manufacturer"] = hsn_entry.get("manufacturer") or infer_manufacturer_local(mpn)

    # ── Step 4: EOL status in bulk ────────────────────────────────────────────
    log.info("Fetching EOL status for %d parts…", len(components))
    try:
        eol_results = get_eol_bulk(components)
    except Exception as exc:
        log.warning("EOL bulk lookup failed: %s", exc)
        eol_results = {}

    # ── Step 5: Prices — all vendors in parallel per part ─────────────────────
    log.info("Fetching prices from all vendors…")

    def _process_part(comp: dict) -> dict:
        mpn  = str(comp.get("MPN", "")).strip()
        desc = str(comp.get("Description", "")).strip()
        qty  = max(1, int(comp.get("Quantity", 1) or 1))
        build_qty = qty * pcb_qty

        prices = _fetch_all_prices(mpn, dk_token)

        # Shopping fallback when no main vendors returned results
        if not prices and (mpn or desc):
            hits = _shopping_fallback(mpn, desc)
            for hit in hits:
                vendor = str(hit.get("vendor_name") or "shopping").strip()
                prices[vendor] = {
                    "price":      hit.get("unit_price"),
                    "stock":      hit.get("stock"),
                    "moq":        hit.get("moq", 1),
                    "lead_time":  "N/A",
                    "url":        hit.get("product_url", ""),
                    "price_breaks": hit.get("price_breaks", []),
                }

        best_vendor, best_unit_price = _best_vendor(prices)

        # ── Duty calculation ──────────────────────────────────────────────────
        hsn    = comp.get("hsn_code", "")
        duty   = calculate_import_duty(best_unit_price, hsn, build_qty) if best_unit_price else None

        # ── EOL ───────────────────────────────────────────────────────────────
        eol = eol_results.get(mpn, {})

        return {
            "mpn":          mpn,
            "description":  desc,
            "manufacturer": comp.get("manufacturer", ""),
            "hsn_code":     hsn,
            "quantity":     qty,
            "build_qty":    build_qty,
            "prices":       {
                v: {
                    "unit_price":  _to_float(info.get("price")),
                    "stock":       info.get("stock"),
                    "moq":         info.get("moq"),
                    "lead_time":   info.get("lead_time"),
                    "url":         info.get("url", ""),
                }
                for v, info in prices.items()
            },
            "best_vendor":      best_vendor,
            "best_unit_price":  best_unit_price,
            "total_cost":       round(best_unit_price * build_qty, 2) if best_unit_price else None,
            "landed_cost":      duty.get("total_landed_cost") if duty else None,
            "duty": {
                "bcd_rate":         duty.get("bcd_rate"),
                "igst_rate":        duty.get("igst_rate"),
                "total_duty":       duty.get("total_duty"),
                "effective_pct":    duty.get("effective_duty_pct"),
                "cybex_verified":   duty.get("cybex_verified"),
            } if duty else None,
            "eol": {
                "status":     eol.get("status"),
                "risk_level": eol.get("risk_level"),
                "source":     eol.get("source"),
                "notes":      eol.get("notes"),
            } if eol else None,
        }

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        part_futures = {ex.submit(_process_part, comp): comp for comp in components}
        for future in as_completed(part_futures):
            comp = part_futures[future]
            try:
                results.append(future.result())
            except Exception as exc:
                log.warning("Part %s failed: %s", comp.get("MPN", "?"), exc)
                results.append({
                    "mpn":         comp.get("MPN", ""),
                    "description": comp.get("Description", ""),
                    "error":       str(exc),
                })

    results.sort(key=lambda r: (r.get("total_cost") is None, -(r.get("total_cost") or 0)))

    # ── Summary ───────────────────────────────────────────────────────────────
    priced = [r for r in results if r.get("best_unit_price")]
    total_component_cost = sum(r["total_cost"] for r in priced if r.get("total_cost"))
    total_landed          = sum(r["landed_cost"] for r in priced if r.get("landed_cost"))
    eol_risks = {
        "critical": sum(1 for r in results if (r.get("eol") or {}).get("risk_level") == "critical"),
        "high":     sum(1 for r in results if (r.get("eol") or {}).get("risk_level") == "high"),
        "medium":   sum(1 for r in results if (r.get("eol") or {}).get("risk_level") == "medium"),
    }

    summary = {
        "total_parts":           len(results),
        "priced_parts":          len(priced),
        "unpriced_parts":        len(results) - len(priced),
        "total_component_cost":  round(total_component_cost, 2),
        "total_landed_cost":     round(total_landed, 2),
        "elapsed_seconds":       round(time.time() - t0, 1),
        "eol_risk_counts":       eol_risks,
        "currency":              "INR",
    }

    log.info(
        "Benchmark complete: %d/%d parts priced | ₹%.2f component | ₹%.2f landed | %.1fs",
        len(priced), len(results),
        total_component_cost, total_landed,
        time.time() - t0,
    )

    return {
        "bom_file":     bom_file,
        "pcb_qty":      pcb_qty,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "components":   results,
        "summary":      summary,
    }


# ── CSV writer ─────────────────────────────────────────────────────────────────

def write_csv_report(report: dict, output_path: str) -> None:
    fieldnames = [
        "mpn", "description", "manufacturer", "hsn_code",
        "quantity", "build_qty",
        "best_vendor", "best_unit_price", "total_cost", "landed_cost",
        "mouser_price", "digikey_price", "lcsc_price", "element14_price",
        "arrow_price", "indian_price",
        "eol_status", "eol_risk",
        "duty_bcd_pct", "duty_igst_pct", "duty_total", "duty_eff_pct",
    ]
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for r in report["components"]:
            prices = r.get("prices", {})
            eol    = r.get("eol") or {}
            duty   = r.get("duty") or {}
            row = {
                "mpn":             r.get("mpn", ""),
                "description":     r.get("description", ""),
                "manufacturer":    r.get("manufacturer", ""),
                "hsn_code":        r.get("hsn_code", ""),
                "quantity":        r.get("quantity", ""),
                "build_qty":       r.get("build_qty", ""),
                "best_vendor":     r.get("best_vendor", ""),
                "best_unit_price": r.get("best_unit_price", ""),
                "total_cost":      r.get("total_cost", ""),
                "landed_cost":     r.get("landed_cost", ""),
                "mouser_price":    (prices.get("mouser") or {}).get("unit_price", ""),
                "digikey_price":   (prices.get("digikey") or {}).get("unit_price", ""),
                "lcsc_price":      (prices.get("lcsc") or {}).get("unit_price", ""),
                "element14_price": (prices.get("element14") or {}).get("unit_price", ""),
                "arrow_price":     (prices.get("arrow") or {}).get("unit_price", ""),
                "indian_price":    (prices.get("indian") or {}).get("unit_price", ""),
                "eol_status":      eol.get("status", ""),
                "eol_risk":        eol.get("risk_level", ""),
                "duty_bcd_pct":    duty.get("bcd_rate", ""),
                "duty_igst_pct":   duty.get("igst_rate", ""),
                "duty_total":      duty.get("total_duty", ""),
                "duty_eff_pct":    duty.get("effective_pct", ""),
            }
            writer.writerow(row)


# ── CLI entry point ────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run full cost benchmarking for a BOM file."
    )
    parser.add_argument("bom_file", help="Path to BOM (.xlsx or .csv)")
    parser.add_argument(
        "--pcb-qty", type=int, default=1,
        help="Number of PCB assemblies (multiplies per-part quantities). Default: 1",
    )
    parser.add_argument(
        "--json-only", action="store_true",
        help="Skip CSV output; only write JSON report",
    )
    args = parser.parse_args()

    bom_path = Path(args.bom_file)
    if not bom_path.exists():
        print(f"ERROR: File not found: {bom_path}", file=sys.stderr)
        sys.exit(1)

    report = run_cost_benchmark(str(bom_path), pcb_qty=args.pcb_qty)

    stem = bom_path.stem
    json_out = bom_path.parent / f"{stem}_cost_report.json"
    csv_out  = bom_path.parent / f"{stem}_cost_report.csv"

    json_out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nJSON report  : {json_out}")

    if not args.json_only:
        write_csv_report(report, str(csv_out))
        print(f"CSV report   : {csv_out}")

    s = report["summary"]
    print(f"\nSummary")
    print(f"  Parts priced  : {s['priced_parts']} / {s['total_parts']}")
    print(f"  Component cost: ₹{s['total_component_cost']:,.2f}")
    print(f"  Landed cost   : ₹{s['total_landed_cost']:,.2f}")
    print(f"  EOL risks     : critical={s['eol_risk_counts']['critical']}  high={s['eol_risk_counts']['high']}  medium={s['eol_risk_counts']['medium']}")
    print(f"  Time elapsed  : {s['elapsed_seconds']}s")


if __name__ == "__main__":
    main()
