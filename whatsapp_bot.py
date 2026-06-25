"""
WhatsApp Bot — BOM Tool Procurement Workflow.

Supports two providers:
  1. Baileys (Node.js, groups)     → /api/internal/chat
  2. Meta Cloud API (free/prod)    → /api/whatsapp/meta/webhook

Full stateful procurement workflow:
  IDLE → parts list detected → classify (BOP/CDP/MECH/ASSEMBLY) →
  fetch prices (Mouser/Digikey/LCSC/Element14/Arrow + Indian stores) →
  show results + ask target prices → RFQ confirm → send emails → DONE
"""
from __future__ import annotations

import io
import logging
import os
import re
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed

log = logging.getLogger(__name__)

# ── Procurement session state machine ─────────────────────────────────────────

class PState:
    IDLE           = 'idle'
    AWAITING_TARGET = 'awaiting_target'   # prices fetched, waiting for target/rfq
    RFQ_CONFIRM    = 'rfq_confirm'        # waiting for confirm/cancel

_SESSION_TIMEOUT = 1800  # 30 minutes
_sessions: dict[str, dict] = {}


def _get_session(sender: str) -> dict:
    now = time.time()
    s = _sessions.get(sender)
    if s and now - s.get('last_active', 0) > _SESSION_TIMEOUT:
        del _sessions[sender]
        s = None
    if s is None:
        _sessions[sender] = {
            'state': PState.IDLE,
            'parts': [],
            'rfq_code': None,
            'last_active': now,
        }
    else:
        _sessions[sender]['last_active'] = now
    return _sessions[sender]


# ── Parts list parser ─────────────────────────────────────────────────────────

def _parse_parts_list(text: str) -> list[dict]:
    """Parse a multi-line parts list into structured dicts."""
    lines = [l.strip() for l in text.strip().split('\n') if l.strip()]
    parts = []

    # Skip header-like lines
    skip_starts = ('i need', 'please', 'hi ', 'hello', 'bom:', 'parts:', 'items:', 'components:')

    for line in lines:
        ll = line.lower()
        if any(ll.startswith(s) for s in skip_starts) and len(line) < 60:
            continue
        if len(line) < 2:
            continue

        qty = 1
        part_text = line

        # qty × desc  or  qty x desc
        m = re.match(r'^(\d+)\s*[×xX\*]\s*(.+)$', line)
        if m:
            qty = int(m.group(1))
            part_text = m.group(2).strip()
        else:
            # desc × qty  or  desc, qty pcs  or  desc - qty
            m = re.match(r'^(.+?)\s*[×xX\*\-,]\s*(\d+)\s*(?:pcs?|units?|nos?\.?|each)?$',
                         line, re.IGNORECASE)
            if m:
                qty = int(m.group(2))
                part_text = m.group(1).strip()
            else:
                # Remove leading bullet
                part_text = re.sub(r'^[-•*]\s*', '', line).strip()

        if part_text and len(part_text) >= 2:
            mpn_m = re.search(r'\b([A-Z0-9][A-Z0-9\-_\.]{3,})\b', part_text.upper())
            mpn = mpn_m.group(1) if mpn_m else ''
            parts.append({
                'description': part_text,
                'mpn': mpn,
                'qty': qty,
                'type': None,
                'type_reason': '',
                'price_result': {},
                'alternatives': [],
            })

    return parts


def _is_parts_list(text: str) -> bool:
    """Detect whether a message is a BOM / parts list."""
    lines = [l.strip() for l in text.strip().split('\n') if l.strip()]

    # Multi-line with at least one qty pattern
    if len(lines) >= 2:
        qty_lines = sum(
            1 for l in lines
            if re.search(r'\d+\s*[×xX\*]|\d+\s*pcs?', l, re.IGNORECASE)
        )
        if qty_lines >= 1:
            return True
        # Multiple lines with part-like tokens (uppercase MPN-style)
        mpn_lines = sum(1 for l in lines if re.search(r'\b[A-Z]{2}[A-Z0-9\-]{2,}\b', l))
        if mpn_lines >= 2:
            return True

    # Single line with explicit list header
    if re.search(r'(?:i need|quote for|rfq for|parts list|bom:?)\s*[:,]?', text, re.IGNORECASE):
        return True

    return False


