"""
RFQ Sender — Bulk Email Dispatcher
=====================================
Creates a new RFQ record, saves BOM components to the database,
and dispatches the BOM file via email to all selected vendors.

Primary:  Azure Communication Services (AZURE_COMM_CONNECTION_STRING)
Fallback: Gmail SMTP (EMAIL_ADDRESS + EMAIL_PASSWORD)
"""

from __future__ import annotations

import base64
import logging
import os
import smtplib
import sys
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from dotenv import load_dotenv

from database import (
    create_rfq,
    get_all_vendors,
    get_db,
    init_db,
    save_bom_components,
)

load_dotenv()

log = logging.getLogger(__name__)

_ACS_CONN_STR  = os.getenv("AZURE_COMM_CONNECTION_STRING", "")
_SENDER_EMAIL  = os.getenv("ACS_SENDER_EMAIL", "Business@strenth.ai")
_SMTP_SENDER   = os.getenv("EMAIL_ADDRESS", "")
_SMTP_PASSWORD = os.getenv("EMAIL_PASSWORD", "").replace(" ", "")
_SMTP_HOST     = "smtp.gmail.com"
_SMTP_PORT     = 587


# ─── Email content builder ────────────────────────────────────────────────────

def _build_subject(rfq_code: str) -> str:
    return f"{rfq_code} — Request for Quotation | Strenth.ai"


def _build_plain(rfq_code: str, vendor_name: str) -> str:
    return f"""\
Dear {vendor_name},

Please find the attached Bill of Materials (BOM) for our upcoming project.

We kindly request you to provide the following for each line item:
  - Unit price (INR)
  - Available stock quantity
  - Expected lead time
  - Minimum Order Quantity (MOQ), if applicable

Reference code: {rfq_code}

Please reply with your quotation, keeping the original subject line intact
so our system can match your response to this request.

Thank you for your support.

Best regards,
Procurement Team
Strenth.ai
"""


def _build_html(rfq_code: str, vendor_name: str) -> str:
    return f"""\
<html>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.7;">
<p>Dear <strong>{vendor_name}</strong>,</p>
<p>Please find the attached Bill of Materials (BOM) for our upcoming project.</p>
<p>We kindly request you to provide the following for each line item:</p>
<ul>
  <li>Unit price (INR)</li>
  <li>Available stock quantity</li>
  <li>Expected lead time</li>
  <li>Minimum Order Quantity (MOQ), if applicable</li>
</ul>
<p><strong>Reference code:</strong> {rfq_code}</p>
<p>
  Please reply with your quotation, keeping the original subject line intact
  so our system can match your response to this request.
</p>
<p>Thank you for your support.</p>
<p>
  Best regards,<br>
  <strong>Procurement Team</strong><br>
  <strong>Strenth.ai</strong>
</p>
</body>
</html>
"""


# ─── ACS sender ───────────────────────────────────────────────────────────────

def _send_via_acs(
    rfq_code: str,
    vendor_name: str,
    vendor_email: str,
    bom_path: Path,
) -> bool:
    """Send one email via Azure Communication Services. Returns True on success."""
    try:
        from azure.communication.email import EmailClient
    except ImportError:
        log.error("azure-communication-email not installed. Run: pip install azure-communication-email")
        return False

    try:
        client = EmailClient.from_connection_string(_ACS_CONN_STR)

        message: dict = {
            "senderAddress": _SENDER_EMAIL,
            "recipients": {
                "to": [{"address": vendor_email, "displayName": vendor_name}]
            },
            "content": {
                "subject": _build_subject(rfq_code),
                "plainText": _build_plain(rfq_code, vendor_name),
                "html": _build_html(rfq_code, vendor_name),
            },
        }

        if bom_path.is_file():
            with bom_path.open("rb") as fh:
                encoded = base64.b64encode(fh.read()).decode("utf-8")
            message["attachments"] = [
                {
                    "name": f"BOM_{rfq_code}.xlsx",
                    "contentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "contentInBase64": encoded,
                }
            ]
        else:
            log.warning("BOM file not found — sending without attachment: %s", bom_path)

        poller = client.begin_send(message)
        result = poller.result()
        log.info("ACS sent → %s (%s) | messageId: %s", vendor_name, vendor_email, result.get("id", ""))
        return True

    except Exception as exc:
        log.error("ACS send failed → %s (%s): %s", vendor_name, vendor_email, exc)
        return False


# ─── SMTP fallback sender ─────────────────────────────────────────────────────

