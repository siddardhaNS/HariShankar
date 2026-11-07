from datetime import timedelta

from app.models import Show
from tests.conftest import login
from tests.test_app_flow import app_login, hall  # noqa: F401  (fixture)


def promo(client, h, **kw):
    body = {"code": "MATINEE30", "title": "₹30 off every ticket", "kind": "per_ticket", "value": 3000, **kw}
    r = client.post("/api/admin/promotions", headers=h, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def book(client, h, show, seats, code=None):
    return client.post("/api/app/bookings", headers=h, json={
        "show_id": str(show.id), "seat_ids": [str(s.id) for s in seats], "name": "Ravi",
        **({"promo_code": code} if code else {})})


def pay(client, h, bid):
    return client.post(f"/api/app/dev/bookings/{bid}/pay", headers=h, json={}).json()


def test_per_ticket_code_comes_off_tickets_only(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    p = promo(client, login(client))
    assert p["details"] == "₹30 off each ticket"
    ch = app_login(client, db)

    # Listed at checkout, and applying shows the new total
    assert [o["code"] for o in client.get(f"/api/app/shows/{show.id}/offers").json()] == ["MATINEE30"]
    r = client.post("/api/app/promotions/apply", headers=ch, json={
        "show_id": str(show.id), "seat_ids": [str(seats["A1"].id), str(seats["A2"].id)], "code": " matinee30 "})
    assert r.status_code == 200, r.text
    # 2 x 150 - 2 x 30 + fee 40 + GST 7.20 = 287.20
    assert r.json()["discount_paise"] == 6000 and r.json()["price"]["total_paise"] == 28720

    b = book(client, ch, show, [seats["A1"], seats["A2"]], "matinee30").json()
    assert b["price"]["discount_paise"] == 6000 and b["order"]["amount_paise"] == 28720
    pay(client, ch, b["booking_id"])
    listed = client.get("/api/admin/promotions", headers=login(client)).json()[0]
    assert listed["uses"] == 1 and listed["discount_given_paise"] == 6000


def test_once_per_customer_and_total_limit(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    promo(client, login(client), code="FIRST50", kind="percent", value=50, max_discount_paise=5000, max_uses=2)
    a = app_login(client, db, "9876500301")
    b1 = book(client, a, show, [seats["A1"], seats["A2"]], "FIRST50").json()
    assert b1["price"]["discount_paise"] == 5000  # 50% of 300 capped at 50
    pay(client, a, b1["booking_id"])
    again = book(client, a, show, [seats["A3"]], "FIRST50")
    assert again.status_code == 409 and again.json()["detail"] == "You've already used this code"

    b = app_login(client, db, "9876500302")
    pay(client, b, book(client, b, show, [seats["B1"]], "FIRST50").json()["booking_id"])
    c = app_login(client, db, "9876500303")
    full = book(client, c, show, [seats["B2"]], "FIRST50")
    assert full.status_code == 409 and full.json()["detail"] == "This offer has been fully used"
    assert client.get(f"/api/app/shows/{show.id}/offers").json() == []


def test_abandoned_payment_does_not_use_up_the_code(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    promo(client, login(client))
    a = app_login(client, db, "9876500311")
    assert book(client, a, show, [seats["A1"]], "MATINEE30").status_code == 201  # left the payment screen
    assert book(client, a, show, [seats["A1"]], "MATINEE30").status_code == 201  # tries again


def test_rules_min_tickets_weekdays_first_booking_inactive(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    h = login(client)
    ch = app_login(client, db, "9876500321")
    day = show.starts_at.astimezone().weekday()  # theatre is IST; tests run near enough

    promo(client, h, code="GROUP4", min_tickets=4)
    r = book(client, ch, show, [seats["A1"]], "GROUP4")
    assert r.status_code == 409 and r.json()["detail"] == "Book 4 or more tickets to use this code"

    other_days = "".join(str(d) for d in range(7) if d != day and d != (day + 1) % 7 and d != (day - 1) % 7)
    promo(client, h, code="WEEKDAY", weekdays=other_days)
    assert "works on" in book(client, ch, show, [seats["A1"]], "WEEKDAY").json()["detail"]

    first = promo(client, h, code="NEWHERE", first_booking_only=True)
    pay(client, ch, book(client, ch, show, [seats["A1"]]).json()["booking_id"])
    assert book(client, ch, show, [seats["A2"]], "NEWHERE").json()["detail"] == "This code is for your first booking"

    client.patch(f"/api/admin/promotions/{first['id']}", headers=h, json={"is_active": False})
    assert book(client, ch, show, [seats["A2"]], "NEWHERE").json()["detail"] == "This offer has ended"
    assert book(client, ch, show, [seats["A2"]], "NOPE").json()["detail"] == "That code isn't valid"


def test_dates_and_validation(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    h = login(client)
    d = db.get(Show, show.id).starts_at.date()
    promo(client, h, code="LATER", starts_on=str(d + timedelta(days=5)))
    ch = app_login(client, db, "9876500331")
    assert book(client, ch, show, [seats["A1"]], "LATER").json()["detail"].startswith("This offer is for shows from")

    bad = client.post("/api/admin/promotions", headers=h, json={
        "code": "BAD", "title": "Too much", "kind": "percent", "value": 150})
    assert bad.status_code == 422
    dup = client.post("/api/admin/promotions", headers=h, json={
        "code": "later", "title": "Again", "kind": "percent", "value": 10})
    assert dup.status_code == 409
    sym = client.post("/api/admin/promotions", headers=h, json={
        "code": "50%OFF", "title": "Symbols", "kind": "percent", "value": 10})
    assert sym.status_code == 422


def test_gate_staff_cannot_manage_promotions(client, db, owner):
    h = login(client)
    client.post("/api/admin/staff", headers=h, json={"name": "Gate", "mobile": "9000000004", "role": "gate", "pin": "135790"})
    g = login(client, "9000000004", "135790")
    assert client.get("/api/admin/promotions", headers=g).status_code == 403
