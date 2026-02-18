const net = require('net');
const config = require('../../config');

function checkTcp(target) {
  return new Promise((resolve) => {
    const [host, portText] = String(target).split(':');
    const port = Number(portText);
    const start = Date.now();

    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      return resolve({
        currentStatus: 'DOWN',
        responseTime: Date.now() - start,
        statusCode: null,
        details: { type: 'tcp', host: host || null, port: port || null, open: false },
      });
    }

    const socket = net.createConnection({ host, port });
    let done = false;

    function finish(currentStatus) {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({
        currentStatus,
        responseTime: Date.now() - start,
        statusCode: null,
        details: { type: 'tcp', host, port, open: currentStatus === 'UP' },
      });
    }

    socket.setTimeout(config.monitoring.timeoutMs);
    socket.on('connect', () => finish('UP'));
    socket.on('timeout', () => finish('DOWN'));
    socket.on('error', () => finish('DOWN'));
  });
}

module.exports = { checkTcp };
