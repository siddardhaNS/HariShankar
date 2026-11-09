import os
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import get_settings

if os.environ.get("VERCEL"):
    # Each function instance is short-lived and the database's connection pooler
    # shares connections, so keep no pool here and no prepared statements.
    engine = create_engine(get_settings().database_url, poolclass=NullPool, connect_args={"prepare_threshold": None})
else:
    engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
