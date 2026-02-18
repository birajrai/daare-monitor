function parseDetails(detailsJson) {
  if (!detailsJson) return null;
  if (typeof detailsJson === 'object') return detailsJson;
  try {
    return JSON.parse(String(detailsJson));
  } catch {
    return null;
  }
}

function graphConfigForType(type) {
  if (type === 'minecraft') {
    return {
      secondaryLabel: 'Players Online',
      secondaryMin: 0,
      valueFromRow: (row) => {
        if (row.details && Number.isFinite(Number(row.details.playersOnline))) {
          return Number(row.details.playersOnline);
        }
        if (row.status === 'DOWN') return 0;
        return null;
      },
    };
  }

  if (type === 'http') {
    return {
      secondaryLabel: 'HTTP Code',
      secondaryMin: null,
      valueFromRow: (row) =>
        Number.isFinite(Number(row.status_code)) ? Number(row.status_code) : null,
    };
  }

  return {
    secondaryLabel: 'Response (ms)',
    secondaryMin: 0,
    valueFromRow: (row) =>
      Number.isFinite(Number(row.response_time)) ? Number(row.response_time) : null,
  };
}

function buildStatusViewData(monitor, rows) {
  const monitorType = String((monitor && monitor.monitor_type) || 'http');
  const graphConfig = graphConfigForType(monitorType);
  const rowsWithDetails = rows.map((row) => ({
    ...row,
    details: parseDetails(row.details_json),
  }));

  const chronologicalRows = [...rowsWithDetails].sort((a, b) => new Date(a.checked_at) - new Date(b.checked_at));
  const incidents = chronologicalRows.filter((row, index, arr) => {
    if (index === 0) return true;
    return row.status !== arr[index - 1].status;
  });

  const points = chronologicalRows.map((row) => ({
    time: row.checked_at,
    value: row.status === 'UP' ? 1 : 0,
    responseTime: row.response_time,
    statusCode: row.status_code,
    secondaryValue: graphConfig.valueFromRow(row),
  }));

  const lastUpdate = monitor && monitor.last_checked_at ? new Date(monitor.last_checked_at) : null;
  const intervalMs = monitor && monitor.update_interval ? Number(monitor.update_interval) : null;
  const nextUpdate = lastUpdate && intervalMs ? new Date(lastUpdate.getTime() + intervalMs) : null;

  const upCount = rowsWithDetails.filter((row) => row.status === 'UP').length;

  return {
    points,
    metadata: {
      currentDate: new Date().toISOString(),
      lastUpdate: lastUpdate ? lastUpdate.toISOString() : 'Never',
      nextUpdate: nextUpdate ? nextUpdate.toISOString() : 'Unknown',
    },
    limitedIncidents: incidents.reverse().slice(0, 10),
    uptimePercent: rowsWithDetails.length > 0 ? ((upCount / rowsWithDetails.length) * 100).toFixed(2) : '0.00',
    latest: rowsWithDetails[0] || null,
    graph: {
      secondaryLabel: graphConfig.secondaryLabel,
      secondaryMin: graphConfig.secondaryMin,
    },
  };
}

module.exports = {
  buildStatusViewData,
};
