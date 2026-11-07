import uuid
from datetime import date

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TheatreScoped, TimestampMixin


class Promotion(IdMixin, TimestampMixin, TheatreScoped, Base):
    """A promo code customers enter (or pick) at checkout.

    The discount comes off the ticket price only, never the booking fee or GST.
    """

    __tablename__ = "promotions"
    __table_args__ = (
        UniqueConstraint("theatre_id", "code"),
        CheckConstraint("kind IN ('per_ticket', 'percent')", name="kind"),
        CheckConstraint("value > 0", name="value_positive"),
    )

    code: Mapped[str] = mapped_column(String(20))           # stored upper case, e.g. MATINEE30
    title: Mapped[str] = mapped_column(String(80))          # "₹30 off every matinee ticket"
    kind: Mapped[str] = mapped_column(String(10))           # per_ticket (paise off each ticket) | percent
    value: Mapped[int] = mapped_column(Integer)             # paise per ticket, or percent 1-100
    max_discount_paise: Mapped[int | None] = mapped_column(Integer)  # cap for percent offers
    min_tickets: Mapped[int] = mapped_column(Integer, default=1)
    weekdays: Mapped[str] = mapped_column(String(7), default="0123456")  # show days it works, Mon=0
    starts_on: Mapped[date | None] = mapped_column(Date)    # show dates, inclusive
    ends_on: Mapped[date | None] = mapped_column(Date)
    max_uses: Mapped[int | None] = mapped_column(Integer)   # total bookings, None = no limit
    per_customer: Mapped[int | None] = mapped_column(Integer, default=1)
    first_booking_only: Mapped[bool] = mapped_column(Boolean, default=False)
    show_in_app: Mapped[bool] = mapped_column(Boolean, default=True)  # listed at checkout, or code-only
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("staff_users.id"))
