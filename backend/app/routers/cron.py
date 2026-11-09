"""The scheduled call that does the worker's job on Vercel (see vercel.json)."""
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app import worker
from app.config import get_settings
from app.db import get_db

router = APIRouter(prefix="/api/cron", tags=["cron"])


@router.get("/tick")
def tick(authorization: str = Header(default=""), db: Session = Depends(get_db)):
    secret = get_settings().cron_secret
    if not secret or not secrets.compare_digest(authorization.encode(), f"Bearer {secret}".encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not allowed")
    return {"sent": worker.run_once(db)}
