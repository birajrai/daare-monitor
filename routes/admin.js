const express = require('express');
const config = require('../config');
const { basicAuth } = require('../utils/auth');
const { createLimiter } = require('../middleware/rate-limit');
const adminMonitors = require('../services/admin-monitors');
const statusPages = require('../services/status-pages');

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

router.get('/pages', async (req, res, next) => {
  try {
    const pages = await statusPages.listPages();
    res.render('admin-pages', { title: 'Status Pages', pages });
  } catch (err) {
    next(err);
  }
});

router.get('/pages/create', async (req, res, next) => {
  try {
    const monitors = await statusPages.listMonitorOptions();
    res.render('admin-page-create', { title: 'Create Status Page', monitors });
  } catch (err) {
    next(err);
  }
});

router.post('/pages/create', async (req, res, next) => {
  try {
    const result = await statusPages.createPage(req.body);
    if (result.error) return res.status(result.status || 400).send(result.error);
    return res.redirect('/admin/pages');
  } catch (err) {
    next(err);
  }
});

router.get('/pages/:slug/edit', async (req, res, next) => {
  try {
    const data = await statusPages.getPageForEdit(req.params.slug);
    if (!data) return res.status(404).send('Status page not found');
    return res.render('admin-page-edit', { title: `Edit ${data.page.title}`, ...data });
  } catch (err) {
    next(err);
  }
});

router.post('/pages/:slug/edit', async (req, res, next) => {
  try {
    const result = await statusPages.editPage(req.params.slug, req.body);
    if (result.error) return res.status(result.status || 400).send(result.error);
    return res.redirect('/admin/pages');
  } catch (err) {
    next(err);
  }
});

router.post('/pages/:slug/remove', async (req, res, next) => {
  try {
    const result = await statusPages.removePage(req.params.slug);
    if (result.error) return res.status(result.status || 400).send(result.error);
    return res.redirect('/admin/pages');
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
