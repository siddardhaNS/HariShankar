from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    admin_auth,
    admin_bookings,
    admin_catalog,
    admin_shows,
    admin_staff,
    app_auth,
    app_bookings,
    app_catalog,
    dev_payments,
    gate,
)

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
app.include_router(admin_catalog.router)
app.include_router(admin_shows.router)
app.include_router(admin_bookings.router)

# Customer app
app.include_router(app_auth.router)
app.include_router(app_catalog.router)
app.include_router(app_bookings.router)

# Gate staff (scanner in the Android app)
app.include_router(gate.router)
if settings.is_dev:  # test payments, never in production
    app.include_router(dev_payments.router)


@app.get("/health")
def health():
    return {"ok": True}
