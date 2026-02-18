const axios = require('axios');
const settings = require('../settings');

async function checkHttp(target) {
  const appSettings = settings.getCachedSettings();
  const httpClient = axios.create({
    timeout: appSettings.monitoring.timeoutMs,
    maxRedirects: appSettings.monitoring.maxRedirects,
    maxContentLength: appSettings.monitoring.maxContentLengthBytes,
    validateStatus: () => true,
  });
  const start = Date.now();
  const res = await httpClient.get(target);
  return {
    currentStatus: res.status < 400 ? 'UP' : 'DOWN',
    responseTime: Date.now() - start,
    statusCode: res.status,
    details: {
      type: 'http',
      statusText: res.statusText || null,
      contentType: res.headers['content-type'] || null,
    },
  };
}

module.exports = { checkHttp };
