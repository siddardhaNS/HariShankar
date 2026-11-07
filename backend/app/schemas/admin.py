"""Schemas for the admin web: layout, movies, shows, blocking, bookings, today."""
import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import BookingStatus, MovieStatus, ShowStatus

# ---------- Hall layout ----------


class LayoutRow(BaseModel):
    label: Annotated[str, Field(pattern=r"^[A-Z]{1,2}$")]
    class_name: Annotated[str, Field(min_length=1, max_length=40)]
    seats: Annotated[int, Field(ge=1, le=60)]
    aisles_after: list[int] = []  # an empty column after these seat numbers
    indent: Annotated[int, Field(ge=0, le=20)] = 0  # empty columns before seat 1

    @field_validator("aisles_after")
    @classmethod
    def _aisles(cls, v: list[int]) -> list[int]:
        return sorted(set(v))


class LayoutIn(BaseModel):
    rows: Annotated[list[LayoutRow], Field(min_length=1, max_length=60)]

    @field_validator("rows")
    @classmethod
    def _unique_labels(cls, rows: list[LayoutRow]) -> list[LayoutRow]:
        labels = [r.label for r in rows]
        if len(labels) != len(set(labels)):
            raise ValueError("Each row needs its own letter")
        return rows


class LayoutOut(BaseModel):
    screen_id: uuid.UUID
    rows: list[LayoutRow]
    total_seats: int
    classes: list[str]


# ---------- Movies ----------


class MovieIn(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=120)]
    language: Annotated[str, Field(min_length=1, max_length=30)]
    certificate: Literal["U", "UA", "UA 7+", "UA 13+", "UA 16+", "A", "S"]
    runtime_min: Annotated[int, Field(ge=30, le=300)]
    genre: Annotated[str, Field(max_length=60)] = ""
    synopsis: Annotated[str, Field(max_length=600)] = ""
    poster_url: Annotated[str | None, Field(max_length=500, pattern=r"^https://")] = None
    release_date: date | None = None
    status: MovieStatus = MovieStatus.coming_soon


class MovieAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    language: str
    certificate: str
    runtime_min: int
    genre: str
    synopsis: str
    poster_url: str | None
    release_date: date | None
    status: MovieStatus
    upcoming_shows: int = 0


# ---------- Shows ----------

Hhmm = Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]


class ShowsCreateIn(BaseModel):
    """Set up many shows at once: every date x every time."""

    movie_id: uuid.UUID
    dates: Annotated[list[date], Field(min_length=1, max_length=31)]
    times: Annotated[list[Hhmm], Field(min_length=1, max_length=8)]
    prices: dict[uuid.UUID, Annotated[int, Field(ge=0, le=1_000_000)]]  # seat_class_id -> paise
    interval_min: Annotated[int, Field(ge=0, le=60)] = 15
    booking_opens_at: datetime | None = None  # None = open now


class ShowConflict(BaseModel):
    date: date
    time: str
    reason: str


class ShowsCreateOut(BaseModel):
    created: int
    skipped: list[ShowConflict]


class ShowPriceOut(BaseModel):
    seat_class_id: uuid.UUID
    class_name: str
    price_paise: int


class ShowAdminOut(BaseModel):
    id: uuid.UUID
    movie_id: uuid.UUID
    movie_title: str
    starts_at: datetime
    ends_at: datetime
    label: str
    status: ShowStatus
    cancel_reason: str | None
    booking_opens_at: datetime | None
    prices: list[ShowPriceOut]
    seats_total: int
    seats_sold: int
    seats_blocked: int
    collection_paise: int


class PricesIn(BaseModel):
    prices: dict[uuid.UUID, Annotated[int, Field(ge=0, le=1_000_000)]]


class CancelShowIn(BaseModel):
    reason: Annotated[str, Field(min_length=3, max_length=200)]


class CancelShowOut(BaseModel):
    show_id: uuid.UUID
    bookings_refunded: int
    amount_refunded_paise: int


# ---------- Seat map + blocking ----------


class AdminSeat(BaseModel):
    id: uuid.UUID
    row: str
    number: int
    r: int
    c: int
    class_id: uuid.UUID
    state: Literal["free", "booked", "blocked"]
    block_id: uuid.UUID | None = None
    block_reason: str | None = None
    block_all_shows: bool = False
    booking_code: str | None = None
    booked_by: str | None = None


