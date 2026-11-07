"""Development-only stand-in for the payment gateway.

The app's "Test payment" sheet calls these instead of Razorpay checkout. They
run the same `confirm_payment` / `fail_payment` code the real webhook will.
Only mounted when APP_ENV=development and PAYMENT_GATEWAY=fake.
"""
import secrets
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Customer
from app.routers.app_auth import current_customer
from app.routers.app_bookings import booking_out, own_booking
from app.schemas.app import BookingOut, DevPayIn
from app.services import bookings as svc

router = APIRouter(prefix="/api/app/dev/bookings", tags=["dev payments"])


@router.post("/{booking_id}/pay", response_model=BookingOut)
def pay(booking_id: uuid.UUID, body: DevPayIn, customer: Customer = Depends(current_customer),
        db: Session = Depends(get_db)):
    b = own_booking(db, customer, booking_id)
    assert b.gateway_order_id
    svc.confirm_payment(db, b.gateway_order_id, f"pay_fake_{secrets.token_hex(8)}", body.method)
    return booking_out(db, b)


@router.post("/{booking_id}/fail", response_model=BookingOut)
def fail(booking_id: uuid.UUID, customer: Customer = Depends(current_customer), db: Session = Depends(get_db)):
    b = own_booking(db, customer, booking_id)
    assert b.gateway_order_id
    svc.fail_payment(db, b.gateway_order_id)
    return booking_out(db, b)
