const express = require('express');
const config = require('../config');
const { basicAuth } = require('../utils/auth');
const { createLimiter } = require('../middleware/rate-limit');
const adminMonitors = require('../services/admin-monitors');

const router = express.Router();
const adminLimiter = createLimiter(config.rateLimit.admin);

router.use(adminLimiter);
router.use(basicAuth);

router.get('/', async (req, res, next) => {
  try {
    const monitors = await adminMonitors.listMonitors();
    res.render('admin', { title: 'Admin', monitors });
  } catch (err) {
    next(err);
  }
});

router.get('/create', (req, res) => {
  res.render('admin-create', { title: 'Create Monitor' });
});

router.post('/create', async (req, res, next) => {
  try {
    const result = await adminMonitors.createMonitor(req.body);
    if (result.error) return res.status(result.status || 400).send(result.error);
    return res.redirect('/admin');
  } catch (err) {
    if (err && String(err.message || '').includes('SQLITE_CONSTRAINT')) {
      return res.status(400).send('Constraint violation');
    }
    next(err);
  }
});

router.get('/:slug/edit', async (req, res, next) => {
  try {
    const monitor = await adminMonitors.getMonitorForEdit(req.params.slug);
    if (!monitor) return res.status(404).send('Monitor not found');
    return res.render('admin-edit', { title: `Edit ${monitor.name}`, monitor });
  } catch (err) {
    next(err);
  }
});

router.post('/:slug/edit', async (req, res, next) => {
  try {
    const result = await adminMonitors.editMonitor({
      ...req.body,
      old_slug: req.params.slug,
    });

    if (result.error) return res.status(result.status || 400).send(result.error);
    return res.redirect('/admin');
  } catch (err) {
    if (err && String(err.message || '').includes('SQLITE_CONSTRAINT')) {
      return res.status(400).send('Constraint violation');
    }
    next(err);
  }
});

router.post('/:slug/remove', async (req, res, next) => {
  try {
    const result = await adminMonitors.removeMonitor(req.params.slug);
    if (result.error) return res.status(result.status || 400).send(result.error);
    return res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