class AdminSeatMap(BaseModel):
    show_id: uuid.UUID | None  # None = the hall for "all upcoming shows"
    classes: list[dict]
    seats: list[AdminSeat]


BlockReason = Literal["House quota", "Guests", "Press", "Repair", "Other"]


class BlockIn(BaseModel):
    seat_ids: Annotated[list[uuid.UUID], Field(min_length=1, max_length=500)]
    show_id: uuid.UUID | None = None  # None = all upcoming shows
    reason: BlockReason


class BlockOut(BaseModel):
    blocked: int
    skipped_sold: list[str]
    skipped_already: list[str]


class UnblockIn(BaseModel):
    seat_ids: Annotated[list[uuid.UUID], Field(min_length=1, max_length=500)]
    show_id: uuid.UUID | None = None


# ---------- Bookings ----------


class AdminBookingOut(BaseModel):
    id: uuid.UUID
    code: str
    status: BookingStatus
    failure_reason: str | None
    customer_name: str
    mobile: str
    movie_title: str
    starts_at: datetime
    show_label: str
    show_status: ShowStatus
    seats: list[str]
    total_paise: int
    refund_paise: int
    refund_id: str | None
    payment_method: str | None
    gateway: str
    upi_ref: str | None
    refund_pending: bool
    seats_admitted: int
    created_at: datetime


class RefundIn(BaseModel):
    reason: Annotated[str, Field(min_length=3, max_length=200)]


# ---------- Today ----------


class TodayShow(BaseModel):
    id: uuid.UUID
    movie_title: str
    starts_at: datetime
    label: str
    status: ShowStatus
    seats_total: int
    seats_sold: int
    collection_paise: int


class TodayOut(BaseModel):
    date: date
    collection_paise: int
    tickets_sold: int
    seats_total: int
    refunds_paise: int
    stuck_payments: int
    payments_to_check: int
    refunds_to_send: int
    shows: list[TodayShow]
    setup: dict[str, bool]
    upi_id: str | None


class ReviewIn(BaseModel):
    received: bool


class RefundSentIn(BaseModel):
    ref: Annotated[str, Field(min_length=4, max_length=60)]


class TheatrePayments(BaseModel):
    upi_id: Annotated[str, Field(pattern=r"^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$", max_length=60)]
    upi_name: Annotated[str, Field(min_length=2, max_length=60)]


# ---------- Promotions ----------


def _clean_weekdays(v: str) -> str:
    days = "".join(sorted(set(v)))
    if not days or any(d not in "0123456" for d in days):
        raise ValueError("Pick at least one day")
    return days


class PromotionFields(BaseModel):
    title: str = Field(min_length=3, max_length=80)
    kind: Literal["per_ticket", "percent"]
    value: int = Field(gt=0, description="Paise off each ticket, or percent off tickets")
    max_discount_paise: int | None = Field(default=None, gt=0)
    min_tickets: int = Field(default=1, ge=1, le=10)
    weekdays: str = "0123456"
    starts_on: date | None = None
    ends_on: date | None = None
    max_uses: int | None = Field(default=None, gt=0)
    per_customer: int | None = Field(default=1, gt=0)
    first_booking_only: bool = False
    show_in_app: bool = True
    is_active: bool = True

    @field_validator("weekdays")
    @classmethod
    def _days(cls, v: str) -> str:
        return _clean_weekdays(v)


class PromotionIn(PromotionFields):
    code: str = Field(min_length=3, max_length=20)

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        v = "".join(v.split()).upper()
        if not v.isalnum() or not v.isascii():
            raise ValueError("Use only letters and numbers, like MATINEE30")
        return v


class PromotionUpdate(BaseModel):
    """Everything except the code can change (bookings already carry it)."""
    title: str | None = Field(default=None, min_length=3, max_length=80)
    max_discount_paise: int | None = Field(default=None, gt=0)
    min_tickets: int | None = Field(default=None, ge=1, le=10)
    weekdays: str | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    max_uses: int | None = Field(default=None, gt=0)
    per_customer: int | None = Field(default=None, gt=0)
    first_booking_only: bool | None = None
    show_in_app: bool | None = None
    is_active: bool | None = None

    @field_validator("weekdays")
    @classmethod
    def _days(cls, v: str | None) -> str | None:
        return None if v is None else _clean_weekdays(v)


class PromotionOut(PromotionIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    details: str
    uses: int                  # paid bookings with this code
    discount_given_paise: int  # total taken off those bookings
    created_at: datetime
