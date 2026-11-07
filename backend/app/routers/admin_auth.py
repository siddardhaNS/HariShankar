from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit
from app.config import get_settings
from app.db import get_db
from app.deps import get_current_staff
from app.models import StaffUser, Theatre
from app.models.enums import TheatreStatus
from app.schemas.auth import ChangePinIn, LoginIn, LoginOut, MeOut, StaffOut, TheatreBrief
from app.security import DUMMY_PIN_HASH, create_admin_token, hash_pin, verify_pin

router = APIRouter(prefix="/api/admin/auth", tags=["admin auth"])


def _bad_login() -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, "Mobile number or PIN is wrong")


def _me(db: Session, user: StaffUser) -> dict:
    theatre = db.get(Theatre, user.theatre_id) if user.theatre_id else None
    return {
        "user": StaffOut.model_validate(user),
        "theatre": TheatreBrief.model_validate(theatre) if theatre else None,
    }


def _token_response(db: Session, user: StaffUser) -> dict:
    token = create_admin_token(
        user_id=user.id, theatre_id=user.theatre_id, role=user.role.value, token_version=user.token_version
    )
    return {**_me(db, user), "access_token": token, "expires_in": get_settings().admin_token_hours * 3600}


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    s = get_settings()
    now = datetime.now(UTC)
    user = db.scalar(select(StaffUser).where(StaffUser.mobile == body.mobile).with_for_update())

    if user is None:
        verify_pin(body.pin, DUMMY_PIN_HASH)  # same timing as a wrong PIN
        raise _bad_login()

    if user.locked_until and user.locked_until > now:
        mins = int((user.locked_until - now).total_seconds() // 60) + 1
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"Too many wrong PINs. Try again in {mins} min")

    if not verify_pin(body.pin, user.pin_hash):
        user.failed_attempts += 1
        if user.failed_attempts >= s.max_failed_pin_attempts:
            user.failed_attempts = 0
            user.locked_until = now + timedelta(minutes=s.pin_lockout_minutes)
            audit.record(db, None, "login_locked", "staff_user", user.id, theatre_id=user.theatre_id)
        db.commit()
        raise _bad_login()

    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This login has been disabled. Ask the owner")
    if user.theatre_id:
        theatre = db.get(Theatre, user.theatre_id)
        if theatre is None or theatre.status != TheatreStatus.active:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This theatre is not active")

    user.failed_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    db.commit()
    return _token_response(db, user)


@router.get("/me", response_model=MeOut)
def me(user: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    return _me(db, user)


@router.post("/change-pin", response_model=LoginOut)
def change_pin(body: ChangePinIn, user: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    if not verify_pin(body.current_pin, user.pin_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current PIN is wrong")
    if body.current_pin == body.new_pin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "New PIN must be different")
    user.pin_hash = hash_pin(body.new_pin)
    user.must_change_pin = False
    user.token_version += 1  # signs out every other device
    audit.record(db, user, "pin_changed", "staff_user", user.id)
    db.commit()
    return _token_response(db, user)
