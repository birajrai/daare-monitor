const axios = require('axios');
const nodemailer = require('nodemailer');
const settings = require('./settings');

const discordHttp = axios.create({ timeout: 5000, validateStatus: () => true });

async function sendDiscordStateChange(monitor, status, responseTime) {
  const appSettings = settings.getCachedSettings();
  if (!appSettings.notifications.discordWebhookUrl) return;

  const mention = String(appSettings.notifications.discordRoleMention || '').trim() || '@here';
  const content = `${mention} [${status}] ${monitor.name}\nURL: ${monitor.url}\nResponse: ${responseTime ?? 'N/A'}ms\nTime: ${new Date().toISOString()}`;

  try {
    await discordHttp.post(appSettings.notifications.discordWebhookUrl, { content });
  } catch (err) {
    console.error('Discord notification failed:', err.message);
  }
}

async function sendEmailStateChange(monitor, status, responseTime) {
  const appSettings = settings.getCachedSettings();
  const emailSettings = appSettings.notifications.email;
  if (!emailSettings.enabled) return;

  const transporter = nodemailer.createTransport({
    host: emailSettings.host,
    port: Number(emailSettings.port),
    secure: Boolean(emailSettings.secure),
    auth: {
      user: emailSettings.user,
      pass: emailSettings.pass,
    },
  });

  const subject = `[${status}] ${monitor.name}`;
  const text = [
    `Monitor: ${monitor.name}`,
    `URL: ${monitor.url}`,
    `Status: ${status}`,
    `Response Time: ${responseTime ?? 'N/A'}ms`,
    `Timestamp: ${new Date().toISOString()}`,
  ].join('\n');

  try {
    await transporter.sendMail({
      from: emailSettings.from,
      to: emailSettings.to,
      subject,
      text,
    });
  } catch (err) {
    console.error('Email notification failed:', err.message);
  }
}

module.exports = {
  sendDiscordStateChange,
  sendEmailStateChange,
};
