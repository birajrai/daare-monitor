const db = require('./database');
const settings = require('./settings');
const scheduler = require('./scheduler');
const queries = require('../queries/monitor-queries');
const { formatMonitorRows, formatMonitorRow } = require('../utils/monitor-view');
const {
  sanitizeSlug,
  sanitizeMonitorType,
  isValidSlug,
  isValidMonitorType,
  isValidMonitorTarget,
} = require('../utils/validators');

async function validateIntervalSeconds(inputSeconds) {
  const intervalSeconds = Number(inputSeconds);
  if (!Number.isFinite(intervalSeconds)) return { error: 'Invalid monitor input' };

  const appSettings = await settings.getSettings();
  const intervalMs = Math.floor(intervalSeconds * 1000);
  if (intervalMs < appSettings.monitoring.minIntervalMs || intervalMs > appSettings.monitoring.maxIntervalMs) {
    return { error: 'Interval must be between 10 seconds and 1 hour' };
  }

  return { intervalMs };
}

async function parseMonitorPayload(payload, options = {}) {
  const name = String(payload.name || '').trim();
  const slug = sanitizeSlug(payload.slug);
  const monitorType = sanitizeMonitorType(payload.monitor_type);
  const url = String(payload.url || '').trim();
  const oldSlug = options.requireOldSlug ? sanitizeSlug(payload.old_slug) : null;

  if (
    !name ||
    !isValidSlug(slug) ||
    !isValidMonitorType(monitorType) ||
    !isValidMonitorTarget(monitorType, url) ||
    (options.requireOldSlug && !isValidSlug(oldSlug))
  ) {
    return { error: 'Invalid monitor input' };
  }

  const interval = await validateIntervalSeconds(payload.interval_seconds);
  if (interval.error) return interval;

  return {
    name,
    slug,
    oldSlug,
    monitorType,
    url,
    intervalMs: interval.intervalMs,
  };
}

async function listMonitors() {
  const monitors = await db.all(queries.adminMonitors);
  return formatMonitorRows(monitors);
}

async function getMonitorForEdit(slug) {
  const cleanSlug = sanitizeSlug(slug);
  if (!isValidSlug(cleanSlug)) return null;
  const monitor = await db.get(queries.adminMonitorBySlug, [cleanSlug]);
  return monitor ? formatMonitorRow(monitor) : null;
}

async function createMonitor(payload) {
  const parsed = await parseMonitorPayload(payload);
  if (parsed.error) return parsed;

  const existing = await db.get('SELECT slug FROM monitors WHERE slug = ?', [parsed.slug]);
  if (existing) return { error: 'Slug already exists' };

  await db.run('INSERT INTO monitors (name, slug, url, monitor_type, interval) VALUES (?, ?, ?, ?, ?)', [
    parsed.name,
    parsed.slug,
    parsed.url,
    parsed.monitorType,
    parsed.intervalMs,
  ]);

  await scheduler.refreshMonitorNow(parsed.slug);

  return { ok: true };
}

async function editMonitor(payload) {
  const parsed = await parseMonitorPayload(payload, { requireOldSlug: true });
  if (parsed.error) return parsed;

  const current = await db.get('SELECT slug FROM monitors WHERE slug = ?', [parsed.oldSlug]);
  if (!current) return { error: 'Monitor not found', status: 404 };

  if (parsed.slug !== parsed.oldSlug) {
    const existing = await db.get('SELECT slug FROM monitors WHERE slug = ?', [parsed.slug]);
    if (existing) return { error: 'Slug already exists' };
  }

  await db.run('BEGIN TRANSACTION');
  try {
    await db.run('UPDATE monitors SET name = ?, slug = ?, url = ?, monitor_type = ?, interval = ? WHERE slug = ?', [
      parsed.name,
      parsed.slug,
      parsed.url,
      parsed.monitorType,
      parsed.intervalMs,
      parsed.oldSlug,
    ]);

    if (parsed.slug !== parsed.oldSlug) {
      await db.run('UPDATE monitors_state SET slug = ? WHERE slug = ?', [parsed.slug, parsed.oldSlug]);
      await db.run('UPDATE monitors_status SET slug = ? WHERE slug = ?', [parsed.slug, parsed.oldSlug]);
    }

    await db.run('COMMIT');
    await scheduler.refreshMonitorNow(parsed.slug);
    return { ok: true };
  } catch (err) {
    await db.run('ROLLBACK');
    throw err;
  }
}

async function removeMonitor(slug) {
  const cleanSlug = sanitizeSlug(slug);
  if (!isValidSlug(cleanSlug)) return { error: 'Invalid slug' };

  await db.run('DELETE FROM monitors WHERE slug = ?', [cleanSlug]);
  await db.run('DELETE FROM monitors_state WHERE slug = ?', [cleanSlug]);
  await db.run('DELETE FROM monitors_status WHERE slug = ?', [cleanSlug]);
  return { ok: true };
}

module.exports = {
  listMonitors,
  getMonitorForEdit,
  createMonitor,
  editMonitor,
  removeMonitor,
};
