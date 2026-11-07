"""Background worker: adds show reminders and sends due WhatsApp messages.

Run with `python -m app.worker` (docker compose starts it as `worker`).
Safe to run more than one: messages are locked while sending and deduplicated.
"""
import logging
import time

from app.db import SessionLocal
from app.services import whatsapp

log = logging.getLogger("worker")
EVERY_SECONDS = 30


def tick() -> int:
    with SessionLocal() as db:
        whatsapp.queue_reminders(db)
        db.commit()
        sent = whatsapp.send_due(db, whatsapp.get_sender())
        db.commit()
        return sent


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    log.info("Worker started: reminders and WhatsApp every %ss", EVERY_SECONDS)
    while True:
        try:
            n = tick()
            if n:
                log.info("Sent %s WhatsApp message(s)", n)
        except Exception:  # keep running; the next tick retries
            log.exception("Worker tick failed")
        time.sleep(EVERY_SECONDS)


if __name__ == "__main__":
    main()
