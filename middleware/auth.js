const users = require('../services/users');

const COOKIE_NAME = 'daare_session';

function parseCookies(header) {
  const raw = String(header || '');
  if (!raw) return {};

  return raw.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return acc;
    const key = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    acc[key] = value;
    return acc;
  }, {});
}

function setSessionCookie(res, token) {
  const maxAge = users.SESSION_TTL_MS;
  const isSecure = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${isSecure ? '; Secure' : ''}`);
}

function clearSessionCookie(res) {
  const isSecure = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure ? '; Secure' : ''}`);
}

async function attachAuthUser(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies[COOKIE_NAME] || '';
    const user = await users.getUserBySessionToken(token);
    req.user = user || null;
    req.sessionToken = token || null;
    res.locals.currentUser = req.user;
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/auth/login');
  return next();
}

module.exports = {
  COOKIE_NAME,
  attachAuthUser,
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
};
