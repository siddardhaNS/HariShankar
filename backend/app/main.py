from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import admin_auth, admin_staff, app_auth, app_bookings, app_catalog, dev_payments

settings = get_settings()
app = FastAPI(title="Hari Shankar Picture Palace API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Admin web
app.include_router(admin_auth.router)
app.include_router(admin_staff.router)

# Customer app
app.include_router(app_auth.router)
app.include_router(app_catalog.router)
app.include_router(app_bookings.router)
if settings.is_dev and settings.payment_gateway == "fake":
    app.include_router(dev_payments.router)


@app.get("/health")
def health():
    return {"ok": True}
