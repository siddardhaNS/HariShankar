import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Movie, SeatClass, Show, ShowPrice, Theatre
from app.models.enums import MovieStatus, ShowStatus, TheatreStatus
from app.schemas.app import (
    DayOut,
    HomeOut,
    MovieOut,
    MovieShows,
    SeatClassOut,
    SeatGroupOut,
    SeatMapOut,
    SeatOut,
    ShowBrief,
    ShowTimeOut,
    TheatreOut,
)
from app.services import ratings, seating

router = APIRouter(prefix="/api/app", tags=["app catalog"])

DAYS_AHEAD = 7


def show_label(starts_at: datetime, tz: ZoneInfo) -> str:
    h = starts_at.astimezone(tz).hour
    if h < 12:
        return "Morning"
    if h < 17:
        return "Matinee"
    if h < 20:
        return "First show"
    return "Second show"


def resolve_theatre(db: Session, theatre_id: uuid.UUID | None) -> Theatre:
    """Phase 1 has one theatre, so it is the default. Phase 2 apps pass theatre_id."""
    q = select(Theatre).where(Theatre.status == TheatreStatus.active)
    q = q.where(Theatre.id == theatre_id) if theatre_id else q.order_by(Theatre.created_at).limit(1)
    theatre = db.scalar(q)
    if theatre is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Theatre not found")
    return theatre


def availability(left: int, total: int) -> str:
    if left <= 0:
        return "sold_out"
    ratio = left / total if total else 0
    return "almost_full" if ratio < 0.15 else "filling_fast" if ratio < 0.4 else "available"


def show_times(db: Session, shows: list[Show], tz: ZoneInfo) -> list[ShowTimeOut]:
    if not shows:
        return []
    min_prices = dict(
        db.execute(
            select(ShowPrice.show_id, func.min(ShowPrice.price_paise))
            .where(ShowPrice.show_id.in_([s.id for s in shows]))
            .group_by(ShowPrice.show_id)
        ).all()
    )
    out = []
    for show in shows:
        states = seating.seat_states(db, show)
        total = len(states)
        left = sum(1 for v in states.values() if v == seating.FREE)
        out.append(
            ShowTimeOut(
                id=show.id,
                starts_at=show.starts_at,
                label=show_label(show.starts_at, tz),
                seats_left=left,
                seats_total=total,
                availability=availability(left, total),
                from_price_paise=min_prices.get(show.id),
            )
        )
    return out


@router.get("/theatres", response_model=list[TheatreOut])
def theatres(db: Session = Depends(get_db)):
    return db.scalars(select(Theatre).where(Theatre.status == TheatreStatus.active).order_by(Theatre.name)).all()


@router.get("/home", response_model=HomeOut)
def home(
    theatre_id: uuid.UUID | None = None,
    day: date | None = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
):
    theatre = resolve_theatre(db, theatre_id)
    tz = ZoneInfo(theatre.timezone)
    now = datetime.now(UTC)
    today = now.astimezone(tz).date()
    requested = day
    day = min(max(day or today, today), today + timedelta(days=DAYS_AHEAD - 1))

    window_end = datetime.combine(today + timedelta(days=DAYS_AHEAD), time.min, tz)
    upcoming = list(
        db.scalars(
            select(Show)
            .where(
                Show.theatre_id == theatre.id,
                Show.status == ShowStatus.scheduled,
                Show.starts_at > now,
                Show.starts_at < window_end,
                (Show.booking_opens_at.is_(None)) | (Show.booking_opens_at <= now),
            )
            .order_by(Show.starts_at)
        )
    )
    days_with_shows = {s.starts_at.astimezone(tz).date() for s in upcoming}
    if requested is None and day not in days_with_shows and days_with_shows:
        day = min(days_with_shows)  # e.g. late at night: open on tomorrow
    todays = [s for s in upcoming if s.starts_at.astimezone(tz).date() == day]

    movies = {m.id: m for m in db.scalars(select(Movie).where(Movie.id.in_({s.movie_id for s in todays})))}
    times = {t.id: t for t in show_times(db, todays, tz)}
    by_movie: dict[uuid.UUID, list[ShowTimeOut]] = {}
    for s in todays:
        by_movie.setdefault(s.movie_id, []).append(times[s.id])
    avgs = ratings.averages(db, set(movies))
    now_showing = [
        MovieShows(movie=movie_out(movies[mid], avgs), shows=st)
        for mid, st in sorted(by_movie.items(), key=lambda kv: (-len(kv[1]), movies[kv[0]].title))
    ]

    coming = db.scalars(
        select(Movie)
        .where(Movie.theatre_id == theatre.id, Movie.status == MovieStatus.coming_soon)
        .order_by(Movie.release_date.nulls_last(), Movie.title)
    ).all()

    return HomeOut(
        theatre=TheatreOut.model_validate(theatre),
        date=day,
        days=[DayOut(date=today + timedelta(days=i), has_shows=(today + timedelta(days=i)) in days_with_shows)
              for i in range(DAYS_AHEAD)],
        featured=now_showing[0] if now_showing else None,
        now_showing=now_showing,
        coming_soon=[MovieOut.model_validate(m) for m in coming],
    )


