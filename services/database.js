const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let db;

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function init() {
  const dbDir = path.dirname(config.database.path);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  db = new sqlite3.Database(config.database.path);

  await run('PRAGMA journal_mode=WAL;');
  await run('PRAGMA busy_timeout=5000;');
  await run('PRAGMA synchronous=NORMAL;');

  await run(`
    CREATE TABLE IF NOT EXISTS monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      url TEXT NOT NULL,
      interval INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS monitors_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('UP', 'DOWN')),
      response_time INTEGER,
      status_code INTEGER,
      checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_slug_checked
    ON monitors_status(slug, checked_at DESC)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS monitors_state (
      slug TEXT PRIMARY KEY,
      current_status TEXT NOT NULL,
      last_checked DATETIME,
      uptime_count INTEGER DEFAULT 0,
      downtime_count INTEGER DEFAULT 0
    )
  `);
}

function close() {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    db.close((err) => (err ? reject(err) : resolve()));
  });
}

module.exports = {
  init,
  close,
  run,
  get,
  all,
};