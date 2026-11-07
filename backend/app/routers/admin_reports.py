"""Admin: Reports and Insights (owner only)."""
import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_roles
from app.models import StaffUser, Theatre
from app.models.enums import StaffRole
from app.schemas.admin import InsightsOut, ReportOut
from app.services import insights as insights_svc
from app.services import reports
from app.services.reports import SLOTS, Filters

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


def _filters(movie_id: uuid.UUID | None, slot: str | None, class_id: uuid.UUID | None) -> Filters:
    if slot and slot not in SLOTS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Show time is one of: {', '.join(SLOTS)}")
    return Filters(movie_id=movie_id, slot=slot or None, class_id=class_id)


@router.get("/insights", response_model=InsightsOut)
def insights(start: date | None = Query(default=None), end: date | None = Query(default=None),
             movie_id: uuid.UUID | None = None, slot: str | None = Query(default=None, max_length=20),
             class_id: uuid.UUID | None = None,
             user: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    """Who books, when, and what fills the hall. Defaults to the last 30 days.
    Filter by movie, show time (Morning, Matinee, First show, Second show) and class."""
    s, e = _range(db, user, start, end, 30)
    return insights_svc.full(db, user.theatre_id, s, e, _filters(movie_id, slot, class_id))


@router.get("/insights.xlsx")
def insights_excel(start: date | None = Query(default=None), end: date | None = Query(default=None),
                   movie_id: uuid.UUID | None = None, slot: str | None = Query(default=None, max_length=20),
                   class_id: uuid.UUID | None = None,
                   user: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    """The same Insights as an Excel file, one sheet per view."""
    s, e = _range(db, user, start, end, 30)
    data = insights_svc.full(db, user.theatre_id, s, e, _filters(movie_id, slot, class_id))
    theatre = db.get(Theatre, user.theatre_id)
    body = insights_svc.to_excel(data, theatre.name if theatre else "")
    return Response(body, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="insights-{s}-to-{e}.xlsx"'})
