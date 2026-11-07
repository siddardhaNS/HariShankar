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
from app.services import promotions, seating, whatsapp
from app.services.payments import GatewayOrder, Payee, PaymentsNotSetUp, get_gateway
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
    db: Session, customer: Customer, show_id: uuid.UUID, seat_ids: list[uuid.UUID], customer_name: str,
    promo_code: str | None = None,
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
    promo, discount = None, 0
    if promo_code:
        try:
            promo, discount = promotions.check(db, show, customer, promo_code, seat_prices)
        except promotions.PromoError as e:
            raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from None
    bd = price(seat_prices, theatre.booking_fee_paise, discount)

    gateway = get_gateway()
    code = new_code(db)
    try:
        order = gateway.create_order(bd.total_paise, receipt=code, payee=Payee(theatre.upi_id, theatre.upi_name or theatre.name))
    except PaymentsNotSetUp as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"{e}. Please try again later") from None

    booking = Booking(
        theatre_id=show.theatre_id,
        code=code,
        show_id=show.id,
        customer_id=customer.id,
        customer_name=customer_name,
        status=BookingStatus.payment_pending,
        tickets_paise=bd.tickets_paise,
        discount_paise=bd.discount_paise,
        promotion_id=promo.id if promo else None,
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
    """Full refund through the booking's own gateway. Direct UPI can't refund
    by itself, so the booking is flagged for staff to send the money back."""
    gateway = get_gateway(booking.gateway)
    booking.refund_id = gateway.refund(booking.gateway_payment_id or booking.upi_ref or "", booking.total_paise)
    booking.refund_pending = not gateway.automatic_refunds
    booking.refund_paise = booking.total_paise
    booking.status = BookingStatus.refunded
    booking.failure_reason = reason


def _hold_seats(db: Session, booking: Booking, show: Show | None) -> str | None:
    """Try to take the booking's seats. Returns None on success, or why not.
    The partial unique index makes a second hold on the same seat fail."""
    if show is None or show.status != ShowStatus.scheduled:
        return "show_cancelled"
    seats = list(db.scalars(select(BookingSeat).where(BookingSeat.booking_id == booking.id)))
    states = seating.seat_states(db, show)
    if any(states.get(bs.seat_id) == seating.BLOCKED for bs in seats):
        return "seat_clash"
    try:
        with db.begin_nested():
            for bs in seats:
                bs.holds_seat = True
            db.flush()
    except IntegrityError:
        for bs in seats:
            bs.holds_seat = False
        return "seat_clash"
    return None


def confirm_payment(db: Session, order_id: str, payment_id: str, method: str | None) -> Booking:
    """Called from the gateway webhook. Safe to call more than once."""
    booking = db.scalar(select(Booking).where(Booking.gateway_order_id == order_id).with_for_update())
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown order")
    if booking.status in (BookingStatus.confirmed, BookingStatus.refunded):
        return booking  # webhook retry

    booking.gateway_payment_id = payment_id
    booking.payment_method = method

    # Money arrived but the booking can't go ahead: refund in full
    if booking.status != BookingStatus.payment_pending:
        _refund(db, booking, booking.failure_reason or "booking_failed")
        db.commit()
        return booking
    problem = _hold_seats(db, booking, db.get(Show, booking.show_id))
    if problem:
        _refund(db, booking, problem)
        db.commit()
        return booking

    booking.status = BookingStatus.confirmed
    booking.confirmed_at = datetime.now(UTC)
    whatsapp.booking_confirmed(db, booking)
    db.commit()
    return booking


def refund_confirmed(db: Session, booking: Booking, reason: str) -> None:
    """Refund a confirmed booking in full and free its seats (show cancelled,
    or a manual refund from the admin). The caller commits."""
    if booking.status not in (BookingStatus.confirmed, BookingStatus.payment_review):
        raise HTTPException(status.HTTP_409_CONFLICT, "Only paid bookings can be refunded")
    for bs in db.scalars(select(BookingSeat).where(BookingSeat.booking_id == booking.id)):
        bs.holds_seat = False
    _refund(db, booking, reason)
    whatsapp.refunded(db, booking, reason)


# ---------- Direct UPI (no gateway) ----------


def claim_upi(db: Session, booking: Booking, utr: str) -> Booking:
    """The customer paid in their UPI app and entered the UPI reference.
    Seats are held now (first to claim gets them) and staff check the money
    arrived before the ticket is confirmed."""
    if booking.gateway != "upi":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This booking isn't paid by direct UPI")
    if booking.status != BookingStatus.payment_pending:
        raise HTTPException(status.HTTP_409_CONFLICT, "This booking is already being processed")
    if db.scalar(select(Booking.id).where(Booking.upi_ref == utr)):
        raise HTTPException(status.HTTP_409_CONFLICT, "This UPI reference was already used for another booking")
    booking.upi_ref = utr
    booking.payment_method = "upi"
    problem = _hold_seats(db, booking, db.get(Show, booking.show_id))
    if problem:
        _refund(db, booking, problem)  # they paid, so the theatre owes it back
    else:
        booking.status = BookingStatus.payment_review
    db.commit()
    return booking


def review_upi(db: Session, booking: Booking, received: bool) -> Booking:
    """Staff checked the theatre's UPI account for this payment."""
    if booking.status != BookingStatus.payment_review:
        raise HTTPException(status.HTTP_409_CONFLICT, "This booking isn't waiting for a payment check")
    if received:
        booking.status = BookingStatus.confirmed
        booking.confirmed_at = datetime.now(UTC)
        whatsapp.booking_confirmed(db, booking)
    else:
        for bs in db.scalars(select(BookingSeat).where(BookingSeat.booking_id == booking.id)):
            bs.holds_seat = False
        booking.status = BookingStatus.failed
        booking.failure_reason = "payment_not_received"
    return booking


def mark_refund_sent(db: Session, booking: Booking, ref: str) -> None:
    if not booking.refund_pending:
        raise HTTPException(status.HTTP_409_CONFLICT, "No refund is waiting to be sent for this booking")
    booking.refund_id = ref
    booking.refund_pending = False
    whatsapp.refund_sent(db, booking)


def fail_payment(db: Session, order_id: str, reason: str = "payment_failed") -> Booking:
    booking = db.scalar(select(Booking).where(Booking.gateway_order_id == order_id).with_for_update())
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown order")
    if booking.status == BookingStatus.payment_pending:
        booking.status = BookingStatus.failed
        booking.failure_reason = reason
        db.commit()
    return booking
