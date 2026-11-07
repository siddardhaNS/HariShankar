from datetime import datetime, time, timedelta

import httpx
from sqlalchemy import select

from app.models import Customer, Message, PushToken
from app.services import push, whatsapp
from tests.conftest import login
from tests.test_app_flow import app_login, hall  # noqa: F401  (fixture)
from tests.test_whatsapp import IST, Capture, paid

TOKEN = "ExponentPushToken[abcDEF123456789xyz]"


class PushCapture:
    def __init__(self, gone=()):
        self.sent: list[tuple[list[str], str, str, dict]] = []
        self.gone = list(gone)

    def send(self, tokens, title, body, data):
        self.sent.append((tokens, title, body, data))
        live = [t for t in tokens if t not in self.gone]
        return push.PushResult(ids=[f"p-{i}" for i, _ in enumerate(live)], gone=[t for t in tokens if t in self.gone])


def test_register_token_then_booking_goes_on_both_channels(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    h = app_login(client, db, "9876500801")
    assert client.post("/api/app/push-tokens", headers=h, json={"token": "not a token"}).status_code == 422
    assert client.post("/api/app/push-tokens", headers=h, json={"token": TOKEN}).status_code == 204
    assert client.post("/api/app/push-tokens", headers=h, json={"token": TOKEN}).status_code == 204  # again: still one
    assert db.scalar(select(PushToken).where(PushToken.token == TOKEN)) is not None

    _, bid = paid(client, db, show, [seats["A1"]], "9876500801")
    assert sorted((m.kind, m.channel) for m in db.scalars(select(Message))) == [
        ("booking_confirmed", "push"), ("booking_confirmed", "whatsapp")]

    wa, pc = Capture(), PushCapture()
    assert whatsapp.send_due(db, wa, push_sender=pc) == 2
    db.commit()
    tokens, title, body, data = pc.sent[0]
    assert tokens == [TOKEN] and title == "Tickets booked" and "Seats: A1" in body
    assert data == {"kind": "booking_confirmed", "booking_id": bid}
    assert len(wa.sent) == 1


def test_logout_and_dead_token_stop_notifications(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    h = app_login(client, db, "9876500802")
    client.post("/api/app/push-tokens", headers=h, json={"token": TOKEN})
    paid(client, db, show, [seats["A2"]], "9876500802")
    # The push service says the app is gone: the token is turned off, nothing counted as sent
    whatsapp.send_due(db, Capture(), push_sender=PushCapture(gone=[TOKEN]))
    db.commit()
    db.expire_all()
    assert db.scalar(select(PushToken).where(PushToken.token == TOKEN)).disabled_at is not None
    assert db.scalar(select(Message).where(Message.channel == "push")).status == "skipped"

    # Logging in again turns it back on; logging out turns it off
    client.post("/api/app/push-tokens", headers=h, json={"token": TOKEN})
    db.expire_all()
    assert db.scalar(select(PushToken).where(PushToken.token == TOKEN)).disabled_at is None
    client.post("/api/app/push-tokens/remove", headers=h, json={"token": TOKEN})
    db.expire_all()
    assert db.scalar(select(PushToken).where(PushToken.token == TOKEN)).disabled_at is not None


def test_phone_moves_to_whoever_logged_in_last(client, db, owner, hall):  # noqa: F811
    a = app_login(client, db, "9876500803")
    b = app_login(client, db, "9876500804")
    client.post("/api/app/push-tokens", headers=a, json={"token": TOKEN})
    client.post("/api/app/push-tokens", headers=b, json={"token": TOKEN})
    owner_of = db.scalar(select(PushToken.customer_id).where(PushToken.token == TOKEN))
    assert owner_of == db.scalar(select(Customer.id).where(Customer.mobile == "9876500804"))


def test_offer_as_app_notification_only_reaches_people_with_the_app(client, db, owner, hall):  # noqa: F811
    show, seats = hall
    ha, _ = paid(client, db, show, [seats["B1"]], "9876500811")
    paid(client, db, show, [seats["B2"]], "9876500812")
    for c in db.scalars(select(Customer)):
        c.offers_opt_in = True
    db.commit()
    client.post("/api/app/push-tokens", headers=ha, json={"token": TOKEN})
    h = login(client)

    sizes = {a["audience"]: (a["customers"], a["with_app"]) for a in client.get("/api/admin/messages/audience", headers=h).json()}
    assert sizes["all"] == (2, 1)

    noon = datetime.combine(datetime.now(IST).date() + timedelta(days=1), time(12, 0), IST)
    r = client.post("/api/admin/messages/campaigns", headers=h, json={
        "title": "App offer", "body": "Matinee tickets 30 off this week", "channel": "push", "send_after": noon.isoformat()})
    assert r.status_code == 201 and r.json()["recipients"] == 1 and r.json()["channel"] == "push"
    r = client.post("/api/admin/messages/campaigns", headers=h, json={
        "title": "Both offer", "body": "Festival show on Sunday night", "channel": "both", "send_after": noon.isoformat()})
    assert r.json()["recipients"] == 2

    wa, pc = Capture(), PushCapture()
    whatsapp.send_due(db, wa, now=noon, push_sender=pc)
    db.commit()
    pushed = [(title, body) for _, title, body, _ in pc.sent if "Matinee" in body or "Festival" in body]
    assert sorted(b for _, b in pushed) == ["Festival show on Sunday night", "Matinee tickets 30 off this week"]
    assert all(t == "Test Palace" for t, _ in pushed)  # offers are titled with the theatre's name, no WhatsApp footer
    assert len([b for _, b in wa.sent if "Festival" in b]) == 2 and not [b for _, b in wa.sent if "Matinee" in b]


def test_expo_sender_reads_tickets():
    def handler(request: httpx.Request) -> httpx.Response:
        sent = request.read()
        assert b'"title":"Hi"' in sent.replace(b" ", b"")
        return httpx.Response(200, json={"data": [
            {"status": "ok", "id": "r1"},
            {"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}},
        ]})

    sender = push.ExpoPushSender(client=httpx.Client(transport=httpx.MockTransport(handler)))
    res = sender.send(["ExponentPushToken[a1]", "ExponentPushToken[b2]"], "Hi", "Body", {})
    assert res.ids == ["r1"] and res.gone == ["ExponentPushToken[b2]"] and res.errors == []
