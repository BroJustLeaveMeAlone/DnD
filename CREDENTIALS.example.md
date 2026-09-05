# Credentials — template

Copy to `CREDENTIALS.md` and fill in real values. `CREDENTIALS.md` is gitignored; this file is
committed and must contain **placeholders only**.

This repo is public. Never put a real secret in this file.

---

## Local development database

Created by `docker compose up -d postgres`.

| Field    | Value                                                   |
| -------- | ------------------------------------------------------- |
| Host     | `localhost`                                             |
| Port     | `5432` (change if taken; update `POSTGRES_PORT` too)    |
| Database | `ttrpg`                                                 |
| User     | `ttrpg`                                                 |
| Password | `<from .env POSTGRES_PASSWORD>`                         |
| URL      | `postgresql://<user>:<password>@localhost:<port>/ttrpg` |

---

## Auth.js session secret

| Field | Value                              |
| ----- | ---------------------------------- |
| Key   | `AUTH_SECRET`                      |
| Value | `<generate with: npx auth secret>` |

---

## OAuth providers

Neither is required — the app boots with none configured, and the sign-in page says so. Configure
whichever you want.

| Provider | Key                   | Value             |
| -------- | --------------------- | ----------------- |
| GitHub   | `AUTH_GITHUB_ID`      | `<client id>`     |
| GitHub   | `AUTH_GITHUB_SECRET`  | `<client secret>` |
| Discord  | `AUTH_DISCORD_ID`     | `<client id>`     |
| Discord  | `AUTH_DISCORD_SECRET` | `<client secret>` |
| Google   | `AUTH_GOOGLE_ID`      | `<client id>`     |
| Google   | `AUTH_GOOGLE_SECRET`  | `<client secret>` |

### Callback URLs

The redirect URI must match **exactly** — scheme, host, port, and path. A mismatch is the single
most common OAuth failure, and the provider reports it only as a generic error.

```
http://localhost:3000/api/auth/callback/github
http://localhost:3000/api/auth/callback/discord
http://localhost:3000/api/auth/callback/google
```

Substitute the port you actually run on. `AUTH_URL` in `.env` must match the same origin.

### GitHub — the quickest

No consent screen, no verification, no separate developer account.

1. https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**
2. **Application name**: anything
3. **Homepage URL**: `http://localhost:3000` (or your port)
4. **Authorization callback URL**: the GitHub URL above — this is the field that matters
5. **Register application**
6. Copy **Client ID** → `AUTH_GITHUB_ID`
7. **Generate a new client secret** → copy immediately → `AUTH_GITHUB_SECRET`

GitHub only returns an email address if the account has a public one, or via the `user:email`
scope, which Auth.js requests by default. An account with no verified email will fail to link.

### Discord

1. https://discord.com/developers/applications → **New Application**
2. **OAuth2** in the sidebar → **Redirects** → add the callback URL above → **Save Changes**
3. Copy **Client ID** → `AUTH_DISCORD_ID`
4. **Reset Secret** → copy → `AUTH_DISCORD_SECRET`

No scopes need selecting; Auth.js requests `identify email` itself.

### Google

1. https://console.cloud.google.com/apis/credentials — create or pick a project
2. Configure the **OAuth consent screen** first (External is fine). Add yourself as a test user
   while it is unpublished, or sign-in will be refused.
3. **Create Credentials → OAuth client ID → Web application**
4. Under **Authorised redirect URIs**, add the callback URL above
5. Copy the client ID and secret into `.env`

Google refuses plain `http://` redirects for any host except `localhost`. Deploying anywhere else
means HTTPS and a second redirect URI.

---

## Application admin accounts

Needed for the Commons moderation queue (Phase 12).

| Field    | Value              |
| -------- | ------------------ |
| Email    | `<admin email>`    |
| Password | `<admin password>` |

---

## Third-party services

Object storage, and any optional AI provider key for the Phase 17 layer. The AI layer is
bring-your-own-key, so no shared key should be required.
