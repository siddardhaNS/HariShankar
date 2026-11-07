from dataclasses import dataclass

from app.config import get_settings


@dataclass
class PriceBreakdown:
    tickets_paise: int
    discount_paise: int
    booking_fee_paise: int
    gst_paise: int
    total_paise: int


def price(seat_prices_paise: list[int], booking_fee_per_ticket_paise: int, discount_paise: int = 0) -> PriceBreakdown:
    """Ticket prices + booking fee per ticket + GST on the booking fee.

    Mockup check: 2 x ₹150 + 2 x ₹20 fee + 18% GST on ₹40 = ₹347.20.
    Discounts (offers, a later milestone) come off the ticket price only.
    """
    tickets = sum(seat_prices_paise)
    discount = min(discount_paise, tickets)
    fee = booking_fee_per_ticket_paise * len(seat_prices_paise)
    gst = round(fee * get_settings().gst_rate_on_fee_bp / 10_000)
    return PriceBreakdown(tickets, discount, fee, gst, tickets - discount + fee + gst)
