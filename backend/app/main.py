from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    admin_auth,
    admin_bookings,
    admin_catalog,
    admin_messages,
    admin_promotions,
    admin_reports,
    admin_settings,
    admin_shows,
    admin_staff,
    app_auth,
    app_bookings,
    app_catalog,
    app_promotions,
    app_status,
    cron,
    dev_payments,
    gate,
)

settings = get_settings()
app = FastAPI(
    title="Hari Shankar Picture Palace API",
    version="0.2.0",
    # The API docs are for development only
    docs_url="/docs" if settings.is_dev else None,
    redoc_url="/redoc" if settings.is_dev else None,
    openapi_url="/openapi.json" if settings.is_dev else None,
)

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
app.include_router(admin_promotions.router)
app.include_router(admin_reports.router)
app.include_router(admin_messages.router)
app.include_router(admin_settings.router)

# Customer app. During maintenance every route here answers 503 with the
# message, except /api/app/status which the app checks to show it.
app.include_router(app_status.router)
closed_in_maintenance = [Depends(app_status.customer_app_open)]
app.include_router(app_auth.router, dependencies=closed_in_maintenance)
app.include_router(app_catalog.router, dependencies=closed_in_maintenance)
app.include_router(app_bookings.router, dependencies=closed_in_maintenance)
app.include_router(app_promotions.router, dependencies=closed_in_maintenance)

# Gate staff (scanner in the Android app)
app.include_router(gate.router)

# Scheduled work on Vercel
app.include_router(cron.router)

if settings.is_dev:  # test payments, never in production
    app.include_router(dev_payments.router)


@app.get("/health")
def health():
    return {"ok": True}
