"""
Gmail Parser — BOM Tool
========================
OAuth2 web-flow (no popup, no local server).
Tokens stored in token.json. If expired/missing, returns auth_required=True.
"""

import os
import base64
import json
import re
import sqlite3
from datetime import datetime

import pandas as pd
from dotenv import load_dotenv

load_dotenv()

SCOPES     = ["https://www.googleapis.com/auth/gmail.readonly"]
DB_PATH    = "bom_tool.db"
TOKEN_PATH = "token.json"
CRED_PATH  = "credentials.json"


def _ensure_credentials():
    """Build credentials.json from .env if not present."""
    if not os.path.exists(CRED_PATH):
        client_config = {
            "web": {
                "client_id":     os.getenv("GMAIL_CLIENT_ID", ""),
                "client_secret": os.getenv("GMAIL_CLIENT_SECRET", ""),
                "redirect_uris": ["http://localhost:5000/api/gmail-callback"],
                "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
                "token_uri":     "https://oauth2.googleapis.com/token",
            }
        }
        with open(CRED_PATH, "w") as f:
            json.dump(client_config, f)
    return CRED_PATH


def get_auth_url(redirect_uri: str) -> str:
    """Return Google OAuth consent-screen URL."""
    from google_auth_oauthlib.flow import Flow
    _ensure_credentials()
    flow = Flow.from_client_secrets_file(
        CRED_PATH, scopes=SCOPES, redirect_uri=redirect_uri
    )
    url, _ = flow.authorization_url(access_type="offline", prompt="consent")
    return url


def exchange_code(code: str, redirect_uri: str) -> bool:
    """Exchange auth code for tokens and save to token.json."""
    from google_auth_oauthlib.flow import Flow
    _ensure_credentials()
    flow = Flow.from_client_secrets_file(
        CRED_PATH, scopes=SCOPES, redirect_uri=redirect_uri
    )
    flow.fetch_token(code=code)
    creds = flow.credentials
    with open(TOKEN_PATH, "w") as f:
        f.write(creds.to_json())
    return True


def _get_gmail_service():
    """Return an authenticated Gmail service, or raise PermissionError if auth needed."""
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    if not os.path.exists(TOKEN_PATH):
        raise PermissionError("auth_required")

    creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)

    if not creds.valid:
        if creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                with open(TOKEN_PATH, "w") as f:
                    f.write(creds.to_json())
            except Exception:
                if os.path.exists(TOKEN_PATH):
                    os.remove(TOKEN_PATH)
                raise PermissionError("auth_required")
        else:
            if os.path.exists(TOKEN_PATH):
                os.remove(TOKEN_PATH)
            raise PermissionError("auth_required")

    return build("gmail", "v1", credentials=creds)


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def check_rfq_replies() -> dict:
    """
    Fetch Gmail for RFQ reply emails with attachments.
    Returns {"processed": N, "emails_checked": M}
    Raises PermissionError("auth_required") if Gmail not connected.
    """
    service = _get_gmail_service()  # raises PermissionError if not authed

    results = service.users().messages().list(
        userId="me",
        q="subject:RFQ has:attachment",
        maxResults=50
    ).execute()

    messages = results.get("messages", [])
    print(f"[Gmail] Found {len(messages)} RFQ reply emails")
    processed = 0

    for msg in messages:
        msg_data = service.users().messages().get(
            userId="me", id=msg["id"]
        ).execute()

        headers = msg_data["payload"]["headers"]
        subject = next((h["value"] for h in headers if h["name"] == "Subject"), "")
        sender  = next((h["value"] for h in headers if h["name"] == "From"), "")

        # Extract RFQ code
        rfq_code = None
        for token in re.split(r'[\s\[\]<>()\-:;,]+', subject):
            if re.match(r'^RFQ', token, re.IGNORECASE):
                rfq_code = token
                break
        if not rfq_code:
            continue

        print(f"[Gmail] Processing: {subject} | From: {sender} | RFQ: {rfq_code}")

        conn = get_db(); cur = conn.cursor()
        cur.execute("SELECT vendor_code FROM rfq_vendors WHERE rfq_code=? LIMIT 1", (rfq_code,))
        row = cur.fetchone()
        vendor_code = row["vendor_code"] if row else "EMAIL_" + msg["id"][:8]
        conn.close()

        parts = msg_data["payload"].get("parts", [msg_data["payload"]])
        for part in parts:
            fname = part.get("filename", "")
            if not re.search(r'\.(xlsx|xls|csv)$', fname, re.IGNORECASE):
                continue
            att_id = part.get("body", {}).get("attachmentId")
            if not att_id:
                continue

            att = service.users().messages().attachments().get(
                userId="me", messageId=msg["id"], id=att_id
            ).execute()
            file_data = base64.urlsafe_b64decode(att["data"])

            os.makedirs("replies", exist_ok=True)
            save_path = f"replies/reply_{rfq_code}_{msg['id'][:8]}.xlsx"
            with open(save_path, "wb") as f:
                f.write(file_data)

            n = parse_and_save(save_path, rfq_code, vendor_code)
            processed += n
            print(f"[Gmail] Saved {n} prices from {fname}")

    return {"processed": processed, "emails_checked": len(messages)}


