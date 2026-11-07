"""Gate: staff scan tickets in the Android app and let people in.

A booking can enter in parts (a 4-seat ticket as 2 + 2). Each admit is a row in
`entries`; `bookings.seats_admitted` is the running total, updated under a row
lock so two phones scanning the same ticket can't let in more than were paid for.
"""
import re
import uuid
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.config import get_settings
from app.db import get_db
from app.deps import require_roles
from app.models import Booking, BookingSeat, Customer, Entry, Movie, Seat, Show, StaffUser, Theatre
from app.models.enums import BookingStatus, ShowStatus, StaffRole
from app.routers.app_catalog import show_label
from app.schemas.gate import (
    AdmitIn,
    GateEntry,
    GateShow,
    GateTicket,
    LookupIn,
    OfflineBooking,
    OfflineList,
    OfflineShow,
    SyncIn,
    SyncOut,
    SyncResult,
    Verdict,
)
from app.security import QR_PREFIX, read_ticket_qr

router = APIRouter(prefix="/api/gate", tags=["gate"])
gate_staff = require_roles(StaffRole.owner, StaffRole.manager, StaffRole.gate)

CODE_RE = re.compile(r"^[A-Z0-9]{4,8}$")


def _tz(db: Session, user: StaffUser) -> ZoneInfo:
    t = db.get(Theatre, user.theatre_id)
    return ZoneInfo(t.timezone if t else "Asia/Kolkata")


def _clock(dt: datetime, tz: ZoneInfo) -> str:
    return dt.astimezone(tz).strftime("%I:%M %p").lstrip("0")


def _window(show: Show, runtime_min: int) -> tuple[datetime, datetime]:
    opens = show.starts_at - timedelta(minutes=get_settings().gate_opens_minutes_before)
    ends = show.starts_at + timedelta(minutes=runtime_min + show.interval_min)
    return opens, ends


@router.get("/shows", response_model=list[GateShow])
def todays_shows(user: StaffUser = Depends(gate_staff), db: Session = Depends(get_db)):
    """Today's shows at this theatre, for the show picker at the top of the scanner."""
    tz = _tz(db, user)
    today = datetime.now(tz).date()
    day_start = datetime.combine(today, time.min, tz)
    rows = db.execute(
        select(Show, Movie.title, Movie.runtime_min).join(Movie, Movie.id == Show.movie_id)
        .where(Show.theatre_id == user.theatre_id, Show.starts_at >= day_start,
               Show.starts_at < day_start + timedelta(days=1))
        .order_by(Show.starts_at)
    ).all()
    ids = [s.id for s, _, _ in rows]
    sold = dict(db.execute(
        select(BookingSeat.show_id, func.count()).where(BookingSeat.show_id.in_(ids), BookingSeat.holds_seat)
        .group_by(BookingSeat.show_id)
    ).all()) if ids else {}
    admitted = dict(db.execute(
        select(Entry.show_id, func.sum(Entry.count)).where(Entry.show_id.in_(ids)).group_by(Entry.show_id)
    ).all()) if ids else {}
    now = datetime.now(UTC)
    out = []
    for s, title, runtime in rows:
        opens, ends = _window(s, runtime)
        out.append(GateShow(
            id=s.id, movie_title=title, label=show_label(s.starts_at, tz), starts_at=s.starts_at, ends_at=ends,
            status=s.status, gate_open=s.status == ShowStatus.scheduled and opens <= now <= ends,
            seats_sold=sold.get(s.id, 0), seats_admitted=int(admitted.get(s.id) or 0),
        ))
    return out


def _find(db: Session, user: StaffUser, scan: str) -> tuple[Booking | None, Verdict | None, str]:
    text = scan.strip()
    if text.startswith(QR_PREFIX):
        code = read_ticket_qr(text)
        if code is None:
            return None, "fake", "This QR is not a real Hari Shankar ticket"
    else:
        code = re.sub(r"[\s-]", "", text).upper()
        if not CODE_RE.match(code):
            return None, "not_found", "That isn't a booking ID. It looks like H57K2X"
    b = db.scalar(select(Booking).where(Booking.code == code, Booking.theatre_id == user.theatre_id))
    if b is None:
        return None, "not_found", f"No booking {code} at this theatre"
    return b, None, ""


