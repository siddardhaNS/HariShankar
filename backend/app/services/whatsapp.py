"""WhatsApp messages and app notifications: automatic ones about a booking, and the owner's promotions.

Every message is first written to `messages` (the outbox) in the same
transaction as the change that caused it, so a message is never lost and never
sent for a change that rolled back. The worker (`python -m app.worker`) sends
what is due and adds the reminders.

The provider isn't chosen yet. `ConsoleWhatsAppSender` prints messages to the
log in development. A real provider (Meta Cloud API, Gupshup, Interakt...) is
one class with `send(mobile, body)`, selected with WHATSAPP_PROVIDER. Note that
WhatsApp only allows business-initiated messages from pre-approved templates,
so each `kind` below becomes one template with the same wording.

Rules:
- Booking messages (confirmed, cancelled, refunds) always go: they're about
  the customer's own ticket.
- Reminders go only to customers with "Show reminders" on.
- Promotions go only to customers with "Offers and new releases" on, at most
  2 a week on each channel, and never between 9 PM and 9 AM (held until 9 AM).

App notifications (see `app/services/push.py`) use the same outbox with
channel "push". Every automatic message also goes as a notification when the
customer has the app with notifications allowed; offers go on the channel the
owner picks (WhatsApp, app notification or both).
"""
import logging
import uuid
from datetime import UTC, datetime, time, timedelta
from typing import Protocol
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Booking, BookingSeat, Campaign, Customer, Message, Movie, Seat, Show, Theatre
from app.models.enums import BookingStatus, ShowStatus
from app.routers.app_catalog import show_label
from app.services import push

log = logging.getLogger("whatsapp")

PROMO_PER_WEEK = 2
QUIET_FROM, QUIET_UNTIL = 21, 9   # promotions wait from 9 PM until 9 AM
MORNING_AT = 9                    # morning-of reminder time
MAX_ATTEMPTS = 3
PROMO_KINDS = {"promotion"}
PUSH_TITLES = {
    "booking_confirmed": "Tickets booked",
    "refunded": "Booking refunded",
    "refund_sent": "Refund sent",
    "reminder_morning": "Your show is today",
    "reminder_hour": "Your show starts in an hour",
}


class WhatsAppSender(Protocol):
    def send(self, mobile: str, body: str) -> str: ...  # returns the provider's message id


class ConsoleWhatsAppSender:
    def send(self, mobile: str, body: str) -> str:
        print(f"[DEV WHATSAPP] to +91 {mobile}:\n{body}\n", flush=True)
        return f"console-{uuid.uuid4().hex[:12]}"


def get_sender() -> WhatsAppSender:
    s = get_settings()
    if s.whatsapp_provider == "console":
        if not s.is_dev:
            raise RuntimeError("Console WhatsApp is only for development. Set WHATSAPP_PROVIDER.")
        return ConsoleWhatsAppSender()
    raise RuntimeError(f"WhatsApp provider {s.whatsapp_provider!r} is not set up yet")


# ---------- Writing to the outbox ----------


def _tz(db: Session, theatre_id: uuid.UUID) -> ZoneInfo:
    t = db.get(Theatre, theatre_id)
    return ZoneInfo(t.timezone if t else "Asia/Kolkata")


def _queue(db: Session, *, theatre_id: uuid.UUID, customer: Customer, kind: str, body: str, key: str,
           send_after: datetime | None = None, booking_id: uuid.UUID | None = None,
           campaign_id: uuid.UUID | None = None, channel: str = "whatsapp") -> None:
    """Add to the outbox; a second message with the same key is ignored.

    An automatic (non-promotion) WhatsApp message is also queued as an app
    notification when the customer has the app with notifications on."""
    db.execute(insert(Message).values(
        id=uuid.uuid4(), theatre_id=theatre_id, customer_id=customer.id, mobile=customer.mobile, kind=kind, body=body,
        dedupe_key=key, send_after=send_after or datetime.now(UTC), booking_id=booking_id, campaign_id=campaign_id,
        status="queued", attempts=0, channel=channel,
    ).on_conflict_do_nothing(index_elements=["dedupe_key"]))
    if channel == "whatsapp" and kind not in PROMO_KINDS and push.has_app(db, [customer.id]):
        _queue(db, theatre_id=theatre_id, customer=customer, kind=kind, body=body, key=f"push:{key}",
               send_after=send_after, booking_id=booking_id, campaign_id=campaign_id, channel="push")


