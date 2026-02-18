module.exports = {
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
};
