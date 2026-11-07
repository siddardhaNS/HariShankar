"""Promo codes: who can use which code on which show, and how much it takes off.

Checked twice: when the customer applies the code at checkout (to show the new
total), and again when the booking is created (the amount actually charged).
"""
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Booking, Customer, Promotion, Show, Theatre
from app.models.enums import BookingStatus

# Bookings that count as using a code: paid, being checked, or still paying
_USING = (BookingStatus.confirmed, BookingStatus.payment_review, BookingStatus.payment_pending)


class PromoError(Exception):
    """Why a code can't be used, in words the customer understands."""


def normalise(code: str) -> str:
    return "".join(code.split()).upper()


def discount_for(p: Promotion, seat_prices: list[int]) -> int:
    tickets = sum(seat_prices)
    if p.kind == "per_ticket":
        d = sum(min(p.value, sp) for sp in seat_prices)
    else:
        d = tickets * p.value // 100
    if p.max_discount_paise is not None:
        d = min(d, p.max_discount_paise)
    return min(d, tickets)


def _uses(db: Session, p: Promotion, customer: Customer | None = None) -> int:
    window = datetime.now(UTC) - timedelta(minutes=get_settings().payment_window_minutes)
    q = select(func.count()).select_from(Booking).where(
        Booking.promotion_id == p.id,
        Booking.status.in_(_USING),
        # an abandoned payment doesn't use up the code
        (Booking.status != BookingStatus.payment_pending) | (Booking.created_at >= window),
    )
    if customer is not None:
        # a customer retrying after leaving the payment screen hasn't used it yet
        q = q.where(Booking.customer_id == customer.id, Booking.status != BookingStatus.payment_pending)
    return db.scalar(q) or 0


def _fits_show(p: Promotion, show: Show, tz: ZoneInfo) -> str | None:
    day = show.starts_at.astimezone(tz).date()
    if not p.is_active:
        return "This offer has ended"
    if p.starts_on and day < p.starts_on:
        return f"This offer is for shows from {p.starts_on:%d %b}"
    if p.ends_on and day > p.ends_on:
        return "This offer has ended" if datetime.now(tz).date() > p.ends_on \
            else f"This offer is for shows up to {p.ends_on:%d %b}"
    if str(day.weekday()) not in p.weekdays:
        names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        return "This offer works on " + ", ".join(names[int(d)] for d in p.weekdays) + " shows"
    return None


def check(db: Session, show: Show, customer: Customer | None, code: str, seat_prices: list[int]) -> tuple[Promotion, int]:
    """The promotion and the discount in paise, or PromoError."""
    theatre = db.get(Theatre, show.theatre_id)
    tz = ZoneInfo(theatre.timezone if theatre else "Asia/Kolkata")
    p = db.scalar(select(Promotion).where(Promotion.theatre_id == show.theatre_id, Promotion.code == normalise(code)))
    if p is None:
        raise PromoError("That code isn't valid")
    problem = _fits_show(p, show, tz)
    if problem:
        raise PromoError(problem)
    if len(seat_prices) < p.min_tickets:
        raise PromoError(f"Book {p.min_tickets} or more tickets to use this code")
    if p.max_uses is not None and _uses(db, p) >= p.max_uses:
        raise PromoError("This offer has been fully used")
    if customer is not None:
        if p.per_customer is not None and _uses(db, p, customer) >= p.per_customer:
            raise PromoError("You've already used this code" if p.per_customer == 1
                             else f"You've used this code {p.per_customer} times already")
        if p.first_booking_only and db.scalar(
            select(Booking.id).where(Booking.customer_id == customer.id,
                                     Booking.status == BookingStatus.confirmed).limit(1)
        ):
            raise PromoError("This code is for your first booking")
    return p, discount_for(p, seat_prices)


def offers_for(db: Session, show: Show) -> list[Promotion]:
    """Offers listed at checkout for this show (customer limits are checked on apply)."""
    theatre = db.get(Theatre, show.theatre_id)
    tz = ZoneInfo(theatre.timezone if theatre else "Asia/Kolkata")
    rows = db.scalars(select(Promotion).where(
        Promotion.theatre_id == show.theatre_id, Promotion.is_active, Promotion.show_in_app,
    ).order_by(Promotion.created_at))
    return [p for p in rows if _fits_show(p, show, tz) is None
            and (p.max_uses is None or _uses(db, p) < p.max_uses)]


def describe(p: Promotion) -> str:
    """Short line under the title, e.g. "₹30 off each ticket · 2+ tickets · Mon-Thu"."""
    parts = [f"₹{p.value / 100:g} off each ticket" if p.kind == "per_ticket" else f"{p.value}% off tickets"]
    if p.kind == "percent" and p.max_discount_paise:
        parts[0] += f", up to ₹{p.max_discount_paise / 100:g}"
    if p.min_tickets > 1:
        parts.append(f"{p.min_tickets}+ tickets")
    if p.weekdays != "0123456":
        names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        parts.append(", ".join(names[int(d)] for d in p.weekdays))
    if p.first_booking_only:
        parts.append("first booking")
    return " · ".join(parts)
