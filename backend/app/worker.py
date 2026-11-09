"""Background worker: expires abandoned payments, adds show reminders and
sends due WhatsApp messages and app notifications.

Locally, `python -m app.worker` runs it in a loop (docker compose starts it as
`worker`). On Vercel, a scheduled call to /api/cron/tick runs one pass.
Safe to run more than one: messages are locked while sending and deduplicated.
"""
import logging
import time

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.services import bookings, insights, push, whatsapp

log = logging.getLogger("worker")
EVERY_SECONDS = 30


def run_once(db: Session) -> int:
    bookings.expire_abandoned(db)
    whatsapp.queue_reminders(db)
    insights.queue_weekly_summaries(db)
    db.commit()
    sent = whatsapp.send_due(db, whatsapp.get_sender(), push_sender=push.get_push_sender())
    db.commit()
    return sent


def tick() -> int:
    with SessionLocal() as db:
        return run_once(db)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    log.info("Worker started: reminders, WhatsApp and app notifications every %ss", EVERY_SECONDS)
    while True:
        try:
            n = tick()
            if n:
                log.info("Sent %s message(s)", n)
        except Exception:  # keep running; the next tick retries
            log.exception("Worker tick failed")
        time.sleep(EVERY_SECONDS)


if __name__ == "__main__":
    main()
