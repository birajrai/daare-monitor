const express = require('express');
const db = require('../services/database');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const monitors = await db.all(
      `SELECT
         m.name,
         m.slug,
         m.url,
         m.interval,
         ms.current_status,
         ms.last_checked,
         ms.uptime_count,
         ms.downtime_count,
         latest.response_time,
         latest.status_code
       FROM monitors m
       LEFT JOIN monitors_state ms ON ms.slug = m.slug
       LEFT JOIN (
         SELECT t1.slug, t1.response_time, t1.status_code, t1.checked_at
         FROM monitors_status t1
         INNER JOIN (
           SELECT slug, MAX(checked_at) AS max_checked
           FROM monitors_status
           GROUP BY slug
         ) t2 ON t1.slug = t2.slug AND t1.checked_at = t2.max_checked
       ) latest ON latest.slug = m.slug
       ORDER BY m.created_at DESC`
    );

    const rows = monitors.map((m) => {
      const up = Number(m.uptime_count || 0);
      const down = Number(m.downtime_count || 0);
      const total = up + down;
      const uptimePercent = total > 0 ? ((up / total) * 100).toFixed(2) : '0.00';

      return {
        ...m,
        intervalSeconds: Math.floor(Number(m.interval) / 1000),
        current_status: m.current_status || 'UNKNOWN',
        uptimePercent,
      };
    });

    res.render('index', { title: 'Monitor Dashboard', monitors: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;