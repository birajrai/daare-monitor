function parseDetails(detailsJson) {
  if (!detailsJson) return null;
  if (typeof detailsJson === 'object') return detailsJson;
  try {
    return JSON.parse(String(detailsJson));
  } catch {
    return null;
  }
}

function formatTimeAgo(input) {
  if (!input) return 'Never';
  const ts = new Date(input).getTime();
  if (!Number.isFinite(ts)) return 'Never';

  const diffMs = Date.now() - ts;
  if (diffMs < 0) return 'just now';

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  const yr = Math.floor(mon / 12);
  return `${yr}y ago`;
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
    const latency = Number.isFinite(Number(monitor.response_time)) ? `${Number(monitor.response_time)}ms` : 'N/A';
    return details.target ? `Latency ${latency}` : `Ping ${latency}`;
  }

  if (details.type === 'http') {
    const code = Number.isFinite(Number(monitor.status_code)) ? Number(monitor.status_code) : null;
    const text = details.statusText || '';
    if (code && text) return `${code} ${text}`;
    if (code) return String(code);
    return text || 'HTTP check';
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
    lastCheckedAgo: formatTimeAgo(monitor.last_checked),
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
