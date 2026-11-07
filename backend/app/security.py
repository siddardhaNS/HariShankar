import hashlib
import hmac
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.config import get_settings


def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()


def verify_pin(pin: str, pin_hash: str) -> bool:
    try:
        return bcrypt.checkpw(pin.encode(), pin_hash.encode())
    except ValueError:
        return False


# A real hash to compare against when the mobile number is unknown, so a
# wrong number takes as long as a wrong PIN (no account enumeration by timing).
DUMMY_PIN_HASH = hash_pin("000000")


def create_admin_token(*, user_id: uuid.UUID, theatre_id: uuid.UUID | None, role: str, token_version: int) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "tid": str(theatre_id) if theatre_id else None,
        "role": role,
        "ver": token_version,
        "aud": "admin",
        "iat": now,
        "exp": now + timedelta(hours=s.admin_token_hours),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def create_customer_token(customer_id: uuid.UUID) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {"sub": str(customer_id), "aud": "customer", "iat": now, "exp": now + timedelta(days=s.customer_token_days)}
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_customer_token(token: str) -> dict:
    s = get_settings()
    return jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm], audience="customer")


QR_PREFIX = "HSPP1."


def _ticket_sig(code: str) -> str:
    return hmac.new(get_settings().jwt_secret.encode(), f"ticket:{code}".encode(), hashlib.sha256).hexdigest()[:12]


def ticket_qr(code: str) -> str:
    """QR payload: booking code + signature, so the gate scanner (including a
    future offline one) can tell a real ticket from a typed-up one."""
    return f"{QR_PREFIX}{code}.{_ticket_sig(code)}"


def read_ticket_qr(text: str) -> str | None:
    """Booking code from a scanned QR, or None if the signature doesn't match."""
    parts = text.strip().split(".")
    if len(parts) != 3 or f"{parts[0]}." != QR_PREFIX:
        return None
    code, sig = parts[1], parts[2]
    return code if hmac.compare_digest(sig, _ticket_sig(code)) else None


def decode_admin_token(token: str) -> dict:
    s = get_settings()
    return jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm], audience="admin")
