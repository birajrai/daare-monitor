const crypto = require('crypto');

function requestNonce(req, res, next) {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
}

module.exports = {
  requestNonce,
};
