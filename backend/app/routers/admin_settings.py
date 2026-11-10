"""Theatre settings on the admin site. For now: maintenance mode.

While maintenance is on, the customer app shows the theatre's message instead
of working (see `customer_app_open`); gate staff keep scanning. Turning it on
or off, or changing the message, needs the maintenance password, which is
separate from everyone's login PIN. Wrong passwords lock the switch for a while,
the same way wrong PINs lock a login.
"""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import audit
from app.config import get_settings
from app.db import get_db
from app.deps import require_roles
from app.models import StaffUser, Theatre
from app.models.enums import StaffRole
from app.security import hash_pin, verify_pin

router = APIRouter(prefix="/api/admin/maintenance", tags=["admin settings"])
owner_or_manager = require_roles(StaffRole.owner, StaffRole.manager)
owner_only = require_roles(StaffRole.owner)

DEFAULT_MESSAGE = "The app is down for maintenance. Please check back soon."


class MaintenanceOut(BaseModel):
    on: bool
    message: str
    password_set: bool
    changed_at: datetime | None
    changed_by: str | None
    locked_until: datetime | None


class MaintenanceIn(BaseModel):
    on: bool
    message: str = Field(default="", max_length=300)
    password: str = Field(min_length=1, max_length=100)


class PasswordIn(BaseModel):
    current: str = Field(default="", max_length=100)
    new: str = Field(min_length=8, max_length=100)


def _theatre(db: Session, user: StaffUser) -> Theatre:
    t = db.get(Theatre, user.theatre_id) if user.theatre_id else None
    if t is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Log in as a theatre's staff to change its settings")
    return t


def _out(t: Theatre) -> MaintenanceOut:
    now = datetime.now(UTC)
    return MaintenanceOut(
        on=t.maintenance_on, message=t.maintenance_message or DEFAULT_MESSAGE,
        password_set=t.maintenance_password_hash is not None, changed_at=t.maintenance_changed_at,
        changed_by=t.maintenance_changed_by,
        locked_until=t.maintenance_locked_until if t.maintenance_locked_until and t.maintenance_locked_until > now else None,
    )


def _check_password(db: Session, user: StaffUser, t: Theatre, password: str) -> None:
    """Raise unless the password is right. Counts wrong tries and locks after too many."""
    s = get_settings()
    now = datetime.now(UTC)
    if t.maintenance_password_hash is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Set a maintenance password first")
    if t.maintenance_locked_until and t.maintenance_locked_until > now:
        mins = int((t.maintenance_locked_until - now).total_seconds() // 60) + 1
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"Too many wrong passwords. Try again in {mins} minute{'s' if mins != 1 else ''}")
    if not verify_pin(password, t.maintenance_password_hash):
        t.maintenance_failed_attempts += 1
        left = s.max_failed_pin_attempts - t.maintenance_failed_attempts
        if left <= 0:
            t.maintenance_failed_attempts = 0
            t.maintenance_locked_until = now + timedelta(minutes=s.pin_lockout_minutes)
            audit.record(db, user, "maintenance_locked", "theatre", t.id)
            db.commit()
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                                f"Too many wrong passwords. Locked for {s.pin_lockout_minutes} minutes")
        audit.record(db, user, "maintenance_wrong_password", "theatre", t.id)
        db.commit()
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"Wrong maintenance password. {left} more tr{'ies' if left != 1 else 'y'} before it locks")
    t.maintenance_failed_attempts = 0
    t.maintenance_locked_until = None


@router.get("", response_model=MaintenanceOut)
def get_maintenance(user: StaffUser = Depends(owner_or_manager), db: Session = Depends(get_db)):
    return _out(_theatre(db, user))


@router.post("", response_model=MaintenanceOut)
def set_maintenance(body: MaintenanceIn, user: StaffUser = Depends(owner_or_manager), db: Session = Depends(get_db)):
    """Turn maintenance on or off, or change the message shown while it's on."""
    t = _theatre(db, user)
    _check_password(db, user, t, body.password)
    message = body.message.strip() or DEFAULT_MESSAGE
    was_on = t.maintenance_on
    t.maintenance_on = body.on
    t.maintenance_message = message
    t.maintenance_changed_at = datetime.now(UTC)
    t.maintenance_changed_by = user.name
    action = ("maintenance_on" if body.on else "maintenance_off") if body.on != was_on else "maintenance_message"
    audit.record(db, user, action, "theatre", t.id, message=message)
    db.commit()
    return _out(t)


@router.put("/password", response_model=MaintenanceOut)
def set_password(body: PasswordIn, user: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    """Owner sets the maintenance password the first time, or changes it with the current one."""
    t = _theatre(db, user)
    if t.maintenance_password_hash is not None:
        _check_password(db, user, t, body.current)
    t.maintenance_password_hash = hash_pin(body.new)
    audit.record(db, user, "maintenance_password_set", "theatre", t.id)
    db.commit()
    return _out(t)
