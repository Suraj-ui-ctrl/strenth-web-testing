# AGENTS.md — bom-tool

Sub-project guidance. Read root `../AGENTS.md` first.

## What this is

BOM parsing + classification + sourcing + pricing. **FastAPI app**, + Celery worker + Postgres + Redis. Deployed on Azure Container Apps (`bom-tool-api`, `bom-tool-worker`). Flask is gone (Phase 3.1 of the refactor) — every route lives on FastAPI now.

## Canonical entry point (production)

```
gunicorn main:app -k uvicorn.workers.UvicornWorker --workers 2 --timeout 180
```

- `main.py` — FastAPI entry. Registers every router from `app/routes/*`. No WSGI mount, no Flask.
- `app/routes/` — every HTTP endpoint, grouped by topic (health, bom_legacy, pricing, vendors_legacy, rfq, email, eol, duty, projects, chat, whatsapp, plus the net-new `/api/v2/*` routers `bom`, `pipeline`, `vendors`, `metrics`, `diagnostics`).
- `app_helpers.py` — pure-Python business logic ported from the old Flask `app.py` (Phase 3.1). Each migrated handler is a regular function that takes a `_FlaskShim` "request" object; the FastAPI router layer builds the shim from typed dependencies.
- `app/` package — FastAPI core (config, async DB, redis, celery wiring), services, agents, models.
- `celery_worker.py` — unchanged.

## Trap — do not edit speculatively

| Path | Status |
|---|---|
| `chat_agent.py` (891 LOC) | Still live — provides `chat()` and `fast_chat()` consumed by `/api/chat`, `/api/internal/chat`, and `whatsapp_bot.py`. Not superseded by `app/agents/pipeline.py` (which is a Celery task for BOM processing, not a chat agent). Future phases may relocate it into `app/agents/`. |
| `vendor_finder.py` (692 LOC) | Live but undocumented — imported by `app_helpers.py` (the `/api/find-indian-vendors-llm` handler) and by `whatsapp-agent/agent/tools.py`. Don't delete; needs a docstring + tests. |
| `BOM_Parser.py` vs `app/services/bom_parser.py` | Two parsers. Live one is the top-level. Migration target is `app/services/bom_parser.py`. |
| `database.py` (top-level, 825 LOC) vs `app/core/database.py` vs `vendor_pricing/database.py` | Three databases. Live one is the top-level (sync) — imported by `app_helpers.py`, Celery, and the legacy fetchers. FastAPI's net-new routes use the async `app/core/database.py`. Phase 2.4 collapses these. |
| Top-level vendor fetchers (`Mouser_fetch.py`, `Digikey_fetch.py`, `lcsc_fetch.py`, `arrow_fetch.py`, `element14_fetch.py`, `eol_fetch.py`, `indian_stores_fetch.py`) | Overlap with `vendor_pricing/adapters/*`. Live ones are the top-level — `app_helpers.py` imports them directly. Phase 3.1 follow-up will move them into `vendor_pricing/adapters/`. |

See `../docs/REFACTOR_PLAN.md` and `../docs/MIGRATION_BOM_FLASK_TO_FASTAPI.md` for the cleanup plan.

## Local dev

```bash
cp .env.example .env  # fill in keys
pip install -r requirements.txt
# Dev (autoreload):
uvicorn main:app --reload --port 8000
# Prod-like:
gunicorn main:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
# Celery worker:
celery -A celery_worker.celery_app worker --loglevel=info
```

Optional Postgres + Redis via `docker-compose.yml` / `docker-compose.postgres.yml`.

## Required env vars (minimum for boot)