# ── Price fetchers ─────────────────────────────────────────────────────────────

def _fetch_part_prices(part: dict) -> dict:
    """Fetch prices for one part from all distributors. Returns {source: {price, stock}}."""
    query = part.get('mpn') or part.get('description', '')
    results: dict = {}

    def _try(name, module, func):
        try:
            import importlib
            m = importlib.import_module(module)
            r = getattr(m, func)(query)
            if r:
                price = r.get('price') or r.get('unit_price')
                stock = r.get('stock') or r.get('availability') or ''
                if price:
                    results[name] = {'price': str(price), 'stock': str(stock)}
        except Exception:
            pass

    sources = [
        ('Mouser',    'Mouser_fetch',    'get_mouser_price'),
        ('LCSC',      'lcsc_fetch',      'get_lcsc_price'),
        ('Element14', 'element14_fetch', 'get_element14_price'),
        ('Digikey',   'Digikey_fetch',   'get_digikey_price'),
        ('Arrow',     'arrow_fetch',     'get_arrow_price'),
    ]
    with ThreadPoolExecutor(max_workers=5) as ex:
        futs = [ex.submit(_try, *s) for s in sources]
        for f in as_completed(futs, timeout=30):
            try:
                f.result()
            except Exception:
                pass

    # Indian stores
    try:
        from indian_stores_fetch import get_indian_best_price  # type: ignore
        indian = get_indian_best_price(mpn=query)
        if indian:
            items = indian if isinstance(indian, list) else [indian]
            for it in items[:1]:
                price = it.get('price') or ''
                store = it.get('source') or it.get('store') or 'India'
                if price:
                    results[store] = {'price': str(price), 'stock': ''}
    except Exception:
        pass

    return results


def _parse_price(s: str) -> float:
    """Extract numeric price from string like '₹145', '$2.1', '145.0'."""
    m = re.search(r'[\d]+\.?\d*', s.replace(',', ''))
    return float(m.group()) if m else 9999.0


# ── Core workflow ─────────────────────────────────────────────────────────────

def _process_bom(session: dict) -> str:
    """Classify parts + fetch BOP prices. Updates session and returns formatted reply."""
    from chat_agent import _classify_keywords  # type: ignore

    parts = session['parts']
    for part in parts:
        r = _classify_keywords(part['description'], part.get('mpn', ''))
        part['type'] = r['item_type']
        part['type_reason'] = r.get('reason', '')

    bop   = [p for p in parts if p['type'] == 'BOP']
    cdp   = [p for p in parts if p['type'] == 'CDP']
    mech  = [p for p in parts if p['type'] == 'MECHANICAL']
    assy  = [p for p in parts if p['type'] == 'ASSEMBLY']

    # Parallel price fetch for BOP parts
    if bop:
        with ThreadPoolExecutor(max_workers=min(5, len(bop))) as ex:
            futs = {ex.submit(_fetch_part_prices, p): p for p in bop}
            for fut in as_completed(futs, timeout=60):
                p = futs[fut]
                try:
                    p['price_result'] = fut.result()
                except Exception:
                    p['price_result'] = {}

    # Build WhatsApp reply
    lines = ['*BOM Analysis*']

    if bop:
        lines.append('\n*Electronic Parts (BOP):*')
        for p in bop:
            pr = p.get('price_result') or {}
            if pr:
                # Show best 2 sources
                sorted_src = sorted(pr.items(), key=lambda x: _parse_price(x[1].get('price', '9999')))
                price_str = ' | '.join(
                    f"{src}: {v['price']}" + (f" ({v['stock']})" if v.get('stock') else '')
                    for src, v in sorted_src[:2]
                )
                lines.append(f"• {p['description']} ×{p['qty']} — {price_str}")
            else:
                lines.append(f"• {p['description']} ×{p['qty']} — not found online")

    if cdp:
        lines.append('\n*Custom Parts (CDP — quotation needed):*')
        for p in cdp:
            lines.append(f"• {p['description']} ×{p['qty']}")

    if mech:
        lines.append('\n*Mechanical Parts:*')
        for p in mech:
            lines.append(f"• {p['description']} ×{p['qty']}")

    if assy:
        lines.append('\n*Assembly Services:*')
        for p in assy:
            lines.append(f"• {p['description']} ×{p['qty']}")

    # Unpriced count
    unpriced = sum(1 for p in bop if not p.get('price_result'))
    if unpriced:
        lines.append(f'\n_{unpriced} BOP part(s) not found — reply *alt* for alternatives_')

    # Next steps
    if cdp or mech or assy:
        lines.append('\n_Reply *rfq* to send RFQ emails to matched suppliers._')
    lines.append('_Reply with target prices (e.g. "ESP32: 120, AO3415E: 80") or *rfq* to proceed._')

    session['state'] = PState.AWAITING_TARGET

    out = '\n'.join(lines)
    return out[:3500]


