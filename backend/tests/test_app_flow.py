from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import Movie, OtpCode, Screen, Seat, SeatClass, Show, ShowPrice
from app.models.enums import MovieStatus
from app.services import otp
from app.services.pricing import price


class CaptureSender:
    def __init__(self):
        self.sent: dict[str, str] = {}

    def send(self, mobile, code):
        self.sent[mobile] = code


@pytest.fixture
def hall(db, theatre):
    """One class, two rows of 6 seats, aisle after seat 3, one show tomorrow."""
    screen = db.scalar(select(Screen).where(Screen.theatre_id == theatre.id))
    cls = SeatClass(theatre_id=theatre.id, screen_id=screen.id, name="First class")
    db.add(cls)
    db.flush()
    for r, row in enumerate("AB", start=1):
        for n in range(1, 7):
            db.add(Seat(theatre_id=theatre.id, screen_id=screen.id, seat_class_id=cls.id, row_label=row,
                        number=n, grid_row=r, grid_col=n + (1 if n > 3 else 0)))
    movie = Movie(theatre_id=theatre.id, title="Godavari Express", language="Telugu", certificate="UA",
                  runtime_min=154, status=MovieStatus.now_showing)
    db.add(movie)
    db.flush()
    show = Show(theatre_id=theatre.id, screen_id=screen.id, movie_id=movie.id,
                starts_at=datetime.now(UTC) + timedelta(days=1))
    db.add(show)
    db.flush()
    db.add(ShowPrice(show_id=show.id, seat_class_id=cls.id, price_paise=15000))
    db.commit()
    seats = {f"{s.row_label}{s.number}": s for s in db.scalars(select(Seat).where(Seat.screen_id == screen.id))}
    return show, seats


def app_login(client, db, mobile="9876500001"):
    sender = CaptureSender()
    otp.request_code(db, mobile, sender)
    r = client.post("/api/app/auth/verify", json={"mobile": mobile, "code": sender.sent[mobile]})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_price_matches_mockup():
    bd = price([15000, 15000], 2000)
    assert (bd.booking_fee_paise, bd.gst_paise, bd.total_paise) == (4000, 720, 34720)


def test_otp_wrong_code_then_lockout(client, db):
    sender = CaptureSender()
    otp.request_code(db, "9876500002", sender)
    wrong = "000000" if sender.sent["9876500002"] != "000000" else "111111"
    for _ in range(5):
        r = client.post("/api/app/auth/verify", json={"mobile": "9876500002", "code": wrong})
        assert r.status_code == 400
    r = client.post("/api/app/auth/verify", json={"mobile": "9876500002", "code": sender.sent["9876500002"]})
    assert r.status_code == 429


def test_otp_send_rate_limit(db):
    sender = CaptureSender()
    for _ in range(5):
        otp.request_code(db, "9876500003", sender)
    with pytest.raises(Exception) as e:
        otp.request_code(db, "9876500003", sender)
    assert getattr(e.value, "status_code", None) == 429
    assert db.scalar(select(OtpCode).where(OtpCode.mobile == "9876500003", OtpCode.consumed.is_(False)))


def test_only_hash_of_code_stored(db):
    sender = CaptureSender()
    otp.request_code(db, "9876500004", sender)
    row = db.scalar(select(OtpCode).where(OtpCode.mobile == "9876500004"))
    assert sender.sent["9876500004"] not in row.code_hash


def test_home_and_seat_map(client, hall):
    show, _ = hall
    home = client.get("/api/app/home").json()
    assert home["now_showing"][0]["movie"]["title"] == "Godavari Express"
    seat_map = client.get(f"/api/app/shows/{show.id}/seats").json()
    assert seat_map["seats_left"] == 12 and seat_map["classes"][0]["price_paise"] == 15000


def test_best_seats_are_side_by_side_not_across_aisle(client, hall):
    show, seats = hall
    groups = client.get(f"/api/app/shows/{show.id}/best-seats?n=3").json()
    for g in groups:
        nums = sorted(int(label[1:]) for label in g["labels"])
        assert nums in ([1, 2, 3], [4, 5, 6])


def test_book_pay_ticket_and_my_tickets(client, db, hall):
    show, seats = hall
    h = app_login(client, db)
    r = client.post("/api/app/bookings", headers=h,
                    json={"show_id": str(show.id), "seat_ids": [str(seats["B2"].id), str(seats["B3"].id)], "name": "Ravi"})
    assert r.status_code == 201, r.text
    bid = r.json()["booking_id"]
    assert r.json()["price"]["total_paise"] == 34720

    # Not in "my tickets" until paid
    assert client.get("/api/app/bookings", headers=h).json() == []

    t = client.post(f"/api/app/dev/bookings/{bid}/pay", headers=h, json={"method": "upi"}).json()
    assert t["status"] == "confirmed" and t["qr"].startswith("HSPP1.")
    assert [s["label"] for s in t["seats"]] == ["B2", "B3"]
    assert len(client.get("/api/app/bookings", headers=h).json()) == 1

    # Someone else can't start a booking for a sold seat; they get nearby seats instead
    h2 = app_login(client, db, "9876500009")
    r = client.post("/api/app/bookings", headers=h2,
                    json={"show_id": str(show.id), "seat_ids": [str(seats["B3"].id)], "name": "X"})
    assert r.status_code == 409 and r.json()["taken"] == ["B3"]
    assert len(r.json()["suggestion"]["labels"]) == 1


def test_two_payments_same_instant_second_is_refunded(client, db, hall):
    """Both customers start while the seats are free; whichever payment is
    confirmed first wins, the other is refunded in full automatically."""
    show, seats = hall
    body = {"show_id": str(show.id), "seat_ids": [str(seats["A1"].id), str(seats["A2"].id)], "name": "A"}
    ha, hb = app_login(client, db, "9876500011"), app_login(client, db, "9876500012")
    a = client.post("/api/app/bookings", headers=ha, json=body).json()["booking_id"]
    b = client.post("/api/app/bookings", headers=hb, json=body).json()["booking_id"]

    ra = client.post(f"/api/app/dev/bookings/{a}/pay", headers=ha, json={}).json()
    rb = client.post(f"/api/app/dev/bookings/{b}/pay", headers=hb, json={}).json()
    assert ra["status"] == "confirmed"
    assert rb["status"] == "refunded" and rb["failure_reason"] == "seat_clash"
    assert rb["refund_paise"] == rb["price"]["total_paise"] and rb["refund_id"]
    assert rb["qr"] is None

    # Webhook retry is harmless
    again = client.post(f"/api/app/dev/bookings/{a}/pay", headers=ha, json={}).json()
    assert again["status"] == "confirmed"


def test_cannot_see_someone_elses_booking(client, db, hall):
    show, seats = hall
    h = app_login(client, db, "9876500021")
    bid = client.post("/api/app/bookings", headers=h, json={
        "show_id": str(show.id), "seat_ids": [str(seats["A6"].id)], "name": "A"}).json()["booking_id"]
    other = app_login(client, db, "9876500022")
    assert client.get(f"/api/app/bookings/{bid}", headers=other).status_code == 404
    assert client.post(f"/api/app/dev/bookings/{bid}/pay", headers=other, json={}).status_code == 404


def test_seat_limit(client, db, hall):
    show, seats = hall
    h = app_login(client, db, "9876500031")
    ids = [str(s.id) for s in seats.values()][:11]
    r = client.post("/api/app/bookings", headers=h, json={"show_id": str(show.id), "seat_ids": ids, "name": "A"})
    assert r.status_code == 422
