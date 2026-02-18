const express = require('express');
const config = require('../config');
const db = require('../services/database');
const { formatMonitorRows } = require('../utils/monitor-view');
const { basicAuth } = require('../utils/auth');
const { createLimiter } = require('../middleware/rate-limit');
const { sanitizeSlug, isValidSlug, isValidMonitorUrl } = require('../utils/validators');
const queries = require('../queries/monitor-queries');

const router = express.Router();

const adminLimiter = createLimiter(config.rateLimit.admin);

router.use(adminLimiter);

router.use(basicAuth);

router.get('/', async (req, res, next) => {
  try {
    const monitors = await db.all(queries.adminMonitors);

    const rows = formatMonitorRows(monitors);
    const editSlug = sanitizeSlug(req.query.edit);
    const editMonitor = editSlug ? rows.find((m) => m.slug === editSlug) || null : null;

    res.render('admin', { title: 'Admin', monitors: rows, editMonitor, error: null, success: null });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const action = String(req.body.action || '').trim();

    if (action === 'add') {
      const name = String(req.body.name || '').trim();
      const slug = sanitizeSlug(req.body.slug);
      const url = String(req.body.url || '').trim();
      const intervalSeconds = Number(req.body.interval_seconds);

      if (!name || !isValidSlug(slug) || !isValidMonitorUrl(url) || !Number.isFinite(intervalSeconds)) {
        return res.status(400).send('Invalid monitor input');
      }

      const intervalMs = Math.floor(intervalSeconds * 1000);
      if (intervalMs < config.monitoring.minIntervalMs || intervalMs > config.monitoring.maxIntervalMs) {
        return res.status(400).send('Interval must be between 10 seconds and 1 hour');
      }

      const existing = await db.get('SELECT slug FROM monitors WHERE slug = ?', [slug]);
      if (existing) return res.status(400).send('Slug already exists');

      await db.run('INSERT INTO monitors (name, slug, url, interval) VALUES (?, ?, ?, ?)', [
        name,
        slug,
        url,
        intervalMs,
      ]);

      return res.redirect('/admin');
    }

    if (action === 'remove') {
      const slug = sanitizeSlug(req.body.slug);
      if (!isValidSlug(slug)) return res.status(400).send('Invalid slug');

      await db.run('DELETE FROM monitors WHERE slug = ?', [slug]);
      await db.run('DELETE FROM monitors_state WHERE slug = ?', [slug]);
      await db.run('DELETE FROM monitors_status WHERE slug = ?', [slug]);
      return res.redirect('/admin');
    }

    if (action === 'edit') {
      const oldSlug = sanitizeSlug(req.body.old_slug);
      const name = String(req.body.name || '').trim();
      const slug = sanitizeSlug(req.body.slug);
      const url = String(req.body.url || '').trim();
      const intervalSeconds = Number(req.body.interval_seconds);

      if (!isValidSlug(oldSlug) || !name || !isValidSlug(slug) || !isValidMonitorUrl(url) || !Number.isFinite(intervalSeconds)) {
        return res.status(400).send('Invalid monitor input');
      }

      const intervalMs = Math.floor(intervalSeconds * 1000);
      if (intervalMs < config.monitoring.minIntervalMs || intervalMs > config.monitoring.maxIntervalMs) {
        return res.status(400).send('Interval must be between 10 seconds and 1 hour');
      }

      const current = await db.get('SELECT slug FROM monitors WHERE slug = ?', [oldSlug]);
      if (!current) return res.status(404).send('Monitor not found');

      if (slug !== oldSlug) {
        const existing = await db.get('SELECT slug FROM monitors WHERE slug = ?', [slug]);
        if (existing) return res.status(400).send('Slug already exists');
      }

      await db.run('BEGIN TRANSACTION');
      try {
        await db.run('UPDATE monitors SET name = ?, slug = ?, url = ?, interval = ? WHERE slug = ?', [
          name,
          slug,
          url,
          intervalMs,
          oldSlug,
        ]);

        if (slug !== oldSlug) {
          await db.run('UPDATE monitors_state SET slug = ? WHERE slug = ?', [slug, oldSlug]);
          await db.run('UPDATE monitors_status SET slug = ? WHERE slug = ?', [slug, oldSlug]);
        }

        await db.run('COMMIT');
      } catch (updateErr) {
        await db.run('ROLLBACK');
        throw updateErr;
      }

      return res.redirect('/admin');
    }

    return res.status(400).send('Invalid action');
  } catch (err) {
    if (err && String(err.message || '').includes('SQLITE_CONSTRAINT')) {
      return res.status(400).send('Constraint violation');
    }
    next(err);
  }
});

module.exports = router;
