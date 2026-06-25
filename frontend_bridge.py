"""Lightweight BOM tool bridge for the CircuitMind workspace frontend.

Runs on :8002 locally.  The Vite dev-server proxy (vite.config.ts) splits
traffic:
  bom-tool paths  → http://localhost:8002   (this process)
  project/DFM     → http://localhost:8001   (CircuitMind backend)

No PostgreSQL / Redis / Celery needed — all handlers use the legacy SQLite
database via app_helpers.py.

Start:
    cd bom-tool
    uvicorn frontend_bridge:app --port 8002 --reload
"""
from __future__ import annotations

import os
from pathlib import Path


def _load_local_env() -> None:
    env_path = Path(__file__).resolve().with_name(".env")
    if not env_path.exists():
        return
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except Exception:
        # The bridge must still start even if .env parsing fails.
        pass


_load_local_env()

from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from app.routes.bom_legacy import router as bom_legacy_router
from app.routes.chat import router as chat_router
from app.routes.diagnostics import router as diagnostics_router
from app.routes.duty import router as duty_router
from app.routes.email import router as email_router
from app.routes.eol import router as eol_router
from app.routes.health import router as health_router
from app.routes.pricing import router as pricing_router
from app.routes.projects import router as projects_router
from app.routes.rfq import router as rfq_router
from app.routes.vendors_legacy import router as vendors_legacy_router
from app.services.classifier import classify_rows
from app.services.llm_service import build_llm_service

app = FastAPI(
    title="BOM Tool — Local Dev Bridge",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS — allow the Vite dev server ─────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:5000",
        "http://localhost:8000",
        "http://localhost:8001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5000",
        "https://strenth-frontend.jollyfield-91f54af9.centralindia.azurecontainerapps.io",
    ],
    allow_origin_regex=r"https://.*\.azurecontainerapps\.io",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── BOM parsing & classification ──────────────────────────────────────────────
app.include_router(bom_legacy_router)

# ── Pricing (bulk, Indian vendors, price history) ─────────────────────────────
app.include_router(pricing_router)

# ── RFQ (send, track, replies, alternatives) ──────────────────────────────────
app.include_router(rfq_router)

# ── Vendors & contract manufacturers ─────────────────────────────────────────
app.include_router(vendors_legacy_router)

# ── Customs duty, HSN, landed cost ───────────────────────────────────────────
app.include_router(duty_router)

# ── End-of-life checks ───────────────────────────────────────────────────────
app.include_router(eol_router)

# ── Email (RFQ email sender status) ──────────────────────────────────────────
app.include_router(email_router)

# ── Project files, quotes, export report ─────────────────────────────────────
app.include_router(projects_router)

# ── Conversational chat (LangChain ReAct agent) ───────────────────────────────
app.include_router(chat_router)

# ── Health & feature flags ────────────────────────────────────────────────────
app.include_router(health_router)

# ── Runtime diagnostics ───────────────────────────────────────────────────────
app.include_router(diagnostics_router)


class ClassifyBomPayload(BaseModel):
    items: list[dict]
    current_user: dict | None = None


def _current_user_context(current_user: dict | None) -> str | None:
    if not current_user:
        return None
    name = str(current_user.get("name", "")).strip()
    email = str(current_user.get("email", "")).strip()
    role = str(current_user.get("role", "")).strip()
    parts = [part for part in [name, email, role] if part]
    if not parts:
        return None
    return " | ".join(parts)


def _normalize_row(item: dict) -> dict:
    row = dict(item)
    row["mpn"] = row.get("mpn") or row.get("MPN") or row.get("Part") or row.get("part") or ""
    row["description"] = row.get("description") or row.get("Description") or row.get("part_name") or row["mpn"]
    row["quantity"] = row.get("quantity") or row.get("Quantity") or row.get("qty") or 1
    return row


