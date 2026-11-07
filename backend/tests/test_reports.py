from datetime import timedelta

from app.models import Customer
from app.models.enums import AgeGroup, Gender
from tests.conftest import login
from tests.test_app_flow import app_login, hall  # noqa: F401  (fixture)


def paid(client, db, show, seats, mobile, code=None):
    h = app_login(client, db, mobile)
    body = {"show_id": str(show.id), "seat_ids": [str(s.id) for s in seats], "name": "X",
            **({"promo_code": code} if code else {})}
    bid = client.post("/api/app/bookings", headers=h, json=body).json()["booking_id"]
    return client.post(f"/api/app/dev/bookings/{bid}/pay", headers=h, json={}).json()


def rng(show, days=0):
    d = show.starts_at.date()
    return {"start": str(d - timedelta(days=days)), "end": str(d + timedelta(days=1))}


def test_report_adds_up(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    h = login(client)
    client.post("/api/admin/promotions", headers=h, json={"code": "TEN", "title": "₹10 off", "kind": "per_ticket", "value": 1000})
    paid(client, db, show, [seats["A1"], seats["A2"]], "9876500401")         # 347.20
    paid(client, db, show, [seats["B1"]], "9876500402", code="TEN")           # 150-10 + 20 + 3.60 = 163.60
    refunded = paid(client, db, show, [seats["B2"]], "9876500403")            # 173.60, refunded by owner
    client.post(f"/api/admin/bookings/{refunded['id']}/refund", headers=h, json={"reason": "Customer asked"})

    r = client.get("/api/admin/reports", headers=h, params=rng(show)).json()
    t = r["totals"]
    assert (t["shows"], t["seats_total"], t["bookings"], t["seats_sold"]) == (1, 12, 2, 3)
    assert t["tickets_paise"] == 45000 and t["discount_paise"] == 1000
    assert t["fee_paise"] == 6000 and t["gst_paise"] == 720 + 360
    assert t["collected_paise"] == 34720 + 16360
    assert t["refunded_paise"] == 17360
    assert len(r["days"]) == 1 and r["days"][0]["collected_paise"] == t["collected_paise"]
    assert r["shows"][0]["movie_title"] == "Godavari Express"


def test_insights(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    paid(client, db, show, [seats["A1"], seats["A2"]], "9876500411")
    paid(client, db, show, [seats["A3"]], "9876500411")
    paid(client, db, show, [seats["B1"], seats["B2"], seats["B3"]], "9876500412")
    c = db.query(Customer).filter_by(mobile="9876500412").one()
    c.gender, c.age_group = Gender.female, AgeGroup.a25_34
    db.commit()

    r = client.get("/api/admin/insights", headers=login(client), params=rng(show)).json()
    s = r["summary"]
    assert (s["shows"], s["seats_sold"], s["bookings"], s["customers"]) == (1, 6, 3, 2)
    assert s["occupancy"] == 50 and s["repeat_customers"] == 1 and s["new_customers"] == 2 and s["avg_group"] == 2.0
    assert {b["label"]: b["value"] for b in r["group_size"]} == {"1": 1, "2": 1, "3 to 4": 1, "5 or more": 0}
    assert sum(b["value"] for b in r["lead_time"]) == 3
    assert {b["label"]: b["value"] for b in r["gender"]}["Female"] == 1
    assert {b["label"]: b["value"] for b in r["gender"]}["Not said"] == 1
    assert r["movies"][0]["occupancy"] == 50


def test_owner_only_and_range_checks(client, db, owner):
    h = login(client)
    assert client.get("/api/admin/reports", headers=h).json()["totals"]["shows"] == 0  # defaults work, empty
    assert client.get("/api/admin/reports", headers=h, params={"start": "2026-02-01", "end": "2026-01-01"}).status_code == 422
    assert client.get("/api/admin/insights", headers=h, params={"start": "2024-01-01", "end": "2026-01-01"}).status_code == 422
    client.post("/api/admin/staff", headers=h, json={"name": "Man", "mobile": "9000000005", "role": "manager", "pin": "135790"})
    m = login(client, "9000000005", "135790")
    assert client.get("/api/admin/reports", headers=m).status_code == 403
