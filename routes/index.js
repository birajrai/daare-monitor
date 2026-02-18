const express = require('express');
const db = require('../services/database');
const { formatMonitorRows } = require('../utils/monitor-view');
const queries = require('../queries/monitor-queries');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const monitors = await db.all(queries.dashboardMonitors);

    const rows = formatMonitorRows(monitors);
    const stats = {
      total: rows.length,
      up: rows.filter((m) => m.current_status === 'UP').length,
      down: rows.filter((m) => m.current_status === 'DOWN').length,
    };

    res.render('index', { title: 'Monitor Dashboard', monitors: rows, stats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
