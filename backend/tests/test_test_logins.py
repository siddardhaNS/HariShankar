import os
import subprocess

from sqlalchemy import inspect

from app import migrate
from app.config import get_settings
from tests.conftest import engine, login


def test_owner_adds_a_tester_who_can_log_in_without_sms(client, owner, monkeypatch):
    monkeypatch.setattr(get_settings(), "app_env", "production")  # no SMS sender
    monkeypatch.setattr(get_settings(), "otp_test_logins", "")
    h = login(client)

    assert client.post("/api/app/auth/otp", json={"mobile": "9876500921"}).status_code == 503

    r = client.post("/api/admin/test-logins", json={"name": "Ravi", "mobile": "9876500921"}, headers=h)
    assert r.status_code == 201, r.text
    added = r.json()
    assert len(added["code"]) == 6 and added["code"].isdigit()
    assert client.post("/api/admin/test-logins", json={"name": "Again", "mobile": "9876500921"}, headers=h).status_code == 409
    assert [t["mobile"] for t in client.get("/api/admin/test-logins", headers=h).json()] == ["9876500921"]

    assert client.post("/api/app/auth/otp", json={"mobile": "9876500921"}).status_code == 200
    assert client.post("/api/app/auth/verify", json={"mobile": "9876500921", "code": added["code"]}).status_code == 200

    assert client.delete(f"/api/admin/test-logins/{added['id']}", headers=h).status_code == 204
    assert client.post("/api/app/auth/otp", json={"mobile": "9876500921"}).status_code == 503


def test_only_owners_manage_test_logins(client, db, owner, theatre):
    from app.models import StaffUser
    from app.models.enums import StaffRole
    from app.security import hash_pin

    db.add(StaffUser(theatre_id=theatre.id, name="Mgr", mobile="9000000002", pin_hash=hash_pin("135790"), role=StaffRole.manager))
    db.commit()
    h = login(client, "9000000002", "135790")
    assert client.get("/api/admin/test-logins", headers=h).status_code == 403
    assert client.post("/api/admin/test-logins", json={"name": "X", "mobile": "9876500922"}, headers=h).status_code == 403


def test_start_up_migration_brings_the_database_to_head(monkeypatch):
    test_db = os.environ["TEST_DATABASE_URL"]
    alembic_env = {**os.environ, "ALEMBIC_DATABASE_URL": test_db}
    # Back to the revision before test_logins (a fixed point, so later migrations don't matter)
    subprocess.run(["alembic", "downgrade", "b7d4e2a9c1f3"], check=True, env=alembic_env)
    try:
        assert "test_logins" not in inspect(engine).get_table_names()

        import app.db

        monkeypatch.setattr(app.db, "engine", engine)
        monkeypatch.setenv("MIGRATE_ON_START", "1")
        monkeypatch.setitem(migrate.status, "migrations", "not run")
        migrate.run_on_start()
        assert migrate.status["migrations"] == "ok"
        assert "test_logins" in inspect(engine).get_table_names()

        migrate.run_on_start()  # already at head: nothing to do
        assert migrate.status["migrations"] == "ok"
    finally:
        # Whatever happened, leave the database at head for the other tests
        subprocess.run(["alembic", "upgrade", "head"], check=True, env=alembic_env)


def test_start_up_migration_runs_on_vercel_production_only(monkeypatch):
    monkeypatch.delenv("VERCEL_ENV", raising=False)
    monkeypatch.delenv("MIGRATE_ON_START", raising=False)
    assert not migrate.should_run()
    monkeypatch.setenv("VERCEL_ENV", "preview")  # shares the live database
    assert not migrate.should_run()
    monkeypatch.setenv("VERCEL_ENV", "production")
    assert migrate.should_run()
