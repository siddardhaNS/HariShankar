"""Admin: bookings search, manual refund, and the Today page."""
import re
import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import audit
from app.config import get_settings
from app.db import get_db
from app.deps import require_roles
from app.models import Booking, BookingSeat, Customer, Movie, Seat, Show, StaffUser, Theatre
from app.models.enums import BookingStatus, ShowStatus, StaffRole
from app.routers.admin_catalog import theatre_screen
from app.routers.admin_shows import shows_out
from app.routers.app_catalog import show_label
from app.schemas.admin import (
    AdminBookingOut,
    RefundIn,
    RefundReasonTotal,
    RefundsOut,
    RefundSentIn,
    ReviewIn,
    TheatrePayments,
    TodayOut,
    TodayShow,
)
from app.services import bookings as booking_svc
from app.services import whatsapp

router = APIRouter(prefix="/api/admin", tags=["admin bookings"])
manage = require_roles(StaffRole.owner, StaffRole.manager)
owner_only = require_roles(StaffRole.owner)


def _bookings_out(db: Session, rows: list[Booking], tz: ZoneInfo) -> list[AdminBookingOut]:
    if not rows:
        return []
    ids = [b.id for b in rows]
    seats: dict[uuid.UUID, list[str]] = {}
    for bid, row, num in db.execute(
        select(BookingSeat.booking_id, Seat.row_label, Seat.number).join(Seat, Seat.id == BookingSeat.seat_id)
        .where(BookingSeat.booking_id.in_(ids)).order_by(Seat.grid_row, Seat.grid_col)
    ):
        seats.setdefault(bid, []).append(f"{row}{num}")
    shows = {s.id: s for s in db.scalars(select(Show).where(Show.id.in_({b.show_id for b in rows})))}
    titles = dict(db.execute(select(Movie.id, Movie.title).where(Movie.id.in_({s.movie_id for s in shows.values()}))).all())
    mobiles = dict(db.execute(select(Customer.id, Customer.mobile).where(Customer.id.in_({b.customer_id for b in rows}))).all())
    out = []
    for b in rows:
        s = shows[b.show_id]
        out.append(AdminBookingOut(
            id=b.id, code=b.code, status=b.status, failure_reason=b.failure_reason, customer_name=b.customer_name,
            mobile=mobiles.get(b.customer_id, ""), movie_title=titles.get(s.movie_id, ""), starts_at=s.starts_at,
            show_label=show_label(s.starts_at, tz), show_status=s.status, seats=seats.get(b.id, []),
            total_paise=b.total_paise, refund_paise=b.refund_paise, refund_id=b.refund_id,
            payment_method=b.payment_method, gateway=b.gateway, upi_ref=b.upi_ref, refund_pending=b.refund_pending,
            refunded_at=b.refunded_at, refund_sent_at=b.refund_sent_at, refund_note=b.refund_note,
            seats_admitted=b.seats_admitted, created_at=b.created_at,
        ))
    return out


def _tz(db: Session, user: StaffUser) -> ZoneInfo:
    t = db.get(Theatre, user.theatre_id)
    assert t
    return ZoneInfo(t.timezone)


@router.get("/bookings", response_model=list[AdminBookingOut])
def search_bookings(
    q: str = Query(default="", max_length=80),
    show_id: uuid.UUID | None = None,
    user: StaffUser = Depends(manage),
    db: Session = Depends(get_db),
):
    """Search by booking ID, name or mobile number; or list a show's bookings.
    Abandoned payment attempts are left out."""
    stmt = (
        select(Booking).join(Customer, Customer.id == Booking.customer_id)
        .where(Booking.theatre_id == user.theatre_id, Booking.status != BookingStatus.payment_pending)
    )
    if show_id:
        stmt = stmt.where(Booking.show_id == show_id)
    term = q.strip()
    if term:
        digits = re.sub(r"\D", "", term)
        conds = [Booking.code == term.upper(), Booking.customer_name.ilike(f"%{term}%")]
        if len(digits) >= 4:
            conds.append(Customer.mobile.like(f"%{digits[-10:]}%"))
        stmt = stmt.where(or_(*conds))
    elif not show_id:
        return []
    rows = list(db.scalars(stmt.order_by(Booking.created_at.desc()).limit(100)))
    return _bookings_out(db, rows, _tz(db, user))


@router.post("/bookings/{booking_id}/refund", response_model=AdminBookingOut)
def refund_booking(booking_id: uuid.UUID, body: RefundIn, user: StaffUser = Depends(owner_only),
                   db: Session = Depends(get_db)):
    b = db.scalar(select(Booking).where(Booking.id == booking_id, Booking.theatre_id == user.theatre_id).with_for_update())
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if b.seats_admitted > 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Someone on this booking has already entered")
    booking_svc.refund_confirmed(db, b, "manual_refund", body.reason.strip())
    audit.record(db, user, "booking_refunded", "booking", b.id, code=b.code, amount_paise=b.refund_paise,
                 reason=body.reason.strip())
    db.commit()
    return _bookings_out(db, [b], _tz(db, user))[0]


