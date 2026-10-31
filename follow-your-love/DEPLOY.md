# Deploying Follow your love

The app is a single Node process with a SQLite database in `DATA_DIR`. To deploy,
you need a host that runs Node and gives you **one persistent volume** for that
directory. Two easy options below. Both give free HTTPS, which you need so phones
can open the setup page and the device can load over `https://`.

A note on scale: SQLite on one persistent volume is perfect for a single instance
and plenty for early devices. If you ever run multiple instances, move the store to
a managed database — only `store.js` changes (same five functions).

---

## Option A — Fly.io (recommended)

A sample `fly.toml` is included (region `syd`, a 1-machine service kept warm, and a
volume mounted at `/data`).

```bash
# 1. install flyctl and log in
#    https://fly.io/docs/flyctl/install/
fly auth login

# 2. pick a unique app name (edit `app = ` in fly.toml first), then:
fly launch --no-deploy --copy-config

# 3. create the persistent volume the config matches
fly volumes create fyl_data --size 1 --region syd

# 4. (optional) live flight data — store your AeroDataBox key as a secret
fly secrets set AERODATABOX_KEY=your_rapidapi_key

# 5. deploy
fly deploy
```

Then:

- Setup:   `https://your-app.fly.dev/setup.html`
- Display: `https://your-app.fly.dev/?device=demo`

`min_machines_running = 1` keeps the server awake so a wall-mounted device never
hits a cold start. It's one tiny machine — cheap, but not free-forever; drop it to 0
if you don't mind a few seconds of spin-up.

---

## Option B — Render

1. Push this folder to a Git repo and create a new **Web Service** from it.
2. Render auto-detects the `Dockerfile`.
3. Add a **Disk**: mount path `/data`, size 1 GB.
4. Add environment variables: `DATA_DIR=/data`, and `AERODATABOX_KEY` if you have one.
5. Deploy. Your URLs are `https://your-app.onrender.com/setup.html` and `…/?device=demo`.

---

## After deploying

1. Open `…/setup.html`, fill in the person, flight number + date, photo, and home city, save.
2. Point the device's kiosk browser at `…/?device=YOUR_DEVICE_ID` in full-screen.
3. Each device is just a different `device` value — set up as many as you like from the
   same setup page.

Weather and geocoding work immediately (Open-Meteo, no key). Flights show realistic mock
data until you set `AERODATABOX_KEY`, after which a real flight number + date drives the
journey screen with live airports, times, status, and position when available.