def parse_and_save(filepath: str, rfq_code: str, vendor_code: str) -> int:
    """Parse Excel/CSV attachment and save prices to vendor_prices table."""
    try:
        df = pd.read_csv(filepath) if filepath.endswith(".csv") else pd.read_excel(filepath)

        # Find MPN column
        mpn_col = None
        for col in df.columns:
            if str(col).lower().strip() in ["mpn", "part number", "partnumber",
                                             "part no", "part_number", "mfr part #"]:
                mpn_col = col; break
        if not mpn_col:
            mpn_col = df.columns[0]

        # Find price column
        price_col = None
        price_kws = ["unit price", "price", "rate", "cost", "unit cost",
                     "amount", "unit rate", "quoted price", "our price"]
        for col in df.columns:
            if str(col).lower().strip() in price_kws:
                price_col = col; break
        if not price_col:
            for col in df.columns:
                if any(kw in str(col).lower() for kw in price_kws):
                    price_col = col; break

        if not price_col:
            print(f"[Parse] No price column in {filepath}. Columns: {list(df.columns)}")
            return 0

        # Find lead time column
        lead_col = None
        for col in df.columns:
            if any(kw in str(col).lower() for kw in ["lead", "delivery", "days", "weeks"]):
                lead_col = col; break

        conn = get_db(); cur = conn.cursor()
        saved = 0
        for _, row in df.iterrows():
            mpn = str(row[mpn_col]).strip()
            if not mpn or mpn.lower() in ["nan", "none", ""]:
                continue
            try:
                price = float(
                    str(row[price_col]).replace("₹","").replace(",","")
                                      .replace("INR","").replace("Rs","").strip()
                )
            except Exception:
                continue
            if price <= 0:
                continue

            lead = str(row[lead_col]) if lead_col and pd.notna(row.get(lead_col)) else "N/A"

            cur.execute(
                "SELECT id FROM vendor_prices WHERE rfq_code=? AND vendor_code=? AND mpn=?",
                (rfq_code, vendor_code, mpn)
            )
            if cur.fetchone():
                cur.execute(
                    "UPDATE vendor_prices SET unit_price=?,lead_time=?,created_at=? "
                    "WHERE rfq_code=? AND vendor_code=? AND mpn=?",
                    (price, lead, datetime.now().isoformat(), rfq_code, vendor_code, mpn)
                )
            else:
                cur.execute(
                    "INSERT INTO vendor_prices (rfq_code,vendor_code,mpn,unit_price,lead_time,created_at) "
                    "VALUES (?,?,?,?,?,?)",
                    (rfq_code, vendor_code, mpn, price, lead, datetime.now().isoformat())
                )
            saved += 1

        conn.commit(); conn.close()
        return saved

    except Exception as e:
        print(f"[Parse] Error parsing {filepath}: {e}")
        return 0
