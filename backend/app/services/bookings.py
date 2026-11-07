"""Booking flow: first to pay gets the seats.

1. `start_booking` checks the seats are free *right now*, prices them and opens
   a gateway order. Nothing is held: other people can still buy those seats.
   If any seat was sold a moment earlier, nothing is charged; the caller gets
   `SeatsTaken` with the closest free seats together.
2. The gateway's webhook calls `confirm_payment`. It flips `holds_seat` on, and
   the partial unique index makes the database refuse a second confirmed sale
   of a seat. If two payments land at the same instant, whichever webhook
   arrives first wins; the other is refunded in full automatically.
"""
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Booking, BookingSeat, Customer, Seat, Show, ShowPrice, Theatre
from app.models.enums import BookingStatus, ShowStatus
from app.services import seating
from app.services.payments import GatewayOrder, get_gateway
from app.services.pricing import price

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I


def new_code(db: Session) -> str:
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not db.scalar(select(Booking.id).where(Booking.code == code)):
            return code


def seat_label(seat: Seat) -> str:
    return f"{seat.row_label}{seat.number}"


@dataclass
class SeatsTaken(Exception):
    taken: list[Seat]
    suggestion: list[Seat]


def bookable_show(db: Session, show_id: uuid.UUID) -> Show:
    show = db.get(Show, show_id)
    now = datetime.now(UTC)
    if show is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Show not found")
    if show.status != ShowStatus.scheduled:
        raise HTTPException(status.HTTP_409_CONFLICT, "This show was cancelled")
    if show.starts_at <= now:
        raise HTTPException(status.HTTP_409_CONFLICT, "This show has already started")
    if show.booking_opens_at and show.booking_opens_at > now:
        raise HTTPException(status.HTTP_409_CONFLICT, "Booking hasn't opened for this show yet")
    return show


def start_booking(
    db: Session, customer: Customer, show_id: uuid.UUID, seat_ids: list[uuid.UUID], customer_name: str
) -> tuple[Booking, GatewayOrder]:
    s = get_settings()
    if not seat_ids or len(seat_ids) > s.max_seats_per_booking:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Pick 1 to {s.max_seats_per_booking} seats")
    if len(set(seat_ids)) != len(seat_ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The same seat was picked twice")

    show = bookable_show(db, show_id)
    all_seats = seating.screen_seats(db, show)
    by_id = {seat.id: seat for seat in all_seats}
    chosen = [by_id.get(sid) for sid in seat_ids]
    if any(c is None for c in chosen):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Some seats aren't in this hall")
    chosen_seats: list[Seat] = [c for c in chosen if c is not None]

    states = seating.seat_states(db, show)
    taken = [seat for seat in chosen_seats if states[seat.id] != seating.FREE]
    if taken:
        alt = seating.best_groups(all_seats, states, len(chosen_seats), near=chosen_seats, limit=1)
        raise SeatsTaken(taken=taken, suggestion=alt[0] if alt else [])

    prices = {
        p.seat_class_id: p.price_paise for p in db.scalars(select(ShowPrice).where(ShowPrice.show_id == show.id))
    }
    if any(seat.seat_class_id not in prices for seat in chosen_seats):
        raise HTTPException(status.HTTP_409_CONFLICT, "Prices aren't set for these seats yet")

    theatre = db.get(Theatre, show.theatre_id)
    assert theatre is not None
    seat_prices = [prices[seat.seat_class_id] for seat in chosen_seats]
    bd = price(seat_prices, theatre.booking_fee_paise)

    gateway = get_gateway()
    code = new_code(db)
    order = gateway.create_order(bd.total_paise, receipt=code)

    booking = Booking(
        theatre_id=show.theatre_id,
        code=code,
        show_id=show.id,
        customer_id=customer.id,
        customer_name=customer_name,
        status=BookingStatus.payment_pending,
        tickets_paise=bd.tickets_paise,
        discount_paise=bd.discount_paise,
        booking_fee_paise=bd.booking_fee_paise,
        gst_paise=bd.gst_paise,
        total_paise=bd.total_paise,
        gateway=gateway.name,
        gateway_order_id=order.order_id,
    )
    db.add(booking)
    db.flush()
    for seat, p in zip(chosen_seats, seat_prices, strict=True):
        db.add(BookingSeat(booking_id=booking.id, show_id=show.id, seat_id=seat.id, price_paise=p, holds_seat=False))
    if customer_name and not customer.name:
        customer.name = customer_name
    db.commit()
    return booking, order


def _refund(db: Session, booking: Booking, reason: str) -> None:
    booking.refund_id = get_gateway().refund(booking.gateway_payment_id or "", booking.total_paise)
    booking.refund_paise = booking.total_paise
    booking.status = BookingStatus.refunded
    booking.failure_reason = reason


def confirm_payment(db: Session, order_id: str, payment_id: str, method: str | None) -> Booking:
    """Called from the gateway webhook. Safe to call more than once."""
    booking = db.scalar(select(Booking).where(Booking.gateway_order_id == order_id).with_for_update())
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown order")
    if booking.status in (BookingStatus.confirmed, BookingStatus.refunded):
        return booking  # webhook retry

    booking.gateway_payment_id = payment_id
    booking.payment_method = method

    show = db.get(Show, booking.show_id)
    seats = list(db.scalars(select(BookingSeat).where(BookingSeat.booking_id == booking.id)))

    # Money arrived but the booking can't go ahead: refund in full
    if booking.status != BookingStatus.payment_pending:
        _refund(db, booking, booking.failure_reason or "booking_failed")
        db.commit()
        return booking
    if show is None or show.status != ShowStatus.scheduled:
        _refund(db, booking, "show_cancelled")
        db.commit()
        return booking

    states = seating.seat_states(db, show)
    if any(states.get(bs.seat_id) == seating.BLOCKED for bs in seats):
        _refund(db, booking, "seat_clash")
        db.commit()
        return booking

    try:
        with db.begin_nested():
            for bs in seats:
                bs.holds_seat = True
            db.flush()
    except IntegrityError:
        # Someone else's payment for one of these seats was confirmed first
        for bs in seats:
            bs.holds_seat = False
        _refund(db, booking, "seat_clash")
        db.commit()
        return booking

    booking.status = BookingStatus.confirmed
    booking.confirmed_at = datetime.now(UTC)
    db.commit()
    return booking


def fail_payment(db: Session, order_id: str, reason: str = "payment_failed") -> Booking:
    booking = db.scalar(select(Booking).where(Booking.gateway_order_id == order_id).with_for_update())
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown order")
    if booking.status == BookingStatus.payment_pending:
        booking.status = BookingStatus.failed
        booking.failure_reason = reason
        db.commit()
    return booking
