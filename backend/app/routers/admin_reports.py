"""Admin: Reports and Insights (owner only)."""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_roles
from app.models import StaffUser, Theatre
from app.models.enums import StaffRole
from app.schemas.admin import InsightsOut, ReportOut
from app.services import reports

router = APIRouter(prefix="/api/admin", tags=["admin reports"])
owner_only = require_roles(StaffRole.owner)
MAX_DAYS = 366


def _range(db: Session, user: StaffUser, start: date | None, end: date | None, default_days: int) -> tuple[date, date]:
    theatre = db.get(Theatre, user.theatre_id)
    today = datetime.now(ZoneInfo(theatre.timezone if theatre else "Asia/Kolkata")).date()
    end = end or today
    start = start or end - timedelta(days=default_days - 1)
    if start > end:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Start date is after the end date")
    if (end - start).days >= MAX_DAYS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick a year or less")
    return start, end


@router.get("/reports", response_model=ReportOut)
def report(start: date | None = Query(default=None), end: date | None = Query(default=None),
           user: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    """Money and seats per show date. Defaults to the last 7 days."""
    s, e = _range(db, user, start, end, 7)
    return reports.report(db, user.theatre_id, s, e)


@router.get("/insights", response_model=InsightsOut)
def insights(start: date | None = Query(default=None), end: date | None = Query(default=None),
             user: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    """Who books, when, and what fills the hall. Defaults to the last 30 days."""
    s, e = _range(db, user, start, end, 30)
    return reports.insights(db, user.theatre_id, s, e)
