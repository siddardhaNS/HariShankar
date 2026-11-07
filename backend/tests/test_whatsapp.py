from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.models import Customer, Message, Show
from app.services import whatsapp
from tests.conftest import login
from tests.test_app_flow import app_login, hall  # noqa: F401  (fixture)

IST = ZoneInfo("Asia/Kolkata")


class Capture:
    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    def send(self, mobile, body):
        self.sent.append((mobile, body))
        return f"cap-{len(self.sent)}"


def paid(client, db, show, seats, mobile):
    h = app_login(client, db, mobile)
    bid = client.post("/api/app/bookings", headers=h, json={
        "show_id": str(show.id), "seat_ids": [str(s.id) for s in seats], "name": "Ravi"}).json()["booking_id"]
    client.post(f"/api/app/dev/bookings/{bid}/pay", headers=h, json={})
    return h, bid


def kinds(db):
    return sorted(m.kind for m in db.scalars(select(Message)))


def evening_show(db, show):
    """Move the show to tomorrow 6:30 PM IST, so reminder times are predictable."""
    s = db.get(Show, show.id)
    tomorrow = datetime.now(IST).date() + timedelta(days=1)
    s.starts_at = datetime.combine(tomorrow, time(18, 30), IST)
    db.commit()
    return s.starts_at