def _build_mime_message(
    rfq_code: str,
    vendor_name: str,
    vendor_email: str,
    bom_path: Path,
) -> MIMEMultipart:
    msg = MIMEMultipart("mixed")
    msg["From"]     = f"Procurement Team <{_SMTP_SENDER}>"
    msg["To"]       = vendor_email
    msg["Subject"]  = _build_subject(rfq_code)
    msg["Reply-To"] = _SMTP_SENDER

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(_build_plain(rfq_code, vendor_name), "plain", "utf-8"))
    alt.attach(MIMEText(_build_html(rfq_code, vendor_name),  "html",  "utf-8"))
    msg.attach(alt)

    if bom_path.is_file():
        with bom_path.open("rb") as fh:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(fh.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="BOM_{rfq_code}.xlsx"')
        msg.attach(part)
    else:
        log.warning("BOM file not found — sending without attachment: %s", bom_path)

    return msg


# ─── Public API ───────────────────────────────────────────────────────────────

def send_rfq_to_vendors(
    bom_file    : str,
    components  : list[dict] | None = None,
    vendor_codes: list[str]  | None = None,
) -> str:
    """
    Create an RFQ, persist BOM components, and dispatch emails.

    Uses Azure Communication Services if AZURE_COMM_CONNECTION_STRING is set,
    otherwise falls back to Gmail SMTP (EMAIL_ADDRESS + EMAIL_PASSWORD).
    """
    use_acs = bool(_ACS_CONN_STR)
    use_smtp = bool(_SMTP_SENDER and _SMTP_PASSWORD)

    if not use_acs and not use_smtp:
        log.error("No email transport configured. Set AZURE_COMM_CONNECTION_STRING or EMAIL_ADDRESS+EMAIL_PASSWORD.")
        return ""

    bom_path = Path(bom_file)
    rfq_code = create_rfq(bom_path.name)
    log.info("RFQ created: %s | transport: %s", rfq_code, "ACS" if use_acs else "SMTP")

    if components:
        save_bom_components(rfq_code, components)
        log.info("BOM components saved: %d rows", len(components))

    all_vendors = get_all_vendors()
    vendors = (
        [v for v in all_vendors if v["vendor_code"] in vendor_codes]
        if vendor_codes else all_vendors
    )

    if not vendors:
        log.warning("No vendors to email.")
        return rfq_code

    log.info("Sending RFQ %s to %d vendor(s) via %s...", rfq_code, len(vendors), "ACS" if use_acs else "SMTP")

    sent = failed = 0
    conn = get_db()
    cursor = conn.cursor()

    if use_acs:
        for vendor in vendors:
            ok = _send_via_acs(rfq_code, vendor["vendor_name"], vendor["vendor_email"], bom_path)
            if ok:
                cursor.execute(
                    """
                    INSERT INTO rfq_vendors (rfq_code, vendor_code, email_sent, created_at)
                    VALUES (?, ?, 1, datetime('now'))
                    ON CONFLICT(rfq_code, vendor_code) DO UPDATE SET email_sent = 1
                    """,
                    (rfq_code, vendor["vendor_code"]),
                )
                conn.commit()
                sent += 1
            else:
                failed += 1

    else:
        try:
            with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT, timeout=15) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(_SMTP_SENDER, _SMTP_PASSWORD)

                for vendor in vendors:
                    try:
                        msg = _build_mime_message(rfq_code, vendor["vendor_name"], vendor["vendor_email"], bom_path)
                        server.sendmail(_SMTP_SENDER, vendor["vendor_email"], msg.as_string())
                        cursor.execute(
                            """
                            INSERT INTO rfq_vendors (rfq_code, vendor_code, email_sent, created_at)
                            VALUES (?, ?, 1, datetime('now'))
                            ON CONFLICT(rfq_code, vendor_code) DO UPDATE SET email_sent = 1
                            """,
                            (rfq_code, vendor["vendor_code"]),
                        )
                        conn.commit()
                        log.info("SMTP sent → %s (%s)", vendor["vendor_name"], vendor["vendor_email"])
                        sent += 1
                    except Exception as exc:
                        log.error("SMTP failed → %s: %s", vendor["vendor_name"], exc)
                        failed += 1
        except Exception as exc:
            log.error("SMTP connection failed: %s", exc)

    conn.close()
    log.info("RFQ dispatch complete — sent: %d  failed: %d", sent, failed)
    return rfq_code


def send_email_direct(rfq_code: str, vendor_name: str, vendor_email: str, bom_path: Path) -> bool:
    """Send a single RFQ email to any vendor (no database lookup required).

    Uses ACS if AZURE_COMM_CONNECTION_STRING is set, falls back to SMTP.
    Called by /api/rfq/send-bulk-auto for rfq_vendor_db vendors.
    """
    if _ACS_CONN_STR:
        return _send_via_acs(rfq_code, vendor_name, vendor_email, bom_path)
    if _SMTP_SENDER and _SMTP_PASSWORD:
        try:
            msg = _build_mime_message(rfq_code, vendor_name, vendor_email, bom_path)
            with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT, timeout=15) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(_SMTP_SENDER, _SMTP_PASSWORD)
                server.sendmail(_SMTP_SENDER, vendor_email, msg.as_string())
            log.info("SMTP sent (direct) → %s (%s)", vendor_name, vendor_email)
            return True
        except Exception as exc:
            log.error("SMTP direct failed → %s: %s", vendor_name, exc)
            return False
    log.error("No email transport configured — set AZURE_COMM_CONNECTION_STRING or EMAIL_ADDRESS+EMAIL_PASSWORD")
    return False


# ─── CLI entry ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        level=logging.INFO,
    )
    bom = sys.argv[1] if len(sys.argv) > 1 else "MIDI_1.xlsx"
    init_db()
    code = send_rfq_to_vendors(bom)
    print(f"RFQ dispatched: {code}")
