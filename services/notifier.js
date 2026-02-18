const axios = require('axios');
const nodemailer = require('nodemailer');
const config = require('../config');

const discordHttp = axios.create({ timeout: 5000, validateStatus: () => true });

const transporter = config.notifications.email.enabled
  ? nodemailer.createTransport({
      host: config.notifications.email.host,
      port: config.notifications.email.port,
      secure: config.notifications.email.secure,
      auth: {
        user: config.notifications.email.user,
        pass: config.notifications.email.pass,
      },
    })
  : null;

async function sendDiscordStateChange(monitor, status, responseTime) {
  if (!config.notifications.discordWebhookUrl) return;

  const content = `@everyone @here [${status}] ${monitor.name}\nURL: ${monitor.url}\nResponse: ${responseTime ?? 'N/A'}ms\nTime: ${new Date().toISOString()}`;

  try {
    await discordHttp.post(config.notifications.discordWebhookUrl, { content });
  } catch (err) {
    console.error('Discord notification failed:', err.message);
  }
}

async function sendEmailStateChange(monitor, status, responseTime) {
  if (!transporter) return;

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
      from: config.notifications.email.from,
      to: config.notifications.email.to,
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
