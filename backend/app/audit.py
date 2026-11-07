import uuid

from sqlalchemy.orm import Session

from app.models import AuditLog, StaffUser


def record(
    db: Session,
    actor: StaffUser | None,
    action: str,
    entity: str,
    entity_id: uuid.UUID | str | None = None,
    *,
    theatre_id: uuid.UUID | None = None,
    **details,
) -> None:
    """Add a change-history row. Committed with the caller's transaction."""
    db.add(
        AuditLog(
            theatre_id=actor.theatre_id if actor else theatre_id,
            actor_id=actor.id if actor else None,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id else None,
            details=details,
        )
    )
