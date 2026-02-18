const dns = require('dns').promises;
const net = require('net');
const config = require('../config');
const db = require('./database');
const notifier = require('./notifier');
const monitorChecks = require('./monitor-checks');

const monitorQueue = new Map();
const runningSlugs = new Set();

let loopTimer = null;
let isRunning = false;
let activeWorkers = 0;
let lastSyncAt = 0;
let nextCleanupAt = Date.now() + 30_000;

const hostSafetyCache = new Map();
const HOST_CACHE_TTL_MS = 5 * 60 * 1000;

function randomJitter(maxMs) {
    return Math.floor(Math.random() * Math.max(1, maxMs));
}

function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(part => Number(part));
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return false;
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    return false;
}

function isPrivateIPv6(ip) {
    const value = ip.toLowerCase();
    if (value === '::1') return true;
    if (value.startsWith('fc') || value.startsWith('fd')) return true;
    if (value.startsWith('fe80:')) return true;
    return false;
}

function extractHostname(monitor) {
    const type = String(monitor.monitor_type || 'http');
    const target = String(monitor.url || '');

    if (type === 'http') {
        try {
            return new URL(target).hostname;
        } catch {
            return null;
        }
    }

    if (type === 'tcp' || type === 'minecraft') {
        const [host] = target.split(':');
        return host || null;
    }

    if (type === 'ping') {
        return target || null;
    }

    return null;
}

async function hostResolvesToPrivateAddress(hostname) {
    const cached = hostSafetyCache.get(hostname);
    if (cached && cached.expiresAt > Date.now()) return cached.isPrivate;

    try {
        const results = await dns.lookup(hostname, { all: true });
        const isPrivate = results.some(r => {
            if (!net.isIP(r.address)) return false;
            return net.isIPv4(r.address) ? isPrivateIPv4(r.address) : isPrivateIPv6(r.address);
        });

        hostSafetyCache.set(hostname, {
            isPrivate,
            expiresAt: Date.now() + HOST_CACHE_TTL_MS,
        });

        return isPrivate;
    } catch {
        return false;
    }
}

async function syncMonitorsFromDb() {
    const rows = await db.all('SELECT id, name, slug, url, monitor_type, interval FROM monitors');
    const seen = new Set();

    for (const row of rows) {
        seen.add(row.slug);
        const intervalMs = Number(row.interval);
        const existing = monitorQueue.get(row.slug);

        if (!existing) {
            monitorQueue.set(row.slug, {
                ...row,
                interval: intervalMs,
                nextRun: Date.now() + randomJitter(Math.min(intervalMs, config.monitoring.startupJitterMaxMs)),
            });
            continue;
        }

        const intervalChanged = existing.interval !== intervalMs;
        const urlChanged = existing.url !== row.url;
        const nameChanged = existing.name !== row.name;
        const typeChanged = existing.monitor_type !== row.monitor_type;

        existing.name = row.name;
        existing.url = row.url;
        existing.monitor_type = row.monitor_type;
        existing.interval = intervalMs;

        if (intervalChanged) {
            existing.nextRun = Date.now() + randomJitter(Math.min(intervalMs, 1000));
        } else if (urlChanged || nameChanged || typeChanged) {
            existing.nextRun = Math.min(existing.nextRun, Date.now() + 1000);
        }
    }

    for (const slug of monitorQueue.keys()) {
        if (!seen.has(slug)) {
            monitorQueue.delete(slug);
            runningSlugs.delete(slug);
        }
    }
}

async function cleanupOldStatusRows() {
    await db.run("DELETE FROM monitors_status WHERE checked_at < datetime('now', ?)", [
        `-${config.monitoring.retentionDays} days`,
    ]);
}

async function checkMonitor(monitor) {
    if (runningSlugs.has(monitor.slug)) return;

    runningSlugs.add(monitor.slug);
    activeWorkers += 1;

    const start = Date.now();
    let currentStatus = 'DOWN';
    let responseTime = null;
    let statusCode = null;
    let detailsJson = null;

    try {
        if (config.monitoring.blockPrivateIps) {
            const hostname = extractHostname(monitor);
            if (!hostname) throw new Error('Invalid monitor target');
            const blocked = await hostResolvesToPrivateAddress(hostname);
            if (blocked) throw new Error('Blocked private IP target');
        }

        const result = await monitorChecks.runCheck(monitor);
        currentStatus = result.currentStatus;
        responseTime = result.responseTime;
        statusCode = result.statusCode;
        detailsJson = result.details ? JSON.stringify(result.details) : null;
    } catch {
        currentStatus = 'DOWN';
        responseTime = Date.now() - start;
        detailsJson = null;
    }

    try {
        await db.run('INSERT INTO monitors_status (slug, status, response_time, status_code, details_json) VALUES (?, ?, ?, ?, ?)', [
            monitor.slug,
            currentStatus,
            responseTime,
            statusCode,
            detailsJson,
        ]);

        const previousState = await db.get('SELECT * FROM monitors_state WHERE slug = ?', [monitor.slug]);
        const isUp = currentStatus === 'UP' ? 1 : 0;
        const isDown = currentStatus === 'DOWN' ? 1 : 0;

        if (!previousState) {
            await db.run(
                `INSERT INTO monitors_state (slug, current_status, last_checked, uptime_count, downtime_count)
         VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)`,
                [monitor.slug, currentStatus, isUp, isDown],
            );
        } else {
            const stateChanged = previousState.current_status !== currentStatus;

            await db.run(
                `UPDATE monitors_state
         SET current_status = ?,
             last_checked = CURRENT_TIMESTAMP,
             uptime_count = uptime_count + ?,
             downtime_count = downtime_count + ?
         WHERE slug = ?`,
                [currentStatus, isUp, isDown, monitor.slug],
            );

            if (stateChanged) {
                await Promise.allSettled([
                    notifier.sendDiscordStateChange(monitor, currentStatus, responseTime),
                    notifier.sendEmailStateChange(monitor, currentStatus, responseTime),
                ]);
            }
        }
    } catch (err) {
        console.error(`Monitor check persistence failed for ${monitor.slug}:`, err.message);
    } finally {
        runningSlugs.delete(monitor.slug);
        activeWorkers -= 1;
    }
}

async function schedulerTick() {
    if (!isRunning) return;

    try {
        const now = Date.now();

        if (now - lastSyncAt >= config.monitoring.syncIntervalMs) {
            await syncMonitorsFromDb();
            lastSyncAt = now;
        }

        if (now >= nextCleanupAt) {
            await cleanupOldStatusRows();
            nextCleanupAt = now + config.monitoring.cleanupIntervalMs;
        }

        for (const monitor of monitorQueue.values()) {
            if (activeWorkers >= config.monitoring.maxConcurrency) break;
            if (monitor.nextRun > now) continue;
            if (runningSlugs.has(monitor.slug)) continue;

            monitor.nextRun = now + monitor.interval;
            void checkMonitor(monitor);
        }
    } catch (err) {
        console.error('Scheduler tick failed:', err.message);
    } finally {
        loopTimer = setTimeout(schedulerTick, config.monitoring.schedulerTickMs);
    }
}

function start() {
    if (isRunning) return;
    isRunning = true;
    lastSyncAt = 0;
    loopTimer = setTimeout(schedulerTick, config.monitoring.schedulerTickMs);
}

function stop() {
    isRunning = false;
    if (loopTimer) clearTimeout(loopTimer);
    loopTimer = null;
}

module.exports = {
    start,
    stop,
};
