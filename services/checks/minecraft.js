const axios = require('axios');
const config = require('../../config');

const mcSrvStatClient = axios.create({
  timeout: config.monitoring.timeoutMs,
  validateStatus: () => true,
});

async function checkMinecraft(target) {
  const start = Date.now();
  const encodedTarget = encodeURIComponent(String(target));
  const res = await mcSrvStatClient.get(`https://api.mcsrvstat.us/2/${encodedTarget}`);
  return {
    currentStatus: res.data && res.data.online ? 'UP' : 'DOWN',
    responseTime: Date.now() - start,
    statusCode: res.status,
  };
}

module.exports = { checkMinecraft };
