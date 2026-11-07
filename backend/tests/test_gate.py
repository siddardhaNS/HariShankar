from datetime import UTC, datetime, timedelta

import pytest

from app.models import Show, StaffUser
from app.models.enums import StaffRole
from app.security import hash_pin, ticket_qr
from tests.conftest import login
from tests.test_app_flow import app_login, hall  # noqa: F401  (fixture)

GATE_MOBILE, GATE_PIN = "9000000003", "135790"


@pytest.fixture
def gate(db, theatre):
    db.add(StaffUser(theatre_id=theatre.id, name="Ramu", mobile=GATE_MOBILE,
                     pin_hash=hash_pin(GATE_PIN), role=StaffRole.gate))
    db.commit()


@pytest.fixture
def now_show(hall):  # noqa: F811
    return hall


def open_gate(db, show):
    """Move the show to 10 minutes ago (after booking: a started show can't be booked)."""
    s = db.get(Show, show.id)
    s.starts_at = datetime.now(UTC) - timedelta(minutes=10)
    db.commit()


def paid(client, db, show, seats, mobile="9876500201"):
    h = app_login(client, db, mobile)
    bid = client.post("/api/app/bookings", headers=h, json={
        "show_id": str(show.id), "seat_ids": [str(s.id) for s in seats], "name": "Lakshmi"}).json()["booking_id"]
    t = client.post(f"/api/app/dev/bookings/{bid}/pay", headers=h, json={}).json()
    assert t["status"] == "confirmed", t
    return t


def scan(client, h, text, show=None):
    body = {"scan": text, **({"show_id": str(show.id)} if show else {})}
    r = client.post("/api/gate/lookup", headers=h, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_scan_then_enter_in_parts(client, db, gate, now_show):
    show, seats = now_show
    t = paid(client, db, show, [seats["A1"], seats["A2"], seats["A3"], seats["A4"]])
    open_gate(db, show)
    h = login(client, GATE_MOBILE, GATE_PIN)

    first = scan(client, h, t["qr"], show)
    assert first["verdict"] == "ok" and first["seats_left"] == 4 and first["seats"] == ["A1", "A2", "A3", "A4"]
    assert first["customer_name"] == "Lakshmi" and first["mobile_last4"] == "0201"

    r = client.post(f"/api/gate/bookings/{first['booking_id']}/admit", headers=h,
                    json={"count": 2, "show_id": str(show.id)}).json()
    assert r["seats_admitted"] == 2 and r["seats_left"] == 2 and r["message"] == "2 already in. 2 left"

    # Second half arrives later and the booking ID is typed in
    again = scan(client, h, t["code"].lower(), show)
    assert again["verdict"] == "ok" and again["seats_left"] == 2
    over = client.post(f"/api/gate/bookings/{again['booking_id']}/admit", headers=h, json={"count": 3})
    assert over.status_code == 409 and "Only 2 left" in over.json()["detail"]
    client.post(f"/api/gate/bookings/{again['booking_id']}/admit", headers=h, json={"count": 2})

    done = scan(client, h, t["qr"], show)
    assert done["verdict"] == "all_in" and len(done["entries"]) == 2
    assert client.post(f"/api/gate/bookings/{done['booking_id']}/admit", headers=h,
                       json={"count": 1}).status_code == 409

    shows = client.get("/api/gate/shows", headers=h).json()
    assert shows[0]["gate_open"] and shows[0]["seats_sold"] == 4 and shows[0]["seats_admitted"] == 4


def test_undo_wrong_tap(client, db, gate, owner, now_show):
    show, seats = now_show
    t = paid(client, db, show, [seats["B1"], seats["B2"]])
    open_gate(db, show)
    h = login(client, GATE_MOBILE, GATE_PIN)
    bid = scan(client, h, t["qr"])["booking_id"]
    r = client.post(f"/api/gate/bookings/{bid}/admit", headers=h, json={"count": 2}).json()
    entry = r["entries"][0]
    assert entry["can_undo"] and entry["by"] == "Ramu"

    # Someone else can't undo it
    assert client.delete(f"/api/gate/entries/{entry['id']}", headers=login(client)).status_code == 403

    back = client.delete(f"/api/gate/entries/{entry['id']}", headers=h).json()
    assert back["seats_admitted"] == 0 and back["verdict"] == "ok" and back["entries"] == []


def test_fake_and_unknown_tickets(client, db, gate, now_show):
    show, seats = now_show
    t = paid(client, db, show, [seats["B3"]])
    open_gate(db, show)
    h = login(client, GATE_MOBILE, GATE_PIN)
    forged = t["qr"].rsplit(".", 1)[0] + ".000000000000"
    assert scan(client, h, forged)["verdict"] == "fake"
    assert scan(client, h, ticket_qr("ZZZZZZ"))["verdict"] == "not_found"
    assert scan(client, h, "hello world")["verdict"] == "not_found"


def test_wrong_show_and_too_early(client, db, gate, hall):  # noqa: F811
    show, seats = hall  # tomorrow
    t = paid(client, db, show, [seats["A5"]])
    h = login(client, GATE_MOBILE, GATE_PIN)
    early = scan(client, h, t["qr"])
    assert early["verdict"] == "too_early" and early["message"].startswith("Gate opens at")

    other = Show(theatre_id=show.theatre_id, screen_id=show.screen_id, movie_id=show.movie_id,
                 starts_at=datetime.now(UTC) - timedelta(minutes=5))
    db.add(other)
    db.commit()
    assert scan(client, h, t["qr"], other)["verdict"] == "other_show"


def test_cancelled_show_and_unpaid_are_refused(client, db, gate, owner, now_show):
    show, seats = now_show
    t = paid(client, db, show, [seats["A6"]])
    h = login(client, GATE_MOBILE, GATE_PIN)

    ch = app_login(client, db, "9876500299")
    unpaid = client.post("/api/app/bookings", headers=ch, json={
        "show_id": str(show.id), "seat_ids": [str(seats["B6"].id)], "name": "X"}).json()
    open_gate(db, show)
    assert scan(client, h, unpaid["code"])["verdict"] == "not_paid"

    client.post(f"/api/admin/shows/{show.id}/cancel", headers=login(client), json={"reason": "Power cut"})
    r = scan(client, h, t["qr"])
    assert r["verdict"] == "cancelled"
    assert client.post(f"/api/gate/bookings/{r['booking_id']}/admit", headers=h,
                       json={"count": 1}).status_code == 409


def test_other_theatre_cannot_scan(client, db, gate, now_show, theatre):
    from app.models import Theatre
    show, seats = now_show
    t = paid(client, db, show, [seats["B5"]])
    open_gate(db, show)
    other = Theatre(name="Other", slug="other", city="Palasa")
    db.add(other)
    db.flush()
    db.add(StaffUser(theatre_id=other.id, name="Other gate", mobile="9000000009",
                     pin_hash=hash_pin(GATE_PIN), role=StaffRole.gate))
    db.commit()
    assert scan(client, login(client, "9000000009", GATE_PIN), t["qr"])["verdict"] == "not_found"


def test_customer_token_cannot_use_gate(client, db, now_show):
    assert client.get("/api/gate/shows", headers=app_login(client, db, "9876500298")).status_code == 401
