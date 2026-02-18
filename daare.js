require('dotenv').config();
const path = require('path');
const express = require('express');
const db = require('./services/database');
const settings = require('./services/settings');
const scheduler = require('./services/scheduler');
const { requestNonce } = require('./middleware/nonce');
const { createSecurityMiddleware } = require('./middleware/security');
const { createLimiter } = require('./middleware/rate-limit');
const { attachAuthUser } = require('./middleware/auth');
const { errorHandler } = require('./middleware/error-handler');

const app = express();
let server;
let shuttingDown = false;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

app.use(requestNonce);
app.use(attachAuthUser);
app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    next();
});
app.use(createSecurityMiddleware());

app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/echarts', express.static(path.join(__dirname, 'node_modules', 'echarts', 'dist')));
const globalLimiter = createLimiter('global');
app.use((req, res, next) => {
    if (req.path.startsWith('/auth') || req.path === '/up') return next();
    return globalLimiter(req, res, next);
});

app.get('/up', (req, res) => {
    return res.status(200).json({ ok: true, status: 'UP', timestamp: new Date().toISOString() });
});

app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/status', require('./routes/status'));
app.use('/status-page', require('./routes/status-page'));
app.use('/admin', require('./routes/admin'));

app.use(errorHandler);

async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down...`);

    scheduler.stop();

    if (server) {
        await new Promise(resolve => server.close(() => resolve()));
    }

    try {
        await db.close();
    } catch (err) {
        console.error('DB close failed:', err.message);
    }

    process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', reason => {
    console.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', err => {
    console.error('Uncaught exception:', err);
});

async function start() {
    await db.init();
    const appSettings = await settings.getSettings(true);
    if (appSettings.server && appSettings.server.trustProxy) {
        app.set('trust proxy', 1);
    }
    scheduler.start();

    const port = Number(process.env.PORT) || 3000;
    const host = '0.0.0.0';
    server = app.listen(port, host, () => {
        console.log(`Server listening on http://${host}:${port}`);
    });
}

start().catch(err => {
    console.error('Failed to start app:', err);
    process.exit(1);
});
