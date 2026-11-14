"""Whether the customer app is open, and the guard that closes it during maintenance."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Theatre
from app.routers.app_catalog import resolve_theatre

router = APIRouter(prefix="/api/app", tags=["app status"])


class AppStatus(BaseModel):
    maintenance: bool
    message: str = ""


def _app_theatre(db: Session) -> Theatre | None:
    # Phase 1 has one theatre and the app talks to it; see resolve_theatre
    try:
        return resolve_theatre(db, None)
    except HTTPException:
        return None


@router.get("/status", response_model=AppStatus)
def app_status(db: Session = Depends(get_db)):
    """The app asks this on start and every so often. Never blocked by maintenance."""
    t = _app_theatre(db)
    if t is None or not t.maintenance_on:
        return AppStatus(maintenance=False)
    return AppStatus(maintenance=True, message=t.maintenance_message)


def customer_app_open(db: Session = Depends(get_db)) -> None:
    """Router dependency for the customer app: 503 with the message while maintenance is on.
    An app that missed the status check still lands on the maintenance screen."""
    t = _app_theatre(db)
    if t is not None and t.maintenance_on:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            {"maintenance": True, "message": t.maintenance_message})
