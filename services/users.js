const crypto = require('crypto');
const db = require('./database');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, encoded) {
  const [algo, salt, expectedHash] = String(encoded || '').split(':');
  if (algo !== 'scrypt' || !salt || !expectedHash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const left = Buffer.from(candidate, 'hex');
  const right = Buffer.from(expectedHash, 'hex');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function hasAnyUsers() {
  const row = await db.get('SELECT COUNT(*)::int AS count FROM users');
  return Number(row && row.count) > 0;
}

async function registerInitialUser(username, password) {
  const exists = await hasAnyUsers();
  if (exists) return { error: 'Registration disabled', status: 403 };

  const cleanUsername = String(username || '').trim();
  const cleanPassword = String(password || '');
  if (!cleanUsername || cleanPassword.length < 8) {
    return { error: 'Username required and password must be at least 8 characters' };
  }

  await db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [
    cleanUsername,
    hashPassword(cleanPassword),
    'admin',
  ]);
  return { ok: true };
}

async function validateLogin(username, password) {
  const cleanUsername = String(username || '').trim();
  const cleanPassword = String(password || '');
  if (!cleanUsername || !cleanPassword) return null;

  const user = await db.get('SELECT id, username, password_hash, role FROM users WHERE username = ?', [cleanUsername]);
  if (!user) return null;
  if (!verifyPassword(cleanPassword, user.password_hash)) return null;
  return { id: user.id, username: user.username, role: user.role };
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.run(
    "INSERT INTO user_sessions (user_id, session_token, expires_at) VALUES (?, ?, NOW() + INTERVAL '7 days')",
    [userId, token]
  );
  return token;
}

async function getUserBySessionToken(token) {
  if (!token) return null;
  await db.run('DELETE FROM user_sessions WHERE expires_at < NOW()');
  return db.get(
    `SELECT u.id, u.username, u.role
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_token = ? AND s.expires_at > NOW()`,
    [token]
  );
}

async function clearSession(token) {
  if (!token) return;
  await db.run('DELETE FROM user_sessions WHERE session_token = ?', [token]);
}

module.exports = {
  hasAnyUsers,
  registerInitialUser,
  validateLogin,
  createSession,
  getUserBySessionToken,
  clearSession,
  SESSION_TTL_MS,
};
