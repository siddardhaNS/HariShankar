from urllib.parse import parse_qs, urlparse

import pytest

from app.config import get_settings
from tests.conftest import login
from tests.test_app_flow import app_login, hall  # noqa: F401  (fixture)


@pytest.fixture
def upi(monkeypatch, client, owner):
    """Direct UPI on, and the owner has set the theatre's UPI ID."""
    monkeypatch.setattr(get_settings(), "payment_gateway", "upi")
    h = login(client)
    r = client.put("/api/admin/theatre/payments", headers=h,
                   json={"upi_id": "harishankar@okaxis", "upi_name": "Hari Shankar Picture Palace"})
    assert r.status_code == 200, r.text
    return h


def start(client, h, show, seats, name="Ravi"):
    return client.post("/api/app/bookings", headers=h,
                       json={"show_id": str(show.id), "seat_ids": [str(s.id) for s in seats], "name": name})


def test_no_upi_id_means_no_booking(client, db, owner, hall, monkeypatch):  # noqa: F811
    monkeypatch.setattr(get_settings(), "payment_gateway", "upi")
    show, seats = hall
    r = start(client, app_login(client, db), show, [seats["A1"]])
    assert r.status_code == 503 and "UPI ID" in r.json()["detail"]


def test_upi_link_has_payee_and_exact_amount(client, db, upi, hall):  # noqa: F811
    show, seats = hall
    r = start(client, app_login(client, db), show, [seats["A1"], seats["A2"]])
    assert r.status_code == 201, r.text
    order = r.json()["order"]
    assert order["gateway"] == "upi" and order["payee_upi_id"] == "harishankar@okaxis"
    q = parse_qs(urlparse(order["upi_url"]).query)
    assert q["pa"] == ["harishankar@okaxis"] and q["am"] == ["347.20"] and q["cu"] == ["INR"]
    assert q["tr"] == [r.json()["code"]]


def test_claim_holds_seats_then_staff_confirm(client, db, upi, hall):  # noqa: F811
    show, seats = hall
    ch = app_login(client, db, "9876500101")
    bid = start(client, ch, show, [seats["B1"]]).json()["booking_id"]

    resp = client.post(f"/api/app/bookings/{bid}/upi-ref", headers=ch, json={"utr": "412345678901"})
    t = resp.json()
    assert t["status"] == "payment_review" and t["qr"] is None

    # Seat is held while staff check: nobody else can start on it
    other = app_login(client, db, "9876500102")
    assert start(client, other, show, [seats["B1"]]).status_code == 409

    # Shows up for staff to check, and on Today
    assert [b["code"] for b in client.get("/api/admin/payments", headers=upi).json()] == [t["code"]]
    assert client.get("/api/admin/today", headers=upi).json()["payments_to_check"] == 1

    ok = client.post(f"/api/admin/bookings/{bid}/review", headers=upi, json={"received": True}).json()
    assert ok["status"] == "confirmed"
    assert client.get(f"/api/app/bookings/{bid}", headers=ch).json()["qr"].startswith("HSPP1.")


def test_payment_not_received_frees_seats(client, db, upi, hall):  # noqa: F811
    show, seats = hall
    ch = app_login(client, db, "9876500111")
    bid = start(client, ch, show, [seats["B2"]]).json()["booking_id"]
    client.post(f"/api/app/bookings/{bid}/upi-ref", headers=ch, json={"utr": "412345678911"})
    r = client.post(f"/api/admin/bookings/{bid}/review", headers=upi, json={"received": False}).json()
    assert r["status"] == "failed" and r["failure_reason"] == "payment_not_received"
    assert start(client, app_login(client, db, "9876500112"), show, [seats["B2"]]).status_code == 201


def test_same_upi_reference_cannot_be_reused(client, db, upi, hall):  # noqa: F811
    show, seats = hall
    ch = app_login(client, db, "9876500121")
    a = start(client, ch, show, [seats["B3"]]).json()["booking_id"]
    b = start(client, ch, show, [seats["B4"]]).json()["booking_id"]
    assert client.post(f"/api/app/bookings/{a}/upi-ref", headers=ch, json={"utr": "412345678921"}).status_code == 200
    r = client.post(f"/api/app/bookings/{b}/upi-ref", headers=ch, json={"utr": "412345678921"})
    assert r.status_code == 409


def test_clash_after_paying_flags_a_refund_to_send(client, db, upi, hall):  # noqa: F811
    """Both paid in their UPI apps; whoever submitted the reference first gets
    the seat, the other is owed a refund the owner sends by hand."""
    show, seats = hall
    ha, hb = app_login(client, db, "9876500131"), app_login(client, db, "9876500132")
    a = start(client, ha, show, [seats["A5"]]).json()["booking_id"]
    b = start(client, hb, show, [seats["A5"]]).json()["booking_id"]
    client.post(f"/api/app/bookings/{a}/upi-ref", headers=ha, json={"utr": "412345678931"})
    rb = client.post(f"/api/app/bookings/{b}/upi-ref", headers=hb, json={"utr": "412345678932"}).json()
    assert rb["status"] == "refunded" and rb["failure_reason"] == "seat_clash"
    assert rb["refund_pending"] is True and rb["refund_id"] is None
    assert client.get("/api/admin/today", headers=upi).json()["refunds_to_send"] == 1

    sent = client.post(f"/api/admin/bookings/{b}/refund-sent", headers=upi, json={"ref": "512345678999"}).json()
    assert sent["refund_pending"] is False and sent["refund_id"] == "512345678999"


def test_cancel_show_flags_upi_refunds(client, db, upi, hall):  # noqa: F811
    show, seats = hall
    ch = app_login(client, db, "9876500141")
    bid = start(client, ch, show, [seats["A6"]]).json()["booking_id"]
    client.post(f"/api/app/bookings/{bid}/upi-ref", headers=ch, json={"utr": "412345678941"})
    client.post(f"/api/admin/bookings/{bid}/review", headers=upi, json={"received": True})
    r = client.post(f"/api/admin/shows/{show.id}/cancel", headers=upi, json={"reason": "Power cut"}).json()
    assert r["bookings_refunded"] == 1
    t = client.get(f"/api/app/bookings/{bid}", headers=ch).json()
    assert t["status"] == "refunded" and t["refund_pending"] is True


def test_upi_id_must_look_like_one(client, owner):
    h = login(client)
    r = client.put("/api/admin/theatre/payments", headers=h, json={"upi_id": "not a upi id", "upi_name": "X Y"})
    assert r.status_code == 422


def test_find_booking_by_upi_reference(client, db, upi, hall):  # noqa: F811
    show, seats = hall
    ch = app_login(client, db, "9876500141")
    bid = start(client, ch, show, [seats["B5"]]).json()["booking_id"]
    client.post(f"/api/app/bookings/{bid}/upi-ref", headers=ch, json={"utr": "412345678941"})
    found = client.get("/api/admin/bookings", headers=upi, params={"q": "412345678941"}).json()
    assert [b["id"] for b in found] == [bid]
