# Follow your love — phase 1

An ambient flight display: a device (or any full-screen browser) shows three screens —
a photo of the person you're following, their live flight journey, and an idle clock/weather —
and switches itself to the journey while they're in the air.

Runs **out of the box with mock data** (no key, no internet needed for the demo) and
switches to **real flight + weather data** when you add one API key.

## Run it

Requires **Node 22+** (uses Node's built-in SQLite — no npm dependencies to install).

```bash
npm start          # = node --disable-warning=ExperimentalWarning server.js
```

Open:

- Display: http://localhost:3000/?device=demo
- Setup:   http://localhost:3000/setup.html

The display boots into the seeded demo (Karl, QF2 London → Sydney, with your photo).
On mock data it shows a small control bar to scrub the flight and flip states; that bar
disappears automatically once a real flight is loaded.

## Real data

- **Weather & geocoding** use Open-Meteo — no key, work as soon as the server has internet.
- **Flights** use AeroDataBox via RapidAPI (free tier to start):
  https://rapidapi.com/aedbx-aedbx/api/aerodatabox

```bash
AERODATABOX_KEY=your_key npm start
```

## What's inside

```
server.js          routes + API proxies (keeps your key off the device) + static files
store.js           the database layer — Node built-in SQLite (config + photos)
public/index.html  the display — reads config, flight, weather; renders the 3 screens
public/setup.html  the setup page — writes name / flight / photo / home location
seed-photo.js      the demo photo, embedded for first-run seeding
Dockerfile, fly.toml, DEPLOY.md   deployment
data/app.db        the database (created on first run; lives on a volume in production)
```

API surface:

```
GET  /api/config?device=ID            -> config (without photo)
POST /api/config                      -> save config (+ optional photo)
GET  /api/photo?device=ID             -> the photo as image bytes
GET  /api/flight?number=QF2&date=...  -> normalized flight status (mock fallback)
GET  /api/weather?lat=..&lon=..       -> current weather (mock fallback)
GET  /api/geocode?q=Sydney            -> lat/lon/timezone for a city
```

Data flow: setup writes config → the device reads its config by `?device=ID` → the server
fetches flight + weather and returns clean JSON → the display renders, re-polling flight
every minute and weather every 15 minutes and interpolating the plane locally in between.

## Deploying

See `DEPLOY.md` — Fly.io or Render, each with a persistent volume for `data/` and free HTTPS.
Flash a Raspberry Pi to open `https://your-host/?device=THIS_DEVICE_ID` full-screen and that's
the device; all logic and data stay server-side.

## Notes for later

- SQLite on one volume is great for a single instance and early devices. For multiple
  instances, reimplement `store.js` against a managed database (same five functions).
- The journey's "Over the …" label is a rough region lookup (great-circle position vs.
  coarse bounding boxes) — swap in a real reverse-geocode for precise naming.
- Free API tiers (AeroDataBox free, Open-Meteo non-commercial) are for development;
  license commercial tiers before selling.
