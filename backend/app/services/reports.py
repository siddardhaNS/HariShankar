"""Reports (money and seats per day and per show) and Insights (who books,
when, and what fills the hall), for a range of show dates.

Everything is grouped by the show's date in the theatre's time zone, so a day's
row matches what happened in the hall that day. A single theatre has a few
hundred bookings a day at most, so the numbers are added up in Python after two
simple queries; that keeps the rules readable.
"""
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Booking, BookingSeat, Customer, Entry, Movie, Seat, Show, Theatre
from app.models.enums import BookingStatus, ShowStatus
from app.routers.app_catalog import show_label

SLOTS = ["Morning", "Matinee", "First show", "Second show"]
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
LEAD = ["Under 3 hours before", "Earlier the same day", "1 day before", "2 to 3 days before", "4 or more days before"]
GROUPS = ["1", "2", "3 to 4", "5 or more"]
GENDER = {"male": "Male", "female": "Female", "other": "Other", "not_said": "Not said", None: "Not said"}
AGE = {"under_18": "Under 18", "18_24": "18 to 24", "25_34": "25 to 34", "35_44": "35 to 44",
       "45_59": "45 to 59", "60_plus": "60 and above", "not_said": "Not said", None: "Not said"}


@dataclass
class ShowRow:
    show: Show
    title: str
    label: str
    day: date
    seats_total: int
    seats_sold: int = 0
    admitted: int = 0
    bookings: int = 0
    tickets_paise: int = 0
    discount_paise: int = 0
    fee_paise: int = 0
    gst_paise: int = 0
    collected_paise: int = 0
    refunded_paise: int = 0
    refunds_to_send: int = 0
    confirmed: list[Booking] = field(default_factory=list)


def load(db: Session, theatre_id: uuid.UUID, start: date, end: date) -> tuple[ZoneInfo, list[ShowRow]]:
    theatre = db.get(Theatre, theatre_id)
    tz = ZoneInfo(theatre.timezone if theatre else "Asia/Kolkata")
    lo = datetime.combine(start, time.min, tz)
    hi = datetime.combine(end + timedelta(days=1), time.min, tz)
    shows = db.execute(
        select(Show, Movie.title).join(Movie, Movie.id == Show.movie_id)
        .where(Show.theatre_id == theatre_id, Show.starts_at >= lo, Show.starts_at < hi).order_by(Show.starts_at)
    ).all()
    if not shows:
        return tz, []
    hall = dict(db.execute(select(Seat.screen_id, func.count()).where(Seat.theatre_id == theatre_id)
                           .group_by(Seat.screen_id)).all())
    rows = {s.id: ShowRow(show=s, title=t, label=show_label(s.starts_at, tz), day=s.starts_at.astimezone(tz).date(),
                          seats_total=hall.get(s.screen_id, 0)) for s, t in shows}
    ids = list(rows)
    seats = dict(db.execute(select(BookingSeat.booking_id, func.count()).join(Booking, Booking.id == BookingSeat.booking_id)
                            .where(Booking.show_id.in_(ids)).group_by(BookingSeat.booking_id)).all())
    for sid, n in db.execute(select(Entry.show_id, func.sum(Entry.count)).where(Entry.show_id.in_(ids))
                             .group_by(Entry.show_id)):
        rows[sid].admitted = int(n or 0)
    for b in db.scalars(select(Booking).where(
            Booking.show_id.in_(ids), Booking.status.in_((BookingStatus.confirmed, BookingStatus.refunded)))):
        r = rows[b.show_id]
        if b.status == BookingStatus.refunded:
            if b.gateway_payment_id or b.upi_ref:  # money had come in
                r.refunded_paise += b.refund_paise
                r.refunds_to_send += int(b.refund_pending)
            continue
        n = seats.get(b.id, 0)
        b._seat_count = n  # type: ignore[attr-defined]
        r.confirmed.append(b)
        r.bookings += 1
        r.seats_sold += n
        r.tickets_paise += b.tickets_paise
        r.discount_paise += b.discount_paise
        r.fee_paise += b.booking_fee_paise
        r.gst_paise += b.gst_paise
        r.collected_paise += b.total_paise
    return tz, list(rows.values())


MONEY = ("bookings", "seats_sold", "admitted", "tickets_paise", "discount_paise", "fee_paise", "gst_paise",
         "collected_paise", "refunded_paise", "refunds_to_send")


def report(db: Session, theatre_id: uuid.UUID, start: date, end: date) -> dict:
    _, rows = load(db, theatre_id, start, end)

    def blank(d: date | None) -> dict:
        return {"date": d, "shows": 0, "cancelled_shows": 0, "seats_total": 0, **dict.fromkeys(MONEY, 0)}

    days: dict[date, dict] = {}
    total = blank(None)
    shows_out = []
    for r in rows:
        day = days.setdefault(r.day, blank(r.day))
        cancelled = r.show.status == ShowStatus.cancelled
        for agg in (day, total):
            agg["shows"] += 1
            agg["cancelled_shows"] += int(cancelled)
            agg["seats_total"] += 0 if cancelled else r.seats_total
            for k in MONEY:
                agg[k] += getattr(r, k)
        shows_out.append({
            "id": r.show.id, "date": r.day, "starts_at": r.show.starts_at, "label": r.label, "movie_title": r.title,
            "status": r.show.status, "seats_total": r.seats_total, **{k: getattr(r, k) for k in MONEY},
        })
    return {"start": start, "end": end, "days": sorted(days.values(), key=lambda d: d["date"]),
            "shows": shows_out, "totals": total}


