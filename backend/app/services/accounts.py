"""A customer deleting their own account (Google Play requires this).

Their personal details are wiped: mobile number, name, profile answers, phones
for notifications, login codes, rating comments and the text of messages sent
to them. The bookings stay, without the name, because the theatre has to keep
its sales and GST records; they can't be traced back to the person any more.
Logging in again with the same number later starts a new, empty account.
"""
import secrets
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from app.models import Booking, Customer, Message, OtpCode, PushToken, Rating, Show
from app.models.enums import BookingStatus


def _blocker(db: Session, customer: Customer, now: datetime) -> str | None:
    """Money or a ticket still in progress: deleting now would leave the theatre unable to reach them."""
    b = db.scalar(
        select(Booking)
        .join(Show, Show.id == Booking.show_id)
        .where(
            Booking.customer_id == customer.id,
            or_(
                (Booking.status == BookingStatus.confirmed) & (Show.starts_at > now),
                Booking.status == BookingStatus.payment_review,
                Booking.refund_pending.is_(True),
            ),
        )
        .limit(1)
    )
    if b is None:
        return None
    if b.refund_pending:
        return f"The theatre still has to send you a refund for booking {b.code}. You can delete your account once it arrives."
    if b.status == BookingStatus.payment_review:
        return f"The theatre is still checking your payment for booking {b.code}. Try again once it's confirmed."
    return f"Booking {b.code} is for a show that hasn't happened yet. You can delete your account after the show."


def delete_customer(db: Session, customer: Customer) -> None:
    now = datetime.now(UTC)
    reason = _blocker(db, customer, now)
    if reason:
        raise HTTPException(status.HTTP_409_CONFLICT, reason)

    db.execute(delete(PushToken).where(PushToken.customer_id == customer.id))
    db.execute(delete(OtpCode).where(OtpCode.mobile == customer.mobile))
    db.execute(update(Rating).where(Rating.customer_id == customer.id).values(comment=""))
    db.execute(
        update(Message).where(Message.customer_id == customer.id, Message.status == "queued").values(status="skipped")
    )
    db.execute(update(Message).where(Message.customer_id == customer.id).values(mobile="", body=""))
    db.execute(update(Booking).where(Booking.customer_id == customer.id).values(customer_name=""))

    # The mobile column is unique and required: a placeholder that can never be a
    # real Indian mobile number frees the number for a fresh account
    customer.mobile = f"del{secrets.token_hex(4)[:7]}"
    customer.name = ""
    customer.gender = None
    customer.age_group = None
    customer.offers_opt_in = False
    customer.reminders_opt_in = False
    customer.deleted_at = now
    db.commit()
