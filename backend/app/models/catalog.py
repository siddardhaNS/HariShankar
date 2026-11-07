import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TheatreScoped, TimestampMixin
from app.models.enums import MovieStatus, ShowStatus


class Movie(IdMixin, TimestampMixin, TheatreScoped, Base):
    __tablename__ = "movies"

    title: Mapped[str] = mapped_column(String(120))
    language: Mapped[str] = mapped_column(String(30))
    certificate: Mapped[str] = mapped_column(String(6))  # U, UA, A, S
    runtime_min: Mapped[int] = mapped_column(Integer)
    genre: Mapped[str] = mapped_column(String(60), default="")
    synopsis: Mapped[str] = mapped_column(Text, default="")
    poster_url: Mapped[str | None] = mapped_column(String(500))
    release_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[MovieStatus] = mapped_column(
        Enum(MovieStatus, name="movie_status"), default=MovieStatus.coming_soon
    )


class Show(IdMixin, TimestampMixin, TheatreScoped, Base):
    __tablename__ = "shows"
    __table_args__ = (UniqueConstraint("screen_id", "starts_at"),)

    screen_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("screens.id"))
    movie_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("movies.id"), index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    interval_min: Mapped[int] = mapped_column(Integer, default=15)
    booking_opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[ShowStatus] = mapped_column(Enum(ShowStatus, name="show_status"), default=ShowStatus.scheduled)
    cancel_reason: Mapped[str | None] = mapped_column(String(200))


class ShowPrice(Base):
    __tablename__ = "show_prices"
    __table_args__ = (CheckConstraint("price_paise >= 0", name="price_non_negative"),)

    show_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shows.id"), primary_key=True)
    seat_class_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("seat_classes.id"), primary_key=True
    )
    price_paise: Mapped[int] = mapped_column(Integer)
