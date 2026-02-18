const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const db = require('../services/database');

const router = express.Router();

const adminLimiter = rateLimit({
  windowMs: config.rateLimit.admin.windowMs,
  max: config.rateLimit.admin.max,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(adminLimiter);

function basicAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');

  if (scheme !== 'Basic' || !encoded) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentication required');
  }

  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  const username = separator >= 0 ? decoded.slice(0, separator) : '';
  const password = separator >= 0 ? decoded.slice(separator + 1) : '';

  if (username !== config.auth.username || password !== config.auth.password) {
    return res.status(401).send('Invalid credentials');
  }

  return next();
}

function sanitizeSlug(input) {
  return String(input || '').trim().toLowerCase();
}

function isValidSlug(slug) {
  return /^[a-z0-9-]{1,100}$/.test(slug);
}

function isValidMonitorUrl(input) {
  try {
    const parsed = new URL(input);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

router.use(basicAuth);

router.get('/', async (req, res, next) => {
  try {
    const monitors = await db.all(
      `SELECT m.name, m.slug, m.url, m.interval,
              COALESCE(s.current_status, 'UNKNOWN') AS current_status,
              s.last_checked, s.uptime_count, s.downtime_count
       FROM monitors m
       LEFT JOIN monitors_state s ON s.slug = m.slug
       ORDER BY m.created_at DESC`
    );

    const rows = monitors.map((m) => {
      const up = Number(m.uptime_count || 0);
      const down = Number(m.downtime_count || 0);
      const total = up + down;
      return {
        ...m,
        intervalSeconds: Math.floor(Number(m.interval) / 1000),
        uptimePercent: total > 0 ? ((up / total) * 100).toFixed(2) : '0.00',
      };
    });

    res.render('admin', { title: 'Admin', monitors: rows, error: null, success: null });
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