def _ticket_words(db: Session, b: Booking) -> tuple[Show, str, str, str]:
    show = db.get(Show, b.show_id)
    assert show
    tz = _tz(db, b.theatre_id)
    title = db.scalar(select(Movie.title).where(Movie.id == show.movie_id)) or ""
    seats = ", ".join(f"{r}{n}" for r, n in db.execute(
        select(Seat.row_label, Seat.number).join(BookingSeat, BookingSeat.seat_id == Seat.id)
        .where(BookingSeat.booking_id == b.id).order_by(Seat.grid_row, Seat.grid_col)))
    local = show.starts_at.astimezone(tz)
    when = f"{local:%a %d %b}, {local:%I:%M %p}".replace(" 0", " ").lstrip("0")
    return show, title, when, seats


def _rupees(paise: int) -> str:
    return f"₹{paise / 100:,.2f}".replace(".00", "")


def booking_confirmed(db: Session, b: Booking, key: str | None = None) -> None:
    customer = db.get(Customer, b.customer_id)
    if not customer:
        return
    _, title, when, seats = _ticket_words(db, b)
    theatre = db.get(Theatre, b.theatre_id)
    body = (f"Your tickets are booked! 🎬\n{title}\n{when}\nSeats: {seats}\nBooking ID: {b.code}\n\n"
            f"Show the QR in the {theatre.name if theatre else ''} app at the gate.")
    _queue(db, theatre_id=b.theatre_id, customer=customer, kind="booking_confirmed", body=body,
           key=key or f"confirmed:{b.id}", booking_id=b.id)


RESEND_EVERY = timedelta(minutes=2)


def resend_ticket(db: Session, b: Booking) -> None:
    """Staff resend the booking message (customer lost it or changed phones)."""
    now = datetime.now(UTC)
    last = db.scalar(select(func.max(Message.created_at)).where(
        Message.booking_id == b.id, Message.kind == "booking_confirmed"))
    if last and now - last < RESEND_EVERY:
        raise ValueError("Sent just now. Wait a couple of minutes before sending again")
    booking_confirmed(db, b, key=f"resend:{b.id}:{int(now.timestamp())}")


def refunded(db: Session, b: Booking, reason: str) -> None:
    """Every full refund: show cancelled, refunded by the theatre, seats taken first, or paid too late."""
    customer = db.get(Customer, b.customer_id)
    if not customer:
        return
    _, title, when, _ = _ticket_words(db, b)
    why = {
        "show_cancelled": f"Sorry, {title} on {when} has been cancelled.",
        "manual_refund": f"Your booking for {title} on {when} has been cancelled by the theatre.",
        "seat_clash": (f"Sorry, someone else booked the same seats for {title} on {when} just before your payment "
                       "came through, so this booking couldn't go ahead. Other seats may still be free in the app."),
    }.get(reason, f"Your payment for {title} on {when} came through after booking had closed, "
                  "so this booking couldn't go ahead.")
    how = (f"We'll send {_rupees(b.refund_paise)} back to the UPI account you paid from, and message you when it's sent."
           if b.refund_pending else f"{_rupees(b.refund_paise)} has been refunded. It reaches your account in 5 to 7 days.")
    body = f"{why}\nBooking ID: {b.code}\n{how}"
    _queue(db, theatre_id=b.theatre_id, customer=customer, kind="refunded", body=body,
           key=f"refunded:{b.id}", booking_id=b.id)


def refund_sent(db: Session, b: Booking) -> None:
    customer = db.get(Customer, b.customer_id)
    if not customer:
        return
    body = (f"Your refund of {_rupees(b.refund_paise)} for booking {b.code} has been sent to your UPI account."
            f"\nUPI reference: {b.refund_id}")
    _queue(db, theatre_id=b.theatre_id, customer=customer, kind="refund_sent", body=body,
           key=f"refund_sent:{b.id}", booking_id=b.id)


