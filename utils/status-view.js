function buildStatusViewData(monitor, rows) {
  const chronologicalRows = [...rows].sort((a, b) => new Date(a.checked_at) - new Date(b.checked_at));
  const incidents = chronologicalRows.filter((row, index, arr) => {
    if (index === 0) return true;
    return row.status !== arr[index - 1].status;
  });

  const points = chronologicalRows.map((row) => ({
    time: row.checked_at,
    value: row.status === 'UP' ? 1 : 0,
    responseTime: row.response_time,
    statusCode: row.status_code,
  }));

  const lastUpdate = monitor && monitor.last_checked_at ? new Date(monitor.last_checked_at) : null;
  const intervalMs = monitor && monitor.update_interval ? Number(monitor.update_interval) : null;
  const nextUpdate = lastUpdate && intervalMs ? new Date(lastUpdate.getTime() + intervalMs) : null;

  const upCount = rows.filter((row) => row.status === 'UP').length;

  return {
    points,
    metadata: {
      currentDate: new Date().toISOString(),
      lastUpdate: lastUpdate ? lastUpdate.toISOString() : 'Never',
      nextUpdate: nextUpdate ? nextUpdate.toISOString() : 'Unknown',
    },
    limitedIncidents: incidents.reverse().slice(0, 10),
    uptimePercent: rows.length > 0 ? ((upCount / rows.length) * 100).toFixed(2) : '0.00',
    latest: rows[0] || null,
  };
}

module.exports = {
  buildStatusViewData,
};
