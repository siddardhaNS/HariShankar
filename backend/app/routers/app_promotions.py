"""Customer app: offers at checkout and applying a promo code."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Customer, Seat, Show, ShowPrice, Theatre
from app.routers.app_auth import current_customer
from app.schemas.app import OfferOut, PriceOut, PromoApplyIn, PromoApplyOut
from app.services import promotions
from app.services.pricing import price

router = APIRouter(prefix="/api/app", tags=["app promotions"])


def _show(db: Session, show_id: uuid.UUID) -> Show:
    show = db.get(Show, show_id)
    if show is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Show not found")
    return show


@router.get("/shows/{show_id}/offers", response_model=list[OfferOut])
def offers(show_id: uuid.UUID, db: Session = Depends(get_db)):
    return [OfferOut(code=p.code, title=p.title, details=promotions.describe(p))
            for p in promotions.offers_for(db, _show(db, show_id))]


@router.post("/promotions/apply", response_model=PromoApplyOut)
def apply(body: PromoApplyIn, customer: Customer = Depends(current_customer), db: Session = Depends(get_db)):
    """New total with the code. Nothing is reserved: it's checked again at Pay."""
    show = _show(db, body.show_id)
    seats = list(db.scalars(select(Seat).where(Seat.id.in_(body.seat_ids), Seat.screen_id == show.screen_id)))
    if len(seats) != len(set(body.seat_ids)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Some seats aren't in this hall")
    prices = dict(db.execute(
        select(ShowPrice.seat_class_id, ShowPrice.price_paise).where(ShowPrice.show_id == show.id)).all())
    seat_prices = [prices.get(s.seat_class_id, 0) for s in seats]
    try:
        promo, discount = promotions.check(db, show, customer, body.code, seat_prices)
    except promotions.PromoError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from None
    theatre = db.get(Theatre, show.theatre_id)
    assert theatre
    bd = price(seat_prices, theatre.booking_fee_paise, discount)
    return PromoApplyOut(code=promo.code, title=promo.title, discount_paise=bd.discount_paise, price=PriceOut(
        tickets_paise=bd.tickets_paise, discount_paise=bd.discount_paise, booking_fee_paise=bd.booking_fee_paise,
        gst_paise=bd.gst_paise, total_paise=bd.total_paise))