def queue_reminders(db: Session, now: datetime | None = None) -> int:
    """Morning-of (9 AM, for shows from noon) and 1 hour before. Safe to run every minute."""
    now = now or datetime.now(UTC)
    rows = db.execute(
        select(Booking, Show, Customer).join(Show, Show.id == Booking.show_id)
        .join(Customer, Customer.id == Booking.customer_id)
        .where(Booking.status == BookingStatus.confirmed, Show.status == ShowStatus.scheduled,
               Show.starts_at > now, Show.starts_at < now + timedelta(hours=16), Customer.reminders_opt_in)
    ).all()
    # One reminder per customer per show, even with two bookings for it
    groups: dict[tuple[uuid.UUID, uuid.UUID], tuple[Show, Customer, list[Booking]]] = {}
    for b, show, customer in rows:
        groups.setdefault((customer.id, show.id), (show, customer, []))[2].append(b)
    done = set(db.scalars(select(Message.dedupe_key).where(
        Message.kind.in_(("reminder_morning", "reminder_hour")), Message.send_after >= now - timedelta(hours=16))))

    added = 0
    for (cid, sid), (show, customer, bookings) in groups.items():
        tz = _tz(db, show.theatre_id)
        local_now, local_show = now.astimezone(tz), show.starts_at.astimezone(tz)
        morning = (local_show.date() == local_now.date() and local_now.hour >= MORNING_AT and local_show.hour >= 12
                   and show.starts_at - now > timedelta(hours=2) and f"morning:{sid}:{cid}" not in done)
        hour = (timedelta(minutes=20) < show.starts_at - now <= timedelta(minutes=60)
                and f"hour:{sid}:{cid}" not in done)
        if not (morning or hour):
            continue
        words = [_ticket_words(db, b) for b in bookings]
        title = words[0][1]
        seats = ", ".join(w[3] for w in words)
        codes = ", ".join(b.code for b in bookings)
        at = f"{local_show:%I:%M %p}".lstrip("0")
        if morning:
            _queue(db, theatre_id=show.theatre_id, customer=customer, kind="reminder_morning", booking_id=bookings[0].id,
                   key=f"morning:{sid}:{cid}",
                   body=f"Today: {title} at {at} ({show_label(show.starts_at, tz).lower()}).\n"
                        f"Seats: {seats} · Booking ID: {codes}")
            added += 1
        if hour:
            _queue(db, theatre_id=show.theatre_id, customer=customer, kind="reminder_hour", booking_id=bookings[0].id,
                   key=f"hour:{sid}:{cid}",
                   body=f"{title} starts in an hour, at {at}.\nSeats: {seats}. Keep your QR ready at the gate. "
                        f"Booking ID: {codes}")
            added += 1
    return added


# ---------- Promotions ----------


CHANNELS = ("whatsapp", "push", "both")


def audience(db: Session, theatre_id: uuid.UUID, kind: str, channel: str = "whatsapp") -> list[Customer]:
    """Customers who turned on offers and have booked here (in the last 30 or 90 days, or ever).
    For app notifications, only those with the app and notifications allowed."""
    q = select(Booking.customer_id).where(Booking.theatre_id == theatre_id, Booking.status == BookingStatus.confirmed)
    if kind in ("recent_30", "recent_90"):
        q = q.where(Booking.created_at >= datetime.now(UTC) - timedelta(days=30 if kind == "recent_30" else 90))
    people = list(db.scalars(select(Customer).where(Customer.id.in_(q.distinct()), Customer.offers_opt_in)
                             .order_by(Customer.created_at)))
    if channel == "push":
        with_app = push.has_app(db, [p.id for p in people])
        people = [p for p in people if p.id in with_app]
    return people


def next_allowed(at: datetime, tz: ZoneInfo) -> datetime:
    """`at`, or 9 AM if it falls in quiet hours."""
    local = at.astimezone(tz)
    if local.hour >= QUIET_FROM:
        return datetime.combine(local.date() + timedelta(days=1), time(QUIET_UNTIL), tz)
    if local.hour < QUIET_UNTIL:
        return datetime.combine(local.date(), time(QUIET_UNTIL), tz)
    return at


def queue_campaign(db: Session, c: Campaign) -> int:
    """Queue the offer for everyone in its audience. With "both", WhatsApp goes to
    everyone and the notification to those with the app as well."""
    people = audience(db, c.theatre_id, c.audience, "push" if c.channel == "push" else "whatsapp")
    with_app = push.has_app(db, [p.id for p in people]) if c.channel == "both" else set()
    theatre = db.get(Theatre, c.theatre_id)
    footer = f"\n\n— {theatre.name if theatre else ''}\nTo stop offers, turn off “Offers and new releases” in the app’s Profile."
    send_at = next_allowed(c.send_after, _tz(db, c.theatre_id))
    for p in people:
        if c.channel in ("whatsapp", "both"):
            _queue(db, theatre_id=c.theatre_id, customer=p, kind="promotion", body=c.body.strip() + footer,
                   key=f"campaign:{c.id}:{p.id}", send_after=send_at, campaign_id=c.id)
        if c.channel == "push" or p.id in with_app:
            _queue(db, theatre_id=c.theatre_id, customer=p, kind="promotion", body=c.body.strip(),
                   key=f"campaign:{c.id}:{p.id}:push", send_after=send_at, campaign_id=c.id, channel="push")
    c.recipients = len(people)
    return len(people)


