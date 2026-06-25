"""
Database Layer — BOM Procurement Tool
=======================================
Single-file SQLite data access layer.
All SQL is centralised here — no other module imports sqlite3 directly.

Schema
------
vendors          — local vendor registry
rfq              — one record per procurement session
rfq_vendors      — many-to-many: which vendors received which RFQ
bom_components   — BOM line items stored per RFQ
vendor_prices    — quoted prices returned by vendors via email
price_history    — time-series price snapshots per MPN per supplier (NEW)
"""

from __future__ import annotations

import logging
import os
import random
import re
import sqlite3
import string
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Generator

log = logging.getLogger(__name__)
DB_PATH = "bom_tool.db"


def _postgres_url() -> str:
    explicit = os.getenv("DATABASE_URL", "").strip()
    if explicit:
        return explicit
    if os.getenv("DB_BACKEND", "").strip().lower() not in {"postgres", "postgresql"}:
        return ""
    host = os.getenv("POSTGRES_HOST", "").strip()
    if not host:
        return ""
    user = os.getenv("POSTGRES_USER", "bom_user")
    password = os.getenv("POSTGRES_PASSWORD", "bom_password")
    db = os.getenv("POSTGRES_DB", "bom_db")
    port = os.getenv("POSTGRES_PORT", "5432")
    return f"postgresql://{user}:{password}@{host}:{port}/{db}"


def is_postgres() -> bool:
    return bool(_postgres_url())


_PG_CONFLICTS = {
    "hsn_approvals": ("mpn", "hsn_code"),
    "vendor_search_results": ("part_name", "item_type", "scale", "vendor_name"),
}


def _pg_sql(sql: str) -> str:
    out = sql.strip()
    out = re.sub(r"INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT", "BIGSERIAL PRIMARY KEY", out, flags=re.I)
    out = re.sub(r"\bREAL\b", "DOUBLE PRECISION", out, flags=re.I)
    out = re.sub(r"datetime\('now'\)", "CURRENT_TIMESTAMP", out, flags=re.I)

    replace_match = re.match(
        r"INSERT\s+OR\s+REPLACE\s+INTO\s+([a-zA-Z_][\w]*)\s*\((.*?)\)\s*VALUES\s*\((.*?)\)\s*;?\s*$",
        out,
        flags=re.I | re.S,
    )
    if replace_match:
        table = replace_match.group(1)
        cols = [c.strip() for c in replace_match.group(2).split(",")]
        conflict = _PG_CONFLICTS.get(table.lower())
        out = f"INSERT INTO {table} ({replace_match.group(2)}) VALUES ({replace_match.group(3)})"
        if conflict:
            updates = [f"{col}=EXCLUDED.{col}" for col in cols if col not in conflict and col.lower() != "id"]
            out += f" ON CONFLICT ({', '.join(conflict)}) DO UPDATE SET {', '.join(updates)}" if updates else f" ON CONFLICT ({', '.join(conflict)}) DO NOTHING"

    out = re.sub(r"INSERT\s+OR\s+IGNORE\s+INTO", "INSERT INTO", out, flags=re.I)
    if "INSERT INTO" in out.upper() and "ON CONFLICT" not in out.upper() and "OR IGNORE" not in sql.upper():
        pass
    elif "INSERT INTO" in out.upper() and "ON CONFLICT" not in out.upper():
        out += " ON CONFLICT DO NOTHING"

    out = out.replace("?", "%s")
    return out


class _PgRow(dict):
    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


class _PgCursor:
    def __init__(self, cur):
        self._cur = cur
        self.lastrowid = None

    def execute(self, sql: str, params=None):
        translated = _pg_sql(sql)
        self._cur.execute(translated, params or ())
        return self

    def executemany(self, sql: str, seq_of_params):
        self._cur.executemany(_pg_sql(sql), seq_of_params)
        return self

    def fetchone(self):
        row = self._cur.fetchone()
        return _PgRow(row) if isinstance(row, dict) else row

    def fetchall(self):
        return [_PgRow(r) if isinstance(r, dict) else r for r in self._cur.fetchall()]


