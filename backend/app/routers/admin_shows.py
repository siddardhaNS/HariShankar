"""Admin: show timings, prices, cancelling, seat map and blocking."""
import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import audit
from app.db import get_db
from app.deps import require_roles
from app.models import Booking, BookingSeat, Customer, Movie, Seat, SeatBlock, SeatClass, Show, ShowPrice, StaffUser, Theatre
from app.models.enums import BookingStatus, ShowStatus, StaffRole
from app.routers.admin_catalog import theatre_screen
from app.routers.app_catalog import show_label
from app.schemas.admin import (
    AdminSeat,
    AdminSeatMap,
    BlockIn,
    BlockOut,
    CancelShowIn,
    CancelShowOut,
    PricesIn,
    ShowAdminOut,
    ShowConflict,
    ShowPriceOut,
    ShowsCreateIn,
    ShowsCreateOut,
    SeatMapBooking,
    UnblockIn,
)
from app.services import bookings as booking_svc
from app.services import seating

router = APIRouter(prefix="/api/admin", tags=["admin shows"])
manage = require_roles(StaffRole.owner, StaffRole.manager)

CLEANING_MIN = 15  # gap needed between one show ending and the next starting


def _tz(db: Session, user: StaffUser) -> ZoneInfo:
    theatre = db.get(Theatre, user.theatre_id)
    assert theatre
    return ZoneInfo(theatre.timezone)


def _own_show(db: Session, user: StaffUser, show_id: uuid.UUID, lock: bool = False) -> Show:
    q = select(Show).where(Show.id == show_id, Show.theatre_id == user.theatre_id)
    show = db.scalar(q.with_for_update() if lock else q)
    if show is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Show not found")
    return show


def shows_out(db: Session, shows: list[Show], tz: ZoneInfo) -> list[ShowAdminOut]:
    if not shows:
        return []
    ids = [s.id for s in shows]
    movies = {m.id: m for m in db.scalars(select(Movie).where(Movie.id.in_({s.movie_id for s in shows})))}
    class_names = dict(db.execute(select(SeatClass.id, SeatClass.name)).all())
    prices: dict[uuid.UUID, list[ShowPriceOut]] = {}
    for p in db.scalars(select(ShowPrice).where(ShowPrice.show_id.in_(ids))):
        prices.setdefault(p.show_id, []).append(
            ShowPriceOut(seat_class_id=p.seat_class_id, class_name=class_names.get(p.seat_class_id, ""), price_paise=p.price_paise)
        )
    sold = dict(db.execute(
        select(BookingSeat.show_id, func.count()).where(BookingSeat.show_id.in_(ids), BookingSeat.holds_seat.is_(True))
        .group_by(BookingSeat.show_id)
    ).all())
    collection = dict(db.execute(
        select(Booking.show_id, func.sum(Booking.total_paise))
        .where(Booking.show_id.in_(ids), Booking.status == BookingStatus.confirmed).group_by(Booking.show_id)
    ).all())
    out = []
    for s in shows:
        states = seating.seat_states(db, s)
        m = movies[s.movie_id]
        out.append(ShowAdminOut(
            id=s.id, movie_id=m.id, movie_title=m.title, starts_at=s.starts_at,
            ends_at=s.starts_at + timedelta(minutes=m.runtime_min + s.interval_min),
            label=show_label(s.starts_at, tz), status=s.status, cancel_reason=s.cancel_reason,
            booking_opens_at=s.booking_opens_at,
            prices=sorted(prices.get(s.id, []), key=lambda p: p.price_paise),
            seats_total=len(states), seats_sold=sold.get(s.id, 0),
            seats_blocked=sum(1 for v in states.values() if v == seating.BLOCKED),
            collection_paise=collection.get(s.id) or 0,
        ))
    return out


