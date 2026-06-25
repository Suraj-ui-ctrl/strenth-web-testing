"""
FastAPI application entry point.

Run (development):
    uvicorn main:app --reload --port 8000

Run (production):
    gunicorn main:app -k uvicorn.workers.UvicornWorker -w 4 --bind 0.0.0.0:8000

History: the bom-tool used to be a Flask monolith (`app.py`, 3,327 LOC,
70+ routes). Phase 3.5 of the refactor moved the entry point to FastAPI
but kept the Flask app mounted via `WSGIMiddleware`. Phase 3.1 (this
commit set) ported every Flask route to FastAPI routers under
`app/routes/*`, lifted the route handler logic into `app_helpers.py`,
and deleted `app.py` and the WSGI mount. The full migration plan is in
`docs/MIGRATION_BOM_FLASK_TO_FASTAPI.md`.
"""
from __future__ import annotations

import os as _os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

_HERE = _os.path.dirname(_os.path.abspath(__file__))

from app.core.config import settings
from app.core.database import async_engine
from app.core.redis_client import close_redis
from app.models import *  # noqa: F401,F403 — registers all models with Base metadata
from app.core.database import Base
from app.routes.bom import router as bom_router
from app.routes.bom_legacy import router as bom_legacy_router
from app.routes.chat import router as chat_router
from app.routes.diagnostics import router as diagnostics_router
from app.routes.duty import router as duty_router
from app.routes.email import router as email_router
from app.routes.eol import router as eol_router
from app.routes.health import router as health_router
from app.routes.metrics import router as metrics_router
from app.routes.pipeline import router as pipeline_router
from app.routes.pricing import router as pricing_router
from app.routes.projects import router as projects_router
from app.routes.rfq import router as rfq_router
from app.routes.vendors import router as vendor_router
from app.routes.vendors_legacy import router as vendors_legacy_router
from app.routes.whatsapp import router as whatsapp_router
from app.utils.logging import configure_logging, get_logger

configure_logging(debug=settings.DEBUG)
log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──
    log.info("startup", app=settings.APP_NAME, version=settings.APP_VERSION)
    async with async_engine.begin() as conn:
        # Create tables that don't exist yet (dev convenience — use Alembic in prod)
        await conn.run_sync(Base.metadata.create_all)

    # Legacy sync database bootstrap. Previously the WSGI-mounted Flask app
    # called `init_db()` at import time and `ensure_prd_tables()` once. With
    # the WSGI mount gone, we run them here so the legacy SQLite/Postgres
    # tables stay populated. Both are idempotent and tolerate "table already
    # exists". Wrapped in try/except so a missing DB in CI/tests doesn't
    # block FastAPI boot.
    try:
        import app_helpers
        app_helpers.init_db()
        app_helpers.ensure_prd_tables()
        log.info("legacy_db_ready")
    except Exception as exc:
        log.warning("legacy_db_init_failed", error=str(exc))

    yield
    # ── Shutdown ──
    await close_redis()
    await async_engine.dispose()
    log.info("shutdown")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Production-grade BOM Parsing & CDP/BOP Classification Agent System",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── Static files & templates ──────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory=_os.path.join(_HERE, "static")), name="static")
templates = Jinja2Templates(directory=_os.path.join(_HERE, "templates"))

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5000",
        "http://127.0.0.1:5173",
        "https://strenth-frontend.jollyfield-91f54af9.centralindia.azurecontainerapps.io",
    ],
    allow_origin_regex=r"https://.*\.azurecontainerapps\.io",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
# Net-new FastAPI surface — versioned at /api/v2/*.
app.include_router(bom_router, prefix="/api/v2")
app.include_router(pipeline_router, prefix="/api/v2")
app.include_router(vendor_router, prefix="/api/v2")
app.include_router(metrics_router, prefix="/api/v2")

# Ported-from-Flask routers (Phase 3.1). Each keeps the original URL path so
# the existing frontend / WhatsApp bot / external integrations keep working
# unchanged. Business logic lives in app_helpers.py.
app.include_router(diagnostics_router)
app.include_router(health_router)
app.include_router(bom_legacy_router)
app.include_router(pricing_router)
app.include_router(vendors_legacy_router)
app.include_router(rfq_router)
app.include_router(email_router)
app.include_router(eol_router)
app.include_router(duty_router)
app.include_router(projects_router)
app.include_router(chat_router)
app.include_router(whatsapp_router)


# ── Frontend ──────────────────────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "version": settings.APP_VERSION}


@app.get("/healthz", tags=["Health"], include_in_schema=False)
async def healthz():
    # Azure Container App liveness probe hits this path.
    return {"status": "ok"}


# ── Global exception handler ──────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    log.error("unhandled_exception", path=str(request.url), error=str(exc))
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc) if settings.DEBUG else ""},
    )


# Flask is gone. The legacy `app.py` + `wsgi.py` + WSGIMiddleware mount were
# deleted in Phase 3.1 of the refactor once every Flask route had a FastAPI
# equivalent registered above. Business logic for the migrated routes lives in
# `app_helpers.py`.
