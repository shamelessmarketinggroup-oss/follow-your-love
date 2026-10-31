/*
 * Storage layer — real database via Node's built-in SQLite (no npm deps).
 * Config and photos live in separate tables so the config payload stays small
 * and photos are served as their own cacheable endpoint.
 *
 * Swapping to Postgres/Redis later means re-implementing this same small
 * surface: getConfig / setConfig / getPhoto / setPhoto / isEmpty.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS devices (device TEXT PRIMARY KEY, config TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS photos  (device TEXT PRIMARY KEY, data   TEXT NOT NULL);
`);

const upsertConfig = db.prepare('INSERT INTO devices(device, config) VALUES(?, ?) ON CONFLICT(device) DO UPDATE SET config=excluded.config');
const selConfig    = db.prepare('SELECT config FROM devices WHERE device=?');
const upsertPhoto  = db.prepare('INSERT INTO photos(device, data) VALUES(?, ?) ON CONFLICT(device) DO UPDATE SET data=excluded.data');
const selPhoto     = db.prepare('SELECT data FROM photos WHERE device=?');
const countDevices = db.prepare('SELECT COUNT(*) AS c FROM devices');

function getConfig(device) {
  const r = selConfig.get(device);
  return r ? JSON.parse(r.config) : null;
}
function setConfig(device, cfg) {
  const c = Object.assign({}, cfg);
  delete c.photo;            // photos are stored separately
  upsertConfig.run(device, JSON.stringify(c));
}
function getPhoto(device) {
  const r = selPhoto.get(device);
  return r ? r.data : null;
}
function setPhoto(device, dataUrl) {
  if (dataUrl) upsertPhoto.run(device, dataUrl);
}
function isEmpty() {
  return countDevices.get().c === 0;
}

module.exports = { getConfig, setConfig, getPhoto, setPhoto, isEmpty };