@router.get("/today", response_model=TodayOut)
def today(user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    tz = _tz(db, user)
    now = datetime.now(UTC)
    day = now.astimezone(tz).date()
    lo = datetime.combine(day, time.min, tz)
    shows = list(db.scalars(
        select(Show).where(Show.theatre_id == user.theatre_id, Show.starts_at >= lo,
                           Show.starts_at < lo + timedelta(days=1)).order_by(Show.starts_at)
    ))
    rows = shows_out(db, shows, tz)
    live = [r for r in rows if r.status == ShowStatus.scheduled]
    ids = [s.id for s in shows]
    refunds = db.scalar(select(func.coalesce(func.sum(Booking.refund_paise), 0)).where(
        Booking.show_id.in_(ids), Booking.status == BookingStatus.refunded)) if ids else 0
    stuck = db.scalar(select(func.count()).select_from(Booking).where(
        Booking.theatre_id == user.theatre_id, Booking.status == BookingStatus.payment_pending,
        Booking.created_at < now - timedelta(minutes=get_settings().payment_window_minutes),
        Booking.created_at > now - timedelta(days=2)))

    to_check = db.scalar(select(func.count()).select_from(Booking).where(
        Booking.theatre_id == user.theatre_id, Booking.status == BookingStatus.payment_review)) or 0
    to_send = db.scalar(select(func.count()).select_from(Booking).where(
        Booking.theatre_id == user.theatre_id, Booking.refund_pending.is_(True))) or 0
    theatre = db.get(Theatre, user.theatre_id)
    screen = theatre_screen(db, user)
    setup = {
        "layout": bool(db.scalar(select(Seat.id).where(Seat.screen_id == screen.id, Seat.is_active.is_(True)).limit(1))),
        "movies": bool(db.scalar(select(Movie.id).where(Movie.theatre_id == user.theatre_id).limit(1))),
        "shows": bool(db.scalar(select(Show.id).where(Show.theatre_id == user.theatre_id, Show.starts_at > now,
                                                      Show.status == ShowStatus.scheduled).limit(1))),
        "staff": (db.scalar(select(func.count()).select_from(StaffUser).where(
            StaffUser.theatre_id == user.theatre_id, StaffUser.is_active.is_(True))) or 0) > 1,
    }
    return TodayOut(
        date=day,
        collection_paise=sum(r.collection_paise for r in live),
        tickets_sold=sum(r.seats_sold for r in live),
        seats_total=sum(r.seats_total for r in live),
        refunds_paise=refunds or 0,
        stuck_payments=stuck or 0,
        payments_to_check=to_check,
        refunds_to_send=to_send,
        upi_id=theatre.upi_id if theatre else None,
        shows=[TodayShow(id=r.id, movie_title=r.movie_title, starts_at=r.starts_at, label=r.label, status=r.status,
                         seats_total=r.seats_total, seats_sold=r.seats_sold, collection_paise=r.collection_paise)
               for r in rows],
        setup={**setup, "upi": bool(theatre and theatre.upi_id)},
    )


# ---------- Direct UPI: payments to check, refunds to send ----------


def _locked_booking(db: Session, user: StaffUser, booking_id: uuid.UUID) -> Booking:
    b = db.scalar(select(Booking).where(Booking.id == booking_id, Booking.theatre_id == user.theatre_id).with_for_update())
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    return b


@router.get("/payments", response_model=list[AdminBookingOut])
def payments_to_handle(user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    """UPI payments waiting for a check, and refunds the theatre still has to send."""
    rows = list(db.scalars(
        select(Booking).where(Booking.theatre_id == user.theatre_id,
                              or_(Booking.status == BookingStatus.payment_review, Booking.refund_pending.is_(True)))
        .order_by(Booking.updated_at)
    ))
    return _bookings_out(db, rows, _tz(db, user))


@router.post("/bookings/{booking_id}/review", response_model=AdminBookingOut)
def review_payment(booking_id: uuid.UUID, body: ReviewIn, user: StaffUser = Depends(manage),
                   db: Session = Depends(get_db)):
    """Staff checked the theatre's UPI account: did this payment arrive?"""
    b = _locked_booking(db, user, booking_id)
    booking_svc.review_upi(db, b, body.received)
    audit.record(db, user, "upi_payment_received" if body.received else "upi_payment_not_received", "booking", b.id,
                 code=b.code, upi_ref=b.upi_ref, amount_paise=b.total_paise)
    db.commit()
    return _bookings_out(db, [b], _tz(db, user))[0]


@router.post("/bookings/{booking_id}/refund-sent", response_model=AdminBookingOut)
def refund_sent(booking_id: uuid.UUID, body: RefundSentIn, user: StaffUser = Depends(owner_only),
                db: Session = Depends(get_db)):
    """The owner sent a direct-UPI refund by hand; record its UPI reference."""
    b = _locked_booking(db, user, booking_id)
    booking_svc.mark_refund_sent(db, b, body.ref.strip())
    audit.record(db, user, "refund_sent", "booking", b.id, code=b.code, ref=b.refund_id, amount_paise=b.refund_paise)
    db.commit()
    return _bookings_out(db, [b], _tz(db, user))[0]


@router.get("/theatre/payments", response_model=TheatrePayments | None)
def get_payments_settings(user: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    t = db.get(Theatre, user.theatre_id)
    if t is None or not t.upi_id:
        return None
    return TheatrePayments(upi_id=t.upi_id, upi_name=t.upi_name or t.name)


@router.put("/theatre/payments", response_model=TheatrePayments)
def set_payments_settings(body: TheatrePayments, user: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    t = db.get(Theatre, user.theatre_id)
    assert t
    audit.record(db, user, "upi_id_changed", "theatre", t.id, old=t.upi_id, new=body.upi_id)
    t.upi_id = body.upi_id.strip()
    t.upi_name = body.upi_name.strip()
    db.commit()
    return body


@router.post("/bookings/{booking_id}/resend", response_model=AdminBookingOut)
def resend_ticket(booking_id: uuid.UUID, user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    """Send the booking's WhatsApp message again."""
    b = _locked_booking(db, user, booking_id)
    if b.status != BookingStatus.confirmed:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only confirmed bookings have a ticket to send")
    try:
        whatsapp.resend_ticket(db, b)
    except ValueError as e:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(e)) from None
    audit.record(db, user, "ticket_resent", "booking", b.id, code=b.code)
    db.commit()
    return _bookings_out(db, [b], _tz(db, user))[0]


# ---------- Refunds ----------

REFUND_STATES = ("to_send", "done", "all")


@router.get("/refunds", response_model=RefundsOut)
def refunds(
    state: str = Query(default="all", pattern="^(to_send|done|all)$"),
    start: date | None = None,
    end: date | None = None,
    reason: str | None = Query(default=None, max_length=40),
    q: str = Query(default="", max_length=80),
    user: StaffUser = Depends(manage),
    db: Session = Depends(get_db),
):
    """Every refund: what's still to be sent back, and the history by refund date."""
    tz = _tz(db, user)
    today = datetime.now(tz).date()
    end = end or today
    start = start or end - timedelta(days=29)
    if start > end:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Start date is after the end date")
    base = [Booking.theatre_id == user.theatre_id, Booking.status == BookingStatus.refunded, Booking.refund_paise > 0]

    # Always shown in full, whatever the dates: money the theatre still owes
    owed = db.execute(select(func.count(), func.coalesce(func.sum(Booking.refund_paise), 0))
                      .where(*base, Booking.refund_pending.is_(True))).one()

    stmt = select(Booking).join(Customer, Customer.id == Booking.customer_id).where(*base)
    if state == "to_send":
        stmt = stmt.where(Booking.refund_pending.is_(True))
    else:
        lo = datetime.combine(start, time.min, tz)
        hi = datetime.combine(end + timedelta(days=1), time.min, tz)
        stmt = stmt.where(func.coalesce(Booking.refunded_at, Booking.updated_at) >= lo,
                          func.coalesce(Booking.refunded_at, Booking.updated_at) < hi)
        if state == "done":
            stmt = stmt.where(Booking.refund_pending.is_(False))
    if reason:
        stmt = stmt.where(Booking.failure_reason == reason)
    term = q.strip()
    if term:
        digits = re.sub(r"\D", "", term)
        conds = [Booking.code == term.upper(), Booking.customer_name.ilike(f"%{term}%")]
        if len(digits) >= 4:
            conds.append(Customer.mobile.like(f"%{digits[-10:]}%"))
        stmt = stmt.where(or_(*conds))
    rows = list(db.scalars(stmt.order_by(Booking.refund_pending.desc(),
                                         func.coalesce(Booking.refunded_at, Booking.updated_at).desc()).limit(300)))
    by_reason: dict[str, list[int]] = {}
    for b in rows:
        agg = by_reason.setdefault(b.failure_reason or "other", [0, 0])
        agg[0] += 1
        agg[1] += b.refund_paise
    return RefundsOut(
        start=start, end=end, state=state,
        to_send_count=owed[0], to_send_paise=owed[1],
        listed_count=len(rows), listed_paise=sum(b.refund_paise for b in rows),
        by_reason=[RefundReasonTotal(reason=k, count=v[0], paise=v[1]) for k, v in sorted(by_reason.items())],
        refunds=_bookings_out(db, rows, tz),
    )
