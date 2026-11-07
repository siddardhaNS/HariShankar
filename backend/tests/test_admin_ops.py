from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.models import StaffUser
from app.models.enums import StaffRole
from app.security import hash_pin
from tests.conftest import login
from tests.test_app_flow import app_login

IST = ZoneInfo("Asia/Kolkata")
LAYOUT = {
    "rows": [
        {"label": "A", "class_name": "Second class", "seats": 6, "aisles_after": [3]},
        {"label": "B", "class_name": "Second class", "seats": 6, "aisles_after": [3]},
        {"label": "C", "class_name": "First class", "seats": 6, "aisles_after": [3]},
        {"label": "D", "class_name": "Balcony", "seats": 4, "indent": 1},
    ]
}


@pytest.fixture
def setup_hall(client, owner):
    """Owner logs in, saves a layout, adds a movie. Returns (headers, layout, movie)."""
    h = login(client)
    r = client.put("/api/admin/layout", headers=h, json=LAYOUT)
    assert r.status_code == 200, r.text
    m = client.post("/api/admin/movies", headers=h, json={
        "title": "Godavari Express", "language": "Telugu", "certificate": "UA", "runtime_min": 150,
        "status": "now_showing"}).json()
    return h, r.json(), m


def class_ids(client, h):
    seatmap = client.get("/api/admin/seatmap", headers=h).json()
    return {c["name"]: c["id"] for c in seatmap["classes"]}, seatmap


def make_shows(client, h, movie_id, times=("14:30",), days_ahead=1):
    ids, _ = class_ids(client, h)
    day = (datetime.now(IST) + timedelta(days=days_ahead)).date().isoformat()
    prices = {ids["Second class"]: 8000, ids["First class"]: 15000, ids["Balcony"]: 20000}
    r = client.post("/api/admin/shows", headers=h, json={
        "movie_id": movie_id, "dates": [day], "times": list(times), "prices": prices})
    assert r.status_code == 201, r.text
    return r.json(), day


def test_layout_round_trip(client, setup_hall):
    _, layout, _ = setup_hall
    assert layout["total_seats"] == 22
    assert layout["classes"] == ["Second class", "First class", "Balcony"]
    assert layout["rows"][0]["aisles_after"] == [3]
    assert layout["rows"][3]["indent"] == 1


def test_create_week_skips_overlaps(client, setup_hall):
    h, _, movie = setup_hall
    # 14:30 + 150 min + 15 interval ends 17:15; 17:00 overlaps, 18:30 is fine
    out, day = make_shows(client, h, movie["id"], times=("14:30", "17:00", "18:30"))
    assert out["created"] == 2
    assert [s["time"] for s in out["skipped"]] == ["17:00"]
    shows = client.get(f"/api/admin/shows?start={day}&days=1", headers=h).json()
    assert [s["label"] for s in shows] == ["Matinee", "First show"]
    assert shows[0]["seats_total"] == 22


def test_shows_need_every_price(client, setup_hall):
    h, _, movie = setup_hall
    ids, _ = class_ids(client, h)
    day = (datetime.now(IST) + timedelta(days=2)).date().isoformat()
    r = client.post("/api/admin/shows", headers=h, json={
        "movie_id": movie["id"], "dates": [day], "times": ["11:00"], "prices": {ids["First class"]: 100}})
    assert r.status_code == 400


def test_block_seat_stops_sale_then_unblock(client, db, setup_hall):
    h, _, movie = setup_hall
    make_shows(client, h, movie["id"])
    show = client.get("/api/admin/shows?days=3", headers=h).json()[0]
    _, seatmap = class_ids(client, h)
    a1 = next(s for s in seatmap["seats"] if s["row"] == "A" and s["number"] == 1)

    r = client.post("/api/admin/blocks", headers=h, json={"seat_ids": [a1["id"]], "show_id": show["id"], "reason": "Guests"})
    assert r.json()["blocked"] == 1

    ch = app_login(client, db, "9876511111")
    r = client.post("/api/app/bookings", headers=ch, json={"show_id": show["id"], "seat_ids": [a1["id"]], "name": "X"})
    assert r.status_code == 409

    client.post("/api/admin/blocks/release", headers=h, json={"seat_ids": [a1["id"]], "show_id": show["id"]})
    r = client.post("/api/app/bookings", headers=ch, json={"show_id": show["id"], "seat_ids": [a1["id"]], "name": "X"})
    assert r.status_code == 201


def test_block_all_upcoming_shows(client, setup_hall):
    h, _, movie = setup_hall
    make_shows(client, h, movie["id"], times=("11:00", "18:30"))
    _, seatmap = class_ids(client, h)
    row_b = [s["id"] for s in seatmap["seats"] if s["row"] == "B"]
    assert client.post("/api/admin/blocks", headers=h, json={"seat_ids": row_b, "reason": "Repair"}).json()["blocked"] == 6
    for show in client.get("/api/admin/shows?days=3", headers=h).json():
        assert show["seats_blocked"] == 6


