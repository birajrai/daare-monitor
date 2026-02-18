// ==========================
// File: services/database.js
// ==========================
const sqlite3 = require('sqlite3').verbose();
const config = require('../config');

let db;

function init() {
    db = new sqlite3.Database(config.database.path);

    db.serialize(() => {
        db.run('PRAGMA journal_mode=WAL;');
        db.run('PRAGMA synchronous=NORMAL;');
        db.run('PRAGMA busy_timeout=5000;');

        db.run(`
      CREATE TABLE IF NOT EXISTS monitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        url TEXT NOT NULL,
        interval INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

        db.run(`
      CREATE TABLE IF NOT EXISTS monitors_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL,
        status TEXT NOT NULL,
        response_time INTEGER,
        status_code INTEGER,
        checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

        db.run(`
      CREATE INDEX IF NOT EXISTS idx_slug_checked
      ON monitors_status(slug, checked_at DESC)
    `);

        db.run(`
      CREATE TABLE IF NOT EXISTS monitors_state (
        slug TEXT PRIMARY KEY,
        current_status TEXT NOT NULL,
        last_checked DATETIME,
        uptime_count INTEGER DEFAULT 0,
        downtime_count INTEGER DEFAULT 0
      )
    `);
    });
}

function getDB() {
    return db;
}

module.exports = { init, getDB };
