function formatMonitorRow(monitor) {
  const up = Number(monitor.uptime_count || 0);
  const down = Number(monitor.downtime_count || 0);
  const total = up + down;

  return {
    ...monitor,
    intervalSeconds: Math.floor(Number(monitor.interval) / 1000),
    current_status: monitor.current_status || 'UNKNOWN',
    uptimePercent: total > 0 ? ((up / total) * 100).toFixed(2) : '0.00',
  };
}

function formatMonitorRows(monitors) {
  return monitors.map(formatMonitorRow);
}

module.exports = {
  formatMonitorRow,
  formatMonitorRows,
};
