"""Insights beyond the basics in `reports.insights`: when people book, how shows
sell out, movies week by week, class and seat demand, repeat customers, offers
and messages, payments and refunds. Also the Excel download and the owner's
Monday WhatsApp summary.

Customers appear only as totals, except "Regulars", which the owner asked for:
first name and the last 4 digits of the mobile number.
"""
import io
import uuid
from collections import Counter, defaultdict
from datetime import UTC, date, datetime, time, timedelta
from statistics import median
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import (
    Booking, BookingSeat, Campaign, Customer, Message, Movie, Promotion, Seat, SeatClass, Show, StaffUser, Theatre,
)
from app.models.enums import BookingStatus, ShowStatus, StaffRole
from app.services import reports
from app.services.reports import SLOTS, WEEKDAYS, Filters, ShowRow

HOURS = ["Night (12 to 6 AM)", "6 to 9 AM", "9 AM to 12", "12 to 3 PM", "3 to 6 PM", "6 to 9 PM", "9 PM to 12"]
VISITS = ["Once", "2 times", "3 to 5 times", "6 or more"]
NEARLY_FULL = 0.95          # a show counts as sold out at 95% of seats
LAPSED_DAYS = 60
LED_TO_BOOKING_DAYS = 3     # a booking within 3 days of an offer message counts for it
METHOD = {"upi": "UPI", "card": "Card", "netbanking": "Net banking", None: "Not recorded"}
REFUND_REASON = {"show_cancelled": "Show cancelled", "manual_refund": "Refunded by the theatre",
                 "seat_clash": "Seats taken first", "expired": "Paid after booking closed",
                 "booking_failed": "Booking failed after payment"}


