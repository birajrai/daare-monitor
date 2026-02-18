const rateLimit = require('express-rate-limit');

function createLimiter(options) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

module.exports = {
  createLimiter,
};
