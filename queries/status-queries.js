function monitorStatusRows(sort) {
  return `SELECT status, response_time, status_code, checked_at
FROM monitors_status
WHERE slug = ?
ORDER BY checked_at ${sort.toUpperCase()}
LIMIT ?`;
}

module.exports = {
  monitorStatusRows,
};
