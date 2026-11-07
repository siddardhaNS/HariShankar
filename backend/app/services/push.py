"""App notifications (push) to the customer's phone.

The app registers its Expo push token after login (`POST /api/app/push-tokens`).
Messages go through the same outbox as WhatsApp (`messages`, channel "push"),
so they follow the same rules: booking messages always, reminders only with
"Show reminders" on, offers only with "Offers and new releases" on, never at
night, and a weekly limit.

Senders:
- `console` (development): prints to the worker log.
- `expo`: Expo's push service, which delivers through Firebase on Android.
  Free to send. Needs the app built with EAS (it gives the app its project id)
  and the Firebase key uploaded to EAS once. EXPO_ACCESS_TOKEN is optional and
  only needed if "enhanced push security" is turned on in the Expo account.
"""
import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Customer, PushToken

log = logging.getLogger("push")

EXPO_URL = "https://exp.host/--/api/v2/push/send"
EXPO_BATCH = 100  # Expo takes up to 100 messages per request


@dataclass
class PushResult:
    ids: list[str] = field(default_factory=list)       # one receipt id per phone it went to
    gone: list[str] = field(default_factory=list)      # tokens to turn off (app removed, or logged out)
    errors: list[str] = field(default_factory=list)


class PushSender(Protocol):
    def send(self, tokens: list[str], title: str, body: str, data: dict) -> PushResult: ...


class ConsolePushSender:
    def send(self, tokens: list[str], title: str, body: str, data: dict) -> PushResult:
        print(f"[DEV PUSH] to {len(tokens)} phone(s): {title}\n{body}\n{data}\n", flush=True)
        return PushResult(ids=[f"console-{uuid.uuid4().hex[:12]}" for _ in tokens])


class ExpoPushSender:
    def __init__(self, access_token: str | None = None, client: httpx.Client | None = None):
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
        self.client = client or httpx.Client(timeout=15, headers=headers)

    def send(self, tokens: list[str], title: str, body: str, data: dict) -> PushResult:
        out = PushResult()
        for i in range(0, len(tokens), EXPO_BATCH):
            batch = tokens[i:i + EXPO_BATCH]
            r = self.client.post(EXPO_URL, json=[
                {"to": t, "title": title, "body": body, "data": data, "sound": "default",
                 "channelId": "default", "priority": "high"} for t in batch])
            r.raise_for_status()
            for t, ticket in zip(batch, r.json().get("data", []), strict=False):
                if ticket.get("status") == "ok":
                    out.ids.append(ticket.get("id", ""))
                elif (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                    out.gone.append(t)
                else:
                    out.errors.append(ticket.get("message", "push failed"))
        return out


def get_push_sender() -> PushSender:
    s = get_settings()
    if s.push_provider == "console":
        if not s.is_dev:
            raise RuntimeError("Console push is only for development. Set PUSH_PROVIDER=expo.")
        return ConsolePushSender()
    if s.push_provider == "expo":
        return ExpoPushSender(s.expo_access_token or None)
    raise RuntimeError(f"Push provider {s.push_provider!r} is not set up")


def tokens_for(db: Session, customer_id: uuid.UUID) -> list[str]:
    return list(db.scalars(select(PushToken.token).where(
        PushToken.customer_id == customer_id, PushToken.disabled_at.is_(None))))


def has_app(db: Session, customer_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    """Which of these customers can get app notifications."""
    if not customer_ids:
        return set()
    return set(db.scalars(select(PushToken.customer_id).where(
        PushToken.customer_id.in_(customer_ids), PushToken.disabled_at.is_(None)).distinct()))


def register(db: Session, customer: Customer, token: str, platform: str) -> None:
    """Save this phone's token for the customer. A phone moves to whoever logged in on it last."""
    now = datetime.now(UTC)
    row = db.scalar(select(PushToken).where(PushToken.token == token))
    if row is None:
        db.add(PushToken(customer_id=customer.id, token=token, platform=platform, last_seen_at=now))
    else:
        row.customer_id, row.platform, row.last_seen_at, row.disabled_at = customer.id, platform, now, None


def unregister(db: Session, customer: Customer, token: str) -> None:
    row = db.scalar(select(PushToken).where(PushToken.token == token, PushToken.customer_id == customer.id))
    if row is not None:
        row.disabled_at = datetime.now(UTC)


def turn_off(db: Session, tokens: list[str]) -> None:
    now = datetime.now(UTC)
    for row in db.scalars(select(PushToken).where(PushToken.token.in_(tokens))):
        row.disabled_at = now
