const { checkHttp } = require('./checks/http');
const { checkTcp } = require('./checks/tcp');
const { checkPing } = require('./checks/ping');
const { checkMinecraft } = require('./checks/minecraft');

const handlers = {
  http: checkHttp,
  tcp: checkTcp,
  ping: checkPing,
  minecraft: checkMinecraft,
};

async function runCheck(monitor) {
  const type = String(monitor.monitor_type || 'http');
  const target = String(monitor.url || '');
  const check = handlers[type] || handlers.http;
  return check(target);
}

module.exports = {
  runCheck,
};
