import enum


class StaffRole(str, enum.Enum):
    super_admin = "super_admin"  # Phase 2: platform owner, no theatre
    owner = "owner"              # everything
    manager = "manager"          # movies, shows, prices, blocking
    gate = "gate"                # scanning only


class TheatreStatus(str, enum.Enum):
    pending = "pending"
    active = "active"
    suspended = "suspended"


class MovieStatus(str, enum.Enum):
    coming_soon = "coming_soon"
    now_showing = "now_showing"
    archived = "archived"


class ShowStatus(str, enum.Enum):
    scheduled = "scheduled"
    cancelled = "cancelled"


class BookingStatus(str, enum.Enum):
    payment_pending = "payment_pending"  # order created, payment not yet received
    payment_review = "payment_review"    # direct UPI: customer gave the UPI reference, staff to check it arrived
    confirmed = "confirmed"
    failed = "failed"                    # payment failed / seat clash before charge
    refunded = "refunded"
    cancelled = "cancelled"              # show cancelled (refund follows)


class Gender(str, enum.Enum):
    male = "male"
    female = "female"
    other = "other"
    not_said = "not_said"


class AgeGroup(str, enum.Enum):
    under_18 = "under_18"
    a18_24 = "18_24"
    a25_34 = "25_34"
    a35_44 = "35_44"
    a45_59 = "45_59"
    a60_plus = "60_plus"
    not_said = "not_said"
