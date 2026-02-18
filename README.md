# daare-monitor

## Runtime settings

Only `PORT` and `DATABASE_URL` are required in `.env`.

All other operational settings are managed in the app at `/admin/settings` after login.

Auth flow:
- If no user exists, create the first admin at `/auth/register`
- After a user exists, login at `/auth/login`

## Monitor types

- `http`: full URL, e.g. `https://example.com/health`
- `tcp`: host and port, e.g. `db.example.com:5432`
- `ping`: host/IP, e.g. `1.1.1.1`
- `minecraft`: server host and port, e.g. `mc.hypixel.net:25565` (checked via mcsrvstat v2)
