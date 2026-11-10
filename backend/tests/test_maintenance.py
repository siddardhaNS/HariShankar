from app.models import StaffUser
from app.models.enums import StaffRole
from app.security import hash_pin
from tests.conftest import login

PW = "projector-42"


def test_off_by_default_and_needs_a_password(client, db, owner, theatre):
    h = login(client)
    m = client.get("/api/admin/maintenance", headers=h).json()
    assert m["on"] is False and m["password_set"] is False
    assert client.get("/api/app/status").json() == {"maintenance": False, "message": ""}

    # No password yet: the switch refuses
    r = client.post("/api/admin/maintenance", headers=h, json={"on": True, "password": "anything"})
    assert r.status_code == 409

    # Too short, then set
    assert client.put("/api/admin/maintenance/password", headers=h, json={"new": "short"}).status_code == 422
    assert client.put("/api/admin/maintenance/password", headers=h, json={"new": PW}).json()["password_set"] is True
    # Changing it needs the current one
    assert client.put("/api/admin/maintenance/password", headers=h,
                      json={"current": "wrong-one", "new": "another-pass"}).status_code == 403


def test_turn_on_closes_customer_app_but_not_gate(client, db, owner, theatre):
    h = login(client)
    client.put("/api/admin/maintenance/password", headers=h, json={"new": PW})

    r = client.post("/api/admin/maintenance", headers=h,
                    json={"on": True, "message": "Upgrading the projector. Back at 6 PM.", "password": PW})
    assert r.status_code == 200 and r.json()["on"] is True and r.json()["changed_by"] == "Owner"

    assert client.get("/api/app/status").json() == {"maintenance": True, "message": "Upgrading the projector. Back at 6 PM."}
    home = client.get("/api/app/home")
    assert home.status_code == 503 and home.json()["detail"] == {
        "maintenance": True, "message": "Upgrading the projector. Back at 6 PM."}
    assert client.post("/api/app/auth/otp", json={"mobile": "9876500001"}).status_code == 503

    # Staff and gate carry on
    assert client.get("/api/gate/shows", headers=h).status_code == 200
    assert client.get("/api/admin/maintenance", headers=h).status_code == 200

    # Off again; empty message falls back to the default
    off = client.post("/api/admin/maintenance", headers=h, json={"on": False, "message": "", "password": PW}).json()
    assert off["on"] is False and off["message"].startswith("The app is down for maintenance")
    assert client.get("/api/app/home").status_code == 200


def test_wrong_passwords_lock_the_switch(client, db, owner, theatre):
    h = login(client)
    client.put("/api/admin/maintenance/password", headers=h, json={"new": PW})
    for i in range(4):
        r = client.post("/api/admin/maintenance", headers=h, json={"on": True, "password": "guess"})
        assert r.status_code == 403 and f"{4 - i} more tr" in r.json()["detail"]
    r = client.post("/api/admin/maintenance", headers=h, json={"on": True, "password": "guess"})
    assert r.status_code == 429
    # Even the right password waits out the lock
    r = client.post("/api/admin/maintenance", headers=h, json={"on": True, "password": PW})
    assert r.status_code == 429
    assert client.get("/api/admin/maintenance", headers=h).json()["locked_until"] is not None
    assert client.get("/api/app/status").json()["maintenance"] is False


def test_manager_can_switch_but_not_set_password(client, db, owner, theatre):
    h = login(client)
    client.put("/api/admin/maintenance/password", headers=h, json={"new": PW})
    db.add(StaffUser(theatre_id=theatre.id, name="Mgr", mobile="9222200001", pin_hash=hash_pin("582913"),
                     role=StaffRole.manager, must_change_pin=False))
    db.commit()
    mh = login(client, mobile="9222200001", pin="582913")
    assert client.post("/api/admin/maintenance", headers=mh, json={"on": True, "password": PW}).json()["on"] is True
    assert client.put("/api/admin/maintenance/password", headers=mh,
                      json={"current": PW, "new": "manager-pass"}).status_code == 403
