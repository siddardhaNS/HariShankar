import uuid

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Customer
from app.schemas.app import AuthOut, CustomerOut, CustomerPatch, OtpRequestIn, OtpRequestOut, OtpVerifyIn, PushTokenIn
from app.security import create_customer_token, decode_customer_token
from app.services import otp, push

router = APIRouter(prefix="/api/app", tags=["app auth"])
bearer = HTTPBearer(auto_error=False)


def current_customer(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> Customer:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please log in")
    try:
        cid = uuid.UUID(decode_customer_token(creds.credentials)["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please log in again") from None
    customer = db.get(Customer, cid)
    if customer is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please log in again")
    return customer


@router.post("/auth/otp", response_model=OtpRequestOut)
def request_otp(body: OtpRequestIn, db: Session = Depends(get_db)):
    otp.request_code(db, body.mobile)
    s = get_settings()
    hint = "Development: the code is printed in the API log" if s.otp_provider == "console" else None
    return OtpRequestOut(expires_in=s.otp_ttl_minutes * 60, dev_hint=hint)


@router.post("/auth/verify", response_model=AuthOut)
def verify_otp(body: OtpVerifyIn, db: Session = Depends(get_db)):
    otp.verify_code(db, body.mobile, body.code)
    customer = db.scalar(select(Customer).where(Customer.mobile == body.mobile))
    is_new = customer is None
    if customer is None:
        customer = Customer(mobile=body.mobile)
        db.add(customer)
        db.commit()
    return AuthOut(token=create_customer_token(customer.id), customer=CustomerOut.model_validate(customer), is_new=is_new)


@router.get("/me", response_model=CustomerOut)
def me(customer: Customer = Depends(current_customer)):
    return customer


@router.patch("/me", response_model=CustomerOut)
def update_me(body: CustomerPatch, customer: Customer = Depends(current_customer), db: Session = Depends(get_db)):
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "name" and value is not None:
            value = value.strip()
        setattr(customer, field, value)
    db.commit()
    return customer


@router.post("/push-tokens", status_code=status.HTTP_204_NO_CONTENT)
def register_push_token(body: PushTokenIn, customer: Customer = Depends(current_customer), db: Session = Depends(get_db)):
    """The app calls this after login (and on each start) once notifications are allowed."""
    push.register(db, customer, body.token, body.platform)
    db.commit()


@router.post("/push-tokens/remove", status_code=status.HTTP_204_NO_CONTENT)
def remove_push_token(body: PushTokenIn, customer: Customer = Depends(current_customer), db: Session = Depends(get_db)):
    """On logout: this phone stops getting this customer's notifications."""
    push.unregister(db, customer, body.token)
    db.commit()
