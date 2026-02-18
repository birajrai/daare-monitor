const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { createLimiter } = require('../middleware/rate-limit');
const adminMonitors = require('../services/admin-monitors');
const statusPages = require('../services/status-pages');
const settings = require('../services/settings');

const router = express.Router();
const adminLimiter = createLimiter('admin');

router.use(adminLimiter);
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const monitors = await adminMonitors.listMonitors();
    res.render('admin', { title: 'Admin', monitors });
  } catch (err) {
    next(err);
  }
});

router.get('/settings', async (req, res, next) => {
  try {
    const appSettings = await settings.getSettings();
    return res.render('admin-settings', { title: 'Admin Settings', settings: appSettings });
  } catch (err) {
    return next(err);
  }
});

router.post('/settings', async (req, res, next) => {
  try {
    const body = req.body || {};
    const nextSettings = {
      server: {
        trustProxy: body.trust_proxy === 'on',
      },
      monitoring: {
        timeoutMs: Number(body.monitoring_timeout_ms),
        maxRedirects: Number(body.monitoring_max_redirects),
        maxContentLengthBytes: Number(body.monitoring_max_content_length_bytes),
        schedulerTickMs: Number(body.monitoring_scheduler_tick_ms),
        maxConcurrency: Number(body.monitoring_max_concurrency),
        minIntervalMs: Number(body.monitoring_min_interval_ms),
        maxIntervalMs: Number(body.monitoring_max_interval_ms),
        syncIntervalMs: Number(body.monitoring_sync_interval_ms),
        startupJitterMaxMs: Number(body.monitoring_startup_jitter_max_ms),
        retentionDays: Number(body.monitoring_retention_days),
        cleanupIntervalMs: Number(body.monitoring_cleanup_interval_ms),
        blockPrivateIps: body.monitoring_block_private_ips === 'on',
      },
      rateLimit: {
        global: { windowMs: Number(body.rate_global_window_ms), max: Number(body.rate_global_max) },
        admin: { windowMs: Number(body.rate_admin_window_ms), max: Number(body.rate_admin_max) },
        status: { windowMs: Number(body.rate_status_window_ms), max: Number(body.rate_status_max) },
      },
      notifications: {
        discordWebhookUrl: String(body.notifications_discord_webhook_url || '').trim(),
        email: {
          enabled: body.notifications_email_enabled === 'on',
          host: String(body.notifications_email_host || '').trim(),
          port: Number(body.notifications_email_port),
          secure: body.notifications_email_secure === 'on',
          user: String(body.notifications_email_user || '').trim(),
          pass: String(body.notifications_email_pass || '').trim(),
          from: String(body.notifications_email_from || '').trim(),
          to: String(body.notifications_email_to || '').trim(),
        },
      },
    };

    await settings.updateSettings(nextSettings);
    return res.redirect('/admin/settings');
  } catch (err) {
    return next(err);
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
    if (err && (err.code === '23505' || String(err.message || '').toLowerCase().includes('constraint'))) {
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
    if (err && (err.code === '23505' || String(err.message || '').toLowerCase().includes('constraint'))) {
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
