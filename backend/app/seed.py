"""Create the Phase 1 theatre, its screen and seat classes, and the first Owner.

Run once:  docker compose exec api python -m app.seed
Safe to re-run: existing rows are left alone.
"""
import os

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Screen, SeatClass, StaffUser, Theatre
from app.models.enums import StaffRole
from app.security import hash_pin

THEATRE_SLUG = "hari-shankar-palasa"


def main() -> None:
    db = SessionLocal()
    try:
        theatre = db.scalar(select(Theatre).where(Theatre.slug == THEATRE_SLUG))
        if theatre is None:
            theatre = Theatre(
                name="Hari Shankar Picture Palace",
                slug=THEATRE_SLUG,
                city="Palasa",
                address="Main Road, Palasa",
            )
            db.add(theatre)
            db.flush()
            screen = Screen(theatre_id=theatre.id, name="Main screen")
            db.add(screen)
            db.flush()
            for i, name in enumerate(["Second class", "First class", "Balcony"]):
                db.add(SeatClass(theatre_id=theatre.id, screen_id=screen.id, name=name, sort_order=i))
            print(f"Created theatre: {theatre.name}")

        mobile = os.environ.get("SEED_OWNER_MOBILE", "9000000001")
        if db.scalar(select(StaffUser).where(StaffUser.mobile == mobile)) is None:
            db.add(
                StaffUser(
                    theatre_id=theatre.id,
                    name=os.environ.get("SEED_OWNER_NAME", "Owner"),
                    mobile=mobile,
                    pin_hash=hash_pin(os.environ["SEED_OWNER_PIN"]),
                    role=StaffRole.owner,
                    must_change_pin=True,
                )
            )
            print(f"Created owner login: {mobile}")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