def _find_alternatives(session: dict) -> str:
    """Find alternatives for unpriced BOP parts."""
    parts = session.get('parts', [])
    unpriced = [p for p in parts if p.get('type') == 'BOP' and not p.get('price_result')]
    if not unpriced:
        return "All BOP parts already have prices. No alternatives needed."

    lines = ['*Alternatives for unpriced parts:*']
    for p in unpriced[:5]:
        try:
            from chat_agent import search_google_shopping  # type: ignore
            result = search_google_shopping.invoke({'query': p['description']})
            lines.append(f"\n*{p['description']}:*\n{result[:300]}")
        except Exception:
            lines.append(f"\n*{p['description']}:* no alternatives found")

    return '\n'.join(lines)[:3000]


def _rfq_summary(session: dict) -> str:
    """Format RFQ summary and move state to RFQ_CONFIRM."""
    parts = session.get('parts', [])
    cdp_parts  = [p for p in parts if p['type'] in ('CDP', 'MECHANICAL', 'ASSEMBLY')]
    bop_parts  = [p for p in parts if p['type'] == 'BOP']

    if not cdp_parts:
        session['state'] = PState.IDLE
        return (
            "*All parts are standard BOP* — no RFQ needed.\n"
            "Order directly from distributors shown above.\n"
            "Reply *new* to start a fresh analysis."
        )

    lines = ['*RFQ Preview*\n']

    if bop_parts:
        lines.append('*BOP (order from distributors):*')
        for p in bop_parts:
            pr = p.get('price_result') or {}
            if pr:
                best = min(pr.items(), key=lambda x: _parse_price(x[1].get('price', '9999')))
                lines.append(f"• {p['description']} ×{p['qty']} — {best[1]['price']} @ {best[0]}")
            else:
                lines.append(f"• {p['description']} ×{p['qty']} — price TBD")

    lines.append('\n*Parts for RFQ:*')
    for p in cdp_parts:
        lines.append(f"• {p['description']} ×{p['qty']} [{p['type']}]")

    lines.append('\nReply *confirm* to send RFQ emails, or *cancel* to abort.')
    session['state'] = PState.RFQ_CONFIRM

    return '\n'.join(lines)[:3000]