# ---------- Sending ----------


def _still_wanted(db: Session, m: Message, now: datetime) -> tuple[bool, str | None, datetime | None]:
    """(send it?, why skipped, or a later time to try)."""
    if m.customer_id is None:  # to staff: only the owner's weekly summary
        return (True, None, None) if m.kind == "weekly_summary" else (False, "no customer", None)
    customer = db.get(Customer, m.customer_id)
    if customer is None:
        return False, "customer gone", None
    if m.kind in PROMO_KINDS:
        if not customer.offers_opt_in:
            return False, "turned off offers", None
        later = next_allowed(now, _tz(db, m.theatre_id))
        if later > now:
            return False, None, later
        week = db.scalar(select(func.count()).select_from(Message).where(
            Message.customer_id == customer.id, Message.kind.in_(PROMO_KINDS), Message.status == "sent",
            Message.channel == m.channel, Message.sent_at >= now - timedelta(days=7)))
        if week >= PROMO_PER_WEEK:
            return False, f"already {PROMO_PER_WEEK} offers this week", None
    if m.kind.startswith("reminder"):
        b = db.get(Booking, m.booking_id) if m.booking_id else None
        show = db.get(Show, b.show_id) if b else None
        if not customer.reminders_opt_in or not b or b.status != BookingStatus.confirmed \
                or not show or show.status != ShowStatus.scheduled or show.starts_at <= now:
            return False, "no longer needed", None
    return True, None, None


def _send_push(db: Session, sender: push.PushSender, m: Message) -> str | None:
    """Send one notification to every phone the customer has. Returns the receipt id,
    or None when no phone can get it (app removed, notifications off, logged out)."""
    tokens = push.tokens_for(db, m.customer_id)
    if not tokens:
        return None
    if m.kind in PROMO_KINDS:
        theatre = db.get(Theatre, m.theatre_id)
        title = theatre.name if theatre else "Offer"
    else:
        title = PUSH_TITLES.get(m.kind, "Your booking")
    data = {"kind": m.kind, **({"booking_id": str(m.booking_id)} if m.booking_id else {})}
    res = sender.send(tokens, title, m.body, data)
    if res.gone:
        push.turn_off(db, res.gone)
    if res.ids:
        return res.ids[0]
    if res.errors:
        raise RuntimeError(res.errors[0])
    return None


def send_due(db: Session, sender: WhatsAppSender, now: datetime | None = None, limit: int = 50,
             push_sender: push.PushSender | None = None) -> int:
    """Send what's due. Rows are locked with SKIP LOCKED, so two workers never send the same one."""
    now = now or datetime.now(UTC)
    push_sender = push_sender or push.get_push_sender()
    due = list(db.scalars(select(Message).where(Message.status == "queued", Message.send_after <= now)
                          .order_by(Message.send_after).limit(limit).with_for_update(skip_locked=True)))
    sent = 0
    for m in due:
        ok, why, later = _still_wanted(db, m, now)
        if later:
            m.send_after = later
            continue
        if not ok:
            m.status, m.error = "skipped", why
            continue
        m.attempts += 1
        try:
            if m.channel == "push":
                pid = _send_push(db, push_sender, m)
                if pid is None:
                    m.status, m.error = "skipped", "no phone with app notifications"
                    continue
                m.provider_id = pid
            else:
                m.provider_id = sender.send(m.mobile, m.body)
            m.status, m.sent_at, m.error = "sent", now, None
            sent += 1
            db.flush()  # the weekly limit check for the next message must see this one
        except Exception as e:  # noqa: BLE001 - any provider error: retry, then give up
            log.warning("%s send failed for %s: %s", m.channel, m.id, e)
            m.error = str(e)[:200]
            if m.attempts >= MAX_ATTEMPTS:
                m.status = "failed"
            else:
                m.send_after = now + timedelta(minutes=5 * m.attempts)
    for c in db.scalars(select(Campaign).where(Campaign.status != "done")):
        left = db.scalar(select(func.count()).select_from(Message).where(
            Message.campaign_id == c.id, Message.status == "queued"))
        c.status = "done" if left == 0 else "sending" if c.send_after <= now else c.status
    return sent
