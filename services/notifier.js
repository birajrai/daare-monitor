// ==========================
// File: services/notifier.js
// ==========================
const axios = require('axios');
const nodemailer = require('nodemailer');
const config = require('../config');

const axiosInstance = axios.create({
    timeout: config.monitoring.requestTimeout,
    maxRedirects: 5,
    maxContentLength: 2 * 1024 * 1024,
    validateStatus: () => true,
});

const transporter = nodemailer.createTransport({
    host: config.notifications.email.host,
    port: config.notifications.email.port,
    secure: config.notifications.email.secure,
    auth: {
        user: config.notifications.email.user,
        pass: config.notifications.email.pass,
    },
});

async function sendDiscord(status, monitor) {
    if (!config.notifications.discordWebhook) return;

    const content = `@everyone @here ${
        status === 'DOWN' ? '🚨' : '✅'
    } ${monitor.name} is ${status}\nURL: ${monitor.url}`;

    await axios.post(config.notifications.discordWebhook, { content });
}

async function sendEmail(status, monitor, responseTime) {
    if (!config.notifications.email.host) return;

    await transporter.sendMail({
        from: config.notifications.email.from,
        to: config.notifications.email.to,
        subject: `[${status}] ${monitor.name}`,
        text: `
Monitor: ${monitor.name}
URL: ${monitor.url}
Status: ${status}
Response Time: ${responseTime || 'N/A'}ms
Time: ${new Date().toISOString()}
`,
    });
}

module.exports = { sendDiscord, sendEmail, axiosInstance };
