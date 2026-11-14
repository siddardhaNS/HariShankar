# Google Play listing: Hari Shankar app

Text and answers to paste into the Play Console. Graphics are in this folder:
`icon-512.png` (App icon) and `feature-graphic-1024x500.png` (Feature graphic).

## Create app

| Field | Value |
|---|---|
| App name | Hari Shankar Picture Palace |
| Default language | English (India) – en-IN |
| App or game | App |
| Free or paid | Free |
| Package name (set by the first upload) | com.harishankarpalace.app |

## Store listing

**App name** (30 characters max): `Hari Shankar Picture Palace`

**Short description** (80 max):

> Book movie tickets at Hari Shankar Picture Palace, Palasa. Pick seats, pay by UPI.

**Full description** (4000 max):

> Book your seats at Hari Shankar Picture Palace, Main Road, Palasa, without queuing at the counter.
>
> • See what's showing today and this week, with show timings and ticket prices for every class.
> • Pick your exact seats on the hall map, or let the app suggest the best seats together.
> • Pay with any UPI app: Google Pay, PhonePe, Paytm, BHIM or your bank's app.
> • Get your ticket with a QR code in the app. Show it at the gate and walk in.
> • Reminders on the morning of the show and an hour before, if you want them.
> • Offers and promo codes from the theatre.
> • Rate the movies you watched.
>
> Log in with your mobile number. No passwords to remember.
>
> Hari Shankar Picture Palace has been part of Palasa's movie nights for years. This is its own app: tickets are sold by the theatre itself.

**App category:** Entertainment
**Tags:** Movies, Tickets
**Contact email:** (to add: the theatre's email)
**Website:** https://harishankar-mu.vercel.app
**Privacy policy:** https://harishankar-mu.vercel.app/privacy

**Phone screenshots:** `screenshot-1-home.png`, `screenshot-2-best-seats.png`, `screenshot-3-hall-map.png` (1080 x 2400, from the app on the emulator). Up to 8 allowed; 4 or more makes the app eligible for promotion.

## App content

| Section | Answer |
|---|---|
| Privacy policy | https://harishankar-mu.vercel.app/privacy |
| App access | Some features need a login. Give Google a test login: add a number under Staff → App test logins on the admin site, and enter that number and its code here ("Log in with mobile number, then enter the 6-digit code"). |
| Ads | No, the app has no ads |
| Content rating | Questionnaire: category "All other app types". No violence, sexual content, language, drugs or gambling. Users don't interact with each other; no sharing of location; purchases of physical goods/services: Yes (movie tickets). Expect a rating of Everyone / 3+. |
| Target audience | 13 and over (13–15, 16–17, 18 and over). Not designed for children. |
| News app | No |
| Government app | No |
| Financial features | None of the listed (payments go to the theatre's UPI ID through the user's own UPI app; the app holds no money) |
| Health | No |
| Data safety | See below |
| Account deletion URL | https://harishankar-mu.vercel.app/delete-account |

## Data safety

**Does your app collect or share any of the required user data types?** Yes
**Is all of the user data collected by your app encrypted in transit?** Yes
**Do you provide a way for users to request that their data is deleted?** Yes (in the app, and the deletion URL above)

Data collected (none is "shared" in Play's sense: the providers that run the app for us don't count as sharing):

| Data type | Collected | Required or optional | Purposes |
|---|---|---|---|
| Personal info → Name | Yes | Optional | App functionality (name on ticket) |
| Personal info → Phone number | Yes | Required | App functionality, Account management, Developer communications (tickets and reminders) |
| Personal info → Other info (gender, age group) | Yes | Optional | Analytics (counted in totals) |
| Financial info → Purchase history | Yes | Required | App functionality (bookings, refunds) |
| Financial info → Other financial info (UPI reference number) | Yes | Required | App functionality (matching the payment) |
| App activity → Other user-generated content (movie ratings) | Yes | Optional | App functionality |
| Device or other IDs (notification token) | Yes | Optional | App functionality (notifications) |

Not collected: location, contacts, photos/videos (the camera reads QR codes for staff only, nothing is stored), audio, files, health, web browsing, calendar, SMS, installed apps, crash logs, advertising ID.

Data is processed ephemerally? No. Is data collection required? Phone number and bookings are required; the rest is optional.

## Permissions to explain if asked

- **Camera:** gate staff scan ticket QR codes in the app's Gate scanner.
- **Notifications:** ticket updates and show reminders.
