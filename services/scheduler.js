// ==========================
// File: services/scheduler.js
// ==========================
const { getDB } = require('./database');
const { sendDiscord, sendEmail, axiosInstance } = require('./notifier');
const config = require('../config');

let monitors = new Map();
let activeWorkers = 0;
let running = true;

async function loadMonitors() {
    const db = getDB();
    return new Promise(resolve => {
        db.all('SELECT * FROM monitors', (err, rows) => {
            resolve(rows || []);
        });
    });
}

async function syncMonitors() {
    const dbMonitors = await loadMonitors();

    const dbSlugs = new Set(dbMonitors.map(m => m.slug));

    for (const m of dbMonitors) {
        if (!monitors.has(m.slug)) {
            monitors.set(m.slug, {
                ...m,
                nextRun: Date.now() + Math.random() * m.interval,
            });
        }
    }

    for (const slug of monitors.keys()) {
        if (!dbSlugs.has(slug)) monitors.delete(slug);
    }
}

async function checkMonitor(monitor) {
    activeWorkers++;

    const db = getDB();
    let status = 'DOWN';
    let responseTime = null;
    let statusCode = null;

    const start = Date.now();

    try {
        const res = await axiosInstance.get(monitor.url);
        statusCode = res.status;
        responseTime = Date.now() - start;
        status = res.status < 400 ? 'UP' : 'DOWN';
    } catch {
        status = 'DOWN';
    }

    db.run(
        `INSERT INTO monitors_status (slug, status, response_time, status_code)
     VALUES (?, ?, ?, ?)`,
        [monitor.slug, status, responseTime, statusCode],
    );

    db.get(`SELECT * FROM monitors_state WHERE slug = ?`, [monitor.slug], async (err, row) => {
        if (!row) {
            db.run(
                `INSERT INTO monitors_state (slug, current_status, last_checked, uptime_count, downtime_count)
           VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)`,
                [monitor.slug, status, status === 'UP' ? 1 : 0, status === 'DOWN' ? 1 : 0],
            );
            return;
        }

        if (row.current_status !== status) {
            await sendDiscord(status, monitor);
            await sendEmail(status, monitor, responseTime);
        }

        db.run(
            `UPDATE monitors_state
         SET current_status = ?,
             last_checked = CURRENT_TIMESTAMP,
             uptime_count = uptime_count + ?,
             downtime_count = downtime_count + ?
         WHERE slug = ?`,
            [status, status === 'UP' ? 1 : 0, status === 'DOWN' ? 1 : 0, monitor.slug],
        );
    });

    activeWorkers--;
}

async function schedulerLoop() {
    while (running) {
        await syncMonitors();

        const now = Date.now();

        for (const monitor of monitors.values()) {
            if (monitor.nextRun <= now && activeWorkers < config.monitoring.maxConcurrency) {
                monitor.nextRun = now + monitor.interval;
                checkMonitor(monitor).catch(() => {});
            }
        }

        await new Promise(r => setTimeout(r, config.monitoring.schedulerTick));
    }
}

async function start() {
    schedulerLoop();
}

function stop() {
    running = false;
}

module.exports = { start, stop };
