import uuid
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import StaffUser, Theatre
from app.models.enums import StaffRole, TheatreStatus
from app.security import decode_admin_token

bearer = HTTPBearer(auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Please log in again",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_staff(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> StaffUser:
    if creds is None:
        raise _unauthorized()
    try:
        claims = decode_admin_token(creds.credentials)
        user_id = uuid.UUID(claims["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _unauthorized() from None

    user = db.get(StaffUser, user_id)
    if user is None or not user.is_active or user.token_version != claims.get("ver"):
        raise _unauthorized()
    if user.theatre_id is not None:
        theatre = db.get(Theatre, user.theatre_id)
        if theatre is None or theatre.status != TheatreStatus.active:
            raise _unauthorized()
    return user


def require_roles(*roles: StaffRole) -> Callable[..., StaffUser]:
    allowed = set(roles) | {StaffRole.super_admin}

    def checker(user: StaffUser = Depends(get_current_staff)) -> StaffUser:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role can't do this")
        return user

    return checker
