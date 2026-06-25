"""
Celery worker entry point.

Start worker:
    celery -A celery_worker.celery_app worker --loglevel=info -Q bom_pipeline

Start with concurrency (production):
    celery -A celery_worker.celery_app worker --loglevel=info -Q bom_pipeline -c 4

Start beat scheduler (for periodic tasks, if added later):
    celery -A celery_worker.celery_app beat --loglevel=info
"""
from app.core.celery_app import celery_app  # noqa: F401
import app.agents.pipeline  # noqa: F401 — ensures tasks are registered
