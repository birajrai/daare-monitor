const axios = require('axios');
const settings = require('../settings');

function extractMotd(data) {
  if (!data || !data.motd) return null;
  if (Array.isArray(data.motd.clean)) return data.motd.clean.join(' ').trim() || null;
  if (Array.isArray(data.motd.html)) return data.motd.html.join(' ').trim() || null;
  if (typeof data.motd === 'string') return data.motd;
  return null;
}

async function checkMinecraft(target) {
  const appSettings = settings.getCachedSettings();
  const mcSrvStatClient = axios.create({
    timeout: appSettings.monitoring.timeoutMs,
    validateStatus: () => true,
  });
  const start = Date.now();
  const encodedTarget = encodeURIComponent(String(target));
  const res = await mcSrvStatClient.get(`https://api.mcsrvstat.us/2/${encodedTarget}`);
  const data = res.data || {};

  return {
    currentStatus: data.online ? 'UP' : 'DOWN',
    responseTime: Date.now() - start,
    statusCode: res.status,
    details: {
      type: 'minecraft',
      playersOnline: data.players && Number.isFinite(Number(data.players.online)) ? Number(data.players.online) : null,
      playersMax: data.players && Number.isFinite(Number(data.players.max)) ? Number(data.players.max) : null,
      version: data.version || null,
      motd: extractMotd(data),
    },
  };
}

module.exports = { checkMinecraft };