def _bar(labels: list[str], values: dict[str, float], extra: dict[str, str] | None = None) -> list[dict]:
    return [{"label": k, "value": values.get(k, 0), "note": (extra or {}).get(k, "")} for k in labels]


def insights(db: Session, theatre_id: uuid.UUID, start: date, end: date) -> dict:
    tz, rows = load(db, theatre_id, start, end)
    live = [r for r in rows if r.show.status == ShowStatus.scheduled]

    def fill(groups: dict[str, list[ShowRow]], order: list[str]) -> list[dict]:
        out = []
        for k in order:
            rs = groups.get(k, [])
            cap = sum(r.seats_total for r in rs)
            sold = sum(r.seats_sold for r in rs)
            out.append({"label": k, "value": round(100 * sold / cap) if cap else 0,
                        "note": f"{sold} of {cap} seats, {len(rs)} show{'s' if len(rs) != 1 else ''}" if rs else "No shows"})
        return out

    by_slot: dict[str, list[ShowRow]] = defaultdict(list)
    by_day: dict[str, list[ShowRow]] = defaultdict(list)
    by_movie: dict[str, list[ShowRow]] = defaultdict(list)
    for r in live:
        by_slot[r.label].append(r)
        by_day[WEEKDAYS[r.day.weekday()]].append(r)
        by_movie[r.title].append(r)

    bookings = [(b, r) for r in live for b in r.confirmed]
    lead: Counter[str] = Counter()
    group: Counter[str] = Counter()
    for b, r in bookings:
        hours = (r.show.starts_at - b.created_at).total_seconds() / 3600
        days_before = (r.day - b.created_at.astimezone(tz).date()).days
        lead[LEAD[0] if hours < 3 else LEAD[1] if days_before <= 0 else LEAD[2] if days_before == 1
             else LEAD[3] if days_before <= 3 else LEAD[4]] += 1
        n = b._seat_count  # type: ignore[attr-defined]
        group[GROUPS[0] if n <= 1 else GROUPS[1] if n == 2 else GROUPS[2] if n <= 4 else GROUPS[3]] += 1

    # Audience: each customer counted once, only as totals
    cust_ids = {b.customer_id for b, _ in bookings}
    customers = list(db.scalars(select(Customer).where(Customer.id.in_(cust_ids)))) if cust_ids else []
    gender = Counter(GENDER[c.gender.value if c.gender else None] for c in customers)
    age = Counter(AGE[c.age_group.value if c.age_group else None] for c in customers)
    per_customer = Counter(b.customer_id for b, _ in bookings)
    first_ever = dict(db.execute(
        select(Booking.customer_id, func.min(Booking.created_at)).where(
            Booking.customer_id.in_(cust_ids), Booking.status == BookingStatus.confirmed,
            Booking.theatre_id == theatre_id).group_by(Booking.customer_id)
    ).all()) if cust_ids else {}
    # New: their first ever booking here is one of the bookings in this range
    first_here: dict[uuid.UUID, datetime] = {}
    for b, _ in bookings:
        if b.customer_id not in first_here or b.created_at < first_here[b.customer_id]:
            first_here[b.customer_id] = b.created_at
    new = sum(1 for cid, at in first_here.items() if first_ever.get(cid) == at)

    movies = []
    for title, rs in sorted(by_movie.items(), key=lambda kv: -sum(r.seats_sold for r in kv[1])):
        cap = sum(r.seats_total for r in rs)
        sold = sum(r.seats_sold for r in rs)
        movies.append({"title": title, "shows": len(rs), "seats_sold": sold,
                       "occupancy": round(100 * sold / cap) if cap else 0,
                       "collected_paise": sum(r.collected_paise for r in rs)})

    cap = sum(r.seats_total for r in live)
    sold = sum(r.seats_sold for r in live)
    with_promo = [b for b, _ in bookings if b.promotion_id]
    return {
        "start": start, "end": end,
        "summary": {
            "shows": len(live), "occupancy": round(100 * sold / cap) if cap else 0, "seats_sold": sold,
            "bookings": len(bookings), "customers": len(cust_ids), "new_customers": new,
            "repeat_customers": sum(1 for n in per_customer.values() if n >= 2),
            "avg_group": round(sold / len(bookings), 1) if bookings else 0,
            "promo_bookings": len(with_promo), "promo_discount_paise": sum(b.discount_paise for b in with_promo),
        },
        "by_slot": fill(by_slot, SLOTS),
        "by_weekday": fill(by_day, WEEKDAYS),
        "lead_time": _bar(LEAD, lead),
        "group_size": _bar(GROUPS, group),
        "gender": _bar(["Female", "Male", "Other", "Not said"], gender),
        "age": _bar(list(dict.fromkeys(AGE.values())), age),
        "movies": movies,
    }
