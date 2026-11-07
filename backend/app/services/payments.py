"""Payment gateway interface.

The real gateway isn't chosen yet (Razorpay is planned). Booking code only
talks to `PaymentGateway`.

- `UpiDirectGateway` (default for now): no integration. The app opens the
  customer's UPI app with a `upi://pay` link to the theatre's UPI ID. The
  customer then enters the UPI reference (UTR), and staff confirm the money
  arrived. Refunds can't be sent automatically, so they're flagged for staff
  to send by hand.
- `FakeGateway` (development and tests): instant test payments that run the
  same confirmation code a real gateway webhook will.
"""
import secrets
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import quote, urlencode

from app.config import get_settings


@dataclass
class Payee:
    upi_id: str | None
    name: str


@dataclass
class GatewayOrder:
    order_id: str
    amount_paise: int
    gateway: str
    key_id: str | None = None  # public key for a gateway's checkout (Razorpay later)
    upi_url: str | None = None  # direct UPI: link that opens the customer's UPI app


class PaymentGateway(Protocol):
    name: str
    automatic_refunds: bool

    def create_order(self, amount_paise: int, receipt: str, payee: Payee) -> GatewayOrder: ...

    def refund(self, payment_id: str, amount_paise: int) -> str | None: ...


class FakeGateway:
    name = "fake"
    automatic_refunds = True

    def create_order(self, amount_paise: int, receipt: str, payee: Payee) -> GatewayOrder:
        return GatewayOrder(order_id=f"order_fake_{secrets.token_hex(8)}", amount_paise=amount_paise, gateway=self.name)

    def refund(self, payment_id: str, amount_paise: int) -> str | None:
        return f"rfnd_fake_{secrets.token_hex(6)}"


def upi_link(upi_id: str, name: str, amount_paise: int, ref: str) -> str:
    """Standard UPI deep link (NPCI spec): opens any UPI app with the payee and amount filled in."""
    params = {
        "pa": upi_id,
        "pn": name[:50],
        "am": f"{amount_paise / 100:.2f}",
        "cu": "INR",
        "tn": f"Movie tickets {ref}",
        "tr": ref,
    }
    return "upi://pay?" + urlencode(params, quote_via=quote)


class UpiDirectGateway:
    name = "upi"
    automatic_refunds = False

    def create_order(self, amount_paise: int, receipt: str, payee: Payee) -> GatewayOrder:
        if not payee.upi_id:
            raise PaymentsNotSetUp("The theatre hasn't added its UPI ID yet")
        return GatewayOrder(
            order_id=f"upi_{receipt}",
            amount_paise=amount_paise,
            gateway=self.name,
            upi_url=upi_link(payee.upi_id, payee.name, amount_paise, receipt),
        )

    def refund(self, payment_id: str, amount_paise: int) -> str | None:
        return None  # staff send it back by UPI and mark it sent in the admin


class PaymentsNotSetUp(Exception):
    pass


def get_gateway(name: str | None = None) -> PaymentGateway:
    s = get_settings()
    name = name or s.payment_gateway
    if name in ("fake", "demo"):
        if not s.is_dev:
            raise RuntimeError("Fake payments are only for development. Set PAYMENT_GATEWAY.")
        return FakeGateway()
    if name == "upi":
        return UpiDirectGateway()
    raise RuntimeError(f"Payment gateway {name!r} is not set up yet")