def _ticket(db: Session, user: StaffUser, b: Booking, gate_show_id: uuid.UUID | None) -> GateTicket:
    s = get_settings()
    tz = _tz(db, user)
    show, title, runtime = db.execute(
        select(Show, Movie.title, Movie.runtime_min).join(Movie, Movie.id == Show.movie_id).where(Show.id == b.show_id)
    ).one()
    seats = [f"{r}{n}" for r, n in db.execute(
        select(Seat.row_label, Seat.number).join(BookingSeat, BookingSeat.seat_id == Seat.id)
        .where(BookingSeat.booking_id == b.id).order_by(Seat.grid_row, Seat.grid_col)
    )]
    total = len(seats)
    left = max(total - b.seats_admitted, 0)
    now = datetime.now(UTC)
    undo_after = now - timedelta(minutes=s.gate_undo_minutes)
    entries = [
        GateEntry(id=e.id, count=e.count, at=e.created_at, by=name,
                  can_undo=e.scanned_by == user.id and e.created_at >= undo_after,
                  offline=e.offline, problem=e.problem)
        for e, name in db.execute(
            select(Entry, StaffUser.name).join(StaffUser, StaffUser.id == Entry.scanned_by)
            .where(Entry.booking_id == b.id).order_by(Entry.created_at)
        )
    ]
    mobile = db.scalar(select(Customer.mobile).where(Customer.id == b.customer_id)) or ""
    label = show_label(show.starts_at, tz)
    opens, ends = _window(show, runtime)

    verdict: Verdict
    if b.status in (BookingStatus.payment_pending, BookingStatus.payment_review):
        verdict = "not_paid"
        message = ("Payment not checked yet. Ask the manager to check it in Payments"
                   if b.status == BookingStatus.payment_review else "This booking was never paid")
    elif b.status != BookingStatus.confirmed:
        verdict = "cancelled"
        message = {
            BookingStatus.refunded: "This ticket was refunded",
            BookingStatus.cancelled: "This show was cancelled",
        }.get(b.status, "Payment failed. Not a valid ticket")
    elif show.status == ShowStatus.cancelled:
        verdict, message = "cancelled", "This show was cancelled"
    elif gate_show_id and gate_show_id != show.id:
        verdict = "other_show"
        day = "today" if show.starts_at.astimezone(tz).date() == now.astimezone(tz).date() \
            else show.starts_at.astimezone(tz).strftime("%a %d %b")
        message = f"Ticket is for the {label.lower()} {day} at {_clock(show.starts_at, tz)}"
    elif now < opens:
        verdict = "too_early"
        message = f"Gate opens at {_clock(opens, tz)}" + (
            "" if show.starts_at.astimezone(tz).date() == now.astimezone(tz).date()
            else f" on {show.starts_at.astimezone(tz).strftime('%a %d %b')}")
    elif now > ends:
        verdict, message = "show_over", "This show has ended"
    elif left == 0:
        last = entries[-1].at if entries else None
        verdict = "all_in"
        message = f"All {total} already in" + (f", last at {_clock(last, tz)}" if last else "")
    else:
        verdict = "ok"
        message = f"{total} on this ticket, none in yet" if b.seats_admitted == 0 else f"{b.seats_admitted} already in. {left} left"

    return GateTicket(
        verdict=verdict, message=message, booking_id=b.id, code=b.code, customer_name=b.customer_name,
        mobile_last4=mobile[-4:], movie_title=title, show_id=show.id, show_label=label,
        starts_at=show.starts_at, seats=seats, seats_total=total, seats_admitted=b.seats_admitted,
        seats_left=left, entries=entries,
    )


@router.post("/lookup", response_model=GateTicket)
def lookup(body: LookupIn, user: StaffUser = Depends(gate_staff), db: Session = Depends(get_db)):
    """What the scanner shows after reading a QR or a typed booking ID. Changes nothing."""
    b, verdict, message = _find(db, user, body.scan)
    if b is None:
        return GateTicket(verdict=verdict, message=message)
    return _ticket(db, user, b, body.show_id)


def _locked_booking(db: Session, user: StaffUser, booking_id: uuid.UUID) -> Booking:
    b = db.scalar(select(Booking).where(Booking.id == booking_id, Booking.theatre_id == user.theatre_id)
                  .with_for_update())
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    return b


@router.post("/bookings/{booking_id}/admit", response_model=GateTicket)
def admit(booking_id: uuid.UUID, body: AdmitIn, user: StaffUser = Depends(gate_staff),
          db: Session = Depends(get_db)):
    b = _locked_booking(db, user, booking_id)
    t = _ticket(db, user, b, body.show_id)  # checked again under the lock
    if t.verdict != "ok":
        raise HTTPException(status.HTTP_409_CONFLICT, t.message)
    if body.count > t.seats_left:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Only {t.seats_left} left on this ticket")
    db.add(Entry(booking_id=b.id, show_id=b.show_id, count=body.count, scanned_by=user.id))
    b.seats_admitted += body.count
    db.commit()
    return _ticket(db, user, b, body.show_id)


@router.delete("/entries/{entry_id}", response_model=GateTicket)
def undo_entry(entry_id: uuid.UUID, user: StaffUser = Depends(gate_staff), db: Session = Depends(get_db)):
    """Undo a wrong tap (let in 4 instead of 2). Only your own, only for a few minutes."""
    e = db.get(Entry, entry_id)
    if e is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    b = _locked_booking(db, user, e.booking_id)
    db.refresh(e)
    limit = timedelta(minutes=get_settings().gate_undo_minutes)
    if e.scanned_by != user.id or datetime.now(UTC) - e.created_at > limit:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"Only the person who let them in can undo, within {limit.seconds // 60} minutes")
    b.seats_admitted = max(b.seats_admitted - e.count, 0)
    audit.record(db, user, "entry_undone", "booking", b.id, code=b.code, count=e.count)
    db.delete(e)
    db.commit()
    return _ticket(db, user, b, None)


