const path = require('path');

module.exports = {
  server: {
    host: '0.0.0.0',
    port: 3000,
    trustProxy: false,
  },
  auth: {
    username: 'admin',
    password: 'change-this-password',
  },
  monitoring: {
    timeoutMs: 10000,
    maxRedirects: 5,
    maxContentLengthBytes: 2 * 1024 * 1024,
    schedulerTickMs: 500,
    maxConcurrency: 5,
    minIntervalMs: 10_000,
    maxIntervalMs: 3_600_000,
    syncIntervalMs: 3_000,
    startupJitterMaxMs: 5_000,
    retentionDays: 30,
    cleanupIntervalMs: 24 * 60 * 60 * 1000,
    blockPrivateIps: true,
  },
  rateLimit: {
    global: {
      windowMs: 15 * 60 * 1000,
      max: 300,
    },
    admin: {
      windowMs: 15 * 60 * 1000,
      max: 30,
    },
  },
  database: {
    path: path.join(__dirname, 'data', 'status.db'),
  },
  notifications: {
    discordWebhookUrl: '',
    email: {
      enabled: false,
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'smtp-user',
      pass: 'smtp-pass',
      from: 'monitor@example.com',
      to: 'alerts@example.com',
    },
  },
};