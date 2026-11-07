import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Integer, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TheatreScoped, TimestampMixin
from app.models.enums import AgeGroup, BookingStatus, Gender


class Customer(IdMixin, TimestampMixin, Base):
    """Customers are platform-wide (not per theatre): in Phase 2 one app
    account books at any theatre."""

    __tablename__ = "customers"

    mobile: Mapped[str] = mapped_column(String(10), unique=True)
    name: Mapped[str] = mapped_column(String(80), default="")
    gender: Mapped[Gender | None] = mapped_column(Enum(Gender, name="gender"))
    age_group: Mapped[AgeGroup | None] = mapped_column(
        Enum(AgeGroup, name="age_group", values_callable=lambda e: [m.value for m in e])
    )
    offers_opt_in: Mapped[bool] = mapped_column(Boolean, default=False)
    reminders_opt_in: Mapped[bool] = mapped_column(Boolean, default=True)


class Booking(IdMixin, TimestampMixin, TheatreScoped, Base):
    __tablename__ = "bookings"

    code: Mapped[str] = mapped_column(String(8), unique=True)  # e.g. H57K2X, shown on ticket
    show_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shows.id"), index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), index=True)
    status: Mapped[BookingStatus] = mapped_column(Enum(BookingStatus, name="booking_status"), index=True)

    # All money in paise
    tickets_paise: Mapped[int] = mapped_column(Integer)
    discount_paise: Mapped[int] = mapped_column(Integer, default=0)
    booking_fee_paise: Mapped[int] = mapped_column(Integer)
    gst_paise: Mapped[int] = mapped_column(Integer)
    total_paise: Mapped[int] = mapped_column(Integer)

    customer_name: Mapped[str] = mapped_column(String(80), default="")

    # Payment gateway (provider-neutral: "fake" in development, "razorpay" later)
    gateway: Mapped[str] = mapped_column(String(20), default="fake")
    gateway_order_id: Mapped[str | None] = mapped_column(String(60), unique=True)
    gateway_payment_id: Mapped[str | None] = mapped_column(String(60), unique=True)
    payment_method: Mapped[str | None] = mapped_column(String(20))  # upi | card | netbanking
    refund_id: Mapped[str | None] = mapped_column(String(60))
    refund_paise: Mapped[int] = mapped_column(Integer, default=0)
    failure_reason: Mapped[str | None] = mapped_column(String(40))  # seat_clash | payment_failed | expired
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    seats_admitted: Mapped[int] = mapped_column(Integer, default=0)  # entry by number of seats


class BookingSeat(IdMixin, Base):
    """One row per seat in a booking. `holds_seat` is true only while the
    booking is confirmed; the partial unique index below is the database-level
    guarantee of "one sale per seat" - a second confirmed sale fails."""

    __tablename__ = "booking_seats"
    __table_args__ = (
        Index(
            "uq_booking_seats_show_seat_held",
            "show_id",
            "seat_id",
            unique=True,
            postgresql_where=text("holds_seat"),
        ),
    )

    booking_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bookings.id"), index=True)
    show_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shows.id"))
    seat_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("seats.id"))
    price_paise: Mapped[int] = mapped_column(Integer)
    holds_seat: Mapped[bool] = mapped_column(Boolean, default=False)


class SeatBlock(IdMixin, TimestampMixin, TheatreScoped, Base):
    """Blocked seat. show_id NULL means "all upcoming shows" on that screen."""

    __tablename__ = "seat_blocks"

    seat_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("seats.id"), index=True)
    show_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("shows.id"), index=True)
    reason: Mapped[str] = mapped_column(String(40))  # house quota, guests, press, repair
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("staff_users.id"))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OtpCode(IdMixin, Base):
    """One-time login code for the customer app. Only a hash is stored."""

    __tablename__ = "otp_codes"

    mobile: Mapped[str] = mapped_column(String(10), index=True)
    code_hash: Mapped[str] = mapped_column(String(100))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
