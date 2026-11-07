"""Login codes for the customer app.

The SMS provider is not chosen yet, so sending goes through a small provider
interface. `ConsoleOtpSender` prints the code to the API log and is only
allowed in development. Adding MSG91 (or any other) later means writing one
class with `send(mobile, code)` and selecting it with OTP_PROVIDER.
"""
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Protocol

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import OtpCode
from app.security import hash_pin, verify_pin

log = logging.getLogger("otp")


class OtpSender(Protocol):
    def send(self, mobile: str, code: str) -> None: ...


class ConsoleOtpSender:
    def send(self, mobile: str, code: str) -> None:
        log.warning("DEV OTP for %s: %s", mobile, code)
        print(f"[DEV OTP] {mobile}: {code}", flush=True)


def get_sender() -> OtpSender:
    s = get_settings()
    if s.otp_provider == "console":
        if not s.is_dev:
            raise RuntimeError("Console OTP is only for development. Set OTP_PROVIDER.")
        return ConsoleOtpSender()
    raise RuntimeError(f"OTP provider {s.otp_provider!r} is not set up yet")


def request_code(db: Session, mobile: str, sender: OtpSender | None = None) -> None:
    s = get_settings()
    now = datetime.now(UTC)
    recent = db.scalar(
        select(func.count()).select_from(OtpCode).where(
            OtpCode.mobile == mobile, OtpCode.created_at > now - timedelta(hours=1)
        )
    )
    if recent >= s.otp_max_sends_per_hour:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many codes sent. Try again in an hour")

    # Any earlier unused code stops working
    for old in db.scalars(select(OtpCode).where(OtpCode.mobile == mobile, OtpCode.consumed.is_(False))):
        old.consumed = True

    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(OtpCode(mobile=mobile, code_hash=hash_pin(code), expires_at=now + timedelta(minutes=s.otp_ttl_minutes)))
    db.commit()
    (sender or get_sender()).send(mobile, code)


def verify_code(db: Session, mobile: str, code: str) -> None:
    """Raises if the code is wrong; marks it used if right."""
    s = get_settings()
    now = datetime.now(UTC)
    otp = db.scalar(
        select(OtpCode)
        .where(OtpCode.mobile == mobile, OtpCode.consumed.is_(False))
        .order_by(OtpCode.created_at.desc())
        .limit(1)
        .with_for_update()
    )
    if otp is None or otp.expires_at < now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code expired. Ask for a new one")
    if otp.attempts >= s.otp_max_attempts:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many wrong codes. Ask for a new one")
    if not verify_pin(code, otp.code_hash):
        otp.attempts += 1
        db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That code is wrong")
    otp.consumed = True
    db.commit()
