const express = require('express');
const db = require('../services/database');
const { formatMonitorRows } = require('../utils/monitor-view');

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

    const rows = formatMonitorRows(monitors);

    res.render('index', { title: 'Monitor Dashboard', monitors: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