def _hour_bucket(h: int) -> str:
    return HOURS[0] if h < 6 else HOURS[1 + (h - 6) // 3]


def _pct(part: float, whole: float) -> int:
    return round(100 * part / whole) if whole else 0


def full(db: Session, theatre_id: uuid.UUID, start: date, end: date, f: Filters | None = None) -> dict:
    f = f or Filters()
    out = reports.insights(db, theatre_id, start, end, f)
    tz, rows = reports.load(db, theatre_id, start, end, f)
    live = [r for r in rows if r.show.status == ShowStatus.scheduled]
    bookings = [(b, r) for r in live for b in r.confirmed]

    out["filters"] = {"movie_id": f.movie_id, "slot": f.slot, "class_id": f.class_id}
    out.update(_when_booked(bookings, tz))
    out["summary"]["same_day_bookings"] = out.pop("_same_day")
    out["slot_week"] = _slot_week(live)
    out["sell_outs"] = _sell_outs(live)
    out["movie_weeks"] = _movie_weeks(db, live)
    out.update(_seat_demand(db, theatre_id, live, f))
    out.update(_customers(db, theatre_id, bookings))
    out.update(_offers(db, theatre_id, start, end, tz, bookings))
    out["payments"] = _payments(db, rows)
    return out


def _when_booked(bookings: list[tuple[Booking, ShowRow]], tz: ZoneInfo) -> dict:
    hours: Counter[str] = Counter()
    days: Counter[str] = Counter()
    same_day = 0
    for b, r in bookings:
        local = b.created_at.astimezone(tz)
        hours[_hour_bucket(local.hour)] += 1
        days[WEEKDAYS[local.weekday()]] += 1
        same_day += int(local.date() >= r.day)
    return {"booking_hour": reports._bar(HOURS, hours), "booking_weekday": reports._bar(WEEKDAYS, days),
            "_same_day": same_day}


def _slot_week(live: list[ShowRow]) -> list[dict]:
    """Seats filled per show time, weekdays against Saturday and Sunday."""
    out = []
    for slot in SLOTS:
        rs = [r for r in live if r.label == slot]
        wd = [r for r in rs if r.day.weekday() < 5]
        we = [r for r in rs if r.day.weekday() >= 5]
        fill = lambda xs: _pct(sum(r.seats_sold for r in xs), sum(r.seats_total for r in xs))  # noqa: E731
        out.append({"slot": slot, "weekday": fill(wd), "weekend": fill(we), "weekday_shows": len(wd),
                    "weekend_shows": len(we), "sold_out": sum(1 for r in rs if _full(r))})
    return out


def _full(r: ShowRow) -> bool:
    return r.seats_total > 0 and r.seats_sold >= NEARLY_FULL * r.seats_total


def _sell_outs(live: list[ShowRow]) -> list[dict]:
    """Shows that filled (95%+), and how long before the show the last of those seats went."""
    out = []
    for r in live:
        if not _full(r):
            continue
        need, count, filled_at = NEARLY_FULL * r.seats_total, 0, None
        for b in sorted(r.confirmed, key=lambda b: b.confirmed_at or b.created_at):
            count += b._seat_count  # type: ignore[attr-defined]
            if count >= need:
                filled_at = b.confirmed_at or b.created_at
                break
        hours = (r.show.starts_at - filled_at).total_seconds() / 3600 if filled_at else 0
        out.append({"movie_title": r.title, "starts_at": r.show.starts_at, "label": r.label,
                    "occupancy": _pct(r.seats_sold, r.seats_total), "hours_before": round(max(hours, 0), 1)})
    return sorted(out, key=lambda x: -x["hours_before"])[:15]


def _movie_weeks(db: Session, live: list[ShowRow]) -> list[dict]:
    """Each movie week by week since it opened here (its release date, else its first show)."""
    ids = {r.show.movie_id for r in live}
    if not ids:
        return []
    release = dict(db.execute(select(Movie.id, Movie.release_date).where(Movie.id.in_(ids))).all())
    first = dict(db.execute(select(Show.movie_id, func.min(Show.starts_at)).where(Show.movie_id.in_(ids))
                            .group_by(Show.movie_id)).all())
    weeks: dict[str, dict[int, list[ShowRow]]] = defaultdict(lambda: defaultdict(list))
    for r in live:
        opened = release.get(r.show.movie_id) or first[r.show.movie_id].date()
        weeks[r.title][max((r.day - opened).days // 7 + 1, 1)].append(r)
    out = []
    for title, by_week in weeks.items():
        out.append({"title": title, "weeks": [
            {"week": w, "shows": len(rs), "seats_sold": sum(r.seats_sold for r in rs),
             "occupancy": _pct(sum(r.seats_sold for r in rs), sum(r.seats_total for r in rs)),
             "collected_paise": sum(r.collected_paise for r in rs)}
            for w, rs in sorted(by_week.items())]})
    return sorted(out, key=lambda m: -sum(w["seats_sold"] for w in m["weeks"]))


def _seat_demand(db: Session, theatre_id: uuid.UUID, live: list[ShowRow], f: Filters) -> dict:
    """Which classes and rows sell, how early, and which seats rarely sell."""
    empty = {"class_demand": [], "row_demand": [], "rarely_sold": []}
    if not live:
        return empty
    seat_q = select(Seat).where(Seat.theatre_id == theatre_id, Seat.is_active.is_(True))
    if f.class_id:
        seat_q = seat_q.where(Seat.seat_class_id == f.class_id)
    seats = {s.id: s for s in db.scalars(seat_q.order_by(Seat.grid_row, Seat.grid_col))}
    classes = {c.id: c for c in db.scalars(select(SeatClass).where(SeatClass.theatre_id == theatre_id))}
    starts = {b.id: (r.show.starts_at, b.created_at) for r in live for b in r.confirmed}
    n_shows = len(live)
    sold_times: Counter[uuid.UUID] = Counter()
    lead_days: dict[uuid.UUID, list[float]] = defaultdict(list)
    if starts:
        for bid, seat_id in db.execute(select(BookingSeat.booking_id, BookingSeat.seat_id)
                                       .where(BookingSeat.booking_id.in_(list(starts)))):
            if seat_id not in seats:
                continue
            sold_times[seat_id] += 1
            show_at, booked_at = starts[bid]
            lead_days[seats[seat_id].seat_class_id].append((show_at - booked_at).total_seconds() / 86400)

    by_class: dict[uuid.UUID, list[Seat]] = defaultdict(list)
    by_row: dict[str, list[Seat]] = defaultdict(list)
    for s in seats.values():
        by_class[s.seat_class_id].append(s)
        by_row[s.row_label].append(s)
    class_demand = []
    for cid, ss in sorted(by_class.items(), key=lambda kv: classes[kv[0]].sort_order if kv[0] in classes else 0):
        sold = sum(sold_times[s.id] for s in ss)
        lead = lead_days.get(cid, [])
        class_demand.append({"name": classes[cid].name if cid in classes else "", "seats": len(ss),
                             "occupancy": _pct(sold, len(ss) * n_shows), "seats_sold": sold,
                             "median_days_before": round(median(lead), 1) if lead else None})
    row_demand = [{"label": row, "value": _pct(sum(sold_times[s.id] for s in ss), len(ss) * n_shows),
                   "note": f"{classes[ss[0].seat_class_id].name if ss[0].seat_class_id in classes else ''}, {len(ss)} seats"}
                  for row, ss in by_row.items()]
    row_demand.sort(key=lambda b: -b["value"])
    rarely = sorted(seats.values(), key=lambda s: (sold_times[s.id], s.grid_row, s.grid_col))[:12]
    return {
        "class_demand": class_demand,
        "row_demand": row_demand,
        "rarely_sold": [{"seat": f"{s.row_label}{s.number}", "sold": sold_times[s.id], "shows": n_shows} for s in rarely],
    }


def _customers(db: Session, theatre_id: uuid.UUID, bookings: list[tuple[Booking, ShowRow]]) -> dict:
    per: Counter[uuid.UUID] = Counter(b.customer_id for b, _ in bookings)
    visits: Counter[str] = Counter()
    for n in per.values():
        visits[VISITS[0] if n == 1 else VISITS[1] if n == 2 else VISITS[2] if n <= 5 else VISITS[3]] += 1
    top = [cid for cid, n in per.most_common(10) if n >= 2]
    people = {c.id: c for c in db.scalars(select(Customer).where(Customer.id.in_(top)))} if top else {}
    last = dict(db.execute(select(Booking.customer_id, func.max(Booking.created_at)).where(
        Booking.customer_id.in_(top), Booking.status == BookingStatus.confirmed, Booking.theatre_id == theatre_id)
        .group_by(Booking.customer_id)).all()) if top else {}
    regulars = [{"name": (people[c].name.split() or ["Customer"])[0] if c in people else "Customer",
                 "mobile_end": people[c].mobile[-4:] if c in people else "", "bookings": per[c],
                 "last_booked": last.get(c)} for c in top]

    # Haven't come back: booked here before, but nothing in the last 60 days (as of today)
    cutoff = datetime.now(UTC) - timedelta(days=LAPSED_DAYS)
    lapsed = db.scalar(select(func.count()).select_from(
        select(Booking.customer_id).where(Booking.theatre_id == theatre_id, Booking.status == BookingStatus.confirmed)
        .group_by(Booking.customer_id).having(func.max(Booking.created_at) < cutoff).subquery())) or 0
    return {"visits": reports._bar(VISITS, visits), "regulars": regulars, "lapsed_customers": lapsed}


def _offers(db: Session, theatre_id: uuid.UUID, start: date, end: date, tz: ZoneInfo,
            bookings: list[tuple[Booking, ShowRow]]) -> dict:
    used: dict[uuid.UUID, list[Booking]] = defaultdict(list)
    for b, _ in bookings:
        if b.promotion_id:
            used[b.promotion_id].append(b)
    promos = {p.id: p for p in db.scalars(select(Promotion).where(Promotion.id.in_(list(used))))} if used else {}
    offers = sorted(({
        "code": promos[pid].code if pid in promos else "", "title": promos[pid].title if pid in promos else "",
        "bookings": len(bs), "seats": sum(b._seat_count for b in bs),  # type: ignore[attr-defined]
        "discount_paise": sum(b.discount_paise for b in bs), "collected_paise": sum(b.total_paise for b in bs),
    } for pid, bs in used.items()), key=lambda o: -o["bookings"])

    # Offer messages sent in these dates, and bookings that followed within 3 days
    lo = datetime.combine(start, time.min, tz)
    hi = datetime.combine(end + timedelta(days=1), time.min, tz)
    campaigns = []
    for c in db.scalars(select(Campaign).where(Campaign.theatre_id == theatre_id, Campaign.send_after >= lo,
                                               Campaign.send_after < hi).order_by(Campaign.send_after)):
        sent = list(db.execute(select(Message.customer_id, Message.sent_at).where(
            Message.campaign_id == c.id, Message.status == "sent")))
        first: dict[uuid.UUID, datetime] = {}
        for cid, at in sent:
            if cid and (cid not in first or at < first[cid]):
                first[cid] = at
        led = 0
        if first:
            led = len({cid for cid, at in db.execute(select(Booking.customer_id, Booking.created_at).where(
                Booking.customer_id.in_(list(first)), Booking.theatre_id == theatre_id,
                Booking.status == BookingStatus.confirmed))
                if first[cid] <= at <= first[cid] + timedelta(days=LED_TO_BOOKING_DAYS)})
        campaigns.append({"title": c.title, "channel": c.channel, "send_after": c.send_after,
                          "recipients": c.recipients, "reached": len(first), "led_to_booking": led})

    cust_ids = {b.customer_id for b, _ in bookings}
    on = db.scalar(select(func.count()).select_from(Customer).where(Customer.id.in_(cust_ids), Customer.offers_opt_in)) \
        if cust_ids else 0
    return {"offers": offers, "campaigns": campaigns,
            "offers_opt": {"on": on or 0, "off": len(cust_ids) - (on or 0)}}


def _payments(db: Session, rows: list[ShowRow]) -> dict:
    """Every booking for these shows, whatever happened to it."""
    ids = [r.show.id for r in rows]
    if not ids:
        return {"methods": [], "failed": 0, "abandoned": 0, "seat_clashes": 0, "refunds": [], "refunded_paise": 0}
    all_b = list(db.scalars(select(Booking).where(Booking.show_id.in_(ids))))
    methods: Counter[str] = Counter()
    money: Counter[str] = Counter()
    for b in all_b:
        if b.status == BookingStatus.confirmed:
            methods[METHOD.get(b.payment_method, b.payment_method or "Not recorded")] += 1
            money[METHOD.get(b.payment_method, b.payment_method or "Not recorded")] += b.total_paise
    refunds: dict[str, list[Booking]] = defaultdict(list)
    for b in all_b:
        if b.status == BookingStatus.refunded:
            refunds[REFUND_REASON.get(b.failure_reason or "", "Other")].append(b)
    return {
        "methods": [{"label": k, "value": v, "note": f"₹{money[k] / 100:,.0f}"} for k, v in methods.most_common()],
        "failed": sum(1 for b in all_b if b.status == BookingStatus.failed and b.failure_reason == "payment_failed"),
        "abandoned": sum(1 for b in all_b if b.status == BookingStatus.failed
                         and b.failure_reason in ("expired", "payment_not_received")),
        "seat_clashes": sum(1 for b in all_b if b.failure_reason == "seat_clash"),
        "refunds": [{"label": k, "value": len(bs), "note": f"₹{sum(b.refund_paise for b in bs) / 100:,.0f}"}
                    for k, bs in sorted(refunds.items(), key=lambda kv: -len(kv[1]))],
        "refunded_paise": sum(b.refund_paise for bs in refunds.values() for b in bs),
    }


# ---------- Excel ----------


def to_excel(data: dict, theatre_name: str) -> bytes:
    """One sheet per view, plain numbers so the accountant can work with them."""
    from openpyxl import Workbook
    from openpyxl.styles import Font

    wb = Workbook()
    bold = Font(bold=True)

    def sheet(title: str, header: list[str], rows: list[list]) -> None:
        ws = wb.create_sheet(title[:31])
        ws.append(header)
        for c in ws[1]:
            c.font = bold
        for r in rows:
            ws.append(r)
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = max(12, min(40, max(len(str(c.value or "")) for c in col) + 2))

    s = data["summary"]
    ws = wb.active
    ws.title = "Summary"
    ws.append([f"{theatre_name} insights", f"{data['start']} to {data['end']}"])
    ws["A1"].font = bold
    for k, v in [("Shows", s["shows"]), ("Seats filled %", s["occupancy"]), ("Seats sold", s["seats_sold"]),
                 ("Bookings", s["bookings"]), ("Booked on the day of the show", s["same_day_bookings"]),
                 ("Customers", s["customers"]), ("New customers", s["new_customers"]),
                 ("Came back (2+ bookings)", s["repeat_customers"]), ("Seats per booking", s["avg_group"]),
                 ("Bookings with a promo code", s["promo_bookings"]), ("Promo discount ₹", s["promo_discount_paise"] / 100),
                 ("Haven't come back in 60 days", data["lapsed_customers"])]:
        ws.append([k, v])
    ws.column_dimensions["A"].width = 34

    bars = lambda xs: [[b["label"], b["value"], b.get("note", "")] for b in xs]  # noqa: E731
    sheet("Show times", ["Show time", "Weekdays %", "Weekends %", "Weekday shows", "Weekend shows", "Sold out"],
          [[x["slot"], x["weekday"], x["weekend"], x["weekday_shows"], x["weekend_shows"], x["sold_out"]] for x in data["slot_week"]])
    sheet("Days", ["Day", "Seats filled %", "Detail"], bars(data["by_weekday"]))
    sheet("When booked", ["How long before", "Bookings", ""], bars(data["lead_time"]))
    sheet("Booking hour", ["Time of day", "Bookings", ""], bars(data["booking_hour"]))
    sheet("Booking day", ["Day booked", "Bookings", ""], bars(data["booking_weekday"]))
    sheet("Sold out", ["Movie", "Show", "Filled %", "Hours before show"],
          [[x["movie_title"], x["starts_at"].astimezone(ZoneInfo("Asia/Kolkata")).strftime("%d %b %Y %I:%M %p"),
            x["occupancy"], x["hours_before"]] for x in data["sell_outs"]])
    sheet("Movies", ["Movie", "Shows", "Seats sold", "Filled %", "Rating", "Ratings", "Collected ₹"],
          [[m["title"], m["shows"], m["seats_sold"], m["occupancy"], m["rating"], m["ratings"], m["collected_paise"] / 100]
           for m in data["movies"]])
    sheet("Movies by week", ["Movie", "Week", "Shows", "Seats sold", "Filled %", "Collected ₹"],
          [[m["title"], w["week"], w["shows"], w["seats_sold"], w["occupancy"], w["collected_paise"] / 100]
           for m in data["movie_weeks"] for w in m["weeks"]])
    sheet("Classes", ["Class", "Seats", "Filled %", "Seats sold", "Median days booked before"],
          [[c["name"], c["seats"], c["occupancy"], c["seats_sold"], c["median_days_before"]] for c in data["class_demand"]])
    sheet("Rows", ["Row", "Filled %", "Detail"], bars(data["row_demand"]))
    sheet("Group size", ["Seats", "Bookings", ""], bars(data["group_size"]))
    sheet("Visits", ["Bookings per customer", "Customers", ""], bars(data["visits"]))
    sheet("Audience", ["Group", "Customers", ""], bars(data["gender"]) + bars(data["age"]))
    sheet("Offers", ["Code", "Offer", "Bookings", "Seats", "Discount ₹", "Collected ₹"],
          [[o["code"], o["title"], o["bookings"], o["seats"], o["discount_paise"] / 100, o["collected_paise"] / 100]
           for o in data["offers"]])
    sheet("Offer messages", ["Message", "Sent as", "Sent from", "Customers", "Reached", "Booked within 3 days"],
          [[c["title"], c["channel"], c["send_after"].astimezone(ZoneInfo("Asia/Kolkata")).strftime("%d %b %Y %I:%M %p"),
            c["recipients"], c["reached"], c["led_to_booking"]] for c in data["campaigns"]])
    p = data["payments"]
    sheet("Payments", ["Paid with", "Bookings", "Amount"], bars(p["methods"]))
    sheet("Refunds", ["Why", "Bookings", "Amount"], bars(p["refunds"]) + [
        ["Payments failed", p["failed"], ""], ["Left without paying", p["abandoned"], ""], ["Seat clashes", p["seat_clashes"], ""]])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------- Monday summary to the owner ----------

SUMMARY_DAY, SUMMARY_HOUR = 0, 9  # Monday 9 AM


def weekly_summary_text(db: Session, theatre: Theatre, monday: date) -> str:
    """Last week (Monday to Sunday) in a few lines, with the week before for comparison."""
    start, end = monday - timedelta(days=7), monday - timedelta(days=1)
    week = reports.report(db, theatre.id, start, end)["totals"]
    before = reports.report(db, theatre.id, start - timedelta(days=7), start - timedelta(days=1))["totals"]
    _, rows = reports.load(db, theatre.id, start, end)
    live = [r for r in rows if r.show.status == ShowStatus.scheduled and r.seats_total]
    fill = _pct(week["seats_sold"], week["seats_total"])
    fill_before = _pct(before["seats_sold"], before["seats_total"])
    rupees = lambda p: f"₹{p / 100:,.0f}"  # noqa: E731
    lines = [f"{theatre.name}: last week ({start:%d %b} to {end:%d %b})",
             f"Collection {rupees(week['collected_paise'])}"
             + (f" ({'up' if week['collected_paise'] >= before['collected_paise'] else 'down'} from "
                f"{rupees(before['collected_paise'])} the week before)" if before["shows"] else ""),
             f"{week['seats_sold']} tickets, {fill}% of seats filled"
             + (f" ({fill - fill_before:+d} points)" if before["shows"] else "")]
    if live:
        best = max(live, key=lambda r: r.seats_sold / r.seats_total)
        worst = min(live, key=lambda r: r.seats_sold / r.seats_total)
        name = lambda r: f"{r.title}, {r.show.starts_at.astimezone(ZoneInfo(theatre.timezone)):%a %I:%M %p}"  # noqa: E731
        lines.append(f"Best show: {name(best)} ({_pct(best.seats_sold, best.seats_total)}% full)")
        if worst is not best:
            lines.append(f"Weakest show: {name(worst)} ({_pct(worst.seats_sold, worst.seats_total)}% full)")
    unusual = []
    if week["cancelled_shows"]:
        unusual.append(f"{week['cancelled_shows']} show(s) cancelled")
    if week["refunds_to_send"]:
        unusual.append(f"{week['refunds_to_send']} refund(s) still to send")
    if week["refunded_paise"]:
        unusual.append(f"{rupees(week['refunded_paise'])} refunded")
    if before["shows"] and fill_before and fill < fill_before - 15:
        unusual.append("seats filled dropped sharply")
    if unusual:
        lines.append("Worth a look: " + ", ".join(unusual))
    lines.append("More in Insights on the admin website.")
    return "\n".join(lines)


def queue_weekly_summaries(db: Session, now: datetime | None = None) -> int:
    """On Monday from 9 AM, one WhatsApp summary to each active owner. Safe to run every minute."""
    now = now or datetime.now(UTC)
    added = 0
    for theatre in db.scalars(select(Theatre)):
        tz = ZoneInfo(theatre.timezone)
        local = now.astimezone(tz)
        if local.weekday() != SUMMARY_DAY or local.hour < SUMMARY_HOUR:
            continue
        owners = list(db.scalars(select(StaffUser).where(StaffUser.theatre_id == theatre.id,
                                                         StaffUser.role == StaffRole.owner, StaffUser.is_active)))
        if not owners:
            continue
        keys = [f"weekly:{theatre.id}:{local.date()}:{o.id}" for o in owners]
        if set(db.scalars(select(Message.dedupe_key).where(Message.dedupe_key.in_(keys)))) == set(keys):
            continue
        body = weekly_summary_text(db, theatre, local.date())
        for o, key in zip(owners, keys, strict=True):
            res = db.execute(insert(Message).values(
                id=uuid.uuid4(), theatre_id=theatre.id, customer_id=None, mobile=o.mobile, kind="weekly_summary",
                body=body, dedupe_key=key, send_after=now, status="queued", attempts=0, channel="whatsapp",
            ).on_conflict_do_nothing(index_elements=["dedupe_key"]).returning(Message.id))
            added += len(res.all())
    return added
