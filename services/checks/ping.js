const { spawn } = require('child_process');
const settings = require('../settings');

function checkPing(target) {
  return new Promise((resolve) => {
    const appSettings = settings.getCachedSettings();
    const isWin = process.platform === 'win32';
    const args = isWin
      ? ['-n', '1', '-w', String(appSettings.monitoring.timeoutMs), String(target)]
      : ['-c', '1', '-W', String(Math.max(1, Math.ceil(appSettings.monitoring.timeoutMs / 1000))), String(target)];

    const start = Date.now();
    const proc = spawn('ping', args, { windowsHide: true });
    let done = false;

    function finish(currentStatus) {
      if (done) return;
      done = true;
      resolve({
        currentStatus,
        responseTime: Date.now() - start,
        statusCode: null,
        details: { type: 'ping', target: String(target) },
      });
    }

    proc.on('error', () => finish('DOWN'));
    proc.on('close', (code) => finish(code === 0 ? 'UP' : 'DOWN'));
  });
}

module.exports = { checkPing };
