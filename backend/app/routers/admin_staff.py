import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit
from app.db import get_db
from app.deps import require_roles
from app.models import StaffUser
from app.models.enums import StaffRole
from app.schemas.auth import ResetPinIn, StaffCreateIn, StaffOut, StaffUpdateIn
from app.security import hash_pin

router = APIRouter(prefix="/api/admin/staff", tags=["admin staff"])

owner_only = require_roles(StaffRole.owner)


def _get_own_staff(db: Session, owner: StaffUser, staff_id: uuid.UUID) -> StaffUser:
    staff = db.get(StaffUser, staff_id)
    if staff is None or staff.theatre_id != owner.theatre_id or staff.role == StaffRole.super_admin:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff member not found")
    return staff


@router.get("", response_model=list[StaffOut])
def list_staff(owner: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    q = (
        select(StaffUser)
        .where(StaffUser.theatre_id == owner.theatre_id, StaffUser.role != StaffRole.super_admin)
        .order_by(StaffUser.is_active.desc(), StaffUser.role, StaffUser.name)
    )
    return db.scalars(q).all()


@router.post("", response_model=StaffOut, status_code=status.HTTP_201_CREATED)
def create_staff(body: StaffCreateIn, owner: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    if owner.theatre_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pick a theatre first")
    if db.scalar(select(StaffUser.id).where(StaffUser.mobile == body.mobile)):
        raise HTTPException(status.HTTP_409_CONFLICT, "A login with this mobile number already exists")
    staff = StaffUser(
        theatre_id=owner.theatre_id,
        name=body.name.strip(),
        mobile=body.mobile,
        role=body.role,
        pin_hash=hash_pin(body.pin),
        must_change_pin=True,
    )
    db.add(staff)
    db.flush()
    audit.record(db, owner, "staff_created", "staff_user", staff.id, role=body.role.value)
    db.commit()
    return staff


@router.patch("/{staff_id}", response_model=StaffOut)
def update_staff(
    staff_id: uuid.UUID, body: StaffUpdateIn, owner: StaffUser = Depends(owner_only), db: Session = Depends(get_db)
):
    staff = _get_own_staff(db, owner, staff_id)
    if staff.id == owner.id and (body.is_active is False or (body.role and body.role != staff.role)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't disable or change the role of your own login")

    changes: dict = {}
    if body.name is not None and body.name.strip() != staff.name:
        changes["name"] = [staff.name, body.name.strip()]
        staff.name = body.name.strip()
    if body.role is not None and body.role != staff.role:
        changes["role"] = [staff.role.value, body.role.value]
        staff.role = body.role
        staff.token_version += 1
    if body.is_active is not None and body.is_active != staff.is_active:
        changes["is_active"] = [staff.is_active, body.is_active]
        staff.is_active = body.is_active
        staff.token_version += 1
    if changes:
        audit.record(db, owner, "staff_updated", "staff_user", staff.id, **changes)
        db.commit()
    return staff


@router.post("/{staff_id}/reset-pin", response_model=StaffOut)
def reset_pin(
    staff_id: uuid.UUID, body: ResetPinIn, owner: StaffUser = Depends(owner_only), db: Session = Depends(get_db)
):
    staff = _get_own_staff(db, owner, staff_id)
    staff.pin_hash = hash_pin(body.pin)
    staff.must_change_pin = True
    staff.failed_attempts = 0
    staff.locked_until = None
    staff.token_version += 1
    audit.record(db, owner, "pin_reset", "staff_user", staff.id)
    db.commit()
    return staff
