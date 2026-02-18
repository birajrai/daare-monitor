const settings = require('../services/settings');

const buckets = new Map();

function createLimiter(scope) {
  return (req, res, next) => {
    if (process.env.NODE_ENV !== 'production') return next();
    if (req.user) return next();

    const appSettings = settings.getCachedSettings();
    const opts = (((appSettings || {}).rateLimit || {})[scope]) || { windowMs: 60000, max: 120 };

    const windowMs = Math.max(1000, Number(opts.windowMs) || 60000);
    const max = Math.max(1, Number(opts.max) || 60);

    const now = Date.now();
    const key = `${scope}:${req.ip}`;
    const row = buckets.get(key);

    if (!row || row.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    row.count += 1;
    if (row.count > max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((row.resetAt - now) / 1000))));
      return res.status(429).send('Too many requests');
    }

    return next();
  };
}

module.exports = {
  createLimiter,
};