# ---------- Offline gate ----------
#
# The scanner phone keeps a copy of today's bookings, refreshed every couple of
# minutes while it has internet. Without internet it checks tickets against that
# copy and saves who it let in; when the internet is back it sends those entries
# here. The phone can't check the QR signature offline (that would mean putting
# the server's secret on every phone), so a ticket must match a real booking in
# the copy instead; booking IDs are random, so a typed-up fake won't match.


@router.get("/offline", response_model=OfflineList)
def offline_list(user: StaffUser = Depends(gate_staff), db: Session = Depends(get_db)):
    """Today's shows and every booking for them, for checking tickets without internet."""
    tz = _tz(db, user)
    day_start = datetime.combine(datetime.now(tz).date(), time.min, tz)
    shows = db.execute(
        select(Show, Movie.title, Movie.runtime_min).join(Movie, Movie.id == Show.movie_id)
        .where(Show.theatre_id == user.theatre_id, Show.starts_at >= day_start,
               Show.starts_at < day_start + timedelta(days=1)).order_by(Show.starts_at)
    ).all()
    show_out, cancelled = [], set()
    for s, title, runtime in shows:
        opens, ends = _window(s, runtime)
        show_out.append(OfflineShow(id=s.id, movie_title=title, label=show_label(s.starts_at, tz), starts_at=s.starts_at,
                                    opens_at=opens, ends_at=ends, status=s.status))
        if s.status == ShowStatus.cancelled:
            cancelled.add(s.id)
    ids = [s.id for s, _, _ in shows]
    rows = list(db.execute(
        select(Booking, Customer.mobile).join(Customer, Customer.id == Booking.customer_id)
        .where(Booking.show_id.in_(ids), Booking.status.in_((
            BookingStatus.confirmed, BookingStatus.payment_review, BookingStatus.refunded, BookingStatus.cancelled)))
    )) if ids else []
    seats: dict[uuid.UUID, list[str]] = {}
    if rows:
        for bid, r, n in db.execute(
            select(BookingSeat.booking_id, Seat.row_label, Seat.number).join(Seat, Seat.id == BookingSeat.seat_id)
            .where(BookingSeat.booking_id.in_([b.id for b, _ in rows])).order_by(Seat.grid_row, Seat.grid_col)
        ):
            seats.setdefault(bid, []).append(f"{r}{n}")
    out = []
    for b, mobile in rows:
        if b.status == BookingStatus.payment_review:
            state, msg = "not_paid", "Payment not checked yet. Ask the manager to check it in Payments"
        elif b.status != BookingStatus.confirmed or b.show_id in cancelled:
            state = "cancelled"
            msg = "This show was cancelled" if b.show_id in cancelled else "This ticket was refunded"
        else:
            state, msg = "ok", ""
        s = seats.get(b.id, [])
        out.append(OfflineBooking(id=b.id, code=b.code, show_id=b.show_id, state=state, message=msg,
                                  customer_name=b.customer_name, mobile_last4=(mobile or "")[-4:], seats=s,
                                  seats_total=len(s), seats_admitted=b.seats_admitted))
    return OfflineList(generated_at=datetime.now(UTC), theatre_id=user.theatre_id, shows=show_out, bookings=out)


@router.post("/sync", response_model=SyncOut)
def sync_offline(body: SyncIn, user: StaffUser = Depends(gate_staff), db: Session = Depends(get_db)):
    """Entries made without internet. People who went in did go in, so every
    entry is recorded; anything odd (more than were paid for, because two
    offline phones let in the same people, or a ticket refunded meanwhile) is
    recorded with the problem so the manager can see it."""
    results = []
    for e in sorted(body.entries, key=lambda x: x.scanned_at):
        if db.get(Entry, e.id):
            results.append(SyncResult(id=e.id, result="already"))
            continue
        b = db.scalar(select(Booking).where(Booking.id == e.booking_id, Booking.theatre_id == user.theatre_id)
                      .with_for_update())
        if b is None:
            results.append(SyncResult(id=e.id, result="rejected", message="Booking not found"))
            continue
        total = db.scalar(select(func.count()).select_from(BookingSeat).where(BookingSeat.booking_id == b.id)) or 0
        problem = None
        if b.status != BookingStatus.confirmed:
            problem = "Ticket wasn't valid (refunded or not paid)"
        elif b.seats_admitted + e.count > total:
            problem = f"{b.seats_admitted + e.count - total} more let in than paid for"
        db.add(Entry(id=e.id, booking_id=b.id, show_id=b.show_id, count=e.count, scanned_by=user.id,
                     offline=True, scanned_at=e.scanned_at, problem=problem))
        b.seats_admitted += e.count
        if problem:
            audit.record(db, user, "offline_entry_problem", "booking", b.id, code=b.code, problem=problem)
        db.flush()
        results.append(SyncResult(id=e.id, result="problem" if problem else "recorded", message=problem or ""))
    db.commit()
    return SyncOut(results=results)
