const dashboardMonitors = `SELECT
  m.name,
  m.slug,
  m.url,
  m.monitor_type,
  m.interval,
  ms.current_status,
  ms.last_checked,
  ms.uptime_count,
  ms.downtime_count,
  (
    SELECT s.response_time
    FROM monitors_status s
    WHERE s.slug = m.slug
    ORDER BY s.checked_at DESC
    LIMIT 1
  ) AS response_time,
  (
    SELECT s.status_code
    FROM monitors_status s
    WHERE s.slug = m.slug
    ORDER BY s.checked_at DESC
    LIMIT 1
  ) AS status_code
FROM monitors m
LEFT JOIN monitors_state ms ON ms.slug = m.slug
ORDER BY m.created_at DESC`;

const adminMonitors = `SELECT m.name, m.slug, m.url, m.monitor_type, m.interval,
  COALESCE(s.current_status, 'UNKNOWN') AS current_status,
  s.last_checked, s.uptime_count, s.downtime_count
FROM monitors m
LEFT JOIN monitors_state s ON s.slug = m.slug
ORDER BY m.created_at DESC`;

const monitorBySlug = `SELECT m.name, m.slug, m.url, m.monitor_type, m.interval AS update_interval, s.last_checked AS last_checked_at
FROM monitors m
LEFT JOIN monitors_state s ON s.slug = m.slug
WHERE m.slug = ?`;

const adminMonitorBySlug = `SELECT m.name, m.slug, m.url, m.monitor_type, m.interval
FROM monitors m
WHERE m.slug = ?`;

module.exports = {
  dashboardMonitors,
  adminMonitors,
  monitorBySlug,
  adminMonitorBySlug,
};
