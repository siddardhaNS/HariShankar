import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin
from app.models.enums import StaffRole


class StaffUser(IdMixin, TimestampMixin, Base):
    __tablename__ = "staff_users"

    # Nullable only for the Phase 2 super admin
    theatre_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("theatres.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    mobile: Mapped[str] = mapped_column(String(10), unique=True)
    pin_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[StaffRole] = mapped_column(Enum(StaffRole, name="staff_role"))
    is_active: Mapped[bool] = mapped_column(default=True)
    must_change_pin: Mapped[bool] = mapped_column(default=True)

    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Bumped on PIN reset / disable / role change to revoke issued tokens
    token_version: Mapped[int] = mapped_column(Integer, default=0)


class AuditLog(IdMixin, Base):
    """Change history: who changed a price, blocked seats, cancelled a show..."""

    __tablename__ = "audit_logs"

    theatre_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("theatres.id"), index=True
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("staff_users.id"))
    action: Mapped[str] = mapped_column(String(60))
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(40))
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
