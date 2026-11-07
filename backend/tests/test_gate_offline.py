import uuid
from datetime import UTC, datetime, timedelta

from tests.conftest import login
from tests.test_app_flow import app_login, hall  # noqa: F401  (fixture)
from tests.test_gate import GATE_MOBILE, GATE_PIN, gate, now_show, open_gate, paid  # noqa: F401  (fixtures)


def entry(bid, count, minutes_ago=1):
    return {"id": str(uuid.uuid4()), "booking_id": bid, "count": count,
            "scanned_at": (datetime.now(UTC) - timedelta(minutes=minutes_ago)).isoformat()}


def test_offline_list_has_todays_bookings(client, db, gate, now_show):
    show, seats = now_show
    t = paid(client, db, show, [seats["A1"], seats["A2"]])
    open_gate(db, show)
    h = login(client, GATE_MOBILE, GATE_PIN)
    o = client.get("/api/gate/offline", headers=h).json()
    assert [s["id"] for s in o["shows"]] == [str(show.id)]
    b = o["bookings"][0]
    assert (b["code"], b["state"], b["seats"], b["seats_total"], b["mobile_last4"]) == (t["code"], "ok", ["A1", "A2"], 2, "0201")
    assert "qr" not in b and "upi_ref" not in str(o)  # nothing beyond what the gate needs


def test_sync_records_once_and_flags_over_admission(client, db, gate, now_show):
    show, seats = now_show
    t = paid(client, db, show, [seats["B1"], seats["B2"]])
    open_gate(db, show)
    h = login(client, GATE_MOBILE, GATE_PIN)
    a = entry(t["id"], 2, 5)
    r = client.post("/api/gate/sync", headers=h, json={"entries": [a]}).json()["results"]
    assert r[0]["result"] == "recorded"
    # The phone retries the same sync (e.g. the reply was lost): recorded once
    assert client.post("/api/gate/sync", headers=h, json={"entries": [a]}).json()["results"][0]["result"] == "already"

    # A second offline phone let the same two in again
    r = client.post("/api/gate/sync", headers=h, json={"entries": [entry(t["id"], 2)]}).json()["results"]
    assert r[0]["result"] == "problem" and r[0]["message"] == "2 more let in than paid for"

    look = client.post("/api/gate/lookup", headers=h, json={"scan": t["code"]}).json()
    assert look["verdict"] == "all_in" and look["seats_admitted"] == 4 and look["seats_left"] == 0
    assert all(e["offline"] for e in look["entries"]) and look["entries"][1]["problem"]


def test_sync_refunded_ticket_and_other_theatre(client, db, gate, owner, now_show):
    show, seats = now_show
    t = paid(client, db, show, [seats["B3"]])
    client.post(f"/api/admin/bookings/{t['id']}/refund", headers=login(client), json={"reason": "Asked to"})
    open_gate(db, show)
    h = login(client, GATE_MOBILE, GATE_PIN)
    o = client.get("/api/gate/offline", headers=h).json()
    assert o["bookings"][0]["state"] == "cancelled" and o["bookings"][0]["message"] == "This ticket was refunded"
    r = client.post("/api/gate/sync", headers=h, json={"entries": [entry(t["id"], 1), entry(str(uuid.uuid4()), 1)]}).json()
    assert [x["result"] for x in r["results"]] == ["problem", "rejected"]
