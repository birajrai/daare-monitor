const express = require('express');
const db = require('../services/database');

const router = express.Router();

function isValidSlug(slug) {
    return /^[a-z0-9-]{1,100}$/.test(slug);
}

router.get('/:slug', async (req, res, next) => {
    try {
        const { slug } = req.params;
        const { limit = 100, sort = 'desc', format = 'html' } = req.query;

        if (!isValidSlug(slug)) return res.status(400).send('Invalid slug');
        if (isNaN(limit) || limit <= 0 || limit > 1000) return res.status(400).send('Invalid limit');
        if (!['asc', 'desc'].includes(sort)) return res.status(400).send('Invalid sort order');

        const monitor = await db.get(
            `SELECT m.name, m.slug, m.url, m.interval AS update_interval, s.last_checked AS last_checked_at
             FROM monitors m
             LEFT JOIN monitors_state s ON s.slug = m.slug
             WHERE m.slug = ?`,
            [slug],
        );
        if (!monitor) return res.status(404).send('Monitor not found');

        const rows = await db.all(
            `SELECT status, response_time, status_code, checked_at
             FROM monitors_status
             WHERE slug = ?
             ORDER BY checked_at ${sort.toUpperCase()}
             LIMIT ?`,
            [slug, parseInt(limit, 10)],
        );

        const chronologicalRows = [...rows].sort((a, b) => new Date(a.checked_at) - new Date(b.checked_at));
        const incidents = chronologicalRows.filter((row, index, arr) => {
            if (index === 0) return true;
            return row.status !== arr[index - 1].status;
        });
        const limitedIncidents = incidents.reverse().slice(0, 10);

        const points = limitedIncidents.map(row => ({
            time: row.checked_at,
            value: row.status === 'UP' ? 1 : 0,
        }));

        // removed debug logging

        const now = new Date();
        const lastUpdate = monitor && monitor.last_checked_at ? new Date(monitor.last_checked_at) : null;
        const intervalMs =
            monitor && (monitor.update_interval || monitor.interval)
                ? Number(monitor.update_interval || monitor.interval)
                : null;
        const nextUpdate = lastUpdate && intervalMs ? new Date(lastUpdate.getTime() + intervalMs) : null;

        const metadata = {
            currentDate: now.toISOString(),
            lastUpdate: lastUpdate ? lastUpdate.toISOString() : 'Never',
            nextUpdate: nextUpdate ? nextUpdate.toISOString() : 'Unknown',
        };

        const upCount = rows.filter(row => row.status === 'UP').length;
        const uptimePercent = rows.length > 0 ? ((upCount / rows.length) * 100).toFixed(2) : '0.00';
        const latest = rows[0] || null;

        if (format === 'json') {
            return res.json({
                monitor,
                points,
                rows,
                metadata,
                uptimePercent,
                latest,
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
            nonce: res.locals.nonce,
        });
    } catch (err) {
        next(err);
    }
});

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
