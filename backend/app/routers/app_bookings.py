import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Booking, BookingSeat, Customer, Seat, SeatClass, Show
from app.models.enums import BookingStatus
from app.routers.app_auth import current_customer
from app.routers.app_catalog import show_brief
from app.schemas.app import (
    BookingCreateIn,
    BookingOut,
    BookingStartOut,
    OrderOut,
    PriceOut,
    TicketSeat,
)
from app.security import ticket_qr
from app.services import bookings as svc

router = APIRouter(prefix="/api/app/bookings", tags=["app bookings"])


def booking_out(db: Session, b: Booking) -> BookingOut:
    show = db.get(Show, b.show_id)
    assert show
    rows = db.execute(
        select(Seat, SeatClass.name, BookingSeat.price_paise)
        .join(BookingSeat, BookingSeat.seat_id == Seat.id)
        .join(SeatClass, SeatClass.id == Seat.seat_class_id)
        .where(BookingSeat.booking_id == b.id)
        .order_by(Seat.grid_row, Seat.grid_col)
    ).all()
    return BookingOut(
        id=b.id,
        code=b.code,
        status=b.status,
        failure_reason=b.failure_reason,
        customer_name=b.customer_name,
        show=show_brief(db, show),
        seats=[TicketSeat(label=svc.seat_label(seat), class_name=cname, price_paise=p) for seat, cname, p in rows],
        price=PriceOut(
            tickets_paise=b.tickets_paise, discount_paise=b.discount_paise, booking_fee_paise=b.booking_fee_paise,
            gst_paise=b.gst_paise, total_paise=b.total_paise,
        ),
        payment_method=b.payment_method,
        refund_id=b.refund_id,
        refund_paise=b.refund_paise,
        qr=ticket_qr(b.code) if b.status == BookingStatus.confirmed else None,
        created_at=b.created_at,
        confirmed_at=b.confirmed_at,
    )


def own_booking(db: Session, customer: Customer, booking_id: uuid.UUID) -> Booking:
    b = db.get(Booking, booking_id)
    if b is None or b.customer_id != customer.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    return b


@router.post("", response_model=BookingStartOut, status_code=status.HTTP_201_CREATED,
             responses={409: {"description": "Seats taken; includes the closest free seats together"}})
def start(body: BookingCreateIn, customer: Customer = Depends(current_customer), db: Session = Depends(get_db)):
    try:
        booking, order = svc.start_booking(db, customer, body.show_id, body.seat_ids, body.name.strip())
    except svc.SeatsTaken as e:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": "Some seats were just booked by someone else",
                "code": "seats_taken",
                "taken": [svc.seat_label(s) for s in e.taken],
                "suggestion": {
                    "seat_ids": [str(s.id) for s in e.suggestion],
                    "labels": [svc.seat_label(s) for s in e.suggestion],
                },
            },
        )
    return BookingStartOut(
        booking_id=booking.id,
        code=booking.code,
        price=PriceOut(
            tickets_paise=booking.tickets_paise, discount_paise=booking.discount_paise,
            booking_fee_paise=booking.booking_fee_paise, gst_paise=booking.gst_paise, total_paise=booking.total_paise,
        ),
        order=OrderOut(order_id=order.order_id, amount_paise=order.amount_paise, gateway=order.gateway, key_id=order.key_id),
    )


@router.get("", response_model=list[BookingOut])
def mine(customer: Customer = Depends(current_customer), db: Session = Depends(get_db)):
    """Bookings on this mobile number. Pending and failed attempts are left out."""
    q = (
        select(Booking)
        .join(Show, Show.id == Booking.show_id)
        .where(
            Booking.customer_id == customer.id,
            Booking.status.in_([BookingStatus.confirmed, BookingStatus.refunded, BookingStatus.cancelled]),
        )
        .order_by(Show.starts_at.desc())
    )
    return [booking_out(db, b) for b in db.scalars(q)]


@router.get("/{booking_id}", response_model=BookingOut)
def one(booking_id: uuid.UUID, customer: Customer = Depends(current_customer), db: Session = Depends(get_db)):
    return booking_out(db, own_booking(db, customer, booking_id))
