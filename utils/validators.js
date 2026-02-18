function sanitizeSlug(input) {
  return String(input || '').trim().toLowerCase();
}

function isValidSlug(slug) {
  return /^[a-z0-9-]{1,100}$/.test(String(slug || ''));
}

function isValidMonitorUrl(input) {
  try {
    const parsed = new URL(String(input || ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function parsePositiveInt(input, fallback) {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

module.exports = {
  sanitizeSlug,
  isValidSlug,
  isValidMonitorUrl,
  parsePositiveInt,
};