| Var | Purpose |
|---|---|
| `SECRET_KEY` | Legacy session signing (held over from Flask era; not currently consumed by FastAPI) |
| `DATABASE_URL` or `DB_BACKEND=sqlite` | Postgres URL or SQLite fallback |
| `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | For FastAPI's async engine (`app/core/database.py`); only needed if you call the `/api/v2/*` routes |
| `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` | Redis/Celery |
| `LLM_PROVIDER` (`anthropic` / `openai` / `gemini` / `hermes`) | Which LLM |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | LLM creds (per provider) |
| `MOUSER_API_KEY`, `DIGIKEY_CLIENT_ID`, `DIGIKEY_CLIENT_SECRET`, `ELEMENT14_API_KEY` | Supplier APIs |
| `GOOGLE_API_KEY` | Google search/Drive |

Full list in `.env.example`. Most have safe defaults except keys.

## Module map (live code)

| File / dir | Role |
|---|---|
| `main.py` | **FastAPI entry** — registers every router from `app/routes/*`. No Flask, no WSGI mount. |
| `app/routes/` | Topic-grouped FastAPI routers (`health`, `bom`, `bom_legacy`, `pricing`, `vendors`, `vendors_legacy`, `rfq`, `email`, `eol`, `duty`, `projects`, `chat`, `whatsapp`, `pipeline`, `metrics`, `diagnostics`). |
| `app/` | FastAPI core (config, async DB, redis, celery wiring), services, agents, models. |
| `app_helpers.py` | Pure-Python business logic for every ported legacy route. Imports `database.py`, `Mouser_fetch.py`, etc. |
| `celery_worker.py` | Celery app + task registration |
| `database.py` | Sync SQLite/Postgres helpers; ~20 query helpers — used by `app_helpers.py` + Celery |
| `BOM_Parser.py` | BOM file parsing (Excel, CSV, PDF) |
| `chat_agent.py` | LangChain ReAct agent (live — drives `/api/chat`, `/api/internal/chat`, and `whatsapp_bot.py`) |
| `shopping_search.py` (1,185 LOC) | Google Shopping fallback + spec parsing |
| `alt_component.py` (636 LOC) | GPT-driven alternative component finder |
| `eol_fetch.py` (560 LOC) | End-of-life check across vendors |
| `Email_Sender.py` (549 LOC) | Azure ACS + Gmail email routing |
| `rfq_sender.py` | RFQ workflow (depends on `database.py`) |
| `lcsc_fetch.py` (533 LOC) | LCSC scraping + Jina fallback |
| `gmail_parser.py` | Gmail incoming-mail parser |
| `whatsapp_bot.py` | WhatsApp bot legacy (separate from `whatsapp-agent/`) |
| `vendor_pricing/` package | Per-vendor scrapers + matching + cache |
| `templates/index.html`, `static/vendor/*` | Server-rendered UI (served by FastAPI's Jinja templates) |
| `migrations/` + `alembic.ini` | Alembic — **configured but not used** today; `main.py` lifespan still runs `Base.metadata.create_all` for new models + `app_helpers.init_db()` for legacy tables. Phase 2.5 wires this up properly. |

## Tests

- `tests/` — smoke tests (`pytest tests`)
- `test_mouser.py` — single legacy demo, not a real test
- More tests land alongside each Phase 3.1 route migration (parity tests against the Flask fallback)

## Hard constraints

1. **FastAPI everywhere.** New endpoints go in `app/routes/` as FastAPI routers. Business logic that's shared with a legacy handler lives in `app_helpers.py` (call it from the router). Net-new logic goes under `app/services/` instead.
2. **No schema changes via auto-migration.** `main.py` lifespan still calls `create_all` and `app_helpers.init_db()`; do not add columns this way — add an Alembic migration. Phase 2.5 switches the boot path.
3. **Do not introduce circular imports** between top-level legacy files and the `vendor_pricing/` package. Currently `vendor_pricing/database.py` imports the top-level `database.py`; do not make that worse.
4. **Vendor scrapers** — when adding/fixing one, update `vendor_pricing/adapters/` (the modern home), not the top-level `*_fetch.py` files.

## Smoke check before opening a PR

```bash
python -c "from main import app; assert len(app.routes) >= 70"
python -c "from celery_worker import celery_app"
python -c "import vendor_pricing"
pytest tests -q
```