def _send_rfq(session: dict) -> str:
    """Send RFQ emails and return confirmation."""
    import datetime
    parts = session.get('parts', [])
    cdp_parts  = [p for p in parts if p['type'] in ('CDP', 'MECHANICAL', 'ASSEMBLY')]

    if not cdp_parts:
        session['state'] = PState.IDLE
        return "No CDP/custom parts — no RFQ needed."

    rfq_code = f"RFQ-WA-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
    session['rfq_code'] = rfq_code

    cdp_items  = [p for p in cdp_parts if p['type'] == 'CDP']
    mech_items = [p for p in cdp_parts if p['type'] == 'MECHANICAL']
    assy_items = [p for p in cdp_parts if p['type'] == 'ASSEMBLY']
    sent = 0

    try:
        from Email_Sender import send_cdp_rfq, send_mechanical_rfq  # type: ignore
        if cdp_items:
            rows = [{'description': p['description'], 'mpn': p.get('mpn', ''),
                     'qty': p['qty'], 'item_type': 'CDP'} for p in cdp_items]
            n = send_cdp_rfq(rows, rfq_code=rfq_code)
            sent += n or 0

        if mech_items or assy_items:
            rows = [{'description': p['description'], 'mpn': p.get('mpn', ''),
                     'qty': p['qty'], 'item_type': p['type']}
                    for p in (mech_items + assy_items)]
            n = send_mechanical_rfq(rows, rfq_code=rfq_code)
            sent += n or 0
    except Exception as exc:
        log.exception("RFQ send error")
        session['state'] = PState.IDLE
        return (
            f"⚠️ RFQ emails failed: {exc}\n"
            "Please use the dashboard to send the RFQ manually.\n"
            f"Ref: {rfq_code}"
        )

    session['state'] = PState.IDLE
    msg = (
        f"*RFQ Sent!* Ref: {rfq_code}\n\n"
        f"Emails dispatched for {len(cdp_parts)} part(s) to matched suppliers.\n"
        "You will be notified when quotes arrive.\n\n"
        "Reply *new* to start a fresh BOM analysis."
    )
    return msg


# ── Conversation history (for non-procurement queries) ────────────────────────

_MAX_TURNS = 6
_conversations: dict[str, deque] = {}


def _record(sender: str, role: str, text: str) -> None:
    if sender not in _conversations:
        _conversations[sender] = deque(maxlen=_MAX_TURNS)
    _conversations[sender].append((role, text))


# ── Core message handler ──────────────────────────────────────────────────────

_GREETINGS = frozenset(["hi", "hello", "hey", "helo", "hii", "namaste", "start", "help"])
_RESET_CMDS = frozenset(["new", "reset", "restart", "start over", "clear", "new bom"])

_CAPABILITY_MSG = (
    "*BOM Procurement Assistant*\n\n"
    "I can help you:\n"
    "• Check prices on Mouser, Digikey, LCSC, Element14, Arrow\n"
    "• Search Indian stores (Robu, Evelta, ElectronicsComp, Flyrobo)\n"
    "• Classify parts: BOP / CDP / Mechanical / Assembly\n"
    "• Generate and send RFQs to suppliers\n"
    "• Find alternatives for out-of-stock parts\n\n"
    "Send your parts list to begin:\n"
    "_ESP32 × 10_\n"
    "_AO3415E × 50_\n"
    "_Custom enclosure × 1_\n\n"
    "Or ask a question like _'price of STM32F103C8T6'_"
)


def handle_message(sender: str, body: str) -> str:
    """Process an incoming WhatsApp message and return a plain-text reply."""
    body = body.strip()
    if not body:
        return _CAPABILITY_MSG

    session = _get_session(sender)
    body_lower = body.lower().strip()

    # Global commands
    if body_lower in _GREETINGS:
        session['state'] = PState.IDLE
        return _CAPABILITY_MSG

    if body_lower in _RESET_CMDS:
        _sessions.pop(sender, None)
        return "Session cleared. Send your parts list to start a new BOM analysis."

    state = session.get('state', PState.IDLE)

    # ── IDLE ──────────────────────────────────────────────────────────────────
    if state == PState.IDLE:
        if _is_parts_list(body):
            parts = _parse_parts_list(body)
            if parts:
                session['parts'] = parts
                return _process_bom(session)
        return _single_query(body, sender)

    # ── AWAITING_TARGET ───────────────────────────────────────────────────────
    if state == PState.AWAITING_TARGET:
        if body_lower in ('rfq', 'send rfq', 'generate rfq', 'proceed', 'continue'):
            return _rfq_summary(session)
        if body_lower in ('alt', 'alternatives', 'substitute', 'find alternative'):
            return _find_alternatives(session)
        if body_lower in ('done', 'skip', 'no target', 'no targets'):
            return _rfq_summary(session)

        # Try to parse target prices — e.g. "ESP32: 120, AO3415E: 80"
        if re.search(r'\w.{2,30}:\s*[\d₹$]', body):
            # Store targets (informational) and move to confirm
            session['target_prices'] = body
            return _rfq_summary(session)

        # Add more parts if user keeps adding lines
        if _is_parts_list(body):
            new_parts = _parse_parts_list(body)
            if new_parts:
                session['parts'].extend(new_parts)
                session['state'] = PState.IDLE
                return _process_bom(session)

        return _single_query(body, sender)

    # ── RFQ_CONFIRM ───────────────────────────────────────────────────────────
    if state == PState.RFQ_CONFIRM:
        if body_lower in ('confirm', 'yes', 'send', 'ok', 'okay', 'y', 'proceed'):
            return _send_rfq(session)
        if body_lower in ('no', 'cancel', 'abort', 'n', 'stop'):
            session['state'] = PState.AWAITING_TARGET
            return "RFQ cancelled. Reply *rfq* to regenerate or send your target prices."
        return _rfq_summary(session)

    # Fallback
    return _single_query(body, sender)


