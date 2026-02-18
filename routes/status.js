const express = require('express');
const db = require('../services/database');

const router = express.Router();

function isValidSlug(slug) {
    return /^[a-z0-9-]{1,100}$/.test(slug);
}

router.get('/:slug', async (req, res, next) => {
    try {
        const { slug } = req.params;
        if (!isValidSlug(slug)) return res.status(400).send('Invalid slug');

        const monitor = await db.get('SELECT name, slug, url FROM monitors WHERE slug = ?', [slug]);
        if (!monitor) return res.status(404).send('Monitor not found');

        const rows = await db.all(
            `SELECT status, response_time, status_code, checked_at
       FROM monitors_status
       WHERE slug = ?
       ORDER BY checked_at DESC
       LIMIT 1000`,
            [slug],
        );

        const orderedRows = rows.slice().reverse();
        const points = orderedRows.map(row => ({
            time: row.checked_at,
            value: row.status === 'UP' ? 1 : 0,
        }));

        console.log('Debug points:', points);

        res.render('status', {
            title: `Status - ${monitor.name}`,
            monitor,
            points,
            rows,
            nonce: res.locals.nonce,
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
