/*
 * Follow your love — backend (zero npm deps, Node 22+)
 *   /api/config   GET/POST  per-device config (SQLite, photo stored separately)
 *   /api/photo    GET       the device's photo as image bytes
 *   /api/flight   GET       AeroDataBox flight status (mock fallback)
 *   /api/weather  GET       Open-Meteo current conditions (mock fallback)
 *   /api/geocode  GET       Open-Meteo geocoding: city -> lat/lon/timezone
 *   everything else         static files from public/
 *
 * Storage is a real database (Node's built-in SQLite) in store.js.
 * With no AERODATABOX_KEY (or on any error) the flight endpoint returns a
 * believable London->Sydney leg so the whole thing runs offline.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const store = require('./store');
const SEED_PHOTO = require('./seed-photo');

const PORT = process.env.PORT || 3000;
const KEY = process.env.AERODATABOX_KEY || '';
const ADB_HOST = 'aerodatabox.p.rapidapi.com';
const PUB = path.join(__dirname, 'public');

/* ---------- seed demo on first run ---------- */
if (store.isEmpty()) {
  store.setConfig('demo', {
    device: 'demo', partnerName: 'Karl', flight: { number: 'QF2', date: '' }, destinationCity: 'Sydney',
    home: { city: 'Sydney', lat: -33.8688, lon: 151.2093, timezone: 'Australia/Sydney' }
  });
  store.setPhoto('demo', SEED_PHOTO);
}

/* ---------- helpers ---------- */
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
function send(res, code, body, type) { res.writeHead(code, { 'Content-Type': type || 'text/plain' }); res.end(body); }
function sendJSON(res, obj, code) { send(res, code || 200, JSON.stringify(obj), 'application/json'); }
function readBody(req) { return new Promise(r => { let d = ''; req.on('data', c => { d += c; if (d.length > 15e6) req.destroy(); }); req.on('end', () => r(d)); }); }
function pick(...v) { return v.find(x => x !== undefined && x !== null); }

/* ---------- flight ---------- */
function mockFlight() {
  const now = Date.now();
  return {
    number: 'QF2', status: 'EnRoute', mock: true,
    dep: { iata: 'LHR', city: 'London', lat: 51.4706, lon: -0.4619, time: new Date(now - 11 * 3600e3).toISOString() },
    arr: { iata: 'SYD', city: 'Sydney', lat: -33.9461, lon: 151.1772, time: new Date(now + 11 * 3600e3).toISOString() },
    live: null, distanceKm: 16983
  };
}
function normalizeFlight(f) {
  if (!f) return null;
  const dep = f.departure || {}, arr = f.arrival || {};
  const da = dep.airport || {}, aa = arr.airport || {};
  const depT = (dep.revisedTime || dep.runwayTime || dep.scheduledTime || {}).utc;
  const arrT = (arr.predictedTime || arr.revisedTime || arr.runwayTime || arr.scheduledTime || {}).utc;
  const loc = f.location;
  const iso = t => t ? new Date(String(t).replace(' ', 'T')).toISOString() : null;
  return {
    number: f.number || '', status: f.status || '',
    dep: { iata: da.iata || '', city: da.municipalityName || da.shortName || '', lat: da.location && da.location.lat, lon: da.location && da.location.lon, time: iso(depT) },
    arr: { iata: aa.iata || '', city: aa.municipalityName || aa.shortName || '', lat: aa.location && aa.location.lat, lon: aa.location && aa.location.lon, time: iso(arrT) },
    live: loc ? { lat: loc.lat, lon: loc.lon, altFt: pick(loc.altitude && loc.altitude.feet, loc.altitude), gsKmh: pick(loc.groundSpeed && loc.groundSpeed.kmPerHour, loc.groundSpeed) } : null,
    distanceKm: f.greatCircleDistance && f.greatCircleDistance.km
  };
}
async function getFlight(number, date) {
  if (!KEY || !number || !date) return mockFlight();
  try {
    const url = `https://${ADB_HOST}/flights/number/${encodeURIComponent(number)}/${encodeURIComponent(date)}?withLocation=true&withAircraftImage=false`;
    const r = await fetch(url, { headers: { 'X-RapidAPI-Key': KEY, 'X-RapidAPI-Host': ADB_HOST } });
    if (!r.ok) return mockFlight();
    const data = await r.json();
    const legs = Array.isArray(data) ? data : (data ? [data] : []);
    return normalizeFlight(legs[legs.length - 1]) || mockFlight();
  } catch (e) { return mockFlight(); }
}

/* ---------- weather + geocode (Open-Meteo, no key) ---------- */
async function getWeather(lat, lon) {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`);
    if (!r.ok) throw 0;
    const j = await r.json();
    return { tempC: Math.round(j.current.temperature_2m), code: j.current.weather_code, timezone: j.timezone };
  } catch (e) { return { tempC: 18, code: 2, timezone: 'Australia/Sydney', mock: true }; }
}
async function getGeocode(q) {
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
    if (!r.ok) throw 0;
    const g = ((await r.json()).results || [])[0];
    return g ? { city: g.name, country: g.country, lat: g.latitude, lon: g.longitude, timezone: g.timezone } : null;
  } catch (e) { return { city: q || 'Sydney', lat: -33.8688, lon: 151.2093, timezone: 'Australia/Sydney', mock: true }; }
}

/* ---------- photo ---------- */
function sendPhoto(res, dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || '');
  if (!m) return send(res, 404, 'no photo');
  res.writeHead(200, { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=60' });
  res.end(Buffer.from(m[2], 'base64'));
}

/* ---------- static ---------- */
function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const fp = path.join(PUB, path.normalize(rel));
  if (!fp.startsWith(PUB)) return send(res, 403, 'forbidden');
  fs.readFile(fp, (err, buf) => err ? send(res, 404, 'not found') : send(res, 200, buf, MIME[path.extname(fp)] || 'application/octet-stream'));
}

/* ---------- routes ---------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  const device = u.searchParams.get('device') || 'demo';
  try {
    if (p === '/api/config' && req.method === 'GET') return sendJSON(res, store.getConfig(device));
    if (p === '/api/config' && req.method === 'POST') {
      let c; try { c = JSON.parse(await readBody(req)); } catch (e) { return sendJSON(res, { error: 'bad json' }, 400); }
      if (!c || !c.device) return sendJSON(res, { error: 'device required' }, 400);
      store.setConfig(c.device, c);
      if (c.photo) store.setPhoto(c.device, c.photo);
      return sendJSON(res, { ok: true });
    }
    if (p === '/api/photo' && req.method === 'GET') return sendPhoto(res, store.getPhoto(device));
    if (p === '/api/flight' && req.method === 'GET') return sendJSON(res, await getFlight((u.searchParams.get('number') || '').trim(), (u.searchParams.get('date') || '').trim()));
    if (p === '/api/weather' && req.method === 'GET') return sendJSON(res, await getWeather(u.searchParams.get('lat'), u.searchParams.get('lon')));
    if (p === '/api/geocode' && req.method === 'GET') return sendJSON(res, await getGeocode((u.searchParams.get('q') || '').trim()));
    return serveStatic(res, p);
  } catch (e) { sendJSON(res, { error: 'server' }, 500); }
});

server.listen(PORT, () => {
  console.log(`Follow your love -> http://localhost:${PORT}`);
  console.log(`  Display: http://localhost:${PORT}/?device=demo`);
  console.log(`  Setup:   http://localhost:${PORT}/setup.html`);
  console.log(KEY ? '  Flights: AeroDataBox (live)' : '  Flights: MOCK (set AERODATABOX_KEY for live data)');
});