def _single_query(body: str, sender: str = '') -> str:
    """Handle a single one-off query via the chat agent."""
    try:
        from chat_agent import fast_chat  # type: ignore
        reply = fast_chat(body)
        # Clean markdown that renders poorly on WhatsApp
        reply = reply.replace('**', '*').replace('__', '_').replace('## ', '').replace('# ', '')
        if len(reply) > 3500:
            reply = reply[:3450] + '\n_(truncated — ask me to continue)_'
        _record(sender, 'user', body)
        _record(sender, 'assistant', reply)
        return reply
    except Exception:
        log.exception("fast_chat error sender=%s", sender)
        b = body.lower()
        if any(w in b for w in ['price', 'cost', '₹', 'rs', 'inr']):
            return "Couldn't fetch live prices right now. Try again in 30 seconds."
        if any(w in b for w in ['vendor', 'supplier']):
            return "Couldn't search vendors right now. Try again in a moment."
        return "Something went wrong. Please try again in 30 seconds."


# ── TwiML builder (Twilio) ────────────────────────────────────────────────────

def twiml_response(message: str) -> str:
    safe = (
        message
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<Response><Message>{safe}</Message></Response>"
    )


# ── Meta Cloud API ────────────────────────────────────────────────────────────

def meta_verify_webhook(mode: str, token: str, challenge: str) -> tuple[str, int]:
    verify_token = os.getenv("META_VERIFY_TOKEN", "").strip()
    if mode == "subscribe" and token == verify_token:
        log.info("Meta webhook verified successfully")
        return challenge, 200
    log.warning("Meta webhook verification failed — token mismatch")
    return "Forbidden", 403


def _meta_download_media(media_id: str) -> bytes | None:
    import requests as req
    token = os.getenv("META_WHATSAPP_TOKEN", "").strip()
    headers = {"Authorization": f"Bearer {token}"}
    try:
        r = req.get(f"https://graph.facebook.com/v19.0/{media_id}", headers=headers, timeout=10)
        url = r.json().get("url")
        if not url:
            return None
        r2 = req.get(url, headers=headers, timeout=30)
        return r2.content
    except Exception:
        return None


