# daare-monitor

## Security and rate-limit defaults

All operational settings are configured directly in `config.js`.

For local safety, update at least:

- `auth.username` and `auth.password`
- `server.trustProxy` when running behind a reverse proxy
- `rateLimit.global`, `rateLimit.admin`, and `rateLimit.status` as needed

## Monitor types

- `http`: full URL, e.g. `https://example.com/health`
- `tcp`: host and port, e.g. `db.example.com:5432`
- `ping`: host/IP, e.g. `1.1.1.1`
- `minecraft`: server host and port, e.g. `mc.hypixel.net:25565` (checked via mcsrvstat v2)
