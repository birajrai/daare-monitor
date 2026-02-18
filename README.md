# daare-monitor

## Security and rate-limit defaults

All operational settings are configured directly in `config.js`.

For local safety, update at least:

- `auth.username` and `auth.password`
- `server.trustProxy` when running behind a reverse proxy
- `rateLimit.global`, `rateLimit.admin`, and `rateLimit.status` as needed
