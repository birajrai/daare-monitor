// ==========================
// File: app.js
// ==========================
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');
const { init } = require('./services/database');
const scheduler = require('./services/scheduler');

const app = express();

init();

app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

app.use(
    rateLimit({
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.max,
    }),
);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));

app.use('/', require('./routes/index'));
app.use('/status', require('./routes/status'));
app.use('/admin', require('./routes/admin'));

scheduler.start();

process.on('SIGINT', () => {
    scheduler.stop();
    process.exit(0);
});

app.listen(config.server.port, () => console.log('Server running on port', config.server.port));
