import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TheatreScoped, TimestampMixin
from app.models.enums import TheatreStatus


class Theatre(IdMixin, TimestampMixin, Base):
    __tablename__ = "theatres"

    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    city: Mapped[str] = mapped_column(String(80))
    address: Mapped[str] = mapped_column(String(300), default="")
    gstin: Mapped[str | None] = mapped_column(String(15))
    timezone: Mapped[str] = mapped_column(String(40), default="Asia/Kolkata")
    status: Mapped[TheatreStatus] = mapped_column(
        Enum(TheatreStatus, name="theatre_status"), default=TheatreStatus.active
    )
    # Booking fee per ticket, in paise (GST on it is computed at checkout)
    booking_fee_paise: Mapped[int] = mapped_column(Integer, default=2000)
    # Direct UPI payments go to this UPI ID until a payment gateway is chosen
    upi_id: Mapped[str | None] = mapped_column(String(60))
    upi_name: Mapped[str | None] = mapped_column(String(60))
    # Maintenance: the customer app shows maintenance_message instead of working.
    # Gate staff carry on scanning. Switching it needs the maintenance password.
    maintenance_on: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    maintenance_message: Mapped[str] = mapped_column(String(300), default="", server_default="")
    maintenance_password_hash: Mapped[str | None] = mapped_column(String(100))
    maintenance_failed_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    maintenance_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    maintenance_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    maintenance_changed_by: Mapped[str | None] = mapped_column(String(120))


class Screen(IdMixin, TimestampMixin, TheatreScoped, Base):
    __tablename__ = "screens"

    name: Mapped[str] = mapped_column(String(60), default="Main screen")


class SeatClass(IdMixin, TheatreScoped, Base):
    """Second class / First class / Balcony. Prices live on each show."""

    __tablename__ = "seat_classes"
    __table_args__ = (UniqueConstraint("screen_id", "name"),)

    screen_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("screens.id"), index=True)
    name: Mapped[str] = mapped_column(String(40))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # What the seats are like (cushioned, pushback...), shown to customers
    description: Mapped[str] = mapped_column(String(200), default="", server_default="")


class Seat(IdMixin, TheatreScoped, Base):
    """One physical seat. grid_row/grid_col place it on the layout so aisles
    and gaps are simply empty grid cells."""

    __tablename__ = "seats"
    __table_args__ = (UniqueConstraint("screen_id", "row_label", "number"),)

    screen_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("screens.id"), index=True)
    seat_class_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("seat_classes.id"))
    row_label: Mapped[str] = mapped_column(String(4))
    number: Mapped[int] = mapped_column(Integer)
    grid_row: Mapped[int] = mapped_column(Integer)
    grid_col: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(default=True)
