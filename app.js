const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const db = require('./services/database');
const scheduler = require('./services/scheduler');
const crypto = require('crypto');

const app = express();
let server;
let shuttingDown = false;

if (config.server.trustProxy) {
    app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware to generate a nonce for each request
app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
});

app.use(helmet());

app.use((req, res, next) => {
    const nonce = res.locals.nonce;
    const csp = [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}'`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data:",
    ].join('; ');

    res.setHeader('Content-Security-Policy', csp);
    next();
});

app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));

app.use(
    rateLimit({
        windowMs: config.rateLimit.global.windowMs,
        max: config.rateLimit.global.max,
        standardHeaders: true,
        legacyHeaders: false,
    }),
);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/echarts', express.static(path.join(__dirname, 'node_modules', 'echarts', 'dist')));

app.use('/', require('./routes/index'));
app.use('/status', require('./routes/status'));
app.use('/admin', require('./routes/admin'));

app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(500).send('Internal Server Error');
});

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
