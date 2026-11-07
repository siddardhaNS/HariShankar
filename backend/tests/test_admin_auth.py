
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models import Booking, BookingSeat, Customer, Movie, Screen, Seat, SeatClass, Show
from app.models.enums import BookingStatus
from tests.conftest import OWNER_MOBILE, OWNER_PIN, login


def test_login_success_and_me(client, owner):
    h = login(client)
    r = client.get("/api/admin/auth/me", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "owner"
    assert body["theatre"]["name"] == "Test Palace"


def test_wrong_pin_and_unknown_mobile_same_message(client, owner):
    a = client.post("/api/admin/auth/login", json={"mobile": OWNER_MOBILE, "pin": "111222"})
    b = client.post("/api/admin/auth/login", json={"mobile": "9876500000", "pin": "111222"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def test_lockout_after_five_wrong_pins(client, owner):
    for _ in range(5):
        client.post("/api/admin/auth/login", json={"mobile": OWNER_MOBILE, "pin": "111222"})
    r = client.post("/api/admin/auth/login", json={"mobile": OWNER_MOBILE, "pin": OWNER_PIN})
    assert r.status_code == 429


def test_me_requires_token(client):
    assert client.get("/api/admin/auth/me").status_code == 401
    assert client.get("/api/admin/auth/me", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_change_pin_revokes_old_token(client, owner):
    h = login(client)
    r = client.post("/api/admin/auth/change-pin", headers=h, json={"current_pin": OWNER_PIN, "new_pin": "582913"})
    assert r.status_code == 200
    assert r.json()["user"]["must_change_pin"] is False
    assert client.get("/api/admin/auth/me", headers=h).status_code == 401
    login(client, pin="582913")


def test_weak_pin_rejected(client, owner):
    h = login(client)
    r = client.post("/api/admin/auth/change-pin", headers=h, json={"current_pin": OWNER_PIN, "new_pin": "123456"})
    assert r.status_code == 422


def test_owner_manages_staff_and_roles_enforced(client, owner):
    h = login(client)
    r = client.post("/api/admin/staff", headers=h,
                    json={"name": "Gate Ravi", "mobile": "9111111111", "role": "gate", "pin": "739104"})
    assert r.status_code == 201, r.text
    gate_id = r.json()["id"]

    # Duplicate mobile
    r = client.post("/api/admin/staff", headers=h,
                    json={"name": "Dup", "mobile": "9111111111", "role": "gate", "pin": "739104"})
    assert r.status_code == 409

    # Gate staff can't manage staff
    gh = login(client, mobile="9111111111", pin="739104")
    assert client.get("/api/admin/staff", headers=gh).status_code == 403

    # Disabling revokes the session and blocks login
    r = client.patch(f"/api/admin/staff/{gate_id}", headers=h, json={"is_active": False})
    assert r.status_code == 200
    assert client.get("/api/admin/auth/me", headers=gh).status_code == 401
    r = client.post("/api/admin/auth/login", json={"mobile": "9111111111", "pin": "739104"})
    assert r.status_code == 403


def test_cannot_create_super_admin_or_disable_self(client, owner):
    h = login(client)
    r = client.post("/api/admin/staff", headers=h,
                    json={"name": "X", "mobile": "9222222222", "role": "super_admin", "pin": "739104"})
    assert r.status_code == 422
    r = client.patch(f"/api/admin/staff/{owner.id}", headers=h, json={"is_active": False})
    assert r.status_code == 400


def test_owner_cannot_see_other_theatre_staff(client, db, owner):
    from app.models import StaffUser, Theatre
    from app.models.enums import StaffRole
    from app.security import hash_pin

    other = Theatre(name="Other", slug="other", city="X")
    db.add(other)
    db.flush()
    stranger = StaffUser(theatre_id=other.id, name="S", mobile="9333333333",
                         pin_hash=hash_pin("739104"), role=StaffRole.gate)
    db.add(stranger)
    db.commit()

    h = login(client)
    mobiles = [s["mobile"] for s in client.get("/api/admin/staff", headers=h).json()]
    assert "9333333333" not in mobiles
    r = client.post(f"/api/admin/staff/{stranger.id}/reset-pin", headers=h, json={"pin": "739104"})
    assert r.status_code == 404


def test_db_refuses_second_confirmed_sale_of_a_seat(db, theatre):
    """The core 'one sale per seat' guarantee lives in the database."""
    screen = db.query(Screen).filter_by(theatre_id=theatre.id).one()
    sc = SeatClass(theatre_id=theatre.id, screen_id=screen.id, name="First class")
    db.add(sc)
    db.flush()
    seat = Seat(theatre_id=theatre.id, screen_id=screen.id, seat_class_id=sc.id,
                row_label="H", number=8, grid_row=8, grid_col=8)
    movie = Movie(theatre_id=theatre.id, title="M", language="Telugu", certificate="UA", runtime_min=150)
    db.add_all([seat, movie])
    db.flush()
    show = Show(theatre_id=theatre.id, screen_id=screen.id, movie_id=movie.id,
                starts_at=db.execute(text("select now()")).scalar())
    db.add(show)
    db.flush()

    def book(code, mobile):
        c = Customer(mobile=mobile)
        db.add(c)
        db.flush()
        b = Booking(theatre_id=theatre.id, code=code, show_id=show.id, customer_id=c.id,
                    status=BookingStatus.confirmed, tickets_paise=15000, booking_fee_paise=2000,
                    gst_paise=360, total_paise=17360)
        db.add(b)
        db.flush()
        db.add(BookingSeat(booking_id=b.id, show_id=show.id, seat_id=seat.id, price_paise=15000, holds_seat=True))
        db.flush()

    book("AAAAAA", "9444444444")
    db.commit()
    with pytest.raises(IntegrityError):
        book("BBBBBB", "9555555555")
    db.rollback()