class _PgConnection:
    def __init__(self):
        import psycopg
        from psycopg.rows import dict_row

        self._conn = psycopg.connect(_postgres_url(), row_factory=dict_row)

    def cursor(self):
        return _PgCursor(self._conn.cursor())

    def execute(self, sql: str, params=None):
        cur = self.cursor()
        return cur.execute(sql, params)

    def executemany(self, sql: str, seq_of_params):
        cur = self.cursor()
        return cur.executemany(sql, seq_of_params)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


@contextmanager
def _db() -> Generator[object, None, None]:
    if is_postgres():
        conn = _PgConnection()
    else:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA synchronous  = NORMAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_db() -> object:
    if is_postgres():
        return _PgConnection()
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db() -> None:
    with _db() as conn:
        cur = conn.cursor()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS vendors (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                vendor_code  TEXT    UNIQUE NOT NULL,
                vendor_name  TEXT    NOT NULL,
                vendor_email TEXT    NOT NULL,
                category     TEXT    DEFAULT 'General',
                created_at   TEXT    NOT NULL
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS contract_manufacturers (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                cm_code    TEXT    UNIQUE NOT NULL,
                cm_name    TEXT    NOT NULL,
                cm_email   TEXT    NOT NULL,
                category   TEXT    DEFAULT 'CDP',
                created_at TEXT    NOT NULL
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS rfq (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                rfq_code     TEXT    UNIQUE NOT NULL,
                bom_filename TEXT    NOT NULL,
                created_at   TEXT    NOT NULL
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS rfq_vendors (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                rfq_code        TEXT    NOT NULL,
                vendor_code     TEXT    NOT NULL,
                email_sent      INTEGER NOT NULL DEFAULT 0,
                reply_received  INTEGER NOT NULL DEFAULT 0,
                created_at      TEXT    NOT NULL,
                UNIQUE (rfq_code, vendor_code),
                FOREIGN KEY (rfq_code)    REFERENCES rfq(rfq_code),
                FOREIGN KEY (vendor_code) REFERENCES vendors(vendor_code)
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS bom_components (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                rfq_code    TEXT    NOT NULL,
                mpn         TEXT    NOT NULL,
                description TEXT    DEFAULT '',
                quantity    INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (rfq_code) REFERENCES rfq(rfq_code)
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS vendor_prices (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                rfq_code    TEXT    NOT NULL,
                vendor_code TEXT    NOT NULL,
                mpn         TEXT    NOT NULL,
                unit_price  REAL,
                moq         INTEGER,
                stock       TEXT,
                lead_time   TEXT,
                created_at  TEXT    NOT NULL,
                FOREIGN KEY (rfq_code)    REFERENCES rfq(rfq_code),
                FOREIGN KEY (vendor_code) REFERENCES vendors(vendor_code)
            )
        """)

        # price_history — time-series snapshots per MPN per supplier
        cur.execute("""
            CREATE TABLE IF NOT EXISTS price_history (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                mpn          TEXT    NOT NULL,
                supplier     TEXT    NOT NULL,
                rfq_code     TEXT,
                unit_price   REAL    NOT NULL,
                stock        TEXT,
                lead_time    TEXT,
                moq          INTEGER,
                currency     TEXT    DEFAULT 'INR',
                fetched_at   TEXT    NOT NULL
            )
        """)

        # Indexes
        cur.execute("CREATE INDEX IF NOT EXISTS idx_vp_mpn      ON vendor_prices(mpn)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_vp_rfq      ON vendor_prices(rfq_code)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_vp_vendor   ON vendor_prices(vendor_code)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_bom_rfq     ON bom_components(rfq_code)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_ph_mpn      ON price_history(mpn)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_ph_supplier ON price_history(mpn, supplier)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_ph_time     ON price_history(mpn, fetched_at)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_ph_rfq      ON price_history(rfq_code)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_cm_code     ON contract_manufacturers(cm_code)")

        # ── rfq_vendor_db — Excel-uploaded vendor master ───────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS rfq_vendor_db (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                vendor_name     TEXT    NOT NULL,
                vendor_email    TEXT    NOT NULL,
                contact_person  TEXT    DEFAULT '',
                phone           TEXT    DEFAULT '',
                category        TEXT    DEFAULT 'General',
                rfq_type        TEXT    DEFAULT 'SOURCING',
                city            TEXT    DEFAULT '',
                website         TEXT    DEFAULT '',
                mpn_keywords    TEXT    DEFAULT '',
                moq             INTEGER DEFAULT 1,
                lead_time_days  INTEGER DEFAULT 0,
                unit_price      REAL    DEFAULT NULL,
                currency        TEXT    DEFAULT 'INR',
                notes           TEXT    DEFAULT '',
                source_file     TEXT    DEFAULT '',
                created_at      TEXT    NOT NULL,
                updated_at      TEXT    NOT NULL
            )
        """)
        # Migration: add new columns before creating indexes that depend on them.
        # Use IF NOT EXISTS — supported in PostgreSQL 9.6+ and SQLite 3.37+.
        # Avoids aborting the transaction on "column already exists" in PostgreSQL.
        for _col, _def in [
            ("rfq_type", "TEXT DEFAULT 'SOURCING'"),
            ("city",     "TEXT DEFAULT ''"),
            ("website",  "TEXT DEFAULT ''"),
        ]:
            cur.execute(f"ALTER TABLE rfq_vendor_db ADD COLUMN IF NOT EXISTS {_col} {_def}")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_rfq_vdb_cat     ON rfq_vendor_db(category)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_rfq_vdb_name    ON rfq_vendor_db(vendor_name)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_rfq_vdb_rfqtype ON rfq_vendor_db(rfq_type)")

    log.info("Database ready: %s", "PostgreSQL" if is_postgres() else DB_PATH)
    print("Database ready (PostgreSQL)" if is_postgres() else "Database ready (SQLite local)")


def _generate_code(prefix: str, length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return f"{prefix}-" + "".join(random.choices(alphabet, k=length))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── Vendor ───────────────────────────────────────────────────────────────────

def add_vendor(name: str, email: str, category: str = "General") -> str:
    if not name or not email:
        raise ValueError("vendor name and email are required")
    vendor_code = _generate_code("VND")
    with _db() as conn:
        conn.execute(
            "INSERT INTO vendors (vendor_code, vendor_name, vendor_email, category, created_at) VALUES (?, ?, ?, ?, ?)",
            (vendor_code, name.strip(), email.strip(), category.strip(), _now()),
        )
    return vendor_code


def get_all_vendors() -> list[dict]:
    """Get all vendors with actual emails (INTERNAL USE ONLY)"""
    with _db() as conn:
        rows = conn.execute("SELECT * FROM vendors ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def _mask_email(email: str) -> str:
    """Mask email for display purposes - e.g., user@example.com → u***@example.com"""
    if not email or '@' not in email:
        return "***@***"
    local, domain = email.split('@', 1)
    if len(local) <= 1:
        masked_local = '*' * len(local)
    else:
        masked_local = local[0] + '*' * (len(local) - 2) + local[-1]
    return f"{masked_local}@{domain}"


def _mask_vendor_name(name: str) -> str:
    """Mask vendor name for display - show first char + asterisks - e.g., ABC Corp → A*****"""
    if not name:
        return "***"
    return name[0] + '*' * (len(name) - 1) if len(name) > 1 else name


# ─── Category → RFQ Type mapping ─────────────────────────────────────────────

CATEGORY_RFQ_TYPE: dict[str, str] = {
    # SOURCING — electronic components, distributors, traders
    "component trader":          "SOURCING",
    "global distributor":        "SOURCING",
    "component distributor":     "SOURCING",
    "semiconductor distributor": "SOURCING",
    "online retailer":           "SOURCING",
    "b2b e-commerce / mro":      "SOURCING",
    "component supplier":        "SOURCING",
    "component importer":        "SOURCING",
    "online component market":   "SOURCING",
    "technology distributor":    "SOURCING",
    "it distribution":           "SOURCING",
    "it hardware / electronics": "SOURCING",
    "automation & components":   "SOURCING",
    # MANUFACTURER — EMS, PCB assembly, manufacturing
    "ems / pcb assembly":        "MANUFACTURER",
    "ems / electronics":         "MANUFACTURER",
    "contract manufacturer":     "MANUFACTURER",
    "iot module manufacturer":   "MANUFACTURER",
    "power supply manufacturer": "MANUFACTURER",
    "manufacturing directory":   "MANUFACTURER",
    # ASSEMBLY — mechanical, cables, automotive parts
    "automotive components":     "ASSEMBLY",
    "automotive electronics":    "ASSEMBLY",
    "precision components":      "ASSEMBLY",
    "cables & wiring":           "ASSEMBLY",
    "connectors & cables":       "ASSEMBLY",
    "cables & connectivity":     "ASSEMBLY",
    # TECHNOLOGY — solutions, IoT, networking, services
    "technology solutions":      "TECHNOLOGY",
    "technology / iot":          "TECHNOLOGY",
    "gps / technology":          "TECHNOLOGY",
    "automation solutions":      "TECHNOLOGY",
    "design & sourcing":         "TECHNOLOGY",
    "engineering services":      "TECHNOLOGY",
    "sensors & connectors":      "TECHNOLOGY",
    "wireless modules":          "TECHNOLOGY",
    "display / lcd":             "TECHNOLOGY",
    "solar / energy":            "TECHNOLOGY",
    "testing & measurement":     "TECHNOLOGY",
    "communication equipment":   "TECHNOLOGY",
    "security & surveillance":   "TECHNOLOGY",
    "industrial components":     "TECHNOLOGY",
    "fiber optics / networking": "TECHNOLOGY",
    "biometrics / security":     "TECHNOLOGY",
    "networking equipment":      "TECHNOLOGY",
    "telecom / broadcasting":    "TECHNOLOGY",
    "networking / wireless":     "TECHNOLOGY",
    "networking / it":           "TECHNOLOGY",
    "safety & health equipment": "TECHNOLOGY",
    "av / broadcast equipment":  "TECHNOLOGY",
    "networking / gpon":         "TECHNOLOGY",
    "co-working / technology":   "TECHNOLOGY",
}

_SOURCING_KW = {"distributor", "trader", "supplier", "importer", "retailer", "e-commerce",
                "mro", "market", "component", "semiconductor", "electronic"}
_MANUFACTURER_KW = {"ems", "assembly", "pcb", "manufacturer", "manufacturing", "contract", "module"}
_ASSEMBLY_KW = {"automotive", "precision", "cable", "wiring", "connector", "mechanical", "hardware"}


def category_to_rfq_type(category: str) -> str:
    """Map a vendor category string to SOURCING/MANUFACTURER/ASSEMBLY/TECHNOLOGY."""
    key = str(category or "").lower().strip()
    if key in CATEGORY_RFQ_TYPE:
        return CATEGORY_RFQ_TYPE[key]
    # Fallback: keyword scan
    if any(kw in key for kw in _MANUFACTURER_KW):
        return "MANUFACTURER"
    if any(kw in key for kw in _ASSEMBLY_KW):
        return "ASSEMBLY"
    if any(kw in key for kw in _SOURCING_KW):
        return "SOURCING"
    return "SOURCING"  # default for unknown categories


def get_all_vendors_masked() -> list[dict]:
    """Get all vendors with MASKED emails & names for dashboard display (SECURITY)"""
    vendors = get_all_vendors()
    return [
        {
            **vendor,
            'vendor_email': _mask_email(vendor['vendor_email']),
            'vendor_name': _mask_vendor_name(vendor['vendor_name']),
            'vendor_email_hidden': True  # Flag to indicate data is masked
        }
        for vendor in vendors
    ]


def get_vendor_actual(vendor_code: str) -> dict | None:
    """Get ACTUAL vendor details (with real email & name) - INTERNAL USE ONLY FOR EMAIL SENDING"""
    with _db() as conn:
        row = conn.execute("SELECT * FROM vendors WHERE vendor_code = ?", (vendor_code,)).fetchone()
    return dict(row) if row else None


def delete_vendor(vendor_code: str) -> bool:
    """Delete a vendor by vendor_code"""
    try:
        with _db() as conn:
            conn.execute("DELETE FROM vendors WHERE vendor_code = ?", (vendor_code,))
        return True
    except Exception as e:
        log.error(f"Error deleting vendor {vendor_code}: {e}")
        return False


# ─── RFQ Vendor DB (Excel-uploaded vendor master) ─────────────────────────────

def upsert_rfq_vendor_db(rows: list[dict], source_file: str = "") -> int:
    """Bulk insert vendor rows from an Excel upload. Returns count inserted."""
    if not rows:
        return 0
    with _db() as conn:
        for row in rows:
            cat = str(row.get("category", "General")).strip() or "General"
            rtype = str(row.get("rfq_type", "")).strip() or category_to_rfq_type(cat)
            conn.execute(
                """INSERT INTO rfq_vendor_db
                   (vendor_name, vendor_email, contact_person, phone, category, rfq_type,
                    city, website, mpn_keywords, moq, lead_time_days, unit_price, currency,
                    notes, source_file, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(row.get("vendor_name", "")).strip(),
                    str(row.get("vendor_email", "")).strip(),
                    str(row.get("contact_person", "")).strip(),
                    str(row.get("phone", "")).strip(),
                    cat,
                    rtype,
                    str(row.get("city", "")).strip(),
                    str(row.get("website", "")).strip(),
                    str(row.get("mpn_keywords", "")).strip(),
                    int(row.get("moq") or 1),
                    int(row.get("lead_time_days") or 0),
                    float(row["unit_price"]) if row.get("unit_price") else None,
                    str(row.get("currency", "INR")).strip() or "INR",
                    str(row.get("notes", "")).strip(),
                    source_file,
                    _now(),
                    _now(),
                ),
            )
    return len(rows)


def get_rfq_vendor_db_masked() -> list[dict]:
    """Return all rfq_vendor_db rows with emails masked (safe for frontend)."""
    with _db() as conn:
        rows = conn.execute("SELECT * FROM rfq_vendor_db ORDER BY vendor_name").fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["vendor_email_masked"] = _mask_email(d.pop("vendor_email", ""))
        result.append(d)
    return result


def get_rfq_vendor_actual(vendor_id: int) -> dict | None:
    """Return actual vendor row (with real email) — INTERNAL/SERVER-SIDE ONLY."""
    with _db() as conn:
        row = conn.execute("SELECT * FROM rfq_vendor_db WHERE id = ?", (vendor_id,)).fetchone()
    return dict(row) if row else None


def clear_rfq_vendor_db() -> None:
    """Delete all rows in rfq_vendor_db (used before re-upload)."""
    with _db() as conn:
        conn.execute("DELETE FROM rfq_vendor_db")


def match_vendors_to_bom(components: list[dict]) -> dict:
    """Match rfq_vendor_db vendors to BOM components by rfq_type + MPN keywords.

    Returns {MPN_UPPER: [{"id": ..., "vendor_name": ..., "vendor_email_masked": ...,
                           "category": ..., "rfq_type": ..., "moq": ..., "lead_time_days": ...}]}
    """
    with _db() as conn:
        rows = conn.execute("SELECT * FROM rfq_vendor_db ORDER BY vendor_name").fetchall()
    vendors = [dict(r) for r in rows]
    if not vendors:
        return {}

    # Ensure rfq_type is populated (backfill for old rows that have NULL)
    for v in vendors:
        if not v.get("rfq_type"):
            v["rfq_type"] = category_to_rfq_type(v.get("category", ""))

    result: dict = {}
    for comp in components:
        mpn       = str(comp.get("mpn") or comp.get("MPN", "")).upper().strip()
        item_type = str(comp.get("item_type", "BOP")).upper()

        # Determine which rfq_types are relevant for this component type
        if item_type in ("BOP", "PASSIVE", "ACTIVE"):
            wanted_types = {"SOURCING", "TECHNOLOGY"}
        elif item_type == "MECHANICAL":
            wanted_types = {"ASSEMBLY", "MANUFACTURER"}
        elif item_type in ("CDP", "PCB"):
            wanted_types = {"MANUFACTURER", "ASSEMBLY"}
        else:
            wanted_types = {"SOURCING", "MANUFACTURER", "ASSEMBLY", "TECHNOLOGY"}

        matched: list[dict] = []
        seen_ids: set = set()
        for v in vendors:
            vid = v["id"]
            if vid in seen_ids:
                continue
            vtype = v.get("rfq_type") or category_to_rfq_type(v.get("category", ""))
            keywords = [k.strip().upper() for k in (v.get("mpn_keywords") or "").split(",") if k.strip()]
            kw_match = bool(keywords and any(mpn.startswith(kw) or kw in mpn for kw in keywords))
            type_match = vtype in wanted_types

            if kw_match or type_match:
                seen_ids.add(vid)
                matched.append({
                    "id": vid,
                    "vendor_name": v["vendor_name"],
                    "vendor_email_masked": _mask_email(v.get("vendor_email", "")),
                    "category": v.get("category", ""),
                    "rfq_type": vtype,
                    "city": v.get("city", ""),
                    "website": v.get("website", ""),
                    "moq": v.get("moq", 1),
                    "lead_time_days": v.get("lead_time_days", 0),
                })

        if matched:
            result[mpn] = matched

    return result


def get_vendors_by_rfq_type() -> dict:
    """Return all rfq_vendor_db vendors grouped by rfq_type (emails masked).

    Returns {
        "SOURCING":      [...vendors...],
        "MANUFACTURER":  [...vendors...],
        "ASSEMBLY":      [...vendors...],
        "TECHNOLOGY":    [...vendors...],
    }
    """
    with _db() as conn:
        rows = conn.execute("SELECT * FROM rfq_vendor_db ORDER BY vendor_name").fetchall()
    grouped: dict[str, list] = {"SOURCING": [], "MANUFACTURER": [], "ASSEMBLY": [], "TECHNOLOGY": []}
    for r in rows:
        d = dict(r)
        rtype = d.get("rfq_type") or category_to_rfq_type(d.get("category", ""))
        d["rfq_type"] = rtype
        d["vendor_email_masked"] = _mask_email(d.pop("vendor_email", ""))
        grouped.setdefault(rtype, []).append(d)
    return grouped


# ─── RFQ ──────────────────────────────────────────────────────────────────────

def add_contract_manufacturer(name: str, email: str, category: str = "CDP") -> str:
    if not name or not email:
        raise ValueError("contract manufacturer name and email are required")
    cm_code = _generate_code("CM")
    with _db() as conn:
        conn.execute(
            "INSERT INTO contract_manufacturers (cm_code, cm_name, cm_email, category, created_at) VALUES (?, ?, ?, ?, ?)",
            (cm_code, name.strip(), email.strip(), category.strip() or "CDP", _now()),
        )
    return cm_code


def get_all_contract_manufacturers() -> list[dict]:
    with _db() as conn:
        rows = conn.execute("SELECT * FROM contract_manufacturers ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def delete_contract_manufacturer(cm_code: str) -> bool:
    try:
        with _db() as conn:
            conn.execute("DELETE FROM contract_manufacturers WHERE cm_code = ?", (cm_code,))
        return True
    except Exception as e:
        log.error(f"Error deleting contract manufacturer {cm_code}: {e}")
        return False


def create_rfq(bom_filename: str) -> str:
    rfq_code = _generate_code("RFQ")
    with _db() as conn:
        conn.execute(
            "INSERT INTO rfq (rfq_code, bom_filename, created_at) VALUES (?, ?, ?)",
            (rfq_code, bom_filename, _now()),
        )
    return rfq_code


def get_all_rfqs() -> list[dict]:
    with _db() as conn:
        rows = conn.execute("SELECT * FROM rfq ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


# ─── BOM Components ───────────────────────────────────────────────────────────

def save_bom_components(rfq_code: str, components: list[dict]) -> None:
    with _db() as conn:
        conn.execute("DELETE FROM bom_components WHERE rfq_code = ?", (rfq_code,))
        conn.executemany(
            "INSERT INTO bom_components (rfq_code, mpn, description, quantity) VALUES (?, ?, ?, ?)",
            [(rfq_code, str(c.get("MPN","")).strip(), str(c.get("Description","")).strip(), int(c.get("Quantity", 1)))
             for c in components if c.get("MPN")],
        )


def get_bom_components(rfq_code: str) -> list[dict]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT mpn, description, quantity FROM bom_components WHERE rfq_code=?", (rfq_code,)
        ).fetchall()
    return [dict(r) for r in rows]


# ─── Vendor Prices ────────────────────────────────────────────────────────────

def save_prices(vendor_code: str, rfq_code: str, prices: dict) -> int:
    rows_affected = 0
    with _db() as conn:
        for mpn, data in prices.items():
            existing = conn.execute(
                "SELECT id FROM vendor_prices WHERE rfq_code=? AND vendor_code=? AND mpn=?",
                (rfq_code, vendor_code, mpn),
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE vendor_prices SET unit_price=?, moq=?, stock=?, lead_time=?, created_at=? WHERE id=?",
                    (data.get("price"), data.get("moq"), data.get("stock"), data.get("lead_time"), _now(), existing["id"]),
                )
            else:
                conn.execute(
                    "INSERT INTO vendor_prices (rfq_code, vendor_code, mpn, unit_price, moq, stock, lead_time, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (rfq_code, vendor_code, mpn, data.get("price"), data.get("moq"), data.get("stock"), data.get("lead_time"), _now()),
                )
            rows_affected += 1
        conn.execute(
            "UPDATE rfq_vendors SET reply_received=1 WHERE vendor_code=? AND rfq_code=?",
            (vendor_code, rfq_code),
        )
    return rows_affected


def get_prices(rfq_code: str) -> list[dict]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT * FROM vendor_prices WHERE rfq_code=? ORDER BY mpn, unit_price", (rfq_code,)
        ).fetchall()
    return [dict(r) for r in rows]


# ─── Price History ────────────────────────────────────────────────────────────

def save_price_history(rfq_code: str, fetch_results: list[dict]) -> int:
    """
    Persist a price snapshot for every supplier result in a fetch run.
    Called automatically after every /api/fetch-prices-bulk.
    """
    rows_inserted = 0
    ts = _now()
    with _db() as conn:
        for comp in fetch_results:
            mpn     = comp.get("mpn", "")
            results = comp.get("results", {})
            for supplier, info in results.items():
                price = info.get("price")
                if not price:
                    continue
                conn.execute(
                    """
                    INSERT INTO price_history
                        (mpn, supplier, rfq_code, unit_price, stock, lead_time, moq, currency, fetched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'INR', ?)
                    """,
                    (mpn, supplier, rfq_code, price,
                     str(info.get("stock", "")),
                     str(info.get("lead_time", "")),
                     info.get("moq"), ts),
                )
                rows_inserted += 1
    log.info("Price history saved: %d rows for RFQ %s", rows_inserted, rfq_code)
    return rows_inserted


def get_price_history(mpn: str, supplier: str | None = None, limit: int = 50) -> list[dict]:
    """Return historical price snapshots for a given MPN, most recent first."""
    with _db() as conn:
        if supplier:
            rows = conn.execute(
                "SELECT * FROM price_history WHERE UPPER(mpn)=UPPER(?) AND supplier=? ORDER BY fetched_at DESC LIMIT ?",
                (mpn, supplier, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM price_history WHERE UPPER(mpn)=UPPER(?) ORDER BY fetched_at DESC LIMIT ?",
                (mpn, limit),
            ).fetchall()
    return [dict(r) for r in rows]


def get_price_trend(mpn: str) -> dict:
    """Return structured trend data for chart rendering."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT supplier, unit_price, fetched_at FROM price_history WHERE UPPER(mpn)=UPPER(?) ORDER BY fetched_at ASC",
            (mpn,),
        ).fetchall()

    if not rows:
        return {"mpn": mpn, "suppliers": [], "series": {}, "min_price": None, "max_price": None, "latest": {}}

    series: dict = {}
    latest: dict = {}
    all_prices   = []

    for row in rows:
        sup   = row["supplier"]
        price = row["unit_price"]
        date  = row["fetched_at"][:10]
        series.setdefault(sup, []).append({"date": date, "price": price})
        latest[sup] = price
        all_prices.append(price)

    return {
        "mpn"      : mpn,
        "suppliers": list(series.keys()),
        "series"   : series,
        "min_price": min(all_prices),
        "max_price": max(all_prices),
        "latest"   : latest,
    }


def get_cheapest_ever(mpn: str) -> dict | None:
    """Return the single lowest-price record ever seen for a given MPN."""
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM price_history WHERE UPPER(mpn)=UPPER(?) ORDER BY unit_price ASC LIMIT 1",
            (mpn,),
        ).fetchone()
    return dict(row) if row else None


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    init_db()
    print("All tables created successfully.")
