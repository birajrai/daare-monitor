const express = require('express');
const db = require('../services/database');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const states = await db.all(
      `SELECT COALESCE(current_status, 'UNKNOWN') AS current_status
       FROM monitors_state`
    );

    const stats = {
      total: states.length,
      up: states.filter((m) => m.current_status === 'UP').length,
      down: states.filter((m) => m.current_status === 'DOWN').length,
    };

    const trendRows = await db.all(
      `SELECT
         to_char(date_trunc('minute', checked_at), 'YYYY-MM-DD HH24:MI') AS bucket,
         SUM(CASE WHEN status = 'UP' THEN 1 ELSE 0 END) AS up_checks,
         SUM(CASE WHEN status = 'DOWN' THEN 1 ELSE 0 END) AS down_checks,
         COUNT(*) AS total_checks
       FROM monitors_status
       WHERE checked_at >= NOW() - INTERVAL '24 hours'
       GROUP BY bucket
       ORDER BY bucket ASC`
    );

    const trend = trendRows.map((row) => ({
      time: row.bucket,
      up: Number(row.up_checks || 0),
      down: Number(row.down_checks || 0),
      total: Number(row.total_checks || 0),
    }));

    res.render('index', { title: 'Monitor Dashboard', stats, trend, nonce: res.locals.nonce });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
