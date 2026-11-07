from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://hs:hs_dev_password@localhost:5433/harishankar"
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    admin_token_hours: int = 12
    cors_origins: str = "http://localhost:3000"

    # "development" enables the console OTP and the fake payment gateway
    app_env: str = "development"

    # PIN brute-force protection
    max_failed_pin_attempts: int = 5
    pin_lockout_minutes: int = 15

    # Customer app
    customer_token_days: int = 30
    otp_provider: str = "console"      # console | msg91 | ... (decided later)
    otp_ttl_minutes: int = 5
    otp_max_sends_per_hour: int = 5
    otp_max_attempts: int = 5
    payment_gateway: str = "upi"       # upi (direct, no gateway) | fake (dev/tests) | razorpay later
    payment_window_minutes: int = 15   # a pending booking older than this is abandoned
    max_seats_per_booking: int = 10
    gst_rate_on_fee_bp: int = 1800     # 18% GST on the booking fee, in basis points

    # Gate
    gate_opens_minutes_before: int = 60  # tickets can be scanned from this long before the show
    gate_undo_minutes: int = 5           # a wrong entry can be undone by the same staff for this long

    @property
    def is_dev(self) -> bool:
        return self.app_env == "development"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
