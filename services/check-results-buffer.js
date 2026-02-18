const fs = require('fs');
const path = require('path');
const db = require('./database');

const dataDir = path.join(__dirname, '..', 'data');
const bufferFile = path.join(dataDir, 'check-results.ndjson');

let isFlushing = false;

function ensureBufferFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(bufferFile)) fs.writeFileSync(bufferFile, '', 'utf8');
}

function appendResult(result) {
  ensureBufferFile();
  fs.appendFileSync(bufferFile, `${JSON.stringify(result)}\n`, 'utf8');
}

function aggregateStateRows(results) {
  const bySlug = new Map();
  for (const row of results) {
    const existing = bySlug.get(row.slug) || {
      slug: row.slug,
      currentStatus: row.status,
      lastChecked: row.checkedAt,
      up: 0,
      down: 0,
    };

    existing.currentStatus = row.status;
    existing.lastChecked = row.checkedAt;
    if (row.status === 'UP') existing.up += 1;
    if (row.status === 'DOWN') existing.down += 1;
    bySlug.set(row.slug, existing);
  }

  return [...bySlug.values()];
}

async function flushToDb() {
  if (isFlushing) return;
  isFlushing = true;

  try {
    ensureBufferFile();
    const raw = fs.readFileSync(bufferFile, 'utf8');
    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const results = lines.map((line) => JSON.parse(line));
    const stateRows = aggregateStateRows(results);

    await db.run('BEGIN TRANSACTION');
    try {
      for (const row of results) {
        await db.run(
          'INSERT INTO monitors_status (slug, status, response_time, status_code, details_json, checked_at) VALUES (?, ?, ?, ?, ?, ?)',
          [row.slug, row.status, row.responseTime, row.statusCode, row.detailsJson, row.checkedAt]
        );
      }

      for (const row of stateRows) {
        await db.run(
          `INSERT INTO monitors_state (slug, current_status, last_checked, uptime_count, downtime_count)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (slug) DO UPDATE
           SET current_status = EXCLUDED.current_status,
               last_checked = EXCLUDED.last_checked,
               uptime_count = monitors_state.uptime_count + EXCLUDED.uptime_count,
               downtime_count = monitors_state.downtime_count + EXCLUDED.downtime_count`,
          [row.slug, row.currentStatus, row.lastChecked, row.up, row.down]
        );
      }

      await db.run('COMMIT');
      fs.writeFileSync(bufferFile, '', 'utf8');
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }
  } finally {
    isFlushing = false;
  }
}

module.exports = {
  appendResult,
  flushToDb,
};
