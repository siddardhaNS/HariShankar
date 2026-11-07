"""Ratings: who may rate (a confirmed ticket, after the show ends, for a while)
and the averages shown in the app and to the owner."""
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Booking, Movie, Rating, Show
from app.models.enums import BookingStatus

RATE_FOR_DAYS = 14  # after the show, a ticket can be rated (or the rating changed) for this long
MIN_TO_SHOW = 5     # the app shows a movie's average only once this many people have rated it


def show_ended_at(db: Session, show: Show) -> datetime:
    runtime = db.scalar(select(Movie.runtime_min).where(Movie.id == show.movie_id)) or 0
    return show.starts_at + timedelta(minutes=runtime + show.interval_min)


def can_rate(db: Session, b: Booking, show: Show) -> bool:
    if b.status != BookingStatus.confirmed:
        return False
    ended = show_ended_at(db, show)
    now = datetime.now(UTC)
    return ended <= now <= ended + timedelta(days=RATE_FOR_DAYS)


def averages(db: Session, movie_ids: set[uuid.UUID]) -> dict[uuid.UUID, tuple[float, int]]:
    if not movie_ids:
        return {}
    return {mid: (round(float(avg), 1), n) for mid, avg, n in db.execute(
        select(Rating.movie_id, func.avg(Rating.stars), func.count())
        .where(Rating.movie_id.in_(movie_ids)).group_by(Rating.movie_id)
    )}
