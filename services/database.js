const { Client } = require('pg');

let client;

function toPgPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

function run(sql, params = []) {
  return client.query(toPgPlaceholders(sql), params).then((result) => ({
    lastID: null,
    changes: result.rowCount || 0,
  }));
}

function get(sql, params = []) {
  return client.query(toPgPlaceholders(sql), params).then((result) => result.rows[0] || null);
}

function all(sql, params = []) {
  return client.query(toPgPlaceholders(sql), params).then((result) => result.rows || []);
}

async function hasColumn(tableName, columnName) {
  const row = await get(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
    [tableName, columnName]
  );
  return Boolean(row);
}

async function ensureColumn(tableName, columnName, definitionSql) {
  const exists = await hasColumn(tableName, columnName);
  if (exists) return;
  await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
}

async function init() {
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL in environment');
  }
  client = new Client({
    connectionString: databaseUrl,
  });
  await client.connect();
  await client.query('SELECT 1');

  await run(`
    CREATE TABLE IF NOT EXISTS monitors (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      url TEXT NOT NULL,
      monitor_type TEXT NOT NULL DEFAULT 'http',
      interval INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await ensureColumn('monitors', 'monitor_type', "TEXT NOT NULL DEFAULT 'http'");
  await run("UPDATE monitors SET monitor_type = 'http' WHERE monitor_type IS NULL OR monitor_type = ''");

  await run(`
    CREATE INDEX IF NOT EXISTS idx_monitors_created_at
    ON monitors(created_at DESC)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS monitors_status (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('UP', 'DOWN')),
      response_time INTEGER,
      status_code INTEGER,
      details_json TEXT,
      checked_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await ensureColumn('monitors_status', 'details_json', 'TEXT');

  await run(`
    CREATE INDEX IF NOT EXISTS idx_slug_checked
    ON monitors_status(slug, checked_at DESC)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS monitors_state (
      slug TEXT PRIMARY KEY,
      current_status TEXT NOT NULL,
      last_checked TIMESTAMPTZ,
      uptime_count INTEGER DEFAULT 0,
      downtime_count INTEGER DEFAULT 0
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS status_pages (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS status_page_monitors (
      page_slug TEXT NOT NULL,
      monitor_slug TEXT NOT NULL,
      order_index INTEGER DEFAULT 0,
      PRIMARY KEY (page_slug, monitor_slug)
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_status_page_monitors_page
    ON status_page_monitors(page_slug, order_index ASC)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id BOOLEAN PRIMARY KEY DEFAULT TRUE,
      settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CHECK (id = TRUE)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_token
    ON user_sessions(session_token)
  `);
}

function close() {
  if (!client) return Promise.resolve();
  return client.end();
}

module.exports = {
  init,
  close,
  run,
  get,
  all,
};
