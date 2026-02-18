const express = require('express');
const statusPages = require('../services/status-pages');

const router = express.Router();

router.get('/:slug', async (req, res, next) => {
  try {
    const result = await statusPages.getPageWithMonitors(req.params.slug);
    if (!result) return res.status(404).send('Status page not found');

    const total = result.monitors.length;
    const up = result.monitors.filter((m) => m.current_status === 'UP').length;
    const down = result.monitors.filter((m) => m.current_status === 'DOWN').length;

    return res.render('status-page', {
      title: `${result.page.title} Status`,
      page: result.page,
      monitors: result.monitors,
      stats: { total, up, down },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