def _analyse_bom_bytes(data: bytes, filename: str) -> str:
    try:
        import pandas as pd
        if filename.lower().endswith(".csv"):
            df = pd.read_csv(io.BytesIO(data))
        else:
            df = pd.read_excel(io.BytesIO(data))

        if df.empty:
            return "The file appears to be empty. Please check and resend."

        total = len(df)
        cols  = [c.lower() for c in df.columns]

        type_col = next((df.columns[i] for i, c in enumerate(cols)
                         if any(w in c for w in ["type", "category", "item_type"])), None)
        type_summary = ""
        if type_col:
            counts = df[type_col].value_counts().head(6)
            type_summary = "\n" + "\n".join(f"  {k}: {v}" for k, v in counts.items())

        price_col = next((df.columns[i] for i, c in enumerate(cols)
                          if any(w in c for w in ["price", "cost", "unit price", "rate"])), None)
        price_summary = ""
        if price_col:
            prices = pd.to_numeric(df[price_col], errors="coerce").dropna()
            if not prices.empty:
                price_summary = f"\nPriced: {len(prices)}/{total} | Est. total: ₹{prices.sum():,.0f}"

        mpn_col = next((df.columns[i] for i, c in enumerate(cols)
                        if any(w in c for w in ["mpn", "part no", "part number"])), None)
        unpriced_msg = ""
        if mpn_col and price_col:
            no_price = df[df[price_col].isna()][mpn_col].dropna().head(5).tolist()
            if no_price:
                unpriced_msg = "\nTop unpriced: " + ", ".join(str(x) for x in no_price)

        return (
            f"BOM: {filename}\n"
            f"Total: {total} items"
            f"{type_summary}"
            f"{price_summary}"
            f"{unpriced_msg}\n\n"
            "Upload on the dashboard for full live pricing from Mouser, Digikey & more."
        )
    except Exception as exc:
        return f"Could not parse file: {exc}. Please send a valid Excel (.xlsx) or CSV."


def meta_handle_incoming(payload: dict) -> None:
    try:
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value    = change.get("value", {})
                messages = value.get("messages", [])
                contacts = value.get("contacts", [])
                for msg in messages:
                    raw_from  = msg["from"]
                    msg_id    = msg["id"]
                    msg_type  = msg.get("type")

                    is_group  = raw_from.endswith("@g.us")
                    reply_to  = raw_from
                    participant = msg.get("participant") or (contacts[0].get("wa_id") if contacts else raw_from)
                    sender    = participant if is_group else raw_from

                    log.info("meta_inbound from=%s group=%s type=%s", sender, is_group, msg_type)

                    if msg_type == "document":
                        doc      = msg.get("document", {})
                        media_id = doc.get("id", "")
                        filename = doc.get("filename", "file")
                        mime     = doc.get("mime_type", "")
                        is_bom   = any(filename.lower().endswith(x) for x in [".xlsx", ".xls", ".csv"])
                        if is_bom or "spreadsheet" in mime or "excel" in mime:
                            meta_send_message(reply_to, f"Analysing {filename}...", msg_id)
                            data = _meta_download_media(media_id)
                            reply = _analyse_bom_bytes(data, filename) if data else "Could not download file."
                        else:
                            reply = "Please send an Excel (.xlsx) or CSV BOM file."
                        meta_send_message(reply_to, reply)
                        continue

                    if msg_type == "image":
                        meta_send_message(reply_to,
                            "I received your image! Send the BOM as Excel/CSV for full analysis.", msg_id)
                        continue

                    if msg_type != "text":
                        continue

                    body = msg["text"]["body"]
                    log.info("meta_text from=%s group=%s body=%.80s", sender, is_group, body)

                    body_lower = body.lower().strip()
                    needs_ack  = body_lower not in _GREETINGS and any(
                        w in body_lower for w in ["price", "cost", "find", "search", "rfq", "bom"]
                    )
                    if needs_ack:
                        meta_send_message(reply_to, "Processing... one moment.", msg_id)

                    reply = handle_message(sender, body)
                    meta_send_message(reply_to, reply)
    except Exception:
        log.exception("meta_handle_incoming error")


def meta_send_message(to: str, text: str, reply_to_id: str | None = None) -> bool:
    import requests as req

    token    = os.getenv("META_WHATSAPP_TOKEN", "").strip()
    phone_id = os.getenv("META_PHONE_NUMBER_ID", "").strip()

    if not token or not phone_id:
        log.error("META_WHATSAPP_TOKEN or META_PHONE_NUMBER_ID not set")
        return False

    url = f"https://graph.facebook.com/v19.0/{phone_id}/messages"
    payload: dict = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text},
    }
    if reply_to_id:
        payload["context"] = {"message_id": reply_to_id}

    try:
        resp = req.post(
            url, json=payload,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=15,
        )
        if resp.status_code == 200:
            return True
        log.error("meta_send failed to=%s status=%d body=%s", to, resp.status_code, resp.text[:200])
        return False
    except Exception:
        log.exception("meta_send_message error")
        return False
