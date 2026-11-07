from datetime import UTC, datetime, timedelta

from app.models import Show
from tests.conftest import login
from tests.test_app_flow import app_login, hall  # noqa: F401  (fixture)


def paid(client, db, show, seats, mobile):
    h = app_login(client, db, mobile)
    bid = client.post("/api/app/bookings", headers=h, json={
        "show_id": str(show.id), "seat_ids": [str(s.id) for s in seats], "name": "X"}).json()["booking_id"]
    client.post(f"/api/app/dev/bookings/{bid}/pay", headers=h, json={})
    return h, bid


def move(db, show, starts_at):
    s = db.get(Show, show.id)
    s.starts_at = starts_at
    db.commit()


def test_rate_after_the_show_and_average_shows_after_five(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    people = [paid(client, db, show, [seats[f"A{i}"]], f"98765005{i:02d}") for i in range(1, 6)]
    h, bid = people[0]

    # Before the show: can't rate
    t = client.get(f"/api/app/bookings/{bid}", headers=h).json()
    assert t["can_rate"] is False and t["rating"] is None
    assert client.put(f"/api/app/bookings/{bid}/rating", headers=h, json={"stars": 5}).status_code == 409

    move(db, show, datetime.now(UTC) - timedelta(hours=4))  # 154 min movie, over now
    t = client.put(f"/api/app/bookings/{bid}/rating", headers=h, json={"stars": 3, "comment": " Good songs "}).json()
    assert t["rating"] == {"stars": 3, "comment": "Good songs"} and t["can_rate"] is True
    t = client.put(f"/api/app/bookings/{bid}/rating", headers=h, json={"stars": 4, "comment": "Good songs"}).json()
    assert t["rating"]["stars"] == 4  # changed, not a second rating

    for h2, b2 in people[1:]:
        client.put(f"/api/app/bookings/{b2}/rating", headers=h2, json={"stars": 5})

    # Owner sees it in Insights
    d = show.starts_at.date()
    r = client.get("/api/admin/insights", headers=login(client),
                   params={"start": str(d - timedelta(days=2)), "end": str(d + timedelta(days=1))}).json()
    assert r["movies"][0]["rating"] == 4.8 and r["movies"][0]["ratings"] == 5
    assert {b["label"]: b["value"] for b in r["stars"]}["5"] == 4
    assert r["comments"][0]["comment"] == "Good songs"


def test_average_hidden_below_five(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    h, bid = paid(client, db, show, [seats["B1"]], "9876500601")
    move(db, show, datetime.now(UTC) - timedelta(hours=4))
    client.put(f"/api/app/bookings/{bid}/rating", headers=h, json={"stars": 5})
    from app.services import ratings
    from app.models import Movie
    from app.routers.app_catalog import movie_out
    m = db.get(Movie, show.movie_id)
    out = movie_out(m, ratings.averages(db, {m.id}))
    assert out.rating is None and out.rating_count == 0


def test_too_late_and_bad_stars(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    h, bid = paid(client, db, show, [seats["B2"]], "9876500611")
    move(db, show, datetime.now(UTC) - timedelta(days=20))
    assert client.put(f"/api/app/bookings/{bid}/rating", headers=h, json={"stars": 4}).status_code == 409
    assert client.put(f"/api/app/bookings/{bid}/rating", headers=h, json={"stars": 6}).status_code == 422
