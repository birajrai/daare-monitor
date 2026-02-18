const path = require('path');
const express = require('express');
const config = require('./config');
const db = require('./services/database');
const scheduler = require('./services/scheduler');
const { requestNonce } = require('./middleware/nonce');
const { createSecurityMiddleware } = require('./middleware/security');
const { createLimiter } = require('./middleware/rate-limit');
const { errorHandler } = require('./middleware/error-handler');

const app = express();
let server;
let shuttingDown = false;

if (config.server.trustProxy) {
    app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

app.use(requestNonce);
app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    next();
});
app.use(createSecurityMiddleware(config));

app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));

app.use(createLimiter(config.rateLimit.global));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/echarts', express.static(path.join(__dirname, 'node_modules', 'echarts', 'dist')));

app.use('/', require('./routes/index'));
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
    scheduler.start();

    server = app.listen(config.server.port, config.server.host, () => {
        console.log(`Server listening on http://${config.server.host}:${config.server.port}`);
    });
}

start().catch(err => {
    console.error('Failed to start app:', err);
    process.exit(1);
});
