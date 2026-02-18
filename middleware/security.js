const helmet = require('helmet');
const settings = require('../services/settings');

function createSecurityMiddleware() {
  const appSettings = settings.getCachedSettings();
  const trustProxy = Boolean(appSettings.server && appSettings.server.trustProxy);
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
        "style-src": ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        "font-src": ["'self'", 'https://fonts.gstatic.com'],
        "img-src": ["'self'", 'data:'],
      },
    },
    hsts: trustProxy
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
  });
}

module.exports = {
  createSecurityMiddleware,
};
