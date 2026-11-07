"""Admin: promo codes."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.db import get_db
from app.deps import require_roles
from app.models import Booking, Promotion, StaffUser
from app.models.enums import BookingStatus, StaffRole
from app.schemas.admin import PromotionIn, PromotionOut, PromotionUpdate
from app.services.promotions import describe

router = APIRouter(prefix="/api/admin/promotions", tags=["admin promotions"])
manage = require_roles(StaffRole.owner, StaffRole.manager)


def _check(p: Promotion) -> None:
    if p.kind == "percent" and p.value > 100:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Percent off can't be more than 100")
    if p.kind == "per_ticket" and p.value > 100_000:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That's more than ₹1,000 off a ticket")
    if p.starts_on and p.ends_on and p.ends_on < p.starts_on:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "End date is before the start date")


def _out(db: Session, rows: list[Promotion]) -> list[PromotionOut]:
    ids = [p.id for p in rows]
    stats = {pid: (n, d) for pid, n, d in db.execute(
        select(Booking.promotion_id, func.count(), func.coalesce(func.sum(Booking.discount_paise), 0))
        .where(Booking.promotion_id.in_(ids), Booking.status == BookingStatus.confirmed)
        .group_by(Booking.promotion_id)
    )} if ids else {}
    return [
        PromotionOut.model_validate({
            **{k: getattr(p, k) for k in PromotionOut.model_fields if hasattr(p, k)},
            "details": describe(p), "uses": stats.get(p.id, (0, 0))[0],
            "discount_given_paise": stats.get(p.id, (0, 0))[1],
        })
        for p in rows
    ]


def _own(db: Session, user: StaffUser, promo_id: uuid.UUID) -> Promotion:
    p = db.get(Promotion, promo_id)
    if p is None or p.theatre_id != user.theatre_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Promotion not found")
    return p


@router.get("", response_model=list[PromotionOut])
def list_promotions(user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    rows = list(db.scalars(select(Promotion).where(Promotion.theatre_id == user.theatre_id)
                           .order_by(Promotion.is_active.desc(), Promotion.created_at.desc())))
    return _out(db, rows)


@router.post("", response_model=PromotionOut, status_code=status.HTTP_201_CREATED)
def create(body: PromotionIn, user: StaffUser = Depends(manage), db: Session = Depends(get_db)):
    if db.scalar(select(Promotion.id).where(Promotion.theatre_id == user.theatre_id, Promotion.code == body.code)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"There's already a code {body.code}")
    p = Promotion(theatre_id=user.theatre_id, created_by=user.id, **body.model_dump())
    _check(p)
    db.add(p)
    db.flush()
    audit.record(db, user, "promotion_created", "promotion", p.id, code=p.code)
    db.commit()
    return _out(db, [p])[0]


@router.patch("/{promo_id}", response_model=PromotionOut)
def update(promo_id: uuid.UUID, body: PromotionUpdate, user: StaffUser = Depends(manage),
           db: Session = Depends(get_db)):
    p = _own(db, user, promo_id)
    changes = {k: getattr(body, k) for k in body.model_fields_set}
    for k, v in changes.items():
        if v is None and k not in ("max_discount_paise", "starts_on", "ends_on", "max_uses", "per_customer"):
            continue  # not clearable
        setattr(p, k, v)
    _check(p)
    audit.record(db, user, "promotion_updated", "promotion", p.id, code=p.code,
                 changes={k: str(v) for k, v in changes.items()})
    db.commit()
    return _out(db, [p])[0]