@router.get("/shows", response_model=list[ShowAdminOut])
def list_shows(
    start: date | None = None,
    days: int = Query(default=7, ge=1, le=31),
    user: StaffUser = Depends(require_roles(StaffRole.owner, StaffRole.manager, StaffRole.gate)),
    db: Session = Depends(get_db),
):
    tz = _tz(db, user)
    start = start or datetime.now(tz).date()
    lo = datetime.combine(start, time.min, tz)
    hi = lo + timedelta(days=days)
    shows = list(db.scalars(
        select(Show).where(Show.theatre_id == user.theatre_id, Show.starts_at >= lo, Show.starts_at < hi)
        .order_by(Show.starts_at)
    ))
    return shows_out(db, shows, tz)


@router.post("/shows", response_model=ShowsCreateOut, status_code=status.HTTP_201_CREATED)
def create_shows(body: ShowsCreateIn, user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    """Create every date x time combination; clashes and past times are skipped and reported."""
    tz = _tz(db, user)
    screen = theatre_screen(db, user)
    movie = db.get(Movie, body.movie_id)
    if movie is None or movie.theatre_id != user.theatre_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Movie not found")

    classes = {c.id for c in db.scalars(select(SeatClass).where(SeatClass.screen_id == screen.id))}
    if not classes:
        raise HTTPException(status.HTTP_409_CONFLICT, "Set up the hall layout first")
    missing = classes - set(body.prices)
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Set a price for every class")

    now = datetime.now(UTC)
    length = timedelta(minutes=movie.runtime_min + body.interval_min)
    gap = timedelta(minutes=CLEANING_MIN)
    lo = datetime.combine(min(body.dates), time.min, tz) - timedelta(days=1)
    hi = datetime.combine(max(body.dates), time.max, tz) + timedelta(days=1)
    busy = [
        (s.starts_at, s.starts_at + timedelta(minutes=rt + s.interval_min))
        for s, rt in db.execute(
            select(Show, Movie.runtime_min).join(Movie, Movie.id == Show.movie_id)
            .where(Show.screen_id == screen.id, Show.status == ShowStatus.scheduled,
                   Show.starts_at >= lo, Show.starts_at <= hi)
        ).all()
    ]

    created, skipped = 0, []
    for d in sorted(set(body.dates)):
        for t in sorted(set(body.times)):
            hh, mm = map(int, t.split(":"))
            start = datetime.combine(d, time(hh, mm), tz)
            end = start + length
            if start <= now:
                skipped.append(ShowConflict(date=d, time=t, reason="Already in the past"))
                continue
            clash = next(((a, b) for a, b in busy if a < end + gap and start < b + gap), None)
            if clash:
                skipped.append(ShowConflict(
                    date=d, time=t,
                    reason=f"Overlaps the show at {clash[0].astimezone(tz).strftime('%I:%M %p').lstrip('0')}",
                ))
                continue
            show = Show(theatre_id=user.theatre_id, screen_id=screen.id, movie_id=movie.id, starts_at=start,
                        interval_min=body.interval_min, booking_opens_at=body.booking_opens_at)
            db.add(show)
            db.flush()
            for cid in classes:
                db.add(ShowPrice(show_id=show.id, seat_class_id=cid, price_paise=body.prices[cid]))
            busy.append((start, end))
            created += 1

    if created:
        audit.record(db, user, "shows_created", "movie", movie.id, count=created, title=movie.title,
                     prices={str(k): v for k, v in body.prices.items()})
    db.commit()
    return ShowsCreateOut(created=created, skipped=skipped)


@router.put("/shows/{show_id}/prices", response_model=ShowAdminOut)
def update_prices(show_id: uuid.UUID, body: PricesIn, user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    """New prices apply to new bookings; tickets already sold keep their price."""
    show = _own_show(db, user, show_id)
    if show.status != ShowStatus.scheduled:
        raise HTTPException(status.HTTP_409_CONFLICT, "This show was cancelled")
    current = {p.seat_class_id: p for p in db.scalars(select(ShowPrice).where(ShowPrice.show_id == show.id))}
    changes = {}
    for cid, paise in body.prices.items():
        p = current.get(cid)
        if p is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown seat class")
        if p.price_paise != paise:
            changes[str(cid)] = [p.price_paise, paise]
            p.price_paise = paise
    if changes:
        audit.record(db, user, "prices_changed", "show", show.id, **changes)
    db.commit()
    return shows_out(db, [show], _tz(db, user))[0]


@router.post("/shows/{show_id}/cancel", response_model=CancelShowOut)
def cancel_show(show_id: uuid.UUID, body: CancelShowIn, user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    """Cancel with a reason: every confirmed booking is refunded in full and its
    seats freed. Each customer gets a WhatsApp message about the refund."""
    show = _own_show(db, user, show_id, lock=True)
    if show.status == ShowStatus.cancelled:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already cancelled")
    show.status = ShowStatus.cancelled
    show.cancel_reason = body.reason.strip()

    refunded, amount = 0, 0
    for b in db.scalars(select(Booking).where(Booking.show_id == show.id).with_for_update()):
        if b.status in (BookingStatus.confirmed, BookingStatus.payment_review):
            booking_svc.refund_confirmed(db, b, "show_cancelled", show.cancel_reason)
            refunded += 1
            amount += b.refund_paise
        elif b.status == BookingStatus.payment_pending:
            b.status = BookingStatus.failed  # a late payment for it is refunded automatically
            b.failure_reason = "show_cancelled"
    audit.record(db, user, "show_cancelled", "show", show.id, reason=show.cancel_reason,
                 bookings_refunded=refunded, amount_refunded_paise=amount)
    db.commit()
    return CancelShowOut(show_id=show.id, bookings_refunded=refunded, amount_refunded_paise=amount)


# ---------- Seat map + blocking ----------


@router.get("/seatmap", response_model=AdminSeatMap)
def admin_seat_map(show_id: uuid.UUID | None = None, user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    """With show_id: that show, with who booked each seat. Without: the hall
    with seats blocked for all upcoming shows."""
    screen = theatre_screen(db, user)
    seats = db.scalars(
        select(Seat).where(Seat.screen_id == screen.id, Seat.is_active.is_(True)).order_by(Seat.grid_row, Seat.grid_col)
    ).all()
    classes = [{"id": str(c.id), "name": c.name} for c in db.scalars(
        select(SeatClass).where(SeatClass.screen_id == screen.id).order_by(SeatClass.sort_order))]

    booked: dict[uuid.UUID, tuple[str, str, uuid.UUID]] = {}
    bookings: dict[uuid.UUID, SeatMapBooking] = {}
    block_q = select(SeatBlock).where(SeatBlock.theatre_id == user.theatre_id, SeatBlock.released_at.is_(None))
    if show_id:
        show = _own_show(db, user, show_id)
        seat_names = {s.id: f"{s.row_label}{s.number}" for s in seats}
        for seat_id, b, mobile in db.execute(
            select(BookingSeat.seat_id, Booking, Customer.mobile)
            .join(Booking, Booking.id == BookingSeat.booking_id).join(Customer, Customer.id == Booking.customer_id)
            .where(BookingSeat.show_id == show.id, BookingSeat.holds_seat.is_(True))
        ):
            booked[seat_id] = (b.code, b.customer_name or mobile, b.id)
            if b.id not in bookings:
                bookings[b.id] = SeatMapBooking(
                    id=b.id, code=b.code, name=b.customer_name, mobile=mobile, seats=[],
                    seats_admitted=b.seats_admitted, total_paise=b.total_paise, booked_at=b.confirmed_at or b.created_at)
            bookings[b.id].seats.append(seat_names.get(seat_id, "?"))
        block_q = block_q.where(or_(SeatBlock.show_id == show.id, SeatBlock.show_id.is_(None)))
    else:
        block_q = block_q.where(SeatBlock.show_id.is_(None))
    blocks = {b.seat_id: b for b in db.scalars(block_q)}

    out = []
    for s in seats:
        b = blocks.get(s.id)
        bk = booked.get(s.id)
        out.append(AdminSeat(
            id=s.id, row=s.row_label, number=s.number, r=s.grid_row, c=s.grid_col, class_id=s.seat_class_id,
            state="booked" if bk else "blocked" if b else "free",
            block_id=b.id if b else None, block_reason=b.reason if b else None,
            block_all_shows=bool(b and b.show_id is None),
            booking_code=bk[0] if bk else None, booked_by=bk[1] if bk else None, booking_id=bk[2] if bk else None,
        ))
    seat_order = {f"{s.row_label}{s.number}": i for i, s in enumerate(seats)}
    for b in bookings.values():
        b.seats.sort(key=lambda x: seat_order.get(x, 0))
    listed = sorted(bookings.values(), key=lambda b: (seat_order.get(b.seats[0], 0), b.code))
    return AdminSeatMap(show_id=show_id, classes=classes, seats=out, bookings=listed)


@router.post("/blocks", response_model=BlockOut)
def block_seats(body: BlockIn, user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    screen = theatre_screen(db, user)
    seats = {s.id: s for s in db.scalars(select(Seat).where(Seat.screen_id == screen.id, Seat.id.in_(body.seat_ids)))}
    if len(seats) != len(set(body.seat_ids)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Some seats aren't in this hall")

    sold: set[uuid.UUID] = set()
    active = select(SeatBlock.seat_id).where(SeatBlock.theatre_id == user.theatre_id, SeatBlock.released_at.is_(None),
                                            SeatBlock.seat_id.in_(seats))
    if body.show_id:
        show = _own_show(db, user, body.show_id)
        if show.status != ShowStatus.scheduled:
            raise HTTPException(status.HTTP_409_CONFLICT, "This show was cancelled")
        sold = set(db.scalars(select(BookingSeat.seat_id).where(
            BookingSeat.show_id == show.id, BookingSeat.holds_seat.is_(True), BookingSeat.seat_id.in_(seats))))
        already = set(db.scalars(active.where(or_(SeatBlock.show_id == show.id, SeatBlock.show_id.is_(None)))))
    else:
        already = set(db.scalars(active.where(SeatBlock.show_id.is_(None))))

    label = booking_svc.seat_label
    blocked = 0
    for sid, seat in seats.items():
        if sid in sold or sid in already:
            continue
        db.add(SeatBlock(theatre_id=user.theatre_id, seat_id=sid, show_id=body.show_id, reason=body.reason,
                         created_by=user.id))
        blocked += 1
    if blocked:
        audit.record(db, user, "seats_blocked", "show" if body.show_id else "screen", body.show_id or screen.id,
                     reason=body.reason, seats=sorted(label(s) for i, s in seats.items() if i not in sold | already))
    db.commit()
    return BlockOut(
        blocked=blocked,
        skipped_sold=sorted(label(seats[i]) for i in sold),
        skipped_already=sorted(label(seats[i]) for i in already),
    )


@router.post("/blocks/release", response_model=BlockOut)
def unblock_seats(body: UnblockIn, user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    q = select(SeatBlock).where(SeatBlock.theatre_id == user.theatre_id, SeatBlock.released_at.is_(None),
                                SeatBlock.seat_id.in_(body.seat_ids))
    q = q.where(SeatBlock.show_id == body.show_id) if body.show_id else q.where(SeatBlock.show_id.is_(None))
    blocks = list(db.scalars(q))
    now = datetime.now(UTC)
    for b in blocks:
        b.released_at = now
    if blocks:
        audit.record(db, user, "seats_unblocked", "show" if body.show_id else "screen", body.show_id,
                     count=len(blocks))
    db.commit()
    return BlockOut(blocked=-len(blocks), skipped_sold=[], skipped_already=[])
