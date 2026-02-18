const express = require('express');
const db = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const { createLimiter } = require('../middleware/rate-limit');
const { isValidSlug, parsePositiveInt } = require('../utils/validators');
const { buildStatusViewData } = require('../utils/status-view');
const monitorQueries = require('../queries/monitor-queries');
const statusQueries = require('../queries/status-queries');

const router = express.Router();
const statusLimiter = createLimiter('status');

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
