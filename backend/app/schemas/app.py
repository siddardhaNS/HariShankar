"""Schemas for the customer mobile app API."""
import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AgeGroup, BookingStatus, Gender

Mobile = Annotated[str, Field(pattern=r"^[6-9]\d{9}$")]


class OtpRequestIn(BaseModel):
    mobile: Mobile


class OtpRequestOut(BaseModel):
    sent: bool = True
    expires_in: int
    dev_hint: str | None = None  # development only: where to find the code


class OtpVerifyIn(BaseModel):
    mobile: Mobile
    code: Annotated[str, Field(pattern=r"^\d{6}$")]


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    mobile: str
    name: str
    gender: Gender | None
    age_group: AgeGroup | None
    offers_opt_in: bool
    reminders_opt_in: bool


class AuthOut(BaseModel):
    token: str
    customer: CustomerOut
    is_new: bool


class CustomerPatch(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    gender: Gender | None = None
    age_group: AgeGroup | None = None
    offers_opt_in: bool | None = None
    reminders_opt_in: bool | None = None


class PushTokenIn(BaseModel):
    """An Expo push token, e.g. ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]."""
    token: str = Field(min_length=10, max_length=200, pattern=r"^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$")
    platform: Literal["android", "ios"] = "android"


class TheatreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    city: str
    address: str


class MovieOut(BaseModel):
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
    rating: float | None = None  # average stars, once enough people have rated
    rating_count: int = 0


Availability = Literal["available", "filling_fast", "almost_full", "sold_out"]


class ShowTimeOut(BaseModel):
    id: uuid.UUID
    starts_at: datetime
    label: str  # Morning / Matinee / First show / Second show
    seats_left: int
    seats_total: int
    availability: Availability
    from_price_paise: int | None


class MovieShows(BaseModel):
    movie: MovieOut
    shows: list[ShowTimeOut]


class DayOut(BaseModel):
    date: date
    has_shows: bool


class HomeOut(BaseModel):
    theatre: TheatreOut
    date: date
    days: list[DayOut]
    featured: MovieShows | None
    now_showing: list[MovieShows]
    coming_soon: list[MovieOut]


class SeatClassOut(BaseModel):
    id: uuid.UUID
    name: str
    price_paise: int | None
    description: str = ""


class SeatOut(BaseModel):
    id: uuid.UUID
    row: str
    number: int
    r: int  # grid row
    c: int  # grid column
    class_id: uuid.UUID
    state: Literal["free", "booked", "blocked"]


class ShowBrief(BaseModel):
    id: uuid.UUID
    starts_at: datetime
    label: str
    movie: MovieOut
    theatre: TheatreOut


class SeatMapOut(BaseModel):
    show: ShowBrief
    classes: list[SeatClassOut]
    seats: list[SeatOut]
    seats_left: int
    booking_fee_paise: int
    gst_rate_bp: int
    max_seats: int
    payment_gateway: str  # "upi" = direct UPI only (no cards/net banking yet)


class SeatGroupOut(BaseModel):
    seat_ids: list[uuid.UUID]
    labels: list[str]
    class_name: str
    total_paise: int


class BookingCreateIn(BaseModel):
    show_id: uuid.UUID
    seat_ids: list[uuid.UUID] = Field(min_length=1, max_length=10)
    name: str = Field(min_length=1, max_length=80)
    promo_code: str | None = Field(default=None, max_length=20)


class PromoApplyIn(BaseModel):
    show_id: uuid.UUID
    seat_ids: list[uuid.UUID] = Field(min_length=1, max_length=10)
    code: str = Field(min_length=1, max_length=20)


class OfferOut(BaseModel):
    code: str
    title: str
    details: str


class PriceOut(BaseModel):
    tickets_paise: int
    discount_paise: int
    booking_fee_paise: int
    gst_paise: int
    total_paise: int


class OrderOut(BaseModel):
    order_id: str
    amount_paise: int
    gateway: str
    key_id: str | None
    upi_url: str | None = None
    payee_upi_id: str | None = None
    payee_name: str | None = None


class BookingStartOut(BaseModel):
    booking_id: uuid.UUID
    code: str
    price: PriceOut
    order: OrderOut


class TicketSeat(BaseModel):
    label: str
    class_name: str
    price_paise: int


class BookingOut(BaseModel):
    id: uuid.UUID
    code: str
    status: BookingStatus
    failure_reason: str | None
    customer_name: str
    show: ShowBrief
    seats: list[TicketSeat]
    price: PriceOut
    payment_method: str | None
    gateway: str
    upi_ref: str | None
    refund_id: str | None
    refund_paise: int
    refund_pending: bool  # direct UPI: the theatre still has to send it back
    qr: str | None  # only for confirmed tickets
    rating: "RatingOut | None" = None
    can_rate: bool = False  # the show is over and it can still be rated
    created_at: datetime
    confirmed_at: datetime | None


class DevPayIn(BaseModel):
    method: Literal["upi", "card", "netbanking"] = "upi"


class UpiClaimIn(BaseModel):
    utr: Annotated[str, Field(pattern=r"^\d{12}$", description="12-digit UPI reference (UTR) from the UPI app")]


class PromoApplyOut(BaseModel):
    code: str
    title: str
    discount_paise: int
    price: PriceOut


class RatingIn(BaseModel):
    stars: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=300)


class RatingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    stars: int
    comment: str


BookingOut.model_rebuild()
