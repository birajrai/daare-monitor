const db = require('./database');
const { formatMonitorRows } = require('../utils/monitor-view');
const { sanitizeSlug, isValidSlug } = require('../utils/validators');

function parsePagePayload(payload) {
  const title = String(payload.title || '').trim();
  const slug = sanitizeSlug(payload.slug);
  const description = String(payload.description || '').trim();
  const selected = Array.isArray(payload.monitor_slugs)
    ? payload.monitor_slugs
    : payload.monitor_slugs
      ? [payload.monitor_slugs]
      : [];

  const monitorSlugs = selected.map(sanitizeSlug).filter(isValidSlug);
  if (!title || !isValidSlug(slug)) return { error: 'Invalid status page input' };

  return { title, slug, description, monitorSlugs };
}

async function listPages() {
  return db.all('SELECT title, slug, description, created_at FROM status_pages ORDER BY created_at DESC');
}

async function listMonitorOptions() {
  return db.all('SELECT name, slug FROM monitors ORDER BY name ASC');
}

async function getPageWithMonitors(slug) {
  const cleanSlug = sanitizeSlug(slug);
  if (!isValidSlug(cleanSlug)) return null;

  const page = await db.get('SELECT title, slug, description FROM status_pages WHERE slug = ?', [cleanSlug]);
  if (!page) return null;

  const monitors = await db.all(
    `SELECT
      m.name, m.slug, m.url, m.hide_url, m.monitor_type, m.interval,
      COALESCE(ms.current_status, 'UNKNOWN') AS current_status,
      ms.last_checked, ms.uptime_count, ms.downtime_count,
      (
        SELECT s.response_time
        FROM monitors_status s
        WHERE s.slug = m.slug
        ORDER BY s.checked_at DESC
        LIMIT 1
      ) AS response_time,
      (
        SELECT s.status_code
        FROM monitors_status s
        WHERE s.slug = m.slug
        ORDER BY s.checked_at DESC
        LIMIT 1
      ) AS status_code,
      (
        SELECT s.details_json
        FROM monitors_status s
        WHERE s.slug = m.slug
        ORDER BY s.checked_at DESC
        LIMIT 1
      ) AS details_json
    FROM status_page_monitors spm
    INNER JOIN monitors m ON m.slug = spm.monitor_slug
    LEFT JOIN monitors_state ms ON ms.slug = m.slug
    WHERE spm.page_slug = ?
    ORDER BY spm.order_index ASC, m.name ASC`,
    [cleanSlug],
  );

  return { page, monitors: formatMonitorRows(monitors) };
}

async function getPageForEdit(slug) {
  const cleanSlug = sanitizeSlug(slug);
  if (!isValidSlug(cleanSlug)) return null;

  const page = await db.get('SELECT title, slug, description FROM status_pages WHERE slug = ?', [cleanSlug]);
  if (!page) return null;

  const selectedRows = await db.all(
    'SELECT monitor_slug FROM status_page_monitors WHERE page_slug = ? ORDER BY order_index ASC',
    [cleanSlug],
  );
  const selectedMonitorSlugs = selectedRows.map((row) => row.monitor_slug);
  const monitors = await listMonitorOptions();

  return { page, monitors, selectedMonitorSlugs };
}

async function createPage(payload) {
  const parsed = parsePagePayload(payload);
  if (parsed.error) return parsed;

  const existing = await db.get('SELECT slug FROM status_pages WHERE slug = ?', [parsed.slug]);
  if (existing) return { error: 'Status page slug already exists' };

  await db.run('BEGIN TRANSACTION');
  try {
    await db.run('INSERT INTO status_pages (title, slug, description) VALUES (?, ?, ?)', [
      parsed.title,
      parsed.slug,
      parsed.description || null,
    ]);

    for (let i = 0; i < parsed.monitorSlugs.length; i += 1) {
      await db.run(
        'INSERT INTO status_page_monitors (page_slug, monitor_slug, order_index) VALUES (?, ?, ?)',
        [parsed.slug, parsed.monitorSlugs[i], i],
      );
    }

    await db.run('COMMIT');
    return { ok: true };
  } catch (err) {
    await db.run('ROLLBACK');
    throw err;
  }
}

async function editPage(originalSlug, payload) {
  const currentSlug = sanitizeSlug(originalSlug);
  if (!isValidSlug(currentSlug)) return { error: 'Invalid status page slug' };

  const parsed = parsePagePayload(payload);
  if (parsed.error) return parsed;

  const current = await db.get('SELECT slug FROM status_pages WHERE slug = ?', [currentSlug]);
  if (!current) return { error: 'Status page not found', status: 404 };

  if (parsed.slug !== currentSlug) {
    const existing = await db.get('SELECT slug FROM status_pages WHERE slug = ?', [parsed.slug]);
    if (existing) return { error: 'Status page slug already exists' };
  }

  await db.run('BEGIN TRANSACTION');
  try {
    await db.run('UPDATE status_pages SET title = ?, slug = ?, description = ? WHERE slug = ?', [
      parsed.title,
      parsed.slug,
      parsed.description || null,
      currentSlug,
    ]);

    if (parsed.slug !== currentSlug) {
      await db.run('UPDATE status_page_monitors SET page_slug = ? WHERE page_slug = ?', [parsed.slug, currentSlug]);
    }

    await db.run('DELETE FROM status_page_monitors WHERE page_slug = ?', [parsed.slug]);
    for (let i = 0; i < parsed.monitorSlugs.length; i += 1) {
      await db.run(
        'INSERT INTO status_page_monitors (page_slug, monitor_slug, order_index) VALUES (?, ?, ?)',
        [parsed.slug, parsed.monitorSlugs[i], i],
      );
    }

    await db.run('COMMIT');
    return { ok: true };
  } catch (err) {
    await db.run('ROLLBACK');
    throw err;
  }
}

async function removePage(slug) {
  const cleanSlug = sanitizeSlug(slug);
  if (!isValidSlug(cleanSlug)) return { error: 'Invalid status page slug' };

  await db.run('DELETE FROM status_page_monitors WHERE page_slug = ?', [cleanSlug]);
  await db.run('DELETE FROM status_pages WHERE slug = ?', [cleanSlug]);
  return { ok: true };
}

module.exports = {
  listPages,
  listMonitorOptions,
  getPageWithMonitors,
  getPageForEdit,
  createPage,
  editPage,
  removePage,
};
