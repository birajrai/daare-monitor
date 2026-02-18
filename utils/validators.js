function sanitizeSlug(input) {
  return String(input || '').trim().toLowerCase();
}

function sanitizeMonitorType(input) {
  return String(input || 'http').trim().toLowerCase();
}

function isValidSlug(slug) {
  return /^[a-z0-9-]{1,100}$/.test(String(slug || ''));
}

function isValidMonitorType(type) {
  return ['http', 'tcp', 'ping', 'minecraft'].includes(type);
}

function isValidMonitorTarget(type, input) {
  const value = String(input || '').trim();
  if (!value) return false;

  if (type === 'http') {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  if (type === 'tcp' || type === 'minecraft') {
    if (type === 'minecraft' && /^[a-z0-9.-]+$/i.test(value)) return true;
    return /^[a-z0-9.-]+:\d{1,5}$/i.test(value);
  }

  if (type === 'ping') {
    return /^[a-z0-9.-]+$/i.test(value);
  }

  return false;
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
  sanitizeMonitorType,
  isValidSlug,
  isValidMonitorType,
  isValidMonitorTarget,
  isValidMonitorUrl,
  parsePositiveInt,
};
