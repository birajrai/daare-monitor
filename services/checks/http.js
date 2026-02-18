const axios = require('axios');
const config = require('../../config');

const httpClient = axios.create({
  timeout: config.monitoring.timeoutMs,
  maxRedirects: config.monitoring.maxRedirects,
  maxContentLength: config.monitoring.maxContentLengthBytes,
  validateStatus: () => true,
});

async function checkHttp(target) {
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
