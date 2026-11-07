"""Development demo data: hall layout, sample movies, a week of shows and some
sold seats, so the customer app has something to show before the admin
screens for movies and shows exist.

Run after `python -m app.seed`:
    docker compose exec api python -m app.seed_demo

Re-running adds shows for any of the next 7 days that have none.
The seat layout is only created if the hall has no seats yet.
"""
import random
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.models import Booking, BookingSeat, Customer, Movie, Screen, Seat, SeatClass, Show, ShowPrice, Theatre
from app.models.enums import BookingStatus, MovieStatus
from app.seed import THEATRE_SLUG
from app.services.bookings import new_code
from app.services.pricing import price

# (class name, rows, seats per row, aisle after seat n, first grid column)
LAYOUT = [
    ("Second class", "ABCDE", 12, 6, 1),
    ("First class", "FGHJKLMN", 12, 6, 1),
    ("Balcony", "PQRS", 10, 5, 2),
]
PRICES_RUPEES = {"Second class": 80, "First class": 150, "Balcony": 200}

MOVIES = [
    dict(title="Godavari Express", language="Telugu", certificate="UA", runtime_min=154, genre="Action drama",
         synopsis="A train driver races the monsoon to get one last passenger home.", status=MovieStatus.now_showing),
    dict(title="Konaseema Kathalu", language="Telugu", certificate="U", runtime_min=138, genre="Family drama",
         synopsis="Three generations, one coconut grove and a wedding nobody agreed to.", status=MovieStatus.now_showing),
    dict(title="Neelakantha", language="Telugu", certificate="UA", runtime_min=162, genre="Mythological",
         synopsis="A temple town's festival turns into a fight for its oldest secret.", status=MovieStatus.now_showing),
    dict(title="Monsoon Signal", language="Telugu", certificate="UA", runtime_min=141, genre="Thriller",
         synopsis="A railway signalman hears a voice on a line that closed years ago.",
         status=MovieStatus.coming_soon, release_in_days=12),
    dict(title="Little Comet", language="Hindi", certificate="U", runtime_min=118, genre="Animation",
         synopsis="A comet that is scared of falling learns to shine.",
         status=MovieStatus.coming_soon, release_in_days=26),
]


def build_layout(db, theatre: Theatre, screen: Screen) -> None:
    classes = {c.name: c for c in db.scalars(select(SeatClass).where(SeatClass.screen_id == screen.id))}
    grid_row = 1
    for i, (cname, rows, per_row, aisle_after, first_col) in enumerate(LAYOUT):
        cls = classes.get(cname)
        if cls is None:
            cls = SeatClass(theatre_id=theatre.id, screen_id=screen.id, name=cname, sort_order=i)
            db.add(cls)
            db.flush()
        for row in rows:
            for n in range(1, per_row + 1):
                col = first_col + n - 1 + (1 if n > aisle_after else 0)  # one empty column = aisle
                db.add(Seat(theatre_id=theatre.id, screen_id=screen.id, seat_class_id=cls.id,
                            row_label=row, number=n, grid_row=grid_row, grid_col=col))
            grid_row += 1
        grid_row += 1  # gap between classes


def slots_for(day: date) -> list[tuple[time, str]]:
    weekend = day.weekday() >= 5
    morning = "Neelakantha" if weekend else "Konaseema Kathalu"
    return [
        (time(11, 0), morning),
        (time(14, 30), "Godavari Express"),
        (time(18, 30), "Godavari Express"),
        (time(21, 30), "Godavari Express"),
    ]


def main() -> None:
    if not get_settings().is_dev:
        raise SystemExit("Demo data is for development only")
    rng = random.Random(7)
    db = SessionLocal()
    try:
        theatre = db.scalar(select(Theatre).where(Theatre.slug == THEATRE_SLUG))
        if theatre is None:
            raise SystemExit("Run `python -m app.seed` first")
        screen = db.scalar(select(Screen).where(Screen.theatre_id == theatre.id))
        assert screen
        tz = ZoneInfo(theatre.timezone)
        today = datetime.now(tz).date()

        if not db.scalar(select(Seat.id).where(Seat.screen_id == screen.id).limit(1)):
            build_layout(db, theatre, screen)
            print("Created seat layout")

        movies = {m.title: m for m in db.scalars(select(Movie).where(Movie.theatre_id == theatre.id))}
        for spec in MOVIES:
            if spec["title"] in movies:
                continue
            spec = dict(spec)
            rel = spec.pop("release_in_days", -10)
            m = Movie(theatre_id=theatre.id, release_date=today + timedelta(days=rel), **spec)
            db.add(m)
            movies[m.title] = m
        db.flush()

        classes = list(db.scalars(select(SeatClass).where(SeatClass.screen_id == screen.id)))
        seats = list(db.scalars(select(Seat).where(Seat.screen_id == screen.id)))
        demo = db.scalar(select(Customer).where(Customer.mobile == "9000000099"))
        if demo is None:
            demo = Customer(mobile="9000000099", name="Demo audience")
            db.add(demo)
            db.flush()

        created = 0
        for d in range(7):
            day = today + timedelta(days=d)
            for t, title in slots_for(day):
                starts = datetime.combine(day, t, tz)
                if starts <= datetime.now(UTC):
                    continue
                if db.scalar(select(Show.id).where(Show.screen_id == screen.id, Show.starts_at == starts)):
                    continue
                show = Show(theatre_id=theatre.id, screen_id=screen.id, movie_id=movies[title].id, starts_at=starts)
                db.add(show)
                db.flush()
                for c in classes:
                    db.add(ShowPrice(show_id=show.id, seat_class_id=c.id, price_paise=PRICES_RUPEES[c.name] * 100))
                db.flush()
                # Pretend some seats sold: busier on weekends, evenings and nearer days
                busy = 0.15 + (0.25 if day.weekday() >= 5 else 0) + (0.2 if t.hour >= 18 else 0) - 0.03 * d
                sold = [s for s in seats if rng.random() < max(0.05, busy)]
                cls_price = {c.id: PRICES_RUPEES[c.name] * 100 for c in classes}
                for i in range(0, len(sold), 3):
                    group = sold[i : i + 3]
                    bd = price([cls_price[s.seat_class_id] for s in group], theatre.booking_fee_paise)
                    b = Booking(theatre_id=theatre.id, code=new_code(db), show_id=show.id, customer_id=demo.id,
                                customer_name="Demo audience", status=BookingStatus.confirmed,
                                tickets_paise=bd.tickets_paise, booking_fee_paise=bd.booking_fee_paise,
                                gst_paise=bd.gst_paise, total_paise=bd.total_paise, gateway="demo",
                                confirmed_at=datetime.now(UTC), payment_method="upi")
                    db.add(b)
                    db.flush()
                    for s in group:
                        db.add(BookingSeat(booking_id=b.id, show_id=show.id, seat_id=s.id,
                                           price_paise=cls_price[s.seat_class_id], holds_seat=True))
                created += 1
        db.commit()
        print(f"Created {created} shows")
    finally:
        db.close()


if __name__ == "__main__":
    main()
