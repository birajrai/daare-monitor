const dns = require('dns').promises;
const net = require('net');
const db = require('./database');
const settings = require('./settings');
const notifier = require('./notifier');
const monitorChecks = require('./monitor-checks');
const checkResultsBuffer = require('./check-results-buffer');

const monitorQueue = new Map();
const runningSlugs = new Set();

let loopTimer = null;
let flushTimer = null;
let isRunning = false;
let activeWorkers = 0;
let lastSyncAt = 0;
let nextCleanupAt = Date.now() + 30_000;

const hostSafetyCache = new Map();
const HOST_CACHE_TTL_MS = 5 * 60 * 1000;
const BUFFER_FLUSH_INTERVAL_MS = 10 * 60 * 1000;
const stateCache = new Map();

function randomJitter(maxMs) {
    return Math.floor(Math.random() * Math.max(1, maxMs));
}

function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Check timeout')), Math.max(1000, timeoutMs));
        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
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
    const appSettings = settings.getCachedSettings();
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
                nextRun: Date.now() + randomJitter(Math.min(intervalMs, appSettings.monitoring.startupJitterMaxMs)),
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

async function syncStateCacheFromDb() {
    const rows = await db.all('SELECT slug, current_status, uptime_count, downtime_count, last_checked FROM monitors_state');
    stateCache.clear();
    for (const row of rows) {
        stateCache.set(row.slug, {
            current_status: row.current_status,
            uptime_count: Number(row.uptime_count || 0),
            downtime_count: Number(row.downtime_count || 0),
            last_checked: row.last_checked || null,
        });
    }
}

async function cleanupOldStatusRows() {
    const appSettings = settings.getCachedSettings();
    await db.run("DELETE FROM monitors_status WHERE checked_at < NOW() - (?::int * INTERVAL '1 day')", [
        appSettings.monitoring.retentionDays,
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
        const appSettings = settings.getCachedSettings();
        if (appSettings.monitoring.blockPrivateIps) {
            const hostname = extractHostname(monitor);
            if (!hostname) throw new Error('Invalid monitor target');
            const blocked = await hostResolvesToPrivateAddress(hostname);
            if (blocked) throw new Error('Blocked private IP target');
        }

        const timeoutMs = Number(appSettings.monitoring.timeoutMs || 10000) + 2000;
        const result = await withTimeout(monitorChecks.runCheck(monitor), timeoutMs);
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
        const previousState = stateCache.get(monitor.slug) || null;
        const isUp = currentStatus === 'UP' ? 1 : 0;
        const isDown = currentStatus === 'DOWN' ? 1 : 0;
        const checkedAt = new Date().toISOString();

        if (!previousState) {
            stateCache.set(monitor.slug, {
                current_status: currentStatus,
                last_checked: checkedAt,
                uptime_count: isUp,
                downtime_count: isDown,
            });
        } else {
            const stateChanged = previousState.current_status !== currentStatus;
            stateCache.set(monitor.slug, {
                current_status: currentStatus,
                last_checked: checkedAt,
                uptime_count: Number(previousState.uptime_count || 0) + isUp,
                downtime_count: Number(previousState.downtime_count || 0) + isDown,
            });

            if (stateChanged) {
                await Promise.allSettled([
                    notifier.sendDiscordStateChange(monitor, currentStatus, responseTime),
                    notifier.sendEmailStateChange(monitor, currentStatus, responseTime),
                ]);
            }
        }

        checkResultsBuffer.appendResult({
            slug: monitor.slug,
            status: currentStatus,
            responseTime,
            statusCode,
            detailsJson,
            checkedAt,
        });
    } catch (err) {
        console.error(`Monitor check persistence failed for ${monitor.slug}:`, err.message);
    } finally {
        runningSlugs.delete(monitor.slug);
        activeWorkers -= 1;
    }
}

async function schedulerTick() {
    if (!isRunning) return;
    let tickMs = 500;

    try {
        const now = Date.now();
        const appSettings = settings.getCachedSettings();
        tickMs = appSettings.monitoring.schedulerTickMs;

        if (now - lastSyncAt >= appSettings.monitoring.syncIntervalMs) {
            await syncMonitorsFromDb();
            lastSyncAt = now;
        }

        if (now >= nextCleanupAt) {
            await cleanupOldStatusRows();
            nextCleanupAt = now + appSettings.monitoring.cleanupIntervalMs;
        }

        for (const monitor of monitorQueue.values()) {
            if (activeWorkers >= appSettings.monitoring.maxConcurrency) break;
            if (monitor.nextRun > now) continue;
            if (runningSlugs.has(monitor.slug)) continue;

            monitor.nextRun = now + monitor.interval;
            void checkMonitor(monitor);
        }
    } catch (err) {
        console.error('Scheduler tick failed:', err.message);
    } finally {
        loopTimer = setTimeout(schedulerTick, tickMs);
    }
}

function start() {
    if (isRunning) return;
    isRunning = true;
    lastSyncAt = 0;
    const appSettings = settings.getCachedSettings();
    void syncStateCacheFromDb();
    loopTimer = setTimeout(schedulerTick, appSettings.monitoring.schedulerTickMs);
    flushTimer = setInterval(() => {
        void checkResultsBuffer.flushToDb().catch((err) => {
            console.error('Buffered DB flush failed:', err.message);
        });
    }, BUFFER_FLUSH_INTERVAL_MS);
}

async function refreshMonitorNow(slug) {
    await syncMonitorsFromDb();
    const monitor = monitorQueue.get(String(slug || ''));
    if (!monitor) return false;
    monitor.nextRun = Date.now();
    if (!runningSlugs.has(monitor.slug)) {
        void checkMonitor(monitor);
    }
    return true;
}

async function refreshAllNow() {
    await syncMonitorsFromDb();
    const now = Date.now();
    for (const monitor of monitorQueue.values()) {
        monitor.nextRun = now;
        if (!runningSlugs.has(monitor.slug)) {
            void checkMonitor(monitor);
        }
    }
}

async function stop() {
    isRunning = false;
    if (loopTimer) clearTimeout(loopTimer);
    if (flushTimer) clearInterval(flushTimer);
    loopTimer = null;
    flushTimer = null;
    await checkResultsBuffer.flushToDb();
}

module.exports = {
    start,
    stop,
    refreshMonitorNow,
    refreshAllNow,
};
