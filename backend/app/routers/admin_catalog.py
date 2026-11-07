"""Admin: hall layout and movies."""
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.db import get_db
from app.deps import require_roles
from app.models import BookingSeat, Movie, Screen, Seat, SeatClass, Show, StaffUser
from app.models.enums import ShowStatus, StaffRole
from app.schemas.admin import LayoutIn, LayoutOut, LayoutRow, MovieAdminOut, MovieIn

router = APIRouter(prefix="/api/admin", tags=["admin catalog"])
manage = require_roles(StaffRole.owner, StaffRole.manager)


def theatre_screen(db: Session, user: StaffUser) -> Screen:
    """Phase 1: one screen per theatre. Multiple screens is a Phase 2 'good to have'."""
    screen = db.scalar(select(Screen).where(Screen.theatre_id == user.theatre_id).order_by(Screen.created_at).limit(1))
    if screen is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This theatre has no screen set up")
    return screen


# ---------- Hall layout ----------


def layout_rows(db: Session, screen: Screen) -> list[LayoutRow]:
    """Rebuild the editor's row list from the stored seat grid."""
    seats = db.scalars(
        select(Seat).where(Seat.screen_id == screen.id, Seat.is_active.is_(True)).order_by(Seat.grid_row, Seat.number)
    ).all()
    names = dict(db.execute(select(SeatClass.id, SeatClass.name).where(SeatClass.screen_id == screen.id)).all())
    rows: dict[int, list[Seat]] = {}
    for s in seats:
        rows.setdefault(s.grid_row, []).append(s)
    out = []
    for _, rs in sorted(rows.items()):
        rs.sort(key=lambda s: s.number)
        aisles = [a.number for a, b in zip(rs, rs[1:], strict=False) if b.grid_col - a.grid_col > 1]
        out.append(LayoutRow(label=rs[0].row_label, class_name=names[rs[0].seat_class_id], seats=len(rs),
                             aisles_after=aisles, indent=rs[0].grid_col - 1))
    return out


def _layout_out(db: Session, screen: Screen) -> LayoutOut:
    rows = layout_rows(db, screen)
    classes = list(dict.fromkeys(r.class_name for r in rows))
    return LayoutOut(screen_id=screen.id, rows=rows, total_seats=sum(r.seats for r in rows), classes=classes)


@router.get("/layout", response_model=LayoutOut)
def get_layout(user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    return _layout_out(db, theatre_screen(db, user))


@router.put("/layout", response_model=LayoutOut)
def save_layout(body: LayoutIn, user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    """Save the hall. Seats keep their identity by row letter + number, so
    existing bookings and blocks stay attached. Removing a seat that is sold
    for an upcoming show is refused."""
    screen = theatre_screen(db, user)
    now = datetime.now(UTC)

    # Seat classes, in the order they first appear (front to back)
    classes = {c.name: c for c in db.scalars(select(SeatClass).where(SeatClass.screen_id == screen.id))}
    order = list(dict.fromkeys(r.class_name.strip() for r in body.rows))
    for i, name in enumerate(order):
        if name not in classes:
            classes[name] = SeatClass(theatre_id=screen.theatre_id, screen_id=screen.id, name=name)
            db.add(classes[name])
        classes[name].sort_order = i
    db.flush()

    existing = {(s.row_label, s.number): s for s in db.scalars(select(Seat).where(Seat.screen_id == screen.id))}
    wanted: set[tuple[str, int]] = set()
    grid_row = 1
    prev_class = None
    for row in body.rows:
        cname = row.class_name.strip()
        if prev_class is not None and cname != prev_class:
            grid_row += 1  # gap row between classes
        prev_class = cname
        col = row.indent + 1
        for n in range(1, row.seats + 1):
            key = (row.label, n)
            wanted.add(key)
            seat = existing.get(key)
            if seat is None:
                seat = Seat(theatre_id=screen.theatre_id, screen_id=screen.id, row_label=row.label, number=n)
                db.add(seat)
            seat.seat_class_id = classes[cname].id
            seat.grid_row = grid_row
            seat.grid_col = col
            seat.is_active = True
            col += 2 if n in row.aisles_after else 1
        grid_row += 1

    removed = [s for key, s in existing.items() if key not in wanted and s.is_active]
    if removed:
        sold = db.execute(
            select(Seat.row_label, Seat.number)
            .join(BookingSeat, BookingSeat.seat_id == Seat.id)
            .join(Show, Show.id == BookingSeat.show_id)
            .where(Seat.id.in_([s.id for s in removed]), BookingSeat.holds_seat.is_(True),
                   Show.starts_at > now, Show.status == ShowStatus.scheduled)
            .distinct()
        ).all()
        if sold:
            db.rollback()
            labels = ", ".join(f"{r}{n}" for r, n in sorted(sold)[:12])
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"These seats are sold for upcoming shows and can't be removed: {labels}")
        for s in removed:
            s.is_active = False

    total = len(wanted)
    audit.record(db, user, "layout_saved", "screen", screen.id, seats=total, removed=len(removed))
    db.commit()
    return _layout_out(db, screen)


# ---------- Movies ----------


def _movie_out(db: Session, m: Movie) -> MovieAdminOut:
    upcoming = db.scalar(
        select(func.count()).select_from(Show).where(
            Show.movie_id == m.id, Show.status == ShowStatus.scheduled, Show.starts_at > datetime.now(UTC)
        )
    )
    out = MovieAdminOut.model_validate(m)
    out.upcoming_shows = upcoming or 0
    return out


def _own_movie(db: Session, user: StaffUser, movie_id: uuid.UUID) -> Movie:
    m = db.get(Movie, movie_id)
    if m is None or m.theatre_id != user.theatre_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Movie not found")
    return m


@router.get("/movies", response_model=list[MovieAdminOut])
def list_movies(user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    movies = db.scalars(
        select(Movie).where(Movie.theatre_id == user.theatre_id).order_by(Movie.status, Movie.release_date.desc().nulls_last())
    ).all()
    return [_movie_out(db, m) for m in movies]


@router.post("/movies", response_model=MovieAdminOut, status_code=status.HTTP_201_CREATED)
def create_movie(body: MovieIn, user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    m = Movie(theatre_id=user.theatre_id, **body.model_dump())
    db.add(m)
    db.flush()
    audit.record(db, user, "movie_created", "movie", m.id, title=m.title)
    db.commit()
    return _movie_out(db, m)


@router.put("/movies/{movie_id}", response_model=MovieAdminOut)
def update_movie(movie_id: uuid.UUID, body: MovieIn, user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    m = _own_movie(db, user, movie_id)
    changes = {k: [str(getattr(m, k)), str(v)] for k, v in body.model_dump().items() if getattr(m, k) != v}
    for k, v in body.model_dump().items():
        setattr(m, k, v)
    if changes:
        audit.record(db, user, "movie_updated", "movie", m.id, **changes)
    db.commit()
    return _movie_out(db, m)
