# Hari Shankar Picture Palace

Online ticketing for Hari Shankar Picture Palace, Palasa. Built for one theatre in Phase 1 and ready for many theatres in Phase 2.

| Part | Folder | Stack |
|---|---|---|
| API | `backend/` | Python 3.12, FastAPI, SQLAlchemy 2, Alembic |
| Database | (Docker) | PostgreSQL 16 |
| Admin web | `admin/` | Next.js 16 (App Router), Tailwind CSS 4 |
| Customer app | `mobile/` | React Native (Expo SDK 58, Expo Router), Android first |

## Why this stack

- **Python + FastAPI** fits well: the booking rules are server-side (Razorpay webhooks, seat clashes, refunds, scheduled WhatsApp messages, reports), and Python handles webhooks, background jobs and reports cleanly.
- **The guarantees are in Postgres, not just in code.** "One sale per seat" is a partial unique index on `booking_seats (show_id, seat_id) WHERE holds_seat`, so two payments that finish at the same instant can't both confirm.
- **Ready for many theatres:** every theatre-owned row has `theatre_id`, every admin query is scoped to the logged-in user's theatre, and customers are platform-wide. Phase 2 adds onboarding and the super admin without migrating data.
- All money is stored as integer **paise**.

## Run it locally

Needs Docker Desktop and Node 20+.

```sh
cp .env.example .env            # then set JWT_SECRET and SEED_OWNER_PIN
docker compose up -d            # Postgres + API on :8000 (runs migrations)
docker compose exec api python -m app.seed   # theatre + first Owner login

cd admin
npm install
echo API_URL=http://localhost:8000 > .env.local
npm run dev                     # http://localhost:3000
```

Log in with `SEED_OWNER_MOBILE` and `SEED_OWNER_PIN`. On first login you'll be asked to choose your own PIN.

### Customer app (Android)

```sh
docker compose exec api python -m app.seed_demo   # dev only: hall layout, sample movies, a week of shows

cd mobile
npm install
adb reverse tcp:8000 tcp:8000   # emulator or USB phone reaches the API as localhost
npx expo start --android
```

Over Wi-Fi instead of USB, put `EXPO_PUBLIC_API_URL=http://<your computer's LAN IP>:8000` in `mobile/.env.local`.

**Login code (development):** the SMS provider isn't chosen yet, so the code is printed in the API log: `docker compose logs api | grep "DEV OTP"`.

**Payments (development):** the gateway isn't chosen yet, so after *Pay* the app shows a **Test payment** screen. *Payment succeeds* runs the same server-side confirmation the real gateway webhook will, including the seat-clash refund.

**WhatsApp (development):** the provider isn't chosen yet, so the `worker` service prints each message to its log: `docker compose logs -f worker | grep -A4 "DEV WHATSAPP"`. It sends booking confirmations, refund messages, show reminders (9 AM on the day, and 1 hour before) and the owner's offers from the Messages page. A real provider is one class in `app/services/whatsapp.py`; each message kind becomes one pre-approved WhatsApp template.

### Gate scanner (staff)

In the app: Profile, or the login screen, then *Theatre staff? Open the gate scanner*. Staff log in with the same mobile number and PIN as the admin website (Owner, Manager or Gate staff). The scanner reads the ticket QR, checks its signature, and shows a big result: let in, already in, not paid, wrong show, too early, fake. Groups can enter in parts (2 now, 2 later); a wrong tap can be undone by the same person within 5 minutes. No QR? Type the booking ID. Gates open 60 minutes before the show.

**Without internet** the scanner keeps working: while online it saves today's bookings on the phone (refreshed every minute), checks tickets against that list when the network drops, and syncs who it let in as soon as it's back. If two offline phones let in the same people, the server still records both entries and flags the extra ones. Staff can't log out while entries are waiting to sync.

API docs: http://localhost:8000/docs

### Tests

```sh
docker compose run --rm api pytest -q
```

Migrations after a model change:

```sh
docker compose run --rm api alembic revision --autogenerate -m "what changed"
docker compose run --rm api alembic upgrade head
```

## What's built (milestone 1: admin login)

- Admin login with mobile number and PIN, issuing a 12-hour JWT stored in an httpOnly cookie.
- Five wrong PINs lock the login for 15 minutes. A wrong number and a wrong PIN get the same response and take the same time.
- First login forces a PIN change, and weak PINs (1234, 1111) are refused. Changing or resetting a PIN, disabling a login, or changing a role signs out existing sessions.
- Roles: **Owner** (everything), **Manager** (movies, shows, prices, blocking), **Gate staff** (scanning only). The sidebar and pages follow the role, and the API enforces it.
- Staff page: add logins, change roles, reset PINs, disable or enable. Each change is written to `audit_logs` (change history).
- Admin shell with the mockup's sidebar. It works at phone width for gate staff.
- Core schema: theatres, screens, seat classes, seats (grid layout with aisles), movies, shows, per-class show prices, customers, bookings, booking seats, seat blocks, audit log.

## Customer app (milestone 2)

Screens follow the mockup: Movies (featured, 7-day picker, show times with how full each show is, coming soon), seat picker (view from your seat, best seats for your group, hall map with classes and prices, up to 10 seats), review and pay (price, booking fee, GST), seats-just-booked with the closest seats together, e-ticket with QR, refund screen, My tickets, profile (optional gender and age group, offers and reminders switches), mobile number + OTP login. Light and dark mode follow the phone.

Server side: OTP codes are stored hashed, expire in 5 minutes, max 5 sends an hour and 5 tries per code. The SMS provider and payment gateway sit behind small interfaces (`app/services/otp.py`, `app/services/payments.py`), so adding MSG91 or Razorpay later is one class each and no app change beyond the checkout hand-off. The QR on the ticket is signed so the gate scanner can tell a real ticket from a typed one.

## Roadmap

1. ~~Admin login, roles, staff~~
2. ~~Customer app (React Native, Android): OTP login, Now showing, seat map, checkout, e-ticket, My tickets~~ (SMS and payment gateway to be plugged in)
3. Admin: seat layout, movies, show timings and prices, block rows, cancel a show
4. Razorpay: orders, webhook confirmation, automatic and manual refunds, booking fee and GST
5. ~~Gate scanner in the Android app (QR, booking ID fallback, partial entry)~~
6. ~~Promotions: promo codes at checkout~~
7. ~~Reports (collection, seats, refunds, GST, CSV) and Insights (show times, days, booking lead time, group size, audience, movies)~~
8. ~~Ratings: stars and comments on the ticket after the show; averages in the app and Insights~~
9. ~~WhatsApp messages: booking, refund and reminder messages; owner offers with opt-in, quiet hours and a weekly limit~~ (provider to be plugged in)
10. Razorpay and the SMS provider, when chosen
