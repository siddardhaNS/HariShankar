from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models import Booking, Customer, PushToken, Show
from tests.test_app_flow import app_login, hall  # noqa: F401  (fixture)


def _book_and_pay(client, h, show, seat):
    r = client.post("/api/app/bookings", headers=h,
                    json={"show_id": str(show.id), "seat_ids": [str(seat.id)], "name": "Ravi"})
    assert r.status_code == 201, r.text
    bid = r.json()["booking_id"]
    assert client.post(f"/api/app/dev/bookings/{bid}/pay", headers=h, json={"method": "upi"}).json()["status"] == "confirmed"
    return bid


def test_delete_account_wipes_details_and_keeps_the_sale(client, db, hall):
    show, seats = hall
    h = app_login(client, db, "9876500041")
    client.patch("/api/app/me", headers=h, json={"name": "Ravi", "gender": "male", "offers_opt_in": True})
    client.post("/api/app/push-tokens", headers=h, json={"token": "ExponentPushToken[abc]", "platform": "android"})
    bid = _book_and_pay(client, h, show, seats["B2"])

    # A ticket for a show still to come: not yet
    r = client.delete("/api/app/me", headers=h)
    assert r.status_code == 409 and "hasn't happened yet" in r.json()["detail"]

    # After the show it can go
    db.get(Show, show.id).starts_at = datetime.now(UTC) - timedelta(hours=3)
    db.commit()
    assert client.delete("/api/app/me", headers=h).status_code == 204

    db.expire_all()
    gone = db.scalar(select(Customer).where(Customer.deleted_at.is_not(None)))
    assert gone.mobile.startswith("del") and gone.name == "" and gone.gender is None and not gone.offers_opt_in
    assert db.scalar(select(PushToken).where(PushToken.customer_id == gone.id)) is None
    booking = db.get(Booking, bid)
    assert booking.customer_name == "" and booking.total_paise > 0  # the sale stays for the accounts

    # The old login stops working; the number can start a fresh account
    assert client.get("/api/app/me", headers=h).status_code == 401
    h2 = app_login(client, db, "9876500041")
    me = client.get("/api/app/me", headers=h2).json()
    assert me["id"] != str(gone.id) and me["name"] == ""
    assert client.get("/api/app/bookings", headers=h2).json() == []


def test_delete_needs_a_login(client):
    assert client.delete("/api/app/me").status_code == 401
