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
            'SELECT name, slug, url, last_checked_at, update_interval FROM monitors WHERE slug = ?',
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

        const incidents = rows.filter((row, index, arr) => {
            if (index === 0) return true; // Always include the first row
            return row.status !== arr[index - 1].status; // Include only if status changes
        });

        const limitedIncidents = incidents.slice(0, 10);

        const points = limitedIncidents.map(row => ({
            time: row.checked_at,
            value: row.status === 'UP' ? 1 : 0,
        }));

        console.log('Monitor:', monitor);
        console.log('Points:', points);
        console.log('Rows:', rows);

        const now = new Date();
        const lastUpdate = monitor.last_checked_at ? new Date(monitor.last_checked_at) : null;
        const nextUpdate = lastUpdate ? new Date(lastUpdate.getTime() + monitor.update_interval) : null;

        const metadata = {
            currentDate: now.toISOString(),
            lastUpdate: lastUpdate ? lastUpdate.toISOString() : 'Never',
            nextUpdate: nextUpdate ? nextUpdate.toISOString() : 'Unknown',
        };

        if (format === 'json') {
            return res.json({
                monitor,
                points,
                rows,
                metadata,
            });
        }

        res.render('status', {
            title: `Status - ${monitor.name}`,
            monitor,
            points,
            rows,
            metadata,
            limitedIncidents,
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
        await db.run('DELETE FROM monitors_status WHERE slug = ?', [slug]);

        res.status(200).send('Monitor and its data deleted successfully');
    } catch (err) {
        next(err);
    }
});

module.exports = router;
