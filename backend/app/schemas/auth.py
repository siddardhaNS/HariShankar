import uuid
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.models.enums import StaffRole

Mobile = Annotated[str, Field(pattern=r"^[6-9]\d{9}$", description="10-digit Indian mobile number")]
Pin = Annotated[str, Field(pattern=r"^\d{4,6}$", description="4 to 6 digit PIN")]


def _check_pin_strength(pin: str) -> str:
    if len(set(pin)) == 1:
        raise ValueError("PIN can't be the same digit repeated")
    if pin in "0123456789" or pin in "9876543210":
        raise ValueError("PIN can't be a simple sequence like 1234")
    return pin


NewPin = Annotated[Pin, AfterValidator(_check_pin_strength)]


def _no_super_admin(v: StaffRole | None) -> StaffRole | None:
    if v == StaffRole.super_admin:
        raise ValueError("Super admin can't be assigned here")
    return v


class LoginIn(BaseModel):
    mobile: Mobile
    pin: Pin


class StaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    mobile: str
    role: StaffRole
    is_active: bool
    must_change_pin: bool
    last_login_at: datetime | None
    theatre_id: uuid.UUID | None


class TheatreBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    city: str


class MeOut(BaseModel):
    user: StaffOut
    theatre: TheatreBrief | None


class LoginOut(MeOut):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class ChangePinIn(BaseModel):
    current_pin: Pin
    new_pin: NewPin


class StaffCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    mobile: Mobile
    role: Annotated[StaffRole, AfterValidator(_no_super_admin)]
    pin: NewPin



class StaffUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    role: Annotated[StaffRole | None, AfterValidator(_no_super_admin)] = None
    is_active: bool | None = None



class ResetPinIn(BaseModel):
    pin: NewPin