def test_cancel_show_refunds_everyone(client, db, setup_hall):
    h, _, movie = setup_hall
    make_shows(client, h, movie["id"])
    show = client.get("/api/admin/shows?days=3", headers=h).json()[0]
    _, seatmap = class_ids(client, h)
    c1 = next(s for s in seatmap["seats"] if s["row"] == "C" and s["number"] == 1)

    ch = app_login(client, db, "9876522222")
    bid = client.post("/api/app/bookings", headers=ch, json={
        "show_id": show["id"], "seat_ids": [c1["id"]], "name": "Ravi"}).json()["booking_id"]
    client.post(f"/api/app/dev/bookings/{bid}/pay", headers=ch, json={})

    r = client.post(f"/api/admin/shows/{show['id']}/cancel", headers=h, json={"reason": "Power cut"})
    assert r.json()["bookings_refunded"] == 1 and r.json()["amount_refunded_paise"] > 0
    t = client.get(f"/api/app/bookings/{bid}", headers=ch).json()
    assert t["status"] == "refunded" and t["failure_reason"] == "show_cancelled"
    # Cancelled shows can't be booked
    assert client.post("/api/app/bookings", headers=ch, json={
        "show_id": show["id"], "seat_ids": [c1["id"]], "name": "Ravi"}).status_code == 409


def test_layout_refuses_removing_sold_seat(client, db, setup_hall):
    h, _, movie = setup_hall
    make_shows(client, h, movie["id"])
    show = client.get("/api/admin/shows?days=3", headers=h).json()[0]
    _, seatmap = class_ids(client, h)
    d4 = next(s for s in seatmap["seats"] if s["row"] == "D" and s["number"] == 4)
    ch = app_login(client, db, "9876533333")
    bid = client.post("/api/app/bookings", headers=ch, json={
        "show_id": show["id"], "seat_ids": [d4["id"]], "name": "A"}).json()["booking_id"]
    client.post(f"/api/app/dev/bookings/{bid}/pay", headers=ch, json={})

    smaller = {"rows": [*LAYOUT["rows"][:3], {"label": "D", "class_name": "Balcony", "seats": 3}]}
    r = client.put("/api/admin/layout", headers=h, json=smaller)
    assert r.status_code == 409 and "D4" in r.json()["detail"]


def test_search_and_manual_refund_owner_only(client, db, setup_hall, theatre):
    h, _, movie = setup_hall
    make_shows(client, h, movie["id"])
    show = client.get("/api/admin/shows?days=3", headers=h).json()[0]
    _, seatmap = class_ids(client, h)
    a2 = next(s for s in seatmap["seats"] if s["row"] == "A" and s["number"] == 2)
    ch = app_login(client, db, "9876544444")
    b = client.post("/api/app/bookings", headers=ch, json={
        "show_id": show["id"], "seat_ids": [a2["id"]], "name": "Lakshmi Devi"}).json()
    client.post(f"/api/app/dev/bookings/{b['booking_id']}/pay", headers=ch, json={})

    for q in (b["code"], "lakshmi", "44444"):
        found = client.get(f"/api/admin/bookings?q={q}", headers=h).json()
        assert [x["code"] for x in found] == [b["code"]], q

    db.add(StaffUser(theatre_id=theatre.id, name="Mgr", mobile="9222200000", pin_hash=hash_pin("582913"),
                     role=StaffRole.manager, must_change_pin=False))
    db.commit()
    mh = login(client, mobile="9222200000", pin="582913")
    assert client.post(f"/api/admin/bookings/{b['booking_id']}/refund", headers=mh,
                       json={"reason": "Customer unwell"}).status_code == 403
    r = client.post(f"/api/admin/bookings/{b['booking_id']}/refund", headers=h, json={"reason": "Customer unwell"})
    assert r.json()["status"] == "refunded"
    # Seat is free again
    seats = client.get(f"/api/app/shows/{show['id']}/seats").json()["seats"]
    assert next(s for s in seats if s["id"] == a2["id"])["state"] == "free"


def test_gate_staff_cannot_manage(client, db, setup_hall, theatre):
    db.add(StaffUser(theatre_id=theatre.id, name="Gate", mobile="9333300000", pin_hash=hash_pin("582913"),
                     role=StaffRole.gate, must_change_pin=False))
    db.commit()
    gh = login(client, mobile="9333300000", pin="582913")
    assert client.get("/api/admin/movies", headers=gh).status_code == 403
    assert client.put("/api/admin/layout", headers=gh, json=LAYOUT).status_code == 403
    assert client.get("/api/admin/today", headers=gh).status_code == 403


def test_today(client, setup_hall):
    h, _, _ = setup_hall
    t = client.get("/api/admin/today", headers=h).json()
    assert t["setup"]["layout"] and t["setup"]["movies"] and not t["setup"]["staff"]
