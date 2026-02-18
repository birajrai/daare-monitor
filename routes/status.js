const express = require('express');
const crypto = require('crypto');
const db = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const { createLimiter } = require('../middleware/rate-limit');
const { isValidSlug, parsePositiveInt } = require('../utils/validators');
const { buildStatusViewData } = require('../utils/status-view');
const monitorQueries = require('../queries/monitor-queries');
const statusQueries = require('../queries/status-queries');

const router = express.Router();
const statusLimiter = createLimiter('status');
const unlockSessions = new Map();
const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000;

function parseCookies(header) {
    const raw = String(header || '');
    if (!raw) return {};
    return raw.split(';').reduce((acc, part) => {
        const idx = part.indexOf('=');
        if (idx < 0) return acc;
        const key = part.slice(0, idx).trim();
        const value = decodeURIComponent(part.slice(idx + 1).trim());
        acc[key] = value;
        return acc;
    }, {});
}

function verifyPassword(password, encoded) {
    const [algo, salt, expectedHash] = String(encoded || '').split(':');
    if (algo !== 'scrypt' || !salt || !expectedHash) return false;
    const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
    const left = Buffer.from(candidate, 'hex');
    const right = Buffer.from(expectedHash, 'hex');
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function isUnlocked(req, slug) {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies[`monitor_unlock_${slug}`];
    if (!token) return false;
    const row = unlockSessions.get(token);
    if (!row) return false;
    if (row.slug !== slug || row.expiresAt <= Date.now()) {
        unlockSessions.delete(token);
        return false;
    }
    return true;
}

router.get('/:slug', async (req, res, next) => {
    try {
        const { slug } = req.params;
        const { limit = 100, sort = 'desc', format = 'html' } = req.query;
        const parsedLimit = parsePositiveInt(limit, NaN);

        if (!isValidSlug(slug)) return res.status(400).send('Invalid slug');
        if (!Number.isFinite(parsedLimit) || parsedLimit > 1000) return res.status(400).send('Invalid limit');
        if (!['asc', 'desc'].includes(sort)) return res.status(400).send('Invalid sort order');

        const monitor = await db.get(monitorQueries.monitorBySlug, [slug]);
        if (!monitor) return res.status(404).send('Monitor not found');
        if (monitor.lock_enabled && !isUnlocked(req, slug)) {
            return res.status(401).render('status-lock', {
                title: `Unlock - ${monitor.name}`,
                monitor,
                error: null,
            });
        }

        const rows = await db.all(statusQueries.monitorStatusRows(sort), [slug, parsedLimit]);
        const { points, metadata, limitedIncidents, uptimePercent, latest, graph } = buildStatusViewData(monitor, rows);

        if (format === 'json') {
            return res.json({
                monitor,
                points,
                rows,
                metadata,
                uptimePercent,
                latest,
                graph,
            });
        }

        res.render('status', {
            title: `Status - ${monitor.name}`,
            monitor,
            points,
            rows,
            metadata,
            limitedIncidents,
            uptimePercent,
            latest,
            graph,
            nonce: res.locals.nonce,
        });
    } catch (err) {
        next(err);
    }
});

router.post('/:slug/unlock', statusLimiter, async (req, res, next) => {
    try {
        const { slug } = req.params;
        if (!isValidSlug(slug)) return res.status(400).send('Invalid slug');
        const monitor = await db.get(monitorQueries.monitorBySlug, [slug]);
        if (!monitor) return res.status(404).send('Monitor not found');
        if (!monitor.lock_enabled) return res.redirect(`/status/${slug}`);

        const password = String(req.body.password || '');
        const ok = verifyPassword(password, monitor.lock_password_hash);
        if (!ok) {
            return res.status(401).render('status-lock', {
                title: `Unlock - ${monitor.name}`,
                monitor,
                error: 'Invalid password',
            });
        }

        const token = crypto.randomBytes(24).toString('hex');
        unlockSessions.set(token, { slug, expiresAt: Date.now() + UNLOCK_TTL_MS });
        res.set('Set-Cookie', `monitor_unlock_${slug}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(UNLOCK_TTL_MS / 1000)}`);
        return res.redirect(`/status/${slug}`);
    } catch (err) {
        return next(err);
    }
});

router.use('/:slug', requireAuth);
router.use('/:slug', statusLimiter);

router.delete('/:slug', async (req, res, next) => {
    try {
        const { slug } = req.params;
        if (!isValidSlug(slug)) return res.status(400).send('Invalid slug');

        const monitor = await db.get('SELECT slug FROM monitors WHERE slug = ?', [slug]);
        if (!monitor) return res.status(404).send('Monitor not found');

        await db.run('DELETE FROM monitors WHERE slug = ?', [slug]);
        await db.run('DELETE FROM monitors_state WHERE slug = ?', [slug]);
        await db.run('DELETE FROM monitors_status WHERE slug = ?', [slug]);

        res.status(200).send('Monitor and its data deleted successfully');
    } catch (err) {
        next(err);
    }
});

module.exports = router;