def movie_out(m: Movie, avgs: dict) -> MovieOut:
    out = MovieOut.model_validate(m)
    avg, n = avgs.get(m.id, (None, 0))
    if n >= ratings.MIN_TO_SHOW:
        out.rating, out.rating_count = avg, n
    return out


def show_brief(db: Session, show: Show) -> ShowBrief:
    theatre = db.get(Theatre, show.theatre_id)
    movie = db.get(Movie, show.movie_id)
    assert theatre and movie
    return ShowBrief(
        id=show.id,
        starts_at=show.starts_at,
        label=show_label(show.starts_at, ZoneInfo(theatre.timezone)),
        movie=MovieOut.model_validate(movie),
        theatre=TheatreOut.model_validate(theatre),
    )


def _get_show(db: Session, show_id: uuid.UUID) -> Show:
    show = db.get(Show, show_id)
    if show is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Show not found")
    return show


@router.get("/shows/{show_id}/seats", response_model=SeatMapOut)
def seat_map(show_id: uuid.UUID, db: Session = Depends(get_db)):
    show = _get_show(db, show_id)
    seats = seating.screen_seats(db, show)
    states = seating.seat_states(db, show)
    prices = dict(
        db.execute(select(ShowPrice.seat_class_id, ShowPrice.price_paise).where(ShowPrice.show_id == show.id)).all()
    )
    classes = db.scalars(
        select(SeatClass).where(SeatClass.screen_id == show.screen_id).order_by(SeatClass.sort_order)
    ).all()
    theatre = db.get(Theatre, show.theatre_id)
    assert theatre
    s = get_settings()
    return SeatMapOut(
        show=show_brief(db, show),
        classes=[SeatClassOut(id=c.id, name=c.name, price_paise=prices.get(c.id),
                              description=c.description) for c in classes],
        seats=[
            SeatOut(id=x.id, row=x.row_label, number=x.number, r=x.grid_row, c=x.grid_col,
                    class_id=x.seat_class_id, state=states[x.id])  # type: ignore[arg-type]
            for x in seats
        ],
        seats_left=sum(1 for v in states.values() if v == seating.FREE),
        booking_fee_paise=theatre.booking_fee_paise,
        gst_rate_bp=s.gst_rate_on_fee_bp,
        max_seats=s.max_seats_per_booking,
        payment_gateway=s.payment_gateway,
    )


@router.get("/shows/{show_id}/best-seats", response_model=list[SeatGroupOut])
def best_seats(show_id: uuid.UUID, n: int = Query(default=2, ge=1, le=10), db: Session = Depends(get_db)):
    show = _get_show(db, show_id)
    seats = seating.screen_seats(db, show)
    groups = seating.best_groups(seats, seating.seat_states(db, show), n)
    prices = dict(
        db.execute(select(ShowPrice.seat_class_id, ShowPrice.price_paise).where(ShowPrice.show_id == show.id)).all()
    )
    class_names = dict(db.execute(select(SeatClass.id, SeatClass.name).where(SeatClass.screen_id == show.screen_id)).all())
    return [
        SeatGroupOut(
            seat_ids=[x.id for x in g],
            labels=[f"{x.row_label}{x.number}" for x in g],
            class_name=class_names.get(g[0].seat_class_id, ""),
            total_paise=sum(prices.get(x.seat_class_id, 0) for x in g),
        )
        for g in groups
    ]
