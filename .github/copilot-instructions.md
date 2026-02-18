# Agent Guidelines for daare-monitor

## Quick summary

- Purpose: lightweight uptime monitor with an Express SSR dashboard.
- Key files: app.js, config.js, routes/, services/, views/, public/, data/.

## Code Style

- Node/CommonJS project targeting Node >=20 (see [package.json](package.json)).
- Keep modules small and synchronous-looking; use `async/await` when needed.
- Templates: EJS files under `views/` (see [views/layout.ejs](views/layout.ejs)).
- CSS/asset files live in `public/` (see `public/styles.css`).

## Architecture

- `app.js` is the Express entrypoint and registers routers from `routes/`.
- Routes: `routes/index.js`, `routes/status.js`, `routes/admin.js` handle HTTP views and APIs.
- Services: `services/database.js`, `services/notifier.js`, `services/scheduler.js` contain core logic and should be updated instead of putting heavy logic in route handlers.
- Persistence: SQLite DB stored under `data/` (path configured in `config.js`).

## Build & Run

- Install: `npm install`.
- Start: `npm start` (runs `node app.js`).
- DB schema: run `node scripts/update_schema.js` to initialise or migrate the SQLite DB.
- Runtime: run on Node >=20; prefer local testing on `http://localhost:3000` (configurable in `config.js`).

## Project Conventions

- Configuration lives in `config.js`; avoid hard-coding secrets. Prefer injecting via environment variables and updating `config.js` only for local dev defaults.
- Small, focused modules: prefer adding new helpers under `services/` and import them in routes.
- Views use server-side rendering with EJS; keep presentation logic in templates and business logic in services.
- Use `scripts/update_schema.js` for DB changes rather than ad-hoc SQL files.

## Integration Points

- Email: `nodemailer` (see `services/notifier.js` and `config.js.notifications.email`).
- Discord: webhook URL supported via `config.js.notifications.discordWebhookUrl`.
- Storage: `sqlite3` DB at `data/status.db` (path configured in `config.js`).

## Security & Sensitive Data

- `config.js` contains defaults; **do not** commit real credentials. Prefer environment variables for production secrets.
- App includes `helmet` and uses rate-limiting (see `config.js.rateLimit`)—respect these patterns when adding endpoints.

## When Making Changes

- Run `node scripts/update_schema.js` when DB schema changes.
- Restart the server after editing `app.js` or router registration.
- Keep new dependencies minimal; add to `package.json` and run `npm install`.

## Where to Look First

- Entrypoint: [app.js](app.js)
- Config and defaults: [config.js](config.js)
- DB and scheduler: [services/database.js](services/database.js), [services/scheduler.js](services/scheduler.js)

If any section is unclear or you'd like more detail (tests, CI, or deployment notes), say which area to expand.
