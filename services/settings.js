const db = require('./database');

const DEFAULTS = {
  server: {
    trustProxy: false,
  },
  monitoring: {
    timeoutMs: 10000,
    maxRedirects: 5,
    maxContentLengthBytes: 2 * 1024 * 1024,
    schedulerTickMs: 500,
    maxConcurrency: 5,
    minIntervalMs: 10000,
    maxIntervalMs: 3600000,
    syncIntervalMs: 3000,
    startupJitterMaxMs: 5000,
    retentionDays: 30,
    cleanupIntervalMs: 24 * 60 * 60 * 1000,
    blockPrivateIps: true,
  },
  rateLimit: {
    global: { windowMs: 15 * 60 * 1000, max: 60 },
    admin: { windowMs: 15 * 60 * 1000, max: 10 },
    status: { windowMs: 60 * 1000, max: 30 },
  },
  notifications: {
    discordWebhookUrl: '',
    email: {
      enabled: false,
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: '',
      pass: '',
      from: 'monitor@example.com',
      to: 'alerts@example.com',
    },
  },
};

let cachedSettings = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5000;

function deepMerge(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  const merged = Array.isArray(base) ? [...base] : { ...base };

  for (const [key, value] of Object.entries(extra)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && merged[key] && typeof merged[key] === 'object') {
      merged[key] = deepMerge(merged[key], value);
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

async function ensureRow() {
  await db.run('INSERT INTO app_settings (id, settings_json) VALUES (TRUE, ?::jsonb) ON CONFLICT (id) DO NOTHING', [
    JSON.stringify({}),
  ]);
}

async function getSettings(force = false) {
  if (!force && cachedSettings && (Date.now() - cachedAt) < CACHE_TTL_MS) return cachedSettings;

  await ensureRow();
  const row = await db.get('SELECT settings_json FROM app_settings WHERE id = TRUE');
  const stored = row && row.settings_json ? row.settings_json : {};
  cachedSettings = deepMerge(DEFAULTS, stored);
  cachedAt = Date.now();
  return cachedSettings;
}

function getCachedSettings() {
  return cachedSettings || DEFAULTS;
}

async function updateSettings(nextSettings) {
  const current = await getSettings(true);
  const merged = deepMerge(current, nextSettings || {});

  await db.run(
    'UPDATE app_settings SET settings_json = ?::jsonb, updated_at = NOW() WHERE id = TRUE',
    [JSON.stringify(merged)]
  );
  cachedSettings = merged;
  cachedAt = Date.now();
  return merged;
}

module.exports = {
  getSettings,
  getCachedSettings,
  updateSettings,
  DEFAULTS,
};
