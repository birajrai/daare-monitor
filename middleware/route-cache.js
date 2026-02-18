const cacheStore = new Map();

const DEFAULT_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 1000;

function trimCache() {
  if (cacheStore.size <= MAX_ENTRIES) return;
  const firstKey = cacheStore.keys().next().value;
  if (firstKey) cacheStore.delete(firstKey);
}

function createRouteCache(ttlMs = DEFAULT_TTL_MS) {
  const ttl = Math.max(1000, Number(ttlMs) || DEFAULT_TTL_MS);

  return (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/auth') || req.path.startsWith('/admin')) return next();
    if (req.user) return next();

    const key = `${req.originalUrl}`;
    const now = Date.now();
    const hit = cacheStore.get(key);

    if (hit && hit.expiresAt > now) {
      res.status(hit.status);
      for (const [name, value] of Object.entries(hit.headers)) {
        res.set(name, value);
      }
      return res.send(hit.body);
    }

    const originalSend = res.send.bind(res);
    res.send = function patchedSend(body) {
      if (res.statusCode >= 200 && res.statusCode < 300 && !res.getHeader('Set-Cookie')) {
        const headers = {
          'Content-Type': res.getHeader('Content-Type') || 'text/html; charset=utf-8',
        };
        cacheStore.set(key, {
          status: res.statusCode,
          headers,
          body,
          expiresAt: Date.now() + ttl,
        });
        trimCache();
      }
      return originalSend(body);
    };

    return next();
  };
}

module.exports = {
  createRouteCache,
};
