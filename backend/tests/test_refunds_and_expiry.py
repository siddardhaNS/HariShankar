from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.config import get_settings
from app.models import Booking, Message
from app.services import bookings as svc
from tests.conftest import login
from tests.test_app_flow import app_login, hall  # noqa: F401  (fixture)
from tests.test_upi_direct import upi  # noqa: F401  (fixture)


def start(client, h, show, seats):
    return client.post("/api/app/bookings", headers=h, json={
        "show_id": str(show.id), "seat_ids": [str(s.id) for s in seats], "name": "Ravi"}).json()["booking_id"]


def age(db, bid, minutes):
    b = db.get(Booking, bid)
    b.created_at = datetime.now(UTC) - timedelta(minutes=minutes)
    db.commit()


# ---------- Abandoned payments ----------


def test_abandoned_payment_expires(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    h = app_login(client, db, "9876500801")
    old, fresh = start(client, h, show, [seats["A1"]]), start(client, h, show, [seats["A2"]])
    age(db, old, get_settings().payment_window_minutes + 1)
    assert svc.expire_abandoned(db) == 1
    db.commit()
    db.expire_all()
    assert (db.get(Booking, old).status.value, db.get(Booking, old).failure_reason) == ("failed", "expired")
    assert db.get(Booking, fresh).status.value == "payment_pending"


def test_late_upi_reference_still_books_free_seats(client, db, upi, hall):  # noqa: F811
    show, seats = hall
    h = app_login(client, db, "9876500811")
    bid = start(client, h, show, [seats["B1"]])
    age(db, bid, 30)
    svc.expire_abandoned(db)
    db.commit()
    r = client.post(f"/api/app/bookings/{bid}/upi-ref", headers=h, json={"utr": "412345678811"}).json()
    assert r["status"] == "payment_review"


def test_late_upi_reference_for_taken_seat_is_refunded(client, db, upi, hall):  # noqa: F811
    show, seats = hall
    late = app_login(client, db, "9876500821")
    bid = start(client, late, show, [seats["B2"]])
    age(db, bid, 30)
    svc.expire_abandoned(db)
    db.commit()
    other = app_login(client, db, "9876500822")
    oid = start(client, other, show, [seats["B2"]])
    client.post(f"/api/app/bookings/{oid}/upi-ref", headers=other, json={"utr": "412345678822"})
    r = client.post(f"/api/app/bookings/{bid}/upi-ref", headers=late, json={"utr": "412345678821"}).json()
    assert r["status"] == "refunded" and r["refund_pending"] is True


# ---------- Resend ----------


def test_resend_ticket(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    h = app_login(client, db, "9876500831")
    bid = start(client, h, show, [seats["A3"]])
    client.post(f"/api/app/dev/bookings/{bid}/pay", headers=h, json={})
    a = login(client)
    # The confirmation was just queued, so an immediate resend is refused
    assert client.post(f"/api/admin/bookings/{bid}/resend", headers=a).status_code == 429
    m = db.scalar(select(Message).where(Message.booking_id == bid))
    m.created_at = datetime.now(UTC) - timedelta(minutes=5)
    db.commit()
    assert client.post(f"/api/admin/bookings/{bid}/resend", headers=a).status_code == 200
    assert len(list(db.scalars(select(Message).where(Message.booking_id == bid)))) == 2


def test_resend_only_for_confirmed(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    h = app_login(client, db, "9876500841")
    bid = start(client, h, show, [seats["A4"]])
    assert client.post(f"/api/admin/bookings/{bid}/resend", headers=login(client)).status_code == 409


# ---------- Refunds page ----------


def test_refunds_list_to_send_and_history(client, db, upi, hall):  # noqa: F811
    show, seats = hall
    # A direct-UPI booking, paid and confirmed, then refunded by the owner: money to send back
    h = app_login(client, db, "9876500851")
    bid = start(client, h, show, [seats["A5"], seats["A6"]])
    client.post(f"/api/app/bookings/{bid}/upi-ref", headers=h, json={"utr": "412345678851"})
    client.post(f"/api/admin/bookings/{bid}/review", headers=upi, json={"received": True})
    client.post(f"/api/admin/bookings/{bid}/refund", headers=upi, json={"reason": "Family emergency"})

    r = client.get("/api/admin/refunds", headers=upi, params={"state": "to_send"}).json()
    assert r["to_send_count"] == 1 and r["to_send_paise"] == 34720
    row = r["refunds"][0]
    assert row["refund_note"] == "Family emergency" and row["refunded_at"] and row["refund_sent_at"] is None

    client.post(f"/api/admin/bookings/{bid}/refund-sent", headers=upi, json={"ref": "512345678851"})
    r = client.get("/api/admin/refunds", headers=upi, params={"state": "done"}).json()
    assert r["to_send_count"] == 0 and r["listed_count"] == 1 and r["refunds"][0]["refund_sent_at"]
    assert r["by_reason"] == [{"reason": "manual_refund", "count": 1, "paise": 34720}]
    assert client.get("/api/admin/refunds", headers=upi, params={"q": "9876500851"}).json()["listed_count"] == 1
    assert client.get("/api/admin/refunds", headers=upi, params={"q": "nobody"}).json()["listed_count"] == 0
    assert client.get("/api/admin/refunds", headers=upi, params={"start": "2026-02-02", "end": "2026-01-01"}).status_code == 422
