function parseDetails(detailsJson) {
  if (!detailsJson) return null;
  if (typeof detailsJson === 'object') return detailsJson;
  try {
    return JSON.parse(String(detailsJson));
  } catch {
    return null;
  }
}

function summarizeDetails(monitor) {
  const details = parseDetails(monitor.details_json);
  if (!details) return 'N/A';

  if (details.type === 'minecraft') {
    const playersOnline = Number.isFinite(details.playersOnline) ? details.playersOnline : null;
    const playersMax = Number.isFinite(details.playersMax) ? details.playersMax : null;
    const playersText =
      playersOnline !== null && playersMax !== null
        ? `${playersOnline}/${playersMax} players`
        : playersOnline !== null
          ? `${playersOnline} players`
          : 'Players unknown';
    const versionText = details.version ? ` - ${details.version}` : '';
    return `${playersText}${versionText}`;
  }

  if (details.type === 'tcp') {
    return details.open ? 'Port open' : 'Port closed';
  }

  if (details.type === 'ping') {
    return details.target ? `Ping ${details.target}` : 'Ping check';
  }

  if (details.type === 'http') {
    return details.statusText || 'HTTP check';
  }

  return 'N/A';
}

function formatMonitorRow(monitor) {
  const up = Number(monitor.uptime_count || 0);
  const down = Number(monitor.downtime_count || 0);
  const total = up + down;

  return {
    ...monitor,
    intervalSeconds: Math.floor(Number(monitor.interval) / 1000),
    current_status: monitor.current_status || 'UNKNOWN',
    uptimePercent: total > 0 ? ((up / total) * 100).toFixed(2) : '0.00',
    details: parseDetails(monitor.details_json),
    detailsSummary: summarizeDetails(monitor),
  };
}

function formatMonitorRows(monitors) {
  return monitors.map(formatMonitorRow);
}

module.exports = {
  formatMonitorRow,
  formatMonitorRows,
};
