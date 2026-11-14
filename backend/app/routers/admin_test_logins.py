"""Test logins: numbers that can log in to the customer app with a fixed code
until an SMS provider is set up. Owner only."""
import secrets
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit
from app.db import get_db
from app.deps import require_roles
from app.models import StaffUser, TestLogin
from app.models.enums import StaffRole
from app.schemas.auth import Mobile

router = APIRouter(prefix="/api/admin/test-logins", tags=["admin test logins"])

owner_only = require_roles(StaffRole.owner)


class TestLoginIn(BaseModel):
    name: Annotated[str, Field(min_length=2, max_length=80)]
    mobile: Mobile


class TestLoginOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    mobile: str
    code: str
    created_at: datetime


@router.get("", response_model=list[TestLoginOut])
def list_test_logins(owner: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    return db.scalars(select(TestLogin).order_by(TestLogin.created_at.desc())).all()


@router.post("", response_model=TestLoginOut, status_code=status.HTTP_201_CREATED)
def add_test_login(body: TestLoginIn, owner: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    if db.scalar(select(TestLogin.id).where(TestLogin.mobile == body.mobile)):
        raise HTTPException(status.HTTP_409_CONFLICT, "This number is already a test login")
    login = TestLogin(name=body.name.strip(), mobile=body.mobile, code=f"{secrets.randbelow(900_000) + 100_000}")
    db.add(login)
    db.flush()
    audit.record(db, owner, "test_login_added", "test_login", login.id, mobile=login.mobile)
    db.commit()
    return login


@router.delete("/{login_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_test_login(login_id: uuid.UUID, owner: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    login = db.get(TestLogin, login_id)
    if login is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Test login not found")
    audit.record(db, owner, "test_login_removed", "test_login", login.id, mobile=login.mobile)
    db.delete(login)
    db.commit()
