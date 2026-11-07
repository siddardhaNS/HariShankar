"""Admin: promotional messages (WhatsApp and app notifications) and the message log (owner only)."""
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.db import get_db
from app.deps import require_roles
from app.models import Booking, Campaign, Message, StaffUser
from app.models.enums import StaffRole
from app.schemas.admin import AudienceCount, CampaignIn, CampaignOut, MessageLogOut
from app.services import push, whatsapp

router = APIRouter(prefix="/api/admin/messages", tags=["admin messages"])
owner_only = require_roles(StaffRole.owner)


def _out(db: Session, rows: list[Campaign]) -> list[CampaignOut]:
    counts: dict = {}
    if rows:
        for cid, st, n in db.execute(select(Message.campaign_id, Message.status, func.count())
                                     .where(Message.campaign_id.in_([c.id for c in rows]))
                                     .group_by(Message.campaign_id, Message.status)):
            counts.setdefault(cid, {})[st] = n
    out = []
    for c in rows:
        o = CampaignOut.model_validate(c)
        o.sent, o.skipped, o.failed = (counts.get(c.id, {}).get(k, 0) for k in ("sent", "skipped", "failed"))
        out.append(o)
    return out


@router.get("/audience", response_model=list[AudienceCount])
def audience_sizes(user: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    """How many customers each audience reaches (only those who turned on offers),
    and how many of them can get app notifications."""
    out = []
    for a in ("all", "recent_90", "recent_30"):
        people = whatsapp.audience(db, user.theatre_id, a)
        out.append(AudienceCount(audience=a, customers=len(people), with_app=len(push.has_app(db, [p.id for p in people]))))
    return out


@router.get("/campaigns", response_model=list[CampaignOut])
def campaigns(user: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    rows = list(db.scalars(select(Campaign).where(Campaign.theatre_id == user.theatre_id)
                           .order_by(Campaign.created_at.desc()).limit(50)))
    return _out(db, rows)


@router.post("/campaigns", response_model=CampaignOut, status_code=status.HTTP_201_CREATED)
def send_campaign(body: CampaignIn, user: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    now = datetime.now(UTC)
    at = body.send_after or now
    if at < now - timedelta(minutes=5):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick a time from now on")
    if at > now + timedelta(days=30):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Schedule it within 30 days")
    c = Campaign(theatre_id=user.theatre_id, title=body.title.strip(), body=body.body.strip(), audience=body.audience,
                 channel=body.channel, send_after=at, created_by=user.id)
    db.add(c)
    db.flush()
    if whatsapp.queue_campaign(db, c) == 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "No customers in this audience have the app with notifications on yet"
                            if body.channel == "push" else "No customers in this audience have turned on offers yet")
    audit.record(db, user, "campaign_queued", "campaign", c.id, audience=c.audience, channel=c.channel,
                 recipients=c.recipients)
    db.commit()
    return _out(db, [c])[0]


@router.post("/campaigns/{campaign_id}/cancel", response_model=CampaignOut)
def cancel_campaign(campaign_id: uuid.UUID, user: StaffUser = Depends(owner_only), db: Session = Depends(get_db)):
    """Stop the messages that haven't gone yet."""
    c = db.scalar(select(Campaign).where(Campaign.id == campaign_id, Campaign.theatre_id == user.theatre_id))
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    for m in db.scalars(select(Message).where(Message.campaign_id == c.id, Message.status == "queued")):
        m.status, m.error = "skipped", "cancelled by the owner"
    c.status = "done"
    audit.record(db, user, "campaign_cancelled", "campaign", c.id)
    db.commit()
    return _out(db, [c])[0]


@router.get("/log", response_model=list[MessageLogOut])
def message_log(kind: str | None = Query(default=None, max_length=24), user: StaffUser = Depends(owner_only),
                db: Session = Depends(get_db)):
    """Latest messages, automatic and promotional."""
    q = (select(Message, Booking.code).outerjoin(Booking, Booking.id == Message.booking_id)
         .where(Message.theatre_id == user.theatre_id).order_by(Message.created_at.desc()).limit(100))
    if kind:
        q = q.where(Message.kind == kind)
    return [MessageLogOut(id=m.id, kind=m.kind, channel=m.channel, mobile=m.mobile, body=m.body, status=m.status, error=m.error,
                          send_after=m.send_after, sent_at=m.sent_at, booking_code=code)
            for m, code in db.execute(q)]
