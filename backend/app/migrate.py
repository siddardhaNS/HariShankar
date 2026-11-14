"""Bring the database up to date when the API starts on Vercel.

Vercel has no release step to run `alembic upgrade head`, so each new deploy
applies its own migrations on its first cold start. A Postgres advisory lock,
held for the whole migration transaction, makes instances that start together
wait for the first one instead of running the same migration twice. Once the
database is at head, later starts only check the version and move on.
"""
import logging
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text

log = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parent.parent
LOCK_ID = 46_917_203  # any fixed number; every instance uses the same one

# Shown on /health so a deploy can be checked from outside
status: dict[str, str] = {"migrations": "not run"}


def should_run() -> bool:
    # Production only: Preview deployments (other branches) share the live database,
    # and must not apply a branch's unmerged migrations to it
    return os.environ.get("VERCEL_ENV") == "production" or os.environ.get("MIGRATE_ON_START") == "1"


def upgrade_to_head() -> None:
    from app.db import engine

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    with engine.begin() as conn:
        # Released when this transaction ends; works through a transaction-mode pooler
        conn.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": LOCK_ID})
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")


def run_on_start() -> None:
    if not should_run():
        return
    try:
        upgrade_to_head()
        status["migrations"] = "ok"
    except Exception:
        # Nothing was changed (the migration is one transaction). Keep serving, so the
        # old features still work, and leave the error in the function log.
        log.exception("Database migration on start failed")
        status["migrations"] = "failed"
