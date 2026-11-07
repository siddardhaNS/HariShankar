import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import ShowStatus

# What the gate screen shows in big letters after a scan
Verdict = Literal[
    "ok",           # let them in
    "all_in",       # every seat on this ticket has already entered
    "not_paid",     # payment not finished or not yet checked by staff
    "cancelled",    # refunded, cancelled show, or failed payment
    "other_show",   # real ticket, but for a different show
    "too_early",    # gate not open yet for this show
    "show_over",    # the show has ended
    "not_found",    # no such booking at this theatre
    "fake",         # QR signature doesn't match: not one of our tickets
]


class GateShow(BaseModel):
    id: uuid.UUID
    movie_title: str
    label: str
    starts_at: datetime
    ends_at: datetime
    status: ShowStatus
    gate_open: bool
    seats_sold: int
    seats_admitted: int


class LookupIn(BaseModel):
    scan: str = Field(min_length=1, max_length=200, description="QR text, or a booking ID typed in")
    show_id: uuid.UUID | None = Field(default=None, description="The show the gate is letting in")


class GateEntry(BaseModel):
    id: uuid.UUID
    count: int
    at: datetime
    by: str
    can_undo: bool
    offline: bool = False
    problem: str | None = None


class GateTicket(BaseModel):
    verdict: Verdict
    message: str
    booking_id: uuid.UUID | None = None
    code: str | None = None
    customer_name: str = ""
    mobile_last4: str = ""
    movie_title: str = ""
    show_id: uuid.UUID | None = None
    show_label: str = ""
    starts_at: datetime | None = None
    seats: list[str] = []
    seats_total: int = 0
    seats_admitted: int = 0
    seats_left: int = 0
    entries: list[GateEntry] = []


class AdmitIn(BaseModel):
    count: int = Field(ge=1, le=50)
    show_id: uuid.UUID | None = None


# ---------- Offline gate ----------


class OfflineShow(BaseModel):
    id: uuid.UUID
    movie_title: str
    label: str
    starts_at: datetime
    opens_at: datetime   # gate opens
    ends_at: datetime
    status: ShowStatus


class OfflineBooking(BaseModel):
    id: uuid.UUID
    code: str
    show_id: uuid.UUID
    state: Literal["ok", "not_paid", "cancelled"]  # what the gate does with it
    message: str = ""    # for not_paid / cancelled, the words to show
    customer_name: str
    mobile_last4: str
    seats: list[str]
    seats_total: int
    seats_admitted: int


class OfflineList(BaseModel):
    generated_at: datetime
    theatre_id: uuid.UUID
    shows: list[OfflineShow]
    bookings: list[OfflineBooking]


class OfflineEntryIn(BaseModel):
    id: uuid.UUID          # chosen by the phone, so a retried sync records it once
    booking_id: uuid.UUID
    count: int = Field(ge=1, le=50)
    scanned_at: datetime


class SyncIn(BaseModel):
    entries: list[OfflineEntryIn] = Field(max_length=500)


class SyncResult(BaseModel):
    id: uuid.UUID
    result: Literal["recorded", "already", "problem", "rejected"]
    message: str = ""


class SyncOut(BaseModel):
    results: list[SyncResult]
