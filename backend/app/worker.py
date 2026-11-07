"""Background worker: expires abandoned payments, adds show reminders and
sends due WhatsApp messages and app notifications.

Run with `python -m app.worker` (docker compose starts it as `worker`).
Safe to run more than one: messages are locked while sending and deduplicated.
"""
import logging
import time

from app.db import SessionLocal
from app.services import bookings, push, whatsapp

log = logging.getLogger("worker")
EVERY_SECONDS = 30


def tick() -> int:
    with SessionLocal() as db:
        bookings.expire_abandoned(db)
        whatsapp.queue_reminders(db)
        db.commit()
        sent = whatsapp.send_due(db, whatsapp.get_sender(), push_sender=push.get_push_sender())
        db.commit()
        return sent


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
