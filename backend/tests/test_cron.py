from app.config import Settings, get_settings
from app.models import Booking
from tests.test_app_flow import app_login, hall  # noqa: F401  (fixture)
from tests.test_refunds_and_expiry import age, start


def test_tick_needs_the_secret_and_does_the_workers_job(client, db, owner, hall, monkeypatch):  # noqa: F811
    show, seats = hall
    h = app_login(client, db, "9876500901")
    bid = start(client, h, show, [seats["A1"]])
    age(db, bid, get_settings().payment_window_minutes + 1)

    monkeypatch.setattr(get_settings(), "cron_secret", "")  # not set up: closed, even to an empty secret
    assert client.get("/api/cron/tick").status_code == 401
    assert client.get("/api/cron/tick", headers={"Authorization": "Bearer "}).status_code == 401

    monkeypatch.setattr(get_settings(), "cron_secret", "s3cret")
    assert client.get("/api/cron/tick").status_code == 401
    assert client.get("/api/cron/tick", headers={"Authorization": "Bearer wrong"}).status_code == 401
    db.expire_all()
    assert db.get(Booking, bid).status.value == "payment_pending"

    assert client.get("/api/cron/tick", headers={"Authorization": "Bearer s3cret"}).status_code == 200
    db.expire_all()
    assert db.get(Booking, bid).failure_reason == "expired"


def settings(**values):
    return Settings(_env_file=None, jwt_secret="x", **values)


def test_hosted_postgres_urls_get_the_driver_named():
    want = "postgresql+psycopg://u:p@host/db?sslmode=require"
    assert settings(database_url="postgres://u:p@host/db?sslmode=require").database_url == want
    assert settings(database_url="postgresql://u:p@host/db?sslmode=require").database_url == want
    assert settings(database_url=want).database_url == want


def test_never_development_on_vercel(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)
    assert settings(app_env="development").is_dev
    monkeypatch.setenv("VERCEL", "1")
    assert not settings(app_env="development").is_dev
