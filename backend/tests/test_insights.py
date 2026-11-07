import io
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.models import Booking, Message, Show
from app.services import insights
from tests.conftest import login
from tests.test_app_flow import hall  # noqa: F401  (fixture)
from tests.test_reports import paid, rng
from tests.test_whatsapp import Capture

IST = ZoneInfo("Asia/Kolkata")


def test_fuller_insights(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    paid(client, db, show, [seats["A1"], seats["A2"]], "9876500901")
    paid(client, db, show, [seats["A3"]], "9876500901")
    paid(client, db, show, [seats["B1"]], "9876500902")

    r = client.get("/api/admin/insights", headers=login(client), params=rng(show)).json()
    assert sum(b["value"] for b in r["booking_hour"]) == 3
    assert sum(b["value"] for b in r["booking_weekday"]) == 3
    assert r["summary"]["same_day_bookings"] == 0  # the show is tomorrow
    slot = next(x for x in r["slot_week"] if x["weekday_shows"] + x["weekend_shows"] == 1)
    assert max(slot["weekday"], slot["weekend"]) == 33  # 4 of 12 seats
    assert r["sell_outs"] == []
    assert r["movie_weeks"][0]["weeks"][0] == {"week": 1, "shows": 1, "seats_sold": 4, "occupancy": 33,
                                              "collected_paise": r["movies"][0]["collected_paise"]}
    assert r["class_demand"][0]["name"] == "First class" and r["class_demand"][0]["seats_sold"] == 4
    rows = {b["label"]: b["value"] for b in r["row_demand"]}
    assert rows == {"A": 50, "B": 17}
    assert [x["sold"] for x in r["rarely_sold"]][:8] == [0] * 8 and len(r["rarely_sold"]) == 12  # 8 unsold first
    assert {b["label"]: b["value"] for b in r["visits"]} == {"Once": 1, "2 times": 1, "3 to 5 times": 0, "6 or more": 0}
    assert r["regulars"] == [{"name": "X", "mobile_end": "0901", "bookings": 2, "last_booked": r["regulars"][0]["last_booked"]}]
    assert r["payments"]["methods"][0]["value"] == 3 and r["payments"]["seat_clashes"] == 0


def test_filters(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    paid(client, db, show, [seats["A1"]], "9876500911")
    h = login(client)
    label = r = client.get("/api/admin/insights", headers=h, params=rng(show)).json()
    label = next(x["slot"] for x in r["slot_week"] if x["weekday_shows"] + x["weekend_shows"])
    other = next(x["slot"] for x in r["slot_week"] if x["slot"] != label)
    assert client.get("/api/admin/insights", headers=h, params={**rng(show), "slot": label}).json()["summary"]["shows"] == 1
    assert client.get("/api/admin/insights", headers=h, params={**rng(show), "slot": other}).json()["summary"]["shows"] == 0
    assert client.get("/api/admin/insights", headers=h, params={**rng(show), "slot": "Midnight"}).status_code == 422
    assert client.get("/api/admin/insights", headers=h, params={
        **rng(show), "movie_id": str(show.movie_id)}).json()["summary"]["seats_sold"] == 1
    cls = seats["A1"].seat_class_id
    by_class = client.get("/api/admin/insights", headers=h, params={**rng(show), "class_id": str(cls)}).json()
    assert by_class["summary"]["seats_sold"] == 1 and by_class["movies"][0]["collected_paise"] == 15000  # ticket only


def test_excel_download(client, db, owner, hall):  # noqa: F811
    from openpyxl import load_workbook

    show, seats = hall
    paid(client, db, show, [seats["A1"], seats["A2"]], "9876500921")
    res = client.get("/api/admin/insights.xlsx", headers=login(client), params=rng(show))
    assert res.status_code == 200 and "spreadsheetml" in res.headers["content-type"]
    wb = load_workbook(io.BytesIO(res.content))
    assert {"Summary", "Show times", "Movies by week", "Classes", "Payments"} <= set(wb.sheetnames)
    assert wb["Movies"]["A2"].value == "Godavari Express" and wb["Movies"]["C2"].value == 2


def test_monday_summary_goes_to_the_owner_once(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    paid(client, db, show, [seats["A1"]], "9876500931")
    # Put the show in last week, so a Monday "now" covers it
    s = db.get(Show, show.id)
    today = datetime.now(IST).date()
    last_monday = today - timedelta(days=today.weekday() + 7)
    s.starts_at = datetime.combine(last_monday + timedelta(days=2), time(18, 30), IST)
    db.commit()
    monday_9 = datetime.combine(last_monday + timedelta(days=7), time(9, 5), IST)

    assert insights.queue_weekly_summaries(db, now=monday_9 - timedelta(hours=1)) == 0  # before 9 AM
    assert insights.queue_weekly_summaries(db, now=monday_9) == 1
    assert insights.queue_weekly_summaries(db, now=monday_9 + timedelta(hours=2)) == 0  # once a week
    db.commit()
    m = db.scalar(select(Message).where(Message.kind == "weekly_summary"))
    assert m.mobile == owner.mobile and m.customer_id is None
    assert "1 tickets" in m.body and "Godavari Express" in m.body

    cap = Capture()
    db.query(Message).filter(Message.kind != "weekly_summary").update({"status": "sent"})
    db.commit()
    from app.services import whatsapp
    assert whatsapp.send_due(db, cap, now=monday_9) == 1
    assert cap.sent[0][0] == owner.mobile
    assert db.scalar(select(Booking.id)) is not None and datetime.now(UTC)