def test_confirmation_is_sent_once(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    paid(client, db, show, [seats["A1"], seats["A2"]], "9876500701")
    assert kinds(db) == ["booking_confirmed"]
    cap = Capture()
    assert whatsapp.send_due(db, cap) == 1
    db.commit()
    assert whatsapp.send_due(db, cap) == 0
    mobile, body = cap.sent[0]
    assert mobile == "9876500701" and "Seats: A1, A2" in body and "Godavari Express" in body


def test_reminders_morning_and_hour_before(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    starts = evening_show(db, show)
    h, bid = paid(client, db, show, [seats["A3"]], "9876500711")
    _, _ = paid(client, db, show, [seats["A4"]], "9876500712")
    off = db.scalar(select(Customer).where(Customer.mobile == "9876500712"))
    off.reminders_opt_in = False
    db.commit()

    morning = datetime.combine(starts.astimezone(IST).date(), time(10, 0), IST)
    whatsapp.queue_reminders(db, now=morning)
    whatsapp.queue_reminders(db, now=morning + timedelta(minutes=1))  # running again adds nothing
    db.commit()
    assert [m.kind for m in db.scalars(select(Message).where(Message.kind.like("reminder%")))] == ["reminder_morning"]

    whatsapp.queue_reminders(db, now=starts - timedelta(minutes=45))
    db.commit()
    rem = list(db.scalars(select(Message).where(Message.kind.like("reminder%"))))
    assert sorted(m.kind for m in rem) == ["reminder_hour", "reminder_morning"]
    assert all(m.mobile == "9876500711" for m in rem)
    assert "6:30 PM" in next(m.body for m in rem if m.kind == "reminder_hour")


def test_cancel_show_and_refund_sent_messages(client, db, owner, hall, monkeypatch):  # noqa: F811
    show, seats = hall
    _, bid = paid(client, db, show, [seats["B1"]], "9876500721")
    h = login(client)
    client.post(f"/api/admin/shows/{show.id}/cancel", headers=h, json={"reason": "Power cut"})
    assert kinds(db) == ["booking_confirmed", "refunded"]
    body = db.scalar(select(Message.body).where(Message.kind == "refunded"))
    assert "cancelled" in body and "refunded" in body  # fake gateway refunds by itself


def test_promotion_audience_quiet_hours_and_weekly_cap(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    paid(client, db, show, [seats["A1"]], "9876500731")
    paid(client, db, show, [seats["A2"]], "9876500732")
    yes = db.scalar(select(Customer).where(Customer.mobile == "9876500731"))
    yes.offers_opt_in = True
    db.commit()
    h = login(client)

    sizes = {a["audience"]: a["customers"] for a in client.get("/api/admin/messages/audience", headers=h).json()}
    assert sizes == {"all": 1, "recent_90": 1, "recent_30": 1}

    noon = datetime.combine(datetime.now(IST).date() + timedelta(days=1), time(12, 0), IST)
    for i in range(3):
        r = client.post("/api/admin/messages/campaigns", headers=h, json={
            "title": f"Offer {i}", "body": f"Matinee tickets ₹30 off this week {i}", "send_after": noon.isoformat()})
        assert r.status_code == 201 and r.json()["recipients"] == 1

    cap = Capture()
    whatsapp.send_due(db, cap, now=noon - timedelta(hours=1))  # not due yet (only the bookings go)
    db.commit()
    assert not [b for _, b in cap.sent if "Matinee" in b]
    whatsapp.send_due(db, cap, now=noon)
    db.commit()
    promos = [b for _, b in cap.sent if "Matinee" in b]
    assert len(promos) == 2 and "turn off" in promos[0]
    skipped = db.scalar(select(Message).where(Message.kind == "promotion", Message.status == "skipped"))
    assert skipped.error == "already 2 offers this week"

    # At night a promotion waits until 9 AM
    night = datetime.combine(noon.date() + timedelta(days=8), time(22, 30), IST)
    assert whatsapp.next_allowed(night, IST) == datetime.combine(night.date() + timedelta(days=1), time(9), IST)


def test_nobody_opted_in_and_cancel_and_owner_only(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    paid(client, db, show, [seats["B2"]], "9876500741")
    h = login(client)
    r = client.post("/api/admin/messages/campaigns", headers=h, json={"title": "Hello", "body": "Hello there everyone"})
    assert r.status_code == 409

    c = db.scalar(select(Customer).where(Customer.mobile == "9876500741"))
    c.offers_opt_in = True
    db.commit()
    later = (datetime.now(UTC) + timedelta(days=2)).isoformat()
    cid = client.post("/api/admin/messages/campaigns", headers=h, json={
        "title": "Later", "body": "New movie this Friday", "send_after": later}).json()["id"]
    done = client.post(f"/api/admin/messages/campaigns/{cid}/cancel", headers=h).json()
    assert done["status"] == "done" and done["skipped"] == 1
    assert any(m["kind"] == "promotion" and m["status"] == "skipped"
               for m in client.get("/api/admin/messages/log", headers=h).json())

    client.post("/api/admin/staff", headers=h, json={"name": "Man", "mobile": "9000000006", "role": "manager", "pin": "135790"})
    assert client.get("/api/admin/messages/campaigns", headers=login(client, "9000000006", "135790")).status_code == 403


def test_one_reminder_per_customer_per_show(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    starts = evening_show(db, show)
    paid(client, db, show, [seats["B3"]], "9876500751")
    paid(client, db, show, [seats["B4"], seats["B5"]], "9876500751")  # same customer, second booking
    whatsapp.queue_reminders(db, now=starts - timedelta(minutes=40))
    db.commit()
    rem = list(db.scalars(select(Message).where(Message.kind == "reminder_hour")))
    assert len(rem) == 1 and "B3, B4, B5" in rem[0].body


def test_seat_clash_refunds_send_a_message(client, db, owner, hall):  # noqa: F811
    """Two payments for the same seat at the same moment: the second is refunded and told why."""
    show, seats = hall
    ha, hb = app_login(client, db, "9876500761"), app_login(client, db, "9876500762")
    body = {"show_id": str(show.id), "seat_ids": [str(seats["B6"].id)],
            "name": "X"}
    a = client.post("/api/app/bookings", headers=ha, json=body).json()["booking_id"]
    b = client.post("/api/app/bookings", headers=hb, json=body).json()["booking_id"]
    client.post(f"/api/app/dev/bookings/{a}/pay", headers=ha, json={})
    assert client.post(f"/api/app/dev/bookings/{b}/pay", headers=hb, json={}).json()["status"] == "refunded"
    m = db.scalar(select(Message).where(Message.kind == "refunded"))
    assert m.mobile == "9876500762" and "someone else booked the same seats" in m.body
    assert "has been refunded" in m.body  # gateway refunds by itself


def test_direct_upi_seat_clash_message_says_money_comes_back(client, db, owner, hall, monkeypatch):  # noqa: F811
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "payment_gateway", "upi")
    h = login(client)
    client.put("/api/admin/theatre/payments", headers=h, json={"upi_id": "hs@okaxis", "upi_name": "Hari Shankar"})
    show, seats = hall
    ha, hb = app_login(client, db, "9876500771"), app_login(client, db, "9876500772")
    body = {"show_id": str(show.id), "seat_ids": [str(seats["A6"].id)], "name": "X"}
    a = client.post("/api/app/bookings", headers=ha, json=body).json()["booking_id"]
    b = client.post("/api/app/bookings", headers=hb, json=body).json()["booking_id"]
    client.post(f"/api/app/bookings/{a}/upi-ref", headers=ha, json={"utr": "412345678771"})
    client.post(f"/api/app/bookings/{b}/upi-ref", headers=hb, json={"utr": "412345678772"})
    m = db.scalar(select(Message).where(Message.kind == "refunded"))
    assert m.mobile == "9876500772" and "We'll send ₹173.60 back to the UPI account you paid from" in m.body
