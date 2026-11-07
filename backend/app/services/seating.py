"""Seat availability and "best seats for your group"."""
import uuid
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import BookingSeat, Seat, SeatBlock, Show

FREE, BOOKED, BLOCKED = "free", "booked", "blocked"


def screen_seats(db: Session, show: Show) -> list[Seat]:
    return list(
        db.scalars(
            select(Seat)
            .where(Seat.screen_id == show.screen_id, Seat.is_active.is_(True))
            .order_by(Seat.grid_row, Seat.grid_col)
        )
    )


def seat_states(db: Session, show: Show) -> dict[uuid.UUID, str]:
    """Booked = held by a confirmed booking. Blocked = blocked for this show or
    for all upcoming shows. Everything else is free. Pending payments hold
    nothing: first to pay gets the seats."""
    booked = set(
        db.scalars(select(BookingSeat.seat_id).where(BookingSeat.show_id == show.id, BookingSeat.holds_seat.is_(True)))
    )
    blocked = set(
        db.scalars(
            select(SeatBlock.seat_id).where(
                SeatBlock.theatre_id == show.theatre_id,
                SeatBlock.released_at.is_(None),
                or_(SeatBlock.show_id == show.id, SeatBlock.show_id.is_(None)),
            )
        )
    )
    states: dict[uuid.UUID, str] = {}
    for seat in screen_seats(db, show):
        states[seat.id] = BOOKED if seat.id in booked else BLOCKED if seat.id in blocked else FREE
    return states


@dataclass
class Group:
    seats: list[Seat]
    score: float


def _windows(seats: list[Seat], states: dict[uuid.UUID, str], n: int) -> list[list[Seat]]:
    """Every run of n free seats side by side (adjacent grid columns, same row)."""
    rows: dict[int, list[Seat]] = {}
    for s in seats:
        rows.setdefault(s.grid_row, []).append(s)
    out = []
    for row in rows.values():
        row.sort(key=lambda s: s.grid_col)
        for i in range(len(row) - n + 1):
            w = row[i : i + n]
            if all(states.get(s.id) == FREE for s in w) and all(
                w[j + 1].grid_col - w[j].grid_col == 1 for j in range(n - 1)
            ):
                out.append(w)
    return out


def best_groups(
    seats: list[Seat],
    states: dict[uuid.UUID, str],
    n: int,
    *,
    near: list[Seat] | None = None,
    limit: int = 3,
) -> list[list[Seat]]:
    """Best free seats side by side for a group of n.

    Without `near`: prefer about 60% of the way back and the centre of the row.
    With `near` (seat clash): prefer the closest seats to the ones the customer
    picked, in the same class.
    """
    if not seats or n < 1:
        return []
    grid_rows = [s.grid_row for s in seats]
    ideal_row = min(grid_rows) + 0.6 * (max(grid_rows) - min(grid_rows))
    row_mid: dict[int, float] = {}
    for r in set(grid_rows):
        cols = [s.grid_col for s in seats if s.grid_row == r]
        row_mid[r] = (min(cols) + max(cols)) / 2

    def score(w: list[Seat]) -> float:
        r = w[0].grid_row
        c = sum(s.grid_col for s in w) / len(w)
        if near:
            nr = sum(s.grid_row for s in near) / len(near)
            nc = sum(s.grid_col for s in near) / len(near)
            same_class = w[0].seat_class_id == near[0].seat_class_id
            return abs(r - nr) + 0.5 * abs(c - nc) + (0 if same_class else 6)
        return abs(r - ideal_row) + 0.5 * abs(c - row_mid[r])

    ranked = sorted(_windows(seats, states, n), key=score)
    picked: list[list[Seat]] = []
    used: set[uuid.UUID] = set()
    for w in ranked:
        if used.isdisjoint(s.id for s in w):
            picked.append(w)
            used.update(s.id for s in w)
        if len(picked) == limit:
            break
    return picked
