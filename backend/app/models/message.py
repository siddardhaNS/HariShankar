import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TheatreScoped, TimestampMixin


class Campaign(IdMixin, TimestampMixin, TheatreScoped, Base):
    """A promotional message the owner sends to opted-in customers, on WhatsApp, as an app notification, or both."""

    __tablename__ = "campaigns"

    title: Mapped[str] = mapped_column(String(80))             # for the owner's list, not sent
    body: Mapped[str] = mapped_column(Text)                    # what customers read
    audience: Mapped[str] = mapped_column(String(20))          # all | recent_30 | recent_90
    channel: Mapped[str] = mapped_column(String(10), default="whatsapp", server_default="whatsapp")  # whatsapp | push | both
    status: Mapped[str] = mapped_column(String(12), default="queued")  # queued | sending | done
    send_after: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recipients: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("staff_users.id"))


class Message(IdMixin, Base):
    """Every WhatsApp message and app notification, automatic or promotional: the outbox and the log.

    `dedupe_key` stops the same message going twice (e.g. one morning reminder
    per booking) even if the worker runs twice or two workers overlap.
    """

    __tablename__ = "messages"

    theatre_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("theatres.id"), index=True)
    # None for messages to staff (the owner's Monday summary)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), index=True)
    mobile: Mapped[str] = mapped_column(String(10))
    channel: Mapped[str] = mapped_column(String(10), default="whatsapp", server_default="whatsapp")  # whatsapp | push
    kind: Mapped[str] = mapped_column(String(24), index=True)  # booking_confirmed | reminder_morning | ...
    body: Mapped[str] = mapped_column(Text)
    booking_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bookings.id"), index=True)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("campaigns.id"), index=True)
    dedupe_key: Mapped[str] = mapped_column(String(100), unique=True)
    status: Mapped[str] = mapped_column(String(10), default="queued", index=True)  # queued | sent | failed | skipped
    send_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    provider_id: Mapped[str | None] = mapped_column(String(80))
    error: Mapped[str | None] = mapped_column(String(200))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PushToken(IdMixin, Base):
    """A phone that can get app notifications for a customer (an Expo push token).

    One customer can have several phones; one phone belongs to whoever logged
    in on it last. A token the push service says is gone is turned off.
    """

    __tablename__ = "push_tokens"

    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), index=True)
    token: Mapped[str] = mapped_column(String(200), unique=True)
    platform: Mapped[str] = mapped_column(String(10), default="android")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
