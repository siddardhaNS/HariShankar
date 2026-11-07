"""Payment gateway interface.

The gateway is not chosen yet (Razorpay is planned). Booking code only talks
to `PaymentGateway`; the gateway's webhook is what confirms a booking.

`FakeGateway` (development only) issues order and refund IDs locally. The app
then calls the dev-only "test payment" endpoint, which goes through exactly the
same `confirm_payment` path a real webhook will use.
"""
import secrets
from dataclasses import dataclass
from typing import Protocol

from app.config import get_settings


@dataclass
class GatewayOrder:
    order_id: str
    amount_paise: int
    gateway: str
    key_id: str | None = None  # public key the app needs for the gateway's checkout


class PaymentGateway(Protocol):
    name: str

    def create_order(self, amount_paise: int, receipt: str) -> GatewayOrder: ...

    def refund(self, payment_id: str, amount_paise: int) -> str: ...


class FakeGateway:
    name = "fake"

    def create_order(self, amount_paise: int, receipt: str) -> GatewayOrder:
        return GatewayOrder(order_id=f"order_fake_{secrets.token_hex(8)}", amount_paise=amount_paise, gateway=self.name)

    def refund(self, payment_id: str, amount_paise: int) -> str:
        return f"rfnd_fake_{secrets.token_hex(6)}"


def get_gateway() -> PaymentGateway:
    s = get_settings()
    if s.payment_gateway == "fake":
        if not s.is_dev:
            raise RuntimeError("Fake payments are only for development. Set PAYMENT_GATEWAY.")
        return FakeGateway()
    raise RuntimeError(f"Payment gateway {s.payment_gateway!r} is not set up yet")