@app.post("/bom-tool/api/classify-bom-llm")
def classify_bom_llm(payload: ClassifyBomPayload):
    llm = build_llm_service()
    rows = [_normalize_row(item) for item in payload.items]
    user_context = _current_user_context(payload.current_user)
    classified = []
    if llm is not None:
        for row in rows:
            desc = str(row.get("Description") or row.get("description") or row.get("part_name") or "").strip()
            mpn = row.get("MPN") or row.get("mpn") or row.get("Part") or row.get("part")
            try:
                raw = llm.classify_component(description=desc, mpn=str(mpn) if mpn is not None else None, user_context=user_context)
                cls = str(raw.classification).upper()
                if cls == "MECHANICAL":
                    cls = "CDP"
                if cls not in {"BOP", "CDP", "AMBIGUOUS"}:
                    cls = "AMBIGUOUS"
                row["classification"] = cls
                row["classification_confidence"] = raw.confidence
                row["classification_method"] = raw.method
                row["classification_reason"] = raw.reason
                row["needs_review"] = cls == "AMBIGUOUS"
                row["status"] = "CLASSIFIED" if cls != "AMBIGUOUS" else row.get("status", "CLASSIFIED")
            except Exception as exc:
                row["classification"] = "AMBIGUOUS"
                row["classification_confidence"] = 0.5
                row["classification_method"] = "llm_error"
                row["classification_reason"] = f"LLM call failed: {exc}"
                row["needs_review"] = True
                row["status"] = "CLASSIFIED"
            classified.append(row)
    else:
        classified = classify_rows(rows, llm_service=None, ctx_mgr=None)
    by_classification: dict[str, int] = {}
    ambiguous = 0
    for row in classified:
        cls = str(row.get("classification", "AMBIGUOUS")).upper()
        by_classification[cls] = by_classification.get(cls, 0) + 1
        if row.get("needs_review"):
            ambiguous += 1
    return {
        "success": True,
        "llm_enabled": llm is not None,
        "items": classified,
        "current_user": payload.current_user,
        "ambiguous": ambiguous,
        "by_classification": by_classification,
    }


@app.post("/api/classify-bom")
def classify_bom(payload: ClassifyBomPayload):
    return classify_bom_llm(payload)


# ── /api/ai-provider — called by CircuitMind api/index.ts getAiProvider() ────
@app.get("/api/ai-provider", tags=["Diagnostics"])
def ai_provider_info():
    """Return current AI provider label so the UI can show which model is active."""
    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    model_env = os.getenv("LLM_MODEL", "").strip()

    _default_models: dict[str, str] = {
        "anthropic": os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
        "openai":    os.getenv("OPENAI_MODEL",    model_env or "gpt-4o-mini"),
        "gemini":    os.getenv("GEMINI_MODEL",     "gemini-2.0-flash"),
    }
    model = model_env or _default_models.get(provider, "unknown")

    _configured: dict[str, bool] = {
        "anthropic": bool(os.getenv("ANTHROPIC_API_KEY", "").strip()),
        "openai":    bool(os.getenv("OPENAI_API_KEY", "").strip()),
        "gemini":    (
            bool(os.getenv("GEMINI_API_KEY", "").strip())
            or bool(os.getenv("GOOGLE_API_KEY", "").strip())
        ),
    }
    configured = _configured.get(provider, False)

    _labels: dict[str, str] = {
        "anthropic": f"Claude ({model})",
        "openai":    f"GPT ({model})",
        "gemini":    f"Gemini ({model})",
    }
    label = _labels.get(provider, provider.title())
    if not configured:
        label += " — key missing"

    return {
        "provider":   provider,
        "model":      model,
        "configured": configured,
        "label":      label,
    }


@app.get("/bom-tool/api/runtime-status", tags=["Diagnostics"])
def runtime_status():
    llm = build_llm_service()
    return {
        "ok": True,
        "llm_enabled": llm is not None,
        "provider": os.getenv("LLM_PROVIDER", "anthropic"),
        "model": os.getenv("LLM_MODEL", ""),
        "anthropic_key": bool(os.getenv("ANTHROPIC_API_KEY", "").strip()),
        "openai_key": bool(os.getenv("OPENAI_API_KEY", "").strip()),
        "gemini_key": bool(os.getenv("GEMINI_API_KEY", "").strip() or os.getenv("GOOGLE_API_KEY", "").strip()),
        "mouser_key": bool(os.getenv("MOUSER_API_KEY", "").strip()),
        "digikey_client": bool(os.getenv("DIGIKEY_CLIENT_ID", "").strip() and os.getenv("DIGIKEY_CLIENT_SECRET", "").strip()),
        "element14_key": bool(os.getenv("ELEMENT14_API_KEY", "").strip()),
    }


# ── /health — quick liveness probe ────────────────────────────────────────────
@app.get("/health", tags=["Health"], include_in_schema=False)
def health():
    return {"status": "ok", "service": "bom-tool-bridge"}
