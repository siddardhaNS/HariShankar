import os
import subprocess

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

TEST_DB = os.environ["TEST_DATABASE_URL"]
os.environ["PAYMENT_GATEWAY"] = "fake"  # instant test payments; direct-UPI tests switch it per test

from app.db import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Screen, StaffUser, Theatre  # noqa: E402
from app.models.enums import StaffRole  # noqa: E402
from app.security import hash_pin  # noqa: E402

engine = create_engine(TEST_DB)
TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

OWNER_MOBILE = "9000000001"
OWNER_PIN = "246810"


@pytest.fixture(scope="session", autouse=True)
def migrated():
    with engine.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    subprocess.run(
        ["alembic", "upgrade", "head"], check=True, env={**os.environ, "ALEMBIC_DATABASE_URL": TEST_DB}
    )


@pytest.fixture(autouse=True)
def clean(migrated):
    yield
    with engine.begin() as c:
        c.execute(text(
            "TRUNCATE messages, campaigns, entries, ratings, promotions, otp_codes, audit_logs, booking_seats, bookings, seat_blocks, show_prices, shows, movies, "
            "customers, seats, seat_classes, screens, staff_users, theatres CASCADE"
        ))


@pytest.fixture
def db():
    s = TestSession()
    yield s
    s.close()


@pytest.fixture
def client(db):
    def _get_db():
        s = TestSession()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def theatre(db):
    t = Theatre(name="Test Palace", slug="test-palace", city="Palasa")
    db.add(t)
    db.flush()
    db.add(Screen(theatre_id=t.id))
    db.commit()
    return t


@pytest.fixture
def owner(db, theatre):
    u = StaffUser(
        theatre_id=theatre.id, name="Owner", mobile=OWNER_MOBILE,
        pin_hash=hash_pin(OWNER_PIN), role=StaffRole.owner,
    )
    db.add(u)
    db.commit()
    return u


def login(client, mobile=OWNER_MOBILE, pin=OWNER_PIN):
    r = client.post("/api/admin/auth/login", json={"mobile": mobile, "pin": pin})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
